<script lang="ts">
  import {
    syncManager,
    syncState,
    type SyncNetworkPolicy,
    type SyncStatusState
  } from '../lib/sync/SyncManager';
  import {
    checkAvailableUpdate,
    downloadAndApplyUpdate,
    getCurrentAppVersion,
    reloadApp,
    subscribeOtaState
  } from '../lib/otaUpdater.js';
  import {
    hapticImpactMedium,
    hapticSelection,
    hapticSuccess,
    hapticWarning
  } from '../lib/haptics.js';
  import VersionBadge from './VersionBadge.svelte';

  interface Props {
    onSyncCompleted: () => Promise<void>;
  }

  let { onSyncCompleted }: Props = $props();

  let currentVersion = $state('1.0.0');
  let isCheckingOta = $state(false);
  let isDownloadingOta = $state(false);

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
    userFullName: null,
    errorMessage: null,
    networkPolicy: 'wifi_only',
    networkType: 'wifi'
  });

  $effect(() => {
    const unsubSync = syncState.subscribe((val) => {
      currentSync = val;
    });
    const unsubOta = subscribeOtaState((state: typeof otaState) => {
      otaState = state;
    });

    syncManager.refreshNetworkInfo();
    syncManager.refreshPendingCount();
    getCurrentAppVersion().then((v) => {
      currentVersion = v;
    });

    return () => {
      unsubSync();
      unsubOta();
    };
  });

  async function handleChangeNetworkPolicy(policy: SyncNetworkPolicy) {
    if (currentSync.networkPolicy === policy) return;
    await hapticSelection();
    syncManager.setNetworkPolicy(policy);
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
      const res = await checkAvailableUpdate();
      if (res.updateAvailable) {
        await hapticSuccess();
      } else if (otaState.status === 'up-to-date') {
        await hapticSuccess();
      }
    } finally {
      isCheckingOta = false;
    }
  }

  async function handleDownloadUpdate() {
    await hapticImpactMedium();
    isDownloadingOta = true;
    try {
      await downloadAndApplyUpdate(null, { autoReload: true });
      await hapticSuccess();
    } catch (e) {
      await hapticWarning();
    } finally {
      isDownloadingOta = false;
    }
  }

  async function handleApplyUpdate() {
    await hapticSuccess();
    await reloadApp();
  }

  async function handleLogout() {
    await hapticImpactMedium();
    await syncManager.logout();
  }
</script>

<div class="space-y-4">
  <!-- 1. Perfil del Usuario Activo -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-3 shadow-xl">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#43534a] to-[#1a231f] border border-[#a7f3d0]/30 flex items-center justify-center text-[#a7f3d0] font-extrabold text-base shrink-0">
          {(currentSync.userFullName || currentSync.userEmail || 'U').charAt(0).toUpperCase()}
        </div>
        <div class="min-w-0">
          <span class="text-[10px] uppercase tracking-wider text-[#a7f3d0] font-bold block">
            Tu Cuenta
          </span>
          <p class="text-base font-bold text-white truncate">
            {currentSync.userFullName || 'Usuario de Oboeru'}
          </p>
          <p class="text-xs text-slate-400 truncate">
            {currentSync.userEmail}
          </p>
        </div>
      </div>

      <button
        type="button"
        onclick={handleLogout}
        class="touch-target px-4 py-2 rounded-full bg-[#171717] border border-rose-500/25 text-rose-300 text-xs font-bold active-press shrink-0"
      >
        Cerrar sesión
      </button>
    </div>
  </section>

  <!-- 2. Panel de Estado de Sincronización -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-4 shadow-xl">
    <div class="flex items-center justify-between">
      <div>
        <span class="px-2.5 py-0.5 rounded-full bg-[#a7f3d0]/15 text-[#a7f3d0] text-[10px] font-bold uppercase tracking-wider">
          Respaldo en la Nube
        </span>
        <h2 class="text-lg font-bold text-white mt-1.5">
          Tu Progreso de Estudio
        </h2>
        <p class="text-xs text-slate-400">
          Tus repasos y mazos se guardan automáticamente en tu cuenta.
        </p>
      </div>
    </div>

    <!-- Métricas de Sincronización -->
    <div class="grid grid-cols-3 gap-2.5">
      <div class="p-3 rounded-2xl bg-[#0b0f15] border border-white/10 text-center">
        <span class="text-[10px] uppercase tracking-wider text-slate-400 block">Por guardar</span>
        <span class="text-lg font-extrabold text-amber-300">{currentSync.pendingChanges}</span>
      </div>
      <div class="p-3 rounded-2xl bg-[#0b0f15] border border-white/10 text-center">
        <span class="text-[10px] uppercase tracking-wider text-slate-400 block">Subidos</span>
        <span class="text-lg font-extrabold text-[#a7f3d0]">
          {currentSync.pushedCount}
        </span>
      </div>
      <div class="p-3 rounded-2xl bg-[#0b0f15] border border-white/10 text-center">
        <span class="text-[10px] uppercase tracking-wider text-slate-400 block">Recibidos</span>
        <span class="text-lg font-extrabold text-slate-200">{currentSync.pulledCount}</span>
      </div>
    </div>

    <!-- Preferencia de Conexión para Sincronización Automática -->
    <div class="rounded-2xl bg-[#0b0f15] border border-white/10 p-3.5 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <span class="text-xs font-bold text-white block">
            Sincronización automática
          </span>
          <span class="text-[11px] text-slate-400">
            Elegí cuándo sincronizar tu progreso en segundo plano
          </span>
        </div>
        <span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-semibold text-slate-300 shrink-0">
          {currentSync.networkType === 'wifi'
            ? 'Wi-Fi activo'
            : currentSync.networkType === 'metered'
              ? 'Datos móviles'
              : 'Sin conexión'}
        </span>
      </div>

      <div
        role="group"
        aria-label="Preferencia de red para sincronización automática"
        class="grid grid-cols-2 gap-2"
      >
        <button
          type="button"
          onclick={() => handleChangeNetworkPolicy('wifi_only')}
          aria-pressed={currentSync.networkPolicy === 'wifi_only'}
          class="touch-target px-3 py-2.5 rounded-xl border text-left transition-all active-press flex flex-col justify-between {currentSync.networkPolicy === 'wifi_only'
            ? 'bg-[#1c2b25] border-[#a7f3d0] text-white'
            : 'bg-[#141920] border-white/10 text-slate-400 hover:text-slate-200'}"
        >
          <span class="text-xs font-bold {currentSync.networkPolicy === 'wifi_only' ? 'text-[#a7f3d0]' : 'text-slate-200'}">
            Solo con Wi-Fi
          </span>
          <span class="text-[10px] text-slate-400 mt-0.5 leading-snug">
            Pregunta antes de usar datos móviles
          </span>
        </button>

        <button
          type="button"
          onclick={() => handleChangeNetworkPolicy('always')}
          aria-pressed={currentSync.networkPolicy === 'always'}
          class="touch-target px-3 py-2.5 rounded-xl border text-left transition-all active-press flex flex-col justify-between {currentSync.networkPolicy === 'always'
            ? 'bg-[#1c2b25] border-[#a7f3d0] text-white'
            : 'bg-[#141920] border-white/10 text-slate-400 hover:text-slate-200'}"
        >
          <span class="text-xs font-bold {currentSync.networkPolicy === 'always' ? 'text-[#a7f3d0]' : 'text-slate-200'}">
            Wi-Fi y datos móviles
          </span>
          <span class="text-[10px] text-slate-400 mt-0.5 leading-snug">
            Sincroniza siempre automáticamente
          </span>
        </button>
      </div>
    </div>

    <div class="text-xs text-slate-400 flex items-center justify-between px-1">
      <span>Última sincronización:</span>
      <span class="font-mono text-slate-200">
        {currentSync.lastSyncAt ? new Date(currentSync.lastSyncAt).toLocaleString() : 'Guardado en este dispositivo'}
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
        <span>Guardando tu progreso...</span>
      {:else}
        <span>🔄 Sincronizar progreso ahora</span>
      {/if}
    </button>
  </section>

  <!-- 3. Centro de Actualizaciones de la App -->
  <section class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-4 shadow-xl">
    <div class="flex items-center justify-between">
      <div>
        <span class="px-2.5 py-0.5 rounded-full bg-amber-400/15 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
          Versión de la App
        </span>
        <h3 class="text-base font-bold text-white mt-1.5">
          Actualizaciones
        </h3>
      </div>
      <span class="text-xs font-mono font-bold text-[#a7f3d0]">v{currentVersion}</span>
    </div>

    <div class="space-y-2 bg-[#0b0f15] p-3.5 rounded-2xl border border-white/10 text-xs">
      <div class="flex justify-between items-center">
        <span class="text-slate-400">Estado:</span>
        <span class="font-bold {otaState.status === 'error' ? 'text-rose-400' : otaState.status === 'downloading' ? 'text-amber-300' : otaState.status === 'checking' ? 'text-slate-300' : 'text-[#a7f3d0]'}">
          {otaState.status === 'up-to-date'
            ? 'Al día'
            : otaState.status === 'checking'
              ? 'Buscando...'
              : otaState.status === 'available'
                ? 'Actualización disponible'
                : otaState.status === 'downloading'
                  ? 'Descargando actualización...'
                  : otaState.status === 'ready'
                    ? 'Lista para aplicar'
                    : otaState.status === 'error'
                      ? 'Error al comprobar/descargar'
                      : 'Al día'}
        </span>
      </div>
      {#if otaState.availableVersion && otaState.availableVersion !== currentVersion}
        <div class="flex justify-between items-center">
          <span class="text-slate-400">Nueva versión:</span>
          <span class="font-bold text-amber-300">v{otaState.availableVersion}</span>
        </div>
      {/if}
      {#if otaState.error}
        <div class="pt-1.5 border-t border-rose-500/20 text-rose-300 text-[11px] leading-tight">
          {otaState.error}
        </div>
      {/if}
    </div>

    <div class="space-y-2.5">
      {#if otaState.updateReadyToApply}
        <button
          type="button"
          onclick={handleApplyUpdate}
          class="w-full touch-target rounded-full bg-[#a7f3d0] hover:bg-emerald-200 text-slate-950 font-extrabold text-xs active-press shadow-lg flex items-center justify-center gap-2 py-3"
        >
          <span>🚀 Reiniciar y aplicar v{otaState.availableVersion || 'nueva'}</span>
        </button>
      {:else if otaState.status === 'available'}
        <button
          type="button"
          onclick={handleDownloadUpdate}
          disabled={isDownloadingOta}
          class="w-full touch-target rounded-full bg-[#a7f3d0] hover:bg-emerald-200 text-slate-950 font-extrabold text-xs active-press shadow-lg flex items-center justify-center gap-2 py-3"
        >
          {#if isDownloadingOta}
            <span>Descargando v{otaState.availableVersion}...</span>
          {:else}
            <span>⬇️ Descargar y aplicar v{otaState.availableVersion}</span>
          {/if}
        </button>
      {/if}

      <button
        type="button"
        onclick={handleManualOtaCheck}
        disabled={isCheckingOta || isDownloadingOta}
        class="w-full touch-target rounded-full bg-[#171717] border border-[#a7f3d0]/30 text-[#a7f3d0] font-bold text-xs active-press flex items-center justify-center gap-2"
      >
        {isCheckingOta ? 'Buscando actualizaciones...' : 'Buscar actualizaciones'}
      </button>
    </div>
  </section>

  <!-- Indicador de Versión (exclusivo en la sección Cuenta) -->
  <div class="pt-1">
    <VersionBadge variant="footer" />
  </div>
</div>
