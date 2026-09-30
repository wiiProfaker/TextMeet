// Какая дорожка как обрабатывается (спецификация Плана 3, §4.1).
import type { TrackKind } from '../../shared/meeting';

export interface TrackInput {
  kind: TrackKind;
  /** Файл дорожки (есть на диске и не пустой). */
  file: string;
  /** Сдвиг начала дорожки от начала встречи, с. */
  offsetSec: number;
}

/** Делить ли дорожку по голосам: нет (один голос), на известное число, или определить самим. */
export type DiarizeMode = { mode: 'none' } | { mode: 'fixed'; speakers: number } | { mode: 'auto' };

export interface TrackPlan {
  track: TrackInput;
  /** «me» — всё подписывается «Я»; «others» — «Спикер N». */
  role: 'me' | 'others';
  diarize: DiarizeMode;
}

/** Сколько голосов на дорожке собеседников: 1 — делить не нужно; неизвестно (или 0) — определить самим. */
export function othersMode(voices: number | null): DiarizeMode {
  if (voices === null || voices < 1) return { mode: 'auto' };
  if (voices === 1) return { mode: 'none' };
  return { mode: 'fixed', speakers: voices };
}

/**
 * План по дорожкам.
 * - Запись со звуком компьютера: микрофон — «Я»; звук компьютера — собеседники, их на одного меньше, чем участников.
 * - Запись без звука компьютера (живая встреча): микрофон слышит всех — делится по голосам, все — «Спикер N».
 * recordedSystem — писался ли звук компьютера (есть ли дорожка system в meeting.json), даже если её файл пуст.
 */
export function planTracks(
  tracks: readonly TrackInput[],
  recordedSystem: boolean,
  participantsHint: number | null,
): TrackPlan[] {
  const mic = tracks.find((t) => t.kind === 'mic');
  const system = tracks.find((t) => t.kind === 'system');
  if (!recordedSystem) {
    return mic ? [{ track: mic, role: 'others', diarize: othersMode(participantsHint) }] : [];
  }
  const others = othersMode(participantsHint === null ? null : participantsHint - 1);
  return [
    ...(mic ? [{ track: mic, role: 'me' as const, diarize: { mode: 'none' } as const }] : []),
    ...(system ? [{ track: system, role: 'others' as const, diarize: others }] : []),
  ];
}
