/**
 * Phase 51.3 Plan 05: a real victory (the captured resolve_round_timer reducer on the strict mock db)
 * drops loot again. Kills read the rule-based fallback or the enemy's AI loot table, each combat_enemy
 * row rolls from its own seed, gold from every enemy is summed and written once, and every roll reads
 * the economy dials. Expected values come from the pure rules and the loot helpers with the same
 * timestamp and ids; no roll outcome is hard-coded.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { T0, MODULE, fightSeed, fightCtx, rows, openTickArg } from '../helpers/combat_fight_fixture';
import { DEFAULT_DIALS, creatureProfile, goldReward, lootSeed } from '../data/economy_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let resolveRoundTimer: (...args: any[]) => any;
let loot: typeof import('../helpers/loot');
let economyState: typeof import('../helpers/economy_state');

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('resolve_round_timer');
  if (typeof h !== 'function') throw new Error('capturedReducer(resolve_round_timer) is not a function');
  resolveRoundTimer = h;
  loot = await import('../helpers/loot');
  economyState = await import('../helpers/economy_state');
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

const TEN_S = 10_000_000n;
const NOW = T0 + TEN_S;

const item = (id: bigint, name: string, extra: Record<string, any> = {}) => ({
  id,
  name,
  slot: 'resource',
  rarity: 'common',
  armorClassBonus: 0n,
  requiredLevel: 1n,
  tier: 1n,
  isJunk: false,
  stackable: true,
  description: '',
  ...extra,
});

const JUNK = [item(100n, 'Rat Tail', { slot: 'junk', isJunk: true }), item(101n, 'Torn Pelt', { slot: 'junk', isJunk: true })];
const HIDE = item(110n, 'Rough Hide', { slot: 'material' });
const SWORD = item(200n, 'Iron Sword', { slot: 'mainHand', requiredLevel: 1n, stackable: false });
const ALL_ITEMS = [...JUNK, HIDE, SWORD];

const TWO_RATS = [
  { id: 1n, name: 'Cave Rat', hp: 1n },
  { id: 2n, name: 'Cave Rat', hp: 0n },
];

type Extra = Record<string, any[]>;
const dials = (patch: Record<string, unknown>) => ({ economy_dials: [{ id: 1n, ...DEFAULT_DIALS, ...patch }] });

function seedFor(extra: Extra = {}, enemies = TWO_RATS) {
  const merged: Extra = { item_template: ALL_ITEMS };
  for (const [k, v] of Object.entries(extra)) merged[k] = [...(merged[k] ?? []), ...v];
  return fightSeed({ withOpenRound: true, enemies, extra: merged });
}

/** Resolve the open round the way the scheduler does. */
function fire(ctx: any) {
  const tick = openTickArg(ctx);
  ctx.sender = MODULE;
  resolveRoundTimer(ctx, tick);
  const table = ctx.db._tables.round_timer_tick ?? [];
  const idx = table.findIndex((r: any) => r.scheduledId === tick.arg.scheduledId);
  if (idx >= 0) table.splice(idx, 1);
}

/** Fight one round at `now` and require that it ended in victory. */
function victory(extra: Extra = {}, now: bigint = NOW, enemies = TWO_RATS) {
  const ctx = fightCtx(seedFor(extra, enemies), MODULE, now);
  fire(ctx);
  expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
  return ctx;
}

/** Same seed, untouched: the state handleVictory saw, for computing the expected rolls. */
function expectedLoot(extra: Extra, now: bigint, enemyIds: bigint[] = [1n, 2n]) {
  const ctx = fightCtx(seedFor(extra), MODULE, now);
  const combat = rows(ctx, 'combat_encounter')[0];
  const participants = rows(ctx, 'combat_participant');
  const lc = loot.buildVictoryLootContext(ctx, combat, participants);
  const template = rows(ctx, 'enemy_template')[0];
  return enemyIds.map((id) => loot.rollEnemyLoot(ctx, lc, { id, enemyTemplateId: 1n }, template, 1n));
}

const lootRows = (ctx: any) => rows(ctx, 'combat_loot').filter((r: any) => r.characterId === 1n && r.combatId === 1n);
const gold = (ctx: any) => rows(ctx, 'character').find((c: any) => c.id === 1n).gold as bigint;
const lines = (ctx: any, pattern: RegExp) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === 1n && pattern.test(e.message));
const beastGold = (now: bigint, enemyId: bigint, pct = 100n) => goldReward(creatureProfile('beast'), 1n, lootSeed(now, 1n, enemyId), pct);
const brief = (r: any) => `${r.itemTemplateId}:${r.qualityTier ?? '-'}:${r.craftQuality ?? '-'}:${r.affixDataJson ?? '-'}`;

describe('a kill drops loot again', () => {
  it('a level-1 beast at default dials with only junk seeded drops a row and at least 1 gold', () => {
    const ctx = fightCtx(fightSeed({ withOpenRound: true, enemies: [{ id: 1n, name: 'Cave Rat', hp: 1n }], extra: { item_template: JUNK } }), MODULE, NOW);
    fire(ctx);
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
    const dropped = lootRows(ctx);
    expect(dropped.length).toBeGreaterThanOrEqual(1);
    expect([100n, 101n]).toContain(dropped[0].itemTemplateId);
    expect(dropped[0].ownerUserId).toBe(7n);
    expect(dropped[0].createdAt.microsSinceUnixEpoch).toBe(NOW);
    expect(gold(ctx)).toBeGreaterThanOrEqual(1n);
  });

  it('two enemies of one template both reach the victory: gold is the exact sum of both kills', () => {
    const ctx = victory();
    expect(gold(ctx)).toBe(beastGold(NOW, 1n) + beastGold(NOW, 2n));
    expect(lines(ctx, /^You gain \d+ gold\./)).toHaveLength(1);
  });

  it('the rows are the per-enemy rolls in combat_enemy id order', () => {
    const ctx = victory();
    const [a, b] = expectedLoot({}, NOW);
    expect(lootRows(ctx).map(brief)).toEqual([...a!, ...b!].map(brief));
  });

  it('across 20 timestamps the two enemies roll differently at least once', () => {
    let differs = 0;
    for (let k = 0n; k < 20n; k += 1n) {
      const now = NOW + k * 1_000_003n;
      const ctx = victory({}, now);
      const [a, b] = expectedLoot({}, now);
      expect(lootRows(ctx).map(brief)).toEqual([...a!, ...b!].map(brief));
      if (JSON.stringify(a!.map(brief)) !== JSON.stringify(b!.map(brief))) differs += 1;
    }
    expect(differs).toBeGreaterThan(0);
  });
});

describe('the dials', () => {
  it('drop rate 0: no item rows, gold still credited, "No loot dropped" and no combat_result', () => {
    const ctx = victory(dials({ dropRatePct: 0n }));
    expect(lootRows(ctx)).toHaveLength(0);
    expect(gold(ctx)).toBe(beastGold(NOW, 1n) + beastGold(NOW, 2n));
    expect(lines(ctx, /^No loot dropped from /)).toHaveLength(1);
    expect(lines(ctx, /^Loot dropped:/)).toHaveLength(0);
    expect(rows(ctx, 'combat_result').filter((r: any) => r.characterId === 1n)).toHaveLength(0);
  });

  it('gold 300%: three times the default gold for the same timestamp', () => {
    const ctx = victory(dials({ goldPct: 300n }));
    expect(gold(ctx)).toBe(3n * (beastGold(NOW, 1n) + beastGold(NOW, 2n)));
  });

  it('a dial change after the victory leaves its rows untouched', () => {
    const ctx = victory();
    const before = lootRows(ctx).map((r: any) => ({ ...r }));
    const goldBefore = gold(ctx);
    economyState.applyDialChange(ctx, { scope: 'global', dial: 'drop', value: 0n });
    expect(economyState.loadEffectiveDials(ctx, 1n).dropRatePct).toBe(0n);
    expect(lootRows(ctx)).toEqual(before);
    expect(gold(ctx)).toBe(goldBefore);
  });
});

describe('AI loot tables', () => {
  const AI = {
    item_template: [item(300n, 'Ember Hide', { slot: 'material' }), item(301n, 'Charred Fang', { slot: 'junk', isJunk: true }), item(302n, 'Ash Reed')],
    enemy_loot_entry: [
      { id: 1n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 300n, role: 'drop', weight: 40n },
      { id: 2n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 301n, role: 'trophy', weight: 25n },
      { id: 3n, enemyTemplateId: 1n, regionId: 1n, itemTemplateId: 302n, role: 'gatherable', weight: 15n },
    ],
  };

  it('the common picks come only from the enemy table', () => {
    const seen = new Set<bigint>();
    for (let k = 0n; k < 10n; k += 1n) {
      const ctx = victory(AI, NOW + k * 31n);
      for (const r of lootRows(ctx)) if (r.qualityTier === undefined) seen.add(r.itemTemplateId);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const id of seen) expect([300n, 301n, 302n]).toContain(id);
  });
});

describe('legendary needs a fight-exact named foe', () => {
  const MAX = dials({
    rarityShift: 2n,
    bossRarityBonus: 2n,
    tierCommonPct: 300n,
    tierUncommonPct: 300n,
    tierRarePct: 300n,
    tierEpicPct: 300n,
    tierLegendaryPct: 300n,
  });
  const named = (killedAt: bigint) => ({
    named_enemy: [
      { id: 1n, characterId: 1n, name: 'Old Gnaw', enemyTemplateId: 1n, locationId: 10n, isAlive: false, lastKilledAt: { microsSinceUnixEpoch: killedAt } },
    ],
  });
  const gearTiers = (extra: Extra) => {
    const tiers: string[] = [];
    for (let k = 0n; k < 40n; k += 1n) {
      const ctx = victory(extra, NOW + k * 1_000_003n);
      for (const r of lootRows(ctx)) if (r.qualityTier !== undefined) tiers.push(r.qualityTier);
    }
    return tiers;
  };

  it('named this fight, rarity dials at their maximum: a gear drop can be legendary', () => {
    const tiers = gearTiers({ ...MAX, ...named(T0) });
    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers).toContain('legendary');
  });

  it('named row killed before the encounter began: never legendary', () => {
    const tiers = gearTiers({ ...MAX, ...named(T0 - 1n) });
    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers).not.toContain('legendary');
  });
});

describe('the announcement and combat_result', () => {
  it('"Loot dropped:" lists the rows and the combat_result row stays', () => {
    const ctx = victory();
    const dropped = lootRows(ctx);
    expect(dropped.length).toBeGreaterThan(0);
    const announce = lines(ctx, /^Loot dropped:/);
    expect(announce).toHaveLength(1);
    expect(announce[0].message.split('\n')).toHaveLength(dropped.length + 1);
    expect(lines(ctx, /^No loot dropped/)).toHaveLength(0);
    const results = rows(ctx, 'combat_result').filter((r: any) => r.characterId === 1n);
    expect(results).toHaveLength(1);
    expect(results[0].summary).toMatch(/^Victory against Cave Rat and allies\./);
  });
});
