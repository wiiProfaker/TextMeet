import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEST_BUILD_MARKER, testEnv, testHooksAllowed, type TestHooksContext } from './test-hooks';

const ctx = (over: Partial<TestHooksContext>): TestHooksContext => ({
  packaged: true,
  resourcesPath: '/app/resources',
  env: {},
  exists: () => false,
  ...over,
});

describe('testEnv', () => {
  it('testEnv returns no test variables in a packaged app without the marker', () => {
    const env = { TEXTMEET_TEST_ASR: 'fake', TEXTMEET_USER_DATA: '/tmp/x', PATH: '/bin' };
    expect(testHooksAllowed(ctx({ env }))).toBe(false);
    expect(testEnv(ctx({ env }))).toEqual({});
  });

  it('allows test variables in a dev run', () => {
    const env = { TEXTMEET_TEST_ASR: 'fake', PATH: '/bin' };
    expect(testEnv(ctx({ packaged: false, env }))).toEqual({ TEXTMEET_TEST_ASR: 'fake' });
  });

  it('allows test variables in the test copy of a build (marker in resources)', () => {
    const marker = join('/app/resources', TEST_BUILD_MARKER);
    const env = { TEXTMEET_TEST_MEDIA: 'tone' };
    expect(testEnv(ctx({ env, exists: (p) => p === marker }))).toEqual({ TEXTMEET_TEST_MEDIA: 'tone' });
  });

  it('skips variables without a value', () => {
    expect(testEnv(ctx({ packaged: false, env: { TEXTMEET_HOME: undefined, TEXTMEET_TEST_LLM: '' } }))).toEqual({
      TEXTMEET_TEST_LLM: '',
    });
  });
});
