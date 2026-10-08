// pool_events.ts
// The onPoolShift seam of Phase 51.3.1.1 (D-22, D-23): the ONE place a big density shift leaves the
// pool engine. Four kinds reach it: family_wiped, overrun_surge and vacuum_takeover (from
// helpers/pools.ts) and region_trend (from the pool tick, Plan 14).
//
// Today it writes one `world_event` feed line with the rule-based World event name
// (data/density_lines worldEventName) and records a pool_rumor row, trimmed per region, that NPC
// conversations read back through recentRumors (Plan 26). Phase 52.4 extends THIS function: the
// World event cards, contribution, and the "cull the swarm" event for an overrun_surge (D-23). No
// admin surface ships here (D-51).
//
// Deterministic: "now" is passed in; no Date, no Math.random. Missing rows make it a silent no-op.

import { DENSITY_RULES } from '../data/density_rules';
import { worldEventName, rumorItem } from '../data/density_lines';
import type { DensityShift } from '../data/density_lines';
import { appendWorldEvent } from './events';

export type PoolShift = {
  kind: 'family_wiped' | 'overrun_surge' | 'vacuum_takeover' | 'region_trend';
  regionId: bigint;
  /** The place of the shift; none for a region trend. */
  locationId?: bigint;
  /** The wiped family (family_wiped, vacuum_takeover) or the surging family (overrun_surge). */
  familyId?: bigint;
  /** The family that moves in (vacuum_takeover). */
  takeoverFamilyId?: bigint;
  trend?: 'wilder' | 'quieter';
};

/** A region-trend rumour stores its direction in the kind: 'region_trend:wilder' or 'region_trend:quieter'. */
export const TREND_RUMOR_PREFIX = 'region_trend:';

/** The pool_rumor.kind of a shift (pool_rumor has no trend column). */
export function rumorKind(shift: PoolShift): string {
  return shift.kind === 'region_trend' ? `${TREND_RUMOR_PREFIX}${shift.trend ?? ''}` : shift.kind;
}

/** A stored rumour back as a shift; null for an unknown kind. */
function shiftFromRumor(row: any): PoolShift | null {
  const kind: string = row.kind ?? '';
  if (kind.startsWith(TREND_RUMOR_PREFIX)) {
    const trend = kind.slice(TREND_RUMOR_PREFIX.length);
    if (trend !== 'wilder' && trend !== 'quieter') return null;
    return { kind: 'region_trend', regionId: row.regionId, trend };
  }
  if (kind !== 'family_wiped' && kind !== 'overrun_surge' && kind !== 'vacuum_takeover') return null;
  return {
    kind,
    regionId: row.regionId,
    locationId: row.locationId,
    familyId: row.familyId,
    takeoverFamilyId: row.otherFamilyId,
  };
}

/** The names a shift needs (family nouns, place name, region name); null when any is missing. */
function resolveShift(ctx: any, shift: PoolShift): DensityShift | null {
  if (shift.kind === 'region_trend') {
    if (shift.trend !== 'wilder' && shift.trend !== 'quieter') return null;
    const region = ctx.db.region.id.find(shift.regionId);
    if (!region) return null;
    return { kind: 'region_trend', regionName: region.name, trend: shift.trend };
  }
  if (shift.locationId === undefined || shift.familyId === undefined) return null;
  const location = ctx.db.location.id.find(shift.locationId);
  const family = ctx.db.creature_family.id.find(shift.familyId);
  if (!location || !family) return null;
  if (shift.kind === 'family_wiped') {
    return { kind: 'family_wiped', plural: family.pluralNoun, familyName: family.name, placeName: location.name };
  }
  if (shift.kind === 'overrun_surge') {
    return { kind: 'overrun_surge', plural: family.pluralNoun, placeName: location.name };
  }
  if (shift.takeoverFamilyId === undefined) return null;
  const takeover = ctx.db.creature_family.id.find(shift.takeoverFamilyId);
  if (!takeover) return null;
  return {
    kind: 'vacuum_takeover',
    oldPlural: family.pluralNoun,
    newPlural: takeover.pluralNoun,
    placeName: location.name,
  };
}

function ttlCutoff(now: bigint): bigint {
  return now > DENSITY_RULES.RUMOR_TTL_MICROS ? now - DENSITY_RULES.RUMOR_TTL_MICROS : 0n;
}

/** Oldest first: by time, then id. */
function byAge(a: any, b: any): number {
  if (a.atMicros !== b.atMicros) return a.atMicros < b.atMicros ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Deletes a region's rumours older than RUMOR_TTL_MICROS, then the oldest past RUMOR_KEEP_PER_REGION. */
function trimRumors(ctx: any, regionId: bigint, now: bigint): void {
  const cutoff = ttlCutoff(now);
  const kept: any[] = [];
  for (const row of [...ctx.db.pool_rumor.by_region.filter(regionId)]) {
    if (row.atMicros < cutoff) ctx.db.pool_rumor.id.delete(row.id);
    else kept.push(row);
  }
  kept.sort(byAge);
  const extra = kept.length - DENSITY_RULES.RUMOR_KEEP_PER_REGION;
  for (let i = 0; i < extra; i += 1) ctx.db.pool_rumor.id.delete(kept[i].id);
}

/**
 * The single seam for a big density shift (D-22, D-23): one `world_event` feed line with the
 * rule-based World event name, and one pool_rumor row (the region's rumours are then trimmed to
 * RUMOR_KEEP_PER_REGION and to RUMOR_TTL_MICROS). An unknown family, place or region (or a region
 * trend without a direction) returns without writing.
 */
export function onPoolShift(ctx: any, shift: PoolShift, now: bigint): void {
  const display = resolveShift(ctx, shift);
  if (!display) return;
  appendWorldEvent(ctx, 'world_event', worldEventName(display));
  ctx.db.pool_rumor.insert({
    id: 0n,
    regionId: shift.regionId,
    locationId: shift.kind === 'region_trend' ? 0n : (shift.locationId ?? 0n),
    kind: rumorKind(shift),
    familyId: shift.kind === 'region_trend' ? 0n : (shift.familyId ?? 0n),
    otherFamilyId: shift.kind === 'vacuum_takeover' ? (shift.takeoverFamilyId ?? 0n) : 0n,
    atMicros: now,
  });
  trimRumors(ctx, shift.regionId, now);
}

/**
 * The region's recent rumours as rumorItem clauses, newest first, at most RUMOR_PROMPT_MAX, leaving
 * out any older than RUMOR_TTL_MICROS and any whose names no longer resolve. Read-only: the npc
 * conversation input (Plan 26) and any server text.
 */
export function recentRumors(ctx: any, regionId: bigint, now: bigint): string[] {
  const cutoff = ttlCutoff(now);
  const rumors = [...ctx.db.pool_rumor.by_region.filter(regionId)]
    .filter((row: any) => row.atMicros >= cutoff)
    .sort(byAge)
    .reverse();
  const items: string[] = [];
  for (const row of rumors) {
    if (items.length >= DENSITY_RULES.RUMOR_PROMPT_MAX) break;
    const shift = shiftFromRumor(row);
    const display = shift ? resolveShift(ctx, shift) : null;
    if (display) items.push(rumorItem(display));
  }
  return items;
}
