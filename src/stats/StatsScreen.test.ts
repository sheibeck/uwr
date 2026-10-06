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
import StatsScreen from './StatsScreen.vue';
import { createFeedStore } from '../console/feedStore';

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
  itemsApplied?: boolean;
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
  const feed = createFeedStore();
  feed.setCharacter(7n);
  const game = {
    ...createInertGame(),
    feed,
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
    itemsApplied: ref(w.itemsApplied ?? true),
    templates: ref(new Map((w.templates ?? []).map((t) => [t.id as bigint, t]))),
    affixes: ref(w.affixes ?? []),
    reducers: reducersRef,
  } as unknown as LedgerData;
  const frame = { ...createInertFrame(), isDesktop: ref(w.isDesktop ?? true) } as unknown as FrameControls;
  const runner: ActionRunner = createActionRunner({
    online: computed(() => connected.value && reducersRef.value !== null),
  });
  let nextRowId = 1n;
  function sendServerLine(kind: string, message: string): void {
    const id = nextRowId;
    nextRowId += 1n;
    feed.ingest('private', { id, kind, message, createdAt: { microsSinceUnixEpoch: id * 10n }, characterId: 7n } as never);
    feed.flush();
  }
  return {
    sendServerLine,
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

  it('keeps the chooser open when the server refuses the choice: the call resolves, the pending row stays (WR-07)', async () => {
    const ctx = mountPanel({ pendingPerks: [pending(1n, 4n)] });
    await wrapper!.get('.choose-button').trigger('click');
    await wrapper!.get('button.option').trigger('click');
    await wrapper!.get('.take').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    await settle();
    expect(ctx.chooseRenownPerk).toHaveBeenCalledTimes(1);
    expect(wrapper!.find('.perk-chooser').exists()).toBe(true);
    expect(document.activeElement).not.toBe(wrapper!.get('.perk-heading').element);
  });

  it('gives the mobile choose button a 44px hit area and the mobile class on the root (WR-06)', () => {
    expect(read('RenownPanel.vue')).toMatch(/\.mobile \.choose-button::after\s*\{[^}]*height: 44px;/);
    mountPanel({ pendingPerks: [pending(1n, 4n)] }, { mobile: true });
    expect(wrapper!.get('.renown').classes()).toContain('mobile');
    wrapper!.unmount();
    mountPanel({ pendingPerks: [pending(1n, 4n)] });
    expect(wrapper!.get('.renown').classes()).not.toContain('mobile');
  });

  it('closes the chooser after a perk is taken and moves focus to the perk row heading', async () => {
    const taken: { clear: () => void } = { clear: () => undefined };
    const ctx = mountPanel({
      pendingPerks: [pending(1n, 4n)],
      chooseRenownPerk: vi.fn().mockImplementation(async () => {
        taken.clear();
      }),
    });
    taken.clear = () => {
      ctx.pendingPerks.value = [];
    };
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

  it('renders the character name and the bind-location name with markup literally (IN-08)', () => {
    mountMeta({
      character: { ...HERO, name: XSS },
      locations: [{ id: 5n, name: XSS }],
    });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.meta-text').text()).toBe(`${XSS} · Level 3 · 300 / 480 XP · Bound at ${XSS}`);
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

// ---------------------------------------------------------------------------
// StatsScreen (desktop drawer and 390x844 sheet)
// ---------------------------------------------------------------------------

const FACTIONS: Row[] = [
  { id: 1n, name: 'Wardens' },
  { id: 2n, name: 'Ashen Court' },
  { id: 3n, name: 'Reavers' },
];
const STANDINGS: Row[] = [
  { id: 1n, characterId: 7n, factionId: 1n, standing: 60n },
  { id: 2n, characterId: 7n, factionId: 2n, standing: 0n },
  { id: 3n, characterId: 7n, factionId: 3n, standing: -60n },
];

function screenWorld(w: World = {}): World {
  return {
    factions: FACTIONS,
    factionStandings: STANDINGS,
    templates: [{ id: 1n, name: 'Vest', slot: 'chest', strBonus: 4n }],
    items: [{ id: 1n, templateId: 1n, ownerCharacterId: 7n, equippedSlot: 'chest', quantity: 1n }],
    renown: [{ characterId: 7n, points: 300n, currentRank: 3n }],
    ...w,
  };
}

function mountScreen(w: World = {}) {
  const ctx = world(screenWorld(w));
  wrapper = mount(StatsScreen, { attachTo: document.body, global: ctx.global });
  return ctx;
}

describe('StatsScreen desktop', () => {
  it('draws five base stat rows with the name, abbreviation, total, base and a two-segment bar', () => {
    mountScreen();
    const rows = wrapper!.findAll('.stat-row');
    expect(rows.map((r) => r.find('.stat-name').text())).toEqual([
      'Strength',
      'Dexterity',
      'Intelligence',
      'Wisdom',
      'Charisma',
    ]);
    expect(rows.map((r) => r.find('.stat-abbr').text())).toEqual(['STR', 'DEX', 'INT', 'WIS', 'CHA']);
    expect(rows[0].find('.stat-total').text()).toBe('14');
    expect(rows[0].find('.stat-base').text()).toBe('(10)');
    expect(rows[0].find('.bar').attributes('aria-hidden')).toBe('true');
    expect(rows[0].find('.base-seg').attributes('style')).toContain('width: 50%');
    expect(rows[0].find('.gear-seg').attributes('style')).toContain('width: 20%');
    expect(rows[0].find('.sr-only').text()).toBe('Strength 14, base 10, plus 4 from gear');
    expect(rows[1].find('.gear-seg').attributes('style')).toContain('width: 0%');
  });

  it('shows no bars until the item subscription has applied, so gear never reads as a false zero (WR-05)', async () => {
    mountScreen({ itemsApplied: false });
    expect(wrapper!.findAll('.stat-row')).toHaveLength(0);
  });

  it('colors the gear segment with the accent and the base segment neutral', () => {
    const source = read('StatBars.vue');
    expect(source).toMatch(/\.gear-seg\s*\{\s*background: var\(--color-accent\);/);
    expect(source).toMatch(/\.base-seg\s*\{\s*background: var\(--color-neutral-400\);/);
    expect(source).toMatch(/\.bar\s*\{[^}]*height: 4px;/);
  });

  it('headings read Base stats with the base plus gear note, Derived and Faction standing', () => {
    mountScreen();
    const headings = wrapper!.findAll('h6').map((h) => h.text());
    expect(headings).toContain('Base stats · base + gear');
    expect(headings).toContain('Derived');
    expect(headings).toContain('Faction standing');
  });

  it('draws the Derived table as a real table with a screen-reader caption and row headers', () => {
    mountScreen();
    const table = wrapper!.get('table');
    expect(table.get('caption').text()).toBe('Derived stats');
    expect(table.get('caption').classes()).toContain('sr-only');
    expect(table.find('thead').exists()).toBe(false);
    const heads = table.findAll('th');
    expect(heads.every((h) => h.attributes('scope') === 'row')).toBe(true);
    expect(heads.map((h) => h.text())).toEqual([
      'Hit',
      'Dodge',
      'Parry',
      'Crit (Melee)',
      'Crit (Ranged)',
      'Crit (Divine)',
      'Crit (Arcane)',
      'Armor Class',
      'Perception',
      'Search',
      'CC Power',
      'Vendor Buy / Sell',
    ]);
    expect(table.findAll('td')[0].text()).toBe('75.00%');
    expect(table.findAll('td')[11].text()).toBe('−2.00% / +3.50%');
    expect(read('DerivedTable.vue')).toMatch(/td\.value\s*\{\s*text-align: right;/);
    expect(read('DerivedTable.vue')).toMatch(/\.derived\s*\{\s*font-size: 12px;/);
    expect(read('DerivedTable.vue')).toMatch(/\.derived th\s*\{\s*font-size: 10px;\s*letter-spacing: 0\.1em;/);
  });

  it('draws faction rows by standing with the tier word in its color, a bar and an aria label', () => {
    mountScreen();
    const rows = wrapper!.findAll('.faction-row');
    expect(rows.map((r) => r.find('.faction-name').text())).toEqual(['Wardens', 'Ashen Court', 'Reavers']);
    expect(rows[0].attributes('aria-label')).toBe('Wardens, Honored, standing 60');
    expect(rows[0].find('.faction-tier').classes()).toContain('tier-friendly');
    expect(rows[1].find('.faction-tier').text()).toBe('Neutral');
    expect(rows[2].find('.faction-tier').classes()).toContain('tier-hostile');
    expect(rows[2].find('.fill').attributes('style')).toContain('width: 20%');
    expect(rows[1].find('.fill').attributes('style')).toContain('width: 50%');
    expect(rows[0].find('.fill').classes()).toContain('fill-friendly');
  });

  it('says there is no standing with any faction yet', () => {
    mountScreen({ factionStandings: [] });
    expect(wrapper!.get('.empty').text()).toBe('No standing with any faction yet.');
    expect(wrapper!.find('.faction-row').exists()).toBe(false);
  });

  it('orders the desktop columns base stats and renown, derived, factions', () => {
    mountScreen();
    const cols = Array.from(wrapper!.get('.desk-grid').element.children).map((el) => el.className.split(' ').slice(0, 2).join(' '));
    expect(cols).toEqual(['col stats-col', 'col derived-col', 'col factions-col']);
    expect(wrapper!.get('.stats-col').find('.renown').exists()).toBe(true);
    expect(wrapper!.get('.derived-col').find('table').exists()).toBe(true);
    expect(wrapper!.get('.factions-col').find('.factions').exists()).toBe(true);
  });

  it('sets the three-column and two-column grids and per-column scroll regions in the source', () => {
    const source = read('StatsScreen.vue');
    expect(source).toMatch(/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) 280px;/);
    expect(source).toMatch(/'stats derived'\s*'stats factions'/);
    expect(source).toMatch(/\.col\s*\{\s*min-height: 0;\s*overflow-y: auto;/);
    expect(source).toMatch(/\.stats-screen\s*\{\s*height: 100%;\s*min-height: 0;\s*display: flex;\s*flex-direction: column;/);
    expect(source).toMatch(/@media \(min-width: 1200px\)/);
  });

  it('has no Keeper card or empty slot for it', () => {
    mountScreen();
    expect(wrapper!.text().toLowerCase()).not.toContain('assessment');
    expect(wrapper!.text().toLowerCase()).not.toContain('keeper');
    for (const file of ['StatsScreen.vue', 'StatBars.vue', 'DerivedTable.vue', 'FactionList.vue', 'RenownPanel.vue', 'StatsMeta.vue', 'PerkChooser.vue']) {
      expect(/assessment/i.test(read(file))).toBe(false);
    }
  });

  it('shows No stats to show yet. without a character', () => {
    mountScreen({ character: null });
    expect(wrapper!.text()).toContain('No stats to show yet.');
    expect(wrapper!.text()).toContain('Choose a character to see its numbers.');
    expect(wrapper!.find('.desk-grid').exists()).toBe(false);
  });

  it('shows only the chooser button while a perk is pending and the rejection reaches the notice line', async () => {
    const ctx = mountScreen({
      pendingPerks: [pending(1n, 4n)],
      chooseRenownPerk: vi.fn().mockRejectedValue(new Error('no')),
    });
    await wrapper!.get('.choose-button').trigger('click');
    await wrapper!.get('button.option').trigger('click');
    await wrapper!.get('.take').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    await settle();
    expect(ctx.chooseRenownPerk).toHaveBeenCalledWith({ characterId: 7n, perkId: 1n });
    expect(wrapper!.get('[role="status"]').text()).toBe("Couldn't send that. Try again.");
  });

  it('shows the server line that follows a perk choice in the notice line', async () => {
    const ctx = mountScreen();
    ctx.sendServerLine('system', 'You take Iron Will.');
    await settle();
    expect(wrapper!.get('[role="status"]').text()).toBe('You take Iron Will.');
  });

  it('renders a faction name with markup literally', () => {
    mountScreen({ factions: [{ id: 1n, name: XSS }, ...FACTIONS.slice(1)] });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.faction-name').text()).toBe(XSS);
  });
});

describe('StatsScreen mobile 390x844', () => {
  it('shows the identity row with a 44px avatar, the name, the mobile line and no tag by default', () => {
    mountScreen({ isDesktop: false });
    expect(wrapper!.get('.avatar').text()).toBe('H');
    expect(wrapper!.get('.avatar').attributes('aria-hidden')).toBe('true');
    expect(wrapper!.get('.who-name').text()).toBe('Hero');
    expect(wrapper!.get('.who-line').text()).toBe('Lv 3 Human Warrior · 300/480 XP');
    expect(wrapper!.find('.level-up').exists()).toBe(false);
    expect(wrapper!.find('.desk-grid').exists()).toBe(false);
    expect(read('StatsScreen.vue')).toMatch(/\.avatar\s*\{[^}]*width: 44px;\s*height: 44px;/);
  });

  it('shows a non-interactive Level up available tag when levels are pending', () => {
    mountScreen({ isDesktop: false, character: { ...HERO, pendingLevels: 2n } });
    const tag = wrapper!.get('.identity .level-up');
    expect(tag.text()).toBe('Level up available');
    expect(tag.element.tagName).toBe('SPAN');
    expect(wrapper!.find('.identity button').exists()).toBe(false);
  });

  it('offers the Stats, Derived, Renown and Factions tabs and opens on Stats without abbreviations', () => {
    mountScreen({ isDesktop: false });
    expect(wrapper!.get('[role="tablist"]').attributes('aria-label')).toBe('Stats view');
    expect(wrapper!.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Stats', 'Derived', 'Renown', 'Factions']);
    expect(wrapper!.findAll('.stat-row')).toHaveLength(5);
    expect(wrapper!.find('.stat-abbr').exists()).toBe(false);
    expect(wrapper!.find('table').exists()).toBe(false);
  });

  it('shows each tab panel in turn', async () => {
    mountScreen({ isDesktop: false });
    const tabs = () => wrapper!.findAll('[role="tab"]');
    await tabs()[1].trigger('click');
    expect(wrapper!.get('table caption').text()).toBe('Derived stats');
    await tabs()[2].trigger('click');
    expect(wrapper!.find('[role="progressbar"]').exists()).toBe(true);
    expect(wrapper!.get('.renown-heading').text()).toBe('Renown · Rank 3, Recognized');
    await tabs()[3].trigger('click');
    expect(wrapper!.findAll('.faction-row')).toHaveLength(3);
    expect(wrapper!.find('[role="progressbar"]').exists()).toBe(false);
  });

  it('opens the chooser inside the Renown panel with 44px controls', async () => {
    mountScreen({ isDesktop: false, pendingPerks: [pending(1n, 4n)] });
    await wrapper!.findAll('[role="tab"]')[2].trigger('click');
    await wrapper!.get('.choose-button').trigger('click');
    expect(wrapper!.get('.perk-chooser').classes()).toContain('mobile');
    expect(read('PerkChooser.vue')).toMatch(/\.mobile \.take,\s*\.mobile \.not-now\s*\{\s*min-height: 44px;/);
    expect(read('PerkChooser.vue')).toMatch(/\.mobile \.option\s*\{\s*min-height: 44px;/);
  });

  it('carries min-height 44px for the tabs and the chooser sources', () => {
    expect(readFileSync(resolve(process.cwd(), 'src/ledger/SegTabs.vue'), 'utf8')).toMatch(
      /\.seg-opt\s*\{[^}]*min-height: 44px;/,
    );
  });

  it('shows No stats to show yet. without a character', () => {
    mountScreen({ isDesktop: false, character: null });
    expect(wrapper!.text()).toContain('No stats to show yet.');
  });

  it('renders the character name in the identity row with markup literally (IN-08)', () => {
    mountScreen({ isDesktop: false, character: { ...HERO, name: XSS } });
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.who-name').text()).toBe(XSS);
  });

  it('renders a faction name with markup literally on the Factions tab', async () => {
    mountScreen({ isDesktop: false, factions: [{ id: 1n, name: XSS }, ...FACTIONS.slice(1)] });
    await wrapper!.findAll('[role="tab"]')[3].trigger('click');
    expect(wrapper!.find('img').exists()).toBe(false);
    expect(wrapper!.get('.faction-name').text()).toBe(XSS);
  });

  it('leaves the header meta to the identity row on mobile', () => {
    const ctx = world({ isDesktop: false, character: { ...HERO, pendingLevels: 1n } });
    wrapper = mount(StatsMeta, { global: ctx.global });
    expect(wrapper!.find('.stats-meta').exists()).toBe(false);
  });
});
