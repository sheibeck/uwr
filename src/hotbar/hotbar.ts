// Hotbar derivations for the composer (47-UI-SPEC "Hotbar Contract", CON-05).
//
// Slots reference only abilityTemplateId. item_cooldown is keyed by a snake-cased item name and
// is written only by use_item for consumables; no column links a slot to an item (research S9),
// so no slot can carry an item cooldown. The sweep uses ability_cooldown alone and item_cooldown
// is not used here.
//
// Cooldown math: bigint microsecond values convert with Number() for display math only
// (current epoch micros are far below 2^53). Remaining is clamp(start + duration - now, 0,
// duration), so a row from the future (clock skew) clamps to the full duration and a row past
// its end is ready. Seconds round up so a sweep never reads 0 while still cooling.
import type { Component } from 'vue';
import {
  PhArrowFatLinesDown,
  PhArrowFatLinesUp,
  PhBandaids,
  PhBomb,
  PhCookingPot,
  PhDog,
  PhDrop,
  PhFirstAid,
  PhFlame,
  PhFlask,
  PhFootprints,
  PhGhost,
  PhHammer,
  PhHandHeart,
  PhHeart,
  PhMegaphone,
  PhMusicNotes,
  PhPawPrint,
  PhPlant,
  PhShield,
  PhShovel,
  PhSkull,
  PhSnowflake,
  PhSparkle,
  PhSunDim,
  PhSword,
  PhWrench,
} from '@phosphor-icons/vue';
import { kindLabel } from '../combat/kindLabel';
import { cooldownTotalRounds, roundsText } from '../combat/roundCooldown';

export const HOTBAR_SLOT_COUNT = 10;

export interface SlotView<A> {
  slot: number;
  key: string;
  ability: A | null;
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Hotbars by sortOrder, ties by id. */
export function orderedHotbars<H extends { id: bigint; sortOrder: number }>(hotbars: readonly H[]): H[] {
  return [...hotbars].sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : compareBigint(a.id, b.id)));
}

/** The isActive hotbar, else the first by sortOrder; null when there are none. */
export function activeHotbar<H extends { id: bigint; sortOrder: number; isActive: boolean }>(
  hotbars: readonly H[],
): H | null {
  const ordered = orderedHotbars(hotbars);
  for (const hotbar of ordered) {
    if (hotbar.isActive) return hotbar;
  }
  return ordered.length > 0 ? ordered[0] : null;
}

/** Key label of a slot: 1..9 -> '1'..'9', 10 -> '0'. */
export function slotKey(slot: number): string {
  return slot === HOTBAR_SLOT_COUNT ? '0' : String(slot);
}

/** Slot of a pressed key: '1'..'9' -> 1..9, '0' -> 10, anything else null. */
export function slotForKey(key: string): number | null {
  if (key === '0') return HOTBAR_SLOT_COUNT;
  if (key.length === 1 && key >= '1' && key <= '9') return Number(key);
  return null;
}

/** Exactly ten entries, slots 1..10; empty where nothing is assigned or the ability row is missing. */
export function hotbarSlots<A extends { id: bigint }>(
  hotbar: { id: bigint } | null,
  slots: readonly { hotbarId: bigint; slot: number; abilityTemplateId: bigint }[],
  abilities: readonly A[],
): SlotView<A>[] {
  const abilityById = new Map<bigint, A>();
  for (const ability of abilities) abilityById.set(ability.id, ability);
  const assigned = new Map<number, bigint>();
  if (hotbar !== null) {
    for (const row of slots) {
      if (row.hotbarId !== hotbar.id) continue;
      if (!assigned.has(row.slot)) assigned.set(row.slot, row.abilityTemplateId);
    }
  }
  const out: SlotView<A>[] = [];
  for (let slot = 1; slot <= HOTBAR_SLOT_COUNT; slot += 1) {
    const templateId = assigned.get(slot);
    const ability = templateId === undefined ? null : (abilityById.get(templateId) ?? null);
    out.push({ slot, key: slotKey(slot), ability });
  }
  return out;
}

const ABILITY_ICONS = new Map<string, Component>([
  ['damage', PhSword],
  ['aoe_damage', PhBomb],
  ['dot', PhFlame],
  ['drain', PhDrop],
  ['execute', PhSkull],
  ['heal', PhHeart],
  ['aoe_heal', PhFirstAid],
  ['group_heal', PhFirstAid],
  ['hot', PhPlant],
  ['buff', PhArrowFatLinesUp],
  ['debuff', PhArrowFatLinesDown],
  ['shield', PhShield],
  ['taunt', PhMegaphone],
  ['summon', PhPawPrint],
  ['pet_command', PhDog],
  ['cc', PhSnowflake],
  ['fear', PhGhost],
  ['utility', PhWrench],
  ['song', PhMusicNotes],
  ['aura', PhSunDim],
  ['travel', PhFootprints],
  ['bandage', PhBandaids],
  ['potion', PhFlask],
  ['food_summon', PhCookingPot],
  ['resurrect', PhHandHeart],
  ['craft_boost', PhHammer],
  ['gather_boost', PhShovel],
]);

/** Phosphor icon by ability kind; PhSparkle for unknown kinds. */
export function abilityIcon(kind: string): Component {
  return ABILITY_ICONS.get(kind) ?? PhSparkle;
}

/** Microseconds of cooldown left: clamp(start + duration - now, 0, duration); 0 without a row. */
export function cooldownRemainingMicros(
  row: { startedAtMicros: bigint; durationMicros: bigint } | undefined,
  nowMicros: number,
): number {
  if (!row || !Number.isFinite(nowMicros)) return 0;
  const duration = Number(row.durationMicros);
  const end = Number(row.startedAtMicros) + duration;
  return Math.min(duration, Math.max(0, end - nowMicros));
}

/** Remaining share of the cooldown, clamped 0 to 1; 0 for a zero duration. */
export function cooldownFraction(remainingMicros: number, durationMicros: bigint): number {
  const duration = Number(durationMicros);
  if (!(duration > 0)) return 0;
  const fraction = remainingMicros / duration;
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

function wholeSeconds(remainingMicros: number): number {
  return Math.ceil(remainingMicros / 1_000_000);
}

/** '' when ready, then '1'..'59', '1m'..'59m', '1h' and up (seconds round up). */
export function cooldownLabel(remainingMicros: number): string {
  if (!(remainingMicros > 0)) return '';
  const seconds = wholeSeconds(remainingMicros);
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return String(seconds);
}

/** Tooltip: 'Firebolt · 12 mana · 6s'; abilities that cost nothing omit the cost part. */
export function slotTitle(a: {
  name: string;
  resourceCost: bigint;
  resourceType: string;
  cooldownSeconds: bigint;
}): string {
  const cost = a.resourceType === 'none' ? null : `${a.resourceCost} ${a.resourceType}`;
  return cost === null
    ? `${a.name} · ${a.cooldownSeconds}s`
    : `${a.name} · ${cost} · ${a.cooldownSeconds}s`;
}

export interface SlotTooltip {
  name: string;
  /** Ability type from ability_template.kind, in words ('Damage over time'); empty when the kind is empty. */
  type: string;
  /** Cost, cooldown and cast time, in that order. */
  stats: string[];
  /** ability_template.description, trimmed; empty when the ability has none. */
  description: string;
}

/**
 * Hover, focus and long-press content for a hotbar slot. The type line is the ability kind in the
 * server vocabulary's words ('Damage', 'Heal over time', 'Crowd control'). Cost reads '12 mana' ('No cost' for
 * 'none'); the cooldown reads in rounds in combat (CMB-04) and seconds otherwise; a cast time of 0
 * reads 'Instant'. Plain strings only: the caller renders them as text nodes.
 */
export function slotTooltip(
  a: {
    name: string;
    kind: string;
    description: string;
    resourceType: string;
    resourceCost: bigint;
    cooldownSeconds: bigint;
    castSeconds: bigint;
  },
  inCombat: boolean,
): SlotTooltip {
  const cost = a.resourceType === 'none' ? 'No cost' : `${a.resourceCost} ${a.resourceType}`;
  const cooldown =
    a.cooldownSeconds <= 0n
      ? 'No cooldown'
      : inCombat
        ? `${roundsText(cooldownTotalRounds(a.cooldownSeconds))} cooldown`
        : `${a.cooldownSeconds}s cooldown`;
  const cast = a.castSeconds <= 0n ? 'Instant' : `${a.castSeconds}s cast`;
  return {
    name: a.name,
    type: kindLabel(a.kind ?? ''),
    stats: [cost, cooldown, cast],
    description: (a.description ?? '').trim(),
  };
}

/** The same content as one sentence for aria-describedby: 'Damage, No cost, 6s cooldown, Instant. Hurls fire.' */
export function slotTooltipText(tip: SlotTooltip): string {
  const stats = (tip.type === '' ? tip.stats : [tip.type, ...tip.stats]).join(', ');
  return tip.description === '' ? stats : `${stats}. ${tip.description}`;
}

/** 'Firebolt, key 3', plus ', ready in 5 seconds' while cooling. Slot 10 reads 'key 0'. */
export function slotAriaLabel(name: string, slot: number, remainingMicros: number): string {
  const base = `${name}, key ${slotKey(slot)}`;
  if (!(remainingMicros > 0)) return base;
  const seconds = wholeSeconds(remainingMicros);
  return `${base}, ready in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}

/** True when the cost exceeds the current mana, stamina or HP; 'none' and unknown types never. */
export function isUnaffordable(
  a: { resourceType: string; resourceCost: bigint },
  c: { mana: bigint; stamina: bigint; hp: bigint },
): boolean {
  if (a.resourceType === 'mana') return a.resourceCost > c.mana;
  if (a.resourceType === 'stamina') return a.resourceCost > c.stamina;
  if (a.resourceType === 'hp') return a.resourceCost > c.hp;
  return false;
}

/** Wrap-around step through the hotbars; 0 with fewer than two. */
export function nextHotbarIndex(index: number, count: number, step: 1 | -1): number {
  if (count <= 1) return 0;
  return (((index + step) % count) + count) % count;
}

export function selectorAriaLabel(name: string, index: number, count: number): string {
  return `Hotbar ${name}, ${index + 1} of ${count}. Switch to next hotbar.`;
}
