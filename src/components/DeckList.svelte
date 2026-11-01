<script lang="ts">
  import type { DeckSummary } from '../lib/db/schema';
  import type { HeatmapDayCell } from '../lib/db/database';
  import StudyHeatmap from './StudyHeatmap.svelte';
  import { hapticImpactLight } from '../lib/haptics.js';

  interface Props {
    decks: DeckSummary[];
    heatmapCells: HeatmapDayCell[];
    totalReviews: number;
    currentStreak: number;
    todayCount: number;
    onSelectDeck: (deck: DeckSummary) => void;
    onOpenSearch: () => void;
  }

  let {
    decks = [],
    heatmapCells = [],
    totalReviews = 0,
    currentStreak = 0,
    todayCount = 0,
    onSelectDeck,
    onOpenSearch
  }: Props = $props();

  function getDeckCardStyle(variant: DeckSummary['accentVariant'], index: number): string {
    // Diseño asimétrico/escalonado (staggered) con tonos grises y verdes mate
    const staggerOffset = index % 2 === 1 ? 'mt-5' : 'mt-0';
    switch (variant) {
      case 'mint':
        return `${staggerOffset} bg-gradient-to-br from-[#2b3a33] via-[#1f2a25] to-[#141c18] border-[#a7f3d0]/25`;
      case 'olive':
        return `${staggerOffset} bg-gradient-to-br from-[#35423b] via-[#26302b] to-[#171e1b] border-white/10`;
      case 'emerald':
        return `${staggerOffset} bg-gradient-to-br from-[#23312d] via-[#1a2422] to-[#121817] border-[#a7f3d0]/15`;
      default:
        return `${staggerOffset} bg-gradient-to-br from-[#1e2631] via-[#171d26] to-[#10151c] border-white/10`;
    }
  }

  async function handleSelect(deck: DeckSummary) {
    await hapticImpactLight();
    onSelectDeck(deck);
  }
</script>

<div class="space-y-5">
  <!-- Banner Superior de Resumen SRS & Acceso Rápido al Buscador WanaKana -->
  <section class="rounded-3xl bg-gradient-to-br from-[#1c2623] via-[#151d1b] to-[#0f1419] border border-white/10 p-5 relative overflow-hidden">
    <div class="flex items-start justify-between gap-3">
      <div>
        <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#a7f3d0]/10 border border-[#a7f3d0]/30 text-[#a7f3d0] text-[10px] font-bold tracking-wider uppercase">
          覚える • Repetición Espaciada
        </span>
        <h2 class="text-xl font-bold text-white tracking-tight mt-2">
          Tus Mazos de Estudio
        </h2>
        <p class="text-xs text-slate-400 mt-1 leading-relaxed">
          Seleccioná un mazo para iniciar tu sesión SRS offline-first o explorá el diccionario con conversión Romaji → Kana.
        </p>
      </div>

      <button
        type="button"
        onclick={onOpenSearch}
        aria-label="Buscar vocabulario en japonés"
        class="touch-target shrink-0 px-3.5 py-2.5 rounded-2xl bg-[#171717] hover:bg-neutral-800 border border-white/10 text-[#a7f3d0] text-xs font-semibold active-press flex items-center gap-1.5"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <span>あ/A</span>
      </button>
    </div>
  </section>

  <!-- Lista de Mazos con Diseño Asimétrico / Escalonado (Staggered Layout) -->
  <section aria-label="Mazos de estudio">
    <div class="flex items-center justify-between mb-3 px-1">
      <h3 class="text-xs font-bold uppercase tracking-wider text-slate-300">
        Mazos Disponibles (Staggered Decks)
      </h3>
      <span class="text-[11px] text-[#a7f3d0] font-medium">
        Offline-First SQLite/IDB
      </span>
    </div>

    <div class="grid grid-cols-2 gap-3.5 items-start">
      {#each decks.slice(0, 4) as deck, idx (deck.id)}
        <button
          type="button"
          onclick={() => handleSelect(deck)}
          class="w-full text-left rounded-3xl p-4 border shadow-xl active-press transition-all flex flex-col justify-between {idx === 0 ? 'min-h-[188px]' : idx === 1 ? 'min-h-[172px]' : idx === 2 ? 'min-h-[168px]' : 'min-h-[184px]'} {getDeckCardStyle(deck.accentVariant, idx)}"
        >
          <div>
            <!-- Chip Superior -->
            <div class="flex items-center justify-between gap-2">
              <span class="px-2.5 py-0.5 rounded-full bg-black/35 border border-white/10 text-[10px] font-bold text-[#a7f3d0] tracking-wide">
                {deck.badge}
              </span>
              <span class="w-2 h-2 rounded-full bg-[#a7f3d0]/80"></span>
            </div>

            <!-- Título y Descripción -->
            <h4 class="text-base font-bold text-white mt-3 leading-snug">
              {deck.title}
            </h4>
            <p class="text-[11px] text-slate-300/80 mt-1 line-clamp-2 leading-relaxed">
              {deck.subtitle}
            </p>
          </div>

          <!-- Métricas Inferiores del Mazo -->
          <div class="mt-4 pt-3 border-t border-white/10 flex items-end justify-between">
            <div>
              <span class="text-[10px] uppercase tracking-wider text-slate-400 block">
                Para hoy
              </span>
              <span class="text-lg font-extrabold text-[#a7f3d0] leading-none">
                {deck.dueCards}
              </span>
              <span class="text-[10px] text-slate-400 ml-0.5">/ {deck.totalCards}</span>
            </div>

            <div class="w-8 h-8 rounded-xl bg-black/30 border border-white/10 flex items-center justify-center text-slate-200">
              <svg class="w-4 h-4 text-[#a7f3d0]" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </div>
        </button>
      {/each}
    </div>

    <!-- Tarjeta Asimétrica Ancha de Inmersión Total (5to mazo destacado) -->
    {#if decks[4]}
      {@const fullDeck = decks[4]}
      <button
        type="button"
        onclick={() => handleSelect(fullDeck)}
        class="mt-3.5 w-full text-left rounded-3xl p-4 bg-gradient-to-r from-[#283630] via-[#1c2622] to-[#141a22] border border-white/10 shadow-xl active-press flex items-center justify-between gap-4"
      >
        <div class="space-y-1">
          <div class="inline-flex items-center gap-2">
            <span class="px-2 py-0.5 rounded-full bg-[#a7f3d0]/15 text-[#a7f3d0] text-[10px] font-bold">
              {fullDeck.badge}
            </span>
            <span class="text-[11px] text-amber-300/90 font-medium">
              {fullDeck.newCards} nuevas • {fullDeck.masteredCards} aprendidas
            </span>
          </div>
          <h4 class="text-sm font-bold text-white">{fullDeck.title}</h4>
          <p class="text-[11px] text-slate-300/80">{fullDeck.subtitle}</p>
        </div>

        <div class="shrink-0 px-3.5 py-2 rounded-2xl bg-[#171717] border border-white/10 text-center">
          <span class="block text-sm font-extrabold text-[#a7f3d0]">{fullDeck.dueCards}</span>
          <span class="block text-[9px] uppercase tracking-wider text-slate-400">Tarjetas</span>
        </div>
      </button>
    {/if}
  </section>

  <!-- Mapa de Calor (Heatmap) estilo GitHub -->
  <StudyHeatmap
    cells={heatmapCells}
    {totalReviews}
    {currentStreak}
    {todayCount}
  />
</div>

