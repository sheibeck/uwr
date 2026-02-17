import { SenderError } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import { findItemTemplateByName } from './items';
import { GROUP_SIZE_DANGER_BASE, GROUP_SIZE_BIAS_RANGE, GROUP_SIZE_BIAS_MAX } from '../data/combat_constants';
import { EnemySpawn, EnemyTemplate } from '../schema/tables';

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
export function spawnResourceNode(ctx: any, locationId: bigint, characterId?: bigint, seedOffset?: bigint): any {
  const location = ctx.db.location.id.find(locationId);
  if (!location) throw new SenderError('Location not found');
  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const pool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', timePref);
  if (pool.length === 0) throw new SenderError('No resource templates for location');
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0n);
  const offset = seedOffset ?? 0n;
  let roll = (ctx.timestamp.microsSinceUnixEpoch + locationId + offset) % totalWeight;
  let chosen = pool[0];
  for (const entry of pool) {
    if (roll < entry.weight) {
      chosen = entry;
      break;
    }
    roll -= entry.weight;
  }
  const quantitySeed = ctx.timestamp.microsSinceUnixEpoch + chosen.template.id + locationId + offset;
  const minQty = 2n;
  const maxQty = 6n;
  const qtyRange = maxQty - minQty + 1n;
  const quantity = minQty + (quantitySeed % qtyRange);
  return ctx.db.resourceNode.insert({
    id: 0n,
    locationId,
    characterId: characterId ?? undefined,
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

export function ensureAvailableSpawn(
  ctx: any,
  locationId: bigint,
  targetLevel: bigint = 1n
): typeof EnemySpawn.rowType {
  let best: typeof EnemySpawn.rowType | null = null;
  let bestDiff: bigint | null = null;
  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  for (const spawn of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (spawn.state !== 'available') continue;
    if (spawn.groupCount === 0n) continue;
    const template = ctx.db.enemyTemplate.id.find(spawn.enemyTemplateId);
    if (!template) continue;
    const diff =
      template.level > adjustedTarget
        ? template.level - adjustedTarget
        : adjustedTarget - template.level;
    if (!best || bestDiff === null || diff < bestDiff) {
      best = spawn;
      bestDiff = diff;
    }
  }
  if (best && bestDiff !== null && bestDiff <= 1n) return best;
  return spawnEnemy(ctx, locationId, targetLevel);
}

export function ensureSpawnsForLocation(ctx: any, locationId: bigint) {
  const location = ctx.db.location.id.find(locationId);
  if (!location || location.isSafe) return;

  const activeGroupKeys = new Set<string>();
  for (const player of ctx.db.player.iter()) {
    if (!player.activeCharacterId) continue;
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character || character.locationId !== locationId) continue;
    const groupKey = character.groupId ? character.groupId.toString() : `solo_${character.id.toString()}`;
    activeGroupKeys.add(groupKey);
  }
  const needed = activeGroupKeys.size;
  let available = 0;
  for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (row.state === 'available') available += 1;
  }
  while (available < needed) {
    const availableTemplates: bigint[] = [];
    for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
      if (row.state !== 'available') continue;
      availableTemplates.push(row.enemyTemplateId);
    }
    spawnEnemy(ctx, locationId, 1n, availableTemplates);
    available += 1;
  }
}

export function ensureLocationRuntimeBootstrap(ctx: any) {
  for (const location of ctx.db.location.iter()) {
    // Skip enemy spawns for safe zones and clean up any existing spawns
    if (location.isSafe) {
      for (const spawn of ctx.db.enemySpawn.by_location.filter(location.id)) {
        for (const member of ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)) {
          ctx.db.enemySpawnMember.id.delete(member.id);
        }
        ctx.db.enemySpawn.id.delete(spawn.id);
      }
      continue;
    }

    let count = 0;
    for (const _row of ctx.db.enemySpawn.by_location.filter(location.id)) {
      count += 1;
    }
    while (count < DEFAULT_LOCATION_SPAWNS) {
      const existingTemplates: bigint[] = [];
      for (const row of ctx.db.enemySpawn.by_location.filter(location.id)) {
        existingTemplates.push(row.enemyTemplateId);
      }
      spawnEnemy(ctx, location.id, 1n, existingTemplates);
      count += 1;
    }
  }
}

export function respawnLocationSpawns(ctx: any, locationId: bigint, desired: number) {
  for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    if (row.state === 'available') {
      for (const member of ctx.db.enemySpawnMember.by_spawn.filter(row.id)) {
        ctx.db.enemySpawnMember.id.delete(member.id);
      }
      ctx.db.enemySpawn.id.delete(row.id);
    }
  }
  let count = 0;
  for (const _row of ctx.db.enemySpawn.by_location.filter(locationId)) {
    count += 1;
  }
  while (count < desired) {
    const existingTemplates: bigint[] = [];
    for (const row of ctx.db.enemySpawn.by_location.filter(locationId)) {
      existingTemplates.push(row.enemyTemplateId);
    }
    spawnEnemy(ctx, locationId, 1n, existingTemplates);
    count += 1;
  }
}

export function spawnEnemy(
  ctx: any,
  locationId: bigint,
  targetLevel: bigint = 1n,
  avoidTemplateIds: bigint[] = []
): typeof EnemySpawn.rowType {
  const locationRow = ctx.db.location.id.find(locationId);
  if (locationRow?.isSafe) throw new SenderError('Cannot spawn enemies in safe zones');

  const templates = [...ctx.db.locationEnemyTemplate.by_location.filter(locationId)];
  if (templates.length === 0) throw new SenderError('No enemy templates for location');

  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const allCandidates = templates
    .map((ref) => ctx.db.enemyTemplate.id.find(ref.enemyTemplateId))
    .filter(Boolean) as (typeof EnemyTemplate.rowType)[];
  const timeFiltered = allCandidates.filter((template) => {
    const pref = (template.timeOfDay ?? '').trim().toLowerCase();
    if (!pref || pref === 'any') return true;
    return pref === timePref;
  });
  const candidates = timeFiltered.length > 0 ? timeFiltered : allCandidates;
  if (candidates.length === 0) throw new SenderError('Enemy template missing');

  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  const minLevel = adjustedTarget > 1n ? adjustedTarget - 1n : 1n;
  const maxLevel = adjustedTarget + 1n;
  const filteredByLevel = candidates.filter(
    (candidate) => candidate.level >= minLevel && candidate.level <= maxLevel
  );
  const viable = filteredByLevel.length > 0 ? filteredByLevel : candidates;
  const avoidSet = new Set(avoidTemplateIds.map((id) => id.toString()));
  const nonAvoid = viable.filter((candidate) => !avoidSet.has(candidate.id.toString()));
  const pool = nonAvoid.length > 0 ? nonAvoid : viable;

  const diffFor = (candidate: typeof EnemyTemplate.rowType) =>
    candidate.level > adjustedTarget
      ? candidate.level - adjustedTarget
      : adjustedTarget - candidate.level;
  const weighted: { candidate: typeof EnemyTemplate.rowType; weight: bigint }[] = [];
  let totalWeight = 0n;
  for (const candidate of pool) {
    const diff = diffFor(candidate);
    const weight = 4n - (diff > 3n ? 3n : diff);
    const finalWeight = weight > 0n ? weight : 1n;
    weighted.push({ candidate, weight: finalWeight });
    totalWeight += finalWeight;
  }
  const seed =
    ctx.timestamp.microsSinceUnixEpoch + locationId + BigInt(pool.length) + BigInt(totalWeight);
  let roll = totalWeight > 0n ? seed % totalWeight : 0n;
  let chosen = weighted[0]?.candidate ?? pool[0];
  for (const entry of weighted) {
    if (roll < entry.weight) {
      chosen = entry.candidate;
      break;
    }
    roll -= entry.weight;
  }

  const minGroup = chosen.groupMin && chosen.groupMin > 0n ? chosen.groupMin : 1n;
  const maxGroup = chosen.groupMax && chosen.groupMax > 0n ? chosen.groupMax : minGroup;
  const groupSeed = seed + chosen.id * 11n;
  let groupCount = minGroup;
  if (maxGroup > minGroup) {
    const location = ctx.db.location.id.find(locationId);
    const region = location ? ctx.db.region.id.find(location.regionId) : undefined;
    const danger = region?.dangerMultiplier ?? GROUP_SIZE_DANGER_BASE;
    const delta = danger > GROUP_SIZE_DANGER_BASE ? danger - GROUP_SIZE_DANGER_BASE : 0n;
    const rawBias =
      Number(delta) / Math.max(1, Number(GROUP_SIZE_BIAS_RANGE));
    const bias = Math.max(0, Math.min(GROUP_SIZE_BIAS_MAX, rawBias));
    const biasScaled = Math.round(bias * 1000);
    const invBias = 1000 - biasScaled;
    const sizeCount = Number(maxGroup - minGroup + 1n);
    let totalWeight = 0;
    const weights: number[] = [];
    for (let i = 0; i < sizeCount; i += 1) {
      const lowWeight = sizeCount - i;
      const highWeight = i + 1;
      const weight = invBias * lowWeight + biasScaled * highWeight;
      weights.push(weight);
      totalWeight += weight;
    }
    let roll = groupSeed % BigInt(totalWeight);
    for (let i = 0; i < weights.length; i += 1) {
      const weight = BigInt(weights[i]);
      if (roll < weight) {
        groupCount = minGroup + BigInt(i);
        break;
      }
      roll -= weight;
    }
  }

  const spawn = ctx.db.enemySpawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: chosen.id,
    name: chosen.name,
    state: 'available',
    lockedCombatId: undefined,
    groupCount,
  });

  seedSpawnMembers(ctx, spawn.id, chosen.id, groupCount, groupSeed);
  refreshSpawnGroupCount(ctx, spawn.id);

  ctx.db.enemySpawn.id.update({
    ...spawn,
    name: `${chosen.name}`,
  });
  return ctx.db.enemySpawn.id.find(spawn.id)!;
}

export function spawnEnemyWithTemplate(
  ctx: any,
  locationId: bigint,
  templateId: bigint
): typeof EnemySpawn.rowType {
  const locationRow = ctx.db.location.id.find(locationId);
  if (locationRow?.isSafe) throw new SenderError('Cannot spawn enemies in safe zones');

  const template = ctx.db.enemyTemplate.id.find(templateId);
  if (!template) throw new SenderError('Enemy template not found');
  let allowedHere = false;
  for (const row of ctx.db.locationEnemyTemplate.by_location.filter(locationId)) {
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
  const seed = ctx.timestamp.microsSinceUnixEpoch + locationId + template.id;
  const minGroup = template.groupMin && template.groupMin > 0n ? template.groupMin : 1n;
  const maxGroup = template.groupMax && template.groupMax > 0n ? template.groupMax : minGroup;
  const groupSeed = seed + template.id * 11n;
  let groupCount = minGroup;
  if (maxGroup > minGroup) {
    const location = ctx.db.location.id.find(locationId);
    const region = location ? ctx.db.region.id.find(location.regionId) : undefined;
    const danger = region?.dangerMultiplier ?? GROUP_SIZE_DANGER_BASE;
    const delta = danger > GROUP_SIZE_DANGER_BASE ? danger - GROUP_SIZE_DANGER_BASE : 0n;
    const rawBias = Number(delta) / Math.max(1, Number(GROUP_SIZE_BIAS_RANGE));
    const bias = Math.max(0, Math.min(GROUP_SIZE_BIAS_MAX, rawBias));
    const biasScaled = Math.round(bias * 1000);
    const invBias = 1000 - biasScaled;
    const sizeCount = Number(maxGroup - minGroup + 1n);
    let totalWeight = 0;
    const weights: number[] = [];
    for (let i = 0; i < sizeCount; i += 1) {
      const lowWeight = sizeCount - i;
      const highWeight = i + 1;
      const weight = invBias * lowWeight + biasScaled * highWeight;
      weights.push(weight);
      totalWeight += weight;
    }
    let roll = groupSeed % BigInt(totalWeight);
    for (let i = 0; i < weights.length; i += 1) {
      const weight = BigInt(weights[i]);
      if (roll < weight) {
        groupCount = minGroup + BigInt(i);
        break;
      }
      roll -= weight;
    }
  }
  const spawn = ctx.db.enemySpawn.insert({
    id: 0n,
    locationId,
    enemyTemplateId: template.id,
    name: template.name,
    state: 'available',
    lockedCombatId: undefined,
    groupCount,
  });
  seedSpawnMembers(ctx, spawn.id, template.id, groupCount, groupSeed);
  refreshSpawnGroupCount(ctx, spawn.id);
  ctx.db.enemySpawn.id.update({ ...spawn, name: `${template.name}` });
  return ctx.db.enemySpawn.id.find(spawn.id)!;
}

