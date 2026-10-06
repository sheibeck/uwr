import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { Character, Location, Region } from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions } from '../net/bindTable';
import type { BindEventTableOptions } from './bindEventTable';
import { createGameData, NARRATIVE_LINGER_MS } from './gameData';
import type { GameConn, GameDeps, GameInput } from './gameData';
import type { GameQueries } from './queries';
import {
  createInertCombatData,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from './context';

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
  myCombatAggro: 'Q_COMBAT_AGGRO',
  eventPrivate: (id) => `Q_EVENT_PRIVATE_${id}`,
  eventLocation: (id) => `Q_EVENT_LOCATION_${id}`,
  eventGroup: (id) => `Q_EVENT_GROUP_${id}`,
  npcsAt: (id) => `Q_NPC_${id}`,
  enemySpawnsAt: (id) => `Q_ENEMY_SPAWNS_${id}`,
  resourceNodesAt: (id) => `Q_NODE_${id}`,
  charactersAt: (id) => `Q_CHARS_AT_${id}`,
  connectionsFrom: (id) => `Q_CONNECTIONS_${id}`,
  hotbars: (id) => `Q_HOTBARS_${id}`,
  hotbarSlots: (id) => `Q_SLOTS_${id}`,
  abilityTemplates: (id) => `Q_ABILITIES_${id}`,
  abilityCooldowns: (id) => `Q_COOLDOWNS_${id}`,
  eventContributions: (id) => `Q_CONTRIB_${id}`,
  combatParticipantsOf: (id) => `Q_PART_OF_${id}`,
  combatActions: (id) => `Q_ACTIONS_${id}`,
  combatParticipants: (id) => `Q_PARTS_${id}`,
  combatEnemies: (id) => `Q_ENEMIES_${id}`,
  combatRounds: (id) => `Q_ROUNDS_${id}`,
  combatCasts: (id) => `Q_CASTS_${id}`,
  combatNarratives: (id) => `Q_NARR_${id}`,
  combatPets: (id) => `Q_PETS_${id}`,
  renown: (id) => `Q_RENOWN_${id}`,
  renownPerks: (id) => `Q_PERKS_${id}`,
  resourceGathers: (id) => `Q_GATHERS_${id}`,
  characterCasts: (id) => `Q_CHAR_CASTS_${id}`,
  group: (id) => `Q_GROUP_${id}`,
  groupMembers: (id) => `Q_MEMBERS_${id}`,
  charactersById: (ids) => `Q_CHARS_BY_ID_${ids.join(',')}`,
  questTemplatesById: (ids) => `Q_TEMPLATES_${ids.join(',')}`,
  eventObjectivesByEvent: (ids) => `Q_OBJECTIVES_${ids.join(',')}`,
  enemyTemplatesById: (ids) => `Q_ENEMY_TEMPLATES_${ids.join(',')}`,
  enemyAbilitiesByTemplate: (ids) => `Q_ENEMY_ABILITIES_${ids.join(',')}`,
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
  'Q_COMBAT_AGGRO',
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

  it('attaches the 8 static bindings and event_world to a connection, and re-attaches a new one', () => {
    const h = harness();
    const first = h.connect();
    for (const sql of STATIC_SQL) expect(h.find(sql).conn).toBe(first);
    expect(STATIC_SQL).toHaveLength(9);

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

describe('createGameData: enemy spawns here (quick-261006-a0i)', () => {
  it('subscribes the spawns of the location and swaps the binding on a move', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 3n });
    expect(h.live('Q_ENEMY_SPAWNS_3')).toHaveLength(1);
    const spawns3 = h.find('Q_ENEMY_SPAWNS_3');
    spawns3.rows.value = [{ id: 1n, locationId: 3n, enemyTemplateId: 8n }];
    spawns3.applied.value = true;
    expect(h.game.enemiesHere.value).toHaveLength(1);

    h.character.value = makeCharacter(5n, { locationId: 4n });
    const spawns4 = h.find('Q_ENEMY_SPAWNS_4');
    expect(h.game.enemiesHere.value).toHaveLength(1);
    spawns4.rows.value = [];
    spawns4.applied.value = true;
    expect(h.game.enemiesHere.value).toEqual([]);
    expect(spawns3.disposed).toBe(true);
  });

  it('subscribes the templates of the spawns here by id list, with an id filter', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 3n });
    const spawns = h.find('Q_ENEMY_SPAWNS_3');
    spawns.rows.value = [
      { id: 1n, locationId: 3n, enemyTemplateId: 4n },
      { id: 2n, locationId: 3n, enemyTemplateId: 3n },
      { id: 3n, locationId: 3n, enemyTemplateId: 3n },
    ];
    spawns.applied.value = true;
    expect(h.live('Q_ENEMY_TEMPLATES_3,4')).toHaveLength(1);
    const options = h.find('Q_ENEMY_TEMPLATES_3,4').options as BindTableOptions<FakeConn, any>;
    expect(options.filter?.({ id: 3n })).toBe(true);
    expect(options.filter?.({ id: 5n })).toBe(false);

    h.find('Q_ENEMY_TEMPLATES_3,4').rows.value = [{ id: 3n, level: 8n }];
    h.find('Q_ENEMY_TEMPLATES_3,4').applied.value = true;
    expect(h.game.enemyTemplatesHere.value).toEqual([{ id: 3n, level: 8n }]);
  });

  it('disposes both bindings on reset', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 3n });
    const spawns = h.find('Q_ENEMY_SPAWNS_3');
    spawns.rows.value = [{ id: 1n, locationId: 3n, enemyTemplateId: 3n }];
    spawns.applied.value = true;
    expect(h.live('Q_ENEMY_TEMPLATES_3')).toHaveLength(1);
    h.game.reset();
    expect(h.live('Q_ENEMY_SPAWNS_3')).toHaveLength(0);
    expect(h.live('Q_ENEMY_TEMPLATES_3')).toHaveLength(0);
  });
});

describe('createGameData: location keyed bindings', () => {
  const LOCATION_SQL = ['Q_NPC_', 'Q_ENEMY_SPAWNS_', 'Q_NODE_', 'Q_CHARS_AT_', 'Q_CONNECTIONS_', 'Q_EVENT_LOCATION_'];

  it('creates the six location bindings for the character location', () => {
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

  it('clears the old location rows when the new location binding fails (WR-05)', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { locationId: 3n });
    const npc3 = h.find('Q_NPC_3');
    npc3.rows.value = [{ id: 1n, locationId: 3n }];
    npc3.applied.value = true;
    expect(h.game.npcsHere.value).toHaveLength(1);

    h.character.value = makeCharacter(5n, { locationId: 4n });
    expect(h.game.npcsHere.value).toHaveLength(1);

    h.find('Q_NPC_4').failed.value = true;
    expect(h.game.npcsHere.value).toEqual([]);
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
    expect(filterOf('Q_ENEMY_SPAWNS_3')({ locationId: 3n })).toBe(true);
    expect(filterOf('Q_ENEMY_SPAWNS_3')({ locationId: 9n })).toBe(false);
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
    expect(filterOf('Q_GATHERS_5')({ characterId: 5n })).toBe(true);
    expect(filterOf('Q_GATHERS_5')({ characterId: 6n })).toBe(false);
    expect(filterOf('Q_CHAR_CASTS_5')({ characterId: 5n })).toBe(true);
    expect(filterOf('Q_CHAR_CASTS_5')({ characterId: 6n })).toBe(false);
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
      'Q_GATHERS_',
      'Q_CHAR_CASTS_',
    ]) {
      expect(h.live(`${prefix}5`)).toHaveLength(1);
    }
  });

  it('exposes the gather and cast rows of the active character', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    expect(h.game.gathers.value).toEqual([]);
    expect(h.game.characterCasts.value).toEqual([]);
    const gathers = h.find('Q_GATHERS_5');
    gathers.rows.value = [{ id: 1n, characterId: 5n, nodeId: 3n }];
    gathers.applied.value = true;
    const casts = h.find('Q_CHAR_CASTS_5');
    casts.rows.value = [{ id: 2n, characterId: 5n, abilityTemplateId: 20n }];
    casts.applied.value = true;
    expect(h.game.gathers.value.map((row) => row.id)).toEqual([1n]);
    expect(h.game.characterCasts.value.map((row) => row.id)).toEqual([2n]);
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

describe('createGameData: combat', () => {
  const filterOf = (h: ReturnType<typeof harness>, sql: string) =>
    (h.find(sql).options as BindTableOptions<FakeConn, any>).filter!;

  const FIGHT_SQL = [
    'Q_PARTS_10',
    'Q_ENEMIES_10',
    'Q_ROUNDS_10',
    'Q_CASTS_10',
    'Q_PETS_10',
  ];

  // The player (character 5) takes part in fight 10.
  function inFight() {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    const own = h.find('Q_PART_OF_5');
    own.rows.value = [{ id: 1n, combatId: 10n, characterId: 5n, status: 'active' }];
    own.applied.value = true;
    return h;
  }

  it('binds the own participant and own choice rows by character and nothing of a fight yet', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    expect(h.live('Q_PART_OF_5')).toHaveLength(1);
    expect(h.live('Q_ACTIONS_5')).toHaveLength(1);
    expect(h.bindings.some((b) => b.sql[0].startsWith('Q_ENEMIES_'))).toBe(false);
    expect(h.game.combat.active.value).toBe(false);
    expect(h.game.combat.combatId.value).toBeNull();
    expect(h.game.combat.self.value).toBeNull();
  });

  it('reports participantApplied only once the own participant binding has applied, empty or not', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n);
    // A reload: nothing has arrived, so inactive is not a server confirmation.
    expect(h.game.combat.active.value).toBe(false);
    expect(h.game.combat.participantApplied.value).toBe(false);
    // The snapshot arrived empty: the server confirmed the character is not in a fight.
    h.find('Q_PART_OF_5').applied.value = true;
    expect(h.game.combat.active.value).toBe(false);
    expect(h.game.combat.participantApplied.value).toBe(true);
    // A fight starts: the row arrives and the flag stays applied.
    h.find('Q_PART_OF_5').rows.value = [{ id: 1n, combatId: 10n, characterId: 5n, status: 'active' }];
    expect(h.game.combat.active.value).toBe(true);
    expect(h.game.combat.participantApplied.value).toBe(true);
  });

  it('follows the combat id of the own participant row', () => {
    const h = inFight();
    expect(h.game.combat.active.value).toBe(true);
    expect(h.game.combat.combatId.value).toBe(10n);
    expect(h.game.combat.self.value).toEqual({ id: 1n, combatId: 10n, characterId: 5n, status: 'active' });
    for (const sql of [...FIGHT_SQL, 'Q_NARR_10']) expect(h.live(sql)).toHaveLength(1);
  });

  it('wires the combat rows into the feed (round header for the open round)', () => {
    const h = inFight();
    h.find('Q_ROUNDS_10').rows.value = [
      { id: 1n, combatId: 10n, roundNumber: 1n, state: 'resolved', startedAtMicros: 100n },
      { id: 2n, combatId: 10n, roundNumber: 2n, state: 'action_select', startedAtMicros: 200n },
    ];
    h.game.feed.flush();
    expect(h.game.feed.entries.value.map((entry) => entry.key)).toEqual(['round:10:2']);
  });

  it('reports applied only once the enemy binding has applied', () => {
    const h = inFight();
    expect(h.game.combat.applied.value).toBe(false);
    h.find('Q_ENEMIES_10').applied.value = true;
    expect(h.game.combat.applied.value).toBe(true);
    expect(h.game.combat.castsApplied.value).toBe(false);
    h.find('Q_CASTS_10').applied.value = true;
    expect(h.game.combat.castsApplied.value).toBe(true);
    expect(h.game.combat.roundsApplied.value).toBe(false);
    h.find('Q_ROUNDS_10').applied.value = true;
    expect(h.game.combat.roundsApplied.value).toBe(true);
  });

  it('subscribes enemy templates and abilities by the enemies template ids', () => {
    const h = inFight();
    const enemies = h.find('Q_ENEMIES_10');
    enemies.rows.value = [
      { id: 1n, combatId: 10n, enemyTemplateId: 4n },
      { id: 2n, combatId: 10n, enemyTemplateId: 3n },
      { id: 3n, combatId: 10n, enemyTemplateId: 3n },
    ];
    enemies.applied.value = true;
    expect(h.live('Q_ENEMY_TEMPLATES_3,4')).toHaveLength(1);
    expect(h.live('Q_ENEMY_ABILITIES_3,4')).toHaveLength(1);
    expect(filterOf(h, 'Q_ENEMY_TEMPLATES_3,4')({ id: 3n })).toBe(true);
    expect(filterOf(h, 'Q_ENEMY_TEMPLATES_3,4')({ id: 5n })).toBe(false);
    expect(filterOf(h, 'Q_ENEMY_ABILITIES_3,4')({ enemyTemplateId: 4n })).toBe(true);
    expect(filterOf(h, 'Q_ENEMY_ABILITIES_3,4')({ enemyTemplateId: 5n })).toBe(false);
  });

  it('picks the round in action_select as the open round', () => {
    const h = inFight();
    expect(h.game.combat.openRound.value).toBeNull();
    expect(h.game.combat.roundNumber.value).toBeNull();

    const rounds = h.find('Q_ROUNDS_10');
    rounds.rows.value = [
      { id: 1n, combatId: 10n, roundNumber: 1n, state: 'resolved' },
      { id: 2n, combatId: 10n, roundNumber: 2n, state: 'action_select' },
    ];
    expect(h.game.combat.openRound.value?.roundNumber).toBe(2n);
    expect(h.game.combat.roundNumber.value).toBe(2n);

    rounds.rows.value = [
      { id: 1n, combatId: 10n, roundNumber: 1n, state: 'resolved' },
      { id: 2n, combatId: 10n, roundNumber: 2n, state: 'resolved' },
    ];
    expect(h.game.combat.openRound.value).toBeNull();
    expect(h.game.combat.roundNumber.value).toBe(2n);
  });

  it('exposes the own choice for the open round only', () => {
    const h = inFight();
    const actions = h.find('Q_ACTIONS_5');
    actions.rows.value = [
      { id: 1n, combatId: 10n, characterId: 5n, roundNumber: 1n },
      { id: 2n, combatId: 10n, characterId: 5n, roundNumber: 2n },
      { id: 3n, combatId: 9n, characterId: 5n, roundNumber: 2n },
    ];
    expect(h.game.combat.ownAction.value).toBeNull();
    h.find('Q_ROUNDS_10').rows.value = [
      { id: 2n, combatId: 10n, roundNumber: 2n, state: 'action_select' },
    ];
    expect(h.game.combat.ownAction.value?.id).toBe(2n);
    h.find('Q_ROUNDS_10').rows.value = [
      { id: 2n, combatId: 10n, roundNumber: 2n, state: 'resolved' },
    ];
    expect(h.game.combat.ownAction.value).toBeNull();
  });

  it('gives every combat binding a filter that rejects rows of another key', () => {
    const h = inFight();
    expect(filterOf(h, 'Q_ENEMIES_10')({ combatId: 10n })).toBe(true);
    expect(filterOf(h, 'Q_ENEMIES_10')({ combatId: 11n })).toBe(false);
    for (const sql of ['Q_PARTS_10', 'Q_ROUNDS_10', 'Q_CASTS_10', 'Q_PETS_10', 'Q_NARR_10']) {
      expect(filterOf(h, sql)({ combatId: 11n })).toBe(false);
      expect(filterOf(h, sql)({ combatId: 10n })).toBe(true);
    }
    expect(filterOf(h, 'Q_PART_OF_5')({ characterId: 5n })).toBe(true);
    expect(filterOf(h, 'Q_PART_OF_5')({ characterId: 6n })).toBe(false);
    expect(filterOf(h, 'Q_ACTIONS_5')({ characterId: 5n })).toBe(true);
    expect(filterOf(h, 'Q_ACTIONS_5')({ characterId: 6n })).toBe(false);
  });

  describe('when the fight ends', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('disposes the fight bindings at once and lets narratives linger', () => {
      vi.useFakeTimers();
      const h = inFight();
      const own = h.find('Q_PART_OF_5');
      const enemies = h.find('Q_ENEMIES_10');
      enemies.rows.value = [{ id: 1n, combatId: 10n, enemyTemplateId: 3n }];
      enemies.applied.value = true;
      h.find('Q_ROUNDS_10').rows.value = [
        { id: 1n, combatId: 10n, roundNumber: 1n, state: 'action_select' },
      ];

      own.rows.value = [];
      expect(h.game.combat.active.value).toBe(false);
      expect(h.game.combat.applied.value).toBe(false);
      for (const sql of FIGHT_SQL) expect(h.live(sql)).toHaveLength(0);
      expect(h.live('Q_ENEMY_TEMPLATES_3')).toHaveLength(0);
      expect(h.game.combat.enemies.value).toEqual([]);
      expect(h.game.combat.rounds.value).toEqual([]);
      expect(h.game.combat.openRound.value).toBeNull();
      expect(h.game.combat.roundNumber.value).toBeNull();
      expect(h.live('Q_NARR_10')).toHaveLength(1);

      vi.advanceTimersByTime(NARRATIVE_LINGER_MS - 1);
      expect(h.live('Q_NARR_10')).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(h.live('Q_NARR_10')).toHaveLength(0);
    });

    it('rebinds narratives to a new fight that starts before the timer ends', () => {
      vi.useFakeTimers();
      const h = inFight();
      const own = h.find('Q_PART_OF_5');
      own.rows.value = [];
      expect(h.live('Q_NARR_10')).toHaveLength(1);

      own.rows.value = [{ id: 2n, combatId: 11n, characterId: 5n, status: 'active' }];
      expect(h.live('Q_NARR_11')).toHaveLength(1);
      h.find('Q_NARR_11').applied.value = true;
      expect(h.live('Q_NARR_10')).toHaveLength(0);

      // the old timer is gone: the new fight keeps its narrative binding
      vi.advanceTimersByTime(NARRATIVE_LINGER_MS * 2);
      expect(h.live('Q_NARR_11')).toHaveLength(1);
    });

    it('clears the linger timer on reset', () => {
      vi.useFakeTimers();
      const h = inFight();
      h.find('Q_PART_OF_5').rows.value = [];
      h.game.reset();
      expect(vi.getTimerCount()).toBe(0);
      expect(h.bindings.filter((b) => !b.disposed)).toEqual([]);
    });
  });

  it('adds fight participants outside the group to the party id list, never the player', () => {
    const h = harness();
    h.connect();
    h.character.value = makeCharacter(5n, { groupId: 4n });
    const members = h.find('Q_MEMBERS_4');
    members.rows.value = [
      { id: 1n, groupId: 4n, characterId: 5n },
      { id: 2n, groupId: 4n, characterId: 8n },
    ];
    members.applied.value = true;
    const own = h.find('Q_PART_OF_5');
    own.rows.value = [{ id: 1n, combatId: 10n, characterId: 5n, status: 'active' }];
    own.applied.value = true;
    const parts = h.find('Q_PARTS_10');
    parts.rows.value = [
      { id: 1n, combatId: 10n, characterId: 5n },
      { id: 2n, combatId: 10n, characterId: 8n },
      { id: 3n, combatId: 10n, characterId: 9n },
    ];
    parts.applied.value = true;
    expect(h.live('Q_CHARS_BY_ID_8,9')).toHaveLength(1);
    // the narrower list stays until the wider one has applied (keyed swap)
    h.find('Q_CHARS_BY_ID_8,9').applied.value = true;
    const partyLists = h.bindings.filter((b) => !b.disposed && b.sql[0].startsWith('Q_CHARS_BY_ID_'));
    expect(partyLists.map((b) => b.sql[0])).toEqual(['Q_CHARS_BY_ID_8,9']);
  });

  it('maps character and pet names', () => {
    const h = inFight();
    expect(h.game.combat.characterNames.value.get(5n)).toBe('Hero5');
    const parts = h.find('Q_PARTS_10');
    parts.rows.value = [
      { id: 1n, combatId: 10n, characterId: 5n },
      { id: 2n, combatId: 10n, characterId: 8n },
    ];
    parts.applied.value = true;
    const known = h.find('Q_CHARS_BY_ID_8');
    known.rows.value = [{ id: 8n, name: 'Ally' }];
    known.applied.value = true;
    expect(h.game.combat.characterNames.value.get(8n)).toBe('Ally');
    expect(h.game.combat.characterNames.value.get(5n)).toBe('Hero5');

    h.find('Q_PETS_10').rows.value = [{ id: 7n, combatId: 10n, name: 'Wolf' }];
    expect(h.game.combat.petNames.value.get(7n)).toBe('Wolf');
  });

  it('mirrors the threat view rows and its applied flag', () => {
    const h = harness();
    h.connect();
    expect(h.game.combat.aggro.value).toEqual([]);
    expect(h.game.combat.aggroApplied.value).toBe(false);
    const view = h.find('Q_COMBAT_AGGRO');
    view.rows.value = [{ id: 1n, combatId: 10n, enemyId: 2n, characterId: 5n, value: 7n }];
    view.applied.value = true;
    expect(h.game.combat.aggro.value).toHaveLength(1);
    expect(h.game.combat.aggroApplied.value).toBe(true);
  });

  it('disposes every combat binding on dispose and on scope stop', () => {
    const a = inFight();
    a.game.dispose();
    expect(a.bindings.filter((b) => !b.disposed)).toEqual([]);

    const b = inFight();
    b.scope.stop();
    const stillLive = b.bindings.filter((x) => !x.disposed).map((x) => x.sql[0]);
    expect(stillLive.every((sql) => STATIC_SQL.includes(sql))).toBe(true);
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
      game.enemiesHere,
      game.enemyTemplatesHere,
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
      game.gathers,
      game.characterCasts,
    ]) {
      expect(list.value).toEqual([]);
    }
    expect(() => {
      game.reset();
      game.dispose();
    }).not.toThrow();
  });

  it('createInertGame carries an inert combat block', () => {
    const { combat } = createInertGame();
    for (const flag of [
      combat.active,
      combat.applied,
      combat.castsApplied,
      combat.aggroApplied,
      combat.roundsApplied,
      combat.participantApplied,
    ]) {
      expect(flag.value).toBe(false);
    }
    for (const single of [
      combat.combatId,
      combat.self,
      combat.openRound,
      combat.roundNumber,
      combat.ownAction,
    ]) {
      expect(single.value).toBeNull();
    }
    for (const list of [
      combat.participants,
      combat.enemies,
      combat.enemyTemplates,
      combat.enemyAbilities,
      combat.rounds,
      combat.actions,
      combat.casts,
      combat.narratives,
      combat.pets,
      combat.aggro,
    ]) {
      expect(list.value).toEqual([]);
    }
    expect(combat.characterNames.value.size).toBe(0);
    expect(combat.petNames.value.size).toBe(0);
  });

  it('createInertCombatData returns a fresh object each call', () => {
    const a = createInertCombatData();
    const b = createInertCombatData();
    expect(a).not.toBe(b);
    expect(a.active.value).toBe(false);
    expect(b.enemies.value).toEqual([]);
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
