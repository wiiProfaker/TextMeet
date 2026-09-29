import type { TrackKind } from '../../shared/meeting';
import type { Peaks } from '../../shared/recording';
import { peakOf } from './media';

/** Уровни дорожек по AnalyserNode: пик последних ~40 мс звука. */
export class LevelMeter {
  private readonly context = new AudioContext();
  private readonly analysers = new Map<TrackKind, { node: AnalyserNode; samples: Float32Array<ArrayBuffer> }>();

  constructor(streams: readonly { kind: TrackKind; stream: MediaStream }[]) {
    // Окно скрыто и без нажатий: контекст может начаться «на паузе».
    void this.context.resume();
    for (const { kind, stream } of streams) {
      const node = this.context.createAnalyser();
      node.fftSize = 2048;
      this.context.createMediaStreamSource(stream).connect(node);
      this.analysers.set(kind, { node, samples: new Float32Array(node.fftSize) });
    }
  }

  peaks(): Peaks {
    const read = (kind: TrackKind): number | null => {
      const analyser = this.analysers.get(kind);
      if (!analyser) return null;
      analyser.node.getFloatTimeDomainData(analyser.samples);
      return peakOf(analyser.samples);
    };
    return { mic: read('mic') ?? 0, system: read('system') };
  }

  close(): Promise<void> {
    return this.context.close();
  }
}
