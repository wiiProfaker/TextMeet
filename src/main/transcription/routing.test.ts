import { describe, expect, it } from 'vitest';
import { othersMode, planTracks, type TrackInput } from './routing';

const mic: TrackInput = { kind: 'mic', file: 'mic.webm', offsetSec: 0 };
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.3 };

describe('othersMode', () => {
  it('turns a number of voices into a way to split', () => {
    expect(othersMode(null)).toEqual({ mode: 'auto' });
    expect(othersMode(0)).toEqual({ mode: 'auto' });
    expect(othersMode(1)).toEqual({ mode: 'none' });
    expect(othersMode(4)).toEqual({ mode: 'fixed', speakers: 4 });
  });
});

describe('planTracks', () => {
  it('a call for two: me and one other, no splitting', () => {
    expect(planTracks([mic, system], true, 2)).toEqual([
      { track: mic, role: 'me', diarize: { mode: 'none' } },
      { track: system, role: 'others', diarize: { mode: 'none' } },
    ]);
  });

  it('a call for four: the others are split into three voices', () => {
    expect(planTracks([mic, system], true, 4)[1]?.diarize).toEqual({ mode: 'fixed', speakers: 3 });
  });

  it('no hint or a hint of one: the number of others is found automatically', () => {
    expect(planTracks([mic, system], true, null)[1]?.diarize).toEqual({ mode: 'auto' });
    expect(planTracks([mic, system], true, 1)[1]?.diarize).toEqual({ mode: 'auto' });
  });

  it('computer sound recorded but empty: only «me»', () => {
    expect(planTracks([mic], true, 3)).toEqual([{ track: mic, role: 'me', diarize: { mode: 'none' } }]);
  });

  it('a live meeting: the microphone hears everyone', () => {
    expect(planTracks([mic], false, 3)).toEqual([{ track: mic, role: 'others', diarize: { mode: 'fixed', speakers: 3 } }]);
    expect(planTracks([mic], false, null)[0]?.diarize).toEqual({ mode: 'auto' });
    expect(planTracks([mic], false, 1)[0]?.diarize).toEqual({ mode: 'none' });
  });

  it('computer sound without a microphone file', () => {
    expect(planTracks([system], true, 3)).toEqual([{ track: system, role: 'others', diarize: { mode: 'fixed', speakers: 2 } }]);
  });

  it('nothing to transcribe', () => {
    expect(planTracks([], false, 2)).toEqual([]);
  });
});
