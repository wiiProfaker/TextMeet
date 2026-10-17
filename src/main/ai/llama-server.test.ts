import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import { countTokens } from './llm-client';
import { EXIT_WAIT_MS, llamaArgs, llamaDir, LlamaServer, llamaServerFile, type LlamaServerDeps } from './llama-server';

const FAKE_SERVER = join(__dirname, '..', '..', 'test-support', 'fake-llama-server.mjs');

const servers: LlamaServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.stop()));
});

/** Сервер, который запускает поддельный llama-server (node + скрипт) и пишет его запуски в журнал. */
async function setup(env: Record<string, string> = {}, options: Partial<LlamaServerDeps> = {}) {
  const dir = makeTempDir();
  const log = join(dir, 'fake.log');
  const logger = { info: vi.fn(), error: vi.fn() };
  const server = new LlamaServer({
    command: () => ({
      file: process.execPath,
      args: [FAKE_SERVER],
      env: { ...process.env, TEXTMEET_FAKE_LLM_LOG: log, ...env },
    }),
    logger,
    ...options,
  });
  servers.push(server);
  const launches = async () =>
    (await readFile(log, 'utf8').catch(() => ''))
      .split('\n')
      .filter((line) => line.includes('"start"'))
      .map((line) => JSON.parse(line) as { args: string[]; pid: number });
  const starts = async () => (await launches()).map((l) => l.args);
  /** Процесс последнего запуска жив. */
  const lastAlive = async () => {
    const pid = (await launches()).at(-1)?.pid;
    if (pid === undefined) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  return { server, logger, starts, lastAlive };
}

const model = { path: 'M/qwen.gguf', contextTokens: 65_536 };

describe('llama-server paths and arguments', () => {
  it('finds the engine next to the packaged program or in vendor/ while developing', () => {
    expect(llamaDir({ packaged: true, resourcesPath: 'R', appPath: 'A' })).toBe(join('R', 'llama'));
    expect(llamaDir({ packaged: false, resourcesPath: 'R', appPath: 'A' })).toBe(join('A', 'vendor', 'llama'));
    expect(llamaServerFile('win32')).toBe('llama-server.exe');
    expect(llamaServerFile('darwin')).toBe('llama-server');
  });

  it('starts the engine with the settings of the plan, on 127.0.0.1, without the key on the command line', () => {
    expect(llamaArgs({ path: 'M/q.gguf', contextTokens: 40_960 }, 5000)).toEqual([
      '-m', 'M/q.gguf', '-c', '40960', '-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0', '-np', '1', '--jinja', '--fit', 'on',
      '--no-webui', '--log-colors', 'off', '--host', '127.0.0.1', '--port', '5000',
    ]);
  });
});

describe('LlamaServer', () => {
  it('starts once, waits for the model and answers with the key', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '300' });
    const endpoint = await server.ready(model);
    expect(server.isRunning()).toBe(true);
    expect(await countTokens(endpoint, 'двенадцать букв!')).toBe(4);
    await expect(countTokens({ ...endpoint, apiKey: 'чужой' }, 'x')).rejects.toMatchObject({ kind: 'engine' });
    expect(await server.ready(model)).toEqual(endpoint);
    expect(await starts()).toHaveLength(1);
  });

  it('restarts for another model or another window', async () => {
    const { server, starts } = await setup();
    const first = await server.ready(model);
    const second = await server.ready({ path: 'M/t-lite.gguf', contextTokens: 40_960 });
    expect(second.baseUrl).not.toBe(first.baseUrl);
    const args = await starts();
    expect(args).toHaveLength(2);
    expect(args[1]).toEqual(expect.arrayContaining(['M/t-lite.gguf', '40960']));
  });

  it('stops after a quiet while and starts again on the next request', async () => {
    const { server, starts, lastAlive } = await setup({}, { idleMs: 50 });
    await server.ready(model);
    server.idle();
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    await vi.waitFor(async () => expect(await lastAlive()).toBe(false));
    await server.ready(model);
    expect(await starts()).toHaveLength(2);
  });

  it('a new request cancels the stop after a quiet while', async () => {
    const { server } = await setup({}, { idleMs: 100 });
    await server.ready(model);
    server.idle();
    await server.ready(model);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(server.isRunning()).toBe(true);
  });

  it('starts again after the engine crashed', async () => {
    const { server, starts, logger } = await setup();
    const endpoint = await server.ready(model);
    // «УПАДИ» в запросе — поддельный сервер падает посреди ответа.
    await fetch(`${endpoint.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${endpoint.apiKey}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'УПАДИ' }], max_tokens: 2048 }),
    })
      .then((response) => response.text())
      .catch(() => undefined);
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('движок итогов завершился'), expect.any(Error));
    await server.ready(model);
    expect(await starts()).toHaveLength(2);
  });

  it('gives up on a model that does not load in time and leaves no process behind', async () => {
    const { server, logger, lastAlive } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '60000' }, { startTimeoutMs: 300 });
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine' });
    expect(server.isRunning()).toBe(false);
    await vi.waitFor(async () => expect(await lastAlive()).toBe(false));
    // В журнал — вывод сервера, чтобы было понятно, на чём он застрял.
    const logged = logger.error.mock.calls.find((call) => call[0] === 'Движок итогов не загрузил модель');
    expect(String((logged?.[1] as Error | undefined)?.message)).toContain('fake llama-server: loading model');
  });

  it('reports an engine that cannot be started at all', async () => {
    const server = new LlamaServer({
      command: () => ({ file: join(__dirname, 'нет-такой-программы.exe'), args: [] }),
      logger: { info: vi.fn(), error: vi.fn() },
    });
    servers.push(server);
    await expect(server.ready(model)).rejects.toMatchObject({ kind: 'engine', message: 'движок итогов не запустился' });
  });

  it('a stop right after the start leaves no process behind', async () => {
    const { server, lastAlive } = await setup();
    const starting = server.ready(model).catch(() => undefined);
    await server.stop();
    await starting;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await lastAlive()).toBe(false);
    expect(server.isRunning()).toBe(false);
  });

  it('a model that did not load in time after «Остановить» is started anew by the next request', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '60000' }, { startTimeoutMs: 300 });
    const controller = new AbortController();
    const waiting = server.ready(model, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
    // Время загрузки вышло — процесс завершается сам; следующий запрос запускает новый, а не получает старую ошибку.
    await vi.waitFor(() => expect(server.isRunning()).toBe(false));
    const next = server.ready(model).catch(() => undefined);
    await vi.waitFor(async () => expect(await starts()).toHaveLength(2));
    await next;
  });

  it('stops waiting when asked, but keeps loading the model for the next request', async () => {
    const { server, starts } = await setup({ TEXTMEET_FAKE_LLM_LOAD_MS: '300' });
    const controller = new AbortController();
    const waiting = server.ready(model, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
    expect(server.isRunning()).toBe(true);
    await server.ready(model);
    expect(await starts()).toHaveLength(1);
  });

  it('a request during the idle shutdown waits for the old process before starting a new one', async () => {
    let alive = 0;
    let maxAlive = 0;
    const spawned: number[] = [];
    const { server, logger } = await setup(
      { TEXTMEET_FAKE_LLM_EXIT_DELAY_MS: '300' },
      {
        idleMs: 10,
        onSpawn: (pid) => {
          spawned.push(pid);
          alive += 1;
          maxAlive = Math.max(maxAlive, alive);
        },
        onExit: () => {
          alive -= 1;
        },
      },
    );
    await server.ready(model);
    server.idle();
    await vi.waitFor(() => expect(logger.info).toHaveBeenCalledWith('Движок итогов завершается: 5 минут без запросов'));
    await server.ready(model);
    expect(spawned).toHaveLength(2);
    expect(maxAlive).toBe(1);
  });

  it('reports the spawned process and its exit', async () => {
    const onSpawn = vi.fn();
    const onExit = vi.fn();
    const { server } = await setup({}, { onSpawn, onExit });
    await server.ready(model);
    expect(onSpawn).toHaveBeenCalledWith(expect.any(Number), process.execPath);
    await server.stop();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it.skipIf(process.platform === 'win32')('stop kills the engine that ignores the polite request', async () => {
    const { server, lastAlive } = await setup({ TEXTMEET_FAKE_LLM_IGNORE_TERM: '1' });
    await server.ready(model);
    const started = Date.now();
    await server.stop();
    expect(Date.now() - started).toBeLessThanOrEqual(2 * EXIT_WAIT_MS + 200);
    await vi.waitFor(async () => expect(await lastAlive()).toBe(false));
  });
});
