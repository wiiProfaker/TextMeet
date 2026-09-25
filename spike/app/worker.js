'use strict';
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const sherpa = require('sherpa-onnx-node');

const MODELS_DIR = process.env.MODELS_DIR;
const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/main';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';
const FILES = {
  ctc: { name: 'gigaam_v3_e2e_ctc_int8.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_ctc_int8.onnx`, size: 319869121 },
  tokens: { name: 'gigaam_v3_e2e_ctc_tokens.txt', url: `${HF_GIGAAM}/gigaam_v3_e2e_ctc_tokens.txt`, size: 2006 },
  segmentation: {
    name: 'pyannote-segmentation-3-0.onnx',
    url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx',
    size: 5992913,
  },
  embedding: {
    name: 'nemo_en_titanet_small.onnx',
    url: `${SHERPA_RELEASES}/speaker-recongition-models/nemo_en_titanet_small.onnx`,
    size: 40257283,
  },
  vad: { name: 'silero_vad.onnx', url: `${SHERPA_RELEASES}/asr-models/silero_vad.onnx`, size: 643854 },
  example: {
    name: 'gigaam-example.wav',
    url: 'https://huggingface.co/csukuangfj/tmp-files/resolve/main/GigaAM/example.wav',
    size: 361324,
  },
};

const pathOf = (file) => path.join(MODELS_DIR, file.name);
const log = (text) => process.parentPort.postMessage({ type: 'log', text });

async function ensure(file) {
  const dest = pathOf(file);
  const stat = await fsp.stat(dest).catch(() => null);
  if (stat && stat.size === file.size) return 'уже скачан';
  await fsp.mkdir(MODELS_DIR, { recursive: true });
  const response = await fetch(file.url);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  let done = 0;
  let nextReport = 0.1;
  const body = Readable.fromWeb(response.body);
  body.on('data', (chunk) => {
    done += chunk.length;
    if (done / file.size >= nextReport) {
      log(`  ${file.name}: ${Math.round((done / file.size) * 100)}%`);
      nextReport += 0.1;
    }
  });
  await pipeline(body, fs.createWriteStream(`${dest}.part`));
  const got = (await fsp.stat(`${dest}.part`)).size;
  if (got !== file.size) throw new Error(`размер ${got}, ожидался ${file.size}`);
  await fsp.rename(`${dest}.part`, dest);
  return 'скачан';
}

async function step(name, fn) {
  try {
    const result = await fn();
    log(`OK   ${name}${result ? ` — ${result}` : ''}`);
    return true;
  } catch (err) {
    log(`FAIL ${name} — ${err && err.stack ? err.stack : err}`);
    return false;
  }
}

function runVad(wave, externalBuffer) {
  const vad = new sherpa.Vad(
    {
      sileroVad: {
        model: pathOf(FILES.vad),
        threshold: 0.5,
        minSpeechDuration: 0.25,
        minSilenceDuration: 0.5,
        maxSpeechDuration: 20,
        windowSize: 512,
      },
      sampleRate: 16000,
      numThreads: 1,
      debug: false,
    },
    60,
  );
  let segments = 0;
  const drain = () => {
    while (!vad.isEmpty()) {
      const segment = vad.front(externalBuffer);
      if (segment.samples.length > 0) segments += 1;
      vad.pop();
    }
  };
  for (let i = 0; i < wave.samples.length; i += 512) {
    vad.acceptWaveform(wave.samples.subarray(i, i + 512));
    drain();
  }
  vad.flush();
  drain();
  return `${segments} сегментов речи`;
}

async function main() {
  log(`Папка моделей: ${MODELS_DIR}`);
  for (const file of Object.values(FILES)) {
    if (!(await step(`файл ${file.name}`, () => ensure(file)))) {
      process.parentPort.postMessage({ type: 'done' });
      return;
    }
  }

  let wave = null;
  await step('readWave(file, false)', () => {
    wave = sherpa.readWave(pathOf(FILES.example), false);
    return `${wave.samples.length} сэмплов, ${wave.sampleRate} Гц`;
  });
  if (!wave) {
    process.parentPort.postMessage({ type: 'done' });
    return;
  }

  await step('GigaAM v3 e2e CTC', () => {
    const recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 64 },
      modelConfig: {
        nemoCtc: { model: pathOf(FILES.ctc) },
        tokens: pathOf(FILES.tokens),
        numThreads: 4,
        provider: 'cpu',
        debug: 0,
      },
    });
    const started = Date.now();
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
    recognizer.decode(stream);
    return `«${recognizer.getResult(stream).text}» за ${Date.now() - started} мс`;
  });

  await step('разделение по голосам', () => {
    const diarizer = new sherpa.OfflineSpeakerDiarization({
      segmentation: { pyannote: { model: pathOf(FILES.segmentation) } },
      embedding: { model: pathOf(FILES.embedding) },
      clustering: { numClusters: -1, threshold: 0.5 },
      minDurationOn: 0.2,
      minDurationOff: 0.5,
    });
    return JSON.stringify(diarizer.process(wave.samples));
  });

  await step('VAD, front(false)', () => runVad(wave, false));

  log('--- дальше варианты по умолчанию (внешний буфер); могут уронить процесс ---');
  await step('readWave(file) по умолчанию', () => {
    const w = sherpa.readWave(pathOf(FILES.example));
    return `${w.samples.length} сэмплов`;
  });
  await step('VAD, front() по умолчанию', () => runVad(wave, true));

  process.parentPort.postMessage({ type: 'done' });
}

main().catch((err) => {
  log(`FATAL ${err && err.stack ? err.stack : err}`);
  process.parentPort.postMessage({ type: 'done' });
});
