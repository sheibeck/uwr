import { SenderError } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';
import {
  DayNightTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
} from '../schema/scheduled_tables';
import { ensureRaces } from '../data/races';
import { ensureFactions } from '../data/faction_data';
import { tableHasRows } from '../helpers/events';
import { ensureResourceItemTemplates, ensureFoodItemTemplates, ensureRecipeTemplates, ensureAbilityTemplates } from './ensure_items';
import { ensureNpcs, ensureQuestTemplates, ensureWorldLayout, ensureEnemyAbilities } from './ensure_world';
import { ensureLootTables, ensureVendorInventory, ensureLocationEnemyTemplates, ensureEnemyTemplatesAndRoles } from './ensure_enemies';
import { ensureSpawnsForLocation, ensureResourceNodesForLocation } from '../helpers/location';

export function ensureHealthRegenScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.healthRegenTick.iter())) {
    ctx.db.healthRegenTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

export function ensureEffectTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.effectTick.iter())) {
    ctx.db.effectTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 10_000_000n),
    });
  }
}

export function ensureHotTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.hotTick.iter())) {
    ctx.db.hotTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

export function ensureCastTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.castTick.iter())) {
    ctx.db.castTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 200_000n),
    });
  }
}

export function ensureDayNightTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.dayNightTick.iter())) {
    const world = getWorldState(ctx);
    const nextAt =
      world?.nextTransitionAtMicros ?? ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS;
    ctx.db.dayNightTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(nextAt),
    });
  }
}

export function ensureSpawnsForLocation(ctx: any, locationId: bigint) {
  const activeGroupKeys = new Set<string>();
  for (const player of ctx.db.player.iter()) {
    if (!player.activeCharacterId) continue;
    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character || character.locationId !== locationId) continue;
    activeGroupKeys.add(effectiveGroupKey(character));
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
    ensureResourceNodesForLocation(ctx, location.id);
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

export function syncAllContent(ctx: any) {
  ensureRaces(ctx);
  ensureFactions(ctx);
  ensureWorldLayout(ctx);
  ensureStarterItemTemplates(ctx);
  ensureResourceItemTemplates(ctx);
  ensureFoodItemTemplates(ctx);
  ensureAbilityTemplates(ctx);
  ensureRecipeTemplates(ctx);
  ensureNpcs(ctx);
  ensureQuestTemplates(ctx);
  ensureEnemyTemplatesAndRoles(ctx);
  ensureEnemyAbilities(ctx);
  ensureLocationEnemyTemplates(ctx);
  ensureLocationRuntimeBootstrap(ctx);
  ensureLootTables(ctx);
  ensureVendorInventory(ctx);
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

