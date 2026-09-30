import { ScheduleAt } from 'spacetimedb';
import { LlmDispatch, LlmSweepTick } from '../schema/tables';
import { runLlmJob } from '../helpers/llm_executor';
import { sweepLlmJobs } from '../helpers/llm_sweeper';
import { redactSecrets } from '../helpers/measurement';
import { LLM_SWEEP_INTERVAL_MICROS } from '../data/llm_limits';

/**
 * The two scheduled functions of the LLM executor (Phase 41).
 *
 * - `llm_run` is the scheduled procedure that runs one dispatched job (PIPE-09). The named
 *   4-argument form is required so the export collector in index.ts finds it by name; the
 *   `onSchedule` option binds it to `llm_dispatch` (the table option `scheduled:` is deprecated).
 * - `llm_sweep` is the scheduled reducer that repeats every 30 s and recovers stuck jobs (PIPE-05).
 *
 * Both refuse any caller that is not the module itself, so a client cannot forge a dispatch or
 * drive the sweeper.
 */
export const registerLlmExecutorReducers = (deps: any) => {
  const { spacetimedb, t, SenderError } = deps;

  spacetimedb.procedure(
    { name: 'llm_run', onSchedule: LlmDispatch },
    { arg: LlmDispatch.rowType },
    t.unit(),
    (ctx: any, { arg }: { arg: any }) => {
      // runLlmJob checks the module identity first and returns before any read or write.
      runLlmJob(ctx, arg);
      return {};
    },
  );

  spacetimedb.reducer(
    { name: 'llm_sweep', onSchedule: LlmSweepTick },
    { arg: LlmSweepTick.rowType },
    (ctx: any) => {
      if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) {
        throw new SenderError('Scheduled only');
      }

      // The next tick goes in FIRST: a throw later in this reducer rolls everything back,
      // and a sweeper that forgot to reschedule itself would never run again.
      ctx.db.llm_sweep_tick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + LLM_SWEEP_INTERVAL_MICROS),
      });

      try {
        sweepLlmJobs(ctx);
      } catch (err) {
        console.error(redactSecrets(`llm_sweep failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    },
  );
};
