import type { ReviewRating, SrsState } from '../db/schema';

export interface SrsCardState {
  state: SrsState;
  easeFactor: number;
  intervalDays: number;
  lapses: number;
  /** Fecha programada actual (opcional). Permite detectar repasos adelantados y evitar inflar el intervalo. */
  nextReviewDate?: string | Date | null;
}

export interface SrsCalculationResult extends SrsCardState {
  nextReviewDate: Date;
  labelInterval: string;
}

const MIN_EASE_FACTOR = 1.3;
const MAX_INTERVAL_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Formatea un intervalo en días a una etiqueta clara y legible en español (ej. 1 día, 14 días, 2 meses, 1 año)
 */
export function formatIntervalLabel(intervalDays: number): string {
  const days = Math.max(1, Math.round(intervalDays));
  if (days === 1) return '1 día';
  if (days < 30) return `${days} días`;
  if (days < 365) {
    const months = Math.round((days / 30) * 10) / 10;
    const rounded = Number.isInteger(months) ? months : Number(months.toFixed(1));
    return rounded === 1 ? '1 mes' : `${rounded} meses`;
  }
  return '1 año';
}

/**
 * Algoritmo SRS basado en SuperMemo SM-2 / Anki con protección contra repasos adelantados
 * y tope máximo de 365 días.
 */
export function calculateNextReview(
  current: SrsCardState,
  rating: ReviewRating,
  now: Date = new Date()
): SrsCalculationResult {
  let { state, easeFactor, intervalDays, lapses } = current;
  const existingDueDate = current.nextReviewDate ? new Date(current.nextReviewDate) : null;

  if (rating === 1) {
    // Again (Olvidado): vuelve a learning, suma un lapso, reduce el ease factor y reaparece en 10 min
    if (state === 'review') {
      lapses += 1;
    }
    state = 'learning';
    intervalDays = 1;
    easeFactor = Math.max(MIN_EASE_FACTOR, Number((easeFactor - 0.2).toFixed(2)));
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
    const wasLearning = state === 'learning';
    state = 'review';
    if (rating === 2) {
      // Difícil: 1 día
      intervalDays = 1;
    } else if (rating === 3) {
      // Bien: 1 día si viene de un fallo en learning; 3 días si es nueva y la supo bien
      intervalDays = wasLearning ? 1 : 3;
    } else {
      // Fácil: 4 días
      intervalDays = 4;
    }
  } else {
    // Estado 'review' con respuesta exitosa (2 = Hard, 3 = Good, 4 = Easy)
    // Detectar si es un repaso adelantado (faltan más de 12 horas para que venza)
    const msRemaining = existingDueDate ? existingDueDate.getTime() - now.getTime() : 0;
    const isEarlyReview = msRemaining > 12 * 60 * 60 * 1000;

    if (isEarlyReview) {
      // Repaso adelantado: no multiplicar exponencialmente el intervalo
      const currentInt = Math.max(1, Math.round(intervalDays));
      if (rating === 2) {
        intervalDays = currentInt;
        easeFactor = Math.max(MIN_EASE_FACTOR, Number((easeFactor - 0.05).toFixed(2)));
      } else if (rating === 3) {
        intervalDays = currentInt;
      } else if (rating === 4) {
        intervalDays = Math.min(MAX_INTERVAL_DAYS, currentInt + 1);
      }
    } else {
      // Repaso vencido (flujo SM-2 normal con tope máximo de 365 días)
      if (rating === 2) {
        intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(intervalDays * 1.2)));
        easeFactor = Math.max(MIN_EASE_FACTOR, Number((easeFactor - 0.15).toFixed(2)));
      } else if (rating === 3) {
        intervalDays = Math.min(MAX_INTERVAL_DAYS, Math.max(2, Math.round(intervalDays * easeFactor)));
      } else if (rating === 4) {
        intervalDays = Math.min(
          MAX_INTERVAL_DAYS,
          Math.max(4, Math.round(intervalDays * easeFactor * 1.3))
        );
        easeFactor = Number((easeFactor + 0.15).toFixed(2));
      }
    }
  }

  let nextReviewDate = new Date(now.getTime() + intervalDays * MS_PER_DAY);
  if (existingDueDate && existingDueDate.getTime() > nextReviewDate.getTime()) {
    nextReviewDate = existingDueDate;
  }

  const labelInterval = formatIntervalLabel(intervalDays);

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
 * Calcula las etiquetas de tiempo previas para los 4 botones SRS inferiores,
 * coincidiendo exactamente con lo que guardará calculateNextReview().
 */
export function getSrsButtonPreviews(current: SrsCardState): Record<ReviewRating, string> {
  const now = new Date();
  return {
    1: calculateNextReview(current, 1, now).labelInterval,
    2: calculateNextReview(current, 2, now).labelInterval,
    3: calculateNextReview(current, 3, now).labelInterval,
    4: calculateNextReview(current, 4, now).labelInterval
  };
}
