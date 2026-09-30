// Сообщения и закрытие процесса, который ещё запускается. У Electron utilityProcess до события spawn нет pid,
// и kill() ничего не делает: процесс, «закрытый» в первые миллисекунды, иначе запустился бы, получил команду
// и расшифровал бы встречу втихую, держа модели в памяти и файлы моделей открытыми (Windows не даст их удалить).

export interface SpawnGate<M> {
  send(message: M): void;
  kill(): void;
  /** Процесс запустился (событие spawn): false — его уже просили закрыть, он закрыт и ничего не получил. */
  started(): boolean;
}

export function spawnGate<M>(child: { postMessage(message: M): void; kill(): void }): SpawnGate<M> {
  let state: 'starting' | 'running' | 'killed' = 'starting';
  // До запуска сообщения копим.
  let pending: readonly M[] = [];
  return {
    send: (message) => {
      if (state === 'running') child.postMessage(message);
      else if (state === 'starting') pending = [...pending, message];
    },
    kill: () => {
      if (state === 'running') child.kill();
      state = 'killed';
      pending = [];
    },
    started: () => {
      if (state === 'killed') {
        child.kill();
        return false;
      }
      state = 'running';
      for (const message of pending) child.postMessage(message);
      pending = [];
      return true;
    },
  };
}
