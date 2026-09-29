// Чистые помощники окна записи (без DOM): их проверяют модульные тесты.
import type { MediaFailure, SoundKind } from '../../shared/recording';

/** Любая ошибка getUserMedia / getDisplayMedia / MediaRecorder → имя и текст для main. */
export function toFailure(err: unknown): MediaFailure {
  if (err && typeof err === 'object') {
    const { name, message } = err as { name?: unknown; message?: unknown };
    return {
      name: typeof name === 'string' && name ? name : 'Error',
      message: typeof message === 'string' ? message : String(err),
    };
  }
  return { name: 'Error', message: String(err) };
}

/** Пик (наибольшее по модулю значение) звуковых отсчётов. */
export function peakOf(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i] ?? 0);
    if (value > peak) peak = value;
  }
  return peak;
}

export interface Note {
  frequency: number;
  /** Начало от момента воспроизведения, с. */
  at: number;
  duration: number;
}

/** Сигналы: старт — две ноты вверх, стоп — вниз. */
export function soundNotes(kind: SoundKind): Note[] {
  const [first, second] = kind === 'start' ? [660, 880] : [880, 660];
  return [
    { frequency: first, at: 0, duration: 0.11 },
    { frequency: second, at: 0.12, duration: 0.11 },
  ];
}

export type TestSystemAudio = 'tone' | 'fail' | null;

/** Тестовая подмена звука компьютера из адреса страницы (включает только main для автотестов). */
export function testSystemAudioFrom(search: string): TestSystemAudio {
  const value = new URLSearchParams(search).get('testSystemAudio');
  return value === 'tone' || value === 'fail' ? value : null;
}
