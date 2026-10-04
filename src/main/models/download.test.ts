import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { DownloadError, downloadFile, sha256File } from './download';

const BODY = Buffer.from('0123456789'.repeat(1000));
const SHA = createHash('sha256').update(BODY).digest('hex');

type Behaviour = (req: IncomingMessage, res: ServerResponse, request: number) => void;

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

/** Локальный сервер: behaviour решает, что ответить на n-й запрос (с нуля). */
async function serve(behaviour: Behaviour): Promise<{ url: string; ranges: (string | undefined)[] }> {
  const ranges: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    ranges.push(req.headers.range);
    behaviour(req, res, ranges.length - 1);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/model.onnx`, ranges };
}

/** Отдаёт BODY с поддержкой Range. */
const sendBody = (req: IncomingMessage, res: ServerResponse): void => {
  const match = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
  const from = match ? Number(match[1]) : 0;
  res.writeHead(match ? 206 : 200, {
    'content-length': BODY.length - from,
    ...(match && { 'content-range': `bytes ${from}-${BODY.length - 1}/${BODY.length}` }),
  });
  res.end(BODY.subarray(from));
};

const options = (url: string, dest: string) => ({
  url,
  dest,
  size: BODY.length,
  sha256: SHA,
  retryDelayMs: 1,
  idleTimeoutMs: 300,
});

describe('downloadFile', () => {
  it('downloads, checks and renames the file', async () => {
    const { url } = await serve(sendBody);
    const dest = join(makeTempDir(), 'models', 'model.onnx');
    const progress: number[] = [];
    await downloadFile({ ...options(url, dest), onProgress: (n) => progress.push(n) });
    expect(readFileSync(dest)).toEqual(BODY);
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(progress.at(-1)).toBe(BODY.length);
  });

  it('resumes after a dropped connection instead of starting over', async () => {
    const { url, ranges } = await serve((req, res, n) => {
      if (n === 0) {
        res.writeHead(200, { 'content-length': BODY.length });
        res.write(BODY.subarray(0, 4000));
        setTimeout(() => res.destroy(), 20);
        return;
      }
      sendBody(req, res);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
    expect(ranges).toEqual([undefined, 'bytes=4000-']);
  });

  it('starts over when the server ignores Range', async () => {
    const { url } = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': BODY.length });
      res.end(BODY);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    writeFileSync(`${dest}.part`, BODY.subarray(0, 5000));
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('keeps a finished .part and only checks it', async () => {
    const { url, ranges } = await serve(sendBody);
    const dest = join(makeTempDir(), 'model.onnx');
    writeFileSync(`${dest}.part`, BODY);
    await downloadFile(options(url, dest));
    expect(ranges).toEqual([]);
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('drops a .part that is longer than the file', async () => {
    const { url } = await serve(sendBody);
    const dest = join(makeTempDir(), 'model.onnx');
    writeFileSync(`${dest}.part`, Buffer.concat([BODY, BODY]));
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('gives up after the retries when the server keeps failing', async () => {
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(503);
      res.end();
    });
    const dest = join(makeTempDir(), 'model.onnx');
    const error = await downloadFile({ ...options(url, dest), retries: 2 }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(DownloadError);
    expect(error).toMatchObject({ kind: 'network' });
    expect(ranges).toHaveLength(3);
  });

  it('does not retry a missing file and does not call it a lost connection', async () => {
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile(options(url, dest))).rejects.toMatchObject({ kind: 'server', message: 'сервер ответил 404' });
    expect(ranges).toHaveLength(1);
  });

  it('resumes a response that ended early without an error', async () => {
    const { url, ranges } = await serve((req, res, n) => {
      if (n === 0) {
        // Длина не указана — клиент не знает, что данных мало.
        res.writeHead(200);
        res.end(BODY.subarray(0, 3000));
        return;
      }
      sendBody(req, res);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
    expect(ranges).toEqual([undefined, 'bytes=3000-']);
  });

  it('breaks off a server that stops sending', async () => {
    const { url } = await serve((_req, res, n) => {
      res.writeHead(200, { 'content-length': BODY.length });
      if (n === 0) {
        res.write(BODY.subarray(0, 100));
        return; // молчит дальше
      }
      res.end(BODY);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
  });

  it('deletes a file with a wrong checksum', async () => {
    const { url } = await serve((_req, res) => {
      res.writeHead(200);
      res.end(Buffer.alloc(BODY.length, 1));
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile(options(url, dest))).rejects.toMatchObject({ kind: 'corrupt' });
    expect(existsSync(`${dest}.part`)).toBe(false);
    expect(existsSync(dest)).toBe(false);
  });

  it('stops as soon as the server sends more than the file size', async () => {
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(200);
      res.write(BODY);
      res.end(Buffer.alloc(5000, 1));
    });
    const dest = join(makeTempDir(), 'model.onnx');
    const progress: number[] = [];
    await expect(downloadFile({ ...options(url, dest), onProgress: (n) => progress.push(n) })).rejects.toMatchObject({
      kind: 'corrupt',
    });
    expect(Math.max(0, ...progress)).toBeLessThanOrEqual(BODY.length);
    expect(ranges).toHaveLength(1);
    expect(existsSync(`${dest}.part`)).toBe(false);
  });

  it('releases the request when the answer is unusable', async () => {
    const signals: AbortSignal[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      signals.push(init!.signal!);
      return new Response('нет такого файла', { status: 404 });
    }) as typeof fetch;
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile({ ...options('https://example.test/m', dest), fetch: fakeFetch })).rejects.toMatchObject({
      kind: 'server',
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(true);
  });

  it('keeps retrying while every attempt makes progress', async () => {
    // Связь рвётся после каждой 1000 байт: 10 попыток при 2 повторах — каждая продвигает файл.
    const { url, ranges } = await serve((req, res) => {
      const match = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
      const from = match ? Number(match[1]) : 0;
      res.writeHead(match ? 206 : 200, {
        'content-length': BODY.length - from,
        ...(match && { 'content-range': `bytes ${from}-${BODY.length - 1}/${BODY.length}` }),
      });
      res.write(BODY.subarray(from, from + 1000));
      setTimeout(() => res.destroy(), 20);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile({ ...options(url, dest), retries: 2, minProgressBytes: 1000 });
    expect(readFileSync(dest)).toEqual(BODY);
    expect(ranges.length).toBeGreaterThanOrEqual(10);
  });

  it('does not count a trickle as progress', async () => {
    // Каждая попытка приносит 100 байт — меньше порога: повторы расходуются, как при полном обрыве.
    const { url, ranges } = await serve((req, res) => {
      const match = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
      const from = match ? Number(match[1]) : 0;
      res.writeHead(match ? 206 : 200, {
        'content-length': BODY.length - from,
        ...(match && { 'content-range': `bytes ${from}-${BODY.length - 1}/${BODY.length}` }),
      });
      res.write(BODY.subarray(from, from + 100));
      setTimeout(() => res.destroy(), 20);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile({ ...options(url, dest), retries: 2, minProgressBytes: 1000 })).rejects.toMatchObject({
      kind: 'network',
    });
    expect(ranges).toHaveLength(3);
  });

  it('does not count a restart from zero as progress', async () => {
    // Сервер не умеет Range: каждая попытка качает с нуля и обрывается чуть дальше прежнего (на 300 байт).
    const { url, ranges } = await serve((_req, res, n) => {
      res.writeHead(200, { 'content-length': BODY.length });
      res.write(BODY.subarray(0, 3000 + 300 * n));
      setTimeout(() => res.destroy(), 20);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile({ ...options(url, dest), retries: 2, minProgressBytes: 1000 })).rejects.toMatchObject({
      kind: 'network',
    });
    // Первая попытка (3000 байт с нуля) — продвижение, дальше +300 байт сверх достигнутого не считаются.
    expect(ranges).toHaveLength(4);
  });

  it('starts over when a resumed answer begins at another place', async () => {
    const { url, ranges } = await serve((req, res, n) => {
      if (n === 0) {
        res.writeHead(200, { 'content-length': BODY.length });
        res.write(BODY.subarray(0, 4000));
        setTimeout(() => res.destroy(), 20);
        return;
      }
      if (req.headers.range) {
        // Сервер отдал кусок не с того места, что просили.
        res.writeHead(206, { 'content-range': `bytes 2000-${BODY.length - 1}/${BODY.length}` });
        res.end(BODY.subarray(2000));
        return;
      }
      sendBody(req, res);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await downloadFile(options(url, dest));
    expect(readFileSync(dest)).toEqual(BODY);
    expect(ranges).toEqual([undefined, 'bytes=4000-', undefined]);
  });

  it('reports a disk problem without retrying', async () => {
    const { url, ranges } = await serve(sendBody);
    const blocker = join(makeTempDir(), 'file');
    writeFileSync(blocker, 'not a folder');
    await expect(downloadFile(options(url, join(blocker, 'model.onnx')))).rejects.toMatchObject({ kind: 'disk' });
    expect(ranges).toEqual([]);
  });

  it('stops a running download when cancelled and keeps the part', async () => {
    const controller = new AbortController();
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(200, { 'content-length': BODY.length });
      // Часть файла — и сервер замолкает: отмену прерывает ожидание, а не сторож тишины.
      res.write(BODY.subarray(0, 4000));
    });
    const dest = join(makeTempDir(), 'model.onnx');
    const download = downloadFile({
      ...options(url, dest),
      idleTimeoutMs: 60_000,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(download).rejects.toMatchObject({ kind: 'cancelled' });
    expect(ranges).toHaveLength(1);
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.part`)).toBe(true);
  });

  it('does not wait for the next attempt once cancelled', async () => {
    const controller = new AbortController();
    const { url, ranges } = await serve((_req, res, n) => {
      res.writeHead(500);
      res.end();
      if (n === 0) setTimeout(() => controller.abort(), 20);
    });
    const dest = join(makeTempDir(), 'model.onnx');
    const started = Date.now();
    const download = downloadFile({ ...options(url, dest), retryDelayMs: 60_000, signal: controller.signal });
    await expect(download).rejects.toMatchObject({ kind: 'cancelled' });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(ranges).toHaveLength(1);
  });

  it('does not start when already cancelled', async () => {
    const { url, ranges } = await serve(sendBody);
    const controller = new AbortController();
    controller.abort();
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile({ ...options(url, dest), signal: controller.signal })).rejects.toMatchObject({ kind: 'cancelled' });
    expect(ranges).toEqual([]);
  });
});

describe('sha256File', () => {
  it('hashes a file', async () => {
    const file = join(makeTempDir(), 'x');
    writeFileSync(file, BODY);
    expect(await sha256File(file)).toBe(SHA);
  });
});
