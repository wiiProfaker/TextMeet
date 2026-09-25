import { describe, it, expect } from 'vitest';
import { formatTimestamp, formatTranscript, speakerLabel } from './format.ts';

describe('formatTimestamp', () => {
  it('formats times under an hour as mm:ss', () => {
    expect(formatTimestamp(0)).toBe('00:00');
    expect(formatTimestamp(65.9)).toBe('01:05');
  });

  it('formats an hour and more as h:mm:ss', () => {
    expect(formatTimestamp(3725)).toBe('1:02:05');
  });

  it('clamps negative values to zero', () => {
    expect(formatTimestamp(-3)).toBe('00:00');
  });
});

describe('speakerLabel', () => {
  it('numbers speakers from one', () => {
    expect(speakerLabel(0)).toBe('Спикер 1');
    expect(speakerLabel(2)).toBe('Спикер 3');
  });
});

describe('formatTranscript', () => {
  it('renders one line per utterance and skips empty text', () => {
    const out = formatTranscript([
      { start: 1, end: 3, speaker: 'Спикер 1', text: ' Привет. ' },
      { start: 4, end: 5, speaker: 'Спикер 2', text: '   ' },
      { start: 61, end: 70, speaker: 'Спикер 2', text: 'Добрый день.' },
    ]);
    expect(out).toBe('[00:01] Спикер 1: Привет.\n[01:01] Спикер 2: Добрый день.');
  });
});
