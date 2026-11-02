<script lang="ts">
  import type { ReviewRating, SrsReviewRecord, StudyCardItem } from "../lib/db/schema";
  import { getSrsButtonPreviews } from "../lib/srs/sm2";
  import {
    ensureRubyMarkup,
    safeSetRubyHTML,
    speakJapanese,
    splitExampleSentence,
    stripRubyTags,
    toRomajiText,
  } from "../lib/utils/japanese";
  import { isVerb, getVerbGroup } from "../lib/utils/conjugator";
  import VerbConjugationsModal from "./VerbConjugationsModal.svelte";
  import {
    hapticImpactLight,
    hapticImpactMedium,
    hapticSelection,
    hapticSuccess,
    hapticWarning,
  } from "../lib/haptics.js";
  import type { StudyMode } from "../lib/studyMode";

  interface Props {
    deckTitle: string;
    cards: StudyCardItem[];
    studyMode?: StudyMode;
    initialIndex?: number;
    initialCompletedCount?: number;
    onRateCard: (vocabularyId: string, rating: ReviewRating) => Promise<void>;
    onUndoCard?: (vocabularyId: string, previousReview: SrsReviewRecord | null) => Promise<void>;
    onSessionProgress?: (progress: { currentIndex: number; sessionCompletedCount: number; totalCards: number }) => void;
    onSessionFinished?: () => void;
    onExitStudy: () => void;
  }

  let {
    deckTitle = "Estudio SRS",
    cards = [],
    studyMode = "jp_to_es",
    initialIndex = 0,
    initialCompletedCount = 0,
    onRateCard,
    onUndoCard,
    onSessionProgress,
    onSessionFinished,
    onExitStudy,
  }: Props = $props();

  let currentIndex = $state(initialIndex);
  let isFlipped = $state(false);
  let showFurigana = $state(true);
  let isSpeaking = $state(false);
  let sessionCompletedCount = $state(initialCompletedCount);
  let isConjugationsModalOpen = $state(false);

  // Determinar la dirección de la tarjeta actual según el modo del mazo
  let cardDirection = $derived<'jp_to_es' | 'es_to_jp'>(() => {
    if (studyMode === 'es_to_jp') return 'es_to_jp';
    if (studyMode === 'jp_to_es') return 'jp_to_es';
    // Modo mixto: alterna balanceadamente 50/50 por índice
    return currentIndex % 2 === 1 ? 'es_to_jp' : 'jp_to_es';
  });

  interface ReviewHistoryItem {
    cardIndex: number;
    vocabularyId: string;
    previousReview: SrsReviewRecord | null;
  }
  let historyStack = $state<ReviewHistoryItem[]>([]);

  let frontWordContainer = $state<HTMLElement | null>(null);
  let backWordContainer = $state<HTMLElement | null>(null);
  let exampleJpContainer = $state<HTMLElement | null>(null);

  let currentCard = $derived<StudyCardItem | null>(cards[currentIndex] ?? null);

  let verbInfo = $derived(
    currentCard && isVerb(currentCard.part_of_speech, currentCard.kanji || currentCard.reading)
      ? getVerbGroup(currentCard.part_of_speech, currentCard.kanji || currentCard.reading, currentCard.reading)
      : null
  );

  let romajiReading = $derived(
    currentCard ? toRomajiText(currentCard.reading) : "",
  );

  let parsedExample = $derived(
    currentCard
      ? splitExampleSentence(currentCard.example_sentence)
      : { jpHtml: "", jpPlain: "", translation: "" },
  );

  let srsTimeLabels = $derived.by(() => {
    if (!currentCard) {
      return { 1: "10 min", 2: "1 day", 3: "3 days", 4: "4 days" } as Record<
        ReviewRating,
        string
      >;
    }
    return getSrsButtonPreviews({
      state: currentCard.review.state,
      easeFactor: Number(currentCard.review.ease_factor),
      intervalDays: Number(currentCard.review.interval_days),
      lapses: Number(currentCard.review.lapses),
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
    hapticImpactLight().catch(() => {});
    isSpeaking = true;
    try {
      const target =
        textToSpeak || currentCard.reading || stripRubyTags(currentCard.kanji);
      await speakJapanese(target);
    } catch (err) {
      console.warn('[Audio] Error al reproducir audio:', err);
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
    const prevReviewSnapshot = currentCard.review ? { ...currentCard.review } : null;

    // Registrar en el historial para permitir deshacer y recalificar la tarjeta anterior
    historyStack.push({
      cardIndex: currentIndex,
      vocabularyId: vocabId,
      previousReview: prevReviewSnapshot
    });

    sessionCompletedCount += 1;
    isFlipped = false;
    isConjugationsModalOpen = false;

    await onRateCard(vocabId, rating);

    if (currentIndex < cards.length - 1) {
      currentIndex += 1;
      if (onSessionProgress) {
        onSessionProgress({
          currentIndex,
          sessionCompletedCount,
          totalCards: cards.length
        });
      }
    } else {
      currentIndex = cards.length; // Fin de la cola actual
      if (onSessionFinished) {
        onSessionFinished();
      }
    }
  }

  async function handleUndoPreviousCard() {
    if (historyStack.length === 0) return;
    await hapticImpactMedium();

    const last = historyStack.pop();
    if (!last) return;

    if (onUndoCard) {
      await onUndoCard(last.vocabularyId, last.previousReview);
    }

    currentIndex = last.cardIndex;
    isFlipped = true; // Voltear para que el usuario vea la respuesta y pueda recalificar
    sessionCompletedCount = Math.max(0, sessionCompletedCount - 1);

    if (onSessionProgress) {
      onSessionProgress({
        currentIndex,
        sessionCompletedCount,
        totalCards: cards.length
      });
    }
  }

  async function handleFinishSessionEarly() {
    await hapticImpactMedium();
    if (onSessionFinished) {
      onSessionFinished();
    }
    onExitStudy();
  }

  function restartDeckSession() {
    currentIndex = 0;
    sessionCompletedCount = 0;
    historyStack = [];
    isFlipped = false;
    if (onSessionProgress) {
      onSessionProgress({
        currentIndex: 0,
        sessionCompletedCount: 0,
        totalCards: cards.length
      });
    }
  }
</script>

<div class="flex flex-col space-y-2.5">
  <!-- Barra Superior de Control de Estudio: Volver, Progreso, Furigana Toggle y Audio TTS -->
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-1.5 min-w-0">
      <button
        type="button"
        onclick={onExitStudy}
        class="touch-target px-3 py-2 rounded-2xl bg-[#171717] text-white hover:bg-[#1f2428] text-xs font-semibold active-press flex items-center gap-1.5"
      >
        <svg
          class="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
        <span class="truncate max-w-[130px]">{deckTitle}</span>
      </button>
    </div>

    <!-- Controles: Toggle Furigana (<ruby>) & Audio TTS -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={toggleFurigana}
        aria-pressed={showFurigana}
        class="touch-target px-3 py-2 rounded-2xl text-xs font-bold active-press transition-colors flex items-center gap-1.5 {showFurigana
          ? 'bg-white text-slate-950'
          : 'bg-[#171717] text-white/70'}"
      >
        <span class="text-xs font-semibold">Furigana</span>
        <span class="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md {showFurigana ? 'bg-slate-950/10 text-slate-900' : 'bg-white/10 text-white/80'}">
          {showFurigana ? "ON" : "OFF"}
        </span>
      </button>

      {#if currentCard}
        <button
          type="button"
          onclick={(e) => {
            if (cardDirection === 'es_to_jp' && !isFlipped) {
              hapticWarning();
              return;
            }
            handlePlayAudio(e);
          }}
          aria-label={cardDirection === 'es_to_jp' && !isFlipped ? 'Volteá la tarjeta para escuchar la pronunciación' : 'Escuchar pronunciación en japonés'}
          title={cardDirection === 'es_to_jp' && !isFlipped ? 'Volteá la tarjeta para escuchar' : 'Escuchar pronunciación'}
          class="touch-target w-11 h-11 rounded-2xl bg-[#171717] text-white active-press flex items-center justify-center transition-colors {cardDirection === 'es_to_jp' && !isFlipped ? 'opacity-35' : ''} {isSpeaking
            ? 'bg-[#a7f3d0]/25 text-[#a7f3d0]'
            : ''}"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
            />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  {#if currentCard}
    <!-- Barra de progreso sutil -->
    <div
      class="flex items-center justify-between text-[11px] text-white/60 px-1"
    >
      <span
        >Tarjeta <strong class="text-white">{currentIndex + 1}</strong> de {cards.length}</span
      >
      <span class="text-white/80 font-semibold uppercase tracking-wider">
        JLPT N{currentCard.jlpt_level} • {verbInfo ? verbInfo.label : currentCard.part_of_speech}
      </span>
    </div>

    <!-- ====================================================================== -->
    <!-- TARJETA FLASHCARD CON GRADIENTE VERDE OLIVA MATE COMPACTA              -->
    <!-- ====================================================================== -->
    <div
      role="button"
      tabindex="0"
      onclick={handleCardFlip}
      onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardFlip();
        }
      }}
      aria-label="Tocar el centro de la tarjeta para voltear"
      class="min-h-[320px] max-h-[460px] rounded-[28px] bg-gradient-to-br from-[#43534a] via-[#2f3b35] to-[#1a231f] shadow-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-y-auto cursor-pointer active-press {showFurigana
        ? ''
        : 'furigana-hidden'}"
    >
      <!-- Cabecera interna de la tarjeta -->
      <div class="flex items-center justify-between text-xs">
        <div class="flex items-center gap-1.5">
          <span
            class="px-2.5 py-0.5 rounded-full bg-black/25 text-white font-semibold tracking-wide"
          >
            {#if cardDirection === 'es_to_jp'}
              {isFlipped ? "裏 • Respuesta (Japonés)" : "表 • Pregunta (Español)"}
            {:else}
              {isFlipped ? "裏 • Respuesta (Español)" : "表 • Pregunta (Japonés)"}
            {/if}
          </span>
          {#if studyMode === 'mixed'}
            <span class="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/80 font-bold">
              {cardDirection === 'es_to_jp' ? 'ES → JP' : 'JP → ES'}
            </span>
          {/if}
        </div>

        <span class="text-[11px] text-white/75 font-medium">
          {currentCard.review.state === "new"
            ? "Palabra nueva"
            : currentCard.review.state === "learning"
              ? "En aprendizaje"
              : "En repaso"}
        </span>
      </div>

      {#if !isFlipped}
        {#if cardDirection === 'es_to_jp'}
          <!-- FRENTE: Modo Español -> Japonés (Producción / Memoria Activa) -->
          <div
            class="my-auto py-4 flex flex-col items-center justify-center text-center space-y-2.5"
          >
            <span
              class="text-[10px] uppercase tracking-widest text-[#a7f3d0] font-extrabold bg-[#a7f3d0]/15 px-3 py-1 rounded-full border border-[#a7f3d0]/30"
            >
              ¿Cómo se dice en japonés?
            </span>
            <p
              class="text-2xl sm:text-3xl font-extrabold text-white tracking-wide leading-snug line-clamp-3 select-text px-2"
            >
              {currentCard.meaning_es}
            </p>
            {#if currentCard.meaning_en}
              <p class="text-xs text-white/60 italic line-clamp-1">
                EN: {currentCard.meaning_en}
              </p>
            {/if}
          </div>

          <!-- Pie del Frente: Instrucción táctil -->
          <div class="text-center pt-2 border-t border-white/10">
            <p
              class="text-[11px] text-white/75 font-medium flex items-center justify-center gap-1.5"
            >
              <span>Tocá la tarjeta para revelar la palabra en japonés</span>
            </p>
          </div>
        {:else}
          <!-- FRENTE: Modo Japonés -> Español (Reconocimiento / Lectura) -->
          <div
            class="my-auto py-4 flex flex-col items-center justify-center text-center"
          >
            <div
              bind:this={frontWordContainer}
              class="text-4xl sm:text-5xl font-bold text-white tracking-wide leading-relaxed select-text"
            >
              {stripRubyTags(currentCard.kanji || currentCard.reading)}
            </div>

            {#if !currentCard.kanji}
              <span
                class="mt-2 text-[11px] uppercase tracking-widest text-white/70 font-semibold"
              >
                Palabra en Kana
              </span>
            {/if}
          </div>

          <!-- Pie del Frente: Instrucción táctil -->
          <div class="text-center pt-2 border-t border-white/10">
            <p
              class="text-[11px] text-white/75 font-medium flex items-center justify-center gap-1.5"
            >
              <span>Tocá la tarjeta para revelar significado y ejemplo</span>
            </p>
          </div>
        {/if}
      {:else}
        <!-- REVERSO: Traducción, Romaji y Oración de Ejemplo (Tatoeba) -->
        <div class="my-auto py-1.5 space-y-2.5">
          <!-- Palabra + Lectura Kana + Romaji -->
          <div class="text-center pb-2 border-b border-white/10">
            <div
              bind:this={backWordContainer}
              class="text-2xl font-bold text-white tracking-wide leading-snug"
            >
              {stripRubyTags(currentCard.kanji || currentCard.reading)}
            </div>
            <div class="mt-1 flex items-center justify-center gap-2 text-xs">
              <span class="text-white font-semibold"
                >{currentCard.reading}</span
              >
              <span class="text-white/30">•</span>
              <span
                class="font-mono text-white/80 text-[11px] uppercase tracking-wider"
              >
                {romajiReading}
              </span>
            </div>
          </div>

          <!-- Significados (Español + Inglés) -->
          <div class="space-y-0.5 text-center">
            <p class="text-lg font-bold text-white leading-snug line-clamp-2">
              {currentCard.meaning_es}
            </p>
            <p class="text-[11px] text-white/70 italic line-clamp-1">
              EN: {currentCard.meaning_en}
            </p>
          </div>

          <!-- Si es un verbo, botón para desplegar tabla completa de conjugaciones -->
          {#if verbInfo}
            <div class="flex justify-center pt-0.5">
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  isConjugationsModalOpen = true;
                }}
                class="touch-target px-3.5 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 active-press border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <span>📖</span>
                <span>{verbInfo.label} • Ver conjugaciones</span>
              </button>
            </div>
          {/if}

          <!-- Oración de Ejemplo con botón de audio propio -->
          {#if currentCard.example_sentence}
            <div
              class="p-2.5 rounded-2xl bg-black/25 space-y-1"
            >
              <div class="flex items-center justify-between gap-2">
                <span
                  class="text-[10px] font-bold uppercase tracking-wider text-white/70"
                >
                  Ejemplo
                </span>
                <button
                  type="button"
                  onclick={(e) => handlePlayAudio(e, parsedExample.jpPlain)}
                  class="px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 active-press text-[11px] font-semibold text-white flex items-center gap-1.5 shadow-sm"
                >
                  <span>🔊</span>
                  <span>Escuchar</span>
                </button>
              </div>

              <div
                bind:this={exampleJpContainer}
                class="text-sm font-medium text-white leading-snug"
              >
                {parsedExample.jpPlain}
              </div>

              {#if parsedExample.translation}
                <p class="text-[11px] text-white/80 leading-snug line-clamp-2">
                  {parsedExample.translation}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ====================================================================== -->
    <!-- BOTONES SRS INFERIORES: Pregunta orientadora y botones de calificación -->
    <!-- ====================================================================== -->
    <div class="pt-1 space-y-1.5">
      {#if isFlipped}
        <p class="text-center text-xs font-medium text-white/80 animate-fade-in">
          ¿Qué tan bien recordaste esta palabra?
        </p>

        <div class="grid grid-cols-4 gap-2 animate-fade-in">
          <!-- 1: Again -->
          <button
            type="button"
            onclick={() => handleRate(1)}
            class="touch-target py-2 px-2 rounded-2xl bg-[#171c20] hover:bg-[#1f262b] active-press flex flex-col items-center justify-center shadow-md"
          >
            <span class="text-[10px] font-bold text-white/60 leading-none">
              {srsTimeLabels[1]}
            </span>
            <span class="text-xs font-bold text-white mt-1 leading-none">
              Otra vez
            </span>
          </button>

          <!-- 2: Hard -->
          <button
            type="button"
            onclick={() => handleRate(2)}
            class="touch-target py-2 px-2 rounded-2xl bg-[#171c20] hover:bg-[#1f262b] active-press flex flex-col items-center justify-center shadow-md"
          >
            <span class="text-[10px] font-bold text-white/60 leading-none">
              {srsTimeLabels[2]}
            </span>
            <span class="text-xs font-bold text-white mt-1 leading-none">
              Difícil
            </span>
          </button>

          <!-- 3: Good -->
          <button
            type="button"
            onclick={() => handleRate(3)}
            class="touch-target py-2 px-2 rounded-2xl bg-[#3e534a] hover:bg-[#496157] active-press flex flex-col items-center justify-center shadow-md"
          >
            <span class="text-[10px] font-bold text-white/75 leading-none">
              {srsTimeLabels[3]}
            </span>
            <span class="text-xs font-bold text-white mt-1 leading-none">
              Bien
            </span>
          </button>

          <!-- 4: Easy -->
          <button
            type="button"
            onclick={() => handleRate(4)}
            class="touch-target py-2 px-2 rounded-2xl bg-[#283924] hover:bg-[#31462c] active-press flex flex-col items-center justify-center shadow-md"
          >
            <span class="text-[10px] font-bold text-white/75 leading-none">
              {srsTimeLabels[4]}
            </span>
            <span class="text-xs font-bold text-white mt-1 leading-none">
              Fácil
            </span>
          </button>
        </div>
      {:else}
        <!-- Botón para mostrar la respuesta y revelar las opciones SRS -->
        <button
          type="button"
          onclick={handleCardFlip}
          class="w-full touch-target py-3 px-4 rounded-2xl bg-[#2f3b35] hover:bg-[#3e534a] active-press text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all border border-white/10"
        >
          <span>Mostrar respuesta</span>
          <svg class="w-4 h-4 text-[#a7f3d0]" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      {/if}

      <!-- Fila de Acciones Secundarias: Tarjeta anterior y Finalizar sesión -->
      <div class="flex items-center gap-2 pt-1.5">
        <button
          type="button"
          onclick={handleUndoPreviousCard}
          disabled={historyStack.length === 0}
          title="Volver a calificar la tarjeta anterior"
          class="flex-1 touch-target py-2.5 px-3 rounded-2xl bg-[#171c20] hover:bg-[#1f262b] active-press text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5 disabled:opacity-30 disabled:pointer-events-none text-white/80 hover:text-white"
        >
          <svg class="w-4 h-4 text-white/70" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
          <span>Tarjeta anterior</span>
        </button>

        <button
          type="button"
          onclick={handleFinishSessionEarly}
          title="Terminar la sesión de estudio actual y guardar progreso"
          class="flex-1 touch-target py-2.5 px-3 rounded-2xl bg-[#171c20] hover:bg-rose-500/20 active-press text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-white/5 text-rose-300 hover:text-rose-200"
        >
          <svg class="w-4 h-4 text-rose-300" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span>Finalizar sesión</span>
        </button>
      </div>
    </div>
  {:else}
    <!-- Estado de Sesión Completada -->
    <div
      class="my-auto rounded-[32px] bg-gradient-to-br from-[#43534a] via-[#2f3b35] to-[#1a231f] border border-white/10 p-7 text-center space-y-4 shadow-2xl"
    >
      <div
        class="w-14 h-14 mx-auto rounded-2xl bg-black/30 border border-[#a7f3d0]/40 flex items-center justify-center text-2xl"
      >
        🎉
      </div>
      <h3 class="text-xl font-bold text-white">¡Práctica completada!</h3>
      <p class="text-xs text-slate-200/85 leading-relaxed">
        Repasaste <strong class="text-[#a7f3d0]">{sessionCompletedCount}</strong
        > tarjetas en esta sesión. Tu progreso ya quedó guardado.
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

  <!-- Modal Bottom Sheet con la tabla completa de conjugaciones y audios -->
  {#if currentCard && verbInfo}
    <VerbConjugationsModal
      isOpen={isConjugationsModalOpen}
      word={currentCard}
      onClose={() => (isConjugationsModalOpen = false)}
    />
  {/if}
</div>
