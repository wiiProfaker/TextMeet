import { describe, expect, it, vi } from 'vitest';
import { SAMPLE_RATE } from './decode';
import type { Engines } from './engines';
import { fakeEngines, loudIntervals } from './fake-engines';
import { runPipeline, type PipelineDeps, type PipelineInput, type PipelineProgress } from './pipeline';
import type { TrackInput } from './routing';
import type { Interval, Turn } from './turns';

/** Сигнал длиной seconds: громкий (0,1) в заданных участках, тишина вокруг. */
function signal(seconds: number, loud: Interval[]): Float32Array {
  const samples = new Float32Array(seconds * SAMPLE_RATE);
  for (const i of loud) samples.fill(0.1, Math.round(i.start * SAMPLE_RATE), Math.round(i.end * SAMPLE_RATE));
  return samples;
}

const mic: TrackInput = { kind: 'mic', file: 'mic.webm', offsetSec: 0 };
const system: TrackInput = { kind: 'system', file: 'system.webm', offsetSec: 0.5 };

interface Setup {
  audio: Partial<Record<'mic' | 'system', Float32Array>>;
  turns?: Turn[];
  prints?: (samples: Float32Array) => Float32Array | null;
  threads?: () => number;
}

function setup({ audio, turns = [], prints, threads = () => 4 }: Setup) {
  const base = fakeEngines();
  const diarize = vi.fn((_samples: Float32Array, _speakers: number) => turns);
  const recognizerThreads: number[] = [];
  const engines: Engines = {
    detector: base.detector,
    recognizer: (n) => {
      recognizerThreads.push(n);
      return { recognize: (s) => `кусок ${(s.length / SAMPLE_RATE).toFixed(1)}` };
    },
    diarizer: () => ({ diarize }),
    voiceprints: () => ({ extract: prints ?? (() => Float32Array.from([1, 0])) }),
  };
  const progress: PipelineProgress[] = [];
  const deps: PipelineDeps = {
    engines,
    decode: async (track) => audio[track.kind] ?? new Float32Array(0),
    threads,
    onProgress: (p) => progress.push(p),
  };
  return { deps, diarize, progress, recognizerThreads };
}

const input = (over: Partial<PipelineInput>): PipelineInput => ({
  tracks: [mic, system],
  recordedSystem: true,
  participantsHint: 2,
  durationSec: 30,
  ...over,
});

describe('runPipeline', () => {
  it('a call for two: «me» from the microphone and one other from the computer sound, by time', async () => {
    const { deps, diarize } = setup({
      audio: { mic: signal(30, [{ start: 1, end: 3 }, { start: 10, end: 12 }]), system: signal(30, [{ start: 5, end: 8 }]) },
    });
    const result = await runPipeline(input({}), deps);
    expect(diarize).not.toHaveBeenCalled();
    expect(result.segments.map((s) => [s.id, s.speakerId, s.start])).toEqual([
      ['seg-1', 'me', 1],
      ['seg-2', 's1', 5.5],
      ['seg-3', 'me', 10],
    ]);
    expect(result.segments[1]?.end).toBeCloseTo(8.5, 5);
    expect(result.speakers).toEqual([
      { id: 'me', kind: 'me' },
      { id: 's1', kind: 'other' },
    ]);
  });

  it('splits the others into the given number of voices and numbers them by first appearance', async () => {
    const loud = [{ start: 0, end: 4 }, { start: 4, end: 9 }, { start: 12, end: 14 }];
    const { deps, diarize } = setup({
      audio: { mic: signal(20, []), system: signal(20, loud) },
      turns: [
        { start: 0, end: 4, speaker: 2 },
        { start: 3, end: 9, speaker: 0 }, // наложение 3–4 с
        { start: 12, end: 14, speaker: 2 },
      ],
    });
    const result = await runPipeline(input({ participantsHint: 3, durationSec: 20 }), deps);
    expect(diarize).toHaveBeenCalledWith(expect.any(Float32Array), 2);
    expect(result.segments.map((s) => [s.speakerId, s.start - 0.5, s.end - 0.5])).toEqual([
      ['s1', 0, 3.5],
      ['s2', 3.5, 9],
      ['s1', 12, 14],
    ]);
  });

  it('finds the number of others by voiceprints when it is not given', async () => {
    const loud = [{ start: 0, end: 5 }, { start: 6, end: 11 }, { start: 12, end: 17 }];
    const voiceAt = (s: Float32Array) => (s.length > 0 ? Float32Array.from([1, 0]) : null);
    const { deps, diarize } = setup({
      audio: { system: signal(20, loud) },
      // Библиотека раздробила одного человека на три «спикера» — отпечатки одинаковые.
      turns: loud.map((i, n) => ({ ...i, speaker: n })),
      prints: voiceAt,
    });
    const result = await runPipeline(input({ tracks: [system], participantsHint: null, durationSec: 20 }), deps);
    expect(diarize).toHaveBeenCalledWith(expect.any(Float32Array), -1);
    expect(new Set(result.segments.map((s) => s.speakerId))).toEqual(new Set(['s1']));
  });

  it('gives turns without a voiceprint to the nearest speaker in time', async () => {
    // Два голоса отличаются громкостью: отпечаток — по первому отсчёту куска.
    const audio = signal(80, [{ start: 0, end: 30 }, { start: 31, end: 31.3 }]);
    audio.fill(0.3, 40 * SAMPLE_RATE, 70 * SAMPLE_RATE);
    const { deps } = setup({
      audio: { system: audio },
      turns: [
        { start: 0, end: 30, speaker: 0 },
        { start: 31, end: 31.3, speaker: 1 },
        { start: 40, end: 70, speaker: 2 },
      ],
      prints: (s) => {
        if (s.length < SAMPLE_RATE) return null;
        return (s[0] ?? 0) > 0.2 ? Float32Array.from([0, 1]) : Float32Array.from([1, 0]);
      },
    });
    const result = await runPipeline(input({ tracks: [system], participantsHint: null, durationSec: 80 }), deps);
    const at = (sec: number) => result.segments.find((s) => s.start <= sec + 0.5 && sec + 0.5 < s.end)?.speakerId;
    // Короткий ход 31–31,3 с без отпечатка — к ближайшему по времени (первому) спикеру.
    expect(at(31.1)).toBe(at(1));
    expect(at(50)).not.toBe(at(1));
  });

  it('does not lose speech that diarization missed', async () => {
    const loud = [{ start: 0, end: 3 }, { start: 5, end: 7 }];
    const { deps } = setup({
      audio: { system: signal(10, loud) },
      turns: [{ start: 0, end: 3, speaker: 0 }],
    });
    const result = await runPipeline(input({ tracks: [system], participantsHint: 3, durationSec: 10 }), deps);
    expect(result.segments.map((s) => [s.speakerId, s.start - 0.5])).toEqual([
      ['s1', 0],
      ['s1', 5],
    ]);
  });

  it('cuts a long turn into pieces of at most 20 s', async () => {
    const { deps } = setup({ audio: { mic: signal(50, [{ start: 0, end: 45 }]) } });
    const result = await runPipeline(input({ tracks: [mic], durationSec: 50 }), deps);
    expect(result.segments.length).toBeGreaterThanOrEqual(3);
    for (const s of result.segments) expect(s.end - s.start).toBeLessThanOrEqual(20);
  });

  it('a live meeting: everyone on the microphone becomes «Спикер N»', async () => {
    const { deps, diarize } = setup({
      audio: { mic: signal(10, [{ start: 0, end: 2 }, { start: 4, end: 6 }]) },
      turns: [
        { start: 0, end: 2, speaker: 1 },
        { start: 4, end: 6, speaker: 0 },
      ],
    });
    const result = await runPipeline(input({ tracks: [mic], recordedSystem: false, participantsHint: 2, durationSec: 10 }), deps);
    expect(diarize).toHaveBeenCalledWith(expect.any(Float32Array), 2);
    expect(result.segments.map((s) => s.speakerId)).toEqual(['s1', 's2']);
    expect(result.speakers.map((s) => s.kind)).toEqual(['other', 'other']);
  });

  it('recreates the recognizer when the number of threads changes', async () => {
    let threads = 4;
    const { deps, recognizerThreads } = setup({
      audio: { mic: signal(30, [{ start: 0, end: 2 }, { start: 5, end: 7 }, { start: 10, end: 12 }]) },
      threads: () => threads,
    });
    const run = runPipeline(input({ tracks: [mic] }), deps);
    threads = 2;
    await run;
    expect(recognizerThreads).toEqual([2]);
    const { deps: deps2, recognizerThreads: seen } = setup({
      audio: { mic: signal(30, [{ start: 0, end: 2 }, { start: 5, end: 7 }]) },
      threads: () => (seen.length === 0 ? 4 : 2),
    });
    await runPipeline(input({ tracks: [mic] }), deps2);
    expect(seen).toEqual([4, 2]);
  });

  it('reports growing progress with a clock for diarization', async () => {
    const { deps, progress } = setup({
      audio: { mic: signal(10, [{ start: 0, end: 2 }]), system: signal(10, [{ start: 3, end: 5 }]) },
      turns: [{ start: 3, end: 5, speaker: 0 }],
    });
    await runPipeline(input({ participantsHint: 4, durationSec: 10 }), deps);
    const fractions = progress.map((p) => p.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
    expect(fractions.at(-1)).toBeCloseTo(1, 5);
    expect(progress.map((p) => p.stage)).toEqual(expect.arrayContaining(['prepare', 'me', 'diarize', 'others']));
    const clock = progress.find((p) => p.diarize);
    expect(clock?.diarize?.expectedMs).toBeGreaterThan(0);
    expect(clock?.diarize?.to).toBeGreaterThan(clock?.fraction ?? 1);
  });

  it('returns nothing for silence and skips empty texts', async () => {
    const { deps } = setup({ audio: { mic: signal(10, []), system: signal(10, []) } });
    expect(await runPipeline(input({ durationSec: 10 }), deps)).toEqual({ segments: [], speakers: [], skippedTracks: [] });
  });

  it('transcribes the readable track when the other one cannot be read', async () => {
    const { deps, progress } = setup({ audio: { system: signal(10, [{ start: 1, end: 3 }]) } });
    const broken: PipelineDeps = {
      ...deps,
      decode: async (track) => {
        if (track.kind === 'mic') throw new Error('ffmpeg не прочитал дорожку');
        return signal(10, [{ start: 1, end: 3 }]);
      },
    };
    const result = await runPipeline(input({ durationSec: 10 }), broken);
    expect(result.segments.map((s) => s.speakerId)).toEqual(['s1']);
    expect(result.skippedTracks).toEqual([{ kind: 'mic', message: 'ffmpeg не прочитал дорожку' }]);
    expect(progress.at(-1)?.fraction).toBeCloseTo(1, 5);
  });

  it('fails when no track can be read', async () => {
    const { deps } = setup({ audio: {} });
    const broken: PipelineDeps = { ...deps, decode: () => Promise.reject(new Error('ffmpeg не прочитал дорожку')) };
    await expect(runPipeline(input({ durationSec: 10 }), broken)).rejects.toThrow('ffmpeg не прочитал дорожку');
  });
});

describe('loudIntervals', () => {
  it('finds loud parts and joins short pauses', () => {
    const parts = loudIntervals(signal(5, [{ start: 1, end: 2 }, { start: 2.2, end: 3 }, { start: 4, end: 4.5 }]));
    expect(parts).toEqual([
      { start: 1, end: 3 },
      { start: 4, end: 4.5 },
    ]);
  });
});
