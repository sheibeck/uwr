// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import ContextContent from './ContextContent.vue';
import { CONSOLE_KEY, FRAME_KEY, GAME_KEY, createInertConsole, createInertFrame, createInertGame } from '../game/context';
import type { ConsoleApi, FrameControls, GameData } from '../game/context';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

const REGIONS = [{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 600n }];

function loc(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return { id, name, regionId: 1n, isSafe: false, levelOffset: 0n, ...over };
}

const LOCATIONS = [
  loc(10n, 'Ember Gate'),
  loc(11n, 'Cinder Road'),
  loc(12n, 'Ridge Pass', { levelOffset: 2n }),
  loc(13n, 'Hearthstead', { isSafe: true }),
];

const CHARACTER = { id: 1n, name: 'Hero', locationId: 10n, level: 6n };

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
  const frame = { ...createInertFrame() } as unknown as FrameControls;
  wrapper = mount(ContextContent, {
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [CONSOLE_KEY as symbol]: consoleApi,
        [FRAME_KEY as symbol]: frame,
      },
    },
  });
  return { w: wrapper, calls };
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
    const { w } = mountContent();
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

  it('renders one route row per destination with an arrow, the name and a level or Safe tag', () => {
    const { w } = mountContent(
      lists({
        connections: [
          { fromLocationId: 10n, toLocationId: 11n },
          { fromLocationId: 10n, toLocationId: 12n },
          { fromLocationId: 10n, toLocationId: 13n },
          { fromLocationId: 11n, toLocationId: 10n },
        ],
      }),
    );
    const rows = w.findAll('button.route-row');
    expect(rows.map((r) => r.get('.route-name').text())).toEqual(['Cinder Road', 'Hearthstead', 'Ridge Pass']);
    for (const row of rows) expect(row.find('svg').exists()).toBe(true);
    const tags = rows.map((r) => r.get('.tag'));
    expect(tags.map((t) => t.text())).toEqual(['Lv 6', 'Safe', 'Lv 7–9']);
    expect(tags[0].classes()).toContain('tag-neutral');
    expect(tags[1].classes()).toContain('tag-accent');
    expect(tags[2].classes()).toContain('tag-neutral');
  });

  it('shows No known routes. with no connections', () => {
    const { w } = mountContent();
    expect(w.findAll('button.route-row')).toHaveLength(0);
    expect(w.text()).toContain('No known routes.');
  });

  it('travels when a route is clicked', async () => {
    const { w, calls } = mountContent(
      lists({ connections: [{ fromLocationId: 10n, toLocationId: 11n }] }),
    );
    await w.get('button.route-row').trigger('click');
    expect(calls.travel).toHaveBeenCalledWith({ id: 11n, name: 'Cinder Road' });
  });

  it('ellipsizes long names with the full name in title', () => {
    const long = 'The Very Long Road Of A Thousand Winding Switchbacks';
    const { w } = mountContent({
      game: {
        locations: ref([...LOCATIONS, loc(14n, long)]),
        connections: ref([{ fromLocationId: 10n, toLocationId: 14n }]),
      },
    });
    expect(w.get('button.route-row').attributes('title')).toBe(long);
  });
});

describe('Nearby list', () => {
  const NEARBY = lists({
    npcsHere: [
      { id: 2n, name: 'Marta', npcType: 'vendor' },
      { id: 3n, name: 'Aldric', npcType: 'quest' },
    ],
    nodesHere: [
      { id: 20n, name: 'Iron Vein', state: 'available' },
      { id: 21n, name: 'Empty Vein', state: 'depleted' },
      { id: 22n, name: 'Busy Vein', state: 'harvesting', lockedByCharacterId: 5n },
    ],
    playersHere: [
      { id: 1n, name: 'Hero', level: 6n },
      { id: 5n, name: 'Zed', level: 7n },
      { id: 4n, name: 'Bo', level: 3n },
    ],
  });

  it('orders NPCs, nodes and players, hides the active character, and shows hints', () => {
    const { w } = mountContent(NEARBY);
    const rows = w.findAll('.nearby-row');
    expect(rows.map((r) => r.get('.row-name').text())).toEqual([
      'Aldric',
      'Marta',
      'Busy Vein',
      'Empty Vein',
      'Iron Vein',
      'Bo',
      'Zed',
    ]);
    expect(rows[0].get('.row-hint').text()).toBe('NPC · hail');
    expect(rows[2].get('.row-hint').text()).toBe('In use');
    expect(rows[3].get('.row-hint').text()).toBe('Depleted');
    expect(rows[4].get('.row-hint').text()).toBe('Gather');
    expect(rows[5].get('.row-hint').text()).toBe('Lv 3');
    expect(w.text()).not.toContain('No one is nearby.');
  });

  it('hails an NPC on row click', async () => {
    const { w, calls } = mountContent(NEARBY);
    await w.findAll('.nearby-row')[0].get('button.row-main').trigger('click');
    expect(calls.hail).toHaveBeenCalledWith({ id: 3n, name: 'Aldric' });
  });

  it('gives only vendors a Trade button, which opens the Vendor screen through console.trade', async () => {
    const { w, calls } = mountContent(NEARBY);
    expect(w.findAll('[aria-label^="Trade with"]')).toHaveLength(1);
    const trade = w.get('[aria-label="Trade with Marta"]');
    expect(trade.classes()).toEqual(expect.arrayContaining(['btn', 'btn-ghost', 'btn-icon']));
    expect(trade.attributes('title')).toBe('Trade with Marta');
    await trade.trigger('click');
    expect(calls.trade).toHaveBeenCalledTimes(1);
    expect(calls.hail).not.toHaveBeenCalled();
  });

  it('gathers a node on row click; Depleted and In use rows have no button and Depleted is dimmed', async () => {
    const { w, calls } = mountContent(NEARBY);
    const rows = w.findAll('.nearby-row');
    await rows[4].get('button.row-main').trigger('click');
    expect(calls.gather).toHaveBeenCalledWith({ id: 20n, name: 'Iron Vein' });
    expect(rows[2].find('button').exists()).toBe(false);
    expect(rows[3].find('button').exists()).toBe(false);
    expect(rows[3].classes()).toContain('depleted');
    expect(rows[2].classes()).not.toContain('depleted');
  });

  it('gives players always-visible Whisper and Invite buttons and no row action', async () => {
    const { w, calls } = mountContent(NEARBY);
    const bo = w.findAll('.nearby-row')[5];
    expect(bo.find('button.row-main').exists()).toBe(false);
    expect(bo.findAll('button').map((b) => b.attributes('aria-label'))).toEqual(['Whisper Bo', 'Invite Bo']);
    await bo.get('[aria-label="Whisper Bo"]').trigger('click');
    await bo.get('[aria-label="Invite Bo"]').trigger('click');
    expect(calls.whisperTo).toHaveBeenCalledWith('Bo');
    expect(calls.invite).toHaveBeenCalledWith('Bo');
  });

  it('never lists an object row (no source table, research Q3)', () => {
    const { w } = mountContent(NEARBY);
    expect(w.find('.kind-object').exists()).toBe(false);
    expect(w.text()).not.toContain('Examine');
  });

  it('does not show a node owned by another character', () => {
    const { w } = mountContent(
      lists({ nodesHere: [{ id: 30n, name: 'Private Vein', state: 'available', characterId: 9n }] }),
    );
    expect(w.text()).toContain('No one is nearby.');
  });

  it('ellipsizes long names with the full name in title', () => {
    const long = 'Sir Reginald Bartholomew Fitzwilliam-Montgomery the Third';
    const { w } = mountContent(lists({ npcsHere: [{ id: 2n, name: long, npcType: 'quest' }] }));
    expect(w.get('.row-name').attributes('title')).toBe(long);
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
    const { w, calls } = mountContent({
      game: {
        connected: ref(false),
        connections: ref([{ fromLocationId: 10n, toLocationId: 11n }]),
        npcsHere: ref([{ id: 2n, name: 'Marta', npcType: 'vendor' }]),
        nodesHere: ref([{ id: 20n, name: 'Iron Vein', state: 'available' }]),
        playersHere: ref([{ id: 4n, name: 'Bo', level: 3n }]),
      },
    });
    const buttons = w.findAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(6);
    for (const button of buttons) {
      expect(button.attributes('aria-disabled')).toBe('true');
      await button.trigger('click');
    }
    for (const fn of Object.values(calls)) expect(fn).not.toHaveBeenCalled();
  });

  it('does not mark buttons disabled while connected', () => {
    const { w } = mountContent(lists({ connections: [{ fromLocationId: 10n, toLocationId: 11n }] }));
    expect(w.get('button.route-row').attributes('aria-disabled')).toBeUndefined();
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
        nodesHere: ref([{ id: 20n, name: PAYLOAD, state: 'available' }]),
        playersHere: ref([{ id: 4n, name: PAYLOAD, level: 3n }]),
        quests: ref([
          { id: 1n, characterId: 1n, questTemplateId: 100n, progress: 1n, completed: false, acceptedAt: { microsSinceUnixEpoch: 1n } },
        ]),
        questTemplates: ref([{ id: 100n, name: PAYLOAD, requiredCount: 1n, description: PAYLOAD }]),
      },
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.card-kicker').text()).toBe(`Here · ${PAYLOAD}`);
    expect(w.get('.here-card .card-title').text()).toBe(PAYLOAD);
    expect(w.get('.route-name').text()).toBe(PAYLOAD);
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
    expect(read('HereCard.vue')).toContain('routesFrom');
    expect(read('NearbyList.vue')).toContain('Trade with');
    expect(read('NearbyList.vue')).toContain('Whisper ');
    expect(read('NearbyList.vue')).toContain('Invite ');
  });
});
