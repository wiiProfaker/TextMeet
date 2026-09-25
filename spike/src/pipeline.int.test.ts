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
