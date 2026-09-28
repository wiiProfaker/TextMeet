import { z } from 'zod';

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
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
