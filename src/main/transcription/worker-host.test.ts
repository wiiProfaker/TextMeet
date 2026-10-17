import { describe, expect, it } from 'vitest';
import { workerEnv } from './worker-host';

describe('workerEnv', () => {
  it('drops the TEXTMEET_* variables of the app and keeps the rest', () => {
    expect(workerEnv({ PATH: '/bin', TEXTMEET_TEST_ASR: 'fake', TEXTMEET_HOME: '/h' }, false)).toEqual({ PATH: '/bin' });
  });

  it('turns fake engines on only when main asks for them', () => {
    expect(workerEnv({ PATH: '/bin' }, true)).toEqual({ PATH: '/bin', TEXTMEET_TEST_ASR: 'fake' });
  });
});
