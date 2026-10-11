// Типы записи, общие для main, окна записи и главного окна. Без zod и пакетов: модуль попадает в preload.
import type { TrackKind } from './meeting';

/** Файл дорожки в папке audio/ по её виду; file — звук встречи из файла (импорт). */
export const TRACK_FILES: Record<TrackKind, string> = { mic: 'mic.webm', system: 'system.webm', file: 'source.mka' };
/** Сведение дорожек для прослушивания. */
export const MIX_FILE = 'mix.opus';
/** Делений в индикаторе уровня. */
export const METER_SEGMENTS = 20;
/** Нижняя граница шкалы индикатора, дБ. */
export const METER_FLOOR_DB = -60;

export type RecordingPhase = 'idle' | 'starting' | 'recording' | 'stopping';
/** Звук компьютера в текущей записи: не пишется, пишется, не удалось подключиться. */
export type SystemAudioState = 'off' | 'on' | 'failed';
export type SystemSettingsKind = 'microphone' | 'system-audio';

/** Почему запись не началась. settings — какой раздел настроек системы предложить открыть. */
export interface StartProblem {
  message: string;
  settings: SystemSettingsKind | null;
}

/** Окно «Запись остановлена» (после записи) или «Файл добавлен» (после импорта, План 5). */
export interface StopDialogData {
  kind: 'recording' | 'import';
  meetingId: string;
  title: string;
  /** null — длительность файла неизвестна. */
  durationSec: number | null;
  /** Имя добавленного файла (импорт); у записи — null. */
  fileName: string | null;
}

export interface StopDialogAnswer {
  meetingId: string;
  title: string;
  /** null — «Пропустить». */
  participantsHint: number | null;
}

export interface RecordingState {
  phase: RecordingPhase;
  meetingId: string | null;
  /** Начало записи (мс от эпохи) — таймер окно считает само. */
  startedAt: number | null;
  /** Переключатель «Звук компьютера» для ближайшей записи. */
  systemAudioNext: boolean;
  system: SystemAudioState;
  /** Почему звук компьютера не записывается (для system = 'failed'). */
  systemProblem: string | null;
  /** С начала записи звук компьютера ровно 0 дольше 10 с. */
  systemSilent: boolean;
  /** Микрофон отключили во время записи. */
  micEnded: boolean;
  /** Название микрофона, который пишет. */
  micLabel: string | null;
  /** Свободно в папке библиотеки, байт (обновляется во время записи). */
  freeBytes: number | null;
  startProblem: StartProblem | null;
  stopDialog: StopDialogData | null;
}

export const IDLE_RECORDING_STATE: RecordingState = {
  phase: 'idle',
  meetingId: null,
  startedAt: null,
  systemAudioNext: true,
  system: 'off',
  systemProblem: null,
  systemSilent: false,
  micEnded: false,
  micLabel: null,
  freeBytes: null,
  startProblem: null,
  stopDialog: null,
};

/** Пики дорожек, линейные 0–1. system: null — дорожки звука компьютера нет. */
export interface Peaks {
  mic: number;
  system: number | null;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Пик → положение индикатора 0–1 по шкале −60…0 дБ. */
export function levelFromPeak(peak: number): number {
  if (!(peak > 0)) return 0;
  const db = 20 * Math.log10(peak);
  return clamp01((db - METER_FLOOR_DB) / -METER_FLOOR_DB);
}

/** Сколько делений индикатора зажечь. */
export function litSegments(peak: number, segments: number = METER_SEGMENTS): number {
  return Math.round(levelFromPeak(peak) * segments);
}

// ---- Окно записи ----

export type SoundKind = 'start' | 'stop';

export interface RecorderStartCommand {
  meetingId: string;
  /** null — микрофон, выбранный в системе. */
  micDeviceId: string | null;
  systemAudio: boolean;
}

/** Ошибка getUserMedia / getDisplayMedia: имя DOMException и текст. */
export interface MediaFailure {
  name: string;
  message: string;
}

export interface RecorderStarted {
  meetingId: string;
  /** Время старта каждой дорожки (мс от эпохи, часы окна записи). */
  tracks: { kind: TrackKind; startedAt: number }[];
  micLabel: string;
  /** Звук компьютера просили, но подключиться не удалось. */
  systemFailure: MediaFailure | null;
}

export interface RecorderStartFailed {
  meetingId: string;
  failure: MediaFailure;
}

export interface RecorderChunk {
  meetingId: string;
  kind: TrackKind;
  data: ArrayBuffer;
}

export interface RecorderPeaks extends Peaks {
  meetingId: string;
}

export interface RecorderTrackEnded {
  meetingId: string;
  kind: TrackKind;
}

export interface RecorderStopped {
  meetingId: string;
}
