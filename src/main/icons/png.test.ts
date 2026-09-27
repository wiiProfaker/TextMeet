import { crc32, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng } from './png';

function readChunks(png: Buffer): { type: string; data: Buffer; crcOk: boolean }[] {
  const chunks = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    const crc = png.readUInt32BE(offset + 8 + length);
    chunks.push({ type, data, crcOk: crc === crc32(png.subarray(offset + 4, offset + 8 + length)) });
    offset += 12 + length;
  }
  return chunks;
}

describe('encodePng', () => {
  const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 1, 2, 3, 4]);

  it('writes the signature and IHDR/IDAT/IEND chunks with valid CRCs', () => {
    const png = encodePng(2, 2, rgba);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const ihdr = chunks[0]!.data;
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9]]).toEqual([2, 2, 8, 6]);
  });

  it('stores every row with filter byte 0 followed by the pixels', () => {
    const idat = readChunks(encodePng(2, 2, rgba))[1]!.data;
    const raw = inflateSync(idat);
    expect([...raw]).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8, 16)]);
  });

  it('rejects a pixel buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(15))).toThrow(RangeError);
  });

  it('rejects zero or fractional sizes', () => {
    expect(() => encodePng(0, 1, new Uint8Array(0))).toThrow(RangeError);
    expect(() => encodePng(1.5, 1, new Uint8Array(6))).toThrow(RangeError);
  });
});
