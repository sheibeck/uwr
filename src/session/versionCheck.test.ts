import { describe, expect, it } from 'vitest';
import { shouldPromptReload } from './versionCheck';

describe('shouldPromptReload', () => {
  it('is false when the app_version row is absent (fresh database)', () => {
    expect(shouldPromptReload(null, '1.0.0', false)).toBe(false);
    expect(shouldPromptReload(undefined, '1.0.0', false)).toBe(false);
  });

  it('is false when versions match', () => {
    expect(shouldPromptReload({ version: '1.0.0' }, '1.0.0', false)).toBe(false);
  });

  it('is true when the server version differs from the build', () => {
    expect(shouldPromptReload({ version: '1.0.1' }, '1.0.0', false)).toBe(true);
  });

  it('is never true in dev', () => {
    expect(shouldPromptReload({ version: '1.0.1' }, '1.0.0', true)).toBe(false);
  });

  it('is false when the client version is empty or missing', () => {
    expect(shouldPromptReload({ version: '1.0.1' }, '', false)).toBe(false);
    expect(shouldPromptReload({ version: '1.0.1' }, null, false)).toBe(false);
    expect(shouldPromptReload({ version: '1.0.1' }, undefined, false)).toBe(false);
  });
});
