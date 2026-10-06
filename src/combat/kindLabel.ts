// Ability kind text for the hotbar tooltip and the enemy effect chips (quick 261006-hpp).
//
// The kind vocabulary and its labels live on the server (ABILITY_KIND_LABELS in
// mechanical_vocabulary.ts, reached through @game-data); the client holds no copy. An effect row
// has no kind of its own, so enemyEffectKind() classifies its effectType into one of the
// vocabulary kinds, and the chip type text is then the same label the tooltip shows.
import { ABILITY_KIND_LABELS, CC_TYPES } from '@game-data/mechanical_vocabulary';
import type { AbilityKind } from '@game-data/mechanical_vocabulary';
import { effectPolarity, REGEN_TYPES } from '../rails/effects';

const hasOwn = Object.prototype.hasOwnProperty;

/** 'Damage over time' for 'dot'. A kind outside the vocabulary reads in words ('craft_x' -> 'Craft x'); '' stays ''. */
export function kindLabel(kind: string): string {
  if (hasOwn.call(ABILITY_KIND_LABELS, kind)) return ABILITY_KIND_LABELS[kind as AbilityKind];
  const words = kind.split('_').join(' ').trim();
  return words === '' ? '' : words.charAt(0).toUpperCase() + words.slice(1);
}

/** dot, hot, cc (stun, root, silence, slow, mesmerize), fear, else buff or debuff by polarity. */
export function enemyEffectKind(effectType: string, magnitude: bigint): AbilityKind {
  if (effectType === 'dot') return 'dot';
  if (REGEN_TYPES.indexOf(effectType) !== -1) return 'hot';
  if ((CC_TYPES as readonly string[]).indexOf(effectType) !== -1) return 'cc';
  if (effectType === 'fear') return 'fear';
  return effectPolarity(effectType, magnitude);
}
