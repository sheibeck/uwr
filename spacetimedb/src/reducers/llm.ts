import { enqueueLlmJob, SOURCE_KEYS, isActiveJobStatus, isSmokeJob, serializeRequest } from '../helpers/llm_queue';
import { patchAdminState } from '../helpers/llm_admin_state';
import { getPhaseLedger, reservationMicroUsd } from '../helpers/llm_budget';
import { LLM_SMOKE_ROUTES, LLM_PHASE_SPEND_CAP_MICRO_USD } from '../data/llm_limits';

/** Logged by set_api_key: the prefix plus the key length and nothing else. The key script confirms against this exact prefix. */
export const LLM_KEY_SET_LOG_PREFIX = 'llm key set, len=';

/** The request body of every smoke job; the executor skips apply for it. */
const SMOKE_REQUEST = { smoke: true } as const;

function isActiveSmokeJob(job: any): boolean {
  return isActiveJobStatus(job.status) && isSmokeJob(job);
}

export const registerLlmReducers = (deps: any) => {
  const { spacetimedb, t, SenderError, requireAdmin, requireCharacterOwnedBy } = deps;

  // Admin-only: Set or update the Anthropic API key
  spacetimedb.reducer('set_api_key', { apiKey: t.string() }, (ctx: any, { apiKey }: { apiKey: string }) => {
    requireAdmin(ctx);
    if (!apiKey || apiKey.trim().length === 0) {
      throw new SenderError('API key cannot be empty');
    }
    const trimmed = apiKey.trim();
    const existing = ctx.db.llm_config.id.find(1n);
    if (existing) {
      ctx.db.llm_config.id.update({ ...existing, apiKey: trimmed, updatedAt: ctx.timestamp });
    } else {
      ctx.db.llm_config.insert({ id: 1n, apiKey: trimmed, updatedAt: ctx.timestamp });
    }
    // Status only: set, length and timestamps. A rotated key is unproven until the next smoke test passes.
    patchAdminState(ctx, {
      keySet: true,
      keyLength: BigInt(trimmed.length),
      keyUpdatedAt: ctx.timestamp,
      keyVerifiedAt: undefined,
      keyLastCheckOk: false,
    });
    console.info(LLM_KEY_SET_LOG_PREFIX + trimmed.length);
  });

  // Admin-only: one phase-only job per smoke route (a text call plus one minimal call per JSON schema).
  // The executor skips apply for these and records each route's result in llm_admin_state.
  spacetimedb.reducer('llm_smoke_test', {}, (ctx: any) => {
    requireAdmin(ctx);

    for (const job of ctx.db.llm_job.by_player.filter(ctx.sender)) {
      if (isActiveSmokeJob(job)) {
        console.log('llm smoke test already running');
        return;
      }
    }

    // All or nothing against the phase cap: never leave a half-run behind.
    const requestJson = serializeRequest({ ...SMOKE_REQUEST });
    const ledger = getPhaseLedger(ctx);
    const held: bigint = ledger ? ledger.spentMicroUsd + ledger.reservedMicroUsd : 0n;
    let needed = 0n;
    for (const route of LLM_SMOKE_ROUTES) needed += reservationMicroUsd(route, requestJson);
    if (held + needed > LLM_PHASE_SPEND_CAP_MICRO_USD) {
      console.log('llm smoke test refused: phase spend cap');
      return;
    }

    patchAdminState(ctx, { lastSmokeAt: ctx.timestamp, lastSmokeJson: '{}' });

    let created = 0;
    let refused = 0;
    for (const route of LLM_SMOKE_ROUTES) {
      const result = enqueueLlmJob(ctx, {
        route,
        playerId: ctx.sender,
        characterId: 0n,
        sourceKey: SOURCE_KEYS.smokeTest(),
        request: { ...SMOKE_REQUEST },
        budget: 'phase_only',
      });
      if (result.created) created += 1;
      else if (result.refused) refused += 1;
    }
    console.log(`llm smoke test queued: created=${created} refused=${refused} routes=${LLM_SMOKE_ROUTES.join(',')}`);
  });

  // Admin-only: raise pendingLevels on the caller's own character so the live proof can exercise a real level-up.
  spacetimedb.reducer('grant_test_pending_level', { characterId: t.u64(), levels: t.u64() },
    (ctx: any, { characterId, levels }: { characterId: bigint; levels: bigint }) => {
      requireAdmin(ctx);
      const character = requireCharacterOwnedBy(ctx, characterId);
      if (levels < 1n || levels > 5n) {
        throw new SenderError('levels must be between 1 and 5');
      }
      ctx.db.character.id.update({ ...character, pendingLevels: (character.pendingLevels ?? 0n) + levels });
    }
  );
};
