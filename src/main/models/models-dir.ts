import { join } from 'node:path';

export interface ModelsDirEnv {
  platform: string;
  homeDir: string;
  /** %LOCALAPPDATA% на Windows. */
  localAppData?: string | undefined;
  /** Только для автотестов: своя папка моделей (TEXTMEET_MODELS_DIR). */
  override?: string | undefined;
}

/**
 * Папка моделей — служебная, вне облачных папок (модели большие, синхронизировать их незачем):
 * Windows %LOCALAPPDATA%\TextMeet\models, macOS ~/Library/Application Support/TextMeet/models.
 * Та же папка, что в спайке; версия для разработки пользуется ею же — данные в моделях не меняются.
 */
export function modelsRoot(env: ModelsDirEnv): string {
  if (env.override) return env.override;
  if (env.platform === 'win32') {
    // Пустая переменная — всё равно что её нет: иначе путь вышел бы относительным (от текущей папки).
    return join(env.localAppData || join(env.homeDir, 'AppData', 'Local'), 'TextMeet', 'models');
  }
  if (env.platform === 'darwin') return join(env.homeDir, 'Library', 'Application Support', 'TextMeet', 'models');
  return join(env.homeDir, '.local', 'share', 'TextMeet', 'models');
}
