import type {
  DeckSummary,
  ReviewRating,
  SrsReviewRecord,
  StudyCardItem,
  StudyLogRecord,
  UserDeckRecord,
  VocabularyRecord
} from './schema';
import { INITIAL_VOCABULARY_SEED } from './seedVocabulary';
import { calculateNextReview } from '../srs/sm2';
import { convertSearchQueryToKana, stripRubyTags, toRomajiText } from '../utils/japanese';
import { getDeconjugatedCandidates } from '../utils/conjugator';
import { getAllDecksLastStudied, getDeckLastStudied, setDeckLastStudied } from '../studyMode';

const DB_NAME = 'oboeru_offline_db';
const DB_VERSION = 5;

export const LOCAL_DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000001';

let dbPromise: Promise<IDBDatabase> | null = null;

function openLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      // 1. Tabla vocabulary
      if (!db.objectStoreNames.contains('vocabulary')) {
        const vocabStore = db.createObjectStore('vocabulary', { keyPath: 'id' });
        vocabStore.createIndex('jlpt_level', 'jlpt_level', { unique: false });
        vocabStore.createIndex('reading', 'reading', { unique: false });
        vocabStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // 2. Tabla srs_reviews
      if (!db.objectStoreNames.contains('srs_reviews')) {
        const reviewStore = db.createObjectStore('srs_reviews', { keyPath: 'id' });
        reviewStore.createIndex('vocabulary_id', 'vocabulary_id', { unique: false });
        reviewStore.createIndex('user_vocab', ['user_id', 'vocabulary_id'], { unique: true });
        reviewStore.createIndex('next_review_date', 'next_review_date', { unique: false });
        reviewStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // 3. Tabla study_log (para el Mapa de Calor con clave compuesta user_id::date_key)
      if (db.objectStoreNames.contains('study_log')) {
        // En version 5 migramos a clave compuesta [user_id, date_key] o store nuevo
        // Si venía de versión previa con keyPath date_key, lo recreamos limpiando datos falsos
        if (event.oldVersion < 5) {
          db.deleteObjectStore('study_log');
          const logStore = db.createObjectStore('study_log', { keyPath: 'id' });
          logStore.createIndex('user_id', 'user_id', { unique: false });
          logStore.createIndex('user_date', ['user_id', 'date_key'], { unique: true });
          logStore.createIndex('updated_at', 'updated_at', { unique: false });
        }
      } else {
        const logStore = db.createObjectStore('study_log', { keyPath: 'id' });
        logStore.createIndex('user_id', 'user_id', { unique: false });
        logStore.createIndex('user_date', ['user_id', 'date_key'], { unique: true });
        logStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // 4. Tabla user_decks (Mazos personalizados creados por el usuario)
      if (!db.objectStoreNames.contains('user_decks')) {
        const deckStore = db.createObjectStore('user_decks', { keyPath: 'id' });
        deckStore.createIndex('user_id', 'user_id', { unique: false });
        deckStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // 5. Tabla user_session (Persistencia de sesión activa para que no se pierda al cerrar la app)
      if (!db.objectStoreNames.contains('user_session')) {
        db.createObjectStore('user_session', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface PersistedAuthSession {
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    createdAt?: string;
  };
}

export async function savePersistedSession(session: PersistedAuthSession): Promise<void> {
  const db = await openLocalDb();
  const tx = db.transaction('user_session', 'readwrite');
  tx.objectStore('user_session').put({
    key: 'active_session',
    ...session,
    updated_at: new Date().toISOString()
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPersistedSession(): Promise<PersistedAuthSession | null> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('user_session', 'readonly');
    const req = tx.objectStore('user_session').get('active_session');
    req.onsuccess = () => {
      const res = req.result;
      if (res && res.token && res.user?.id) {
        resolve({ token: res.token, user: res.user });
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearPersistedSession(): Promise<void> {
  const db = await openLocalDb();
  const tx = db.transaction('user_session', 'readwrite');
  tx.objectStore('user_session').delete('active_session');
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Migra cualquier tarjeta o registro de vocabulario que tenga IDs de semilla ficticios (11111111-...)
 * hacia los UUIDs reales definitivos de PostgreSQL.
 */
export async function migrateLegacySeedData(): Promise<void> {
  const db = await openLocalDb();
  const [vocabList, reviewList] = await Promise.all([getAllVocabulary(), getAllReviews()]);

  // Mapa de clave natural -> UUID real en INITIAL_VOCABULARY_SEED
  const seedNaturalKeyToRealId = new Map<string, string>();
  for (const s of INITIAL_VOCABULARY_SEED) {
    seedNaturalKeyToRealId.set(getVocabNaturalKey(s), s.id);
  }

  // 1. Mapear qué IDs viejos corresponden a qué IDs reales
  const oldIdToNewId = new Map<string, string>();
  for (const v of vocabList) {
    if (v.id.startsWith('11111111-')) {
      const naturalKey = getVocabNaturalKey(v);
      const realId = seedNaturalKeyToRealId.get(naturalKey);
      if (realId) {
        oldIdToNewId.set(v.id, realId);
      }
    }
  }

  if (oldIdToNewId.size === 0) {
    // Si no hay vocabulario viejo, verificar si hay reviews huérfanos con 11111111-
    const orphanReviews = reviewList.filter((r) => r.vocabulary_id.startsWith('11111111-'));
    if (orphanReviews.length === 0) return;

    // Eliminar reviews huérfanos que apunten a IDs inexistentes
    const tx = db.transaction('srs_reviews', 'readwrite');
    const store = tx.objectStore('srs_reviews');
    for (const r of orphanReviews) {
      store.delete(r.id);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return;
  }

  const tx = db.transaction(['vocabulary', 'srs_reviews'], 'readwrite');
  const vocabStore = tx.objectStore('vocabulary');
  const reviewStore = tx.objectStore('srs_reviews');

  // Eliminar vocabulario viejo con ID ficticio
  for (const [oldId] of oldIdToNewId) {
    vocabStore.delete(oldId);
  }

  // Actualizar reviews que apuntaban a IDs viejos
  for (const r of reviewList) {
    if (oldIdToNewId.has(r.vocabulary_id)) {
      const newVocabId = oldIdToNewId.get(r.vocabulary_id)!;
      reviewStore.delete(r.id);
      reviewStore.put({
        ...r,
        vocabulary_id: newVocabId,
        dirty: false
      });
    } else if (r.vocabulary_id.startsWith('11111111-')) {
      // Si no tiene mapeo, borrar para que no provoque 500
      reviewStore.delete(r.id);
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Inicializa la base de datos local y siembra el diccionario JLPT + actividad inicial offline
 */
export async function initLocalDatabase(userId: string = LOCAL_DEFAULT_USER_ID): Promise<void> {
  const db = await openLocalDb();

  // Migrar y sanear datos legacy de semillas previas
  await migrateLegacySeedData();

  // Sembrar o completar vocabulario base deduplicado por (kanji limpio + lectura)
  await upsertVocabularyBatch(INITIAL_VOCABULARY_SEED);

  // Sembrar tarjetas SRS iniciales listas para estudio inmediato offline
  const reviewCount = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction('srs_reviews', 'readonly');
    const req = tx.objectStore('srs_reviews').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (reviewCount === 0) {
    const now = new Date();
    const pastDue = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const initialReviews: SrsReviewRecord[] = INITIAL_VOCABULARY_SEED.map((vocab, idx) => ({
      id: `22222222-2222-4222-8222-${String(idx + 1).padStart(12, '0')}`,
      user_id: userId,
      vocabulary_id: vocab.id,
      state: idx < 6 ? 'learning' : idx < 14 ? 'new' : 'review',
      ease_factor: 2.5,
      interval_days: idx < 14 ? 0 : 3,
      next_review_date: pastDue,
      lapses: 0,
      updated_at: new Date(now.getTime() - 3600_000).toISOString(),
      deleted_at: null,
      dirty: false
    }));

    const tx = db.transaction('srs_reviews', 'readwrite');
    const store = tx.objectStore('srs_reviews');
    for (const r of initialReviews) {
      store.put(r);
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  // Inicialización limpia: NO se siembran repasos ni datos inventados en study_log.
  // Si el usuario no estudió, sus días están en 0.
}

function getVocabNaturalKey(item: VocabularyRecord): string {
  return `${stripRubyTags(item.kanji).trim()}::${item.reading.trim()}`;
}

/**
 * Inserta o actualiza un lote de vocabulario eliminando duplicados por (kanji + reading).
 * Si una palabra ya existía con un ID de semilla local (11111111-...) y llega del servidor
 * con su UUID definitivo, reemplaza el registro viejo para que nunca aparezca duplicada.
 */
export async function upsertVocabularyBatch(items: VocabularyRecord[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openLocalDb();

  const existingAll = await new Promise<VocabularyRecord[]>((resolve, reject) => {
    const tx = db.transaction('vocabulary', 'readonly');
    const req = tx.objectStore('vocabulary').getAll();
    req.onsuccess = () => resolve((req.result as VocabularyRecord[]) || []);
    req.onerror = () => reject(req.error);
  });

  const byNaturalKey = new Map<string, VocabularyRecord>();
  for (const existing of existingAll) {
    const key = getVocabNaturalKey(existing);
    const prev = byNaturalKey.get(key);
    if (!prev) {
      byNaturalKey.set(key, existing);
    } else {
      // Si ya había duplicados previos en IndexedDB, preferimos el UUID real sobre el 11111111-...
      const prevIsSeed = prev.id.startsWith('11111111-');
      if (prevIsSeed && !existing.id.startsWith('11111111-')) {
        byNaturalKey.set(key, existing);
      }
    }
  }

  const tx = db.transaction('vocabulary', 'readwrite');
  const store = tx.objectStore('vocabulary');

  // Limpiar cualquier duplicado previo que hubiera quedado en IndexedDB
  const seenKeys = new Map<string, VocabularyRecord>();
  for (const existing of existingAll) {
    const key = getVocabNaturalKey(existing);
    const prev = seenKeys.get(key);
    if (!prev) {
      seenKeys.set(key, existing);
    } else {
      const prevIsSeed = prev.id.startsWith('11111111-');
      if (prevIsSeed && !existing.id.startsWith('11111111-')) {
        store.delete(prev.id);
        seenKeys.set(key, existing);
      } else {
        store.delete(existing.id);
      }
    }
  }

  for (const item of items) {
    const key = getVocabNaturalKey(item);
    const match = seenKeys.get(key);
    const itemIsSeed = item.id.startsWith('11111111-');

    if (match && match.id !== item.id) {
      if (itemIsSeed && !match.id.startsWith('11111111-')) {
        // Ya tenemos el UUID real del servidor para esta palabra; conservamos el ID del servidor
        // pero si la semilla local tiene furigana <ruby>, enriquecemos el kanji
        store.put({
          ...match,
          kanji: item.kanji?.includes('<ruby>') ? item.kanji : match.kanji,
          example_sentence: item.example_sentence?.includes('<ruby>')
            ? item.example_sentence
            : match.example_sentence
        });
        continue;
      }
      // Si el que entra es del servidor y el local era semilla, borramos el ID de semilla viejo
      store.delete(match.id);
    }

    const mergedRecord: VocabularyRecord = {
      ...item,
      kanji:
        match?.kanji?.includes('<ruby>') && !item.kanji?.includes('<ruby>')
          ? match.kanji
          : item.kanji,
      example_sentence:
        match?.example_sentence?.includes('<ruby>') && !item.example_sentence?.includes('<ruby>')
          ? match.example_sentence
          : item.example_sentence,
      updated_at: item.updated_at || new Date().toISOString()
    };

    store.put(mergedRecord);
    seenKeys.set(key, mergedRecord);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Resolución de Conflictos Last-Write-Wins (LWW) estricta basada en updated_at
 * Solo sobrescribe el registro local si incoming.updated_at >= local.updated_at
 */
export async function upsertReviewsBatchLWW(
  incomingReviews: SrsReviewRecord[]
): Promise<{ applied: number; skippedStale: number }> {
  if (incomingReviews.length === 0) return { applied: 0, skippedStale: 0 };
  const db = await openLocalDb();

  const existingAll = await getAllReviews();
  const byVocabId = new Map<string, SrsReviewRecord>();
  for (const rev of existingAll) {
    byVocabId.set(rev.vocabulary_id, rev);
  }

  let applied = 0;
  let skippedStale = 0;

  const tx = db.transaction('srs_reviews', 'readwrite');
  const store = tx.objectStore('srs_reviews');

  for (const incoming of incomingReviews) {
    const local = byVocabId.get(incoming.vocabulary_id);
    if (!local) {
      store.put({ ...incoming, dirty: false });
      applied++;
      continue;
    }

    const incomingTime = new Date(incoming.updated_at).getTime();
    const localTime = new Date(local.updated_at).getTime();

    // Regla LWW: Last-Write-Wins según timestamp updated_at
    if (incomingTime >= localTime) {
      store.put({
        ...incoming,
        id: local.id || incoming.id,
        dirty: false
      });
      applied++;
    } else {
      skippedStale++;
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { applied, skippedStale };
}

export async function getAllVocabulary(): Promise<VocabularyRecord[]> {
  const db = await openLocalDb();
  const rawList = await new Promise<VocabularyRecord[]>((resolve, reject) => {
    const tx = db.transaction('vocabulary', 'readonly');
    const req = tx.objectStore('vocabulary').getAll();
    req.onsuccess = () => resolve((req.result as VocabularyRecord[]) || []);
    req.onerror = () => reject(req.error);
  });

  // Garantizar cero duplicados por (kanji limpio + lectura)
  const deduped = new Map<string, VocabularyRecord>();
  for (const item of rawList) {
    const key = getVocabNaturalKey(item);
    const existing = deduped.get(key);
    if (!existing || (existing.id.startsWith('11111111-') && !item.id.startsWith('11111111-'))) {
      deduped.set(key, item);
    }
  }
  return Array.from(deduped.values());
}

export async function getAllReviews(): Promise<SrsReviewRecord[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('srs_reviews', 'readonly');
    const req = tx.objectStore('srs_reviews').getAll();
    req.onsuccess = () => resolve(req.result as SrsReviewRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getDirtyReviews(): Promise<SrsReviewRecord[]> {
  const all = await getAllReviews();
  return all.filter((r) => Boolean(r.dirty));
}

export async function clearDirtyFlags(vocabularyIds: string[]): Promise<void> {
  if (vocabularyIds.length === 0) return;
  const idSet = new Set(vocabularyIds);
  const all = await getAllReviews();
  const db = await openLocalDb();
  const tx = db.transaction('srs_reviews', 'readwrite');
  const store = tx.objectStore('srs_reviews');

  for (const r of all) {
    if (idSet.has(r.vocabulary_id) && r.dirty) {
      store.put({ ...r, dirty: false });
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============================================================================
// Persistencia y Sincronización LWW de Mazos Personalizados (user_decks)
// ============================================================================

export async function getAllUserDecks(): Promise<UserDeckRecord[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('user_decks', 'readonly');
    const req = tx.objectStore('user_decks').getAll();
    req.onsuccess = () => resolve((req.result as UserDeckRecord[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getDirtyUserDecks(): Promise<UserDeckRecord[]> {
  const all = await getAllUserDecks();
  return all.filter((d) => Boolean(d.dirty));
}

export async function clearDirtyUserDeckFlags(deckIds: string[]): Promise<void> {
  if (deckIds.length === 0) return;
  const idSet = new Set(deckIds);
  const all = await getAllUserDecks();
  const db = await openLocalDb();
  const tx = db.transaction('user_decks', 'readwrite');
  const store = tx.objectStore('user_decks');

  for (const d of all) {
    if (idSet.has(d.id) && d.dirty) {
      store.put({ ...d, dirty: false });
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function upsertUserDecksBatchLWW(
  incomingDecks: UserDeckRecord[]
): Promise<{ applied: number; skippedStale: number }> {
  if (incomingDecks.length === 0) return { applied: 0, skippedStale: 0 };
  const db = await openLocalDb();
  const existingAll = await getAllUserDecks();
  const byId = new Map<string, UserDeckRecord>();
  for (const deck of existingAll) {
    byId.set(deck.id, deck);
  }

  let applied = 0;
  let skippedStale = 0;

  const tx = db.transaction('user_decks', 'readwrite');
  const store = tx.objectStore('user_decks');

  for (const incoming of incomingDecks) {
    const local = byId.get(incoming.id);
    if (!local) {
      store.put({ ...incoming, dirty: false });
      applied++;
      continue;
    }

    const incomingTime = new Date(incoming.updated_at).getTime();
    const localTime = new Date(local.updated_at).getTime();

    if (incomingTime >= localTime) {
      store.put({ ...incoming, dirty: false });
      applied++;
    } else {
      skippedStale++;
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { applied, skippedStale };
}

// ============================================================================
// Persistencia y Sincronización LWW de Logs de Estudio (study_log)
// ============================================================================

export async function getAllStudyLogs(userId?: string): Promise<StudyLogRecord[]> {
  const db = await openLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('study_log', 'readonly');
    const store = tx.objectStore('study_log');
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result as StudyLogRecord[]) || [];
      if (!userId) {
        resolve(all);
      } else {
        resolve(all.filter((l) => l.user_id === userId));
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getDirtyStudyLogs(userId?: string): Promise<StudyLogRecord[]> {
  const all = await getAllStudyLogs(userId);
  return all.filter((l) => Boolean(l.dirty));
}

export async function clearDirtyStudyLogFlags(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const keySet = new Set(keys);
  const all = await getAllStudyLogs();
  const db = await openLocalDb();
  const tx = db.transaction('study_log', 'readwrite');
  const store = tx.objectStore('study_log');

  for (const l of all) {
    const id = l.id || `${l.user_id}::${l.date_key}`;
    if (keySet.has(id) && l.dirty) {
      store.put({ ...l, dirty: false });
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function upsertStudyLogsBatchLWW(
  incomingLogs: StudyLogRecord[]
): Promise<{ applied: number; skippedStale: number }> {
  if (incomingLogs.length === 0) return { applied: 0, skippedStale: 0 };
  const db = await openLocalDb();
  const existingAll = await getAllStudyLogs();
  const byUserDate = new Map<string, StudyLogRecord>();
  for (const l of existingAll) {
    const key = `${l.user_id}::${l.date_key}`;
    byUserDate.set(key, l);
  }

  let applied = 0;
  let skippedStale = 0;

  const tx = db.transaction('study_log', 'readwrite');
  const store = tx.objectStore('study_log');

  for (const incoming of incomingLogs) {
    const key = `${incoming.user_id}::${incoming.date_key}`;
    const id = incoming.id || key;
    const local = byUserDate.get(key);

    if (!local) {
      store.put({
        ...incoming,
        id,
        dirty: false
      });
      applied++;
      continue;
    }

    const incomingTime = new Date(incoming.updated_at).getTime();
    const localTime = new Date(local.updated_at).getTime();

    if (incomingTime >= localTime) {
      store.put({
        ...incoming,
        id,
        dirty: false
      });
      applied++;
    } else {
      skippedStale++;
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { applied, skippedStale };
}

/**
 * Crea un mazo personalizado en la tabla user_decks y asegura que todas las palabras
 * elegidas queden activas en srs_reviews para repaso inmediato.
 */
export async function createCustomUserDeck(
  name: string,
  vocabularyIds: string[],
  description: string | null = null,
  userId: string = LOCAL_DEFAULT_USER_ID,
  selectedWords: VocabularyRecord[] = []
): Promise<UserDeckRecord> {
  if (selectedWords.length > 0) {
    await upsertVocabularyBatch(selectedWords);
  }
  const db = await openLocalDb();
  const nowIso = new Date().toISOString();
  const uniqueVocabIds = Array.from(new Set(vocabularyIds));

  const newDeck: UserDeckRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: name.trim(),
    description: description?.trim() || null,
    vocabulary_ids: uniqueVocabIds,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    dirty: true
  };

  const existingReviews = await getAllReviews();
  const reviewByVocab = new Map<string, SrsReviewRecord>();
  for (const r of existingReviews) {
    reviewByVocab.set(r.vocabulary_id, r);
  }

  const tx = db.transaction(['user_decks', 'srs_reviews'], 'readwrite');
  tx.objectStore('user_decks').put(newDeck);

  const reviewStore = tx.objectStore('srs_reviews');
  for (const vocabId of uniqueVocabIds) {
    const existing = reviewByVocab.get(vocabId);
    if (!existing || existing.state === 'deleted' || existing.deleted_at) {
      reviewStore.put({
        id: existing?.id || crypto.randomUUID(),
        user_id: existing?.user_id || userId,
        vocabulary_id: vocabId,
        state: 'new',
        ease_factor: 2.5,
        interval_days: 0,
        next_review_date: nowIso,
        lapses: existing?.lapses ?? 0,
        updated_at: nowIso,
        deleted_at: null,
        dirty: true
      } satisfies SrsReviewRecord);
    }
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return newDeck;
}

/**
 * Duplica cualquier mazo (por defecto o personalizado) creando una copia en los mazos del usuario ("Míos").
 * El nuevo mazo recibe todas las palabras del mazo origen y es 100% editable.
 */
export async function duplicateDeckToCustom(
  deck: DeckSummary,
  userId: string = LOCAL_DEFAULT_USER_ID
): Promise<UserDeckRecord> {
  const [vocabList, customDecks] = await Promise.all([
    getAllVocabulary(),
    getAllUserDecks()
  ]);

  let vocabularyIds: string[] = [];

  if (deck.isCustom) {
    const existing = customDecks.find((d) => d.id === deck.id);
    if (existing && Array.isArray(existing.vocabulary_ids)) {
      vocabularyIds = [...existing.vocabulary_ids];
    }
  }

  // Si no se encontraron por id de mazo custom, usar la función de filtro del mazo
  if (vocabularyIds.length === 0 && deck.filterFn) {
    vocabularyIds = vocabList.filter(deck.filterFn).map((v) => v.id);
  }

  const copyName = `${deck.title} (Copia)`;
  return createCustomUserDeck(
    copyName,
    vocabularyIds,
    `Copia editable de "${deck.title}"`,
    userId
  );
}

export const SYSTEM_DEFAULT_DECK_IDS = new Set([
  'jlpt-n5',
  'verbs',
  'jlpt-n4',
  'nouns-adverbs',
  'jlpt-n3-all'
]);

/**
 * Elimina un mazo personalizado usando Soft-Delete (Tombstone) para sincronización LWW.
 * Los mazos por defecto del sistema están protegidos y no pueden eliminarse.
 */
export async function deleteCustomUserDeck(deckId: string): Promise<void> {
  if (SYSTEM_DEFAULT_DECK_IDS.has(deckId)) {
    throw new Error('Los mazos por defecto no se pueden modificar ni eliminar.');
  }
  const db = await openLocalDb();
  const all = await getAllUserDecks();
  const target = all.find((d) => d.id === deckId);
  if (!target) return;

  const nowIso = new Date().toISOString();
  const tx = db.transaction('user_decks', 'readwrite');
  tx.objectStore('user_decks').put({
    ...target,
    updated_at: nowIso,
    deleted_at: nowIso,
    dirty: true
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Agrega o quita una palabra dentro de un mazo personalizado creado por el usuario.
 * Valida estrictamente que no sea un mazo por defecto (los cuales son de solo lectura),
 * guarda la palabra en IndexedDB local si viene del buscador remoto y activa su tarjeta SRS.
 */
export async function toggleWordInCustomUserDeck(
  deckId: string,
  vocabItem: VocabularyRecord,
  userId: string = LOCAL_DEFAULT_USER_ID
): Promise<{ updatedDeck: UserDeckRecord; added: boolean }> {
  if (SYSTEM_DEFAULT_DECK_IDS.has(deckId)) {
    throw new Error('Los mazos por defecto no se pueden modificar.');
  }

  await upsertVocabularyBatch([vocabItem]);

  const db = await openLocalDb();
  const allDecks = await getAllUserDecks();
  const target = allDecks.find((d) => d.id === deckId && !d.deleted_at);
  if (!target) {
    throw new Error('Solo podés agregar palabras a tus propios mazos personalizados.');
  }

  const nowIso = new Date().toISOString();
  const currentIds = Array.isArray(target.vocabulary_ids) ? [...target.vocabulary_ids] : [];
  const alreadyInDeck = currentIds.includes(vocabItem.id);

  const nextVocabIds = alreadyInDeck
    ? currentIds.filter((id) => id !== vocabItem.id)
    : [...currentIds, vocabItem.id];

  const updatedDeck: UserDeckRecord = {
    ...target,
    vocabulary_ids: nextVocabIds,
    updated_at: nowIso,
    dirty: true
  };

  const existingReviews = await getAllReviews();
  const existingReview = existingReviews.find((r) => r.vocabulary_id === vocabItem.id);

  const tx = db.transaction(['user_decks', 'srs_reviews'], 'readwrite');
  tx.objectStore('user_decks').put(updatedDeck);

  if (!alreadyInDeck && (!existingReview || existingReview.state === 'deleted' || existingReview.deleted_at)) {
    tx.objectStore('srs_reviews').put({
      id: existingReview?.id || crypto.randomUUID(),
      user_id: existingReview?.user_id || userId,
      vocabulary_id: vocabItem.id,
      state: 'new',
      ease_factor: 2.5,
      interval_days: 0,
      next_review_date: nowIso,
      lapses: existingReview?.lapses ?? 0,
      updated_at: nowIso,
      deleted_at: null,
      dirty: true
    } satisfies SrsReviewRecord);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return { updatedDeck, added: !alreadyInDeck };
}

/**
 * Obtiene la lista completa de palabras (VocabularyRecord) asociadas a un mazo específico.
 */
export async function getWordsForDeck(deckId: string): Promise<VocabularyRecord[]> {
  const [allDecks, allVocab] = await Promise.all([getAllUserDecks(), getAllVocabulary()]);
  const target = allDecks.find((d) => d.id === deckId && !d.deleted_at);
  if (!target || !Array.isArray(target.vocabulary_ids)) return [];

  const vocabMap = new Map<string, VocabularyRecord>();
  for (const v of allVocab) {
    vocabMap.set(v.id, v);
  }

  const words: VocabularyRecord[] = [];
  for (const id of target.vocabulary_ids) {
    const word = vocabMap.get(id);
    if (word) words.push(word);
  }
  return words;
}

/**
 * Quita una palabra de un mazo personalizado propio.
 * Marca el mazo como dirty=true con updated_at actualizado para su posterior o inmediata sincronización.
 */
export async function removeWordFromCustomDeck(
  deckId: string,
  wordId: string
): Promise<UserDeckRecord> {
  if (SYSTEM_DEFAULT_DECK_IDS.has(deckId)) {
    throw new Error('Los mazos por defecto no se pueden modificar.');
  }

  const db = await openLocalDb();
  const allDecks = await getAllUserDecks();
  const target = allDecks.find((d) => d.id === deckId && !d.deleted_at);
  if (!target) {
    throw new Error('Mazo no encontrado o ya eliminado.');
  }

  const nowIso = new Date().toISOString();
  const currentIds = Array.isArray(target.vocabulary_ids) ? [...target.vocabulary_ids] : [];
  const nextVocabIds = currentIds.filter((id) => id !== wordId);

  const updatedDeck: UserDeckRecord = {
    ...target,
    vocabulary_ids: nextVocabIds,
    updated_at: nowIso,
    dirty: true
  };

  const tx = db.transaction('user_decks', 'readwrite');
  tx.objectStore('user_decks').put(updatedDeck);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return updatedDeck;
}

/**
 * Registra una calificación SRS en la base de datos local (100% Offline-First),
 * actualiza updated_at para resolución LWW, marca dirty=true y suma al Heatmap diario.
 */
export async function recordLocalCardReview(
  vocabularyId: string,
  rating: ReviewRating,
  userId: string = LOCAL_DEFAULT_USER_ID
): Promise<SrsReviewRecord> {
  const db = await openLocalDb();
  const allReviews = await getAllReviews();
  const existing = allReviews.find((r) => r.vocabulary_id === vocabularyId);

  const now = new Date();
  const nowIso = now.toISOString();

  const currentCard = existing
    ? {
        state: existing.state,
        easeFactor: Number(existing.ease_factor),
        intervalDays: Number(existing.interval_days),
        lapses: Number(existing.lapses)
      }
    : {
        state: 'new' as const,
        easeFactor: 2.5,
        intervalDays: 0,
        lapses: 0
      };

  const nextCalc = calculateNextReview(currentCard, rating, now);

  const updatedRecord: SrsReviewRecord = {
    id: existing?.id || crypto.randomUUID(),
    user_id: existing?.user_id || userId,
    vocabulary_id: vocabularyId,
    state: nextCalc.state,
    ease_factor: nextCalc.easeFactor,
    interval_days: nextCalc.intervalDays,
    next_review_date: nextCalc.nextReviewDate.toISOString(),
    lapses: nextCalc.lapses,
    updated_at: nowIso,
    deleted_at: null,
    dirty: true
  };

  const todayKey = formatDateKey(now);
  const logKey = `${userId}::${todayKey}`;

  const tx = db.transaction(['srs_reviews', 'study_log'], 'readwrite');
  tx.objectStore('srs_reviews').put(updatedRecord);

  const logStore = tx.objectStore('study_log');
  const getLogReq = logStore.get(logKey);
  getLogReq.onsuccess = () => {
    const prev = getLogReq.result as StudyLogRecord | undefined;
    const currentCount = prev?.reviews_count ?? 0;
    logStore.put({
      id: logKey,
      user_id: userId,
      date_key: todayKey,
      reviews_count: currentCount + 1,
      updated_at: nowIso,
      dirty: true
    } satisfies StudyLogRecord);
  };

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return updatedRecord;
}

/**
 * Revierte una calificación SRS (Deshacer / Volver a tarjeta anterior).
 * Restaura el estado previo del review en srs_reviews y decrementa study_log.
 */
export async function rollbackLocalCardReview(
  previousReview: SrsReviewRecord | null,
  vocabularyId: string,
  userId: string = LOCAL_DEFAULT_USER_ID
): Promise<void> {
  const db = await openLocalDb();
  const nowIso = new Date().toISOString();

  let existingIdToDelete: string | null = null;
  if (!previousReview) {
    const all = await getAllReviews();
    const curr = all.find((r) => r.vocabulary_id === vocabularyId);
    if (curr) {
      existingIdToDelete = curr.id;
    }
  }

  const tx = db.transaction(['srs_reviews', 'study_log'], 'readwrite');
  const reviewStore = tx.objectStore('srs_reviews');

  if (previousReview) {
    reviewStore.put({
      ...previousReview,
      updated_at: nowIso,
      dirty: true
    });
  } else if (existingIdToDelete) {
    reviewStore.delete(existingIdToDelete);
  }

  // Decrementar contador diario en study_log si era > 0
  const todayKey = formatDateKey(new Date());
  const logKey = `${userId}::${todayKey}`;
  const logStore = tx.objectStore('study_log');
  const getLogReq = logStore.get(logKey);
  getLogReq.onsuccess = () => {
    const prev = getLogReq.result as StudyLogRecord | undefined;
    const currentCount = prev?.reviews_count ?? 0;
    if (currentCount > 0) {
      logStore.put({
        id: logKey,
        user_id: userId,
        date_key: todayKey,
        reviews_count: currentCount - 1,
        updated_at: nowIso,
        dirty: true
      } satisfies StudyLogRecord);
    }
  };

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Agrega una palabra al estudio (guardándola en la base local si viene del buscador remoto)
 * o desactiva un registro con Soft-Delete (Tombstone).
 */
export async function toggleVocabularyInStudy(
  vocabularyId: string,
  userId: string = LOCAL_DEFAULT_USER_ID,
  vocabItem?: VocabularyRecord
): Promise<SrsReviewRecord> {
  if (vocabItem) {
    await upsertVocabularyBatch([vocabItem]);
  }
  const db = await openLocalDb();
  const allReviews = await getAllReviews();
  const existing = allReviews.find((r) => r.vocabulary_id === vocabularyId);
  const nowIso = new Date().toISOString();

  let record: SrsReviewRecord;
  if (existing && existing.state !== 'deleted' && !existing.deleted_at) {
    // Soft-Delete (Tombstone offline-first)
    record = {
      ...existing,
      state: 'deleted',
      updated_at: nowIso,
      deleted_at: nowIso,
      dirty: true
    };
  } else {
    record = {
      id: existing?.id || crypto.randomUUID(),
      user_id: existing?.user_id || userId,
      vocabulary_id: vocabularyId,
      state: 'new',
      ease_factor: 2.5,
      interval_days: 0,
      next_review_date: nowIso,
      lapses: existing?.lapses ?? 0,
      updated_at: nowIso,
      deleted_at: null,
      dirty: true
    };
  }

  const tx = db.transaction('srs_reviews', 'readwrite');
  tx.objectStore('srs_reviews').put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return record;
}

/**
 * Construye los mazos para el Dashboard asimétrico/escalonado (staggered layout)
 */
export async function getDecksAndQueue(): Promise<{
  decks: DeckSummary[];
  allCards: StudyCardItem[];
}> {
  const [vocabList, reviewList, customDecksList] = await Promise.all([
    getAllVocabulary(),
    getAllReviews(),
    getAllUserDecks()
  ]);
  const reviewMap = new Map<string, SrsReviewRecord>();
  for (const r of reviewList) {
    reviewMap.set(r.vocabulary_id, r);
  }

  const now = new Date();
  // Final del día actual (23:59:59.999 local) para evaluar los repasos por día calendario (estilo Anki)
  const endOfTodayMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  ).getTime();
  const activeCards: StudyCardItem[] = [];

  for (const v of vocabList) {
    const rev = reviewMap.get(v.id);
    if (rev && rev.state === 'deleted') continue;

    const effectiveReview: SrsReviewRecord = rev ?? {
      id: `virtual-${v.id}`,
      user_id: LOCAL_DEFAULT_USER_ID,
      vocabulary_id: v.id,
      state: 'new',
      ease_factor: 2.5,
      interval_days: 0,
      next_review_date: now.toISOString(),
      lapses: 0,
      updated_at: v.updated_at || now.toISOString(),
      deleted_at: null,
      dirty: false
    };

    activeCards.push({
      ...v,
      review: effectiveReview
    });
  }

  const storedLastStudiedMap = getAllDecksLastStudied();

  const buildDeck = (
    id: string,
    title: string,
    subtitle: string,
    badge: string,
    accentVariant: DeckSummary['accentVariant'],
    predicate: (v: VocabularyRecord) => boolean,
    createdAt: string,
    isCustom: boolean = false
  ): DeckSummary => {
    const matching = activeCards.filter(predicate);
    const dueCards = matching.filter(
      (c) => new Date(c.review.next_review_date).getTime() <= endOfTodayMs
    ).length;
    const newCards = matching.filter((c) => c.review.state === 'new').length;
    const masteredCards = matching.filter(
      (c) => c.review.state === 'review' && c.review.interval_days >= 3
    ).length;

    let latestCardStudyTime: string | null = null;
    for (const c of matching) {
      if (c.review && c.review.state !== 'new') {
        const u = c.review.updated_at;
        if (u && (!latestCardStudyTime || u > latestCardStudyTime)) {
          latestCardStudyTime = u;
        }
      }
    }

    const storedTime = storedLastStudiedMap[id] || getDeckLastStudied(id);
    let effectiveLastStudied: string | null = null;
    if (storedTime && latestCardStudyTime) {
      effectiveLastStudied = storedTime > latestCardStudyTime ? storedTime : latestCardStudyTime;
    } else {
      effectiveLastStudied = storedTime || latestCardStudyTime || null;
    }

    if (effectiveLastStudied && !storedTime) {
      setDeckLastStudied(id, effectiveLastStudied);
    }

    return {
      id,
      title,
      subtitle,
      badge,
      totalCards: matching.length,
      dueCards,
      newCards,
      masteredCards,
      accentVariant,
      createdAt,
      isCustom,
      filterFn: predicate,
      lastStudiedAt: effectiveLastStudied
    };
  };

  const baseDecks: DeckSummary[] = [
    buildDeck(
      'jlpt-n5',
      'JLPT N5 Esencial',
      'Kanjis base, partículas y vocabulario diario',
      'N5 • 基礎',
      'mint',
      (v) => v.jlpt_level === 5,
      '2026-10-01T10:00:00.000Z'
    ),
    buildDeck(
      'verbs',
      'Verbos (動詞)',
      'Conjugaciones Godan, Ichidan y Suru',
      '動詞 • VERBS',
      'olive',
      (v) => v.part_of_speech.toLowerCase().includes('verb'),
      '2026-10-05T10:00:00.000Z'
    ),
    buildDeck(
      'jlpt-n4',
      'JLPT N4 Intermedio',
      'Compuestos abstractos y vida cotidiana',
      'N4 • 中級',
      'slate',
      (v) => v.jlpt_level === 4,
      '2026-10-10T10:00:00.000Z'
    ),
    buildDeck(
      'nouns-adverbs',
      'Sustantivos & Adverbios',
      'Expresiones clave de fluidez y conversación',
      '語彙 • VOCAB',
      'emerald',
      (v) =>
        v.part_of_speech.toLowerCase().includes('noun') ||
        v.part_of_speech.toLowerCase().includes('adverb'),
      '2026-10-15T10:00:00.000Z'
    ),
    buildDeck(
      'jlpt-n3-all',
      'Inmersión Total (N5–N3)',
      'Todas las palabras activas para practicar',
      '総合 • TODO',
      'mint',
      () => true,
      '2026-10-20T10:00:00.000Z'
    )
  ];

  const accentPalette: DeckSummary['accentVariant'][] = ['emerald', 'mint', 'olive', 'slate'];
  const activeCustomDecks = customDecksList
    .filter((d) => !d.deleted_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((custom, idx) => {
      const idSet = new Set(custom.vocabulary_ids || []);
      return buildDeck(
        custom.id,
        custom.name,
        custom.description || `${idSet.size} palabras seleccionadas`,
        'カスタム • MÍO',
        accentPalette[idx % accentPalette.length],
        (v) => idSet.has(v.id),
        custom.created_at,
        true
      );
    });

  return { decks: [...baseDecks, ...activeCustomDecks], allCards: activeCards };
}

/**
 * Buscador Offline-First con soporte WanaKana (Romaji -> Hiragana/Katakana + Español/Inglés/Kanji)
 */
export async function searchLocalVocabulary(
  rawQuery: string,
  jlptFilter: number | null = null
): Promise<Array<VocabularyRecord & { inStudy: boolean; state: string }>> {
  const [vocabList, reviewList] = await Promise.all([getAllVocabulary(), getAllReviews()]);
  const reviewMap = new Map<string, SrsReviewRecord>();
  for (const r of reviewList) {
    reviewMap.set(r.vocabulary_id, r);
  }

  const converted = convertSearchQueryToKana(rawQuery);
  const qLower = converted.raw.toLowerCase();
  const hira = converted.hiragana;
  const kata = converted.katakana;
  const deconjugated = getDeconjugatedCandidates(rawQuery);

  return vocabList
    .filter((v) => {
      if (jlptFilter !== null && v.jlpt_level !== jlptFilter) return false;
      if (!qLower) return true;

      const cleanKanji = stripRubyTags(v.kanji);
      const itemRomaji = toRomajiText(v.reading).toLowerCase();

      const matchesDeconjugated =
        deconjugated.length > 0 &&
        deconjugated.some((cand) => {
          return (
            cleanKanji.includes(cand) ||
            v.reading.includes(cand) ||
            (cand.length >= 2 && cleanKanji.startsWith(cand.slice(0, -1)))
          );
        });

      return (
        cleanKanji.includes(qLower) ||
        cleanKanji.includes(hira) ||
        v.reading.includes(qLower) ||
        v.reading.includes(hira) ||
        v.reading.includes(kata) ||
        itemRomaji.includes(qLower) ||
        v.meaning_es.toLowerCase().includes(qLower) ||
        v.meaning_en.toLowerCase().includes(qLower) ||
        matchesDeconjugated
      );
    })
    .map((v) => {
      const rev = reviewMap.get(v.id);
      const active = Boolean(rev && rev.state !== 'deleted' && !rev.deleted_at);
      return {
        ...v,
        inStudy: active,
        state: rev?.state || 'new'
      };
    });
}

/**
 * Obtiene los datos del Mapa de Calor (Heatmap) estilo GitHub para las últimas 12 semanas (84 días)
 */
export interface HeatmapDayCell {
  dateKey: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
}

export async function getStudyHeatmapCells(
  totalDays = 84,
  userId?: string
): Promise<{
  cells: HeatmapDayCell[];
  totalReviews: number;
  currentStreak: number;
  todayCount: number;
}> {
  const [logs, allReviews] = await Promise.all([
    getAllStudyLogs(userId),
    getAllReviews()
  ]);

  const countMap = new Map<string, number>();

  // 1. Cargar conteos registrados en study_log para este usuario
  for (const item of logs) {
    if (userId && item.user_id !== userId) continue;
    countMap.set(item.date_key, item.reviews_count);
  }

  // 2. Si no había log explícito pero el usuario realizó repasos reales en srs_reviews,
  // computar los repasos de esas fechas para máxima consistencia y respaldo
  const userReviews = userId ? allReviews.filter((r) => r.user_id === userId) : allReviews;
  for (const r of userReviews) {
    if (r.updated_at) {
      try {
        const d = new Date(r.updated_at);
        if (!Number.isNaN(d.getTime())) {
          const k = formatDateKey(d);
          if (!countMap.has(k)) {
            countMap.set(k, 1);
          }
        }
      } catch {
        // Ignorar fechas malformadas
      }
    }
  }

  const today = new Date();
  const todayKey = formatDateKey(today);
  const cells: HeatmapDayCell[] = [];
  let totalReviews = 0;

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = formatDateKey(d);
    const count = countMap.get(key) ?? 0;
    totalReviews += count;

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (count >= 20) level = 4;
    else if (count >= 12) level = 3;
    else if (count >= 6) level = 2;
    else if (count >= 1) level = 1;

    cells.push({
      dateKey: key,
      count,
      level,
      isToday: key === todayKey
    });
  }

  // Calcular racha actual de días consecutivos
  let currentStreak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].count > 0) {
      currentStreak++;
    } else if (i < cells.length - 1) {
      break;
    }
  }

  return {
    cells,
    totalReviews,
    currentStreak,
    todayCount: countMap.get(todayKey) ?? 0
  };
}

