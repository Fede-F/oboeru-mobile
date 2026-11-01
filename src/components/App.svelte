<script lang="ts">
  import { onMount } from 'svelte';
  import {
    notifyAppReady,
    checkForOtaUpdates,
    subscribeOtaState,
    reloadApp
  } from '../lib/otaUpdater.js';
  import { hapticSelection, hapticSuccess } from '../lib/haptics.js';
  import VersionBadge from './VersionBadge.svelte';
  import DeckList from './DeckList.svelte';
  import StudyCard from './StudyCard.svelte';
  import VocabularySearch from './VocabularySearch.svelte';
  import SyncPanel from './SyncPanel.svelte';
  import {
    getDecksAndQueue,
    getStudyHeatmapCells,
    initLocalDatabase,
    recordLocalCardReview,
    type HeatmapDayCell
  } from '../lib/db/database';
  import type { DeckSummary, ReviewRating, StudyCardItem } from '../lib/db/schema';
  import { syncManager, syncState, type SyncStatusState } from '../lib/sync/SyncManager';

  type ActiveTab = 'dashboard' | 'study' | 'search' | 'sync';

  // Svelte 5 Runes
  let currentTab = $state<ActiveTab>('dashboard');
  let decks = $state<DeckSummary[]>([]);
  let allCards = $state<StudyCardItem[]>([]);
  let selectedDeckTitle = $state('JLPT N5 Esencial');
  let activeStudyCards = $state<StudyCardItem[]>([]);

  let heatmapCells = $state<HeatmapDayCell[]>([]);
  let totalReviews = $state(0);
  let currentStreak = $state(0);
  let todayCount = $state(0);

  let syncInfo = $state<SyncStatusState>({
    status: 'idle',
    lastSyncAt: null,
    pendingChanges: 0,
    pushedCount: 0,
    pulledCount: 0,
    skippedLwwStale: 0,
    isAuthenticated: false,
    userEmail: null,
    errorMessage: null
  });

  let otaState = $state({
    status: 'idle',
    currentVersion: null,
    availableVersion: null,
    downloadProgress: 0,
    error: null,
    updateReadyToApply: false
  });

  async function refreshLocalData() {
    const [deckData, heatmapData] = await Promise.all([
      getDecksAndQueue(),
      getStudyHeatmapCells(84)
    ]);

    decks = deckData.decks;
    allCards = deckData.allCards;

    if (activeStudyCards.length === 0 && deckData.allCards.length > 0) {
      activeStudyCards = deckData.allCards;
    }

    heatmapCells = heatmapData.cells;
    totalReviews = heatmapData.totalReviews;
    currentStreak = heatmapData.currentStreak;
    todayCount = heatmapData.todayCount;

    await syncManager.refreshPendingCount();
  }

  onMount(() => {
    // 1. REGLA CRÍTICA OTA (AGENTS.md): confirmar arranque exitoso a Capgo para prevenir rollback
    notifyAppReady();

    // 2. Suscribir estado OTA y SyncManager
    const unsubOta = subscribeOtaState((s: typeof otaState) => {
      otaState = s;
    });
    const unsubSync = syncState.subscribe((s) => {
      syncInfo = s;
    });

    // 3. Inicializar Base de Datos Local Offline-First y disparar Sync + OTA en segundo plano
    (async () => {
      await initLocalDatabase(syncManager.getUserId());
      await refreshLocalData();
      checkForOtaUpdates({ autoReload: false });
      await syncManager.syncNow();
      await refreshLocalData();
    })();

    return () => {
      unsubOta();
      unsubSync();
    };
  });

  async function switchTab(tab: ActiveTab) {
    if (currentTab !== tab) {
      await hapticSelection();
      currentTab = tab;
    }
  }

  function handleSelectDeck(deck: DeckSummary) {
    selectedDeckTitle = deck.title;
    const matching = deck.filterFn ? allCards.filter(deck.filterFn) : allCards;
    activeStudyCards = matching.length > 0 ? matching : allCards;
    currentTab = 'study';
  }

  async function handleRateCard(vocabularyId: string, rating: ReviewRating) {
    await recordLocalCardReview(vocabularyId, rating, syncManager.getUserId());
    await refreshLocalData();
    // Intentar sincronización silenciosa en background
    syncManager.syncNow().catch(() => {});
  }

  async function handleApplyUpdate() {
    await hapticSuccess();
    await reloadApp();
  }
</script>

<div class="flex flex-col min-h-screen bg-slate-900 text-slate-100 antialiased overflow-hidden select-none">
  <!-- Top App Bar con Safe Area y Acentos Verde Menta (#a7f3d0) -->
  <header class="glass-header sticky top-0 z-40 px-5 pt-safe pb-3 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#43534a] to-[#1a231f] border border-[#a7f3d0]/30 flex items-center justify-center shadow-lg">
        <span class="text-base font-bold text-[#a7f3d0]">覚</span>
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-base font-extrabold tracking-tight text-white leading-none">
            Oboeru
          </h1>
          <span class="text-[10px] font-semibold text-[#a7f3d0] bg-[#a7f3d0]/10 px-2 py-0.5 rounded-full border border-[#a7f3d0]/20">
            SRS
          </span>
        </div>
        <p class="text-[11px] font-medium text-slate-400 leading-tight mt-0.5">
          {#if syncInfo.pendingChanges > 0}
            <span class="text-amber-300">{syncInfo.pendingChanges} cambios offline</span>
          {:else}
            <span>Offline-First • Sincronizado</span>
          {/if}
        </p>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <VersionBadge variant="chip" />
    </div>
  </header>

  <!-- Banner de Actualización OTA Lista -->
  {#if otaState.updateReadyToApply}
    <div class="mx-4 mt-3 p-3.5 rounded-2xl bg-[#182420] border border-[#a7f3d0]/40 shadow-xl flex items-center justify-between gap-3">
      <div>
        <p class="text-xs font-bold text-white">Actualización v{otaState.availableVersion} lista</p>
        <p class="text-[11px] text-[#a7f3d0]/85">Reiniciá para aplicar la nueva versión OTA.</p>
      </div>
      <button
        type="button"
        onclick={handleApplyUpdate}
        class="touch-target px-3.5 py-1.5 rounded-xl bg-[#a7f3d0] text-slate-950 font-bold text-xs active-press"
      >
        Reiniciar
      </button>
    </div>
  {/if}

  <!-- Contenido Principal con Scroll Móvil -->
  <main class="flex-1 overflow-y-auto px-5 py-4 pb-28 max-w-lg w-full mx-auto">
    {#if currentTab === 'dashboard'}
      <DeckList
        {decks}
        {heatmapCells}
        {totalReviews}
        {currentStreak}
        {todayCount}
        onSelectDeck={handleSelectDeck}
        onOpenSearch={() => switchTab('search')}
      />
    {:else if currentTab === 'study'}
      <StudyCard
        deckTitle={selectedDeckTitle}
        cards={activeStudyCards}
        onRateCard={handleRateCard}
        onExitStudy={() => switchTab('dashboard')}
      />
    {:else if currentTab === 'search'}
      <VocabularySearch onQueueUpdated={refreshLocalData} />
    {:else if currentTab === 'sync'}
      <SyncPanel onSyncCompleted={refreshLocalData} />
    {/if}

    <div class="mt-6">
      <VersionBadge variant="footer" />
    </div>
  </main>

  <!-- Barra de Navegación Inferior Mate con Safe Area -->
  <nav class="glass-nav fixed bottom-0 left-0 right-0 z-40 px-4 pt-2 pb-safe">
    <div class="flex items-center justify-around max-w-md mx-auto">
      <button
        type="button"
        onclick={() => switchTab('dashboard')}
        class="touch-target flex flex-col items-center justify-center gap-1 transition-colors {currentTab === 'dashboard'
          ? 'text-[#a7f3d0]'
          : 'text-slate-400 hover:text-slate-200'}"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
        <span class="text-[10px] font-bold">Mazos</span>
      </button>

      <button
        type="button"
        onclick={() => switchTab('study')}
        class="touch-target flex flex-col items-center justify-center gap-1 transition-colors {currentTab === 'study'
          ? 'text-[#a7f3d0]'
          : 'text-slate-400 hover:text-slate-200'}"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
        <span class="text-[10px] font-bold">Estudiar</span>
      </button>

      <button
        type="button"
        onclick={() => switchTab('search')}
        class="touch-target flex flex-col items-center justify-center gap-1 transition-colors {currentTab === 'search'
          ? 'text-[#a7f3d0]'
          : 'text-slate-400 hover:text-slate-200'}"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <span class="text-[10px] font-bold">WanaKana</span>
      </button>

      <button
        type="button"
        onclick={() => switchTab('sync')}
        class="touch-target flex flex-col items-center justify-center gap-1 transition-colors relative {currentTab === 'sync'
          ? 'text-[#a7f3d0]'
          : 'text-slate-400 hover:text-slate-200'}"
      >
        <div class="relative">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {#if syncInfo.pendingChanges > 0}
            <span class="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-amber-400"></span>
          {/if}
        </div>
        <span class="text-[10px] font-bold">Sync LWW</span>
      </button>
    </div>
  </nav>
</div>
