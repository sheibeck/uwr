import { SenderError } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import { findItemTemplateByName } from './items';
import { regionalGatherEntries } from './regional_gather';
import { EnemySpawn } from '../schema/tables';
import { placeSpawnLevel } from '../data/enemy_rules';
import { MATERIAL_DEFS, CRAFTING_MODIFIER_DEFS, CRAFTING_MODIFIER_WEIGHT_MULTIPLIER } from '../data/crafting_rules';

// One full day is an hour: 40 minutes of day, then 20 of night (owner, 2026-10-08).
export const DAY_DURATION_MICROS = 2_400_000_000n;
export const NIGHT_DURATION_MICROS = 1_200_000_000n;
export const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;

export function computeLocationTargetLevel(ctx: any, locationId: bigint, baseLevel: bigint) {
  const location = ctx.db.location.id.find(locationId);
  if (!location) return baseLevel;
  const region = ctx.db.region.id.find(location.regionId);
  const multiplier = region?.dangerMultiplier ?? 100n;
  const scaled = (baseLevel * multiplier) / 100n;
  const offset = location.levelOffset ?? 0n;
  const result = scaled + offset;
  return result > 1n ? result : 1n;
}

export function getWorldState(ctx: any) {
  return ctx.db.world_state.id.find(1n);
}

export function isNightTime(ctx: any) {
  const world = getWorldState(ctx);
  return world?.isNight ?? false;
}

export function connectLocations(ctx: any, fromId: bigint, toId: bigint) {
  ctx.db.location_connection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  ctx.db.location_connection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
}

export function areLocationsConnected(ctx: any, fromId: bigint, toId: bigint) {
  for (const row of ctx.db.location_connection.by_from.filter(fromId)) {
    if (row.toLocationId === toId) return true;
  }
  return false;
}

export function findEnemyTemplateByName(ctx: any, name: string) {
  for (const row of ctx.db.enemy_template.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
}

export function getGatherableResourceTemplates(ctx: any, terrainType: string, timePref?: string, zoneTier: number = 3, regionId?: bigint) {
  const pools: Record<
    string,
    { name: string; weight: bigint; timeOfDay: string }[]
  > = {
    mountains: [
      { name: 'Stone', weight: 25n, timeOfDay: 'any' },
      { name: 'Sand', weight: 15n, timeOfDay: 'day' },
      { name: 'Clear Water', weight: 10n, timeOfDay: 'any' },
    ],
    woods: [
      { name: 'Wood', weight: 25n, timeOfDay: 'any' },
      { name: 'Resin', weight: 15n, timeOfDay: 'night' },
      { name: 'Dry Grass', weight: 15n, timeOfDay: 'day' },
      { name: 'Bitter Herbs', weight: 10n, timeOfDay: 'night' },
      { name: 'Clear Water', weight: 10n, timeOfDay: 'any' },
      { name: 'Wild Berries', weight: 15n, timeOfDay: 'any' },
    ],
    plains: [
      { name: 'Flax', weight: 20n, timeOfDay: 'day' },
      { name: 'Herbs', weight: 15n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 10n, timeOfDay: 'day' },
      { name: 'Salt', weight: 10n, timeOfDay: 'any' },
      { name: 'Wild Berries', weight: 10n, timeOfDay: 'day' },
      { name: 'Root Vegetable', weight: 15n, timeOfDay: 'any' },
    ],
    swamp: [
      { name: 'Peat', weight: 20n, timeOfDay: 'any' },
      { name: 'Mushrooms', weight: 15n, timeOfDay: 'night' },
      { name: 'Murky Water', weight: 15n, timeOfDay: 'any' },
      { name: 'Bitter Herbs', weight: 10n, timeOfDay: 'night' },
    ],
    dungeon: [
      { name: 'Iron Shard', weight: 15n, timeOfDay: 'any' },
      { name: 'Ancient Dust', weight: 15n, timeOfDay: 'any' },
      { name: 'Stone', weight: 10n, timeOfDay: 'any' },
    ],
    town: [
      { name: 'Scrap Cloth', weight: 15n, timeOfDay: 'any' },
      { name: 'Lamp Oil', weight: 10n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 10n, timeOfDay: 'any' },
    ],
    city: [
      { name: 'Scrap Cloth', weight: 15n, timeOfDay: 'any' },
      { name: 'Lamp Oil', weight: 10n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 10n, timeOfDay: 'any' },
    ],
  };
  const key = (terrainType ?? '').trim().toLowerCase();
  const baseEntries = pools[key] ?? pools.plains;
  // Inject gatherable crafting materials from MATERIAL_DEFS, filtered by zoneTier
  const materialEntries: { name: string; weight: bigint; timeOfDay: string }[] = [];
  for (const mat of MATERIAL_DEFS) {
    if (!mat.gatherEntries) continue;
    if (Number(mat.tier) > zoneTier) continue;  // tier-gate: skip materials above zone tier
    for (const entry of mat.gatherEntries) {
      if (entry.terrain === key) {
        materialEntries.push({ name: mat.name, weight: entry.weight, timeOfDay: entry.timeOfDay });
      }
    }
  }
  // Inject modifier reagents (Glowing Stone, Wisdom Herb, etc.) — weight 1n makes them rare vs regular materials
  const modifierEntries: { name: string; weight: bigint; timeOfDay: string }[] = [];
  for (const mod of CRAFTING_MODIFIER_DEFS) {
    for (const entry of mod.gatherEntries) {
      if (entry.terrain === key) {
        modifierEntries.push({
          name: mod.name,
          weight: BigInt(
            Math.max(
              1,
              Math.floor(Number(entry.weight) * CRAFTING_MODIFIER_WEIGHT_MULTIPLIER)
            )
          ),
          timeOfDay: entry.timeOfDay
        });

      }
    }
  }
  const entries = [...baseEntries, ...materialEntries, ...modifierEntries];
  const pref = (timePref ?? '').trim().toLowerCase();
  const filtered =
    pref && pref !== 'any'
      ? entries.filter(
        (entry) => entry.timeOfDay === 'any' || entry.timeOfDay === pref
      )
      : entries;
  const pool = filtered.length > 0 ? filtered : entries;
  const resolved = pool
    .map((entry) => {
      const template = findItemTemplateByName(ctx, entry.name);
      return template
        ? { template, weight: entry.weight, timeOfDay: entry.timeOfDay }
        : null;
    })
    .filter(Boolean) as { template: any; weight: bigint; timeOfDay: string }[];
  // Phase 51.3: the region's own AI gatherables join the pool on matching terrain (by template id).
  if (typeof regionId === 'bigint') return [...resolved, ...regionalGatherEntries(ctx, regionId, key, timePref)];
  return resolved;
}
export function getEnemyRoleTemplates(ctx: any, templateId: bigint) {
  return [...ctx.db.enemy_role_template.by_template.filter(templateId)];
}

export function pickRoleTemplate(
  ctx: any,
  templateId: bigint,
  seed: bigint
): any | null {
  const roles = getEnemyRoleTemplates(ctx, templateId);
  if (roles.length === 0) return null;
  const index = Number(seed % BigInt(roles.length));
  return roles[index];
}

export function seedSpawnMembers(
  ctx: any,
  spawnId: bigint,
  templateId: bigint,
  count: bigint,
  seed: bigint
) {
  const total = Number(count);
  for (let i = 0; i < total; i += 1) {
    const role = pickRoleTemplate(ctx, templateId, seed + BigInt(i) * 7n);
    if (!role) continue;
    ctx.db.enemy_spawn_member.insert({
      id: 0n,
      spawnId,
      enemyTemplateId: templateId,
      roleTemplateId: role.id,
    });
  }
}

export function refreshSpawnGroupCount(ctx: any, spawnId: bigint) {
  let count = 0n;
  for (const _row of ctx.db.enemy_spawn_member.by_spawn.filter(spawnId)) {
    count += 1n;
  }
  const spawn = ctx.db.enemy_spawn.id.find(spawnId);
  if (spawn) {
    ctx.db.enemy_spawn.id.update({ ...spawn, groupCount: count });
  }
  return count;
}

export function spawnEnemyWithTemplate(
  ctx: any,
  locationId: bigint,
  templateId: bigint
): typeof EnemySpawn.rowType {
  const locationRow = ctx.db.location.id.find(locationId);
  if (locationRow?.isSafe) throw new SenderError('Cannot spawn enemies in safe zones');

  const template = ctx.db.enemy_template.id.find(templateId);
  if (!template) throw new SenderError('Enemy template not found');
  let allowedHere = false;
  for (const row of ctx.db.location_enemy_template.by_location.filter(locationId)) {
    if (row.enemyTemplateId === templateId) {
      allowedHere = true;
      break;
    }
  }
  if (!allowedHere) throw new SenderError('That creature cannot be tracked here');
  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const pref = (template.timeOfDay ?? '').trim().toLowerCase();
  if (pref && pref !== 'any' && pref !== timePref) {
    throw new SenderError('That creature is not active right now');
  }
  // D-07 / D-53: named enemies, bosses and quest targets are single individuals, so this spawns exactly
  // one enemy whatever the template's group size says (ordinary creatures come from pools). It fights
  // at today's place-scaled level with no bonus (D-52: Phase 52.5 owns boss difficulty).
  // A boss template is allowed: the old "cannot be tracked" refusal left with start_tracked_combat (Plan 27).
  const seed = ctx.timestamp.microsSinceUnixEpoch + locationId + template.id;
  // A tracked or quest-named spawn obeys the same place band as any other spawn.
  const spawnLevel = placeSpawnLevel(
    template.level,
    computeLocationTargetLevel(ctx, locationId, 1n),
    locationRow?.levelOffset ?? 0n,
  );
  const spawn = ctx.db.enemy_spawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: template.id,
    name: template.name,
    state: 'available',
    lockedCombatId: undefined,
    groupCount: 1n,
    level: spawnLevel,
  });
  const role = pickRoleTemplate(ctx, template.id, seed + template.id * 11n);
  if (role) {
    ctx.db.enemy_spawn_member.insert({
      id: 0n,
      spawnId: spawn.id,
      enemyTemplateId: template.id,
      roleTemplateId: role.id,
    });
  }
  refreshSpawnGroupCount(ctx, spawn.id);
  return ctx.db.enemy_spawn.id.find(spawn.id)!;
}

