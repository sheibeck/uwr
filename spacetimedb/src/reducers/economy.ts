// ============================================================================
// Economy admin reducers (Phase 51.3, SC5)
// ============================================================================
//
// Admin-only reducers for the Phase 52 admin panel. The console path is the /economy command
// (helpers/economy_admin_commands.ts); both call the same functions in helpers/economy_state.ts
// (applyDialChange, resetEconomy, setAiEnabled), so a value is clamped identically wherever it is typed.
//
// Each reducer calls requireAdmin first. There is no character context here, so refusals are SenderErrors.
// The change is logged as scope, dial and stored value; no identity is written.
// ============================================================================

import { applyDialChange, resetEconomy, setAiEnabled } from '../helpers/economy_state';

export const registerEconomyReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requireAdmin } = deps;

  // Admin-only: set one dial. scope is global, region, tier or item; scopeId is the region id or item_template id
  // (0n for global and tier); dial is the word the console uses (rarity, drop, gold, gather, boss, or a tier name).
  spacetimedb.reducer(
    'economy_set_dial',
    { scope: t.string(), scopeId: t.u64(), dial: t.string(), value: t.i64() },
    (ctx: any, { scope, scopeId, dial, value }: { scope: string; scopeId: bigint; dial: string; value: bigint }) => {
      requireAdmin(ctx);
      if (scope !== 'global' && scope !== 'region' && scope !== 'tier' && scope !== 'item') {
        throw new SenderError('Economy dial refused: bad_scope');
      }
      const result = applyDialChange(ctx, { scope, scopeId, dial, value });
      if (!result.ok) throw new SenderError('Economy dial refused: ' + result.reason);
      console.info(`economy dial set, scope=${scope}, dial=${dial}, value=${result.value}`);
    },
  );

  // Admin-only: reset the economy. scope global restores every dial (the AI switch is kept) and clears all overrides;
  // region and item clear one override.
  spacetimedb.reducer(
    'economy_reset',
    { scope: t.string(), scopeId: t.u64() },
    (ctx: any, { scope, scopeId }: { scope: string; scopeId: bigint }) => {
      requireAdmin(ctx);
      if (scope !== 'global' && scope !== 'region' && scope !== 'item') {
        throw new SenderError('Economy reset refused: bad_scope');
      }
      const removed = resetEconomy(ctx, scope, scopeId);
      console.info(`economy reset, scope=${scope}, regions=${removed.regions}, items=${removed.items}`);
    },
  );

  // Admin-only: the AI economy switch. Off by default; the route stays idle until this is on.
  spacetimedb.reducer(
    'economy_set_ai_enabled',
    { enabled: t.bool() },
    (ctx: any, { enabled }: { enabled: boolean }) => {
      requireAdmin(ctx);
      setAiEnabled(ctx, enabled);
      console.info(enabled ? 'economy ai on' : 'economy ai off');
    },
  );
};
