import { z } from 'zod';
import { AiPromptSchema } from './ai-prompt';
import { ASR_MODEL_IDS, DEFAULT_ASR_MODEL } from './asr-models';

// Новые поля добавляются с .default(...) — старый settings.json читается без миграции.
export const SettingsSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  /** null — папка по умолчанию: ~/TextMeet */
  libraryDir: z.string().min(1).nullable().default(null),
  launchAtLogin: z.boolean().default(true),
  /** deviceId микрофона; null — микрофон, выбранный в системе. */
  microphoneId: z.string().min(1).max(500).nullable().default(null),
  /** Горячая клавиша записи в формате Electron (accelerator); null — по умолчанию для ОС. */
  recordHotkey: z.string().min(1).max(100).nullable().default(null),
  /** Короткий звук при начале и остановке записи. */
  recordSounds: z.boolean().default(true),
  /**
   * Модель расшифровки для новых встреч. Неизвестная (из более новой версии программы) — модель по умолчанию:
   * из-за одного поля остальные настройки не сбрасываются.
   */
  asrModel: z.enum(ASR_MODEL_IDS).default(DEFAULT_ASR_MODEL).catch(DEFAULT_ASR_MODEL),
  /** Папка, куда последний раз сохраняли выгрузку встречи; null — «Документы». Испорченная — забывается. */
  exportDir: z.string().min(1).nullable().default(null).catch(null),
  /**
   * «Запрос для ИИ»: null — стандартный (shared/ai-prompt.ts), '' — без запроса, иначе — свой текст. Испорченный
   * (не строка, длиннее 4000 символов) — забывается.
   */
  aiPrompt: AiPromptSchema.default(null).catch(null),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
