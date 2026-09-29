import { describe, expect, it } from 'vitest';
import { peakOf, soundNotes, testSystemAudioFrom, toFailure } from './media';

describe('toFailure', () => {
  it('keeps the name and message of a DOMException-like error', () => {
    expect(toFailure({ name: 'NotAllowedError', message: 'Permission denied' })).toEqual({
      name: 'NotAllowedError',
      message: 'Permission denied',
    });
  });

  it('handles plain errors, strings and odd values', () => {
    expect(toFailure(new TypeError('bad'))).toEqual({ name: 'TypeError', message: 'bad' });
    expect(toFailure('oops')).toEqual({ name: 'Error', message: 'oops' });
    expect(toFailure({ name: '', message: 5 })).toEqual({ name: 'Error', message: '[object Object]' });
    expect(toFailure(null)).toEqual({ name: 'Error', message: 'null' });
  });
});

describe('peakOf', () => {
  it('returns the largest absolute sample', () => {
    expect(peakOf(new Float32Array([0.1, -0.7, 0.3]))).toBeCloseTo(0.7, 6);
  });

  it('is 0 for silence and for an empty buffer', () => {
    expect(peakOf(new Float32Array(8))).toBe(0);
    expect(peakOf([])).toBe(0);
  });
});

describe('soundNotes', () => {
  it('goes up for start and down for stop', () => {
    expect(soundNotes('start').map((n) => n.frequency)).toEqual([660, 880]);
    expect(soundNotes('stop').map((n) => n.frequency)).toEqual([880, 660]);
  });

  it('plays the second note after the first', () => {
    const [first, second] = soundNotes('start');
    expect(second!.at).toBeGreaterThanOrEqual(first!.at + first!.duration);
  });
});

describe('testSystemAudioFrom', () => {
  it('reads the test switch from the page address', () => {
    expect(testSystemAudioFrom('?testSystemAudio=tone')).toBe('tone');
    expect(testSystemAudioFrom('?testSystemAudio=fail')).toBe('fail');
    expect(testSystemAudioFrom('?testSystemAudio=other')).toBeNull();
    expect(testSystemAudioFrom('')).toBeNull();
  });
});
