<script lang="ts">
  import {
    MAX_SYNC_BATCH_SIZE,
    OBOERU_API_BASE_URL,
    syncManager,
    syncState,
    type SyncStatusState
  } from '../lib/sync/SyncManager';
  import {
    DEFAULT_APP_NAME,
    checkForOtaUpdates,
    getCurrentAppVersion,
    reloadApp,
    resetToNativeBundle,
    subscribeOtaState
  } from '../lib/otaUpdater.js';
  import { hapticImpactMedium, hapticSuccess, hapticWarning } from '../lib/haptics.js';

  interface Props {
    onSyncCompleted: () => Promise<void>;
  }

  let { onSyncCompleted }: Props = $props();

  let authMode = $state<'login' | 'register'>('login');
  let email = $state('');
  let password = $state('');
  let isSubmittingAuth = $state(false);
  let authFeedback = $state<string | null>(null);

  let currentVersion = $state('1.0.0');
  let isCheckingOta = $state(false);
  let showResetModal = $state(false);

  let otaState = $state({
    status: 'idle',
    currentVersion: null as string | null,
    availableVersion: null as string | null,
    downloadProgress: 0,
    error: null as string | null,
    updateReadyToApply: false
  });

  let currentSync = $state<SyncStatusState>({
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

  $effect(() => {
    const unsubSync = syncState.subscribe((val) => {
      currentSync = val;
    });
    const unsubOta = subscribeOtaState((state: typeof otaState) => {
      otaState = state;
    });

    syncManager.refreshPendingCount();
    getCurrentAppVersion().then((v) => {
      currentVersion = v;
    });

    return () => {
      unsubSync();
      unsubOta();
    };
  });

  async function handleAuthSubmit(e: SubmitEvent) {
    e.preventDefault();
    authFeedback = null;
    isSubmittingAuth = true;
    await hapticImpactMedium();
    try {
      await syncManager.authenticate(authMode, email, password);
      await hapticSuccess();
      password = '';
      await onSyncCompleted();
    } catch (err) {
      await hapticWarning();
      authFeedback = err instanceof Error ? err.message : 'Error de conexión';
    } finally {
      isSubmittingAuth = false;
    }
  }

  async function handleManualSync() {
    await hapticImpactMedium();
    await syncManager.syncNow();
    await onSyncCompleted();
    await hapticSuccess();
  }

  async function handleManualOtaCheck() {
    await hapticImpactMedium();
    isCheckingOta = true;
    try {
      await checkForOtaUpdates({ autoReload: false });
      if (otaState.status === 'up-to-date') {
        await hapticSuccess();
      }
    } finally {
      isCheckingOta = false;
    }
  }

  async function handleFactoryReset() {
    await hapticWarning();
    showResetModal = false;
    await resetToNativeBundle();
  }
</script>

<div class="space-y-4">
  <!-- 1. Panel de Estado de Sincronización LWW (Datos SRS) -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-4 shadow-xl">
    <div class="flex items-center justify-between">
      <div>
        <span class="px-2.5 py-0.5 rounded-full bg-[#a7f3d0]/15 text-[#a7f3d0] text-[10px] font-bold uppercase tracking-wider">
          SyncManager • LWW
        </span>
        <h2 class="text-lg font-bold text-white mt-1.5">
          Sincronización de Datos SRS
        </h2>
        <p class="text-xs text-slate-400">
          API: <code class="text-[#a7f3d0]">{OBOERU_API_BASE_URL}</code>
        </p>
      </div>

      <span class="px-3 py-1 rounded-full bg-[#171717] border border-white/10 text-[11px] font-bold text-amber-300">
        Máx {MAX_SYNC_BATCH_SIZE} / lote
      </span>
    </div>

    <!-- Métricas de Cola y LWW -->
    <div class="grid grid-cols-3 gap-2.5">
      <div class="p-3 rounded-2xl bg-[#0b0f15] border border-white/10 text-center">
        <span class="text-[10px] uppercase tracking-wider text-slate-400 block">Pendientes</span>
        <span class="text-lg font-extrabold text-amber-300">{currentSync.pendingChanges}</span>
      </div>
      <div class="p-3 rounded-2xl bg-[#0b0f15] border border-white/10 text-center">
        <span class="text-[10px] uppercase tracking-wider text-slate-400 block">Push / Pull</span>
        <span class="text-lg font-extrabold text-[#a7f3d0]">
          {currentSync.pushedCount}/{currentSync.pulledCount}
        </span>
      </div>
      <div class="p-3 rounded-2xl bg-[#0b0f15] border border-white/10 text-center">
        <span class="text-[10px] uppercase tracking-wider text-slate-400 block">LWW Omitidos</span>
        <span class="text-lg font-extrabold text-slate-200">{currentSync.skippedLwwStale}</span>
      </div>
    </div>

    <div class="text-xs text-slate-400 flex items-center justify-between px-1">
      <span>Último Delta Sync:</span>
      <span class="font-mono text-slate-200">
        {currentSync.lastSyncAt ? new Date(currentSync.lastSyncAt).toLocaleString() : 'Solo Local'}
      </span>
    </div>

    {#if currentSync.errorMessage}
      <div class="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200">
        {currentSync.errorMessage}
      </div>
    {/if}

    <button
      type="button"
      onclick={handleManualSync}
      disabled={currentSync.status === 'syncing'}
      class="w-full touch-target rounded-full bg-[#a7f3d0] hover:bg-emerald-200 disabled:opacity-50 text-slate-950 font-extrabold text-xs active-press shadow-lg flex items-center justify-center gap-2"
    >
      {#if currentSync.status === 'syncing'}
        <span>Sincronizando lotes (máx 200)...</span>
      {:else}
        <span>🔄 Sincronizar Ahora (Delta Push & Pull)</span>
      {/if}
    </button>
  </section>

  <!-- 2. Panel de Cuenta Cloud Oboeru API -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-4 shadow-xl">
    {#if currentSync.isAuthenticated}
      <div class="flex items-center justify-between">
        <div>
          <span class="text-[10px] uppercase tracking-wider text-[#a7f3d0] font-bold">
            Sesión Cloud Activa
          </span>
          <p class="text-sm font-bold text-white mt-0.5">{currentSync.userEmail}</p>
        </div>

        <button
          type="button"
          onclick={() => syncManager.logout()}
          class="touch-target px-4 py-2 rounded-full bg-[#171717] border border-white/10 text-rose-300 text-xs font-bold active-press"
        >
          Cerrar sesión
        </button>
      </div>
    {:else}
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-bold text-white">
          Conectar cuenta Cloud (Opcional)
        </h3>
        <div class="flex rounded-full bg-[#0b0f15] p-1 border border-white/10 text-[11px]">
          <button
            type="button"
            onclick={() => (authMode = 'login')}
            class="px-3 py-1 rounded-full font-bold {authMode === 'login' ? 'bg-[#a7f3d0] text-slate-950' : 'text-slate-400'}"
          >
            Login
          </button>
          <button
            type="button"
            onclick={() => (authMode = 'register')}
            class="px-3 py-1 rounded-full font-bold {authMode === 'register' ? 'bg-[#a7f3d0] text-slate-950' : 'text-slate-400'}"
          >
            Registro
          </button>
        </div>
      </div>

      <form onsubmit={handleAuthSubmit} class="space-y-3">
        <input
          type="email"
          bind:value={email}
          required
          placeholder="tu@email.com"
          enterkeyhint="next"
          class="w-full h-12 px-4 rounded-2xl bg-[#0b0f15] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:border-[#a7f3d0] focus:outline-none"
        />
        <input
          type="password"
          bind:value={password}
          required
          minlength="8"
          placeholder="Contraseña (mín. 8 caracteres)"
          enterkeyhint="done"
          class="w-full h-12 px-4 rounded-2xl bg-[#0b0f15] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:border-[#a7f3d0] focus:outline-none"
        />

        {#if authFeedback}
          <p class="text-xs text-rose-400">{authFeedback}</p>
        {/if}

        <button
          type="submit"
          disabled={isSubmittingAuth}
          class="w-full touch-target rounded-full bg-[#171717] border border-[#a7f3d0]/40 text-[#a7f3d0] font-bold text-xs active-press"
        >
          {isSubmittingAuth
            ? 'Autenticando...'
            : authMode === 'login'
              ? 'Iniciar Sesión y Sincronizar'
              : 'Crear Cuenta en Oboeru Cloud'}
        </button>
      </form>
    {/if}
  </section>

  <!-- 3. Centro de Actualizaciones OTA (Capgo + Cloudflare Worker Multi-Tenant) -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-4 shadow-xl">
    <div class="flex items-center justify-between">
      <div>
        <span class="px-2.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
          Capgo OTA • Cloudflare Worker
        </span>
        <h3 class="text-base font-bold text-white mt-1.5">
          Actualizaciones Over-The-Air
        </h3>
      </div>
      <span class="text-xs font-mono font-bold text-[#a7f3d0]">v{currentVersion}</span>
    </div>

    <div class="p-2.5 rounded-xl bg-[#0b0f15] border border-white/10 text-[11px] font-mono text-[#a7f3d0] break-all select-text">
      mobile-ota-updater.fede-eagle.workers.dev/{DEFAULT_APP_NAME}/version
    </div>

    <div class="space-y-1.5 bg-[#0b0f15] p-3.5 rounded-2xl border border-white/10 text-xs">
      <div class="flex justify-between">
        <span class="text-slate-400">Estado del canal OTA:</span>
        <span class="font-bold text-[#a7f3d0] capitalize">{otaState.status}</span>
      </div>
      {#if otaState.availableVersion}
        <div class="flex justify-between">
          <span class="text-slate-400">Versión detectada:</span>
          <span class="font-bold text-amber-300">v{otaState.availableVersion}</span>
        </div>
      {/if}
    </div>

    <div class="flex gap-2.5">
      <button
        type="button"
        onclick={handleManualOtaCheck}
        disabled={isCheckingOta}
        class="flex-1 touch-target rounded-full bg-[#171717] border border-[#a7f3d0]/30 text-[#a7f3d0] font-bold text-xs active-press"
      >
        {isCheckingOta ? 'Consultando Worker...' : 'Buscar OTA Ahora'}
      </button>

      {#if otaState.updateReadyToApply}
        <button
          type="button"
          onclick={() => reloadApp()}
          class="touch-target px-4 rounded-full bg-[#a7f3d0] text-slate-950 font-extrabold text-xs active-press"
        >
          Aplicar
        </button>
      {/if}
    </div>

    <button
      type="button"
      onclick={() => (showResetModal = true)}
      class="w-full touch-target rounded-full bg-[#171717] border border-rose-500/20 text-rose-300/90 text-xs font-semibold active-press"
    >
      Restaurar Bundle Nativo de Fábrica (Rollback)
    </button>
  </section>

  {#if showResetModal}
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-5">
      <div class="bg-[#121820] max-w-sm w-full p-5 rounded-3xl border border-rose-500/30 space-y-4">
        <h3 class="text-base font-bold text-white">¿Restaurar a versión de fábrica?</h3>
        <p class="text-xs text-slate-300 leading-relaxed">
          Esto revertirá cualquier bundle OTA descargado y ejecutará la versión compilada en el APK original. Tus repasos locales en IndexedDB/SQLite se mantienen intactos.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            onclick={() => (showResetModal = false)}
            class="flex-1 touch-target rounded-full bg-[#171717] border border-white/10 text-slate-300 font-semibold text-xs active-press"
          >
            Cancelar
          </button>
          <button
            type="button"
            onclick={handleFactoryReset}
            class="flex-1 touch-target rounded-full bg-rose-600 text-white font-bold text-xs active-press"
          >
            Confirmar Rollback
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
