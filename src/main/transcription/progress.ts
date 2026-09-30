// Доля выполненной работы по встрече: шаги взвешены по ожидаемому времени (спецификация Плана 3, §5.4).
import type { TranscriptionStage } from '../../shared/transcription';
import type { TrackPlan } from './routing';

/** Ожидаемое время шага на секунду звука (Ryzen 7 3700X, спайк: распознавание RTF 0,13, разделение 0,15). */
export const COST_PER_SEC = { prepare: 0.01, recognize: 0.13, diarize: 0.15 } as const;
/** Для оценки длительности разделения по голосам берём с запасом: прогресс не должен упираться в потолок. */
export const DIARIZE_ESTIMATE_PER_SEC = 0.25;
/** Пока идёт разделение (прогресса изнутри нет), полоска доходит до этой доли шага и ждёт. */
export const DIARIZE_CEILING = 0.95;

export interface Step {
  stage: Exclude<TranscriptionStage, 'queued' | 'download'>;
  /** Номер дорожки в плане. */
  track: number;
  cost: number;
}

/** Шаги по порядку: для каждой дорожки — подготовка, (разделение), распознавание. */
export function planSteps(plans: readonly TrackPlan[], durationsSec: readonly number[]): Step[] {
  return plans.flatMap((plan, track) => {
    const sec = Math.max(1, durationsSec[track] ?? 0);
    const steps: Step[] = [{ stage: 'prepare', track, cost: COST_PER_SEC.prepare * sec }];
    if (plan.role === 'others' && plan.diarize.mode !== 'none') {
      steps.push({ stage: 'diarize', track, cost: COST_PER_SEC.diarize * sec });
    }
    steps.push({ stage: plan.role === 'me' ? 'me' : 'others', track, cost: COST_PER_SEC.recognize * sec });
    return steps;
  });
}

/** Общая доля при шаге index, выполненном на fraction (0…1): [начало шага, текущая]. */
export function overallFraction(steps: readonly Step[], index: number, fraction: number): number {
  const total = steps.reduce((sum, s) => sum + s.cost, 0);
  if (total <= 0) return 0;
  const before = steps.slice(0, index).reduce((sum, s) => sum + s.cost, 0);
  // Не число (деление на ноль где-то выше) — считаем, что шаг только начался.
  const share = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const current = (steps[index]?.cost ?? 0) * share;
  return Math.min(1, (before + current) / total);
}

/** Разделение по голосам — один долгий вызов без прогресса: main двигает полоску по времени. */
export interface DiarizeClock {
  /** Доля всей работы в начале и в конце шага. */
  from: number;
  to: number;
  expectedMs: number;
}

export function interpolateDiarize(clock: DiarizeClock, elapsedMs: number): number {
  const raw = clock.expectedMs > 0 ? elapsedMs / clock.expectedMs : Number.NaN;
  // Часы перевели назад — доля не меньше нуля; оценки нет или она не число — сразу потолок.
  const share = Number.isFinite(raw) ? Math.min(DIARIZE_CEILING, Math.max(0, raw)) : DIARIZE_CEILING;
  return clock.from + (clock.to - clock.from) * share;
}
