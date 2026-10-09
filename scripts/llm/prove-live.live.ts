// Local live-proof harness (Plan 41-15, OPS-01; staged for Phase 43 and the scratch database in Plan 44-05, QUAL-02).
// Run from the repo root. ALWAYS pass the "prove-live" filter, because the live config includes every *.live.ts file.
//
//   pnpm exec vitest run --config scripts/llm/vitest.live.config.ts prove-live                       # dry: no spend
//   PROVE_LIVE_RUN=run pnpm exec vitest run --config scripts/llm/vitest.live.config.ts prove-live    # PAID (Plan 44-09, after approval)
//
// PROVE_LIVE_RUN selects the mode. Unset or empty is the free dry run; the value run is the paid run; anything
// else throws before anything happens (the retired dry flag no longer exists).
// LLM_LIVE_DB selects the local database: uwr-verify (default, the scratch database) or uwr. A paid run only ever
// targets uwr-verify; the free dry run may read either. Any other value throws.
//
// Dry mode connects, reads the admin status row, prints the step plan and the worst-case cost bound, calls no
// reducer and disconnects. Paid mode drives the REAL player reducers through the generated bindings as the CLI
// identity (an admin), waits on the player's own job view (my_llm_jobs) and on domain tables, and runs the Phase 43
// staged flow: creation race, class reveal (stage 1), class fill (stage 2), world start (stage 1), places fill
// (stage 2a) and creature families (stage 2b, Phase 51.3.1.2 D-01), a second region reached by exploring, NPC chat
// plus a burst of sequential turns, combat narration, renown, skills and the /llm stats command. Each stage is timed
// separately. Since Phase 51.3.1.2 a new character is placed only once the families land (D-17), and travel from the
// crossing into a new region is refused until that region is COMPLETE (D-15). Before every paid step it
// checks both today's held spend against the global daily ceiling and this run's own spend against the fixed
// PROOF_RUN_CAP_MICRO_USD (the admin-set ceiling is never the harness's only bound).
//
// Local server only. The CLI token is obtained in-process and never printed; every printed or recorded string
// goes through scrub() and a 120 character cap; prompts, completions, the token and the key are never printed
// or written. The pronoun and tone rules run on the real replies the harness observes, and only rule ids are
// recorded, never the text.
//
// To add a step: add its name to PROOF_STEPS in proof_rules.mjs, add a runner to RUNNERS below, and call
// `paidStep(step)` first, then `jobIds`, `settleJob` and `waitFor`.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DbConnection } from '../../src/module_bindings/index.ts';
import { REPO_ROOT, TARGETS, getCliToken, scrub } from './cli.mjs';
import {
  CREATION_ORDER,
  NPC_BURST_TURNS,
  PROOF_RUN_CAP_MICRO_USD,
  PROOF_SPEND_MARGIN_MICRO_USD,
  PROOF_STEPS,
  assertRunTarget,
  burstSampleVerdict,
  excerpt,
  expectedSmokeCount,
  heldAllTimeMicroUsd,
  heldTodayMicroUsd,
  isTerminalJobStatus,
  plannedCallCounts,
  worstCaseMicroUsd,
  proofCharacterName,
  proofBoundReport,
  proofEmail,
  proofVerdict,
  resolveProofDb,
  resolveProveMode,
  shouldStopForRunCap,
  shouldStopForSpend,
  smokeAllOk,
  summarizeSmoke,
  todayUtcString,
} from './proof_rules.mjs';
import { observedRuleIds } from './proof_observed.mjs';
import { REGION_HOLD_REFUSED_LINE } from '../../spacetimedb/src/helpers/region_hold';

// Throw on an unknown mode or database before anything else runs.
const MODE = resolveProveMode(process.env.PROVE_LIVE_RUN);
const DB_NAME = resolveProofDb(process.env.LLM_LIVE_DB);
assertRunTarget(MODE, DB_NAME);
const DRY = MODE === 'dry';

const TARGET = TARGETS.local;
const WS_URI = 'ws://127.0.0.1:3000';
const RESULTS_PATH = path.join(REPO_ROOT, '.planning', 'phases', '44-live-verification-and-tone-eval', '44-live-results.json');

// Tables and views the steps read. Views need their own explicit subscription; event tables are subscribed apart.
const SUBSCRIPTIONS = [
  'my_llm_jobs',
  'admin_llm_status',
  'player',
  'character_creation_state',
  'world_gen_state',
  'character',
  'region',
  'location',
  'location_connection',
  'enemy_spawn',
  'enemy_template',
  'npc',
  'npc_dialog',
  'combat_encounter',
  'combat_narrative',
  'renown',
  'pending_renown_perk',
  'pending_skill',
].map((t) => 'SELECT * FROM ' + t);
const EVENT_SUBSCRIPTIONS = ['SELECT * FROM event_private'];

const RACE_DESCRIPTION = 'A quiet folk of river-dwelling tinkers with silver hair, webbed hands and a love of small machines.';
const NPC_MESSAGE = 'Greetings. Who are you, and what do you do here?';
// Plain player lines for the sequential burst (one per turn; the burst length is NPC_BURST_TURNS).
const BURST_MESSAGES = [
  'What news is there from the road?',
  'How long have you lived here?',
  'Is the water safe to drink?',
  'Tell me about the nearest town.',
  'Who runs this place?',
  'Have you seen anything strange lately?',
  'What do people here eat?',
  'Is there work for someone like me?',
  'What is the weather like this time of year?',
  'Do you know any old stories?',
  'Where does that path lead?',
  'What would you trade for a good meal?',
  'Is it dangerous to travel at night?',
  'Who taught you your trade?',
  'What do you make of the Keeper?',
  'Do you have family nearby?',
  'What is the best thing about this place?',
  'What is the worst?',
  'Where should I sleep tonight?',
  'Thank you. That is all for now.',
];

type Row = Record<string, any>;
interface StepResult {
  step: string;
  route: string;
  ok: boolean;
  jobStatus: string;
  elapsedMs: number;
  note?: string;
  detail?: Record<string, unknown>;
}
interface JobTrack {
  route: string;
  jobId: string;
  status: string;
  calledAtMs: number;
  firstSeenMs: number;
  terminalMs?: number;
  partial: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The privately seen event lines (event_private is an event table: rows only arrive as inserts). */
const privateEvents: { characterId: bigint; kind: string; message: string; seq: number }[] = [];
let eventSeq = 0;

/** Connect with the CLI token to the chosen local database and wait until every subscription is applied. */
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
              c.db.eventPrivate.onInsert((_ctx: any, row: any) => {
                eventSeq += 1;
                privateEvents.push({ characterId: row.characterId, kind: String(row.kind), message: String(row.message), seq: eventSeq });
                if (privateEvents.length > 200) privateEvents.shift();
              });
              c.subscriptionBuilder().subscribe(EVENT_SUBSCRIPTIONS);
            } catch {
              // The /llm stats step reports accepted-only when the event table is unreachable.
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

function statusRows(conn: any): Row[] {
  return rows(conn, 'adminLlmStatus');
}

function statusLine(s: Row): string {
  return (
    `keySet=${s.keySet} keyValid=${s.keyValid} keyLength=${s.keyLength} ` +
    `spentToday=${heldTodayMicroUsd({ ...s, phaseReservedMicroUsd: 0n }, todayUtcString(Date.now()))} ` +
    `reserved=${s.phaseReservedMicroUsd} ceiling=${s.dailyCeilingMicroUsd} enabled=${s.llmEnabled} ` +
    `calls=${s.phaseCalls} inFlight=${s.inFlight}`
  );
}

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2);
const usd = (micro: bigint | number): string => '$' + (Number(micro) / 1_000_000).toFixed(4);

/**
 * The worst-case cost of the whole planned run: every planned call at its full reservation (no retries exist).
 * The pricing is proof_rules.mjs worstCaseMicroUsd, so the free unit test checks the same bound this prints.
 */
function worstCaseBound(): { total: bigint; lines: string[] } {
  const bound = worstCaseMicroUsd(plannedCallCounts());
  return { total: bound.total, lines: bound.lines.map((l: { route: string; calls: number; eachMicroUsd: bigint }) => `  ${l.route}: ${l.calls} call(s) x ${usd(l.eachMicroUsd)}`) };
}

describe('live proof (local server only)', () => {
  it(DRY ? 'dry run: step plan, cost bound and admin_llm_status for the CLI identity, no spend' : 'paid run: the staged flow, every domain once', async () => {
    // --- setup: local only, token in memory only -------------------------------------------------
    expect(TARGET.name).toBe('local');
    expect(TARGET.httpBase.startsWith('http://127.0.0.1')).toBe(true);
    const ping = await fetch(TARGET.httpBase + '/v1/ping').catch(() => null);
    expect(ping?.status, 'local server must answer /v1/ping (start it first)').toBe(200);
    const token = getCliToken();
    expect(token, 'no CLI login token (run spacetime login)').toBeTruthy();
    const needle = [token as string];

    const out = (line: string) => console.log(scrub(line, needle));
    out(`mode: ${MODE}, database: ${DB_NAME}, server: local`);

    const session: { conn: any; identityHex: string } = await connect(token as string);
    const status = (): Row => statusRows(session.conn)[0];

    // --- A1 proof: the CLI identity reads exactly one admin status row ---------------------------
    const first = statusRows(session.conn);
    out('admin_llm_status rows: ' + first.length);
    expect(first.length, 'admin_llm_status is empty: the CLI identity is not an admin (assumption A1 fails)').toBe(1);
    out('status: ' + statusLine(first[0]));

    if (DRY) {
      const bound = worstCaseBound();
      out('dry mode: no reducer is called. Step plan: ' + PROOF_STEPS.join(' > '));
      out(`smoke routes expected: ${expectedSmokeCount()}; NPC burst turns: ${NPC_BURST_TURNS}`);
      out('planned real calls per route:\n' + bound.lines.join('\n'));
      out(
        `worst-case cost bound (every planned call at its full reservation, no retries): ${usd(bound.total)}; ` +
          'expected spend about $0.30 to $0.60',
      );
      out(
        `spend margin: ${PROOF_SPEND_MARGIN_MICRO_USD} micro-USD under the daily ceiling and under the run cap of ${PROOF_RUN_CAP_MICRO_USD} micro-USD ` +
          `(cap ${usd(PROOF_RUN_CAP_MICRO_USD)}, stop line ${usd(PROOF_RUN_CAP_MICRO_USD - PROOF_SPEND_MARGIN_MICRO_USD)})`,
      );
      // Owner deferral (51.3.1.2 D-19): print the bound and the note; the free dry run never fails on it (review B, WR-04).
      out(proofBoundReport(bound.total));
      session.conn.disconnect();
      return;
    }

    expect(first[0].keySet, 'no key set: set it with scripts/llm/set-key.mjs --db uwr-verify first').toBe(true);

    // --- paid mode ---------------------------------------------------------------------------------
    const results: StepResult[] = [];
    const notes: string[] = [];
    const stages: Record<string, number | null> = {};
    const burstSamples: { turn: number; ok: boolean; jobStatus: string; turnMs: number }[] = [];
    const observed: { checked: number; hits: { kind: string; source: string; id: string; rules: string[] }[] } = { checked: 0, hits: [] };
    const observedKeys = new Set<string>();
    const detailFlags: Record<string, unknown> = {};
    let smokeSummary: { total: number; ok: number; failed: string[] } | undefined;
    let stopped = '';
    let timeToPlayableMs: number | null = null;
    // This run's own spend is measured from here, on all-time figures (they never reset at UTC midnight).
    const runStartHeld = heldAllTimeMicroUsd(first[0]);
    const runStartMs = Date.now();
    let runEndMs = runStartMs;

    const waitFor = async <T>(pred: () => T | null | undefined | false, timeoutMs: number): Promise<T | null> => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const v = pred();
        if (v) return v as T;
        if (Date.now() >= deadline) return null;
        await sleep(250);
      }
    };
    const jobs = (route: string): Row[] => rows(session.conn, 'myLlmJobs').filter((j) => j.route === route);
    const jobIds = (route: string): Set<bigint> => new Set(jobs(route).map((j) => j.id));
    const newJob = (route: string, before: Set<bigint>): Row | undefined => jobs(route).find((j) => !before.has(j.id));
    const creationState = (): Row | undefined => rows(session.conn, 'characterCreationState').find((s) => s.playerId.toHexString() === session.identityHex);
    const creationIndex = (): number => CREATION_ORDER.indexOf(String(creationState()?.step ?? ''));
    const creationReached = (step: string): boolean => creationIndex() >= CREATION_ORDER.indexOf(step);
    const myCharacter = (): Row | undefined => {
      const me = rows(session.conn, 'player').find((p) => p.id.toHexString() === session.identityHex);
      if (!me || me.userId === undefined || me.userId === null) return undefined;
      return rows(session.conn, 'character').find((c) => c.ownerUserId === me.userId);
    };
    const locationById = (id: bigint): Row | undefined => rows(session.conn, 'location').find((l) => l.id === id);
    const genStatesFor = (characterId: bigint): Row[] =>
      rows(session.conn, 'worldGenState').filter((s) => s.characterId === characterId).sort((a, b) => (a.id < b.id ? -1 : 1));

    // --- per-job tracking: id, route, status and observed end-to-end time (the view has no finished time) ---
    const callMarks: Record<string, number> = {};
    const jobTrack = new Map<string, JobTrack>();
    /** Mark the moment a reducer call that causes a job of this route is made. */
    const markCall = (route: string) => {
      callMarks[route] = Date.now();
    };
    const pollJobs = () => {
      let list: Row[] = [];
      try {
        list = rows(session.conn, 'myLlmJobs');
      } catch {
        return;
      }
      const now = Date.now();
      for (const j of list) {
        const id = String(j.id);
        const terminal = isTerminalJobStatus(j.status);
        let t = jobTrack.get(id);
        if (!t) {
          const marked = callMarks[j.route];
          if (marked !== undefined) delete callMarks[j.route];
          t = { route: String(j.route), jobId: id, status: String(j.status), calledAtMs: marked ?? now, firstSeenMs: now, partial: terminal };
          jobTrack.set(id, t);
        }
        t.status = String(j.status);
        if (terminal && t.terminalMs === undefined) t.terminalMs = now;
      }
    };
    const poller = setInterval(pollJobs, 250);

    /**
     * The spend checks before every paid step: today's held spend against the daily ceiling, and this run's own
     * spend against the fixed run cap (both minus the margin). Returns true when the step may run.
     */
    const paidStep = (step: string): boolean => {
      const s = status();
      if (shouldStopForSpend(heldTodayMicroUsd(s, todayUtcString(Date.now())), 0n, s.dailyCeilingMicroUsd, PROOF_SPEND_MARGIN_MICRO_USD)) {
        stopped = `spend guard before ${step}: today's held spend reached the daily ceiling minus margin`;
        return false;
      }
      if (shouldStopForRunCap(runStartHeld, heldAllTimeMicroUsd(s), PROOF_RUN_CAP_MICRO_USD, PROOF_SPEND_MARGIN_MICRO_USD)) {
        stopped = `spend guard before ${step}: this run reached its own cap minus margin`;
        return false;
      }
      return true;
    };

    /** Wait for a route's new job to reach a terminal status; returns its status ('missing' when none appeared). */
    const settleJob = async (route: string, before: Set<bigint>, appearMs: number, terminalMs: number): Promise<string> => {
      const job = await waitFor(() => newJob(route, before), appearMs);
      if (!job) return 'missing';
      const done = await waitFor(() => {
        const j = jobs(route).find((x) => x.id === job.id);
        return j && isTerminalJobStatus(j.status) ? j : null;
      }, terminalMs);
      return done ? String(done.status) : 'timeout';
    };

    const jobRecords = () =>
      [...jobTrack.values()].map((t) => ({
        route: t.route,
        jobId: t.jobId,
        status: t.status,
        observedMs: t.terminalMs !== undefined ? t.terminalMs - t.calledAtMs : null,
        partial: t.partial || undefined,
      }));

    const writeResults = () => {
      runEndMs = Date.now();
      const s = statusRows(session.conn)[0];
      const records = jobRecords();
      const jobIdsByRoute: Record<string, string[]> = {};
      for (const r of records) (jobIdsByRoute[r.route] ??= []).push(r.jobId);
      const verdict = proofVerdict(results);
      const okBurst = burstSamples.filter((b) => b.ok).length;
      const body = {
        target: 'local',
        database: DB_NAME,
        mode: MODE,
        window: { startMs: runStartMs, endMs: runEndMs, startedAt: new Date(runStartMs).toISOString(), endedAt: new Date(runEndMs).toISOString() },
        steps: results,
        stages,
        timeToPlayableMs,
        smoke: smokeSummary,
        jobs: records,
        jobIds: jobIdsByRoute,
        burst: { turns: NPC_BURST_TURNS, samples: burstSamples, ...burstSampleVerdict(okBurst) },
        observedChecks: observed,
        flags: detailFlags,
        verdict,
        notes,
        stopped: stopped || undefined,
        finalStatus: s ? { ...s, keyUpdatedAt: undefined, keyVerifiedAt: undefined, lastSmokeAt: undefined } : undefined,
      };
      fs.writeFileSync(RESULTS_PATH, scrub(json(body), needle) + '\n');
    };

    const record = (r: StepResult) => {
      results.push(r);
      out(`step ${r.step}: route=${r.route} job=${r.jobStatus} ok=${r.ok} elapsed=${r.elapsedMs}ms` + (r.note ? ' note=' + excerpt(scrub(r.note, needle)) : ''));
      writeResults();
    };

    const timed = async (
      step: string,
      route: string,
      body: () => Promise<{ ok: boolean; jobStatus: string; note?: string; detail?: Record<string, unknown> }>,
    ): Promise<void> => {
      const t0 = Date.now();
      try {
        const r = await body();
        record({ step, route, ok: r.ok, jobStatus: r.jobStatus, elapsedMs: Math.max(1, Date.now() - t0), note: r.note, detail: r.detail });
      } catch (e) {
        record({ step, route, ok: false, jobStatus: 'error', elapsedMs: Math.max(1, Date.now() - t0), note: String((e as Error)?.message ?? e) });
      }
    };

    /** A step that cannot run is recorded as failed with the reason, never as skipped or passed. */
    const failStep = (step: string, route: string, note: string) => {
      record({ step, route, ok: false, jobStatus: 'none', elapsedMs: 1, note });
    };

    /** Apply the pronoun and tone rules to one observed text; records rule ids only, once per source row. */
    const observe = (kind: string, source: string, id: unknown, text: unknown, info: Record<string, unknown> = {}) => {
      if (typeof text !== 'string' || text.trim() === '') return;
      const key = `${kind}:${source}:${String(id)}`;
      if (observedKeys.has(key)) return;
      observedKeys.add(key);
      observed.checked += 1;
      const rules = observedRuleIds(kind, text, info);
      if (rules.length > 0) observed.hits.push({ kind, source, id: String(id), rules });
    };
    /** The generated text of one region: its locations, its NPC descriptions and greetings, its landmarks and threats. */
    const observeRegion = (regionId: bigint) => {
      const region = rows(session.conn, 'region').find((r) => r.id === regionId);
      if (region) observe('region_text', 'region', region.id, [region.landmarks, region.threats].filter(Boolean).join('. '));
      const locs = rows(session.conn, 'location').filter((l) => l.regionId === regionId);
      const locIds = new Set(locs.map((l) => l.id));
      for (const l of locs) observe('region_text', 'location', l.id, l.description);
      for (const n of rows(session.conn, 'npc').filter((x) => locIds.has(x.locationId))) {
        observe('npc_description', 'npc', n.id, n.description, { npcGender: n.gender });
        observe('npc_line', 'npc_greeting', n.id, n.greeting, { npcGender: n.gender });
      }
    };

    // --- movement helpers: breadth-first over location_connection, never stepping through uncharted ground ---
    const isUncharted = (loc: Row | undefined): boolean => !loc || loc.terrainType === 'uncharted';
    const findPath = (from: bigint, goal: (loc: Row) => boolean, maxDepth = 8): bigint[] | null => {
      const here = locationById(from);
      if (here && goal(here)) return [];
      const connections = rows(session.conn, 'locationConnection');
      const parent = new Map<bigint, bigint | null>([[from, null]]);
      let frontier: bigint[] = [from];
      for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
        const next: bigint[] = [];
        for (const node of frontier) {
          for (const c of connections.filter((x) => x.fromLocationId === node)) {
            const to: bigint = c.toLocationId;
            if (parent.has(to)) continue;
            const loc = locationById(to);
            if (!loc) continue;
            if (isUncharted(loc) && !goal(loc)) continue;
            parent.set(to, node);
            if (goal(loc)) {
              const p: bigint[] = [];
              for (let cur: bigint | null = to; cur !== null && cur !== from; cur = parent.get(cur) ?? null) p.unshift(cur);
              return p;
            }
            if (!isUncharted(loc)) next.push(to);
          }
        }
        frontier = next;
      }
      return null;
    };
    const travelPath = async (characterId: bigint, hops: bigint[]): Promise<boolean> => {
      for (const hop of hops) {
        await session.conn.reducers.moveCharacter({ characterId, locationId: hop });
        if (!(await waitFor(() => myCharacter()?.locationId === hop, 20_000))) return false;
      }
      return true;
    };

    /** The NPC lines the model produced for this character and NPC (the player's own echo starts with "You:"). */
    const npcReplies = (characterId: bigint, npcId: bigint): Row[] =>
      rows(session.conn, 'npcDialog').filter((d) => d.characterId === characterId && d.npcId === npcId && !String(d.text).startsWith('You:'));

    const proofName = proofCharacterName(Date.now());
    const starter: {
      characterId?: bigint;
      regionId?: bigint;
      fillBefore?: Set<bigint>;
      familiesBefore?: Set<bigint>;
      classFillBefore?: Set<bigint>;
      fillStartedAt?: number;
      familiesStartedAt?: number;
      confirmedAt?: number;
    } = {};

    // World generation states (helpers/world_gen.ts). Phase 51.3.1.2 (D-01, D-08) put the families fill (2b) in its
    // own FILLING_FAMILIES state with its own FAMILIES_ERROR; HELD is a new character waiting on another region (D-17).
    const STAGE1_LANDED_STEPS = ['FILLING', 'FILLING_FAMILIES', 'COMPLETE', 'FILL_ERROR', 'FAMILIES_ERROR', 'ERROR', 'HELD'];
    const PLACES_DONE_STEPS = ['FILLING_FAMILIES', 'COMPLETE', 'FAMILIES_ERROR', 'FILL_ERROR', 'ERROR'];
    const REGION_DONE_STEPS = ['COMPLETE', 'FAMILIES_ERROR', 'FILL_ERROR', 'ERROR'];
    /** A region that did not complete, as a step note: its state and the stored error, capped at PROOF_EXCERPT_MAX. */
    const regionFailureNote = (st: Row | null | undefined): string => {
      if (!st) return 'the region never reached COMPLETE';
      const message = typeof st.errorMessage === 'string' ? scrub(st.errorMessage, needle) : '';
      const head = st.step === 'FAMILIES_ERROR' ? 'families failed (FAMILIES_ERROR)' : `region state ${String(st.step)}`;
      return excerpt(head + (message ? ': ' + message : ''));
    };
    let chatNpc: Row | undefined;

    /** One NPC chat turn: call, wait for the job and the reply line, check the line. Returns the observed result. */
    const chatTurn = async (character: Row, npc: Row, message: string) => {
      const before = jobIds('npc_conversation');
      const repliesBefore = new Set(npcReplies(character.id, npc.id).map((d) => d.id));
      const t0 = Date.now();
      markCall('npc_conversation');
      await session.conn.reducers.talkToNpc({ characterId: character.id, npcId: npc.id, message });
      const jobStatus = await settleJob('npc_conversation', before, 10_000, 120_000);
      const line = await waitFor(() => npcReplies(character.id, npc.id).find((d) => !repliesBefore.has(d.id)), 15_000);
      if (line) observe('npc_line', 'npc_reply', line.id, String(line.text), { npcGender: npc.gender });
      return { jobStatus, line, turnMs: Date.now() - t0 };
    };

    const RUNNERS: Record<string, () => Promise<void>> = {
      smoke: async () => {
        if (!paidStep('smoke')) return;
        await timed('smoke', 'smoke_test', async () => {
          const smokeAtBefore = String(status().lastSmokeAt?.microsSinceUnixEpoch ?? 0);
          markCall('smoke_test');
          await session.conn.reducers.llmSmokeTest({});
          // A refused or already-running smoke test leaves the earlier summary in place, so wait for a new run stamp.
          const done = await waitFor(() => {
            const s = status();
            if (String(s.lastSmokeAt?.microsSinceUnixEpoch ?? 0) === smokeAtBefore) return null;
            const sum = summarizeSmoke(s.lastSmokeJson);
            return sum.total >= expectedSmokeCount() ? sum : null;
          }, 300_000);
          if (!done) return { ok: false, jobStatus: 'timeout', note: `smoke summary never reached ${expectedSmokeCount()} entries` };
          smokeSummary = done;
          const okAll = smokeAllOk(status().lastSmokeJson) && status().keyValid === true;
          return {
            ok: okAll,
            jobStatus: 'completed',
            note: `routes ok ${done.ok}/${done.total} (expected ${expectedSmokeCount()})` + (done.failed.length ? ' failed: ' + done.failed.join(',') : ''),
          };
        });
        if (!status().keyValid) stopped = 'smoke test left the key unproven: no further paid steps';
      },

      creation_race: async () => {
        if (myCharacter()) {
          failStep('creation_race', 'creation_race', 'a character already exists for this identity: the scratch database must start empty so creation runs for real');
          return;
        }
        if (!paidStep('creation_race')) return;
        await timed('creation_race', 'creation_race', async () => {
          const before = jobIds('creation_race');
          if (!creationState()) {
            await session.conn.reducers.loginEmail({ email: proofEmail(Date.now()) });
            await session.conn.reducers.startCreation({});
            if (!(await waitFor(() => creationState(), 15_000))) return { ok: false, jobStatus: 'none', note: 'creation state never appeared' };
          }
          if (creationState()?.step === 'AWAITING_RACE') {
            markCall('creation_race');
            await session.conn.reducers.submitCreationInput({ text: RACE_DESCRIPTION });
          }
          const reached = await waitFor(() => creationReached('AWAITING_ARCHETYPE'), 120_000);
          const jobStatus = await settleJob('creation_race', before, 5_000, 30_000);
          return { ok: !!reached, jobStatus, note: reached ? undefined : 'creation did not reach AWAITING_ARCHETYPE' };
        });
      },

      // Stage 1 of the class: the reveal (name, description, first ability). Timed to the CLASS_FILLING state.
      creation_class_reveal: async () => {
        if (!creationReached('AWAITING_ARCHETYPE')) {
          failStep('creation_class_reveal', 'creation_class_reveal', 'creation never reached AWAITING_ARCHETYPE');
          return;
        }
        if (!paidStep('creation_class_reveal')) return;
        await timed('creation_class_reveal', 'creation_class_reveal', async () => {
          const before = jobIds('creation_class_reveal');
          starter.classFillBefore = jobIds('creation_class');
          const t0 = Date.now();
          if (creationState()?.step === 'AWAITING_ARCHETYPE') {
            markCall('creation_class_reveal');
            await session.conn.reducers.submitCreationInput({ text: 'Warrior' });
          }
          const landed = await waitFor(() => {
            const s = creationState();
            if (!s) return null;
            if (s.step === 'CLASS_FILL_ERROR' || creationReached('CLASS_REVEALED')) return s;
            return s.step === 'CLASS_FILLING' && s.abilities ? s : null;
          }, 120_000);
          const revealMs = Date.now() - t0;
          stages.creationRevealMs = landed ? revealMs : null;
          const jobStatus = await settleJob('creation_class_reveal', before, 5_000, 30_000);
          if (!landed) return { ok: false, jobStatus, note: 'the reveal never reached CLASS_FILLING' };
          if (landed.step === 'CLASS_FILL_ERROR') return { ok: false, jobStatus, note: 'the fill failed straight after the reveal (CLASS_FILL_ERROR)' };
          let firstAbility = '';
          try {
            const list = JSON.parse(String(landed.abilities ?? '[]'));
            firstAbility = String(list[0]?.name ?? list[0]?.abilityName ?? '');
          } catch {
            firstAbility = '';
          }
          starter.fillStartedAt = Date.now();
          return {
            ok: !!firstAbility,
            jobStatus,
            note: firstAbility ? `stage 1 landed in ${revealMs}ms with the first ability visible` : 'the reveal carried no first ability',
            detail: { stage1Ms: revealMs },
          };
        });
      },

      // Stage 2 of the class: the fill (stats and two more abilities). Timed from the reveal to CLASS_REVEALED.
      creation_class: async () => {
        if (!creationReached('CLASS_FILLING')) {
          failStep('creation_class', 'creation_class', 'creation never reached CLASS_FILLING');
          return;
        }
        if (!paidStep('creation_class')) return;
        await timed('creation_class', 'creation_class', async () => {
          const before = starter.classFillBefore ?? new Set<bigint>(); // the fill job is created when the reveal applies
          const t0 = starter.fillStartedAt ?? Date.now();
          const revealed = await waitFor(() => {
            const s = creationState();
            return s && (s.step === 'CLASS_FILL_ERROR' || creationReached('CLASS_REVEALED')) ? s : null;
          }, 120_000);
          stages.creationFillMs = revealed && revealed.step !== 'CLASS_FILL_ERROR' ? Date.now() - t0 : null;
          const jobStatus = await settleJob('creation_class', before, 5_000, 30_000);
          if (!revealed || revealed.step === 'CLASS_FILL_ERROR') {
            return { ok: false, jobStatus, note: revealed ? 'the fill failed (CLASS_FILL_ERROR)' : 'creation did not reach CLASS_REVEALED' };
          }
          let abilityName = '';
          try {
            const list = JSON.parse(String(creationState()?.abilities ?? '[]'));
            abilityName = String(list[0]?.name ?? list[0]?.abilityName ?? '');
          } catch {
            abilityName = '';
          }
          if (!abilityName) return { ok: false, jobStatus, note: 'no ability name in the offered abilities' };
          if (creationState()?.step === 'CLASS_REVEALED') await session.conn.reducers.submitCreationInput({ text: abilityName });
          await waitFor(() => creationReached('AWAITING_NAME'), 15_000);
          if (creationState()?.step === 'AWAITING_NAME') await session.conn.reducers.submitCreationInput({ text: proofName });
          const named = await waitFor(() => creationReached('CONFIRMING'), 15_000);
          return {
            ok: !!named,
            jobStatus,
            note: named ? 'ability offered, name accepted, awaiting confirm' : 'name was not accepted',
            detail: { stage2Ms: stages.creationFillMs },
          };
        });
      },

      // Stage 1 of the starter region: confirm, then time to the stage 1 landing (FILLING). Also the tab-close check.
      // Phase 51.3.1.2 (D-17): a new character is placed only once the places and the families are in, so it is
      // normally still at location 0 here; that is expected and never fails this step.
      world_gen_start: async () => {
        if (!creationReached('CONFIRMING') || myCharacter()) {
          failStep('world_gen_start', 'world_gen_start', myCharacter() ? 'a character already exists before confirm' : 'creation never reached CONFIRMING');
          return;
        }
        if (!paidStep('world_gen_start')) return;
        await timed('world_gen_start', 'world_gen_start', async () => {
          const regionsBefore = rows(session.conn, 'region').length;
          const before = jobIds('world_gen_start');
          starter.fillBefore = jobIds('world_gen');
          starter.familiesBefore = jobIds('world_gen_families');
          const tConfirm = Date.now();
          starter.confirmedAt = tConfirm;
          markCall('world_gen_start');
          await session.conn.reducers.submitCreationInput({ text: 'confirm' });
          const character = await waitFor(() => myCharacter(), 30_000);
          if (!character) return { ok: false, jobStatus: 'none', note: 'no character after confirm' };
          starter.characterId = character.id;
          // Stage 1 has landed once the state leaves PENDING and GENERATING (FILLING, or later if the fills are quick).
          const landed = await waitFor(() => {
            const st = genStatesFor(character.id)[0];
            return st && STAGE1_LANDED_STEPS.includes(String(st.step)) ? st : null;
          }, 120_000);
          const stage1Ms = landed ? Date.now() - tConfirm : null;
          stages.worldStartMs = stage1Ms;
          if (!landed) return { ok: false, jobStatus: await settleJob('world_gen_start', before, 2_000, 5_000), note: 'stage 1 never landed (no FILLING state)' };
          if (landed.step === 'ERROR') return { ok: false, jobStatus: await settleJob('world_gen_start', before, 2_000, 5_000), note: 'stage 1 failed (ERROR)' };
          if (landed.step === 'HELD') return { ok: false, jobStatus: await settleJob('world_gen_start', before, 2_000, 5_000), note: 'held behind another starter region: the scratch database must start empty' };
          starter.fillStartedAt = Date.now();
          starter.regionId = landed.generatedRegionId ?? locationById(myCharacter()?.locationId ?? 0n)?.regionId;
          // D-17: the character waits in creation until the families land (recorded, never a failure here).
          detailFlags.unplacedAfterStage1 = (myCharacter()?.locationId ?? 0n) === 0n;

          // Tab-close check (PIPE-02): drop the connection while the fill runs, wait, reconnect, the region exists once.
          session.conn.disconnect();
          await sleep(20_000);
          const again = await connect(token as string);
          session.conn = again.conn;
          session.identityHex = again.identityHex;
          await waitFor(() => myCharacter(), 15_000);
          const regionsAfter = rows(session.conn, 'region').length;
          const states = genStatesFor(character.id).length;
          const oneRegion = regionsAfter - regionsBefore === 1 && states === 1;
          detailFlags.tabCloseRegionOnce = oneRegion;
          const jobStatus = await settleJob('world_gen_start', before, 5_000, 30_000);
          return {
            ok: jobStatus === 'completed' && oneRegion,
            jobStatus,
            note: excerpt(
              `stage 1 landed in ${stage1Ms}ms (${landed.step}), unplaced: ${detailFlags.unplacedAfterStage1}, reconnected after 20s, new regions ${regionsAfter - regionsBefore}, states ${states}`,
            ),
            detail: { stage1Ms },
          };
        });
      },

      // Stage 2a of the starter region: the places fill, timed from the stage 1 landing until the families start.
      world_gen: async () => {
        const characterId = starter.characterId;
        if (characterId === undefined) {
          failStep('world_gen', 'world_gen', 'no starter region was generated');
          return;
        }
        if (!paidStep('world_gen')) return;
        await timed('world_gen', 'world_gen', async () => {
          const t0 = starter.fillStartedAt ?? Date.now();
          const done = await waitFor(() => {
            const st = genStatesFor(characterId)[0];
            return st && PLACES_DONE_STEPS.includes(String(st.step)) ? st : null;
          }, 180_000);
          // FAMILIES_ERROR also means the places are in: the families step records that failure, not this one.
          const placesIn = !!done && (done.step === 'FILLING_FAMILIES' || done.step === 'COMPLETE' || done.step === 'FAMILIES_ERROR');
          stages.worldFillMs = placesIn ? Date.now() - t0 : null;
          starter.familiesStartedAt = Date.now();
          const jobStatus = await settleJob('world_gen', starter.fillBefore ?? new Set<bigint>(), 5_000, 30_000);
          return {
            ok: placesIn,
            jobStatus,
            note: `places fill ${placesIn ? 'in' : 'not in'}, state ${done?.step ?? 'none'}`,
            detail: { stage2Ms: stages.worldFillMs },
          };
        });
      },

      // Stage 2b of the starter region (Phase 51.3.1.2, D-01): the families fill, timed until COMPLETE. The new
      // character is placed only now (D-17), so time to playable is measured from the confirm to this placement.
      world_gen_families: async () => {
        const characterId = starter.characterId;
        if (characterId === undefined) {
          failStep('world_gen_families', 'world_gen_families', 'no starter region was generated');
          return;
        }
        if (!paidStep('world_gen_families')) return;
        await timed('world_gen_families', 'world_gen_families', async () => {
          const t0 = starter.familiesStartedAt ?? Date.now();
          const done = await waitFor(() => {
            const st = genStatesFor(characterId)[0];
            return st && REGION_DONE_STEPS.includes(String(st.step)) ? st : null;
          }, 180_000);
          const complete = done?.step === 'COMPLETE';
          stages.worldFamiliesMs = complete ? Date.now() - t0 : null;
          const jobStatus = await settleJob('world_gen_families', starter.familiesBefore ?? new Set<bigint>(), 5_000, 30_000);
          if (!complete) return { ok: false, jobStatus, note: regionFailureNote(done) };
          const placed = await waitFor(() => {
            const c = myCharacter();
            return c && c.locationId !== 0n ? c : null;
          }, 15_000);
          timeToPlayableMs = placed && starter.confirmedAt !== undefined ? Date.now() - starter.confirmedAt : null;
          if (placed) starter.regionId = locationById(placed.locationId)?.regionId ?? starter.regionId;
          if (starter.regionId !== undefined) observeRegion(starter.regionId);
          return {
            ok: jobStatus === 'completed' && !!placed,
            jobStatus,
            note: placed ? `families in, character placed; playable ${timeToPlayableMs}ms after confirm` : 'families in, but the character was never placed',
            detail: { stage2bMs: stages.worldFamiliesMs, timeToPlayableMs },
          };
        });
      },

      // A second region reached by exploring: move onto uncharted ground (the crossing), wait for stage 1, the places
      // and the families, and only then travel into the new region (D-15: travel is refused while it is held).
      explore_region: async () => {
        const character = myCharacter();
        if (!character || starter.regionId === undefined) {
          failStep('explore_region', 'world_gen_start', 'no starter region to explore from');
          return;
        }
        if (!paidStep('explore_region')) return;
        await timed('explore_region', 'world_gen_start', async () => {
          const path = findPath(character.locationId, (l) => l.terrainType === 'uncharted', 8);
          if (!path || path.length === 0) return { ok: false, jobStatus: 'none', note: 'no uncharted location is reachable from the character' };
          const target = path[path.length - 1];
          const startBefore = jobIds('world_gen_start');
          const fillBefore = jobIds('world_gen');
          const familiesBefore = jobIds('world_gen_families');
          const statesBefore = new Set(rows(session.conn, 'worldGenState').map((s) => s.id));
          const t0 = Date.now();
          markCall('world_gen_start');
          if (!(await travelPath(character.id, path))) return { ok: false, jobStatus: 'none', note: 'travel to the uncharted location did not complete' };
          const state = await waitFor(
            () => rows(session.conn, 'worldGenState').find((s) => !statesBefore.has(s.id) && s.sourceLocationId === target),
            30_000,
          );
          if (!state) return { ok: false, jobStatus: 'none', note: 'moving onto uncharted ground started no world generation' };
          const stateNow = () => rows(session.conn, 'worldGenState').find((s) => s.id === state.id);
          const landed = await waitFor(() => {
            const s = stateNow();
            return s && STAGE1_LANDED_STEPS.includes(String(s.step)) ? s : null;
          }, 120_000);
          stages.exploreStartMs = landed && landed.step !== 'ERROR' ? Date.now() - t0 : null;
          const t1 = Date.now();
          const placesIn = await waitFor(() => {
            const s = stateNow();
            return s && PLACES_DONE_STEPS.includes(String(s.step)) ? s : null;
          }, 180_000);
          stages.exploreFillMs =
            placesIn && (placesIn.step === 'FILLING_FAMILIES' || placesIn.step === 'COMPLETE' || placesIn.step === 'FAMILIES_ERROR') ? Date.now() - t1 : null;
          const t2 = Date.now();
          const done = await waitFor(() => {
            const s = stateNow();
            return s && REGION_DONE_STEPS.includes(String(s.step)) ? s : null;
          }, 180_000);
          const complete = done?.step === 'COMPLETE';
          stages.exploreFamiliesMs = complete ? Date.now() - t2 : null;
          const startStatus = await settleJob('world_gen_start', startBefore, 5_000, 30_000);
          const fillStatus = await settleJob('world_gen', fillBefore, 5_000, 30_000);
          const familiesStatus = await settleJob('world_gen_families', familiesBefore, 5_000, 30_000);
          const newRegionId = stateNow()?.generatedRegionId;
          const distinct = newRegionId !== undefined && newRegionId !== null && newRegionId !== starter.regionId;
          const statuses = [startStatus, fillStatus, familiesStatus];
          const jobStatus = statuses.find((s) => s !== 'completed') ?? 'completed';
          const timing = { stage1Ms: stages.exploreStartMs, stage2Ms: stages.exploreFillMs, stage2bMs: stages.exploreFamiliesMs };
          if (!complete) return { ok: false, jobStatus, note: regionFailureNote(done), detail: timing };

          // Only now step from the crossing into the new region. A hold refusal (7b) is a note, never a failure.
          let entered = false;
          let refusedNote = '';
          for (let attempt = 1; attempt <= 2 && !entered && distinct; attempt += 1) {
            const here = myCharacter();
            if (!here) break;
            const hops = findPath(here.locationId, (l) => l.regionId === newRegionId && !isUncharted(l), 4);
            if (!hops || hops.length === 0) break;
            const seqBefore = eventSeq;
            entered = await travelPath(here.id, hops);
            const refused = privateEvents.find((e) => e.seq > seqBefore && e.characterId === here.id && e.message.includes(REGION_HOLD_REFUSED_LINE));
            if (refused) {
              refusedNote = `travel refused while held (7b) on attempt ${attempt}`;
              notes.push('explore_region: ' + refusedNote);
              if (!entered) await sleep(5_000);
            }
          }
          if (distinct) observeRegion(newRegionId);
          return {
            ok: distinct && entered && jobStatus === 'completed',
            jobStatus,
            note: excerpt(
              `second region complete, distinct from the starter: ${distinct}, entered: ${entered}` + (refusedNote ? `; ${refusedNote}` : ''),
            ),
            detail: timing,
          };
        });
      },

      npc_conversation: async () => {
        const character = myCharacter();
        if (!character) {
          failStep('npc_conversation', 'npc_conversation', 'no character');
          return;
        }
        if (!paidStep('npc_conversation')) return;
        await timed('npc_conversation', 'npc_conversation', async () => {
          const npcAt = (locId: bigint) => rows(session.conn, 'npc').find((n) => n.locationId === locId);
          const path = findPath(character.locationId, (l) => !isUncharted(l) && !!npcAt(l.id), 8);
          if (path === null) return { ok: false, jobStatus: 'none', note: 'no NPC is reachable from the character' };
          if (!(await travelPath(character.id, path))) return { ok: false, jobStatus: 'none', note: 'travel to an NPC did not complete' };
          const here = myCharacter()!;
          const npc = npcAt(here.locationId);
          if (!npc) return { ok: false, jobStatus: 'none', note: 'no NPC at the character location' };
          chatNpc = npc;
          const turn = await chatTurn(here, npc, NPC_MESSAGE);
          return {
            ok: turn.jobStatus === 'completed' && !!turn.line,
            jobStatus: turn.jobStatus,
            note: turn.line ? 'npc line: ' + excerpt(scrub(String(turn.line.text), needle)) : 'no dialog line arrived',
          };
        });
      },

      // A burst of sequential turns, each waiting for its reply (the dedupe key advances per applied reply).
      npc_burst: async () => {
        const character = myCharacter();
        if (!character || !chatNpc) {
          failStep('npc_burst', 'npc_conversation', 'no NPC conversation to continue');
          return;
        }
        const npc = chatNpc;
        const t0 = Date.now();
        let okCount = 0;
        let capped = false;
        for (let turn = 1; turn <= NPC_BURST_TURNS; turn += 1) {
          if (!paidStep('npc_burst')) {
            capped = true;
            break;
          }
          try {
            const r = await chatTurn(myCharacter() ?? character, npc, BURST_MESSAGES[(turn - 1) % BURST_MESSAGES.length]);
            const ok = r.jobStatus === 'completed' && !!r.line;
            if (ok) okCount += 1;
            burstSamples.push({ turn, ok, jobStatus: r.jobStatus, turnMs: r.turnMs });
          } catch (e) {
            burstSamples.push({ turn, ok: false, jobStatus: 'error', turnMs: 0 });
            notes.push(`burst turn ${turn}: ${excerpt(scrub(String((e as Error)?.message ?? e), needle))}`);
          }
        }
        const verdict = burstSampleVerdict(okCount);
        record({
          step: 'npc_burst',
          route: 'npc_conversation',
          ok: okCount === NPC_BURST_TURNS,
          jobStatus: okCount === NPC_BURST_TURNS ? 'completed' : capped ? 'none' : 'failed',
          elapsedMs: Math.max(1, Date.now() - t0),
          note: `ok samples ${okCount}/${NPC_BURST_TURNS}` + (verdict.indicative ? ' (indicative)' : '') + (capped ? ' (stopped on the run cap)' : ''),
        });
      },

      combat_narration: async () => {
        const character = myCharacter();
        if (!character) {
          failStep('combat_narration', 'combat_narration', 'no character');
          return;
        }
        if (!paidStep('combat_narration')) return;
        await timed('combat_narration', 'combat_narration', async () => {
          const spawnAt = (locId: bigint) => rows(session.conn, 'enemySpawn').find((s) => s.locationId === locId && s.state === 'available');
          const path = findPath(character.locationId, (l) => !isUncharted(l) && !!spawnAt(l.id), 8);
          if (path === null) return { ok: false, jobStatus: 'none', note: 'combat narration: no spawn reachable' };
          if (!(await travelPath(character.id, path))) return { ok: false, jobStatus: 'none', note: 'travel did not complete' };
          const here = myCharacter()!;
          const spawn = spawnAt(here.locationId);
          if (!spawn) return { ok: false, jobStatus: 'none', note: 'the spawn was taken before the fight' };
          const template = rows(session.conn, 'enemyTemplate').find((t) => t.id === spawn.enemyTemplateId);
          const lone = String(template?.creatureType ?? '').toLowerCase() === 'beast';
          const narrativesBefore = new Set(rows(session.conn, 'combatNarrative').map((n) => n.id));
          const before = jobIds('combat_narration');
          markCall('combat_narration');
          await session.conn.reducers.startCombat({ characterId: here.id, enemySpawnId: spawn.id });
          // Auto-attacks resolve the fight; victory or defeat both enqueue the outro narration.
          const jobStatus = await settleJob('combat_narration', before, 240_000, 120_000);
          const outro = await waitFor(
            () => rows(session.conn, 'combatNarrative').find((n) => !narrativesBefore.has(n.id) && (n.narrativeType === 'victory' || n.narrativeType === 'defeat')),
            15_000,
          );
          if (outro) observe('outro', 'combat_narrative', outro.id, String(outro.narrativeText), { loneBeast: lone, playerName: here.name, enemyNames: [spawn.name] });
          return {
            ok: jobStatus === 'completed' && !!outro,
            jobStatus,
            note: `fight at ${path.length} hop(s) from the start location; outro ${outro ? 'arrived' : 'missing'}; beast-only outro rules ${lone ? 'applied' : 'not applied'}`,
          };
        });
      },

      renown_perk_gen: async () => {
        const character = myCharacter();
        if (!character) {
          failStep('renown_perk_gen', 'renown_perk_gen', 'no character');
          return;
        }
        if (!paidStep('renown_perk_gen')) return;
        await timed('renown_perk_gen', 'renown_perk_gen', async () => {
          const before = jobIds('renown_perk_gen');
          const perksBefore = rows(session.conn, 'pendingRenownPerk').filter((p) => p.characterId === character.id).length;
          markCall('renown_perk_gen');
          await session.conn.reducers.grantTestRenown({ characterId: character.id, points: 100n });
          const jobStatus = await settleJob('renown_perk_gen', before, 15_000, 120_000);
          const perks = await waitFor(() => {
            const n = rows(session.conn, 'pendingRenownPerk').filter((p) => p.characterId === character.id).length;
            return n > perksBefore ? n : null;
          }, 15_000);
          return { ok: jobStatus === 'completed' && !!perks, jobStatus, note: `pending perks ${perks ?? 0}` };
        });
      },

      skill_gen: async () => {
        const character = myCharacter();
        if (!character) {
          failStep('skill_gen', 'skill_gen', 'no character');
          return;
        }
        if (!paidStep('skill_gen')) return;
        await timed('skill_gen', 'skill_gen', async () => {
          const before = jobIds('skill_gen');
          const skillsBefore = rows(session.conn, 'pendingSkill').filter((p) => p.characterId === character.id).length;
          await session.conn.reducers.grantTestPendingLevel({ characterId: character.id, levels: 1n });
          markCall('skill_gen');
          await session.conn.reducers.applyLevelUp({ characterId: character.id });
          const jobStatus = await settleJob('skill_gen', before, 15_000, 120_000);
          const skills = await waitFor(() => {
            const n = rows(session.conn, 'pendingSkill').filter((p) => p.characterId === character.id).length;
            return n > skillsBefore ? n : null;
          }, 15_000);
          return { ok: jobStatus === 'completed' && !!skills, jobStatus, note: `pending skills ${skills ?? 0}` };
        });
      },

      // The /llm stats command (free, admin only): read the one plain block from the player's own event view
      // when the bindings expose it; otherwise the result is accepted-only and left to the user checklist.
      llm_stats: async () => {
        const character = myCharacter();
        if (!character) {
          failStep('llm_stats', 'llm_stats', 'no character');
          return;
        }
        if (!paidStep('llm_stats')) return;
        await timed('llm_stats', 'llm_stats', async () => {
          const seqBefore = eventSeq;
          await session.conn.reducers.submitCommand({ characterId: character.id, text: '/llm stats' });
          const line = await waitFor(
            () => privateEvents.find((e) => e.seq > seqBefore && e.characterId === character.id && e.message.startsWith('LLM stats by route')),
            15_000,
          );
          if (!line) {
            detailFlags.llmStatsLine = 'accepted only, the line was not read back';
            return { ok: false, jobStatus: 'none', note: 'the command was accepted but the stats block was not read back: left to the user checklist' };
          }
          const lines = line.message.split(/\r?\n/);
          detailFlags.llmStatsLine = `read back, ${lines.length} lines`;
          return { ok: lines.length >= 2, jobStatus: 'observed', note: `stats block read back, ${lines.length} lines, first: ${excerpt(scrub(lines[0], needle))}` };
        });
      },
    };

    try {
      for (const step of PROOF_STEPS) {
        if (stopped) break;
        const run = RUNNERS[step];
        expect(run, `no runner for step ${step}`).toBeTypeOf('function');
        await run();
      }
    } finally {
      clearInterval(poller);
      pollJobs();
    }

    const verdict = proofVerdict(results);
    out('final status: ' + statusLine(status()));
    if (stopped) out('stopped early: ' + stopped);
    out('steps: ' + results.map((r) => `${r.step}=${r.ok ? 'ok' : 'FAIL'}`).join(' '));
    out('domains: ' + Object.entries(verdict.domains).map(([d, v]) => `${d}=${v}`).join(' '));
    out(`pronoun and tone checks on observed replies: ${observed.checked} checked, ${observed.hits.length} with rule hits (ids only in the results file)`);
    writeResults();
    session.conn.disconnect();
    expect(verdict.notRun, 'domains that did not run').toEqual([]);
    expect(verdict.failed, 'domains that failed').toEqual([]);
  });
});
