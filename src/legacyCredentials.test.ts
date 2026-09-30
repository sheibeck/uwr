import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clearLegacyLlmCredential } from './legacyCredentials';

const KEY = 'llm_proxy_secret';

function fakeStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial));
  const removeItem = vi.fn((key: string) => {
    map.delete(key);
  });
  return { map, removeItem };
}

describe('clearLegacyLlmCredential', () => {
  it('removes exactly the legacy key when it is present', () => {
    const fake = fakeStorage({ [KEY]: 'old-value', other: 'keep' });
    clearLegacyLlmCredential(fake);
    expect(fake.removeItem).toHaveBeenCalledTimes(1);
    expect(fake.removeItem).toHaveBeenCalledWith(KEY);
    expect(fake.map.has(KEY)).toBe(false);
    expect(fake.map.get('other')).toBe('keep');
  });

  it('is a no-op when the key is absent', () => {
    const fake = fakeStorage({ other: 'keep' });
    expect(() => clearLegacyLlmCredential(fake)).not.toThrow();
    expect([...fake.map.entries()]).toEqual([['other', 'keep']]);
  });

  it('does not throw when storage access throws', () => {
    const removeItem = vi.fn(() => {
      throw new Error('SecurityError: storage blocked');
    });
    expect(() => clearLegacyLlmCredential({ removeItem })).not.toThrow();
    expect(removeItem).toHaveBeenCalledTimes(1);
  });

  it('does not throw with no argument when localStorage does not exist (node)', () => {
    expect(typeof (globalThis as { localStorage?: unknown }).localStorage).toBe('undefined');
    expect(() => clearLegacyLlmCredential()).not.toThrow();
  });

  it('can run twice in a row (idempotent)', () => {
    const fake = fakeStorage({ [KEY]: 'old-value' });
    clearLegacyLlmCredential(fake);
    clearLegacyLlmCredential(fake);
    expect(fake.map.has(KEY)).toBe(false);
    expect(fake.removeItem).toHaveBeenCalledTimes(2);
  });

  it('never moves the value anywhere else', () => {
    const setItem = vi.fn();
    const fake = { ...fakeStorage({ [KEY]: 'old-value' }), setItem };
    clearLegacyLlmCredential(fake);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('legacyCredentials source', () => {
  it('keeps the key literal inside the removeItem call (the bundle guard allowlist keys on it)', () => {
    const path = fileURLToPath(new URL('./legacyCredentials.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source.match(/removeItem\('llm_proxy_secret'\)/g)).toHaveLength(1);
  });
});

describe('main.ts wiring', () => {
  const source = readFileSync(fileURLToPath(new URL('./main.ts', import.meta.url)), 'utf8');

  it('imports clearLegacyLlmCredential from ./legacyCredentials', () => {
    expect(source).toMatch(/import\s*\{\s*clearLegacyLlmCredential\s*\}\s*from\s*'\.\/legacyCredentials'/);
  });

  it('calls it as the first statement of bootstrap, before the auth callback and createApp', () => {
    const start = source.indexOf('const bootstrap = async () => {');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start);
    const call = body.indexOf('clearLegacyLlmCredential()');
    const auth = body.indexOf('handleSpacetimeAuthCallback()');
    const create = body.indexOf('createApp(');
    expect(call).toBeGreaterThan(-1);
    expect(call).toBeLessThan(auth);
    expect(call).toBeLessThan(create);
    // First statement: only the function header precedes it.
    expect(body.slice(0, call).replace('const bootstrap = async () => {', '').trim()).toBe('');
  });
});
