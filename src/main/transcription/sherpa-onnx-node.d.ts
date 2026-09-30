// Типы той части sherpa-onnx-node (CommonJS без собственных типов), которой пользуется TextMeet.
// Все вызовы, возвращающие массивы, — с enableExternalBuffer = false: иначе в Electron
// «External buffers are not allowed» (итоги спайка, §2).
declare module 'sherpa-onnx-node' {
  export interface Waveform {
    sampleRate: number;
    samples: Float32Array;
  }

  export interface OfflineStream {
    acceptWaveform(wave: Waveform): void;
  }

  export class OfflineRecognizer {
    constructor(config: object);
    createStream(): OfflineStream;
    decode(stream: OfflineStream): void;
    getResult(stream: OfflineStream): { text?: string };
  }

  export interface SpeechSegment {
    /** Номер первого отсчёта участка речи. */
    start: number;
    samples: Float32Array;
  }

  export class Vad {
    constructor(config: object, bufferSizeInSeconds: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    front(enableExternalBuffer?: boolean): SpeechSegment;
    pop(): void;
    flush(): void;
  }

  export interface DiarizationSegment {
    start: number;
    end: number;
    speaker: number;
  }

  export class OfflineSpeakerDiarization {
    constructor(config: object);
    readonly sampleRate: number;
    process(samples: Float32Array): DiarizationSegment[];
    setConfig(config: { clustering: { numClusters: number; threshold: number } }): void;
  }

  export interface EmbeddingStream {
    acceptWaveform(wave: Waveform): void;
    inputFinished(): void;
  }

  export class SpeakerEmbeddingExtractor {
    constructor(config: object);
    readonly dim: number;
    createStream(): EmbeddingStream;
    isReady(stream: EmbeddingStream): boolean;
    compute(stream: EmbeddingStream, enableExternalBuffer?: boolean): Float32Array;
  }

  export const version: string;
}
