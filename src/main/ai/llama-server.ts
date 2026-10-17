// Движок итогов — llama-server из llama.cpp (решения Плана 9, §4.1): отдельный процесс, запускается по первому запросу
// и держит модель в памяти видеокарты. 5 минут без запросов — завершается (видеопамять свободна); другая модель —
// перезапускается. Слушает только 127.0.0.1 со случайным ключом. Electron сюда не подключается.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { Logger } from '../logger';
import { LlmError, type LlmEndpoint } from './llm-client';

/** Сколько ждать загрузки модели в память (на медленном диске 6 ГБ читаются долго). */
export const START_TIMEOUT_MS = 2 * 60_000;
/** Сколько сервер живёт без запросов. */
export const IDLE_MS = 5 * 60_000;
/** Сколько строк вывода сервера попадает в журнал при сбое (текст встреч сервер не выводит). */
export const OUTPUT_LINES = 50;
const POLL_MS = 250;
/** Сколько ждать выхода процесса после просьбы завершиться (и ещё столько же — после принудительного завершения). */
export const EXIT_WAIT_MS = 2000;

/** Чем запускать сервер: llama-server программы или (в автотестах) поддельный сервер. */
export interface LlamaCommand {
  file: string;
  /** Параметры перед параметрами сервера (путь к скрипту поддельного сервера). */
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
}

export interface LlamaModel {
  /** Файл GGUF. */
  path: string;
  /** Окно модели в программе, «кусочков». */
  contextTokens: number;
}

export interface LlamaServerDeps {
  command(): LlamaCommand;
  logger: Pick<Logger, 'info' | 'error'>;
  startTimeoutMs?: number;
  idleMs?: number;
  /** Процесс движка запущен (номер процесса и файл) — main записывает его, чтобы убрать после падения программы. */
  onSpawn?(pid: number, file: string): void;
  /** Процесс движка вышел. */
  onExit?(): void;
}

/** Папка движка: в собранной программе — resources/llama, в разработке — vendor/llama (scripts/fetch-llama.mjs). */
export function llamaDir(env: { packaged: boolean; resourcesPath: string; appPath: string }): string {
  return env.packaged ? join(env.resourcesPath, 'llama') : join(env.appPath, 'vendor', 'llama');
}

export const llamaServerFile = (platform: string): string => (platform === 'win32' ? 'llama-server.exe' : 'llama-server');

/**
 * Параметры сервера: окно модели, внимание flash и сжатый кэш (память видеокарты), один запрос за раз, шаблон
 * модели (jinja), --fit — сам решает, сколько слоёв отдать видеокарте; не хватает памяти — часть остаётся на
 * процессоре. Ключ — не здесь, а в переменной LLAMA_API_KEY: строку запуска видят другие программы.
 */
export function llamaArgs(model: LlamaModel, port: number): string[] {
  return [
    '-m',
    model.path,
    '-c',
    String(model.contextTokens),
    '-fa',
    'on',
    '-ctk',
    'q8_0',
    '-ctv',
    'q8_0',
    '-np',
    '1',
    '--jinja',
    '--fit',
    'on',
    '--no-webui',
    '--log-colors',
    'off',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ];
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Дождаться обещания или отмены (сам запуск сервера при этом не прерывается — он пригодится следующему запросу). */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Один запуск сервера: процесс, его последние строки вывода и готовность. */
class LlamaProcess {
  child: ChildProcess | null = null;
  /** Последние строки вывода сервера — в журнал при сбое. */
  readonly output: string[] = [];
  exited = false;
  /** Завершаем сами — выход процесса не сбой. */
  stopping = false;
  readonly ready: Promise<LlmEndpoint>;

  constructor(
    readonly model: LlamaModel,
    private readonly deps: LlamaServerDeps,
  ) {
    this.ready = this.start();
    // Ошибку запуска получает тот, кто ждёт ready(); здесь — чтобы не было «необработанного отказа».
    this.ready.catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || this.exited) return;
    const exited = new Promise<boolean>((resolve) => child.once('exit', () => resolve(true)));
    child.kill();
    if (await Promise.race([exited, sleep(EXIT_WAIT_MS).then(() => false)])) return;
    // Не ответил на просьбу (на Mac — SIGTERM) — завершаем принудительно, иначе новый запуск занял бы видеопамять вторым.
    this.deps.logger.info('Движок итогов не завершился сам — завершаем принудительно');
    child.kill('SIGKILL');
    await Promise.race([exited, sleep(EXIT_WAIT_MS)]);
  }

  private keep(data: Buffer): void {
    for (const line of data.toString('utf8').split(/\r?\n/)) {
      if (line.trim() === '') continue;
      this.output.push(line);
      if (this.output.length > OUTPUT_LINES) this.output.shift();
    }
  }

  private async start(): Promise<LlmEndpoint> {
    const port = await freePort();
    // Пока искали порт, запуск отменили (выход из программы, удаление модели) — процесс не запускаем.
    if (this.stopping) throw new LlmError('engine', 'запуск движка итогов отменён');
    const apiKey = randomBytes(16).toString('hex');
    const command = this.deps.command();
    this.deps.logger.info('Движок итогов запускается');
    const child = spawn(command.file, [...command.args, ...llamaArgs(this.model, port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...(command.env ?? process.env), LLAMA_API_KEY: apiKey },
    });
    this.child = child;
    if (child.pid !== undefined) this.deps.onSpawn?.(child.pid, command.file);
    child.once('exit', () => this.deps.onExit?.());
    // Вывод читается всегда: непрочитанный заполнил бы канал, и сервер встал бы.
    child.stdout?.on('data', (data: Buffer) => this.keep(data));
    child.stderr?.on('data', (data: Buffer) => this.keep(data));
    const failed = new Promise<never>((_resolve, reject) => {
      child.once('error', (err) => {
        this.exited = true;
        reject(new LlmError('engine', 'движок итогов не запустился', { cause: err }));
      });
      child.once('exit', (code, signal) => {
        this.exited = true;
        if (this.stopping) return;
        const reason = `движок итогов завершился (код ${code ?? signal ?? '?'})`;
        this.deps.logger.error(reason, new Error(this.output.join('\n')));
        reject(new LlmError('engine', reason));
      });
    });
    // Процесс может упасть и после загрузки — это увидит запрос, который шёл к нему.
    failed.catch(() => undefined);
    const endpoint = { baseUrl: `http://127.0.0.1:${port}`, apiKey };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new LlmError('engine', 'движок итогов не загрузил модель за отведённое время')),
        this.deps.startTimeoutMs ?? START_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([failed, timeout, this.waitHealthy(endpoint)]);
    } catch (err) {
      if (!this.exited && !this.stopping) {
        this.deps.logger.error('Движок итогов не загрузил модель', new Error(this.output.join('\n')));
      }
      // Не загрузился (или запуск отменили) — процесс не оставляем: следующий запрос запустит его заново.
      void this.stop();
      throw err;
    } finally {
      clearTimeout(timer);
    }
    this.deps.logger.info('Движок итогов готов');
    return endpoint;
  }

  /** /health отвечает 200, когда модель загружена (до того — 503). */
  private async waitHealthy(endpoint: LlmEndpoint): Promise<void> {
    while (!this.exited && !this.stopping) {
      const ok = await fetch(`${endpoint.baseUrl}/health`).then(
        (response) => response.ok,
        () => false,
      );
      if (ok) return;
      await sleep(POLL_MS);
    }
    throw new LlmError('engine', 'движок итогов завершился, не загрузив модель');
  }
}

export class LlamaServer {
  private running: LlamaProcess | null = null;
  /** Завершение прежнего процесса: новый запуск ждёт его, чтобы двух серверов не было (решения Плана 8, §5.1). */
  private stopping: Promise<void> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: LlamaServerDeps) {}

  /** Сервер запущен (модель в памяти или загружается). */
  isRunning(): boolean {
    return this.running !== null && !this.running.exited;
  }

  /**
   * Сервер с этой моделью готов отвечать: запускает его (была другая модель или процесс упал — перезапускает) и ждёт,
   * пока модель загрузится. Отмена (signal) прекращает ожидание, но не запуск.
   */
  async ready(model: LlamaModel, signal?: AbortSignal): Promise<LlmEndpoint> {
    this.cancelIdle();
    if (this.stopping) await this.stopping;
    const current = this.running;
    if (current && (current.exited || current.model.path !== model.path || current.model.contextTokens !== model.contextTokens)) {
      await this.stop();
    }
    this.running ??= new LlamaProcess(model, this.deps);
    const running = this.running;
    try {
      return await untilAborted(running.ready, signal);
    } catch (err) {
      // Не загрузился — процесс уже завершается сам; забываем его, следующий запрос запустит новый.
      if (!signal?.aborted && this.running === running) await this.stop();
      throw err;
    }
  }

  /** Запрос закончился: через 5 минут без новых сервер завершится. */
  idle(): void {
    this.cancelIdle();
    if (!this.running) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.deps.logger.info('Движок итогов завершается: 5 минут без запросов');
      void this.stop();
    }, this.deps.idleMs ?? IDLE_MS);
  }

  /** Завершить сервер (выход из программы, удаление модели, простой) и дождаться выхода процесса. */
  async stop(): Promise<void> {
    this.cancelIdle();
    const running = this.running;
    this.running = null;
    if (!running) {
      await this.stopping;
      return;
    }
    const stopping = running.stop().finally(() => {
      if (this.stopping === stopping) this.stopping = null;
    });
    this.stopping = stopping;
    await stopping;
  }

  private cancelIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}
