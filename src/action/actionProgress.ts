// The action in progress row: label, start time and progress math (quick task 261006-a13).
//
// The row reads the character's resource_gather and character_cast rows plus the Phase 47
// server-clock estimate. Epoch microseconds are bigint rows; Number() is used here for display
// arithmetic only. A gather starts at the first-seen time: the server's gather duration lives in a
// server-only helper and is shortened by a perk, so it is not a trustworthy total. A cast uses
// max(castSeconds, first-seen span): the server raises a mana cast to a floor, and the first-seen
// span carries that floor whenever the row was seen at insert.
import type { AbilityTemplate, CharacterCast, ResourceGather, ResourceNode } from '../module_bindings/types';

const MICROS_PER_SECOND = 1_000_000;

export type GatherRow = Pick<ResourceGather, 'id' | 'characterId' | 'nodeId' | 'endsAtMicros'>;
export type CastRow = Pick<CharacterCast, 'id' | 'characterId' | 'abilityTemplateId' | 'endsAtMicros'>;
export type NodeRow = Pick<ResourceNode, 'id' | 'name'>;
export type AbilityRow = Pick<AbilityTemplate, 'id' | 'name' | 'kind' | 'castSeconds'>;

export interface ActionSources {
  characterId: bigint | null;
  gathers: readonly GatherRow[];
  casts: readonly CastRow[];
  nodes: readonly NodeRow[];
  abilities: readonly AbilityRow[];
}

export type ActionKind = 'gather' | 'cast';

export interface ActionView {
  kind: ActionKind;
  /** 'gather:{id}' or 'cast:{id}': the first-seen key. */
  key: string;
  label: string;
  endsAtMicros: bigint;
  /** Total in microseconds when the row itself knows it (a cast's castSeconds), else 0. */
  knownTotalMicros: number;
  /** The ability kind of a cast, for its icon; null for a gather or an unknown ability. */
  abilityKind: string | null;
}

export interface ActionProgress {
  /** No time left: the server has not deleted the row yet. */
  finishing: boolean;
  /** ceil(remaining / 1 s); 0 only while finishing. Never shows '0s' while time is left. */
  seconds: number;
  /** Elapsed over total, clamped to 0..1. */
  fraction: number;
  percent: number;
  totalSeconds: number;
}

/** The first-seen key of a gather row. */
export const gatherKey = (id: bigint): string => `gather:${id}`;
/** The first-seen key of a cast row. */
export const castKey = (id: bigint): string => `cast:${id}`;

function later<T extends { id: bigint; endsAtMicros: bigint }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (
      best === null ||
      row.endsAtMicros > best.endsAtMicros ||
      (row.endsAtMicros === best.endsAtMicros && row.id > best.id)
    ) {
      best = row;
    }
  }
  return best;
}

/** The action to show: a cast wins over a gather; among equals the later end wins. Null when none. */
export function currentAction(sources: ActionSources): ActionView | null {
  const me = sources.characterId;
  if (me === null) return null;
  const cast = later(sources.casts.filter((row) => row.characterId === me));
  if (cast !== null) {
    const ability = sources.abilities.find((row) => row.id === cast.abilityTemplateId);
    const named = ability !== undefined && ability.name.trim() !== '';
    const known = ability === undefined ? 0 : Number(ability.castSeconds) * MICROS_PER_SECOND;
    return {
      kind: 'cast',
      key: castKey(cast.id),
      label: named ? `Casting ${ability.name}` : 'Casting',
      endsAtMicros: cast.endsAtMicros,
      knownTotalMicros: known > 0 ? known : 0,
      abilityKind: ability === undefined ? null : ability.kind,
    };
  }
  const gather = later(sources.gathers.filter((row) => row.characterId === me));
  if (gather !== null) {
    const node = sources.nodes.find((row) => row.id === gather.nodeId);
    const named = node !== undefined && node.name.trim() !== '';
    return {
      kind: 'gather',
      key: gatherKey(gather.id),
      label: named ? `Gathering ${node.name}` : 'Gathering',
      endsAtMicros: gather.endsAtMicros,
      knownTotalMicros: 0,
      abilityKind: null,
    };
  }
  return null;
}

/** Every first-seen key of the given rows, shown or not: gathers first, then casts. */
export function actionRowKeys(gathers: readonly { id: bigint }[], casts: readonly { id: bigint }[]): string[] {
  const keys: string[] = [];
  for (const row of gathers) keys.push(gatherKey(row.id));
  for (const row of casts) keys.push(castKey(row.id));
  return keys;
}

/**
 * The start of the bar in server microseconds. A gather starts when first seen. A cast with a known
 * total starts at min(first seen, end minus total): a row seen mid-cast measures from its true start
 * (before the first-seen time), a row whose total was raised by the server (the mana floor) measures
 * from the first-seen time.
 */
export function actionStartMicros(view: ActionView, firstSeenMicros: number): number {
  if (view.knownTotalMicros <= 0) return firstSeenMicros;
  return Math.min(firstSeenMicros, Number(view.endsAtMicros) - view.knownTotalMicros);
}

export function actionProgress(endsAtMicros: bigint, startMicros: number, nowMicros: number): ActionProgress {
  const end = Number(endsAtMicros);
  const remaining = end - nowMicros;
  const total = end - startMicros;
  const totalSeconds = Math.max(1, Math.ceil((total > 0 ? total : 0) / MICROS_PER_SECOND));
  if (!(remaining > 0)) {
    return { finishing: true, seconds: 0, fraction: 1, percent: 100, totalSeconds };
  }
  const raw = total > 0 ? 1 - remaining / total : 0;
  const fraction = Math.min(1, Math.max(0, raw));
  return {
    finishing: false,
    seconds: Math.ceil(remaining / MICROS_PER_SECOND),
    fraction,
    percent: Math.round(fraction * 100),
    totalSeconds,
  };
}

/** '5s', or 'Finishing…' (U+2026) while there is no time left. */
export function actionTimeText(state: ActionProgress): string {
  return state.finishing ? 'Finishing…' : `${state.seconds}s`;
}

/** 'Gathering Ironwood · 3s' (U+00B7). */
export function actionSummary(label: string, state: ActionProgress): string {
  return `${label} · ${actionTimeText(state)}`;
}
