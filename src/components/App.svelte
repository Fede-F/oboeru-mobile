<script lang="ts">
  import { onMount } from 'svelte';
  import {
    notifyAppReady,
    checkForOtaUpdates,
    subscribeOtaState,
    reloadApp
  } from '../lib/otaUpdater.js';
  import { hapticImpactMedium, hapticSelection, hapticSuccess, hapticWarning } from '../lib/haptics.js';
  import AuthScreen from './AuthScreen.svelte';
  import DeckList from './DeckList.svelte';
  import CreateDeckScreen from './CreateDeckScreen.svelte';
  import EditDeckScreen from './EditDeckScreen.svelte';
  import AddWordsToDeckScreen from './AddWordsToDeckScreen.svelte';
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

  type ActiveTab = 'dashboard' | 'create-deck' | 'edit-deck' | 'add-words' | 'study' | 'search' | 'sync';

  // Svelte 5 Runes
  let currentTab = $state<ActiveTab>('dashboard');
  let isCheckingSession = $state(true);
  let decks = $state<DeckSummary[]>([]);
  let allCards = $state<StudyCardItem[]>([]);
  let selectedDeckTitle = $state('JLPT N5 Esencial');
  let activeStudyCards = $state<StudyCardItem[]>([]);
  let editingDeck = $state<DeckSummary | null>(null);
  let targetDeckForAddWords = $state<DeckSummary | null>(null);

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
    userFullName: null,
    errorMessage: null,
    networkPolicy: 'wifi_only',
    networkType: 'wifi'
  });

  let showMeteredSyncPrompt = $state(false);

  let userFirstName = $derived(
    syncInfo.userFullName ? syncInfo.userFullName.trim().split(/\s+/)[0] : ''
  );

  let otaState = $state({
    status: 'idle',
    currentVersion: null,
    availableVersion: null,
    downloadProgress: 0,
    error: null,
    updateReadyToApply: false
  });

  async function refreshLocalData() {
    const userId = syncManager.getUserId();
    const [deckData, heatmapData] = await Promise.all([
      getDecksAndQueue(),
      getStudyHeatmapCells(84, userId)
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

    // 3. Inicializar Base de Datos Local, restaurar sesión guardada y disparar OTA + Sync
    (async () => {
      await initLocalDatabase(syncManager.getUserId());
      const hasSavedSession = await syncManager.ensureSessionHydrated();
      isCheckingSession = false;

      checkForOtaUpdates({ autoReload: false });

      if (hasSavedSession) {
        await refreshLocalData();
        const autoRes = await syncManager.tryAutoSync();
        if (autoRes.synced) {
          await refreshLocalData();
        }
      }
    })();

    return () => {
      unsubOta();
      unsubSync();
    };
  });

  async function handleAuthenticatedSuccess() {
    currentTab = 'dashboard';
    await initLocalDatabase(syncManager.getUserId());
    await refreshLocalData();
  }

  async function switchTab(tab: ActiveTab) {
    if (currentTab !== tab) {
      await hapticSelection();
      currentTab = tab;
    }
  }

  function handleSelectDeck(deck: DeckSummary) {
    selectedDeckTitle = deck.title;
    const matching = deck.filterFn ? allCards.filter(deck.filterFn) : allCards;
    activeStudyCards = matching;
    currentTab = 'study';
  }

  async function handleRateCard(vocabularyId: string, rating: ReviewRating) {
    await recordLocalCardReview(vocabularyId, rating, syncManager.getUserId());
    await refreshLocalData();
    syncManager.tryAutoSync().catch(() => {});
  }

  async function handleHeaderSyncClick() {
    if (syncInfo.status === 'syncing') return;
    const netType = syncManager.refreshNetworkInfo();

    if (netType === 'offline') {
      await hapticWarning();
      await syncManager.refreshPendingCount('offline');
      return;
    }

    if (netType === 'metered' && syncInfo.networkPolicy === 'wifi_only') {
      await hapticWarning();
      showMeteredSyncPrompt = true;
      return;
    }

    await hapticImpactMedium();
    await syncManager.syncNow();
    await refreshLocalData();
    await hapticSuccess();
  }

  async function confirmMeteredSyncNow() {
    showMeteredSyncPrompt = false;
    await hapticImpactMedium();
    await syncManager.syncNow();
    await refreshLocalData();
    await hapticSuccess();
  }

  async function handleApplyUpdate() {
    await hapticSuccess();
    await reloadApp();
  }
</script>

{#if isCheckingSession}
  <div class="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
    <div class="flex flex-col items-center gap-3">
      <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#43534a] to-[#1a231f] border border-[#a7f3d0]/35 flex items-center justify-center shadow-lg">
        <span class="text-xl font-bold text-[#a7f3d0]">覚</span>
      </div>
      <span class="text-xs text-slate-400 font-medium">Cargando tu sesión...</span>
    </div>
  </div>
{:else if !syncInfo.isAuthenticated}
  <AuthScreen onAuthenticated={handleAuthenticatedSuccess} />
{:else}
  <div class="flex flex-col min-h-screen bg-[#0c0f12] text-white antialiased overflow-hidden select-none">
    <!-- Top App Bar con Safe Area y Estilo Oscuro Mate Limpio -->
    <header class="glass-header sticky top-0 z-40 px-5 pt-safe pb-3 flex items-center justify-between">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-9 h-9 rounded-2xl bg-[#3e534a] flex items-center justify-center shadow-md shrink-0">
          <span class="text-base font-bold text-white">覚</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-base font-extrabold tracking-tight text-white leading-none">
              Oboeru
            </h1>
            <span class="text-[10px] font-semibold text-white/75 bg-white/10 px-2 py-0.5 rounded-full">
              日本語
            </span>
          </div>
          <p class="text-[11px] font-medium text-white/60 leading-tight mt-0.5 truncate">
            {#if syncInfo.pendingChanges > 0}
              <span class="text-amber-300">{syncInfo.pendingChanges} repasos por guardar</span>
            {:else if userFirstName}
              <span>Hola, <strong class="text-white">{userFirstName}</strong></span>
            {:else}
              <span>Progreso al día</span>
            {/if}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onclick={handleHeaderSyncClick}
          disabled={syncInfo.status === 'syncing'}
          aria-label={syncInfo.status === 'syncing'
            ? 'Sincronizando progreso'
            : syncInfo.pendingChanges > 0
              ? `${syncInfo.pendingChanges} cambios pendientes de sincronizar`
              : 'Sincronizado al día'}
          title={syncInfo.status === 'syncing'
            ? 'Sincronizando...'
            : syncInfo.pendingChanges > 0
              ? `${syncInfo.pendingChanges} pendientes de sincronizar`
              : 'Sincronizado al día'}
          class="touch-target relative px-3 py-2 rounded-2xl transition-all active-press flex items-center gap-1.5 {syncInfo.status === 'syncing'
            ? 'bg-[#3e534a] text-white'
            : syncInfo.pendingChanges > 0
              ? 'bg-amber-500/20 text-amber-300'
              : syncInfo.networkType === 'offline' || syncInfo.status === 'offline'
                ? 'bg-[#171c20] text-white/50'
                : 'bg-[#171c20] text-emerald-300'}"
        >
          <svg
            class="w-4 h-4 {syncInfo.status === 'syncing' ? 'animate-spin' : ''}"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>

          {#if syncInfo.status === 'syncing'}
            <span class="text-[11px] font-bold">Sincronizando</span>
          {:else if syncInfo.pendingChanges > 0}
            <span class="text-[11px] font-extrabold">{syncInfo.pendingChanges}</span>
          {:else if syncInfo.networkType === 'offline' || syncInfo.status === 'offline'}
            <span class="text-[10px] font-semibold">Sin red</span>
          {:else}
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          {/if}
        </button>
      </div>
    </header>

    <!-- Banner de Actualización OTA Lista -->
    {#if otaState.updateReadyToApply}
      <div class="mx-4 mt-3 p-3.5 rounded-2xl bg-[#182420] border border-[#a7f3d0]/40 shadow-xl flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-bold text-white">Actualización v{otaState.availableVersion} lista</p>
          <p class="text-[11px] text-[#a7f3d0]/85">Reiniciá para aplicar las últimas mejoras.</p>
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
          onOpenCreateDeck={() => switchTab('create-deck')}
          onDeckDeleted={async () => {
            await refreshLocalData();
            syncManager.syncNow().catch((e) => console.warn('[Sync] Post-delete sync error:', e));
          }}
          onDeckDuplicated={async () => {
            await refreshLocalData();
            syncManager.syncNow().catch((e) => console.warn('[Sync] Post-duplicate sync error:', e));
          }}
          onEditDeck={(deck) => {
            editingDeck = deck;
            currentTab = 'edit-deck';
          }}
          onOpenAddWords={(deck) => {
            targetDeckForAddWords = deck;
            currentTab = 'add-words';
          }}
        />
      {:else if currentTab === 'create-deck'}
        <CreateDeckScreen
          onCancel={() => switchTab('dashboard')}
          onDeckCreated={async () => {
            await refreshLocalData();
            currentTab = 'dashboard';
          }}
        />
      {:else if currentTab === 'edit-deck' && editingDeck}
        <EditDeckScreen
          deck={editingDeck}
          onBack={async () => {
            await refreshLocalData();
            editingDeck = null;
            currentTab = 'dashboard';
          }}
          onOpenAddWords={() => {
            targetDeckForAddWords = editingDeck;
            currentTab = 'add-words';
          }}
        />
      {:else if currentTab === 'add-words' && targetDeckForAddWords}
        <AddWordsToDeckScreen
          deck={targetDeckForAddWords}
          onBack={async () => {
            await refreshLocalData();
            targetDeckForAddWords = null;
            currentTab = 'dashboard';
          }}
        />
      {:else if currentTab === 'study'}
        <StudyCard
          deckTitle={selectedDeckTitle}
          cards={activeStudyCards}
          onRateCard={handleRateCard}
          onExitStudy={() => switchTab('dashboard')}
        />
      {:else if currentTab === 'search'}
        <VocabularySearch
          onQueueUpdated={refreshLocalData}
          onOpenCreateDeck={() => switchTab('create-deck')}
        />
      {:else if currentTab === 'sync'}
        <SyncPanel onSyncCompleted={refreshLocalData} />
      {/if}
    </main>

    {#if showMeteredSyncPrompt}
      <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="metered-sync-title"
          class="bg-[#121820] max-w-sm w-full p-5 rounded-3xl border border-amber-400/35 shadow-2xl space-y-4"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-300 shrink-0">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
              </svg>
            </div>
            <div>
              <h3 id="metered-sync-title" class="text-base font-bold text-white">
                Estás usando datos móviles
              </h3>
              <p class="text-[11px] text-amber-300 font-semibold">
                Conexión medida (LTE / 5G)
              </p>
            </div>
          </div>

          <p class="text-xs text-slate-300 leading-relaxed">
            Tenés activada la opción de sincronizar automáticamente solo con Wi-Fi. ¿Deseás sincronizar tu progreso ahora usando tus datos móviles?
          </p>

          <div class="flex gap-2.5 pt-1">
            <button
              type="button"
              onclick={() => (showMeteredSyncPrompt = false)}
              class="flex-1 touch-target rounded-full bg-[#171717] border border-white/10 text-slate-300 font-semibold text-xs active-press"
            >
              Más tarde
            </button>
            <button
              type="button"
              onclick={confirmMeteredSyncNow}
              class="flex-1 touch-target rounded-full bg-[#a7f3d0] text-slate-950 font-extrabold text-xs active-press"
            >
              Sincronizar ahora
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Barra de Navegación Inferior Mate con Safe Area -->
    <nav class="glass-nav fixed bottom-0 left-0 right-0 z-40 px-4 pt-2 pb-safe">
      <div class="flex items-center justify-around max-w-md mx-auto">
        <button
          type="button"
          onclick={() => switchTab('dashboard')}
          class="touch-target flex flex-col items-center justify-center gap-1 transition-colors {currentTab === 'dashboard' || currentTab === 'create-deck' || currentTab === 'edit-deck' || currentTab === 'add-words' || currentTab === 'study'
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
          onclick={() => switchTab('search')}
          class="touch-target flex flex-col items-center justify-center gap-1 transition-colors {currentTab === 'search'
            ? 'text-[#a7f3d0]'
            : 'text-slate-400 hover:text-slate-200'}"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <span class="text-[10px] font-bold">Diccionario</span>
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
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
          <span class="text-[10px] font-bold">Cuenta</span>
        </button>
      </div>
    </nav>
  </div>
{/if}
