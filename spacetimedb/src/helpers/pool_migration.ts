// pool_migration.ts
// The migration of an existing world to families and pools (Phase 51.3.1.1 Plan 15; SC1, SC7;
// RESEARCH Section 4; D-01, D-07, D-25, D-26, D-53, D-54, D-61, D-63). It runs inside the scheduled
// `tick_pools` (index.ts), one region per run with a cursor on the tick row, until pool_state.version
// reaches POOL_MIGRATION_VERSION. Per region:
//   1. the region's current start location becomes its hub when the region has none (D-61);
//   2. orphan creature pools (their family row is gone) are deleted;
//   3. today's ordinary enemy types are grouped into families by creature type (familiesFromTemplates,
//      createFamily at the region's base level), each family is linked and pooled at every non-safe
//      place where one of its real members was linked (existing placement is kept), and the region's
//      rule families are each other's rivals;
//   4. an AI-invented quest kill or kill_loot target becomes a family of one (D-54);
//   5. every charted place gets resource pools, plus the region's AI gatherables (D-26, D-48);
//   6. standing state is retired: available ordinary spawns (with their members) and available,
//      unlocked resource nodes (D-01). Event, engaged, pulling and harvesting rows finish normally.
// Every step is find-or-create on a natural key, so a rerun, a crash mid-way or an overlapping tick
// changes nothing. No LLM job is enqueued anywhere here (no paid call), and no --clear-database is
// ever needed. Deterministic: "now" is passed in.

import {
  addResourcePoolsForRegion,
  createFamily,
  createRelations,
  familiesFromTemplates,
  familyOfOne,
  isOrdinaryTemplate,
  linkFamilyToLocation,
  regionBaseLevel,
  ruleRelations,
  seedCreaturePools,
  seedResourcePools,
} from './families';
import { findRegionStart } from './world_gen';

/**
 * The data version the migration brings a world to. This is a schema-of-data version, not a tunable:
 * a world whose pool_state.version is below it is migrated (again) by tick_pools. Plan 25 raises it
 * with the family economy step.
 */
export const POOL_MIGRATION_VERSION = 1n;

function byId(a: { id: bigint }, b: { id: bigint }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function ascending(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isUncharted(location: any): boolean {
  return String(location?.terrainType ?? '').trim().toLowerCase() === 'uncharted';
}

/** Whether creature families may live at a place: charted, not safe, not a hub (as families.ts rules). */
function hostsCreatures(location: any): boolean {
  return !!location && !location.isSafe && location.isHub !== true && !isUncharted(location);
}

/** Whether a family is a quest family of one (it keeps its own pool and takes no rule relations). */
function isQuestFamily(family: any): boolean {
  return String(family?.key ?? '').startsWith('quest:');
}

/** Whether a family key is a rule family of this region (familyKey: "<regionId>:<creatureType>"). */
function isRuleFamilyOf(family: any, regionId: bigint): boolean {
  return String(family?.key ?? '').startsWith(`${regionId.toString()}:`);
}

/** The region's places, id order. */
function regionPlaces(ctx: any, regionId: bigint): any[] {
  return [...ctx.db.location.iter()].filter((l: any) => l.regionId === regionId).sort(byId);
}

/**
 * Whether a template is an AI-invented quest kill target (D-54): a kill or kill_loot quest targets
 * it (a quest with no questType reads kill), and it has the invented shape, terrainTypes 'any' and
 * socialGroup 'loner' (helpers/llm_apply.ts). boss_kill targets are never one.
 */
export function isInventedQuestKillTarget(ctx: any, template: any): boolean {
  if (!template) return false;
  if (String(template.terrainTypes ?? '').trim().toLowerCase() !== 'any') return false;
  if (String(template.socialGroup ?? '').trim().toLowerCase() !== 'loner') return false;
  let killTarget = false;
  for (const quest of ctx.db.quest_template.by_enemy.filter(template.id)) {
    const type = String(quest.questType ?? '').trim().toLowerCase() || 'kill';
    if (type === 'boss_kill') return false;
    if (type === 'kill' || type === 'kill_loot') killTarget = true;
  }
  return killTarget;
}

/**
 * The legacy hub (D-61, D-63): when no place of the region is a hub and the region's start location
 * (findRegionStart, where world gen put the vendor and banker) has a vendor or a banker, that place
 * becomes the hub. Only isHub changes: isSafe, craftingAvailable and bindStone stay as they are and
 * no NPC is touched. A region that already has a hub, or whose start location has neither service
 * (a region rolled with no hub), is left alone. Returns whether a hub was marked.
 */
export function markLegacyHub(ctx: any, regionId: bigint): boolean {
  if (regionPlaces(ctx, regionId).some((place) => place.isHub === true)) return false;
  const start = findRegionStart(ctx, regionId);
  if (!start) return false;
  const serves = [...ctx.db.npc.by_location.filter(start.id)].some((npc: any) => {
    const type = String(npc.npcType ?? '').trim().toLowerCase();
    return type === 'vendor' || type === 'banker';
  });
  if (!serves) return false;
  ctx.db.location.id.update({ ...start, isHub: true });
  return true;
}

/**
 * Retires standing state at the given places (D-01, T-51.3.1.1-48):
 *   - an enemy_spawn with state 'available', no event_spawn_enemy link and an ordinary template
 *     (isOrdinaryTemplate: never a boss, a named enemy, a boss_kill target or a World event enemy)
 *     is deleted with its enemy_spawn_member rows;
 *   - a resource_node with state 'available' and no lockedByCharacterId is deleted.
 * Every other row (engaged, pulling, harvesting, event, individual) is left to finish normally.
 * Returns how many rows went.
 */
export function retireStandingState(
  ctx: any,
  locationIds: readonly bigint[],
): { spawns: number; members: number; nodes: number } {
  const result = { spawns: 0, members: 0, nodes: 0 };
  const ordinary = new Map<bigint, boolean>();
  const isOrdinary = (templateId: bigint): boolean => {
    let known = ordinary.get(templateId);
    if (known === undefined) {
      known = isOrdinaryTemplate(ctx, templateId);
      ordinary.set(templateId, known);
    }
    return known;
  };
  for (const locationId of locationIds) {
    for (const spawn of [...ctx.db.enemy_spawn.by_location.filter(locationId)]) {
      if (spawn.state !== 'available') continue;
      if ([...ctx.db.event_spawn_enemy.by_spawn.filter(spawn.id)].length > 0) continue;
      if (!isOrdinary(spawn.enemyTemplateId)) continue;
      for (const member of [...ctx.db.enemy_spawn_member.by_spawn.filter(spawn.id)]) {
        ctx.db.enemy_spawn_member.id.delete(member.id);
        result.members += 1;
      }
      ctx.db.enemy_spawn.id.delete(spawn.id);
      result.spawns += 1;
    }
    for (const node of [...ctx.db.resource_node.by_location.filter(locationId)]) {
      if (node.state !== 'available') continue;
      if (node.lockedByCharacterId !== undefined && node.lockedByCharacterId !== null) continue;
      ctx.db.resource_node.id.delete(node.id);
      result.nodes += 1;
    }
  }
  return result;
}

/** Deletes the creature pools (and their level rows) at these places whose family row is missing. */
function pruneOrphanPools(ctx: any, places: readonly any[]): void {
  for (const place of places) {
    for (const pool of [...ctx.db.place_pool.by_location.filter(place.id)]) {
      if (pool.kind !== 'creature' || ctx.db.creature_family.id.find(pool.refId)) continue;
      ctx.db.place_pool.id.delete(pool.id);
      ctx.db.pool_level.id.delete(pool.id);
    }
  }
}

/**
 * Migrates one region of an existing world to families and pools (see the file header for the steps).
 * Idempotent: a second run inserts, updates and deletes nothing. A missing region is a no-op.
 */
export function migrateRegion(ctx: any, regionId: bigint, now: bigint): void {
  if (!ctx.db.region.id.find(regionId)) return;

  // 1. The hub first, so the start location never hosts a creature pool (D-61).
  markLegacyHub(ctx, regionId);
  const places = regionPlaces(ctx, regionId);
  const hosts = places.filter(hostsCreatures);
  const hostIds = new Set<bigint>(hosts.map((place) => place.id));

  // 2. Orphan creature pools.
  pruneOrphanPools(ctx, places);

  // The region's links: template id -> the region places it is linked to (id order).
  const linksByTemplate = new Map<bigint, bigint[]>();
  for (const place of places) {
    for (const row of [...ctx.db.location_enemy_template.by_location.filter(place.id)]) {
      const ids = linksByTemplate.get(row.enemyTemplateId) ?? [];
      if (!ids.includes(place.id)) ids.push(place.id);
      linksByTemplate.set(row.enemyTemplateId, ids);
    }
  }
  const ordinary = new Map<bigint, boolean>();
  const isOrdinary = (templateId: bigint): boolean => {
    let known = ordinary.get(templateId);
    if (known === undefined) {
      known = isOrdinaryTemplate(ctx, templateId);
      ordinary.set(templateId, known);
    }
    return known;
  };

  // 3. Templates in no family yet: invented quest kill targets apart, the rest grouped by rule.
  const ungrouped: any[] = [];
  const questTargets: { template: any; placeId: bigint }[] = [];
  for (const templateId of [...linksByTemplate.keys()].sort(ascending)) {
    if ([...ctx.db.family_member.by_template.filter(templateId)].length > 0) continue;
    if (!isOrdinary(templateId)) continue;
    const template = ctx.db.enemy_template.id.find(templateId);
    if (!template) continue;
    const linked = linksByTemplate.get(templateId) ?? [];
    if (isInventedQuestKillTarget(ctx, template)) {
      questTargets.push({ template, placeId: linked.find((id) => hostIds.has(id)) ?? linked[0]! });
      continue;
    }
    if (linked.some((id) => hostIds.has(id))) ungrouped.push(template);
  }
  const baseLevel = regionBaseLevel(ctx, regionId);
  for (const def of familiesFromTemplates(ctx, regionId, ungrouped)) createFamily(ctx, regionId, def, baseLevel);

  // The region's rule families are each other's rivals (D-20 default; quest and AI families apart).
  const ruleFamilyIds = [...ctx.db.creature_family.by_region.filter(regionId)]
    .filter((family: any) => isRuleFamilyOf(family, regionId))
    .map((family: any) => family.id as bigint)
    .sort(ascending);
  const relations = ruleRelations(ruleFamilyIds);
  for (const familyId of ruleFamilyIds) {
    createRelations(
      ctx,
      familyId,
      relations.filter((relation) => relation.familyId === familyId),
    );
  }

  // Each non-safe place pools the families of the ordinary templates linked there (placement kept).
  for (const place of hosts) {
    const familyIds: bigint[] = [];
    for (const row of [...ctx.db.location_enemy_template.by_location.filter(place.id)]) {
      if (!isOrdinary(row.enemyTemplateId)) continue;
      for (const member of ctx.db.family_member.by_template.filter(row.enemyTemplateId)) {
        const family = ctx.db.creature_family.id.find(member.familyId);
        if (family && !isQuestFamily(family) && !familyIds.includes(family.id)) familyIds.push(family.id);
      }
    }
    if (familyIds.length === 0) continue;
    familyIds.sort(ascending);
    for (const familyId of familyIds) linkFamilyToLocation(ctx, familyId, place.id);
    seedCreaturePools(ctx, place, familyIds, now);
  }

  // 4. Invented quest kill targets: a family of one each, pooled at (or next to) their place (D-54).
  for (const { template, placeId } of questTargets) familyOfOne(ctx, template, placeId, now);

  // 5. Resource pools at every charted place, then the region's AI gatherables (D-26, D-48).
  for (const place of places) {
    if (!isUncharted(place)) seedResourcePools(ctx, ctx.db.location.id.find(place.id) ?? place, now);
  }
  addResourcePoolsForRegion(ctx, regionId, now);

  // 6. Standing ordinary spawns and personal nodes are retired (D-01).
  retireStandingState(
    ctx,
    places.map((place) => place.id as bigint),
  );
}
