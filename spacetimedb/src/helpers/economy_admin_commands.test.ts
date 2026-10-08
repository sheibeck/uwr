import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx as createLenientMockCtx } from './test-utils';
import {
  ECONOMY_ADMIN_REFUSAL_LINE,
  ECONOMY_COMMAND_USAGE,
  ECONOMY_PIN_COVERAGE,
  handleEconomyAdminCommand,
  parseDialValue,
  parseEconomyCommand,
  repairReportLines,
} from './economy_admin_commands';
import { DEFAULT_DIALS } from '../data/economy_rules';
import { LLM_RESTING_LINE } from './llm_queue';
import { defaultLlmAdminStateRow } from './test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const CLI_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const admin = { toHexString: () => CLI_HEX };
const stranger = { toHexString: () => 'b'.repeat(64) };
const character = { id: 1n, ownerUserId: 7n };

type Seed = Record<string, any[]>;
const ctxFor = (sender: any, seed: Seed = {}) =>
  createLenientMockCtx({ sender, seed, timestampMicros: 1_700_000_000_000_000n, strict: true } as any);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const systemLines = (ctx: any): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);

const ECONOMY_TABLES = [
  'economy_dials',
  'economy_region_dial',
  'economy_item_dial',
  'region_economy',
  'economy_item',
  'enemy_loot_entry',
  'region_recipe',
];
const snapshot = (ctx: any) =>
  JSON.stringify(
    ECONOMY_TABLES.map((n) => rows(ctx, n)),
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
  );

const REGION = { id: 7n, name: 'Kesterlane Basin' };
const ITEM = { id: 40n, name: 'Ember Moss' };
const seeded = (): Seed => ({
  region: [REGION, { id: 8n, name: 'Ashfall' }, { id: 9n, name: 'Tidemarch' }],
  item_template: [ITEM],
});

/** seeded() plus two locations in Kesterlane Basin (region 7), so it can be designed. */
const designSeed = (extra: Seed = {}): Seed => ({
  ...seeded(),
  location: [
    { id: 70n, name: 'Pans', regionId: 7n, terrainType: 'swamp', isSafe: false },
    { id: 71n, name: 'Hearth', regionId: 7n, terrainType: 'town', isSafe: true },
  ],
  ...extra,
});

// Every system line any test writes lands here for the suite-wide plain-text scan.
const allLines: string[] = [];
const run = (ctx: any, text: string) => {
  const handled = handleEconomyAdminCommand(ctx, character, text);
  allLines.push(...systemLines(ctx));
  return handled;
};
const dialsRow = (ctx: any) => rows(ctx, 'economy_dials')[0];

describe('parseDialValue', () => {
  it('takes whole numbers with an optional sign and trailing %', () => {
    expect(parseDialValue('150')).toBe(150n);
    expect(parseDialValue('150%')).toBe(150n);
    expect(parseDialValue('+1')).toBe(1n);
    expect(parseDialValue('-2')).toBe(-2n);
    expect(parseDialValue('0')).toBe(0n);
  });
  it('refuses everything else', () => {
    for (const t of ['150.5', '1e3', 'abc', '', '%', '1234567', '--1', '1 0', '1,0']) {
      expect(parseDialValue(t), JSON.stringify(t)).toBeNull();
    }
  });
});

describe('parseEconomyCommand', () => {
  it('returns null for text that is not /economy', () => {
    for (const t of ['/economyx', 'economy', '/llm stats', 'hello /economy', '', '/eco']) {
      expect(parseEconomyCommand(t), t).toBeNull();
    }
  });

  it('parses show', () => {
    expect(parseEconomyCommand('/economy')).toEqual({ verb: 'show' });
    expect(parseEconomyCommand('/ECONOMY show')).toEqual({ verb: 'show' });
    expect(parseEconomyCommand('  /economy   Show ')).toEqual({ verb: 'show' });
  });

  it('parses the global dials', () => {
    expect(parseEconomyCommand('/economy gold 150%')).toEqual({ verb: 'set', scope: 'global', dial: 'gold', value: 150n });
    expect(parseEconomyCommand('/economy rarity +1')).toEqual({ verb: 'set', scope: 'global', dial: 'rarity', value: 1n });
    expect(parseEconomyCommand('/economy rarity -2')).toEqual({ verb: 'set', scope: 'global', dial: 'rarity', value: -2n });
    expect(parseEconomyCommand('/economy Drop 80')).toEqual({ verb: 'set', scope: 'global', dial: 'drop', value: 80n });
  });

  it('parses tier weights', () => {
    expect(parseEconomyCommand('/economy tier epic 50')).toEqual({ verb: 'set', scope: 'tier', dial: 'epic', value: 50n });
  });

  it('parses the region forms', () => {
    expect(parseEconomyCommand('/economy region Kesterlane Basin drop 50')).toEqual({
      verb: 'region_set',
      regionName: 'Kesterlane Basin',
      dial: 'drop',
      value: 50n,
    });
    expect(parseEconomyCommand('/economy region Kesterlane   Basin reset')).toEqual({
      verb: 'region_reset',
      regionName: 'Kesterlane Basin',
    });
    expect(parseEconomyCommand('/economy region Kesterlane Basin')).toEqual({
      verb: 'region_show',
      regionName: 'Kesterlane Basin',
    });
    expect(parseEconomyCommand('/economy region Ashfall')).toEqual({ verb: 'region_show', regionName: 'Ashfall' });
  });

  it('parses the item forms', () => {
    expect(parseEconomyCommand('/economy item Ember Moss drop 0')).toEqual({
      verb: 'item_set',
      itemName: 'Ember Moss',
      value: 0n,
    });
    expect(parseEconomyCommand('/economy item Ember Moss reset')).toEqual({ verb: 'item_reset', itemName: 'Ember Moss' });
  });

  it('parses repair: the region name is every token after the verb; no name is help', () => {
    expect(parseEconomyCommand('/economy repair Kesterlane Basin')).toEqual({ verb: 'repair', regionName: 'Kesterlane Basin' });
    expect(parseEconomyCommand('/economy REPAIR   Ashfall')).toEqual({ verb: 'repair', regionName: 'Ashfall' });
    expect(parseEconomyCommand('/economy repair')).toEqual({ verb: 'help' });
  });

  it('parses design: the region name is every token after the verb; no name is help', () => {
    expect(parseEconomyCommand('/economy design Kesterlane Basin')).toEqual({ verb: 'design', regionName: 'Kesterlane Basin' });
    expect(parseEconomyCommand('/economy DESIGN   Ashfall')).toEqual({ verb: 'design', regionName: 'Ashfall' });
    expect(parseEconomyCommand('/economy design')).toEqual({ verb: 'help' });
    expect(parseEconomyCommand('/economy design   ')).toEqual({ verb: 'help' });
  });

  it('parses ai and reset', () => {
    expect(parseEconomyCommand('/economy ai on')).toEqual({ verb: 'ai', enabled: true });
    expect(parseEconomyCommand('/economy AI off')).toEqual({ verb: 'ai', enabled: false });
    expect(parseEconomyCommand('/economy reset')).toEqual({ verb: 'reset' });
  });

  it('answers help for every malformed form', () => {
    for (const t of [
      '/economy gold 150.5',
      '/economy gold 1e3',
      '/economy gold abc',
      '/economy gold',
      '/economy gold 1 2',
      '/economy tier mythic 50',
      '/economy tier epic',
      '/economy region',
      '/economy region Ashfall drop',
      '/economy region Ashfall drop abc',
      '/economy item',
      '/economy item Ember Moss',
      '/economy item Ember Moss drop',
      '/economy item Ember Moss drop 5.5',
      '/economy ai',
      '/economy ai maybe',
      '/economy reset now',
      '/economy show me',
      '/economy wibble',
    ]) {
      expect(parseEconomyCommand(t), t).toEqual({ verb: 'help' });
    }
  });
});

describe('handleEconomyAdminCommand: non-/economy text', () => {
  it('returns false and writes nothing', () => {
    const ctx = ctxFor(admin);
    for (const t of ['/economyx', 'look', '/llm stats']) expect(handleEconomyAdminCommand(ctx, character, t)).toBe(false);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

describe('handleEconomyAdminCommand: a stranger', () => {
  it.each([
    '/economy',
    '/economy show',
    '/economy gold 150',
    '/economy tier epic 50',
    '/economy region Ashfall drop 50',
    '/economy region Ashfall reset',
    '/economy item Ember Moss drop 5',
    '/economy ai on',
    '/economy reset',
    '/economy huh',
    '/economy design Kesterlane Basin',
    '/economy repair Kesterlane Basin',
  ])('%s gets the refusal and changes no economy table', (text) => {
    const ctx = ctxFor(stranger, {
      ...seeded(),
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS }],
      economy_region_dial: [{ regionId: 8n, dropRatePct: 40n }],
    });
    const before = snapshot(ctx);
    expect(run(ctx, text)).toBe(true);
    expect(systemLines(ctx)).toEqual([ECONOMY_ADMIN_REFUSAL_LINE]);
    expect(snapshot(ctx)).toBe(before);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a stranger cannot start a design even with the AI switch on', () => {
    const ctx = ctxFor(stranger, designSeed({ economy_dials: [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }] }));
    const before = snapshot(ctx);
    run(ctx, '/economy design Kesterlane Basin');
    expect(systemLines(ctx)).toEqual([ECONOMY_ADMIN_REFUSAL_LINE]);
    expect(snapshot(ctx)).toBe(before);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  });

  it('the refusal is in the Keeper voice and plain text', () => {
    expect(ECONOMY_ADMIN_REFUSAL_LINE).toBe('The Keeper does not open his ledgers to you.');
  });
});

describe('handleEconomyAdminCommand: global and tier dials', () => {
  it('sets gold and reports it', () => {
    const ctx = ctxFor(admin);
    expect(run(ctx, '/economy gold 150')).toBe(true);
    expect(dialsRow(ctx).goldPct).toBe(150n);
    expect(systemLines(ctx)).toEqual(['Gold set to 150%.']);
  });

  it('150 and 150% are the same', () => {
    const a = ctxFor(admin);
    const b = ctxFor(admin);
    run(a, '/economy gold 150');
    run(b, '/economy gold 150%');
    expect(dialsRow(a).goldPct).toBe(dialsRow(b).goldPct);
    expect(systemLines(a)).toEqual(systemLines(b));
  });

  it('stores 300 and says so for gold 400', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy gold 400');
    expect(dialsRow(ctx).goldPct).toBe(300n);
    expect(systemLines(ctx)).toEqual(['Gold set to 300% (300% is the most).']);
  });

  it('gather 10 is clamped up to the least', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy gather 10');
    expect(dialsRow(ctx).gatherRatePct).toBe(50n);
    expect(systemLines(ctx)).toEqual(['Gather rate set to 50% (50% is the least).']);
  });

  it('the shift dials report bare numbers', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy rarity 5');
    run(ctx, '/economy rarity -9');
    run(ctx, '/economy boss 7');
    expect(systemLines(ctx)).toEqual([
      'Rarity set to 2 (2 is the most).',
      'Rarity set to -2 (-2 is the least).',
      'Boss bonus set to 2 (2 is the most).',
    ]);
    expect(dialsRow(ctx).rarityShift).toBe(-2n);
    expect(dialsRow(ctx).bossRarityBonus).toBe(2n);
  });

  it('drop 0 is allowed', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy drop 0');
    expect(dialsRow(ctx).dropRatePct).toBe(0n);
    expect(systemLines(ctx)).toEqual(['Drop rate set to 0%.']);
  });

  it('sets a tier weight', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy tier epic 50');
    expect(dialsRow(ctx).tierEpicPct).toBe(50n);
    expect(dialsRow(ctx).tierRarePct).toBe(100n);
    expect(systemLines(ctx)).toEqual(['Epic weight set to 50%.']);
  });

  it('setting the same value twice leaves one row with that value', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy gold 150');
    run(ctx, '/economy gold 150');
    expect(rows(ctx, 'economy_dials')).toHaveLength(1);
    expect(dialsRow(ctx).goldPct).toBe(150n);
  });

  it.each(['/economy gold 150.5', '/economy gold 1e3', '/economy gold abc', '/economy gold', '/economy tier mythic 5'])(
    '%s prints the usage line and writes nothing',
    (text) => {
      const ctx = ctxFor(admin);
      run(ctx, text);
      expect(systemLines(ctx)).toEqual([ECONOMY_COMMAND_USAGE]);
      expect(rows(ctx, 'economy_dials')).toHaveLength(0);
    },
  );
});

describe('handleEconomyAdminCommand: regions', () => {
  it('sets a region dial and reports the region by its stored name', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy region kesterlane   basin drop 50');
    expect(rows(ctx, 'economy_region_dial')).toHaveLength(1);
    expect(rows(ctx, 'economy_region_dial')[0]).toMatchObject({ regionId: 7n, dropRatePct: 50n });
    expect(systemLines(ctx)).toEqual(['Drop rate for Kesterlane Basin set to 50%.']);
  });

  it('reports a clamped region value with its limit', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy region Ashfall gold 999');
    expect(systemLines(ctx)).toEqual(['Gold for Ashfall set to 300% (300% is the most).']);
  });

  it('an unknown region is refused and nothing is written', () => {
    const ctx = ctxFor(admin, seeded());
    const before = snapshot(ctx);
    run(ctx, '/economy region Nowhere drop 50');
    expect(systemLines(ctx)).toEqual(['No region by that name.']);
    expect(snapshot(ctx)).toBe(before);
  });

  it('reset removes the override; a second reset writes nothing', () => {
    const ctx = ctxFor(admin, { ...seeded(), economy_region_dial: [{ regionId: 8n, dropRatePct: 40n }] });
    run(ctx, '/economy region Ashfall reset');
    expect(rows(ctx, 'economy_region_dial')).toHaveLength(0);
    expect(systemLines(ctx)).toEqual(['Ashfall is back on the global dials.']);
    const before = snapshot(ctx);
    run(ctx, '/economy region Ashfall reset');
    expect(snapshot(ctx)).toBe(before);
    expect(systemLines(ctx)[1]).toBe('Ashfall has no overrides.');
  });

  it('reset on a region with no override writes nothing', () => {
    const ctx = ctxFor(admin, seeded());
    const before = snapshot(ctx);
    run(ctx, '/economy region Tidemarch reset');
    expect(snapshot(ctx)).toBe(before);
    expect(systemLines(ctx)).toEqual(['Tidemarch has no overrides.']);
  });

  it('reset on an unknown region is refused', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy region Nowhere reset');
    expect(systemLines(ctx)).toEqual(['No region by that name.']);
  });

  it('shows the effective dials, the overrides, the status and the counts', () => {
    const ctx = ctxFor(admin, {
      ...seeded(),
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 120n }],
      economy_region_dial: [{ regionId: 8n, dropRatePct: 40n }],
      region_economy: [{ regionId: 8n, status: 'complete', jobId: 1n, otherRegionIds: '[]' }],
      economy_item: [
        { itemTemplateId: 1n, regionId: 8n, role: 'gather' },
        { itemTemplateId: 2n, regionId: 8n, role: 'drop' },
        { itemTemplateId: 3n, regionId: 9n, role: 'drop' },
      ],
      enemy_loot_entry: [
        { id: 1n, enemyTemplateId: 5n, regionId: 8n, itemTemplateId: 1n, role: 'drop', weight: 1n },
        { id: 2n, enemyTemplateId: 5n, regionId: 9n, itemTemplateId: 3n, role: 'drop', weight: 1n },
      ],
      region_recipe: [{ recipeTemplateId: 1n, regionId: 8n, tier: 'common', learnBy: 'research', scrollTemplateId: 0n }],
    });
    const before = snapshot(ctx);
    run(ctx, '/economy region Ashfall');
    const text = systemLines(ctx)[0];
    expect(text).toContain('Ashfall');
    expect(text).toContain('Drop rate: 40% (set for this region)');
    expect(text).toContain('Gold: 120%');
    expect(text).not.toMatch(/Gold: 120% \(set/);
    expect(text).toContain('designed');
    expect(text).toMatch(/2 items/);
    expect(text).toMatch(/1 loot entr/);
    expect(text).toMatch(/1 recipe/);
    expect(snapshot(ctx)).toBe(before);
  });

  // Owner request: the region line breaks the economy down by role and the recipes by tier.
  it('breaks the economy down: gatherables, creature items by role, crafted outputs, loot entries, recipes by tier', () => {
    const tag = (id: bigint, role: string) => ({ itemTemplateId: id, regionId: 7n, role });
    const economy_item = [
      tag(1n, 'gather'), tag(2n, 'gather'), tag(3n, 'gather'),
      tag(4n, 'drop'), tag(5n, 'drop'), tag(6n, 'drop'),
      tag(7n, 'trophy'), tag(8n, 'trophy'), tag(9n, 'trophy'),
      tag(10n, 'gear'), tag(11n, 'gear'), tag(12n, 'gear'),
      tag(13n, 'recipe_output'), tag(14n, 'recipe_output'), tag(15n, 'recipe_output'),
      { itemTemplateId: 99n, regionId: 8n, role: 'gather' },
    ];
    const enemy_loot_entry = Array.from({ length: 13 }, (_, i) => ({
      id: BigInt(i + 1), enemyTemplateId: 5n, regionId: 7n, itemTemplateId: 1n, role: 'drop', weight: 1n,
    }));
    const region_recipe = [
      { recipeTemplateId: 1n, regionId: 7n, tier: 'common', learnBy: 'research', scrollTemplateId: 0n },
      { recipeTemplateId: 2n, regionId: 7n, tier: 'common', learnBy: 'research', scrollTemplateId: 0n },
      { recipeTemplateId: 3n, regionId: 7n, tier: 'uncommon', learnBy: 'research', scrollTemplateId: 0n },
    ];
    const ctx = ctxFor(admin, {
      ...seeded(),
      region_economy: [{ regionId: 7n, status: 'complete', jobId: 1n, otherRegionIds: '[]' }],
      economy_item,
      enemy_loot_entry,
      region_recipe,
    });
    run(ctx, '/economy region Kesterlane Basin');
    const text = systemLines(ctx)[0];
    expect(text.split('\n')).toContain(
      'Economy: 15 items (3 gatherables, 9 creature items: 3 drops, 3 trophies, 3 gear; 3 crafted outputs), 13 loot entries, 3 recipes (2 common, 1 uncommon)',
    );
  });

  it('the breakdown names recipe scrolls when the region has some, and counts singular forms', () => {
    const ctx = ctxFor(admin, {
      ...seeded(),
      region_economy: [{ regionId: 7n, status: 'complete', jobId: 1n, otherRegionIds: '[]' }],
      economy_item: [
        { itemTemplateId: 1n, regionId: 7n, role: 'gather' },
        { itemTemplateId: 2n, regionId: 7n, role: 'drop' },
        { itemTemplateId: 3n, regionId: 7n, role: 'recipe_output' },
        { itemTemplateId: 4n, regionId: 7n, role: 'scroll' },
      ],
      enemy_loot_entry: [{ id: 1n, enemyTemplateId: 5n, regionId: 7n, itemTemplateId: 1n, role: 'drop', weight: 1n }],
      region_recipe: [{ recipeTemplateId: 1n, regionId: 7n, tier: 'rare', learnBy: 'scroll', scrollTemplateId: 4n }],
    });
    run(ctx, '/economy region Kesterlane Basin');
    expect(systemLines(ctx)[0].split('\n')).toContain(
      'Economy: 4 items (1 gatherable, 1 creature item: 1 drop, 0 trophies, 0 gear; 1 crafted output; 1 recipe scroll), 1 loot entry, 1 recipe (1 rare)',
    );
  });

  it('a region with no row is on fallbacks', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy region Tidemarch');
    expect(systemLines(ctx)[0]).toContain('on fallbacks');
  });
});

describe('handleEconomyAdminCommand: item pins', () => {
  it('sets a pin and reports the item by its stored name', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy item ember MOSS drop 0');
    expect(rows(ctx, 'economy_item_dial')).toEqual([{ itemTemplateId: 40n, dropRatePct: 0n }]);
    expect(systemLines(ctx)).toEqual([`Drop rate for Ember Moss set to 0%. ${ECONOMY_PIN_COVERAGE}`]);
  });

  it('clamps a pin', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy item Ember Moss drop 900');
    expect(systemLines(ctx)).toEqual([`Drop rate for Ember Moss set to 300% (300% is the most). ${ECONOMY_PIN_COVERAGE}`]);
  });

  // Review A WR-04: the reply says plainly which rolls a pin scales.
  it('the pin coverage line names every roll a pin scales', () => {
    for (const word of ['kill drops', 'gear', 'essences', 'reagents', 'recipe scrolls', 'gathering nodes']) {
      expect(ECONOMY_PIN_COVERAGE).toContain(word);
    }
  });

  it('an unknown item is refused and nothing is written', () => {
    const ctx = ctxFor(admin, seeded());
    const before = snapshot(ctx);
    run(ctx, '/economy item Nothing drop 5');
    expect(systemLines(ctx)).toEqual(['No item by that name.']);
    expect(snapshot(ctx)).toBe(before);
  });

  it('reset removes the pin; with no pin it writes nothing', () => {
    const ctx = ctxFor(admin, { ...seeded(), economy_item_dial: [{ itemTemplateId: 40n, dropRatePct: 0n }] });
    run(ctx, '/economy item Ember Moss reset');
    expect(rows(ctx, 'economy_item_dial')).toHaveLength(0);
    expect(systemLines(ctx)).toEqual(['The drop rate for Ember Moss is back to normal.']);
    const before = snapshot(ctx);
    run(ctx, '/economy item Ember Moss reset');
    expect(snapshot(ctx)).toBe(before);
    expect(systemLines(ctx)[1]).toBe('Ember Moss has no pin.');
  });
});

describe('handleEconomyAdminCommand: ai and reset', () => {
  it('ai on and off write aiEnabled and say so', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy ai on');
    expect(dialsRow(ctx).aiEnabled).toBe(true);
    run(ctx, '/economy ai off');
    expect(dialsRow(ctx).aiEnabled).toBe(false);
    expect(systemLines(ctx)).toEqual([
      'AI economy: on. New regions will get an AI-designed economy.',
      'AI economy: off. Regions use the rule-based economy.',
    ]);
  });

  it('reset restores defaults, keeps the AI switch and clears every override', () => {
    const ctx = ctxFor(admin, {
      ...seeded(),
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 250n, tierEpicPct: 10n, aiEnabled: true }],
      economy_region_dial: [{ regionId: 8n, dropRatePct: 40n }],
      economy_item_dial: [{ itemTemplateId: 40n, dropRatePct: 0n }],
    });
    run(ctx, '/economy reset');
    expect(dialsRow(ctx)).toMatchObject({ ...DEFAULT_DIALS, aiEnabled: true });
    expect(rows(ctx, 'economy_region_dial')).toHaveLength(0);
    expect(rows(ctx, 'economy_item_dial')).toHaveLength(0);
    expect(systemLines(ctx)).toEqual(['Economy dials reset to defaults. The AI economy switch was left on.']);
  });

  it('says off when the switch was off, and run twice gives the same state', () => {
    const ctx = ctxFor(admin, {
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 250n }],
    });
    run(ctx, '/economy reset');
    const once = snapshot(ctx);
    run(ctx, '/economy reset');
    expect(snapshot(ctx)).toBe(once);
    expect(systemLines(ctx)[0]).toBe('Economy dials reset to defaults. The AI economy switch was left off.');
  });
});

describe('handleEconomyAdminCommand: show', () => {
  it('lists every dial, the tier weights, the switch, the override counts and the region counts', () => {
    const ctx = ctxFor(admin, {
      ...seeded(),
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 120n, tierEpicPct: 50n, aiEnabled: true }],
      economy_region_dial: [{ regionId: 8n, dropRatePct: 40n }, { regionId: 9n, goldPct: 10n }],
      economy_item_dial: [{ itemTemplateId: 40n, dropRatePct: 0n }],
      region_economy: [
        { regionId: 7n, status: 'complete', jobId: 1n, otherRegionIds: '[]' },
        { regionId: 8n, status: 'pending', jobId: 2n, otherRegionIds: '[]' },
      ],
    });
    const before = snapshot(ctx);
    expect(run(ctx, '/economy')).toBe(true);
    const text = systemLines(ctx)[0];
    for (const needle of [
      'Rarity: 0',
      'Drop rate: 100%',
      'Gold: 120%',
      'Gather rate: 100%',
      'Boss bonus: 0',
      'Common 100%',
      'Epic 50%',
      'Legendary 100%',
      'AI economy: on',
      'Region overrides: 2',
      'Item pins: 1',
      '1 designed',
      '1 pending',
      '0 failed',
      '1 on fallbacks',
    ]) {
      expect(text, needle).toContain(needle);
    }
    expect(snapshot(ctx)).toBe(before);
  });

  it('works on an empty database (defaults, AI off) without writing', () => {
    const ctx = ctxFor(admin);
    run(ctx, '/economy show');
    const text = systemLines(ctx)[0];
    expect(text).toContain('AI economy: off');
    expect(text).toContain('Gold: 100%');
    expect(rows(ctx, 'economy_dials')).toHaveLength(0);
  });

  it('strips brackets and braces from echoed names', () => {
    const ctx = ctxFor(admin, {
      region: [{ id: 7n, name: 'Ash[fall] <b>{x}' }],
      item_template: [{ id: 40n, name: 'Moss [link] <i>' }],
    });
    run(ctx, '/economy region Ash[fall] <b>{x}');
    run(ctx, '/economy region Ash[fall] <b>{x} drop 5');
    run(ctx, '/economy item Moss [link] <i> drop 5');
    run(ctx, '/economy region Bad[name] <u> drop 5');
    run(ctx, '/economy item Bad[item] {x} drop 5');
    expect(systemLines(ctx)).toHaveLength(5);
    expect(systemLines(ctx).join('\n')).toContain('Ashfall bx');
  });
});

describe('handleEconomyAdminCommand: design', () => {
  const ON = () => [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }];
  const econRow = (status: string, jobId = 1n) => ({
    regionId: 7n,
    status,
    jobId,
    otherRegionIds: '[]',
    createdAt: { microsSinceUnixEpoch: 1n },
    updatedAt: { microsSinceUnixEpoch: 1n },
  });
  const econJobs = (ctx: any) => rows(ctx, 'llm_job').filter((j: any) => j.route === 'region_economy');
  const QUEUED = 'Economy design queued for Kesterlane Basin. It runs in the background; see /economy region Kesterlane Basin for the status.';

  it('with the switch off: says how to turn it on and writes no job or row', () => {
    const ctx = ctxFor(admin, designSeed());
    run(ctx, '/economy design Kesterlane Basin');
    expect(systemLines(ctx)).toEqual(['The AI economy is off. Turn it on with /economy ai on first.']);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
  });

  it('with the switch on and no row: enqueues one phase_only job and the pending row', () => {
    const ctx = ctxFor(admin, designSeed({ economy_dials: ON() }));
    run(ctx, '/economy design kesterlane   BASIN');
    expect(systemLines(ctx)).toEqual([QUEUED]);
    const jobs = econJobs(ctx);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ playerId: admin, characterId: 1n, budgetDay: '' });
    expect(JSON.parse(jobs[0].dedupeKey)[2]).toBe('region:7');
    expect(JSON.parse(jobs[0].requestJson)).toMatchObject({ regionId: '7', mode: 'region', enemyTemplateId: '0' });
    expect(rows(ctx, 'region_economy')).toEqual([expect.objectContaining({ regionId: 7n, status: 'pending', jobId: jobs[0].id })]);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });

  it.each([
    ['complete', 'Kesterlane Basin already has an economy (designed).'],
    ['pending', 'Kesterlane Basin already has an economy (pending).'],
  ])('a %s region: says so and writes nothing', (status, line) => {
    const ctx = ctxFor(admin, designSeed({ economy_dials: ON(), region_economy: [econRow(status)] }));
    const before = snapshot(ctx);
    run(ctx, '/economy design Kesterlane Basin');
    expect(systemLines(ctx)).toEqual([line]);
    expect(snapshot(ctx)).toBe(before);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a failed region is re-queued: the row returns to pending with the new jobId', () => {
    const ctx = ctxFor(admin, designSeed({ economy_dials: ON(), region_economy: [econRow('failed', 99n)] }));
    run(ctx, '/economy design Kesterlane Basin');
    expect(systemLines(ctx)).toEqual([QUEUED]);
    const jobs = econJobs(ctx);
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'region_economy')).toEqual([expect.objectContaining({ regionId: 7n, status: 'pending', jobId: jobs[0].id })]);
    expect(jobs[0].id).not.toBe(99n);
  });

  it('an unknown region: No region by that name.', () => {
    const ctx = ctxFor(admin, designSeed({ economy_dials: ON() }));
    run(ctx, '/economy design Nowhere');
    expect(systemLines(ctx)).toEqual(['No region by that name.']);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a region with no locations: No region by that name.', () => {
    const ctx = ctxFor(admin, designSeed({ economy_dials: ON() }));
    run(ctx, '/economy design Ashfall');
    expect(systemLines(ctx)).toEqual(['No region by that name.']);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a halted game: the resting line, nothing written', () => {
    const ctx = ctxFor(admin, designSeed({ economy_dials: ON(), llm_admin_state: [{ ...defaultLlmAdminStateRow(), llmEnabled: false }] }));
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    run(ctx, '/economy design Kesterlane Basin');
    info.mockRestore();
    expect(systemLines(ctx)).toEqual([LLM_RESTING_LINE]);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
  });
});

describe('handleEconomyAdminCommand: repair (review B WR-01 / WR-02)', () => {
  const econRow = (status: string) => ({
    regionId: 7n,
    status,
    jobId: 55n,
    otherRegionIds: '[]',
    createdAt: { microsSinceUnixEpoch: 1n },
    updatedAt: { microsSinceUnixEpoch: 1n },
  });

  it('an unknown region: No region by that name.', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy repair Nowhere');
    expect(systemLines(ctx)).toEqual(['No region by that name.']);
  });

  it.each([
    [[], 'Kesterlane Basin has no designed economy yet.'],
    [[econRow('pending')], 'Kesterlane Basin has no finished economy to repair yet.'],
    [[econRow('complete')], 'Kesterlane Basin has no stored design to repair from.'],
  ])('refuses plainly and writes nothing (%#)', (econ, line) => {
    const ctx = ctxFor(admin, { ...seeded(), region_economy: econ });
    const before = snapshot(ctx);
    run(ctx, '/economy repair kesterlane basin');
    expect(systemLines(ctx)).toEqual([line]);
    expect(snapshot(ctx)).toBe(before);
  });

  it('the report lines name each corrected output and are plain text', () => {
    expect(
      repairReportLines('Kesterlane Basin', {
        ok: true,
        checked: 3,
        changed: [
          { index: 0, oldName: 'Salted Wayfarer Jerky', newName: 'Kesterlane Basin Jerkin', oldSlot: 'chest', newSlot: 'chest' },
          { index: 1, oldName: 'Wickthread Sash', newName: 'Wickthread Sash', oldSlot: 'legs', newSlot: 'chest' },
        ],
      }),
    ).toEqual([
      'Repaired Kesterlane Basin: 2 of 3 crafted outputs corrected.',
      'Recipe 1: Salted Wayfarer Jerky is now Kesterlane Basin Jerkin, slot chest.',
      'Recipe 2: Wickthread Sash, slot legs is now chest.',
    ]);
    expect(repairReportLines('Kesterlane Basin', { ok: true, checked: 3, changed: [] })).toEqual([
      'Kesterlane Basin: every crafted output already follows the rules (3 recipes checked).',
    ]);
  });
});

describe('plain text', () => {
  it('no system line written anywhere in this suite contains [, < or {', () => {
    expect(allLines.length).toBeGreaterThan(20);
    for (const line of allLines) expect(line, line).not.toMatch(/[[<{]/);
    expect(ECONOMY_COMMAND_USAGE).not.toMatch(/[[<{]/);
  });

  it('the usage line is one plain line that lists the forms and the empty-kill note', () => {
    expect(ECONOMY_COMMAND_USAGE).not.toContain('\n');
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy tier');
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy region NAME');
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy item NAME');
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy ai on|off');
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy design NAME');
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy repair NAME');
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy reset');
    expect(ECONOMY_COMMAND_USAGE).toContain('A drop or gold dial at 0 can leave a kill empty on purpose.');
  });
});
