// Тексты для человека, которые показывает main: уведомления, системные окна, причины ошибок записи.
import { formatBytes, formatDurationShort } from '../shared/format';
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
import { DownloadError } from './models/download';
import { TOTAL_MODELS_SIZE } from './models/registry';

const RECORDER_BROKEN_TEXT = 'Окно записи несколько раз закрылось из-за сбоя. Перезапустите TextMeet.';

export interface NotificationText {
  title: string;
  body: string;
  /** Без системного звука: у старта и стопа свой сигнал. */
  silent?: boolean;
}

// hotkey — null, когда клавишу держит другая программа: тогда её не предлагаем как способ остановить.
export const notificationTexts = {
  started: (hotkey: string | null): NotificationText => ({
    title: 'Запись началась',
    body: hotkey ? `${hotkey} — остановить.` : 'Остановить — кнопкой в окне или в меню трея.',
    silent: true,
  }),
  stopped: (durationSec: number): NotificationText => ({
    title: `Запись остановлена · ${formatDurationShort(durationSec)}`,
    body: 'Окно TextMeet открыто: укажите, сколько было участников.',
    silent: true,
  }),
  stillRecording: (hotkey: string | null): NotificationText => ({
    title: 'Запись всё ещё идёт',
    body: `Уже 10 минут не слышно ни микрофона, ни звука компьютера. Если встреча закончилась, нажмите ${
      hotkey ?? '«Остановить» в окне или в меню трея'
    }.`,
  }),
  lowDisk: (freeBytes: number): NotificationText => ({
    title: 'Мало места на диске',
    body: `Осталось ${formatBytes(freeBytes)}. Запись продолжается.`,
  }),
  hotkeyBusy: (hotkey: string): NotificationText => ({
    title: 'Горячая клавиша занята',
    body: `${hotkey} уже использует другая программа. Начать запись можно из окна или меню в трее, сменить клавишу — в настройках.`,
  }),
  recovered: (count: number): NotificationText => ({
    title: 'Запись восстановлена',
    body:
      count === 1
        ? 'Прошлая запись прервалась из-за сбоя. Записанное сохранено — встреча уже в списке.'
        : `Прошлые записи прервались из-за сбоя (${count}). Записанное сохранено — встречи уже в списке.`,
  }),
  interrupted: (): NotificationText => ({
    title: 'Запись прервалась',
    body: 'Окно записи закрылось из-за сбоя. Записанное сохранено — встреча уже в списке.',
  }),
  startFailed: (problem: StartProblem): NotificationText => ({ title: 'Запись не началась', body: problem.message }),
  stoppedByDisk: (reason: string): NotificationText => ({
    title: 'Запись остановлена',
    body: `Не удалось записать на диск: ${reason}. Записанное до этого сохранено.`,
  }),
  saveFailed: (reason: string): NotificationText => ({
    title: 'Запись остановлена',
    body: `Не удалось сохранить сведения о записи: ${reason}. Звук сохранён — встреча восстановится при следующем запуске TextMeet.`,
  }),
  micEnded: (): NotificationText => ({
    title: 'Запись остановлена',
    body: 'Микрофон отключился, а звук компьютера не записывается. Записанное сохранено.',
  }),
  recorderBroken: (): NotificationText => ({ title: 'Запись не работает', body: RECORDER_BROKEN_TEXT }),
  transcribed: (meetingTitle: string): NotificationText => ({ title: 'Текст встречи готов', body: meetingTitle }),
  transcribeFailed: (meetingTitle: string): NotificationText => ({
    title: 'Не удалось расшифровать встречу',
    body: `${meetingTitle}. Причина и кнопка «Повторить» — в окне встречи.`,
  }),
};

/** Причины ошибок расшифровки: пишутся в meeting.json (errorMessage) и показываются во встрече рядом с «Повторить». */
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
  noTracks: 'В папке встречи нет записанных дорожек — расшифровывать нечего.',
  crashed: 'Расшифровка прервалась из-за сбоя.',
  hung: 'Расшифровка зависла и была остановлена.',
  badMessage: 'Процесс расшифровки прислал неверные данные.',
  download(err: unknown): string {
    if (!(err instanceof DownloadError)) {
      return `Не удалось подготовить модели расшифровки: ${err instanceof Error ? err.message : String(err)}`;
    }
    switch (err.kind) {
      case 'network':
        return 'Не удалось скачать модель расшифровки: нет связи с сервером. Проверьте интернет.';
      case 'corrupt':
        return 'Скачанный файл модели повреждён — при повторе он скачается заново.';
      case 'space':
        // В мегабайтах с округлением вверх: «0,3 ГБ» преуменьшало бы нужное место.
        return `Не хватает места на диске для модели расшифровки (нужно ${Math.ceil(TOTAL_MODELS_SIZE / 1024 ** 2)} МБ).`;
      case 'disk':
        return 'Не удалось сохранить модель расшифровки на диск.';
    }
  },
};

export interface DialogText {
  title: string;
  message: string;
  detail: string;
  /** Кнопки слева направо; последняя — действие по умолчанию. */
  buttons: [string, string];
}

export const dialogTexts = {
  lowDisk: (freeBytes: number): DialogText => ({
    title: 'TextMeet',
    message: 'Мало места на диске',
    detail: `Свободно ${formatBytes(freeBytes)}. Долгая запись может не поместиться — освободите место или выберите другую папку библиотеки в настройках.`,
    buttons: ['Отмена', 'Всё равно начать'],
  }),
  quitWhileRecording: (): DialogText => ({
    title: 'TextMeet',
    message: 'Идёт запись',
    detail: 'Если выйти, запись остановится и сохранится в библиотеке.',
    buttons: ['Продолжить запись', 'Остановить и выйти'],
  }),
};

export const RECORDER_NOT_READY: StartProblem = {
  message: 'Запись ещё не готова — подождите пару секунд и попробуйте снова.',
  settings: null,
};
/** Окно записи падало снова и снова — его больше не перезапускают, поможет только перезапуск программы. */
export const RECORDER_BROKEN: StartProblem = { message: RECORDER_BROKEN_TEXT, settings: null };
export const RECORDER_TIMEOUT: StartProblem = {
  message: 'Окно записи не ответило. Попробуйте ещё раз.',
  settings: null,
};
export const MIC_ACCESS_DENIED: StartProblem = {
  message: 'Нет доступа к микрофону. Разрешите TextMeet пользоваться микрофоном в настройках системы.',
  settings: 'microphone',
};

/** Почему не удалось включить микрофон (по имени DOMException из getUserMedia). */
export function micProblem(failure: MediaFailure): StartProblem {
  switch (failure.name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return MIC_ACCESS_DENIED;
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return {
        message: 'Микрофон не найден. Подключите микрофон или выберите другой в настройках TextMeet.',
        settings: null,
      };
    case 'NotReadableError':
    case 'AbortError':
    case 'TrackStartError':
      return {
        message: 'Микрофон занят другой программой или не отвечает. Закройте её и попробуйте снова.',
        settings: null,
      };
    default:
      return { message: `Не удалось начать запись: ${failure.message || failure.name}`, settings: null };
  }
}

/** Почему не удалось подключиться к звуку компьютера (getDisplayMedia). */
export function systemAudioProblem(failure: MediaFailure, platform: string): string {
  const tail = 'Микрофон записывается как обычно.';
  if (platform === 'darwin' && (failure.name === 'NotAllowedError' || failure.name === 'AbortError')) {
    return `Нет разрешения «Запись системного звука» — разрешите его TextMeet в настройках системы. ${tail}`;
  }
  if (failure.name === 'NotReadableError') {
    return `Не удалось подключиться к звуку компьютера: устройство занято или не поддерживается. ${tail}`;
  }
  return `Не удалось подключиться к звуку компьютера (${failure.name}). ${tail}`;
}

/** Адрес раздела системных настроек, который открывает кнопка «Открыть настройки системы». */
export function systemSettingsUrl(kind: SystemSettingsKind, platform: string): string {
  if (platform === 'darwin') {
    const pane = kind === 'microphone' ? 'Privacy_Microphone' : 'Privacy_ScreenCapture';
    return `x-apple.systempreferences:com.apple.preference.security?${pane}`;
  }
  return kind === 'microphone' ? 'ms-settings:privacy-microphone' : 'ms-settings:sound';
}
