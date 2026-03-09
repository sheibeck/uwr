// scheduling.ts
// Scheduled table setup functions relocated from seeding/ensure_content.ts.
// These ensure scheduled table ticks are running -- called on init and admin resync.

import { ScheduleAt } from 'spacetimedb';
import { tableHasRows } from './events';
import { DAY_DURATION_MICROS, getWorldState } from './location';

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

/**
 * Initialize all scheduled table ticks.
 * Replaces the scheduled-table portion of the former syncAllContent().
 */
export function initScheduledTables(ctx: any) {
  ensureHealthRegenScheduled(ctx);
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
  ensureDayNightTickScheduled(ctx);
  ensureInactivityTickScheduled(ctx);
  ensureLlmCleanupScheduled(ctx);
}
