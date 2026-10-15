// Поддельный llama-server — только для автотестов: модульных (src/main/ai) и сквозных (TEXTMEET_TEST_LLM). Понимает
// те же параметры запуска (--port, -c, ключ в LLAMA_API_KEY) и отвечает так же: /health, /tokenize, поток /v1/chat/completions.
// Ответ — по заданию в конце сообщения (после «---»): на вопрос (ответ до 1024 «кусочков») — «Ответ: <вопрос>»,
// иначе — итоги в разметке.
// Особые слова в задании или тексте: «УПАДИ» — процесс падает посреди ответа; «ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА» — /tokenize
// насчитывает миллион «кусочков». Переменные: TEXTMEET_FAKE_LLM_LOAD_MS — сколько «грузится модель» (по умолчанию 50),
// TEXTMEET_FAKE_LLM_TOKEN_MS — пауза между кусками ответа (по умолчанию 20), TEXTMEET_FAKE_LLM_LOG — файл, куда
// дописываются параметры запуска и запросы (по строке JSON).
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const arg = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const port = Number(arg('--port'));
// Ключ, как у настоящего сервера, — в переменной LLAMA_API_KEY.
const apiKey = process.env.LLAMA_API_KEY;
const loadMs = Number(process.env.TEXTMEET_FAKE_LLM_LOAD_MS ?? 50);
const tokenMs = Number(process.env.TEXTMEET_FAKE_LLM_TOKEN_MS ?? 20);
const logFile = process.env.TEXTMEET_FAKE_LLM_LOG;

const log = (entry) => {
  if (logFile) appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
};
log({ kind: 'start', args, pid: process.pid });
process.stderr.write('fake llama-server: loading model\n');

let loaded = false;
setTimeout(() => {
  loaded = true;
  process.stderr.write('fake llama-server: model loaded\n');
}, loadMs);

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

function answerFor(content, question) {
  const at = content.lastIndexOf('\n---\n');
  const task = at === -1 ? content : content.slice(at + 5);
  const text = at === -1 ? '' : content.slice(0, at);
  if (question) return `Ответ: ${task.trim()}`;
  const lines = text.split('\n').filter((line) => line.trim() !== '').length;
  return `### Главное\n- Встреча прочитана: ${lines} строк.\n- **Задание:** ${task.split('\n')[0].slice(0, 60)}\n\n### Задачи\n1. Проверить *итоги*.`;
}

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    json(res, loaded ? 200 : 503, loaded ? { status: 'ok' } : { error: { message: 'Loading model' } });
    return;
  }
  if (req.headers.authorization !== `Bearer ${apiKey}`) {
    json(res, 401, { error: { message: 'Invalid API Key' } });
    return;
  }
  const body = await readBody(req);
  if (req.url === '/tokenize') {
    const content = String(body.content ?? '');
    const count = content.includes('ОЧЕНЬ_ДЛИННАЯ_ВСТРЕЧА') ? 1_000_000 : Math.ceil(content.length / 4);
    json(res, 200, { tokens: Array.from({ length: Math.min(count, 1_000_000) }, () => 1) });
    return;
  }
  if (req.url === '/v1/chat/completions') {
    log({ kind: 'chat', body });
    const content = String(body.messages?.at(-1)?.content ?? '');
    const answer = answerFor(content, Number(body.max_tokens) <= 1024);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    let closed = false;
    res.on('close', () => (closed = true));
    const pieces = answer.match(/\S+\s*|\s+/g) ?? [];
    for (const [i, piece] of pieces.entries()) {
      if (closed) return;
      if (i === 3 && content.includes('УПАДИ')) process.exit(3);
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece }, finish_reason: null }] })}\n\n`);
      await new Promise((resolve) => setTimeout(resolve, tokenMs));
    }
    res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n');
    return;
  }
  json(res, 404, { error: { message: 'Not found' } });
});

server.listen(port, '127.0.0.1');
