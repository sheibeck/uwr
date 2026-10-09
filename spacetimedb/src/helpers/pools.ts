// pools.ts
// The density pool engine of Phase 51.3.1.1 (D-00, SC4, SC5, D-17; RESEARCH "Pool engine design" and
// Pattern 1). Every later pool plan goes through these helpers:
//   - createPool / mirrorLevel: create a pool and its public level mirror (pool_level);
//   - setPoolCount: the ONLY writer of place_pool.count (a source pin in pools.test.ts enforces it);
//   - settlePool / poolsAt: lazy settling from elapsed time before every read-modify (D-18, D-19, D-37);
//   - applyDepletion / runVacuum / announceFall: kills, hunters and gathers deplete through one path,
//     a wiped family pulls in a rival (D-20, D-36), and only level falls are announced, only at the
//     place (D-22, B11).
//
// The count, home, wipe and settle times stay private in place_pool. pool_level carries only the level,
// the level range and display strings, and is rewritten only when one of them changes (D-05, Pitfall 5).
// Deterministic: "now" is always passed in (ctx.timestamp); no Date, no Math.random.

import { DENSITY_RULES, countToLevel, homeCount, settleCount, pickSurgeTarget, poolSeed } from '../data/density_rules';
import type { DensityLevel } from '../data/density_rules';
import {
  CREATURE_DENSITY_WORDS,
  densityDownLine,
  densityGoneLine,
  overrunSettleLine,
  vacuumLine,
} from '../data/density_lines';
import { placeSpawnLevel } from '../data/enemy_rules';
import { normalizeEnemyRole, resourceIconKey } from '../data/family_rules';
import { FAMILY_FEUD_KIND } from '../data/mechanical_vocabulary';
import { materialKind } from '../data/recipe_rules';
import { appendPrivateEvent } from './events';
import { redactSecrets } from './measurement';
import { computeLocationTargetLevel } from './location';
import { onPoolShift } from './pool_events';
import { flattenSegments, keeperSegments } from './segments';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PoolKindName = 'creature' | 'resource';

/** A place_pool row (schema/tables.ts PlacePool). */
export interface PlacePoolRow {
  id: bigint;
  regionId: bigint;
  locationId: bigint;
  kind: string;
  refId: bigint;
  count: bigint;
  homeLevel: bigint;
  wipedAtMicros: bigint;
  lastSettledMicros: bigint;
  dirty: boolean;
  timeOfDay: string;
}

/** A pool after a write: the fresh row and its density level before and after. */
export interface PoolCountShift {
  pool: PlacePoolRow;
  fromLevel: DensityLevel;
  toLevel: DensityLevel;
}

export interface CreatePoolInput {
  regionId: bigint;
  locationId: bigint;
  kind: PoolKindName;
  /** creature_family id (creature) or item_template id (resource). */
  refId: bigint;
  /** 1 Scarce, 2 Stable, 3 Overrun (a creature home above 2 reads as 2, D-18). */
  homeLevel: number;
  /** 'any' (default), 'day' or 'night' (D-55). */
  timeOfDay?: string;
  /** The starting count; default the home count. */
  count?: bigint;
}

// ---------------------------------------------------------------------------
// Small rules
// ---------------------------------------------------------------------------

function poolKind(pool: { kind: string }): PoolKindName {
  return pool.kind === 'resource' ? 'resource' : 'creature';
}

function clampCount(next: bigint): bigint {
  if (next < 0n) return 0n;
  return next > DENSITY_RULES.COUNT_MAX ? DENSITY_RULES.COUNT_MAX : next;
}

/** The tick still has work: away from home, or empty (a wiped family waits out its long reset). */
function isDirty(kind: PoolKindName, count: bigint, homeLevel: bigint): boolean {
  return count === 0n || count !== homeCount(kind, homeLevel);
}

function byId(a: { id: bigint }, b: { id: bigint }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sameLevelShift(pool: PlacePoolRow): PoolCountShift {
  const level = countToLevel(pool.count);
  return { pool, fromLevel: level, toLevel: level };
}

// ---------------------------------------------------------------------------
// Level range and the public mirror
// ---------------------------------------------------------------------------

/**
 * A family's level range at a place: each member's level at the place (the place target from
 * computeLocationTargetLevel, then placeSpawnLevel with the place's levelOffset), min and max.
 * A family without members (or with none found) reads 0..0.
 */
export function familyRangeAt(ctx: any, familyId: bigint, locationId: bigint): { lo: bigint; hi: bigint } {
  const location = ctx.db.location.id.find(locationId);
  const target: bigint = computeLocationTargetLevel(ctx, locationId, 1n);
  const offset: bigint = location?.levelOffset ?? 0n;
  let lo: bigint | null = null;
  let hi: bigint | null = null;
  for (const member of ctx.db.family_member.by_family.filter(familyId)) {
    const template = ctx.db.enemy_template.id.find(member.enemyTemplateId);
    if (!template) continue;
    const level = placeSpawnLevel(template.level, target, offset);
    if (lo === null || level < lo) lo = level;
    if (hi === null || level > hi) hi = level;
  }
  return lo === null || hi === null ? { lo: 0n, hi: 0n } : { lo, hi };
}

const MIRROR_FIELDS = [
  'regionId',
  'locationId',
  'kind',
  'refId',
  'level',
  'lvLo',
  'lvHi',
  'name',
  'iconKey',
  'temperament',
  'singularNoun',
  'pluralNoun',
  'timeOfDay',
] as const;

/** The pool_level row a pool should have now. */
function mirrorRowFor(ctx: any, pool: PlacePoolRow): Record<string, any> {
  const base = {
    id: pool.id,
    regionId: pool.regionId,
    locationId: pool.locationId,
    kind: poolKind(pool),
    refId: pool.refId,
    level: BigInt(countToLevel(pool.count)),
    timeOfDay: pool.timeOfDay || 'any',
  };
  if (poolKind(pool) === 'creature') {
    const family = ctx.db.creature_family.id.find(pool.refId);
    const range = familyRangeAt(ctx, pool.refId, pool.locationId);
    return {
      ...base,
      lvLo: range.lo,
      lvHi: range.hi,
      name: family?.name ?? '',
      iconKey: family?.iconKey ?? '',
      temperament: family?.temperament ?? '',
      singularNoun: family?.singularNoun ?? '',
      pluralNoun: family?.pluralNoun ?? '',
    };
  }
  const template = ctx.db.item_template.id.find(pool.refId);
  const name: string = template?.name ?? '';
  const economy = ctx.db.economy_item.itemTemplateId.find(pool.refId);
  const kindWord: string = (economy?.kind ?? '').trim() || materialKind(name) || '';
  return {
    ...base,
    lvLo: 0n,
    lvHi: 0n,
    name,
    iconKey: resourceIconKey(kindWord),
    temperament: '',
    singularNoun: '',
    pluralNoun: '',
  };
}

/**
 * Writes the public mirror of a pool (pool_level, id = place_pool.id): inserts it when missing and
 * updates it only when the level, the level range or a display string differs (T-51.3.1.1-17).
 * Callers that change a family's names, members or a place's level offset call this to refresh it.
 */
export function mirrorLevel(ctx: any, pool: PlacePoolRow): Record<string, any> {
  const row = mirrorRowFor(ctx, pool);
  const existing = ctx.db.pool_level.id.find(pool.id);
  if (!existing) return ctx.db.pool_level.insert(row);
  const changed = MIRROR_FIELDS.some((field) => existing[field] !== row[field]);
  if (changed) ctx.db.pool_level.id.update(row);
  return changed ? row : existing;
}

// ---------------------------------------------------------------------------
// Create, write, settle
// ---------------------------------------------------------------------------

/**
 * Find-or-create the pool of (locationId, kind, refId): an existing pool is returned unchanged and
 * nothing is inserted but its public mirror, which is refreshed (written only on a difference, so a
 * family that gained members shows its new level range; review A WR-03). A new pool starts at its
 * home count (or `count`), settled at `now`, with its public mirror.
 */
export function createPool(ctx: any, input: CreatePoolInput, now: bigint): PlacePoolRow {
  for (const row of ctx.db.place_pool.by_location.filter(input.locationId)) {
    if (row.kind === input.kind && row.refId === input.refId) {
      mirrorLevel(ctx, row);
      return row;
    }
  }
  const kind = input.kind;
  const homeLevel = BigInt(Math.max(0, Math.floor(Number(input.homeLevel) || 0)));
  const count = clampCount(input.count ?? homeCount(kind, homeLevel));
  const pool: PlacePoolRow = ctx.db.place_pool.insert({
    id: 0n,
    regionId: input.regionId,
    locationId: input.locationId,
    kind,
    refId: input.refId,
    count,
    homeLevel,
    wipedAtMicros: kind === 'creature' && count === 0n ? now : 0n,
    lastSettledMicros: now,
    dirty: isDirty(kind, count, homeLevel),
    timeOfDay: input.timeOfDay || 'any',
  });
  mirrorLevel(ctx, pool);
  return pool;
}

/**
 * The ONLY writer of place_pool.count (T-51.3.1.1-18). Pass the current row (fields other than the
 * count, such as a raised homeLevel, are written as given). Clamps to 0..COUNT_MAX; a creature pool
 * reaching 0 stamps wipedAtMicros = now once (a later write at 0 keeps the first stamp), any count
 * above 0 clears it; lastSettledMicros becomes `settledMicros` (default now; settlePool passes the
 * settle time so leftover regrowth time carries over); dirty = away from home or empty. The public
 * mirror is rewritten only when the level changes. A pool row that no longer exists is left alone.
 */
export function setPoolCount(
  ctx: any,
  pool: PlacePoolRow,
  next: bigint,
  now: bigint,
  settledMicros: bigint = now,
): PoolCountShift {
  if (!ctx.db.place_pool.id.find(pool.id)) return sameLevelShift(pool);
  const kind = poolKind(pool);
  const count = clampCount(next);
  const fromLevel = countToLevel(pool.count);
  const toLevel = countToLevel(count);
  const wipedAtMicros =
    kind === 'creature' && count === 0n
      ? pool.count === 0n && pool.wipedAtMicros > 0n
        ? pool.wipedAtMicros
        : now
      : 0n;
  const updated: PlacePoolRow = {
    ...pool,
    count,
    wipedAtMicros,
    lastSettledMicros: settledMicros,
    dirty: isDirty(kind, count, pool.homeLevel),
  };
  ctx.db.place_pool.id.update(updated);
  if (fromLevel !== toLevel) mirrorLevel(ctx, updated);
  return { pool: updated, fromLevel, toLevel };
}

/**
 * Settles a pool lazily up to `now` (data/density_rules settleCount): regrowth toward home below it,
 * Overrun settling above it, and the long reset of a wiped family. Reads the stored row first, so a
 * stale row is harmless. Writes through setPoolCount only when the count, the wipe stamp or the dirty
 * flag changes. Returns the fresh row and the level shift.
 */
export function settlePool(ctx: any, pool: PlacePoolRow, now: bigint): PoolCountShift {
  const current: PlacePoolRow | undefined = ctx.db.place_pool.id.find(pool.id);
  if (!current) return sameLevelShift(pool);
  const kind = poolKind(current);
  const next = settleCount(
    {
      kind,
      count: current.count,
      homeLevel: current.homeLevel,
      lastSettledMicros: current.lastSettledMicros,
      wipedAtMicros: current.wipedAtMicros,
    },
    now,
  );
  const unchanged =
    next.count === current.count &&
    next.wipedAtMicros === (kind === 'creature' ? current.wipedAtMicros : 0n) &&
    isDirty(kind, next.count, current.homeLevel) === current.dirty;
  if (unchanged) return sameLevelShift(current);
  const shift = setPoolCount(ctx, current, next.count, now, next.lastSettledMicros);
  // Settling lowers a pool only from above home (Overrun back to Stable); rises are silent (B11).
  announceFall(ctx, shift.pool, shift.fromLevel, shift.toLevel, now, 'settle');
  return shift;
}

/** The pools of a place (optionally one kind), each settled first, in id order. */
export function poolsAt(
  ctx: any,
  locationId: bigint,
  kind?: PoolKindName,
  now: bigint = ctx.timestamp.microsSinceUnixEpoch,
): PlacePoolRow[] {
  const found: PlacePoolRow[] = [...ctx.db.place_pool.by_location.filter(locationId)]
    .filter((row: PlacePoolRow) => !kind || row.kind === kind)
    .sort(byId);
  return found.map((row) => settlePool(ctx, row, now).pool);
}

// ---------------------------------------------------------------------------
// Depletion, density lines and the vacuum (D-16, D-17, D-20, D-22, D-36, D-37)
// ---------------------------------------------------------------------------

export type DepletionCause = 'kill' | 'hunter' | 'gather';
export type FallCause = DepletionCause | 'settle';

/** Online characters standing at a place, in id order. */
function onlineAt(ctx: any, locationId: bigint): any[] {
  return [...ctx.db.character.by_location.filter(locationId)].filter((c: any) => c.online === true).sort(byId);
}

/**
 * Tells the people at a pool's place that a creature family fell a level (T-51.3.1.1-19: only on a
 * fall, only to ONLINE characters standing at pool.locationId, one private line each):
 *   - a fall to 0: `density_gone` (densityGoneLine), and onPoolShift family_wiped;
 *   - an Overrun pool settling back (cause 'settle', from level 3): `density_down` (overrunSettleLine);
 *   - any other fall: `density_down` (densityDownLine with the new level word).
 * Rises and resource falls write nothing (the gather result carries resource news).
 */
export function announceFall(
  ctx: any,
  pool: PlacePoolRow,
  fromLevel: DensityLevel,
  toLevel: DensityLevel,
  now: bigint,
  cause: FallCause,
): void {
  if (toLevel >= fromLevel) return;
  if (poolKind(pool) !== 'creature') return;
  const family = ctx.db.creature_family.id.find(pool.refId);
  const location = ctx.db.location.id.find(pool.locationId);
  if (family && location) {
    let kind = 'density_down';
    let message: string;
    if (toLevel === 0) {
      kind = 'density_gone';
      message = densityGoneLine(family.pluralNoun, location.name);
    } else if (cause === 'settle' && fromLevel === 3) {
      message = overrunSettleLine(family.pluralNoun, location.name);
    } else {
      message = densityDownLine(family.pluralNoun, location.name, CREATURE_DENSITY_WORDS[toLevel]);
    }
    for (const character of onlineAt(ctx, pool.locationId)) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, kind, message);
    }
  }
  if (toLevel === 0) {
    onPoolShift(
      ctx,
      { kind: 'family_wiped', regionId: pool.regionId, locationId: pool.locationId, familyId: pool.refId },
      now,
    );
  }
}

/**
 * The one path for kills, hunters and gathers (D-16, D-17, D-21, D-38): settle the stored pool first,
 * then take `points` through setPoolCount (clamped at 0; draws never reserve population, so two
 * fights on one pool both apply). A level fall is announced; a creature pool that reaches 0 here
 * runs the vacuum once (a pool already at 0 is not wiped again). Returns the shift.
 */
export function applyDepletion(
  ctx: any,
  pool: PlacePoolRow,
  points: bigint,
  now: bigint,
  cause: DepletionCause,
  seed?: bigint,
): PoolCountShift {
  const before = settlePool(ctx, pool, now).pool;
  const shift = setPoolCount(ctx, before, before.count - points, now);
  announceFall(ctx, shift.pool, shift.fromLevel, shift.toLevel, now, cause);
  if (poolKind(shift.pool) === 'creature' && before.count > 0n && shift.pool.count === 0n) {
    runVacuum(ctx, shift.pool, now, seed ?? poolSeed(now, shift.pool.id));
  }
  return shift;
}

/**
 * Settles a fight's kills against their pools (D-16, D-17, Pitfall 3; T-51.3.1.1-30). Called once,
 * first thing in clearCombatArtifacts, the single place a fight's combat_enemy rows are deleted, so
 * victory, defeat, end_combat and the failure close all settle here and a second clear finds no rows.
 * Every enemy of the fight with a pool (poolId > 0n) and currentHp 0n is a kill worth
 * DEPLETION_BY_ROLE of its template's role, and its poolId is set to 0n once counted, so it is never
 * settled twice; living enemies deplete nothing. Points are summed per
 * pool and applied with one applyDepletion each, in pool id order; a missing pool is skipped.
 * Each pool settles on its own (review 2 IN-01): its kills are unlinked right before its write, and a
 * pool that throws is logged and skipped, so the other pools of the fight still deplete.
 */
export function settlePoolKills(ctx: any, combatId: bigint, now: bigint): PoolCountShift[] {
  const pointsByPool = new Map<bigint, bigint>();
  const countedByPool = new Map<bigint, any[]>();
  for (const enemy of ctx.db.combat_enemy.by_combat.filter(combatId)) {
    const poolId: bigint = enemy.poolId ?? 0n;
    if (poolId <= 0n || enemy.currentHp !== 0n) continue;
    const template = ctx.db.enemy_template.id.find(enemy.enemyTemplateId);
    const points = DENSITY_RULES.DEPLETION_BY_ROLE[normalizeEnemyRole(template?.role)] ?? 0n;
    pointsByPool.set(poolId, (pointsByPool.get(poolId) ?? 0n) + points);
    const list = countedByPool.get(poolId);
    if (list) list.push(enemy);
    else countedByPool.set(poolId, [enemy]);
  }
  const shifts: PoolCountShift[] = [];
  const poolIds = [...pointsByPool.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const poolId of poolIds) {
    // One-shot per kill (review B WR-03): this pool's counted rows lose their pool link before the
    // pool is written, so a second clear after a failure part way through the cleanup
    // (closeFightAfterFailure) finds nothing left to deplete, even while the killed rows still exist.
    for (const enemy of countedByPool.get(poolId) ?? []) ctx.db.combat_enemy.id.update({ ...enemy, poolId: 0n });
    try {
      const pool: PlacePoolRow | undefined = ctx.db.place_pool.id.find(poolId);
      const points = pointsByPool.get(poolId) ?? 0n;
      if (!pool || points <= 0n) continue;
      shifts.push(applyDepletion(ctx, pool, points, now, 'kill'));
    } catch (error) {
      console.error(`settlePoolKills: pool ${poolId} in combat ${combatId}: ${redactSecrets(String(error))}`);
    }
  }
  return shifts;
}

function fitsTerrain(fitTerrains: string, terrainType: string): boolean {
  const terrain = (terrainType ?? '').trim().toLowerCase();
  if (!terrain) return false;
  return (fitTerrains ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .includes(terrain);
}

/**
 * The rivals, feud partners and predators of a family in its region, deduplicated, in id order: the
 * families it names as rival, feud (FAMILY_FEUD_KIND) or predator, and the families that name it as
 * prey, rival or feud (rivalry and the feud run both ways; a feud partner counts exactly like a rival,
 * D-20, D-70). Never the family itself; never a family of another region.
 */
function vacuumCandidates(ctx: any, wipedFamilyId: bigint, regionId: bigint): any[] {
  const ids = new Set<bigint>();
  for (const rel of ctx.db.family_relation.by_family.filter(wipedFamilyId)) {
    if (rel.kind === 'rival' || rel.kind === FAMILY_FEUD_KIND || rel.kind === 'predator') ids.add(rel.otherFamilyId);
  }
  for (const family of ctx.db.creature_family.by_region.filter(regionId)) {
    if (family.id === wipedFamilyId) continue;
    for (const rel of ctx.db.family_relation.by_family.filter(family.id)) {
      if (
        rel.otherFamilyId === wipedFamilyId &&
        (rel.kind === 'prey' || rel.kind === 'rival' || rel.kind === FAMILY_FEUD_KIND)
      ) {
        ids.add(family.id);
      }
    }
  }
  ids.delete(wipedFamilyId);
  return [...ids]
    .map((id) => ctx.db.creature_family.id.find(id))
    .filter((family: any) => family && family.regionId === regionId)
    .sort(byId);
}

/**
 * The vacuum after a creature family is wiped out at a place (D-20, D-36): a rival or predator
 * family already pooled at the place and still living (count above 0) surges to Overrun (OVERRUN_SURGE_COUNT, its home raised to at
 * least VACUUM_RIVAL_HOME_LEVEL so it settles back to Stable); else a same-region rival or predator
 * not pooled here whose fitTerrains include the place's terrain gets a new pool there at Overrun with home Stable;
 * else nothing. One deterministic pick (pickSurgeTarget). The online characters at the place get the
 * Keeper takeover line, and onPoolShift records vacuum_takeover then overrun_surge. The wiped family
 * keeps its own pool and home and returns on the long reset (D-37). Returns the surged pool or null.
 */
export function runVacuum(
  ctx: any,
  wipedPool: PlacePoolRow,
  now: bigint,
  seed: bigint = poolSeed(now, wipedPool.id),
): PlacePoolRow | null {
  const location = ctx.db.location.id.find(wipedPool.locationId);
  const wipedFamily = ctx.db.creature_family.id.find(wipedPool.refId);
  if (!location || !wipedFamily) return null;
  const candidates = vacuumCandidates(ctx, wipedFamily.id, wipedPool.regionId);
  if (candidates.length === 0) return null;

  const pooledHere = new Map<bigint, PlacePoolRow>();
  for (const row of ctx.db.place_pool.by_location.filter(wipedPool.locationId)) {
    if (row.kind === 'creature' && row.refId !== wipedFamily.id) pooledHere.set(row.refId, row);
  }
  // Only a LIVING rival here can surge: a family pooled here but wiped out keeps its long reset
  // (D-37), and the terrain fallback never picks a family that already has a pool here.
  const here = candidates.filter((family: any) => {
    const row = pooledHere.get(family.id);
    return !!row && settlePool(ctx, row, now).pool.count > 0n;
  });
  const choices =
    here.length > 0
      ? here
      : candidates.filter(
          (family: any) => !pooledHere.has(family.id) && fitsTerrain(family.fitTerrains, location.terrainType),
        );
  const target = pickSurgeTarget(seed, choices);
  if (!target) return null;

  const homeFloor = BigInt(DENSITY_RULES.VACUUM_RIVAL_HOME_LEVEL);
  let surged: PlacePoolRow;
  const existing = pooledHere.get(target.id);
  if (existing) {
    const rival = settlePool(ctx, existing, now).pool;
    const homeLevel = rival.homeLevel > homeFloor ? rival.homeLevel : homeFloor;
    const count = rival.count > DENSITY_RULES.OVERRUN_SURGE_COUNT ? rival.count : DENSITY_RULES.OVERRUN_SURGE_COUNT;
    surged = setPoolCount(ctx, { ...rival, homeLevel }, count, now).pool;
  } else {
    surged = createPool(
      ctx,
      {
        regionId: wipedPool.regionId,
        locationId: wipedPool.locationId,
        kind: 'creature',
        refId: target.id,
        homeLevel: DENSITY_RULES.VACUUM_RIVAL_HOME_LEVEL,
        timeOfDay: 'any',
        count: DENSITY_RULES.OVERRUN_SURGE_COUNT,
      },
      now,
    );
  }

  const line = vacuumLine(wipedFamily.pluralNoun, target.pluralNoun, location.name);
  const segments = keeperSegments(line);
  const message = segments.length > 0 ? flattenSegments(segments) : line;
  for (const character of onlineAt(ctx, wipedPool.locationId)) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'narrative', message, segments);
  }
  onPoolShift(
    ctx,
    {
      kind: 'vacuum_takeover',
      regionId: wipedPool.regionId,
      locationId: wipedPool.locationId,
      familyId: wipedFamily.id,
      takeoverFamilyId: target.id,
    },
    now,
  );
  onPoolShift(
    ctx,
    { kind: 'overrun_surge', regionId: wipedPool.regionId, locationId: wipedPool.locationId, familyId: target.id },
    now,
  );
  return surged;
}
