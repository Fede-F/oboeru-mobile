import { writable } from 'svelte/store';
import type {
  SrsReviewRecord,
  SrsState,
  StudyLogRecord,
  UserDeckRecord,
  VocabularyRecord
} from '../db/schema';
import {
  clearDirtyFlags,
  clearDirtyStudyLogFlags,
  clearDirtyUserDeckFlags,
  clearPersistedSession,
  getAllReviews,
  getAllVocabulary,
  getDirtyReviews,
  getDirtyStudyLogs,
  getDirtyUserDecks,
  getVocabularyCount,
  loadPersistedSession,
  LOCAL_DEFAULT_USER_ID,
  migrateLegacySeedData,
  savePersistedSession,
  searchLocalVocabulary,
  upsertReviewsBatchLWW,
  upsertStudyLogsBatchLWW,
  upsertUserDecksBatchLWW,
  upsertVocabularyBatch
} from '../db/database';
import { convertSearchQueryToKana, normalizeVocabularyRecord } from '../utils/japanese';
import { getDeconjugatedCandidates } from '../utils/conjugator';

export const OBOERU_API_BASE_URL = 'https://oboeru-api.planner.ar';
export const MAX_SYNC_BATCH_SIZE = 200;

export type SyncNetworkPolicy = 'wifi_only' | 'always';
export type DetectedNetworkType = 'wifi' | 'metered' | 'offline';

interface NavigatorConnectionLike {
  type?: string;
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
}

const STORAGE_KEYS = {
  AUTH_TOKEN: 'oboeru_jwt_token',
  USER_PROFILE: 'oboeru_user_profile',
  LAST_SYNC_AT: 'oboeru_last_sync_at',
  SYNC_NETWORK_POLICY: 'oboeru_sync_network_policy'
} as const;

export interface SyncStatusState {
  status: 'idle' | 'syncing' | 'success' | 'offline' | 'error';
  lastSyncAt: string | null;
  pendingChanges: number;
  pushedCount: number;
  pulledCount: number;
  skippedLwwStale: number;
  isAuthenticated: boolean;
  userEmail: string | null;
  userFullName: string | null;
  errorMessage: string | null;
  networkPolicy: SyncNetworkPolicy;
  networkType: DetectedNetworkType;
}

export const syncState = writable<SyncStatusState>({
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

/**
 * Divide un array en lotes estrictos de máximo 200 registros (MAX_SYNC_BATCH_SIZE)
 */
export function chunkBatch<T>(items: T[], batchSize: number = MAX_SYNC_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push(items.slice(i, i + batchSize));
  }
  return chunks;
}

export class SyncManager {
  private baseUrl: string;
  private isRunning = false;

  constructor(baseUrl: string = OBOERU_API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    if (typeof window !== 'undefined') {
      this.hydrateStoredMeta();
      window.addEventListener('online', () => {
        this.refreshNetworkInfo();
        this.tryAutoSync().catch(() => {});
      });
      window.addEventListener('offline', () => {
        this.refreshNetworkInfo();
        this.refreshPendingCount('offline');
      });

      const conn = this.getNavigatorConnection();
      if (conn && typeof conn.addEventListener === 'function') {
        conn.addEventListener('change', () => {
          this.refreshNetworkInfo();
          this.tryAutoSync().catch(() => {});
        });
      }
    }
  }

  private getNavigatorConnection(): NavigatorConnectionLike | null {
    if (typeof navigator === 'undefined') return null;
    const nav = navigator as Navigator & {
      connection?: NavigatorConnectionLike;
      mozConnection?: NavigatorConnectionLike;
      webkitConnection?: NavigatorConnectionLike;
    };
    return nav.connection || nav.mozConnection || nav.webkitConnection || null;
  }

  /**
   * Detecta el estado actual de red:
   * - 'offline': sin conexión
   * - 'metered': red celular / medida (LTE, 5G, 4G, 3G, wimax, o modo ahorro de datos saveData)
   * - 'wifi': Wi-Fi, Ethernet o conexión no medida
   */
  public detectNetworkType(): DetectedNetworkType {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return 'offline';
    }
    const conn = this.getNavigatorConnection();
    if (!conn) {
      return 'wifi';
    }
    const connType = (conn.type || '').toLowerCase();
    if (connType === 'none') {
      return 'offline';
    }
    if (
      connType === 'cellular' ||
      connType === 'wimax' ||
      connType === 'bluetooth' ||
      Boolean(conn.saveData)
    ) {
      return 'metered';
    }
    return 'wifi';
  }

  public refreshNetworkInfo(): DetectedNetworkType {
    const netType = this.detectNetworkType();
    syncState.update((s) => ({
      ...s,
      networkType: netType
    }));
    return netType;
  }

  public getNetworkPolicy(): SyncNetworkPolicy {
    if (typeof window === 'undefined') return 'wifi_only';
    const raw = localStorage.getItem(STORAGE_KEYS.SYNC_NETWORK_POLICY);
    return raw === 'always' ? 'always' : 'wifi_only';
  }

  public setNetworkPolicy(policy: SyncNetworkPolicy): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.SYNC_NETWORK_POLICY, policy);
    }
    syncState.update((s) => ({
      ...s,
      networkPolicy: policy
    }));
    if (policy === 'always') {
      this.tryAutoSync().catch(() => {});
    }
  }

  /**
   * Sincronización automática inteligente:
   * - Si la red es Wi-Fi (o la preferencia del usuario es 'always'), sincroniza automáticamente.
   * - Si la red es medida (LTE / 5G) y la preferencia es 'wifi_only', actualiza el contador de pendientes
   *   para que el ícono del header avise en ámbar y espere confirmación al tocarlo.
   */
  public async tryAutoSync(): Promise<{
    synced: boolean;
    reason?: 'offline' | 'metered_blocked';
  }> {
    const netType = this.refreshNetworkInfo();
    if (netType === 'offline') {
      await this.refreshPendingCount('offline');
      return { synced: false, reason: 'offline' };
    }

    const policy = this.getNetworkPolicy();
    if (netType === 'metered' && policy === 'wifi_only') {
      await this.refreshPendingCount();
      return { synced: false, reason: 'metered_blocked' };
    }

    await this.syncNow();
    return { synced: true };
  }

  private hydrateStoredMeta(): void {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const lastSyncAt = localStorage.getItem(STORAGE_KEYS.LAST_SYNC_AT);
    const profileRaw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    const networkPolicy = this.getNetworkPolicy();
    const networkType = this.detectNetworkType();
    let userEmail: string | null = null;
    let userFullName: string | null = null;
    try {
      if (profileRaw) {
        const parsed = JSON.parse(profileRaw);
        userEmail = parsed.email ?? null;
        userFullName = parsed.fullName ?? parsed.full_name ?? null;
      }
    } catch {
      userEmail = null;
      userFullName = null;
    }

    syncState.update((s) => ({
      ...s,
      lastSyncAt,
      isAuthenticated: Boolean(token),
      userEmail,
      userFullName,
      networkPolicy,
      networkType
    }));
  }

  /**
   * Restaura la sesión desde IndexedDB si localStorage fue limpiado por el sistema operativo
   * al cerrar y volver a abrir la app.
   */
  public async ensureSessionHydrated(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const existingToken = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (existingToken) {
      this.hydrateStoredMeta();
      return true;
    }

    try {
      const persisted = await loadPersistedSession();
      if (persisted?.token && persisted?.user) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, persisted.token);
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(persisted.user));
        this.hydrateStoredMeta();
        return true;
      }
    } catch {
      // Continuar sin sesión previa
    }
    return false;
  }

  public getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  public getUserId(): string {
    if (typeof window === 'undefined') return LOCAL_DEFAULT_USER_ID;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.id) return String(parsed.id);
      }
    } catch {
      // Fallback a ID local offline
    }
    return LOCAL_DEFAULT_USER_ID;
  }

  public async refreshPendingCount(
    overrideStatus?: SyncStatusState['status']
  ): Promise<number> {
    const userId = this.getUserId();
    const [dirtyReviews, dirtyDecks, dirtyLogs] = await Promise.all([
      getDirtyReviews(),
      getDirtyUserDecks(),
      getDirtyStudyLogs(userId)
    ]);
    const totalPending = dirtyReviews.length + dirtyDecks.length + dirtyLogs.length;
    syncState.update((s) => ({
      ...s,
      pendingChanges: totalPending,
      status: overrideStatus ?? s.status
    }));
    return totalPending;
  }

  /**
   * Registro o Login contra https://oboeru-api.planner.ar/api/v1/auth/{login|register}
   * Guarda el usuario en la base de datos del servidor y persiste la sesión localmente
   * en localStorage + IndexedDB para que nunca tenga que volver a loguearse al reabrir la app.
   */
  public async authenticate(
    mode: 'login' | 'register',
    email: string,
    password: string,
    fullName: string = ''
  ): Promise<{ token: string; user: { id: string; fullName: string; email: string } }> {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (mode === 'register' && trimmedName.length < 2) {
      throw new Error('Ingresá tu nombre (mínimo 2 caracteres).');
    }

    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      throw new Error('Ingresá un correo electrónico válido.');
    }

    if (!password || password.length < 8) {
      throw new Error('La contraseña debe tener al menos 8 caracteres.');
    }

    const res = await fetch(`${this.baseUrl}/api/v1/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: trimmedName,
        full_name: trimmedName,
        email: normalizedEmail,
        password
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409) {
        throw new Error('Ya existe una cuenta registrada con este correo electrónico.');
      }
      if (res.status === 401) {
        throw new Error('Correo electrónico o contraseña incorrectos.');
      }
      throw new Error(data.error || `No se pudo completar la operación (${res.status}).`);
    }

    const resolvedFullName =
      data.user?.fullName ||
      data.user?.full_name ||
      trimmedName ||
      normalizedEmail.split('@')[0];

    const userProfile = {
      id: String(data.user.id),
      fullName: String(resolvedFullName),
      email: String(data.user.email || normalizedEmail),
      createdAt: data.user.createdAt
    };

    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token);
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(userProfile));
    await savePersistedSession({ token: data.token, user: userProfile });

    syncState.update((s) => ({
      ...s,
      isAuthenticated: true,
      userEmail: userProfile.email,
      userFullName: userProfile.fullName,
      errorMessage: null
    }));

    await this.syncNow();
    return { token: data.token, user: userProfile };
  }

  public async logout(): Promise<void> {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    await clearPersistedSession().catch(() => {});
    syncState.update((s) => ({
      ...s,
      isAuthenticated: false,
      userEmail: null,
      userFullName: null,
      status: 'idle'
    }));
  }

  /**
   * Ejecuta el ciclo bidireccional de sincronización Offline-First:
   * 1. PUSH en chunks de máximo 200 registros con resolución LWW en servidor (updated_at)
   * 2. PULL Delta de vocabulario (?since=ISO_DATE&limit=200)
   * 3. PULL Delta de srs_reviews (?since=ISO_DATE) con resolución LWW local (updated_at)
   */
  public async syncNow(): Promise<{
    pushed: number;
    pulled: number;
    skippedStale: number;
  }> {
    if (this.isRunning) {
      return { pushed: 0, pulled: 0, skippedStale: 0 };
    }

    // Saneamiento y migración preventiva de IDs de semilla antiguos antes de evaluar el lote
    await migrateLegacySeedData();

    // Asegurar que el catálogo completo de todos los niveles JLPT esté disponible
    const vocabCount = await getVocabularyCount();
    if (vocabCount < 7800) {
      try {
        const { default: catalogData } = await import('../../data/jlpt_vocabulary_full.json');
        if (Array.isArray(catalogData) && catalogData.length > 0) {
          const normalized = catalogData.map(normalizeVocabularyRecord);
          await upsertVocabularyBatch(normalized);
        }
      } catch (e) {
        console.warn('[Sync] Fallo al cargar catálogo empaquetado en syncNow:', e);
      }
    }

    const userId = this.getUserId();
    const [dirtyBefore, dirtyDecksBefore, dirtyLogsBefore] = await Promise.all([
      getDirtyReviews(),
      getDirtyUserDecks(),
      getDirtyStudyLogs(userId)
    ]);
    const totalPendingBefore =
      dirtyBefore.length + dirtyDecksBefore.length + dirtyLogsBefore.length;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      syncState.update((s) => ({
        ...s,
        status: 'offline',
        pendingChanges: totalPendingBefore,
        errorMessage: 'Modo Offline activo. Tus repasos están guardados localmente.'
      }));
      return { pushed: 0, pulled: 0, skippedStale: 0 };
    }

    this.isRunning = true;
    syncState.update((s) => ({
      ...s,
      status: 'syncing',
      pendingChanges: totalPendingBefore,
      errorMessage: null
    }));

    const sinceIso = localStorage.getItem(STORAGE_KEYS.LAST_SYNC_AT);
    const token = this.getAuthToken();

    let totalPushed = 0;
    let totalPulled = 0;
    let totalSkippedStale = 0;
    let latestServerTime = new Date().toISOString();

    try {
      // ======================================================================
      // PASO 1: PUSH de srs_reviews modificados localmente en lotes de máx. 200
      // ======================================================================
      if (token && dirtyBefore.length > 0) {
        const batches = chunkBatch(dirtyBefore, MAX_SYNC_BATCH_SIZE);

        for (const batch of batches) {
          // Filtramos cualquier review con ID ficticio que no deba alcanzar el servidor
          const validReviews = batch.filter((r) => !r.vocabulary_id.startsWith('11111111-'));
          if (validReviews.length === 0) {
            await clearDirtyFlags(batch.map((item) => item.vocabulary_id));
            continue;
          }

          const payload = {
            reviews: validReviews.map((r) => ({
              vocabulary_id: r.vocabulary_id,
              state: r.state,
              ease_factor: Number(r.ease_factor),
              interval_days: Number(r.interval_days),
              next_review_date: r.next_review_date,
              lapses: Number(r.lapses),
              updated_at: r.updated_at,
              deleted_at: r.deleted_at,
              deleted: r.state === 'deleted' || Boolean(r.deleted_at)
            }))
          };

          const pushRes = await fetch(`${this.baseUrl}/api/v1/sync/reviews`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });

          if (!pushRes.ok) {
            const errJson = await pushRes.json().catch(() => ({}));
            throw new Error(errJson.error || `Error en Push SRS (${pushRes.status})`);
          }

          const pushData = await pushRes.json();
          totalPushed += Number(pushData.syncedCount ?? 0);
          totalSkippedStale += Number(pushData.skippedStaleCount ?? 0);
          if (pushData.serverTime) latestServerTime = pushData.serverTime;

          // Aplicar filas retornadas por el servidor con LWW y limpiar bandera dirty
          if (Array.isArray(pushData.data) && pushData.data.length > 0) {
            const normalizedServerReviews = pushData.data.map((row: Record<string, unknown>) =>
              this.normalizeServerReview(row)
            );
            await upsertReviewsBatchLWW(normalizedServerReviews);
          }

          await clearDirtyFlags(batch.map((item) => item.vocabulary_id));
        }
      }

      // ======================================================================
      // PASO 1.B: PUSH de user_decks personalizados creados/editados localmente
      // ======================================================================
      if (token && dirtyDecksBefore.length > 0) {
        const deckBatches = chunkBatch(dirtyDecksBefore, MAX_SYNC_BATCH_SIZE);

        for (const batch of deckBatches) {
          const payload = {
            decks: batch.map((d) => ({
              id: d.id,
              name: d.name,
              description: d.description,
              vocabulary_ids: d.vocabulary_ids,
              created_at: d.created_at,
              updated_at: d.updated_at,
              deleted_at: d.deleted_at
            }))
          };

          const pushDecksRes = await fetch(`${this.baseUrl}/api/v1/sync/decks`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });

          if (pushDecksRes.ok) {
            const pushDecksData = await pushDecksRes.json();
            totalPushed += Number(pushDecksData.syncedCount ?? 0);
            totalSkippedStale += Number(pushDecksData.skippedStaleCount ?? 0);
            if (pushDecksData.serverTime) latestServerTime = pushDecksData.serverTime;

            if (Array.isArray(pushDecksData.data) && pushDecksData.data.length > 0) {
              const normalizedServerDecks = pushDecksData.data.map((row: Record<string, unknown>) =>
                this.normalizeServerDeck(row)
              );
              await upsertUserDecksBatchLWW(normalizedServerDecks);
            }

            await clearDirtyUserDeckFlags(batch.map((d) => d.id));
          }
        }
      }

      // ======================================================================
      // PASO 1.C: PUSH de study_logs modificados localmente
      // ======================================================================
      if (token && dirtyLogsBefore.length > 0) {
        const logBatches = chunkBatch(dirtyLogsBefore, MAX_SYNC_BATCH_SIZE);

        for (const batch of logBatches) {
          const payload = {
            logs: batch.map((l) => ({
              date_key: l.date_key,
              reviews_count: Number(l.reviews_count),
              updated_at: l.updated_at
            }))
          };

          const pushLogsRes = await fetch(`${this.baseUrl}/api/v1/sync/study-logs`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });

          if (pushLogsRes.ok) {
            const pushLogsData = await pushLogsRes.json();
            totalPushed += Number(pushLogsData.syncedCount ?? 0);
            totalSkippedStale += Number(pushLogsData.skippedStaleCount ?? 0);
            if (pushLogsData.serverTime) latestServerTime = pushLogsData.serverTime;

            if (Array.isArray(pushLogsData.data) && pushLogsData.data.length > 0) {
              const normalizedServerLogs: StudyLogRecord[] = pushLogsData.data.map(
                (row: Record<string, unknown>) => ({
                  id: `${String(row.user_id ?? userId)}::${String(row.date_key)}`,
                  user_id: String(row.user_id ?? userId),
                  date_key: String(row.date_key),
                  reviews_count: Number(row.reviews_count ?? 0),
                  updated_at: String(row.updated_at ?? new Date().toISOString()),
                  dirty: false
                })
              );
              await upsertStudyLogsBatchLWW(normalizedServerLogs);
            }

            await clearDirtyStudyLogFlags(
              batch.map((l) => l.id || `${l.user_id}::${l.date_key}`)
            );
          }
        }
      }

      // ======================================================================
      // PASO 2: PULL Delta de srs_reviews y palabras elegidas por el usuario
      // (Solo se guardan localmente las palabras elegidas por el usuario)
      // ======================================================================
      if (token) {
        const pullUrl = new URL(`${this.baseUrl}/api/v1/sync/reviews`);
        if (sinceIso) {
          pullUrl.searchParams.set('since', sinceIso);
        }

        const pullRes = await fetch(pullUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (pullRes.ok) {
          const pullJson = await pullRes.json();
          if (pullJson.serverTime) latestServerTime = pullJson.serverTime;

          const rows: Array<Record<string, unknown>> = Array.isArray(pullJson.data)
            ? pullJson.data
            : [];

          // Extraer vocabulario embebido y reviews en lotes de hasta 200
          const embeddedVocab: VocabularyRecord[] = [];
          const incomingReviews: SrsReviewRecord[] = [];

          for (const row of rows) {
            if (row.vocabulary && typeof row.vocabulary === 'object') {
              embeddedVocab.push(
                normalizeVocabularyRecord(row.vocabulary as Record<string, unknown>)
              );
            }
            incomingReviews.push(this.normalizeServerReview(row));
          }

          for (const vocabBatch of chunkBatch(embeddedVocab, MAX_SYNC_BATCH_SIZE)) {
            await upsertVocabularyBatch(vocabBatch);
          }

          for (const reviewBatch of chunkBatch(incomingReviews, MAX_SYNC_BATCH_SIZE)) {
            const { applied, skippedStale } = await upsertReviewsBatchLWW(reviewBatch);
            totalPulled += applied;
            totalSkippedStale += skippedStale;
          }
        }

        // PULL Delta de mazos personalizados del usuario (/api/v1/sync/decks)
        const pullDecksUrl = new URL(`${this.baseUrl}/api/v1/sync/decks`);
        if (sinceIso) {
          pullDecksUrl.searchParams.set('since', sinceIso);
        }

        const pullDecksRes = await fetch(pullDecksUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (pullDecksRes.ok) {
          const pullDecksJson = await pullDecksRes.json();
          if (pullDecksJson.serverTime) latestServerTime = pullDecksJson.serverTime;

          const deckRows: Array<Record<string, unknown>> = Array.isArray(pullDecksJson.data)
            ? pullDecksJson.data
            : [];

          const incomingDecks: UserDeckRecord[] = deckRows.map((row) =>
            this.normalizeServerDeck(row)
          );

          for (const deckBatch of chunkBatch(incomingDecks, MAX_SYNC_BATCH_SIZE)) {
            const { applied, skippedStale } = await upsertUserDecksBatchLWW(deckBatch);
            totalPulled += applied;
            totalSkippedStale += skippedStale;
          }

          // Asegurar que las palabras elegidas dentro de los mazos del usuario estén guardadas localmente
          const localVocab = await getAllVocabulary();
          const localIds = new Set(localVocab.map((v) => v.id));
          const missingIds: string[] = [];
          for (const deck of incomingDecks) {
            if (deck.deleted_at) continue;
            for (const vid of deck.vocabulary_ids) {
              if (!localIds.has(vid)) {
                localIds.add(vid);
                missingIds.push(vid);
              }
            }
          }

          for (const idBatch of chunkBatch(missingIds, 100)) {
            const vocabByIdsUrl = new URL(`${this.baseUrl}/api/v1/vocabulary`);
            vocabByIdsUrl.searchParams.set('ids', idBatch.join(','));
            vocabByIdsUrl.searchParams.set('limit', String(idBatch.length));
            const res = await fetch(vocabByIdsUrl.toString(), {
              headers: { Accept: 'application/json' }
            });
            if (res.ok) {
              const json = await res.json();
              const fetched: VocabularyRecord[] = Array.isArray(json.data)
                ? json.data.map(normalizeVocabularyRecord)
                : [];
              if (fetched.length > 0) {
                await upsertVocabularyBatch(fetched);
              }
            }
          }
        }

        // PULL Delta de study_logs del usuario (/api/v1/sync/study-logs)
        const pullLogsUrl = new URL(`${this.baseUrl}/api/v1/sync/study-logs`);
        if (sinceIso) {
          pullLogsUrl.searchParams.set('since', sinceIso);
        }

        const pullLogsRes = await fetch(pullLogsUrl.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`
          }
        });

        if (pullLogsRes.ok) {
          const pullLogsJson = await pullLogsRes.json();
          if (pullLogsJson.serverTime) latestServerTime = pullLogsJson.serverTime;

          const logRows: Array<Record<string, unknown>> = Array.isArray(pullLogsJson.data)
            ? pullLogsJson.data
            : [];

          const incomingLogs: StudyLogRecord[] = logRows.map((row) => ({
            id: `${String(row.user_id ?? userId)}::${String(row.date_key)}`,
            user_id: String(row.user_id ?? userId),
            date_key: String(row.date_key),
            reviews_count: Number(row.reviews_count ?? 0),
            updated_at: String(row.updated_at ?? new Date().toISOString()),
            dirty: false
          }));

          for (const logBatch of chunkBatch(incomingLogs, MAX_SYNC_BATCH_SIZE)) {
            const { applied, skippedStale } = await upsertStudyLogsBatchLWW(logBatch);
            totalPulled += applied;
            totalSkippedStale += skippedStale;
          }
        }
      }

      localStorage.setItem(STORAGE_KEYS.LAST_SYNC_AT, latestServerTime);
      const remainingPending = await this.refreshPendingCount('success');

      syncState.update((s) => ({
        ...s,
        status: 'success',
        lastSyncAt: latestServerTime,
        pendingChanges: remainingPending,
        pushedCount: totalPushed,
        pulledCount: totalPulled,
        skippedLwwStale: totalSkippedStale,
        errorMessage: null
      }));

      return {
        pushed: totalPushed,
        pulled: totalPulled,
        skippedStale: totalSkippedStale
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'No se pudo conectar con oboeru-api';
      const remainingPending = await this.refreshPendingCount('offline');
      syncState.update((s) => ({
        ...s,
        status: 'offline',
        pendingChanges: remainingPending,
        errorMessage: msg
      }));
      return { pushed: totalPushed, pulled: totalPulled, skippedStale: totalSkippedStale };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sincroniza o descarga el catálogo completo de vocabulario (N5 a N1, 7.811 palabras).
   * Mantiene el estado en 'syncing' para activar la animación de rotación en el botón superior de la app.
   * Primero realiza la carga inmediata desde el paquete local empaquetado (src/data/jlpt_vocabulary_full.json)
   * para respuesta sub-segundo garantizada, y si hay conexión a internet, actualiza contra la API remota.
   */
  public async syncFullCatalog(): Promise<{ count: number; source: 'bundled' | 'api' }> {
    if (this.isRunning) {
      return { count: 0, source: 'bundled' };
    }

    this.isRunning = true;
    syncState.update((s) => ({
      ...s,
      status: 'syncing',
      errorMessage: null
    }));

    try {
      let loadedCount = 0;
      let source: 'bundled' | 'api' = 'bundled';

      // 1. Carga ultra-rápida desde el bundle local
      try {
        const { default: catalogData } = await import('../../data/jlpt_vocabulary_full.json');
        if (Array.isArray(catalogData) && catalogData.length > 0) {
          const normalized = catalogData.map(normalizeVocabularyRecord);
          await upsertVocabularyBatch(normalized);
          loadedCount = normalized.length;
        }
      } catch (bundleErr) {
        console.warn('[SyncManager] Error al leer bundle local:', bundleErr);
      }

      // 2. Si no se cargaron suficientes palabras y hay red disponible, descargar de la API
      if (loadedCount < 7800 && (typeof navigator === 'undefined' || navigator.onLine)) {
        source = 'api';
        for (let jlpt = 5; jlpt >= 1; jlpt--) {
          let offset = 0;
          while (true) {
            const url = new URL(`${this.baseUrl}/api/v1/vocabulary`);
            url.searchParams.set('jlpt', String(jlpt));
            url.searchParams.set('limit', '1000');
            url.searchParams.set('offset', String(offset));

            const res = await fetch(url.toString(), {
              headers: { Accept: 'application/json' }
            });
            if (!res.ok) break;

            const json = await res.json();
            const rawItems: Array<Record<string, unknown>> = Array.isArray(json.data) ? json.data : [];
            if (rawItems.length > 0) {
              const normalized = rawItems.map(normalizeVocabularyRecord);
              await upsertVocabularyBatch(normalized);
              loadedCount += normalized.length;
            }
            if (rawItems.length < 1000) break;
            offset += 1000;
          }
        }
      }

      const remainingPending = await this.refreshPendingCount('idle');
      syncState.update((s) => ({
        ...s,
        status: 'idle',
        pendingChanges: remainingPending,
        errorMessage: null
      }));

      return { count: loadedCount, source };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al descargar catálogo de palabras';
      syncState.update((s) => ({
        ...s,
        status: 'error',
        errorMessage: msg
      }));
      throw err;
    } finally {
      this.isRunning = false;
    }
  }

  private normalizeServerDeck(row: Record<string, unknown>): UserDeckRecord {
    const rawVocabIds = row.vocabulary_ids ?? row.vocabularyIds;
    let parsedVocabIds: string[] = [];
    if (Array.isArray(rawVocabIds)) {
      parsedVocabIds = rawVocabIds.map(String);
    } else if (typeof rawVocabIds === 'string') {
      try {
        const parsed = JSON.parse(rawVocabIds);
        if (Array.isArray(parsed)) parsedVocabIds = parsed.map(String);
      } catch {
        parsedVocabIds = [];
      }
    }

    return {
      id: String(row.id ?? crypto.randomUUID()),
      user_id: String(row.user_id ?? row.userId ?? this.getUserId()),
      name: String(row.name ?? 'Mazo personalizado'),
      description:
        row.description != null && String(row.description).trim() !== ''
          ? String(row.description)
          : null,
      vocabulary_ids: parsedVocabIds,
      created_at: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
      updated_at: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
      deleted_at:
        row.deleted_at != null || row.deletedAt != null
          ? String(row.deleted_at ?? row.deletedAt)
          : null,
      dirty: false
    };
  }

  /**
   * Consulta directamente el catálogo completo (N5 a N1) en la base de datos del servidor
   * sin descargar todas las palabras al teléfono; solo las que el usuario elija se guardan localmente.
   */
  public async searchRemoteVocabulary(
    rawQuery: string,
    jlptFilter: number | null = null,
    limit: number = 80
  ): Promise<Array<VocabularyRecord & { inStudy: boolean; state: string }>> {
    const trimmed = rawQuery.trim();
    const converted = convertSearchQueryToKana(trimmed);

    try {
      const url = new URL(`${this.baseUrl}/api/v1/vocabulary`);
      url.searchParams.set('limit', String(limit));
      if (trimmed) {
        url.searchParams.set('q', trimmed);
        if (converted.hiragana && converted.hiragana !== trimmed) {
          url.searchParams.set('kana', converted.hiragana);
        }
      }
      if (jlptFilter !== null) {
        url.searchParams.set('jlpt', String(jlptFilter));
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) {
        return searchLocalVocabulary(rawQuery, jlptFilter);
      }

      const json = await res.json();
      const rawItems: Array<Record<string, unknown>> = Array.isArray(json.data) ? json.data : [];

      // Si la búsqueda directa no trajo resultados, intentar búsqueda inversa (deconjugación)
      if (rawItems.length === 0 && trimmed) {
        const candidates = getDeconjugatedCandidates(trimmed);
        if (candidates.length > 0) {
          const fallbackUrl = new URL(`${this.baseUrl}/api/v1/vocabulary`);
          fallbackUrl.searchParams.set('limit', String(limit));
          fallbackUrl.searchParams.set('q', candidates[0]);
          fallbackUrl.searchParams.set('kana', candidates[0]);
          if (jlptFilter !== null) fallbackUrl.searchParams.set('jlpt', String(jlptFilter));
          try {
            const fRes = await fetch(fallbackUrl.toString(), {
              method: 'GET',
              headers: { Accept: 'application/json' }
            });
            if (fRes.ok) {
              const fJson = await fRes.json();
              if (Array.isArray(fJson.data)) {
                rawItems.push(...fJson.data);
              }
            }
          } catch {
            // Silencioso; continúa con el fallback local
          }
        }
      }

      const reviews = await getAllReviews();
      const reviewMap = new Map<string, SrsReviewRecord>();
      for (const r of reviews) {
        reviewMap.set(r.vocabulary_id, r);
      }

      // Deduplicar resultados del servidor por (kanji + lectura)
      const deduped = new Map<string, VocabularyRecord & { inStudy: boolean; state: string }>();
      for (const raw of rawItems) {
        const v = normalizeVocabularyRecord(raw);
        const key = `${v.kanji || ''}::${v.reading}`;
        if (deduped.has(key)) continue;

        const rev = reviewMap.get(v.id);
        const active = Boolean(rev && rev.state !== 'deleted' && !rev.deleted_at);
        deduped.set(key, {
          ...v,
          inStudy: active,
          state: rev?.state || 'new'
        });
      }

      // Combinar con los resultados locales (garantiza búsqueda offline instantánea y soporte de tildes/acentos)
      const localMatches = await searchLocalVocabulary(rawQuery, jlptFilter);
      for (const loc of localMatches) {
        const key = `${loc.kanji || ''}::${loc.reading}`;
        if (!deduped.has(key)) {
          deduped.set(key, loc);
        }
      }

      return Array.from(deduped.values());
    } catch {
      return searchLocalVocabulary(rawQuery, jlptFilter);
    }
  }

  private normalizeServerReview(row: Record<string, unknown>): SrsReviewRecord {
    return {
      id: String(row.id ?? crypto.randomUUID()),
      user_id: String(row.user_id ?? row.userId ?? this.getUserId()),
      vocabulary_id: String(row.vocabulary_id ?? row.vocabularyId),
      state: (row.state as SrsState) || 'new',
      ease_factor: Number(row.ease_factor ?? row.easeFactor ?? 2.5),
      interval_days: Number(row.interval_days ?? row.intervalDays ?? 0),
      next_review_date: String(
        row.next_review_date ?? row.nextReviewDate ?? new Date().toISOString()
      ),
      lapses: Number(row.lapses ?? 0),
      updated_at: String(row.updated_at ?? row.updatedAt ?? new Date().toISOString()),
      deleted_at:
        row.deleted_at != null || row.deletedAt != null
          ? String(row.deleted_at ?? row.deletedAt)
          : null,
      dirty: false
    };
  }
}

export const syncManager = new SyncManager();

