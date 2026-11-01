<script lang="ts">
  import { conjugateVerb, type VerbConjugationResult } from '../lib/utils/conjugator';
  import { speakJapanese } from '../lib/utils/japanese';
  import { hapticImpactLight, hapticSelection } from '../lib/haptics.js';

  interface Props {
    isOpen: boolean;
    word: {
      kanji: string | null;
      reading: string;
      meaning_es: string;
      meaning_en?: string;
      part_of_speech: string;
    } | null;
    onClose: () => void;
  }

  let { isOpen, word, onClose }: Props = $props();

  let playingAudioId = $state<string | null>(null);

  let conjugationData = $derived<VerbConjugationResult | null>(
    word ? conjugateVerb(word) : null
  );

  async function handleClose() {
    await hapticImpactLight();
    onClose();
  }

  async function handlePlay(item: { id: string; reading: string; kanji: string }) {
    hapticImpactLight().catch(() => {});
    playingAudioId = item.id;
    try {
      await speakJapanese(item.reading || item.kanji);
    } finally {
      playingAudioId = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      handleClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && word && conjugationData}
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
    role="presentation"
    onclick={handleClose}
  >
    <!-- Contenedor Bottom Sheet en móviles / Modal centrado en pantallas grandes -->
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conjugation-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
      class="bg-[#121820] w-full max-w-lg max-h-[88vh] rounded-t-[32px] sm:rounded-[32px] border border-emerald-500/30 shadow-2xl flex flex-col overflow-hidden pb-safe"
    >
      <!-- Cabecera del modal -->
      <div class="p-5 border-b border-white/10 bg-[#162025]/80 backdrop-blur-md shrink-0">
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <!-- Badges de Grupo -->
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold">
                {conjugationData.group.label}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-black/40 text-slate-300 text-[10px] font-semibold border border-white/10">
                {conjugationData.group.badge}
              </span>
            </div>

            <!-- Título del Verbo en Infinitivo -->
            <h2 id="conjugation-title" class="text-2xl font-bold text-white flex items-baseline gap-2 mt-1 truncate">
              <span>{conjugationData.dictionaryKanji}</span>
              {#if conjugationData.dictionaryKanji !== conjugationData.dictionaryReading}
                <span class="text-sm font-semibold text-emerald-400">
                  【{conjugationData.dictionaryReading}】
                </span>
              {/if}
              <span class="text-xs font-mono text-amber-300/80 font-normal">
                {conjugationData.dictionaryRomaji}
              </span>
            </h2>

            <p class="text-xs font-medium text-slate-300 truncate">
              {word.meaning_es}
            </p>
          </div>

          <!-- Botón Cerrar Superior -->
          <button
            type="button"
            onclick={handleClose}
            aria-label="Cerrar tabla de conjugaciones"
            class="touch-target w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 active-press text-white flex items-center justify-center text-sm font-bold shrink-0"
          >
            ✕
          </button>
        </div>

        <!-- Explicación breve de la regla del grupo -->
        <p class="mt-2.5 text-[11px] text-slate-400 bg-black/30 rounded-xl px-3 py-1.5 border border-white/5">
          💡 <strong class="text-slate-200">{conjugationData.group.label}:</strong> {conjugationData.group.description}
        </p>
      </div>

      <!-- Lista deslizable de Conjugaciones -->
      <div class="p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-white/5">
        {#each conjugationData.conjugations as item (item.id)}
          <div class="pt-2.5 first:pt-0 flex items-center justify-between gap-3 group">
            <div class="space-y-0.5 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[11px] font-bold text-slate-300">
                  {item.name}
                </span>
                <span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-emerald-300 font-bold">
                  {item.badge}
                </span>
              </div>

              <!-- Palabra Conjugada -->
              <div class="flex items-baseline gap-2">
                <span class="text-lg font-bold text-white tracking-wide">
                  {item.kanji}
                </span>
                {#if item.kanji !== item.reading}
                  <span class="text-xs font-semibold text-emerald-400/90">
                    {item.reading}
                  </span>
                {/if}
                <span class="text-[11px] font-mono text-slate-400">
                  {item.romaji}
                </span>
              </div>

              <p class="text-[10px] text-slate-400 leading-tight">
                {item.explanation}
              </p>
            </div>

            <!-- Botón de Audio Individual -->
            <button
              type="button"
              onclick={() => handlePlay(item)}
              aria-label={`Escuchar ${item.name}`}
              class="touch-target w-11 h-11 rounded-2xl bg-white/5 hover:bg-white/15 active-press border border-white/10 text-emerald-300 flex items-center justify-center shrink-0 transition-colors shadow-sm {playingAudioId === item.id ? 'ring-2 ring-emerald-400 scale-95' : ''}"
            >
              {#if playingAudioId === item.id}
                <span class="text-xs animate-pulse">🔊</span>
              {:else}
                <span class="text-sm">🔊</span>
              {/if}
            </button>
          </div>
        {/each}
      </div>

      <!-- Pie del modal con botón de cierre grande -->
      <div class="p-4 border-t border-white/10 bg-[#162025]/80 shrink-0">
        <button
          type="button"
          onclick={handleClose}
          class="touch-target w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm text-center shadow-lg active-press transition-colors"
        >
          Entendido • Cerrar
        </button>
      </div>
    </div>
  </div>
{/if}

