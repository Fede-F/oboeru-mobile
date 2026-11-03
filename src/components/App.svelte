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
    rollbackLocalCardReview,
    type HeatmapDayCell
  } from '../lib/db/database';
  import type { DeckSummary, ReviewRating, SrsReviewRecord, StudyCardItem } from '../lib/db/schema';
  import { syncManager, syncState, type SyncStatusState } from '../lib/sync/SyncManager';
  import { getDeckStudyMode, type StudyMode } from '../lib/studyMode';

  type ActiveTab = 'dashboard' | 'create-deck' | 'edit-deck' | 'add-words' | 'study' | 'search' | 'sync';

  const ACTIVE_STUDY_SESSION_KEY = 'oboeru_active_study_session';

  export interface ActiveStudySession {
    deckId: string;
    deckTitle: string;
    currentIndex: number;
    sessionCompletedCount: number;
    totalCards: number;
    cardIds?: string[];
    studyMode?: StudyMode;
    savedAt: string;
  }

  // Svelte 5 Runes
  let currentTab = $state<ActiveTab>('dashboard');
  let isCheckingSession = $state(true);
  let decks = $state<DeckSummary[]>([]);
  let allCards = $state<StudyCardItem[]>([]);
  let selectedDeckTitle = $state('JLPT N5 Esencial');
  let currentStudyDeckId = $state<string>('');
  let currentStudyMode = $state<StudyMode>('jp_to_es');
  let activeStudyCards = $state<StudyCardItem[]>([]);
  let editingDeck = $state<DeckSummary | null>(null);
  let targetDeckForAddWords = $state<DeckSummary | null>(null);
  let activeSession = $state<ActiveStudySession | null>(null);
  let initialStudyIndex = $state(0);
  let initialCompletedCount = $state(0);

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
      activeSession = loadStoredStudySession();
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

  function loadStoredStudySession(): ActiveStudySession | null {
    try {
      const raw = localStorage.getItem(ACTIVE_STUDY_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ActiveStudySession;
      if (parsed && parsed.deckId && parsed.currentIndex !== undefined && parsed.totalCards > 0) {
        if (parsed.currentIndex >= parsed.totalCards) {
          localStorage.removeItem(ACTIVE_STUDY_SESSION_KEY);
          return null;
        }
        return parsed;
      }
    } catch (e) {
      console.warn('[Session] Error loading active session:', e);
    }
    return null;
  }

  function saveActiveStudySession(session: ActiveStudySession | null) {
    try {
      if (session) {
        localStorage.setItem(ACTIVE_STUDY_SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(ACTIVE_STUDY_SESSION_KEY);
      }
    } catch (e) {
      console.warn('[Session] Error saving active session:', e);
    }
  }

  async function switchTab(tab: ActiveTab) {
    if (currentTab !== tab) {
      await hapticSelection();
      currentTab = tab;
    }
  }

  // Algoritmo Fisher-Yates para barajar tarjetas en orden aleatorio (Interleaving)
  function shuffleCards<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function handleSelectDeck(deck: DeckSummary) {
    selectedDeckTitle = deck.title;
    currentStudyDeckId = deck.id;
    const matching = deck.filterFn ? allCards.filter(deck.filterFn) : allCards;
    const now = new Date();
    const endOfTodayMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).getTime();
    const dueOnly = matching.filter(
      (c) => new Date(c.review.next_review_date).getTime() <= endOfTodayMs
    );
    const pool = dueOnly.length > 0 ? dueOnly : matching;
    const mode = getDeckStudyMode(deck.id);
    currentStudyMode = mode;

    if (activeSession && activeSession.deckId === deck.id && activeSession.cardIds && activeSession.cardIds.length > 0) {
      // Reanudar respetando el orden aleatorio y modo guardados
      const cardMap = new Map(matching.map((c) => [c.id, c]));
      const ordered = activeSession.cardIds.map((id) => cardMap.get(id)).filter(Boolean) as StudyCardItem[];
      activeStudyCards = ordered.length > 0 ? ordered : pool;
      initialStudyIndex = activeSession.currentIndex;
      initialCompletedCount = activeSession.sessionCompletedCount;
      if (activeSession.studyMode) {
        currentStudyMode = activeSession.studyMode;
      }
    } else {
      // Iniciar sesión nueva barajando aleatoriamente (Shuffle)
      const shuffled = shuffleCards(pool);
      activeStudyCards = shuffled;
      initialStudyIndex = 0;
      initialCompletedCount = 0;

      if (shuffled.length > 0) {
        const fresh: ActiveStudySession = {
          deckId: deck.id,
          deckTitle: deck.title,
          currentIndex: 0,
          sessionCompletedCount: 0,
          totalCards: shuffled.length,
          cardIds: shuffled.map((c) => c.id),
          studyMode: mode,
          savedAt: new Date().toISOString()
        };
        activeSession = fresh;
        saveActiveStudySession(fresh);
      }
    }
    currentTab = 'study';
  }

  function resumeCurrentSession() {
    if (!activeSession) return;
    const targetDeck = decks.find((d) => d.id === activeSession!.deckId);
    selectedDeckTitle = activeSession.deckTitle;
    currentStudyDeckId = activeSession.deckId;
    initialStudyIndex = activeSession.currentIndex;
    initialCompletedCount = activeSession.sessionCompletedCount;
    currentStudyMode = activeSession.studyMode || getDeckStudyMode(activeSession.deckId);

    const matching = targetDeck?.filterFn ? allCards.filter(targetDeck.filterFn) : allCards;
    if (activeSession.cardIds && activeSession.cardIds.length > 0) {
      const cardMap = new Map(matching.map((c) => [c.id, c]));
      const ordered = activeSession.cardIds.map((id) => cardMap.get(id)).filter(Boolean) as StudyCardItem[];
      activeStudyCards = ordered.length > 0 ? ordered : matching;
    } else {
      activeStudyCards = matching;
    }
    currentTab = 'study';
  }

  function restartCurrentSession() {
    if (!activeSession) return;
    const targetDeck = decks.find((d) => d.id === activeSession!.deckId);
    const deckId = activeSession.deckId;
    const deckTitle = activeSession.deckTitle;
    const mode = getDeckStudyMode(deckId);

    selectedDeckTitle = deckTitle;
    currentStudyDeckId = deckId;
    initialStudyIndex = 0;
    initialCompletedCount = 0;
    currentStudyMode = mode;

    const matching = targetDeck?.filterFn ? allCards.filter(targetDeck.filterFn) : allCards;
    // Nuevo orden aleatorio al reiniciar desde cero
    const shuffled = shuffleCards(matching);
    activeStudyCards = shuffled;

    const fresh: ActiveStudySession = {
      deckId,
      deckTitle,
      currentIndex: 0,
      sessionCompletedCount: 0,
      totalCards: shuffled.length,
      cardIds: shuffled.map((c) => c.id),
      studyMode: mode,
      savedAt: new Date().toISOString()
    };
    activeSession = fresh;
    saveActiveStudySession(fresh);

    currentTab = 'study';
  }

  function clearActiveSession() {
    activeSession = null;
    saveActiveStudySession(null);
  }

  function handleSessionProgress(progress: { currentIndex: number; sessionCompletedCount: number; totalCards: number }) {
    if (currentStudyDeckId && progress.currentIndex < progress.totalCards) {
      const updated: ActiveStudySession = {
        deckId: currentStudyDeckId,
        deckTitle: selectedDeckTitle,
        currentIndex: progress.currentIndex,
        sessionCompletedCount: progress.sessionCompletedCount,
        totalCards: progress.totalCards,
        cardIds: activeSession?.cardIds || activeStudyCards.map((c) => c.id),
        studyMode: currentStudyMode,
        savedAt: new Date().toISOString()
      };
      activeSession = updated;
      saveActiveStudySession(updated);
    } else {
      activeSession = null;
      saveActiveStudySession(null);
    }
  }

  function handleSessionFinished() {
    activeSession = null;
    saveActiveStudySession(null);
  }

  async function handleUndoCard(vocabularyId: string, previousReview: SrsReviewRecord | null) {
    await rollbackLocalCardReview(previousReview, vocabularyId, syncManager.getUserId());
    await refreshLocalData();
    syncManager.tryAutoSync().catch(() => {});
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
        {#if activeSession && activeSession.currentIndex < activeSession.totalCards}
          <!-- Banner de Sesión de Estudio en Curso -->
          <div class="mb-5 p-4 rounded-3xl bg-gradient-to-br from-[#1c2d25] via-[#14201a] to-[#0e1612] border border-[#a7f3d0]/35 shadow-2xl space-y-3 animate-fade-in relative">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="flex h-2 w-2 relative">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span class="text-[10px] font-extrabold tracking-wider uppercase text-[#a7f3d0]">
                  Sesión en curso
                </span>
              </div>

              <button
                type="button"
                onclick={clearActiveSession}
                title="Descartar sesión en curso"
                class="touch-target p-1.5 -mr-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 active-press transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="space-y-1">
              <h3 class="text-base font-extrabold text-white leading-snug">
                {activeSession.deckTitle}
              </h3>
              <div class="flex items-center justify-between text-[11px] text-white/70">
                <span>Tarjeta <strong class="text-white">{activeSession.currentIndex + 1}</strong> de {activeSession.totalCards}</span>
                <span>{activeSession.sessionCompletedCount} repasadas</span>
              </div>

              <!-- Barra de progreso -->
              <div class="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mt-1.5">
                <div
                  class="h-full bg-gradient-to-r from-emerald-500 to-[#a7f3d0] transition-all duration-300 rounded-full"
                  style="width: {Math.max(5, Math.min(100, Math.round(((activeSession.currentIndex) / activeSession.totalCards) * 100)))}%"
                ></div>
              </div>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <button
                type="button"
                onclick={resumeCurrentSession}
                class="flex-1 touch-target py-2.5 px-4 rounded-2xl bg-[#a7f3d0] hover:bg-[#86efac] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 active-press shadow-md transition-colors"
              >
                <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Continuar estudio</span>
              </button>

              <button
                type="button"
                onclick={restartCurrentSession}
                class="touch-target py-2.5 px-3.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white/80 hover:text-white font-semibold text-xs flex items-center justify-center gap-1 active-press transition-colors"
              >
                <span>Empezar de nuevo</span>
              </button>
            </div>
          </div>
        {/if}

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
          studyMode={currentStudyMode}
          initialIndex={initialStudyIndex}
          initialCompletedCount={initialCompletedCount}
          onRateCard={handleRateCard}
          onUndoCard={handleUndoCard}
          onSessionProgress={handleSessionProgress}
          onSessionFinished={handleSessionFinished}
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
          class="touch-target active-press flex flex-col items-center justify-center gap-1 transition-colors {currentTab === 'dashboard' || currentTab === 'create-deck' || currentTab === 'edit-deck' || currentTab === 'add-words' || currentTab === 'study'
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
          class="touch-target active-press flex flex-col items-center justify-center gap-1 transition-colors {currentTab === 'search'
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
          class="touch-target active-press flex flex-col items-center justify-center gap-1 transition-colors relative {currentTab === 'sync'
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
