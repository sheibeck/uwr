import { describe, expect, it, vi } from 'vitest';
import { effectScope, ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { Character, Location, Region } from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions } from '../net/bindTable';
import type { BindEventTableOptions } from './bindEventTable';
import { createGameData } from './gameData';
import type { GameConn, GameDeps, GameInput } from './gameData';
import type { GameQueries } from './queries';
import { createInertConsole, createInertFrame, createInertGame } from './context';

interface FakeConn {
  id: number;
  reducers: { tag: string };
}

interface FakeBinding {
  kind: 'table' | 'event';
  sql: string[];
  options: BindTableOptions<FakeConn, any> | BindEventTableOptions<FakeConn, any>;
  rows: ShallowRef<readonly any[]>;
  applied: Ref<boolean>;
  failed: Ref<boolean>;
  attach: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  disposed: boolean;
  conn: FakeConn | null;
}

const queries: GameQueries = {
  myCharacterEffects: 'Q_EFFECTS',
  myQuests: 'Q_QUESTS',
  myLlmJobs: 'Q_JOBS',
  myGroupInvites: 'Q_INVITES',
  myFactionStandings: 'Q_STANDINGS',
  faction: 'Q_FACTION',
  eventWorld: 'Q_EVENT_WORLD',
  activeWorldEvents: 'Q_ACTIVE_EVENTS',
  eventPrivate: (id) => `Q_EVENT_PRIVATE_${id}`,
  eventLocation: (id) => `Q_EVENT_LOCATION_${id}`,
  eventGroup: (id) => `Q_EVENT_GROUP_${id}`,
  npcsAt: (id) => `Q_NPC_${id}`,
  resourceNodesAt: (id) => `Q_NODE_${id}`,
  charactersAt: (id) => `Q_CHARS_AT_${id}`,
  connectionsFrom: (id) => `Q_CONNECTIONS_${id}`,
  hotbars: (id) => `Q_HOTBARS_${id}`,
  hotbarSlots: (id) => `Q_SLOTS_${id}`,
  abilityTemplates: (id) => `Q_ABILITIES_${id}`,
  abilityCooldowns: (id) => `Q_COOLDOWNS_${id}`,
  eventContributions: (id) => `Q_CONTRIB_${id}`,
  renown: (id) => `Q_RENOWN_${id}`,
  renownPerks: (id) => `Q_PERKS_${id}`,
  group: (id) => `Q_GROUP_${id}`,
  groupMembers: (id) => `Q_MEMBERS_${id}`,
  charactersById: (ids) => `Q_CHARS_BY_ID_${ids.join(',')}`,
  questTemplatesById: (ids) => `Q_TEMPLATES_${ids.join(',')}`,
  eventObjectivesByEvent: (ids) => `Q_OBJECTIVES_${ids.join(',')}`,
};

function makeCharacter(id: bigint, overrides: Record<string, unknown> = {}): Character {
  return {
    id,
    ownerUserId: 7n,
    name: `Hero${id}`,
    locationId: 3n,
    groupId: undefined,
    combatTargetEnemyId: undefined,
    ...overrides,
  } as unknown as Character;
}

let connCounter = 0;
function makeConn(): FakeConn {
  connCounter += 1;
  return { id: connCounter, reducers: { tag: `reducers${connCounter}` } };
}

function micros(value: number): { microsSinceUnixEpoch: bigint } {
  return { microsSinceUnixEpoch: BigInt(value) };
}

function harness(now?: () => number) {
  const conn = shallowRef<FakeConn | null>(null);
  const status = ref<ConnectionStatus>('idle');
  const userId = ref<bigint | null>(null);
  const character = shallowRef<Character | null>(null);
  const locations = shallowRef<readonly Location[]>([]);
  const regions = shallowRef<readonly Region[]>([]);
  const bindings: FakeBinding[] = [];

  function register(binding: FakeBinding): FakeBinding {
    binding.attach = vi.fn((c: FakeConn | null) => {
      binding.conn = c;
    });
    binding.dispose = vi.fn(() => {
      binding.disposed = true;
      binding.conn = null;
      binding.rows.value = [];
      binding.applied.value = false;
    });
    bindings.push(binding);
    return binding;
  }

  const deps = {
    bind: (options: BindTableOptions<FakeConn, any>) =>
      register({
        kind: 'table',
        sql: options.sql,
        options,
        rows: shallowRef<readonly any[]>([]),
        applied: ref(false),
        failed: ref(false),
        attach: vi.fn(),
        dispose: vi.fn(),
        disposed: false,
        conn: null,
      }),
    bindEvent: (options: BindEventTableOptions<FakeConn, any>) =>
      register({
        kind: 'event',
        sql: options.sql,
        options,
        rows: shallowRef<readonly any[]>([]),
        applied: ref(false),
        failed: ref(false),
        attach: vi.fn(),
        dispose: vi.fn(),
        disposed: false,
        conn: null,
      }),
    queries,
    now,
  } as unknown as GameDeps<FakeConn & GameConn>;

  const input = {
    conn,
    status,
    userId,
    character,
    locations,
    regions,
  } as unknown as GameInput<FakeConn & GameConn>;

  const scope = effectScope();
  const game = scope.run(() => createGameData(deps, input))!;

  const live = (sql: string): FakeBinding[] => bindings.filter((b) => b.sql[0] === sql && !b.disposed);
  const find = (sql: string): FakeBinding => {
    const found = live(sql);
    if (found.length === 0) throw new Error(`no live binding for ${sql}`);
    return found[found.length - 1];
  };

  return {
    game,
    scope,
    conn,
    status,
    userId,
    character,
    locations,
    regions,
    bindings,
    live,
    find,
    connect(): FakeConn {
      const c = makeConn();
      conn.value = c;
      status.value = 'connected';
      return c;
    },
  };
}

function eventRow(id: bigint, createdAt: number, extra: Record<string, unknown> = {}) {
  return { id, kind: 'narrative', message: `m${id}`, createdAt: micros(createdAt), ...extra };
}

const STATIC_SQL = [
  'Q_EFFECTS',
  'Q_QUESTS',
  'Q_JOBS',
  'Q_INVITES',
  'Q_STANDINGS',
  'Q_FACTION',
  'Q_ACTIVE_EVENTS',
  'Q_EVENT_WORLD',
];

describe('createGameData: static bindings', () => {
  it('subscribes nothing while conn is null', () => {
    const h = harness();
    for (const sql of STATIC_SQL) {
      expect(h.live(sql)).toHaveLength(1);
      expect(h.find(sql).conn).toBeNull();
    }
    expect(h.bindings.every((b) => b.conn === null)).toBe(true);
  });

  it('attaches the 7 static bindings and event_world to a connection, and re-attaches a new one', () => {
    const h = harness();
    const first = h.connect();
    for (const sql of STATIC_SQL) expect(h.find(sql).conn).toBe(first);
    expect(STATIC_SQL).toHaveLength(8);

    const second = makeConn();
    h.conn.value = second;
    for (const sql of STATIC_SQL) expect(h.find(sql).conn).toBe(second);
  });

  it('filters active world events by status', () => {
    const h = harness();
    const options = h.find('Q_ACTIVE_EVENTS').options as BindTableOptions<FakeConn, any>;
    expect(options.filter?.({ status: 'active' })).toBe(true);
    expect(options.filter?.({ status: 'resolved' })).toBe(false);
  });
});

describe('createGameData: event_private by user', () => {
  it('creates one binding for the user and feeds the store and the clock', async () => {
    let nowMs = 1_000;
    const h = harness(() => nowMs);
    h.connect();
    h.character.value = makeCharacter(5n);
    h.userId.value = 7n;

    expect(h.live('Q_EVENT_PRIVATE_7')).toHaveLength(1);
    const binding = h.find('Q_EVENT_PRIVATE_7');
    expect(binding.kind).toBe('event');
    expect(binding.conn).not.toBeNull();

    const onRow = (binding.options as BindEventTableOptions<FakeConn, any>).onRow;
    onRow(eventRow(1n, 5_000_000, { characterId: 5n, ownerUserId: 7n }));
    h.game.feed.flush();
    expect(h.game.feed.entries.value.map((e) => e.key)).toEqual(['private:1']);
    // skew = server micros - now() * 1000
    expect(h.game.clock.skewMicros.value).toBe(5_000_000 - nowMs * 1000);
    nowMs = 2_000;
    expect(h.game.clock.nowMicros()).toBe(2_000 * 1000 + 5_000_000 - 1_000 * 1000);
  });

  it('keeps one binding when the user id stays the same and reports applied', () => {
    const h = harness();
    h.connect();
    h.userId.value = 7n;
    const binding = h.find('Q_EVENT_PRIVATE_7');
    expect(h.game.privateEventsApplied.value).toBe(false);
    binding.applied.value = true;
    expect(h.game.privateEventsApplied.value).toBe(true);
    h.character.value = makeCharacter(5n);
    expect(h.live('Q_EVENT_PRIVATE_7')).toHaveLength(1);
  });

  it('feeds event_world, event_location and event_group rows through the same path', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { groupId: 4n });

    (h.find('Q_EVENT_WORLD').options as BindEventTableOptions<FakeConn, any>).onRow(
      eventRow(1n, 100),
    );
    (h.find('Q_EVENT_LOCATION_3').options as BindEventTableOptions<FakeConn, any>).onRow(
      eventRow(2n, 200, { locationId: 3n }),
    );
    (h.find('Q_EVENT_GROUP_4').options as BindEventTableOptions<FakeConn, any>).onRow(
      eventRow(3n, 300, { characterId: 9n, kind: 'group', groupId: 4n }),
    );
    h.game.feed.flush();
    expect(h.game.feed.entries.value.map((e) => e.key)).toEqual([
      'world:1',
      'location:2',
      'group:3',
    ]);
  });
});

describe('createGameData: event rows for another key (WR-01)', () => {
  const onRowOf = (h: ReturnType<typeof harness>, sql: string) =>
    (h.find(sql).options as BindEventTableOptions<FakeConn, any>).onRow;

  it('drops event_location rows whose locationId is not the binding key', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 4n });
    const onRow = onRowOf(h, 'Q_EVENT_LOCATION_4');
    onRow(eventRow(1n, 100, { locationId: 3n }));
    onRow(eventRow(2n, 200, { locationId: 4n }));
    h.game.feed.flush();
    expect(h.game.feed.entries.value.map((e) => e.key)).toEqual(['location:2']);
  });

  it('drops event_group rows whose groupId is not the binding key', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { groupId: 4n });
    const onRow = onRowOf(h, 'Q_EVENT_GROUP_4');
    onRow(eventRow(1n, 100, { groupId: 9n, characterId: 9n, kind: 'group' }));
    onRow(eventRow(2n, 200, { groupId: 4n, characterId: 9n, kind: 'group' }));
    h.game.feed.flush();
    expect(h.game.feed.entries.value.map((e) => e.key)).toEqual(['group:2']);
  });

  it('drops event_private rows whose ownerUserId is not the binding key', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    h.userId.value = 7n;
    const onRow = onRowOf(h, 'Q_EVENT_PRIVATE_7');
    onRow(eventRow(1n, 100, { ownerUserId: 8n, characterId: 5n }));
    onRow(eventRow(2n, 200, { ownerUserId: 7n, characterId: 5n }));
    h.game.feed.flush();
    expect(h.game.feed.entries.value.map((e) => e.key)).toEqual(['private:2']);
  });

  it('does not sample the clock for a dropped straggler', () => {
    const h = harness(() => 1_000);
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 4n });
    onRowOf(h, 'Q_EVENT_LOCATION_4')(eventRow(1n, 9_000_000, { locationId: 3n }));
    expect(h.game.clock.skewMicros.value).toBe(0);
  });
});

describe('createGameData: location keyed bindings', () => {
  const LOCATION_SQL = ['Q_NPC_', 'Q_NODE_', 'Q_CHARS_AT_', 'Q_CONNECTIONS_', 'Q_EVENT_LOCATION_'];

  it('creates the five location bindings for the character location', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 3n });
    for (const prefix of LOCATION_SQL) expect(h.live(`${prefix}3`)).toHaveLength(1);
  });

  it('swaps tables on applied and event_location immediately when moving', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 3n });
    const npc3 = h.find('Q_NPC_3');
    npc3.rows.value = [{ id: 1n, locationId: 3n }];
    npc3.applied.value = true;
    expect(h.game.npcsHere.value).toHaveLength(1);

    h.character.value = makeCharacter(5n, { locationId: 4n });
    // event_location swaps at once
    expect(h.live('Q_EVENT_LOCATION_3')).toHaveLength(0);
    expect(h.live('Q_EVENT_LOCATION_4')).toHaveLength(1);
    // the 4n npc binding exists but the 3n rows stay until it applies
    const npc4 = h.find('Q_NPC_4');
    expect(h.game.npcsHere.value).toEqual([{ id: 1n, locationId: 3n }]);
    npc4.rows.value = [{ id: 2n, locationId: 4n }];
    npc4.applied.value = true;
    expect(h.game.npcsHere.value).toEqual([{ id: 2n, locationId: 4n }]);
    expect(npc3.disposed).toBe(true);
  });

  it('gives each keyed binding a filter that rejects rows for another key', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 3n, groupId: 4n });

    const filterOf = (sql: string) =>
      (h.find(sql).options as BindTableOptions<FakeConn, any>).filter!;

    expect(filterOf('Q_NPC_3')({ locationId: 3n })).toBe(true);
    expect(filterOf('Q_NPC_3')({ locationId: 9n })).toBe(false);
    expect(filterOf('Q_NODE_3')({ locationId: 9n })).toBe(false);
    expect(filterOf('Q_CHARS_AT_3')({ locationId: 9n })).toBe(false);
    expect(filterOf('Q_CONNECTIONS_3')({ fromLocationId: 3n })).toBe(true);
    expect(filterOf('Q_CONNECTIONS_3')({ fromLocationId: 9n })).toBe(false);
    expect(filterOf('Q_HOTBARS_5')({ characterId: 5n })).toBe(true);
    expect(filterOf('Q_HOTBARS_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_SLOTS_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_ABILITIES_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_COOLDOWNS_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_CONTRIB_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_RENOWN_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_PERKS_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_GROUP_4')({ id: 4n })).toBe(true);
    expect(filterOf('Q_GROUP_4')({ id: 5n })).toBe(false);
    expect(filterOf('Q_MEMBERS_4')({ groupId: 5n })).toBe(false);
  });

  it('excludes the active character from playersHere', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    const here = h.find('Q_CHARS_AT_3');
    here.rows.value = [
      { id: 5n, locationId: 3n },
      { id: 6n, locationId: 3n },
    ];
    here.applied.value = true;
    expect(h.game.playersHere.value.map((c) => c.id)).toEqual([6n]);
  });

  it('subscribes per character for hotbars, abilities and renown', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    for (const prefix of [
      'Q_HOTBARS_',
      'Q_SLOTS_',
      'Q_ABILITIES_',
      'Q_COOLDOWNS_',
      'Q_CONTRIB_',
      'Q_RENOWN_',
      'Q_PERKS_',
    ]) {
      expect(h.live(`${prefix}5`)).toHaveLength(1);
    }
  });
});

describe('createGameData: combat flag', () => {
  it('is true only when combatTargetEnemyId is set', () => {
    const h = harness();
    expect(h.game.inCombat.value).toBe(false);
    h.character.value = makeCharacter(5n, { combatTargetEnemyId: undefined });
    expect(h.game.inCombat.value).toBe(false);
    h.character.value = makeCharacter(5n, { combatTargetEnemyId: null });
    expect(h.game.inCombat.value).toBe(false);
    h.character.value = makeCharacter(5n, { combatTargetEnemyId: 9n });
    expect(h.game.inCombat.value).toBe(true);
  });
});

describe('createGameData: group bindings', () => {
  it('creates group bindings for the group id and disposes them when it clears', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { groupId: 4n });
    expect(h.live('Q_GROUP_4')).toHaveLength(1);
    expect(h.live('Q_MEMBERS_4')).toHaveLength(1);
    expect(h.live('Q_EVENT_GROUP_4')).toHaveLength(1);

    const group = h.find('Q_GROUP_4');
    group.rows.value = [{ id: 4n }];
    group.applied.value = true;
    expect(h.game.group.value).toEqual({ id: 4n });

    h.character.value = makeCharacter(5n, { groupId: undefined });
    expect(h.live('Q_GROUP_4')).toHaveLength(0);
    expect(h.live('Q_MEMBERS_4')).toHaveLength(0);
    expect(h.live('Q_EVENT_GROUP_4')).toHaveLength(0);
    expect(h.game.group.value).toBeNull();
    expect(h.game.groupMembers.value).toEqual([]);
  });
});

describe('createGameData: id-list bindings', () => {
  it('binds nothing for an empty party', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    expect(h.bindings.some((b) => b.sql[0].startsWith('Q_CHARS_BY_ID_'))).toBe(false);
  });

  it('subscribes party members and inviters without the active character', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { groupId: 4n });
    const members = h.find('Q_MEMBERS_4');
    members.rows.value = [
      { id: 1n, groupId: 4n, characterId: 5n },
      { id: 2n, groupId: 4n, characterId: 8n },
    ];
    members.applied.value = true;
    expect(h.live('Q_CHARS_BY_ID_8')).toHaveLength(1);

    h.find('Q_INVITES').rows.value = [{ id: 1n, fromCharacterId: 6n }];
    expect(h.live('Q_CHARS_BY_ID_6,8')).toHaveLength(1);

    const filter = (h.find('Q_CHARS_BY_ID_6,8').options as BindTableOptions<FakeConn, any>).filter!;
    expect(filter({ id: 6n })).toBe(true);
    expect(filter({ id: 5n })).toBe(false);
  });

  it('subscribes quest templates by the quests template ids', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    h.find('Q_QUESTS').rows.value = [
      { id: 1n, questTemplateId: 12n },
      { id: 2n, questTemplateId: 3n },
    ];
    expect(h.live('Q_TEMPLATES_3,12')).toHaveLength(1);
    const filter = (h.find('Q_TEMPLATES_3,12').options as BindTableOptions<FakeConn, any>).filter!;
    expect(filter({ id: 12n })).toBe(true);
    expect(filter({ id: 99n })).toBe(false);
  });

  it('subscribes event objectives by the active world event ids', () => {
    const h = harness();
    h.connect();
    h.find('Q_ACTIVE_EVENTS').rows.value = [{ id: 2n, status: 'active' }];
    expect(h.live('Q_OBJECTIVES_2')).toHaveLength(1);
    const filter = (h.find('Q_OBJECTIVES_2').options as BindTableOptions<FakeConn, any>).filter!;
    expect(filter({ eventId: 2n })).toBe(true);
    expect(filter({ eventId: 3n })).toBe(false);
  });
});

describe('createGameData: feed and reducers', () => {
  it('follows the active character id and clears history on a change', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    expect(h.game.feed.characterId.value).toBe(5n);
    h.game.feed.appendLocal('system', 'hello');
    expect(h.game.feed.entries.value).toHaveLength(1);
    h.character.value = makeCharacter(6n);
    expect(h.game.feed.characterId.value).toBe(6n);
    expect(h.game.feed.entries.value).toHaveLength(0);
  });

  it('exposes reducers only while connected', () => {
    const h = harness();
    expect(h.game.reducers.value).toBeNull();
    const conn = h.connect();
    expect(h.game.connected.value).toBe(true);
    expect(h.game.reducers.value).toBe(conn.reducers);
    h.status.value = 'reconnecting';
    expect(h.game.connected.value).toBe(false);
    expect(h.game.reducers.value).toBeNull();
    h.status.value = 'connected';
    expect(h.game.reducers.value).toBe(conn.reducers);
  });
});

describe('createGameData: reset and dispose', () => {
  function populated() {
    const h = harness();
    h.connect();
    h.userId.value = 7n;
    h.character.value = makeCharacter(5n, { groupId: 4n });
    h.game.feed.appendLocal('system', 'hello');
    return h;
  }

  it('reset disposes every binding and clears the feed', () => {
    const h = populated();
    expect(h.bindings.filter((b) => !b.disposed).length).toBeGreaterThan(20);
    h.game.reset();
    expect(h.bindings.filter((b) => !b.disposed)).toEqual([]);
    expect(h.game.feed.entries.value).toEqual([]);
  });

  it('dispose does the same', () => {
    const h = populated();
    h.game.dispose();
    expect(h.bindings.filter((b) => !b.disposed)).toEqual([]);
    expect(h.game.feed.entries.value).toEqual([]);
  });

  it('disposes every keyed binding when the owning scope stops', () => {
    const h = populated();
    h.scope.stop();
    const stillLive = h.bindings.filter((b) => !b.disposed).map((b) => b.sql[0]);
    expect(stillLive.every((sql) => STATIC_SQL.includes(sql))).toBe(true);
  });
});

describe('inert defaults', () => {
  it('createInertGame is empty and offline', () => {
    const game = createInertGame();
    expect(game.connected.value).toBe(false);
    expect(game.character.value).toBeNull();
    expect(game.characterId.value).toBeNull();
    expect(game.reducers.value).toBeNull();
    expect(game.group.value).toBeNull();
    expect(game.feed.entries.value).toEqual([]);
    for (const list of [
      game.locations,
      game.regions,
      game.connections,
      game.npcsHere,
      game.nodesHere,
      game.playersHere,
      game.effects,
      game.quests,
      game.questTemplates,
      game.llmJobs,
      game.groupInvites,
      game.groupMembers,
      game.knownCharacters,
      game.hotbars,
      game.hotbarSlots,
      game.abilities,
      game.abilityCooldowns,
      game.worldEvents,
      game.eventObjectives,
      game.contributions,
      game.factions,
      game.factionStandings,
      game.renown,
      game.renownPerks,
    ]) {
      expect(list.value).toEqual([]);
    }
    expect(() => {
      game.reset();
      game.dispose();
    }).not.toThrow();
  });

  it('createInertConsole refuses to submit and createInertFrame does nothing', () => {
    const consoleApi = createInertConsole();
    expect(consoleApi.submit()).toBe('offline');
    expect(consoleApi.draft.value).toBe('');
    expect(consoleApi.conversation.value).toBeNull();
    const frame = createInertFrame();
    expect(frame.isDesktop.value).toBe(true);
    expect(frame.activeScreen.value).toBeNull();
    expect(() => {
      frame.openScreen('map');
      frame.closeScreen();
    }).not.toThrow();
  });
});
