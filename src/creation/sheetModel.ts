// Pure model for the live character sheet (CRE-02): a function of the character_creation_state
// row only. Stat values come from the server's own computeCreationStats (the function finalize
// uses), so the sheet never shows a number the character will not have. No class or race math
// lives here. Every string stays a plain string (text nodes later); nothing here builds HTML.

import { BASE_STAT } from '@game-data/class_stats';
import type { StatKey } from '@game-data/class_stats';
import { computeCreationStats, parseRaceBonuses } from '@game-data/race_bonuses';
import { avatarInitial } from '../session/frameView';
import { chosenAbilityName } from './abilityCards';

/** Structural subset of the CharacterCreationState binding (optional fields arrive as undefined). */
export interface CreationStateLike {
  raceName?: string | null;
  raceNarrative?: string | null;
  raceBonuses?: string | null;
  archetype?: string | null;
  className?: string | null;
  classStats?: string | null;
  abilities?: string | null;
  chosenAbilityIndex?: bigint | null;
  characterName?: string | null;
}

export interface SheetStat {
  key: StatKey;
  label: string;
  value: string;
  raceBonus: number;
  boosted: boolean;
  annotation: string | null;
  ariaLabel: string;
}

export interface SheetModel {
  name: string | null;
  avatarInitial: string | null;
  raceName: string | null;
  archetype: 'Warrior' | 'Mystic' | null;
  className: string | null;
  stats: SheetStat[];
  trait: string | null;
  abilityName: string | null;
}

const UNWRITTEN_STAT = '—';

// Display order (mock 2a): Strength, Dexterity, Intelligence, Wisdom, Charisma.
const STAT_ROWS: ReadonlyArray<{ key: StatKey; label: string }> = [
  { key: 'str', label: 'Strength' },
  { key: 'dex', label: 'Dexterity' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Wisdom' },
  { key: 'cha', label: 'Charisma' },
];

function text(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The parsed classStats object, or null when it is missing or is not a JSON object. */
function parseClassStats(json: string | null): { primaryStat?: unknown; secondaryStat?: unknown } | null {
  if (json === null) return null;
  try {
    const data: unknown = JSON.parse(json);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as { primaryStat?: unknown; secondaryStat?: unknown };
  } catch {
    return null;
  }
}

function emptyStats(): SheetStat[] {
  return STAT_ROWS.map(({ key, label }) => ({
    key,
    label,
    value: UNWRITTEN_STAT,
    raceBonus: 0,
    boosted: false,
    annotation: null,
    ariaLabel: `${label} unwritten`,
  }));
}

function buildStats(raceBonuses: string | null, classStatsJson: string | null): SheetStat[] {
  const classStats = parseClassStats(classStatsJson);
  // Finalize's class-pair rule: primary falls back to 'str', secondary to none.
  const { stats, raceBonus } = classStats
    ? computeCreationStats(
        (classStats.primaryStat || 'str') as string,
        (classStats.secondaryStat || undefined) as string | undefined,
        raceBonuses,
      )
    : computeCreationStats(undefined, undefined, raceBonuses);
  return STAT_ROWS.map(({ key, label }) => {
    const value = stats[key];
    const fromRace = Number(raceBonus[key]);
    return {
      key,
      label,
      value: value.toString(),
      raceBonus: fromRace,
      boosted: value > BASE_STAT,
      annotation: fromRace > 0 ? `+${fromRace} race` : null,
      ariaLabel: fromRace > 0 ? `${label} ${value.toString()}, including ${fromRace} from your race` : `${label} ${value.toString()}`,
    };
  });
}

export function buildSheet(state: CreationStateLike | null): SheetModel {
  const raceName = text(state?.raceName);
  const raceBonuses = text(state?.raceBonuses);
  const characterName = text(state?.characterName);
  const archetype = state?.archetype === 'warrior' ? 'Warrior' : state?.archetype === 'mystic' ? 'Mystic' : null;
  return {
    name: characterName,
    avatarInitial: characterName === null ? null : avatarInitial(characterName),
    raceName,
    archetype,
    className: text(state?.className),
    stats: raceName === null ? emptyStats() : buildStats(raceBonuses, text(state?.classStats)),
    trait: raceName === null ? null : parseRaceBonuses(raceBonuses).flavor,
    abilityName: chosenAbilityName(state?.abilities, state?.chosenAbilityIndex),
  };
}
