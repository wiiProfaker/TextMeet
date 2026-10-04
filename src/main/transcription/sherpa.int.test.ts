// Интеграционные тесты на настоящих моделях: npm run test:models (первый прогон скачивает ~360 МБ).
import { beforeAll, describe, expect, it } from 'vitest';
import { ensureModels, fixture, MODELS_ROOT } from '../../test-support/model-fixtures';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { decodeToMono16k } from './decode';
import type { Engines } from './engines';
import { runPipeline, type PipelineInput } from './pipeline';
import { sherpaEngines } from './sherpa-engines';

const THREADS = 4;
let example = '';
let four = '';

beforeAll(async () => {
  await ensureModels();
  example = await fixture('gigaamExample');
  four = await fixture('fourSpeakers');
});

// Одни движки на все проверки — как в процессе расшифровки: модели загружаются один раз.
let shared: Engines | null = null;
const engines = (): Engines => (shared ??= sherpaEngines(MODELS_ROOT));
/** Запись четырёх человек — на китайском: русская GigaAM даёт по ней пустой текст, а пустые реплики не пишутся.
 *  Поэтому разделение по голосам проверяется с настоящими моделями голосов, но с «текстом» вместо распознавания. */
const withoutAsr = (): Engines => ({ ...engines(), recognizer: () => ({ recognize: () => 'реплика' }) });
const run = (input: PipelineInput, useAsr = true) =>
  runPipeline(input, {
    engines: useAsr ? engines() : withoutAsr(),
    decode: (track, expectedSec) => decodeToMono16k(resolveFfmpegPath(), track.file, expectedSec),
    threads: () => THREADS,
    onProgress: () => undefined,
  });

describe('sherpa-onnx engines', () => {
  it('reuses a loaded engine while the number of threads is the same and replaces it when it changes', () => {
    const e = engines();
    // GigaAM загружается здесь один раз — дальше его берут остальные проверки.
    expect(e.recognizer(THREADS)).toBe(e.recognizer(THREADS));
    expect(e.diarizer(THREADS)).toBe(e.diarizer(THREADS));
    // Смена числа потоков — на лёгкой модели отпечатков: новый движок вместо прежнего, а не рядом с ним.
    const before = e.voiceprints(THREADS);
    expect(e.voiceprints(THREADS)).toBe(before);
    expect(e.voiceprints(1)).not.toBe(before);
    expect(e.voiceprints(THREADS)).not.toBe(before);
  });

  it('GigaAM recognizes the reference recording', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), example, 12);
    const text = engines().recognizer(THREADS).recognize(samples);
    expect(text).toContain('У лукоморья дуб зелёный');
  });

  it('the speech detector finds speech and nothing in silence', async () => {
    const samples = await decodeToMono16k(resolveFfmpegPath(), example, 12);
    const speech = engines().detector().detect(samples);
    expect(speech.length).toBeGreaterThan(0);
    expect(speech[0]!.start).toBeLessThan(1);
    expect(engines().detector().detect(new Float32Array(16_000 * 3))).toEqual([]);
  });

  it('finds four speakers of a four-person talk without a hint', async () => {
    const result = await run({
      tracks: [{ kind: 'system', file: four, offsetSec: 0 }],
      recordedSystem: true,
      participantsHint: null,
      durationSec: 57,
    }, false);
    expect(result.speakers.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('a two-track meeting: «me» and the others by time', async () => {
    const asr = await run({
      tracks: [{ kind: 'mic', file: example, offsetSec: 0 }],
      recordedSystem: true,
      participantsHint: 5,
      durationSec: 12,
    });
    expect(asr.segments.map((s) => s.text).join(' ').toLowerCase()).toContain('у лукоморья дуб зелёный');
    const result = await run({
      tracks: [
        { kind: 'mic', file: example, offsetSec: 0 },
        { kind: 'system', file: four, offsetSec: 20 },
      ],
      recordedSystem: true,
      participantsHint: 5,
      durationSec: 80,
    }, false);
    expect(result.speakers.map((s) => s.id)).toEqual(['me', 's1', 's2', 's3', 's4']);
    const firstOther = result.segments.find((s) => s.speakerId !== 'me');
    expect(firstOther!.start).toBeGreaterThanOrEqual(20);
    expect(result.segments.filter((s) => s.speakerId === 'me').at(-1)!.end).toBeLessThan(13);
  });
});
