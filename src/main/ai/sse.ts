// Поток ответа llama-server (Server-Sent Events): строки «data: {…}», между событиями — пустая строка, в конце —
// «data: [DONE]». Чистая функция: разбирает накопленный текст, незаконченную строку оставляет до следующего куска.
export interface SseChunk {
  /** Новый кусок текста ответа (может быть пустым). */
  text: string;
  /** Почему ответ закончился («stop», «length»); null — ещё пишется. */
  finishReason: string | null;
  /** «data: [DONE]» — поток окончен. */
  done: boolean;
}

interface StreamEvent {
  choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[];
  error?: { message?: unknown };
}

export function parseSse(buffer: string): { chunks: SseChunk[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const chunks: SseChunk[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice('data:'.length).trim();
    if (payload === '[DONE]') {
      chunks.push({ text: '', finishReason: null, done: true });
      continue;
    }
    const event = JSON.parse(payload) as StreamEvent;
    if (event.error) throw new Error(`движок сообщил об ошибке: ${String(event.error.message ?? 'без описания')}`);
    const choice = event.choices?.[0];
    const content = choice?.delta?.content;
    const finish = choice?.finish_reason;
    chunks.push({
      text: typeof content === 'string' ? content : '',
      finishReason: typeof finish === 'string' ? finish : null,
      done: false,
    });
  }
  return { chunks, rest };
}
