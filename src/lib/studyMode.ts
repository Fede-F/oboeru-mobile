export type StudyMode = 'jp_to_es' | 'es_to_jp' | 'mixed';

const STORAGE_PREFIX = 'oboeru_deck_study_mode_';

export function getDeckStudyMode(deckId: string): StudyMode {
  try {
    const val = localStorage.getItem(`${STORAGE_PREFIX}${deckId}`);
    if (val === 'es_to_jp' || val === 'mixed') {
      return val;
    }
  } catch {
    // fallback
  }
  return 'jp_to_es';
}

export function setDeckStudyMode(deckId: string, mode: StudyMode): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${deckId}`, mode);
  } catch {
    // ignore
  }
}

export const STUDY_MODE_DETAILS: Record<
  StudyMode,
  {
    id: StudyMode;
    label: string;
    description: string;
    icon: string;
    badge: string;
  }
> = {
  jp_to_es: {
    id: 'jp_to_es',
    label: 'Japonés → Español',
    description: 'Ves el japonés y descubrís el significado en español (Lectura / Reconocimiento)',
    icon: '🇯🇵',
    badge: 'JP → ES'
  },
  es_to_jp: {
    id: 'es_to_jp',
    label: 'Español → Japonés',
    description: 'Ves el significado en español y recordás la palabra en japonés (Producción / Memoria activa)',
    icon: '🇪🇸',
    badge: 'ES → JP'
  },
  mixed: {
    id: 'mixed',
    label: 'Mixto / Bidireccional',
    description: 'Alterna de forma balanceada entre ambas modalidades para un aprendizaje completo',
    icon: '🔀',
    badge: 'Mixto'
  }
};

const LAST_STUDIED_PREFIX = 'oboeru_deck_last_studied_';
const LAST_STUDIED_MAP_KEY = 'oboeru_decks_last_studied_map';

export function getDeckLastStudied(deckId: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const direct = localStorage.getItem(`${LAST_STUDIED_PREFIX}${deckId}`);
    if (direct) return direct;
    const mapStr = localStorage.getItem(LAST_STUDIED_MAP_KEY);
    if (mapStr) {
      const map = JSON.parse(mapStr);
      return map[deckId] || null;
    }
  } catch {
    // fallback
  }
  return null;
}

export function setDeckLastStudied(deckId: string, timestamp?: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const time = timestamp || new Date().toISOString();
    localStorage.setItem(`${LAST_STUDIED_PREFIX}${deckId}`, time);
    const mapStr = localStorage.getItem(LAST_STUDIED_MAP_KEY);
    const map = mapStr ? JSON.parse(mapStr) : {};
    map[deckId] = time;
    localStorage.setItem(LAST_STUDIED_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getAllDecksLastStudied(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const mapStr = localStorage.getItem(LAST_STUDIED_MAP_KEY);
    return mapStr ? JSON.parse(mapStr) : {};
  } catch {
    return {};
  }
}
