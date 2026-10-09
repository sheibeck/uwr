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
//      unlocked resource nodes (D-01). Event, engaged, pulling and harvesting rows finish normally;
//   7. (version 2, Plan 25) the region's 51.3 per-type economy rows move to families: each member's
//      economy_item rows are tagged with its family, and members with no loot table get one from the
//      family's drop and trophy (D-47, D-49), built locally with no job.
// Every step is find-or-create on a natural key, so a rerun, a crash mid-way or an overlapping tick
// changes nothing. No LLM job is enqueued anywhere here (no paid call), and the database is never
// cleared. Deterministic: "now" is passed in.

import { ScheduleAt } from 'spacetimedb';
import { DENSITY_RULES } from '../data/density_rules';
import { aiLootTable } from '../data/economy_rules';
import { GATHER_SLOTS } from '../data/economy_design_rules';
import { planRestockBatch } from '../data/vendor_stock';
import { redactSecrets } from './measurement';
import { poolState, updatePoolState } from './pool_tick';
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
 * a world whose pool_state.version is below it is migrated (again) by tick_pools. Version 2 (Plan 25)
 * adds the family economy step (migrateEconomyToFamilies); a version-1 world runs the whole region
 * pass again, which is idempotent for the pool steps.
 */
export const POOL_MIGRATION_VERSION = 2n;

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

  // 7. The 51.3 per-type economy rows move to the families (version 2, Plan 25; D-49). No job.
  migrateEconomyToFamilies(ctx, regionId);
}

// ---------------------------------------------------------------------------
// The 51.3 per-type economy rows move to families (Plan 25; D-47, D-49, T-51.3.1.1-77)
// ---------------------------------------------------------------------------

/** Rank of a gather slot rarity (common, uncommon, rare); anything else sorts last. */
function gatherRank(rarity: unknown): number {
  const i = GATHER_SLOTS.indexOf(String(rarity ?? ''));
  return i === -1 ? GATHER_SLOTS.length : i;
}

/**
 * Moves a region's 51.3 per-type economy rows to its families, with no paid call (no job is
 * enqueued; the loot tables are built locally). For each family of the region (id order):
 *   - every economy_item row of a member template (economy_item.by_enemy) is tagged with the family
 *     (familyId), when it is not yet;
 *   - the family's drop and trophy are those of the lowest-id member template that has both;
 *   - every member with no enemy_loot_entry rows gets its table from aiLootTable: that drop and
 *     trophy, its own 51.3 gear row when it has one (else gearId 0n, no gear entry) and the region's
 *     gatherables (common, uncommon, rare, then id), as the region apply writes them.
 * A family with no economy rows at all is left alone (its members keep the rule fallback loot), and a
 * member that has a loot table keeps it. Idempotent: a second run tags and inserts nothing. Returns
 * how many rows were tagged and how many loot tables were written.
 */
export function migrateEconomyToFamilies(ctx: any, regionId: bigint): { tagged: number; tables: number } {
  const result = { tagged: 0, tables: 0 };
  const families = [...ctx.db.creature_family.by_region.filter(regionId)].sort(byId);
  if (families.length === 0) return result;
  const gatherableIds = [...ctx.db.economy_item.by_region.filter(regionId)]
    .filter((row: any) => row.role === 'gather' && ctx.db.item_template.id.find(row.itemTemplateId))
    .sort((a: any, b: any) => gatherRank(a.rarity) - gatherRank(b.rarity) || ascending(a.itemTemplateId, b.itemTemplateId))
    .map((row: any) => row.itemTemplateId as bigint);

  for (const family of families) {
    const memberIds = [...ctx.db.family_member.by_family.filter(family.id)]
      .map((m: any) => m.enemyTemplateId as bigint)
      .filter((id: bigint) => !!ctx.db.enemy_template.id.find(id))
      .sort(ascending)
      .filter((id: bigint, i: number, all: bigint[]) => all.indexOf(id) === i);
    const rowsOf = new Map<bigint, any[]>();
    for (const id of memberIds) rowsOf.set(id, [...ctx.db.economy_item.by_enemy.filter(id)]);

    for (const id of memberIds) {
      for (const row of rowsOf.get(id) ?? []) {
        if (row.familyId === family.id) continue;
        ctx.db.economy_item.itemTemplateId.update({ ...row, familyId: family.id });
        result.tagged += 1;
      }
    }

    const roleOf = (id: bigint, role: string): any => (rowsOf.get(id) ?? []).find((row: any) => row.role === role);
    const source = memberIds.find((id) => roleOf(id, 'drop') && roleOf(id, 'trophy'));
    if (source === undefined) continue;
    const dropId: bigint = roleOf(source, 'drop').itemTemplateId;
    const trophyId: bigint = roleOf(source, 'trophy').itemTemplateId;
    for (const id of memberIds) {
      if ([...ctx.db.enemy_loot_entry.by_enemy.filter(id)].length > 0) continue;
      const gear = roleOf(id, 'gear');
      for (const entry of aiLootTable(regionId, id, { dropId, trophyId, gearId: gear ? gear.itemTemplateId : 0n, gatherableIds })) {
        ctx.db.enemy_loot_entry.insert({
          id: 0n,
          enemyTemplateId: id,
          regionId,
          itemTemplateId: entry.itemTemplateId,
          role: entry.role,
          weight: entry.weight,
        });
      }
      result.tables += 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// The cursor-batched step inside tick_pools (planRestockBatch pattern)
// ---------------------------------------------------------------------------

/** What one tick_pools run does and how it reschedules (planMigrationStep). */
export interface MigrationStep {
  /** True while pool_state.version is below POOL_MIGRATION_VERSION: the run migrates, no normal tick. */
  migrating: boolean;
  /** The region ids this run migrates (MIGRATION_REGIONS_PER_RUN of them, ascending). */
  batch: bigint[];
  /** Whether regions remain after this batch. */
  more: boolean;
  /** The cursor this run started from (the last region already migrated; 0n = none). */
  afterRegionId: bigint;
  /** When the next tick is due. */
  nextAt: bigint;
  /** The cursor of the next tick (0n once the migration is done or when not migrating). */
  nextAfterRegionId: bigint;
}

/**
 * The plan of one tick_pools run, computed before its one-row reschedule. Below POOL_MIGRATION_VERSION
 * the sorted region ids go through planRestockBatch(ids, cursor, MIGRATION_REGIONS_PER_RUN): the next
 * tick comes MIGRATION_CONTINUE_MICROS later while regions remain, else POOL_TICK_MICROS later with
 * the cursor reset. At the version it is the normal tick (POOL_TICK_MICROS, cursor 0n). If reading the
 * state fails, the run does no work and plans again a tick later from the same cursor, so the chain
 * never breaks.
 */
export function planMigrationStep(
  ctx: any,
  arg: { afterRegionId?: bigint } | undefined,
  now: bigint = ctx.timestamp.microsSinceUnixEpoch,
): MigrationStep {
  const afterRegionId: bigint = arg?.afterRegionId ?? 0n;
  try {
    if (poolState(ctx).version >= POOL_MIGRATION_VERSION) {
      return {
        migrating: false,
        batch: [],
        more: false,
        afterRegionId: 0n,
        nextAt: now + DENSITY_RULES.POOL_TICK_MICROS,
        nextAfterRegionId: 0n,
      };
    }
    const regionIds = [...ctx.db.region.iter()].map((region: any) => region.id as bigint).sort(ascending);
    const plan = planRestockBatch(regionIds, afterRegionId, DENSITY_RULES.MIGRATION_REGIONS_PER_RUN);
    return {
      migrating: true,
      batch: plan.batch,
      more: plan.more,
      afterRegionId,
      nextAt: now + (plan.more ? DENSITY_RULES.MIGRATION_CONTINUE_MICROS : DENSITY_RULES.POOL_TICK_MICROS),
      nextAfterRegionId: plan.nextAfterNpcId,
    };
  } catch (error) {
    console.error(`tick_pools: planning the migration step failed: ${redactSecrets(String(error))}`);
    return {
      migrating: true,
      batch: [],
      more: true,
      afterRegionId,
      nextAt: now + DENSITY_RULES.POOL_TICK_MICROS,
      nextAfterRegionId: afterRegionId,
    };
  }
}

/**
 * Records one failed migration attempt of a region in pool_state (review A WR-02) and returns whether
 * the region has now failed MIGRATION_MAX_ATTEMPTS runs in a row. On that last failure the region id
 * is appended to migrationSkippedRegions (an admin check) and the failure record is cleared.
 */
function recordMigrationFailure(ctx: any, regionId: bigint): boolean {
  const state = poolState(ctx);
  const attempts = (state.migrationFailRegionId === regionId ? state.migrationFailCount ?? 0n : 0n) + 1n;
  if (attempts < DENSITY_RULES.MIGRATION_MAX_ATTEMPTS) {
    updatePoolState(ctx, { migrationFailRegionId: regionId, migrationFailCount: attempts });
    return false;
  }
  const skipped = (state.migrationSkippedRegions ?? '').split(',').filter((id: string) => id !== '');
  if (!skipped.includes(regionId.toString())) skipped.push(regionId.toString());
  updatePoolState(ctx, { migrationFailRegionId: 0n, migrationFailCount: 0n, migrationSkippedRegions: skipped.join(',') });
  return true;
}

/**
 * The migration work of one tick_pools run, after its reschedule (`next` is the row it inserted).
 * Each batch region is migrated in its own try/catch. When one fails, the error is logged and the
 * failure counted in pool_state; the rest of the batch is skipped and `next` is replaced by a row due
 * MIGRATION_CONTINUE_MICROS later whose cursor is the last region that did migrate, so the next run
 * retries the failed one (still one pending row). A region that fails MIGRATION_MAX_ATTEMPTS runs in a
 * row is skipped instead: one more error line says so, its id is recorded in
 * pool_state.migrationSkippedRegions, and the step goes on as if it had migrated, so one bad region
 * never stops the whole tick (review A WR-02). When the batch was the last one and every region
 * succeeded or was skipped, pool_state.version becomes POOL_MIGRATION_VERSION and the normal tick
 * takes over. Returns whether every region succeeded or was skipped.
 */
export function runMigrationStep(ctx: any, step: MigrationStep, next: any, now: bigint): boolean {
  let lastDone = step.afterRegionId;
  for (const regionId of step.batch) {
    try {
      migrateRegion(ctx, regionId, now);
      lastDone = regionId;
      if (poolState(ctx).migrationFailRegionId === regionId) {
        updatePoolState(ctx, { migrationFailRegionId: 0n, migrationFailCount: 0n });
      }
    } catch (error) {
      console.error(`tick_pools: migrating region ${regionId} failed: ${redactSecrets(String(error))}`);
      if (recordMigrationFailure(ctx, regionId)) {
        console.error(
          `tick_pools: region ${regionId} failed ${DENSITY_RULES.MIGRATION_MAX_ATTEMPTS} migration runs in a row; skipped (pool_state.migrationSkippedRegions)`,
        );
        lastDone = regionId;
        continue;
      }
      // A scheduled row is cancelled by deleting it; the retry row takes its place.
      if (next?.scheduledId !== undefined) ctx.db.pool_tick.scheduledId.delete(next.scheduledId);
      ctx.db.pool_tick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(now + DENSITY_RULES.MIGRATION_CONTINUE_MICROS),
        afterRegionId: lastDone,
      });
      return false;
    }
  }
  if (!step.more) updatePoolState(ctx, { version: POOL_MIGRATION_VERSION });
  return true;
}
