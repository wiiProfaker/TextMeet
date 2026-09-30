// Конвейер расшифровки одной встречи (спецификация Плана 3, §4.2). Нативных вызовов здесь нет — только engines.
import type { TrackKind } from '../../shared/meeting';
import { ME, otherSpeakerId, type SpeakerId } from '../../shared/transcript';
import type { TranscriptionStage } from '../../shared/transcription';
import { AUTO_CLUSTERING, clusterVoiceprints } from './clustering';
import { SAMPLE_RATE } from './decode';
import type { Engines, Recognizer } from './engines';
import { DIARIZE_ESTIMATE_PER_SEC, overallFraction, planSteps, type Step } from './progress';
import { planTracks, type TrackInput, type TrackPlan } from './routing';
import { splitAtQuietPoints } from './split';
import { exclusiveTurns, fillGaps, mergeTurns, renumberByFirstAppearance, type Interval, type Turn } from './turns';

export interface PipelineInput {
  /** Дорожки, которые есть на диске и не пустые. */
  tracks: TrackInput[];
  /** Писался ли звук компьютера (есть ли дорожка system в meeting.json). */
  recordedSystem: boolean;
  participantsHint: number | null;
  /** Длительность встречи, с — для буфера звука и оценки времени. */
  durationSec: number;
}

export interface PipelineProgress {
  stage: Exclude<TranscriptionStage, 'queued' | 'download'>;
  fraction: number;
  /** Начался долгий шаг разделения по голосам: доля в его конце и сколько он примерно займёт. */
  diarize?: { to: number; expectedMs: number };
}

export interface DraftSegment {
  start: number;
  end: number;
  speakerId: SpeakerId;
  text: string;
}

export interface PipelineResult {
  segments: (DraftSegment & { id: string })[];
  speakers: { id: SpeakerId; kind: 'me' | 'other' }[];
  /** Дорожки, которые не удалось прочитать: встреча расшифрована по остальным (решения Плана 3, §7). */
  skippedTracks: { kind: TrackKind; message: string }[];
}

export interface PipelineDeps {
  engines: Engines;
  decode(track: TrackInput, expectedSec: number): Promise<Float32Array>;
  /** Сколько потоков можно занять сейчас (во время записи — меньше). */
  threads(): number;
  onProgress(progress: PipelineProgress): void;
}

/** Отпечаток голоса снимается с начала хода — этого хватает, а длинные ходы не тормозят. */
const VOICEPRINT_MAX_SEC = 15;
/** Кусок короче не распознаётся. */
const MIN_PIECE_SEC = 0.1;

const slice = (samples: Float32Array, i: Interval): Float32Array =>
  // slice, а не subarray: нативному коду — отдельный буфер без смещения.
  samples.slice(Math.max(0, Math.floor(i.start * SAMPLE_RATE)), Math.min(samples.length, Math.ceil(i.end * SAMPLE_RATE)));

/** Дать процессу разобрать входящие сообщения (смена числа потоков) между тяжёлыми вызовами. */
const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Ходы без отпечатка голоса (−1) получают спикера ближайшего по времени хода. */
function assignByTime(turns: readonly Turn[]): Turn[] {
  const known = turns.filter((t) => t.speaker >= 0);
  if (known.length === 0) return turns.map((t) => ({ ...t, speaker: 0 }));
  const gap = (a: Interval, b: Interval): number => Math.max(0, a.start - b.end, b.start - a.end);
  return turns.map((t) =>
    t.speaker >= 0 ? t : { ...t, speaker: known.reduce((best, k) => (gap(t, k) < gap(t, best) ? k : best)).speaker },
  );
}

/** Распознаватель пересоздаётся, если сменилось число потоков (идёт/закончилась запись). */
class RecognizerHolder {
  private current: { threads: number; recognizer: Recognizer } | null = null;

  constructor(
    private readonly engines: Engines,
    private readonly threads: () => number,
  ) {}

  get(): Recognizer {
    const threads = this.threads();
    if (this.current?.threads !== threads) {
      // Прежний отпускаем до создания нового: две копии GigaAM не должны жить вместе дольше необходимого.
      this.current = null;
      this.current = { threads, recognizer: this.engines.recognizer(threads) };
    }
    return this.current.recognizer;
  }
}

class Run {
  private stepIndex = 0;
  private readonly recognizer: RecognizerHolder;

  constructor(
    private readonly deps: PipelineDeps,
    private readonly steps: readonly Step[],
  ) {
    this.recognizer = new RecognizerHolder(deps.engines, deps.threads);
  }

  report(fraction: number, diarize?: { expectedMs: number }): void {
    const step = this.steps[this.stepIndex];
    if (!step) return;
    this.deps.onProgress({
      stage: step.stage,
      fraction: overallFraction(this.steps, this.stepIndex, fraction),
      ...(diarize && { diarize: { to: overallFraction(this.steps, this.stepIndex, 1), expectedMs: diarize.expectedMs } }),
    });
  }

  next(): void {
    this.stepIndex += 1;
    this.report(0);
  }

  /** Всё готово: полоска доходит до конца, даже если последняя дорожка оказалась тишиной или не прочиталась. */
  finish(): void {
    const last = this.steps.at(-1);
    if (last) this.deps.onProgress({ stage: last.stage, fraction: 1 });
  }

  /** Дорожка не прочиталась: её шаги пропускаются. */
  skipTrack(track: number): void {
    while (this.steps[this.stepIndex]?.track === track) this.stepIndex += 1;
    this.report(0);
  }

  /** Ходы спикеров на дорожке собеседников (§4.2 п. 3–5, §4.4–4.6). */
  async others(samples: Float32Array, plan: TrackPlan): Promise<Turn[]> {
    // Детектор речи — первым: на тишине долгое разделение по голосам не нужно, а найденная речь нужна fillGaps.
    const speech = this.deps.engines.detector().detect(samples);
    if (plan.diarize.mode === 'none') return mergeTurns(speech.map((i) => ({ ...i, speaker: 0 })));
    if (speech.length === 0) {
      this.next();
      return [];
    }
    this.report(0, { expectedMs: (samples.length / SAMPLE_RATE) * DIARIZE_ESTIMATE_PER_SEC * 1000 });
    await breathe();
    const threads = this.deps.threads();
    const speakers = plan.diarize.mode === 'fixed' ? plan.diarize.speakers : -1;
    let turns = this.deps.engines.diarizer(threads).diarize(samples, speakers);
    if (plan.diarize.mode === 'auto') {
      const extractor = this.deps.engines.voiceprints(threads);
      const prints = turns.map((t) => ({
        durationSec: t.end - t.start,
        embedding: extractor.extract(slice(samples, { start: t.start, end: Math.min(t.end, t.start + VOICEPRINT_MAX_SEC) })),
      }));
      const labels = clusterVoiceprints(prints, AUTO_CLUSTERING);
      turns = assignByTime(turns.map((t, i) => ({ ...t, speaker: labels[i] ?? -1 })));
    }
    this.next();
    const filled = fillGaps(exclusiveTurns(turns), speech);
    return renumberByFirstAppearance(mergeTurns(filled));
  }

  /** Распознаёт ходы кусками ≤ 20 с; каждый кусок — отдельная реплика. */
  async recognize(samples: Float32Array, turns: readonly Turn[], plan: TrackPlan): Promise<DraftSegment[]> {
    const pieces = turns.flatMap((turn) =>
      splitAtQuietPoints(samples, SAMPLE_RATE, turn).map((piece) => ({ ...piece, speaker: turn.speaker })),
    );
    const total = pieces.reduce((sum, p) => sum + (p.end - p.start), 0);
    const segments: DraftSegment[] = [];
    let done = 0;
    for (const piece of pieces) {
      await breathe();
      const text = piece.end - piece.start < MIN_PIECE_SEC ? '' : this.recognizer.get().recognize(slice(samples, piece)).trim();
      done += piece.end - piece.start;
      this.report(total > 0 ? done / total : 1);
      if (text === '') continue;
      segments.push({
        start: piece.start + plan.track.offsetSec,
        end: piece.end + plan.track.offsetSec,
        speakerId: plan.role === 'me' ? ME : otherSpeakerId(piece.speaker),
        text,
      });
    }
    return segments;
  }
}

const TRACK_NAMES: Record<TrackKind, string> = { mic: 'микрофон', system: 'звук компьютера' };

/**
 * Собеседники по порядку первого появления в готовой расшифровке: «Спикер 1» — тот, кто первым что-то сказал.
 * Номера на дорожке считались по ходам, а ходы без текста выпали — иначе вышло бы «Спикер 2» без «Спикера 1».
 */
function renumberOthers(segments: readonly DraftSegment[]): DraftSegment[] {
  const order: SpeakerId[] = [];
  for (const s of segments) if (s.speakerId !== ME && !order.includes(s.speakerId)) order.push(s.speakerId);
  return segments.map((s) => (s.speakerId === ME ? s : { ...s, speakerId: otherSpeakerId(order.indexOf(s.speakerId)) }));
}

/** Расшифровывает встречу: дорожки по плану §4.1, реплики обеих дорожек по времени. */
export async function runPipeline(input: PipelineInput, deps: PipelineDeps): Promise<PipelineResult> {
  const plans = planTracks(input.tracks, input.recordedSystem, input.participantsHint);
  const durations = plans.map(() => input.durationSec);
  const steps = planSteps(plans, durations);
  const run = new Run(deps, steps);
  run.report(0);

  const segments: DraftSegment[] = [];
  const skippedTracks: PipelineResult['skippedTracks'] = [];
  for (const [index, plan] of plans.entries()) {
    let samples: Float32Array;
    try {
      samples = await deps.decode(plan.track, input.durationSec);
    } catch (err) {
      skippedTracks.push({ kind: plan.track.kind, message: err instanceof Error ? err.message : String(err) });
      // Не прочиталась ни одна дорожка — встреча не расшифровывается (с причиной каждой); иначе — по остальным.
      if (index === plans.length - 1 && skippedTracks.length === plans.length) {
        if (plans.length === 1) throw err;
        const reasons = skippedTracks.map((t) => `${TRACK_NAMES[t.kind]} — ${t.message}`).join('; ');
        throw new Error(`не прочиталась ни одна дорожка: ${reasons}`, { cause: err });
      }
      run.skipTrack(index);
      continue;
    }
    run.next();
    const turns =
      plan.role === 'me'
        ? mergeTurns(deps.engines.detector().detect(samples).map((i) => ({ ...i, speaker: 0 })))
        : await run.others(samples, plan);
    segments.push(...(await run.recognize(samples, turns, plan)));
    run.next();
  }
  run.finish();

  const sorted = renumberOthers([...segments].sort((a, b) => a.start - b.start || a.end - b.end));
  const ids = [...new Set(sorted.map((s) => s.speakerId))].sort((a, b) =>
    a === ME ? -1 : b === ME ? 1 : Number(a.slice(1)) - Number(b.slice(1)),
  );
  return {
    segments: sorted.map((s, i) => ({ ...s, id: `seg-${i + 1}` })),
    speakers: ids.map((id) => ({ id, kind: id === ME ? 'me' : 'other' })),
    skippedTracks,
  };
}
