import { describe, expect, it } from 'vitest';
import { HIDDEN_ARG, launchAtLoginNotice, shouldStartHidden } from './startup';

describe('shouldStartHidden', () => {
  it('uses the --hidden argument on Windows', () => {
    expect(shouldStartHidden({ platform: 'win32', argv: ['TextMeet.exe', HIDDEN_ARG], wasOpenedAtLogin: false })).toBe(
      true,
    );
    expect(shouldStartHidden({ platform: 'win32', argv: ['TextMeet.exe'], wasOpenedAtLogin: true })).toBe(false);
  });

  it('uses wasOpenedAtLogin on macOS', () => {
    expect(shouldStartHidden({ platform: 'darwin', argv: [], wasOpenedAtLogin: true })).toBe(true);
    expect(shouldStartHidden({ platform: 'darwin', argv: [HIDDEN_ARG], wasOpenedAtLogin: false })).toBe(false);
  });
});

describe('launchAtLoginNotice', () => {
  const on = { openAtLogin: true, executableWillLaunchAtLogin: true, status: 'enabled' };

  it('is unsupported on other systems', () => {
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'linux', state: on })).toBe('unsupported');
  });

  it('warns that a development build does not register itself', () => {
    expect(launchAtLoginNotice({ enabled: true, isPackaged: false, platform: 'win32', state: null })).toBe('dev-build');
  });

  it('says nothing when the setting is off or everything works', () => {
    expect(launchAtLoginNotice({ enabled: false, isPackaged: true, platform: 'win32', state: on })).toBe('none');
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'win32', state: on })).toBe('none');
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'darwin', state: on })).toBe('none');
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'win32', state: null })).toBe('none');
  });

  it('detects autostart disabled in Task Manager', () => {
    const state = { openAtLogin: true, executableWillLaunchAtLogin: false };
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'win32', state })).toBe(
      'blocked-by-system',
    );
  });

  it('detects macOS asking for approval or a missing login item', () => {
    const pending = { openAtLogin: false, status: 'requires-approval' };
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'darwin', state: pending })).toBe(
      'needs-approval',
    );
    const off = { openAtLogin: false, status: 'not-registered' };
    expect(launchAtLoginNotice({ enabled: true, isPackaged: true, platform: 'darwin', state: off })).toBe(
      'blocked-by-system',
    );
  });
});
