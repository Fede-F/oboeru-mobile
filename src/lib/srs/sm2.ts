import type { ReviewRating, SrsState } from '../db/schema';

export interface SrsCardState {
  state: SrsState;
  easeFactor: number;
  intervalDays: number;
  lapses: number;
}

export interface SrsCalculationResult extends SrsCardState {
  nextReviewDate: Date;
  labelInterval: string;
}

const MIN_EASE_FACTOR = 1.3;

/**
 * Algoritmo SRS basado en SuperMemo SM-2 / Anki (idéntico al backend en producción)
 */
export function calculateNextReview(
  current: SrsCardState,
  rating: ReviewRating,
  now: Date = new Date()
): SrsCalculationResult {
  let { state, easeFactor, intervalDays, lapses } = current;

  if (rating === 1) {
    // Again (Olvidado): vuelve a learning, suma un lapso y reduce el ease factor
    if (state === 'review') {
      lapses += 1;
    }
    state = 'learning';
    intervalDays = 1;
    easeFactor = Math.max(MIN_EASE_FACTOR, Number((easeFactor - 0.2).toFixed(2)));
    // En sesión activa mostramos "10 min" como indicador táctico inmediato y programamos repaso corto
    const nextReviewDate = new Date(now.getTime() + 10 * 60 * 1000);
    return {
      state,
      easeFactor,
      intervalDays,
      lapses,
      nextReviewDate,
      labelInterval: '10 min'
    };
  }

  if (state === 'new' || state === 'learning' || state === 'deleted') {
    state = 'review';
    if (rating === 2) {
      intervalDays = 1;
    } else if (rating === 3) {
      intervalDays = intervalDays >= 1 ? 3 : 1;
    } else {
      intervalDays = 4;
    }
  } else {
    // Estado 'review' con respuesta exitosa (2 = Hard, 3 = Good, 4 = Easy)
    if (rating === 2) {
      intervalDays = Math.max(1, Math.round(intervalDays * 1.2));
      easeFactor = Math.max(MIN_EASE_FACTOR, Number((easeFactor - 0.15).toFixed(2)));
    } else if (rating === 3) {
      intervalDays = Math.max(2, Math.round(intervalDays * easeFactor));
    } else if (rating === 4) {
      intervalDays = Math.max(4, Math.round(intervalDays * easeFactor * 1.3));
      easeFactor = Number((easeFactor + 0.15).toFixed(2));
    }
  }

  const nextReviewDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const labelInterval = intervalDays === 1 ? '1 day' : `${intervalDays} days`;

  return {
    state,
    easeFactor,
    intervalDays,
    lapses,
    nextReviewDate,
    labelInterval
  };
}

/**
 * Calcula las etiquetas de tiempo previas para los 4 botones SRS inferiores
 * (ej. Again: 10 min, Hard: 1 day, Good: 3 days, Easy: 4 days)
 */
export function getSrsButtonPreviews(current: SrsCardState): Record<ReviewRating, string> {
  const now = new Date();
  return {
    1: calculateNextReview(current, 1, now).labelInterval,
    2: calculateNextReview(current, 2, now).labelInterval,
    3:
      current.state === 'new' || current.state === 'learning'
        ? '3 days'
        : calculateNextReview(current, 3, now).labelInterval,
    4: calculateNextReview(current, 4, now).labelInterval
  };
}

