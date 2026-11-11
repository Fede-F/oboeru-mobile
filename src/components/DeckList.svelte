<script lang="ts">
  import { onMount } from 'svelte';
  import type { DeckSummary } from '../lib/db/schema';
  import type { HeatmapDayCell } from '../lib/db/database';
  import { deleteCustomUserDeck, duplicateDeckToCustom } from '../lib/db/database';
  import { getDeckStudyMode, setDeckStudyMode, STUDY_MODE_DETAILS, type StudyMode } from '../lib/studyMode';
  import StudyHeatmap from './StudyHeatmap.svelte';
  import {
    hapticImpactLight,
    hapticImpactMedium,
    hapticSelection,
    hapticSuccess,
    hapticWarning
  } from '../lib/haptics.js';
  import { registerBackInterceptor } from '../lib/backNavigation';

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
    onDeckDuplicated?: () => void | Promise<void>;
    onViewDeckWords?: (deck: DeckSummary) => void;
    onEditDeck?: (deck: DeckSummary) => void;
    onOpenAddWords?: (deck: DeckSummary) => void;
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
    onDeckDeleted,
    onDeckDuplicated,
    onViewDeckWords,
    onEditDeck,
    onOpenAddWords
  }: Props = $props();

  type SortCriterion = 'created' | 'name' | 'due' | 'size';
  type OwnershipFilter = 'all' | 'recent' | 'mine';

  const OWNERSHIP_STORAGE_KEY = 'oboeru_decks_ownership_filter';

  function getInitialFilter(): OwnershipFilter {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(OWNERSHIP_STORAGE_KEY);
        if (saved === 'all' || saved === 'recent' || saved === 'mine') {
          return saved as OwnershipFilter;
        }
      }
    } catch {
      // ignore
    }
    return 'all';
  }

  let sortBy = $state<SortCriterion>('created');
  let sortDirection = $state<'asc' | 'desc'>('desc');
  let ownershipFilter = $state<OwnershipFilter>(getInitialFilter());

  // Estado para submenú contextual (long-press) y acciones
  let targetDeck = $state<DeckSummary | null>(null);
  let showActionMenu = $state(false);
  let showDeleteConfirm = $state(false);
  let showStudyModeModal = $state(false);
  let currentDeckMode = $state<StudyMode>('jp_to_es');
  let studyModeVersion = $state(0);
  let isDeleting = $state(false);
  let isDuplicating = $state(false);

  function getDeckModeLabel(deck: DeckSummary): string {
    void studyModeVersion;
    const mode = getDeckStudyMode(deck.id);
    const badge = STUDY_MODE_DETAILS[mode]?.badge || 'JP → ES';
    return deck.isCustom ? `${badge} • MÍO` : badge;
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem(OWNERSHIP_STORAGE_KEY);
      if (saved === 'all' || saved === 'recent' || saved === 'mine') {
        ownershipFilter = saved as OwnershipFilter;
      }
    } catch {
      // Ignorar restricciones de storage local si aplican
    }

    return registerBackInterceptor(() => {
      if (showDeleteConfirm && !isDeleting) {
        showDeleteConfirm = false;
        showActionMenu = false;
        targetDeck = null;
        return true;
      }
      if (showStudyModeModal) {
        showStudyModeModal = false;
        return true;
      }
      if (showActionMenu) {
        showActionMenu = false;
        targetDeck = null;
        return true;
      }
      return false;
    });
  });

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
      await hapticImpactMedium();
      targetDeck = deck;
      currentDeckMode = getDeckStudyMode(deck.id);
      showActionMenu = true;
    }, 520);
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

  function closeMenu() {
    showActionMenu = false;
    showDeleteConfirm = false;
    showStudyModeModal = false;
    targetDeck = null;
  }

  async function selectStudyMode(mode: StudyMode) {
    if (!targetDeck) return;
    await hapticSuccess();
    setDeckStudyMode(targetDeck.id, mode);
    currentDeckMode = mode;
    studyModeVersion += 1;
    showStudyModeModal = false;
    showActionMenu = false;
    targetDeck = null;
  }

  async function handleViewDeckWords() {
    if (!targetDeck || !onViewDeckWords) return;
    await hapticImpactLight();
    const deckToView = targetDeck;
    closeMenu();
    onViewDeckWords(deckToView);
  }

  async function handleEditDeck() {
    if (!targetDeck || !onEditDeck) return;
    await hapticImpactLight();
    const deckToEdit = targetDeck;
    closeMenu();
    onEditDeck(deckToEdit);
  }

  async function handleDuplicateDeck() {
    if (!targetDeck || isDuplicating) return;
    isDuplicating = true;
    try {
      await hapticImpactLight();
      await duplicateDeckToCustom(targetDeck);
      await hapticSuccess();
      closeMenu();
      if (onDeckDuplicated) {
        await onDeckDuplicated();
      } else if (onDeckDeleted) {
        await onDeckDeleted();
      }
    } catch (err) {
      console.error('Error al duplicar mazo:', err);
      await hapticWarning();
    } finally {
      isDuplicating = false;
    }
  }

  function openDeleteConfirm() {
    showActionMenu = false;
    showDeleteConfirm = true;
  }

  async function confirmDelete() {
    if (!targetDeck || !targetDeck.isCustom) return;
    isDeleting = true;
    try {
      await deleteCustomUserDeck(targetDeck.id);
      await hapticSuccess();
      closeMenu();
      if (onDeckDeleted) {
        await onDeckDeleted();
      }
    } catch (err) {
      console.error('Error al eliminar mazo:', err);
      await hapticWarning();
    } finally {
      isDeleting = false;
    }
  }

  const sortOptions: Array<{ id: SortCriterion; label: string }> = [
    { id: 'created', label: 'Fecha' },
    { id: 'name', label: 'Nombre' },
    { id: 'due', label: 'Para hoy' },
    { id: 'size', label: 'Cantidad' }
  ];

  let customDeckCount = $derived(decks.filter((d) => d.isCustom).length);
  let recentDecks = $derived(decks.filter((d) => Boolean(d.lastStudiedAt)));
  let recentDeckCount = $derived(recentDecks.length);

  let sortedDecks = $derived.by(() => {
    let filtered: DeckSummary[];
    if (ownershipFilter === 'mine') {
      filtered = decks.filter((d) => Boolean(d.isCustom));
    } else if (ownershipFilter === 'recent') {
      filtered = decks.filter((d) => Boolean(d.lastStudiedAt));
    } else {
      filtered = [...decks];
    }

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
          if (ownershipFilter === 'recent') {
            const tA = a.lastStudiedAt ? new Date(a.lastStudiedAt).getTime() : 0;
            const tB = b.lastStudiedAt ? new Date(b.lastStudiedAt).getTime() : 0;
            return (tA - tB) * dir;
          }
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return (tA - tB) * dir;
        }
      }
    });

    return filtered;
  });

  // Carrusel Horizontal: Agrupar mazos de a 4 por página (grilla 2x2 en cada slide)
  let carouselEl = $state<HTMLElement | null>(null);
  let currentPage = $state(0);

  type CarouselItem = { type: 'deck'; deck: DeckSummary } | { type: 'create' };

  let deckPages = $derived.by(() => {
    const items: CarouselItem[] = [
      ...sortedDecks.map((deck) => ({ type: 'deck' as const, deck })),
      { type: 'create' as const }
    ];
    const pages: CarouselItem[][] = [];
    for (let i = 0; i < items.length; i += 4) {
      pages.push(items.slice(i, i + 4));
    }
    return pages;
  });

  function handleCarouselScroll() {
    if (!carouselEl) return;
    const scrollLeft = carouselEl.scrollLeft;
    const width = carouselEl.clientWidth;
    if (width > 0) {
      const page = Math.round(scrollLeft / width);
      if (page !== currentPage && page >= 0 && page < deckPages.length) {
        currentPage = page;
      }
    }
  }

  function scrollToPage(pageIndex: number) {
    if (!carouselEl) return;
    carouselEl.scrollTo({
      left: pageIndex * carouselEl.clientWidth,
      behavior: 'smooth'
    });
    currentPage = pageIndex;
  }

  $effect(() => {
    // Al alternar filtros u ordenamiento, resetear al primer slide
    const _ = [ownershipFilter, sortBy, sortDirection];
    if (carouselEl) {
      carouselEl.scrollTo({ left: 0, behavior: 'instant' });
      currentPage = 0;
    }
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

  function formatRelativeOrDate(isoDate?: string | null): string {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Estudiado recién';
    if (diffMins < 60) return `Estudiado hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Estudiado hace ${diffHours} h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Estudiado ayer';
    if (diffDays < 7) return `Estudiado hace ${diffDays} d`;
    return `Estudiado el ${d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}`;
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
    const pct = Math.round(((deck.masteredCards || 0) / deck.totalCards) * 100);
    return Math.min(100, Math.max(0, pct));
  }

  async function handleSortChange(criterion: SortCriterion) {
    await hapticSelection();
    if (sortBy === criterion) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortBy = criterion;
      sortDirection = criterion === 'name' ? 'asc' : 'desc';
    }
  }

  async function handleOwnershipFilter(filter: OwnershipFilter) {
    if (ownershipFilter === filter) return;
    await hapticSelection();
    ownershipFilter = filter;
    try {
      localStorage.setItem(OWNERSHIP_STORAGE_KEY, filter);
    } catch {
      // Ignorar
    }
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
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wider text-white/80">
            Mazos Disponibles ({sortedDecks.length})
          </h3>
          <span class="text-[10px] text-white/50">
            Deslizá para ver más • Mantené presionado para opciones
          </span>
        </div>

        <!-- Filtro: Todos vs Recientes vs Míos -->
        <div
          role="group"
          aria-label="Filtrar mazos por autor o estudio reciente"
          class="inline-flex items-center p-0.5 rounded-full bg-[#161b20] self-start sm:self-auto shrink-0"
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
            onclick={() => handleOwnershipFilter('recent')}
            aria-pressed={ownershipFilter === 'recent'}
            title="Últimos estudiados"
            class="px-3 py-1 rounded-full text-[11px] font-bold transition-all active-press {ownershipFilter === 'recent'
              ? 'bg-white text-slate-950 shadow-sm'
              : 'text-white/60 hover:text-white'}"
          >
            Recientes ({recentDeckCount})
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

    {#if ownershipFilter === 'recent' && sortedDecks.length === 0}
      <!-- Estado Vacío cuando no se ha estudiado ningún mazo todavía -->
      <div class="rounded-[26px] bg-[#161b20] p-6 text-center space-y-3 my-2 border border-white/5">
        <div class="w-12 h-12 mx-auto rounded-full bg-white/10 flex items-center justify-center text-xl">
          📖
        </div>
        <h4 class="text-sm font-bold text-white">No hay mazos estudiados todavía</h4>
        <p class="text-xs text-white/60 max-w-xs mx-auto leading-relaxed">
          Comenzá a practicar cualquier mazo y aparecerá automáticamente en esta lista.
        </p>
        <button
          type="button"
          onclick={() => handleOwnershipFilter('all')}
          class="px-4 py-2 rounded-full bg-white text-slate-950 text-xs font-bold active-press shadow-sm inline-flex items-center gap-1.5"
        >
          <span>Ver todos los mazos</span>
        </button>
      </div>
    {:else}
      <!-- Carrusel Horizontal de Mazos Deslizable de Derecha a Izquierda (Snap) -->
      <div
        bind:this={carouselEl}
        onscroll={handleCarouselScroll}
        class="flex w-full overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1"
        style="scrollbar-width: none; -ms-overflow-style: none; -webkit-overflow-scrolling: touch;"
      >
        {#each deckPages as page, pageIndex (pageIndex)}
          <div class="w-full shrink-0 snap-center grid grid-cols-2 gap-3.5 items-stretch px-0.5">
            {#each page as item (item.type === 'deck' ? item.deck.id : 'create-deck-card')}
              {#if item.type === 'deck'}
                {@const deck = item.deck}
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
                      {#if ownershipFilter === 'recent' && deck.lastStudiedAt}
                        <span class="block text-[10px] text-emerald-300 mt-0.5 font-medium truncate">
                          {formatRelativeOrDate(deck.lastStudiedAt)}
                        </span>
                      {:else if deck.createdAt}
                        <span class="block text-[10px] text-white/60 mt-0.5 font-medium truncate">
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
                        {#if (deck.dueReviews || 0) > 0}
                          <div class="flex items-center justify-end gap-1">
                            <span class="text-lg font-extrabold text-white leading-none block">
                              {deck.dueReviews}
                            </span>
                          </div>
                          <span class="text-[10px] text-amber-300/90 font-bold block mt-0.5">
                            {deck.dueReviews === 1 ? 'Repaso hoy' : 'Repasos hoy'}
                          </span>
                        {:else if (deck.newCards || 0) > 0}
                          <div class="flex items-center justify-end gap-1">
                            <span class="text-lg font-extrabold text-sky-300 leading-none block">
                              {deck.newCards}
                            </span>
                          </div>
                          <span class="text-[10px] text-sky-300/90 font-bold block mt-0.5">
                            {deck.newCards === 1 ? 'Nueva' : 'Nuevas'}
                          </span>
                        {:else if deck.totalCards > 0}
                          <div class="flex items-center justify-end gap-1">
                            <span class="text-xs text-emerald-400 font-bold">✓</span>
                            <span class="text-lg font-extrabold text-emerald-300 leading-none block">
                              0
                            </span>
                          </div>
                          <span class="text-[10px] text-emerald-300/90 font-bold block mt-0.5">
                            Al día
                          </span>
                        {:else}
                          <span class="text-lg font-extrabold text-white/50 leading-none block">0</span>
                          <span class="text-[10px] text-white/50 font-medium block mt-0.5">Vacío</span>
                        {/if}
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

                      {#if (deck.dueReviews || 0) > 0}
                        <p class="text-[9.5px] text-amber-300/90 font-bold tracking-tight text-right flex items-center justify-end gap-1 pt-0.5 truncate">
                          <span>⏳</span>
                          <span>{deck.dueReviews} {deck.dueReviews === 1 ? 'repaso' : 'repasos'}{#if (deck.newCards || 0) > 0} • {deck.newCards} {deck.newCards === 1 ? 'nueva' : 'nuevas'}{/if}</span>
                        </p>
                      {:else if (deck.newCards || 0) > 0}
                        <p class="text-[9.5px] text-sky-300/90 font-bold tracking-tight text-right flex items-center justify-end gap-1 pt-0.5 truncate">
                          <span>🌱</span>
                          <span>{deck.newCards} {deck.newCards === 1 ? 'nueva por aprender' : 'nuevas por aprender'}</span>
                        </p>
                      {:else if deck.totalCards > 0}
                        <p class="text-[9.5px] text-emerald-300/90 font-bold tracking-tight text-right flex items-center justify-end gap-1 pt-0.5 truncate">
                          <span>✨</span>
                          <span>Al día • Sin repasos hoy</span>
                        </p>
                      {/if}
                    </div>
                  </div>

                  <!-- Pie del Mazo: Etiqueta de Modo de Estudio y botón circular mate (solo en mazos propios) -->
                  <div class="flex items-center justify-between pt-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/55 truncate">
                      {getDeckModeLabel(deck)}
                    </span>

                    {#if deck.isCustom}
                      <button
                        type="button"
                        onclick={async (e) => {
                          e.stopPropagation();
                          await hapticImpactLight();
                          if (onOpenAddWords) {
                            onOpenAddWords(deck);
                          }
                        }}
                        title="Agregar palabras a este mazo"
                        aria-label="Agregar palabras a este mazo"
                        class="w-7 h-7 rounded-full bg-white/20 hover:bg-white/35 active-press flex items-center justify-center text-white transition-all shadow-sm shrink-0"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                      </button>
                    {/if}
                  </div>
                </button>
              {:else}
                <!-- Card: Crear un nuevo mazo personalizado -->
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
              {/if}
            {/each}
          </div>
        {/each}
      </div>

      <!-- Indicador de Páginas con Puntos (Dots de Carrusel) -->
      {#if deckPages.length > 1}
        <div class="flex items-center justify-center gap-1.5 pt-1 pb-0.5">
          {#each deckPages as _, idx}
            <button
              type="button"
              onclick={() => scrollToPage(idx)}
              aria-label="Ir a página {idx + 1}"
              class="touch-target h-6 flex items-center justify-center px-1 active-press"
            >
              <span
                class="h-1.5 rounded-full transition-all duration-300 {currentPage === idx
                  ? 'w-6 bg-[#a7f3d0]'
                  : 'w-1.5 bg-white/20 hover:bg-white/40'}"
              ></span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  <!-- Mapa de Calor (Heatmap) estilo GitHub -->
  <StudyHeatmap
    cells={heatmapCells}
    {totalReviews}
    {currentStreak}
    {todayCount}
  />

  <!-- Submenú Contextual / Acciones del Mazo (Long-press) -->
  {#if showActionMenu && targetDeck}
    <div
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-deck-title"
    >
      <div
        class="bg-[#181d22] border border-white/10 rounded-[32px] p-5 max-w-sm w-full shadow-2xl space-y-4 animate-fade-in"
      >
        <!-- Encabezado del Mazo -->
        <div class="flex items-center justify-between pb-2 border-b border-white/10">
          <div class="min-w-0 pr-2">
            <span class="text-[10px] uppercase tracking-wider text-[#a7f3d0] font-bold block">
              {targetDeck.isCustom ? 'Mazo Personalizado' : 'Mazo del Sistema'}
            </span>
            <h3 id="menu-deck-title" class="text-base font-extrabold text-white truncate mt-0.5">
              {targetDeck.title}
            </h3>
            <div class="flex items-center gap-1.5 text-xs text-white/60 flex-wrap mt-0.5">
              <span>{targetDeck.totalCards} palabras</span>
              <span>•</span>
              {#if (targetDeck.dueReviews || 0) > 0}
                <span class="text-amber-300 font-semibold">{targetDeck.dueReviews} {targetDeck.dueReviews === 1 ? 'repaso' : 'repasos'}</span>
              {:else}
                <span class="text-emerald-300 font-semibold">Repasos al día</span>
              {/if}
              {#if (targetDeck.newCards || 0) > 0}
                <span>•</span>
                <span class="text-sky-300 font-semibold">{targetDeck.newCards} {targetDeck.newCards === 1 ? 'nueva' : 'nuevas'}</span>
              {/if}
            </div>
          </div>

          <button
            type="button"
            onclick={closeMenu}
            class="w-8 h-8 rounded-full bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-xs active-press shrink-0"
          >
            ✕
          </button>
        </div>

        <!-- Opciones del Menú (Alto y Ancho emparejados simétricamente con alineación lateral perfecta) -->
        <div class="space-y-2.5">
          <!-- 1. Ver Palabras / Hoja de Estudio (Disponible para TODOS los mazos) -->
          <button
            type="button"
            onclick={handleViewDeckWords}
            class="w-full min-h-[64px] px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-left active-press flex items-center justify-between transition-colors border border-transparent hover:border-white/10"
          >
            <div class="flex items-center gap-3.5 flex-1 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-lg shrink-0">
                📖
              </div>
              <div class="flex-1 min-w-0">
                <span class="text-sm font-bold text-white block truncate leading-snug">Ver palabras</span>
                <span class="text-[11px] text-white/60 block truncate leading-normal mt-0.5">Explorar vocabulario, ejemplos y hoja de estudio</span>
              </div>
            </div>

            <span class="text-white/40 text-lg font-bold shrink-0 ml-3">›</span>
          </button>

          <!-- 2. Editar Mazo (solo disponible para mazos propios "Míos") -->
          {#if targetDeck.isCustom}
            <button
              type="button"
              onclick={handleEditDeck}
              class="w-full min-h-[64px] px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-left active-press flex items-center justify-between transition-colors border border-transparent hover:border-white/10"
            >
              <div class="flex items-center gap-3.5 flex-1 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center text-lg shrink-0">
                  ✏️
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-bold text-white block truncate leading-snug">Editar mazo</span>
                  <span class="text-[11px] text-white/60 block truncate leading-normal mt-0.5">Agregar o quitar palabras de este mazo</span>
                </div>
              </div>

              <span class="text-white/40 text-lg font-bold shrink-0 ml-3">›</span>
            </button>
          {/if}

          <!-- 2. Modo de Estudio (Disponible para TODOS los mazos) -->
          <button
            type="button"
            onclick={() => {
              showActionMenu = false;
              showStudyModeModal = true;
            }}
            class="w-full min-h-[64px] px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-left active-press flex items-center justify-between transition-colors border border-transparent hover:border-white/10"
          >
            <div class="flex items-center gap-3.5 flex-1 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center text-lg shrink-0">
                🔀
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-white block truncate leading-snug">Modo de estudio</span>
                  <span class="text-[10px] font-extrabold text-[#a7f3d0] bg-[#a7f3d0]/10 px-2 py-0.5 rounded-full shrink-0">
                    {STUDY_MODE_DETAILS[currentDeckMode].badge}
                  </span>
                </div>
                <span class="text-[11px] text-white/60 block truncate leading-normal mt-0.5">
                  {STUDY_MODE_DETAILS[currentDeckMode].label}
                </span>
              </div>
            </div>

            <span class="text-white/40 text-lg font-bold shrink-0 ml-3">›</span>
          </button>

          <!-- 3. Duplicar Mazo (disponible para todos: por defecto y propios) -->
          <button
            type="button"
            onclick={handleDuplicateDeck}
            disabled={isDuplicating}
            class="w-full min-h-[64px] px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-left active-press flex items-center justify-between transition-colors disabled:opacity-50 border border-transparent hover:border-white/10"
          >
            <div class="flex items-center gap-3.5 flex-1 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-[#a7f3d0]/15 text-[#a7f3d0] flex items-center justify-center text-lg shrink-0">
                📑
              </div>
              <div class="flex-1 min-w-0">
                <span class="text-sm font-bold text-white block truncate leading-snug">Duplicar mazo</span>
                <span class="text-[11px] text-white/60 block truncate leading-normal mt-0.5">Crea una copia editable en tus mazos ("Míos")</span>
              </div>
            </div>

            {#if isDuplicating}
              <div class="w-4 h-4 border-2 border-[#a7f3d0] border-t-transparent rounded-full animate-spin shrink-0 ml-3"></div>
            {:else}
              <span class="text-white/40 text-lg font-bold shrink-0 ml-3">›</span>
            {/if}
          </button>

          <!-- 4. Eliminar Mazo (solo disponible para mazos propios) -->
          {#if targetDeck.isCustom}
            <button
              type="button"
              onclick={openDeleteConfirm}
              class="w-full min-h-[64px] px-4 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 text-left active-press flex items-center justify-between transition-colors border border-rose-500/20"
            >
              <div class="flex items-center gap-3.5 flex-1 min-w-0">
                <div class="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg shrink-0">
                  🗑️
                </div>
                <div class="flex-1 min-w-0">
                  <span class="text-sm font-bold text-rose-300 block truncate leading-snug">Eliminar mazo</span>
                  <span class="text-[11px] text-rose-200/60 block truncate leading-normal mt-0.5">Borra este mazo sin perder tus repasos</span>
                </div>
              </div>

              <span class="text-rose-400/40 text-lg font-bold shrink-0 ml-3">›</span>
            </button>
          {/if}
        </div>

        <!-- Botón Cancelar con altura y estilo equilibrado -->
        <button
          type="button"
          onclick={closeMenu}
          class="w-full h-11 rounded-2xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-bold text-xs active-press flex items-center justify-center text-center mt-2.5 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  {/if}

  <!-- Modal para Elegir Modo de Estudio del Mazo -->
  {#if showStudyModeModal && targetDeck}
    <div
      class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="study-mode-title"
    >
      <div class="bg-[#181d22] border border-white/10 rounded-[30px] p-6 max-w-sm w-full shadow-2xl space-y-4">
        <div class="flex items-center justify-between pb-1 border-b border-white/10">
          <div>
            <span class="text-[10px] uppercase tracking-wider text-[#a7f3d0] font-extrabold">Configuración de estudio</span>
            <h3 id="study-mode-title" class="text-base font-extrabold text-white mt-0.5 truncate max-w-[220px]">
              {targetDeck.title}
            </h3>
          </div>
          <button
            type="button"
            onclick={() => (showStudyModeModal = false)}
            class="touch-target p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 active-press transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p class="text-xs text-white/70 leading-relaxed">
          Elegí cómo querés que aparezcan las tarjetas al estudiar este mazo:
        </p>

        <div class="space-y-2.5">
          {#each (['jp_to_es', 'es_to_jp', 'mixed'] as const) as mode}
            {@const details = STUDY_MODE_DETAILS[mode]}
            {@const isSelected = currentDeckMode === mode}
            <button
              type="button"
              onclick={() => selectStudyMode(mode)}
              class="w-full p-3.5 rounded-2xl text-left transition-all active-press flex items-start gap-3 border {isSelected
                ? 'bg-[#a7f3d0]/15 border-[#a7f3d0] text-white shadow-md'
                : 'bg-white/5 border-transparent hover:border-white/10 text-white/80 hover:text-white'}"
            >
              <div class="text-2xl shrink-0 mt-0.5">
                {details.icon}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold leading-tight {isSelected ? 'text-[#a7f3d0]' : 'text-white'}">
                    {details.label}
                  </span>
                  {#if isSelected}
                    <span class="w-2 h-2 rounded-full bg-[#a7f3d0] shrink-0"></span>
                  {/if}
                </div>
                <p class="text-[11px] text-white/60 leading-snug mt-1">
                  {details.description}
                </p>
              </div>
            </button>
          {/each}
        </div>

        <button
          type="button"
          onclick={() => (showStudyModeModal = false)}
          class="w-full h-11 rounded-2xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-bold text-xs active-press flex items-center justify-center text-center mt-3 transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  {/if}

  <!-- Modal de Confirmación para Eliminar Mazo Personalizado -->
  {#if showDeleteConfirm && targetDeck}
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
            "{targetDeck.title}"
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
            onclick={closeMenu}
            disabled={isDeleting}
            class="touch-target w-full py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white font-bold text-sm active-press"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
