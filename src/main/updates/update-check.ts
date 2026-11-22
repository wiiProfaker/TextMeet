// «Вышла новая версия» (решения Плана 8, §4.4): раз в сутки (первый раз — через минуту после запуска) программа тихо
// спрашивает GitHub о последнем опубликованном выпуске. Новее нынешней — окно показывает плашку «Скачать». Любая
// ошибка (нет интернета; закрытый репозиторий — 404; ограничение частоты — 403) — только строка в журнале. В запросе
// нет ничего о человеке: адрес выпусков и заголовки User-Agent/Accept.
import type { AvailableUpdate } from '../../shared/update';
import type { Logger } from '../logger';

export type { AvailableUpdate };

export const RELEASES_REPO = 'wiiProfaker/TextMeet';
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`;
export const RELEASES_PAGE_PREFIX = `https://github.com/${RELEASES_REPO}/releases/`;
export const FIRST_CHECK_MS = 60_000;
export const CHECK_EVERY_MS = 24 * 60 * 60_000;

/** «v1.2.3» или «1.2.3» → [1, 2, 3]; с хвостом («-beta») или иное → null. */
export function parseVersion(text: string): readonly [number, number, number] | null {
  const match = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

/** Ссылка ведёт на страницу выпусков нашего репозитория (без «..», без чужого сайта). */
function releasePage(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith(RELEASES_PAGE_PREFIX)) return null;
  const rest = url.slice(RELEASES_PAGE_PREFIX.length);
  return /^[\w./-]*$/.test(rest) && !rest.split('/').includes('..') ? url : null;
}

/** Ответ GitHub → новая версия или null (не новее, черновик, предварительная, ссылка не на страницу выпусков). */
export function updateFromRelease(body: unknown, current: string): AvailableUpdate | null {
  if (typeof body !== 'object' || body === null) return null;
  const release = body as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };
  if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string') return null;
  const version = parseVersion(release.tag_name);
  const url = releasePage(release.html_url);
  if (!version || !url || !isNewer(release.tag_name, current)) return null;
  return { version: version.join('.'), url };
}

export interface UpdateCheckerDeps {
  current: string;
  /** LATEST_RELEASE_URL; в автотестах — TEXTMEET_TEST_UPDATE_URL из testEnv. */
  url: string;
  fetchJson(url: string): Promise<unknown>;
  /** settings.checkUpdates */
  enabled(): boolean;
  onFound(update: AvailableUpdate | null): void;
  logger: Pick<Logger, 'info' | 'warn'>;
  firstDelayMs?: number;
  everyMs?: number;
}

export class UpdateChecker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest: AvailableUpdate | null = null;

  constructor(private readonly deps: UpdateCheckerDeps) {}

  start(): void {
    this.schedule(this.deps.firstDelayMs ?? FIRST_CHECK_MS);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  found(): AvailableUpdate | null {
    return this.latest;
  }

  private schedule(ms: number): void {
    this.stop();
    this.timer = setTimeout(() => {
      void this.check().finally(() => this.schedule(this.deps.everyMs ?? CHECK_EVERY_MS));
    }, ms);
    this.timer.unref?.();
  }

  private async check(): Promise<void> {
    if (!this.deps.enabled()) return;
    let body: unknown;
    try {
      body = await this.deps.fetchJson(this.deps.url);
    } catch (err) {
      this.deps.logger.warn('Проверка новой версии не удалась', err);
      return;
    }
    const update = updateFromRelease(body, this.deps.current);
    if (update) this.deps.logger.info(`Вышла версия ${update.version}`);
    this.latest = update;
    this.deps.onFound(update);
  }
}

/** Что показать окну: найденная версия, если проверка включена и про эту версию не нажимали «Скрыть». */
export function visibleUpdate(
  found: AvailableUpdate | null,
  settings: { checkUpdates: boolean; dismissedUpdate: string | null },
): AvailableUpdate | null {
  if (!found || !settings.checkUpdates || settings.dismissedUpdate === found.version) return null;
  return found;
}
