// Effect chips for the vitals rail and the mobile strip (47-UI-SPEC "Vitals Rail Contract", CON-03).
//
// my_character_effects carries the whole party's effects, so the chip list is filtered to the
// active character. Time shows only while the character is in combat: roundsRemaining is
// decremented only by the combat loop, so out of combat it is frozen and a countdown would lie
// (research Q2, UI-SPEC checker note). Effect polarity comes from the server's mechanical
// vocabulary (CC_TYPES) through @game-data, never a client copy.
import type { Component } from 'vue';
import {
  PhArrowFatLinesDown,
  PhArrowFatLinesUp,
  PhFlame,
  PhHeart,
  PhMegaphone,
  PhShield,
  PhSnowflake,
  PhSparkle,
  PhSword,
} from '@phosphor-icons/vue';
import { CC_TYPES } from '@game-data/mechanical_vocabulary';

export type EffectPolarity = 'buff' | 'debuff';

export interface EffectView {
  id: bigint;
  name: string;
  polarity: EffectPolarity;
  icon: Component;
  timeText: string | null;
  text: string;
  title: string;
  /** Shorter chip text for a tight spot (the mobile strip); chips fall back to text. */
  compactText?: string;
  /** Screen reader phrase for a host that labels itself ('Ignite on Rotfang, 3 rounds left'). */
  ariaText?: string;
}

/** Chips shown before the overflow chip `+n`. */
export const EFFECT_CHIP_LIMIT = 8;

const NAMED_DEBUFFS: readonly string[] = ['damage_taken', 'dot', 'fear', ...CC_TYPES];

export const REGEN_TYPES: readonly string[] = [
  'regen',
  'mana_regen',
  'stamina_regen',
  'health_regen',
  'mana_regen_bonus',
  'food_health_regen',
  'food_mana_regen',
  'food_stamina_regen',
];

const SHIELD_TYPES: readonly string[] = ['damage_shield', 'magic_resist'];

/** Debuff: `*_down`, damage_taken, dot, fear, every CC type, or any negative magnitude. Else buff. */
export function effectPolarity(effectType: string, magnitude: bigint): EffectPolarity {
  if (magnitude < 0n) return 'debuff';
  if (effectType.endsWith('_down')) return 'debuff';
  if (NAMED_DEBUFFS.indexOf(effectType) !== -1) return 'debuff';
  return 'buff';
}

/** sourceAbility when present, otherwise the effect type in words ('damage_taken' -> 'damage taken'). */
export function effectName(row: { effectType: string; sourceAbility?: string | null }): string {
  const source = row.sourceAbility == null ? '' : row.sourceAbility.trim();
  if (source.length > 0) return source;
  return row.effectType.split('_').join(' ');
}

/** '{n} rounds' / '1 round' while in combat; null out of combat or at 0 (the value does not move). */
export function effectTimeText(roundsRemaining: bigint, inCombat: boolean): string | null {
  if (!inCombat) return null;
  if (roundsRemaining <= 0n) return null;
  return roundsRemaining === 1n ? '1 round' : `${roundsRemaining} rounds`;
}

/** Phosphor icon by type and polarity; PhSparkle for anything unclassified. */
export function effectIcon(effectType: string, polarity: EffectPolarity): Component {
  if (REGEN_TYPES.indexOf(effectType) !== -1) return PhHeart;
  if (SHIELD_TYPES.indexOf(effectType) !== -1) return PhShield;
  if (effectType === 'dot') return PhFlame;
  if (effectType === 'stun' || effectType === 'root' || effectType === 'slow') return PhSnowflake;
  if (effectType === 'silence') return PhMegaphone;
  const upFamily =
    effectType.endsWith('_bonus') || effectType === 'armor_up' || effectType === 'damage_up';
  if (upFamily) {
    if (polarity === 'debuff') return PhArrowFatLinesDown;
    return effectType === 'damage_up' ? PhSword : PhArrowFatLinesUp;
  }
  if (polarity === 'debuff') return PhArrowFatLinesDown;
  return PhSparkle;
}

/** Chip views for one character's effects, ordered by id. characterId null -> []. */
export function effectViews(
  rows: readonly {
    id: bigint;
    characterId: bigint;
    effectType: string;
    magnitude: bigint;
    roundsRemaining: bigint;
    sourceAbility?: string | null;
  }[],
  characterId: bigint | null,
  inCombat: boolean,
): EffectView[] {
  if (characterId === null) return [];
  const mine = rows.filter((row) => row.characterId === characterId);
  mine.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return mine.map((row) => {
    const polarity = effectPolarity(row.effectType, row.magnitude);
    const name = effectName(row);
    const timeText = effectTimeText(row.roundsRemaining, inCombat);
    const text = timeText === null ? name : `${name} · ${timeText}`;
    return {
      id: row.id,
      name,
      polarity,
      icon: effectIcon(row.effectType, polarity),
      timeText,
      text,
      title: text,
    };
  });
}

/** First `limit` items and the count that did not fit. */
export function splitOverflow<T>(
  items: readonly T[],
  limit: number = EFFECT_CHIP_LIMIT,
): { shown: T[]; overflow: number } {
  const shown = items.slice(0, Math.max(0, limit));
  return { shown, overflow: items.length - shown.length };
}
