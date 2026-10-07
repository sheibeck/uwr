// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import type { EffectScope, Ref } from 'vue';
import type { ActionResult } from '../module_bindings/types';
import { createActionRunner } from './actionRunner';
import type { ActionRunner } from './actionRunner';
import { useActionResult } from './useActionResult';
import type { ActionResultState, ResultKind } from './useActionResult';

function row(kind: string, seq: bigint): ActionResult {
  return {
    characterId: 1n,
    seq,
    kind,
    templateId: undefined,
    itemInstanceId: undefined,
    itemName: 'Thing',
    rarity: 'common',
    craftQuality: undefined,
    quantity: 1n,
    recipeTemplateId: undefined,
    craftCount: 1n,
    linesJson: '[]',
    at: { microsSinceUnixEpoch: 0n },
  } as unknown as ActionResult;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface Harness {
  runner: ActionRunner;
  lastResult: Ref<ActionResult | null>;
  state: ActionResultState;
  fallback: ReturnType<typeof vi.fn>;
  scope: EffectScope;
}

function setup(keys: Record<string, ResultKind>, initial: ActionResult | null = null): Harness {
  const runner = createActionRunner({ online: ref(true) });
  const lastResult = ref<ActionResult | null>(initial);
  const fallback = vi.fn();
  const scope = effectScope();
  const state = scope.run(() => useActionResult({ runner, lastResult, keys, fallbackFocus: fallback }))!;
  return { runner, lastResult, state, fallback, scope };
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  document.body.appendChild(b);
  return b;
}

let harness: Harness | null = null;
beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  harness?.scope.stop();
  harness = null;
});

describe('useActionResult', () => {
  it('opens for a row of the armed kind with a higher seq', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const opener = button('Craft');
    opener.focus();
    const d = deferred();
    const run = h.runner.run('craft', () => d.promise);
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    expect(h.state.shown.value?.seq).toBe(1n);
    d.resolve();
    await run;
  });

  it('arms with the current seq as the baseline', async () => {
    const h = (harness = setup({ craft: 'craft' }, row('craft', 4n)));
    const d = deferred();
    const run = h.runner.run('craft', () => d.promise);
    h.lastResult.value = row('craft', 4n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
    h.lastResult.value = row('craft', 5n);
    await nextTick();
    expect(h.state.shown.value?.seq).toBe(5n);
    d.resolve();
    await run;
  });

  it('does not open for a different kind', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const d = deferred();
    const run = h.runner.run('craft', () => d.promise);
    h.lastResult.value = row('discover', 1n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
    d.resolve();
    await run;
  });

  it('never opens for a row that arrives with nothing armed (first subscription apply)', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    h.lastResult.value = row('craft', 3n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
    h.lastResult.value = row('craft', 4n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
  });

  it('ignores a runner key that is not in the map', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const d = deferred();
    const run = h.runner.run('sell:7', () => d.promise);
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
    d.resolve();
    await run;
  });

  it('spends the arm when a card opens', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const d = deferred();
    const run = h.runner.run('craft', () => d.promise);
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    d.resolve();
    await run;
    h.state.close();
    await nextTick();
    h.lastResult.value = row('craft', 2n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
  });

  it('re-arms on a new action while a card is open, replaces the row and keeps the first opener', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const opener = button('Craft');
    opener.focus();
    const d1 = deferred();
    const first = h.runner.run('craft', () => d1.promise);
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    d1.resolve();
    await first;
    expect(h.state.shown.value?.seq).toBe(1n);

    // Focus is now inside the card (on Done): the second arm must not take it as the opener.
    const done = button('Done');
    done.focus();
    const d2 = deferred();
    const second = h.runner.run('craft', () => d2.promise);
    h.lastResult.value = row('craft', 2n);
    await nextTick();
    d2.resolve();
    await second;
    expect(h.state.shown.value?.seq).toBe(2n);

    h.state.close();
    await nextTick();
    expect(document.activeElement).toBe(opener);
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it('close() clears shown and focuses the opener when it is still connected', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const opener = button('Craft');
    opener.focus();
    const d = deferred();
    const run = h.runner.run('craft', () => d.promise);
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    d.resolve();
    await run;
    const other = button('Other');
    other.focus();
    h.state.close();
    expect(h.state.shown.value).toBeNull();
    await nextTick();
    expect(document.activeElement).toBe(opener);
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it('close() calls the fallback once when the opener was removed', async () => {
    const h = (harness = setup({ 'item-salvage': 'salvage' }));
    const opener = button('Yes, salvage');
    opener.focus();
    const d = deferred();
    const run = h.runner.run('item-salvage', () => d.promise);
    h.lastResult.value = row('salvage', 1n);
    await nextTick();
    d.resolve();
    await run;
    opener.remove();
    h.state.close();
    await nextTick();
    expect(h.fallback).toHaveBeenCalledTimes(1);
  });

  it('close() calls the fallback when nothing had focus', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    (document.activeElement as HTMLElement | null)?.blur();
    const d = deferred();
    const run = h.runner.run('craft', () => d.promise);
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    d.resolve();
    await run;
    h.state.close();
    await nextTick();
    expect(h.fallback).toHaveBeenCalledTimes(1);
  });

  it('close() with no card shown does nothing', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    h.state.close();
    await nextTick();
    expect(h.fallback).not.toHaveBeenCalled();
  });

  it('arms each key with its own kind', async () => {
    const h = (harness = setup({ 'item-salvage': 'salvage', discover: 'discover' }));
    const d1 = deferred();
    const run1 = h.runner.run('discover', () => d1.promise);
    h.lastResult.value = row('salvage', 1n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
    h.lastResult.value = row('discover', 2n);
    await nextTick();
    expect(h.state.shown.value?.kind).toBe('discover');
    d1.resolve();
    await run1;
    h.state.close();
    await nextTick();

    const d2 = deferred();
    const run2 = h.runner.run('item-salvage', () => d2.promise);
    h.lastResult.value = row('salvage', 3n);
    await nextTick();
    expect(h.state.shown.value?.kind).toBe('salvage');
    d2.resolve();
    await run2;
  });

  it('does not match inherited object keys as runner keys', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const d = deferred();
    const run = h.runner.run('toString', () => d.promise);
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
    d.resolve();
    await run;
  });

  it('stops watching when the scope is stopped', async () => {
    const h = (harness = setup({ craft: 'craft' }));
    const d = deferred();
    const run = h.runner.run('craft', () => d.promise);
    h.scope.stop();
    h.lastResult.value = row('craft', 1n);
    await nextTick();
    expect(h.state.shown.value).toBeNull();
    d.resolve();
    await run;
  });
});
