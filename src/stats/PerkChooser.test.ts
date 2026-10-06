// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { PendingRenownPerk } from '../module_bindings/types';
import PerkChooser from './PerkChooser.vue';
import { pendingChoice } from './statsModel';

const XSS = '<img src=x onerror=alert(1)>';
const source = readFileSync(resolve(process.cwd(), 'src/stats/PerkChooser.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function row(id: bigint, rank: bigint, over: Record<string, unknown> = {}): PendingRenownPerk {
  return {
    id,
    characterId: 7n,
    rank,
    name: `Perk ${id}`,
    description: `About perk ${id}`,
    kind: '',
    resourceType: '',
    resourceCost: 0n,
    cooldownSeconds: 0n,
    ...over,
  } as unknown as PendingRenownPerk;
}

function mountChooser(
  rows: PendingRenownPerk[],
  options: {
    connected?: boolean;
    chooseRenownPerk?: LedgerReducers['chooseRenownPerk'];
    mobile?: boolean;
    /** The pending rows the ledger holds; they stay after a refusal and vanish on a take. */
    pendingPerks?: ReturnType<typeof shallowRef<readonly PendingRenownPerk[]>>;
  } = {},
) {
  const chooseRenownPerk = options.chooseRenownPerk ?? vi.fn().mockResolvedValue(undefined);
  const connected = ref(options.connected ?? true);
  const reducers = { chooseRenownPerk } as unknown as LedgerReducers;
  const reducersRef = computed(() => (connected.value ? reducers : null));
  const game = {
    ...createInertGame(),
    character: ref({ id: 7n, name: 'Hero' }),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    ...(options.pendingPerks ? { pendingPerks: options.pendingPerks } : {}),
    reducers: reducersRef,
  } as unknown as LedgerData;
  const runner = createActionRunner({ online: computed(() => connected.value && reducersRef.value !== null) });
  wrapper = mount(PerkChooser, {
    attachTo: document.body,
    props: { choice: pendingChoice(rows)!, runner, mobile: options.mobile },
    global: { provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger } },
  });
  return { chooseRenownPerk, runner };
}

const options = () => wrapper!.findAll('button.option');
const take = () => wrapper!.get('.take');

describe('PerkChooser', () => {
  it('shows the rank heading and one option per pending row of the lowest rank', () => {
    mountChooser([row(1n, 4n, { kind: 'heal', resourceType: 'stamina', resourceCost: 10n }), row(2n, 4n), row(3n, 5n)]);
    expect(wrapper!.get('h6').text()).toBe('Rank 4 perk');
    expect(options()).toHaveLength(2);
    expect(options()[0].find('.option-name').text()).toBe('Perk 1');
    expect(options()[0].find('.option-description').text()).toBe('About perk 1');
    expect(options()[0].findAll('.tag').map((t) => t.text())).toEqual(['Heal', '10 stamina']);
    expect(options()[1].findAll('.tag').map((t) => t.text())).toEqual(['Passive']);
    expect(options().map((o) => o.attributes('aria-pressed'))).toEqual(['false', 'false']);
    expect(source).toMatch(/-webkit-line-clamp: 3;/);
  });

  it('puts the permanence note above Take and Not now', () => {
    mountChooser([row(1n, 4n)]);
    const children = Array.from(wrapper!.get('.perk-chooser').element.children).map((el) => el.className.split(' ')[0]);
    expect(children).toEqual(['', 'options', 'permanent', 'actions']);
    expect(wrapper!.get('.permanent').text()).toBe('Your choice is permanent.');
    expect(wrapper!.get('.not-now').text()).toBe('Not now');
  });

  it('keeps Take aria-disabled and sends nothing until an option is chosen', async () => {
    const { chooseRenownPerk } = mountChooser([row(1n, 4n), row(2n, 4n)]);
    expect(take().attributes('aria-disabled')).toBe('true');
    await take().trigger('click');
    expect(chooseRenownPerk).not.toHaveBeenCalled();
    await options()[1].trigger('click');
    expect(options()[1].attributes('aria-pressed')).toBe('true');
    expect(options()[0].attributes('aria-pressed')).toBe('false');
    expect(take().attributes('aria-disabled')).toBeUndefined();
    expect(take().text()).toBe('Take Perk 2');
  });

  it('calls chooseRenownPerk once with the chosen pending row id and emits taken', async () => {
    const { chooseRenownPerk } = mountChooser([row(11n, 4n), row(12n, 4n)]);
    await options()[1].trigger('click');
    await take().trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(chooseRenownPerk).toHaveBeenCalledTimes(1);
    expect(chooseRenownPerk).toHaveBeenCalledWith({ characterId: 7n, perkId: 12n });
    expect(wrapper!.emitted('taken')).toHaveLength(1);
  });

  it('treats a server refusal as a refusal: the call resolves but the pending row remains, so the chooser stays open (WR-07)', async () => {
    const rows = [row(11n, 4n), row(12n, 4n)];
    const pendingPerks = shallowRef<readonly PendingRenownPerk[]>(rows);
    const refused = vi.fn().mockResolvedValue(undefined);
    mountChooser(rows, { chooseRenownPerk: refused, pendingPerks });
    await options()[1].trigger('click');
    await take().trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(refused).toHaveBeenCalledTimes(1);
    expect(wrapper!.emitted('taken')).toBeUndefined();
    expect(options()).toHaveLength(2);
    wrapper!.unmount();

    // A take removes the chosen row before the promise resolves.
    const taken = shallowRef<readonly PendingRenownPerk[]>(rows);
    const accepting = vi.fn().mockImplementation(async () => {
      taken.value = [];
    });
    mountChooser(rows, { chooseRenownPerk: accepting, pendingPerks: taken });
    await options()[1].trigger('click');
    await take().trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper!.emitted('taken')).toHaveLength(1);
  });

  it('is inert while pending and counts a rejection on the runner without emitting taken', async () => {
    let release: () => void = () => undefined;
    const slow = vi.fn().mockImplementation(() => new Promise<void>((done) => { release = done; }));
    const first = mountChooser([row(1n, 4n)], { chooseRenownPerk: slow });
    await options()[0].trigger('click');
    await take().trigger('click');
    expect(take().attributes('aria-disabled')).toBe('true');
    await take().trigger('click');
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(first.runner.rejection.value).toBe(0);
    wrapper!.unmount();

    const failing = mountChooser([row(1n, 4n)], { chooseRenownPerk: vi.fn().mockRejectedValue(new Error('no')) });
    await options()[0].trigger('click');
    await take().trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(failing.runner.rejection.value).toBe(1);
    expect(wrapper!.emitted('taken')).toBeUndefined();
  });

  it('sends nothing while offline', async () => {
    const { chooseRenownPerk } = mountChooser([row(1n, 4n)], { connected: false });
    await options()[0].trigger('click');
    expect(take().attributes('aria-disabled')).toBe('true');
    await take().trigger('click');
    expect(chooseRenownPerk).not.toHaveBeenCalled();
  });

  it('emits close from Not now and from Escape, preventing the event', async () => {
    mountChooser([row(1n, 4n)]);
    await wrapper!.get('.not-now').trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper!.emitted('close')).toHaveLength(2);
  });

  it('stops listening for Escape once unmounted', () => {
    mountChooser([row(1n, 4n)]);
    wrapper!.unmount();
    wrapper = null;
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('carries 44px minimums on mobile', () => {
    expect(source).toMatch(/\.mobile \.option\s*\{\s*min-height: 44px;/);
    expect(source).toMatch(/\.mobile \.take,\s*\.mobile \.not-now\s*\{\s*min-height: 44px;/);
    mountChooser([row(1n, 4n)], { mobile: true });
    expect(wrapper!.get('.perk-chooser').classes()).toContain('mobile');
  });

  it('renders a perk name and description with markup literally', () => {
    mountChooser([row(1n, 4n, { name: XSS, description: XSS })]);
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(options()[0].find('.option-name').text()).toBe(XSS);
    expect(options()[0].find('.option-description').text()).toBe(XSS);
  });
});
