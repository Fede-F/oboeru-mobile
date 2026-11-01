<script lang="ts">
  import type { ReviewRating, StudyCardItem } from '../lib/db/schema';
  import { getSrsButtonPreviews } from '../lib/srs/sm2';
  import {
    ensureRubyMarkup,
    safeSetRubyHTML,
    speakJapanese,
    splitExampleSentence,
    stripRubyTags,
    toRomajiText
  } from '../lib/utils/japanese';
  import {
    hapticImpactLight,
    hapticImpactMedium,
    hapticSelection,
    hapticSuccess
  } from '../lib/haptics.js';

  interface Props {
    deckTitle: string;
    cards: StudyCardItem[];
    onRateCard: (vocabularyId: string, rating: ReviewRating) => Promise<void>;
    onExitStudy: () => void;
  }

  let { deckTitle = 'Estudio SRS', cards = [], onRateCard, onExitStudy }: Props = $props();

  let currentIndex = $state(0);
  let isFlipped = $state(false);
  let showFurigana = $state(true);
  let isSpeaking = $state(false);
  let sessionCompletedCount = $state(0);

  let frontWordContainer = $state<HTMLElement | null>(null);
  let backWordContainer = $state<HTMLElement | null>(null);
  let exampleJpContainer = $state<HTMLElement | null>(null);

  let currentCard = $derived<StudyCardItem | null>(cards[currentIndex] ?? null);

  let romajiReading = $derived(currentCard ? toRomajiText(currentCard.reading) : '');

  let parsedExample = $derived(
    currentCard ? splitExampleSentence(currentCard.example_sentence) : { jpHtml: '', jpPlain: '', translation: '' }
  );

  let srsTimeLabels = $derived.by(() => {
    if (!currentCard) {
      return { 1: '10 min', 2: '1 day', 3: '3 days', 4: '4 days' } as Record<ReviewRating, string>;
    }
    return getSrsButtonPreviews({
      state: currentCard.review.state,
      easeFactor: Number(currentCard.review.ease_factor),
      intervalDays: Number(currentCard.review.interval_days),
      lapses: Number(currentCard.review.lapses)
    });
  });

  // Renderizado seguro de etiquetas <ruby> enviadas por el backend
  $effect(() => {
    if (!currentCard) return;
    const headwordHtml = currentCard.kanji
      ? ensureRubyMarkup(currentCard.kanji, currentCard.reading)
      : currentCard.reading;

    if (frontWordContainer) {
      safeSetRubyHTML(frontWordContainer, headwordHtml);
    }
    if (backWordContainer) {
      safeSetRubyHTML(backWordContainer, headwordHtml);
    }
    if (exampleJpContainer && parsedExample.jpHtml) {
      safeSetRubyHTML(exampleJpContainer, parsedExample.jpHtml);
    }
  });

  async function handleCardFlip() {
    await hapticSelection();
    isFlipped = !isFlipped;
  }

  async function toggleFurigana(e: MouseEvent) {
    e.stopPropagation();
    await hapticImpactLight();
    showFurigana = !showFurigana;
  }

  async function handlePlayAudio(e: MouseEvent, textToSpeak?: string) {
    e.stopPropagation();
    if (!currentCard) return;
    await hapticImpactLight();
    isSpeaking = true;
    try {
      const target = textToSpeak || stripRubyTags(currentCard.kanji || currentCard.reading);
      await speakJapanese(target);
    } finally {
      isSpeaking = false;
    }
  }

  async function handleRate(rating: ReviewRating) {
    if (!currentCard) return;
    if (rating >= 3) {
      await hapticSuccess();
    } else {
      await hapticImpactMedium();
    }

    const vocabId = currentCard.id;
    sessionCompletedCount += 1;
    isFlipped = false;

    await onRateCard(vocabId, rating);

    if (currentIndex < cards.length - 1) {
      currentIndex += 1;
    } else {
      currentIndex = cards.length; // Fin de la cola actual
    }
  }

  function restartDeckSession() {
    currentIndex = 0;
    sessionCompletedCount = 0;
    isFlipped = false;
  }
</script>

<div class="flex flex-col min-h-[calc(100vh-155px)] justify-between space-y-4">
  <!-- Barra Superior de Control de Estudio: Volver, Progreso, Furigana Toggle y Audio TTS -->
  <div class="flex items-center justify-between gap-2">
    <button
      type="button"
      onclick={onExitStudy}
      class="touch-target px-3 py-2 rounded-2xl bg-[#171717] border border-white/10 text-slate-300 hover:text-white text-xs font-semibold active-press flex items-center gap-1.5"
    >
      <svg class="w-4 h-4 text-[#a7f3d0]" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
      </svg>
      <span class="truncate max-w-[115px]">{deckTitle}</span>
    </button>

    <!-- Controles: Toggle Furigana (<ruby>) & Audio TTS -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={toggleFurigana}
        aria-pressed={showFurigana}
        class="touch-target px-3.5 py-2 rounded-2xl border text-xs font-bold active-press transition-colors flex items-center gap-1.5 {showFurigana
          ? 'bg-[#1c2b25] border-[#a7f3d0]/40 text-[#a7f3d0]'
          : 'bg-[#171717] border-white/10 text-slate-400'}"
      >
        <span class="text-[11px] font-mono">振仮名</span>
        <span>{showFurigana ? 'ON' : 'OFF'}</span>
      </button>

      {#if currentCard}
        <button
          type="button"
          onclick={(e) => handlePlayAudio(e)}
          aria-label="Escuchar pronunciación en japonés (TTS)"
          class="touch-target w-12 h-12 rounded-2xl bg-[#171717] border border-white/10 text-[#a7f3d0] active-press flex items-center justify-center {isSpeaking ? 'ring-2 ring-[#a7f3d0]/60' : ''}"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  {#if currentCard}
    <!-- Barra de progreso sutil -->
    <div class="flex items-center justify-between text-[11px] text-slate-400 px-1">
      <span>Tarjeta <strong class="text-white">{currentIndex + 1}</strong> de {cards.length}</span>
      <span class="text-[#a7f3d0] font-semibold uppercase tracking-wider">
        JLPT N{currentCard.jlpt_level} • {currentCard.part_of_speech}
      </span>
    </div>

    <!-- ====================================================================== -->
    <!-- TARJETA FLASHCARD CON GRADIENTE VERDE OLIVA MATE ESTRICTO              -->
    <!-- from-[#43534a] via-[#2f3b35] to-[#1a231f] + border-white/10            -->
    <!-- ====================================================================== -->
    <div
      role="button"
      tabindex="0"
      onclick={handleCardFlip}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardFlip();
        }
      }}
      aria-label="Tocar el centro de la tarjeta para voltear"
      class="flex-1 min-h-[340px] rounded-[32px] bg-gradient-to-br from-[#43534a] via-[#2f3b35] to-[#1a231f] border border-white/10 shadow-2xl p-6 flex flex-col justify-between relative overflow-hidden cursor-pointer active-press {showFurigana ? '' : 'furigana-hidden'}"
    >
      <!-- Cabecera interna de la tarjeta -->
      <div class="flex items-center justify-between text-xs">
        <span class="px-3 py-1 rounded-full bg-black/25 border border-white/10 text-[#a7f3d0] font-semibold tracking-wide">
          {isFlipped ? '裏 • Reverso' : '表 • Frente'}
        </span>

        <span class="text-[11px] text-slate-200/75 font-medium">
          Ease {(Number(currentCard.review.ease_factor) * 100).toFixed(0)}% • {currentCard.review.state.toUpperCase()}
        </span>
      </div>

      {#if !isFlipped}
        <!-- FRENTE: Palabra en Japonés (Kanji o Kana) centrada -->
        <div class="my-auto py-8 flex flex-col items-center justify-center text-center">
          <div
            bind:this={frontWordContainer}
            class="text-5xl sm:text-6xl font-bold text-white tracking-wide leading-relaxed select-text"
          >
            {stripRubyTags(currentCard.kanji || currentCard.reading)}
          </div>

          {#if !currentCard.kanji}
            <span class="mt-3 text-xs uppercase tracking-widest text-[#a7f3d0]/80 font-semibold">
              Palabra en Kana
            </span>
          {/if}
        </div>

        <!-- Pie del Frente: Instrucción táctil -->
        <div class="text-center pt-3 border-t border-white/10">
          <p class="text-xs text-slate-200/75 font-medium flex items-center justify-center gap-1.5">
            <span>👆</span>
            <span>Tocá el centro de la tarjeta para revelar significado y ejemplo</span>
          </p>
        </div>
      {:else}
        <!-- REVERSO: Traducción, Romaji y Oración de Ejemplo (Tatoeba) -->
        <div class="my-auto py-3 space-y-4">
          <!-- Palabra + Lectura Kana + Romaji -->
          <div class="text-center pb-3 border-b border-white/10">
            <div
              bind:this={backWordContainer}
              class="text-3xl font-bold text-white tracking-wide leading-snug"
            >
              {stripRubyTags(currentCard.kanji || currentCard.reading)}
            </div>
            <div class="mt-1.5 flex items-center justify-center gap-2 text-sm">
              <span class="text-[#a7f3d0] font-semibold">{currentCard.reading}</span>
              <span class="text-white/30">•</span>
              <span class="font-mono text-amber-200/90 text-xs uppercase tracking-wider">
                {romajiReading}
              </span>
            </div>
          </div>

          <!-- Significados (Español + Inglés) -->
          <div class="space-y-1.5 text-center">
            <p class="text-xl font-bold text-white leading-snug">
              {currentCard.meaning_es}
            </p>
            <p class="text-xs text-slate-300/85 italic">
              EN: {currentCard.meaning_en}
            </p>
          </div>

          <!-- Oración de Ejemplo (Tatoeba) con botón de audio propio -->
          {#if currentCard.example_sentence}
            <div class="mt-3 p-3.5 rounded-2xl bg-black/30 border border-white/10 space-y-1.5">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wider text-[#a7f3d0]">
                  Oración de Ejemplo (Tatoeba)
                </span>
                <button
                  type="button"
                  onclick={(e) => handlePlayAudio(e, parsedExample.jpPlain)}
                  class="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-[10px] font-semibold text-[#a7f3d0] flex items-center gap-1"
                >
                  <span>🔊</span>
                  <span>Escuchar oración</span>
                </button>
              </div>

              <div
                bind:this={exampleJpContainer}
                class="text-base font-medium text-white leading-relaxed"
              >
                {parsedExample.jpPlain}
              </div>

              {#if parsedExample.translation}
                <p class="text-xs text-slate-300/90">
                  {parsedExample.translation}
                </p>
              {/if}
            </div>
          {/if}
        </div>

        <div class="text-center pt-2 border-t border-white/10">
          <p class="text-[11px] text-slate-300/75">
            Calificá tu recuerdo abajo para programar el próximo repaso SRS
          </p>
        </div>
      {/if}
    </div>

    <!-- ====================================================================== -->
    <!-- BOTONES SRS INFERIORES: Pastillas oscuras (bg-[#171717]) con           -->
    <!-- indicadores cálidos/ámbar para las opciones de tiempo                  -->
    <!-- ====================================================================== -->
    <div class="pt-1">
      <div class="grid grid-cols-4 gap-2">
        <!-- 1: Again -->
        <button
          type="button"
          onclick={() => handleRate(1)}
          class="touch-target py-2.5 px-2 rounded-full bg-[#171717] hover:bg-neutral-800 border border-white/10 active-press flex flex-col items-center justify-center shadow-lg"
        >
          <span class="text-[11px] font-bold text-amber-400 leading-none">
            {srsTimeLabels[1]}
          </span>
          <span class="text-xs font-semibold text-white mt-1 leading-none">
            Otra vez
          </span>
        </button>

        <!-- 2: Hard -->
        <button
          type="button"
          onclick={() => handleRate(2)}
          class="touch-target py-2.5 px-2 rounded-full bg-[#171717] hover:bg-neutral-800 border border-white/10 active-press flex flex-col items-center justify-center shadow-lg"
        >
          <span class="text-[11px] font-bold text-amber-300 leading-none">
            {srsTimeLabels[2]}
          </span>
          <span class="text-xs font-semibold text-slate-100 mt-1 leading-none">
            Difícil
          </span>
        </button>

        <!-- 3: Good -->
        <button
          type="button"
          onclick={() => handleRate(3)}
          class="touch-target py-2.5 px-2 rounded-full bg-[#171717] hover:bg-neutral-800 border border-[#a7f3d0]/30 active-press flex flex-col items-center justify-center shadow-lg"
        >
          <span class="text-[11px] font-bold text-amber-300 leading-none">
            {srsTimeLabels[3]}
          </span>
          <span class="text-xs font-bold text-[#a7f3d0] mt-1 leading-none">
            Bien
          </span>
        </button>

        <!-- 4: Easy -->
        <button
          type="button"
          onclick={() => handleRate(4)}
          class="touch-target py-2.5 px-2 rounded-full bg-[#171717] hover:bg-neutral-800 border border-white/10 active-press flex flex-col items-center justify-center shadow-lg"
        >
          <span class="text-[11px] font-bold text-amber-200 leading-none">
            {srsTimeLabels[4]}
          </span>
          <span class="text-xs font-semibold text-emerald-300 mt-1 leading-none">
            Fácil
          </span>
        </button>
      </div>
    </div>
  {:else}
    <!-- Estado de Sesión Completada -->
    <div class="my-auto rounded-[32px] bg-gradient-to-br from-[#43534a] via-[#2f3b35] to-[#1a231f] border border-white/10 p-7 text-center space-y-4 shadow-2xl">
      <div class="w-14 h-14 mx-auto rounded-2xl bg-black/30 border border-[#a7f3d0]/40 flex items-center justify-center text-2xl">
        🎉
      </div>
      <h3 class="text-xl font-bold text-white">¡Sesión de Mazo Completada!</h3>
      <p class="text-xs text-slate-200/85 leading-relaxed">
        Repasaste <strong class="text-[#a7f3d0]">{sessionCompletedCount}</strong> tarjetas en esta sesión. Todos los intervalos SM-2 se guardaron en la base local y están listos para sincronizar con Last-Write-Wins.
      </p>
      <div class="flex gap-3 pt-2">
        <button
          type="button"
          onclick={restartDeckSession}
          class="flex-1 touch-target rounded-full bg-[#171717] border border-white/10 text-slate-200 text-xs font-bold active-press"
        >
          Repasar de nuevo
        </button>
        <button
          type="button"
          onclick={onExitStudy}
          class="flex-1 touch-target rounded-full bg-[#a7f3d0] text-slate-950 text-xs font-extrabold active-press"
        >
          Volver a Mazos
        </button>
      </div>
    </div>
  {/if}
</div>

