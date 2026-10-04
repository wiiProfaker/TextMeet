// Тексты для человека, которые показывает main: уведомления, системные окна, причины ошибок записи.
import { formatBytes, formatDurationShort } from '../shared/format';
import type { MediaFailure, StartProblem, SystemSettingsKind } from '../shared/recording';
import { knownFsReason } from './fs/fs-errors';
import { DownloadError } from './models/download';
import { MODELS_ENSURING } from './models/model-manager';
import { WORKER_REFUSALS } from './transcription/protocol';

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
    body: `${sentence(meetingTitle)}Причина и кнопка «Повторить» — в окне встречи.`,
  }),
  // После окна «Запись остановлена» встречу не удалось поставить в очередь (например, папка недоступна).
  transcribeNotQueued: (): NotificationText => ({
    title: 'Расшифровка не началась',
    body: 'Запись сохранена. Откройте встречу в TextMeet и нажмите «Расшифровать».',
  }),
};

/** Название как начало фразы: точка после него — если оно не кончается своим знаком; пустое — пропускается. */
function sentence(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return '';
  return /[.!?…]$/.test(trimmed) ? `${trimmed} ` : `${trimmed}. `;
}

/** Системные ошибки, при которых модель не записать на диск. */
const DISK_CODES = new Set(['ENOSPC', 'EDQUOT', 'EACCES', 'EPERM', 'EROFS', 'EBUSY']);
const SEE_LOG = 'Попробуйте ещё раз; подробности — в журнале ошибок (он указан в настройках).';
const MODELS_DISK_TEXT = 'Не удалось сохранить модель расшифровки на диск.';
const INTERNAL_TEXT = `Расшифровка не удалась из-за внутренней ошибки. ${SEE_LOG}`;
/** Сбои ffmpeg (чтения дорожек) — в тексте для человека; пути и вывод ffmpeg остаются в журнале. */
const UNREADABLE_AUDIO = /ffmpeg|не прочиталась ни одна дорожка/;
/** ffmpeg не запустился («spawn …ffmpeg.exe ENOENT» — например, его убрал антивирус): дорожки тут ни при чём. */
const SPAWN_FAILED = /\bspawn\b.*\b(E[A-Z]+|UNKNOWN)\b/;

/** Причины ошибок расшифровки: пишутся в meeting.json (errorMessage) и показываются во встрече рядом с «Повторить». */
export const transcriptionTexts = {
  stillRecording: 'Встреча ещё записывается — расшифровка начнётся после остановки.',
  noTracks: 'В папке встречи нет записанных дорожек — расшифровывать нечего.',
  crashed: 'Расшифровка прервалась из-за сбоя.',
  hung: 'Расшифровка зависла и была остановлена.',
  badMessage: 'Процесс расшифровки прислал неверные данные.',
  unreadableAudio: 'Не удалось прочитать звук встречи: ffmpeg не прочитал дорожку. Файлы записи остались в папке встречи.',
  /** Причина для человека; исходная ошибка (с путями и кодами) пишется в журнал отдельно. */
  download(err: unknown): string {
    if (!(err instanceof DownloadError)) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      return code && DISK_CODES.has(code) ? MODELS_DISK_TEXT : `Не удалось подготовить модели расшифровки. ${SEE_LOG}`;
    }
    switch (err.kind) {
      case 'network':
        return 'Не удалось скачать модель расшифровки: нет связи с сервером. Проверьте интернет.';
      case 'server':
        return 'Не удалось скачать модель расшифровки: сервер не отдал файл модели. Попробуйте позже или обновите TextMeet.';
      case 'corrupt':
        return 'Скачанный файл модели повреждён — при повторе он скачается заново.';
      case 'space':
        if (err.neededBytes === undefined) return 'Не хватает места на диске для модели расшифровки.';
        // В мегабайтах с округлением вверх: «0,3 ГБ» преуменьшало бы нужное место.
        return `Не хватает места на диске для модели расшифровки: нужно ${Math.ceil(err.neededBytes / 1024 ** 2)} МБ свободного места.`;
      case 'disk':
        return MODELS_DISK_TEXT;
      case 'cancelled':
        return 'Скачивание модели отменено.';
    }
  },
  /** Файлы модели целы (суммы сошлись), но движок их не принял — подробности в журнале. */
  modelLoad: (title: string): string => `Не удалось загрузить модель «${title}». ${SEE_LOG}`,
  /** Сбой процесса расшифровки (его текст — для журнала: вывод sherpa-onnx и ffmpeg, пути к файлам) → текст для человека. */
  workerFailed(raw: string): string {
    if ((Object.values(WORKER_REFUSALS) as string[]).includes(raw)) return raw;
    if (SPAWN_FAILED.test(raw)) return INTERNAL_TEXT;
    return UNREADABLE_AUDIO.test(raw) ? transcriptionTexts.unreadableAudio : INTERNAL_TEXT;
  },
  /** Непредвиденная ошибка очереди (например, не записался результат) → текст для человека. */
  unexpected(err: unknown): string {
    const reason = knownFsReason(err);
    return reason ? `Расшифровка не удалась: ${reason}.` : INTERNAL_TEXT;
  },
  /** Модели не удалились → текст для окна; незнакомая ошибка (её текст с путями) остаётся только в журнале. */
  deleteModels(err: unknown): string {
    const reason = knownFsReason(err) ?? (err instanceof Error && err.message === MODELS_ENSURING ? MODELS_ENSURING : null);
    return reason ? `Не удалось удалить модели: ${reason}` : `Не удалось удалить модели. ${SEE_LOG}`;
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
