# TextMeet — План 0: спайк (проверка рисков)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** До начала основной разработки ответить на три вопроса: устраивает ли пользователя качество GigaAM v3 e2e + разделения по голосам на его реальных записях; работает ли sherpa-onnx внутри Electron (utilityProcess); пишется ли системный звук через Electron на Windows и на macOS 27.

**Architecture:** Папка `spike/` — изолированная и выбрасываемая после плана 3. (1) CLI на TypeScript (tsx) на Windows: ffmpeg → диаризация sherpa-onnx → резка длинных реплик по тихим местам → GigaAM → текстовый файл рядом с записью. Чистые функции покрыты Vitest и потом переедут в приложение. (2) Мини-приложение Electron `spike/app/` на простом JS: кнопка «проверить распознавание» (sherpa-onnx в utilityProcess) и две кнопки «записать 10 с» (два способа получить системный звук). Режим `--auto` прогоняет всё сам и пишет лог — для проверки на Windows без участия пользователя. (3) GitHub Actions собирает мини-приложение для Mac (arm64, ad-hoc подпись).

**Tech Stack:** Node 24, TypeScript через tsx 4.23, Vitest 5, sherpa-onnx-node 1.13.8, ffmpeg-static 5.3, Electron 44.4, electron-builder 26.15, GitHub Actions (`macos-latest`).

**Спецификация:** [2026-09-25-textmeet-design.md](../specs/2026-09-25-textmeet-design.md), раздел 9.

---

## Факты, на которые опирается план (проверены 2026-09-25)

- `sherpa-onnx-node` 1.13.8: готовые сборки `win-x64` и `darwin-arm64`. API: `OfflineRecognizer`, `OfflineSpeakerDiarization`, `Vad`, `readWave`.
  `readWave(file, enableExternalBuffer = true)` и `vad.front(enableExternalBuffer = true)`: внутри Electron нужно передавать `false`,
  иначе V8 может отклонить внешний буфер. Это и проверяется в Task 9.
- GigaAM v3 **e2e** (с пунктуацией) для sherpa-onnx: `huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx` (MIT). Официальные сборки
  `csukuangfj/*giga-am-v3*` — без пунктуации (словарь из 34 символов), не подходят.
  - e2e_rnnt: `gigaam_v3_e2e_rnnt_encoder_int8.onnx` 318995997 Б, `gigaam_v3_e2e_rnnt_decoder.onnx` 4600058 Б,
    `gigaam_v3_e2e_rnnt_joint.onnx` 2712896 Б, `gigaam_v3_e2e_rnnt_tokens.txt` 13353 Б. Тип модели `nemo_transducer`.
  - e2e_ctc: `gigaam_v3_e2e_ctc_int8.onnx` 319869121 Б, `gigaam_v3_e2e_ctc_tokens.txt` 2006 Б. Конфиг `nemoCtc`.
  - GigaAM использует 64 мел-признака → `featConfig.featureDim = 64`.
- Диаризация: `csukuangfj/sherpa-onnx-pyannote-segmentation-3-0` `model.onnx` 5992913 Б;
  эмбеддинги из релиза `speaker-recongition-models` (опечатка в имени релиза — настоящая):
  `nemo_en_titanet_small.onnx` 40257283 Б, `3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx` 26485263 Б.
- Silero VAD: релиз `asr-models`, `silero_vad.onnx` 643854 Б.
- Пример записи GigaAM: `csukuangfj/tmp-files/.../GigaAM/example.wav` 361324 Б (16 кГц).
- Electron: `session.setDisplayMediaRequestHandler(handler)` → `callback({ video, audio: 'loopback' })`, где `video` — источник
  `desktopCapturer` **или** `WebFrameMain` (`request.frame`). На macOS 14.2+ с Electron 39+ Chromium пишет системный звук через
  Core Audio Tap; нужен ключ `NSAudioCaptureUsageDescription` в Info.plist. Если разрешения нет, дорожка приходит в состоянии
  `ended` и молчит, без ошибки.

## Карта файлов

```
spike/
  package.json              # CLI-спайк: tsx, vitest, sherpa-onnx-node, ffmpeg-static
  src/
    format.ts               # formatTimestamp, speakerLabel, formatTranscript, тип Utterance
    format.test.ts
    turns.ts                # Turn, mergeTurns, renumberByFirstAppearance, clustersFor
    turns.test.ts
    split.ts                # Interval, quietestPoint, splitAtQuietPoints
    split.test.ts
    audio.ts                # decodeToMono16k (ffmpeg → Float32Array 16 кГц моно)
    audio.test.ts
    models.ts               # реестр моделей и путь к папке моделей
    download.ts             # ensureFile, ensureModel
    download.test.ts
    pipeline.ts             # transcribeFile — диаризация + резка + GigaAM
    pipeline.int.test.ts    # на реальных моделях, пропускается, если моделей нет
    download-models.ts      # CLI: скачать все модели
    transcribe.ts           # CLI: расшифровать файл
  app/                      # мини-приложение Electron, простой JS
    package.json
    main.js                 # окно, обработчик getDisplayMedia, IPC, utilityProcess, режим --auto
    preload.js              # мост window.spike
    index.html
    renderer.js             # тесты записи, лог, авто-режим
    worker.js               # тест sherpa-onnx в utilityProcess
.github/workflows/spike-mac.yml   # сборка мини-приложения для Mac по кнопке
docs/superpowers/spike-results.md # итоги спайка и решения
```

Модели CLI скачиваются в `%LOCALAPPDATA%\TextMeet\models` (эту же папку потом использует приложение).
Результаты расшифровки пишутся рядом с записями в `D:\TextMeet-samples` — **вне репозитория**.

---

### Task 1: Рабочая папка спайка

**Files:**
- Create: `spike/package.json`

- [ ] **Step 1: Создать `spike/package.json`**

```json
{
  "name": "textmeet-spike",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "models": "tsx src/download-models.ts",
    "transcribe": "tsx src/transcribe.ts"
  },
  "dependencies": {
    "ffmpeg-static": "^5.3.0",
    "sherpa-onnx-node": "^1.13.8"
  },
  "devDependencies": {
    "tsx": "^4.23.15",
    "vitest": "^5.0.2"
  }
}
```

- [ ] **Step 2: Установить зависимости**

Run: `cd D:/TextMeet/spike && npm install`
Expected: установка без ошибок; есть `node_modules/sherpa-onnx-win-x64` и `node_modules/ffmpeg-static/ffmpeg.exe`.

- [ ] **Step 3: Проверить, что sherpa-onnx грузится**

Run: `cd D:/TextMeet/spike && node -e "const s=require('sherpa-onnx-node'); console.log(typeof s.OfflineRecognizer, typeof s.OfflineSpeakerDiarization, typeof s.Vad)"`
Expected: `function function function`

- [ ] **Step 4: Commit**

```bash
git add spike/package.json spike/package-lock.json
git commit -m "chore(spike): add spike workspace with sherpa-onnx and ffmpeg"
```

---

### Task 2: Форматирование расшифровки

**Files:**
- Create: `spike/src/format.ts`
- Test: `spike/src/format.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
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
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd D:/TextMeet/spike && npx vitest run src/format.test.ts`
Expected: FAIL — не удаётся найти модуль `./format.ts`.

- [ ] **Step 3: Реализация**

```ts
export interface Utterance {
  readonly start: number; // секунды от начала записи
  readonly end: number;
  readonly speaker: string;
  readonly text: string;
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function speakerLabel(speakerId: number): string {
  return `Спикер ${speakerId + 1}`;
}

export function formatTranscript(utterances: readonly Utterance[]): string {
  return utterances
    .filter((u) => u.text.trim().length > 0)
    .map((u) => `[${formatTimestamp(u.start)}] ${u.speaker}: ${u.text.trim()}`)
    .join('\n');
}
```

- [ ] **Step 4: Тест проходит**

Run: `cd D:/TextMeet/spike && npx vitest run src/format.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add spike/src/format.ts spike/src/format.test.ts
git commit -m "feat(spike): add transcript formatting helpers"
```

---

### Task 3: Склейка реплик и число кластеров

**Files:**
- Create: `spike/src/turns.ts`
- Test: `spike/src/turns.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect } from 'vitest';
import { clustersFor, mergeTurns, renumberByFirstAppearance, type Turn } from './turns.ts';

describe('mergeTurns', () => {
  it('merges consecutive turns of one speaker separated by a short gap', () => {
    const turns: Turn[] = [
      { start: 0, end: 2, speaker: 0 },
      { start: 2.5, end: 4, speaker: 0 },
    ];
    expect(mergeTurns(turns, 1)).toEqual([{ start: 0, end: 4, speaker: 0 }]);
  });

  it('keeps turns apart when the gap is long or the speaker changes', () => {
    const turns: Turn[] = [
      { start: 0, end: 2, speaker: 0 },
      { start: 5, end: 6, speaker: 0 },
      { start: 6.2, end: 7, speaker: 1 },
    ];
    expect(mergeTurns(turns, 1)).toEqual(turns);
  });

  it('sorts by start time and does not mutate the input', () => {
    const input: Turn[] = [
      { start: 5, end: 6, speaker: 1 },
      { start: 0, end: 1, speaker: 0 },
    ];
    const snapshot = structuredClone(input);
    const out = mergeTurns(input, 1);
    expect(out.map((t) => t.start)).toEqual([0, 5]);
    expect(input).toEqual(snapshot);
  });
});

describe('renumberByFirstAppearance', () => {
  it('relabels speakers in order of first appearance', () => {
    const out = renumberByFirstAppearance([
      { start: 0, end: 1, speaker: 3 },
      { start: 1, end: 2, speaker: 1 },
      { start: 2, end: 3, speaker: 3 },
    ]);
    expect(out.map((t) => t.speaker)).toEqual([0, 1, 0]);
  });
});

describe('clustersFor', () => {
  it('returns -1 (auto) when the number of participants is unknown', () => {
    expect(clustersFor(undefined, false)).toBe(-1);
  });

  it('uses all participants for a single-track recording', () => {
    expect(clustersFor(4, false)).toBe(4);
  });

  it('excludes the user when the microphone is a separate track', () => {
    expect(clustersFor(4, true)).toBe(3);
  });

  it('falls back to auto for invalid or degenerate input', () => {
    expect(clustersFor(0, false)).toBe(-1);
    expect(clustersFor(2.5, false)).toBe(-1);
    expect(clustersFor(1, true)).toBe(-1);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd D:/TextMeet/spike && npx vitest run src/turns.test.ts`
Expected: FAIL — не удаётся найти модуль `./turns.ts`.

- [ ] **Step 3: Реализация**

```ts
export interface Turn {
  readonly start: number; // секунды
  readonly end: number;
  readonly speaker: number; // номер кластера, с нуля
}

export function mergeTurns(turns: readonly Turn[], maxGapSec: number): Turn[] {
  const sorted = [...turns].sort((a, b) => a.start - b.start);
  return sorted.reduce<Turn[]>((acc, turn) => {
    const last = acc[acc.length - 1];
    if (last && last.speaker === turn.speaker && turn.start - last.end <= maxGapSec) {
      return [...acc.slice(0, -1), { ...last, end: Math.max(last.end, turn.end) }];
    }
    return [...acc, turn];
  }, []);
}

/** Ожидает реплики, отсортированные по времени. */
export function renumberByFirstAppearance(turns: readonly Turn[]): Turn[] {
  const order = turns.reduce<number[]>(
    (acc, t) => (acc.includes(t.speaker) ? acc : [...acc, t.speaker]),
    [],
  );
  return turns.map((t) => ({ ...t, speaker: order.indexOf(t.speaker) }));
}

/**
 * Число кластеров для диаризации по подсказке «сколько человек было, включая вас».
 * -1 означает «определить автоматически».
 */
export function clustersFor(participants: number | undefined, hasSeparateMicTrack: boolean): number {
  if (participants === undefined || !Number.isInteger(participants) || participants < 1) {
    return -1;
  }
  const others = hasSeparateMicTrack ? participants - 1 : participants;
  return others >= 1 ? others : -1;
}
```

- [ ] **Step 4: Тест проходит**

Run: `cd D:/TextMeet/spike && npx vitest run src/turns.test.ts`
Expected: PASS (8 тестов).

- [ ] **Step 5: Commit**

```bash
git add spike/src/turns.ts spike/src/turns.test.ts
git commit -m "feat(spike): add speaker turn merging and cluster count helper"
```

---

### Task 4: Резка длинных реплик по тихим местам

GigaAM лучше всего работает на кусках до ~20 с. Длинную реплику режем в самой тихой точке окна [10 с; 20 с] от начала куска.

**Files:**
- Create: `spike/src/split.ts`
- Test: `spike/src/split.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect } from 'vitest';
import { quietestPoint, splitAtQuietPoints } from './split.ts';

const SR = 16000;
const OPTS = { maxLen: 20, minLen: 10, frameSec: 0.05 } as const;

/** Синус 440 Гц с тишиной на заданных промежутках (секунды). */
function tone(seconds: number, silences: ReadonlyArray<readonly [number, number]>): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => {
    const t = i / SR;
    const silent = silences.some(([a, b]) => t >= a && t < b);
    return silent ? 0 : 0.5 * Math.sin(2 * Math.PI * 440 * t);
  });
}

describe('quietestPoint', () => {
  it('finds the silent gap inside the search window', () => {
    const point = quietestPoint(tone(30, [[15, 15.2]]), SR, 10, 20, 0.05);
    expect(point).toBeGreaterThanOrEqual(15);
    expect(point).toBeLessThanOrEqual(15.2);
  });
});

describe('splitAtQuietPoints', () => {
  it('keeps a short interval whole', () => {
    expect(splitAtQuietPoints(tone(18, []), SR, { start: 0, end: 18 }, OPTS)).toEqual([
      { start: 0, end: 18 },
    ]);
  });

  it('cuts a long interval at the silent gap', () => {
    const pieces = splitAtQuietPoints(tone(30, [[15, 15.2]]), SR, { start: 0, end: 30 }, OPTS);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].start).toBe(0);
    expect(pieces[0].end).toBeGreaterThanOrEqual(15);
    expect(pieces[0].end).toBeLessThanOrEqual(15.2);
    expect(pieces[1]).toEqual({ start: pieces[0].end, end: 30 });
  });

  it('never produces pieces longer than maxLen', () => {
    const pieces = splitAtQuietPoints(
      tone(50, [[14, 14.2], [31, 31.2]]),
      SR,
      { start: 0, end: 50 },
      OPTS,
    );
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const p of pieces) expect(p.end - p.start).toBeLessThanOrEqual(OPTS.maxLen);
    expect(pieces[pieces.length - 1].end).toBe(50);
  });

  it('handles an interval that does not start at zero', () => {
    const pieces = splitAtQuietPoints(tone(40, [[22, 22.2]]), SR, { start: 8, end: 40 }, OPTS);
    expect(pieces[0].start).toBe(8);
    expect(pieces[0].end).toBeGreaterThanOrEqual(22);
    expect(pieces[0].end).toBeLessThanOrEqual(22.2);
    expect(pieces[pieces.length - 1].end).toBe(40);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd D:/TextMeet/spike && npx vitest run src/split.test.ts`
Expected: FAIL — не удаётся найти модуль `./split.ts`.

- [ ] **Step 3: Реализация**

```ts
export interface Interval {
  readonly start: number; // секунды
  readonly end: number;
}

export interface SplitOptions {
  readonly maxLen: number; // максимальная длина куска, с
  readonly minLen: number; // раньше этого места от начала куска не режем, с
  readonly frameSec: number; // длина кадра для оценки громкости, с
}

/** Середина самого тихого кадра в промежутке [fromSec; toSec], в секундах. */
export function quietestPoint(
  samples: Float32Array,
  sampleRate: number,
  fromSec: number,
  toSec: number,
  frameSec: number,
): number {
  const frameLen = Math.max(1, Math.round(frameSec * sampleRate));
  const from = Math.max(0, Math.round(fromSec * sampleRate));
  const to = Math.min(samples.length, Math.round(toSec * sampleRate));
  let best = from;
  let bestEnergy = Number.POSITIVE_INFINITY;
  for (let i = from; i + frameLen <= to; i += frameLen) {
    let energy = 0;
    for (let j = i; j < i + frameLen; j++) energy += samples[j] * samples[j];
    if (energy < bestEnergy) {
      bestEnergy = energy;
      best = i;
    }
  }
  return (best + Math.floor(frameLen / 2)) / sampleRate;
}

export function splitAtQuietPoints(
  samples: Float32Array,
  sampleRate: number,
  interval: Interval,
  opts: SplitOptions,
): Interval[] {
  if (interval.end - interval.start <= opts.maxLen) return [interval];
  const cut = quietestPoint(
    samples,
    sampleRate,
    interval.start + opts.minLen,
    interval.start + opts.maxLen,
    opts.frameSec,
  );
  return [
    { start: interval.start, end: cut },
    ...splitAtQuietPoints(samples, sampleRate, { start: cut, end: interval.end }, opts),
  ];
}
```

- [ ] **Step 4: Тест проходит**

Run: `cd D:/TextMeet/spike && npx vitest run src/split.test.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add spike/src/split.ts spike/src/split.test.ts
git commit -m "feat(spike): split long speaker turns at the quietest point"
```

---

### Task 5: Чтение любого аудио через ffmpeg

**Files:**
- Create: `spike/src/audio.ts`
- Test: `spike/src/audio.test.ts`

- [ ] **Step 1: Написать падающий тест**

```ts
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decodeToMono16k, SAMPLE_RATE } from './audio.ts';

const require = createRequire(import.meta.url);
const ffmpegPath: string = require('ffmpeg-static');

describe('decodeToMono16k', () => {
  it('decodes a stereo 44.1 kHz file to 16 kHz mono float samples', async () => {
    const file = path.join(os.tmpdir(), `textmeet-tone-${process.pid}.wav`);
    const gen = spawnSync(ffmpegPath, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=44100',
      '-ac', '2', file,
    ]);
    expect(gen.status).toBe(0);
    try {
      const samples = await decodeToMono16k(file);
      expect(Math.abs(samples.length - SAMPLE_RATE)).toBeLessThan(200);
      const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
      expect(peak).toBeGreaterThan(0.05);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it('rejects with the ffmpeg error for a missing file', async () => {
    await expect(decodeToMono16k(path.join(os.tmpdir(), 'textmeet-no-such-file.m4a'))).rejects.toThrow(
      /ffmpeg exited/,
    );
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd D:/TextMeet/spike && npx vitest run src/audio.test.ts`
Expected: FAIL — не удаётся найти модуль `./audio.ts`.

- [ ] **Step 3: Реализация**

```ts
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath: string = require('ffmpeg-static');

export const SAMPLE_RATE = 16000;

/** Декодирует любой аудио/видео файл в моно float32, 16 кГц. */
export function decodeToMono16k(filePath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-v', 'error', '-i', filePath,
      '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', 'pipe:1',
    ]);
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      const bytes = Buffer.concat(chunks);
      // Копия в собственный выровненный буфер: Buffer может начинаться с невыровненного смещения.
      const samples = new Float32Array(Math.floor(bytes.length / 4));
      new Uint8Array(samples.buffer).set(bytes.subarray(0, samples.length * 4));
      resolve(samples);
    });
  });
}
```

- [ ] **Step 4: Тест проходит**

Run: `cd D:/TextMeet/spike && npx vitest run src/audio.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add spike/src/audio.ts spike/src/audio.test.ts
git commit -m "feat(spike): decode any audio file to 16 kHz mono via ffmpeg"
```

---

### Task 6: Реестр и скачивание моделей

**Files:**
- Create: `spike/src/models.ts`, `spike/src/download.ts`, `spike/src/download-models.ts`
- Test: `spike/src/download.test.ts`

- [ ] **Step 1: Написать падающий тест скачивания**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureFile } from './download.ts';

function serve(body: Buffer): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Length': body.length });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/file.bin`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('ensureFile', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'textmeet-dl-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('downloads a file into a new folder and checks its size', async () => {
    const body = Buffer.alloc(1000, 7);
    const server = await serve(body);
    try {
      const dest = path.join(dir, 'nested', 'file.bin');
      await ensureFile(dest, server.url, 1000);
      expect(fs.readFileSync(dest).equals(body)).toBe(true);
      expect(fs.existsSync(`${dest}.part`)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('rejects and leaves nothing behind when the size does not match', async () => {
    const server = await serve(Buffer.alloc(1000, 7));
    try {
      const dest = path.join(dir, 'file.bin');
      await expect(ensureFile(dest, server.url, 999)).rejects.toThrow(/Size mismatch/);
      expect(fs.existsSync(dest)).toBe(false);
      expect(fs.existsSync(`${dest}.part`)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('skips the download when the file already has the expected size', async () => {
    const dest = path.join(dir, 'ready.bin');
    fs.writeFileSync(dest, Buffer.alloc(10));
    await ensureFile(dest, 'http://127.0.0.1:1/unreachable', 10);
    expect(fs.statSync(dest).size).toBe(10);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd D:/TextMeet/spike && npx vitest run src/download.test.ts`
Expected: FAIL — не удаётся найти модуль `./download.ts`.

- [ ] **Step 3: Реестр моделей `spike/src/models.ts`**

```ts
import os from 'node:os';
import path from 'node:path';

export interface ModelFile {
  readonly name: string;
  readonly url: string;
  readonly size: number; // байт; проверяется после скачивания
}

export interface ModelEntry {
  readonly id: string;
  readonly dir: string;
  readonly files: readonly ModelFile[];
}

export function modelsRoot(): string {
  if (process.env.TEXTMEET_MODELS_DIR) return process.env.TEXTMEET_MODELS_DIR;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'TextMeet', 'models');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'TextMeet', 'models');
  }
  return path.join(os.homedir(), '.local', 'share', 'TextMeet', 'models');
}

const HF_GIGAAM = 'https://huggingface.co/Smirnov75/GigaAM-v3-sherpa-onnx/resolve/main';
const SHERPA_RELEASES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

export const MODELS = {
  gigaamRnnt: {
    id: 'gigaam-v3-e2e-rnnt',
    dir: 'gigaam-v3-e2e-rnnt',
    files: [
      { name: 'gigaam_v3_e2e_rnnt_encoder_int8.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_encoder_int8.onnx`, size: 318995997 },
      { name: 'gigaam_v3_e2e_rnnt_decoder.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_decoder.onnx`, size: 4600058 },
      { name: 'gigaam_v3_e2e_rnnt_joint.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_joint.onnx`, size: 2712896 },
      { name: 'gigaam_v3_e2e_rnnt_tokens.txt', url: `${HF_GIGAAM}/gigaam_v3_e2e_rnnt_tokens.txt`, size: 13353 },
    ],
  },
  gigaamCtc: {
    id: 'gigaam-v3-e2e-ctc',
    dir: 'gigaam-v3-e2e-ctc',
    files: [
      { name: 'gigaam_v3_e2e_ctc_int8.onnx', url: `${HF_GIGAAM}/gigaam_v3_e2e_ctc_int8.onnx`, size: 319869121 },
      { name: 'gigaam_v3_e2e_ctc_tokens.txt', url: `${HF_GIGAAM}/gigaam_v3_e2e_ctc_tokens.txt`, size: 2006 },
    ],
  },
  segmentation: {
    id: 'pyannote-segmentation-3-0',
    dir: 'pyannote-segmentation-3-0',
    files: [
      { name: 'model.onnx', url: 'https://huggingface.co/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/main/model.onnx', size: 5992913 },
    ],
  },
  titanet: {
    id: 'titanet-small',
    dir: 'speaker-embedding',
    files: [
      { name: 'nemo_en_titanet_small.onnx', url: `${SHERPA_RELEASES}/speaker-recongition-models/nemo_en_titanet_small.onnx`, size: 40257283 },
    ],
  },
  eres2net: {
    id: 'eres2net-en',
    dir: 'speaker-embedding',
    files: [
      { name: '3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx', url: `${SHERPA_RELEASES}/speaker-recongition-models/3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx`, size: 26485263 },
    ],
  },
  silero: {
    id: 'silero-vad',
    dir: 'silero-vad',
    files: [
      { name: 'silero_vad.onnx', url: `${SHERPA_RELEASES}/asr-models/silero_vad.onnx`, size: 643854 },
    ],
  },
  example: {
    id: 'gigaam-example',
    dir: 'examples',
    files: [
      { name: 'gigaam-example.wav', url: 'https://huggingface.co/csukuangfj/tmp-files/resolve/main/GigaAM/example.wav', size: 361324 },
    ],
  },
} as const satisfies Record<string, ModelEntry>;

export function modelFile(entry: ModelEntry, name: string): string {
  return path.join(modelsRoot(), entry.dir, name);
}
```

- [ ] **Step 4: Скачивание `spike/src/download.ts`**

```ts
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { modelFile, type ModelEntry } from './models.ts';

export type Progress = (doneBytes: number, totalBytes: number) => void;

export async function ensureFile(dest: string, url: string, size: number, onProgress?: Progress): Promise<void> {
  const existing = await fsp.stat(dest).catch(() => null);
  if (existing?.size === size) return;

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const partial = `${dest}.part`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  }
  let done = 0;
  const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    done += chunk.length;
    onProgress?.(done, size);
  });
  await pipeline(body, fs.createWriteStream(partial));

  const got = (await fsp.stat(partial)).size;
  if (got !== size) {
    await fsp.rm(partial, { force: true });
    throw new Error(`Size mismatch for ${path.basename(dest)}: expected ${size}, got ${got}`);
  }
  await fsp.rename(partial, dest);
}

export async function ensureModel(entry: ModelEntry, log: (msg: string) => void = console.log): Promise<void> {
  for (const file of entry.files) {
    let nextReport = 0.1;
    await ensureFile(modelFile(entry, file.name), file.url, file.size, (done, total) => {
      if (done / total >= nextReport) {
        log(`  ${file.name}: ${Math.round((done / total) * 100)}%`);
        nextReport += 0.1;
      }
    });
  }
}
```

- [ ] **Step 5: Тест проходит**

Run: `cd D:/TextMeet/spike && npx vitest run src/download.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 6: CLI скачивания `spike/src/download-models.ts`**

```ts
import { MODELS, modelsRoot } from './models.ts';
import { ensureModel } from './download.ts';

console.log(`Папка моделей: ${modelsRoot()}`);
for (const entry of Object.values(MODELS)) {
  console.log(`→ ${entry.id}`);
  await ensureModel(entry);
}
console.log('Все модели на месте.');
```

- [ ] **Step 7: Скачать модели (~700 МБ)**

Run: `cd D:/TextMeet/spike && npm run models`
Expected: последняя строка `Все модели на месте.`; в `%LOCALAPPDATA%\TextMeet\models` есть папки `gigaam-v3-e2e-rnnt`, `gigaam-v3-e2e-ctc`, `pyannote-segmentation-3-0`, `speaker-embedding`, `silero-vad`, `examples`.

- [ ] **Step 8: Commit**

```bash
git add spike/src/models.ts spike/src/download.ts spike/src/download.test.ts spike/src/download-models.ts
git commit -m "feat(spike): add model registry and size-checked downloader"
```

---

### Task 7: Конвейер расшифровки и CLI

**Files:**
- Create: `spike/src/pipeline.ts`, `spike/src/transcribe.ts`
- Test: `spike/src/pipeline.int.test.ts`

- [ ] **Step 1: Написать интеграционный тест (на настоящих моделях)**

```ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { MODELS, modelFile, type ModelEntry } from './models.ts';
import { transcribeFile, type AsrVariant } from './pipeline.ts';

const example = modelFile(MODELS.example, 'gigaam-example.wav');
const present = (entries: readonly ModelEntry[]) =>
  entries.every((e) => e.files.every((f) => fs.existsSync(modelFile(e, f.name))));
const haveModels =
  fs.existsSync(example) &&
  present([MODELS.gigaamRnnt, MODELS.gigaamCtc, MODELS.segmentation, MODELS.titanet]);

describe.skipIf(!haveModels)('transcribeFile on real models', () => {
  it.each<AsrVariant>(['rnnt', 'ctc'])(
    'produces punctuated Russian text with GigaAM e2e %s',
    async (asr) => {
      const result = await transcribeFile({
        file: example,
        participants: 1,
        asr,
        embedding: 'titanet',
        threshold: 0.5,
        numThreads: 4,
      });
      const text = result.utterances.map((u) => u.text).join(' ');
      expect(text).toMatch(/[А-ЯЁ]/); // заглавные буквы — признак e2e-модели
      expect(text).toMatch(/[.,?!]/); // пунктуация
      expect(result.speakers).toBe(1);
    },
    180_000,
  );
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd D:/TextMeet/spike && npx vitest run src/pipeline.int.test.ts`
Expected: FAIL — не удаётся найти модуль `./pipeline.ts` (модели уже скачаны в Task 6, поэтому тест не пропускается).

- [ ] **Step 3: Реализация `spike/src/pipeline.ts`**

```ts
import { createRequire } from 'node:module';
import { decodeToMono16k, SAMPLE_RATE } from './audio.ts';
import { MODELS, modelFile, type ModelEntry } from './models.ts';
import { ensureModel } from './download.ts';
import { clustersFor, mergeTurns, renumberByFirstAppearance, type Turn } from './turns.ts';
import { splitAtQuietPoints, type Interval } from './split.ts';
import { speakerLabel, type Utterance } from './format.ts';

const require = createRequire(import.meta.url);
// sherpa-onnx-node — CommonJS без типов; поверхность, которую мы используем, описана в Task 7 плана.
const sherpa = require('sherpa-onnx-node');

export type AsrVariant = 'rnnt' | 'ctc';
export type EmbeddingVariant = 'titanet' | 'eres2net';

export interface TranscribeOptions {
  readonly file: string;
  readonly participants?: number;
  readonly asr: AsrVariant;
  readonly embedding: EmbeddingVariant;
  readonly threshold: number;
  readonly numThreads: number;
  readonly onProgress?: (message: string) => void;
}

export interface TranscribeResult {
  readonly utterances: readonly Utterance[];
  readonly durationSec: number;
  readonly speakers: number;
  readonly timings: { readonly decodeSec: number; readonly diarizationSec: number; readonly asrSec: number };
}

interface DiarizationSegment {
  readonly start: number;
  readonly end: number;
  readonly speaker: number;
}

const MERGE_GAP_SEC = 1.0;
const SPLIT = { maxLen: 20, minLen: 10, frameSec: 0.05 } as const;
const MIN_PIECE_SEC = 0.1;

function asrEntry(variant: AsrVariant): ModelEntry {
  return variant === 'rnnt' ? MODELS.gigaamRnnt : MODELS.gigaamCtc;
}

function embeddingEntry(variant: EmbeddingVariant): ModelEntry {
  return variant === 'titanet' ? MODELS.titanet : MODELS.eres2net;
}

function createRecognizer(variant: AsrVariant, numThreads: number) {
  const featConfig = { sampleRate: SAMPLE_RATE, featureDim: 64 };
  if (variant === 'rnnt') {
    const e = MODELS.gigaamRnnt;
    return new sherpa.OfflineRecognizer({
      featConfig,
      modelConfig: {
        transducer: {
          encoder: modelFile(e, 'gigaam_v3_e2e_rnnt_encoder_int8.onnx'),
          decoder: modelFile(e, 'gigaam_v3_e2e_rnnt_decoder.onnx'),
          joiner: modelFile(e, 'gigaam_v3_e2e_rnnt_joint.onnx'),
        },
        tokens: modelFile(e, 'gigaam_v3_e2e_rnnt_tokens.txt'),
        modelType: 'nemo_transducer',
        numThreads,
        provider: 'cpu',
        debug: 0,
      },
    });
  }
  const e = MODELS.gigaamCtc;
  return new sherpa.OfflineRecognizer({
    featConfig,
    modelConfig: {
      nemoCtc: { model: modelFile(e, 'gigaam_v3_e2e_ctc_int8.onnx') },
      tokens: modelFile(e, 'gigaam_v3_e2e_ctc_tokens.txt'),
      numThreads,
      provider: 'cpu',
      debug: 0,
    },
  });
}

function createDiarizer(embedding: EmbeddingVariant, numClusters: number, threshold: number, numThreads: number) {
  const emb = embeddingEntry(embedding);
  return new sherpa.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: modelFile(MODELS.segmentation, 'model.onnx') },
      numThreads,
      provider: 'cpu',
      debug: 0,
    },
    embedding: { model: modelFile(emb, emb.files[0].name), numThreads, provider: 'cpu', debug: 0 },
    clustering: { numClusters, threshold },
    minDurationOn: 0.2,
    minDurationOff: 0.5,
  });
}

function recognizePiece(recognizer: any, samples: Float32Array, piece: Interval): string {
  const from = Math.max(0, Math.floor(piece.start * SAMPLE_RATE));
  const to = Math.min(samples.length, Math.ceil(piece.end * SAMPLE_RATE));
  if (to - from < MIN_PIECE_SEC * SAMPLE_RATE) return '';
  const stream = recognizer.createStream();
  // slice, а не subarray: отдаём в нативный код отдельный буфер без смещения
  stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: samples.slice(from, to) });
  recognizer.decode(stream);
  return String(recognizer.getResult(stream).text ?? '').trim();
}

const seconds = (fromMs: number, toMs: number) => (toMs - fromMs) / 1000;

export async function transcribeFile(opts: TranscribeOptions): Promise<TranscribeResult> {
  const log = opts.onProgress ?? (() => {});
  for (const entry of [asrEntry(opts.asr), MODELS.segmentation, embeddingEntry(opts.embedding)]) {
    await ensureModel(entry, log);
  }

  const t0 = performance.now();
  const samples = await decodeToMono16k(opts.file);
  const t1 = performance.now();
  log(`Аудио: ${(samples.length / SAMPLE_RATE / 60).toFixed(1)} мин. Разделяю по голосам…`);

  const diarizer = createDiarizer(
    opts.embedding,
    clustersFor(opts.participants, false),
    opts.threshold,
    opts.numThreads,
  );
  const rawTurns: Turn[] = (diarizer.process(samples) as DiarizationSegment[]).map((s) => ({
    start: s.start,
    end: s.end,
    speaker: s.speaker,
  }));
  const turns = renumberByFirstAppearance(mergeTurns(rawTurns, MERGE_GAP_SEC));
  const speakers = new Set(turns.map((t) => t.speaker)).size;
  const t2 = performance.now();
  log(`Спикеров: ${speakers}, реплик: ${turns.length}. Распознаю…`);

  const recognizer = createRecognizer(opts.asr, opts.numThreads);
  const utterances: Utterance[] = turns.map((turn, index) => {
    const text = splitAtQuietPoints(samples, SAMPLE_RATE, turn, SPLIT)
      .map((piece) => recognizePiece(recognizer, samples, piece))
      .filter((t) => t.length > 0)
      .join(' ');
    log(`  реплика ${index + 1}/${turns.length}`);
    return { start: turn.start, end: turn.end, speaker: speakerLabel(turn.speaker), text };
  });
  const t3 = performance.now();

  return {
    utterances,
    durationSec: samples.length / SAMPLE_RATE,
    speakers,
    timings: { decodeSec: seconds(t0, t1), diarizationSec: seconds(t1, t2), asrSec: seconds(t2, t3) },
  };
}
```

- [ ] **Step 4: Тест проходит**

Run: `cd D:/TextMeet/spike && npx vitest run src/pipeline.int.test.ts`
Expected: PASS (2 теста). **Если FAIL из-за отсутствия заглавных букв или пунктуации**, значит в ONNX-файлах нет метаданных GigaAM
(`is_giga_am`) и признаки считаются неправильно. Остановиться и сообщить: запасной путь — своя конвертация из
`salute-developers/GigaAM` (риск 5 в спецификации), это отдельная задача.

- [ ] **Step 5: CLI `spike/src/transcribe.ts`**

```ts
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { transcribeFile, type AsrVariant, type EmbeddingVariant } from './pipeline.ts';
import { formatTranscript } from './format.ts';

const USAGE =
  'Использование: npm run transcribe -- <файл> [--speakers N] [--model rnnt|ctc] ' +
  '[--embedding titanet|eres2net] [--threshold 0.5] [--threads N]';

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseIntIn(raw: string | undefined, min: number, max: number, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${name}: нужно целое число от ${min} до ${max}`);
  return n;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    speakers: { type: 'string' },
    model: { type: 'string', default: 'rnnt' },
    embedding: { type: 'string', default: 'titanet' },
    threshold: { type: 'string', default: '0.5' },
    threads: { type: 'string', default: String(Math.max(1, Math.min(8, os.availableParallelism() - 1))) },
  },
});

const file = positionals[0] ?? fail('Не указан файл.');
await fsp.access(file).catch(() => fail(`Файл не найден: ${file}`));
if (values.model !== 'rnnt' && values.model !== 'ctc') fail('--model: rnnt или ctc');
if (values.embedding !== 'titanet' && values.embedding !== 'eres2net') fail('--embedding: titanet или eres2net');
const threshold = Number(values.threshold);
if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 2) fail('--threshold: число от 0 до 2');
const participants = parseIntIn(values.speakers, 1, 20, '--speakers');
const numThreads = parseIntIn(values.threads, 1, 32, '--threads') ?? 4;
const asr = values.model as AsrVariant;
const embedding = values.embedding as EmbeddingVariant;

const result = await transcribeFile({ file, participants, asr, embedding, threshold, numThreads, onProgress: console.log });

const { decodeSec, diarizationSec, asrSec } = result.timings;
const total = decodeSec + diarizationSec + asrSec;
const header = [
  `Файл: ${path.basename(file)}`,
  `Модель: GigaAM v3 e2e ${asr}; голоса: ${embedding}; участников: ${participants ?? 'авто'}; порог: ${threshold}`,
  `Длительность: ${(result.durationSec / 60).toFixed(1)} мин; найдено спикеров: ${result.speakers}`,
  `Время: чтение ${decodeSec.toFixed(1)} с, разделение ${diarizationSec.toFixed(1)} с, ` +
    `распознавание ${asrSec.toFixed(1)} с; RTF ${(total / result.durationSec).toFixed(3)}`,
  '',
].join('\n');
const out = `${file}.${asr}-${embedding}.txt`;
await fsp.writeFile(out, `${header}${formatTranscript(result.utterances)}\n`, 'utf8');
console.log(`Готово: ${out}`);
```

- [ ] **Step 6: Прогнать CLI на примере**

Run (Git Bash): `cd D:/TextMeet/spike && npm run transcribe -- "$LOCALAPPDATA/TextMeet/models/examples/gigaam-example.wav" --speakers 1`
Expected: `Готово: ...gigaam-example.wav.rnnt-titanet.txt`; в файле одна или несколько строк `[00:00] Спикер 1: …` с пунктуацией.

- [ ] **Step 7: Все тесты спайка**

Run: `cd D:/TextMeet/spike && npm test`
Expected: PASS, все файлы тестов.

- [ ] **Step 8: Commit**

```bash
git add spike/src/pipeline.ts spike/src/pipeline.int.test.ts spike/src/transcribe.ts
git commit -m "feat(spike): add diarization + GigaAM transcription pipeline and CLI"
```

---

### Task 8: Прогон на записях пользователя (контрольная точка с пользователем)

**Files:** нет изменений в репозитории. Результаты лежат в `D:\TextMeet-samples` (вне git).

- [ ] **Step 1: Проверить, что записи на месте**

Run: `ls -la /d/TextMeet-samples`
Expected: 2–3 аудиофайла. Если папка пуста — попросить пользователя положить записи и остановиться.

- [ ] **Step 2: Для каждой записи — два прогона (rnnt и ctc)**

Число участников брать из имени файла (`…_4чел…` → `--speakers 4`); если его нет — без `--speakers`.

Run (пример для `созвон_4чел.m4a`):
```bash
cd D:/TextMeet/spike
npm run transcribe -- "D:/TextMeet-samples/созвон_4чел.m4a" --speakers 4 --model rnnt
npm run transcribe -- "D:/TextMeet-samples/созвон_4чел.m4a" --speakers 4 --model ctc
```
Expected: рядом с записью появляются `…rnnt-titanet.txt` и `…ctc-titanet.txt`; в заголовке RTF (ожидаемо < 0.15 на Ryzen 7 3700X).

- [ ] **Step 3: Для одной записи — прогон без подсказки числа участников**

Run: `npm run transcribe -- "D:/TextMeet-samples/<файл>" --model rnnt`
Expected: файл с автоматически найденным числом спикеров — проверка режима «не указал, сколько было людей».

- [ ] **Step 4: Показать пользователю результаты и собрать оценку**

Показать по каждой записи: RTF, найденное число спикеров и первые ~30 строк текста обоих вариантов. Спросить:
1. Какой вариант текста точнее — rnnt или ctc?
2. Правильно ли разделены люди (примерно)? Где путаница?
3. Устраивает ли качество, чтобы строить на этом приложение?

- [ ] **Step 5: Если разделение по голосам плохое — один дополнительный прогон**

Run: `npm run transcribe -- "D:/TextMeet-samples/<проблемный файл>" --speakers N --model <выбранный> --embedding eres2net`
Показать пользователю, стало ли лучше. Записать выбор (`titanet` или `eres2net`).

---

### Task 9: GitHub — закрытый репозиторий

- [ ] **Step 1: Установить GitHub CLI (спросить разрешения у пользователя перед установкой)**

Run: `winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements`
Expected: `Successfully installed`. Открыть новый терминал, чтобы `gh` появился в PATH; проверить `gh --version`.

- [ ] **Step 2: Пользователь входит в GitHub**

Пользователь сам выполняет в терминале (пароль вводит в браузере, Claude его не видит):
```bash
gh auth login --web --git-protocol https
```
Expected: `gh auth status` показывает `Logged in to github.com account wiiProfaker`.

- [ ] **Step 3: Создать закрытый репозиторий и отправить код**

Run: `cd D:/TextMeet && gh repo create wiiProfaker/TextMeet --private --source . --remote origin --push`
Expected: `✓ Created repository wiiProfaker/TextMeet on GitHub`, ветка `main` отправлена.

- [ ] **Step 4: Убедиться, что записи и модели не попали в репозиторий**

Run: `git ls-files | grep -i -E "\.(wav|mp3|m4a|ogg|opus|webm|onnx)$" || echo "чисто"`
Expected: `чисто`

---

### Task 10: Мини-приложение Electron — каркас и тест sherpa-onnx в utilityProcess

**Files:**
- Create: `spike/app/package.json`, `spike/app/main.js`, `spike/app/preload.js`, `spike/app/index.html`, `spike/app/renderer.js`, `spike/app/worker.js`

- [ ] **Step 1: `spike/app/package.json`**

```json
{
  "name": "textmeet-spike-app",
  "productName": "TextMeet Spike",
  "version": "0.0.1",
  "private": true,
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "auto": "electron . --auto",
    "dist:mac": "electron-builder --mac dir --arm64 --publish never"
  },
  "dependencies": {
    "sherpa-onnx-node": "^1.13.8"
  },
  "devDependencies": {
    "electron": "^44.4.5",
    "electron-builder": "^26.15.3"
  },
  "build": {
    "appId": "dev.textmeet.spike",
    "asar": false,
    "files": ["main.js", "preload.js", "worker.js", "index.html", "renderer.js", "package.json"],
    "mac": {
      "target": "dir",
      "identity": null,
      "extendInfo": {
        "NSMicrophoneUsageDescription": "TextMeet Spike записывает микрофон для проверки.",
        "NSAudioCaptureUsageDescription": "TextMeet Spike записывает звук компьютера для проверки."
      }
    }
  }
}
```

- [ ] **Step 2: `spike/app/worker.js` — тест sherpa-onnx (запускается в utilityProcess)**

Безопасные варианты (`enableExternalBuffer = false`) идут первыми; варианты по умолчанию — в конце, потому что могут уронить процесс.

```js
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
```

- [ ] **Step 3: `spike/app/main.js`**

```js
'use strict';
const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, utilityProcess } = require('electron');
const path = require('node:path');
const fsp = require('node:fs/promises');

const AUTO = process.argv.includes('--auto');
const outDir = () => path.join(app.getPath('downloads'), 'textmeet-spike');
const logFile = () => path.join(outDir(), 'spike-log.txt');

let win = null;
let captureMode = 'screen'; // 'screen' — вариант А, 'frame' — вариант Б

function runAsrTest() {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (message) => {
      if (finished) return;
      finished = true;
      resolve(message);
    };
    const child = utilityProcess.fork(path.join(__dirname, 'worker.js'), [], {
      serviceName: 'textmeet-asr-spike',
      allowLoadingUnsignedLibraries: true,
      env: { ...process.env, MODELS_DIR: path.join(app.getPath('userData'), 'models') },
    });
    child.on('message', (msg) => {
      if (msg.type === 'log') win.webContents.send('asr:log', msg.text);
      if (msg.type === 'done') {
        child.kill();
        finish('готово');
      }
    });
    child.on('exit', (code) => finish(`процесс распознавания завершился с кодом ${code}`));
  });
}

app.whenReady().then(async () => {
  await fsp.mkdir(outDir(), { recursive: true });
  if (AUTO) await fsp.writeFile(logFile(), '', 'utf8');

  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (captureMode === 'frame') {
        callback({ video: request.frame, audio: 'loopback' });
        return;
      }
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      callback({ video: sources[0], audio: 'loopback' });
    } catch (err) {
      console.error('display media handler failed', err);
      callback({});
    }
  });

  ipcMain.handle('capture:set-mode', (_e, mode) => {
    captureMode = mode === 'frame' ? 'frame' : 'screen';
  });
  ipcMain.handle('capture:save', async (_e, name, bytes) => {
    const file = path.join(outDir(), path.basename(name));
    await fsp.writeFile(file, Buffer.from(bytes));
    return file;
  });
  ipcMain.handle('log:append', (_e, line) => fsp.appendFile(logFile(), `${line}\n`, 'utf8'));
  ipcMain.handle('out:open', () => shell.openPath(outDir()));
  ipcMain.handle('asr:run', () => runAsrTest());
  ipcMain.handle('app:info', () => ({
    auto: AUTO,
    platform: process.platform,
    osVersion: process.getSystemVersion(),
    electron: process.versions.electron,
  }));
  ipcMain.handle('app:quit', () => app.quit());

  win = new BrowserWindow({
    width: 960,
    height: 720,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile('index.html');
});

app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 4: `spike/app/preload.js`**

```js
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spike', {
  info: () => ipcRenderer.invoke('app:info'),
  setCaptureMode: (mode) => ipcRenderer.invoke('capture:set-mode', mode),
  save: (name, bytes) => ipcRenderer.invoke('capture:save', name, bytes),
  appendLog: (line) => ipcRenderer.invoke('log:append', line),
  openOutDir: () => ipcRenderer.invoke('out:open'),
  runAsr: () => ipcRenderer.invoke('asr:run'),
  onAsrLog: (callback) => ipcRenderer.on('asr:log', (_e, text) => callback(text)),
  quit: () => ipcRenderer.invoke('app:quit'),
});
```

- [ ] **Step 5: `spike/app/index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:"
    />
    <title>TextMeet Spike</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 16px; }
      button { margin: 4px 8px 4px 0; padding: 8px 12px; font-size: 14px; }
      pre { background: #f4f4f4; padding: 12px; white-space: pre-wrap; height: 480px; overflow: auto; }
    </style>
  </head>
  <body>
    <h3>TextMeet — проверка</h3>
    <p>Для проверки записи включи любое видео со звуком (например, на YouTube) и нажми кнопку записи.</p>
    <button id="asr">1. Проверить распознавание</button>
    <button id="capA">2. Запись 10 с — вариант А (через экран)</button>
    <button id="capB">3. Запись 10 с — вариант Б (без экрана)</button>
    <button id="open">Открыть папку с записями</button>
    <button id="copy">Скопировать лог</button>
    <pre id="log"></pre>
    <script src="renderer.js"></script>
  </body>
</html>
```

- [ ] **Step 6: `spike/app/renderer.js`**

```js
'use strict';
const logEl = document.getElementById('log');
const RECORD_MS = 10_000;

function log(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
  window.spike.appendLog(line);
}

window.spike.onAsrLog(log);

async function asrTest() {
  log('— Проверка распознавания (sherpa-onnx в utilityProcess)');
  log(`  итог: ${await window.spike.runAsr()}`);
}

function startTone() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  osc.frequency.value = 440;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  return { stop: () => { osc.stop(); ctx.close(); } };
}

async function recordTrack(stream, name) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  let peak = 0;
  const meter = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
  }, 50);

  const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start(1000);
  await new Promise((resolve) => setTimeout(resolve, RECORD_MS));
  recorder.stop();
  await stopped;
  clearInterval(meter);
  await ctx.close();
  return { name, peak, blob: new Blob(chunks, { type: 'audio/webm' }) };
}

async function captureTest(mode, withTone) {
  const label = mode === 'screen' ? 'А (через экран)' : 'Б (без экрана)';
  log(`— Запись 10 с, вариант ${label}${withTone ? ', с тестовым тоном' : ''}`);
  await window.spike.setCaptureMode(mode);

  let mic = null;
  let display = null;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    log(`  микрофон: ${mic.getAudioTracks().map((t) => t.label).join(', ')}`);
  } catch (err) {
    log(`  FAIL микрофон — ${err.name}: ${err.message}`);
  }
  try {
    display = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: 320, height: 240, frameRate: 1 },
    });
    const tracks = display.getAudioTracks();
    log(`  системный звук: дорожек ${tracks.length}; состояние ${tracks.map((t) => t.readyState).join('/') || '—'}`);
  } catch (err) {
    log(`  FAIL системный звук — ${err.name}: ${err.message}`);
  }

  const tone = withTone ? startTone() : null;
  const jobs = [];
  if (mic) jobs.push(recordTrack(mic, 'mic'));
  if (display && display.getAudioTracks().length > 0) {
    jobs.push(recordTrack(new MediaStream(display.getAudioTracks()), 'system'));
  }
  const results = await Promise.all(jobs);
  if (tone) tone.stop();
  for (const stream of [mic, display]) stream?.getTracks().forEach((t) => t.stop());

  for (const r of results) {
    const saved = await window.spike.save(`${mode}-${r.name}-${Date.now()}.webm`, await r.blob.arrayBuffer());
    const silent = r.peak < 0.001 ? ' — ТИШИНА' : '';
    log(`  ${r.name}: ${Math.round(r.blob.size / 1024)} КБ, пик ${r.peak.toFixed(3)}${silent} → ${saved}`);
  }
}

document.getElementById('asr').onclick = () => asrTest();
document.getElementById('capA').onclick = () => captureTest('screen', false);
document.getElementById('capB').onclick = () => captureTest('frame', false);
document.getElementById('open').onclick = () => window.spike.openOutDir();
document.getElementById('copy').onclick = () => navigator.clipboard.writeText(logEl.textContent);

(async () => {
  const info = await window.spike.info();
  log(`Платформа: ${info.platform} ${info.osVersion}; Electron ${info.electron}`);
  if (!info.auto) return;
  await asrTest();
  await captureTest('screen', true);
  await captureTest('frame', true);
  log('— Авто-проверка завершена');
  await window.spike.quit();
})();
```

- [ ] **Step 7: Установить зависимости**

Run: `cd D:/TextMeet/spike/app && npm install`
Expected: без ошибок; есть `node_modules/electron` и `node_modules/sherpa-onnx-win-x64`.

- [ ] **Step 8: Авто-прогон на Windows**

Run: `cd D:/TextMeet/spike/app && npm run auto` (таймаут 15 минут: первый раз качается модель ~320 МБ)
Затем: `cat "$USERPROFILE/Downloads/textmeet-spike/spike-log.txt"`
Expected (успех):
- строки `OK   GigaAM v3 e2e CTC — «…»` с русским текстом с пунктуацией, `OK   разделение по голосам`, `OK   VAD, front(false)`;
- в обоих вариантах записи `system: … пик 0.1…` (без `ТИШИНА`) — тестовый тон пойман через loopback;
- `mic: …` с ненулевым размером.
Записать, упали ли варианты «по умолчанию» (внешний буфер) — это важно для плана 3.

- [ ] **Step 9: Commit**

```bash
git add spike/app/package.json spike/app/package-lock.json spike/app/main.js spike/app/preload.js spike/app/index.html spike/app/renderer.js spike/app/worker.js
git commit -m "feat(spike): add Electron probe app for sherpa-onnx and audio capture"
git push
```

---

### Task 11: Сборка мини-приложения для Mac в GitHub Actions

**Files:**
- Create: `.github/workflows/spike-mac.yml`

- [ ] **Step 1: Workflow**

```yaml
name: spike-mac

on:
  workflow_dispatch:

jobs:
  build:
    runs-on: macos-latest
    defaults:
      run:
        working-directory: spike/app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: npm ci
      - run: npm run dist:mac
      - name: Ad-hoc sign and zip
        run: |
          APP="$(find dist -maxdepth 2 -name '*.app' -type d | head -n 1)"
          echo "App: $APP"
          find "$APP" \( -name '*.node' -o -name '*.dylib' \) -type f -exec codesign --force --sign - {} \;
          codesign --force --deep --sign - "$APP"
          codesign --verify --deep --verbose=2 "$APP"
          ditto -c -k --keepParent "$APP" TextMeetSpike-mac.zip
      - uses: actions/upload-artifact@v4
        with:
          name: TextMeetSpike-mac
          path: spike/app/TextMeetSpike-mac.zip
```

- [ ] **Step 2: Commit, push и запуск сборки**

```bash
git add .github/workflows/spike-mac.yml
git commit -m "ci(spike): build ad-hoc signed macOS probe app on demand"
git push
gh workflow run spike-mac.yml
```

- [ ] **Step 3: Дождаться окончания сборки**

Run: `gh run list --workflow spike-mac.yml --limit 1` → взять ID → `gh run watch <ID> --exit-status`
Expected: `completed success`. Если сборка упала — `gh run view <ID> --log-failed`, исправить, повторить.

---

### Task 12: Проверка на Mac (контрольная точка с пользователем)

- [ ] **Step 1: Дать пользователю инструкцию (дословно)**

1. На Mac открой в браузере `https://github.com/wiiProfaker/TextMeet/actions/workflows/spike-mac.yml`, войди в GitHub.
2. Открой последний зелёный запуск → внизу «Artifacts» → скачай `TextMeetSpike-mac`.
3. Распакуй скачанный архив, внутри будет `TextMeetSpike-mac.zip` — распакуй и его. Перетащи `TextMeet Spike.app` в «Программы».
4. Открой «Терминал» и выполни одну команду (снимает пометку «скачано из интернета»):
   `xattr -dr com.apple.quarantine "/Applications/TextMeet Spike.app"`
   (Если не хочешь Терминал: попробуй открыть приложение, потом «Системные настройки → Конфиденциальность и безопасность → Всё равно открыть».)
5. Запусти приложение, нажми «1. Проверить распознавание» и дождись строки `итог: готово` (первый раз качается ~320 МБ).
6. Включи в браузере любое видео со звуком. Нажми «2. Запись 10 с — вариант А». Если macOS спросит разрешения (микрофон, запись звука, запись экрана) — разреши и нажми кнопку ещё раз.
7. То же для «3. Запись 10 с — вариант Б».
8. Нажми «Скопировать лог» и пришли лог сюда в чат.

- [ ] **Step 2: Разобрать лог**

Ответить на вопросы:
- sherpa-onnx на Mac внутри Electron: все шаги `OK`? Упали ли варианты по умолчанию?
- Вариант А: есть ли дорожка системного звука, пик > 0.001? Какие разрешения спросила macOS?
- Вариант Б: то же. **Если Б работает без разрешения «Запись экрана» — это основной путь для приложения.**
- Если оба варианта дают `ТИШИНА` или 0 дорожек — нужен Swift-помощник на Core Audio Taps (запасной путь из спецификации); это отдельный план.

---

### Task 13: Итоги спайка

**Files:**
- Create: `docs/superpowers/spike-results.md`
- Modify: `docs/superpowers/specs/2026-09-25-textmeet-design.md` (только если решения меняют спецификацию)
- Modify: `docs/superpowers/plans/2026-09-25-textmeet-roadmap.md` (статус плана 0)

- [ ] **Step 1: Записать итоги в `docs/superpowers/spike-results.md`**

Шаблон — все поля заполняются фактическими результатами из Task 8, 10, 12:

```markdown
# Итоги спайка — <дата>

## 1. Качество расшифровки (Task 8)
| Запись | Длительность | Участников (факт / найдено) | RTF rnnt | RTF ctc | Оценка пользователя |
|---|---|---|---|---|---|

**Решение:** вариант GigaAM — <rnnt|ctc>; модель голосов — <titanet|eres2net>; порог для авто-режима — <число>.

## 2. sherpa-onnx в Electron (Task 10, 12)
| Шаг | Windows | macOS |
|---|---|---|
| readWave(file, false) | | |
| GigaAM e2e CTC | | |
| Разделение по голосам | | |
| VAD front(false) | | |
| readWave по умолчанию (внешний буфер) | | |
| VAD front() по умолчанию | | |

**Решение:** в приложении всегда передавать `enableExternalBuffer = false` / <другое>.

## 3. Системный звук (Task 10, 12)
| Вариант | Windows | macOS 27 | Разрешения macOS |
|---|---|---|---|
| А — через экран | | | |
| Б — без экрана (request.frame) | | | |

**Решение:** путь захвата на Windows — <…>; на macOS — <А | Б | Swift-помощник>.

## 4. Что меняется в спецификации
<список или «ничего»>
```

- [ ] **Step 2: Обновить спецификацию, если решения её меняют** (например, раздел 5.3 — выбранный путь захвата на macOS; раздел 5.4 — вариант GigaAM).

- [ ] **Step 3: Отметить план 0 как выполненный в дорожной карте** (колонка «Статус» → «выполнен»).

- [ ] **Step 4: Commit и push**

```bash
git add docs/superpowers/spike-results.md docs/superpowers/specs/2026-09-25-textmeet-design.md docs/superpowers/plans/2026-09-25-textmeet-roadmap.md
git commit -m "docs: record spike results and resulting decisions"
git push
```

- [ ] **Step 5: Следующий шаг** — написать подробный План 1 (каркас приложения) с учётом итогов.
