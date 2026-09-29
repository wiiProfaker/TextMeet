import { createReadStream, promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { MEETING_ID_PATTERN } from '../shared/meeting';
import { MIX_FILE } from '../shared/recording';
import { AUDIO_DIR } from './library/library';

/** Схема, по которой плеер главного окна получает звук встречи: tm-media://meeting/<id>/mix.opus */
export const MEDIA_SCHEME = 'tm-media';
const HOST = 'meeting';
/** Какие файлы папки audio/ можно отдавать. */
const SERVED_FILES = new Set([MIX_FILE]);

/** Файл встречи по адресу; null — адрес чужой или ведёт куда не положено. */
export function resolveMediaPath(url: string, libraryDir: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${MEDIA_SCHEME}:` || parsed.hostname !== HOST) return null;
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [id, file] = parts as [string, string];
  if (!MEETING_ID_PATTERN.test(id) || !SERVED_FILES.has(file)) return null;
  return join(libraryDir, id, AUDIO_DIR, file);
}

export type ByteRange = { start: number; end: number };

/** Заголовок Range → отрезок байт; null — отдать весь файл; 'invalid' — отрезок за пределами файла. */
export function parseRange(header: string | null, size: number): ByteRange | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null;
  const [, from = '', to = ''] = match;
  let start: number;
  let end: number;
  if (from === '') {
    const suffix = Number(to);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

/** Ответ на запрос плеера: весь файл или отрезок (206) — без отрезков нельзя перематывать. */
export async function serveMedia(request: Request, libraryDir: string): Promise<Response> {
  const file = resolveMediaPath(request.url, libraryDir);
  if (!file) return new Response(null, { status: 404 });
  const stats = await fsp.stat(file).catch(() => null);
  if (!stats?.isFile()) return new Response(null, { status: 404 });

  const size = stats.size;
  const range = parseRange(request.headers.get('range'), size);
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const headers: Record<string, string> = {
    'Content-Type': 'audio/ogg',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(size === 0 ? 0 : end - start + 1),
  };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const body = size === 0 ? null : (Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>);
  return new Response(body, { status: range ? 206 : 200, headers });
}
