import { describe, expect, it } from 'vitest';
import {
  dialogTexts,
  MIC_ACCESS_DENIED,
  micProblem,
  notificationTexts,
  RECORDER_BROKEN,
  systemAudioProblem,
  systemSettingsUrl,
  transcriptionTexts,
} from './texts';
import { DownloadError } from './models/download';
import { WORKER_REFUSALS } from './transcription/protocol';

describe('notificationTexts', () => {
  it('builds the recording notifications', () => {
    expect(notificationTexts.started('Ctrl+Space')).toEqual({
      title: 'Запись началась',
      body: 'Ctrl+Space — остановить.',
      silent: true,
    });
    expect(notificationTexts.stopped(60).silent).toBe(true);
    expect(notificationTexts.stillRecording('F9').silent).toBeUndefined();
    expect(notificationTexts.stopped(42 * 60 + 15).title).toBe('Запись остановлена · 42 мин');
    expect(notificationTexts.stillRecording('⌥ Space').body).toContain('нажмите ⌥ Space');
    expect(notificationTexts.lowDisk(0.5 * 1024 ** 3).body).toBe('Осталось 0,5 ГБ. Запись продолжается.');
    expect(notificationTexts.hotkeyBusy('Ctrl+Space').body).toMatch(/^Ctrl\+Space уже использует/);
    expect(notificationTexts.stoppedByDisk('на диске закончилось место').body).toContain('на диске закончилось место');
    expect(notificationTexts.startFailed(MIC_ACCESS_DENIED).body).toBe(MIC_ACCESS_DENIED.message);
  });

  it('does not offer a hotkey that another program holds as the way to stop', () => {
    expect(notificationTexts.started(null).body).toBe('Остановить — кнопкой в окне или в меню трея.');
    expect(notificationTexts.stillRecording(null).body).toMatch(/нажмите «Остановить» в окне или в меню трея\.$/);
  });

  it('counts recovered recordings', () => {
    expect(notificationTexts.recovered(1).body).toMatch(/^Прошлая запись/);
    expect(notificationTexts.recovered(3).body).toContain('(3)');
  });

  it('has texts for an interrupted recording and a lost microphone', () => {
    expect(notificationTexts.interrupted().title).toBe('Запись прервалась');
    expect(notificationTexts.micEnded().body).toContain('Микрофон отключился');
  });

  it('tells the user to restart TextMeet when the recorder window keeps crashing', () => {
    expect(notificationTexts.recorderBroken()).toEqual({
      title: 'Запись не работает',
      body: 'Окно записи несколько раз закрылось из-за сбоя. Перезапустите TextMeet.',
    });
    // Та же причина — и в окне, если после этого попробовать начать запись.
    expect(RECORDER_BROKEN).toEqual({ message: notificationTexts.recorderBroken().body, settings: null });
  });

  it('explains a recording whose details could not be saved', () => {
    expect(notificationTexts.saveFailed('на диске закончилось место')).toEqual({
      title: 'Запись остановлена',
      body: 'Не удалось сохранить сведения о записи: на диске закончилось место. Звук сохранён — встреча восстановится при следующем запуске TextMeet.',
    });
  });
});

describe('dialogTexts', () => {
  it('asks before recording with little disk space', () => {
    const text = dialogTexts.lowDisk(0.8 * 1024 ** 3);
    expect(text.message).toBe('Мало места на диске');
    expect(text.detail).toContain('Свободно 0,8 ГБ');
    expect(text.buttons).toEqual(['Отмена', 'Всё равно начать']);
  });

  it('asks before quitting during a recording', () => {
    expect(dialogTexts.quitWhileRecording().buttons).toEqual(['Продолжить запись', 'Остановить и выйти']);
  });
});

describe('micProblem', () => {
  it.each(['NotAllowedError', 'SecurityError', 'PermissionDeniedError'])('%s means no access', (name) => {
    expect(micProblem({ name, message: '' })).toBe(MIC_ACCESS_DENIED);
  });

  it.each([
    ['NotFoundError', 'Микрофон не найден'],
    ['OverconstrainedError', 'Микрофон не найден'],
    ['NotReadableError', 'Микрофон занят'],
    ['AbortError', 'Микрофон занят'],
  ])('%s → %s', (name, start) => {
    const problem = micProblem({ name, message: 'raw' });
    expect(problem.message.startsWith(start)).toBe(true);
    expect(problem.settings).toBeNull();
  });

  it('falls back to the original message', () => {
    expect(micProblem({ name: 'TypeError', message: 'странно' }).message).toBe('Не удалось начать запись: странно');
    expect(micProblem({ name: 'TypeError', message: '' }).message).toBe('Не удалось начать запись: TypeError');
  });
});

describe('systemAudioProblem', () => {
  it('points to the macOS permission when access is refused', () => {
    expect(systemAudioProblem({ name: 'NotAllowedError', message: '' }, 'darwin')).toContain('Запись системного звука');
    expect(systemAudioProblem({ name: 'AbortError', message: '' }, 'darwin')).toContain('Запись системного звука');
  });

  it('explains a busy device and other failures; the microphone keeps recording', () => {
    expect(systemAudioProblem({ name: 'NotReadableError', message: '' }, 'win32')).toContain('устройство занято');
    const other = systemAudioProblem({ name: 'AbortError', message: '' }, 'win32');
    expect(other).toContain('(AbortError)');
    expect(other).toContain('Микрофон записывается как обычно.');
  });
});

describe('systemSettingsUrl', () => {
  it('opens the right settings page on each system', () => {
    expect(systemSettingsUrl('microphone', 'win32')).toBe('ms-settings:privacy-microphone');
    expect(systemSettingsUrl('system-audio', 'win32')).toBe('ms-settings:sound');
    expect(systemSettingsUrl('microphone', 'darwin')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    );
    expect(systemSettingsUrl('system-audio', 'darwin')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
  });
});

describe('transcription texts', () => {
  it('names the meeting in notifications', () => {
    expect(notificationTexts.transcribed('Созвон с Ириной')).toEqual({ title: 'Текст встречи готов', body: 'Созвон с Ириной' });
    expect(notificationTexts.transcribeFailed('Созвон').body).toContain('Повторить');
  });

  it('tells how to start transcription by hand when it could not be queued', () => {
    expect(notificationTexts.transcribeNotQueued()).toEqual({
      title: 'Расшифровка не началась',
      body: 'Запись сохранена. Откройте встречу в TextMeet и нажмите «Расшифровать».',
    });
  });

  it('explains why models could not be prepared', () => {
    expect(transcriptionTexts.download(new DownloadError('network', 'x'))).toContain('нет связи');
    expect(transcriptionTexts.download(new DownloadError('corrupt', 'x'))).toContain('повреждён');
    expect(transcriptionTexts.download(new DownloadError('space', 'x'))).toMatch(/нужно \d+ МБ/);
    expect(transcriptionTexts.download(new DownloadError('disk', 'x'))).toContain('на диск');
    expect(transcriptionTexts.download(new DownloadError('cancelled', 'x'))).toBe('Скачивание модели отменено.');
  });

  it('asks for the space the download needs, not for the size of all models', () => {
    const text = transcriptionTexts.download(new DownloadError('space', 'x', { neededBytes: 70.2 * 1024 ** 2 }));
    expect(text).toBe('Не хватает места на диске для модели расшифровки: нужно 71 МБ свободного места.');
  });

  it('does not blame the internet when the server refuses to give the file', () => {
    const text = transcriptionTexts.download(new DownloadError('server', 'сервер ответил 404'));
    expect(text).not.toContain('интернет');
    expect(text).toContain('сервер не отдал файл модели');
  });

  it('never shows a raw system error while models are prepared', () => {
    const raw = Object.assign(new Error("EPERM: operation not permitted, open 'C:\\Users\\ира\\models\\verified.json'"), {
      code: 'EPERM',
    });
    expect(transcriptionTexts.download(raw)).toBe(transcriptionTexts.download(new DownloadError('disk', 'x')));
    for (const code of ['ENOSPC', 'EACCES', 'EROFS', 'EBUSY']) {
      expect(transcriptionTexts.download(Object.assign(new Error(code), { code }))).toContain('на диск');
    }
    const other = transcriptionTexts.download(new Error('что-то C:\\путь'));
    expect(other).not.toContain('что-то');
    expect(other).toMatch(/^Не удалось подготовить модели расшифровки\./);
    expect(transcriptionTexts.download('строка')).toBe(other);
  });

  it('turns a failure of the transcription process into plain words', () => {
    const unreadable = transcriptionTexts.workerFailed(
      "не прочиталась ни одна дорожка: микрофон — ffmpeg не прочитал дорожку (завершился с кодом 1): C:\\Users\\ира\\mic.webm: Invalid data",
    );
    expect(unreadable).toContain('ffmpeg не прочитал дорожку');
    expect(unreadable).not.toContain('C:\\');
    expect(transcriptionTexts.workerFailed('ffmpeg завис — долго ничего не сообщал и был остановлен')).toBe(unreadable);
    const internal = transcriptionTexts.workerFailed('Protobuf parsing failed: D:\\models\\encoder.int8.onnx');
    expect(internal).not.toContain('Protobuf');
    expect(internal).toContain('журнал');
    for (const refusal of Object.values(WORKER_REFUSALS)) expect(transcriptionTexts.workerFailed(refusal)).toBe(refusal);
  });

  it('does not blame the track when ffmpeg itself could not be started', () => {
    const internal = transcriptionTexts.workerFailed('что-то внутри');
    const exe = String.raw`C:\Program Files\TextMeet\resources\app.asar.unpacked\node_modules\ffmpeg-static\ffmpeg.exe`;
    // Одна дорожка — ошибка запуска как есть; две — внутри общего «не прочиталась ни одна дорожка».
    expect(transcriptionTexts.workerFailed(`spawn ${exe} ENOENT`)).toBe(internal);
    expect(transcriptionTexts.workerFailed('spawn EPERM')).toBe(internal);
    expect(
      transcriptionTexts.workerFailed(
        `не прочиталась ни одна дорожка: микрофон — spawn ${exe} ENOENT; звук компьютера — spawn ${exe} ENOENT`,
      ),
    ).toBe(internal);
    expect(transcriptionTexts.workerFailed('ffmpeg не прочитал дорожку (завершился с кодом 1): Invalid data')).toBe(
      transcriptionTexts.unreadableAudio,
    );
  });

  it('turns an unexpected error of the queue into plain words', () => {
    const denied = Object.assign(new Error("EACCES: permission denied, open 'C:\\lib\\transcript.json'"), { code: 'EACCES' });
    expect(transcriptionTexts.unexpected(denied)).toBe('Расшифровка не удалась: нет прав на эту папку.');
    expect(transcriptionTexts.unexpected(new Error('TypeError: x is undefined'))).toBe(
      transcriptionTexts.workerFailed('что-то внутри'),
    );
  });

  it('does not double the full stop after a meeting title', () => {
    expect(notificationTexts.transcribeFailed('Созвон').body).toBe('Созвон. Причина и кнопка «Повторить» — в окне встречи.');
    expect(notificationTexts.transcribeFailed('Созвон в 10.').body).toBe(
      'Созвон в 10. Причина и кнопка «Повторить» — в окне встречи.',
    );
    expect(notificationTexts.transcribeFailed('Что решили?').body).toMatch(/^Что решили\? Причина/);
    expect(notificationTexts.transcribeFailed('  ').body).toBe('Причина и кнопка «Повторить» — в окне встречи.');
  });
});
