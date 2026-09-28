// Тексты для человека, которые показывает main: уведомления, системные окна, причины ошибок записи.
import { formatBytes, formatDurationShort } from '../shared/format';
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';

export interface NotificationText {
  title: string;
  body: string;
  /** Без системного звука: у старта и стопа свой сигнал. */
  silent?: boolean;
}

export const notificationTexts = {
  started: (hotkey: string): NotificationText => ({
    title: 'Запись началась',
    body: `${hotkey} — остановить.`,
    silent: true,
  }),
  stopped: (durationSec: number): NotificationText => ({
    title: `Запись остановлена · ${formatDurationShort(durationSec)}`,
    body: 'Окно TextMeet открыто: укажите, сколько было участников.',
    silent: true,
  }),
  stillRecording: (hotkey: string): NotificationText => ({
    title: 'Запись всё ещё идёт',
    body: `Уже 10 минут не слышно ни микрофона, ни звука компьютера. Если встреча закончилась, нажмите ${hotkey}.`,
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
    body: 'Микрофон отключился, а звук компьютера не записывался. Записанное сохранено.',
  }),
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
