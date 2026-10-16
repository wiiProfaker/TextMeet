import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { countTokens, LlmError, streamChat, type LlmEndpoint } from './llm-client';

type Handler = (req: IncomingMessage, body: Record<string, unknown>, res: ServerResponse) => void;

let server: Server | null = null;

afterEach(async () => {
  const running = server;
  server = null;
  if (running) await new Promise((resolve) => running.close(resolve));
});

/** Сервер на случайном порту; handler получает разобранное тело запроса. */
async function serve(handler: Handler): Promise<LlmEndpoint> {
  const created = createServer((req, res) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => handler(req, data ? (JSON.parse(data) as Record<string, unknown>) : {}, res));
  });
  server = created;
  await new Promise<void>((resolve) => created.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${(created.address() as AddressInfo).port}`, apiKey: 'k' };
}

const sse = (content: string, finish: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`;

const noText = { onText: () => undefined };

describe('countTokens', () => {
  it('asks the engine with the key and counts its tokens', async () => {
    let auth: string | undefined;
    const endpoint = await serve((req, body, res) => {
      auth = req.headers.authorization;
      res.end(JSON.stringify({ tokens: String(body.content).split(' ') }));
    });
    expect(await countTokens(endpoint, 'раз два три')).toBe(3);
    expect(auth).toBe('Bearer k');
  });

  it('fails clearly on a wrong answer', async () => {
    const endpoint = await serve((_req, _body, res) => res.end('{"nope":1}'));
    await expect(countTokens(endpoint, 'x')).rejects.toMatchObject({ kind: 'engine' });
  });

  it('reports an engine that is not there', async () => {
    await expect(countTokens({ baseUrl: 'http://127.0.0.1:9', apiKey: 'k' }, 'x')).rejects.toMatchObject({ kind: 'engine' });
  });
});

describe('streamChat', () => {
  it('sends the settings of the plan and passes the answer on piece by piece', async () => {
    let sent: Record<string, unknown> = {};
    const endpoint = await serve((_req, body, res) => {
      sent = body;
      res.write(sse('Ито'));
      res.write(sse('ги', 'stop'));
      res.end('data: [DONE]\n\n');
    });
    const pieces: string[] = [];
    const result = await streamChat(
      endpoint,
      { messages: [{ role: 'user', content: 'текст' }], maxTokens: 2048 },
      { onText: (text) => pieces.push(text) },
    );
    expect(pieces).toEqual(['Ито', 'ги']);
    expect(result.finishReason).toBe('stop');
    expect(sent).toMatchObject({
      messages: [{ role: 'user', content: 'текст' }],
      stream: true,
      max_tokens: 2048,
      temperature: 0.3,
      cache_prompt: true,
      chat_template_kwargs: { enable_thinking: false },
    });
  });

  it('tells a meeting too long for the window apart from other refusals', async () => {
    const endpoint = await serve((_req, _body, res) => {
      res.statusCode = 400;
      res.end('{"error":{"message":"the request exceeds the available context size"}}');
    });
    await expect(streamChat(endpoint, { messages: [], maxTokens: 1 }, noText)).rejects.toMatchObject({ kind: 'too-long' });
  });

  it('reports an engine that answers with an error', async () => {
    const endpoint = await serve((_req, _body, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    const error = await streamChat(endpoint, { messages: [], maxTokens: 1 }, noText).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind: 'engine', message: 'движок итогов ответил 500: boom' });
  });

  it('reports an answer that breaks off', async () => {
    const endpoint = await serve((_req, _body, res) => {
      res.write(sse('на'));
      setTimeout(() => res.socket?.destroy(), 20);
    });
    await expect(streamChat(endpoint, { messages: [], maxTokens: 1 }, noText)).rejects.toMatchObject({ kind: 'engine' });
  });

  it('stops when the request is cancelled, without calling it a failure', async () => {
    const endpoint = await serve((_req, _body, res) => res.write(sse('пишу')));
    const controller = new AbortController();
    const done = streamChat(endpoint, { messages: [], maxTokens: 1 }, { signal: controller.signal, onText: () => controller.abort() });
    const error = await done.catch((err: unknown) => err);
    expect(error).not.toBeInstanceOf(LlmError);
    expect(controller.signal.aborted).toBe(true);
  });
});
