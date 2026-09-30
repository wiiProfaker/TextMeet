import { Notification } from 'electron';
import type { Logger } from './logger';
import type { NotificationText } from './texts';

export interface NotifierDeps {
  logger: Logger;
  /** Щелчок по уведомлению открывает окно. */
  openWindow(): void;
  /** Главное окно на экране и в фокусе — уведомления «только если не смотрят» не нужны. */
  isWindowActive(): boolean;
}

/** onClick — что сделать после открытия окна (например, показать встречу). */
export type Notify = (text: NotificationText, onlyWhenAway?: boolean, onClick?: () => void) => void;

export function createNotifier(deps: NotifierDeps): Notify {
  // Держим ссылки, пока уведомление на экране: иначе сборщик мусора уберёт его вместе с обработчиком щелчка.
  const shown = new Set<Notification>();
  return (text, onlyWhenAway = false, onClick) => {
    if (onlyWhenAway && deps.isWindowActive()) return;
    if (!Notification.isSupported()) {
      deps.logger.warn(`Уведомления не поддерживаются: ${text.title}`);
      return;
    }
    const notification = new Notification({ title: text.title, body: text.body, silent: text.silent ?? false });
    shown.add(notification);
    notification.on('click', () => {
      deps.openWindow();
      onClick?.();
    });
    notification.on('close', () => shown.delete(notification));
    notification.on('failed', (_event, error) => {
      shown.delete(notification);
      deps.logger.warn(`Уведомление не показано: ${error}`);
    });
    notification.show();
  };
}
