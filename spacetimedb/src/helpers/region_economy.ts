/**
 * The Phase 51.3 region economy job, server side: this file builds the route input from a region's
 * stored rows, starts the job (startRegionEconomy, startFamilyLoot: gated on economy_dials.aiEnabled,
 * budget phase_only) and applies a validated reply (items, loot tables, recipes and scrolls). Since
 * Phase 51.3.1.1 Plan 25 the economy is per creature family (D-47): a drop and a trophy per family,
 * gear per member, one late job per family. The route registration lives in llm_routes/llm_layers;
 * nothing here calls the model directly.
 *
 * Every function takes a duck-typed `tx: any` (a reducer ctx or a withTx tx). This module must not
 * import helpers/llm_apply.ts: llm_apply imports this module (Plan 12), so the reply text is parsed
 * locally. Every number written comes from the design and economy rules, never from the reply (SC2,
 * CUT-01); the validator (region_economy_validate.ts) decides names, kinds and requirement refs.
 */
import {
  GATHER_SLOTS,
  REGION_ECONOMY_BIGINT_PATHS,
  REGION_ECONOMY_COUNTS,
  dropRef,
  economyFamilies,
  enemyRef,
  familyRef,
  foreignOffer,
  foreignRef,
  gatherSlotsForSize,
  gearTemplate,
  materialTemplate,
  memberRef,
  nameKey,
  orderForeignRegions,
  recipeCountForSize,
  recipeTierSlotsForSize,
  regionEconomySizeFor,
  regionalOutputTemplate,
  scrollTemplate,
  slotForeignIndexes,
  trophyTemplate,
  type ForeignMaterial,
  type RegionEconomyEnemy,
  type RegionEconomyFamily,
  type RegionEconomyForeign,
  type RegionEconomyInput,
  type RegionEconomyMember,
} from '../data/economy_design_rules';
import { serverRoleToPrompt } from '../data/family_rules';
import { FAMILY_FEUD_KIND, FAMILY_PROMPT_ROLES } from '../data/mechanical_vocabulary';
import { aiLootTable, pickDesignFamilies, SCROLL_TIER_WEIGHTS } from '../data/economy_rules';
import { areaLevel, materialKey, type GeneratedItemTemplate } from '../data/recipe_rules';
import {
  validateFamilyEconomyReply,
  validateLateCreature,
  validateLateFamily,
  validateRegionEconomyReply,
  type ValidatedCreature,
  type ValidatedFamilyEconomy,
  type ValidatedFamilyEntry,
  type ValidatedRecipe,
} from './region_economy_validate';
import { enqueueLlmJob, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput } from './llm_inputs';
import { getDials } from './economy_state';
import { addResourcePoolsForRegion } from './families';

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

/** The charted places of a region: its locations except the uncharted doorway (D-10). */
export function chartedPlaceCount(tx: any, regionId: bigint): number {
  return regionLocations(tx, regionId).filter((loc) => text(loc.terrainType).trim().toLowerCase() !== 'uncharted').length;
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

/** Rank of a prompt role in the listing order tank, damage, support, caster. */
function promptRoleRank(role: string): number {
  const i = (FAMILY_PROMPT_ROLES as readonly string[]).indexOf(role);
  return i === -1 ? FAMILY_PROMPT_ROLES.length : i;
}

/**
 * One family of the job input (D-47): its members whose enemy_template exists, in the order tank,
 * damage, support, caster (member id within a role; fillers included), each with its handle
 * (E1.tank; a second member of one role is E1.damage2) and prompt role word. The level is the base
 * level, the lowest member level (1 with no members).
 */
function familyEntry(tx: any, family: any, ref: string): RegionEconomyFamily {
  const rows = [...tx.db.family_member.by_family.filter(family.id)].sort((a: any, b: any) => compareBig(a.id, b.id));
  const listed: { serverRole: string; role: string; template: any }[] = [];
  for (const m of rows) {
    const template = tx.db.enemy_template.id.find(m.enemyTemplateId);
    if (template) listed.push({ serverRole: text(m.role), role: serverRoleToPrompt(text(m.role)), template });
  }
  // A stable sort keeps member id order within a role.
  listed.sort((a, b) => promptRoleRank(a.role) - promptRoleRank(b.role));
  const seen = new Map<string, number>();
  const members: RegionEconomyMember[] = listed.map((x) => {
    const n = seen.get(x.role) ?? 0;
    seen.set(x.role, n + 1);
    return { ref: memberRef(ref, x.serverRole, n), templateId: x.template.id, role: x.role, name: text(x.template.name) };
  });
  let level: bigint | null = null;
  for (const x of listed) {
    const l: bigint = typeof x.template.level === 'bigint' ? x.template.level : 1n;
    if (level === null || l < level) level = l;
  }
  return {
    ref,
    familyId: family.id,
    name: text(family.name),
    creatureType: text(family.creatureType),
    level: Number(level ?? 1n),
    members,
  };
}

/**
 * The region's creature families (creature_family.by_region, id order) as job input entries E1, E2,
 * ...; a family with no member whose template exists is left out and takes no handle.
 */
export function regionEconomyFamilies(tx: any, regionId: bigint): RegionEconomyFamily[] {
  const families = [...tx.db.creature_family.by_region.filter(regionId)].sort((a: any, b: any) => compareBig(a.id, b.id));
  const out: RegionEconomyFamily[] = [];
  for (const family of families) {
    const entry = familyEntry(tx, family, familyRef(out.length));
    if (entry.members.length > 0) out.push(entry);
  }
  return out;
}

/**
 * The families one region economy job designs (coordinator cap, D-66): at most
 * ECONOMY_DESIGN_FAMILIES_MAX of the region's living families (pickDesignFamilies: feud families first,
 * then families at more places, then id order), listed in id order as E1, E2, ...; the rest are
 * `ruleFamilyIds` (id order), which the region apply writes by rule. Places are the distinct places of
 * the family's creature pools; the feud is a 'feud' family_relation row (D-70).
 */
export function economyDesignFamilies(tx: any, regionId: bigint): { designed: RegionEconomyFamily[]; ruleFamilyIds: bigint[] } {
  const families = [...tx.db.creature_family.by_region.filter(regionId)].sort((a: any, b: any) => compareBig(a.id, b.id));
  const living = families.filter((family: any) => familyEntry(tx, family, familyRef(0)).members.length > 0);
  if (living.length === 0) return { designed: [], ruleFamilyIds: [] };
  const places = new Map<bigint, Set<bigint>>();
  for (const pool of tx.db.place_pool.by_region.filter(regionId)) {
    if (pool.kind !== 'creature') continue;
    const set = places.get(pool.refId) ?? new Set<bigint>();
    set.add(pool.locationId);
    places.set(pool.refId, set);
  }
  const chosen = new Set<bigint>(
    pickDesignFamilies(
      living.map((family: any) => ({
        id: family.id as bigint,
        feud: [...tx.db.family_relation.by_family.filter(family.id)].some((r: any) => r.kind === FAMILY_FEUD_KIND),
        places: places.get(family.id)?.size ?? 0,
      })),
    ),
  );
  const designed: RegionEconomyFamily[] = [];
  const ruleFamilyIds: bigint[] = [];
  for (const family of living) {
    if (chosen.has(family.id)) designed.push(familyEntry(tx, family, familyRef(designed.length)));
    else ruleFamilyIds.push(family.id);
  }
  return { designed, ruleFamilyIds };
}

// ---------------------------------------------------------------------------
// Input builder
// ---------------------------------------------------------------------------

/**
 * The stored route input of a region, from database rows only. Region mode carries the creature
 * families the job designs (D-47; at most ECONOMY_DESIGN_FAMILIES_MAX, economyDesignFamilies) with
 * their members, the gatherable slots and recipe tier slots of the economy size (regionEconomySizeFor;
 * the tiers also depend on the number of other regions with a complete economy) and up to three
 * foreign regions (neighbors first) offering up to four materials each. It lists no 51.3 enemies
 * (Plan 25). Family mode (a family added after the region was designed) carries that one family as E1
 * and the region's existing materials. Enemy mode (the 51.3 late creature) is kept only for tests and
 * stored jobs; nothing starts one now. Strings are stored as they are in the rows; the prompt builder
 * sanitizes them.
 */
export function buildRegionEconomyInput(
  tx: any,
  region: any,
  mode: 'region' | 'family' | 'enemy',
  subject?: any,
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
    families: [],
    gatherSlots: [],
    recipeSlots: [],
    foreignRegions: [],
    foreign: [],
    existingMaterials: [],
  };

  if (mode === 'family' || mode === 'enemy') {
    if (mode === 'family' && subject) base.families = [familyEntry(tx, subject, familyRef(0))];
    if (mode === 'enemy' && subject) base.enemies = [enemyEntry(subject, 0)];
    base.existingMaterials = regionMaterials(tx, regionId).map((m) => ({ name: m.name, kind: m.kind }));
    return base;
  }

  base.families = economyDesignFamilies(tx, regionId).designed;
  // D-10 (Phase 51.3.1.2): the size follows the region's charted places (the doorway not counted).
  // Only a new region job reads it; a complete economy is never re-designed.
  const size = regionEconomySizeFor(chartedPlaceCount(tx, regionId));
  base.gatherSlots = gatherSlotsForSize(size);
  const candidates = foreignCandidates(tx, regionId);
  const tiers = recipeTierSlotsForSize(BigInt(candidates.length), recipeCountForSize(size));
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
  mode: 'region' | 'family' | 'enemy';
  /** 0n unless enemy mode (a 51.3 late creature). */
  enemyTemplateId: bigint;
  /** 0n unless family mode (a late family, Phase 51.3.1.1). */
  familyId: bigint;
  /**
   * Region mode (Plan 25): the region's families past the design cap, which the apply writes by rule.
   * [] when absent (jobs stored before Plan 25); malformed entries are skipped.
   */
  ruleFamilyIds: bigint[];
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
 * The stored request of a region economy job, `{ regionId, mode, enemyTemplateId?, familyId?, input }`,
 * with the bigint paths of the input (REGION_ECONOMY_BIGINT_PATHS) and the top-level ids revived. Null
 * on any parse failure, an unknown mode, a non-integer id or a missing input.
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
  if (mode !== 'region' && mode !== 'family' && mode !== 'enemy') return null;
  const regionId = toBig(parsed.regionId);
  if (regionId === null) return null;
  const enemyTemplateId = parsed.enemyTemplateId === undefined ? 0n : toBig(parsed.enemyTemplateId);
  if (enemyTemplateId === null) return null;
  const familyId = parsed.familyId === undefined ? 0n : toBig(parsed.familyId);
  if (familyId === null) return null;
  const input = parsed.input;
  if (!isPlainObject(input)) return null;
  for (const path of REGION_ECONOMY_BIGINT_PATHS) reviveAt(input, path.split('.'));
  if (input.regionId !== regionId) return null;
  const ruleFamilyIds: bigint[] = [];
  for (const raw of Array.isArray(parsed.ruleFamilyIds) ? parsed.ruleFamilyIds : []) {
    const id = toBig(raw);
    if (id !== null && id > 0n && ruleFamilyIds.indexOf(id) === -1) ruleFamilyIds.push(id);
  }
  return { regionId, mode, enemyTemplateId, familyId, ruleFamilyIds, input: input as unknown as RegionEconomyInput };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** The job the apply receives: helpers/llm_apply.ts ApplyJob, restated here to avoid the import cycle. */
export interface EconomyApplyJob {
  domain?: string;
  playerId?: any;
  /** The stored requestJson: `{ regionId, mode, enemyTemplateId, input }`. */
  contextJson?: string;
  errorCode?: string;
  /** The llm_job id (toApplyJob). When both it and region_economy.jobId are set they must match. */
  jobId?: bigint;
}

/**
 * Review B IN-02: a region-mode result or failure acts only for the job the region_economy row is
 * waiting on. A job id that differs from the stored jobId is an older job's late answer and changes
 * nothing; a missing id on either side (rows and callers from before the check) is accepted.
 */
function isOtherJob(statusRow: any, job: EconomyApplyJob | undefined): boolean {
  const stored = statusRow ? statusRow.jobId : undefined;
  const incoming = job ? job.jobId : undefined;
  return typeof stored === 'bigint' && typeof incoming === 'bigint' && stored !== incoming;
}

/** The reply as JSON: the whole text, else the part from the first { to the last }, else null (unusable). */
function parseReplyText(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Fall through to the braced part.
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** A stored level (number or bigint) as a bigint of at least 1. */
function levelOf(value: unknown): bigint {
  const n = typeof value === 'bigint' ? Number(value) : typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  return BigInt(n < 1 ? 1 : n);
}

/** The level of an input enemy by template id (1n when it is not listed). */
function enemyLevelOf(input: RegionEconomyInput, enemyTemplateId: bigint): bigint {
  const enemy = (Array.isArray(input.enemies) ? input.enemies : []).find((e) => e.templateId === enemyTemplateId);
  return levelOf(enemy ? enemy.level : 1);
}

/**
 * The write state of one apply: the region, the names a new item or recipe may not take (lowercase
 * keys) and the region's economy_item rows by slotKey (the idempotency keys).
 */
interface ApplyBook {
  tx: any;
  regionId: bigint;
  regionName: string;
  areaLevel: bigint;
  names: Set<string>;
  slots: Map<string, any>;
}

/**
 * Opens an apply. Names are snapshotted into a Set before any insert (the strict mock returns live
 * arrays). Rows this apply owns (its own slotKeys and recipe keys, written by an earlier run of the
 * same transaction body) are left out of the name set, so a re-run validates to the same names and
 * reuses those rows instead of renaming around them.
 */
function openBook(
  tx: any,
  input: RegionEconomyInput,
  regionId: bigint,
  ownSlot: (slotKey: string) => boolean,
  ownRecipe: (key: string) => boolean,
): ApplyBook {
  const slots = new Map<string, any>();
  const own = new Set<bigint>();
  for (const row of tx.db.economy_item.by_region.filter(regionId)) {
    slots.set(row.slotKey, row);
    if (ownSlot(row.slotKey)) own.add(row.itemTemplateId);
  }
  const names = new Set<string>();
  const items = [...tx.db.item_template.iter()];
  for (const item of items) if (!own.has(item.id)) names.add(nameKey(text(item.name)));
  const recipes = [...tx.db.recipe_template.iter()];
  for (const recipe of recipes) if (!ownRecipe(text(recipe.key))) names.add(nameKey(text(recipe.name)));
  return { tx, regionId, regionName: text(input.regionName), areaLevel: levelOf(input.areaLevel), names, slots };
}

function isTakenIn(book: ApplyBook): (name: string) => boolean {
  return (name: string) => book.names.has(nameKey(name));
}

/**
 * The item_template of a slot: the existing one when the region already has an economy_item row for
 * slotKey, else a new item_template plus its economy_item origin tag. Rarity is the built template's.
 */
function ensureItem(
  book: ApplyBook,
  slotKey: string,
  role: string,
  fields: GeneratedItemTemplate,
  tag: { kind: string; terrain?: string; timeOfDay?: string; enemyTemplateId?: bigint; familyId?: bigint },
): any {
  const tx = book.tx;
  const found = book.slots.get(slotKey);
  if (found) {
    const existing = tx.db.item_template.id.find(found.itemTemplateId);
    if (existing) return existing;
    // An origin tag whose template is gone: drop it and write the slot again.
    tx.db.economy_item.itemTemplateId.delete(found.itemTemplateId);
  }
  const template = tx.db.item_template.insert({ id: 0n, ...fields });
  const row = {
    itemTemplateId: template.id,
    regionId: book.regionId,
    role,
    slotKey,
    kind: tag.kind,
    rarity: fields.rarity,
    terrain: tag.terrain ?? '',
    timeOfDay: tag.timeOfDay ?? 'any',
    enemyTemplateId: tag.enemyTemplateId ?? 0n,
    familyId: tag.familyId ?? 0n,
  };
  tx.db.economy_item.insert(row);
  book.slots.set(slotKey, row);
  book.names.add(nameKey(text(template.name)));
  return template;
}

/**
 * One creature's drop, trophy and gear (slotKeys drop:<id>, trophy:<id>, gear:<id>) and, when the
 * enemy has no enemy_loot_entry rows yet, its AI loot table from aiLootTable. The one writer for
 * both region mode and late-creature mode. Returns the drop template.
 */
function writeCreature(book: ApplyBook, creature: ValidatedCreature, enemyLevel: bigint, gatherableIds: readonly bigint[]): any {
  const tx = book.tx;
  const enemyId = creature.enemyTemplateId;
  const drop = ensureItem(
    book,
    `drop:${enemyId}`,
    'drop',
    materialTemplate({
      name: creature.drop.name,
      description: creature.drop.description,
      rarity: 'common',
      areaLevel: book.areaLevel,
      kind: creature.drop.kind,
    }),
    { kind: creature.drop.kind, enemyTemplateId: enemyId },
  );
  const trophy = ensureItem(
    book,
    `trophy:${enemyId}`,
    'trophy',
    trophyTemplate({ name: creature.trophy.name, description: creature.trophy.description, level: enemyLevel }),
    { kind: 'trophy', enemyTemplateId: enemyId },
  );
  const gear = ensureItem(
    book,
    `gear:${enemyId}`,
    'gear',
    gearTemplate({
      name: creature.gear.name,
      description: creature.gear.description,
      slot: creature.gear.slot,
      weaponType: creature.gear.weaponType,
      armorType: creature.gear.armorType,
      level: enemyLevel,
      regionName: book.regionName,
    }),
    { kind: creature.gear.slot, enemyTemplateId: enemyId },
  );
  const present = [...tx.db.enemy_loot_entry.by_enemy.filter(enemyId)];
  if (present.length === 0) {
    const entries = aiLootTable(book.regionId, enemyId, { dropId: drop.id, trophyId: trophy.id, gearId: gear.id, gatherableIds });
    for (const entry of entries) {
      tx.db.enemy_loot_entry.insert({
        id: 0n,
        enemyTemplateId: enemyId,
        regionId: book.regionId,
        itemTemplateId: entry.itemTemplateId,
        role: entry.role,
        weight: entry.weight,
      });
    }
  }
  return drop;
}

/** The level of an enemy template (at least 1), or `otherwise` when the template is gone. */
function templateLevel(tx: any, templateId: bigint, otherwise: bigint): bigint {
  const template = tx.db.enemy_template.id.find(templateId);
  return template ? levelOf(template.level) : otherwise;
}

/**
 * The slotKeys of a family's drop and trophy: `drop:family:<id>` and `trophy:family:<id>`. A family
 * of one read from a 51.3 input (familyId 0n) keeps the per-template keys of writeCreature
 * (`drop:<templateId>`), so a 51.3 job answered in the family shape writes the rows it always did.
 */
function familySlotKeys(familyId: bigint, baseTemplateId: bigint): { drop: string; trophy: string } {
  return familyId > 0n
    ? { drop: `drop:family:${familyId}`, trophy: `trophy:family:${familyId}` }
    : { drop: `drop:${baseTemplateId}`, trophy: `trophy:${baseTemplateId}` };
}

/**
 * The members a family write gives loot tables to: the input family's members (handle order), then
 * any member of the creature_family row that joined since the input was built (member id order;
 * fillers included; a member whose template is gone is skipped). A 51.3 family of one (familyId 0n)
 * has only its input member.
 */
function familyMemberIds(tx: any, familyId: bigint, inputMembers: readonly { templateId: bigint }[]): bigint[] {
  const out: bigint[] = [];
  for (const m of inputMembers) if (typeof m.templateId === 'bigint' && out.indexOf(m.templateId) === -1) out.push(m.templateId);
  if (familyId === 0n) return out;
  const rows = [...tx.db.family_member.by_family.filter(familyId)].sort((a: any, b: any) => compareBig(a.id, b.id));
  for (const row of rows) {
    if (out.indexOf(row.enemyTemplateId) !== -1 || !tx.db.enemy_template.id.find(row.enemyTemplateId)) continue;
    out.push(row.enemyTemplateId);
  }
  return out;
}

/** Whether an enemy template has no enemy_loot_entry rows yet. */
function lacksLoot(tx: any, templateId: bigint): boolean {
  return [...tx.db.enemy_loot_entry.by_enemy.filter(templateId)].length === 0;
}

/**
 * Rule gear for members a family reply left without gear (review B WR-01): the members are validated
 * as a stub late-family entry that names only them, so the validator's rule names and repairGear apply
 * exactly as for a family past the design cap (writeRuleFamily). Names already written in this apply
 * are taken. A template that is gone is skipped.
 */
function ruleGearFor(book: ApplyBook, entry: ValidatedFamilyEntry, templateIds: readonly bigint[]): ValidatedFamilyEntry['gear'] {
  if (templateIds.length === 0) return [];
  const members: RegionEconomyMember[] = [];
  for (const templateId of templateIds) {
    const template = book.tx.db.enemy_template.id.find(templateId);
    if (!template) continue;
    const memberRow = [...book.tx.db.family_member.by_template.filter(templateId)][0];
    const role = serverRoleToPrompt(text(memberRow ? memberRow.role : template.role));
    members.push({ ref: `${entry.familyRef}.rule${members.length + 1}`, templateId, role, name: text(template.name) });
  }
  if (members.length === 0) return [];
  const stub: RegionEconomyFamily = { ref: entry.familyRef, familyId: entry.familyId, name: '', creatureType: '', level: 1, members };
  const ruleInput = { regionName: book.regionName, mode: 'family', families: [stub] } as unknown as RegionEconomyInput;
  const ruleReply = { lateFamily: { family: entry.familyRef, gear: members.map((m) => ({ member: m.ref })) } };
  const ruleEntry = validateLateFamily(ruleInput, ruleReply, isTakenIn(book));
  return ruleEntry ? ruleEntry.gear : [];
}

/**
 * One family's economy (D-47): the family drop and trophy (economy_item.familyId set), one gear piece
 * per member the entry covers (economy_item.enemyTemplateId = that member, familyId set; slotKey
 * gear:<templateId>), rule gear for each member in entry.missingGearFor that still lacks loot (review
 * B WR-01), and for every member with no enemy_loot_entry rows its AI loot table from
 * aiLootTable: the family drop and trophy, its own gear (gearId 0n when it has none, so no gear
 * entry) and the region's gatherables. The one writer for region mode, the late family and the rule
 * families. Every write is looked up first (slotKey, existing loot rows), so a re-run writes nothing
 * new. Returns the drop template.
 */
function writeFamily(
  book: ApplyBook,
  entry: ValidatedFamilyEntry,
  memberIds: readonly bigint[],
  familyLevel: bigint,
  gatherableIds: readonly bigint[],
): any {
  const tx = book.tx;
  const familyId = entry.familyId;
  const base = memberIds.length > 0 ? memberIds[0] : entry.gear.length > 0 ? entry.gear[0].templateId : 0n;
  const keys = familySlotKeys(familyId, base);
  // A family's drop and trophy belong to the family, not one member; a 51.3 family of one keeps its template.
  const owner = familyId > 0n ? 0n : base;
  const drop = ensureItem(
    book,
    keys.drop,
    'drop',
    materialTemplate({
      name: entry.drop.name,
      description: entry.drop.description,
      rarity: 'common',
      areaLevel: book.areaLevel,
      kind: entry.drop.kind,
    }),
    { kind: entry.drop.kind, enemyTemplateId: owner, familyId },
  );
  const trophy = ensureItem(
    book,
    keys.trophy,
    'trophy',
    trophyTemplate({ name: entry.trophy.name, description: entry.trophy.description, level: familyLevel }),
    { kind: 'trophy', enemyTemplateId: owner, familyId },
  );
  const gearIds = new Map<bigint, bigint>();
  for (const g of entry.gear) {
    // A member that already has its loot table keeps it; its gear would be an item nothing drops.
    if (!lacksLoot(tx, g.templateId)) continue;
    const item = ensureItem(
      book,
      `gear:${g.templateId}`,
      'gear',
      gearTemplate({
        name: g.name,
        description: g.description,
        slot: g.slot,
        weaponType: g.weaponType,
        armorType: g.armorType,
        level: templateLevel(tx, g.templateId, familyLevel),
        regionName: book.regionName,
      }),
      { kind: g.slot, enemyTemplateId: g.templateId, familyId },
    );
    gearIds.set(g.templateId, item.id);
  }
  // Review B WR-01 (D-47, draft B3): a member the reply gave no gear gets rule gear before its loot
  // table is written, so it never ends up with a gearless table that no later pass would fill.
  const missing = (entry.missingGearFor ?? []).filter(
    (id) => !gearIds.has(id) && memberIds.indexOf(id) !== -1 && lacksLoot(tx, id),
  );
  for (const g of ruleGearFor(book, entry, missing)) {
    const item = ensureItem(
      book,
      `gear:${g.templateId}`,
      'gear',
      gearTemplate({
        name: g.name,
        description: g.description,
        slot: g.slot,
        weaponType: g.weaponType,
        armorType: g.armorType,
        level: templateLevel(tx, g.templateId, familyLevel),
        regionName: book.regionName,
      }),
      { kind: g.slot, enemyTemplateId: g.templateId, familyId },
    );
    gearIds.set(g.templateId, item.id);
  }
  for (const memberId of memberIds) {
    if (!lacksLoot(tx, memberId)) continue;
    const entries = aiLootTable(book.regionId, memberId, {
      dropId: drop.id,
      trophyId: trophy.id,
      gearId: gearIds.get(memberId) ?? 0n,
      gatherableIds,
    });
    for (const e of entries) {
      tx.db.enemy_loot_entry.insert({
        id: 0n,
        enemyTemplateId: memberId,
        regionId: book.regionId,
        itemTemplateId: e.itemTemplateId,
        role: e.role,
        weight: e.weight,
      });
    }
  }
  return drop;
}

/**
 * A family past the design cap (coordinator, D-66): its drop, trophy and one gear piece per member
 * come from the rule fallback (the validator's rule names and gear for an entry that names nothing),
 * then writeFamily writes them and the members' loot tables. A family that is gone, has no living
 * member or whose members all have loot already is left alone.
 */
function writeRuleFamily(book: ApplyBook, input: RegionEconomyInput, familyId: bigint, gatherableIds: readonly bigint[]): void {
  const tx = book.tx;
  const family = tx.db.creature_family.id.find(familyId);
  if (!family) return;
  const listed = familyEntry(tx, family, familyRef(0));
  if (listed.members.length === 0) return;
  const memberIds = familyMemberIds(tx, family.id, listed.members);
  if (!memberIds.some((id) => lacksLoot(tx, id))) return;
  const ruleInput = { ...input, mode: 'family', families: [listed] } as RegionEconomyInput;
  const ruleReply = { lateFamily: { family: listed.ref, gear: listed.members.map((m) => ({ member: m.ref })) } };
  const entry = validateLateFamily(ruleInput, ruleReply, isTakenIn(book));
  if (entry === null) return;
  writeFamily(book, entry, memberIds, levelOf(listed.level), gatherableIds);
}

/**
 * The family reply of region mode, validated, with every recipe slot the reply left out filled by
 * rule: an absent entry is validated as an empty one, which the 51.3 recipe rules turn into a rule
 * recipe over the local materials. Null when the reply itself is unusable.
 */
function validateFamilyPlan(input: RegionEconomyInput, parsed: unknown, isTaken: (name: string) => boolean): ValidatedFamilyEconomy | null {
  const plan = validateFamilyEconomyReply(input, parsed, isTaken);
  if (plan === null || plan.missingRecipes.length === 0 || !isPlainObject(parsed) || !isPlainObject(parsed.region)) return plan;
  const region = parsed.region;
  const recipes: unknown[] = Array.isArray(region.recipes) ? [...region.recipes] : [];
  const slots = Array.isArray(input.recipeSlots) ? input.recipeSlots.length : 0;
  for (let i = 0; i < slots; i++) if (!isPlainObject(recipes[i])) recipes[i] = {};
  return validateFamilyEconomyReply(input, { ...parsed, region: { ...region, recipes } }, isTaken) ?? plan;
}

/** Whether a parsed region reply has the 51.3 shape (region.creatures) and not the family shape. */
function isCreatureReply(parsed: unknown): boolean {
  const region = isPlainObject(parsed) ? parsed.region : undefined;
  return isPlainObject(region) && Array.isArray(region.creatures) && !Array.isArray(region.families);
}

interface ResolvedRequirement {
  id: bigint;
  kind: string;
  name: string;
  count: bigint;
  local: boolean;
  foreignRegionId: bigint | null;
}

/** A recipe's requirement refs as template ids: G/D: from this apply, F from input.foreign. Null when any is unusable. */
function resolveRequirements(
  book: ApplyBook,
  input: RegionEconomyInput,
  requirements: readonly { ref: string; count: bigint }[],
  locals: Map<string, { id: bigint; kind: string; name: string }>,
): ResolvedRequirement[] | null {
  const foreign = Array.isArray(input.foreign) ? input.foreign : [];
  const regions = Array.isArray(input.foreignRegions) ? input.foreignRegions : [];
  const out: ResolvedRequirement[] = [];
  for (const q of requirements) {
    const local = locals.get(q.ref);
    if (local) {
      out.push({ ...local, count: q.count, local: true, foreignRegionId: null });
      continue;
    }
    const f = foreign.find((x) => x.ref === q.ref);
    if (!f || typeof f.templateId !== 'bigint' || !book.tx.db.item_template.id.find(f.templateId)) return null;
    const region = regions[f.regionIndex];
    out.push({
      id: f.templateId,
      kind: text(f.kind),
      name: text(f.name),
      count: q.count,
      local: false,
      foreignRegionId: region && typeof region.regionId === 'bigint' ? region.regionId : null,
    });
  }
  return out;
}

type LocalMap = Map<string, { id: bigint; kind: string; name: string }>;

/**
 * The recipes of a region apply: output, recipe_template keyed region:<regionId>:r<n> with req4, a
 * scroll for rare and above, and region_recipe. `locals` maps the reply's G and D handles to the
 * template ids this apply wrote. Every write is looked up first.
 */
function writeRecipes(
  ctx: any,
  book: ApplyBook,
  input: RegionEconomyInput,
  recipes: readonly ValidatedRecipe[],
  locals: LocalMap,
  recipePrefix: string,
): void {
  const regionId = book.regionId;
  const recipeRows = new Map<string, any>();
  const existingRecipes = [...ctx.db.recipe_template.iter()];
  for (const row of existingRecipes) if (text(row.key).startsWith(recipePrefix)) recipeRows.set(row.key, row);
  for (const recipe of recipes) {
    const reqs = resolveRequirements(book, input, recipe.requirements, locals);
    if (reqs === null || reqs.length < 2 || !reqs[0].local) continue;
    const [primary, second, third, fourth] = reqs;
    const output = ensureItem(
      book,
      `recipe:${recipe.index}`,
      'recipe_output',
      regionalOutputTemplate({
        name: recipe.name,
        description: recipe.description,
        category: recipe.category,
        tier: recipe.tier,
        primaryKind: primary.kind,
        secondaryKind: second.local ? second.kind : '',
        level: book.areaLevel,
        index: recipe.index,
        regionId,
      }),
      { kind: recipe.category },
    );
    const key = `${recipePrefix}${recipe.index}`;
    let row = recipeRows.get(key);
    if (!row) {
      row = ctx.db.recipe_template.insert({
        id: 0n,
        key,
        name: recipe.name,
        outputTemplateId: output.id,
        outputCount: 1n,
        req1TemplateId: primary.id,
        req1Count: primary.count,
        req2TemplateId: second.id,
        req2Count: second.count,
        req3TemplateId: third ? third.id : undefined,
        req3Count: third ? third.count : undefined,
        recipeType: recipe.category,
        materialType: recipe.category === 'consumable' ? undefined : materialKey(primary.name),
        req4TemplateId: fourth ? fourth.id : 0n,
        req4Count: fourth ? fourth.count : 0n,
      });
      recipeRows.set(key, row);
      book.names.add(nameKey(recipe.name));
    }
    const byScroll = Object.prototype.hasOwnProperty.call(SCROLL_TIER_WEIGHTS, recipe.tier);
    const scrollTemplateId = byScroll
      ? ensureItem(book, `scroll:${recipe.index}`, 'scroll', scrollTemplate(text(row.name), recipe.tier), { kind: 'scroll' }).id
      : 0n;
    if (!ctx.db.region_recipe.recipeTemplateId.find(row.id)) {
      const foreignIds: string[] = [];
      for (const r of reqs) {
        if (r.foreignRegionId === null) continue;
        const id = r.foreignRegionId.toString();
        if (foreignIds.indexOf(id) === -1) foreignIds.push(id);
      }
      ctx.db.region_recipe.insert({
        recipeTemplateId: row.id,
        regionId,
        tier: recipe.tier,
        learnBy: byScroll ? 'scroll' : 'research',
        scrollTemplateId,
        foreignRegionIds: JSON.stringify(foreignIds),
      });
    }
  }
}

/** One gatherable of a region apply, under `slotKey`; records its handle and id. */
function writeGatherable(
  book: ApplyBook,
  slotKey: string,
  g: { ref: string; slot: string; name: string; kind: string; terrain: string; description: string },
  locals: LocalMap,
  gatherableIds: bigint[],
): void {
  const template = ensureItem(
    book,
    slotKey,
    'gather',
    materialTemplate({ name: g.name, description: g.description, rarity: g.slot, areaLevel: book.areaLevel, kind: g.kind as any }),
    { kind: g.kind, terrain: text(g.terrain, 'plains').toLowerCase(), timeOfDay: 'any' },
  );
  locals.set(g.ref, { id: template.id, kind: g.kind, name: text(template.name) });
  gatherableIds.push(template.id);
}

/**
 * A 51.3-shape region reply (region.creatures; a job stored before Plan 25): gatherables keyed by slot
 * rarity (gather:common), each creature through writeCreature, then the recipes. False when the reply
 * is unusable (nothing is written).
 */
function applyCreatureRegion(ctx: any, book: ApplyBook, input: RegionEconomyInput, parsed: unknown, recipePrefix: string): boolean {
  const plan = validateRegionEconomyReply(input, parsed, isTakenIn(book));
  if (plan === null) return false;
  const locals: LocalMap = new Map();
  const gatherableIds: bigint[] = [];
  for (const g of plan.gatherables) writeGatherable(book, `gather:${g.slot}`, g, locals, gatherableIds);
  for (const creature of plan.creatures) {
    const drop = writeCreature(book, creature, enemyLevelOf(input, creature.enemyTemplateId), gatherableIds);
    locals.set(`D:${creature.enemyRef}`, { id: drop.id, kind: creature.drop.kind, name: text(drop.name) });
  }
  writeRecipes(ctx, book, input, plan.recipes, locals, recipePrefix);
  return true;
}

/**
 * A family-shape region reply (draft B3, D-47): gatherables keyed by handle (gather:G1; the medium
 * and large sizes repeat rarities), each designed family through writeFamily (D:E<n> is family n's
 * drop), then the families past the design cap by rule (writeRuleFamily), then the recipes (a
 * left-out recipe by rule). A family the reply left out gets no rows: the follow-up gives it a late
 * family job. False when the reply is unusable (nothing is written).
 */
function applyFamilyRegion(ctx: any, book: ApplyBook, c: EconomyJobContext, parsed: unknown, recipePrefix: string): boolean {
  const input = c.input;
  const plan = validateFamilyPlan(input, parsed, isTakenIn(book));
  if (plan === null) return false;
  const locals: LocalMap = new Map();
  const gatherableIds: bigint[] = [];
  for (const g of plan.gatherables) writeGatherable(book, `gather:${g.ref}`, g, locals, gatherableIds);
  const listed = economyFamilies(input);
  for (const entry of plan.families) {
    const family = listed.find((f) => f.ref === entry.familyRef);
    const members = family && Array.isArray(family.members) ? family.members : [];
    const drop = writeFamily(book, entry, familyMemberIds(ctx, entry.familyId, members), levelOf(family ? family.level : 1), gatherableIds);
    locals.set(dropRef(entry.familyRef), { id: drop.id, kind: entry.drop.kind, name: text(drop.name) });
  }
  for (const familyId of c.ruleFamilyIds) writeRuleFamily(book, input, familyId, gatherableIds);
  writeRecipes(ctx, book, input, plan.recipes, locals, recipePrefix);
  return true;
}

/**
 * The applied form of a region economy reply. Region mode, in this order: the status guard (pending
 * only), parse, name snapshot, validation by the reply's shape (a family reply through
 * validateFamilyEconomyReply and writeFamily, a 51.3 creatures reply through writeCreature; an
 * unusable reply sets status failed and writes no item rows), the recipes, and status complete last.
 * Every write is looked up first, so a re-run after success, a rollback or a partial write leaves
 * exactly one set of rows. Silent: no player line is written on any path. Family mode goes to the
 * late family apply, enemy mode (51.3 jobs) to the late-creature apply.
 */
export function applyRegionEconomyResult(ctx: any, job: EconomyApplyJob, resultText: string): void {
  const c = readEconomyJobContext(job ? job.contextJson : undefined);
  if (c === null) return;
  if (c.mode === 'enemy') {
    applyLateCreatureResult(ctx, c, resultText);
    return;
  }
  if (c.mode === 'family') {
    applyLateFamilyResult(ctx, c, resultText);
    return;
  }
  const regionId = c.regionId;
  const statusRow = ctx.db.region_economy.regionId.find(regionId);
  if (!statusRow || statusRow.status !== 'pending') return;
  if (isOtherJob(statusRow, job)) return;
  const input = c.input;
  const recipePrefix = `region:${regionId}:r`;
  const book = openBook(ctx, input, regionId, () => true, (key) => key.startsWith(recipePrefix));
  const parsed = parseReplyText(resultText);
  const wrote = isCreatureReply(parsed)
    ? applyCreatureRegion(ctx, book, input, parsed, recipePrefix)
    : applyFamilyRegion(ctx, book, c, parsed, recipePrefix);
  if (!wrote) {
    ctx.db.region_economy.regionId.update({ ...statusRow, status: 'failed', updatedAt: ctx.timestamp });
    return;
  }

  // Last: the region is complete only once every row above exists.
  const latest = ctx.db.region_economy.regionId.find(regionId) ?? statusRow;
  ctx.db.region_economy.regionId.update({ ...latest, status: 'complete', updatedAt: ctx.timestamp });

  // The region's AI gatherables join the resource pools of every place of matching terrain (D-48).
  // Never fails the apply.
  try {
    addResourcePoolsForRegion(ctx, regionId, ctx.timestamp.microsSinceUnixEpoch);
  } catch (err) {
    console.error(`Resource pools for region ${String(regionId)} failed: ${err instanceof Error ? err.name : typeof err}`);
  }

  // Follow-up (SC1, D-47): families that joined while the job was pending, or that the reply left out,
  // get one family-mode job each. Never fails the apply.
  startLateFamilies(ctx, regionId, job);
}

// ---------------------------------------------------------------------------
// Repair (Phase 51.3 review B WR-01 / WR-02, owner decision: repair in place)
// ---------------------------------------------------------------------------

/** One crafted output the repair changed: the name before and after, and the slot after. */
export interface RepairedOutput {
  index: number;
  oldName: string;
  newName: string;
  oldSlot: string;
  newSlot: string;
}

export type RegionRepairResult =
  | { ok: true; checked: number; changed: RepairedOutput[] }
  | { ok: false; reason: 'no_economy' | 'not_complete' | 'no_design' };

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || ((a === undefined || a === null) && (b === undefined || b === null));
}

/**
 * Re-derives a complete region's crafted outputs (its `recipe:<n>` items, their recipe_template rows and
 * their scrolls) from the region's stored design (the region_economy row's job: request and reply) with
 * the current rules, and corrects them in place. The ids never change, so recipes, loot, scrolls and
 * items already in bags keep pointing at the same templates. Idempotent: a second run changes nothing.
 * Written for job 8206 (local uwr, Kesterlane Basin), whose outputs predate the WR-01 category repair
 * and the WR-02 slot-from-name rule. Silent: the caller reports the result.
 */
export function repairRegionEconomyOutputs(ctx: any, regionId: bigint): RegionRepairResult {
  const statusRow = ctx.db.region_economy.regionId.find(regionId);
  if (!statusRow) return { ok: false, reason: 'no_economy' };
  if (statusRow.status !== 'complete') return { ok: false, reason: 'not_complete' };
  const job = typeof statusRow.jobId === 'bigint' ? ctx.db.llm_job.id.find(statusRow.jobId) : undefined;
  const c = readEconomyJobContext(job ? job.requestJson : undefined);
  if (!job || typeof job.resultText !== 'string' || c === null || c.mode !== 'region' || c.regionId !== regionId) {
    return { ok: false, reason: 'no_design' };
  }
  const input = c.input;
  const recipePrefix = `region:${regionId}:r`;
  // The same name book as the apply: the region's own rows are left out, so unchanged names validate
  // to themselves.
  const book = openBook(ctx, input, regionId, () => true, (key) => key.startsWith(recipePrefix));
  const parsed = parseReplyText(job.resultText);

  // The local handles as the apply resolved them, from the rows it wrote.
  const locals = new Map<string, { id: bigint; kind: string; name: string }>();
  const localOf = (ref: string, slotKey: string, kind: string): void => {
    const tag = book.slots.get(slotKey);
    const template = tag ? ctx.db.item_template.id.find(tag.itemTemplateId) : undefined;
    if (template) locals.set(ref, { id: template.id, kind: text(tag.kind, kind), name: text(template.name) });
  };
  let recipes: readonly ValidatedRecipe[];
  if (isCreatureReply(parsed)) {
    const plan = validateRegionEconomyReply(input, parsed, isTakenIn(book));
    if (plan === null) return { ok: false, reason: 'no_design' };
    for (const g of plan.gatherables) localOf(g.ref, `gather:${g.slot}`, g.kind);
    for (const creature of plan.creatures) localOf(`D:${creature.enemyRef}`, `drop:${creature.enemyTemplateId}`, creature.drop.kind);
    recipes = plan.recipes;
  } else {
    // A family design (Plan 25): gatherables by handle, each family's drop by its family slotKey.
    const plan = validateFamilyPlan(input, parsed, isTakenIn(book));
    if (plan === null) return { ok: false, reason: 'no_design' };
    for (const g of plan.gatherables) localOf(g.ref, `gather:${g.ref}`, g.kind);
    const listed = economyFamilies(input);
    for (const entry of plan.families) {
      const base = listed.find((f) => f.ref === entry.familyRef)?.members?.[0]?.templateId ?? 0n;
      localOf(dropRef(entry.familyRef), familySlotKeys(entry.familyId, base).drop, entry.drop.kind);
    }
    recipes = plan.recipes;
  }

  const changed: RepairedOutput[] = [];
  let checked = 0;
  for (const recipe of recipes) {
    const tag = book.slots.get(`recipe:${recipe.index}`);
    const output = tag ? ctx.db.item_template.id.find(tag.itemTemplateId) : undefined;
    const key = `${recipePrefix}${recipe.index}`;
    const recipeRow = [...ctx.db.recipe_template.iter()].find((r: any) => text(r.key) === key);
    if (!tag || !output || !recipeRow) continue;
    const reqs = resolveRequirements(book, input, recipe.requirements, locals);
    if (reqs === null || reqs.length < 2 || !reqs[0].local) continue;
    checked += 1;
    const [primary, second, third, fourth] = reqs;
    const fields = regionalOutputTemplate({
      name: recipe.name,
      description: recipe.description,
      category: recipe.category,
      tier: recipe.tier,
      primaryKind: primary.kind,
      secondaryKind: second.local ? second.kind : '',
      level: book.areaLevel,
      index: recipe.index,
      regionId,
    });
    const before = { name: text(output.name), slot: text(output.slot) };
    let touched = false;

    if (Object.keys(fields).some((k) => !sameValue((output as any)[k], (fields as any)[k]))) {
      ctx.db.item_template.id.update({ ...output, ...fields, id: output.id });
      touched = true;
    }
    if (tag.kind !== recipe.category || tag.rarity !== fields.rarity) {
      ctx.db.economy_item.itemTemplateId.update({ ...tag, kind: recipe.category, rarity: fields.rarity });
      touched = true;
    }
    const nextRecipe = {
      ...recipeRow,
      name: recipe.name,
      req1TemplateId: primary.id,
      req1Count: primary.count,
      req2TemplateId: second.id,
      req2Count: second.count,
      req3TemplateId: third ? third.id : undefined,
      req3Count: third ? third.count : undefined,
      recipeType: recipe.category,
      materialType: recipe.category === 'consumable' ? undefined : materialKey(primary.name),
      req4TemplateId: fourth ? fourth.id : 0n,
      req4Count: fourth ? fourth.count : 0n,
    };
    if (Object.keys(nextRecipe).some((k) => !sameValue((recipeRow as any)[k], (nextRecipe as any)[k]))) {
      ctx.db.recipe_template.id.update(nextRecipe);
      touched = true;
    }
    // learn_recipe_scroll finds the recipe by the scroll's name, so the scroll follows the recipe name.
    const scrollTag = book.slots.get(`scroll:${recipe.index}`);
    const scroll = scrollTag ? ctx.db.item_template.id.find(scrollTag.itemTemplateId) : undefined;
    if (scroll) {
      const scrollFields = scrollTemplate(recipe.name, recipe.tier);
      if (scroll.name !== scrollFields.name || !sameValue(scroll.description, scrollFields.description)) {
        ctx.db.item_template.id.update({ ...scroll, name: scrollFields.name, description: scrollFields.description });
        touched = true;
      }
    }
    if (touched) {
      changed.push({ index: recipe.index, oldName: before.name, newName: recipe.name, oldSlot: before.slot, newSlot: fields.slot });
    }
  }
  return { ok: true, checked, changed };
}

/** The characterId stored in a region economy request (decimal string); 0n when missing or malformed. */
function storedCharacterId(contextJson: string | undefined): bigint {
  if (typeof contextJson !== 'string') return 0n;
  try {
    const parsed = JSON.parse(contextJson);
    return isPlainObject(parsed) ? toBig(parsed.characterId) ?? 0n : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Whether a family has a member whose template exists and has no enemy_loot_entry rows (the family
 * needs a late economy job). Fillers count: they drop the family's loot too (D-47).
 */
function familyNeedsLoot(tx: any, familyId: bigint): boolean {
  return familyMemberIds(tx, familyId, []).some((id) => lacksLoot(tx, id));
}

/**
 * After a region apply: every family of the region with a member lacking enemy_loot_entry rows gets
 * ONE family-mode job (startFamilyLoot), never one per member, for the same player as the region job:
 * families that joined while the region job was pending, and families the reply left out. Families in
 * id order. Each start is in try/catch; never fails the apply.
 */
function startLateFamilies(ctx: any, regionId: bigint, job: EconomyApplyJob): void {
  try {
    if (getDials(ctx).aiEnabled !== true) return;
    const who = { playerId: job ? job.playerId : undefined, characterId: storedCharacterId(job ? job.contextJson : undefined) };
    const families = [...ctx.db.creature_family.by_region.filter(regionId)].sort((a: any, b: any) => compareBig(a.id, b.id));
    for (const family of families) {
      try {
        if (familyNeedsLoot(ctx, family.id)) startFamilyLoot(ctx, family, regionId, who);
      } catch (err) {
        console.error(`Family loot start failed for family ${String(family.id)}: ${err instanceof Error ? err.name : typeof err}`);
      }
    }
  } catch (err) {
    console.error(`Family loot follow-up failed for region ${String(regionId)}: ${err instanceof Error ? err.name : typeof err}`);
  }
}

// ---------------------------------------------------------------------------
// Job start (Plan 12): gated on the AI economy switch, charged to the phase ledger only
// ---------------------------------------------------------------------------

/** Who a job is enqueued for: the player identity and the character it is tied to. */
export interface EconomyJobOwner {
  playerId: any;
  characterId: bigint;
}

/** 'not_ready' (family mode only): the region's economy is not complete yet. */
export type EconomyStartResult =
  | 'off'
  | 'exists'
  | 'no_region'
  | 'not_ready'
  | 'enqueued'
  | 'duplicate'
  | `refused:${string}`;

/**
 * Starts a region's economy job. Gates, in order: the AI economy switch (economy_dials.aiEnabled; a
 * missing row reads off), the once-only region_economy row (a failed row is re-queued only with
 * retryFailed), a region with locations. The job is enqueued with budget 'phase_only' (never the
 * player's day; the kill switch, the global ceiling and the ledger still apply) and sourceKey
 * region:<id>; then the row is marked pending with the job id. A refusal writes nothing.
 */
export function startRegionEconomy(
  tx: any,
  region: any,
  who: EconomyJobOwner,
  opts: { retryFailed?: boolean } = {},
): EconomyStartResult {
  if (getDials(tx).aiEnabled !== true) return 'off';
  if (!region) return 'no_region';
  const regionId: bigint = region.id;
  const existing = tx.db.region_economy.regionId.find(regionId);
  if (existing && !(opts.retryFailed === true && existing.status === 'failed')) return 'exists';
  if (regionLocations(tx, regionId).length === 0) return 'no_region';

  const input = buildRegionEconomyInput(tx, region, 'region');
  // The families past the design cap (coordinator, D-66): the apply writes them by rule.
  const ruleFamilyIds = economyDesignFamilies(tx, regionId).ruleFamilyIds;
  const result = enqueueLlmJob(tx, {
    route: 'region_economy',
    playerId: who.playerId,
    characterId: who.characterId,
    sourceKey: SOURCE_KEYS.regionEconomy(regionId),
    budget: 'phase_only',
    request: {
      regionId: regionId.toString(),
      mode: 'region',
      enemyTemplateId: '0',
      characterId: who.characterId.toString(),
      ruleFamilyIds: ruleFamilyIds.map((id) => id.toString()),
      input: encodeRouteInput(input),
    },
  });
  if (result.refused) {
    console.info(`region_economy enqueue refused for region ${String(regionId)}: ${result.refused}`);
    return `refused:${result.refused}`;
  }
  markRegionEconomyPending(tx, regionId, result.job.id, JSON.stringify(input.foreignRegions.map((r) => r.regionId.toString())));
  return result.created ? 'enqueued' : 'duplicate';
}

/**
 * Starts the late family job (D-47, D-54): one family-mode job for a family that joined an already
 * designed region, or that the region reply left out, or a quest family of one. Gates, in order: the
 * AI economy switch (economy_dials.aiEnabled), a family row, the region's economy complete, a member
 * of the family lacking enemy_loot_entry rows, the region row. Budget 'phase_only' (the kill switch,
 * the global ceiling and the ledger still apply), sourceKey family:<id> (an active job for the family
 * is reused: 'duplicate'). A refusal writes nothing.
 */
export function startFamilyLoot(tx: any, family: any, regionId: bigint, who: EconomyJobOwner): EconomyStartResult {
  if (getDials(tx).aiEnabled !== true) return 'off';
  if (!family || typeof regionId !== 'bigint') return 'no_region';
  const row = tx.db.region_economy.regionId.find(regionId);
  if (!row || row.status !== 'complete') return 'not_ready';
  const familyId: bigint = family.id;
  if (!familyNeedsLoot(tx, familyId)) return 'exists';
  const region = tx.db.region.id.find(regionId);
  if (!region) return 'no_region';

  const input = buildRegionEconomyInput(tx, region, 'family', family);
  const result = enqueueLlmJob(tx, {
    route: 'region_economy',
    playerId: who.playerId,
    characterId: who.characterId,
    sourceKey: SOURCE_KEYS.familyLoot(familyId),
    budget: 'phase_only',
    request: {
      regionId: regionId.toString(),
      mode: 'family',
      familyId: familyId.toString(),
      characterId: who.characterId.toString(),
      input: encodeRouteInput(input),
    },
  });
  if (result.refused) {
    console.info(`region_economy enqueue refused for family ${String(familyId)} in region ${String(regionId)}: ${result.refused}`);
    return `refused:${result.refused}`;
  }
  return result.created ? 'enqueued' : 'duplicate';
}

/** Rank of a gather slot rarity (common, uncommon, rare); anything else sorts last. */
function gatherRank(rarity: unknown): number {
  const i = GATHER_SLOTS.indexOf(text(rarity));
  return i === -1 ? GATHER_SLOTS.length : i;
}

/** The region's gatherable template ids from the apply book: common, uncommon, rare, then by id. */
function bookGatherableIds(ctx: any, book: ApplyBook): bigint[] {
  return [...book.slots.values()]
    .filter((row) => row.role === 'gather' && ctx.db.item_template.id.find(row.itemTemplateId))
    .sort((a, b) => gatherRank(a.rarity) - gatherRank(b.rarity) || compareBig(a.itemTemplateId, b.itemTemplateId))
    .map((row) => row.itemTemplateId as bigint);
}

/**
 * Late-creature mode: an enemy type that joined an already designed region gets its drop, trophy,
 * gear and loot table, built from the region's existing gatherables (common, uncommon, rare, then by
 * id). Writes only when the region's economy is complete and the enemy has no enemy_loot_entry rows;
 * an unusable reply writes nothing and changes no status. Uses the same writeCreature as region mode.
 * Nothing starts an enemy-mode job since Plan 25; a 51.3 job stored before it may be answered in the
 * family shape (lateFamily, the route schema since Plan 24): that reply reads the stored enemy as a
 * family of one and writes the same per-template rows through writeFamily.
 */
function applyLateCreatureResult(ctx: any, c: EconomyJobContext, resultText: string): void {
  const regionId = c.regionId;
  const enemyId = c.enemyTemplateId;
  if (enemyId === 0n) return;
  const statusRow = ctx.db.region_economy.regionId.find(regionId);
  if (!statusRow || statusRow.status !== 'complete') return;
  if (!lacksLoot(ctx, enemyId)) return;
  const own = new Set<string>([`drop:${enemyId}`, `trophy:${enemyId}`, `gear:${enemyId}`]);
  const book = openBook(ctx, c.input, regionId, (slotKey) => own.has(slotKey), () => false);
  const parsed = parseReplyText(resultText);
  const creature = validateLateCreature(c.input, parsed, isTakenIn(book));
  if (creature !== null) {
    if (creature.enemyTemplateId !== enemyId) return;
    writeCreature(book, creature, enemyLevelOf(c.input, enemyId), bookGatherableIds(ctx, book));
    return;
  }
  // The stored enemy read as a family of one (economyFamilies reads an input without families so).
  const { families: _families, ...enemyInput } = c.input;
  const asFamily = enemyInput as RegionEconomyInput;
  const entry = validateLateFamily(asFamily, parsed, isTakenIn(book));
  if (entry === null || entry.familyId !== 0n) return;
  const members = economyFamilies(asFamily).find((f) => f.ref === entry.familyRef)?.members ?? [];
  if (members.length !== 1 || members[0].templateId !== enemyId) return;
  writeFamily(book, entry, [enemyId], enemyLevelOf(c.input, enemyId), bookGatherableIds(ctx, book));
}

/**
 * Late-family mode (D-47): a family that joined an already designed region, or that the region reply
 * left out, gets its drop and trophy, gear per member and its members' loot tables through writeFamily,
 * built from the region's existing gatherables. Writes only when the region's economy is complete, the
 * family still exists and one of its members has no enemy_loot_entry rows; an unusable reply writes
 * nothing and changes no status. A second apply of the same result changes nothing.
 */
function applyLateFamilyResult(ctx: any, c: EconomyJobContext, resultText: string): void {
  const regionId = c.regionId;
  const familyId = c.familyId;
  if (familyId === 0n) return;
  const statusRow = ctx.db.region_economy.regionId.find(regionId);
  if (!statusRow || statusRow.status !== 'complete') return;
  if (!ctx.db.creature_family.id.find(familyId)) return;
  const listed = economyFamilies(c.input).find((f) => f.familyId === familyId);
  const memberIds = familyMemberIds(ctx, familyId, listed && Array.isArray(listed.members) ? listed.members : []);
  if (!memberIds.some((id) => lacksLoot(ctx, id))) return;
  const keys = familySlotKeys(familyId, 0n);
  const own = new Set<string>([keys.drop, keys.trophy, ...memberIds.map((id) => `gear:${id}`)]);
  const book = openBook(ctx, c.input, regionId, (slotKey) => own.has(slotKey), () => false);
  const entry = validateLateFamily(c.input, parseReplyText(resultText), isTakenIn(book));
  if (entry === null || entry.familyId !== familyId) return;
  writeFamily(book, entry, memberIds, levelOf(listed ? listed.level : 1), bookGatherableIds(ctx, book));
}

/**
 * The failure path of a region economy job: a pending region-mode row becomes 'failed' (fallbacks keep
 * serving; /economy shows it). Enemy mode, a missing row and any non-pending row change nothing. Silent.
 */
export function failRegionEconomy(ctx: any, job: EconomyApplyJob): void {
  const c = readEconomyJobContext(job ? job.contextJson : undefined);
  if (c === null || c.mode !== 'region') return;
  const row = ctx.db.region_economy.regionId.find(c.regionId);
  if (!row || row.status !== 'pending') return;
  if (isOtherJob(row, job)) return;
  ctx.db.region_economy.regionId.update({ ...row, status: 'failed', updatedAt: ctx.timestamp });
}

/**
 * The once-only lock before a region job is enqueued (Plan 12): inserts a pending row, or turns a
 * failed row back to pending with the new jobId. Returns false (and writes nothing) when a pending or
 * complete row exists. otherRegionIds is stored as a JSON array of decimal strings.
 */
export function markRegionEconomyPending(
  ctx: any,
  regionId: bigint,
  jobId: bigint,
  otherRegionIds: readonly bigint[] | string,
): boolean {
  const others =
    typeof otherRegionIds === 'string'
      ? otherRegionIds
      : JSON.stringify((Array.isArray(otherRegionIds) ? otherRegionIds : []).map((id) => id.toString()));
  const row = ctx.db.region_economy.regionId.find(regionId);
  if (!row) {
    ctx.db.region_economy.insert({
      regionId,
      status: 'pending',
      jobId,
      otherRegionIds: others,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    return true;
  }
  if (row.status !== 'failed') return false;
  ctx.db.region_economy.regionId.update({ ...row, status: 'pending', jobId, otherRegionIds: others, updatedAt: ctx.timestamp });
  return true;
}
