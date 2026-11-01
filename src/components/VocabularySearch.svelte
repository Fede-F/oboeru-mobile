<script lang="ts">
  import * as wanakana from 'wanakana';
  import type { UserDeckRecord, VocabularyRecord } from '../lib/db/schema';
  import {
    getAllUserDecks,
    SYSTEM_DEFAULT_DECK_IDS,
    toggleWordInCustomUserDeck
  } from '../lib/db/database';
  import { syncManager } from '../lib/sync/SyncManager';
  import {
    convertSearchQueryToKana,
    speakJapanese,
    stripRubyTags,
    toRomajiText
  } from '../lib/utils/japanese';
  import { hapticImpactLight, hapticSelection, hapticSuccess } from '../lib/haptics.js';

  interface Props {
    onQueueUpdated: () => Promise<void>;
    onOpenCreateDeck: () => void;
  }

  let { onQueueUpdated, onOpenCreateDeck }: Props = $props();

  let rawQuery = $state('');
  let autoKanaMode = $state(true);
  let selectedJlpt = $state<number | null>(null);
  let results = $state<Array<VocabularyRecord & { inStudy: boolean; state: string }>>([]);
  let customDecks = $state<UserDeckRecord[]>([]);
  let isSearching = $state(false);
  let activeWordForDeck = $state<(VocabularyRecord & { inStudy: boolean; state: string }) | null>(null);

  let kanaPreview = $derived(convertSearchQueryToKana(rawQuery));

  function handleSearchInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    rawQuery = target.value;
  }

  function applyDirectKanaConversion(mode: 'hiragana' | 'katakana') {
    if (!rawQuery.trim()) return;
    rawQuery =
      mode === 'hiragana'
        ? wanakana.toHiragana(rawQuery, { IMEMode: true })
        : wanakana.toKatakana(rawQuery, { IMEMode: true });
  }

  async function refreshCustomDecks() {
    const all = await getAllUserDecks();
    customDecks = all
      .filter((d) => !d.deleted_at && !SYSTEM_DEFAULT_DECK_IDS.has(d.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async function refreshResults(q = rawQuery, jlpt = selectedJlpt) {
    isSearching = true;
    try {
      const [fetched] = await Promise.all([
        syncManager.searchRemoteVocabulary(q, jlpt, 80),
        refreshCustomDecks()
      ]);
      results = fetched;
    } finally {
      isSearching = false;
    }
  }

  $effect(() => {
    const q = rawQuery;
    const jlpt = selectedJlpt;
    const timer = setTimeout(() => {
      refreshResults(q, jlpt);
    }, 200);
    return () => clearTimeout(timer);
  });

  function countCustomDecksForWord(wordId: string): number {
    return customDecks.filter((d) => Array.isArray(d.vocabulary_ids) && d.vocabulary_ids.includes(wordId)).length;
  }

  async function openDeckPicker(item: VocabularyRecord & { inStudy: boolean; state: string }) {
    await hapticImpactLight();
    await refreshCustomDecks();
    activeWordForDeck = item;
  }

  async function handleToggleWordInDeck(deckId: string) {
    if (!activeWordForDeck) return;
    await toggleWordInCustomUserDeck(deckId, activeWordForDeck, syncManager.getUserId());
    await hapticSuccess();
    await refreshCustomDecks();
    await onQueueUpdated();
    syncManager.tryAutoSync().catch(() => {});
  }

  async function handleFilterJlpt(level: number | null) {
    await hapticSelection();
    selectedJlpt = level;
  }
</script>

<div class="space-y-4">
  <!-- Caja de Búsqueda conectada al catálogo completo N5-N1 del Servidor -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-4 space-y-3 shadow-xl">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          <span>辞書 • Diccionario Japonés</span>
          <span class="px-2 py-0.5 rounded-full bg-[#a7f3d0]/15 text-[#a7f3d0] text-[10px] font-bold">
            JLPT N5–N1
          </span>
        </h2>
        <p class="text-[11px] text-slate-400 mt-0.5">
          Buscá entre las 7.800 palabras y guardá en tu teléfono las que elijas estudiar
        </p>
      </div>

      <button
        type="button"
        onclick={async () => {
          await hapticSelection();
          autoKanaMode = !autoKanaMode;
        }}
        class="touch-target px-3 py-1.5 rounded-2xl border text-[11px] font-bold active-press shrink-0 {autoKanaMode
          ? 'bg-[#1c2b25] border-[#a7f3d0]/40 text-[#a7f3d0]'
          : 'bg-[#171717] border-white/10 text-slate-400'}"
      >
        あ Autoconvertir: {autoKanaMode ? 'Sí' : 'No'}
      </button>
    </div>

    <!-- Input Buscador -->
    <div class="relative">
      <input
        type="search"
        value={rawQuery}
        oninput={handleSearchInput}
        placeholder="Buscar ej: comida, tabemono, yakusoku, 先生..."
        enterkeyhint="search"
        class="w-full h-12 pl-11 pr-20 rounded-2xl bg-[#0b0f15] border border-white/10 focus:border-[#a7f3d0] focus:outline-none text-sm text-white placeholder:text-slate-500"
      />
      <svg class="w-4 h-4 text-slate-400 absolute left-4 top-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>

      {#if rawQuery}
        <button
          type="button"
          onclick={() => (rawQuery = '')}
          class="absolute right-3 top-2.5 px-2.5 py-1 rounded-xl bg-slate-800 text-[11px] text-slate-300 font-semibold"
        >
          Limpiar
        </button>
      {/if}
    </div>

    <!-- Barra de Autoconversión en Tiempo Real -->
    {#if rawQuery.trim()}
      <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[#17211d] border border-[#a7f3d0]/25 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-[10px] uppercase tracking-wider text-slate-400">Lectura:</span>
          <span class="font-bold text-[#a7f3d0]">{kanaPreview.hiragana}</span>
          <span class="text-white/20">/</span>
          <span class="font-semibold text-amber-300">{kanaPreview.katakana}</span>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            onclick={() => applyDirectKanaConversion('hiragana')}
            class="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-[10px] text-[#a7f3d0] font-semibold"
          >
            Usar ひらがな
          </button>
          <button
            type="button"
            onclick={() => applyDirectKanaConversion('katakana')}
            class="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-[10px] text-amber-300 font-semibold"
          >
            Usar カタカナ
          </button>
        </div>
      </div>
    {/if}

    <!-- Filtros por Nivel JLPT (N5 a N1) -->
    <div class="flex items-center gap-1.5 overflow-x-auto pt-1">
      <button
        type="button"
        onclick={() => handleFilterJlpt(null)}
        class="px-3.5 py-1.5 rounded-full text-xs font-bold border active-press shrink-0 {selectedJlpt === null
          ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
          : 'bg-[#171717] text-slate-300 border-white/10'}"
      >
        Todos
      </button>
      {#each [5, 4, 3, 2, 1] as level}
        <button
          type="button"
          onclick={() => handleFilterJlpt(level)}
          class="px-3.5 py-1.5 rounded-full text-xs font-bold border active-press shrink-0 {selectedJlpt === level
            ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
            : 'bg-[#171717] text-slate-300 border-white/10'}"
        >
          JLPT N{level}
        </button>
      {/each}
    </div>
  </section>

  <!-- Lista de Resultados -->
  <section class="space-y-2.5">
    {#each results as item (item.id)}
      {@const deckCount = countCustomDecksForWord(item.id)}
      <div class="rounded-3xl bg-gradient-to-r from-[#182120] to-[#121720] border border-white/10 p-4 flex items-center justify-between gap-3">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-lg font-bold text-white">
              {stripRubyTags(item.kanji || item.reading)}
            </span>
            <span class="text-xs font-semibold text-[#a7f3d0]">
              【{item.reading}】
            </span>
            <span class="text-[11px] font-mono text-amber-300/80">
              {toRomajiText(item.reading)}
            </span>
            <span class="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[10px] font-bold text-slate-300">
              N{item.jlpt_level}
            </span>
          </div>

          <p class="text-xs font-semibold text-slate-100 truncate">
            {item.meaning_es}
          </p>
          <p class="text-[11px] text-slate-400 truncate">
            {item.meaning_en} • <span class="italic">{item.part_of_speech}</span>
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onclick={() => speakJapanese(stripRubyTags(item.kanji || item.reading))}
            aria-label="Escuchar pronunciación"
            class="touch-target w-11 h-11 rounded-2xl bg-[#171717] border border-white/10 text-[#a7f3d0] active-press"
          >
            🔊
          </button>

          <button
            type="button"
            onclick={() => openDeckPicker(item)}
            class="touch-target px-3.5 py-2 rounded-2xl border text-xs font-bold active-press {deckCount > 0
              ? 'bg-[#1c2b25] border-[#a7f3d0]/40 text-[#a7f3d0]'
              : 'bg-[#171717] border-white/10 text-slate-300 hover:text-white'}"
          >
            {deckCount > 0 ? `✓ En mazo (${deckCount})` : '+ Al mazo'}
          </button>
        </div>
      </div>
    {:else}
      <div class="rounded-3xl bg-[#121820] border border-white/10 p-8 text-center">
        <p class="text-sm font-bold text-slate-300">
          {isSearching ? 'Consultando base de datos...' : `No se encontraron palabras para "${rawQuery}"`}
        </p>
        <p class="text-xs text-slate-500 mt-1">
          Probá buscando en español (ej. comida, viaje), romaji (ej. tabemono) o kanji.
        </p>
      </div>
    {/each}
  </section>

  <!-- Modal Selector de Mazo Personalizado (Solo mazos propios modificables) -->
  {#if activeWordForDeck}
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-picker-title"
        class="bg-[#121820] max-w-sm w-full p-5 rounded-3xl border border-[#a7f3d0]/30 shadow-2xl space-y-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <span class="text-[10px] font-bold uppercase tracking-wider text-[#a7f3d0] block">
              Agregar a mis mazos
            </span>
            <h3 id="deck-picker-title" class="text-base font-bold text-white mt-0.5 truncate">
              {stripRubyTags(activeWordForDeck.kanji || activeWordForDeck.reading)}
              <span class="text-xs font-semibold text-[#a7f3d0] ml-1">【{activeWordForDeck.reading}】</span>
            </h3>
            <p class="text-xs text-slate-400 truncate mt-0.5">
              {activeWordForDeck.meaning_es}
            </p>
          </div>

          <button
            type="button"
            onclick={() => (activeWordForDeck = null)}
            aria-label="Cerrar selector de mazos"
            class="touch-target w-9 h-9 rounded-full bg-[#171717] border border-white/10 text-slate-300 hover:text-white flex items-center justify-center text-xs active-press shrink-0"
          >
            ✕
          </button>
        </div>

        <p class="text-[11px] text-slate-400 leading-relaxed">
          Elegí en cuál de tus mazos personalizados querés guardar esta palabra (los mazos por defecto son fijos y no se modifican):
        </p>

        {#if customDecks.length > 0}
          <div class="max-h-60 overflow-y-auto space-y-2 pr-1">
            {#each customDecks as deck (deck.id)}
              {@const inThisDeck = Array.isArray(deck.vocabulary_ids) && deck.vocabulary_ids.includes(activeWordForDeck.id)}
              <button
                type="button"
                onclick={() => handleToggleWordInDeck(deck.id)}
                class="w-full touch-target p-3.5 rounded-2xl border text-left transition-all active-press flex items-center justify-between gap-3 {inThisDeck
                  ? 'bg-[#1c2b25] border-[#a7f3d0] text-white'
                  : 'bg-[#0b0f15] border-white/10 text-slate-200 hover:border-white/25'}"
              >
                <div class="min-w-0">
                  <p class="text-xs font-bold truncate {inThisDeck ? 'text-[#a7f3d0]' : 'text-white'}">
                    {deck.name}
                  </p>
                  <p class="text-[10px] text-slate-400 truncate mt-0.5">
                    {deck.vocabulary_ids.length} {deck.vocabulary_ids.length === 1 ? 'palabra' : 'palabras'}
                  </p>
                </div>

                <span class="px-2.5 py-1 rounded-xl text-[11px] font-bold shrink-0 {inThisDeck
                  ? 'bg-[#a7f3d0] text-slate-950'
                  : 'bg-[#171717] border border-white/10 text-[#a7f3d0]'}">
                  {inThisDeck ? '✓ Agregada' : '+ Agregar'}
                </span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="rounded-2xl bg-[#0b0f15] border border-white/10 p-4 text-center space-y-3">
            <p class="text-xs font-bold text-slate-200">
              Todavía no creaste ningún mazo propio
            </p>
            <p class="text-[11px] text-slate-400 leading-relaxed">
              Los mazos incluidos por defecto no se pueden modificar. Creá tu primer mazo personalizado para guardar tus palabras elegidas.
            </p>
            <button
              type="button"
              onclick={async () => {
                await hapticImpactLight();
                activeWordForDeck = null;
                onOpenCreateDeck();
              }}
              class="w-full touch-target rounded-2xl bg-[#a7f3d0] text-slate-950 font-extrabold text-xs active-press"
            >
              + Crear nuevo mazo
            </button>
          </div>
        {/if}

        <button
          type="button"
          onclick={() => (activeWordForDeck = null)}
          class="w-full touch-target rounded-full bg-[#171717] border border-white/10 text-slate-300 font-bold text-xs active-press"
        >
          Listo
        </button>
      </div>
    </div>
  {/if}
</div>
