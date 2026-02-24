import { ScheduleAt } from 'spacetimedb';
import {
  DayNightTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  InactivityTick,
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
  ensureAbilityTemplates,
  ensureGearMaterialItemTemplates,
  ensureCraftingBaseGearTemplates,
  ensureGearRecipeTemplates,
  ensureRecipeScrollItemTemplates,
  ensureCraftingModifierItemTemplates,
} from './ensure_items';
import { ensureNpcs, ensureQuestTemplates, ensureWorldLayout, ensureEnemyAbilities, ensureDialogueOptions } from './ensure_world';
import { ensureLootTables, ensureMaterialLootEntries, ensureVendorInventory, ensureLocationEnemyTemplates, ensureEnemyTemplatesAndRoles, ensureNamedEnemies } from './ensure_enemies';
import {
  DAY_DURATION_MICROS,
  getWorldState,
  ensureLocationRuntimeBootstrap,
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

export function syncAllContent(ctx: any) {
  ensureRaces(ctx);
  ensureFactions(ctx);
  ensureWorldLayout(ctx);
  ensureStarterItemTemplates(ctx);
  ensureResourceItemTemplates(ctx);
  ensureGearMaterialItemTemplates(ctx);   // Phase 13: crafting materials (after resource items)
  ensureCraftingModifierItemTemplates(ctx); // Phase 13: crafting modifier items for affix dialog
  ensureFoodItemTemplates(ctx);
  ensureWorldDropGearTemplates(ctx);
  ensureWorldDropJewelryTemplates(ctx);
  ensureBossDropTemplates(ctx);           // Boss-unique rare drops (must be before ensureNamedEnemies)
  ensureCraftingBaseGearTemplates(ctx);   // Phase 13: base gear templates for recipe output
  ensureAbilityTemplates(ctx);
  ensureRecipeTemplates(ctx);
  ensureGearRecipeTemplates(ctx);         // Phase 13: gear recipes (after material + base gear templates)
  ensureRecipeScrollItemTemplates(ctx);   // Phase 13: scroll items (after gear recipes)
  ensureNpcs(ctx);
  ensureEnemyTemplatesAndRoles(ctx);
  ensureEnemyAbilities(ctx);
  ensureQuestTemplates(ctx);              // Must be after enemies are created
  ensureDialogueOptions(ctx);            // Must be after quests are created
  ensureLocationEnemyTemplates(ctx);
  ensureLocationRuntimeBootstrap(ctx);
  ensureLootTables(ctx);
  ensureNamedEnemies(ctx);                // Named enemies with boss loot tables (after loot tables + enemy templates)
  ensureMaterialLootEntries(ctx);         // Phase 13: material + scroll drops (after loot tables + material/scroll templates)
  ensureVendorInventory(ctx);
}

