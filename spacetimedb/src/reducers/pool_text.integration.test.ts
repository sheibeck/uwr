/**
 * Phase 51.3.1.1 Plan 16 (SC2, SC5, SC7; D-03, D-07, D-12, D-22, D-26, D-34, D-55, UI-SPEC P3):
 * every server text surface reads the density pools. Runs the REAL submit_intent handler (captured
 * from index.ts) on the shared pool world (helpers/pool_fixture.ts) and reads back the private lines:
 *   - Task 1: look (the place description) lists families, resources available now and the safety
 *     rating; named and event enemies stay individuals; examine describes a family or a resource;
 *     no count and no percentage ever reaches the text;
 *   - Task 2: the typed enemies, con and attack/fight/kill/pull commands act on families through
 *     the same pull helper as the pull_family reducer.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  ALICE,
  REGION_ID,
  ORCHARD_ID,
  MARKET_ID,
  GOBLINS_ID,
  SKITTERERS_ID,
  poolWorld,
  poolCtx,
  seedPools,
} from '../helpers/pool_fixture';
import { createPool, setPoolCount } from '../helpers/pools';
import { creatureLine, groupHint, ratingLine, resourceLine } from '../data/density_lines';
import { placeRating } from '../data/place_rating';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['submit_intent', 'pull_family']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

const NAMED_TEMPLATE_ID = 501n;
const EVENT_TEMPLATE_ID = 601n;

function enemyTemplate(id: bigint, name: string, level: bigint, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    role: 'damage',
    roleDetail: '',
    abilityProfile: '',
    terrainTypes: 'woods',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'normal',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 0n,
    level,
    maxHp: 40n + level * 10n,
    baseDamage: 5n + level,
    xpReward: 10n * level,
    isBoss: false,
    ...extra,
  };
}

type WorldOpts = {
  /** The Goblins count at the orchard (default the Stable home count). */
  goblins?: bigint;
  /** Put a Skitterers pool at the orchard with this count. */
  skitterersHere?: bigint;
  /** The Iron Ore count at the orchard. */
  iron?: bigint;
  night?: boolean;
  /** Alice's living named enemy (Old Greymaw) at the orchard. */
  named?: boolean;
  /** An event spawn (Ash Wraith) at the orchard. */
  event?: boolean;
  /** A legacy ordinary standing spawn of a Goblins member at the orchard. */
  legacy?: boolean;
  /** Where Alice stands (default the orchard). */
  aliceAt?: bigint;
  /** Drop Bob out of the group's place (so the roster is Alice alone). */
  bobAway?: boolean;
  /** The Goblins family's stored history (Plan 29, D-68); the fixture row has none by default. */
  goblinsHistory?: string;
};

function world(opts: WorldOpts = {}) {
  const extra: Record<string, any[]> = {
    enemy_template: [
      enemyTemplate(NAMED_TEMPLATE_ID, 'Cave Rat', 4n),
      enemyTemplate(EVENT_TEMPLATE_ID, 'Ash Wraith', 5n),
    ],
    location_enemy_template: [{ id: 1n, locationId: ORCHARD_ID, enemyTemplateId: NAMED_TEMPLATE_ID }],
  };
  if (opts.named) {
    extra.named_enemy = [
      {
        id: 1n,
        characterId: 1n,
        name: 'Old Greymaw',
        enemyTemplateId: NAMED_TEMPLATE_ID,
        locationId: ORCHARD_ID,
        isAlive: true,
        lastKilledAt: undefined,
        respawnMinutes: 30n,
      },
    ];
  }
  const spawns: any[] = [];
  if (opts.event) {
    spawns.push({ id: 1n, locationId: ORCHARD_ID, enemyTemplateId: EVENT_TEMPLATE_ID, name: 'Ash Wraith', state: 'available', lockedCombatId: undefined, groupCount: 1n, level: 5n });
    extra.event_spawn_enemy = [{ id: 1n, eventId: 1n, spawnId: 1n, locationId: ORCHARD_ID }];
  }
  if (opts.legacy) {
    spawns.push({ id: 2n, locationId: ORCHARD_ID, enemyTemplateId: 101n, name: 'Goblin Brute', state: 'available', lockedCombatId: undefined, groupCount: 1n, level: 4n });
  }
  if (spawns.length > 0) extra.enemy_spawn = spawns;

  const seed = poolWorld({ extra, bobLocationId: opts.bobAway ? MARKET_ID : undefined });
  if (opts.night) seed.world_state = seed.world_state.map((w: any) => ({ ...w, isNight: true }));
  if (opts.goblinsHistory !== undefined) {
    seed.creature_family = seed.creature_family.map((f: any) => (f.id === GOBLINS_ID ? { ...f, history: opts.goblinsHistory } : f));
  }
  if (opts.aliceAt !== undefined) {
    seed.character = seed.character.map((c: any) => (c.id === 1n ? { ...c, locationId: opts.aliceAt } : c));
  }
  const ctx = poolCtx(seed, ALICE, T0);
  const pools = seedPools(ctx);
  let goblins = pools.goblinsOrchard;
  if (opts.goblins !== undefined) goblins = setPoolCount(ctx, goblins, opts.goblins, T0).pool;
  let skitterers: any = null;
  if (opts.skitterersHere !== undefined) {
    skitterers = createPool(ctx, { regionId: REGION_ID, locationId: ORCHARD_ID, kind: 'creature', refId: SKITTERERS_ID, homeLevel: 2 }, T0);
    skitterers = setPoolCount(ctx, skitterers, opts.skitterersHere, T0).pool;
  }
  if (opts.iron !== undefined) setPoolCount(ctx, pools.ironOrchard, opts.iron, T0);
  return { ctx, pools, goblins, skitterers };
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const feed = (ctx: any, characterId = 1n): any[] => rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const say = (ctx: any, text: string, characterId = 1n) => handlers.submit_intent(ctx, { characterId, text });

function look(ctx: any): string {
  say(ctx, 'look');
  const hits = feed(ctx).filter((e: any) => e.kind === 'look');
  expect(hits.length).toBeGreaterThan(0);
  return hits[hits.length - 1].message;
}

function lastMessage(ctx: any): string {
  const all = feed(ctx);
  return all[all.length - 1]?.message ?? '';
}

// ---------------------------------------------------------------------------
// Task 1: look
// ---------------------------------------------------------------------------

describe('look lists families, not individual ordinary enemies (D-03, D-22)', () => {
  it('an Overrun aggressive family shows its keyword, range, word and line; a wiped-out family shows only its line', () => {
    const { ctx } = world({ goblins: 90n, skitterersHere: 0n });
    const out = look(ctx);
    const goblinsLine = creatureLine({ plural: 'goblins', singular: 'goblin', temperament: 'aggressive', level: 3, place: 'the orchard' });
    expect(out).toMatch(/\{\{color:#[0-9a-f]{6}\}\}\[Goblins\]\{\{\/color\}\} \(Lv 3–5, Overrun\)\. /);
    expect(out).toContain(`[Goblins]{{/color}} (Lv 3–5, Overrun). ${goblinsLine}`);
    const wipedLine = creatureLine({ plural: 'skitterers', singular: 'skitterer', temperament: 'skittish', level: 0, place: 'the orchard' });
    expect(out).toContain(wipedLine);
    expect(out).not.toContain('[Salt-Crust Skitterers]');
    expect(out).not.toContain('Enemies nearby');
  });

  it('families read in danger order: the living family before the wiped-out one', () => {
    const { ctx } = world({ skitterersHere: 0n });
    const out = look(ctx);
    expect(out.indexOf('[Goblins]')).toBeGreaterThan(-1);
    expect(out.indexOf('[Goblins]')).toBeLessThan(out.indexOf('Not one skitterer stirs'));
  });

  it('the family keyword takes the con colour of its top level against the looking character', () => {
    const { ctx } = world();
    // Goblins top out at 5 at the orchard; Alice is level 3 (diff 2: the yellow con colour).
    expect(look(ctx)).toContain('{{color:#f6d365}}[Goblins]{{/color}} (Lv 3–5, Stable).');
  });

  it('a legacy ordinary standing spawn is never listed as an individual', () => {
    const { ctx } = world({ legacy: true });
    const out = look(ctx);
    expect(out).not.toContain('[Goblin Brute]');
    expect(out).not.toContain('Enemies nearby');
  });
});

describe('look keeps named and event enemies as individuals (D-07)', () => {
  it("the character's living named enemy and an event spawn here are listed by name", () => {
    const { ctx } = world({ named: true, event: true });
    const out = look(ctx);
    expect(out).toContain('Enemies nearby:');
    expect(out).toContain('[Old Greymaw]');
    expect(out).toContain('[Ash Wraith]');
    expect(out).toContain('[Goblins]');
  });

  it('a slain named enemy is not listed', () => {
    const { ctx } = world({ named: true });
    ctx.db.named_enemy.id.update({ ...ctx.db.named_enemy.id.find(1n), isAlive: false });
    expect(look(ctx)).not.toContain('Old Greymaw');
  });
});

describe('look lists the resources that can be gathered now (D-26, D-55)', () => {
  it('an Abundant resource shows its Gather keyword, word and line', () => {
    const { ctx } = world();
    const line = resourceLine({ resource: 'Iron Ore', level: 3, place: 'the orchard' });
    expect(look(ctx)).toContain(`{{color:#22c55e}}[Gather Iron Ore]{{/color}} (Abundant). ${line}`);
  });

  it('an Exhausted resource shows its line without the keyword', () => {
    const { ctx } = world({ iron: 0n });
    const out = look(ctx);
    expect(out).toContain(resourceLine({ resource: 'Iron Ore', level: 0, place: 'the orchard' }));
    expect(out).not.toContain('[Gather Iron Ore]');
  });

  it('a night-only resource is absent by day and listed at night', () => {
    const day = look(world().ctx);
    expect(day).not.toContain('Wild Berries');
    expect(day).not.toContain('wild berries');
    const night = look(world({ night: true }).ctx);
    expect(night).toContain('{{color:#22c55e}}[Gather Wild Berries]{{/color}} (Plentiful).');
  });

  it('no resource node is read any more', () => {
    const seed = poolWorld({
      extra: { resource_node: [{ id: 900n, locationId: ORCHARD_ID, name: 'Old Copper Node', state: 'available', itemTemplateId: 301n }] },
    });
    const ctx = poolCtx(seed, ALICE, T0);
    seedPools(ctx);
    expect(look(ctx)).not.toContain('Old Copper Node');
  });
});

describe('look shows the safety rating for the looking character (D-34, UI-SPEC P2)', () => {
  const families = (goblinLevel: number) => [{ level: goblinLevel, lvHi: 5n }];

  it('a non-safe place shows the rating word and line from placeRating', () => {
    const { ctx } = world({ bobAway: true });
    const r = placeRating({ isSafe: false, ready: true, families: families(2), playerLevel: 3n });
    expect(look(ctx)).toContain(`Safety: ${r.word}. ${ratingLine(r.key)}`);
  });

  it('a safe town shows Safe', () => {
    const { ctx } = world({ aliceAt: MARKET_ID });
    expect(look(ctx)).toContain(`Safety: Safe. ${ratingLine('safe')}`);
  });

  it('a living named enemy of the character here raises the word one step', () => {
    const base = placeRating({ isSafe: false, ready: true, families: families(2), playerLevel: 3n });
    const raised = placeRating({ isSafe: false, ready: true, families: families(2), playerLevel: 3n, bossOrNamedHere: true });
    expect(raised.word).not.toBe(base.word);
    const { ctx } = world({ named: true, bobAway: true });
    expect(look(ctx)).toContain(`Safety: ${raised.word}. ${ratingLine(raised.key)}`);
  });
});

describe('no count and no percentage reach the text (T-51.3.1.1-52)', () => {
  it('the family, resource and safety lines carry no digit beyond the level range and no percent sign', () => {
    const { ctx } = world({ goblins: 77n, skitterersHere: 0n, iron: 41n, night: true });
    const out = look(ctx);
    const poolLines = out
      .split('\n')
      .filter((l) => /\[Goblins\]|skitterer|Gather |Safety:|iron ore|wild berries/i.test(l));
    expect(poolLines.length).toBeGreaterThanOrEqual(5);
    for (const l of poolLines) {
      const stripped = l.replace(/\{\{color:#[0-9a-f]{6}\}\}/g, '').replace(/Lv \d+(–\d+)?/g, '');
      expect(stripped).not.toMatch(/\d/);
      expect(stripped).not.toContain('%');
    }
  });
});

// ---------------------------------------------------------------------------
// Task 1: examine
// ---------------------------------------------------------------------------

function examine(ctx: any, target: string): string {
  say(ctx, `look ${target}`);
  return lastMessage(ctx);
}

describe('examine describes a family or a resource (D-03, D-26)', () => {
  it.each(['goblins', 'Goblins', 'goblin', 'goblin hexer'])('"look %s" describes the Goblins family', (target) => {
    const { ctx } = world();
    const out = examine(ctx, target);
    const lines = out.split('\n');
    expect(lines[0]).toBe('Goblins');
    expect(lines[1]).toBe('Lv 3–5, Stable.');
    expect(lines[2]).toBe(creatureLine({ plural: 'goblins', singular: 'goblin', temperament: 'aggressive', level: 2, place: 'the orchard' }));
    expect(out).toContain('Members: Goblin Brute (tank), Goblin Cutter (damage), Goblin Mender (support), Goblin Hexer (caster).');
    expect(out).not.toMatch(/%/);
  });

  it('a wiped-out family is described with its quiet line', () => {
    const { ctx } = world({ skitterersHere: 0n });
    const out = examine(ctx, 'skitterers');
    expect(out.split('\n')[0]).toBe('Salt-Crust Skitterers');
    expect(out).toContain('Wiped out.');
    expect(out).toContain('Not one skitterer stirs in the orchard.');
  });

  it('a resource gives its word and line', () => {
    const { ctx } = world();
    const out = examine(ctx, 'iron ore');
    expect(out.split('\n')[0]).toBe('Iron Ore');
    expect(out).toContain('Abundant.');
    expect(out).toContain(resourceLine({ resource: 'Iron Ore', level: 3, place: 'the orchard' }));
  });

  it('a resource outside its time of day is not there', () => {
    const { ctx } = world();
    expect(examine(ctx, 'wild berries')).toBe('You don\'t see "wild berries" here.');
  });

  it('a missing name keeps the nothing-here answer', () => {
    const { ctx } = world();
    expect(examine(ctx, 'dragons')).toBe('You don\'t see "dragons" here.');
  });

  it('a named enemy is examined as an individual', () => {
    const { ctx } = world({ named: true });
    expect(examine(ctx, 'old greymaw')).toContain('You study Old Greymaw.');
  });

  it("a family's history reads on its own line after the group hint and before the members (Plan 29, D-68)", () => {
    const history = 'The Goblins came down from the hills.';
    const out = examine(world({ goblinsHistory: history }).ctx, 'goblins');
    const lines = out.split('\n');
    const at = lines.indexOf(history);
    expect(at).toBeGreaterThan(2);
    expect(lines[at + 1]!.startsWith('Members: ')).toBe(true);
    const hint = groupHint(2);
    if (hint) expect(lines[at - 1]).toBe(`${hint}.`);
    else expect(lines[at - 1]).toBe(lines[2]);
    // The history is the only line added.
    expect(lines.filter((l) => l !== history)).toEqual(examine(world().ctx, 'goblins').split('\n'));
  });

  it('a family with an empty or blank history, or no history field, reads exactly as before (Plan 29, D-68)', () => {
    const before = examine(world().ctx, 'goblins');
    expect(examine(world({ goblinsHistory: '' }).ctx, 'goblins')).toBe(before);
    expect(examine(world({ goblinsHistory: '   ' }).ctx, 'goblins')).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Task 2: typed enemies, con and attack/fight/kill/pull (D-07, D-12, UI-SPEC P3)
// ---------------------------------------------------------------------------

const PROMPT_WORDS = ['[Careful Pull]', '[Charge In]'];
const noPrompt = (ctx: any) => {
  for (const e of rows(ctx, 'event_private')) {
    for (const w of PROMPT_WORDS) expect(e.message).not.toContain(w);
    expect(e.kind).not.toBe('combat_prompt');
  }
};

describe('typed enemies lists families, then individuals', () => {
  it('two families and a named enemy', () => {
    const { ctx } = world({ skitterersHere: 50n, named: true });
    say(ctx, 'enemies');
    const out = lastMessage(ctx);
    expect(out).toContain('Enemies at this location:');
    expect(out).toContain('[Goblins] (Lv 3–5, Stable)');
    expect(out).toContain('[Salt-Crust Skitterers] (Lv 3, Stable)');
    expect(out).toContain('[Old Greymaw]');
    expect(out.indexOf('[Goblins]')).toBeLessThan(out.indexOf('[Old Greymaw]'));
    expect(out).not.toMatch(/%/);
  });

  it('a safe place with nothing prints No enemies nearby.', () => {
    const { ctx } = world({ aliceAt: MARKET_ID });
    say(ctx, 'mobs');
    expect(lastMessage(ctx)).toBe('No enemies nearby.');
  });

  it('a legacy ordinary standing spawn is not listed', () => {
    const { ctx } = world({ legacy: true });
    say(ctx, 'enemies');
    expect(lastMessage(ctx)).not.toContain('Goblin Brute');
  });
});

describe('typed con answers for a family, an individual or an NPC', () => {
  it('con goblins gives the threat phrasing for the family top level plus the density word', () => {
    const { ctx } = world();
    say(ctx, 'con goblins');
    // Goblins top out at 5 at the orchard; Alice is level 3 (diff 2).
    expect(lastMessage(ctx)).toBe('Goblins look dangerous. Proceed with caution. Population: Stable.');
  });

  it("a member name answers for that member's family", () => {
    const { ctx } = world({ skitterersHere: 90n });
    say(ctx, 'con skitterer hexer');
    expect(lastMessage(ctx).startsWith('Salt-Crust Skitterers ')).toBe(true);
    expect(lastMessage(ctx)).toContain('Population: Overrun.');
  });

  it('a named enemy is considered as an individual with the singular phrasing', () => {
    const { ctx } = world({ named: true });
    say(ctx, 'con old greymaw');
    expect(lastMessage(ctx).startsWith('Old Greymaw ')).toBe(true);
    expect(lastMessage(ctx)).not.toContain('Population');
  });

  it('an NPC still gets the regard line', () => {
    const { ctx } = world();
    ctx.db.npc.insert({ id: 0n, locationId: ORCHARD_ID, name: 'Mira Vale', npcType: 'lore', description: 'A guide.', greeting: 'Hello.', gender: 'female' });
    say(ctx, 'con mira vale');
    expect(lastMessage(ctx)).toContain('Mira Vale');
    expect(lastMessage(ctx)).not.toContain('Population');
  });

  it('nothing by that name keeps the old miss', () => {
    const { ctx } = world();
    say(ctx, 'con dragons');
    expect(lastMessage(ctx)).toBe('You see no one named "dragons" here to consider.');
  });
});

describe('typed attack, fight, kill and pull share the Pull button path (D-12, UI-SPEC P3)', () => {
  const fightOf = (ctx: any) => ({
    encounters: rows(ctx, 'combat_encounter').map((c: any) => ({ origin: c.origin, originFamilyId: c.originFamilyId, originLevel: c.originLevel })),
    enemies: rows(ctx, 'combat_enemy').map((e: any) => e.enemyTemplateId),
    feed: feed(ctx).map((e: any) => e.message),
  });

  it.each(['pull goblins', 'attack goblins', 'fight goblin', 'kill goblins', 'Pull Goblins'])(
    '"%s" starts the same fight as pull_family for that pool',
    (text) => {
      for (let i = 0n; i < 4n; i += 1n) {
        const ts = T0 + i;
        const typed = world({ goblins: 90n });
        typed.ctx.timestamp = { microsSinceUnixEpoch: ts };
        say(typed.ctx, text);
        const button = world({ goblins: 90n });
        button.ctx.timestamp = { microsSinceUnixEpoch: ts };
        handlers.pull_family(button.ctx, { characterId: 1n, poolId: button.goblins.id });
        const a = fightOf(typed.ctx);
        const b = fightOf(button.ctx);
        expect(a.encounters).toHaveLength(1);
        expect(a.encounters[0].origin).toBe('pull');
        expect(a.encounters).toEqual(b.encounters);
        expect(a.enemies).toEqual(b.enemies);
        // The same lead-in line as the button.
        expect(a.feed.filter((m: string) => m.startsWith('You make some noise.'))).toEqual(
          b.feed.filter((m: string) => m.startsWith('You make some noise.')),
        );
        noPrompt(typed.ctx);
      }
    },
  );

  it('a wiped-out family refuses with the pull refusal and starts nothing', () => {
    const { ctx } = world({ goblins: 0n });
    say(ctx, 'pull goblins');
    expect(lastMessage(ctx)).toBe('There are no goblins here to pull.');
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });

  it('attack with no name pulls the first family in danger order', () => {
    const { ctx } = world({ skitterersHere: 90n });
    say(ctx, 'attack');
    const fights = rows(ctx, 'combat_encounter');
    expect(fights).toHaveLength(1);
    expect(fights[0].originFamilyId).toBe(SKITTERERS_ID);
    expect(fights[0].origin).toBe('pull');
  });

  it('attack with no family and no individual refuses', () => {
    const { ctx } = world({ aliceAt: MARKET_ID });
    say(ctx, 'attack');
    expect(lastMessage(ctx)).toBe('There is nothing to fight here.');
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });

  it('an unknown name refuses and names what is here', () => {
    const { ctx } = world({ named: true });
    say(ctx, 'attack dragons');
    expect(lastMessage(ctx)).toBe('No enemy named "dragons" here. Nearby: [Goblins], [Old Greymaw].');
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });

  it('attack {named enemy} starts the named fight with one enemy', () => {
    const { ctx } = world({ named: true });
    say(ctx, 'attack old greymaw');
    const fights = rows(ctx, 'combat_encounter');
    expect(fights).toHaveLength(1);
    expect(fights[0].origin).toBe('named');
    const enemies = rows(ctx, 'combat_enemy');
    expect(enemies).toHaveLength(1);
    expect(enemies[0].enemyTemplateId).toBe(NAMED_TEMPLATE_ID);
    expect(ctx.db.named_enemy.id.find(1n).isAlive).toBe(false);
    expect(feed(ctx).map((e: any) => e.message)).toContain('You engage Old Greymaw!');
    noPrompt(ctx);
  });

  it('attack {event enemy} starts that fight', () => {
    const { ctx } = world({ event: true });
    say(ctx, 'fight ash wraith');
    const enemies = rows(ctx, 'combat_enemy');
    expect(enemies).toHaveLength(1);
    expect(enemies[0].enemyTemplateId).toBe(EVENT_TEMPLATE_ID);
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    noPrompt(ctx);
  });

  it('a character already in a fight is refused', () => {
    const { ctx } = world({ goblins: 90n });
    say(ctx, 'pull goblins');
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
    say(ctx, 'attack goblins');
    expect(lastMessage(ctx)).toBe('You are already in combat. Use your abilities.');
    expect(rows(ctx, 'combat_encounter')).toHaveLength(1);
  });

  it('pull is a whole word: "pullover" is not a pull', () => {
    const { ctx } = world({ goblins: 90n });
    say(ctx, 'pullover');
    expect(rows(ctx, 'combat_encounter')).toHaveLength(0);
  });
});
