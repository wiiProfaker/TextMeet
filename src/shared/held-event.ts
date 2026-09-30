// Событие от main, которое может прийти раньше, чем страница на него подпишется. Без пакетов: файл подключает preload.

export interface HeldEvent<T> {
  emit(payload: T): void;
  subscribe(listener: (payload: T) => void): () => void;
}

/** Пока подписчиков нет, последнее событие держится и достаётся первому, кто подпишется. */
export function heldEvent<T>(): HeldEvent<T> {
  let listeners: readonly { listener: (payload: T) => void }[] = [];
  let held: { payload: T } | null = null;
  return {
    emit: (payload) => {
      if (listeners.length === 0) held = { payload };
      for (const { listener } of listeners) listener(payload);
    },
    subscribe: (listener) => {
      const entry = { listener };
      listeners = [...listeners, entry];
      if (held) {
        const { payload } = held;
        held = null;
        listener(payload);
      }
      return () => {
        listeners = listeners.filter((other) => other !== entry);
      };
    },
  };
}
