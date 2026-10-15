import { describe, expect, it } from 'vitest';
import { parseSse } from './sse';

const event = (content: string, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;

describe('parseSse', () => {
  it('reads the pieces of the answer and keeps an unfinished line for later', () => {
    const whole = event('При') + event('вет');
    const cut = whole.length - 10;
    const first = parseSse(whole.slice(0, cut));
    expect(first.chunks.map((c) => c.text)).toEqual(['При']);
    const second = parseSse(first.rest + whole.slice(cut));
    expect(second.chunks.map((c) => c.text)).toEqual(['вет']);
    expect(second.rest).toBe('');
  });

  it('notices why the answer ended and the end of the stream', () => {
    const { chunks } = parseSse(`${event('', 'length')}data: [DONE]\n\n`);
    expect(chunks).toEqual([
      { text: '', finishReason: 'length', done: false },
      { text: '', finishReason: null, done: true },
    ]);
  });

  it('skips other lines and Windows line ends', () => {
    const { chunks } = parseSse(`: ping\r\n${event('а').replace('\n\n', '\r\n\r\n')}`);
    expect(chunks.map((c) => c.text)).toEqual(['а']);
  });

  it('turns an error event of the engine into an error', () => {
    expect(() => parseSse('data: {"error":{"message":"out of memory"}}\n')).toThrow('out of memory');
  });
});
