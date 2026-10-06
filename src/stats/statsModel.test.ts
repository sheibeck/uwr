import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RENOWN_RANKS } from '@game-data/renown_data';
import type {
  AbilityTemplate,
  Character,
  Faction,
  FactionStanding,
  ItemAffix,
  ItemInstance,
  ItemTemplate,
  PendingRenownPerk,
} from '../module_bindings/types';
import {
  barScaleMax,
  derivedRows,
  factionRows,
  ownedPerkNames,
  pendingChoice,
  perkOptionTags,
  renownView,
  statBars,
  statsMetaText,
  statsMobileLine,
} from './statsModel';

const asChar = (over: Record<string, unknown>): Character =>
  ({
    id: 7n,
    name: 'Hero',
    race: 'Human',
    className: 'Warrior',
    level: 3n,
    xp: 300n,
    boundLocationId: 5n,
    str: 10n,
    dex: 8n,
    int: 6n,
    wis: 7n,
    cha: 9n,
    ...over,
  }) as unknown as Character;

function tpl(id: bigint, over: Record<string, unknown> = {}): ItemTemplate {
  return {
    id,
    name: `T${id}`,
    slot: 'chest',
    strBonus: 0n,
    dexBonus: 0n,
    intBonus: 0n,
    wisBonus: 0n,
    chaBonus: 0n,
    ...over,
  } as unknown as ItemTemplate;
}

function inst(id: bigint, templateId: bigint, equippedSlot?: string): ItemInstance {
  return { id, templateId, ownerCharacterId: 7n, equippedSlot, quantity: 1n } as unknown as ItemInstance;
}

describe('barScaleMax', () => {
  it('is 20 up to a largest total of 20, then rounds up to a multiple of 10', () => {
    expect(barScaleMax([5n, 20n])).toBe(20);
    expect(barScaleMax([21n])).toBe(30);
    expect(barScaleMax([30n])).toBe(30);
    expect(barScaleMax([31n])).toBe(40);
    expect(barScaleMax([])).toBe(20);
  });
});

describe('statBars', () => {
  it('lists the five stats in order with base, gear and total', () => {
    const templates = new Map([[1n, tpl(1n, { strBonus: 2n, intBonus: 1n })]]);
    const { bars, scaleMax } = statBars(asChar({}), [inst(1n, 1n, 'chest')], templates, []);
    expect(bars.map((b) => b.name)).toEqual(['Strength', 'Dexterity', 'Intelligence', 'Wisdom', 'Charisma']);
    expect(bars.map((b) => b.abbr)).toEqual(['STR', 'DEX', 'INT', 'WIS', 'CHA']);
    expect(bars.map((b) => [b.base, b.gear, b.total])).toEqual([
      [10n, 2n, 12n],
      [8n, 0n, 8n],
      [6n, 1n, 7n],
      [7n, 0n, 7n],
      [9n, 0n, 9n],
    ]);
    expect(scaleMax).toBe(20);
  });

  it('adds affix magnitudes and ignores unequipped items', () => {
    const templates = new Map([[1n, tpl(1n)], [2n, tpl(2n, { strBonus: 9n })]]);
    const affixes = [
      { id: 1n, itemInstanceId: 1n, affixType: 'prefix', affixKey: 'k', affixName: 'Bold', statKey: 'strBonus', magnitude: 3n },
    ] as unknown as ItemAffix[];
    const { bars } = statBars(asChar({}), [inst(1n, 1n, 'chest'), inst(2n, 2n)], templates, affixes);
    expect(bars[0].gear).toBe(3n);
  });

  it('computes widths over the scale and the screen-reader text', () => {
    const templates = new Map([[1n, tpl(1n, { strBonus: 4n })]]);
    const { bars } = statBars(asChar({}), [inst(1n, 1n, 'chest')], templates, []);
    expect(bars[0].baseWidth).toBeCloseTo(10 / 20);
    expect(bars[0].gearWidth).toBeCloseTo(4 / 20);
    expect(bars[0].srText).toBe('Strength 14, base 10, plus 4 from gear');
  });

  it('raises the scale for high totals: 30 for 21 and 40 for 31', () => {
    const none = new Map<bigint, ItemTemplate>();
    expect(statBars(asChar({ str: 21n }), [], none, []).scaleMax).toBe(30);
    expect(statBars(asChar({ str: 31n }), [], none, []).scaleMax).toBe(40);
    expect(statBars(asChar({ str: 31n }), [], none, []).bars[0].baseWidth).toBeCloseTo(31 / 40);
  });
});

describe('renownView', () => {
  it('reads rank 1 Unsung with no row', () => {
    const view = renownView(null);
    expect(view.rank).toBe(1);
    expect(view.name).toBe('Unsung');
    expect(view.points).toBe(0n);
    expect(view.text).toBe('0 / 100 renown');
    expect(view.fraction).toBe(0);
    expect(view.heading).toBe('Renown · Rank 1, Unsung');
  });

  it('reads rank 3 Recognized at 300 points with its progress', () => {
    const view = renownView({ points: 300n });
    expect(view.rank).toBe(3);
    expect(view.name).toBe('Recognized');
    expect(view.fraction).toBeCloseTo((300 - 250) / (500 - 250));
    expect(view.text).toBe('300 / 500 renown');
    expect([view.valueNow, view.valueMin, view.valueMax]).toEqual([300, 250, 500]);
  });

  it('promotes exactly at a threshold', () => {
    expect(renownView({ points: 100n }).rank).toBe(2);
    expect(renownView({ points: 99n }).rank).toBe(1);
  });

  it('reads Highest rank at rank 15 with a full bar', () => {
    const view = renownView({ points: 71234n });
    expect(view.rank).toBe(15);
    expect(view.name).toBe(RENOWN_RANKS[14].name);
    expect(view.text).toBe('71234 renown · Highest rank');
    expect(view.fraction).toBe(1);
    expect(view.highest).toBe(true);
  });
});

describe('ownedPerkNames', () => {
  it('names passive keys through the shared rule and adds Renown abilities only', () => {
    const abilities = [
      { name: 'Second Wind', source: 'Renown' },
      { name: 'Slash', source: 'Class' },
      { name: 'Loose', source: undefined },
    ] as unknown as AbilityTemplate[];
    const names = ownedPerkNames(
      [{ perkKey: 'renown_rank3_iron_will' }, { perkKey: 'shrewd_bargainer' }, { perkKey: 'odd_key' }],
      abilities,
    );
    expect(names).toContain('Second Wind');
    expect(names).not.toContain('Slash');
    expect(names).not.toContain('Loose');
    expect(names).toContain('Odd Key');
    expect(names).toContain('Iron Will');
    expect(new Set(names).size).toBe(names.length);
  });

  it('returns an empty list with nothing owned', () => {
    expect(ownedPerkNames([], [])).toEqual([]);
  });
});

describe('pendingChoice and perkOptionTags', () => {
  const row = (id: bigint, rank: bigint, over: Record<string, unknown> = {}): PendingRenownPerk =>
    ({ id, characterId: 7n, rank, name: `P${id}`, description: '', kind: '', resourceType: '', resourceCost: 0n, cooldownSeconds: 0n, ...over }) as unknown as PendingRenownPerk;

  it('is null with no rows', () => {
    expect(pendingChoice([])).toBeNull();
  });

  it('offers the lowest pending rank and only that rank', () => {
    const choice = pendingChoice([row(3n, 5n), row(2n, 4n), row(1n, 4n), row(4n, 6n)])!;
    expect(choice.rank).toBe(4n);
    expect(choice.options.map((o) => o.id)).toEqual([1n, 2n]);
  });

  it('tags a passive option Passive', () => {
    expect(perkOptionTags(row(1n, 4n))).toEqual(['Passive']);
  });

  it('tags an active option with its kind, cost and cooldown, each only with data', () => {
    expect(perkOptionTags(row(1n, 4n, { kind: 'heal', resourceType: 'stamina', resourceCost: 10n, cooldownSeconds: 30n }))).toEqual([
      'Heal',
      '10 stamina',
      '30s cooldown',
    ]);
    expect(perkOptionTags(row(1n, 4n, { kind: 'damage' }))).toEqual(['Damage']);
    expect(perkOptionTags(row(1n, 4n, { kind: 'damage', cooldownSeconds: 12n }))).toEqual(['Damage', '12s cooldown']);
  });
});

describe('factionRows', () => {
  const factions = [
    { id: 1n, name: 'Wardens' },
    { id: 2n, name: 'Ashen Court' },
    { id: 3n, name: 'Reavers' },
    { id: 4n, name: 'Zephyr' },
  ] as unknown as Faction[];
  const standing = (id: bigint, factionId: bigint, value: bigint, characterId = 7n): FactionStanding =>
    ({ id, characterId, factionId, standing: value }) as unknown as FactionStanding;

  it('joins names, sorts by standing then name and keeps the tier and aria label', () => {
    const rows = factionRows(
      [standing(1n, 1n, 30n), standing(2n, 2n, 30n), standing(3n, 3n, -60n), standing(4n, 4n, 100n)],
      factions,
    );
    expect(rows.map((r) => r.name)).toEqual(['Zephyr', 'Ashen Court', 'Wardens', 'Reavers']);
    expect(rows[0].tier).toBe('Exalted');
    expect(rows[1].tier).toBe('Friendly');
    expect(rows[3].tier).toBe('Hostile');
    expect(rows[3].ariaLabel).toBe('Reavers, Hostile, standing -60');
  });

  it('groups the tier colors', () => {
    const rows = factionRows(
      [standing(1n, 1n, -100n), standing(2n, 2n, -60n), standing(3n, 3n, -25n), standing(4n, 4n, 0n), standing(5n, 1n, 25n), standing(6n, 2n, 100n)],
      factions,
    );
    const byStanding = new Map(rows.map((r) => [r.standing, r.group]));
    expect(byStanding.get(-100n)).toBe('hostile');
    expect(byStanding.get(-60n)).toBe('hostile');
    expect(byStanding.get(-25n)).toBe('unfriendly');
    expect(byStanding.get(0n)).toBe('neutral');
    expect(byStanding.get(25n)).toBe('friendly');
    expect(byStanding.get(100n)).toBe('friendly');
  });

  it('maps standing onto the bar: 0 at -100, 0.5 at 0, 1 at 100, clamped beyond', () => {
    const widths = (value: bigint) => factionRows([standing(1n, 1n, value)], factions)[0].width;
    expect(widths(-100n)).toBe(0);
    expect(widths(0n)).toBe(0.5);
    expect(widths(100n)).toBe(1);
    expect(widths(-500n)).toBe(0);
    expect(widths(500n)).toBe(1);
  });

  it('leaves out a standing without a faction row and, with a character id, other characters', () => {
    expect(factionRows([standing(1n, 99n, 10n)], factions)).toEqual([]);
    expect(factionRows([standing(1n, 1n, 10n, 8n)], factions, 7n)).toEqual([]);
    expect(factionRows([standing(1n, 1n, 10n, 7n)], factions, 7n)).toHaveLength(1);
  });
});

describe('derivedRows', () => {
  const character = asChar({
    hitChance: 750n,
    dodgeChance: 50n,
    parryChance: 25n,
    critMelee: 55n,
    critRanged: 60n,
    critDivine: 65n,
    critArcane: 70n,
    armorClass: 14n,
    perception: 12n,
    search: 11n,
    ccPower: 100n,
    vendorBuyMod: 20n,
    vendorSellMod: 35n,
  });

  it('reads the stored columns in order with one formatter and no Block row', () => {
    const rows = derivedRows(character);
    expect(rows.map((r) => r.label)).toEqual([
      'Hit',
      'Dodge',
      'Parry',
      'Crit (Melee)',
      'Crit (Ranged)',
      'Crit (Divine)',
      'Crit (Arcane)',
      'Armor Class',
      'Perception',
      'Search',
      'CC Power',
      'Vendor Buy / Sell',
    ]);
    expect(rows.map((r) => r.text)).toEqual([
      '75.00%',
      '5.00%',
      '2.50%',
      '5.50%',
      '6.00%',
      '6.50%',
      '7.00%',
      '14',
      '12',
      '11',
      '10.00%',
      '−2.00% / +3.50%',
    ]);
    expect(rows.some((r) => /block/i.test(r.label))).toBe(false);
  });
});

describe('header lines', () => {
  const locations = [{ id: 5n, name: 'Hollowmere' }];

  it('builds the meta line with the XP to the next level and the bind point', () => {
    expect(statsMetaText(asChar({}), locations)).toBe('Hero · Level 3 · 300 / 480 XP · Bound at Hollowmere');
  });

  it('drops the next amount at the level cap', () => {
    expect(statsMetaText(asChar({ level: 10n, xp: 4000n }), locations)).toBe(
      'Hero · Level 10 · 4000 XP · Bound at Hollowmere',
    );
  });

  it('omits Bound at without a known bind location', () => {
    expect(statsMetaText(asChar({ boundLocationId: 0n }), locations)).toBe('Hero · Level 3 · 300 / 480 XP');
    expect(statsMetaText(asChar({}), [])).toBe('Hero · Level 3 · 300 / 480 XP');
  });

  it('builds the mobile identity line', () => {
    expect(statsMobileLine(asChar({}))).toBe('Lv 3 Human Warrior · 300/480 XP');
    expect(statsMobileLine(asChar({ level: 10n, xp: 4000n }))).toBe('Lv 10 Human Warrior · 4000 XP');
  });
});

describe('LDG-F1 stays out of the Stats source', () => {
  it('no non-test file under src/stats contains the deferred card word', () => {
    const dir = resolve(process.cwd(), 'src/stats');
    const offenders = readdirSync(dir)
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => /assessment/i.test(readFileSync(resolve(dir, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
