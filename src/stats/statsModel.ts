import { RENOWN_RANKS } from '@game-data/renown_data';
import { perkDisplayName } from '@game-data/perk_rules';
import { factionTier } from '@game-data/faction_rules';
import { MAX_LEVEL, xpRequiredForLevel } from '@game-data/xp';
import type { ItemStatTotals } from '@game-data/item_stats';
import type {
  AbilityTemplate,
  Character,
  Faction,
  FactionStanding,
  ItemAffix,
  ItemInstance,
  ItemTemplate,
  Location,
  PendingRenownPerk,
  Renown,
  RenownPerk,
} from '../module_bindings/types';
import { gearStatTotals } from '../ledger/compare';
import { formatPermille, formatVendorMods } from './format';

// The Stats screen model (50-UI-SPEC "Stats Contract"). Every number and label is derived here from
// the subscribed rows and the server's shared rules, so the components only draw. The character's
// str, dex, int, wis and cha columns are BASE values (RESEARCH Q9); the gear part comes from the
// shared per-instance stat sum. Derived rows read the stored character columns. Pure: no Vue.

// ---------------------------------------------------------------------------
// base stat bars
// ---------------------------------------------------------------------------

export type BaseStatCharacter = Pick<Character, 'str' | 'dex' | 'int' | 'wis' | 'cha'>;

export interface StatBar {
  key: 'str' | 'dex' | 'int' | 'wis' | 'cha';
  name: string;
  abbr: string;
  base: bigint;
  gear: bigint;
  total: bigint;
  /** Fractions of the bar (0 to 1): base over scaleMax and gear over scaleMax. */
  baseWidth: number;
  gearWidth: number;
  srText: string;
}

const BAR_DEFS: ReadonlyArray<{
  key: StatBar['key'];
  name: string;
  abbr: string;
  gear: keyof ItemStatTotals;
}> = [
  { key: 'str', name: 'Strength', abbr: 'STR', gear: 'strBonus' },
  { key: 'dex', name: 'Dexterity', abbr: 'DEX', gear: 'dexBonus' },
  { key: 'int', name: 'Intelligence', abbr: 'INT', gear: 'intBonus' },
  { key: 'wis', name: 'Wisdom', abbr: 'WIS', gear: 'wisBonus' },
  { key: 'cha', name: 'Charisma', abbr: 'CHA', gear: 'chaBonus' },
];

/** max(20, the largest total rounded up to a multiple of 10), so a bar never overflows. */
export function barScaleMax(totals: readonly bigint[]): number {
  let largest = 0;
  for (const total of totals) largest = Math.max(largest, Number(total));
  return Math.max(20, Math.ceil(largest / 10) * 10);
}

/** Five bars: base from the character, gear from the equipped items' per-instance sum. */
export function statBars(
  character: BaseStatCharacter,
  items: readonly ItemInstance[],
  templates: ReadonlyMap<bigint, ItemTemplate>,
  affixes: readonly ItemAffix[],
): { scaleMax: number; bars: StatBar[] } {
  const gearTotals = gearStatTotals(items, templates, affixes);
  const rows = BAR_DEFS.map((def) => {
    const base = character[def.key];
    const gear = gearTotals[def.gear];
    return { def, base, gear, total: base + gear };
  });
  const scaleMax = barScaleMax(rows.map((row) => row.total));
  const bars = rows.map(({ def, base, gear, total }) => ({
    key: def.key,
    name: def.name,
    abbr: def.abbr,
    base,
    gear,
    total,
    baseWidth: Number(base) / scaleMax,
    gearWidth: Number(gear) / scaleMax,
    srText: `${def.name} ${total}, base ${base}, plus ${gear} from gear`,
  }));
  return { scaleMax, bars };
}

// ---------------------------------------------------------------------------
// renown
// ---------------------------------------------------------------------------

export interface RenownView {
  rank: number;
  name: string;
  points: bigint;
  /** 'Renown · Rank 3, Recognized' */
  heading: string;
  /** Progress to the next rank, 0 to 1; 1 at the highest rank. */
  fraction: number;
  /** progressbar values, in points. */
  valueNow: number;
  valueMin: number;
  valueMax: number;
  highest: boolean;
  /** '300 / 500 renown', or '{points} renown · Highest rank'. */
  text: string;
}

/** Rank, name and progress from the renown row (none gives rank 1, 0 points). */
export function renownView(row: Pick<Renown, 'points'> | null | undefined): RenownView {
  const points = row ? row.points : 0n;
  let index = 0;
  for (let i = 0; i < RENOWN_RANKS.length; i += 1) {
    if (points >= RENOWN_RANKS[i].threshold) index = i;
  }
  const current = RENOWN_RANKS[index];
  const next = index + 1 < RENOWN_RANKS.length ? RENOWN_RANKS[index + 1] : null;
  const heading = `Renown · Rank ${current.rank}, ${current.name}`;
  if (next === null) {
    return {
      rank: current.rank,
      name: current.name,
      points,
      heading,
      fraction: 1,
      valueNow: Number(current.threshold),
      valueMin: Number(current.threshold),
      valueMax: Number(current.threshold),
      highest: true,
      text: `${points} renown · Highest rank`,
    };
  }
  const span = next.threshold - current.threshold;
  const into = points - current.threshold;
  return {
    rank: current.rank,
    name: current.name,
    points,
    heading,
    fraction: Number(into) / Number(span),
    valueNow: Number(points),
    valueMin: Number(current.threshold),
    valueMax: Number(next.threshold),
    highest: false,
    text: `${points} / ${next.threshold} renown`,
  };
}

// ---------------------------------------------------------------------------
// perks
// ---------------------------------------------------------------------------

/** Passive perk names (through the shared name rule) plus Renown abilities by name, no repeats. */
export function ownedPerkNames(
  perks: ReadonlyArray<Pick<RenownPerk, 'perkKey'>>,
  abilities: ReadonlyArray<Pick<AbilityTemplate, 'name' | 'source'>>,
): string[] {
  const names: string[] = [];
  const add = (name: string): void => {
    if (name !== '' && names.indexOf(name) === -1) names.push(name);
  };
  for (const perk of perks) add(perkDisplayName(perk.perkKey));
  for (const ability of abilities) {
    if (ability.source === 'Renown') add(ability.name);
  }
  return names;
}

export interface PendingChoice {
  rank: bigint;
  options: PendingRenownPerk[];
}

/** The lowest pending rank and that rank's rows only; null with no pending rows. */
export function pendingChoice(rows: readonly PendingRenownPerk[]): PendingChoice | null {
  if (rows.length === 0) return null;
  let rank = rows[0].rank;
  for (const row of rows) {
    if (row.rank < rank) rank = row.rank;
  }
  const options = rows.filter((row) => row.rank === rank).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { rank, options };
}

function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

/** Tags of one perk option: Passive, or the kind, the cost and the cooldown, each only with data. */
export function perkOptionTags(
  option: Pick<PendingRenownPerk, 'kind' | 'resourceType' | 'resourceCost' | 'cooldownSeconds'>,
): string[] {
  if (option.kind === '') return ['Passive'];
  const tags = [capitalize(option.kind)];
  if (option.resourceCost > 0n && option.resourceType !== '') {
    tags.push(`${option.resourceCost} ${option.resourceType}`);
  }
  if (option.cooldownSeconds > 0n) tags.push(`${option.cooldownSeconds}s cooldown`);
  return tags;
}

// ---------------------------------------------------------------------------
// factions
// ---------------------------------------------------------------------------

export type FactionGroup = 'hostile' | 'unfriendly' | 'neutral' | 'friendly';

export interface FactionRow {
  id: bigint;
  name: string;
  standing: bigint;
  tier: string;
  group: FactionGroup;
  /** Bar fill, 0 at -100, 0.5 at 0, 1 at 100, clamped beyond. */
  width: number;
  ariaLabel: string;
}

function groupOf(key: string): FactionGroup {
  if (key === 'hated' || key === 'hostile') return 'hostile';
  if (key === 'unfriendly') return 'unfriendly';
  if (key === 'neutral') return 'neutral';
  return 'friendly';
}

/**
 * One row per standing joined to its faction, sorted by standing high to low then name. A standing
 * whose faction row has not arrived is left out; with a character id, other characters' rows are too.
 */
export function factionRows(
  standings: readonly FactionStanding[],
  factions: readonly Faction[],
  characterId?: bigint | null,
): FactionRow[] {
  const names = new Map<bigint, string>();
  for (const faction of factions) names.set(faction.id, faction.name);
  const rows: FactionRow[] = [];
  for (const row of standings) {
    if (characterId !== undefined && characterId !== null && row.characterId !== characterId) continue;
    const name = names.get(row.factionId);
    if (name === undefined) continue;
    const tier = factionTier(row.standing);
    const clamped = row.standing < -100n ? -100n : row.standing > 100n ? 100n : row.standing;
    rows.push({
      id: row.id,
      name,
      standing: row.standing,
      tier: tier.label,
      group: groupOf(tier.key),
      width: (Number(clamped) + 100) / 200,
      ariaLabel: `${name}, ${tier.label}, standing ${row.standing}`,
    });
  }
  rows.sort((a, b) => {
    if (a.standing !== b.standing) return a.standing > b.standing ? -1 : 1;
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    if (nameA !== nameB) return nameA < nameB ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// derived rows
// ---------------------------------------------------------------------------

export type DerivedCharacter = Pick<
  Character,
  | 'hitChance'
  | 'dodgeChance'
  | 'parryChance'
  | 'critMelee'
  | 'critRanged'
  | 'critDivine'
  | 'critArcane'
  | 'armorClass'
  | 'perception'
  | 'search'
  | 'ccPower'
  | 'vendorBuyMod'
  | 'vendorSellMod'
>;

/** The Derived table rows, from the stored character columns (no Block row: no server field). */
export function derivedRows(character: DerivedCharacter): { label: string; text: string }[] {
  return [
    { label: 'Hit', text: formatPermille(character.hitChance) },
    { label: 'Dodge', text: formatPermille(character.dodgeChance) },
    { label: 'Parry', text: formatPermille(character.parryChance) },
    { label: 'Crit (Melee)', text: formatPermille(character.critMelee) },
    { label: 'Crit (Ranged)', text: formatPermille(character.critRanged) },
    { label: 'Crit (Divine)', text: formatPermille(character.critDivine) },
    { label: 'Crit (Arcane)', text: formatPermille(character.critArcane) },
    { label: 'Armor Class', text: String(character.armorClass) },
    { label: 'Perception', text: String(character.perception) },
    { label: 'Search', text: String(character.search) },
    { label: 'CC Power', text: formatPermille(character.ccPower) },
    { label: 'Vendor Buy / Sell', text: formatVendorMods(character.vendorBuyMod, character.vendorSellMod) },
  ];
}

// ---------------------------------------------------------------------------
// header lines
// ---------------------------------------------------------------------------

type XpCharacter = Pick<Character, 'name' | 'race' | 'className' | 'level' | 'xp' | 'boundLocationId'>;

function xpPart(character: Pick<Character, 'level' | 'xp'>, separator: string): string {
  if (character.level >= MAX_LEVEL) return `${character.xp} XP`;
  return `${character.xp}${separator}${xpRequiredForLevel(character.level + 1n)} XP`;
}

/** '{Name} · Level {n} · {xp} / {next} XP · Bound at {place}'; the cap drops the next amount. */
export function statsMetaText(character: XpCharacter, locations: readonly Pick<Location, 'id' | 'name'>[]): string {
  const parts = [character.name, `Level ${character.level}`, xpPart(character, ' / ')];
  const bound = locations.find((location) => location.id === character.boundLocationId);
  if (bound) parts.push(`Bound at ${bound.name}`);
  return parts.join(' · ');
}

/** 'Lv {n} {race} {class} · {xp}/{next} XP' for the mobile identity row. */
export function statsMobileLine(character: XpCharacter): string {
  return `Lv ${character.level} ${character.race} ${character.className} · ${xpPart(character, '/')}`;
}
