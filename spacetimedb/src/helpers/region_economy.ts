/**
 * The Phase 51.3 region economy job, server side: this file builds the route input from a region's
 * stored rows, starts the job (startRegionEconomy, startEnemyLoot: gated on economy_dials.aiEnabled,
 * budget phase_only) and applies a validated reply (items, loot tables, recipes and scrolls). The
 * route registration lives in llm_routes/llm_layers; nothing here calls the model directly.
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
  enemyRef,
  foreignOffer,
  foreignRef,
  gearTemplate,
  materialTemplate,
  nameKey,
  orderForeignRegions,
  recipeTierSlots,
  regionalOutputTemplate,
  scrollTemplate,
  slotForeignIndexes,
  trophyTemplate,
  type ForeignMaterial,
  type RegionEconomyEnemy,
  type RegionEconomyForeign,
  type RegionEconomyInput,
} from '../data/economy_design_rules';
import { aiLootTable, SCROLL_TIER_WEIGHTS } from '../data/economy_rules';
import { areaLevel, materialKey, type GeneratedItemTemplate } from '../data/recipe_rules';
import {
  validateLateCreature,
  validateRegionEconomyReply,
  type ValidatedCreature,
} from './region_economy_validate';
import { enqueueLlmJob, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput } from './llm_inputs';
import { getDials } from './economy_state';

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
  if (input.regionId !== regionId) return null;
  return { regionId, mode, enemyTemplateId, input: input as unknown as RegionEconomyInput };
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
  tag: { kind: string; terrain?: string; timeOfDay?: string; enemyTemplateId?: bigint },
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

/**
 * The applied form of a region economy reply. Region mode, in this order: the status guard (pending
 * only), parse, name snapshot, validation (null sets status failed and writes no item rows), then the
 * gatherables, each creature (drop, trophy, gear, loot table), the recipes (output, recipe_template
 * keyed region:<regionId>:r<n> with req4, scroll for rare and above, region_recipe), and status
 * complete last. Every write is looked up first, so a re-run after success, a rollback or a partial
 * write leaves exactly one set of rows. Silent: no player line is written on any path. Enemy mode
 * goes to the late-creature apply.
 */
export function applyRegionEconomyResult(ctx: any, job: EconomyApplyJob, resultText: string): void {
  const c = readEconomyJobContext(job ? job.contextJson : undefined);
  if (c === null) return;
  if (c.mode === 'enemy') {
    applyLateCreatureResult(ctx, c, resultText);
    return;
  }
  const regionId = c.regionId;
  const statusRow = ctx.db.region_economy.regionId.find(regionId);
  if (!statusRow || statusRow.status !== 'pending') return;
  const input = c.input;
  const recipePrefix = `region:${regionId}:r`;
  const book = openBook(ctx, input, regionId, () => true, (key) => key.startsWith(recipePrefix));
  const plan = validateRegionEconomyReply(input, parseReplyText(resultText), isTakenIn(book));
  if (plan === null) {
    ctx.db.region_economy.regionId.update({ ...statusRow, status: 'failed', updatedAt: ctx.timestamp });
    return;
  }

  // Gatherables (G1..G3).
  const locals = new Map<string, { id: bigint; kind: string; name: string }>();
  const gatherableIds: bigint[] = [];
  for (const g of plan.gatherables) {
    const template = ensureItem(
      book,
      `gather:${g.slot}`,
      'gather',
      materialTemplate({ name: g.name, description: g.description, rarity: g.slot, areaLevel: book.areaLevel, kind: g.kind }),
      { kind: g.kind, terrain: text(g.terrain, 'plains').toLowerCase(), timeOfDay: 'any' },
    );
    locals.set(g.ref, { id: template.id, kind: g.kind, name: text(template.name) });
    gatherableIds.push(template.id);
  }

  // Creatures (D:E<n>).
  for (const creature of plan.creatures) {
    const drop = writeCreature(book, creature, enemyLevelOf(input, creature.enemyTemplateId), gatherableIds);
    locals.set(`D:${creature.enemyRef}`, { id: drop.id, kind: creature.drop.kind, name: text(drop.name) });
  }

  // Recipes.
  const recipeRows = new Map<string, any>();
  const existingRecipes = [...ctx.db.recipe_template.iter()];
  for (const row of existingRecipes) if (text(row.key).startsWith(recipePrefix)) recipeRows.set(row.key, row);
  for (const recipe of plan.recipes) {
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

  // Last: the region is complete only once every row above exists.
  const latest = ctx.db.region_economy.regionId.find(regionId) ?? statusRow;
  ctx.db.region_economy.regionId.update({ ...latest, status: 'complete', updatedAt: ctx.timestamp });

  // Follow-up (SC1 late enemies): enemy types that joined while the job was pending, or that the reply
  // left out, get their own enemy-mode job. Never fails the apply.
  startLateEnemies(ctx, regionId, job);
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
 * After a region apply: every enemy template of the region with no enemy_loot_entry rows gets one
 * enemy-mode job (startEnemyLoot), for the same player as the region job. Each start is in try/catch.
 */
function startLateEnemies(ctx: any, regionId: bigint, job: EconomyApplyJob): void {
  try {
    if (getDials(ctx).aiEnabled !== true) return;
    const who = { playerId: job ? job.playerId : undefined, characterId: storedCharacterId(job ? job.contextJson : undefined) };
    for (const template of regionEnemyTemplates(ctx, regionId)) {
      try {
        startEnemyLoot(ctx, template, regionId, who);
      } catch (err) {
        console.error(`Enemy loot start failed for enemy ${String(template.id)}: ${err instanceof Error ? err.name : typeof err}`);
      }
    }
  } catch (err) {
    console.error(`Enemy loot follow-up failed for region ${String(regionId)}: ${err instanceof Error ? err.name : typeof err}`);
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

/** 'not_ready' (enemy mode only): the region's economy is not complete yet. */
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
  const result = enqueueLlmJob(tx, {
    route: 'region_economy',
    playerId: who.playerId,
    characterId: who.characterId,
    sourceKey: SOURCE_KEYS.regionEconomy(regionId),
    request: {
      regionId: regionId.toString(),
      mode: 'region',
      enemyTemplateId: '0',
      characterId: who.characterId.toString(),
      input: encodeRouteInput(input),
    },
    budget: 'phase_only',
  });
  if (result.refused) {
    console.info(`region_economy enqueue refused for region ${String(regionId)}: ${result.refused}`);
    return `refused:${result.refused}`;
  }
  markRegionEconomyPending(tx, regionId, result.job.id, JSON.stringify(input.foreignRegions.map((r) => r.regionId.toString())));
  return result.created ? 'enqueued' : 'duplicate';
}

/**
 * Starts the small enemy-mode job for an enemy type that joined an already designed region. Gates:
 * the AI economy switch, the region's economy complete, the enemy with no enemy_loot_entry rows.
 * Budget 'phase_only', sourceKey enemy:<id>. A refusal writes nothing.
 */
export function startEnemyLoot(tx: any, enemyTemplate: any, regionId: bigint, who: EconomyJobOwner): EconomyStartResult {
  if (getDials(tx).aiEnabled !== true) return 'off';
  if (!enemyTemplate || typeof regionId !== 'bigint') return 'no_region';
  const row = tx.db.region_economy.regionId.find(regionId);
  if (!row || row.status !== 'complete') return 'not_ready';
  const enemyId: bigint = enemyTemplate.id;
  if ([...tx.db.enemy_loot_entry.by_enemy.filter(enemyId)].length > 0) return 'exists';
  const region = tx.db.region.id.find(regionId);
  if (!region) return 'no_region';

  const input = buildRegionEconomyInput(tx, region, 'enemy', enemyTemplate);
  const result = enqueueLlmJob(tx, {
    route: 'region_economy',
    playerId: who.playerId,
    characterId: who.characterId,
    sourceKey: SOURCE_KEYS.enemyLoot(enemyId),
    request: {
      regionId: regionId.toString(),
      mode: 'enemy',
      enemyTemplateId: enemyId.toString(),
      characterId: who.characterId.toString(),
      input: encodeRouteInput(input),
    },
    budget: 'phase_only',
  });
  if (result.refused) {
    console.info(`region_economy enqueue refused for enemy ${String(enemyId)} in region ${String(regionId)}: ${result.refused}`);
    return `refused:${result.refused}`;
  }
  return result.created ? 'enqueued' : 'duplicate';
}

/** Rank of a gather slot rarity (common, uncommon, rare); anything else sorts last. */
function gatherRank(rarity: unknown): number {
  const i = GATHER_SLOTS.indexOf(text(rarity));
  return i === -1 ? GATHER_SLOTS.length : i;
}

/**
 * Late-creature mode: an enemy type that joined an already designed region gets its drop, trophy,
 * gear and loot table, built from the region's existing gatherables (common, uncommon, rare, then by
 * id). Writes only when the region's economy is complete and the enemy has no enemy_loot_entry rows;
 * an unusable reply writes nothing and changes no status. Uses the same writeCreature as region mode.
 */
function applyLateCreatureResult(ctx: any, c: EconomyJobContext, resultText: string): void {
  const regionId = c.regionId;
  const enemyId = c.enemyTemplateId;
  if (enemyId === 0n) return;
  const statusRow = ctx.db.region_economy.regionId.find(regionId);
  if (!statusRow || statusRow.status !== 'complete') return;
  const present = [...ctx.db.enemy_loot_entry.by_enemy.filter(enemyId)];
  if (present.length > 0) return;
  const own = new Set<string>([`drop:${enemyId}`, `trophy:${enemyId}`, `gear:${enemyId}`]);
  const book = openBook(ctx, c.input, regionId, (slotKey) => own.has(slotKey), () => false);
  const creature = validateLateCreature(c.input, parseReplyText(resultText), isTakenIn(book));
  if (creature === null || creature.enemyTemplateId !== enemyId) return;
  const gatherableIds = [...book.slots.values()]
    .filter((row) => row.role === 'gather' && ctx.db.item_template.id.find(row.itemTemplateId))
    .sort((a, b) => gatherRank(a.rarity) - gatherRank(b.rarity) || compareBig(a.itemTemplateId, b.itemTemplateId))
    .map((row) => row.itemTemplateId as bigint);
  writeCreature(book, creature, enemyLevelOf(c.input, enemyId), gatherableIds);
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
