/**
 * Level-up keeps the race bonus (Phase 49, decision D1). apply_level_up and the admin
 * level_character rebuild all five stats from the class; the race_definition bonus is removed
 * before primary/secondary detection and added back after the rebuild. A race with no stored
 * definition (or no usable bonuses) levels up exactly as before. Runs the REAL handlers captured
 * from index.ts on the strict mock db; seed and sender share one identity object (compared with ===).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { ADMIN_IDENTITIES } from '../data/admin';
import { xpRequiredForLevel } from '../data/xp';
import { computeBaseStatsForGenerated, detectPrimarySecondary } from '../data/class_stats';
import { RACE_DATA } from '../data/races';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;

const alice = { toHexString: () => 'a'.repeat(64) };
const admin = { toHexString: () => [...ADMIN_IDENTITIES][0] };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['apply_level_up', 'level_character', 'submit_creation_input']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(
        `capturedReducer('${name}') is not a function: the schema recorder could not capture the ` +
          'reducer from index.ts. STOP and report; never edit production code to fix this.',
      );
    }
    handlers[name] = h;
  }
}, 120_000);

let randomSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
});
afterEach(() => {
  randomSpy.mockRestore();
});

type Seed = Record<string, any[]>;

function newCtx(seed: Seed, sender: any = alice) {
  return createMockCtx({ seed, sender, timestampMicros: T0, strict: true });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

const SALTKIN_BONUSES = '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';

// The strict mock resolves race_definition.by_name to the DECLARED index column (nameLower), so the
// display name is capitalized on purpose: a lookup on `name` would miss this row and fail the tests.
const raceDefinitionRow = (bonusesJson: string, name = 'Saltkin') => ({
  id: 1n,
  name,
  nameLower: name.toLowerCase(),
  narrative: 'Marsh dwellers.',
  bonusesJson,
  createdAt: { microsSinceUnixEpoch: T0 },
});

const SALTKIN_STATS = { str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n };

function levelSeed(opts: {
  race?: string;
  def?: string | null;
  sender?: any;
  pendingLevels?: bigint;
} = {}): Seed {
  const sender = opts.sender ?? alice;
  const seed: Seed = {
    player: [{ id: sender, userId: 7n, activeCharacterId: 1n }],
    region: [
      { id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n, regionType: 'wild', biome: 'volcanic', landmarks: '[]', threats: '[]' },
    ],
    location: [{ id: 10n, name: 'The Crossing', description: 'A crossroads.', zone: 'z', regionId: 1n }],
    character: [
      {
        id: 1n,
        ownerUserId: 7n,
        name: 'Mirel',
        race: opts.race ?? 'Saltkin',
        className: 'Tidecaller',
        locationId: 10n,
        combatTargetEnemyId: undefined,
        level: 1n,
        pendingLevels: opts.pendingLevels ?? 1n,
        ...SALTKIN_STATS,
        hp: 50n,
        maxHp: 50n,
      },
    ],
    ability_template: [],
    pending_skill: [],
    character_creation_state: [],
  };
  if (opts.def !== null && opts.def !== undefined) seed.race_definition = [raceDefinitionRow(opts.def)];
  return seed;
}

const statsOf = (c: any) => ({ str: c.str, dex: c.dex, cha: c.cha, wis: c.wis, int: c.int });

const levelUp = (ctx: any) => handlers.apply_level_up(ctx, { characterId: 1n });
const adminLevel = (ctx: any, level: bigint) => handlers.level_character(ctx, { characterId: 1n, level });

/** Today's formula (no race bonus) from the seeded stats. */
function todayStats(level: bigint) {
  const { primary, secondary } = detectPrimarySecondary(SALTKIN_STATS);
  return computeBaseStatsForGenerated(primary, secondary, level);
}

describe('apply_level_up keeps the race bonus', () => {
  it('a Saltkin with a stored definition keeps dex +2 int +1 at level 2', () => {
    const ctx = newCtx(levelSeed({ def: SALTKIN_BONUSES }));
    levelUp(ctx);
    const c = rows(ctx, 'character')[0];
    expect(c.level).toBe(2n);
    expect(statsOf(c)).toEqual({ str: 9n, dex: 11n, cha: 9n, wis: 12n, int: 16n });
  });

  it('a race with no race_definition row levels up exactly as today', () => {
    const ctx = newCtx(levelSeed({ race: 'Kobold' }));
    levelUp(ctx);
    const c = rows(ctx, 'character')[0];
    expect(statsOf(c)).toEqual({ str: 9n, dex: 9n, cha: 9n, wis: 9n, int: 15n });
    expect(statsOf(c)).toEqual(todayStats(2n));
  });

  it('finds the definition by the declared nameLower index column, not by name (strict mock pin)', () => {
    // name matches the race but nameLower does not: a lookup on the wrong column would find it.
    const wrongColumn = newCtx(levelSeed({ def: SALTKIN_BONUSES }));
    wrongColumn.db._tables.race_definition[0] = { ...raceDefinitionRow(SALTKIN_BONUSES), nameLower: 'someone-else' };
    levelUp(wrongColumn);
    expect(statsOf(rows(wrongColumn, 'character')[0])).toEqual(todayStats(2n));
    // name differs in case from the character's race but nameLower matches: found.
    const rightColumn = newCtx(levelSeed({ def: SALTKIN_BONUSES }));
    rightColumn.db._tables.race_definition[0] = { ...raceDefinitionRow(SALTKIN_BONUSES), name: 'SALTKIN-display' };
    levelUp(rightColumn);
    expect(statsOf(rows(rightColumn, 'character')[0])).toEqual({ str: 9n, dex: 11n, cha: 9n, wis: 12n, int: 16n });
  });

  it.each(['{}', 'not json'])('a definition with bonusesJson %s levels up exactly as today', (json) => {
    const ctx = newCtx(levelSeed({ def: json }));
    levelUp(ctx);
    expect(statsOf(rows(ctx, 'character')[0])).toEqual(todayStats(2n));
  });
});

describe("the reserved race name 'Unknown' (review WR-06)", () => {
  it.each(['Unknown', 'unknown', 'UNKNOWN'])(
    'apply_level_up ignores a definition named Unknown for a character whose race is %s',
    (race) => {
      const seed = levelSeed({ race, def: SALTKIN_BONUSES });
      seed.race_definition = [raceDefinitionRow(SALTKIN_BONUSES, 'Unknown')];
      const ctx = newCtx(seed);
      levelUp(ctx);
      expect(statsOf(rows(ctx, 'character')[0])).toEqual(todayStats(2n));
    },
  );

  it('level_character ignores a definition named Unknown', () => {
    const seed = levelSeed({ race: 'Unknown', sender: admin });
    seed.race_definition = [raceDefinitionRow(SALTKIN_BONUSES, 'Unknown')];
    const ctx = newCtx(seed, admin);
    adminLevel(ctx, 3n);
    expect(statsOf(rows(ctx, 'character')[0])).toEqual(todayStats(3n));
  });
});

describe('level_character keeps the race bonus', () => {
  it('admin level 1 to 3 on a Saltkin keeps the bonus', () => {
    const ctx = newCtx(levelSeed({ def: SALTKIN_BONUSES, sender: admin }), admin);
    adminLevel(ctx, 3n);
    const c = rows(ctx, 'character')[0];
    expect(c.level).toBe(3n);
    expect(c.xp).toBe(xpRequiredForLevel(3n));
    expect(statsOf(c)).toEqual({ str: 10n, dex: 12n, cha: 10n, wis: 14n, int: 19n });
  });

  it('admin level to 3 with no race_definition row uses today\'s formula', () => {
    const ctx = newCtx(levelSeed({ race: 'Kobold', sender: admin }), admin);
    adminLevel(ctx, 3n);
    const c = rows(ctx, 'character')[0];
    expect(statsOf(c)).toEqual({ str: 10n, dex: 10n, cha: 10n, wis: 10n, int: 18n });
    expect(statsOf(c)).toEqual(todayStats(3n));
  });

  it('a non-admin sender is refused and nothing changes', () => {
    const ctx = newCtx(levelSeed({ def: SALTKIN_BONUSES }));
    expect(() => adminLevel(ctx, 3n)).toThrow('Admin only');
    const c = rows(ctx, 'character')[0];
    expect(c.level).toBe(1n);
    expect(statsOf(c)).toEqual(SALTKIN_STATS);
  });
});

describe('finalize then level up reads one race bonus (review CR-01)', () => {
  // A warrior (str primary, dex secondary). The stored definition says dex +2 / int +1; a different
  // creation-state bonus (cha +3 / wis +2) must never reach the character.
  const STATE_BONUSES = '{"primary":{"stat":"cha","value":3},"secondary":{"stat":"wis","value":2}}';
  const WARRIOR_CLASS = '{"primaryStat":"str","secondaryStat":"dex"}';

  function finalizeSeed(opts: { raceName?: string; def: string | null; stateBonuses: string; defName?: string }): Seed {
    const seed: Seed = {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      region: [
        { id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n, regionType: 'wild', biome: 'volcanic', landmarks: '[]', threats: '[]' },
      ],
      location: [{ id: 10n, name: 'The Crossing', description: 'A crossroads.', zone: 'z', regionId: 1n }],
      ability_template: [],
      pending_skill: [],
      character_creation_state: [
        {
          id: 1n,
          playerId: alice,
          step: 'CONFIRMING',
          raceName: opts.raceName,
          raceNarrative: 'Marsh dwellers.',
          raceBonuses: opts.stateBonuses,
          classStats: WARRIOR_CLASS,
          archetype: 'warrior',
          className: 'Tidecaller',
          characterName: 'Mirel',
          createdAt: { microsSinceUnixEpoch: T0 },
          updatedAt: { microsSinceUnixEpoch: T0 },
        },
      ],
    };
    if (opts.def !== null) seed.race_definition = [raceDefinitionRow(opts.def, opts.defName)];
    return seed;
  }

  /** Confirm the creation, then claim two pending levels one at a time. Returns the stats at L1, L2, L3. */
  function finalizeAndLevelTwice(seed: Seed) {
    const ctx = newCtx(seed);
    handlers.submit_creation_input(ctx, { text: 'confirm' });
    const afterFinalize = statsOf(rows(ctx, 'character')[0]);
    const place = (c: any) => ({ ...c, locationId: 10n, pendingLevels: 2n });
    ctx.db._tables.character[0] = place(rows(ctx, 'character')[0]);
    const characterId = rows(ctx, 'character')[0].id;
    handlers.apply_level_up(ctx, { characterId });
    const atL2 = statsOf(rows(ctx, 'character')[0]);
    handlers.apply_level_up(ctx, { characterId });
    const atL3 = statsOf(rows(ctx, 'character')[0]);
    expect(rows(ctx, 'character')[0].level).toBe(3n);
    return { afterFinalize, atL2, atL3 };
  }

  const warriorAt = (level: bigint, bonus: { dex?: bigint; int?: bigint } = {}) => {
    const base = computeBaseStatsForGenerated('str', 'dex', level);
    return { ...base, dex: base.dex + (bonus.dex ?? 0n), int: base.int + (bonus.int ?? 0n) };
  };

  it('a state whose bonuses differ from the stored definition keeps the definition bonus and the class secondary over two level-ups', () => {
    const { afterFinalize, atL2, atL3 } = finalizeAndLevelTwice(
      finalizeSeed({ raceName: 'Saltkin', def: SALTKIN_BONUSES, stateBonuses: STATE_BONUSES }),
    );
    expect(afterFinalize).toEqual({ str: 12n, dex: 12n, cha: 8n, wis: 8n, int: 9n });
    expect(atL2).toEqual(warriorAt(2n, { dex: 2n, int: 1n }));
    expect(atL3).toEqual(warriorAt(3n, { dex: 2n, int: 1n }));
  });

  it("an 'Unknown' race (no definition) gets no bonus at finalize and none at level-up, over two level-ups", () => {
    const { afterFinalize, atL2, atL3 } = finalizeAndLevelTwice(
      finalizeSeed({ raceName: undefined, def: null, stateBonuses: STATE_BONUSES }),
    );
    expect(afterFinalize).toEqual(warriorAt(1n));
    expect(atL2).toEqual(warriorAt(2n));
    expect(atL3).toEqual(warriorAt(3n));
  });

  it("WR-06: a stored definition named 'Unknown' never applies to the placeholder race (finalize and two level-ups)", () => {
    const { afterFinalize, atL2, atL3 } = finalizeAndLevelTwice(
      finalizeSeed({ raceName: undefined, def: SALTKIN_BONUSES, defName: 'Unknown', stateBonuses: STATE_BONUSES }),
    );
    expect(afterFinalize).toEqual(warriorAt(1n));
    expect(atL2).toEqual(warriorAt(2n));
    expect(atL3).toEqual(warriorAt(3n));
  });

  it("WR-06: the reservation is case-insensitive at finalize ('UNKNOWN' state name, 'Unknown' definition)", () => {
    const { afterFinalize } = finalizeAndLevelTwice(
      finalizeSeed({ raceName: 'UNKNOWN', def: SALTKIN_BONUSES, defName: 'Unknown', stateBonuses: STATE_BONUSES }),
    );
    expect(afterFinalize).toEqual(warriorAt(1n));
  });
});

describe('legacy race-table stat delta is removed before detection (review WR-01)', () => {
  // RACE_DATA names (Human cha +3, Dark-Elf str -1) are added after the class rebuild at every
  // level-up, so the next level-up must subtract them again before it detects primary/secondary.
  // Finalize adds no legacy delta, so a level 1 character has none to remove.
  const raceRowFor = (name: string) => ({ id: 1n, ...RACE_DATA.find((r) => r.name === name)! });
  const warriorL1 = computeBaseStatsForGenerated('str', 'dex', 1n);
  const warriorAt = (level: bigint) => computeBaseStatsForGenerated('str', 'dex', level);

  function warriorSeed(raceName: string, opts: { def?: string; sender?: any; pendingLevels?: bigint } = {}): Seed {
    const seed = levelSeed({ race: raceName, def: opts.def, sender: opts.sender, pendingLevels: opts.pendingLevels ?? 2n });
    seed.character = [{ ...seed.character[0], ...warriorL1 }];
    seed.race = [raceRowFor(raceName)];
    return seed;
  }

  it('a Human warrior keeps str primary and dex secondary over two level-ups', () => {
    const ctx = newCtx(warriorSeed('Human'));
    levelUp(ctx);
    const atL2 = statsOf(rows(ctx, 'character')[0]);
    const l2 = warriorAt(2n);
    expect(atL2).toEqual({ ...l2, cha: l2.cha + 3n });
    levelUp(ctx);
    const atL3 = statsOf(rows(ctx, 'character')[0]);
    const l3 = warriorAt(3n);
    expect(atL3).toEqual({ ...l3, cha: l3.cha + 3n });
    expect(rows(ctx, 'character')[0].level).toBe(3n);
  });

  it('the old behaviour (no subtraction) would have lost the secondary: cha ties dex at level 2', () => {
    const l2 = warriorAt(2n);
    expect(l2.cha + 3n).toBe(l2.dex);
  });

  it('a Dark-Elf with a stored race_definition applies both deltas and keeps the secondary over two level-ups', () => {
    // race_definition: dex +2 / int +1 (kept); RACE_DATA Dark-Elf: str -1 (legacy). Both removed before detection.
    const ctx = newCtx(warriorSeed('Dark-Elf', { def: SALTKIN_BONUSES }));
    // The seeded definition row is named Saltkin; re-point it at the character's race (lookup is by nameLower).
    ctx.db._tables.race_definition[0] = raceDefinitionRow(SALTKIN_BONUSES, 'Dark-Elf');
    // The character is level 1: finalize would have added the definition bonus only.
    ctx.db._tables.character[0] = {
      ...rows(ctx, 'character')[0],
      dex: warriorL1.dex + 2n,
      int: warriorL1.int + 1n,
    };
    levelUp(ctx);
    levelUp(ctx);
    const l3 = warriorAt(3n);
    expect(statsOf(rows(ctx, 'character')[0])).toEqual({
      ...l3,
      str: l3.str - 1n,
      dex: l3.dex + 2n,
      int: l3.int + 1n,
    });
  });

  it('admin level_character for a Human removes the delta of the current level on the second jump', () => {
    const ctx = newCtx(warriorSeed('Human', { sender: admin }), admin);
    adminLevel(ctx, 3n);
    const l3 = warriorAt(3n);
    expect(statsOf(rows(ctx, 'character')[0])).toEqual({ ...l3, cha: l3.cha + 3n });
    adminLevel(ctx, 6n);
    const l6 = warriorAt(6n);
    expect(statsOf(rows(ctx, 'character')[0])).toEqual({ ...l6, cha: l6.cha + 3n });
  });
});
