import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx as createLenientMockCtx } from './test-utils';
import {
  ECONOMY_ADMIN_REFUSAL_LINE,
  ECONOMY_COMMAND_USAGE,
  handleEconomyAdminCommand,
  parseDialValue,
  parseEconomyCommand,
} from './economy_admin_commands';
import { DEFAULT_DIALS } from '../data/economy_rules';

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
    expect(systemLines(ctx)).toEqual(['Drop rate for Ember Moss set to 0%.']);
  });

  it('clamps a pin', () => {
    const ctx = ctxFor(admin, seeded());
    run(ctx, '/economy item Ember Moss drop 900');
    expect(systemLines(ctx)).toEqual(['Drop rate for Ember Moss set to 300% (300% is the most).']);
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
    expect(systemLines(ctx)).toEqual(['Ember Moss drops at its normal rate again.']);
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
    expect(ECONOMY_COMMAND_USAGE).toContain('/economy reset');
    expect(ECONOMY_COMMAND_USAGE).toContain('A drop or gold dial at 0 can leave a kill empty on purpose.');
  });
});
