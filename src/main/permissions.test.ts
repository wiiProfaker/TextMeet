import type { Session, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { allowPermissionCheck, allowPermissionRequest, applyPermissionPolicy } from './permissions';

describe('allowPermissionRequest', () => {
  it('lets only the recorder window capture sound', () => {
    expect(allowPermissionRequest('media', 'recorder')).toBe(true);
    expect(allowPermissionRequest('display-capture', 'recorder')).toBe(true);
    expect(allowPermissionRequest('media', 'main')).toBe(false);
    expect(allowPermissionRequest('media', 'other')).toBe(false);
  });

  it.each(['notifications', 'geolocation', 'clipboard-read', 'openExternal', 'fullscreen'])('refuses %s', (permission) => {
    expect(allowPermissionRequest(permission, 'recorder')).toBe(false);
    expect(allowPermissionRequest(permission, 'main')).toBe(false);
  });
});

describe('allowPermissionCheck', () => {
  it('lets the main window see microphone names but not capture', () => {
    expect(allowPermissionCheck('media', 'main')).toBe(true);
    expect(allowPermissionCheck('display-capture', 'main')).toBe(false);
  });

  it('lets the recorder window check what it needs', () => {
    expect(allowPermissionCheck('media', 'recorder')).toBe(true);
    expect(allowPermissionCheck('display-capture', 'recorder')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(allowPermissionCheck('media', 'other')).toBe(false);
    expect(allowPermissionCheck('notifications', 'main')).toBe(false);
  });
});

describe('applyPermissionPolicy', () => {
  it('answers requests and checks by the window that asks', () => {
    type RequestHandler = (contents: WebContents | null, permission: string, callback: (ok: boolean) => void) => void;
    type CheckHandler = (contents: WebContents | null, permission: string) => boolean;
    let onRequest: RequestHandler = () => undefined;
    let onCheck: CheckHandler = () => false;
    const session = {
      setPermissionRequestHandler: (handler: RequestHandler) => {
        onRequest = handler;
      },
      setPermissionCheckHandler: (handler: CheckHandler) => {
        onCheck = handler;
      },
    } as unknown as Session;
    const main = {} as WebContents;
    const recorder = {} as WebContents;
    applyPermissionPolicy(session, { main: () => main, recorder: () => recorder });

    const callback = vi.fn();
    onRequest(recorder, 'media', callback);
    onRequest(main, 'media', callback);
    onRequest(null, 'media', callback);
    expect(callback.mock.calls).toEqual([[true], [false], [false]]);
    expect(onCheck(main, 'media')).toBe(true);
    expect(onCheck({} as WebContents, 'media')).toBe(false);
  });
});
