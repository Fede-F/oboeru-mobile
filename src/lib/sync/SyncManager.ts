import { writable } from 'svelte/store';
import type { SrsReviewRecord, SrsState, VocabularyRecord } from '../db/schema';
import {
  clearDirtyFlags,
  getDirtyReviews,
  LOCAL_DEFAULT_USER_ID,
  upsertReviewsBatchLWW,
  upsertVocabularyBatch
} from '../db/database';
import { normalizeVocabularyRecord } from '../utils/japanese';

export const OBOERU_API_BASE_URL = 'https://oboeru-api.planner.ar';
export const MAX_SYNC_BATCH_SIZE = 200;

const STORAGE_KEYS = {
  AUTH_TOKEN: 'oboeru_jwt_token',
  USER_PROFILE: 'oboeru_user_profile',
  LAST_SYNC_AT: 'oboeru_last_sync_at'
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
  errorMessage: string | null;
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
  errorMessage: null
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
        this.syncNow().catch(() => {});
      });
      window.addEventListener('offline', () => {
        this.refreshPendingCount('offline');
      });
    }
  }

  private hydrateStoredMeta(): void {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const lastSyncAt = localStorage.getItem(STORAGE_KEYS.LAST_SYNC_AT);
    const profileRaw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    let userEmail: string | null = null;
    try {
      if (profileRaw) userEmail = JSON.parse(profileRaw).email ?? null;
    } catch {
      userEmail = null;
    }

    syncState.update((s) => ({
      ...s,
      lastSyncAt,
      isAuthenticated: Boolean(token),
      userEmail
    }));
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
    const dirty = await getDirtyReviews();
    syncState.update((s) => ({
      ...s,
      pendingChanges: dirty.length,
      status: overrideStatus ?? s.status
    }));
    return dirty.length;
  }

  /**
   * Registro o Login contra https://oboeru-api.planner.ar/api/v1/auth/{login|register}
   */
  public async authenticate(
    mode: 'login' | 'register',
    email: string,
    password: string
  ): Promise<{ token: string; user: { id: string; email: string } }> {
    const res = await fetch(`${this.baseUrl}/api/v1/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Error de autenticación (${res.status})`);
    }

    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, data.token);
    localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(data.user));

    syncState.update((s) => ({
      ...s,
      isAuthenticated: true,
      userEmail: data.user.email,
      errorMessage: null
    }));

    await this.syncNow();
    return data;
  }

  public logout(): void {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER_PROFILE);
    syncState.update((s) => ({
      ...s,
      isAuthenticated: false,
      userEmail: null,
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

    const dirtyBefore = await getDirtyReviews();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      syncState.update((s) => ({
        ...s,
        status: 'offline',
        pendingChanges: dirtyBefore.length,
        errorMessage: 'Modo Offline activo. Tus repasos están guardados localmente.'
      }));
      return { pushed: 0, pulled: 0, skippedStale: 0 };
    }

    this.isRunning = true;
    syncState.update((s) => ({
      ...s,
      status: 'syncing',
      pendingChanges: dirtyBefore.length,
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
          const payload = {
            reviews: batch.map((r) => ({
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
      // PASO 2: PULL Delta del catálogo de vocabulario en lotes de 200
      // ======================================================================
      let offset = 0;
      let keepFetchingVocab = true;

      while (keepFetchingVocab) {
        const vocabUrl = new URL(`${this.baseUrl}/api/v1/vocabulary`);
        vocabUrl.searchParams.set('limit', String(MAX_SYNC_BATCH_SIZE));
        vocabUrl.searchParams.set('offset', String(offset));
        if (sinceIso) {
          vocabUrl.searchParams.set('since', sinceIso);
        }

        const vocabRes = await fetch(vocabUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' }
        });

        if (!vocabRes.ok) break;

        const vocabJson = await vocabRes.json();
        if (vocabJson.serverTime) latestServerTime = vocabJson.serverTime;

        const rawItems: Array<Record<string, unknown>> = Array.isArray(vocabJson.data)
          ? vocabJson.data
          : [];

        if (rawItems.length > 0) {
          const normalizedVocab: VocabularyRecord[] = rawItems.map(normalizeVocabularyRecord);
          await upsertVocabularyBatch(normalizedVocab);
          totalPulled += normalizedVocab.length;
        }

        if (rawItems.length < MAX_SYNC_BATCH_SIZE) {
          keepFetchingVocab = false;
        } else {
          offset += MAX_SYNC_BATCH_SIZE;
        }
      }

      // ======================================================================
      // PASO 3: PULL Delta de srs_reviews del usuario (con resolución LWW)
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
      }

      localStorage.setItem(STORAGE_KEYS.LAST_SYNC_AT, latestServerTime);
      const remainingDirty = await getDirtyReviews();

      syncState.update((s) => ({
        ...s,
        status: 'success',
        lastSyncAt: latestServerTime,
        pendingChanges: remainingDirty.length,
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
      const remainingDirty = await getDirtyReviews();
      syncState.update((s) => ({
        ...s,
        status: 'offline',
        pendingChanges: remainingDirty.length,
        errorMessage: msg
      }));
      return { pushed: totalPushed, pulled: totalPulled, skippedStale: totalSkippedStale };
    } finally {
      this.isRunning = false;
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

