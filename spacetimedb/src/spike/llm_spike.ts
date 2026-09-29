// Throwaway spike (phase 39): scheduled procedure -> Anthropic Messages API measurement module.
// Registered from index.ts by registerSpike(spacetimedb). Deleted at phase end; git history keeps it.
import { t, SenderError } from 'spacetimedb/server';
import { ScheduleAt, TimeDuration } from 'spacetimedb';
import { COMBAT_LOOP_INTERVAL_MICROS } from '../data/combat_constants';
import { classifyFailure, redactSecrets, reserveCostMicroUsd, settleCostMicroUsd } from '../helpers/measurement';
import { SpikeJob, SpikeTick } from './spike_tables';
import { buildRequest, parseResponse, timeoutMsFor, validateSpec, type SpikeSpec } from './spike_bodies';

// Operator CLI identity (from `spacetime login show`). data/admin.ts is deliberately not modified.
export const CLI_IDENTITY = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
// Change between publishes for the survive-publish test (a byte-different module).
export const SPIKE_BUILD_TAG = 'b';
// Hard spend ceiling in micro-USD ($2.40). A code constant: no reducer or table can change it.
export const SPEND_CAP_MICRO_USD = 2_400_000n;

const MAX_ENQUEUE = 50;

function hexOf(identity: any): string | null {
  try {
    return identity ? String(identity.toHexString()) : null;
  } catch {
    return null;
  }
}

function toNum(v: bigint | null): number | null {
  return v === null ? null : Number(v);
}

/**
 * One measured run. The stored key is read in the first transaction, the network call happens
 * between the two transactions, and the result row is written in the second. Both transaction
 * bodies are synchronous and safe to re-run.
 */
export function runSpec(
  ctx: any,
  scheduledUs: bigint | null,
  runId: string,
  rung: string,
  seq: number,
  spec: SpikeSpec,
): string {
  const ctxUs: bigint = ctx.timestamp.microsSinceUnixEpoch;
  const needsFetch = spec.kind !== 'noop';
  const billable = spec.kind === 'messages' && spec.keyMode !== 'bad';
  const sizing = buildRequest(spec, '');
  const reservation = billable ? reserveCostMicroUsd(sizing.maxTokens, sizing.requestChars) : 0;
  const reservationBig = BigInt(reservation);

  let tx1Us = 0n;
  let storedKey = '';
  let capBlocked = false;
  let inFlightAtStart = 0;
  ctx.withTx((tx: any) => {
    tx1Us = tx.timestamp.microsSinceUnixEpoch;
    const st = tx.db.spike_state.id.find(1n);
    const cfg = tx.db.llm_config.id.find(1n);
    storedKey = cfg ? cfg.apiKey : '';
    inFlightAtStart = st ? st.inFlight : 0;
    capBlocked = false;
    if (!needsFetch) return;
    if (!st || st.estCostMicroUsd + st.reservedMicroUsd + reservationBig > SPEND_CAP_MICRO_USD) {
      capBlocked = true;
      return;
    }
    tx.db.spike_state.id.update({
      ...st,
      calls: st.calls + 1n,
      inFlight: st.inFlight + 1,
      reservedMicroUsd: st.reservedMicroUsd + reservationBig,
    });
  });

  const didFetch = needsFetch && !capBlocked;
  let status: number | null = null;
  let threw = false;
  let thrownMessage: string | null = null;
  let bodyText = '';
  let headerNames: string[] = [];
  let requestIdVisible = false;
  let retryAfterVisible = false;
  let dateNowCallMs: number | null = null;

  if (didFetch) {
    const req = buildRequest(spec, storedKey);
    const init: any = {
      method: req.method,
      headers: req.headers,
      timeout: TimeDuration.fromMillis(timeoutMsFor(spec)),
    };
    if (req.body !== undefined) init.body = req.body;
    const startedMs = Date.now();
    try {
      const res = ctx.http.fetch(req.url, init);
      status = res.status;
      const names: string[] = [];
      res.headers.forEach((_v: string, k: string) => names.push(k));
      headerNames = names;
      requestIdVisible = res.headers.get('request-id') !== null;
      retryAfterVisible = res.headers.get('retry-after') !== null;
      bodyText = res.text();
    } catch (e: any) {
      threw = true;
      thrownMessage = redactSecrets(String(e && e.message ? e.message : e), [storedKey]).slice(0, 400);
    }
    dateNowCallMs = Date.now() - startedMs;
  }

  const parsed =
    spec.kind === 'noop'
      ? parseResponse(spec, 0, '')
      : didFetch && !threw && status !== null
        ? parseResponse(spec, status, bodyText)
        : null;
  const failureClass =
    spec.kind === 'noop'
      ? null
      : classifyFailure({ threw, status, contentOk: parsed ? parsed.contentOk : undefined, capBlocked });
  const ok = failureClass === null;
  const costMicroUsd = didFetch
    ? settleCostMicroUsd({ threw, status, usage: parsed ? parsed.usage : null, reservedMicroUsd: reservation })
    : 0;

  let tx2Us = 0n;
  let dataJson = '';
  ctx.withTx((tx: any) => {
    tx2Us = tx.timestamp.microsSinceUnixEpoch;
    const st = tx.db.spike_state.id.find(1n);
    if (st && didFetch) {
      tx.db.spike_state.id.update({
        ...st,
        inFlight: st.inFlight > 0 ? st.inFlight - 1 : 0,
        reservedMicroUsd: st.reservedMicroUsd >= reservationBig ? st.reservedMicroUsd - reservationBig : 0n,
        estCostMicroUsd: st.estCostMicroUsd + BigInt(costMicroUsd),
      });
    }
    const senderHex = hexOf(ctx.sender);
    const dbHex = hexOf(ctx.databaseIdentity);
    const data = {
      v: 1,
      rung,
      seq,
      class: spec.class,
      kind: spec.kind,
      route: spec.route ?? null,
      effort: spec.effort ?? null,
      thinking: spec.thinking ?? null,
      keyMode: spec.keyMode ?? null,
      timeoutMs: needsFetch ? timeoutMsFor(spec) : null,
      buildTag: SPIKE_BUILD_TAG,
      senderHex,
      isModuleIdentity: senderHex !== null && senderHex === dbHex,
      hasConnectionId: ctx.connectionId !== null && ctx.connectionId !== undefined,
      scheduledUs: toNum(scheduledUs),
      ctxUs: Number(ctxUs),
      tx1Us: Number(tx1Us),
      tx2Us: Number(tx2Us),
      dispatchLateUs: scheduledUs === null ? null : Number(tx1Us - scheduledUs),
      ctxLateUs: scheduledUs === null ? null : Number(ctxUs - scheduledUs),
      callUs: Number(tx2Us - tx1Us),
      dateNowCallMs,
      inFlightAtStart,
      status,
      threw,
      errorMessage: threw ? thrownMessage : parsed ? parsed.errorMessage : null,
      anthropicErrorType: parsed ? parsed.anthropicErrorType : null,
      stopReason: parsed ? parsed.stopReason : null,
      parsedOk: parsed ? parsed.parsedOk : null,
      requiredKeysOk: parsed ? parsed.requiredKeysOk : null,
      modelListed: parsed ? parsed.modelListed : null,
      usage: parsed ? parsed.usage : null,
      headerNames,
      requestIdVisible,
      retryAfterVisible,
      capBlocked,
      reservedMicroUsd: didFetch ? reservation : 0,
      costMicroUsd,
      failureClass,
      ok,
    };
    dataJson = redactSecrets(JSON.stringify(data), [storedKey]);
    tx.db.spike_result.insert({ id: 0n, runId, rung, seq, ok, dataJson });
  });
  return dataJson;
}

function specOrSenderError(specJson: string): SpikeSpec {
  try {
    return validateSpec(specJson);
  } catch (e: any) {
    throw new SenderError(String(e && e.message ? e.message : e));
  }
}

export function registerSpike(spacetimedb: any) {
  // Scheduled procedure: the schedule row is already deleted, so everything comes from arg.
  spacetimedb.procedure(
    { name: 'spike_run_job', onSchedule: SpikeJob },
    { arg: SpikeJob.rowType },
    t.unit(),
    (ctx: any, { arg }: any) => {
      const sa = arg.scheduledAt;
      const scheduledUs: bigint | null = sa && sa.tag === 'Time' ? sa.value.microsSinceUnixEpoch : null;
      let spec: SpikeSpec | null = null;
      let specError = '';
      try {
        spec = validateSpec(arg.specJson);
      } catch (e: any) {
        specError = String(e && e.message ? e.message : e).slice(0, 200);
      }
      if (spec === null) {
        ctx.withTx((tx: any) => {
          const dataJson = JSON.stringify({ v: 1, failureClass: 'request', errorMessage: specError, ok: false, buildTag: SPIKE_BUILD_TAG });
          tx.db.spike_result.insert({ id: 0n, runId: arg.runId, rung: arg.rung, seq: arg.seq, ok: false, dataJson });
        });
        return {};
      }
      runSpec(ctx, scheduledUs, arg.runId, arg.rung, arg.seq, spec);
      return {};
    },
  );

  // Client-callable variant: quick feedback and the client-called-procedure check.
  spacetimedb.procedure(
    { name: 'spike_direct_call' },
    { specJson: t.string() },
    t.string(),
    (ctx: any, { specJson }: any) => runSpec(ctx, null, 'direct', 'direct', 0, specOrSenderError(specJson)),
  );

  // Self-rescheduling tick probe at the combat cadence.
  spacetimedb.reducer(
    { name: 'spike_tick_probe', onSchedule: SpikeTick },
    { arg: SpikeTick.rowType },
    (ctx: any, { arg }: any) => {
      const st = ctx.db.spike_state.id.find(1n);
      if (!st || !st.probeOn) return;
      const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
      const sa = arg.scheduledAt;
      const scheduled: bigint = sa && sa.tag === 'Time' ? sa.value.microsSinceUnixEpoch : now;
      ctx.db.spike_tick_sample.insert({
        id: 0n,
        phase: st.phase,
        inFlight: st.inFlight,
        lateUs: now - scheduled,
        gapUs: st.lastTickUs === 0n ? 0n : now - st.lastTickUs,
      });
      ctx.db.spike_state.id.update({ ...st, lastTickUs: now });
      ctx.db.spike_tick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(now + COMBAT_LOOP_INTERVAL_MICROS),
      });
    },
  );

  spacetimedb.reducer('spike_whoami', {}, (ctx: any) => {
    const senderHex = hexOf(ctx.sender);
    console.info('spike_whoami sender=' + senderHex);
  });

  // Only the operator CLI identity may store the key; only its length is ever logged.
  spacetimedb.reducer('spike_set_key', { apiKey: t.string() }, (ctx: any, { apiKey }: any) => {
    const senderHex = hexOf(ctx.sender);
    if (senderHex !== CLI_IDENTITY) {
      console.error('spike_set_key rejected, sender=' + senderHex);
      throw new SenderError('spike_set_key: sender is not the operator CLI identity');
    }
    const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (trimmed.length === 0) throw new SenderError('API key cannot be empty');
    const existing = ctx.db.llm_config.id.find(1n);
    if (existing) {
      ctx.db.llm_config.id.update({ ...existing, apiKey: trimmed, updatedAt: ctx.timestamp });
    } else {
      ctx.db.llm_config.insert({ id: 1n, apiKey: trimmed, updatedAt: ctx.timestamp });
    }
    const keyLen = trimmed.length;
    console.info('spike key set, len=' + keyLen);
  });

  // Never touches estCostMicroUsd or calls: the spend counters survive resets. Call only when idle.
  spacetimedb.reducer('spike_reset', { probeOn: t.bool() }, (ctx: any, { probeOn }: any) => {
    const existing = ctx.db.spike_state.id.find(1n);
    const next = {
      id: 1n,
      phase: 'idle',
      probeOn: !!probeOn,
      lastTickUs: 0n,
      inFlight: 0,
      calls: existing ? existing.calls : 0n,
      estCostMicroUsd: existing ? existing.estCostMicroUsd : 0n,
      reservedMicroUsd: 0n,
      pings: 0n,
    };
    if (existing) ctx.db.spike_state.id.update(next);
    else ctx.db.spike_state.insert(next);
    for (const row of [...ctx.db.spike_tick_sample.iter()]) ctx.db.spike_tick_sample.id.delete(row.id);
    for (const row of [...ctx.db.spike_tick.iter()]) ctx.db.spike_tick.scheduledId.delete(row.scheduledId);
    if (probeOn) {
      ctx.db.spike_tick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + COMBAT_LOOP_INTERVAL_MICROS),
      });
    }
  });

  spacetimedb.reducer('spike_set_phase', { phase: t.string() }, (ctx: any, { phase }: any) => {
    const st = ctx.db.spike_state.id.find(1n);
    if (!st) throw new SenderError('spike_state missing: call spike_reset first');
    ctx.db.spike_state.id.update({ ...st, phase });
  });

  // One tiny private write, for the reducer round-trip measurement.
  spacetimedb.reducer('spike_ping', { nonce: t.u64() }, (ctx: any) => {
    const st = ctx.db.spike_state.id.find(1n);
    if (st) ctx.db.spike_state.id.update({ ...st, pings: st.pings + 1n });
  });

  spacetimedb.reducer('spike_echo', { runId: t.string(), nonce: t.u32() }, (ctx: any, { runId, nonce }: any) => {
    ctx.db.spike_result.insert({ id: 0n, runId, rung: 'echo', seq: nonce, ok: true, dataJson: '{}' });
  });

  spacetimedb.reducer(
    'spike_enqueue',
    { runId: t.string(), rung: t.string(), specJson: t.string(), count: t.u32(), seqStart: t.u32() },
    (ctx: any, a: any) => {
      specOrSenderError(a.specJson);
      if (a.count < 1 || a.count > MAX_ENQUEUE) {
        throw new SenderError('count must be between 1 and ' + MAX_ENQUEUE);
      }
      const at = ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch);
      for (let i = 0; i < a.count; i++) {
        ctx.db.spike_job.insert({
          scheduledId: 0n,
          scheduledAt: at,
          runId: a.runId,
          rung: a.rung,
          seq: a.seqStart + i,
          specJson: a.specJson,
        });
      }
    },
  );
}
