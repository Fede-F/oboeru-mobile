<script lang="ts">
  import type { VocabularyRecord } from '../lib/db/schema';
  import { createCustomUserDeck } from '../lib/db/database';
  import { syncManager } from '../lib/sync/SyncManager';
  import {
    convertSearchQueryToKana,
    speakJapanese,
    stripRubyTags,
    toRomajiText
  } from '../lib/utils/japanese';
  import {
    hapticImpactLight,
    hapticSelection,
    hapticSuccess,
    hapticWarning
  } from '../lib/haptics.js';

  interface Props {
    onCancel: () => void;
    onDeckCreated: (createdDeckId: string) => Promise<void>;
  }

  let { onCancel, onDeckCreated }: Props = $props();

  let deckName = $state('');
  let deckDescription = $state('');
  let searchQuery = $state('');
  let selectedJlpt = $state<number | null>(null);
  let showOnlySelected = $state(false);

  // Mapa de palabras elegidas: solo las que el usuario selecciona se guardarán localmente al crear el mazo
  let selectedWordsMap = $state<Record<string, VocabularyRecord & { inStudy: boolean; state: string }>>({});
  let searchResults = $state<Array<VocabularyRecord & { inStudy: boolean; state: string }>>([]);
  let isSearching = $state(false);
  let isSaving = $state(false);
  let validationError = $state<string | null>(null);

  let selectedIds = $derived(Object.keys(selectedWordsMap));
  let selectedSet = $derived(new Set(selectedIds));
  let kanaPreview = $derived(convertSearchQueryToKana(searchQuery));

  let visibleWords = $derived.by(() => {
    if (showOnlySelected) {
      return Object.values(selectedWordsMap);
    }
    return searchResults;
  });

  async function runRemoteSearch(q: string, jlpt: number | null) {
    isSearching = true;
    try {
      searchResults = await syncManager.searchRemoteVocabulary(q, jlpt, 80);
    } finally {
      isSearching = false;
    }
  }

  $effect(() => {
    const q = searchQuery;
    const jlpt = selectedJlpt;
    const timer = setTimeout(() => {
      runRemoteSearch(q, jlpt);
    }, 200);
    return () => clearTimeout(timer);
  });

  async function toggleWordSelection(item: VocabularyRecord & { inStudy: boolean; state: string }) {
    await hapticSelection();
    validationError = null;
    if (selectedWordsMap[item.id]) {
      const next = { ...selectedWordsMap };
      delete next[item.id];
      selectedWordsMap = next;
    } else {
      selectedWordsMap = {
        ...selectedWordsMap,
        [item.id]: item
      };
    }
  }

  async function handleSaveDeck(e: SubmitEvent) {
    e.preventDefault();
    validationError = null;

    if (!deckName.trim()) {
      await hapticWarning();
      validationError = 'Escribí un nombre para identificar tu mazo.';
      return;
    }

    if (selectedIds.length === 0) {
      await hapticWarning();
      validationError = 'Elegí al menos una palabra del buscador para agregar al mazo.';
      return;
    }

    isSaving = true;
    try {
      const chosenWordsList: VocabularyRecord[] = Object.values(selectedWordsMap).map((w) => ({
        id: w.id,
        kanji: w.kanji,
        reading: w.reading,
        meaning_es: w.meaning_es,
        meaning_en: w.meaning_en,
        jlpt_level: w.jlpt_level,
        part_of_speech: w.part_of_speech,
        example_sentence: w.example_sentence,
        updated_at: w.updated_at
      }));

      const created = await createCustomUserDeck(
        deckName.trim(),
        selectedIds,
        deckDescription.trim() || null,
        syncManager.getUserId(),
        chosenWordsList
      );
      await hapticSuccess();
      syncManager.tryAutoSync().catch(() => {});
      await onDeckCreated(created.id);
    } catch (err) {
      await hapticWarning();
      validationError = err instanceof Error ? err.message : 'No se pudo guardar el mazo.';
    } finally {
      isSaving = false;
    }
  }
</script>

<form onsubmit={handleSaveDeck} class="space-y-4 pb-6">
  <!-- Cabecera Superior: Volver y Título -->
  <div class="flex items-center justify-between gap-3">
    <button
      type="button"
      onclick={async () => {
        await hapticImpactLight();
        onCancel();
      }}
      class="touch-target px-3.5 py-2 rounded-2xl bg-[#171717] border border-white/10 text-slate-300 hover:text-white text-xs font-semibold active-press flex items-center gap-1.5"
    >
      <svg class="w-4 h-4 text-[#a7f3d0]" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
      </svg>
      <span>Volver</span>
    </button>

    <div class="text-right">
      <span class="text-[10px] font-bold uppercase tracking-wider text-[#a7f3d0] block">
        Nuevo Mazo Personalizado
      </span>
      <span class="text-xs text-slate-400">
        {selectedIds.length} {selectedIds.length === 1 ? 'palabra elegida' : 'palabras elegidas'}
      </span>
    </div>
  </div>

  <!-- 1. Datos del Mazo (Nombre y Descripción opcional) -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-4 space-y-3 shadow-xl">
    <div>
      <label for="deck-name-input" class="block text-xs font-bold text-slate-200 mb-1.5">
        Nombre del mazo
      </label>
      <input
        id="deck-name-input"
        type="text"
        bind:value={deckName}
        maxlength="60"
        placeholder="Ej: Viaje a Japón, Verbos N5, Comida..."
        enterkeyhint="next"
        class="w-full h-12 px-4 rounded-2xl bg-[#0b0f15] border border-white/10 focus:border-[#a7f3d0] focus:outline-none text-sm text-white placeholder:text-slate-500"
      />
    </div>

    <div>
      <label for="deck-desc-input" class="block text-xs font-bold text-slate-300 mb-1.5">
        Descripción breve <span class="text-slate-500 font-normal">(opcional)</span>
      </label>
      <input
        id="deck-desc-input"
        type="text"
        bind:value={deckDescription}
        maxlength="90"
        placeholder="Ej: Palabras clave para practicar esta semana"
        enterkeyhint="search"
        class="w-full h-11 px-4 rounded-2xl bg-[#0b0f15] border border-white/10 focus:border-[#a7f3d0] focus:outline-none text-xs text-white placeholder:text-slate-500"
      />
    </div>
  </section>

  <!-- 2. Buscador de Palabras en la Base de Datos (JLPT N5 a N1) -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-4 space-y-3 shadow-xl">
    <div class="flex items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <span>Buscador de Palabras</span>
          {#if isSearching}
            <span class="text-[10px] font-medium text-[#a7f3d0] animate-pulse">Buscando...</span>
          {/if}
        </h3>
        <p class="text-[11px] text-slate-400">
          Consultá el diccionario N5–N1 y elegí las que quieras guardar en tu mazo
        </p>
      </div>

      {#if selectedIds.length > 0}
        <button
          type="button"
          onclick={async () => {
            await hapticSelection();
            showOnlySelected = !showOnlySelected;
          }}
          class="touch-target px-3 py-1.5 rounded-2xl border text-[11px] font-bold active-press {showOnlySelected
            ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
            : 'bg-[#1c2b25] border-[#a7f3d0]/40 text-[#a7f3d0]'}"
        >
          {showOnlySelected ? 'Ver catálogo' : `Elegidas (${selectedIds.length})`}
        </button>
      {/if}
    </div>

    <!-- Input de búsqueda -->
    <div class="relative">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Buscar por español, romaji (ej. tabemono) o kanji..."
        enterkeyhint="search"
        class="w-full h-12 pl-11 pr-20 rounded-2xl bg-[#0b0f15] border border-white/10 focus:border-[#a7f3d0] focus:outline-none text-sm text-white placeholder:text-slate-500"
      />
      <svg class="w-4 h-4 text-slate-400 absolute left-4 top-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>

      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = '')}
          class="absolute right-3 top-2.5 px-2.5 py-1 rounded-xl bg-slate-800 text-[11px] text-slate-300 font-semibold active-press"
        >
          Limpiar
        </button>
      {/if}
    </div>

    {#if searchQuery.trim()}
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#17211d] border border-[#a7f3d0]/20 text-xs">
        <span class="text-[10px] uppercase tracking-wider text-slate-400">Lectura:</span>
        <span class="font-bold text-[#a7f3d0]">{kanaPreview.hiragana}</span>
        <span class="text-white/20">/</span>
        <span class="font-semibold text-amber-300">{kanaPreview.katakana}</span>
      </div>
    {/if}

    <!-- Filtros rápidos por nivel JLPT (N5 a N1) -->
    <div class="flex items-center gap-1.5 overflow-x-auto pt-0.5">
      <button
        type="button"
        onclick={async () => {
          await hapticSelection();
          selectedJlpt = null;
        }}
        class="px-3 py-1.5 rounded-full text-xs font-bold border active-press shrink-0 {selectedJlpt === null
          ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
          : 'bg-[#171717] text-slate-300 border-white/10'}"
      >
        Todos
      </button>
      {#each [5, 4, 3, 2, 1] as level}
        <button
          type="button"
          onclick={async () => {
            await hapticSelection();
            selectedJlpt = level;
          }}
          class="px-3 py-1.5 rounded-full text-xs font-bold border active-press shrink-0 {selectedJlpt === level
            ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
            : 'bg-[#171717] text-slate-300 border-white/10'}"
        >
          JLPT N{level}
        </button>
      {/each}
    </div>

    <!-- Lista Scrolleable de Palabras Encontradas -->
    <div class="max-h-[300px] overflow-y-auto space-y-2 pr-1 pt-1">
      {#each visibleWords as item (item.id)}
        {@const isSelected = selectedSet.has(item.id)}
        <div
          role="button"
          tabindex="0"
          onclick={() => toggleWordSelection(item)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleWordSelection(item);
            }
          }}
          class="w-full text-left rounded-2xl p-3 border transition-all active-press flex items-center justify-between gap-3 cursor-pointer {isSelected
            ? 'bg-[#1c2b25] border-[#a7f3d0]/60 shadow-md'
            : 'bg-[#0b0f15] border-white/10 hover:border-white/20'}"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-base font-bold text-white">
                {stripRubyTags(item.kanji || item.reading)}
              </span>
              <span class="text-xs font-semibold text-[#a7f3d0]">
                {item.reading}
              </span>
              <span class="text-[11px] font-mono text-amber-300/80">
                ({toRomajiText(item.reading)})
              </span>
              <span class="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[10px] font-bold text-slate-300">
                N{item.jlpt_level}
              </span>
            </div>
            <p class="text-xs text-slate-200 truncate mt-0.5">
              {item.meaning_es}
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onclick={(e) => {
                e.stopPropagation();
                speakJapanese(stripRubyTags(item.kanji || item.reading));
              }}
              aria-label="Escuchar pronunciación"
              class="touch-target w-10 h-10 rounded-xl bg-[#171717] border border-white/10 text-[#a7f3d0] flex items-center justify-center active-press"
            >
              🔊
            </button>

            <div
              class="px-3 py-2 rounded-xl text-xs font-bold border transition-colors {isSelected
                ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
                : 'bg-[#171717] text-slate-300 border-white/10'}"
            >
              {isSelected ? '✓ Agregada' : '+ Agregar'}
            </div>
          </div>
        </div>
      {:else}
        <div class="rounded-2xl bg-[#0b0f15] border border-white/10 p-6 text-center">
          <p class="text-xs font-semibold text-slate-300">
            {isSearching ? 'Buscando en la base de datos...' : 'No se encontraron palabras con ese filtro.'}
          </p>
        </div>
      {/each}
    </div>
  </section>

  {#if validationError}
    <div class="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 font-medium">
      {validationError}
    </div>
  {/if}

  <!-- Botón de Guardado -->
  <button
    type="submit"
    disabled={isSaving}
    class="w-full touch-target py-3.5 rounded-full bg-[#a7f3d0] hover:bg-emerald-200 disabled:opacity-50 text-slate-950 font-extrabold text-sm active-press shadow-xl flex items-center justify-center gap-2"
  >
    {#if isSaving}
      <span>Guardando mazo...</span>
    {:else}
      <span>Guardar Mazo ({selectedIds.length} {selectedIds.length === 1 ? 'palabra' : 'palabras'})</span>
    {/if}
  </button>
</form>
