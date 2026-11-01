<script lang="ts">
  import { onMount } from 'svelte';
  import * as wanakana from 'wanakana';
  import type { DeckSummary, VocabularyRecord } from '../lib/db/schema';
  import { getAllUserDecks, toggleWordInCustomUserDeck } from '../lib/db/database';
  import { syncManager } from '../lib/sync/SyncManager';
  import {
    convertSearchQueryToKana,
    speakJapanese,
    stripRubyTags,
    toRomajiText
  } from '../lib/utils/japanese';
  import { isVerb, getVerbGroup } from '../lib/utils/conjugator';
  import VerbConjugationsModal from './VerbConjugationsModal.svelte';
  import { hapticImpactLight, hapticSelection, hapticSuccess } from '../lib/haptics.js';

  interface Props {
    deck: DeckSummary;
    onBack: () => Promise<void> | void;
  }

  let { deck, onBack }: Props = $props();

  let rawQuery = $state('');
  let autoKanaMode = $state(true);
  let selectedJlpt = $state<number | null>(null);
  let results = $state<Array<VocabularyRecord & { inStudy: boolean; state: string }>>([]);
  let deckWordIds = $state<Set<string>>(new Set());
  let isSearching = $state(false);
  let togglingWordId = $state<string | null>(null);
  let activeVerbForConjugation = $state<VocabularyRecord | null>(null);

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

  async function loadCurrentDeckWordIds() {
    const all = await getAllUserDecks();
    const target = all.find((d) => d.id === deck.id && !d.deleted_at);
    if (target && Array.isArray(target.vocabulary_ids)) {
      deckWordIds = new Set(target.vocabulary_ids);
    }
  }

  async function refreshResults(q = rawQuery, jlpt = selectedJlpt) {
    isSearching = true;
    try {
      const [fetched] = await Promise.all([
        syncManager.searchRemoteVocabulary(q, jlpt, 80),
        loadCurrentDeckWordIds()
      ]);
      results = fetched;
    } finally {
      isSearching = false;
    }
  }

  onMount(() => {
    refreshResults();
  });

  $effect(() => {
    const q = rawQuery;
    const jlpt = selectedJlpt;
    const timer = setTimeout(() => {
      refreshResults(q, jlpt);
    }, 200);
    return () => clearTimeout(timer);
  });

  async function handleToggleWord(word: VocabularyRecord) {
    if (togglingWordId) return;
    togglingWordId = word.id;

    try {
      const { added } = await toggleWordInCustomUserDeck(
        deck.id,
        word,
        syncManager.getUserId()
      );

      const nextSet = new Set(deckWordIds);
      if (added) {
        nextSet.add(word.id);
        await hapticSuccess();
      } else {
        nextSet.delete(word.id);
        await hapticImpactLight();
      }
      deckWordIds = nextSet;

      // Sincronizar en segundo plano con el servidor
      syncManager.tryAutoSync().catch(() => {});
    } catch (err) {
      console.error('[AddWords] Error al alternar palabra:', err);
    } finally {
      togglingWordId = null;
    }
  }

  async function handleFilterJlpt(level: number | null) {
    await hapticSelection();
    selectedJlpt = level;
  }

  async function handleBack() {
    await hapticImpactLight();
    await onBack();
  }
</script>

<div class="space-y-4">
  <!-- Cabecera de la Pantalla de Agregar Palabras -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-3.5 shadow-xl">
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        onclick={handleBack}
        class="touch-target px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active-press text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
      >
        <span>←</span>
        <span>Listo</span>
      </button>

      <span class="px-2.5 py-0.5 rounded-full bg-[#a7f3d0]/15 text-[#a7f3d0] border border-[#a7f3d0]/30 text-[10px] font-bold">
        Total: {deckWordIds.size} palabras
      </span>
    </div>

    <div>
      <h2 class="text-xl font-bold text-white flex items-center gap-2 truncate">
        <span>➕ Agregar a: {deck.title}</span>
      </h2>
      <p class="text-xs text-slate-400 mt-0.5 leading-normal">
        Buscá palabras del diccionario y tocalas para sumarlas a tu mazo. Se guardarán en tu teléfono y en el servidor.
      </p>
    </div>

    <!-- Buscador Input -->
    <div class="relative">
      <input
        type="search"
        value={rawQuery}
        oninput={handleSearchInput}
        placeholder="Buscar ej: comida, tabemono, yakusoku..."
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
          class="absolute right-3 top-2.5 px-2.5 py-1 rounded-xl bg-slate-800 text-[11px] text-slate-300 font-semibold active-press"
        >
          Limpiar
        </button>
      {/if}
    </div>

    <!-- Barra de Lectura Kana en tiempo real -->
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
            class="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-[10px] text-[#a7f3d0] font-semibold active-press"
          >
            Usar ひらがな
          </button>
          <button
            type="button"
            onclick={() => applyDirectKanaConversion('katakana')}
            class="px-2 py-0.5 rounded-lg bg-black/40 border border-white/10 text-[10px] text-amber-300 font-semibold active-press"
          >
            Usar カタカナ
          </button>
        </div>
      </div>
    {/if}

    <!-- Filtros de Nivel JLPT -->
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

  <!-- Lista de Resultados de Palabras -->
  <section class="space-y-2.5">
    {#each results as item (item.id)}
      {@const inDeck = deckWordIds.has(item.id)}
      {@const vGroup = isVerb(item.part_of_speech, item.kanji || item.reading) ? getVerbGroup(item.part_of_speech, item.kanji || item.reading, item.reading) : null}
      <div class="rounded-3xl bg-gradient-to-r from-[#182120] to-[#121720] border border-white/10 p-4 flex items-center justify-between gap-3 shadow-md">
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
            {#if vGroup}
              <button
                type="button"
                onclick={() => (activeVerbForConjugation = item)}
                title="Ver tabla de conjugaciones"
                class="px-2.5 py-0.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-[10px] font-bold active-press flex items-center gap-1 shadow-sm"
              >
                <span>📖</span>
                <span>{vGroup.label}</span>
              </button>
            {/if}
          </div>

          <p class="text-xs font-semibold text-slate-100 truncate">
            {item.meaning_es}
          </p>
          <p class="text-[11px] text-slate-400 truncate">
            {item.meaning_en} • <span class="italic">{vGroup ? vGroup.label : item.part_of_speech}</span>
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onclick={() => speakJapanese(stripRubyTags(item.kanji || item.reading))}
            aria-label="Escuchar pronunciación"
            class="touch-target w-10 h-10 rounded-2xl bg-[#171717] border border-white/10 text-[#a7f3d0] active-press flex items-center justify-center text-sm"
          >
            🔊
          </button>

          <!-- Botón Agregar / Quitar de este mazo -->
          <button
            type="button"
            onclick={() => handleToggleWord(item)}
            disabled={togglingWordId === item.id}
            aria-label={inDeck ? 'Quitar de este mazo' : 'Agregar a este mazo'}
            class="touch-target px-3.5 py-2 rounded-2xl border text-xs font-bold active-press transition-colors disabled:opacity-50 {inDeck
              ? 'bg-[#1c2b25] border-[#a7f3d0]/50 text-[#a7f3d0]'
              : 'bg-[#171717] border-white/10 text-slate-300 hover:text-white'}"
          >
            {#if togglingWordId === item.id}
              <div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            {:else if inDeck}
              <span>✓ En mazo</span>
            {:else}
              <span>+ Agregar</span>
            {/if}
          </button>
        </div>
      </div>
    {:else}
      <div class="rounded-3xl bg-[#121820] border border-white/10 p-8 text-center">
        <p class="text-sm font-bold text-slate-300">
          {isSearching ? 'Consultando catálogo de palabras...' : `No se encontraron palabras para "${rawQuery}"`}
        </p>
      </div>
    {/each}
  </section>

  <!-- Botón Inferior para volver -->
  <div class="pt-2">
    <button
      type="button"
      onclick={handleBack}
      class="touch-target w-full py-3.5 rounded-2xl bg-[#a7f3d0] hover:bg-[#86efac] text-slate-950 font-extrabold text-sm text-center shadow-lg active-press transition-colors"
    >
      Listo • Volver a Mazos
    </button>
  </div>

  <!-- Modal de Conjugaciones si se toca un verbo -->
  {#if activeVerbForConjugation}
    <VerbConjugationsModal
      isOpen={Boolean(activeVerbForConjugation)}
      word={activeVerbForConjugation}
      onClose={() => (activeVerbForConjugation = null)}
    />
  {/if}
</div>

