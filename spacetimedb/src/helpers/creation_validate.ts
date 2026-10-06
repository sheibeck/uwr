/**
 * Server-side clamps for the character-creation replies (race and class).
 *
 * Policy (same as the v2.0 skill validator): clamp and default, never reject. A
 * model reply that is out of range or off-vocabulary is repaired, so a player is
 * never bounced back to the start of creation for a cosmetic slip, and nothing
 * outside the mechanical vocabulary reaches creation state or the abilities that
 * finalizeCharacter later turns into rows.
 *
 * Pure module: no schema, events or server-entry imports. The result contains
 * only strings, booleans and numbers, never bigints, so JSON.stringify is safe.
 */
import {
  STAT_TYPES,
  ABILITY_KINDS,
  RESOURCE_TYPES,
  DAMAGE_TYPES,
  SCALING_TYPES,
  TARGET_RULES,
  EFFECT_TYPES,
  ARMOR_TYPES,
  WEAPON_TYPES,
} from '../data/mechanical_vocabulary';
import { PLAYER_NAME_MAX_CHARS, truncateCodePoints } from '../data/llm_layers';
import { PLACEHOLDER_RACE_NAME } from '../data/race_bonuses';
import { clampToBudget } from './skill_budget';
import { clampInt } from './safe_numbers';

export type CreationStatBonus = { stat: string; value: number };

export type CreationRaceReply = {
  raceName: string;
  narrative: string;
  bonuses: {
    primary: CreationStatBonus;
    secondary: CreationStatBonus;
    flavor?: string;
  };
};

export type CreationAbility = {
  name: string;
  description: string;
  kind: string;
  damageType: string;
  targetRule: string;
  resourceType: string;
  resourceCost: number;
  castSeconds: number;
  cooldownSeconds: number;
  value1: number;
  value2?: number;
  scaling?: string;
  effectType?: string;
  effectMagnitude?: number;
  effectDuration?: number;
};

export type CreationClassReply = {
  className: string;
  classDescription: string;
  stats: {
    primaryStat: string;
    secondaryStat: string;
    bonusHp: number;
    bonusMana: number;
    usesMana: boolean;
    weaponProficiencies: string[];
    armorProficiencies: string[];
  };
  abilities: CreationAbility[];
};

const FLAVOR_MAX_CHARS = 200;
const MAX_ABILITIES = 3;
const VALUE_CAP = 1_000_000;

function asObject(value: unknown): Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function cleanName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const cut = truncateCodePoints(value.trim(), PLAYER_NAME_MAX_CHARS).trim();
  return cut === '' ? fallback : cut;
}

function keepMembers(list: readonly string[], value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string' && list.includes(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Clamp a race reply. Never throws, never rejects. */
export function validateRaceReply(data: unknown): CreationRaceReply {
  const d = asObject(data);
  const bonuses = asObject(d.bonuses);
  const rawPrimary = asObject(bonuses.primary);
  const rawSecondary = asObject(bonuses.secondary);

  const primaryStat = oneOf(STAT_TYPES, rawPrimary.stat, 'str');
  let secondaryStat: string = oneOf(STAT_TYPES, rawSecondary.stat, 'dex');
  if (secondaryStat === primaryStat) {
    secondaryStat = STAT_TYPES.find((s) => s !== primaryStat) ?? 'dex';
  }

  const result: CreationRaceReply = {
    raceName: cleanName(d.raceName, PLACEHOLDER_RACE_NAME),
    narrative: typeof d.narrative === 'string' ? d.narrative : '',
    bonuses: {
      primary: { stat: primaryStat, value: clampInt(rawPrimary.value, 1, 3, 2) },
      secondary: { stat: secondaryStat, value: clampInt(rawSecondary.value, 1, 2, 1) },
    },
  };
  if (typeof bonuses.flavor === 'string') {
    result.bonuses.flavor = truncateCodePoints(bonuses.flavor, FLAVOR_MAX_CHARS);
  }
  return result;
}

function validateAbility(raw: Record<string, any>, archetype: string): CreationAbility {
  const kind = oneOf(ABILITY_KINDS, raw.kind, 'damage');
  const resourceType = oneOf(RESOURCE_TYPES, raw.resourceType, archetype === 'mystic' ? 'mana' : 'stamina');

  let resourceCost: number;
  if (resourceType === 'mana') resourceCost = clampInt(raw.resourceCost, 10, 30, 15);
  else if (resourceType === 'none') resourceCost = 0;
  else resourceCost = clampInt(raw.resourceCost, 5, 15, 10);

  let castSeconds = clampInt(raw.castSeconds, 0, 3, 0);
  if (resourceType === 'mana' && castSeconds < 1) castSeconds = 1;

  const hasMagnitude = raw.effectMagnitude != null;
  const clamped = clampToBudget(kind, 1, {
    value1: clampInt(raw.value1, 0, VALUE_CAP, 15),
    effectMagnitude: hasMagnitude ? clampInt(raw.effectMagnitude, 0, VALUE_CAP, 0) : undefined,
  });

  const ability: CreationAbility = {
    name: cleanName(raw.name, 'Unknown Ability'),
    description: typeof raw.description === 'string' ? raw.description : '',
    kind,
    damageType: oneOf(DAMAGE_TYPES, raw.damageType, 'physical'),
    targetRule: oneOf(TARGET_RULES, raw.targetRule, 'single_enemy'),
    resourceType,
    resourceCost,
    castSeconds,
    cooldownSeconds: clampInt(raw.cooldownSeconds, 4, 12, 6),
    value1: Number(clamped.value1),
  };
  if (raw.value2 != null) ability.value2 = clampInt(raw.value2, 0, VALUE_CAP, 0);
  if (typeof raw.scaling === 'string' && (SCALING_TYPES as readonly string[]).includes(raw.scaling)) {
    ability.scaling = raw.scaling;
  }
  if (typeof raw.effectType === 'string' && (EFFECT_TYPES as readonly string[]).includes(raw.effectType)) {
    ability.effectType = raw.effectType;
  }
  if (clamped.effectMagnitude !== undefined) ability.effectMagnitude = Number(clamped.effectMagnitude);
  if (raw.effectDuration != null) ability.effectDuration = clampInt(raw.effectDuration, 0, 30, 0);
  return ability;
}

/** Clamp a class reply. Never throws, never rejects. */
export function validateClassReply(data: unknown, archetype?: string): CreationClassReply {
  const d = asObject(data);
  const stats = asObject(d.stats);
  const arch = archetype ?? 'warrior';
  const mystic = arch === 'mystic';

  const secondaryDefault = mystic ? 'wis' : 'dex';
  const secondaryStat =
    stats.secondaryStat === 'none' ? 'none' : oneOf(STAT_TYPES, stats.secondaryStat, secondaryDefault);

  const abilities: CreationAbility[] = [];
  if (Array.isArray(d.abilities)) {
    for (const entry of d.abilities) {
      if (abilities.length >= MAX_ABILITIES) break;
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
      abilities.push(validateAbility(entry as Record<string, any>, arch));
    }
  }

  return {
    className: cleanName(d.className, 'Unknown Class'),
    classDescription: typeof d.classDescription === 'string' ? d.classDescription : '',
    stats: {
      primaryStat: oneOf(STAT_TYPES, stats.primaryStat, mystic ? 'int' : 'str'),
      secondaryStat,
      bonusHp: clampInt(stats.bonusHp, 0, 20, 0),
      bonusMana: clampInt(stats.bonusMana, 0, 30, 0),
      usesMana: typeof stats.usesMana === 'boolean' ? stats.usesMana : mystic,
      weaponProficiencies: keepMembers(WEAPON_TYPES, stats.weaponProficiencies),
      armorProficiencies: keepMembers(ARMOR_TYPES, stats.armorProficiencies),
    },
    abilities,
  };
}
