// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref, shallowRef } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData, LedgerReducers } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { ActionRunner } from '../ledger/actionRunner';
import RenownPanel from './RenownPanel.vue';
import StatsMeta from './StatsMeta.vue';

const XSS = '<img src=x onerror=alert(1)>';
const read = (file: string): string => readFileSync(resolve(process.cwd(), 'src/stats', file), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// fixtures shared by every describe block in this file
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface World {
  character?: Row | null;
  renown?: Row[];
  renownPerks?: Row[];
  abilities?: Row[];
  factions?: Row[];
  factionStandings?: Row[];
  locations?: Row[];
  pendingPerks?: Row[];
  items?: Row[];
  templates?: Row[];
  affixes?: Row[];
  connected?: boolean;
  isDesktop?: boolean;
  chooseRenownPerk?: LedgerReducers['chooseRenownPerk'];
}

const HERO: Row = {
  id: 7n,
  name: 'Hero',
  race: 'Human',
  className: 'Warrior',
  level: 3n,
  xp: 300n,
  boundLocationId: 5n,
  pendingLevels: 0n,
  str: 10n,
  dex: 8n,
  int: 6n,
  wis: 7n,
  cha: 9n,
  hitChance: 750n,
  dodgeChance: 50n,
  parryChance: 25n,
  critMelee: 55n,
  critRanged: 60n,
  critDivine: 65n,
  critArcane: 70n,
  armorClass: 14n,
  perception: 12n,
  search: 11n,
  ccPower: 100n,
  vendorBuyMod: 20n,
  vendorSellMod: 35n,
};

function pending(id: bigint, rank: bigint, over: Row = {}): Row {
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
  };
}

function world(w: World = {}) {
  const connected = ref(w.connected ?? true);
  const chooseRenownPerk = w.chooseRenownPerk ?? vi.fn().mockResolvedValue(undefined);
  const reducers = { chooseRenownPerk } as unknown as LedgerReducers;
  const reducersRef = computed(() => (connected.value ? reducers : null));
  const pendingPerks = shallowRef<readonly Row[]>(w.pendingPerks ?? []);
  const renownPerks = shallowRef<readonly Row[]>(w.renownPerks ?? []);
  const game = {
    ...createInertGame(),
    character: ref(w.character === undefined ? HERO : w.character),
    renown: ref(w.renown ?? []),
    renownPerks,
    abilities: ref(w.abilities ?? []),
    factions: ref(w.factions ?? []),
    factionStandings: ref(w.factionStandings ?? []),
    locations: ref(w.locations ?? [{ id: 5n, name: 'Hollowmere' }]),
    connected,
  } as unknown as GameData;
  const ledger = {
    ...createInertLedger(),
    pendingPerks,
    items: ref(w.items ?? []),
    itemsApplied: ref(true),
    templates: ref(new Map((w.templates ?? []).map((t) => [t.id as bigint, t]))),
    affixes: ref(w.affixes ?? []),
    reducers: reducersRef,
  } as unknown as LedgerData;
  const frame = { ...createInertFrame(), isDesktop: ref(w.isDesktop ?? true) } as unknown as FrameControls;
  const runner: ActionRunner = createActionRunner({
    online: computed(() => connected.value && reducersRef.value !== null),
  });
  return {
    chooseRenownPerk,
    connected,
    pendingPerks,
    renownPerks,
    runner,
    global: {
      provide: { [GAME_KEY as symbol]: game, [LEDGER_KEY as symbol]: ledger, [FRAME_KEY as symbol]: frame },
    },
  };
}

const settle = async () => {
  await nextTick();
  await nextTick();
};

// ---------------------------------------------------------------------------
// RenownPanel
// ---------------------------------------------------------------------------

describe('RenownPanel', () => {
  function mountPanel(w: World = {}, props: { mobile?: boolean } = {}) {
    const ctx = world(w);
    wrapper = mount(RenownPanel, {
      attachTo: document.body,
      props: { runner: ctx.runner, ...props },
      global: ctx.global,
    });
    return ctx;
  }

  it('shows the rank heading, a progressbar in points and the points line', () => {
    mountPanel({ renown: [{ characterId: 7n, points: 300n, currentRank: 3n }] });
    expect(wrapper!.get('.renown-heading').text()).toBe('Renown · Rank 3, Recognized');
    const bar = wrapper!.get('[role="progressbar"]');
    expect(bar.attributes('aria-label')).toBe('Renown to next rank');
    expect(bar.attributes('aria-valuenow')).toBe('300');
    expect(bar.attributes('aria-valuemin')).toBe('250');
    expect(bar.attributes('aria-valuemax')).toBe('500');
    expect(wrapper!.get('.fill').attributes('style')).toContain('width: 20%');
    expect(wrapper!.get('.points').text()).toBe('300 / 500 renown');
  });

  it('reads rank 1 Unsung with no renown row', () => {
    mountPanel();
    expect(wrapper!.get('.renown-heading').text()).toBe('Renown · Rank 1, Unsung');
    expect(wrapper!.get('.points').text()).toBe('0 / 100 renown');
  });

  it('reads Highest rank at rank 15 with a full bar', () => {
    mountPanel({ renown: [{ characterId: 7n, points: 71000n, currentRank: 15n }] });
    expect(wrapper!.get('.points').text()).toBe('71000 renown · Highest rank');
    expect(wrapper!.get('.fill').attributes('style')).toContain('width: 100%');
  });

  it('lists owned perks as accent tags and says No perks yet. with none', () => {
    mountPanel({
      renownPerks: [{ perkKey: 'shrewd_bargainer' }],
      abilities: [{ name: 'Second Wind', source: 'Renown' }, { name: 'Slash', source: 'Class' }],
    });
    const tags = wrapper!.findAll('.perk-tag');
    expect(tags.map((t) => t.text())).toEqual(['Shrewd Bargainer', 'Second Wind']);
    expect(tags[0].classes()).toContain('tag-accent');
    expect(wrapper!.find('.no-perks').exists()).toBe(false);
    wrapper!.unmount();
    mountPanel();
    expect(wrapper!.get('.no-perks').text()).toBe('No perks yet.');
  });

  it('shows no choose button without pending rows', () => {
    mountPanel();
    expect(wrapper!.find('.choose-button').exists()).toBe(false);
    expect(wrapper!.find('.perk-chooser').exists()).toBe(false);
  });

  it('toggles the inline chooser from the choose button with aria-expanded', async () => {
    mountPanel({ pendingPerks: [pending(2n, 5n), pending(1n, 4n)] });
    const button = wrapper!.get('.choose-button');
    expect(button.text()).toBe('Choose rank 4 perk');
    expect(button.classes()).toContain('tag-outline');
    expect(button.attributes('aria-expanded')).toBe('false');
    await button.trigger('click');
    expect(wrapper!.get('.choose-button').attributes('aria-expanded')).toBe('true');
    expect(wrapper!.get('.perk-chooser h6').text()).toBe('Rank 4 perk');
    await wrapper!.get('.choose-button').trigger('click');
    expect(wrapper!.find('.perk-chooser').exists()).toBe(false);
  });

  it('closes the chooser after a perk is taken and moves focus to the perk row heading', async () => {
    const ctx = mountPanel({ pendingPerks: [pending(1n, 4n)] });
    await wrapper!.get('.choose-button').trigger('click');
    await wrapper!.get('button.option').trigger('click');
    await wrapper!.get('.take').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    await settle();
    expect(ctx.chooseRenownPerk).toHaveBeenCalledWith({ characterId: 7n, perkId: 1n });
    expect(wrapper!.find('.perk-chooser').exists()).toBe(false);
    const heading = wrapper!.get('.perk-heading');
    expect(heading.attributes('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(heading.element);
  });

  it('closes on Not now and returns focus to the choose button', async () => {
    mountPanel({ pendingPerks: [pending(1n, 4n)] });
    await wrapper!.get('.choose-button').trigger('click');
    await wrapper!.get('.not-now').trigger('click');
    await settle();
    expect(wrapper!.find('.perk-chooser').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper!.get('.choose-button').element);
  });

  it('offers the next rank after a take and hides the chooser when the rows clear', async () => {
    const ctx = mountPanel({ pendingPerks: [pending(1n, 4n), pending(2n, 5n)] });
    ctx.pendingPerks.value = [pending(2n, 5n)];
    await settle();
    expect(wrapper!.get('.choose-button').text()).toBe('Choose rank 5 perk');
    ctx.pendingPerks.value = [];
    await settle();
    expect(wrapper!.find('.choose-button').exists()).toBe(false);
  });

  it('renders a perk name with markup literally', () => {
    mountPanel({ abilities: [{ name: XSS, source: 'Renown' }] });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.perk-tag').text()).toBe(XSS);
  });

  it('has no Keeper card anywhere in the source', () => {
    expect(/assessment/i.test(read('RenownPanel.vue'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StatsMeta
// ---------------------------------------------------------------------------

describe('StatsMeta', () => {
  function mountMeta(w: World = {}) {
    const ctx = world(w);
    wrapper = mount(StatsMeta, { global: ctx.global });
    return ctx;
  }

  it('shows the meta line', () => {
    mountMeta();
    expect(wrapper!.get('.meta-text').text()).toBe(
      'Hero · Level 3 · 300 / 480 XP · Bound at Hollowmere',
    );
    expect(wrapper!.find('.level-up').exists()).toBe(false);
  });

  it('adds a non-interactive Level up available tag while levels are pending', () => {
    mountMeta({ character: { ...HERO, pendingLevels: 1n } });
    const tag = wrapper!.get('.level-up');
    expect(tag.text()).toBe('Level up available');
    expect(tag.classes()).toContain('tag-outline');
    expect(tag.element.tagName).toBe('SPAN');
    expect(wrapper!.find('button').exists()).toBe(false);
    expect(tag.find('svg').exists()).toBe(true);
  });

  it('renders nothing without a character', () => {
    mountMeta({ character: null });
    expect(wrapper!.find('.stats-meta').exists()).toBe(false);
  });
});
