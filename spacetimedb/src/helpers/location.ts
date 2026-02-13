import { SenderError } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import { findItemTemplateByName } from './items';

export const DAY_DURATION_MICROS = 1_200_000_000n;
export const NIGHT_DURATION_MICROS = 600_000_000n;
export const DEFAULT_LOCATION_SPAWNS = 3;
export const RESOURCE_NODES_PER_LOCATION = 3;
export const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;
export const RESOURCE_RESPAWN_MICROS = 10n * 60n * 1_000_000n;

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
  return ctx.db.worldState.id.find(1n);
}

export function isNightTime(ctx: any) {
  const world = getWorldState(ctx);
  return world?.isNight ?? false;
}

export function connectLocations(ctx: any, fromId: bigint, toId: bigint) {
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
}

export function areLocationsConnected(ctx: any, fromId: bigint, toId: bigint) {
  for (const row of ctx.db.locationConnection.by_from.filter(fromId)) {
    if (row.toLocationId === toId) return true;
  }
  return false;
}

export function findEnemyTemplateByName(ctx: any, name: string) {
  for (const row of ctx.db.enemyTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
}

export function getGatherableResourceTemplates(ctx: any, terrainType: string, timePref?: string) {
  const pools: Record<
    string,
    { name: string; weight: bigint; timeOfDay: string }[]
  > = {
    mountains: [
      { name: 'Copper Ore', weight: 3n, timeOfDay: 'any' },
      { name: 'Stone', weight: 5n, timeOfDay: 'any' },
      { name: 'Sand', weight: 3n, timeOfDay: 'day' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
    ],
    woods: [
      { name: 'Wood', weight: 5n, timeOfDay: 'any' },
      { name: 'Resin', weight: 3n, timeOfDay: 'night' },
      { name: 'Dry Grass', weight: 3n, timeOfDay: 'day' },
      { name: 'Bitter Herbs', weight: 2n, timeOfDay: 'night' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
      { name: 'Wild Berries', weight: 3n, timeOfDay: 'any' },
    ],
    plains: [
      { name: 'Flax', weight: 4n, timeOfDay: 'day' },
      { name: 'Herbs', weight: 3n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'day' },
      { name: 'Salt', weight: 2n, timeOfDay: 'any' },
      { name: 'Wild Berries', weight: 2n, timeOfDay: 'day' },
      { name: 'Root Vegetable', weight: 3n, timeOfDay: 'any' },
    ],
    swamp: [
      { name: 'Peat', weight: 4n, timeOfDay: 'any' },
      { name: 'Mushrooms', weight: 3n, timeOfDay: 'night' },
      { name: 'Murky Water', weight: 3n, timeOfDay: 'any' },
      { name: 'Bitter Herbs', weight: 2n, timeOfDay: 'night' },
    ],
    dungeon: [
      { name: 'Iron Shard', weight: 3n, timeOfDay: 'any' },
      { name: 'Ancient Dust', weight: 3n, timeOfDay: 'any' },
      { name: 'Stone', weight: 2n, timeOfDay: 'any' },
    ],
    town: [
      { name: 'Scrap Cloth', weight: 3n, timeOfDay: 'any' },
      { name: 'Lamp Oil', weight: 2n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
    ],
    city: [
      { name: 'Scrap Cloth', weight: 3n, timeOfDay: 'any' },
      { name: 'Lamp Oil', weight: 2n, timeOfDay: 'any' },
      { name: 'Clear Water', weight: 2n, timeOfDay: 'any' },
    ],
  };
  const key = (terrainType ?? '').trim().toLowerCase();
  const entries = pools[key] ?? pools.plains;
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
  return resolved;
}
export function spawnResourceNode(ctx: any, locationId: bigint): any {
  const location = ctx.db.location.id.find(locationId);
  if (!location) throw new SenderError('Location not found');
  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', timePref);
  if (pool.length === 0) throw new SenderError('No resource templates for location');
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0n);
  let roll = (ctx.timestamp.microsSinceUnixEpoch + locationId) % totalWeight;
  let chosen = pool[0];
  for (const entry of pool) {
    if (roll < entry.weight) {
      chosen = entry;
      break;
    }
    roll -= entry.weight;
  }
  const quantitySeed = ctx.timestamp.microsSinceUnixEpoch + chosen.template.id + locationId;
  const minQty = 2n;
  const maxQty = 6n;
  const qtyRange = maxQty - minQty + 1n;
  const quantity = minQty + (quantitySeed % qtyRange);
  return ctx.db.resourceNode.insert({
    id: 0n,
    locationId,
    itemTemplateId: chosen.template.id,
    name: chosen.template.name,
    timeOfDay: chosen.timeOfDay ?? 'any',
    quantity,
    state: 'available',
    lockedByCharacterId: undefined,
    respawnAtMicros: undefined,
  });
}

export function ensureResourceNodesForLocation(ctx: any, locationId: bigint) {
  let count = 0;
  for (const _row of ctx.db.resourceNode.by_location.filter(locationId)) {
    count += 1;
  }
  while (count < RESOURCE_NODES_PER_LOCATION) {
    spawnResourceNode(ctx, locationId);
    count += 1;
  }
}

export function respawnResourceNodesForLocation(ctx: any, locationId: bigint) {
  for (const row of ctx.db.resourceNode.by_location.filter(locationId)) {
    ctx.db.resourceNode.id.delete(row.id);
  }
  let count = 0;
  for (const _row of ctx.db.resourceNode.by_location.filter(locationId)) {
    count += 1;
  }
  while (count < RESOURCE_NODES_PER_LOCATION) {
    spawnResourceNode(ctx, locationId);
    count += 1;
  }
}

export function getEnemyRoleTemplates(ctx: any, templateId: bigint) {
  return [...ctx.db.enemyRoleTemplate.by_template.filter(templateId)];
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
    ctx.db.enemySpawnMember.insert({
      id: 0n,
      spawnId,
      enemyTemplateId: templateId,
      roleTemplateId: role.id,
    });
  }
}

export function refreshSpawnGroupCount(ctx: any, spawnId: bigint) {
  let count = 0n;
  for (const _row of ctx.db.enemySpawnMember.by_spawn.filter(spawnId)) {
    count += 1n;
  }
  const spawn = ctx.db.enemySpawn.id.find(spawnId);
  if (spawn) {
    ctx.db.enemySpawn.id.update({ ...spawn, groupCount: count });
  }
  return count;
}

