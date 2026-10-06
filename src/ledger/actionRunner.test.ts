import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { SEND_ERROR_TEXT, createActionRunner } from './actionRunner';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createActionRunner', () => {
  it('exposes the send error text', () => {
    expect(SEND_ERROR_TEXT).toBe("Couldn't send that. Try again.");
  });

  it('is pending until the promise settles', async () => {
    const runner = createActionRunner({ online: ref(true) });
    const d = deferred();
    const call = vi.fn(() => d.promise);
    const result = runner.run('sell:7', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(runner.isPending('sell:7')).toBe(true);
    expect(runner.pending.value.has('sell:7')).toBe(true);
    d.resolve();
    await expect(result).resolves.toBe(true);
    expect(runner.isPending('sell:7')).toBe(false);
    expect(runner.pending.value.size).toBe(0);
  });

  it('ignores a second run of the same key while pending', async () => {
    const runner = createActionRunner({ online: ref(true) });
    const d = deferred();
    const first = vi.fn(() => d.promise);
    const second = vi.fn(() => Promise.resolve());
    const a = runner.run('sell:7', first);
    const b = runner.run('sell:7', second);
    expect(second).not.toHaveBeenCalled();
    await expect(b).resolves.toBe(false);
    d.resolve();
    await a;
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('runs different keys independently', async () => {
    const runner = createActionRunner({ online: ref(true) });
    const d = deferred();
    const a = runner.run('sell:7', () => d.promise);
    const other = vi.fn(() => Promise.resolve());
    await expect(runner.run('sell:8', other)).resolves.toBe(true);
    expect(other).toHaveBeenCalledTimes(1);
    expect(runner.isPending('sell:7')).toBe(true);
    d.resolve();
    await a;
  });

  it('never calls while offline', async () => {
    const online = ref(false);
    const runner = createActionRunner({ online });
    const call = vi.fn(() => Promise.resolve());
    await expect(runner.run('sell:7', call)).resolves.toBe(false);
    expect(call).not.toHaveBeenCalled();
    expect(runner.isPending('sell:7')).toBe(false);
    online.value = true;
    await expect(runner.run('sell:7', call)).resolves.toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('resolves false and counts a rejection without throwing', async () => {
    const runner = createActionRunner({ online: ref(true) });
    expect(runner.rejection.value).toBe(0);
    await expect(runner.run('buy:1', () => Promise.reject(new Error('no')))).resolves.toBe(false);
    expect(runner.rejection.value).toBe(1);
    expect(runner.isPending('buy:1')).toBe(false);
    await expect(runner.run('buy:1', () => Promise.reject(new Error('no')))).resolves.toBe(false);
    expect(runner.rejection.value).toBe(2);
  });

  it('counts a call that throws synchronously as a rejection', async () => {
    const runner = createActionRunner({ online: ref(true) });
    await expect(
      runner.run('buy:1', () => {
        throw new Error('sync');
      }),
    ).resolves.toBe(false);
    expect(runner.rejection.value).toBe(1);
    expect(runner.isPending('buy:1')).toBe(false);
  });

  it('leaves rejection alone when the promise resolves', async () => {
    const runner = createActionRunner({ online: ref(true) });
    await expect(runner.run('buy:1', () => Promise.resolve())).resolves.toBe(true);
    expect(runner.rejection.value).toBe(0);
  });
});
