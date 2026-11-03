import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { App } from '@capacitor/app';
import { writable } from 'svelte/store';

/**
 * Build-time version injected from package.json via astro.config.mjs
 */
const initialBuildVersion = typeof import.meta !== 'undefined' && import.meta.env?.PUBLIC_APP_VERSION
  ? String(import.meta.env.PUBLIC_APP_VERSION).replace(/^v/i, '')
  : '1.0.0';

/**
 * Reactive Svelte store containing the active version string (e.g. "1.0.1").
 * Automatically updates when an OTA bundle is detected or applied.
 */
export const appVersion = writable(initialBuildVersion);

/**
 * Default OTA configuration
 * IMPORTANT: `DEFAULT_APP_NAME` must match the exact GitHub repository name
 * so the Cloudflare Worker can resolve `GET /:repo/version` and `GET /:repo/download`.
 */
export const DEFAULT_APP_NAME = 'oboeru-mobile';
export const DEFAULT_WORKER_URL = 'https://mobile-ota-updater.fede-eagle.workers.dev';

const subscribers = new Set();

let currentState = {
  status: 'idle',
  currentVersion: initialBuildVersion,
  availableVersion: null,
  availableUpdateData: null,
  downloadProgress: 0,
  error: null,
  updateReadyToApply: false
};

function updateState(partial) {
  currentState = { ...currentState, ...partial };
  subscribers.forEach((cb) => {
    try {
      cb(currentState);
    } catch (e) {
      console.error('[OTA] Error in state subscriber:', e);
    }
  });
}

export function subscribeOtaState(callback) {
  subscribers.add(callback);
  callback(currentState);
  return () => {
    subscribers.delete(callback);
  };
}

export function getOtaState() {
  return currentState;
}

/**
 * Confirms to Capgo that the application loaded successfully.
 * CRITICAL: Must be invoked during app initialization (e.g. Svelte onMount)
 * to prevent Capgo from rolling back to the previous bundle.
 */
export async function notifyAppReady() {
  if (!Capacitor.isNativePlatform()) {
    console.log('[OTA] Web environment detected: skipping notifyAppReady.');
    return;
  }

  try {
    await CapacitorUpdater.notifyAppReady();
    await getAppVersionInfo();
    console.log('[OTA] ✅ Capgo notifyAppReady() confirmed successfully. Rollback avoided.');
  } catch (error) {
    console.warn('[OTA] ⚠️ notifyAppReady failed or not in Capgo container:', error);
  }
}

/**
 * Resolves comprehensive version metadata (distinguishing Native 'builtin' vs OTA bundle vs Web)
 */
export async function getAppVersionInfo() {
  const buildVersion = (import.meta.env?.PUBLIC_APP_VERSION || '1.0.0').replace(/^v/i, '');

  if (!Capacitor.isNativePlatform()) {
    appVersion.set(buildVersion);
    return {
      version: buildVersion,
      isOta: false,
      channel: 'web',
      bundleId: null,
      formatted: `v${buildVersion} (Web)`
    };
  }

  let nativeVersion = buildVersion;
  try {
    const appInfo = await App.getInfo();
    if (appInfo?.version && appInfo.version !== '1.0') {
      nativeVersion = appInfo.version.replace(/^v/i, '');
    }
  } catch {
    // Keep buildVersion fallback
  }

  let resolvedInfo = null;

  try {
    const current = await CapacitorUpdater.current();
    const bundleId = current?.bundle?.id;
    const bundleVer = current?.bundle?.version;

    // In @capgo/capacitor-updater v8, the factory APK bundle reports id='builtin' and version='builtin'
    const isBuiltinBundle =
      !bundleId ||
      bundleId === 'builtin' ||
      bundleId === 'default' ||
      bundleVer === 'builtin';

    if (!isBuiltinBundle) {
      const cleanOtaVersion =
        bundleVer && bundleVer !== 'builtin'
          ? String(bundleVer).replace(/^v/i, '')
          : buildVersion;

      resolvedInfo = {
        version: cleanOtaVersion,
        isOta: true,
        channel: 'ota',
        bundleId,
        nativeVersion,
        formatted: `v${cleanOtaVersion} (OTA)`
      };
    }
  } catch {
    // Fallback if current() throws
  }

  if (!resolvedInfo) {
    resolvedInfo = {
      version: buildVersion,
      isOta: false,
      channel: 'native',
      bundleId: 'builtin',
      nativeVersion,
      formatted: `v${buildVersion} (Base)`
    };
  }

  appVersion.set(resolvedInfo.version);
  return resolvedInfo;
}

export async function refreshAppVersion() {
  const info = await getAppVersionInfo();
  return info.version;
}

export async function getCurrentAppVersion() {
  const info = await getAppVersionInfo();
  return info.version;
}

/**
 * Resolves the SHA-256 checksum required by @capgo/capacitor-updater v8 on Android.
 * Checks the worker payload, downloads and hashes the bundle in memory, or inspects release metadata.
 */
async function resolveChecksum(bundleUrl, latestVersion, providedChecksum) {
  if (providedChecksum && typeof providedChecksum === 'string' && providedChecksum.trim()) {
    const clean = providedChecksum.trim().replace(/^sha256:/i, '').toLowerCase();
    if (/^[a-f0-9]{64}$/.test(clean)) {
      return clean;
    }
  }

  // Strategy 1: Fetch the small bundle (dist.zip is ~80KB) and hash via Web Crypto API
  try {
    const res = await fetch(bundleUrl, { method: 'GET' });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (buf && buf.byteLength > 0 && typeof crypto !== 'undefined' && crypto.subtle) {
        const hashBuf = await crypto.subtle.digest('SHA-256', buf);
        const hashHex = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .toLowerCase();
        if (hashHex && hashHex.length === 64) {
          console.log(`[OTA] 🔑 Computed SHA-256 checksum for v${latestVersion}: ${hashHex}`);
          return hashHex;
        }
      }
    }
  } catch (err) {
    console.warn('[OTA] Direct SHA-256 computation failed, trying fallback sources:', err);
  }

  // Strategy 2: Fetch companion .sha256 file
  try {
    const shaRes = await fetch(`${bundleUrl}.sha256`, { method: 'GET' });
    if (shaRes.ok) {
      const shaText = (await shaRes.text()).trim();
      const match = shaText.match(/[a-fA-F0-9]{64}/);
      if (match) {
        console.log(`[OTA] 🔑 Found companion SHA-256 for v${latestVersion}: ${match[0].toLowerCase()}`);
        return match[0].toLowerCase();
      }
    }
  } catch (err) {
    console.warn('[OTA] Companion .sha256 fetch failed:', err);
  }

  // Strategy 3: Query GitHub Releases API for dist.zip digest
  try {
    const cleanTag = latestVersion.startsWith('v') ? latestVersion : `v${latestVersion}`;
    const ghRes = await fetch(
      `https://api.github.com/repos/Fede-F/oboeru-mobile/releases/tags/${encodeURIComponent(cleanTag)}`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      const distAsset = ghData.assets?.find((a) => a.name === 'dist.zip');
      if (distAsset?.digest) {
        const hash = distAsset.digest.replace(/^sha256:/i, '').trim().toLowerCase();
        if (/^[a-f0-9]{64}$/.test(hash)) {
          console.log(`[OTA] 🔑 Resolved SHA-256 from GitHub Release digest: ${hash}`);
          return hash;
        }
      }
    }
  } catch (err) {
    console.warn('[OTA] GitHub Releases API digest lookup failed:', err);
  }

  return null;
}

/**
 * Only checks for available updates against the Cloudflare Worker endpoint (GET /:repo/version)
 * without initiating the download automatically.
 */
export async function checkAvailableUpdate(config = {}) {
  const appName = config.appName || DEFAULT_APP_NAME;
  const workerBaseUrl = (config.workerBaseUrl || DEFAULT_WORKER_URL).replace(/\/$/, '');
  const timeoutMs = config.timeoutMs ?? 15000;

  if (!Capacitor.isNativePlatform()) {
    const currentVersion = await getCurrentAppVersion();
    updateState({
      status: 'up-to-date',
      currentVersion,
      availableVersion: null,
      availableUpdateData: null,
      error: null
    });
    return { updateAvailable: false, version: currentVersion, currentVersion };
  }

  try {
    updateState({ status: 'checking', error: null });
    const currentVersion = await getCurrentAppVersion();
    const currentClean = String(currentVersion).replace(/^v/i, '');
    updateState({ currentVersion: currentClean });

    const endpoint = `${workerBaseUrl}/${encodeURIComponent(appName)}/version`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} en ${endpoint}`);
    }

    const data = await response.json();
    const rawVersion = data.version || data.latestVersion || '';
    const latestVersion = String(rawVersion).replace(/^v/i, '');
    const bundleUrl = data.downloadUrl || data.url || data.bundleUrl;

    if (!latestVersion || !bundleUrl || latestVersion === currentClean) {
      updateState({
        status: 'up-to-date',
        currentVersion: currentClean,
        availableVersion: null,
        availableUpdateData: null,
        error: null
      });
      return { updateAvailable: false, version: currentClean, currentVersion: currentClean };
    }

    const updateData = {
      version: latestVersion,
      currentVersion: currentClean,
      bundleUrl,
      checksum: data.checksum
    };

    updateState({
      status: 'available',
      availableVersion: latestVersion,
      availableUpdateData: updateData,
      downloadProgress: 0,
      error: null,
      updateReadyToApply: false
    });

    return {
      updateAvailable: true,
      currentVersion: currentClean,
      version: latestVersion,
      bundleUrl,
      checksum: data.checksum
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[OTA] ❌ Check update failed:', errorMsg);
    updateState({
      status: 'error',
      error: errorMsg,
      updateReadyToApply: false
    });
    return { updateAvailable: false, error: errorMsg };
  }
}

/**
 * Downloads and stages the bundle for an available update.
 * If autoReload is true, immediately restarts the app so the new bundle takes effect.
 */
export async function downloadAndApplyUpdate(updateInfo = null, { autoReload = true } = {}) {
  const target = updateInfo || currentState.availableUpdateData;
  const latestVersion = target?.version || currentState.availableVersion;
  const bundleUrl = target?.bundleUrl;
  const rawChecksum = target?.checksum;

  if (!latestVersion || !bundleUrl) {
    throw new Error('No se encontró información del paquete de actualización para descargar.');
  }

  if (!Capacitor.isNativePlatform()) {
    console.log('[OTA] Simulating download & apply on web...');
    updateState({
      status: 'ready',
      availableVersion: latestVersion,
      updateReadyToApply: true,
      downloadProgress: 100,
      error: null
    });
    if (autoReload) {
      await reloadApp();
    }
    return { id: latestVersion };
  }

  try {
    updateState({
      status: 'downloading',
      availableVersion: latestVersion,
      downloadProgress: 0,
      error: null
    });

    const checksum = await resolveChecksum(bundleUrl, latestVersion, rawChecksum);
    if (!checksum) {
      throw new Error('No se pudo verificar el checksum SHA-256 del paquete OTA.');
    }

    const downloadOpts = {
      url: bundleUrl,
      version: latestVersion,
      checksum
    };

    console.log(`[OTA] 📥 Iniciando descarga de v${latestVersion} (checksum: ${checksum})...`);
    const bundle = await CapacitorUpdater.download(downloadOpts);
    console.log(`[OTA] ✅ Descarga completa. Bundle ID:`, bundle?.id);

    // Configurar bundle para activarse de inmediato o en próximo reinicio
    await CapacitorUpdater.next({ id: bundle?.id || latestVersion });

    updateState({
      status: 'ready',
      availableVersion: latestVersion,
      updateReadyToApply: true,
      downloadProgress: 100,
      error: null
    });

    if (autoReload) {
      await reloadApp();
    }

    return bundle;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[OTA] ❌ Falló la descarga/aplicación de la actualización:', errorMsg);
    updateState({
      status: 'error',
      error: errorMsg,
      updateReadyToApply: false
    });
    throw error;
  }
}

/**
 * Check for updates against the Cloudflare Worker endpoint (GET /:repo/version).
 * By default downloads immediately unless `downloadImmediately: false` is provided.
 */
export async function checkForOtaUpdates(config = {}) {
  const downloadImmediately = config.downloadImmediately ?? true;
  const checkRes = await checkAvailableUpdate(config);

  if (!checkRes.updateAvailable || !downloadImmediately) {
    return checkRes;
  }

  try {
    const bundle = await downloadAndApplyUpdate(checkRes, {
      autoReload: config.autoReload ?? false
    });
    return {
      updateAvailable: true,
      version: checkRes.version,
      bundleUrl: checkRes.bundleUrl,
      bundle
    };
  } catch (error) {
    return { updateAvailable: false, error: String(error) };
  }
}

export async function reloadApp() {
  if (!Capacitor.isNativePlatform()) {
    window.location.reload();
    return;
  }

  try {
    await CapacitorUpdater.reload();
  } catch {
    window.location.reload();
  }
}

export async function resetToNativeBundle() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await CapacitorUpdater.reset();
    await reloadApp();
  } catch (error) {
    console.error('[OTA] Reset bundle failed:', error);
  }
}
