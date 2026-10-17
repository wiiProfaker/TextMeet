// Сторож окна записи (решения Плана 8, §5.2): окно может не упасть, а зависнуть (бесконечный цикл, застрявший
// звуковой драйвер) — тогда «окно записи завершилось» не наступает. Окно каждые 2 с присылает «сердцебиение»; нет его
// 15 с — окно считается зависшим, и main перезапускает его так же, как после падения.

export { RECORDER_BEAT_MS } from '../../shared/recording';
/** Сколько тишины значит «зависло». */
export const RECORDER_HUNG_MS = 15_000;
/** Как часто сторож проверяет. */
const CHECK_MS = 1000;

export class RecorderWatchdog {
  private lastBeat = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private reported = false;
  private readonly now: () => number;
  private readonly hungMs: number;
  private readonly checkMs: number;

  constructor(private readonly deps: { onHung(): void; now?(): number; hungMs?: number; checkMs?: number }) {
    this.now = deps.now ?? Date.now;
    this.hungMs = deps.hungMs ?? RECORDER_HUNG_MS;
    this.checkMs = deps.checkMs ?? CHECK_MS;
  }

  /** Сердцебиение от окна записи. */
  beat(): void {
    this.lastBeat = this.now();
  }

  /** Следить с этого момента (окно готово); stop() — перестать (выход, окно пересоздаётся). */
  start(): void {
    this.stop();
    // Первое сердцебиение ждём hungMs от запуска.
    this.lastBeat = this.now();
    this.reported = false;
    this.timer = setInterval(() => this.check(), this.checkMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Зависание объявляется один раз на запуск окна. */
  private check(): void {
    if (this.reported || this.now() - this.lastBeat < this.hungMs) return;
    this.reported = true;
    this.stop();
    this.deps.onHung();
  }
}
