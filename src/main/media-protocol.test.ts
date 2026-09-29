import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../test-support/temp-dir';
import { parseRange, resolveMediaPath, serveMedia } from './media-protocol';

const ID = '2026-09-28_1430_a1b2c3';
const URL_OK = `tm-media://meeting/${ID}/mix.opus`;

describe('resolveMediaPath', () => {
  it('maps a meeting mix to its file', () => {
    expect(resolveMediaPath(URL_OK, 'D:\\Lib')).toBe(join('D:\\Lib', ID, 'audio', 'mix.opus'));
  });

  it.each([
    'не адрес',
    `https://meeting/${ID}/mix.opus`,
    `tm-media://other/${ID}/mix.opus`,
    `tm-media://meeting/${ID}/mic.webm`,
    `tm-media://meeting/${ID}/../../secret.txt`,
    `tm-media://meeting/..%2F${ID}/mix.opus`,
    `tm-media://meeting/${ID}`,
    `tm-media://meeting/${ID}/audio/mix.opus`,
  ])('refuses %s', (url) => {
    expect(resolveMediaPath(url, 'D:\\Lib')).toBeNull();
  });
});

describe('parseRange', () => {
  it.each([
    [null, null],
    ['', null],
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=100-', { start: 100, end: 999 }],
    ['bytes=-100', { start: 900, end: 999 }],
    ['bytes=990-5000', { start: 990, end: 999 }],
    ['bytes=-5000', { start: 0, end: 999 }],
    ['bytes=1000-', 'invalid'],
    ['bytes=50-10', 'invalid'],
    ['bytes=-0', 'invalid'],
    ['bytes=-', null],
    ['items=0-5', null],
  ] as const)('%s → %j', (header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected);
  });
});

describe('serveMedia', () => {
  function library(content: string): string {
    const lib = makeTempDir();
    mkdirSync(join(lib, ID, 'audio'), { recursive: true });
    writeFileSync(join(lib, ID, 'audio', 'mix.opus'), content);
    return lib;
  }

  it('serves the whole file', async () => {
    const response = await serveMedia(new Request(URL_OK), library('0123456789'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/ogg');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(await response.text()).toBe('0123456789');
  });

  it('serves a byte range for seeking', async () => {
    const response = await serveMedia(new Request(URL_OK, { headers: { Range: 'bytes=2-5' } }), library('0123456789'));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(await response.text()).toBe('2345');
  });

  it('answers 416 for a range past the end', async () => {
    const response = await serveMedia(new Request(URL_OK, { headers: { Range: 'bytes=20-' } }), library('0123456789'));
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });

  it('serves an empty file', async () => {
    const response = await serveMedia(new Request(URL_OK), library(''));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('answers 404 for foreign addresses and missing files', async () => {
    expect((await serveMedia(new Request(`tm-media://meeting/${ID}/mic.webm`), library('x'))).status).toBe(404);
    expect((await serveMedia(new Request(URL_OK), makeTempDir())).status).toBe(404);
  });
});
