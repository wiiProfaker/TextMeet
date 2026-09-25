import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureFile } from './download.ts';

function serve(body: Buffer): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Length': body.length });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/file.bin`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

describe('ensureFile', () => {
  let dir = '';
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'textmeet-dl-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('downloads a file into a new folder and checks its size', async () => {
    const body = Buffer.alloc(1000, 7);
    const server = await serve(body);
    try {
      const dest = path.join(dir, 'nested', 'file.bin');
      await ensureFile(dest, server.url, 1000);
      expect(fs.readFileSync(dest).equals(body)).toBe(true);
      expect(fs.existsSync(`${dest}.part`)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('rejects and leaves nothing behind when the size does not match', async () => {
    const server = await serve(Buffer.alloc(1000, 7));
    try {
      const dest = path.join(dir, 'file.bin');
      await expect(ensureFile(dest, server.url, 999)).rejects.toThrow(/Size mismatch/);
      expect(fs.existsSync(dest)).toBe(false);
      expect(fs.existsSync(`${dest}.part`)).toBe(false);
    } finally {
      await server.close();
    }
  });

  it('skips the download when the file already has the expected size', async () => {
    const dest = path.join(dir, 'ready.bin');
    fs.writeFileSync(dest, Buffer.alloc(10));
    await ensureFile(dest, 'http://127.0.0.1:1/unreachable', 10);
    expect(fs.statSync(dest).size).toBe(10);
  });
});
