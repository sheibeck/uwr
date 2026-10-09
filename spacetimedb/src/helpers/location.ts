import { SenderError } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import { findItemTemplateByName } from './items';
import { regionalGatherEntries } from './regional_gather';
import { loadEffectiveDials, loadItemPins } from './economy_state';
import { gatherYield, pinPct, scaleWeights } from '../data/economy_rules';
import { GROUP_SIZE_DANGER_BASE, GROUP_SIZE_BIAS_RANGE, GROUP_SIZE_BIAS_MAX } from '../data/combat_constants';
import { EnemySpawn, EnemyTemplate } from '../schema/tables';
import { placeLevelBand, placeSpawnLevel, effectiveEnemyLevel } from '../data/enemy_rules';
import { MATERIAL_DEFS, CRAFTING_MODIFIER_DEFS, CRAFTING_MODIFIER_WEIGHT_MULTIPLIER } from '../data/crafting_rules';

// One full day is an hour: 40 minutes of day, then 20 of night (owner, 2026-10-08).
export const DAY_DURATION_MICROS = 2_400_000_000n;
export const NIGHT_DURATION_MICROS = 1_200_000_000n;
export const DEFAULT_LOCATION_SPAWNS = 3;
export const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;

/** Returns true if the given EnemySpawn was created by a world event (has an EventSpawnEnemy link). */
export function isEventSpawn(ctx: any, spawnId: bigint): boolean {
  return [...ctx.db.event_spawn_enemy.by_spawn.filter(spawnId)].length > 0;
}

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
export function spawnResourceNode(ctx: any, locationId: bigint, characterId?: bigint, seedOffset?: bigint): any {
  const location = ctx.db.location.id.find(locationId);
  if (!location) throw new SenderError('Location not found');
  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const region = ctx.db.region.id.find(location.regionId);
  const dm = region?.dangerMultiplier ?? 100n;
  const zoneTier = dm < 130n ? 1 : dm < 190n ? 2 : 3;
  const rawPool = getGatherableResourceTemplates(ctx, location.terrainType ?? 'plains', timePref, zoneTier, location.regionId);
  if (rawPool.length === 0) throw new SenderError('No resource templates for location');
  // Admin item pins scale each entry's weight exactly (review A WR-04); with no pin the pool is unchanged.
  const pins = loadItemPins(ctx);
  const pinnedWeights = scaleWeights(
    rawPool.map((entry) => entry.weight),
    rawPool.map((entry) => pinPct(pins.get(entry.template.id))),
  );
  const pool = rawPool.map((entry, i) => ({ ...entry, weight: pinnedWeights[i]! })).filter((entry) => entry.weight > 0n);
  // Every entry pinned to 0: no node (callers already accept undefined).
  if (pool.length === 0) return undefined;
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
  // Modifier reagents (Glowing Stone, Clear Crystal, etc.) are rare: cap at 1 per location,
  // quantity always 1. If one already exists at this location, skip spawning another.
  const modifierNames = new Set(CRAFTING_MODIFIER_DEFS.map((m) => m.name));
  const isModifierReagent = modifierNames.has(chosen.template.name);
  if (isModifierReagent) {
    for (const existing of ctx.db.resource_node.by_location.filter(locationId)) {
      if (modifierNames.has(existing.name) && existing.state !== 'depleted') {
        return undefined; // Already one here — enforce 1-per-location cap
      }
    }
  }
  const quantitySeed = ctx.timestamp.microsSinceUnixEpoch + chosen.template.id + locationId + offset;
  const minQty = 2n;
  const maxQty = 6n;
  const qtyRange = maxQty - minQty + 1n;
  // The gather dial (global, or the region's override) applies when the node is found, and the scaled
  // quantity is stored on it (review A WR-06, CONTEXT Area 1: "nodes already found keep their rolls"),
  // so a later dial change never alters a node already found. Modifier reagents stay 1.
  const quantity = isModifierReagent
    ? 1n
    : gatherYield(minQty + (quantitySeed % qtyRange), loadEffectiveDials(ctx, location.regionId).gatherRatePct);
  return ctx.db.resource_node.insert({
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

export function ensureAvailableSpawn(
  ctx: any,
  locationId: bigint,
  targetLevel: bigint = 1n
): typeof EnemySpawn.rowType {
  let best: typeof EnemySpawn.rowType | null = null;
  let bestDiff: bigint | null = null;
  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  for (const spawn of ctx.db.enemy_spawn.by_location.filter(locationId)) {
    if (spawn.state !== 'available') continue;
    if (spawn.groupCount === 0n) continue;
    const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
    if (!template) continue;
    const spawnLevel = effectiveEnemyLevel(spawn.level, template.level);
    const diff =
      spawnLevel > adjustedTarget
        ? spawnLevel - adjustedTarget
        : adjustedTarget - spawnLevel;
    if (!best || bestDiff === null || diff < bestDiff) {
      best = spawn;
      bestDiff = diff;
    }
  }
  const locationRow2 = ctx.db.location.id.find(locationId);
  const offset2 = locationRow2?.levelOffset ?? 0n;
  const maxDiff = offset2 === 0n ? 0n : 1n;
  if (best && bestDiff !== null && bestDiff <= maxDiff) return best;
  return spawnEnemy(ctx, locationId, targetLevel);
}

/**
 * Spawns from before the level column carry level 0 and read as their type's level. Give each
 * available one the level its place calls for (quick 261008-ag8). Engaged spawns and event spawns
 * are left alone. No arrival path calls this since ordinary creatures became pools (Phase 51.3.1.1
 * Plan 08); it stays for the leftover spawns until the Plan 27 cleanup.
 */
export function relevelLegacySpawns(ctx: any, locationId: bigint) {
  const location = ctx.db.location.id.find(locationId);
  if (!location) return;
  const target = computeLocationTargetLevel(ctx, locationId, 1n);
  const offset = location.levelOffset ?? 0n;
  for (const spawn of [...ctx.db.enemy_spawn.by_location.filter(locationId)]) {
    if (spawn.state !== 'available') continue;
    if (spawn.level !== undefined && spawn.level > 0n) continue;
    if (isEventSpawn(ctx, spawn.id)) continue;
    const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
    if (!template) continue;
    ctx.db.enemy_spawn.id.update({
      ...spawn,
      level: placeSpawnLevel(template.level, target, offset),
    });
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

  const templates = [...ctx.db.location_enemy_template.by_location.filter(locationId)];
  if (templates.length === 0) throw new SenderError('No enemy templates for location');

  const timePref = isNightTime(ctx) ? 'night' : 'day';
  const allCandidates = templates
    .map((ref) => ctx.db.enemy_template.id.find(ref.enemyTemplateId))
    .filter(Boolean) as (typeof EnemyTemplate.rowType)[];
  const timeFiltered = allCandidates.filter((template) => {
    const pref = (template.timeOfDay ?? '').trim().toLowerCase();
    if (!pref || pref === 'any') return true;
    return pref === timePref;
  });
  const candidates = timeFiltered.length > 0 ? timeFiltered : allCandidates;
  if (candidates.length === 0) throw new SenderError('Enemy template missing');

  const adjustedTarget = computeLocationTargetLevel(ctx, locationId, targetLevel);
  const offset = locationRow?.levelOffset ?? 0n;
  const { min: minLevel, max: maxLevel } = placeLevelBand(adjustedTarget, offset);
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

  // A type that fits the place keeps its level; otherwise the spawn takes the place's target level.
  const spawnLevel = placeSpawnLevel(chosen.level, adjustedTarget, offset);
  let firstSpawn: typeof EnemySpawn.rowType | null = null;
  const total = Number(groupCount);
  for (let i = 0; i < total; i += 1) {
    const spawn = ctx.db.enemy_spawn.insert({
      id: 0n,
      locationId,
      enemyTemplateId: chosen.id,
      name: chosen.name,
      state: 'available',
      lockedCombatId: undefined,
      groupCount: 1n,
      level: spawnLevel,
    });
    const role = pickRoleTemplate(ctx, chosen.id, groupSeed + BigInt(i) * 7n);
    if (role) {
      ctx.db.enemy_spawn_member.insert({
        id: 0n,
        spawnId: spawn.id,
        enemyTemplateId: chosen.id,
        roleTemplateId: role.id,
      });
    }
    refreshSpawnGroupCount(ctx, spawn.id);
    if (firstSpawn === null) {
      firstSpawn = ctx.db.enemy_spawn.id.find(spawn.id)!;
    }
  }
  return firstSpawn!;
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
  if (template.isBoss) throw new SenderError('Named enemies cannot be tracked');
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

