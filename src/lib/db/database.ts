import type {
  DeckSummary,
  ReviewRating,
  SrsReviewRecord,
  StudyCardItem,
  VocabularyRecord
} from './schema';
import { INITIAL_VOCABULARY_SEED } from './seedVocabulary';
import { calculateNextReview } from '../srs/sm2';
import { convertSearchQueryToKana, stripRubyTags, toRomajiText } from '../utils/japanese';

const DB_NAME = 'oboeru_offline_db';
const DB_VERSION = 2;

export const LOCAL_DEFAULT_USER_ID = '00000000-0000-4000-8000-000000000001';

let dbPromise: Promise<IDBDatabase> | null = null;

function openLocalDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
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

      // 3. Tabla study_log (para el Mapa de Calor estilo GitHub)
      if (!db.objectStoreNames.contains('study_log')) {
        db.createObjectStore('study_log', { keyPath: 'date_key' });
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

/**
 * Inicializa la base de datos local y siembra el diccionario JLPT + actividad inicial offline
 */
export async function initLocalDatabase(userId: string = LOCAL_DEFAULT_USER_ID): Promise<void> {
  const db = await openLocalDb();

  // Sembrar vocabulario inicial si está vacío
  const vocabCount = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction('vocabulary', 'readonly');
    const req = tx.objectStore('vocabulary').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (vocabCount === 0) {
    await upsertVocabularyBatch(INITIAL_VOCABULARY_SEED);
  }

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

  // Sembrar historial base de estudio para el Heatmap estilo GitHub si está vacío
  const logCount = await new Promise<number>((resolve, reject) => {
    const tx = db.transaction('study_log', 'readonly');
    const req = tx.objectStore('study_log').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (logCount === 0) {
    const tx = db.transaction('study_log', 'readwrite');
    const store = tx.objectStore('study_log');
    const today = new Date();
    // Sembrar consistencia realista en las últimas 12 semanas (84 días)
    const deterministicPattern = [
      0, 4, 9, 14, 6, 18, 11, 0, 7, 15, 22, 12, 8, 5,
      3, 12, 19, 8, 0, 14, 21, 9, 6, 16, 25, 13, 4, 10
    ];

    for (let i = 83; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const count = i === 0 ? 8 : deterministicPattern[i % deterministicPattern.length];
      if (count > 0) {
        store.put({
          date_key: formatDateKey(d),
          reviews_count: count,
          updated_at: d.toISOString()
        });
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
}

/**
 * Inserta o actualiza un lote de vocabulario preservando registros existentes
 */
export async function upsertVocabularyBatch(items: VocabularyRecord[]): Promise<void> {
  if (items.length === 0) return;
  const db = await openLocalDb();
  const tx = db.transaction('vocabulary', 'readwrite');
  const store = tx.objectStore('vocabulary');

  for (const item of items) {
    store.put({
      ...item,
      updated_at: item.updated_at || new Date().toISOString()
    });
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
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vocabulary', 'readonly');
    const req = tx.objectStore('vocabulary').getAll();
    req.onsuccess = () => resolve(req.result as VocabularyRecord[]);
    req.onerror = () => reject(req.error);
  });
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

  const tx = db.transaction(['srs_reviews', 'study_log'], 'readwrite');
  tx.objectStore('srs_reviews').put(updatedRecord);

  const logStore = tx.objectStore('study_log');
  const getLogReq = logStore.get(todayKey);
  getLogReq.onsuccess = () => {
    const currentCount = getLogReq.result?.reviews_count ?? 0;
    logStore.put({
      date_key: todayKey,
      reviews_count: currentCount + 1,
      updated_at: nowIso
    });
  };

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return updatedRecord;
}

/**
 * Agrega una palabra al estudio o reactiva un registro con Soft-Delete (Tombstone)
 */
export async function toggleVocabularyInStudy(
  vocabularyId: string,
  userId: string = LOCAL_DEFAULT_USER_ID
): Promise<SrsReviewRecord> {
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
  const [vocabList, reviewList] = await Promise.all([getAllVocabulary(), getAllReviews()]);
  const reviewMap = new Map<string, SrsReviewRecord>();
  for (const r of reviewList) {
    reviewMap.set(r.vocabulary_id, r);
  }

  const now = new Date();
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

  const buildDeck = (
    id: string,
    title: string,
    subtitle: string,
    badge: string,
    accentVariant: DeckSummary['accentVariant'],
    predicate: (v: VocabularyRecord) => boolean
  ): DeckSummary => {
    const matching = activeCards.filter(predicate);
    const dueCards = matching.filter(
      (c) => new Date(c.review.next_review_date).getTime() <= now.getTime()
    ).length;
    const newCards = matching.filter((c) => c.review.state === 'new').length;
    const masteredCards = matching.filter(
      (c) => c.review.state === 'review' && c.review.interval_days >= 3
    ).length;

    return {
      id,
      title,
      subtitle,
      badge,
      totalCards: matching.length,
      dueCards: dueCards || matching.length,
      newCards,
      masteredCards,
      accentVariant,
      filterFn: predicate
    };
  };

  const decks: DeckSummary[] = [
    buildDeck(
      'jlpt-n5',
      'JLPT N5 Esencial',
      'Kanjis base, partículas y vocabulario diario',
      'N5 • 基礎',
      'mint',
      (v) => v.jlpt_level === 5
    ),
    buildDeck(
      'verbs',
      'Verbos (動詞)',
      ' Conjugaciones Godan, Ichidan y Suru',
      '動詞 • VERBS',
      'olive',
      (v) => v.part_of_speech.toLowerCase().includes('verb')
    ),
    buildDeck(
      'jlpt-n4',
      'JLPT N4 Intermedio',
      'Compuestos abstractos y vida cotidiana',
      'N4 • 中級',
      'slate',
      (v) => v.jlpt_level === 4
    ),
    buildDeck(
      'nouns-adverbs',
      'Sustantivos & Adverbios',
      'Expresiones clave de fluidez y conversación',
      '語彙 • VOCAB',
      'emerald',
      (v) =>
        v.part_of_speech.toLowerCase().includes('noun') ||
        v.part_of_speech.toLowerCase().includes('adverb')
    ),
    buildDeck(
      'jlpt-n3-all',
      'Inmersión Total (N5–N3)',
      'Mazo completo de repaso espaciado activo',
      '総合 • ALL',
      'mint',
      () => true
    )
  ];

  return { decks, allCards: activeCards };
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

  return vocabList
    .filter((v) => {
      if (jlptFilter !== null && v.jlpt_level !== jlptFilter) return false;
      if (!qLower) return true;

      const cleanKanji = stripRubyTags(v.kanji);
      const itemRomaji = toRomajiText(v.reading).toLowerCase();

      return (
        cleanKanji.includes(qLower) ||
        cleanKanji.includes(hira) ||
        v.reading.includes(qLower) ||
        v.reading.includes(hira) ||
        v.reading.includes(kata) ||
        itemRomaji.includes(qLower) ||
        v.meaning_es.toLowerCase().includes(qLower) ||
        v.meaning_en.toLowerCase().includes(qLower)
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

export async function getStudyHeatmapCells(totalDays = 84): Promise<{
  cells: HeatmapDayCell[];
  totalReviews: number;
  currentStreak: number;
  todayCount: number;
}> {
  const db = await openLocalDb();
  const logs = await new Promise<Array<{ date_key: string; reviews_count: number }>>(
    (resolve, reject) => {
      const tx = db.transaction('study_log', 'readonly');
      const req = tx.objectStore('study_log').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }
  );

  const countMap = new Map<string, number>();
  for (const item of logs) {
    countMap.set(item.date_key, item.reviews_count);
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

