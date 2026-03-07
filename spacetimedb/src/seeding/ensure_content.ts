import { ScheduleAt } from 'spacetimedb';
import {
  DayNightTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  InactivityTick,
  LlmCleanupTick,
} from '../schema/scheduled_tables';
import { ensureRaces } from '../data/races';
import { ensureFactions } from '../data/faction_data';
import { tableHasRows } from '../helpers/events';
import {
  ensureStarterItemTemplates,
  ensureWorldDropGearTemplates,
  ensureWorldDropJewelryTemplates,
  ensureBossDropTemplates,
  ensureResourceItemTemplates,
  ensureFoodItemTemplates,
  ensureRecipeTemplates,
  ensureGearMaterialItemTemplates,
  ensureCraftingBaseGearTemplates,
  ensureGearRecipeTemplates,
  ensureRecipeScrollItemTemplates,
  ensureCraftingModifierItemTemplates,
} from './ensure_items';
// Quest templates and dialogue options removed — world content is now procedurally generated
import { ensureLootTables, ensureMaterialLootEntries } from './ensure_enemies';
import {
  DAY_DURATION_MICROS,
  getWorldState,
  ensureSpawnsForLocation,
  respawnLocationSpawns
} from '../helpers/location';

export function ensureHealthRegenScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.health_regen_tick.iter())) {
    ctx.db.health_regen_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

export function ensureEffectTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.effect_tick.iter())) {
    ctx.db.effect_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 10_000_000n),
    });
  }
}

export function ensureHotTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.hot_tick.iter())) {
    ctx.db.hot_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 3_000_000n),
    });
  }
}

export function ensureCastTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.cast_tick.iter())) {
    ctx.db.cast_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 200_000n),
    });
  }
}

export function ensureDayNightTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.day_night_tick.iter())) {
    const world = getWorldState(ctx);
    const nextAt =
      world?.nextTransitionAtMicros ?? ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS;
    ctx.db.day_night_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(nextAt),
    });
  }
}

export function ensureInactivityTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.inactivity_tick.iter())) {
    ctx.db.inactivity_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 300_000_000n),
    });
  }
}

export function ensureLlmCleanupScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.llm_cleanup_tick.iter())) {
    ctx.db.llm_cleanup_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 300_000_000n),
    });
  }
}

export function syncAllContent(ctx: any) {
  ensureRaces(ctx);
  ensureFactions(ctx);
  ensureWorldState(ctx);
  // Game mechanics seeding (items, recipes, abilities — not geography)
  ensureStarterItemTemplates(ctx);
  ensureResourceItemTemplates(ctx);
  ensureGearMaterialItemTemplates(ctx);
  ensureCraftingModifierItemTemplates(ctx);
  ensureFoodItemTemplates(ctx);
  ensureWorldDropGearTemplates(ctx);
  ensureWorldDropJewelryTemplates(ctx);
  ensureBossDropTemplates(ctx);
  ensureCraftingBaseGearTemplates(ctx);
  // Ability templates are now generated dynamically per character (no seeding needed)
  ensureRecipeTemplates(ctx);
  ensureGearRecipeTemplates(ctx);
  ensureRecipeScrollItemTemplates(ctx);
  ensureLootTables(ctx);
  ensureMaterialLootEntries(ctx);
  // No world geography seeding — regions, locations, NPCs, vendors are all procedurally generated
}

function ensureWorldState(ctx: any) {
  const world = ctx.db.world_state.id.find(1n);
  if (!world) {
    ctx.db.world_state.insert({
      id: 1n,
      startingLocationId: 0n, // No fixed starting location — each character gets a generated one
      isNight: false,
      nextTransitionAtMicros: ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS,
    });
  }
}

