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

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;

const alice = { toHexString: () => 'a'.repeat(64) };
const admin = { toHexString: () => [...ADMIN_IDENTITIES][0] };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['apply_level_up', 'level_character']) {
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

const DARK_ELF = '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';

// Mock quirk: the mock maps the race_definition.by_name accessor to the column `name`, not
// `nameLower`, so both are the lowercase race name here. The character keeps race 'Saltkin'.
const raceDefinitionRow = (bonusesJson: string) => ({
  id: 1n,
  name: 'saltkin',
  nameLower: 'saltkin',
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
    const ctx = newCtx(levelSeed({ def: DARK_ELF }));
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

  it.each(['{}', 'not json'])('a definition with bonusesJson %s levels up exactly as today', (json) => {
    const ctx = newCtx(levelSeed({ def: json }));
    levelUp(ctx);
    expect(statsOf(rows(ctx, 'character')[0])).toEqual(todayStats(2n));
  });
});

describe('level_character keeps the race bonus', () => {
  it('admin level 1 to 3 on a Saltkin keeps the bonus', () => {
    const ctx = newCtx(levelSeed({ def: DARK_ELF, sender: admin }), admin);
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
    const ctx = newCtx(levelSeed({ def: DARK_ELF }));
    expect(() => adminLevel(ctx, 3n)).toThrow('Admin only');
    const c = rows(ctx, 'character')[0];
    expect(c.level).toBe(1n);
    expect(statsOf(c)).toEqual(SALTKIN_STATS);
  });
});
