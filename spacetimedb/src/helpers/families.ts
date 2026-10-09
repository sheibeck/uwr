// families.ts
// The creature family and pool seeding layer of Phase 51.3.1.1 (SC1, D-02, D-25, D-26, D-46, D-48,
// D-54, D-55):
//   - createFamily / linkFamilyToLocation / createRelations: a family from one definition (an AI reply
//     after validateFamilies, or the rule path), find-or-create by its key;
//   - isOrdinaryTemplate / familiesFromTemplates: today's enemy types grouped into families by rule;
//   - seedCreaturePools / seedResourcePools / addResourcePoolsForRegion: pools at a place, with home
//     densities set by rule only (the AI never sets a number, D-46);
//   - ensurePoolsForLocation: the lazy safety net that replaces ensureSpawnsForLocation (Plan 08);
//   - buildRegionFamilies (with ruleRelations, familyFitPlaces, linkFamilyToPlaces, seedRegionPools):
//     a freshly filled region's families and pools by rule (Plan 09);
//   - familyOfOne: a pool of its own for an AI-invented quest kill target (D-54);
//   - storeFeud / regionFamilyHistories: a region's seeded feud as mutual relations (D-70) and the
//     family histories one NPC conversation is given (D-68), Plan 28.
//
// Every pool is created through pools.ts createPool. Stats come from enemyStatsForLevel and the role
// profiles, abilities from memberAbilities. Deterministic: seeded picks only, "now" is passed in.

import type { EnemyRole, FamilyRelation, FamilyRelationKind } from '../data/mechanical_vocabulary';
import { FAMILY_FEUD_KIND, FAMILY_RELATION_KINDS } from '../data/mechanical_vocabulary';
import { enemyStatsForLevel } from '../data/enemy_rules';
import {
  ROLE_ORDER,
  familyKey,
  fillerMemberName,
  iconKeyForCreatureType,
  memberAbilities,
  normalizeEnemyRole,
  nounsFromTemplateName,
  questFamilyKey,
  temperamentForCreatureType,
} from '../data/family_rules';
import { WORLD_EVENT_DEFINITIONS } from '../data/world_event_data';
import { DENSITY_RULES, POOL_ROLL, creatureHomeLevels, poolSeed, resourceHomeLevel } from '../data/density_rules';
import { pickWithoutReplacement, pinPct, scaleWeights } from '../data/economy_rules';
import { CRAFTING_MODIFIER_DEFS, MATERIAL_DEFS } from '../data/crafting_rules';
import { loadItemPins } from './economy_state';
import { getGatherableResourceTemplates } from './location';
import { regionalGatherEntries } from './regional_gather';
import { createPool, type PlacePoolRow } from './pools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FamilyMemberDefinition {
  /** The canonical server role. */
  role: EnemyRole;
  name: string;
  /** An enemy_template that joins as this member (its role fields are rewritten to `role`). */
  existingTemplateId?: bigint;
  /** True when the server filled a missing role by rule. */
  filler: boolean;
}

export interface FamilyDefinition {
  /** creature_family.key: '<regionId>:<creatureType>' (rule), 'ai:<regionId>:<name>' (AI), 'quest:<id>'. */
  key: string;
  name: string;
  singularNoun: string;
  pluralNoun: string;
  creatureType: string;
  temperament: string;
  iconKey: string;
  ambushVerb: string;
  ambushRest: string;
  fitTerrains: string[];
  members: FamilyMemberDefinition[];
  /** One or two sentences of the family's past in its region (D-68); '' when absent. */
  history?: string;
}

export interface FamilyRelationDef {
  otherKey: string;
  kind: FamilyRelation;
}

// ---------------------------------------------------------------------------
// Small rules
// ---------------------------------------------------------------------------

function byId(a: { id: bigint }, b: { id: bigint }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A comma list of terrains, trimmed, lowercased, deduplicated; 'any' is not a terrain. */
function splitTerrains(list: unknown): string[] {
  if (typeof list !== 'string') return [];
  const out: string[] = [];
  for (const part of list.split(',')) {
    const terrain = part.trim().toLowerCase();
    if (terrain && terrain !== 'any' && !out.includes(terrain)) out.push(terrain);
  }
  return out;
}

/** The region's base enemy level, as world generation computes it: dangerMultiplier / 100, at least 1. */
export function regionBaseLevel(ctx: any, regionId: bigint): bigint {
  const region = ctx.db.region.id.find(regionId);
  const level: bigint = (region?.dangerMultiplier ?? 100n) / 100n;
  return level < 1n ? 1n : level;
}

/** The names of World event enemies (data/world_event_data.ts), lowercased. */
const WORLD_EVENT_ENEMY_NAMES: ReadonlySet<string> = (() => {
  const names = new Set<string>();
  for (const def of Object.values(WORLD_EVENT_DEFINITIONS)) {
    for (const place of def.contentLocations) {
      for (const enemy of place.enemies) names.add(enemy.enemyTemplateKey.trim().toLowerCase());
    }
  }
  return names;
})();

// ---------------------------------------------------------------------------
// Families
// ---------------------------------------------------------------------------

function setTemplateRole(ctx: any, template: any, role: EnemyRole): void {
  if (template.role !== role || template.roleDetail !== role || template.abilityProfile !== role) {
    ctx.db.enemy_template.id.update({ ...template, role, roleDetail: role, abilityProfile: role });
  }
  const roleRows = [...ctx.db.enemy_role_template.by_template.filter(template.id)];
  if (roleRows.length === 0) {
    ctx.db.enemy_role_template.insert({
      id: 0n,
      enemyTemplateId: template.id,
      roleKey: role,
      displayName: template.name,
      role,
      roleDetail: role,
      abilityProfile: role,
    });
    return;
  }
  for (const row of roleRows) {
    if (row.role === role && row.roleKey === role && row.roleDetail === role && row.abilityProfile === role) continue;
    ctx.db.enemy_role_template.id.update({ ...row, roleKey: role, role, roleDetail: role, abilityProfile: role });
  }
}

function insertMemberTemplate(ctx: any, def: FamilyDefinition, member: FamilyMemberDefinition, role: EnemyRole, level: bigint): any {
  const { maxHp, baseDamage, xpReward, armorClass } = enemyStatsForLevel(level);
  const template = ctx.db.enemy_template.insert({
    id: 0n,
    name: member.name,
    role,
    roleDetail: role,
    abilityProfile: role,
    terrainTypes: def.fitTerrains.join(','),
    creatureType: def.creatureType,
    timeOfDay: 'any',
    socialGroup: def.name,
    socialRadius: 0n,
    awareness: 'normal',
    // Pools size the groups now (D-11), so a member template is always one creature.
    groupMin: 1n,
    groupMax: 1n,
    armorClass,
    level,
    maxHp,
    baseDamage,
    xpReward,
  });
  ctx.db.enemy_role_template.insert({
    id: 0n,
    enemyTemplateId: template.id,
    roleKey: role,
    displayName: member.name,
    role,
    roleDetail: role,
    abilityProfile: role,
  });
  for (const ability of memberAbilities(role)) {
    ctx.db.enemy_ability.insert({ id: 0n, enemyTemplateId: template.id, ...ability });
  }
  return template;
}

/**
 * A family from one definition (D-02, D-25, D-46). Find-or-create by `def.key`: when the family
 * exists, nothing is inserted except a member row for an existing template of the definition that is
 * in no family yet (a rerun inserts nothing). For a new family:
 *   - a member with `existingTemplateId` joins with its template's role fields (and its role template)
 *     rewritten to the canonical role, and keeps its own stats and abilities;
 *   - every other member gets a new enemy_template at `baseLevel` (at least 1) with stats from
 *     enemyStatsForLevel, one enemy_role_template and the rule abilities from memberAbilities.
 * Returns the creature_family row.
 */
export function createFamily(ctx: any, regionId: bigint, def: FamilyDefinition, baseLevel: bigint): any {
  const level = baseLevel < 1n ? 1n : baseLevel;
  const existing = ctx.db.creature_family.key.find(def.key);
  if (existing) {
    for (const member of def.members) {
      if (member.existingTemplateId === undefined) continue;
      const template = ctx.db.enemy_template.id.find(member.existingTemplateId);
      if (!template || [...ctx.db.family_member.by_template.filter(template.id)].length > 0) continue;
      const role = normalizeEnemyRole(member.role);
      setTemplateRole(ctx, template, role);
      ctx.db.family_member.insert({ id: 0n, familyId: existing.id, enemyTemplateId: template.id, role, filler: member.filler });
    }
    return existing;
  }

  const family = ctx.db.creature_family.insert({
    id: 0n,
    regionId,
    key: def.key,
    name: def.name,
    singularNoun: def.singularNoun,
    pluralNoun: def.pluralNoun,
    temperament: def.temperament,
    iconKey: def.iconKey,
    creatureType: def.creatureType,
    ambushVerb: def.ambushVerb,
    ambushRest: def.ambushRest,
    fitTerrains: def.fitTerrains.join(','),
    history: def.history ?? '',
  });

  const joined = new Set<bigint>();
  for (const member of def.members) {
    const role = normalizeEnemyRole(member.role);
    let template: any = null;
    if (member.existingTemplateId !== undefined) {
      if (joined.has(member.existingTemplateId)) continue;
      template = ctx.db.enemy_template.id.find(member.existingTemplateId) ?? null;
      if (template) setTemplateRole(ctx, template, role);
    }
    if (!template) template = insertMemberTemplate(ctx, def, member, role, level);
    joined.add(template.id);
    ctx.db.family_member.insert({ id: 0n, familyId: family.id, enemyTemplateId: template.id, role, filler: member.filler });
  }
  return family;
}

/**
 * Links every member of a family to a place (location_enemy_template), find-or-create, so NPC context
 * and the quest name resolver keep finding the family's types there. Returns the number of new links.
 */
export function linkFamilyToLocation(ctx: any, familyId: bigint, locationId: bigint): number {
  const linked = new Set<bigint>();
  for (const row of ctx.db.location_enemy_template.by_location.filter(locationId)) linked.add(row.enemyTemplateId);
  let added = 0;
  for (const member of [...ctx.db.family_member.by_family.filter(familyId)]) {
    if (linked.has(member.enemyTemplateId)) continue;
    ctx.db.location_enemy_template.insert({ id: 0n, locationId, enemyTemplateId: member.enemyTemplateId });
    linked.add(member.enemyTemplateId);
    added += 1;
  }
  return added;
}

/**
 * Stores a family's relations (D-20), find-or-create by (family, other family, kind). A self-relation
 * and a kind outside FAMILY_RELATION_KINDS (the AI's FAMILY_RELATIONS plus the server's 'feud', D-70)
 * are ignored.
 */
export function createRelations(
  ctx: any,
  familyId: bigint,
  relations: readonly { otherFamilyId: bigint; kind: FamilyRelationKind }[],
): void {
  for (const relation of relations) {
    if (relation.otherFamilyId === familyId) continue;
    if (!(FAMILY_RELATION_KINDS as readonly string[]).includes(relation.kind)) continue;
    const exists = [...ctx.db.family_relation.by_family.filter(familyId)].some(
      (row: any) => row.otherFamilyId === relation.otherFamilyId && row.kind === relation.kind,
    );
    if (exists) continue;
    ctx.db.family_relation.insert({ id: 0n, familyId, otherFamilyId: relation.otherFamilyId, kind: relation.kind });
  }
}

/**
 * Whether a template is an ordinary creature that may live in a pool (T-51.3.1.1-24, D-07). Not
 * ordinary: a missing template, a boss (`isBoss`), a named enemy's template, a boss_kill quest
 * target and a World event enemy (by name). kill and kill_loot targets stay ordinary (D-54).
 */
export function isOrdinaryTemplate(ctx: any, templateId: bigint): boolean {
  const template = ctx.db.enemy_template.id.find(templateId);
  if (!template) return false;
  if (template.isBoss === true) return false;
  if (WORLD_EVENT_ENEMY_NAMES.has(String(template.name ?? '').trim().toLowerCase())) return false;
  for (const quest of ctx.db.quest_template.by_enemy.filter(templateId)) {
    if ((quest.questType ?? '').trim().toLowerCase() === 'boss_kill') return false;
  }
  for (const named of ctx.db.named_enemy.iter()) {
    if (named.enemyTemplateId === templateId) return false;
  }
  return true;
}

/** The rule role of a template while grouping: first melee is the tank, further melee are damage. */
function ruleRole(role: unknown, tankTaken: boolean): EnemyRole {
  const word = String(role ?? '').trim().toLowerCase();
  if (word === 'melee' || word === 'tank') return tankTaken ? 'damage' : 'tank';
  return normalizeEnemyRole(word);
}

/**
 * Today's enemy types of a region grouped into families by creature type (D-25), one definition per
 * type, in the order of each type's lowest template id. Templates join in id order: the first melee
 * (or tank) is the tank, further melee and ranged are damage, caster is caster, healer and support
 * are healer. Missing roles among tank, damage, healer and caster are filled by rule (filler names
 * from fillerMemberName on the base member's name). Nouns from the base member (the lowest id),
 * temperament and icon by creature type, fitTerrains from the templates' terrain lists. The ambush
 * verb and rest are empty, so the line builder falls back to burst / out of the dark.
 */
export function familiesFromTemplates(ctx: any, regionId: bigint, templates: readonly any[]): FamilyDefinition[] {
  void ctx;
  const groups = new Map<string, any[]>();
  const seen = new Set<bigint>();
  for (const template of [...templates].sort(byId)) {
    if (!template || seen.has(template.id)) continue;
    seen.add(template.id);
    const type = String(template.creatureType ?? '').trim().toLowerCase() || 'beast';
    const group = groups.get(type) ?? [];
    group.push(template);
    groups.set(type, group);
  }

  const defs: FamilyDefinition[] = [];
  for (const [type, group] of groups) {
    const base = group[0]!;
    const nouns = nounsFromTemplateName(String(base.name ?? ''));
    const members: FamilyMemberDefinition[] = [];
    let tankTaken = false;
    for (const template of group) {
      const role = ruleRole(template.role, tankTaken);
      if (role === 'tank') tankTaken = true;
      members.push({ role, name: template.name, existingTemplateId: template.id, filler: false });
    }
    for (const role of ROLE_ORDER) {
      if (members.some((m) => m.role === role)) continue;
      members.push({ role, name: fillerMemberName(String(base.name ?? ''), role), filler: true });
    }
    const fitTerrains: string[] = [];
    for (const template of group) {
      for (const terrain of splitTerrains(template.terrainTypes)) if (!fitTerrains.includes(terrain)) fitTerrains.push(terrain);
    }
    defs.push({
      key: familyKey(regionId, type),
      name: nouns.familyName || String(base.name ?? ''),
      singularNoun: nouns.singular,
      pluralNoun: nouns.plural,
      creatureType: type,
      temperament: temperamentForCreatureType(type),
      iconKey: iconKeyForCreatureType(type),
      ambushVerb: '',
      ambushRest: '',
      fitTerrains,
      members,
    });
  }
  return defs;
}

// ---------------------------------------------------------------------------
// Pool seeding (D-18, D-26, D-38, D-46, D-48, D-55)
// ---------------------------------------------------------------------------

/** Whether a place is uncharted (never seeded). */
function isUncharted(location: any): boolean {
  return String(location?.terrainType ?? '').trim().toLowerCase() === 'uncharted';
}

/** Whether creature families may live at a place: charted, not safe, not a hub (D-18, D-61). */
function hostsCreatures(location: any): boolean {
  return !!location && !location.isSafe && location.isHub !== true && !isUncharted(location);
}

/**
 * Creature pools at a non-safe, non-hub, charted place, one per family (find-or-create through
 * createPool). Home levels by rule only (D-18, D-46): creatureHomeLevels on a place seed, so the first
 * STABLE_HOME_FAMILIES_PER_PLACE families of the seeded order are Stable and the rest Scarce; never
 * Overrun. Returns the pools in family order; [] at a safe place, a hub or an uncharted place.
 */
export function seedCreaturePools(ctx: any, location: any, familyIds: readonly bigint[], now: bigint): PlacePoolRow[] {
  if (!hostsCreatures(location)) return [];
  const ids: bigint[] = [];
  for (const id of familyIds) if (!ids.includes(id)) ids.push(id);
  const homes = creatureHomeLevels(ids.length, poolSeed(location.id, location.regionId));
  return ids.map((familyId, i) =>
    createPool(
      ctx,
      {
        regionId: location.regionId,
        locationId: location.id,
        kind: 'creature',
        refId: familyId,
        homeLevel: homes[i] ?? 1,
        timeOfDay: 'any',
      },
      now,
    ),
  );
}

const MODIFIER_NAMES: ReadonlySet<string> = new Set(CRAFTING_MODIFIER_DEFS.map((def) => def.name.toLowerCase()));
const MATERIAL_TIER_BY_NAME: ReadonlyMap<string, bigint> = new Map(
  MATERIAL_DEFS.map((def) => [def.name.toLowerCase(), def.tier] as [string, bigint]),
);

/**
 * The rarity a resource pool's home level reads (D-38): a regional AI gatherable reads its
 * economy_item rarity; a modifier reagent is rare; a MATERIAL_DEFS entry is common at tier 1,
 * uncommon at tier 2 and rare above; every other static terrain item is common.
 */
export function resourceRarity(ctx: any, template: any): string {
  const economy = ctx.db.economy_item.itemTemplateId.find(template.id);
  if (economy && economy.role === 'gather') {
    const rarity = String(economy.rarity ?? '').trim().toLowerCase();
    if (rarity) return rarity;
  }
  const name = String(template.name ?? '').trim().toLowerCase();
  if (MODIFIER_NAMES.has(name)) return 'rare';
  const tier = MATERIAL_TIER_BY_NAME.get(name);
  if (tier !== undefined) return tier <= 1n ? 'common' : tier === 2n ? 'uncommon' : 'rare';
  return 'common';
}

/** The zone tier of a region's gather table, as spawnResourceNode computes it. */
function zoneTierFor(ctx: any, regionId: bigint): number {
  const dm: bigint = ctx.db.region.id.find(regionId)?.dangerMultiplier ?? 100n;
  return dm < 130n ? 1 : dm < 190n ? 2 : 3;
}

interface ResourceCandidate {
  itemTemplateId: bigint;
  weight: bigint;
  template: any;
  timeOfDay: string;
}

/** Merges two times of day of one item: equal stays, anything else (any, or day plus night) is any. */
function mergeTime(a: string, b: string): string {
  return a === b ? a : 'any';
}

/**
 * The gather table of a place as distinct candidates: every time of day, the admin item pins applied
 * (a pin of 0 removes the entry), one candidate per template (the heaviest weight; 'any' wins over a
 * time, and an item found both by day and by night is 'any').
 */
function resourceCandidates(ctx: any, location: any): ResourceCandidate[] {
  const terrain = String(location.terrainType ?? '').trim() || 'plains';
  const raw = getGatherableResourceTemplates(ctx, terrain, 'any', zoneTierFor(ctx, location.regionId), location.regionId);
  const pins = loadItemPins(ctx);
  const weights = scaleWeights(
    raw.map((entry: any) => entry.weight),
    raw.map((entry: any) => pinPct(pins.get(entry.template.id))),
  );
  const byTemplate = new Map<bigint, ResourceCandidate>();
  raw.forEach((entry: any, i: number) => {
    const weight = weights[i] ?? 0n;
    if (weight <= 0n) return;
    const timeOfDay = String(entry.timeOfDay ?? '').trim().toLowerCase() || 'any';
    const seen = byTemplate.get(entry.template.id);
    if (!seen) {
      byTemplate.set(entry.template.id, { itemTemplateId: entry.template.id, weight, template: entry.template, timeOfDay });
      return;
    }
    seen.timeOfDay = mergeTime(seen.timeOfDay, timeOfDay);
    if (weight > seen.weight) seen.weight = weight;
  });
  return [...byTemplate.values()];
}

/**
 * Resource pools at a charted place, safe places included (towns keep their gatherables, D-26): up to
 * RESOURCE_POOLS_PER_PLACE distinct items drawn (seeded, weighted, POOL_ROLL.RESOURCE_PICK) from the
 * place's gather table with the admin pins applied, home level by rarity (D-38) and the entry's time
 * of day kept on the pool (D-55). A place that already has that many resource pools gets none; a rerun
 * inserts nothing. Returns the new pools in pick order.
 */
export function seedResourcePools(ctx: any, location: any, now: bigint): PlacePoolRow[] {
  if (!location || isUncharted(location)) return [];
  const existing = new Set<bigint>();
  for (const pool of ctx.db.place_pool.by_location.filter(location.id)) {
    if (pool.kind === 'resource') existing.add(pool.refId);
  }
  const room = DENSITY_RULES.RESOURCE_POOLS_PER_PLACE - existing.size;
  if (room <= 0) return [];
  const candidates = resourceCandidates(ctx, location).filter((c) => !existing.has(c.itemTemplateId));
  const picks = pickWithoutReplacement(candidates, room, poolSeed(location.id), POOL_ROLL.RESOURCE_PICK);
  return picks.map((pick) =>
    createPool(
      ctx,
      {
        regionId: location.regionId,
        locationId: location.id,
        kind: 'resource',
        refId: pick.itemTemplateId,
        homeLevel: resourceHomeLevel(resourceRarity(ctx, pick.template)),
        timeOfDay: pick.timeOfDay,
      },
      now,
    ),
  );
}

/**
 * The region's AI gatherables join the pools (D-48): at every charted place of the region, each
 * regional gather entry on the place's terrain that has no pool there gets one, beyond the per-place
 * count, with its rarity home and time of day. An item pinned to 0 is skipped. Rerun-safe. Returns
 * the new pools.
 */
export function addResourcePoolsForRegion(ctx: any, regionId: bigint, now: bigint): PlacePoolRow[] {
  const pins = loadItemPins(ctx);
  const places = [...ctx.db.location.iter()].filter((l: any) => l.regionId === regionId && !isUncharted(l)).sort(byId);
  const created: PlacePoolRow[] = [];
  for (const place of places) {
    const pooled = new Set<bigint>();
    for (const pool of ctx.db.place_pool.by_location.filter(place.id)) {
      if (pool.kind === 'resource') pooled.add(pool.refId);
    }
    for (const entry of regionalGatherEntries(ctx, regionId, String(place.terrainType ?? ''), 'any')) {
      const id: bigint = entry.template.id;
      if (pooled.has(id) || pinPct(pins.get(id)) <= 0n) continue;
      created.push(
        createPool(
          ctx,
          {
            regionId,
            locationId: place.id,
            kind: 'resource',
            refId: id,
            homeLevel: resourceHomeLevel(resourceRarity(ctx, entry.template)),
            timeOfDay: entry.timeOfDay || 'any',
          },
          now,
        ),
      );
      pooled.add(id);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// Region fill (Plan 09: D-20, D-25, D-26, D-61)
// ---------------------------------------------------------------------------

/**
 * The rule relations of a region built without AI relations (D-20 default): every family is a rival
 * of every other, as ordered pairs, ids deduplicated. Map straight into createRelations per familyId.
 */
export function ruleRelations(familyIds: readonly bigint[]): { familyId: bigint; otherFamilyId: bigint; kind: 'rival' }[] {
  const ids: bigint[] = [];
  for (const id of familyIds) if (!ids.includes(id)) ids.push(id);
  const out: { familyId: bigint; otherFamilyId: bigint; kind: 'rival' }[] = [];
  for (const familyId of ids) {
    for (const otherFamilyId of ids) {
      if (otherFamilyId !== familyId) out.push({ familyId, otherFamilyId, kind: 'rival' });
    }
  }
  return out;
}

/**
 * The places a family lives among `places`: the ones that host creatures (charted, neither safe nor a
 * hub, D-18, D-61) whose terrain is in `fitTerrains`, else every such place. Id order.
 */
export function familyFitPlaces(fitTerrains: readonly string[] | string, places: readonly any[]): any[] {
  const fit = typeof fitTerrains === 'string' ? splitTerrains(fitTerrains) : fitTerrains.map((t) => t.trim().toLowerCase());
  const hosts = places.filter(hostsCreatures).sort(byId);
  const fitting = hosts.filter((place) => fit.includes(String(place.terrainType ?? '').trim().toLowerCase()));
  return fitting.length > 0 ? fitting : hosts;
}

/**
 * Links a family to each of `fitPlaces` (linkFamilyToLocation) and records it in `familiesByPlace`
 * (place id -> family ids), which seedRegionPools reads. Plan 23 calls it per validated AI family.
 */
export function linkFamilyToPlaces(
  ctx: any,
  familyId: bigint,
  fitPlaces: readonly any[],
  familiesByPlace: Map<bigint, bigint[]>,
): void {
  for (const place of fitPlaces) {
    linkFamilyToLocation(ctx, familyId, place.id);
    const ids = familiesByPlace.get(place.id) ?? [];
    if (!ids.includes(familyId)) ids.push(familyId);
    familiesByPlace.set(place.id, ids);
  }
}

/**
 * The pools of a freshly built region: creature pools at each host place with the families linked
 * there (ascending family id, as ensurePoolsForLocation orders them), resource pools at every charted
 * place (D-26). Rerun-safe (createPool is find-or-create).
 */
export function seedRegionPools(
  ctx: any,
  places: readonly any[],
  familiesByPlace: ReadonlyMap<bigint, readonly bigint[]>,
  now: bigint,
): void {
  for (const place of [...places].sort(byId)) {
    const ids = [...(familiesByPlace.get(place.id) ?? [])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (ids.length > 0) seedCreaturePools(ctx, place, ids, now);
    seedResourcePools(ctx, place, now);
  }
}

/**
 * The region fill's families by rule (D-25), from the enemy types today's prompt returns:
 * familiesFromTemplates, createFamily at the region's base level, each family linked to its fit places
 * (familyFitPlaces), rule relations (every pair rivals, D-20), then seedRegionPools. `places` should
 * be the region's rows as they stand after the hub step (a hub is safe and hosts no creatures); a row
 * is re-read by id. Find-or-create throughout, so a second run inserts nothing. Returns the family
 * rows in definition order.
 */
export function buildRegionFamilies(ctx: any, region: any, templates: readonly any[], places: readonly any[], now: bigint): any[] {
  const current = places.map((place) => ctx.db.location.id.find(place.id) ?? place).filter((place) => !!place);
  const defs = familiesFromTemplates(ctx, region.id, templates.filter((t) => !!t));
  const baseLevel = regionBaseLevel(ctx, region.id);
  const families = defs.map((def) => createFamily(ctx, region.id, def, baseLevel));
  const familiesByPlace = new Map<bigint, bigint[]>();
  families.forEach((family, i) => {
    linkFamilyToPlaces(ctx, family.id, familyFitPlaces(defs[i]!.fitTerrains, current), familiesByPlace);
  });
  const relations = ruleRelations(families.map((family) => family.id));
  for (const family of families) {
    createRelations(
      ctx,
      family.id,
      relations.filter((r) => r.familyId === family.id),
    );
  }
  seedRegionPools(ctx, current, familiesByPlace, now);
  return families;
}

/** Whether a family is a quest family of one (it manages its own pool, D-54). */
function isQuestFamily(family: any): boolean {
  return String(family?.key ?? '').startsWith('quest:');
}

/**
 * The lazy safety net and the new body of every former ensureSpawnsForLocation call (Plan 08).
 * Uncharted or missing places are left alone. When the place already has a resource pool and (a
 * creature pool, or it hosts no creatures) it returns after one index lookup. Otherwise:
 *   - resource pools are seeded when the place has none;
 *   - at a non-safe, non-hub place with no creature pool, the ordinary templates linked there join:
 *     a template already in a family brings that family (quest families of one excluded), the rest
 *     are grouped by rule (familiesFromTemplates) and created at the region's base level; each family
 *     is linked to the place and the creature pools are seeded.
 * A second call changes nothing.
 */
export function ensurePoolsForLocation(ctx: any, locationId: bigint): void {
  const location = ctx.db.location.id.find(locationId);
  if (!location || isUncharted(location)) return;
  let hasResource = false;
  let hasCreature = false;
  for (const pool of ctx.db.place_pool.by_location.filter(locationId)) {
    if (pool.kind === 'resource') hasResource = true;
    else hasCreature = true;
  }
  const wantsCreatures = hostsCreatures(location);
  if (hasResource && (hasCreature || !wantsCreatures)) return;

  const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
  if (!hasResource) seedResourcePools(ctx, location, now);
  if (!wantsCreatures || hasCreature) return;

  const familyIds: bigint[] = [];
  const ungrouped: any[] = [];
  const seen = new Set<bigint>();
  for (const link of [...ctx.db.location_enemy_template.by_location.filter(locationId)]) {
    const templateId: bigint = link.enemyTemplateId;
    if (seen.has(templateId)) continue;
    seen.add(templateId);
    if (!isOrdinaryTemplate(ctx, templateId)) continue;
    const memberships = [...ctx.db.family_member.by_template.filter(templateId)];
    if (memberships.length === 0) {
      ungrouped.push(ctx.db.enemy_template.id.find(templateId));
      continue;
    }
    for (const member of memberships) {
      const family = ctx.db.creature_family.id.find(member.familyId);
      if (family && !isQuestFamily(family) && !familyIds.includes(family.id)) familyIds.push(family.id);
    }
  }
  const baseLevel = regionBaseLevel(ctx, location.regionId);
  for (const def of familiesFromTemplates(ctx, location.regionId, ungrouped)) {
    const family = createFamily(ctx, location.regionId, def, baseLevel);
    if (!familyIds.includes(family.id)) familyIds.push(family.id);
  }
  if (familyIds.length === 0) return;
  familyIds.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const familyId of familyIds) linkFamilyToLocation(ctx, familyId, locationId);
  seedCreaturePools(ctx, location, familyIds, now);
}

/** Where a quest family's pool goes: the quest place when it hosts creatures, else its lowest-id such neighbour. */
function questPoolPlace(ctx: any, questLocationId: bigint): any | null {
  const here = ctx.db.location.id.find(questLocationId);
  if (hostsCreatures(here)) return here;
  let best: any = null;
  for (const link of ctx.db.location_connection.by_from.filter(questLocationId)) {
    const place = ctx.db.location.id.find(link.toLocationId);
    if (!hostsCreatures(place)) continue;
    if (!best || place.id < best.id) best = place;
  }
  return best;
}

/**
 * A pool of its own for an AI-invented quest kill or kill_loot target (D-54; boss_kill targets never
 * come here, D-07). Family key quest:<templateId>, one member (the template itself, role by
 * normalizeEnemyRole), nouns from the template name, temperament and icon by creature type. The pool
 * (home Scarce) goes at the quest place when it is non-safe, else at the lowest-id non-safe connected
 * place, else nowhere. That place is seeded first (ensurePoolsForLocation) so its ordinary families
 * keep their pools, and the template is linked there. Find-or-create by key; returns the family row.
 */
export function familyOfOne(ctx: any, template: any, questLocationId: bigint, now: bigint): any {
  const key = questFamilyKey(template.id);
  const existing = ctx.db.creature_family.key.find(key);
  if (existing) return existing;

  const questPlace = ctx.db.location.id.find(questLocationId);
  const poolPlace = questPoolPlace(ctx, questLocationId);
  const regionId: bigint = poolPlace?.regionId ?? questPlace?.regionId ?? 0n;
  const nouns = nounsFromTemplateName(String(template.name ?? ''));
  const creatureType = String(template.creatureType ?? '').trim().toLowerCase() || 'beast';
  const family = createFamily(
    ctx,
    regionId,
    {
      key,
      name: nouns.familyName || String(template.name ?? ''),
      singularNoun: nouns.singular,
      pluralNoun: nouns.plural,
      creatureType,
      temperament: temperamentForCreatureType(creatureType),
      iconKey: iconKeyForCreatureType(creatureType),
      ambushVerb: '',
      ambushRest: '',
      fitTerrains: splitTerrains(template.terrainTypes),
      members: [{ role: normalizeEnemyRole(template.role), name: template.name, existingTemplateId: template.id, filler: false }],
    },
    regionBaseLevel(ctx, regionId),
  );
  if (!poolPlace) return family;

  linkFamilyToLocation(ctx, family.id, poolPlace.id);
  ensurePoolsForLocation(ctx, poolPlace.id);
  createPool(
    ctx,
    { regionId: poolPlace.regionId, locationId: poolPlace.id, kind: 'creature', refId: family.id, homeLevel: 1, timeOfDay: 'any' },
    now,
  );
  return family;
}

// ---------------------------------------------------------------------------
// The seeded feud (D-70) and the NPC history selection (D-68), Plan 28
// ---------------------------------------------------------------------------

/**
 * Stores a region's feud as mutual 'feud' relations (D-70): every ordered pair of the distinct ids, so
 * later systems (Phase 52.4 World Events) find the feud from either side. Fewer than
 * FEUD_FAMILIES_MIN distinct families store nothing. Idempotent through createRelations.
 */
export function storeFeud(ctx: any, familyIds: readonly bigint[]): void {
  const ids = [...new Set(familyIds)];
  if (ids.length < DENSITY_RULES.FEUD_FAMILIES_MIN) return;
  for (const id of ids) {
    createRelations(
      ctx,
      id,
      ids.filter((other) => other !== id).map((other) => ({ otherFamilyId: other, kind: FAMILY_FEUD_KIND })),
    );
  }
}

/**
 * The family histories one NPC conversation in a region is given (D-68; read-only): the region's
 * families with a non-empty history, never a 'quest:' family; those with a creature pool at the
 * place first, then those in a feud, then the rest, each group by id; at most
 * NPC_FAMILY_HISTORIES_MAX. Plan 30 feeds it to the NPC prompt.
 */
export function regionFamilyHistories(ctx: any, regionId: bigint, locationId: bigint): { name: string; history: string }[] {
  const pooledHere = new Set<bigint>();
  for (const pool of ctx.db.place_pool.by_location.filter(locationId)) {
    if (pool.kind === 'creature') pooledHere.add(pool.refId);
  }
  const families = [...ctx.db.creature_family.by_region.filter(regionId)].filter(
    (family: any) =>
      !String(family.key ?? '').startsWith('quest:') && String(family.history ?? '').trim() !== '',
  );
  const inFeud = (family: any): boolean =>
    [...ctx.db.family_relation.by_family.filter(family.id)].some((row: any) => row.kind === FAMILY_FEUD_KIND);
  const rank = (family: any): number => (pooledHere.has(family.id) ? 0 : inFeud(family) ? 1 : 2);
  const ranked = families.map((family: any) => ({ family, rank: rank(family) }));
  ranked.sort((a, b) => a.rank - b.rank || byId(a.family, b.family));
  return ranked
    .slice(0, DENSITY_RULES.NPC_FAMILY_HISTORIES_MAX)
    .map(({ family }) => ({ name: String(family.name), history: String(family.history).trim() }));
}
