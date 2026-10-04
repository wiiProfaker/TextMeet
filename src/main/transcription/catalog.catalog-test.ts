// Каждая модель каталога на настоящих файлах (решения Плана 7, §3: «модель попадает в каталог, только если работает»).
// npm run test:catalog — первый прогон скачивает все модели (~4,5 ГБ); в CI — workflow models-check на Windows, Mac
// и Linux. Русские модели слушают эталон GigaAM (стихи Пушкина), английские — английский пример.
import { describe, expect, it } from 'vitest';
import { ASR_MODELS } from '../../shared/asr-models';
import { ensureModels, fixture, MODELS_ROOT } from '../../test-support/model-fixtures';
import { resolveFfmpegPath } from '../audio/ffmpeg';
import { decodeToMono16k, SAMPLE_RATE } from './decode';
import { sherpaEngines } from './sherpa-engines';
import { cleanRecognizedText } from './text-cleanup';

const THREADS = 4;
/**
 * Ключевые слова эталонов. Модели и даже одна модель на разных ОС ошибаются в отдельных буквах («дево с трепетом»
 * на Mac и Linux) — проверяется, что узнано большинство слов, а не точная фраза.
 */
const KEYWORDS = {
  ru: ['требуя', 'похвал', 'счастлив', 'сладкой', 'трепетом', 'любви', 'посмотрит', 'украдкой', 'грешные', 'зеленый'],
  en: ['ask', 'not', 'what', 'your', 'country', 'can', 'do', 'for', 'you'],
};
const MIN_SHARE = 0.7;

const words = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replaceAll('ё', 'е')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );

describe('every model of the catalog recognizes speech', () => {
  for (const model of ASR_MODELS) {
    it(`${model.title}`, async () => {
      await ensureModels([model.id, 'voices']);
      const file = await fixture(model.group === 'ru' ? 'gigaamExample' : 'englishExample');
      const samples = await decodeToMono16k(resolveFfmpegPath(), file, 12);
      // Как в конвейере: участки речи режет детектор, каждый распознаётся отдельно (фильтр — у тех, кому он нужен).
      const engines = sherpaEngines(MODELS_ROOT, model.id);
      const recognizer = engines.recognizer(THREADS);
      const clean = model.hallucinates ? cleanRecognizedText : (text: string) => text.trim();
      const speech = engines.detector().detect(samples);
      expect(speech.length).toBeGreaterThan(0);
      const text = speech
        .map((i) => clean(recognizer.recognize(samples.slice(Math.floor(i.start * SAMPLE_RATE), Math.ceil(i.end * SAMPLE_RATE)))))
        .join(' ');
      const heard = words(text);
      const keywords = KEYWORDS[model.group];
      const found = keywords.filter((word) => heard.has(word));
      expect(found.length / keywords.length, `${model.title}: «${text}»`).toBeGreaterThanOrEqual(MIN_SHARE);
    });
  }
});
