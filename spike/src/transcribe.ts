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
