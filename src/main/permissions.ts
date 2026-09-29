import type { Session, WebContents } from 'electron';

/** Кто спрашивает разрешение. */
export type Requester = 'main' | 'recorder' | 'other';

/** Запросы (getUserMedia и т. п.): захватывать звук может только окно записи. */
export function allowPermissionRequest(permission: string, from: Requester): boolean {
  return from === 'recorder' && (permission === 'media' || permission === 'display-capture');
}

/**
 * Проверки (без захвата): главное окно видит названия микрофонов в настройках,
 * окно записи — всё, что ему нужно для захвата.
 */
export function allowPermissionCheck(permission: string, from: Requester): boolean {
  if (permission !== 'media' && permission !== 'display-capture') return false;
  return from === 'recorder' || (from === 'main' && permission === 'media');
}

export interface PermissionWindows {
  main(): WebContents | null;
  recorder(): WebContents | null;
}

function requester(contents: WebContents | null, windows: PermissionWindows): Requester {
  if (contents && contents === windows.recorder()) return 'recorder';
  if (contents && contents === windows.main()) return 'main';
  return 'other';
}

/** Разрешения сессии: всё, чего не разрешили явно, запрещено. */
export function applyPermissionPolicy(session: Session, windows: PermissionWindows): void {
  session.setPermissionRequestHandler((contents, permission, callback) =>
    callback(allowPermissionRequest(permission, requester(contents, windows))),
  );
  session.setPermissionCheckHandler((contents, permission) =>
    allowPermissionCheck(permission, requester(contents, windows)),
  );
}
