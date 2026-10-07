/**
 * Finalized stats (Phase 49, CRE-02): confirming a character stores class base plus the race
 * bonus of the stored race_definition row (the same source level-up reads, review CR-01), and a class whose secondaryStat is 'none' no longer throws (F1).
 * Runs the REAL submit_creation_input handler captured from index.ts. The mock db is strict and
 * one shared identity object is used for seeding and as the sender (the mock compares with ===).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { computeCreationStats } from '../data/race_bonuses';
import { HP_STR_MULTIPLIER } from '../data/class_stats';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const T = { microsSinceUnixEpoch: T0 };

const alice = { toHexString: () => 'a'.repeat(64) };

let submitCreationInput: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('submit_creation_input');
  if (typeof h !== 'function') {
    throw new Error(
      "capturedReducer('submit_creation_input') is not a function: the schema recorder could not capture the " +
        'reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  submitCreationInput = h;
}, 120_000);

let randomSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
});
afterEach(() => {
  randomSpy.mockRestore();
});

type Seed = Record<string, any[]>;

function newCtx(seed: Seed) {
  return createMockCtx({ seed, sender: alice, timestampMicros: T0, strict: true });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

const SALTKIN_BONUSES =
  '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';
const MYSTIC_CLASS = '{"primaryStat":"int","secondaryStat":"wis"}';

/** The stored race_definition row finalize reads (looked up by the lowercase race name). */
const raceDefinitionRow = (bonusesJson: string, name = 'Saltkin') => ({
  id: 1n,
  name,
  nameLower: name.toLowerCase(),
  narrative: 'Marsh dwellers.',
  bonusesJson,
  createdAt: T,
});

/** `def` is the stored definition's bonuses; null means the race has no definition at all. */
function confirmSeed(over: Record<string, unknown> = {}, extra: Seed = {}, def: string | null = SALTKIN_BONUSES): Seed {
  return {
    ...(def === null ? {} : { race_definition: [raceDefinitionRow(def)] }),
    player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
    character_creation_state: [
      {
        id: 1n,
        playerId: alice,
        step: 'CONFIRMING',
        raceName: 'Saltkin',
        raceNarrative: 'Marsh dwellers.',
        raceBonuses: SALTKIN_BONUSES,
        classStats: MYSTIC_CLASS,
        archetype: 'mystic',
        className: 'Tidecaller',
        characterName: 'Mirel',
        createdAt: T,
        updatedAt: T,
        ...over,
      },
    ],
    ...extra,
  };
}

function confirm(seed: Seed) {
  const ctx = newCtx(seed);
  submitCreationInput(ctx, { text: 'confirm' });
  return ctx;
}

const statsOf = (c: any) => ({ str: c.str, dex: c.dex, cha: c.cha, wis: c.wis, int: c.int });

describe('finalizeCharacter stats (class base plus race bonus)', () => {
  it('stores the class base plus the race bonus', () => {
    const ctx = confirm(confirmSeed());
    const chars = rows(ctx, 'character');
    expect(chars).toHaveLength(1);
    expect(statsOf(chars[0])).toEqual({ str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n });
  });

  it("confirms a class whose secondaryStat is 'none' instead of throwing (F1)", () => {
    const ctx = confirm(confirmSeed({ classStats: '{"primaryStat":"str","secondaryStat":"none"}' }));
    const chars = rows(ctx, 'character');
    expect(chars).toHaveLength(1);
    expect(statsOf(chars[0])).toEqual({ str: 12n, dex: 10n, cha: 8n, wis: 8n, int: 9n });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('COMPLETE');
  });

  it('a race with no stored definition stores the class base only', () => {
    const ctx = confirm(confirmSeed({}, {}, null));
    expect(statsOf(rows(ctx, 'character')[0])).toEqual({ str: 8n, dex: 8n, cha: 8n, wis: 10n, int: 12n });
  });

  it('a definition with malformed bonusesJson stores the class base only and does not throw', () => {
    const ctx = confirm(confirmSeed({}, {}, 'not json'));
    expect(statsOf(rows(ctx, 'character')[0])).toEqual({ str: 8n, dex: 8n, cha: 8n, wis: 10n, int: 12n });
  });

  it('CR-01: the stored definition wins over different bonuses on the creation state', () => {
    // State says str +3 / cha +2; the definition says dex +2 / int +1. Level-up can only find the definition.
    const stateBonuses = '{"primary":{"stat":"str","value":3},"secondary":{"stat":"cha","value":2}}';
    const ctx = confirm(confirmSeed({ raceBonuses: stateBonuses }));
    expect(statsOf(rows(ctx, 'character')[0])).toEqual({ str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n });
  });

  it("CR-01: the 'Unknown' placeholder race gets no bonus even when the state carries one", () => {
    const stateBonuses = '{"primary":{"stat":"str","value":2},"secondary":{"stat":"dex","value":1}}';
    const ctx = confirm(confirmSeed({ raceName: undefined, raceBonuses: stateBonuses }, {}, null));
    const c = rows(ctx, 'character')[0];
    expect(c.race).toBe('Unknown');
    expect(statsOf(c)).toEqual({ str: 8n, dex: 8n, cha: 8n, wis: 10n, int: 12n });
  });

  it('looks the definition up by nameLower, case-insensitively', () => {
    const ctx = confirm(confirmSeed({ raceName: 'SALTKIN' }));
    expect(statsOf(rows(ctx, 'character')[0])).toEqual({ str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n });
  });

  it('a +STR race bonus raises max HP by exactly HP_STR_MULTIPLIER per point, and hp equals maxHp', () => {
    const bonus = '{"primary":{"stat":"str","value":2}}';
    const plain = rows(confirm(confirmSeed({}, {}, null)), 'character')[0];
    const boosted = rows(confirm(confirmSeed({}, {}, bonus)), 'character')[0];
    expect(boosted.maxHp - plain.maxHp).toBe(2n * HP_STR_MULTIPLIER);
    expect(boosted.hp).toBe(boosted.maxHp);
  });

  it('the stored stats equal the shared helper result (the client sheet parity)', () => {
    const ctx = confirm(confirmSeed());
    const expected = computeCreationStats('int', 'wis', SALTKIN_BONUSES).stats;
    expect(statsOf(rows(ctx, 'character')[0])).toEqual(expected);
  });

  it('does not touch an existing character of another user', () => {
    const other = {
      id: 9n,
      ownerUserId: 8n,
      name: 'Old',
      race: 'Saltkin',
      className: 'Warrior',
      level: 1n,
      str: 10n,
      dex: 10n,
      cha: 10n,
      wis: 10n,
      int: 10n,
    };
    const ctx = confirm(confirmSeed({}, { character: [other] }));
    const chars = rows(ctx, 'character');
    expect(chars).toHaveLength(2);
    const old = chars.find((c: any) => c.id === 9n);
    expect(statsOf(old)).toEqual({ str: 10n, dex: 10n, cha: 10n, wis: 10n, int: 10n });
  });
});

describe('finalizeCharacter online status (plan 51.1-01)', () => {
  it('inserts the character offline with no stamp, then the sync turns it online in the same call', () => {
    const inserted: any[] = [];
    const ctx = newCtx(confirmSeed({}, {}));
    const table = ctx.db.character;
    const realInsert = table.insert;
    const spyDb = new Proxy(ctx.db, {
      get: (target: any, name: string) =>
        name === 'character'
          ? new Proxy(table, {
              get: (t: any, prop: string) =>
                prop === 'insert'
                  ? (row: any) => {
                      inserted.push({ ...row });
                      return realInsert(row);
                    }
                  : t[prop],
            })
          : target[name],
    });
    submitCreationInput({ ...ctx, db: spyDb }, { text: 'confirm' });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ online: false, lastOnlineAtMicros: 0n });
    const c = rows(ctx, 'character')[0];
    expect(c).toMatchObject({ online: true, lastOnlineAtMicros: T0 });
  });

  it('the previous active character of the player goes offline', () => {
    const previous = {
      id: 9n,
      ownerUserId: 7n,
      name: 'Old',
      race: 'Saltkin',
      className: 'Warrior',
      level: 1n,
      online: true,
      lastOnlineAtMicros: 5n,
    };
    const seed = confirmSeed({}, { character: [previous] });
    seed.player = [{ id: alice, userId: 7n, activeCharacterId: 9n }];
    const ctx = confirm(seed);
    const chars = rows(ctx, 'character');
    const created = chars.find((c: any) => c.id !== 9n);
    expect(rows(ctx, 'player')[0].activeCharacterId).toBe(created.id);
    expect(created).toMatchObject({ online: true, lastOnlineAtMicros: T0 });
    expect(chars.find((c: any) => c.id === 9n)).toMatchObject({ online: false, lastOnlineAtMicros: T0 });
  });
});
