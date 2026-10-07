// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { bagRunner } from './bagRunner';

// Plan 50-39: one action runner per ledger hub, shared by the Inventory screen and its header actions.

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function world(connected: boolean, reducers: LedgerReducers | null) {
  const connectedRef = ref(connected);
  const reducersRef = ref<LedgerReducers | null>(reducers);
  const game: GameData = { ...createInertGame(), connected: computed(() => connectedRef.value) };
  const ledger: LedgerData = {
    ...createInertLedger(),
    reducers: computed(() => reducersRef.value),
  };
  return { game, ledger, connectedRef, reducersRef };
}

describe('bagRunner', () => {
  it('gives the same runner for the same ledger and another for a different ledger', () => {
    const a = world(true, {} as LedgerReducers);
    const b = world(true, {} as LedgerReducers);
    expect(bagRunner(a.ledger, a.game)).toBe(bagRunner(a.ledger, a.game));
    expect(bagRunner(a.ledger, a.game)).not.toBe(bagRunner(b.ledger, b.game));
  });

  it('never runs the call while offline or without reducers, and goes live when they arrive', async () => {
    const w = world(false, null);
    const runner = bagRunner(w.ledger, w.game);
    const call = vi.fn().mockResolvedValue(undefined);
    expect(await runner.run('bag-organize', call)).toBe(false);
    w.connectedRef.value = true;
    expect(await runner.run('bag-organize', call)).toBe(false);
    expect(call).not.toHaveBeenCalled();
    w.reducersRef.value = {} as LedgerReducers;
    expect(await runner.run('bag-organize', call)).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    w.connectedRef.value = false;
    expect(await runner.run('bag-organize', call)).toBe(false);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('counts a rejection and ignores a second run while the first is pending', async () => {
    const w = world(true, {} as LedgerReducers);
    const runner = bagRunner(w.ledger, w.game);
    let release: () => void = () => undefined;
    const slow = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const first = runner.run('bag-organize', slow);
    expect(runner.isPending('bag-organize')).toBe(true);
    expect(await runner.run('bag-organize', slow)).toBe(false);
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(true);
    expect(runner.isPending('bag-organize')).toBe(false);
    expect(await runner.run('bag-organize', () => Promise.reject(new Error('no')))).toBe(false);
    expect(runner.rejection.value).toBe(1);
  });

  it('keeps updating pending reactively after the component that first asked for it unmounted', async () => {
    const w = world(true, {} as LedgerReducers);
    const first = mount(
      defineComponent({
        setup() {
          bagRunner(w.ledger, w.game);
          return () => h('div');
        },
      }),
    );
    first.unmount();

    let release: () => void = () => undefined;
    const slow = (): Promise<void> => new Promise<void>((resolve) => (release = resolve));
    let seen: () => boolean = () => false;
    wrapper = mount(
      defineComponent({
        setup() {
          const runner = bagRunner(w.ledger, w.game);
          const isPending = computed(() => runner.pending.value.has('bag-organize'));
          seen = () => isPending.value;
          return () => h('button', { onClick: () => void runner.run('bag-organize', slow) }, String(isPending.value));
        },
      }),
    );
    expect(seen()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(seen()).toBe(true);
    expect(wrapper.get('button').text()).toBe('true');
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(seen()).toBe(false);
    expect(wrapper.get('button').text()).toBe('false');
  });
});
