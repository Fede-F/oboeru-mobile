<script lang="ts">
  import * as wanakana from 'wanakana';
  import type { VocabularyRecord } from '../lib/db/schema';
  import { searchLocalVocabulary, toggleVocabularyInStudy } from '../lib/db/database';
  import {
    convertSearchQueryToKana,
    speakJapanese,
    stripRubyTags,
    toRomajiText
  } from '../lib/utils/japanese';
  import { hapticImpactLight, hapticSelection } from '../lib/haptics.js';

  interface Props {
    onQueueUpdated: () => Promise<void>;
  }

  let { onQueueUpdated }: Props = $props();

  let rawQuery = $state('');
  let autoKanaMode = $state(true);
  let selectedJlpt = $state<number | null>(null);
  let results = $state<Array<VocabularyRecord & { inStudy: boolean; state: string }>>([]);

  let kanaPreview = $derived(convertSearchQueryToKana(rawQuery));

  // Si autoKanaMode está activo y el usuario escribe romaji, WanaKana convierte en tiempo real
  function handleSearchInput(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const val = target.value;
    if (autoKanaMode && /^[a-zA-Z\s'-]+$/.test(val)) {
      rawQuery = val;
    } else {
      rawQuery = val;
    }
  }

  function applyDirectKanaConversion(mode: 'hiragana' | 'katakana') {
    if (!rawQuery.trim()) return;
    rawQuery =
      mode === 'hiragana'
        ? wanakana.toHiragana(rawQuery, { IMEMode: true })
        : wanakana.toKatakana(rawQuery, { IMEMode: true });
  }

  async function refreshResults() {
    results = await searchLocalVocabulary(rawQuery, selectedJlpt);
  }

  $effect(() => {
    void rawQuery;
    void selectedJlpt;
    refreshResults();
  });

  async function handleToggleCard(vocabId: string) {
    await hapticImpactLight();
    await toggleVocabularyInStudy(vocabId);
    await refreshResults();
    await onQueueUpdated();
  }

  async function handleFilterJlpt(level: number | null) {
    await hapticSelection();
    selectedJlpt = level;
  }
</script>

<div class="space-y-4">
  <!-- Caja de Búsqueda con WanaKana.js (Autoconversión Romaji -> Hiragana / Katakana) -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-4 space-y-3 shadow-xl">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          <span>辞書 • Diccionario JLPT</span>
          <span class="px-2 py-0.5 rounded-full bg-[#a7f3d0]/15 text-[#a7f3d0] text-[10px] font-bold">
            WanaKana.js
          </span>
        </h2>
        <p class="text-[11px] text-slate-400 mt-0.5">
          Escribí en Romaji (ej. <code class="text-[#a7f3d0]">oboeru</code>, <code class="text-[#a7f3d0]">taberu</code>), Kana o Español
        </p>
      </div>

      <button
        type="button"
        onclick={async () => {
          await hapticSelection();
          autoKanaMode = !autoKanaMode;
        }}
        class="touch-target px-3 py-1.5 rounded-2xl border text-[11px] font-bold active-press {autoKanaMode
          ? 'bg-[#1c2b25] border-[#a7f3d0]/40 text-[#a7f3d0]'
          : 'bg-[#171717] border-white/10 text-slate-400'}"
      >
        あ Romaji→Kana: {autoKanaMode ? 'ON' : 'OFF'}
      </button>
    </div>

    <!-- Input Buscador -->
    <div class="relative">
      <input
        type="search"
        value={rawQuery}
        oninput={handleSearchInput}
        placeholder="Buscar ej: oboeru, yakusoku, comer, 先生..."
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

    <!-- Barra de Autoconversión en Tiempo Real (WanaKana IME) -->
    {#if rawQuery.trim()}
      <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-[#17211d] border border-[#a7f3d0]/25 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-[10px] uppercase tracking-wider text-slate-400">WanaKana:</span>
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

    <!-- Filtros por Nivel JLPT -->
    <div class="flex items-center gap-2 overflow-x-auto pt-1">
      <button
        type="button"
        onclick={() => handleFilterJlpt(null)}
        class="px-3.5 py-1.5 rounded-full text-xs font-bold border active-press {selectedJlpt === null
          ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
          : 'bg-[#171717] text-slate-300 border-white/10'}"
      >
        Todos ({results.length})
      </button>
      {#each [5, 4, 3] as level}
        <button
          type="button"
          onclick={() => handleFilterJlpt(level)}
          class="px-3.5 py-1.5 rounded-full text-xs font-bold border active-press {selectedJlpt === level
            ? 'bg-[#a7f3d0] text-slate-950 border-[#a7f3d0]'
            : 'bg-[#171717] text-slate-300 border-white/10'}"
        >
          JLPT N{level}
        </button>
      {/each}
    </div>
  </section>

  <!-- Lista de Resultados Offline-First -->
  <section class="space-y-2.5">
    {#each results as item (item.id)}
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
            onclick={() => handleToggleCard(item.id)}
            class="touch-target px-3.5 py-2 rounded-2xl border text-xs font-bold active-press {item.inStudy
              ? 'bg-[#1c2b25] border-[#a7f3d0]/40 text-[#a7f3d0]'
              : 'bg-[#171717] border-white/10 text-slate-300'}"
          >
            {item.inStudy ? '✓ En Estudio' : '+ Estudiar'}
          </button>
        </div>
      </div>
    {:else}
      <div class="rounded-3xl bg-[#121820] border border-white/10 p-8 text-center">
        <p class="text-sm font-bold text-slate-300">No se encontraron palabras para "{rawQuery}"</p>
        <p class="text-xs text-slate-500 mt-1">Probá buscando en romaji (ej. taberu, sensei) o en español.</p>
      </div>
    {/each}
  </section>
</div>

