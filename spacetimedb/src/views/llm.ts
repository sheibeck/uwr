import type { ViewDeps } from './types';
import { keeperMessageForJob, publicErrorBucket } from '../helpers/llm_status';

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
    (ctx: any) => [...ctx.db.llm_job.by_player.filter(ctx.sender)].map(projectMyLlmJob)
  );
};
