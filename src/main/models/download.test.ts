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
  res.writeHead(match ? 206 : 200, { 'content-length': BODY.length - from });
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

  it('does not retry a missing file', async () => {
    const { url, ranges } = await serve((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const dest = join(makeTempDir(), 'model.onnx');
    await expect(downloadFile(options(url, dest))).rejects.toMatchObject({ kind: 'network', message: 'сервер ответил 404' });
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

  it('reports a disk problem without retrying', async () => {
    const { url, ranges } = await serve(sendBody);
    const blocker = join(makeTempDir(), 'file');
    writeFileSync(blocker, 'not a folder');
    await expect(downloadFile(options(url, join(blocker, 'model.onnx')))).rejects.toMatchObject({ kind: 'disk' });
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
