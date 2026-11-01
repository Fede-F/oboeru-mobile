<script lang="ts">
  import type { ReviewRating, StudyCardItem } from "../lib/db/schema";
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
  } from "../lib/haptics.js";

  interface Props {
    deckTitle: string;
    cards: StudyCardItem[];
    onRateCard: (vocabularyId: string, rating: ReviewRating) => Promise<void>;
    onExitStudy: () => void;
  }

  let {
    deckTitle = "Estudio SRS",
    cards = [],
    onRateCard,
    onExitStudy,
  }: Props = $props();

  let currentIndex = $state(0);
  let isFlipped = $state(false);
  let showFurigana = $state(true);
  let isSpeaking = $state(false);
  let sessionCompletedCount = $state(0);
  let isConjugationsModalOpen = $state(false);

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
    await hapticImpactLight();
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
    sessionCompletedCount += 1;
    isFlipped = false;
    isConjugationsModalOpen = false;

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

<div class="flex flex-col space-y-2.5">
  <!-- Barra Superior de Control de Estudio: Volver, Progreso, Furigana Toggle y Audio TTS -->
  <div class="flex items-center justify-between gap-2">
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
          onclick={(e) => handlePlayAudio(e)}
          aria-label="Escuchar pronunciación en japonés"
          class="touch-target w-11 h-11 rounded-2xl bg-[#171717] text-white active-press flex items-center justify-center transition-colors {isSpeaking
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
      class="min-h-[235px] max-h-[310px] rounded-[28px] bg-gradient-to-br from-[#43534a] via-[#2f3b35] to-[#1a231f] shadow-2xl p-4 sm:p-5 flex flex-col justify-between relative overflow-y-auto cursor-pointer active-press {showFurigana
        ? ''
        : 'furigana-hidden'}"
    >
      <!-- Cabecera interna de la tarjeta -->
      <div class="flex items-center justify-between text-xs">
        <span
          class="px-2.5 py-0.5 rounded-full bg-black/25 text-white font-semibold tracking-wide"
        >
          {isFlipped ? "裏 • Respuesta" : "表 • Pregunta"}
        </span>

        <span class="text-[11px] text-white/75 font-medium">
          {currentCard.review.state === "new"
            ? "Palabra nueva"
            : currentCard.review.state === "learning"
              ? "En aprendizaje"
              : "En repaso"}
        </span>
      </div>

      {#if !isFlipped}
        <!-- FRENTE: Palabra en Japonés (Kanji o Kana) centrada -->
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
      {/if}

      <div class="grid grid-cols-4 gap-2">
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
