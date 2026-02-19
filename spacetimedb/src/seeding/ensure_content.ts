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
import { ensureLootTables, ensureMaterialLootEntries, ensureVendorInventory, ensureLocationEnemyTemplates, ensureEnemyTemplatesAndRoles } from './ensure_enemies';
import {
  DAY_DURATION_MICROS,
  getWorldState,
  ensureLocationRuntimeBootstrap,
  ensureSpawnsForLocation,
  respawnLocationSpawns
} from '../helpers/location';

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

export function ensureInactivityTickScheduled(ctx: any) {
  if (!tableHasRows(ctx.db.inactivityTick.iter())) {
    ctx.db.inactivityTick.insert({
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
  ensureMaterialLootEntries(ctx);         // Phase 13: material + scroll drops (after loot tables + material/scroll templates)
  ensureVendorInventory(ctx);
}

