/**
 * Esquema Local Offline-First de Oboeru
 * Replica estrictamente el esquema PostgreSQL de producción (https://oboeru-api.planner.ar)
 */

export type SrsState = 'new' | 'learning' | 'review' | 'suspended' | 'deleted';

export type ReviewRating = 1 | 2 | 3 | 4;

export interface VocabularyRecord {
  id: string;
  kanji: string | null;
  reading: string;
  meaning_es: string;
  meaning_en: string;
  jlpt_level: number;
  part_of_speech: string;
  example_sentence: string | null;
  updated_at?: string;
}

export interface SrsReviewRecord {
  id: string;
  user_id: string;
  vocabulary_id: string;
  state: SrsState;
  ease_factor: number;
  interval_days: number;
  next_review_date: string; // ISO-8601 TIMESTAMPTZ
  lapses: number;
  updated_at: string; // ISO-8601 TIMESTAMPTZ (Usado para resolución Last-Write-Wins)
  deleted_at: string | null; // ISO-8601 TIMESTAMPTZ (Tombstone para Soft-Delete)
  dirty?: boolean; // Indicador local de registro pendiente de sincronizar (Push)
}

export interface StudyCardItem extends VocabularyRecord {
  review: SrsReviewRecord;
}

export interface UserDeckRecord {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  vocabulary_ids: string[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty?: boolean;
}

export interface StudyLogRecord {
  id?: string;
  user_id: string;
  date_key: string;
  reviews_count: number;
  updated_at: string;
  dirty?: boolean;
}

export interface DeckSummary {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  totalCards: number;
  dueCards: number;
  newCards: number;
  masteredCards: number;
  accentVariant: 'mint' | 'olive' | 'slate' | 'emerald';
  createdAt: string;
  isCustom?: boolean;
  filterFn?: (vocab: VocabularyRecord) => boolean;
  lastStudiedAt?: string | null;
}

/**
 * Definición declarativa compatible con WatermelonDB (appSchema / tableSchema)
 */
export const WATERMELON_SCHEMA_CONFIG = {
  version: 4,
  tables: {
    vocabulary: {
      name: 'vocabulary',
      columns: [
        { name: 'kanji', type: 'string', isOptional: true },
        { name: 'reading', type: 'string', isIndexed: true },
        { name: 'meaning_es', type: 'string' },
        { name: 'meaning_en', type: 'string' },
        { name: 'jlpt_level', type: 'number', isIndexed: true },
        { name: 'part_of_speech', type: 'string' },
        { name: 'example_sentence', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'string', isIndexed: true }
      ]
    },
    srs_reviews: {
      name: 'srs_reviews',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'vocabulary_id', type: 'string', isIndexed: true },
        { name: 'state', type: 'string', isIndexed: true },
        { name: 'ease_factor', type: 'number' },
        { name: 'interval_days', type: 'number' },
        { name: 'next_review_date', type: 'string', isIndexed: true },
        { name: 'lapses', type: 'number' },
        { name: 'updated_at', type: 'string', isIndexed: true },
        { name: 'deleted_at', type: 'string', isOptional: true },
        { name: 'dirty', type: 'boolean', isOptional: true }
      ]
    },
    user_decks: {
      name: 'user_decks',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'vocabulary_ids', type: 'string' },
        { name: 'created_at', type: 'string' },
        { name: 'updated_at', type: 'string', isIndexed: true },
        { name: 'deleted_at', type: 'string', isOptional: true },
        { name: 'dirty', type: 'boolean', isOptional: true }
      ]
    }
  }
} as const;

/**
 * Sentencias SQL DDL para inicialización en SQLite Nativo (@capacitor-community/sqlite)
 */
export const SQLITE_SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY NOT NULL,
  kanji TEXT NULL,
  reading TEXT NOT NULL,
  meaning_es TEXT NOT NULL,
  meaning_en TEXT NOT NULL,
  jlpt_level INTEGER NOT NULL CHECK (jlpt_level BETWEEN 1 AND 5),
  part_of_speech TEXT NOT NULL,
  example_sentence TEXT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_jlpt_level ON vocabulary (jlpt_level);
CREATE INDEX IF NOT EXISTS idx_vocabulary_reading ON vocabulary (reading);
CREATE INDEX IF NOT EXISTS idx_vocabulary_updated_at ON vocabulary (updated_at);

CREATE TABLE IF NOT EXISTS srs_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  vocabulary_id TEXT NOT NULL REFERENCES vocabulary(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'learning', 'review', 'suspended', 'deleted')),
  ease_factor REAL NOT NULL DEFAULT 2.50,
  interval_days INTEGER NOT NULL DEFAULT 0,
  next_review_date TEXT NOT NULL,
  lapses INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  dirty INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, vocabulary_id)
);

CREATE INDEX IF NOT EXISTS idx_srs_reviews_user_next_review ON srs_reviews (user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_srs_reviews_user_updated_at ON srs_reviews (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_srs_reviews_dirty ON srs_reviews (dirty);

CREATE TABLE IF NOT EXISTS study_log (
  date_key TEXT PRIMARY KEY NOT NULL,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_decks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  vocabulary_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT NULL,
  dirty INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_user_decks_user_updated_at ON user_decks (user_id, updated_at);
`;

