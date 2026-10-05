// Live failure drills on the local scratch database (Plan 44-06, QUAL-03).
// Run from the repo root. ALWAYS pass the "drills" filter, because the live config includes every *.live.ts file.
//
//   pnpm exec vitest run --config scripts/llm/vitest.live.config.ts drills                          # dry: plan only, nothing changes
//   DRILLS_LIVE_RUN=run DRILLS_ONLY=bad_key_401,ceiling,kill_switch LLM_LIVE_DB=uwr-verify \
//     pnpm exec vitest run --config scripts/llm/vitest.live.config.ts drills                        # live, after approval
//
// DRILLS_LIVE_RUN selects the mode: unset or empty is the dry run, the value run is live, anything else throws.
// DRILLS_ONLY names the steps a live run executes (bad_key_401, ceiling, kill_switch, tiny_timeout, restore_check).
// LLM_LIVE_DB, when set, must be exactly the scratch database: assertDrillDb refuses everything else, in both modes.
//
// Each drill induces one failure on purpose, checks what the player would see, and restores the state in a finally
// block. The fake key stands in for the real one (so even a gate bug cannot spend), and the real key is stored again
// with scripts/llm/set-key.mjs. The ceiling and the kill switch are restored with their reducers and the restore is
// read back from the admin_llm_status view. Results are merged into 44-live-drills.json so separate invocations
// accumulate. The timeout drill needs a build with the temporary 50 ms route timeout published first (see plan 44-06).
//
// Local server only. The CLI token is obtained in-process and never printed; every printed or recorded string goes
// through scrub(); prompts, completions, the token and any key are never printed or written.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DbConnection } from '../../src/module_bindings/index.ts';
import { REPO_ROOT, TARGETS, callReducerHttp, getCliToken, loadAnthropicKey, resolveTarget, scrub, storeKey } from './cli.mjs';
import { fetchCallLogRows, filterByJobIds } from './call_log_report.mjs';
import {
  CEILING_DRILL_MICRO_USD,
  DRILLS,
  DRILL_DB,
  DRILL_PLAN,
  TINY_TIMEOUT_MS,
  assertDrillDb,
  assertRestored,
  drillRecord,
  failedJobProblems,
  leakHits,
  localRefusalProblems,
  lockProblems,
  makeFakeKey,
  parseDrillsOnly,
  resolveDrillMode,
  timeoutLedgerProblems,
  zeroSpendProblems,
} from './drill_rules.mjs';
import { isTerminalJobStatus, proofEmail } from './proof_rules.mjs';
import { LLM_DAILY_CEILING_DEFAULT_MICRO_USD } from '../../spacetimedb/src/data/llm_limits';

// Throw on an unknown mode, an unknown step name or any database but the scratch one before anything else runs.
const MODE = resolveDrillMode(process.env.DRILLS_LIVE_RUN);
const DB_NAME = assertDrillDb(process.env.LLM_LIVE_DB ? process.env.LLM_LIVE_DB : DRILL_DB);
const WANTED = parseDrillsOnly(process.env.DRILLS_ONLY, MODE);
const DRY = MODE === 'dry';

const TARGET = resolveTarget(['--db', DB_NAME]);
const WS_URI = 'ws://127.0.0.1:3000';
const RECORD_PATH = path.join(REPO_ROOT, '.planning', 'phases', '44-live-verification-and-tone-eval', '44-live-drills.json');
const SET_KEY_SCRIPT = path.join(REPO_ROOT, 'scripts', 'llm', 'set-key.mjs');

// Views need their own explicit subscription; the creation event table is subscribed apart (it is an event table).
const SUBSCRIPTIONS = ['my_llm_jobs', 'admin_llm_status', 'player', 'character_creation_state', 'character'].map((t) => 'SELECT * FROM ' + t);
const EVENT_SUBSCRIPTIONS = ['SELECT * FROM event_creation'];

const RACE_DESCRIPTION = 'A quiet folk of river-dwelling tinkers with silver hair, webbed hands and a love of small machines.';

type Row = Record<string, any>;
interface DrillResult {
  status: 'passed' | 'failed';
  reason?: string;
  evidence?: Record<string, unknown>;
  jobIds?: string[];
}
interface CreationLine {
  seq: number;
  kind: string;
  message: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The creation lines this identity saw (event_creation is an event table: rows only arrive as inserts). */
const creationLines: CreationLine[] = [];
let lineSeq = 0;

/** Connect with the CLI token to the scratch database and wait until every subscription is applied. */
function connect(token: string): Promise<{ conn: any; identityHex: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect: timed out')), 30_000);
    let identityHex = '';
    const conn: any = DbConnection.builder()
      .withUri(WS_URI)
      .withDatabaseName(DB_NAME)
      .withToken(token)
      .onConnect((c: any, identity: any) => {
        identityHex = identity.toHexString();
        c.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            try {
              c.db.event_creation.onInsert((_ctx: any, row: any) => {
                if (row.playerId.toHexString() !== identityHex) return;
                lineSeq += 1;
                creationLines.push({ seq: lineSeq, kind: String(row.kind), message: String(row.message) });
                if (creationLines.length > 200) creationLines.shift();
              });
              c.subscriptionBuilder().subscribe(EVENT_SUBSCRIPTIONS);
            } catch {
              // The drills then report that no player line could be read back.
            }
            resolve({ conn, identityHex });
          })
          .onError(() => {
            clearTimeout(timer);
            reject(new Error('connect: subscription error'));
          })
          .subscribe(SUBSCRIPTIONS);
      })
      .onConnectError((_c: any, e: any) => {
        clearTimeout(timer);
        reject(new Error('connect: ' + scrub(String(e?.message ?? e), [token])));
      })
      .build();
  });
}

const rows = (conn: any, table: string): Row[] => [...conn.db[table].iter()];
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

/** What a previous invocation recorded: the entries, the starting ceiling and the drill job ids. */
interface StoredRecord {
  drills: { name: string; status: string; reason?: string; evidence?: Record<string, unknown> }[];
  startingCeilingMicroUsd?: string;
  jobIds: Record<string, string[]>;
}

function readStored(): StoredRecord {
  try {
    const parsed = JSON.parse(fs.readFileSync(RECORD_PATH, 'utf8'));
    return {
      drills: Array.isArray(parsed.drills) ? parsed.drills : [],
      startingCeilingMicroUsd: typeof parsed.startingCeilingMicroUsd === 'string' ? parsed.startingCeilingMicroUsd : undefined,
      jobIds: parsed.jobIds && typeof parsed.jobIds === 'object' ? parsed.jobIds : {},
    };
  } catch {
    return { drills: [], jobIds: {} };
  }
}

describe('live failure drills (scratch database, local server only)', () => {
  it(DRY ? 'dry run: the drill plan and the admin status for the CLI identity, nothing changes' : 'live run: ' + WANTED.join(', '), async () => {
    // --- setup: local only, token in memory only -------------------------------------------------
    expect(TARGET.name).toBe('local');
    expect(TARGET.httpBase).toBe(TARGETS.local.httpBase);
    expect(TARGET.httpBase.startsWith('http://127.0.0.1')).toBe(true);
    expect(TARGET.db).toBe(DB_NAME);
    const ping = await fetch(TARGET.httpBase + '/v1/ping').catch(() => null);
    expect(ping?.status, 'local server must answer /v1/ping (start it first)').toBe(200);
    const token = getCliToken();
    expect(token, 'no CLI login token (run spacetime login)').toBeTruthy();

    // The real key is read in-process only to learn its length and to scrub it; it is never printed or sent from here.
    const realKey = loadAnthropicKey();
    const realKeyLength = realKey === null ? undefined : BigInt(realKey.length);
    const fake = makeFakeKey();
    const needles = [token as string, fake, ...(realKey === null ? [] : [realKey])];
    const out = (line: string) => console.log(scrub(line, needles));
    out(`mode: ${MODE}, database: ${DB_NAME}, server: local, steps: ${WANTED.join(',')}`);

    const session: { conn: any; identityHex: string } = await connect(token as string);
    const status = (): Row => rows(session.conn, 'adminLlmStatus')[0];

    const first = rows(session.conn, 'adminLlmStatus');
    expect(first.length, 'admin_llm_status is empty: the CLI identity is not an admin').toBe(1);
    out(
      `status: keySet=${first[0].keySet} keyLength=${first[0].keyLength} keyValid=${first[0].keyValid} ` +
        `ceiling=${first[0].dailyCeilingMicroUsd} enabled=${first[0].llmEnabled} inFlight=${first[0].inFlight}`,
    );

    if (DRY) {
      const stored = readStored();
      out('dry mode: no reducer is called and nothing is changed.');
      for (const name of WANTED) {
        const plan = (DRILL_PLAN as Record<string, any>)[name];
        out(`  ${name}: ${plan.does}`);
        out(`    reaches the provider: ${plan.reachesProvider}; expected cost: ${plan.expectedCostMicroUsd} micro-USD; restores: ${plan.restores}`);
      }
      out(`ceiling drill value: ${CEILING_DRILL_MICRO_USD} micro-USD; tiny timeout build value: ${TINY_TIMEOUT_MS} ms`);
      out(`real key available for the restore: ${realKey !== null} (length only is used)`);
      out('recorded so far: ' + drillRecord(stored.drills).drills.map((d: any) => `${d.name}=${d.status}`).join(' '));
      session.conn.disconnect();
      return;
    }

    // --- live mode ---------------------------------------------------------------------------------
    const waitFor = async <T>(pred: () => T | null | undefined | false, timeoutMs: number): Promise<T | null> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const v = pred();
        if (v) return v as T;
        if (Date.now() >= deadline) return null;
        await sleep(250);
      }
    };
    const errText = (e: unknown) => scrub(String((e as Error)?.message ?? e), needles).slice(0, 200);

    const jobs = (route: string): Row[] => rows(session.conn, 'myLlmJobs').filter((j) => j.route === route);
    const jobIds = (route: string): Set<bigint> => new Set(jobs(route).map((j) => j.id));
    const newJob = (route: string, before: Set<bigint>): Row | undefined => jobs(route).find((j) => !before.has(j.id));
    const creationState = (): Row | undefined => rows(session.conn, 'characterCreationState').find((s) => s.playerId.toHexString() === session.identityHex);
    const myCharacter = (): Row | undefined => {
      const me = rows(session.conn, 'player').find((p) => p.id.toHexString() === session.identityHex);
      if (!me || me.userId === undefined || me.userId === null) return undefined;
      return rows(session.conn, 'character').find((c) => c.ownerUserId === me.userId);
    };
    const linesSince = (seq: number): CreationLine[] => creationLines.filter((l) => l.seq > seq);

    /** Admin reducers over the HTTP call endpoint (positional arguments first, named once on a 400). */
    const callAdmin = async (reducer: string, positional: unknown[], named: Record<string, unknown>) => {
      let r = await callReducerHttp(TARGET, token as string, reducer, positional);
      if (r.status === 400) r = await callReducerHttp(TARGET, token as string, reducer, named);
      if (r.status < 200 || r.status >= 300) throw new Error(`${reducer}: HTTP ${r.status}`);
    };
    const setEnabled = async (enabled: boolean) => {
      await callAdmin('llm_set_enabled', [enabled], { enabled });
      if (!(await waitFor(() => status().llmEnabled === enabled, 10_000))) throw new Error('kill switch did not reach the requested state');
    };
    const setCeiling = async (micro: bigint) => {
      await callAdmin('llm_set_daily_ceiling', [Number(micro)], { microUsd: Number(micro) });
      if (!(await waitFor(() => BigInt(status().dailyCeilingMicroUsd) === micro, 10_000))) throw new Error('ceiling did not reach the requested value');
    };

    /** Store the fake key (so a gate bug cannot reach the real account) and wait for the status to show it. */
    const installFakeKey = async () => {
      const code = await storeKey({ target: TARGET, key: fake, token: token as string, print: out });
      if (code !== 0) throw new Error('the fake key was not stored');
      if (!(await waitFor(() => status().keySet === true && BigInt(status().keyLength) === BigInt(fake.length), 10_000))) {
        throw new Error('status does not show the fake key');
      }
    };
    /** Store the real key again through the key script (the key never leaves that process). Returns problems. */
    const restoreRealKey = async (): Promise<string[]> => {
      const r = spawnSync(process.execPath, [SET_KEY_SCRIPT, '--db', DB_NAME], {
        shell: false,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: REPO_ROOT,
      });
      for (const line of String(r.stdout ?? '').split(/\r?\n/).filter(Boolean)) out('set-key: ' + line);
      if (r.status === 2) return ['no_key_available'];
      if (r.status !== 0) return ['real_key_not_restored'];
      if (realKeyLength !== undefined && !(await waitFor(() => BigInt(status().keyLength) === realKeyLength, 10_000))) return ['real_key_length_not_seen'];
      return [];
    };

    /** A creation state waiting for the race description (login and start when none exists). */
    const ensureAtRace = async () => {
      if (myCharacter()) throw new Error('a character already exists: the scratch database must start empty');
      if (!creationState()) {
        await session.conn.reducers.loginEmail({ email: proofEmail(Date.now()) });
        await session.conn.reducers.startCreation({});
        if (!(await waitFor(() => creationState(), 15_000))) throw new Error('creation state never appeared');
      }
      if (!(await waitFor(() => creationState()?.step === 'AWAITING_RACE', 15_000))) {
        throw new Error('creation is not at AWAITING_RACE (' + String(creationState()?.step) + ')');
      }
    };

    const callLog = async (): Promise<Row[]> => fetchCallLogRows(TARGET, token as string);
    const leaksIn = (lines: CreationLine[]): string[] => [...new Set(lines.flatMap((l) => leakHits(l.message)))];

    const stored = readStored();
    const entries = [...stored.drills.map((d) => ({ ...d }))] as { name: string; status: string; reason?: string; evidence?: Record<string, unknown> }[];
    const drillJobIds: Record<string, string[]> = { ...stored.jobIds };
    let startingCeiling: bigint | undefined = stored.startingCeilingMicroUsd === undefined ? undefined : BigInt(stored.startingCeilingMicroUsd);
    /** The ceiling to restore: the recorded start, else today's value unless a crashed drill left the minimum there. */
    const resolveStartingCeiling = (): bigint => {
      if (startingCeiling !== undefined) return startingCeiling;
      const now = BigInt(status().dailyCeilingMicroUsd);
      startingCeiling = now === CEILING_DRILL_MICRO_USD ? LLM_DAILY_CEILING_DEFAULT_MICRO_USD : now;
      return startingCeiling;
    };

    const writeRecord = () => {
      const body = {
        ...drillRecord(entries),
        startingCeilingMicroUsd: startingCeiling === undefined ? undefined : startingCeiling.toString(),
        jobIds: drillJobIds,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(RECORD_PATH, scrub(json(body), needles) + '\n');
    };
    const finish = (problems: string[], evidence: Record<string, unknown>, ids?: string[]): DrillResult =>
      problems.length === 0 ? { status: 'passed', evidence, jobIds: ids } : { status: 'failed', reason: problems.join(', '), evidence, jobIds: ids };

    const RUNNERS: Record<string, () => Promise<DrillResult>> = {
      // A fake key: the provider rejects it as unauthorized. Free. The player sees a coarse failure and the lock lets go.
      bad_key_401: async () => {
        const problems: string[] = [];
        const evidence: Record<string, unknown> = {};
        let ids: string[] = [];
        try {
          await ensureAtRace();
          await installFakeKey();
          const before = jobIds('creation_race');
          const seq0 = lineSeq;
          await session.conn.reducers.submitCreationInput({ text: RACE_DESCRIPTION });
          const job = await waitFor(() => newJob('creation_race', before), 15_000);
          if (!job) {
            problems.push('job_missing');
          } else {
            ids = [String(job.id)];
            const done = await waitFor(() => {
              const j = jobs('creation_race').find((x) => x.id === job.id);
              return j && isTerminalJobStatus(j.status) ? j : null;
            }, 60_000);
            problems.push(...failedJobProblems(done ?? undefined, { route: 'creation_race', bucket: 'unavailable' }));
            evidence.jobStatus = String(done?.status ?? 'timeout');
            evidence.bucket = String(done?.errorCode ?? 'none');
            const released = await waitFor(() => creationState()?.step === 'AWAITING_RACE', 30_000);
            problems.push(...lockProblems(String(creationState()?.step), 'AWAITING_RACE'));
            evidence.lockReleased = !!released;
            if (status().keyValid !== false) problems.push('key_check_still_valid');
            const mine = filterByJobIds(await callLog(), ids);
            evidence.callRows = mine.length;
            evidence.callOutcome = mine.map((r: Row) => String(r.outcome)).join(',');
            evidence.httpStatus = mine.map((r: Row) => String(r.http_status)).join(',');
            if (mine.length !== 1) problems.push('call_rows_not_one');
            else if (mine[0].outcome !== 'auth' || String(mine[0].http_status) !== '401') problems.push('row_not_a_401');
            problems.push(...zeroSpendProblems(mine));
            const lines = linesSince(seq0);
            evidence.playerLines = lines.length;
            evidence.leakRules = leaksIn(lines);
            if (lines.length === 0) problems.push('no_player_line_read_back');
            if (leaksIn(lines).length > 0) problems.push('player_line_leaks_provider_detail');
          }
        } catch (e) {
          problems.push('error: ' + errText(e));
        } finally {
          const restore = await restoreRealKey().catch((e) => ['restore_error: ' + errText(e)]);
          evidence.keyRestore = restore.length === 0 ? 'ok' : restore.join(',');
          if (restore.some((p) => p !== 'no_key_available')) problems.push(...restore);
        }
        return finish(problems, evidence, ids);
      },

      // The daily ceiling at its $0.01 minimum: refused inside the module before any call. Free.
      ceiling: async () => {
        const problems: string[] = [];
        const evidence: Record<string, unknown> = {};
        const start = resolveStartingCeiling();
        writeRecord();
        try {
          await ensureAtRace();
          await installFakeKey();
          await setCeiling(CEILING_DRILL_MICRO_USD);
          const callsBefore = (await callLog()).length;
          const jobsBefore = rows(session.conn, 'myLlmJobs').length;
          const seq0 = lineSeq;
          await session.conn.reducers.submitCreationInput({ text: RACE_DESCRIPTION });
          await sleep(4_000);
          const lines = linesSince(seq0);
          problems.push(
            ...localRefusalProblems({
              newJobCount: rows(session.conn, 'myLlmJobs').length - jobsBefore,
              newCallRowCount: (await callLog()).length - callsBefore,
            }),
          );
          problems.push(...lockProblems(String(creationState()?.step), 'AWAITING_RACE'));
          evidence.playerLines = lines.length;
          evidence.leakRules = leaksIn(lines);
          if (lines.length === 0) problems.push('no_refusal_line_read_back');
          if (leaksIn(lines).length > 0) problems.push('player_line_leaks_provider_detail');
        } catch (e) {
          problems.push('error: ' + errText(e));
        } finally {
          await setCeiling(start).catch((e) => problems.push('ceiling_restore_error: ' + errText(e)));
          const restore = await restoreRealKey().catch((e) => ['restore_error: ' + errText(e)]);
          evidence.keyRestore = restore.length === 0 ? 'ok' : restore.join(',');
          if (restore.some((p) => p !== 'no_key_available')) problems.push(...restore);
        }
        evidence.ceilingRestoredTo = start.toString();
        return finish(problems, evidence);
      },

      // The kill switch off: refused inside the module before any call. Free.
      kill_switch: async () => {
        const problems: string[] = [];
        const evidence: Record<string, unknown> = {};
        try {
          await ensureAtRace();
          await installFakeKey();
          await setEnabled(false);
          const callsBefore = (await callLog()).length;
          const jobsBefore = rows(session.conn, 'myLlmJobs').length;
          const seq0 = lineSeq;
          await session.conn.reducers.submitCreationInput({ text: RACE_DESCRIPTION });
          await sleep(4_000);
          const lines = linesSince(seq0);
          problems.push(
            ...localRefusalProblems({
              newJobCount: rows(session.conn, 'myLlmJobs').length - jobsBefore,
              newCallRowCount: (await callLog()).length - callsBefore,
            }),
          );
          problems.push(...lockProblems(String(creationState()?.step), 'AWAITING_RACE'));
          evidence.playerLines = lines.length;
          evidence.leakRules = leaksIn(lines);
          if (lines.length === 0) problems.push('no_refusal_line_read_back');
          if (leaksIn(lines).length > 0) problems.push('player_line_leaks_provider_detail');
        } catch (e) {
          problems.push('error: ' + errText(e));
        } finally {
          await setEnabled(true).catch((e) => problems.push('kill_switch_restore_error: ' + errText(e)));
          const restore = await restoreRealKey().catch((e) => ['restore_error: ' + errText(e)]);
          evidence.keyRestore = restore.length === 0 ? 'ok' : restore.join(',');
          if (restore.some((p) => p !== 'no_key_available')) problems.push(...restore);
        }
        return finish(problems, evidence);
      },

      // A build with the temporary 50 ms creation_race timeout, with the fake key stored: the request cannot finish.
      tiny_timeout: async () => {
        const problems: string[] = [];
        const evidence: Record<string, unknown> = {};
        let ids: string[] = [];
        try {
          await ensureAtRace();
          await installFakeKey();
          const ledgerBefore = { ...status() };
          const before = jobIds('creation_race');
          const seq0 = lineSeq;
          await session.conn.reducers.submitCreationInput({ text: RACE_DESCRIPTION });
          const job = await waitFor(() => newJob('creation_race', before), 15_000);
          if (!job) {
            problems.push('job_missing');
          } else {
            ids = [String(job.id)];
            const done = await waitFor(() => {
              const j = jobs('creation_race').find((x) => x.id === job.id);
              return j && isTerminalJobStatus(j.status) ? j : null;
            }, 60_000);
            problems.push(...failedJobProblems(done ?? undefined, { route: 'creation_race', bucket: 'transient' }));
            evidence.jobStatus = String(done?.status ?? 'timeout');
            evidence.bucket = String(done?.errorCode ?? 'none');
            const released = await waitFor(() => creationState()?.step === 'AWAITING_RACE', 30_000);
            problems.push(...lockProblems(String(creationState()?.step), 'AWAITING_RACE'));
            evidence.lockReleased = !!released;
            await waitFor(() => BigInt(status().inFlight) === 0n && BigInt(status().phaseReservedMicroUsd) === BigInt(ledgerBefore.phaseReservedMicroUsd), 10_000);
            const mine = filterByJobIds(await callLog(), ids);
            evidence.callRows = mine.length;
            evidence.callOutcome = mine.map((r: Row) => String(r.outcome)).join(',');
            if (mine.length !== 1) problems.push('call_rows_not_one');
            else problems.push(...timeoutLedgerProblems(ledgerBefore, status(), mine[0]));
            evidence.standInMicroUsd = mine.length === 1 ? String(mine[0].cost_micro_usd) : 'none';
            problems.push(...zeroSpendProblems(mine));
            if (mine.length === 1 && mine[0].outcome !== 'timeout') evidence.hint = 'the published build probably lacks the temporary tiny timeout';
            const lines = linesSince(seq0);
            evidence.playerLines = lines.length;
            evidence.leakRules = leaksIn(lines);
            if (lines.length === 0) problems.push('no_player_line_read_back');
            if (leaksIn(lines).length > 0) problems.push('player_line_leaks_provider_detail');
          }
        } catch (e) {
          problems.push('error: ' + errText(e));
        } finally {
          const restore = await restoreRealKey().catch((e) => ['restore_error: ' + errText(e)]);
          evidence.keyRestore = restore.length === 0 ? 'ok' : restore.join(',');
          if (restore.some((p) => p !== 'no_key_available')) problems.push(...restore);
        }
        return finish(problems, evidence, ids);
      },

      // Read only: the final status against what the drills started from, and zero spend over every drill call-log row.
      restore_check: async () => {
        const problems: string[] = [];
        const evidence: Record<string, unknown> = {};
        try {
          const expected = { keyLength: realKeyLength, ceilingMicroUsd: resolveStartingCeiling() };
          const s = status();
          problems.push(...assertRestored(s, expected));
          if (BigInt(s.inFlight) !== 0n) problems.push('jobs_still_in_flight');
          evidence.keySet = s.keySet === true;
          evidence.keyLength = String(s.keyLength);
          evidence.expectedKeyLength = realKeyLength === undefined ? 'unknown' : realKeyLength.toString();
          evidence.ceiling = String(s.dailyCeilingMicroUsd);
          evidence.expectedCeiling = expected.ceilingMicroUsd.toString();
          evidence.llmEnabled = s.llmEnabled === true;
          const all = Object.values(drillJobIds).flat();
          const mine = filterByJobIds(await callLog(), all);
          evidence.drillJobs = all.length;
          evidence.drillCallRows = mine.length;
          problems.push(...zeroSpendProblems(mine));
          if (realKeyLength === undefined) evidence.restore = 'no_key_available';
        } catch (e) {
          problems.push('error: ' + errText(e));
        }
        return finish(problems, evidence);
      },
    };

    // --- run the named steps, merging each result into the record -----------------------------------
    const ran: { name: string; status: string }[] = [];
    for (const name of WANTED) {
      expect(DRILLS.includes(name) || name === 'restore_check', 'a runner exists for ' + name).toBe(true);
      let result: DrillResult;
      try {
        result = await RUNNERS[name]();
      } catch (e) {
        result = { status: 'failed', reason: 'error: ' + errText(e) };
      }
      const entry = { name, status: result.status, reason: result.reason, evidence: result.evidence };
      const at = entries.findIndex((x) => x.name === name);
      if (at === -1) entries.push(entry);
      else entries[at] = entry;
      if (result.jobIds) drillJobIds[name] = result.jobIds;
      out(`drill ${name}: ${result.status}${result.reason ? ' (' + result.reason + ')' : ''}`);
      ran.push({ name, status: result.status });
      writeRecord();
    }

    const final = status();
    out(
      `final status: keySet=${final.keySet} keyLength=${final.keyLength} ceiling=${final.dailyCeilingMicroUsd} enabled=${final.llmEnabled} inFlight=${final.inFlight}`,
    );
    session.conn.disconnect();
    expect(
      ran.filter((r) => r.status !== 'passed'),
      'drills that did not pass',
    ).toEqual([]);
  });
});
