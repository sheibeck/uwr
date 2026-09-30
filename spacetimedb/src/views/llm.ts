import type { ViewDeps } from './types';
import { keeperMessageForJob, publicErrorBucket } from '../helpers/llm_status';
import { isKeyValid } from '../helpers/llm_admin_state';
import { isSmokeJob } from '../helpers/llm_queue';
import { ADMIN_IDENTITIES } from '../data/admin';
import { LLM_ADMIN_STATE_ID, LLM_SPEND_ID, LLM_PHASE_SPEND_CAP_MICRO_USD } from '../data/llm_limits';

// ============================================================================
// my_llm_jobs: per-sender projection of the private llm_job table (SEC-01)
// ============================================================================
//
// The view finds rows by the by_player index on ctx.sender (never a table scan)
// and projects each to six fields. Request context, output text, dedupe key and
// player identity never leave the server.
// ============================================================================

export const MY_LLM_JOB_KEYS = [
  'id',
  'route',
  'status',
  'createdAt',
  'errorCode',
  'userMessage',
] as const;

export function projectMyLlmJob(job: any) {
  return {
    id: job.id,
    route: job.route,
    status: job.status,
    createdAt: job.createdAt,
    // Coarse bucket only: the raw failure class would reveal account-side problems (SEC-01).
    errorCode: publicErrorBucket(job.errorCode),
    userMessage: keeperMessageForJob(job.status, job.errorCode, job.route),
  };
}

// ============================================================================
// admin_llm_status: key status and spend ledger for admins only (OPS-01, SEC-04)
// ============================================================================
//
// Declared public because views are per-subscriber; the sender check is the
// control and returns [] to everyone else. It reads the admin state singleton,
// the phase ledger singleton (primary-key lookups) and the in_flight jobs
// (by_status index). It never reads the key table and never scans a table, so
// no part of the key can reach the output: only set/valid, length and timestamps.
// ============================================================================

export const ADMIN_LLM_STATUS_KEYS = [
  'keySet',
  'keyLength',
  'keyValid',
  'keyUpdatedAt',
  'keyVerifiedAt',
  'lastSmokeAt',
  'lastSmokeJson',
  'phaseSpentMicroUsd',
  'phaseReservedMicroUsd',
  'phaseCalls',
  'phaseCapMicroUsd',
  'inFlight',
] as const;

export function projectAdminLlmStatus(state: any, ledger: any, inFlight: number | bigint) {
  return {
    keySet: state?.keySet === true,
    keyLength: state?.keyLength ?? 0n,
    keyValid: isKeyValid(state),
    keyUpdatedAt: state?.keyUpdatedAt,
    keyVerifiedAt: state?.keyVerifiedAt,
    lastSmokeAt: state?.lastSmokeAt,
    lastSmokeJson: state?.lastSmokeJson ?? '{}',
    phaseSpentMicroUsd: ledger?.spentMicroUsd ?? 0n,
    phaseReservedMicroUsd: ledger?.reservedMicroUsd ?? 0n,
    phaseCalls: ledger?.calls ?? 0n,
    phaseCapMicroUsd: LLM_PHASE_SPEND_CAP_MICRO_USD,
    inFlight: BigInt(inFlight),
  };
}

export const registerLlmViews = ({ spacetimedb, t }: ViewDeps) => {
  const MyLlmJob = t.row('MyLlmJob', {
    id: t.u64(),
    route: t.string(),
    status: t.string(),
    createdAt: t.timestamp(),
    errorCode: t.string().optional(),
    userMessage: t.string(),
  });

  spacetimedb.view(
    { name: 'my_llm_jobs', public: true },
    t.array(MyLlmJob),
    // Admin smoke jobs run on real routes (world_gen, skill_gen, ...) but are never player work,
    // so they are dropped here and never light the player indicator.
    (ctx: any) => [...ctx.db.llm_job.by_player.filter(ctx.sender)]
      .filter((job: any) => !isSmokeJob(job))
      .map(projectMyLlmJob)
  );

  const AdminLlmStatus = t.row('AdminLlmStatusRow', {
    keySet: t.bool(),
    keyLength: t.u64(),
    keyValid: t.bool(),
    keyUpdatedAt: t.timestamp().optional(),
    keyVerifiedAt: t.timestamp().optional(),
    lastSmokeAt: t.timestamp().optional(),
    lastSmokeJson: t.string(),
    phaseSpentMicroUsd: t.u64(),
    phaseReservedMicroUsd: t.u64(),
    phaseCalls: t.u64(),
    phaseCapMicroUsd: t.u64(),
    inFlight: t.u64(),
  });

  spacetimedb.view(
    { name: 'admin_llm_status', public: true },
    t.array(AdminLlmStatus),
    (ctx: any) => {
      if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) return [];
      const state = ctx.db.llm_admin_state.id.find(LLM_ADMIN_STATE_ID);
      const ledger = ctx.db.llm_spend.id.find(LLM_SPEND_ID);
      let inFlight = 0;
      for (const _job of ctx.db.llm_job.by_status.filter('in_flight')) inFlight += 1;
      return [projectAdminLlmStatus(state, ledger, inFlight)];
    }
  );
};
