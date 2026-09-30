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

  it('explains why models could not be prepared', () => {
    expect(transcriptionTexts.download(new DownloadError('network', 'x'))).toContain('нет связи');
    expect(transcriptionTexts.download(new DownloadError('corrupt', 'x'))).toContain('повреждён');
    expect(transcriptionTexts.download(new DownloadError('space', 'x'))).toMatch(/нужно \d+ МБ/);
    expect(transcriptionTexts.download(new DownloadError('disk', 'x'))).toContain('на диск');
    expect(transcriptionTexts.download(new Error('что-то'))).toBe('Не удалось подготовить модели расшифровки: что-то');
    expect(transcriptionTexts.download('строка')).toContain('строка');
  });
});
