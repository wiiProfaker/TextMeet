import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeTempDir } from '../../test-support/temp-dir';
import {
  clearEnginePid,
  killOrphanEngine,
  parseTasklistImage,
  recordEnginePid,
  sameEngine,
  type EnginePidDeps,
} from './engine-pid';

const pidDeps = (over: Partial<EnginePidDeps> = {}): EnginePidDeps => ({
  pidFile: join(makeTempDir(), 'llama-server.pid'),
  platform: 'win32',
  processImage: async () => null,
  kill: () => {},
  logger: { info: () => {}, warn: () => {} },
  ...over,
});

describe('engine pid file', () => {
  it('parseTasklistImage reads the image name and ignores "no tasks" lines', () => {
    expect(parseTasklistImage('"llama-server.exe","4242","Console","1","812 345 K"')).toBe('llama-server.exe');
    expect(parseTasklistImage('INFO: No tasks are running which match the specified criteria.')).toBeNull();
    expect(parseTasklistImage('')).toBeNull();
  });

  it('sameEngine compares the file name on Windows and the full path elsewhere', () => {
    expect(sameEngine('LLAMA-SERVER.EXE', 'C:\\x\\llama-server.exe', 'win32')).toBe(true);
    expect(sameEngine('chrome.exe', 'C:\\x\\llama-server.exe', 'win32')).toBe(false);
    expect(sameEngine('/A/llama-server', '/A/llama-server', 'darwin')).toBe(true);
    expect(sameEngine('/B/llama-server', '/A/llama-server', 'darwin')).toBe(false);
  });

  it('killOrphanEngine kills our engine left from the previous run and removes the pid file', async () => {
    const killed: number[] = [];
    const deps = pidDeps({ processImage: async () => 'LLAMA-SERVER.EXE', kill: (pid) => killed.push(pid), platform: 'win32' });
    await recordEnginePid(deps, 4242, 'C:\\Program Files\\TextMeet\\resources\\llama\\llama-server.exe');
    expect(await killOrphanEngine(deps)).toBe(true);
    expect(killed).toEqual([4242]);
    expect(existsSync(deps.pidFile)).toBe(false);
  });

  it('killOrphanEngine leaves a process with another image alone', async () => {
    const killed: number[] = [];
    const deps = pidDeps({ processImage: async () => 'chrome.exe', kill: (pid) => killed.push(pid), platform: 'win32' });
    await recordEnginePid(deps, 4242, 'C:\\x\\llama-server.exe');
    expect(await killOrphanEngine(deps)).toBe(false);
    expect(killed).toEqual([]);
    expect(existsSync(deps.pidFile)).toBe(false);
  });

  it('killOrphanEngine leaves alone a process that is gone', async () => {
    const killed: number[] = [];
    const deps = pidDeps({ processImage: async () => null, kill: (pid) => killed.push(pid) });
    await recordEnginePid(deps, 4242, 'C:\\x\\llama-server.exe');
    expect(await killOrphanEngine(deps)).toBe(false);
    expect(killed).toEqual([]);
  });

  it('killOrphanEngine on mac compares the full path', async () => {
    const deps = pidDeps({ processImage: async () => '/Applications/Other.app/llama-server', platform: 'darwin' });
    await recordEnginePid(deps, 7, '/Applications/TextMeet.app/Contents/Resources/llama/llama-server');
    expect(await killOrphanEngine(deps)).toBe(false);
  });

  it('killOrphanEngine does nothing without a pid file or with a broken one', async () => {
    const deps = pidDeps({ processImage: async () => 'llama-server.exe' });
    expect(await killOrphanEngine(deps)).toBe(false);
    writeFileSync(deps.pidFile, '{');
    expect(await killOrphanEngine(deps)).toBe(false);
    expect(existsSync(deps.pidFile)).toBe(false);
  });

  it('killOrphanEngine survives a failing kill', async () => {
    const deps = pidDeps({
      processImage: async () => 'llama-server.exe',
      kill: () => {
        throw new Error('EPERM');
      },
    });
    await recordEnginePid(deps, 4242, 'C:\\x\\llama-server.exe');
    expect(await killOrphanEngine(deps)).toBe(false);
    expect(existsSync(deps.pidFile)).toBe(false);
  });

  it('clearEnginePid removes the file and does not mind when it is missing', async () => {
    const deps = pidDeps();
    await recordEnginePid(deps, 1, 'C:\\x\\llama-server.exe');
    await clearEnginePid(deps);
    expect(existsSync(deps.pidFile)).toBe(false);
    await expect(clearEnginePid(deps)).resolves.toBeUndefined();
  });
});
