import { describe, expect, it } from 'vitest';
import { spawnGate } from './spawn-gate';

function fakeProcess() {
  const posted: string[] = [];
  let kills = 0;
  return {
    posted,
    kills: () => kills,
    process: {
      postMessage: (message: string) => posted.push(message),
      kill: () => {
        kills++;
      },
    },
  };
}

describe('spawnGate', () => {
  it('holds messages until the process has started, then sends them in order', () => {
    const fake = fakeProcess();
    const gate = spawnGate<string>(fake.process);
    gate.send('a');
    gate.send('b');
    expect(fake.posted).toEqual([]);
    expect(gate.started()).toBe(true);
    expect(fake.posted).toEqual(['a', 'b']);
    gate.send('c');
    expect(fake.posted).toEqual(['a', 'b', 'c']);
  });

  it('kills a running process right away', () => {
    const fake = fakeProcess();
    const gate = spawnGate<string>(fake.process);
    gate.started();
    gate.kill();
    expect(fake.kills()).toBe(1);
  });

  it('kills a process asked to close before it started and sends it nothing', () => {
    const fake = fakeProcess();
    const gate = spawnGate<string>(fake.process);
    gate.send('transcribe');
    gate.kill();
    // До запуска kill() процесса ничего не делает — не зовём зря.
    expect(fake.kills()).toBe(0);
    expect(gate.started()).toBe(false);
    expect(fake.kills()).toBe(1);
    expect(fake.posted).toEqual([]);
  });

  it('drops messages sent after the kill', () => {
    const fake = fakeProcess();
    const gate = spawnGate<string>(fake.process);
    gate.kill();
    gate.send('late');
    gate.started();
    expect(fake.posted).toEqual([]);
  });
});
