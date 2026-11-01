<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeckSummary, VocabularyRecord } from '../lib/db/schema';
  import { getWordsForDeck, removeWordFromCustomDeck } from '../lib/db/database';
  import { syncManager } from '../lib/sync/SyncManager';
  import { speakJapanese, stripRubyTags, toRomajiText } from '../lib/utils/japanese';
  import { isVerb, getVerbGroup } from '../lib/utils/conjugator';
  import { hapticImpactLight, hapticImpactMedium, hapticSuccess } from '../lib/haptics.js';

  interface Props {
    deck: DeckSummary;
    onBack: () => Promise<void> | void;
  }

  let { deck, onBack }: Props = $props();

  let words = $state<VocabularyRecord[]>([]);
  let searchQuery = $state('');
  let isLoading = $state(true);
  let removingWordId = $state<string | null>(null);

  let filteredWords = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return words;
    return words.filter((w) => {
      const kanji = stripRubyTags(w.kanji).toLowerCase();
      const reading = w.reading.toLowerCase();
      const romaji = toRomajiText(w.reading).toLowerCase();
      const es = w.meaning_es.toLowerCase();
      const en = w.meaning_en.toLowerCase();
      return (
        kanji.includes(q) ||
        reading.includes(q) ||
        romaji.includes(q) ||
        es.includes(q) ||
        en.includes(q)
      );
    });
  });

  async function loadWords() {
    isLoading = true;
    try {
      words = await getWordsForDeck(deck.id);
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    loadWords();
  });

  async function handleRemoveWord(word: VocabularyRecord) {
    if (removingWordId) return;
    await hapticImpactMedium();
    removingWordId = word.id;

    try {
      await removeWordFromCustomDeck(deck.id, word.id);
      words = words.filter((w) => w.id !== word.id);
      await hapticSuccess();
      // Disparar sincronización con el servidor en segundo plano
      syncManager.tryAutoSync().catch(() => {});
    } catch (err) {
      console.error('[EditDeck] Error al quitar palabra:', err);
    } finally {
      removingWordId = null;
    }
  }

  async function handleBack() {
    await hapticImpactLight();
    await onBack();
  }
</script>

<div class="space-y-4">
  <!-- Cabecera de la Pantalla de Edición -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-3 shadow-xl">
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        onclick={handleBack}
        class="touch-target px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active-press text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
      >
        <span>←</span>
        <span>Volver</span>
      </button>

      <span class="px-2.5 py-0.5 rounded-full bg-[#a7f3d0]/15 text-[#a7f3d0] border border-[#a7f3d0]/30 text-[10px] font-bold uppercase tracking-wider">
        Mazo Personalizado
      </span>
    </div>

    <div>
      <h2 class="text-xl font-bold text-white flex items-center gap-2 truncate">
        <span>✏️ {deck.title}</span>
      </h2>
      <p class="text-xs text-slate-400 mt-0.5">
        Administrá las palabras de este mazo. Al quitar una palabra, tu mazo se actualizará localmente y en el servidor.
      </p>
    </div>

    <!-- Buscador interno en el mazo si tiene palabras -->
    {#if words.length > 3}
      <div class="relative">
        <input
          type="search"
          bind:value={searchQuery}
          placeholder="Filtrar palabras de este mazo..."
          class="w-full py-2.5 pl-9 pr-4 rounded-2xl bg-black/40 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#a7f3d0]/50"
        />
        <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
      </div>
    {/if}

    <div class="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-white/10">
      <span>Total en el mazo: <strong class="text-white">{words.length}</strong></span>
      {#if searchQuery.trim()}
        <span>Coincidencias: <strong class="text-[#a7f3d0]">{filteredWords.length}</strong></span>
      {/if}
    </div>
  </section>

  <!-- Lista de Palabras -->
  <section class="space-y-2.5">
    {#if isLoading}
      <div class="rounded-3xl bg-[#121820] border border-white/10 p-8 text-center text-slate-400 text-sm">
        Cargando palabras del mazo...
      </div>
    {:else if filteredWords.length > 0}
      {#each filteredWords as word (word.id)}
        {@const vGroup = isVerb(word.part_of_speech, word.kanji || word.reading) ? getVerbGroup(word.part_of_speech, word.kanji || word.reading, word.reading) : null}
        <div class="rounded-3xl bg-gradient-to-r from-[#182120] to-[#121720] border border-white/10 p-4 flex items-center justify-between gap-3 shadow-md">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-lg font-bold text-white">
                {stripRubyTags(word.kanji || word.reading)}
              </span>
              <span class="text-xs font-semibold text-[#a7f3d0]">
                【{word.reading}】
              </span>
              <span class="text-[11px] font-mono text-amber-300/80">
                {toRomajiText(word.reading)}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[10px] font-bold text-slate-300">
                N{word.jlpt_level}
              </span>
              {#if vGroup}
                <span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold">
                  {vGroup.label}
                </span>
              {/if}
            </div>

            <p class="text-xs font-semibold text-slate-100 truncate">
              {word.meaning_es}
            </p>
            <p class="text-[11px] text-slate-400 truncate">
              {word.meaning_en}
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onclick={() => speakJapanese(stripRubyTags(word.kanji || word.reading))}
              aria-label="Escuchar pronunciación"
              class="touch-target w-10 h-10 rounded-2xl bg-[#171717] border border-white/10 text-[#a7f3d0] active-press flex items-center justify-center text-sm"
            >
              🔊
            </button>

            <button
              type="button"
              onclick={() => handleRemoveWord(word)}
              disabled={removingWordId === word.id}
              aria-label="Quitar palabra del mazo"
              title="Quitar palabra del mazo"
              class="touch-target px-3 py-2 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 active-press border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <span>🗑️</span>
              <span>Quitar</span>
            </button>
          </div>
        </div>
      {/each}
    {:else if words.length === 0}
      <div class="rounded-3xl bg-[#121820] border border-white/10 p-8 text-center space-y-2">
        <p class="text-base font-bold text-slate-300">Este mazo no tiene palabras</p>
        <p class="text-xs text-slate-400">
          Podés ir al buscador de vocabulario y agregar las palabras que quieras a este mazo con el botón "+ Al mazo".
        </p>
      </div>
    {:else}
      <div class="rounded-3xl bg-[#121820] border border-white/10 p-8 text-center text-slate-400 text-xs">
        No se encontraron palabras que coincidan con "{searchQuery}"
      </div>
    {/if}
  </section>

  <!-- Botón de Cierre / Volver inferior -->
  <div class="pt-2">
    <button
      type="button"
      onclick={handleBack}
      class="touch-target w-full py-3.5 rounded-2xl bg-[#a7f3d0] hover:bg-[#86efac] text-slate-950 font-extrabold text-sm text-center shadow-lg active-press transition-colors"
    >
      Listo • Volver a Mazos
    </button>
  </div>
</div>
