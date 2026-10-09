// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ContextContent from './ContextContent.vue';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { ConsoleApi, FrameControls, GameData } from '../game/context';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import type { MapData } from '../map/mapContext';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

const REGIONS = [{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 600n }];

function loc(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: '',
    regionId: 1n,
    isSafe: false,
    levelOffset: 0n,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
    ...over,
  };
}

const LOCATIONS = [
  loc(10n, 'Ember Gate'),
  loc(11n, 'Cinder Road'),
  loc(12n, 'Ridge Pass', { levelOffset: 2n }),
  loc(13n, 'Hearthstead', { isSafe: true }),
];

const CHARACTER = { id: 1n, name: 'Hero', locationId: 10n, level: 6n };

// Nearby's pool groups wait for the place's pool rows (51.3.1.1-19). An empty Nearby at a safe place
// with its rows applied shows the Phase 45 empty line; a non-safe place would show 'Nothing hunts here now.'.
const QUIET_HERE = { character: ref({ ...CHARACTER, locationId: 13n }), poolsAppliedFor: () => true };

interface Setup {
  game?: Record<string, unknown>;
}

function mountContent(setup: Setup = {}) {
  const calls = {
    hail: vi.fn(),
    travel: vi.fn(),
    gather: vi.fn(),
    examine: vi.fn(),
    whisperTo: vi.fn(),
    invite: vi.fn(),
    trade: vi.fn(),
    pull: vi.fn(),
    fight: vi.fn(),
  };
  const game = {
    ...createInertGame(),
    connected: ref(true),
    character: ref(CHARACTER),
    characterId: ref(1n),
    locations: ref(LOCATIONS),
    regions: ref(REGIONS),
    ...setup.game,
  } as unknown as GameData;
  const consoleApi = { ...createInertConsole(), ...calls } as unknown as ConsoleApi;
  // The frame records its calls in order so the Trade sequence (open only, no close) can be asserted.
  const frameOrder: string[] = [];
  const frameCalls = {
    closeScreen: vi.fn(() => {
      frameOrder.push('close');
    }),
    openScreen: vi.fn((id: string, args?: unknown) => {
      frameOrder.push(`open:${id}:${args === undefined ? '' : 'args'}`);
    }),
  };
  const frame = { ...createInertFrame(), ...frameCalls } as unknown as FrameControls;
  // The map hub has applied: the rail's exit rows render only then (51-10).
  const map = { ...createInertMap(), ready: ref(true) } as unknown as MapData;
  wrapper = mount(ContextContent, {
    global: {
      provide: {
        [MAP_KEY as symbol]: map,
        [GAME_KEY as symbol]: game,
        [CONSOLE_KEY as symbol]: consoleApi,
        [FRAME_KEY as symbol]: frame,
      },
    },
  });
  return { w: wrapper, calls, frameCalls, frameOrder };
}

function lists(over: Record<string, unknown>): Setup {
  const game: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(over)) game[key] = ref(value);
  return { game };
}

describe('ContextContent with no character data (Phase 45 lines)', () => {
  it('renders three sections with the Here, Nearby and Tracking headings and empty lines', () => {
    wrapper = mount(ContextContent);
    const sections = wrapper.findAll('section');
    expect(sections).toHaveLength(3);
    expect(wrapper.findAll('h6').map((h) => h.text())).toEqual(['Here', 'Nearby', 'Tracking']);
    expect(sections[0].get('p').text()).toBe('Your location appears here.');
    expect(sections[1].get('p').text()).toBe('No one is nearby.');
    expect(sections[2].get('p').text()).toBe('No quests tracked.');
  });

  it('keeps the Nearby and Tracking empty lines when a character exists but nothing is around', () => {
    const { w } = mountContent({ game: QUIET_HERE });
    expect(w.text()).toContain('No one is nearby.');
    expect(w.text()).toContain('No quests tracked.');
    expect(w.find('.event-card').exists()).toBe(false);
  });
});

describe('Here card', () => {
  it('shows the region kicker and the location title', () => {
    const { w } = mountContent();
    expect(w.get('.card-kicker').text()).toBe('Here · Ashfall Wilds');
    expect(w.get('.here-card .card-title').text()).toBe('Ember Gate');
  });

  it('shows Unknown place for a missing location or region', () => {
    const missingLocation = mountContent(lists({ character: { ...CHARACTER, locationId: 99n } }));
    expect(missingLocation.w.get('.here-card .card-title').text()).toBe('Unknown place');
    wrapper?.unmount();
    const missingRegion = mountContent(lists({ regions: [] }));
    expect(missingRegion.w.get('.here-card .card-title').text()).toBe('Unknown place');
  });

  it('renders one exit row per destination with the ring, the name and its safety rating (51.3.1.1-20)', () => {
    const setup = lists({
      connections: [
        { fromLocationId: 10n, toLocationId: 11n },
        { fromLocationId: 10n, toLocationId: 12n },
        { fromLocationId: 10n, toLocationId: 13n },
        { fromLocationId: 11n, toLocationId: 10n },
      ],
      // Cinder Road: Stable at Lv 6 for the level-6 hero (Quiet); Ridge Pass: Overrun at Lv 7-9 (Deadly).
      poolLevels: [
        { id: 1n, regionId: 1n, locationId: 11n, kind: 'creature', level: 2n, lvLo: 6n, lvHi: 6n },
        { id: 2n, regionId: 1n, locationId: 12n, kind: 'creature', level: 3n, lvLo: 7n, lvHi: 9n },
      ],
    });
    const { w } = mountContent({ game: { ...setup.game, poolsAppliedFor: () => true } });
    const rows = w.findAll('button.exit-row');
    expect(rows.map((r) => r.get('.exit-name').text())).toEqual(['Cinder Road', 'Hearthstead', 'Ridge Pass']);
    for (const row of rows) expect(row.find('.ring svg').exists()).toBe(true);
    expect(rows.map((r) => r.get('.exit-right .rating-mark').text())).toEqual(['Quiet', 'Safe', 'Deadly']);
    expect(rows.map((r) => r.find('.exit-right .exit-range').exists() ? r.get('.exit-range').text() : '')).toEqual([
      'Lv 6',
      '',
      'Lv 7–9',
    ]);
    expect(rows[0].get('.ring').classes()).toContain('rate-quiet');
    expect(rows[1].get('.ring').classes()).toContain('rate-safe');
    expect(rows[2].get('.ring').classes()).toContain('rate-deadly');
  });

  it('shows No known routes. with no connections', () => {
    const { w } = mountContent();
    expect(w.findAll('button.exit-row')).toHaveLength(0);
    expect(w.text()).toContain('No known routes.');
  });

  it('a row click only expands it; the inner Travel button travels', async () => {
    const { w, calls } = mountContent(
      lists({ connections: [{ fromLocationId: 10n, toLocationId: 11n }] }),
    );
    await w.get('button.exit-row').trigger('click');
    expect(calls.travel).not.toHaveBeenCalled();
    await w.get('.exit-panel button.btn-primary').trigger('click');
    expect(calls.travel).toHaveBeenCalledWith({ id: 11n, name: 'Cinder Road' });
  });

  it('ellipsizes long names with the full name in the accessible name', () => {
    const long = 'The Very Long Road Of A Thousand Winding Switchbacks';
    const { w } = mountContent({
      game: {
        locations: ref([...LOCATIONS, loc(14n, long)]),
        connections: ref([{ fromLocationId: 10n, toLocationId: 14n }]),
      },
    });
    expect(w.get('button.exit-row').attributes('aria-label')).toContain(long);
    expect(w.get('.exit-label').text()).toBe(long);
  });
});

// A player as the generated Character row gives it: Nearby lists only online characters (51.1-12)
// and the player menu header reads race and class.
const PERSON = { race: 'Orc', className: 'Shaman', locationId: 10n, online: true };

describe('Nearby list', () => {
  const NEARBY = lists({
    npcsHere: [
      { id: 2n, name: 'Marta', npcType: 'vendor' },
      { id: 3n, name: 'Aldric', npcType: 'quest' },
    ],
    playersHere: [
      { ...PERSON, id: 1n, name: 'Hero', level: 6n },
      { ...PERSON, id: 5n, name: 'Zed', level: 7n },
      { ...PERSON, id: 4n, name: 'Bo', level: 3n },
      { ...PERSON, id: 6n, name: 'Away', level: 2n, online: false },
    ],
  });

  it('orders NPCs and players, lists no resource node, hides the active character, and shows hints', () => {
    const { w } = mountContent(NEARBY);
    const rows = w.findAll('.nearby-row');
    expect(rows.map((r) => r.get('.row-name').text())).toEqual(['Aldric', 'Marta', 'Bo', 'Zed']);
    expect(rows[0].get('.row-hint').text()).toBe('NPC');
    expect(rows[2].get('.row-hint').text()).toBe('Lv 3');
    // 'Away' is offline, so Nearby does not list it (51.1 CONTEXT Area 2).
    expect(w.text()).not.toContain('Away');
    expect(w.text()).not.toContain('No one is nearby.');
  });

  it('hails an NPC through the Talk button, not the row (the row is static)', async () => {
    const { w, calls } = mountContent(NEARBY);
    const row = w.findAll('.nearby-row')[0];
    expect(row.find('button.row-main').exists()).toBe(false);
    await row.get('.row-main').trigger('click');
    expect(calls.hail).not.toHaveBeenCalled();
    await row.get('[aria-label="Talk to Aldric"]').trigger('click');
    expect(calls.hail).toHaveBeenCalledWith({ id: 3n, name: 'Aldric' });
  });

  it('gives only vendors a Trade button, which opens the Vendor screen for that NPC through the frame', async () => {
    const { w, calls, frameCalls, frameOrder } = mountContent(NEARBY);
    expect(w.findAll('[aria-label^="Trade with"]')).toHaveLength(1);
    const trade = w.get('[aria-label="Trade with Marta"]');
    expect(trade.classes()).toEqual(expect.arrayContaining(['btn', 'btn-ghost', 'btn-icon']));
    expect(trade.attributes('title')).toBe('Trade with Marta');
    await trade.trigger('click');
    expect(frameOrder).toEqual(['open:vendor:args']);
    expect(frameCalls.closeScreen).not.toHaveBeenCalled();
    expect(frameCalls.openScreen).toHaveBeenCalledWith('vendor', { npcId: 2n, npcName: 'Marta' });
    expect(calls.trade).not.toHaveBeenCalled();
    expect(calls.hail).not.toHaveBeenCalled();
  });

  it('does nothing on a Trade click while disconnected', async () => {
    const { w, calls, frameCalls } = mountContent({
      game: { ...NEARBY.game, connected: ref(false) },
    });
    await w.get('[aria-label="Trade with Marta"]').trigger('click');
    expect(frameCalls.closeScreen).not.toHaveBeenCalled();
    expect(frameCalls.openScreen).not.toHaveBeenCalled();
    expect(calls.trade).not.toHaveBeenCalled();
  });

  it('has no node row and no row click that gathers (51.3.1.1-18)', () => {
    const { w, calls } = mountContent(NEARBY);
    expect(w.text()).not.toContain('Vein');
    expect(w.find('button.row-main').exists()).toBe(false);
    expect(w.find('.nearby-row.depleted').exists()).toBe(false);
    expect(calls.gather).not.toHaveBeenCalled();
  });

  it('gives players always-visible Whisper, Examine and menu buttons and no row action', async () => {
    const { w, calls } = mountContent(NEARBY);
    const bo = w.findAll('.nearby-row')[2];
    expect(bo.find('button.row-main').exists()).toBe(false);
    expect(bo.findAll('button').map((b) => b.attributes('aria-label'))).toEqual([
      'Whisper Bo',
      'Examine Bo',
      'Actions for Bo',
    ]);
    await bo.get('[aria-label="Whisper Bo"]').trigger('click');
    expect(calls.whisperTo).toHaveBeenCalledWith('Bo');
    // Invite moved into the menu; the row has no Invite button of its own.
    expect(bo.find('[aria-label="Invite Bo"]').exists()).toBe(false);
    expect(calls.invite).not.toHaveBeenCalled();
  });

  it('never lists an object row (no source table, research Q3)', () => {
    const { w } = mountContent(NEARBY);
    expect(w.find('.kind-object').exists()).toBe(false);
    expect(w.text()).not.toContain('Examine');
  });

  it('shows the empty line with nobody and nothing here', () => {
    const { w } = mountContent({ game: QUIET_HERE });
    expect(w.text()).toContain('No one is nearby.');
  });

  it('ellipsizes long names with the full name in title', () => {
    const long = 'Sir Reginald Bartholomew Fitzwilliam-Montgomery the Third';
    const { w } = mountContent(lists({ npcsHere: [{ id: 2n, name: long, npcType: 'quest' }] }));
    expect(w.get('.row-name').attributes('title')).toBe(long);
  });
});

// 51.3.1.1-19: ordinary enemies are family cards now; the enemy spawns left at a place are World
// event individuals, listed as named cards with Fight (NearbyList.test.ts covers the pool groups).
describe('Nearby event enemies (51.3.1.1-19)', () => {
  const spawn = (id: bigint, name: string, state: string, extra: Record<string, unknown> = {}) => ({
    id,
    name,
    state,
    locationId: 10n,
    enemyTemplateId: 1n,
    groupCount: 1n,
    level: 0n,
    ...extra,
  });
  const ENEMIES = {
    game: {
      ...lists({
        enemiesHere: [
          spawn(3n, 'Goblin Scout', 'available', { groupCount: 3n }),
          spawn(4n, 'Ash Wolf', 'pulling'),
          spawn(5n, 'Bone Rat', 'engaged', { lockedCombatId: 1n }),
          spawn(6n, 'Ghost', 'depleted'),
        ],
        enemyTemplatesHere: [{ id: 1n, level: 8n }],
        npcsHere: [{ id: 2n, name: 'Marta', npcType: 'quest' }],
      }).game,
      poolsAppliedFor: () => true,
    },
  };
  const named = (w: VueWrapper) =>
    w.findAll('.nearby-group').find((group) => group.get('h6').text() === 'Named & quest targets')!;

  it('lists each visible spawn as a named card, never as a row, and the NPC under Also here', () => {
    const { w } = mountContent(ENEMIES);
    expect(named(w).findAll('.card-name').map((n) => n.text())).toEqual(['Ash Wolf', 'Bone Rat', 'Goblin Scout']);
    expect(w.findAll('.nearby-row').map((r) => r.get('.row-name').text())).toEqual(['Marta']);
    expect(w.find('.kind-enemy').exists()).toBe(false);
    expect(w.text()).not.toContain('Ghost');
  });

  it('colors the name by con, titles it, and gives an available spawn Fight', async () => {
    const { w, calls } = mountContent(ENEMIES);
    const card = named(w).findAll('.pool-card')[2];
    expect(card.get('.card-name').classes()).toContain('con-orange');
    expect(card.get('.card-name').attributes('title')).toBe('Goblin Scout · Hard');
    expect(card.get('.card-sub').text()).toBe('Named · Lv 8');
    const fight = card.get('button');
    expect(fight.attributes('aria-label')).toBe('Fight Goblin Scout');
    expect(fight.attributes('aria-disabled')).toBeUndefined();
    await fight.trigger('click');
    await flushPromises();
    expect(calls.fight).toHaveBeenCalledWith({ kind: 'event', id: 3n, name: 'Goblin Scout' });
    expect(calls.pull).not.toHaveBeenCalled();
  });

  it('a spawn being pulled or in a fight shows In combat and an aria-disabled Fight', async () => {
    const { w, calls } = mountContent(ENEMIES);
    const [pulling, engaged] = named(w).findAll('.pool-card');
    expect(pulling.get('.card-sub').text()).toBe('Named · Lv 8 · In combat');
    expect(engaged.get('.card-sub').text()).toBe('Named · Lv 8 · In combat');
    for (const card of [pulling, engaged]) {
      expect(card.get('button').attributes('aria-disabled')).toBe('true');
      await card.get('button').trigger('click');
    }
    expect(calls.fight).not.toHaveBeenCalled();
  });

  it('disables Fight offline and sends nothing', async () => {
    const { w, calls } = mountContent({ game: { ...ENEMIES.game, connected: ref(false) } });
    const fight = w.get('[aria-label="Fight Goblin Scout"]');
    expect(fight.attributes('aria-disabled')).toBe('true');
    await fight.trigger('click');
    await flushPromises();
    expect(calls.fight).not.toHaveBeenCalled();
  });

  it('shows no difficulty while the template level is unknown and still fights', async () => {
    const { w, calls } = mountContent({
      game: {
        ...lists({ enemiesHere: [spawn(3n, 'Rotfang', 'available')], enemyTemplatesHere: [] }).game,
        poolsAppliedFor: () => true,
      },
    });
    const card = w.get('.pool-card');
    expect(card.get('.card-name').attributes('title')).toBe('Rotfang');
    expect(card.get('.card-name').classes().filter((c) => c.startsWith('con-'))).toEqual([]);
    expect(card.get('.card-sub').text()).toBe('Named');
    expect(w.text()).not.toContain('Even match');
    await card.get('[aria-label="Fight Rotfang"]').trigger('click');
    await flushPromises();
    expect(calls.fight).toHaveBeenCalledWith({ kind: 'event', id: 3n, name: 'Rotfang' });
  });

  it('does not show the empty line when only an event enemy is present', () => {
    const { w } = mountContent({ game: { ...QUIET_HERE, ...lists({ enemiesHere: [spawn(3n, 'Goblin Scout', 'available')] }).game } });
    expect(w.text()).not.toContain('No one is nearby.');
  });

  it('renders a markup enemy name as text', () => {
    const { w } = mountContent({
      game: { ...lists({ enemiesHere: [spawn(3n, PAYLOAD, 'available')] }).game, poolsAppliedFor: () => true },
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.pool-card .card-name').text()).toBe(PAYLOAD);
    expect(w.get('.pool-card button').attributes('aria-label')).toBe(`Fight ${PAYLOAD}`);
  });
});

describe('Tracking list', () => {
  function quest(id: bigint, templateId: bigint, progress: bigint, over: Record<string, unknown> = {}) {
    return {
      id,
      characterId: 1n,
      questTemplateId: templateId,
      progress,
      completed: false,
      acceptedAt: { microsSinceUnixEpoch: id },
      completedAt: undefined,
      ...over,
    };
  }

  const TEMPLATES = [
    { id: 100n, name: 'Wolf pelts', requiredCount: 5n, description: 'Bring pelts.' },
    { id: 101n, name: 'Speak to the Warden', requiredCount: 1n, description: 'Find the Warden at the gate.' },
    { id: 102n, name: 'Clear the cellar', requiredCount: 3n, description: 'Rats.' },
  ];

  it('shows progress/required with a 3px bar when more than one step is required', () => {
    const { w } = mountContent(lists({ quests: [quest(1n, 100n, 2n)], questTemplates: TEMPLATES }));
    const block = w.get('.quest');
    expect(block.get('.quest-name').text()).toBe('Wolf pelts');
    expect(block.get('.quest-count').text()).toBe('2/5');
    expect(block.get('.fill').attributes('style')).toContain('width: 40%');
    expect(block.find('.quest-description').exists()).toBe(false);
  });

  it('shows the description instead of a bar when required is 1 or less', () => {
    const { w } = mountContent(lists({ quests: [quest(1n, 101n, 0n)], questTemplates: TEMPLATES }));
    expect(w.find('.track').exists()).toBe(false);
    expect(w.get('.quest-description').text()).toBe('Find the Warden at the gate.');
  });

  it('shows a check and Ready for a completed quest, with no bar', () => {
    const { w } = mountContent(
      lists({ quests: [quest(1n, 102n, 3n, { completed: true })], questTemplates: TEMPLATES }),
    );
    const block = w.get('.quest');
    expect(block.find('.ready-icon').exists()).toBe(true);
    expect(block.get('.quest-count').text()).toBe('Ready');
    expect(block.find('.track').exists()).toBe(false);
  });

  it('does not track a finished quest', () => {
    const { w } = mountContent(
      lists({
        quests: [quest(1n, 100n, 5n, { completed: true, completedAt: { microsSinceUnixEpoch: 9n } })],
        questTemplates: TEMPLATES,
      }),
    );
    expect(w.text()).toContain('No quests tracked.');
  });
});

describe('offline', () => {
  it('marks route and Nearby buttons aria-disabled and calls nothing on click', async () => {
    const { w, calls, frameCalls } = mountContent({
      game: {
        connected: ref(false),
        connections: ref([{ fromLocationId: 10n, toLocationId: 11n }]),
        npcsHere: ref([{ id: 2n, name: 'Marta', npcType: 'vendor' }]),
        playersHere: ref([{ ...PERSON, id: 4n, name: 'Bo', level: 3n }]),
      },
    });
    // A row button only expands its row, so it stays operable offline; the inner Travel button and
    // every other button, the player's ⋯ menu opener included, are aria-disabled (review client-rest
    // WR-04), and clicking the ⋯ opens no menu.
    await w.get('button.exit-row').trigger('click');
    const buttons = w.findAll('button').filter((b) => !b.classes().includes('exit-row'));
    expect(buttons.length).toBeGreaterThanOrEqual(7);
    expect(buttons.some((b) => b.classes().includes('menu-opener'))).toBe(true);
    for (const button of buttons) {
      expect(button.attributes('aria-disabled')).toBe('true');
      await button.trigger('click');
    }
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(w.get('button.menu-opener').attributes('aria-expanded')).toBe('false');
    for (const fn of Object.values(calls)) expect(fn).not.toHaveBeenCalled();
    expect(frameCalls.closeScreen).not.toHaveBeenCalled();
    expect(frameCalls.openScreen).not.toHaveBeenCalled();
  });

  it('does not mark buttons disabled while connected', () => {
    const { w } = mountContent(lists({ connections: [{ fromLocationId: 10n, toLocationId: 11n }] }));
    expect(w.get('button.exit-row').attributes('aria-disabled')).toBeUndefined();
    expect(w.get('.btn-eye').attributes('aria-disabled')).toBeUndefined();
  });
});

describe('text rendering', () => {
  it('renders markup in every name as text', () => {
    const { w } = mountContent({
      game: {
        character: ref(CHARACTER),
        locations: ref([loc(10n, PAYLOAD), loc(11n, PAYLOAD)]),
        regions: ref([{ id: 1n, name: PAYLOAD, dangerMultiplier: 600n }]),
        connections: ref([{ fromLocationId: 10n, toLocationId: 11n }]),
        npcsHere: ref([{ id: 2n, name: PAYLOAD, npcType: 'vendor' }]),
        playersHere: ref([{ ...PERSON, id: 4n, name: PAYLOAD, level: 3n }]),
        quests: ref([
          { id: 1n, characterId: 1n, questTemplateId: 100n, progress: 1n, completed: false, acceptedAt: { microsSinceUnixEpoch: 1n } },
        ]),
        questTemplates: ref([{ id: 100n, name: PAYLOAD, requiredCount: 1n, description: PAYLOAD }]),
      },
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.card-kicker').text()).toBe(`Here · ${PAYLOAD}`);
    expect(w.get('.here-card .card-title').text()).toBe(PAYLOAD);
    expect(w.get('.exit-name').text()).toBe(PAYLOAD);
    expect(w.findAll('.row-name').every((n) => n.text() === PAYLOAD)).toBe(true);
    expect(w.get('.quest-name').text()).toBe(PAYLOAD);
    expect(w.get('.quest-description').text()).toBe(PAYLOAD);
  });
});

describe('world event section', () => {
  it('adds a fourth sibling section only when the region has an active event', () => {
    const quiet = mountContent();
    expect(quiet.w.findAll('section')).toHaveLength(3);
    wrapper?.unmount();
    const busy = mountContent(
      lists({
        worldEvents: [
          {
            id: 1n,
            name: 'Siege',
            regionId: 1n,
            status: 'active',
            deadlineAtMicros: 0n,
            successCounter: 0n,
            failureCounter: 0n,
          },
        ],
      }),
    );
    expect(busy.w.findAll('section')).toHaveLength(4);
    expect(busy.w.findAll('section')[3].classes()).toContain('event-card');
  });
});

describe('mobile sizing and sources', () => {
  const read = (file: string) => readFileSync(resolve(process.cwd(), 'src/rails', file), 'utf8');

  it('raises rows and icon buttons to 44px under 900px', () => {
    const nearby = read('NearbyList.vue');
    expect(nearby).toContain('@media (max-width: 899px)');
    expect(nearby).toContain('min-height: 44px');
    expect(nearby).toContain('width: 44px');
    expect(nearby).toContain('height: 44px');
    const here = read('HereCard.vue');
    expect(here).toContain('@media (max-width: 899px)');
    expect(here).toContain('min-height: 44px');
  });

  it('keeps the documented copy and wiring in source', () => {
    expect(read('HereCard.vue')).toContain('No known routes.');
    expect(read('useExits.ts')).toContain('routesFrom');
    expect(read('NearbyList.vue')).toContain('Trade with');
    expect(read('NearbyList.vue')).toContain('Whisper ');
    expect(read('NearbyList.vue')).toContain('PlayerMenu');
    expect(read('NearbyList.vue')).toContain('Pull ');
  });
});
