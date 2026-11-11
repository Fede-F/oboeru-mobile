<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeckSummary, StudyCardItem } from '../lib/db/schema';
  import {
    convertSearchQueryToKana,
    ensureRubyMarkup,
    safeSetRubyHTML,
    speakJapanese,
    splitExampleSentence,
    stripDiacritics,
    stripRubyTags,
    toRomajiText
  } from '../lib/utils/japanese';
  import { getDeconjugatedCandidates, getVerbGroup, isVerb } from '../lib/utils/conjugator';
  import VerbConjugationsModal from './VerbConjugationsModal.svelte';
  import {
    hapticImpactLight,
    hapticSelection
  } from '../lib/haptics.js';
  import { registerBackInterceptor } from '../lib/backNavigation';

  interface Props {
    deck: DeckSummary;
    cards: StudyCardItem[];
    onBack: () => void;
  }

  let { deck, cards = [], onBack }: Props = $props();

  type MaskMode = 'none' | 'hide_es' | 'hide_jp';
  type SrsFilter = 'all' | 'new' | 'learning' | 'mastered';

  const INITIAL_VISIBLE_LIMIT = 80;

  let searchQuery = $state('');
  let showFurigana = $state(true);
  let showRomaji = $state(true);
  let maskMode = $state<MaskMode>('none');
  let srsFilter = $state<SrsFilter>('all');
  let showFilterSheet = $state(false);
  let visibleLimit = $state(INITIAL_VISIBLE_LIMIT);

  let expandedIds = $state<Record<string, boolean>>({});
  let revealedIds = $state<Record<string, boolean>>({});
  let activeVerbForConjugation = $state<StudyCardItem | null>(null);

  function getCardSrsCategory(card: StudyCardItem): 'new' | 'learning' | 'mastered' {
    if (card.review.state === 'new') return 'new';
    if (card.review.state === 'review' && card.review.interval_days >= 3) return 'mastered';
    return 'learning';
  }

  function getCardSrsLabel(card: StudyCardItem): string {
    const cat = getCardSrsCategory(card);
    if (cat === 'mastered') return 'Dominada';
    if (cat === 'learning') return 'En aprendizaje';
    return 'Nueva';
  }

  let categoryCounts = $derived.by(() => {
    let newCount = 0;
    let learningCount = 0;
    let masteredCount = 0;
    for (const c of cards) {
      const cat = getCardSrsCategory(c);
      if (cat === 'new') newCount++;
      else if (cat === 'mastered') masteredCount++;
      else learningCount++;
    }
    return {
      all: cards.length,
      new: newCount,
      learning: learningCount,
      mastered: masteredCount
    };
  });

  let filteredCards = $derived.by(() => {
    const raw = searchQuery.trim();
    const converted = raw ? convertSearchQueryToKana(raw) : null;
    const qLower = converted ? converted.raw.toLowerCase() : '';
    const qNorm = converted ? stripDiacritics(converted.raw) : '';
    const hira = converted ? converted.hiragana : '';
    const kata = converted ? converted.katakana : '';
    const deconjugated = raw ? getDeconjugatedCandidates(raw) : [];

    return cards.filter((c) => {
      if (srsFilter !== 'all' && getCardSrsCategory(c) !== srsFilter) {
        return false;
      }
      if (!raw) return true;

      const cleanKanji = stripRubyTags(c.kanji);
      const itemRomaji = toRomajiText(c.reading).toLowerCase();
      const esNorm = stripDiacritics(c.meaning_es);
      const enNorm = stripDiacritics(c.meaning_en);

      const matchesDeconjugated =
        deconjugated.length > 0 &&
        deconjugated.some(
          (cand) =>
            cleanKanji === cand ||
            c.reading === cand ||
            cleanKanji.includes(cand) ||
            c.reading.includes(cand)
        );

      return (
        cleanKanji.toLowerCase().includes(qLower) ||
        cleanKanji.includes(hira) ||
        cleanKanji.includes(kata) ||
        c.reading.includes(qLower) ||
        c.reading.includes(hira) ||
        c.reading.includes(kata) ||
        itemRomaji.includes(qLower) ||
        esNorm.includes(qNorm) ||
        enNorm.includes(qNorm) ||
        c.meaning_es.toLowerCase().includes(qLower) ||
        c.meaning_en.toLowerCase().includes(qLower) ||
        matchesDeconjugated
      );
    });
  });

  let displayedCards = $derived(filteredCards.slice(0, visibleLimit));

  let activeSummaryChips = $derived.by(() => {
    const chips: string[] = [];
    if (maskMode === 'hide_es') chips.push('Tapar Español');
    if (maskMode === 'hide_jp') chips.push('Tapar Japonés');
    if (srsFilter === 'new') chips.push('Nuevas');
    if (srsFilter === 'learning') chips.push('En aprendizaje');
    if (srsFilter === 'mastered') chips.push('Dominadas');
    if (!showFurigana) chips.push('Sin Furigana');
    if (!showRomaji) chips.push('Sin Romaji');
    return chips;
  });

  let hasActiveFilter = $derived(activeSummaryChips.length > 0);

  function rubyHtml(node: HTMLElement, html: string) {
    safeSetRubyHTML(node, html);
    return {
      update(newHtml: string) {
        safeSetRubyHTML(node, newHtml);
      }
    };
  }

  function getWordRubyMarkup(kanji: string | null, reading: string, furiganaEnabled: boolean): string {
    const rawDisplay = kanji || reading;
    if (!furiganaEnabled) {
      return stripRubyTags(rawDisplay);
    }
    return ensureRubyMarkup(rawDisplay, reading);
  }

  function parseCardExample(exampleSentence: string | null | undefined, furiganaEnabled: boolean): {
    jpHtml: string;
    jpPlain: string;
    translation: string;
  } | null {
    if (!exampleSentence || !exampleSentence.trim()) return null;
    const split = splitExampleSentence(exampleSentence);
    if (!split.jpPlain && !split.jpHtml) return null;
    return {
      jpHtml: furiganaEnabled ? split.jpHtml : split.jpPlain,
      jpPlain: split.jpPlain,
      translation: split.translation
    };
  }

  async function handleBackClick() {
    await hapticImpactLight();
    onBack();
  }

  async function openFilterSheet() {
    await hapticImpactLight();
    showFilterSheet = true;
  }

  async function closeFilterSheet() {
    await hapticImpactLight();
    showFilterSheet = false;
  }

  async function selectMaskMode(mode: MaskMode) {
    await hapticSelection();
    maskMode = mode;
    revealedIds = {};
  }

  async function selectSrsFilter(filter: SrsFilter) {
    await hapticSelection();
    srsFilter = filter;
    visibleLimit = INITIAL_VISIBLE_LIMIT;
  }

  async function toggleFuriganaOption() {
    await hapticSelection();
    showFurigana = !showFurigana;
  }

  async function toggleRomajiOption() {
    await hapticSelection();
    showRomaji = !showRomaji;
  }

  async function resetAllFilters() {
    await hapticImpactLight();
    maskMode = 'none';
    srsFilter = 'all';
    showFurigana = true;
    showRomaji = true;
    revealedIds = {};
    visibleLimit = INITIAL_VISIBLE_LIMIT;
  }

  async function handleCardTap(cardId: string) {
    if (maskMode !== 'none' && !revealedIds[cardId]) {
      await hapticImpactLight();
      revealedIds = { ...revealedIds, [cardId]: true };
      return;
    }
    await hapticSelection();
    expandedIds = { ...expandedIds, [cardId]: !expandedIds[cardId] };
  }

  function handleSpeakWord(e: MouseEvent, text: string) {
    e.stopPropagation();
    hapticImpactLight().catch(() => {});
    speakJapanese(text);
  }

  function handleOpenConjugations(e: MouseEvent, card: StudyCardItem) {
    e.stopPropagation();
    hapticImpactLight().catch(() => {});
    activeVerbForConjugation = card;
  }

  onMount(() => {
    return registerBackInterceptor(() => {
      if (showFilterSheet) {
        showFilterSheet = false;
        return true;
      }
      return false;
    });
  });
</script>

<div class="space-y-3">
  <!-- 1. Cabecera Compacta del Mazo -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-4 space-y-2.5 shadow-xl">
    <div class="flex items-center justify-between gap-2">
      <button
        type="button"
        onclick={handleBackClick}
        class="touch-target px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 active-press text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
      >
        <span>←</span>
        <span>Volver</span>
      </button>

      <span class="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-bold">
        {filteredCards.length} {filteredCards.length === 1 ? 'palabra' : 'palabras'}
      </span>
    </div>

    <div>
      <h2 class="text-xl font-extrabold text-white leading-tight truncate">
        {deck.title}
      </h2>
      <p class="text-xs text-slate-400 mt-0.5">
        Tocá cualquier palabra para desplegar ejemplos y conjugaciones
      </p>
    </div>
  </section>

  <!-- 2. Barra Flotante Sticky: Buscador + Botón de Filtros (Visible durante todo el scroll) -->
  <div class="sticky top-[calc(max(env(safe-area-inset-top,0px),16px)+54px)] z-30">
    <div class="bg-[#121820]/95 backdrop-blur-md border border-white/15 rounded-2xl p-2 shadow-2xl flex items-center gap-2">
      <div class="relative flex-1">
        <input
          type="search"
          bind:value={searchQuery}
          oninput={() => {
            visibleLimit = INITIAL_VISIBLE_LIMIT;
          }}
          placeholder="Buscar en español, romaji o kanji..."
          class="w-full py-2.5 pl-9 pr-8 rounded-xl bg-black/50 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#a7f3d0]/50"
        />
        <svg
          class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>

        {#if searchQuery.trim()}
          <button
            type="button"
            onclick={() => {
              searchQuery = '';
              visibleLimit = INITIAL_VISIBLE_LIMIT;
            }}
            aria-label="Limpiar búsqueda"
            class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 text-slate-300 hover:text-white flex items-center justify-center text-[10px] active-press"
          >
            ✕
          </button>
        {/if}
      </div>

      <button
        type="button"
        onclick={openFilterSheet}
        aria-label="Abrir opciones de vista y filtros"
        class="touch-target px-3.5 py-2 rounded-xl bg-[#1c2b25] hover:bg-[#243830] border border-[#a7f3d0]/40 text-[#a7f3d0] text-xs font-bold flex items-center gap-1.5 shrink-0 active-press shadow-md"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
          />
        </svg>
        <span>Filtros</span>
        {#if hasActiveFilter}
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        {/if}
      </button>
    </div>

    {#if activeSummaryChips.length > 0}
      <div class="mt-1.5 px-1 flex items-center gap-1.5 flex-wrap">
        {#each activeSummaryChips as chip}
          <span class="px-2.5 py-0.5 rounded-full bg-[#182420]/95 border border-[#a7f3d0]/30 text-[#a7f3d0] text-[11px] font-semibold shadow">
            {chip}
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- 3. Lista de Palabras Interactivas -->
  <section class="space-y-2.5 pt-0.5">
    {#if displayedCards.length > 0}
      {#each displayedCards as card (card.id)}
        {@const srsCat = getCardSrsCategory(card)}
        {@const srsLabel = getCardSrsLabel(card)}
        {@const isExpanded = Boolean(expandedIds[card.id])}
        {@const isRevealed = Boolean(revealedIds[card.id])}
        {@const hideEs = maskMode === 'hide_es' && !isRevealed}
        {@const hideJp = maskMode === 'hide_jp' && !isRevealed}
        {@const cleanKanji = stripRubyTags(card.kanji || card.reading)}
        {@const vGroup = isVerb(card.part_of_speech, card.kanji || card.reading)
          ? getVerbGroup(card.part_of_speech, card.kanji || card.reading, card.reading)
          : null}
        {@const parsedExample = isExpanded ? parseCardExample(card.example_sentence, showFurigana) : null}

        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          onclick={() => handleCardTap(card.id)}
          class="cursor-pointer rounded-3xl bg-gradient-to-r from-[#182120] to-[#121720] border {isExpanded
            ? 'border-emerald-400/40'
            : 'border-white/10'} p-4 transition-all hover:border-white/25 shadow-md"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0 flex-1">
              <!-- Indicador de estado SRS -->
              <div class="mt-2.5 shrink-0">
                {#if srsCat === 'mastered'}
                  <span class="block w-2 h-2 rounded-full bg-emerald-400" title="Dominada"></span>
                {:else if srsCat === 'learning'}
                  <span class="block w-2 h-2 rounded-full bg-amber-400" title="En aprendizaje"></span>
                {:else}
                  <span class="block w-2 h-2 rounded-full bg-sky-400" title="Nueva"></span>
                {/if}
              </div>

              <!-- Contenido Principal (Japonés + Español) -->
              <div class="min-w-0 flex-1">
                {#if hideJp}
                  <div class="inline-flex items-center px-3 py-1 rounded-xl bg-white/5 border border-dashed border-white/20 text-xs font-semibold text-slate-300">
                    <span>Tocar para mostrar japonés</span>
                  </div>
                {:else}
                  <div class="flex items-baseline gap-2 flex-wrap">
                    <span
                      use:rubyHtml={getWordRubyMarkup(card.kanji, card.reading, showFurigana)}
                      class="text-xl font-extrabold text-white leading-snug"
                    ></span>
                    {#if showFurigana && cleanKanji !== card.reading}
                      <span class="text-xs font-semibold text-[#a7f3d0]/90">
                        【{card.reading}】
                      </span>
                    {/if}
                    {#if showRomaji}
                      <span class="text-xs font-mono text-amber-300/90">
                        {toRomajiText(card.reading)}
                      </span>
                    {/if}
                  </div>
                {/if}

                {#if hideEs}
                  <div class="mt-1 inline-flex items-center px-3 py-1 rounded-xl bg-white/5 border border-dashed border-white/20 text-xs font-semibold text-slate-300">
                    <span>Tocar para mostrar significado</span>
                  </div>
                {:else}
                  <p class="text-sm font-bold text-slate-100 mt-0.5 break-words">
                    {card.meaning_es}
                    {#if card.meaning_en}
                      <span class="text-xs font-normal text-slate-400"> • {card.meaning_en}</span>
                    {/if}
                  </p>
                {/if}
              </div>
            </div>

            <!-- Botón de Audio Directo + Flecha Acordeón -->
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onclick={(e) => handleSpeakWord(e, card.reading || cleanKanji)}
                aria-label="Escuchar pronunciación"
                title="Escuchar palabra"
                class="touch-target w-11 h-11 rounded-2xl bg-[#171717] border border-white/10 text-[#a7f3d0] active-press flex items-center justify-center text-sm"
              >
                🔊
              </button>
              <span
                class="text-slate-400 text-xs font-bold px-1 transition-transform {isExpanded
                  ? 'rotate-180 text-emerald-300'
                  : ''}"
              >
                ▾
              </span>
            </div>
          </div>

          <!-- Panel Expandido: Oración de Ejemplo y Conjugaciones -->
          {#if isExpanded}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              onclick={(e) => e.stopPropagation()}
              class="mt-3 pt-3 border-t border-white/10 space-y-2.5 animate-fade-in"
            >
              {#if parsedExample}
                <div class="rounded-2xl bg-black/40 border border-white/10 p-3 flex items-center justify-between gap-3">
                  <div class="space-y-1 min-w-0 flex-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Oración de ejemplo
                    </span>
                    <p
                      use:rubyHtml={parsedExample.jpHtml}
                      class="text-sm font-bold text-white leading-relaxed"
                    ></p>
                    {#if parsedExample.translation}
                      <p class="text-xs text-slate-300 leading-snug">
                        {parsedExample.translation}
                      </p>
                    {/if}
                  </div>

                  <button
                    type="button"
                    onclick={(e) => handleSpeakWord(e, parsedExample.jpPlain)}
                    class="touch-target px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[#a7f3d0] text-xs font-bold shrink-0 active-press flex items-center gap-1.5"
                  >
                    <span>🔊</span>
                    <span>Escuchar</span>
                  </button>
                </div>
              {/if}

              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-xs text-slate-400">
                  Estado: <strong class="text-white">{srsLabel}</strong> • JLPT N{card.jlpt_level}
                </span>

                {#if vGroup}
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs font-semibold text-slate-300">
                      {vGroup.label}
                    </span>
                    <button
                      type="button"
                      onclick={(e) => handleOpenConjugations(e, card)}
                      class="px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/60 text-emerald-300 text-xs font-bold active-press transition-colors"
                    >
                      Ver conjugaciones
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}

      {#if filteredCards.length > visibleLimit}
        <div class="pt-2">
          <button
            type="button"
            onclick={async () => {
              await hapticImpactLight();
              visibleLimit += INITIAL_VISIBLE_LIMIT;
            }}
            class="touch-target w-full py-3 rounded-2xl bg-[#121820] hover:bg-[#18202b] border border-white/10 text-[#a7f3d0] text-xs font-bold active-press transition-colors"
          >
            Mostrar más palabras ({filteredCards.length - visibleLimit} restantes)
          </button>
        </div>
      {/if}
    {:else}
      <div class="rounded-3xl bg-[#121820] border border-white/10 p-8 text-center space-y-1">
        <p class="text-sm font-bold text-slate-300">
          No se encontraron palabras con este filtro
        </p>
        <p class="text-xs text-slate-500">
          Probá cambiando los filtros o buscando otra palabra en español, romaji o japonés.
        </p>
      </div>
    {/if}
  </section>
</div>

<!-- Modal / Panel Desplegable de Filtros y Modo de Repaso -->
{#if showFilterSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    onclick={closeFilterSheet}
    class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-sheet-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      class="bg-[#151c24] border border-white/15 rounded-[30px] p-5 max-w-sm w-full shadow-2xl space-y-4 mb-safe"
    >
      <!-- Cabecera del panel -->
      <div class="flex items-center justify-between pb-2 border-b border-white/10">
        <div>
          <span class="text-[10px] font-extrabold uppercase tracking-wider text-[#a7f3d0] block">
            Vista y Estudio
          </span>
          <h3 id="filter-sheet-title" class="text-base font-extrabold text-white mt-0.5">
            Opciones de la hoja de estudio
          </h3>
        </div>
        <button
          type="button"
          onclick={closeFilterSheet}
          aria-label="Cerrar opciones"
          class="touch-target w-9 h-9 rounded-full bg-white/10 text-slate-300 hover:text-white flex items-center justify-center text-xs font-bold active-press"
        >
          ✕
        </button>
      </div>

      <!-- Sección 1: Modo de repaso (Sin iconos) -->
      <div class="space-y-2">
        <span class="text-xs font-bold text-slate-300 block">
          Modo de repaso
        </span>
        <div class="grid grid-cols-3 gap-1.5 bg-black/40 p-1 rounded-2xl border border-white/10">
          <button
            type="button"
            onclick={() => selectMaskMode('none')}
            class="py-2.5 px-2 rounded-xl text-xs font-bold transition active-press {maskMode === 'none'
              ? 'bg-[#a7f3d0] text-slate-950 shadow'
              : 'text-slate-300 hover:text-white'}"
          >
            Ver todo
          </button>
          <button
            type="button"
            onclick={() => selectMaskMode('hide_es')}
            class="py-2.5 px-2 rounded-xl text-xs font-bold transition active-press {maskMode === 'hide_es'
              ? 'bg-[#a7f3d0] text-slate-950 shadow'
              : 'text-slate-300 hover:text-white'}"
          >
            Tapar Español
          </button>
          <button
            type="button"
            onclick={() => selectMaskMode('hide_jp')}
            class="py-2.5 px-2 rounded-xl text-xs font-bold transition active-press {maskMode === 'hide_jp'
              ? 'bg-[#a7f3d0] text-slate-950 shadow'
              : 'text-slate-300 hover:text-white'}"
          >
            Tapar Japonés
          </button>
        </div>
      </div>

      <!-- Sección 2: Ayudas de lectura -->
      <div class="space-y-2">
        <span class="text-xs font-bold text-slate-300 block">
          Ayudas de lectura
        </span>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={toggleFuriganaOption}
            class="py-2.5 px-3 rounded-2xl text-xs font-bold border transition active-press flex items-center justify-between {showFurigana
              ? 'bg-[#1c2b25] text-[#a7f3d0] border-[#a7f3d0]/40'
              : 'bg-[#0e1318] text-slate-400 border-white/10'}"
          >
            <span>Furigana</span>
            <span
              class="px-2 py-0.5 rounded-full text-[11px] font-extrabold {showFurigana
                ? 'bg-[#a7f3d0] text-slate-950'
                : 'bg-white/10 text-slate-400'}"
            >
              {showFurigana ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onclick={toggleRomajiOption}
            class="py-2.5 px-3 rounded-2xl text-xs font-bold border transition active-press flex items-center justify-between {showRomaji
              ? 'bg-[#1c2b25] text-[#a7f3d0] border-[#a7f3d0]/40'
              : 'bg-[#0e1318] text-slate-400 border-white/10'}"
          >
            <span>Romaji</span>
            <span
              class="px-2 py-0.5 rounded-full text-[11px] font-extrabold {showRomaji
                ? 'bg-[#a7f3d0] text-slate-950'
                : 'bg-white/10 text-slate-400'}"
            >
              {showRomaji ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      <!-- Sección 3: Filtrar por progreso -->
      <div class="space-y-2">
        <span class="text-xs font-bold text-slate-300 block">
          Filtrar por progreso
        </span>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={() => selectSrsFilter('all')}
            class="py-2.5 px-3 rounded-2xl text-xs font-bold border transition active-press flex items-center justify-between {srsFilter === 'all'
              ? 'bg-white text-slate-950 border-white'
              : 'bg-[#0e1318] text-slate-300 border-white/10'}"
          >
            <span>Todas</span>
            <span class="font-extrabold">{categoryCounts.all}</span>
          </button>

          <button
            type="button"
            onclick={() => selectSrsFilter('new')}
            class="py-2.5 px-3 rounded-2xl text-xs font-bold border transition active-press flex items-center justify-between {srsFilter === 'new'
              ? 'bg-white text-slate-950 border-white'
              : 'bg-[#0e1318] text-slate-300 border-white/10'}"
          >
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-sky-400"></span>
              <span>Nuevas</span>
            </span>
            <span class={srsFilter === 'new' ? 'font-extrabold' : 'text-slate-400'}>{categoryCounts.new}</span>
          </button>

          <button
            type="button"
            onclick={() => selectSrsFilter('learning')}
            class="py-2.5 px-3 rounded-2xl text-xs font-bold border transition active-press flex items-center justify-between {srsFilter === 'learning'
              ? 'bg-white text-slate-950 border-white'
              : 'bg-[#0e1318] text-slate-300 border-white/10'}"
          >
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>En aprendizaje</span>
            </span>
            <span class={srsFilter === 'learning' ? 'font-extrabold' : 'text-slate-400'}>{categoryCounts.learning}</span>
          </button>

          <button
            type="button"
            onclick={() => selectSrsFilter('mastered')}
            class="py-2.5 px-3 rounded-2xl text-xs font-bold border transition active-press flex items-center justify-between {srsFilter === 'mastered'
              ? 'bg-white text-slate-950 border-white'
              : 'bg-[#0e1318] text-slate-300 border-white/10'}"
          >
            <span class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Dominadas</span>
            </span>
            <span class={srsFilter === 'mastered' ? 'font-extrabold' : 'text-slate-400'}>{categoryCounts.mastered}</span>
          </button>
        </div>
      </div>

      <!-- Acciones del panel -->
      <div class="flex items-center gap-2 pt-2">
        <button
          type="button"
          onclick={resetAllFilters}
          class="touch-target py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs active-press transition-colors"
        >
          Restablecer
        </button>
        <button
          type="button"
          onclick={closeFilterSheet}
          class="touch-target flex-1 py-3 px-4 rounded-2xl bg-[#a7f3d0] text-slate-950 font-extrabold text-xs active-press shadow-lg transition-colors"
        >
          Aplicar
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Modal de Conjugaciones del Verbo -->
{#if activeVerbForConjugation}
  <VerbConjugationsModal
    isOpen={Boolean(activeVerbForConjugation)}
    word={activeVerbForConjugation}
    onClose={() => (activeVerbForConjugation = null)}
  />
{/if}
