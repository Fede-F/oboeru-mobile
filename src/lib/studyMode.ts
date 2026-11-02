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
