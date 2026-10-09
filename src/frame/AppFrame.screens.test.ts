// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { computed, nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import AppFrame from './AppFrame.vue';
import type { FrameView } from '../session/frameView';
import { GAME_KEY, createInertCombatData, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import type { LedgerData } from '../ledger/ledgerContext';
import InventoryActions from '../inventory/InventoryActions.vue';
import { knownPlaces } from '../map/knownPlaces';
import MapActions from '../map/MapActions.vue';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import type { MapData } from '../map/mapContext';
import { adjacencyOf } from '../map/route';
import { SCREENS, getScreen } from '../screens/screens';

type Listener = (event: { matches: boolean }) => void;

let desktop = true;
const listeners = new Set<Listener>();

function installMatchMedia(isDesktop: boolean): void {
  desktop = isDesktop;
  listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      get matches() {
        return desktop;
      },
      media: query,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    }),
  );
  window.matchMedia = globalThis.matchMedia;
}

const view: FrameView = {
  characterName: 'Brannoch',
  avatarInitial: 'B',
  classLine: 'Lv 6 · Wizard',
  accountLine: 'Lv 6 · Elf Wizard',
  hp: 212n,
  maxHp: 260n,
  mana: 80n,
  maxMana: 120n,
  stamina: 50n,
  maxStamina: 90n,
  placeLabel: 'Ashfall Wilds · Ember Gate',
  locationName: 'Ember Gate',
  timeOfDay: 'day',
  levelUp: false,
  newSkill: false,
};

let wrapper: VueWrapper | null = null;

function mountFrame(isDesktop: boolean, game?: GameData, ledger?: LedgerData, map?: MapData): VueWrapper {
  installMatchMedia(isDesktop);
  const provide: Record<symbol, unknown> = {};
  if (game) provide[GAME_KEY as symbol] = game;
  if (ledger) provide[LEDGER_KEY as symbol] = ledger;
  if (map) provide[MAP_KEY as symbol] = map;
  wrapper = mount(AppFrame, {
    attachTo: document.body,
    props: { view, reconnecting: false, nextRetryAt: null, versionPrompt: false },
    ...(game || ledger || map ? { global: { provide } } : {}),
  });
  return wrapper;
}

// A writable fake game: the inert shape with the rows the Map and Social sheets read.
function fakeGame(over: Record<string, unknown> = {}): { game: GameData; moveCharacter: ReturnType<typeof vi.fn> } {
  const moveCharacter = vi.fn().mockResolvedValue(undefined);
  const game = {
    ...createInertGame(),
    connected: ref(true),
    // The self block menu (51.1-13) reads your race and class in a party.
    character: ref({ id: 1n, name: 'Brannoch', race: 'Human', className: 'Wizard', locationId: 10n, level: 6n }),
    characterId: ref(1n),
    locations: ref([
      { id: 10n, name: 'Ember Gate', description: '', regionId: 1n, isSafe: false, levelOffset: 0n, terrainType: 'town', bindStone: false, craftingAvailable: false },
      { id: 11n, name: 'Gloamwood', description: '', regionId: 1n, isSafe: false, levelOffset: 0n, terrainType: 'woods', bindStone: false, craftingAvailable: false },
    ]),
    regions: ref([{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 600n }]),
    connections: ref([{ fromLocationId: 10n, toLocationId: 11n }]),
    reducers: ref({ moveCharacter, submitIntent: vi.fn().mockResolvedValue(undefined) }),
    ...over,
  } as unknown as GameData;
  return { game, moveCharacter };
}

// A ready map hub over the fake game's two places (the Map drawer renders once its data applied).
function readyMap(game: GameData): MapData {
  const known = computed(() =>
    knownPlaces({
      visitedIds: [10n, 11n],
      currentLocationId: 10n,
      connections: [
        { fromLocationId: 10n, toLocationId: 11n },
        { fromLocationId: 11n, toLocationId: 10n },
      ],
      locations: game.locations.value,
    }),
  );
  const selectedId = ref<bigint | null>(null);
  const shownRegionId = ref<bigint | null>(null);
  return {
    ...createInertMap(),
    ready: ref(true),
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
    selectedId,
    shownRegionId,
    select: (id: bigint | null) => {
      selectedId.value = id;
    },
    showRegion: (id: bigint | null) => {
      shownRegionId.value = id;
    },
  } as unknown as MapData;
}

function partyRows(): Record<string, unknown> {
  return {
    group: ref({ id: 1n, leaderCharacterId: 2n }),
    groupMembers: ref([
      { id: 11n, groupId: 1n, characterId: 1n, joinedAt: { microsSinceUnixEpoch: 100n } },
      { id: 12n, groupId: 1n, characterId: 2n, joinedAt: { microsSinceUnixEpoch: 200n } },
    ]),
    knownCharacters: ref([
      { id: 2n, name: 'Mara', race: 'Human', className: 'Ranger', level: 4n, hp: 95n, maxHp: 100n, mana: 20n, maxMana: 40n, stamina: 10n, maxStamina: 10n },
    ]),
  };
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

const mapSheetTab = (w: VueWrapper, name: string) =>
  w.get('[role="dialog"] [role="tablist"][aria-label="Map sheet view"]').findAll('[role="tab"]').find((t) => t.text() === name)!;

const HEADER_CASES: ReadonlyArray<{ id: string; title: string; line1: string }> = [
  { id: 'map', title: 'Map', line1: 'No places discovered yet.' },
  { id: 'bag', title: 'Inventory', line1: 'Your backpack is empty.' },
  { id: 'stats', title: 'Stats', line1: 'No stats to show yet.' },
  { id: 'craft', title: 'Crafting', line1: 'No recipes known yet.' },
  { id: 'social', title: 'Social', line1: 'No friends or party yet.' },
  { id: 'events', title: 'World events', line1: 'No world events right now.' },
];

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

describe('desktop drawer', () => {
  for (const { id, title, line1 } of HEADER_CASES) {
    it(`header button ${id} opens one dialog titled "${title}" with its empty state`, async () => {
      const w = mountFrame(true);
      const button = w.get(`button[data-screen="${id}"]`);
      await button.trigger('click');
      await settle();
      const dialogs = w.findAll('[role="dialog"]');
      expect(dialogs).toHaveLength(1);
      expect(dialogs[0].get('h4').text()).toBe(title);
      expect(dialogs[0].text()).toContain(line1);
      expect(button.attributes('aria-pressed')).toBe('true');
    });
  }

  it('a second header button replaces the drawer; the open screen button closes it', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await w.get('button[data-screen="bag"]').trigger('click');
    await settle();
    expect(w.findAll('[role="dialog"]')).toHaveLength(1);
    expect(w.get('[role="dialog"] h4').text()).toBe('Inventory');
    expect(w.get('button[data-screen="map"]').attributes('aria-pressed')).toBe('false');

    await w.get('button[data-screen="bag"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('Escape closes the drawer and returns focus to the opening header button', async () => {
    const w = mountFrame(true);
    const button = w.get('button[data-screen="stats"]');
    (button.element as HTMLElement).focus();
    await button.trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    pressEscape();
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(button.element);
  });

  it('the close button closes the drawer and returns focus to the opening button', async () => {
    const w = mountFrame(true);
    const button = w.get('button[data-screen="craft"]');
    await button.trigger('click');
    await settle();
    await w.get('[role="dialog"] button[aria-label="Close Crafting"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(button.element);
  });

  it('keeps the header and the vitals rail present while the drawer is open', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    expect(w.find('.header-bar').exists()).toBe(true);
    expect(w.find('.vitals-rail').exists()).toBe(true);
    expect(w.get('.vitals-rail').text()).toContain('Brannoch');
    // The drawer lives inside the frame body next to the rail, not around it.
    expect(w.get('.frame-body').find('.drawer').exists()).toBe(true);
    expect(w.get('.header-bar').find('.drawer').exists()).toBe(false);
  });

  it('Tab on the last focusable element inside the drawer moves focus to its close button', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    const close = w.get('[role="dialog"] button[aria-label="Close Map"]');
    (close.element as HTMLElement).focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    close.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close.element);
  });

  it('Escape with the account menu open closes the menu and leaves the drawer open', async () => {
    const w = mountFrame(true);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    await w.get('button[aria-label="Account menu"]').trigger('click');
    await settle();
    const item = w.get('[role="menuitem"]');
    expect(document.activeElement).toBe(item.element);
    item.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(w.find('[role="menu"]').exists()).toBe(false);
    expect(w.find('section.drawer').exists()).toBe(true);
  });
});

describe('mobile sheets', () => {
  const TAB_CASES: ReadonlyArray<{ tab: string; title: string }> = [
    { tab: 'map', title: 'Map' },
    { tab: 'bag', title: 'Inventory' },
    { tab: 'party', title: 'Social' },
  ];

  for (const { tab, title } of TAB_CASES) {
    it(`tab ${tab} opens the "${title}" sheet`, async () => {
      const w = mountFrame(false);
      await w.get(`button[data-tab="${tab}"]`).trigger('click');
      await settle();
      expect(w.findAll('[role="dialog"]')).toHaveLength(1);
      expect(w.get('section.sheet h4').text()).toBe(title);
      expect(w.get(`button[data-tab="${tab}"]`).attributes('aria-pressed')).toBe('true');
    });
  }

  it('Story closes any open sheet', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="bag"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    await w.get('button[data-tab="story"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.get('button[data-tab="story"]').attributes('aria-pressed')).toBe('true');
  });

  it('More opens a sheet listing Stats, Crafting, Events, Vendor and Log out', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="more"]').trigger('click');
    await settle();
    const sheet = w.get('[role="dialog"]');
    expect(sheet.get('h4').text()).toBe('More');
    const rows = sheet.findAll('button.more-row').map((b) => b.text());
    expect(rows).toEqual(['Stats', 'Crafting', 'Events', 'Vendor', 'Log out']);
  });

  it('More then Vendor opens the Trade sheet; closing returns focus to the More tab', async () => {
    const w = mountFrame(false);
    const more = w.get('button[data-tab="more"]');
    await more.trigger('click');
    await settle();
    const vendor = w.findAll('button.more-row').find((b) => b.text() === 'Vendor');
    expect(vendor).toBeDefined();
    await vendor!.trigger('click');
    await settle();
    expect(w.findAll('[role="dialog"]')).toHaveLength(1);
    expect(w.get('[role="dialog"] h4').text()).toBe('Trade');
    expect(w.get('[role="dialog"]').text()).toContain('No vendor here.');
    expect(w.get('button[data-tab="more"]').attributes('aria-pressed')).toBe('true');

    await w.get('[role="dialog"] button[aria-label="Close Trade"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(more.element);
  });

  const MORE_CASES: ReadonlyArray<{ row: string; title: string; line1: string }> = [
    { row: 'Stats', title: 'Stats', line1: 'No stats to show yet.' },
    { row: 'Crafting', title: 'Crafting', line1: 'No recipes known yet.' },
    { row: 'Vendor', title: 'Trade', line1: 'No vendor here.' },
  ];

  for (const { row, title, line1 } of MORE_CASES) {
    it(`More then ${row} opens the "${title}" sheet with More pressed and the tab bar still visible`, async () => {
      const w = mountFrame(false);
      await w.get('button[data-tab="more"]').trigger('click');
      await settle();
      const target = w.findAll('button.more-row').find((b) => b.text() === row);
      expect(target).toBeDefined();
      await target!.trigger('click');
      await settle();
      expect(w.findAll('[role="dialog"]')).toHaveLength(1);
      expect(w.get('section.sheet h4').text()).toBe(title);
      expect(w.get('[role="dialog"]').text()).toContain(line1);
      expect(w.get('button[data-tab="more"]').attributes('aria-pressed')).toBe('true');
      expect(w.find('.tab-bar').exists()).toBe(true);
    });
  }

  it('the tab bar stays present while the Bag sheet is open', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="bag"]').trigger('click');
    await settle();
    expect(w.find('.tab-bar').exists()).toBe(true);
    expect(w.get('[role="dialog"]').text()).toContain('Your backpack is empty.');
  });

  it('the Inventory header meta shows the slot count once a character and two bag items have applied', async () => {
    const { game } = fakeGame({
      character: ref({ id: 1n, name: 'Brannoch', locationId: 10n, level: 6n, gold: 120n }),
    });
    const bagRow = (id: bigint) => ({ id, templateId: 1n, ownerCharacterId: 1n, quantity: 1n, equippedSlot: undefined });
    const ledger: LedgerData = {
      ...createInertLedger(),
      items: ref([bagRow(1n), bagRow(2n)]),
      itemsApplied: ref(true),
    } as unknown as LedgerData;
    const w = mountFrame(true, game, ledger);
    await w.get('button[data-screen="bag"]').trigger('click');
    await settle();
    expect(w.get('[role="dialog"]').text()).toContain('2 / 50 slots');
    expect(w.get('.drawer-meta').text()).toBe('2 / 50 slots');
  });

  // Plan 50-39: the header gold and Organize sit after the spacer, before the close button.
  function bagWorld() {
    const { game } = fakeGame({
      character: ref({ id: 1n, name: 'Brannoch', locationId: 10n, level: 6n, gold: 1284n }),
    });
    const bagRow = (id: bigint) => ({ id, templateId: 1n, ownerCharacterId: 1n, quantity: 1n, equippedSlot: undefined });
    const ledger: LedgerData = {
      ...createInertLedger(),
      items: ref([bagRow(1n), bagRow(2n)]),
      itemsApplied: ref(true),
    } as unknown as LedgerData;
    return { game, ledger };
  }

  it('the Inventory drawer header carries the gold and Organize after the spacer, before the close button', async () => {
    const { game, ledger } = bagWorld();
    const w = mountFrame(true, game, ledger);
    await w.get('button[data-screen="bag"]').trigger('click');
    await settle();
    expect(w.get('.drawer-meta').text()).toBe('2 / 50 slots');
    const actions = w.get('.drawer-actions');
    expect(actions.find('.gold').attributes('aria-label')).toBe('1284 gold');
    expect(actions.get('button.organize').text()).toBe('Organize');
    expect(actions.element.previousElementSibling?.className).toBe('drawer-spacer');
    expect(actions.element.nextElementSibling).toBe(w.get('button.drawer-close').element);
  });

  it('the Inventory sheet header carries the Organize backpack button on mobile', async () => {
    const { game, ledger } = bagWorld();
    const w = mountFrame(false, game, ledger);
    await w.get('button[data-tab="bag"]').trigger('click');
    await settle();
    const actions = w.get('.sheet-actions');
    expect(actions.find('button[aria-label="Organize backpack"]').exists()).toBe(true);
    expect(w.get('.sheet-header').text()).toContain('2 / 50');
  });

  it('the registry gives only the Inventory and Map screens header actions', () => {
    expect(getScreen('bag').actions).toBe(InventoryActions);
    expect(getScreen('map').actions).toBe(MapActions);
    for (const def of SCREENS) {
      if (def.id !== 'bag' && def.id !== 'map') expect(def.actions).toBeUndefined();
    }
  });

  it('Escape closes a mobile sheet', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    pressEscape();
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });
});

describe('mobile sheet bodies (CON-03, CON-04)', () => {
  it('the desktop Map drawer shows the legend and the route graph instead of the old empty state', async () => {
    const { game } = fakeGame(partyRows());
    const w = mountFrame(true, game, undefined, readyMap(game));
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    const dialog = w.get('[role="dialog"]');
    expect(dialog.get('h4').text()).toBe('Map');
    expect(dialog.get('.legend').text()).toContain('Safety for Lv 6:');
    expect(dialog.get('[role="group"]').attributes('aria-label')).toBe('Ashfall Wilds route graph');
    expect(dialog.findAll('button.node')).toHaveLength(2);
    expect(dialog.text()).not.toContain('No places discovered yet.');
    expect(dialog.text()).not.toContain('This screen is still being built.');
  });

  it('desktop Social keeps its Phase 45 empty state even with a provided game', async () => {
    const { game } = fakeGame(partyRows());
    const w = mountFrame(true, game);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    // not ready: the Map draws nothing yet (no placeholder graph)
    expect(w.get('[role="dialog"]').find('.legend').exists()).toBe(false);
    expect(w.get('[role="dialog"]').text()).not.toContain('No places discovered yet.');
    await w.get('button[data-screen="social"]').trigger('click');
    await settle();
    expect(w.get('[role="dialog"]').text()).toContain('No friends or party yet.');
  });

  it('the Map tab sheet shows the Map empty state, and its Here tab holds the Here, Nearby and Tracking sections', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    const sheet = w.get('[role="dialog"]');
    expect(sheet.text()).toContain('No places discovered yet.');
    await mapSheetTab(w, 'Here').trigger('click');
    await settle();
    expect(sheet.findAll('h6').map((h) => h.text())).toEqual(['Here', 'Nearby', 'Tracking']);
    expect(sheet.text()).toContain('Your location appears here.');
    expect(sheet.text()).not.toContain('No places discovered yet.');
  });

  it('the Map sheet lists exit rows; expanding one and pressing Travel moves the character and closes the sheet', async () => {
    const { game, moveCharacter } = fakeGame();
    const w = mountFrame(false, game, undefined, readyMap(game));
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    await mapSheetTab(w, 'Here').trigger('click');
    await settle();
    const rows = w.get('[role="dialog"]').findAll('button.exit-row');
    expect(rows.map((r) => r.get('.exit-name').text())).toEqual(['Gloamwood']);
    await rows[0].trigger('click');
    await settle();
    expect(moveCharacter).not.toHaveBeenCalled();
    await w.get('[role="dialog"] .exit-panel button.btn-primary').trigger('click');
    await settle();
    expect(moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 11n });
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  // Plan 51-11: the mobile Map sheet at 390x844 (the real frame, so the console closes the sheet).
  function mobileWorld(over: Record<string, unknown> = {}) {
    const bindLocation = vi.fn().mockResolvedValue(undefined);
    const moveCharacter = vi.fn().mockResolvedValue(undefined);
    const submitIntent = vi.fn().mockResolvedValue(undefined);
    const { game } = fakeGame({
      character: ref({ id: 1n, name: 'Brannoch', locationId: 10n, level: 6n, stamina: 50n }),
      locations: ref([
        { id: 10n, name: 'Ember Gate', description: '', regionId: 1n, isSafe: false, levelOffset: 0n, terrainType: 'town', bindStone: true, craftingAvailable: false },
        { id: 11n, name: 'Gloamwood', description: '', regionId: 1n, isSafe: false, levelOffset: 0n, terrainType: 'woods', bindStone: false, craftingAvailable: false },
      ]),
      npcsHere: ref([{ id: 3n, name: 'Aldric', npcType: 'quest', locationId: 10n }]),
      reducers: ref({ moveCharacter, submitIntent, bindLocation }),
      ...over,
    });
    return { game, bindLocation, moveCharacter, submitIntent };
  }

  it('the Map tab opens a dialog titled Map with the region as meta, the tab bar still rendered and the Map tab selected', async () => {
    const { game } = mobileWorld();
    const w = mountFrame(false, game, undefined, readyMap(game));
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    const dialog = w.get('[role="dialog"]');
    expect(dialog.get('h4').text()).toBe('Map');
    expect(dialog.get('.sheet-header').text()).toContain('Ashfall Wilds');
    expect(w.find('button[data-tab="map"]').exists()).toBe(true);
    expect(w.find('button[data-tab="bag"]').exists()).toBe(true);
    expect(mapSheetTab(w, 'Map').attributes('aria-selected')).toBe('true');
    expect(mapSheetTab(w, 'Here').attributes('aria-selected')).toBe('false');
    expect(dialog.find('.sheet-map').exists()).toBe(true);
    expect(dialog.find('.dock').exists()).toBe(true);
  });

  it('picking a neighbour node and pressing the dock Travel moves the character and keeps the sheet open', async () => {
    const { game, moveCharacter } = mobileWorld();
    const w = mountFrame(false, game, undefined, readyMap(game));
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    await w.get('[role="dialog"] button.node[data-node-id="11"]').trigger('click');
    await settle();
    expect(w.get('[role="dialog"] .dock-name').text()).toBe('Gloamwood');
    expect(moveCharacter).not.toHaveBeenCalled();
    await w.get('[role="dialog"] .dock button.travel-button').trigger('click');
    await settle();
    expect(moveCharacter).toHaveBeenCalledTimes(1);
    expect(moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 11n });
    expect(w.find('[role="dialog"]').exists()).toBe(true);
  });

  it('the Here tab shows Here, Nearby and Tracking, and its Talk closes the sheet', async () => {
    const { game, submitIntent } = mobileWorld();
    const w = mountFrame(false, game, undefined, readyMap(game));
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    await mapSheetTab(w, 'Here').trigger('click');
    await settle();
    const dialog = w.get('[role="dialog"]');
    // With a placed character the Here card is the travel panel (a kicker, no empty heading).
    expect(dialog.find('.here-column .card-kicker').exists()).toBe(true);
    expect(dialog.findAll('h6').map((h) => h.text())).toEqual(['Nearby', 'Tracking']);
    await dialog.get('[aria-label="Talk to Aldric"]').trigger('click');
    await settle();
    expect(submitIntent).toHaveBeenCalled();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('Examine from the Here tab closes the sheet', async () => {
    const { game, submitIntent } = mobileWorld();
    const w = mountFrame(false, game, undefined, readyMap(game));
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    await mapSheetTab(w, 'Here').trigger('click');
    await settle();
    await w.get('[role="dialog"] [aria-label="Examine Aldric"]').trigger('click');
    await settle();
    expect(submitIntent).toHaveBeenCalled();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('Bind from the Here tab calls bindLocation with the character', async () => {
    const { game, bindLocation } = mobileWorld();
    const w = mountFrame(false, game, undefined, readyMap(game));
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    await mapSheetTab(w, 'Here').trigger('click');
    await settle();
    await w.get('[role="dialog"] [aria-label="Bind to Ember Gate"]').trigger('click');
    await settle();
    expect(bindLocation).toHaveBeenCalledWith({ characterId: 1n });
  });

  it('the Party tab sheet shows the Party header, Invite and the solo empty state (51.1 Plan 16)', async () => {
    const w = mountFrame(false);
    await w.get('button[data-tab="party"]').trigger('click');
    await settle();
    const sheet = w.get('[role="dialog"]');
    expect(sheet.get('h4').text()).toBe('Social');
    expect(sheet.get('h6').text()).toBe('Party');
    expect(sheet.text()).toContain('Invite');
    // Plan 16 replaces the Phase 45 placeholder on mobile with the solo state.
    expect(sheet.text()).toContain("You're travelling alone.");
    expect(sheet.text()).toContain('Invite someone by name, or use the menu on a player in Nearby.');
    expect(sheet.text()).not.toContain('No friends or party yet.');
    expect(sheet.text()).not.toContain('This screen is still being built.');
  });

  it('in a party the sheet shows the Party sheet: the self card, the member cards and no empty state', async () => {
    const { game } = fakeGame(partyRows());
    const w = mountFrame(false, game);
    await w.get('button[data-tab="party"]').trigger('click');
    await settle();
    const sheet = w.get('[role="dialog"]');
    expect(sheet.get('h6').text()).toBe('Party · 2');
    expect(sheet.text()).toContain('Mara');
    expect(sheet.text()).toContain('Brannoch (you)');
    expect(sheet.text()).not.toContain('No friends or party yet.');
    expect(sheet.text()).not.toContain("You're travelling alone.");
    expect(sheet.find('.notice-line').exists()).toBe(false);
  });

  it('Invite in the Social sheet closes the sheet and puts "invite " in the composer input', async () => {
    const { game } = fakeGame();
    const w = mountFrame(false, game);
    await w.get('button[data-tab="party"]').trigger('click');
    await settle();
    await w.get('[role="dialog"] button.invite').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect((w.get('input.composer-input').element as HTMLInputElement).value).toBe('invite ');
  });

  it('tapping the strip party chip opens the Social sheet', async () => {
    const { game } = fakeGame(partyRows());
    const w = mountFrame(false, game);
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    await w.get('button.party-chip').trigger('click');
    await settle();
    expect(w.get('[role="dialog"] h4').text()).toBe('Social');
  });
});

describe('combat (48-05)', () => {
  function combatGame(): { game: GameData; active: Ref<boolean>; enemies: Ref<unknown[]> } {
    const { game } = fakeGame();
    const active = ref(false);
    const enemies = ref<unknown[]>([]);
    const combat = { ...createInertCombatData(), active, enemies };
    return { game: { ...game, combat } as unknown as GameData, active, enemies };
  }

  it('closes an open Map drawer the moment combat starts', async () => {
    const { game, active } = combatGame();
    const w = mountFrame(true, game);
    await w.get('button[data-screen="map"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    active.value = true;
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('closes an open mobile Map sheet the moment combat starts', async () => {
    const { game, active } = combatGame();
    const w = mountFrame(false, game);
    await w.get('button[data-tab="map"]').trigger('click');
    await settle();
    expect(w.get('[role="dialog"] h4').text()).toBe('Map');
    active.value = true;
    await settle();
    expect(w.findAll('[role="dialog"] h4').map((h) => h.text())).not.toContain('Map');
  });

  it('does not open a header drawer while in combat', async () => {
    const { game, active } = combatGame();
    active.value = true;
    const w = mountFrame(true, game);
    await w.get('button[data-screen="bag"]').trigger('click');
    await settle();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('renders a hidden status element that carries the target line as text', async () => {
    const { game, active, enemies } = combatGame();
    active.value = true;
    enemies.value = [{ id: 9n, combatId: 1n, displayName: '<img src=x onerror=alert(1)>', currentHp: 10n, maxHp: 10n }];
    const reducers = { setCombatTarget: vi.fn().mockResolvedValue(undefined) };
    (game.reducers as Ref<unknown>).value = reducers;
    const w = mountFrame(true, game);
    const status = w.get('[role="status"].target-status');
    expect(status.text()).toBe('');
    // Tab with the body focused (the composer input may hold focus after mount) targets the only living hostile.
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await settle();
    expect(reducers.setCombatTarget).toHaveBeenCalledWith({ characterId: 1n, enemyId: 9n });
    // The line follows the server: nothing is announced until the character row echoes the target.
    expect(status.text()).toBe('');
    const character = game.character as Ref<Record<string, unknown>>;
    character.value = { ...character.value, combatTargetEnemyId: 9n };
    await settle();
    expect(status.text()).toBe('Target: <img src=x onerror=alert(1)>');
    expect(status.find('img').exists()).toBe(false);
  });

  it('shows an empty status element outside combat', () => {
    const w = mountFrame(true);
    expect(w.get('[role="status"].target-status').text()).toBe('');
  });
});
