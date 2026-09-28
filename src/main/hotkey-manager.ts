import { checkAccelerator, defaultHotkey, formatHotkey } from '../shared/hotkey';

/** То, что нужно от Electron globalShortcut (подменяется в тестах). */
export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export type HotkeyChangeResult = { ok: true } | { ok: false; message: string };

/**
 * Глобальная горячая клавиша записи: регистрация при запуске, замена с откатом на прежнюю,
 * временное снятие, пока в настройках вводят новую комбинацию.
 */
export class HotkeyManager {
  private current: string;
  private registered = false;
  private suspended = false;

  constructor(
    private readonly registry: ShortcutRegistry,
    private readonly platform: string,
    private readonly onPress: () => void,
  ) {
    this.current = defaultHotkey(platform);
  }

  /** Регистрирует сохранённую комбинацию; неправильная сохранённая заменяется стандартной (invalid: true). */
  init(saved: string | null): { invalid: boolean } {
    const invalid = saved !== null && !checkAccelerator(saved, this.platform).ok;
    this.current = saved === null || invalid ? defaultHotkey(this.platform) : saved;
    this.registered = this.tryRegister(this.current);
    return { invalid };
  }

  get accelerator(): string {
    return this.current;
  }

  get label(): string {
    return formatHotkey(this.current, this.platform);
  }

  get isDefault(): boolean {
    return this.current === defaultHotkey(this.platform);
  }

  /** Не удалось зарегистрировать — комбинацию держит другая программа. Во время паузы не считается. */
  get busy(): boolean {
    return !this.suspended && !this.registered;
  }

  /** Новая комбинация (null — стандартная). Не вышло — остаётся прежняя. */
  change(next: string | null): HotkeyChangeResult {
    const target = next ?? defaultHotkey(this.platform);
    const check = checkAccelerator(target, this.platform);
    if (!check.ok) return check;
    if (target === this.current && this.registered) return { ok: true };

    const previous = this.current;
    this.release();
    // Пробуем зарегистрировать и во время паузы: так сразу видно, что комбинацию держит другая программа.
    if (this.tryRegister(target)) {
      this.current = target;
      this.registered = true;
      if (this.suspended) this.release();
      return { ok: true };
    }
    this.registered = !this.suspended && this.tryRegister(previous);
    return {
      ok: false,
      message: `${formatHotkey(target, this.platform)} занята другой программой. Осталась прежняя: ${formatHotkey(previous, this.platform)}.`,
    };
  }

  /** Пока пользователь вводит новую комбинацию, действующая не должна срабатывать. */
  suspend(suspended: boolean): void {
    if (suspended === this.suspended) return;
    this.suspended = suspended;
    if (suspended) this.release();
    else this.registered = this.tryRegister(this.current);
  }

  dispose(): void {
    this.release();
  }

  private release(): void {
    if (!this.registered) return;
    this.registry.unregister(this.current);
    this.registered = false;
  }

  private tryRegister(accelerator: string): boolean {
    try {
      return this.registry.register(accelerator, this.onPress);
    } catch {
      // Electron бросает исключение на комбинациях, которые не умеет разобрать.
      return false;
    }
  }
}
