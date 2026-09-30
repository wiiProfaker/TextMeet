import { describe, expect, it } from 'vitest';
import type { TranscriptionProgress } from '../../shared/transcription';
import { barFraction, formatTimestamp, percent, speakerTone, stageText } from './transcription-format';

const progress = (patch: Partial<TranscriptionProgress>): TranscriptionProgress => ({
  meetingId: 'a',
  stage: 'me',
  fraction: 0.3,
  download: null,
  ...patch,
});

describe('formatTimestamp', () => {
  it('shows minutes and seconds, and hours when needed', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(65.9)).toBe('1:05');
    expect(formatTimestamp(724)).toBe('12:04');
    expect(formatTimestamp(3725)).toBe('1:02:05');
    expect(formatTimestamp(Number.NaN)).toBe('0:00');
  });
});

describe('stageText', () => {
  it('names every stage', () => {
    expect(stageText(progress({ stage: 'queued' }))).toBe('В очереди на расшифровку');
    expect(stageText(progress({ stage: 'prepare' }))).toBe('Готовим звук');
    expect(stageText(progress({ stage: 'me' }))).toBe('Расшифровываем вашу речь');
    expect(stageText(progress({ stage: 'diarize' }))).toBe('Разделяем собеседников по голосам');
    expect(stageText(progress({ stage: 'others' }))).toBe('Расшифровываем собеседников');
  });

  it('shows how much of the models is downloaded', () => {
    const MB = 1024 * 1024;
    expect(stageText(progress({ stage: 'download', download: { done: 20 * MB, total: 60 * MB } }))).toBe(
      'Скачиваем модель расшифровки — 20 МБ из 60 МБ',
    );
    expect(stageText(progress({ stage: 'download' }))).toBe('Скачиваем модель расшифровки');
  });
});

describe('barFraction and percent', () => {
  it('uses bytes while downloading and the whole work otherwise', () => {
    expect(barFraction(progress({ stage: 'download', fraction: 0, download: { done: 25, total: 100 } }))).toBe(0.25);
    expect(barFraction(progress({ stage: 'download', fraction: 0.1, download: { done: 0, total: 0 } }))).toBe(0.1);
    expect(barFraction(progress({ fraction: 0.7 }))).toBe(0.7);
    expect(percent(0.624)).toBe(62);
    expect(percent(2)).toBe(100);
    expect(percent(-1)).toBe(0);
  });
});

describe('speakerTone', () => {
  it('colours «me» and the others', () => {
    expect(speakerTone('me')).toBe('sp0');
    expect(speakerTone('s1')).toBe('sp1');
    expect(speakerTone('s4')).toBe('sp4');
    expect(speakerTone('s5')).toBe('sp1');
    expect(speakerTone('x')).toBe('sp1');
  });
});
