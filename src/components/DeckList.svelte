<script lang="ts">
  import type { DeckSummary } from '../lib/db/schema';
  import type { HeatmapDayCell } from '../lib/db/database';
  import { deleteCustomUserDeck } from '../lib/db/database';
  import StudyHeatmap from './StudyHeatmap.svelte';
  import {
    hapticImpactLight,
    hapticImpactMedium,
    hapticSelection,
    hapticSuccess,
    hapticWarning
  } from '../lib/haptics.js';

  interface Props {
    decks: DeckSummary[];
    heatmapCells: HeatmapDayCell[];
    totalReviews: number;
    currentStreak: number;
    todayCount: number;
    onSelectDeck: (deck: DeckSummary) => void;
    onOpenSearch: () => void;
    onOpenCreateDeck: () => void;
    onDeckDeleted?: () => void | Promise<void>;
  }

  let {
    decks = [],
    heatmapCells = [],
    totalReviews = 0,
    currentStreak = 0,
    todayCount = 0,
    onSelectDeck,
    onOpenSearch,
    onOpenCreateDeck,
    onDeckDeleted
  }: Props = $props();

  type SortCriterion = 'created' | 'name' | 'due' | 'size';
  type OwnershipFilter = 'all' | 'mine';

  let sortBy = $state<SortCriterion>('created');
  let sortDirection = $state<'asc' | 'desc'>('desc');
  let ownershipFilter = $state<OwnershipFilter>('all');

  // Estado para modal de confirmación de eliminación o aviso de sistema
  let deckToDelete = $state<DeckSummary | null>(null);
  let showDeleteModal = $state(false);
  let showSystemDeckModal = $state(false);
  let isDeleting = $state(false);

  // Variables para la detección del gesto mantener apretado (long-press)
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressFired = false;
  let startX = 0;
  let startY = 0;

  function handlePointerDown(e: PointerEvent, deck: DeckSummary) {
    longPressFired = false;
    startX = e.clientX;
    startY = e.clientY;

    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(async () => {
      longPressFired = true;
      if (deck.isCustom) {
        await hapticImpactMedium();
        deckToDelete = deck;
        showDeleteModal = true;
      } else {
        await hapticWarning();
        deckToDelete = deck;
        showSystemDeckModal = true;
      }
    }, 550);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!longPressTimer) return;
    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);
    // Si el usuario movió el dedo más de 10px, se considera scroll y se cancela el long-press
    if (deltaX > 10 || deltaY > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handlePointerUpOrLeave() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  async function handleCardClick(deck: DeckSummary) {
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    await handleSelect(deck);
  }

  async function confirmDelete() {
    if (!deckToDelete || !deckToDelete.isCustom) return;
    isDeleting = true;
    try {
      await deleteCustomUserDeck(deckToDelete.id);
      await hapticSuccess();
      showDeleteModal = false;
      deckToDelete = null;
      if (onDeckDeleted) {
        await onDeckDeleted();
      }
    } catch (err) {
      console.error('Error al eliminar mazo:', err);
    } finally {
      isDeleting = false;
    }
  }

  function cancelDelete() {
    showDeleteModal = false;
    showSystemDeckModal = false;
    deckToDelete = null;
  }

  const sortOptions: Array<{ id: SortCriterion; label: string }> = [
    { id: 'created', label: 'Fecha' },
    { id: 'name', label: 'Nombre' },
    { id: 'due', label: 'Para hoy' },
    { id: 'size', label: 'Cantidad' }
  ];

  let customDeckCount = $derived(decks.filter((d) => d.isCustom).length);

  let sortedDecks = $derived.by(() => {
    const filtered =
      ownershipFilter === 'mine' ? decks.filter((d) => Boolean(d.isCustom)) : [...decks];
    const dir = sortDirection === 'asc' ? 1 : -1;

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) * dir;
        case 'due':
          return (a.dueCards - b.dueCards) * dir;
        case 'size':
          return (a.totalCards - b.totalCards) * dir;
        case 'created':
        default: {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return (tA - tB) * dir;
        }
      }
    });

    return filtered;
  });

  function formatDeckCreatedDate(isoDate?: string): string {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function getDeckCardStyle(variant: DeckSummary['accentVariant']): string {
    switch (variant) {
      case 'mint':
        // Salvia grisáceo mate (como la card "Noun" de la referencia)
        return 'bg-[#3e534a]';
      case 'olive':
        // Oliva bosque profundo mate (como la card "Adjective" de la referencia)
        return 'bg-[#283924]';
      case 'emerald':
        // Carbón verdoso oscuro mate
        return 'bg-[#1f2926]';
      default:
        // Carbón pizarra oscuro mate (como las cards "Verbs one / Verbs two" de la referencia)
        return 'bg-[#171c20]';
    }
  }

  function getDeckProgressBarColor(variant: DeckSummary['accentVariant']): string {
    switch (variant) {
      case 'mint':
        return 'bg-[#a7f3d0]';
      case 'olive':
        return 'bg-[#86efac]';
      case 'emerald':
        return 'bg-[#5eead4]';
      default:
        return 'bg-[#94a3b8]';
    }
  }

  function getDeckProgressPercent(deck: DeckSummary): number {
    if (!deck.totalCards || deck.totalCards === 0) return 0;
    // Porcentaje de progreso: tarjetas dominadas respecto al total (mínimo 0%, máx 100%)
    const pct = Math.round(((deck.masteredCards || 0) / deck.totalCards) * 100);
    return Math.min(100, Math.max(0, pct));
  }

  async function handleSortChange(criterion: SortCriterion) {
    await hapticSelection();
    if (sortBy === criterion) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = criterion;
      // Por defecto: Nombre ascendente (A->Z), y el resto descendente (más reciente / más urgentes primero)
      sortDirection = criterion === 'name' ? 'asc' : 'desc';
    }
  }

  async function handleOwnershipFilter(filter: OwnershipFilter) {
    if (ownershipFilter === filter) return;
    await hapticSelection();
    ownershipFilter = filter;
  }

  async function handleSelect(deck: DeckSummary) {
    await hapticImpactLight();
    onSelectDeck(deck);
  }

  async function handleCreateNew() {
    await hapticImpactLight();
    onOpenCreateDeck();
  }
</script>

<div class="space-y-5">
  <!-- Banner Superior de Resumen y Acción Rápida para Crear Mazo -->
  <section class="rounded-[26px] bg-[#161b20] p-5 relative overflow-hidden">
    <div class="flex items-start justify-between gap-3">
      <div>
        <span class="inline-flex items-center gap-1.5 text-white/60 text-[10px] font-bold tracking-wider uppercase">
          覚える • Práctica Diaria
        </span>
        <h2 class="text-2xl font-extrabold text-white tracking-tight mt-1">
          Tus Mazos de Estudio
        </h2>
        <p class="text-xs text-white/60 mt-1 leading-relaxed">
          Elegí un mazo para empezar tu práctica de hoy o creá uno nuevo con tus propias palabras.
        </p>
      </div>

      <button
        type="button"
        onclick={handleCreateNew}
        aria-label="Crear nuevo mazo de estudio"
        class="touch-target shrink-0 px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold active-press flex items-center gap-1.5"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span>Crear mazo</span>
      </button>
    </div>
  </section>

  <!-- Lista de Mazos Alineados en Grilla de 2 Columnas con Ordenamiento y Scroll -->
  <section aria-label="Mazos de estudio" class="space-y-3">
    <div class="flex flex-col gap-2.5 px-1">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-white/80">
            Mazos Disponibles ({sortedDecks.length})
          </h3>
          <span class="text-[10px] text-white/50">
            Mantené presionado para eliminar mazo
          </span>
        </div>

        <!-- Filtro de Autoría: Todos vs Míos -->
        <div
          role="group"
          aria-label="Filtrar mazos por autor"
          class="inline-flex items-center p-0.5 rounded-full bg-[#161b20] shrink-0"
        >
          <button
            type="button"
            onclick={() => handleOwnershipFilter('all')}
            aria-pressed={ownershipFilter === 'all'}
            class="px-3 py-1 rounded-full text-[11px] font-bold transition-all active-press {ownershipFilter === 'all'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-white/60 hover:text-white'}"
          >
            Todos ({decks.length})
          </button>
          <button
            type="button"
            onclick={() => handleOwnershipFilter('mine')}
            aria-pressed={ownershipFilter === 'mine'}
            class="px-3 py-1 rounded-full text-[11px] font-bold transition-all active-press {ownershipFilter === 'mine'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-white/60 hover:text-white'}"
          >
            Míos ({customDeckCount})
          </button>
        </div>
      </div>

      <!-- Barra de Ordenamiento: Fecha, Nombre, Para hoy (urgencia) y Cantidad -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5">
        {#each sortOptions as opt (opt.id)}
          {@const active = sortBy === opt.id}
          <button
            type="button"
            onclick={() => handleSortChange(opt.id)}
            class="px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors active-press flex items-center gap-1 shrink-0 {active
              ? 'bg-white text-slate-950'
              : 'bg-[#161b20] text-white/70 hover:text-white'}"
          >
            <span>{opt.label}</span>
            {#if active}
              <span class="text-[10px] font-extrabold">
                {sortDirection === 'asc' ? '↑' : '↓'}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="max-h-[416px] overflow-y-auto pr-1 grid grid-cols-2 gap-3.5 items-stretch">
      {#each sortedDecks as deck (deck.id)}
        <button
          type="button"
          onpointerdown={(e) => handlePointerDown(e, deck)}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUpOrLeave}
          onpointerleave={handlePointerUpOrLeave}
          oncontextmenu={(e) => e.preventDefault()}
          onclick={() => handleCardClick(deck)}
          class="w-full h-[196px] text-left rounded-[26px] p-4 shadow-lg active-press transition-all flex flex-col justify-between select-none {getDeckCardStyle(deck.accentVariant)}"
        >
          <!-- Cabecera: Nombre del mazo + Fecha chiquita (sin 3 puntos) -->
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h4 class="text-sm font-bold text-white leading-tight line-clamp-1">
                {deck.title}
              </h4>
              {#if deck.createdAt}
                <span class="block text-[10px] text-white/60 mt-0.5 font-medium">
                  {formatDeckCreatedDate(deck.createdAt)}
                </span>
              {/if}
            </div>
          </div>

          <!-- Cuerpo Central: Total de Palabras y Para Hoy + Barra de Progreso Sutil -->
          <div class="my-auto space-y-3">
            <div class="flex items-end justify-between">
              <div>
                <span class="text-2xl font-extrabold text-white leading-none block">
                  {deck.totalCards}
                </span>
                <span class="text-[10px] text-white/60 font-medium block mt-0.5">
                  Palabras
                </span>
              </div>

              <div class="text-right">
                <span class="text-lg font-extrabold text-white leading-none block">
                  {deck.dueCards}
                </span>
                <span class="text-[10px] text-white/60 font-medium block mt-0.5">
                  Para hoy
                </span>
              </div>
            </div>

            <!-- Barra de Progreso Sutil integrada con el color del mazo -->
            <div class="space-y-1">
              <div class="w-full h-1.5 rounded-full bg-black/25 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500 {getDeckProgressBarColor(deck.accentVariant)}"
                  style="width: {getDeckProgressPercent(deck)}%"
                ></div>
              </div>
              <div class="flex items-center justify-between text-[9px] text-white/50 font-medium">
                <span>Progreso</span>
                <span>{getDeckProgressPercent(deck)}%</span>
              </div>
            </div>
          </div>

          <!-- Pie del Mazo: Etiqueta JP | ES y botón circular mate -->
          <div class="flex items-center justify-between pt-1">
            <span class="text-[10px] font-bold uppercase tracking-wider text-white/55 truncate">
              {deck.isCustom ? 'JP | MÍO' : 'JP | ES'}
            </span>

            <div class="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
          </div>
        </button>
      {/each}

      <!-- Último elemento del listado: Crear un nuevo mazo personalizado -->
      <button
        type="button"
        onclick={handleCreateNew}
        class="w-full h-[196px] text-left rounded-[26px] p-4 bg-[#171c20] hover:bg-[#1e252a] shadow-lg active-press transition-all flex flex-col justify-between group select-none"
      >
        <div class="flex items-start justify-between">
          <div>
            <h4 class="text-sm font-bold text-white leading-tight">
              Crear mazo
            </h4>
            <span class="block text-[10px] text-white/60 mt-0.5 font-medium">
              Personalizado
            </span>
          </div>
        </div>

        <div class="my-1">
          <span class="text-2xl font-extrabold text-white leading-none block">
            + Nuevo
          </span>
          <p class="text-[11px] text-white/60 mt-1 leading-snug">
            Elegí tus propias palabras del diccionario
          </p>
        </div>

        <div class="flex items-center justify-between pt-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-white/55">
            JP | MÍO
          </span>
          <div class="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-white">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
        </div>
      </button>
    </div>
  </section>

  <!-- Mapa de Calor (Heatmap) estilo GitHub -->
  <StudyHeatmap
    cells={heatmapCells}
    {totalReviews}
    {currentStreak}
    {todayCount}
  />

  <!-- Modal de Confirmación para Eliminar Mazo Personalizado -->
  {#if showDeleteModal && deckToDelete}
    <div
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-deck-title"
    >
      <div
        class="bg-[#181d22] border border-white/10 rounded-[30px] p-6 max-w-sm w-full shadow-2xl space-y-5 text-center"
      >
        <div class="w-14 h-14 mx-auto rounded-full bg-rose-500/15 text-rose-400 flex items-center justify-center">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </div>

        <div class="space-y-1.5">
          <h3 id="delete-deck-title" class="text-lg font-extrabold text-white">
            ¿Eliminar mazo?
          </h3>
          <p class="text-sm font-semibold text-rose-300 line-clamp-1">
            "{deckToDelete.title}"
          </p>
          <p class="text-xs text-white/60 leading-relaxed pt-1">
            Se eliminará este mazo personalizado. Las palabras que contiene seguirán en tu diccionario y no perderás tu historial de repasos.
          </p>
        </div>

        <div class="flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onclick={confirmDelete}
            disabled={isDeleting}
            class="touch-target w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-sm active-press flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 disabled:opacity-50"
          >
            {#if isDeleting}
              <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Eliminando...</span>
            {:else}
              <span>Eliminar mazo</span>
            {/if}
          </button>

          <button
            type="button"
            onclick={cancelDelete}
            disabled={isDeleting}
            class="touch-target w-full py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white font-bold text-sm active-press"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Modal Informativo para Mazos Predeterminados -->
  {#if showSystemDeckModal && deckToDelete}
    <div
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="bg-[#181d22] border border-white/10 rounded-[30px] p-6 max-w-sm w-full shadow-2xl space-y-5 text-center"
      >
        <div class="w-14 h-14 mx-auto rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        </div>

        <div class="space-y-1.5">
          <h3 class="text-lg font-extrabold text-white">
            Mazo Predeterminado
          </h3>
          <p class="text-sm font-semibold text-white/90">
            "{deckToDelete.title}"
          </p>
          <p class="text-xs text-white/60 leading-relaxed pt-1">
            Los mazos estándar del sistema (JLPT) son de solo lectura y no se pueden eliminar. Podés crear y gestionar todos los mazos propios que desees desde "Crear mazo".
          </p>
        </div>

        <button
          type="button"
          onclick={cancelDelete}
          class="touch-target w-full py-3 px-4 rounded-2xl bg-white text-slate-950 font-bold text-sm active-press"
        >
          Entendido
        </button>
      </div>
    </div>
  {/if}
</div>
