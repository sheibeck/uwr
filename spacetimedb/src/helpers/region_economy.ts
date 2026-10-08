/**
 * The Phase 51.3 region economy job, server side: this file builds the route input from a region's
 * stored rows and applies a validated reply (items, loot tables, recipes and scrolls). The enqueue
 * lives in Plan 12 and the route registration in Plan 11; nothing here calls the model.
 *
 * Every function takes a duck-typed `tx: any` (a reducer ctx or a withTx tx). This module must not
 * import helpers/llm_apply.ts: llm_apply imports this module (Plan 12), so the reply text is parsed
 * locally. Every number written comes from the design and economy rules, never from the reply (SC2,
 * CUT-01); the validator (region_economy_validate.ts) decides names, kinds and requirement refs.
 */
import {
  REGION_ECONOMY_BIGINT_PATHS,
  REGION_ECONOMY_COUNTS,
  enemyRef,
  foreignOffer,
  foreignRef,
  orderForeignRegions,
  recipeTierSlots,
  slotForeignIndexes,
  type ForeignMaterial,
  type RegionEconomyEnemy,
  type RegionEconomyForeign,
  type RegionEconomyInput,
} from '../data/economy_design_rules';
import { areaLevel } from '../data/recipe_rules';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function compareBig(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function text(value: unknown, otherwise = ''): string {
  return typeof value === 'string' && value !== '' ? value : otherwise;
}

/** A JSON-encoded string array from a region column; anything malformed gives []. */
function stringList(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string' && x !== '') : [];
  } catch {
    return [];
  }
}

const MATERIAL_ROLES: readonly string[] = ['gather', 'drop'];

// ---------------------------------------------------------------------------
// Region reads
// ---------------------------------------------------------------------------

/** The locations of a region (location has no region index; a scan, as buildRegionContext does). */
export function regionLocations(tx: any, regionId: bigint): any[] {
  const out: any[] = [];
  for (const loc of tx.db.location.iter()) if (loc.regionId === regionId) out.push(loc);
  return out.sort((a, b) => compareBig(a.id, b.id));
}

/** The distinct terrains of a region, lowercase, by location count descending then name; ['plains'] when none. */
export function regionTerrains(tx: any, regionId: bigint): string[] {
  const counts = new Map<string, number>();
  for (const loc of regionLocations(tx, regionId)) {
    const terrain = text(loc.terrainType).trim().toLowerCase();
    if (terrain === '') continue;
    counts.set(terrain, (counts.get(terrain) ?? 0) + 1);
  }
  const list = [...counts.keys()].sort((a, b) => (counts.get(b)! - counts.get(a)!) || (a < b ? -1 : a > b ? 1 : 0));
  return list.length > 0 ? list : ['plains'];
}

/** The distinct enemy templates placed at the region's locations, sorted by template id. */
export function regionEnemyTemplates(tx: any, regionId: bigint): any[] {
  const ids = new Set<bigint>();
  for (const loc of regionLocations(tx, regionId)) {
    for (const link of tx.db.location_enemy_template.by_location.filter(loc.id)) ids.add(link.enemyTemplateId);
  }
  const out: any[] = [];
  for (const id of [...ids].sort(compareBig)) {
    const template = tx.db.enemy_template.id.find(id);
    if (template) out.push(template);
  }
  return out;
}

/** The regions bordering a region: the connection walk of buildRegionContext (both directions). */
export function regionNeighborIds(tx: any, regionId: bigint): Set<bigint> {
  const out = new Set<bigint>();
  for (const loc of regionLocations(tx, regionId)) {
    for (const conn of tx.db.location_connection.by_from.filter(loc.id)) {
      const target = tx.db.location.id.find(conn.toLocationId);
      if (target && target.regionId !== regionId) out.add(target.regionId);
    }
    for (const conn of tx.db.location_connection.by_to.filter(loc.id)) {
      const source = tx.db.location.id.find(conn.fromLocationId);
      if (source && source.regionId !== regionId) out.add(source.regionId);
    }
  }
  return out;
}

/** A region's gather and drop materials (economy_item joined to item_template), by template id. */
function regionMaterials(tx: any, regionId: bigint): ForeignMaterial[] {
  const out: ForeignMaterial[] = [];
  for (const row of tx.db.economy_item.by_region.filter(regionId)) {
    if (MATERIAL_ROLES.indexOf(row.role) === -1) continue;
    const template = tx.db.item_template.id.find(row.itemTemplateId);
    if (!template) continue;
    out.push({ templateId: row.itemTemplateId, regionId, rarity: text(row.rarity, 'common'), name: text(template.name), kind: text(row.kind) });
  }
  return out.sort((a, b) => compareBig(a.templateId, b.templateId));
}

interface ForeignCandidate {
  regionId: bigint;
  neighbor: boolean;
  materials: ForeignMaterial[];
}

/**
 * The other regions that may supply a foreign material: a complete region_economy row, a different
 * region, and at least one gather or drop material. Sorted by region id.
 */
export function foreignCandidates(tx: any, regionId: bigint): ForeignCandidate[] {
  const neighbors = regionNeighborIds(tx, regionId);
  const out: ForeignCandidate[] = [];
  for (const row of tx.db.region_economy.iter()) {
    if (row.status !== 'complete' || row.regionId === regionId) continue;
    const materials = regionMaterials(tx, row.regionId);
    if (materials.length === 0) continue;
    out.push({ regionId: row.regionId, neighbor: neighbors.has(row.regionId), materials });
  }
  return out.sort((a, b) => compareBig(a.regionId, b.regionId));
}

function enemyEntry(template: any, index: number): RegionEconomyEnemy {
  return {
    ref: enemyRef(index),
    templateId: template.id,
    name: text(template.name),
    creatureType: text(template.creatureType),
    level: Number(typeof template.level === 'bigint' ? template.level : 1n),
  };
}

// ---------------------------------------------------------------------------
// Input builder
// ---------------------------------------------------------------------------

/**
 * The stored route input of a region, from database rows only. Region mode carries the region's
 * creatures, the recipe tier slots (from the number of other regions with a complete economy) and up
 * to three foreign regions (neighbors first) offering up to four materials each. Enemy mode (an enemy
 * type added after the region was designed) carries that one enemy and the region's existing
 * materials. Strings are stored as they are in the rows; the prompt builder sanitizes them.
 */
export function buildRegionEconomyInput(
  tx: any,
  region: any,
  mode: 'region' | 'enemy',
  enemyTemplate?: any,
): RegionEconomyInput {
  const regionId: bigint = region.id;
  const danger: bigint = typeof region.dangerMultiplier === 'bigint' ? region.dangerMultiplier : 100n;
  const base: RegionEconomyInput = {
    mode,
    regionId,
    regionName: text(region.name),
    biome: text(region.biome, 'unknown'),
    areaLevel: Number(areaLevel(danger, 0n)),
    dominantFaction: text(region.dominantFaction, 'unknown'),
    landmarks: stringList(region.landmarks),
    threats: stringList(region.threats),
    terrains: regionTerrains(tx, regionId),
    enemies: [],
    recipeSlots: [],
    foreignRegions: [],
    foreign: [],
    existingMaterials: [],
  };

  if (mode === 'enemy') {
    if (enemyTemplate) base.enemies = [enemyEntry(enemyTemplate, 0)];
    base.existingMaterials = regionMaterials(tx, regionId).map((m) => ({ name: m.name, kind: m.kind }));
    return base;
  }

  base.enemies = regionEnemyTemplates(tx, regionId).map((t, i) => enemyEntry(t, i));
  const candidates = foreignCandidates(tx, regionId);
  const tiers = recipeTierSlots(BigInt(candidates.length));
  const take = Math.min(REGION_ECONOMY_COUNTS.maxForeignRegions, candidates.length);
  const picked = orderForeignRegions(regionId, candidates).slice(0, take);
  base.foreignRegions = picked.map((id) => ({ regionId: id, name: text(tx.db.region.id.find(id)?.name) }));
  const foreign: RegionEconomyForeign[] = [];
  picked.forEach((id, regionIndex) => {
    const candidate = candidates.find((c) => c.regionId === id);
    for (const m of foreignOffer(candidate ? candidate.materials : [])) {
      foreign.push({ ref: foreignRef(foreign.length), templateId: m.templateId, regionIndex, name: m.name, kind: m.kind });
    }
  });
  base.foreign = foreign;
  const indexes = slotForeignIndexes(tiers);
  base.recipeSlots = tiers.map((tier, i) => ({ tier, foreignRegionIndexes: indexes[i] }));
  return base;
}

// ---------------------------------------------------------------------------
// Stored job context
// ---------------------------------------------------------------------------

export interface EconomyJobContext {
  regionId: bigint;
  mode: 'region' | 'enemy';
  /** 0n in region mode. */
  enemyTemplateId: bigint;
  input: RegionEconomyInput;
}

const DECIMAL_INT = /^-?\d+$/;

function toBig(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && DECIMAL_INT.test(value)) return BigInt(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Converts the decimal string at `segments` under `node` to bigint, in place (`a[].b` walks every element). */
function reviveAt(node: unknown, segments: string[]): void {
  if (segments.length === 0 || !isPlainObject(node)) return;
  const [head, ...rest] = segments;
  const each = head.endsWith('[]');
  const key = each ? head.slice(0, -2) : head;
  if (!Object.prototype.hasOwnProperty.call(node, key)) return;
  const child = node[key];
  if (each) {
    if (!Array.isArray(child) || rest.length === 0) return;
    for (const el of child) reviveAt(el, rest);
    return;
  }
  if (rest.length === 0) {
    if (typeof child === 'string' && DECIMAL_INT.test(child)) node[key] = BigInt(child);
    return;
  }
  reviveAt(child, rest);
}

/**
 * The stored request of a region economy job, `{ regionId, mode, enemyTemplateId, input }`, with the
 * bigint paths of the input (REGION_ECONOMY_BIGINT_PATHS) and the top-level ids revived. Null on any
 * parse failure, an unknown mode, a non-integer region id or a missing input.
 */
export function readEconomyJobContext(contextJson: string | undefined): EconomyJobContext | null {
  if (typeof contextJson !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(contextJson);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  const mode = parsed.mode;
  if (mode !== 'region' && mode !== 'enemy') return null;
  const regionId = toBig(parsed.regionId);
  if (regionId === null) return null;
  const enemyTemplateId = parsed.enemyTemplateId === undefined ? 0n : toBig(parsed.enemyTemplateId);
  if (enemyTemplateId === null) return null;
  const input = parsed.input;
  if (!isPlainObject(input)) return null;
  for (const path of REGION_ECONOMY_BIGINT_PATHS) reviveAt(input, path.split('.'));
  return { regionId, mode, enemyTemplateId, input: input as unknown as RegionEconomyInput };
}
