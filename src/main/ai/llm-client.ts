// Запросы к llama-server (решения Плана 9, §4.1): сколько «кусочков» в тексте (/tokenize) и ответ потоком
// (/v1/chat/completions). Сервер слушает только 127.0.0.1 и пускает только со своим случайным ключом.
import { z } from 'zod';
import { parseSse } from './sse';

export interface LlmEndpoint {
  baseUrl: string;
  apiKey: string;
}

/** engine — движок не ответил или ответил ошибкой; too-long — встреча не поместилась в окно модели. */
export type LlmErrorKind = 'engine' | 'too-long';

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'LlmError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Предел длины ответа, «кусочков». */
  maxTokens: number;
}

/** «Температура» ответа: ниже — суше и ближе к тексту встречи (решения Плана 9, §4.1). */
const TEMPERATURE = 0.3;
const TokenizeSchema = z.object({ tokens: z.array(z.unknown()) });

async function post(endpoint: LlmEndpoint, path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${endpoint.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify(body),
      ...(signal && { signal }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new LlmError('engine', 'движок итогов не ответил', { cause: err });
  }
  if (response.ok) return response;
  const text = await response.text().catch(() => '');
  // Встреча оказалась длиннее окна, хоть и прошла проверку длины (шаблон модели добавил своё).
  if (response.status === 400 && /context/i.test(text)) {
    throw new LlmError('too-long', 'встреча не поместилась в окно модели');
  }
  throw new LlmError('engine', `движок итогов ответил ${response.status}: ${text.slice(0, 500)}`);
}

/** Сколько «кусочков» (токенов) в тексте — считает сам движок, словарём модели. */
export async function countTokens(endpoint: LlmEndpoint, content: string, signal?: AbortSignal): Promise<number> {
  const response = await post(endpoint, '/tokenize', { content }, signal);
  const parsed = TokenizeSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new LlmError('engine', 'движок итогов прислал неверный ответ на /tokenize');
  return parsed.data.tokens.length;
}

export interface StreamOptions {
  signal?: AbortSignal;
  /** Новый кусок текста ответа. */
  onText(text: string): void;
}

/**
 * Ответ потоком: куски — в onText по мере написания; в конце — почему ответ закончился («stop», «length»). Отмена
 * (signal) обрывает соединение — сервер перестаёт писать.
 */
export async function streamChat(
  endpoint: LlmEndpoint,
  request: ChatRequest,
  options: StreamOptions,
): Promise<{ finishReason: string | null }> {
  const response = await post(
    endpoint,
    '/v1/chat/completions',
    {
      messages: request.messages,
      stream: true,
      max_tokens: request.maxTokens,
      temperature: TEMPERATURE,
      // Встреча — в начале запроса: у вопроса после итогов та же начальная часть, и движок не перечитывает встречу.
      cache_prompt: true,
      // «Размышления» вслух (Qwen3.5, T-lite) выключены: итоги нужны сразу.
      chat_template_kwargs: { enable_thinking: false },
    },
    options.signal,
  );
  if (!response.body) throw new LlmError('engine', 'движок итогов прислал пустой ответ');
  const decoder = new TextDecoder();
  let rest = '';
  let finishReason: string | null = null;
  try {
    for await (const piece of response.body) {
      rest += decoder.decode(piece, { stream: true });
      const parsed = parseSse(rest);
      rest = parsed.rest;
      for (const chunk of parsed.chunks) {
        if (chunk.text) options.onText(chunk.text);
        if (chunk.finishReason) finishReason = chunk.finishReason;
      }
    }
  } catch (err) {
    if (options.signal?.aborted || err instanceof LlmError) throw err;
    throw new LlmError('engine', 'ответ движка итогов оборвался', { cause: err });
  }
  return { finishReason };
}
