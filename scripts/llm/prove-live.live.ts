// Local live-proof harness (Plan 41-15, OPS-01 live half). Run from the repo root:
//
//   PROVE_LIVE_DRY=1 pnpm exec vitest run --config scripts/llm/vitest.live.config.ts   # dry: no spend
//   pnpm exec vitest run --config scripts/llm/vitest.live.config.ts                     # paid (Plan 41-16)
//
// It drives the REAL player reducers through the generated bindings as the CLI identity (an admin),
// waits on the player's own job view (my_llm_jobs) and on domain tables, and checks today's held spend
// against the global daily ceiling before every paid step (Phase 43: the daily ceiling replaces the old
// phase cap). Local server only. The CLI token is obtained in-process and never printed;
// every printed or recorded string goes through scrub() and a 120 character cap; prompts,
// completions, the token and the key are never printed or written.
//
// To add a step (Plans 41-16, 41-18): add its name to PROOF_STEPS in proof_rules.mjs, add a runner
// to RUNNERS below, and call `paidStep(step)` first, then `jobIds`, `settleJob` and `waitFor`.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DbConnection } from '../../src/module_bindings/index.ts';
import { REPO_ROOT, TARGETS, getCliToken, scrub } from './cli.mjs';
import {
  PROOF_SPEND_MARGIN_MICRO_USD,
  PROOF_STEPS,
  excerpt,
  isTerminalJobStatus,
  proofCharacterName,
  proofEmail,
  heldTodayMicroUsd,
  shouldStopForSpend,
  summarizeSmoke,
  todayUtcString,
} from './proof_rules.mjs';

const DRY = process.env.PROVE_LIVE_DRY === '1';
const TARGET = TARGETS.local;
const WS_URI = 'ws://127.0.0.1:3000';
const RESULTS_PATH = path.join(REPO_ROOT, '.planning', 'phases', '41-executor-and-domain-cutover', '41-live-results.json');

// Tables and views the steps read. Views need their own explicit subscription.
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
  'npc',
  'npc_dialog',
  'combat_encounter',
  'renown',
  'pending_renown_perk',
  'pending_skill',
].map((t) => 'SELECT * FROM ' + t);

const CREATION_ORDER = [
  'AWAITING_RACE',
  'GENERATING_RACE',
  'AWAITING_ARCHETYPE',
  'GENERATING_CLASS',
  'CLASS_REVEALED',
  'AWAITING_NAME',
  'CONFIRMING',
  'COMPLETE',
];

const RACE_DESCRIPTION = 'A quiet folk of river-dwelling tinkers with silver hair, webbed hands and a love of small machines.';
const NPC_MESSAGE = 'Greetings. Who are you, and what do you do here?';

type Row = Record<string, any>;
interface StepResult {
  step: string;
  route: string;
  ok: boolean;
  jobStatus: string;
  elapsedMs: number;
  note?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Connect with the CLI token and wait until every subscription is applied. */
function connect(token: string): Promise<{ conn: any; identityHex: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect: timed out')), 30_000);
    let identityHex = '';
    const conn: any = DbConnection.builder()
      .withUri(WS_URI)
      .withDatabaseName('uwr')
      .withToken(token)
      .onConnect((c: any, identity: any) => {
        identityHex = identity.toHexString();
        c.subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
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

describe('live proof (local server only)', () => {
  it(DRY ? 'dry run: admin_llm_status for the CLI identity, no spend' : 'paid run: one real action per domain', async () => {
    // --- setup: local only, token in memory only -------------------------------------------------
    expect(TARGET.name).toBe('local');
    expect(TARGET.httpBase.startsWith('http://127.0.0.1')).toBe(true);
    const ping = await fetch(TARGET.httpBase + '/v1/ping').catch(() => null);
    expect(ping?.status, 'local server must answer /v1/ping (start it first)').toBe(200);
    const token = getCliToken();
    expect(token, 'no CLI login token (run spacetime login)').toBeTruthy();
    const needle = [token as string];

    const out = (line: string) => console.log(scrub(line, needle));

    const session: { conn: any; identityHex: string } = await connect(token as string);
    const status = (): Row => statusRows(session.conn)[0];

    // --- A1 proof: the CLI identity reads exactly one admin status row ---------------------------
    const first = statusRows(session.conn);
    out('admin_llm_status rows: ' + first.length);
    expect(first.length, 'admin_llm_status is empty: the CLI identity is not an admin (assumption A1 fails)').toBe(1);
    out('status: ' + statusLine(first[0]));

    if (DRY) {
      out('dry mode: no reducer is called. Step plan: ' + PROOF_STEPS.join(' > '));
      out('spend margin: ' + PROOF_SPEND_MARGIN_MICRO_USD + ' micro-USD under the daily ceiling');
      session.conn.disconnect();
      return;
    }

    expect(first[0].keySet, 'no key set: set it with scripts/llm/set-key.mjs first').toBe(true);

    // --- paid mode ---------------------------------------------------------------------------------
    const results: StepResult[] = [];
    const notes: string[] = [];
    let stopped = '';

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
    const creationReached = (step: string): boolean => {
      const s = creationState();
      return !!s && CREATION_ORDER.indexOf(s.step) >= CREATION_ORDER.indexOf(step);
    };
    const myCharacter = (): Row | undefined => {
      const me = rows(session.conn, 'player').find((p) => p.id.toHexString() === session.identityHex);
      if (!me || me.userId === undefined || me.userId === null) return undefined;
      return rows(session.conn, 'character').find((c) => c.ownerUserId === me.userId);
    };

    /** The spend check (today's held spend against the daily ceiling) before every paid step. Returns true when the step may run. */
    const paidStep = (step: string): boolean => {
      const s = status();
      if (shouldStopForSpend(heldTodayMicroUsd(s, todayUtcString(Date.now())), 0n, s.dailyCeilingMicroUsd, PROOF_SPEND_MARGIN_MICRO_USD)) {
        stopped = `spend guard before ${step}: today's held spend reached the daily ceiling minus margin`;
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

    const record = (r: StepResult) => {
      results.push(r);
      out(`step ${r.step}: route=${r.route} job=${r.jobStatus} ok=${r.ok} elapsed=${r.elapsedMs}ms` + (r.note ? ' note=' + excerpt(scrub(r.note, needle)) : ''));
      writeResults();
    };
    const writeResults = () => {
      const s = statusRows(session.conn)[0];
      const body = { target: 'local', steps: results, notes, stopped: stopped || undefined, finalStatus: s ? { ...s, keyUpdatedAt: undefined, keyVerifiedAt: undefined, lastSmokeAt: undefined } : undefined };
      fs.writeFileSync(RESULTS_PATH, scrub(json(body), needle) + '\n');
    };

    const timed = async (step: string, route: string, body: () => Promise<{ ok: boolean; jobStatus: string; note?: string }>): Promise<void> => {
      const t0 = Date.now();
      try {
        const r = await body();
        record({ step, route, ok: r.ok, jobStatus: r.jobStatus, elapsedMs: Date.now() - t0, note: r.note });
      } catch (e) {
        record({ step, route, ok: false, jobStatus: 'error', elapsedMs: Date.now() - t0, note: String((e as Error)?.message ?? e) });
      }
    };

    const proofName = proofCharacterName(Date.now());

    const RUNNERS: Record<string, () => Promise<void>> = {
      smoke: async () => {
        if (!paidStep('smoke')) return;
        await timed('smoke', 'smoke_test', async () => {
          await session.conn.reducers.llmSmokeTest({});
          const done = await waitFor(() => {
            const s = summarizeSmoke(status().lastSmokeJson);
            return s.total >= 6 ? s : null;
          }, 240_000);
          if (!done) return { ok: false, jobStatus: 'timeout', note: 'smoke summary never reached six entries' };
          const okAll = done.ok === done.total;
          return { ok: okAll, jobStatus: 'completed', note: `routes ok ${done.ok}/${done.total}` + (done.failed.length ? ' failed: ' + done.failed.join(',') : '') };
        });
        if (!status().keyValid) stopped = 'smoke test left the key unproven: no further paid steps';
      },

      creation_race: async () => {
        if (myCharacter()) {
          record({ step: 'creation_race', route: 'creation_race', ok: true, jobStatus: 'skipped', elapsedMs: 0, note: 'character already exists' });
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
          if (creationState()?.step === 'AWAITING_RACE') await session.conn.reducers.submitCreationInput({ text: RACE_DESCRIPTION });
          const reached = await waitFor(() => creationReached('AWAITING_ARCHETYPE'), 120_000);
          const jobStatus = await settleJob('creation_race', before, 5_000, 30_000);
          return { ok: !!reached, jobStatus, note: reached ? undefined : 'creation did not reach AWAITING_ARCHETYPE' };
        });
      },

      creation_class: async () => {
        if (myCharacter()) {
          record({ step: 'creation_class', route: 'creation_class', ok: true, jobStatus: 'skipped', elapsedMs: 0, note: 'character already exists' });
          return;
        }
        if (!creationReached('AWAITING_ARCHETYPE')) return;
        if (!paidStep('creation_class')) return;
        await timed('creation_class', 'creation_class', async () => {
          const before = jobIds('creation_class');
          if (creationState()?.step === 'AWAITING_ARCHETYPE') await session.conn.reducers.submitCreationInput({ text: 'Warrior' });
          const revealed = await waitFor(() => creationReached('CLASS_REVEALED'), 120_000);
          const jobStatus = await settleJob('creation_class', before, 5_000, 30_000);
          if (!revealed) return { ok: false, jobStatus, note: 'creation did not reach CLASS_REVEALED' };
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
          return { ok: !!named, jobStatus, note: named ? 'ability offered, name accepted, awaiting confirm' : 'name was not accepted' };
        });
      },

      world_gen: async () => {
        const existing = myCharacter();
        if (existing) {
          const gen = rows(session.conn, 'worldGenState').find((s) => s.characterId === existing.id);
          record({ step: 'world_gen', route: 'world_gen', ok: existing.locationId !== 0n, jobStatus: 'skipped', elapsedMs: 0, note: `character exists; world state ${gen?.step ?? 'none'}` });
          return;
        }
        if (!creationReached('CONFIRMING')) return;
        if (!paidStep('world_gen')) return;
        await timed('world_gen', 'world_gen', async () => {
          const regionsBefore = rows(session.conn, 'region').length;
          const before = jobIds('world_gen');
          await session.conn.reducers.submitCreationInput({ text: 'confirm' });
          const character = await waitFor(() => myCharacter(), 30_000);
          if (!character) return { ok: false, jobStatus: 'none', note: 'no character after confirm' };
          const genState = () => rows(session.conn, 'worldGenState').find((s) => s.characterId === character.id);
          const generating = await waitFor(() => (genState()?.step === 'GENERATING' || genState()?.step === 'COMPLETE' ? genState() : null), 30_000);
          if (!generating) return { ok: false, jobStatus: 'none', note: 'world generation never started: state ' + (genState()?.step ?? 'none') };

          // Tab-close check (PIPE-02): drop the connection while generation runs, wait, reconnect, expect completion.
          session.conn.disconnect();
          await sleep(20_000);
          const again = await connect(token as string);
          session.conn = again.conn;
          session.identityHex = again.identityHex;

          const complete = await waitFor(() => (genState()?.step === 'COMPLETE' ? genState() : null), 180_000);
          const moved = await waitFor(() => (myCharacter()?.locationId !== 0n ? myCharacter() : null), 30_000);
          const regionsAfter = rows(session.conn, 'region').length;
          const states = rows(session.conn, 'worldGenState').filter((s) => s.characterId === character.id).length;
          const jobStatus = await settleJob('world_gen', before, 5_000, 30_000);
          const oneRegion = regionsAfter - regionsBefore === 1 && states === 1;
          const ok = !!complete && !!moved && oneRegion;
          return {
            ok,
            jobStatus: jobStatus === 'missing' && complete ? 'completed' : jobStatus,
            note: `reconnected after 20s; state ${genState()?.step ?? 'none'}, left start: ${!!moved}, new regions ${regionsAfter - regionsBefore}, states ${states}`,
          };
        });
      },

      npc_conversation: async () => {
        const character = myCharacter();
        if (!character) return;
        if (!paidStep('npc_conversation')) return;
        await timed('npc_conversation', 'npc_conversation', async () => {
          const npc = rows(session.conn, 'npc').find((n) => n.locationId === character.locationId);
          if (!npc) return { ok: false, jobStatus: 'none', note: 'no NPC at the character location' };
          const before = jobIds('npc_conversation');
          const dialogBefore = new Set(rows(session.conn, 'npcDialog').map((d) => d.id));
          await session.conn.reducers.talkToNpc({ characterId: character.id, npcId: npc.id, message: NPC_MESSAGE });
          const jobStatus = await settleJob('npc_conversation', before, 10_000, 120_000);
          const line = await waitFor(() => rows(session.conn, 'npcDialog').find((d) => !dialogBefore.has(d.id) && d.characterId === character.id && d.npcId === npc.id), 15_000);
          return { ok: jobStatus === 'completed' && !!line, jobStatus, note: line ? 'npc line: ' + excerpt(scrub(String(line.text), needle)) : 'no dialog line arrived' };
        });
      },

      combat_narration: async () => {
        const character = myCharacter();
        if (!character) return;
        if (!paidStep('combat_narration')) return;
        await timed('combat_narration', 'combat_narration', async () => {
          // Nearest location with an available spawn, at most two connections away.
          const hasSpawn = (locId: bigint) => rows(session.conn, 'enemySpawn').find((s) => s.locationId === locId && s.state === 'available');
          const neighbours = (locId: bigint): bigint[] => rows(session.conn, 'locationConnection').filter((c) => c.fromLocationId === locId).map((c) => c.toLocationId);
          let path: bigint[] | null = null;
          if (hasSpawn(character.locationId)) path = [];
          else {
            for (const a of neighbours(character.locationId)) {
              if (hasSpawn(a)) { path = [a]; break; }
            }
            if (!path) {
              outer: for (const a of neighbours(character.locationId)) {
                for (const b of neighbours(a)) {
                  if (hasSpawn(b)) { path = [a, b]; break outer; }
                }
              }
            }
          }
          if (!path) return { ok: false, jobStatus: 'none', note: 'combat narration: no spawn reachable' };
          for (const hop of path) {
            await session.conn.reducers.moveCharacter({ characterId: character.id, locationId: hop });
            if (!(await waitFor(() => myCharacter()?.locationId === hop, 20_000))) return { ok: false, jobStatus: 'none', note: 'travel did not complete' };
          }
          const here = myCharacter()!.locationId;
          const spawn = hasSpawn(here);
          if (!spawn) return { ok: false, jobStatus: 'none', note: 'the spawn was taken before the fight' };
          const before = jobIds('combat_narration');
          await session.conn.reducers.startCombat({ characterId: character.id, enemySpawnId: spawn.id });
          // Auto-attacks resolve the fight; victory or defeat both enqueue the outro narration.
          const jobStatus = await settleJob('combat_narration', before, 240_000, 120_000);
          return { ok: jobStatus === 'completed', jobStatus, note: `fight at ${path.length} hop(s) from the start location` };
        });
      },

      renown_perk_gen: async () => {
        const character = myCharacter();
        if (!character) return;
        if (!paidStep('renown_perk_gen')) return;
        await timed('renown_perk_gen', 'renown_perk_gen', async () => {
          const before = jobIds('renown_perk_gen');
          const perksBefore = rows(session.conn, 'pendingRenownPerk').filter((p) => p.characterId === character.id).length;
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
        if (!character) return;
        if (!paidStep('skill_gen')) return;
        await timed('skill_gen', 'skill_gen', async () => {
          const before = jobIds('skill_gen');
          const skillsBefore = rows(session.conn, 'pendingSkill').filter((p) => p.characterId === character.id).length;
          await session.conn.reducers.grantTestPendingLevel({ characterId: character.id, levels: 1n });
          await session.conn.reducers.applyLevelUp({ characterId: character.id });
          const jobStatus = await settleJob('skill_gen', before, 15_000, 120_000);
          const skills = await waitFor(() => {
            const n = rows(session.conn, 'pendingSkill').filter((p) => p.characterId === character.id).length;
            return n > skillsBefore ? n : null;
          }, 15_000);
          return { ok: jobStatus === 'completed' && !!skills, jobStatus, note: `pending skills ${skills ?? 0}` };
        });
      },
    };

    for (const step of PROOF_STEPS) {
      if (stopped) break;
      const run = RUNNERS[step];
      expect(run, `no runner for step ${step}`).toBeTypeOf('function');
      await run();
    }

    out('final status: ' + statusLine(status()));
    if (stopped) out('stopped early: ' + stopped);
    out('steps: ' + results.map((r) => `${r.step}=${r.ok ? 'ok' : 'FAIL'}`).join(' '));
    writeResults();
    session.conn.disconnect();
  });
});
