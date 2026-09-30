import { describe, expect, it } from 'vitest';
import type { TranscriptionProgress } from '../../shared/transcription';
import { barFraction, formatTimestamp, percent, progressView, speakerTone, stageText } from './transcription-format';

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
    expect(percent(Number.NaN)).toBe(0);
  });
});

describe('progressView', () => {
  it('shows the stage, the bar and the percentage while working', () => {
    expect(progressView('transcribing', progress({ stage: 'others', fraction: 0.624 }))).toEqual({
      text: 'Расшифровываем собеседников',
      value: 62,
      note: '62%',
    });
  });

  it('tells a queued meeting when it starts', () => {
    const queued = { text: 'В очереди на расшифровку', value: 0, note: 'Начнётся, когда закончатся встречи перед ней.' };
    expect(progressView('queued', null)).toEqual(queued);
    expect(progressView('queued', progress({ stage: 'queued', fraction: 0 }))).toEqual(queued);
  });

  it('follows the progress when the status is behind it', () => {
    expect(progressView('queued', progress({ stage: 'prepare', fraction: 0 })).text).toBe('Готовим звук');
  });

  it('says only that the work goes on when a transcribing meeting has no progress', () => {
    // Работа закончилась (или ещё не прислала этап), а статус встречи в окне ещё прежний — не «в очереди».
    expect(progressView('transcribing', null)).toEqual({ text: 'Расшифровываем…', value: null, note: null });
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
