import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { modelFile, type ModelEntry } from './models.ts';

export type Progress = (doneBytes: number, totalBytes: number) => void;

export async function ensureFile(dest: string, url: string, size: number, onProgress?: Progress): Promise<void> {
  const existing = await fsp.stat(dest).catch(() => null);
  if (existing?.size === size) return;

  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const partial = `${dest}.part`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}: ${url}`);
  }
  let done = 0;
  const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    done += chunk.length;
    onProgress?.(done, size);
  });
  await pipeline(body, fs.createWriteStream(partial));

  const got = (await fsp.stat(partial)).size;
  if (got !== size) {
    await fsp.rm(partial, { force: true });
    throw new Error(`Size mismatch for ${path.basename(dest)}: expected ${size}, got ${got}`);
  }
  await fsp.rename(partial, dest);
}

export async function ensureModel(entry: ModelEntry, log: (msg: string) => void = console.log): Promise<void> {
  for (const file of entry.files) {
    let nextReport = 0.1;
    await ensureFile(modelFile(entry, file.name), file.url, file.size, (done, total) => {
      if (done / total >= nextReport) {
        log(`  ${file.name}: ${Math.round((done / total) * 100)}%`);
        nextReport += 0.1;
      }
    });
  }
}
