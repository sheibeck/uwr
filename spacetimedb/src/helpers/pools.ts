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

import { DENSITY_RULES, countToLevel, homeCount, settleCount } from '../data/density_rules';
import type { DensityLevel } from '../data/density_rules';
import { placeSpawnLevel } from '../data/enemy_rules';
import { resourceIconKey } from '../data/family_rules';
import { materialKind } from '../data/recipe_rules';
import { computeLocationTargetLevel } from './location';

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
 * nothing is inserted. A new pool starts at its home count (or `count`), settled at `now`, with its
 * public mirror.
 */
export function createPool(ctx: any, input: CreatePoolInput, now: bigint): PlacePoolRow {
  for (const row of ctx.db.place_pool.by_location.filter(input.locationId)) {
    if (row.kind === input.kind && row.refId === input.refId) return row;
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
  return setPoolCount(ctx, current, next.count, now, next.lastSettledMicros);
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
    .sort((a: PlacePoolRow, b: PlacePoolRow) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found.map((row) => settlePool(ctx, row, now).pool);
}
