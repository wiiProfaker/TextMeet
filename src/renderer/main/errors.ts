// Electron оборачивает ошибки из main: "Error invoking remote method 'x': Error: текст".
const REMOTE_PREFIX = /^Error invoking remote method '[^']*': (?:\w*Error: )?/;

/** Текст ошибки для показа человеку, без технической обёртки Electron. */
export function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const clean = message.replace(REMOTE_PREFIX, '').trim();
  return clean || 'Неизвестная ошибка';
}
