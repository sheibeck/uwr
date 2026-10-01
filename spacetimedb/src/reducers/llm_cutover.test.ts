/**
 * Per-domain cutover tests (Phase 41): each triggering reducer, called through the REAL handler
 * captured from `spacetimedb/src/index.ts`, must enqueue exactly one job (plus its dispatch row)
 * in its own transaction (the job is the only record of the request). Plans 41-11 to 41-15
 * add their domains to this file, reusing the harness below (seed builders, `expectEnqueued`).
 *
 * The mock db is strict (unknown tables and index accessors throw, like the real database) and
 * one shared identity object is used for seeding and as the sender (the mock compares
 * identities with ===).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx, createMockProcCtx } from '../helpers/test-utils';
import { enqueueCombatOutroNarration } from '../helpers/combat_narration';
import { runLlmJob } from '../helpers/llm_executor';
import { llmRefusalMessage } from '../helpers/llm_queue';
import { applyLlmFailure, applySkillGenResult } from '../helpers/llm_apply';
import { insertLlmDispatch } from '../helpers/llm_schedule';
import { resolveRouteInput } from '../helpers/llm_inputs';
import { utcDay } from '../helpers/llm_budget';
import { buildRouteLayers } from '../data/llm_layers';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';
import { PLAYER_INPUT_MAX_CHARS } from '../data/llm_layers';
import { STRANDED_CHARACTER_HINT } from './creation';
import { WORLD_FILL_RETRY_LINE } from '../helpers/world_gen';
import {
  CLASS_FILL_FAILED_LINE,
  CLASS_FILL_PATIENCE_LINE,
  CLASS_FILL_RETRY_LINE,
  CLASS_REVEAL_MILESTONE_LINE,
} from '../helpers/creation_generation';
import { setLlmEnabled, patchAdminState } from '../helpers/llm_admin_state';
import { LLM_RESTING_LINE } from '../helpers/llm_queue';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n; // 2023-11-14T22:13:20Z

const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['talk_to_npc', 'apply_level_up', 'request_skill_offer', 'submit_intent', 'grant_test_renown', 'submit_creation_input', 'start_creation', 'choose_skill']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(
        `capturedReducer('${name}') is not a function: the schema recorder could not capture the ` +
          'reducer from index.ts. STOP and report; never edit production code to fix this.',
      );
    }
    handlers[name] = h;
  }
}, 120_000);

let randomSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
});
afterEach(() => {
  randomSpy.mockRestore();
});

type Seed = Record<string, any[]>;

function newCtx(seed: Seed, sender: any = alice, timestampMicros: bigint = T0) {
  return createMockCtx({ seed, sender, timestampMicros, strict: true });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

/** Every inserted row matches the recorded table columns (the PIPE-08 bug class). */
function allRowsMatchSchema(ctx: any, tables: string[]): string[] {
  const problems: string[] = [];
  for (const table of tables) {
    for (const row of rows(ctx, table)) {
      for (const p of rowColumnProblems(table, row)) problems.push(`${table}: ${p}`);
    }
  }
  return problems;
}

/**
 * Asserts the reducer left exactly one job for `route` and exactly one dispatch row for it;
 * returns the job.
 */
export function expectEnqueued(ctx: any, route: string, expectedJobs = 1): any {
  const jobs = rows(ctx, 'llm_job').filter((j: any) => j.route === route);
  expect(jobs).toHaveLength(expectedJobs);
  expect(rows(ctx, 'llm_job')).toHaveLength(expectedJobs);
  const dispatch = rows(ctx, 'llm_dispatch');
  expect(dispatch).toHaveLength(expectedJobs);
  for (const job of jobs) {
    expect(dispatch.filter((d: any) => d.jobId === job.id)).toHaveLength(1);
  }
  expect(allRowsMatchSchema(ctx, ['llm_job', 'llm_dispatch'])).toEqual([]);
  return jobs[jobs.length - 1];
}

/** No job, no dispatch row, no sweep tick, no reservation anywhere. */
function expectNothingReserved(ctx: any) {
  expect(rows(ctx, 'llm_job')).toHaveLength(0);
  expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
  for (const day of rows(ctx, 'llm_player_budget')) expect(day.reservedMicroUsd).toBe(0n);
  for (const led of rows(ctx, 'llm_spend')) expect(led.reservedMicroUsd).toBe(0n);
}

const systemLines = (ctx: any): string[] =>
  rows(ctx, 'event_private').filter((e: any) => e.kind === 'system').map((e: any) => e.message);

// Seed builders -------------------------------------------------------------

const playerSeed = (): Seed => ({
  player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
});

const worldSeed = (): Seed => ({
  region: [
    {
      id: 1n,
      name: 'Ashen Reach',
      dangerMultiplier: 100n,
      regionType: 'wild',
      biome: 'volcanic',
      landmarks: '["The Cinder Gate"]',
      threats: '["ash wraiths"]',
    },
  ],
  location: [
    { id: 10n, name: 'The Crossing', description: 'A crossroads.', zone: 'z', regionId: 1n },
  ],
});

const characterSeed = (over: Record<string, unknown> = {}): Seed => ({
  character: [
    {
      id: 1n,
      ownerUserId: 7n,
      name: 'Aldric',
      race: 'Kobold',
      className: 'Ashweaver',
      locationId: 10n,
      combatTargetEnemyId: undefined,
      ...over,
    },
  ],
});

const npcSeed = (): Seed => ({
  npc: [
    {
      id: 5n,
      name: 'Mirel',
      npcType: 'villager',
      locationId: 10n,
      description: 'A weathered keeper of the crossing.',
      greeting: 'Well met.',
      gender: 'female',
    },
  ],
});

const baseSeed = (): Seed => ({
  ...playerSeed(),
  ...worldSeed(),
  ...characterSeed(),
  ...npcSeed(),
});

// ---------------------------------------------------------------------------
// NPC chat (41-10)
// ---------------------------------------------------------------------------

describe('talk_to_npc (NPC chat cutover)', () => {
  const talk = (ctx: any, message: string, over: Record<string, unknown> = {}) =>
    handlers.talk_to_npc(ctx, { characterId: 1n, npcId: 5n, message, ...over });

  it('enqueues exactly one owned npc_conversation job and one dispatch row, and writes no legacy task', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');

    const job = expectEnqueued(ctx, 'npc_conversation');
    expect(job.playerId).toBe(alice);
    expect(job.characterId).toBe(1n);
    expect(job.status).toBe('pending');
    expect(job.reservedMicroUsd > 0n).toBe(true);
    expect(job.budgetDay).toBe(utcDay(ctx.timestamp));

    const memory = rows(ctx, 'npc_memory');
    expect(memory).toHaveLength(1);
    const req = JSON.parse(job.requestJson);
    expect(req.characterId).toBe('1');
    expect(req.npcId).toBe('5');
    expect(req.memoryId).toBe(memory[0].id.toString());
    expect(typeof req.memoryId).toBe('string');

    expect(allRowsMatchSchema(ctx, ['npc_memory', 'npc_dialog', 'event_private'])).toEqual([]);
  });

  it('snapshots a route input whose player message reaches the volatile layer inside player_input tags', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    const job = expectEnqueued(ctx, 'npc_conversation');

    const input = resolveRouteInput(ctx, job) as any;
    expect(input.playerMessage).toBe('Hello there');
    expect(input.npc).toEqual({ name: 'Mirel', npcType: 'villager', gender: 'female' });
    expect(input.region.name).toBe('Ashen Reach');
    expect(input.location).toEqual({ name: 'The Crossing' });

    const { volatile } = buildRouteLayers('npc_conversation', input);
    expect(volatile).toMatch(/<player_input>\s*Hello there\s*<\/player_input>/);
    expect(volatile).toContain('Gender: female (she, her, hers)');
  });

  // WR-B01: the model sees at most PLAYER_INPUT_MAX_CHARS code points, so nothing stores or reserves more.
  it('caps a very long message at the reducer: snapshot, reservation and echo carry only what the model sees, and it never throws', () => {
    const long = '\u{1F600}'.repeat(PLAYER_INPUT_MAX_CHARS + 10) + 'x'.repeat(70_000);
    const ctx = newCtx(baseSeed());
    expect(() => talk(ctx, long)).not.toThrow();

    const job = expectEnqueued(ctx, 'npc_conversation');
    const capped = [...long].slice(0, PLAYER_INPUT_MAX_CHARS).join('');
    expect((resolveRouteInput(ctx, job) as any).playerMessage).toBe(capped);
    expect([...JSON.parse(job.requestJson).input.playerMessage]).toHaveLength(PLAYER_INPUT_MAX_CHARS);

    const short = newCtx(baseSeed());
    talk(short, capped);
    expect(job.reservedMicroUsd).toBe(expectEnqueued(short, 'npc_conversation').reservedMicroUsd);

    const said = rows(ctx, 'event_private').filter((e: any) => e.kind === 'say').map((e: any) => e.message);
    expect(said).toEqual([`You say to Mirel: "${capped}"`]);
    expect(rows(ctx, 'npc_dialog').map((d: any) => d.text)).toContain(`You: "${capped}"`);
  });

  it('resolves a pre-column NPC (empty stored gender) deterministically and renders the Gender line', () => {
    const seed = baseSeed();
    (seed.npc as any[])[0].gender = '';
    const ctx = newCtx(seed);
    talk(ctx, 'Hello there');
    const job = expectEnqueued(ctx, 'npc_conversation');
    const input = resolveRouteInput(ctx, job) as any;
    expect(input.npc).toEqual({ name: 'Mirel', npcType: 'villager', gender: 'male' });
    expect(buildRouteLayers('npc_conversation', input).volatile).toContain('Gender: male (he, him, his)');
  });

  it('appends the player line to the dialog and the private log only after a successful enqueue', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    expectEnqueued(ctx, 'npc_conversation');
    const dialog = rows(ctx, 'npc_dialog');
    expect(dialog).toHaveLength(1);
    expect(dialog[0].text).toBe('You: "Hello there"');
    const say = rows(ctx, 'event_private').filter((e: any) => e.kind === 'say');
    expect(say).toHaveLength(1);
    expect(say[0].message).toBe('You say to Mirel: "Hello there"');
  });

  it('answers a second message before the reply with the patience line, no second job and no echoed line', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    talk(ctx, 'Are you there?');

    expectEnqueued(ctx, 'npc_conversation');
    expect(systemLines(ctx)).toEqual(['The Keeper is already considering something. Patience.']);
    const dialog = rows(ctx, 'npc_dialog');
    expect(dialog).toHaveLength(1);
    expect(dialog[0].text).toBe('You: "Hello there"');
    expect(rows(ctx, 'event_private').filter((e: any) => e.kind === 'say')).toHaveLength(1);
    // The duplicate reserved nothing more: one call against the player's day.
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
  });

  it('creates a new job for the next message once the reply updated the memory', () => {
    const ctx = newCtx(baseSeed());
    talk(ctx, 'Hello there');
    const first = expectEnqueued(ctx, 'npc_conversation');

    // The executor applied the reply: the job is terminal and the memory moved forward.
    Object.assign(first, { status: 'completed' });
    const memory = rows(ctx, 'npc_memory')[0];
    memory.lastUpdated = { microsSinceUnixEpoch: T0 + 5_000_000n };
    ctx.timestamp = { microsSinceUnixEpoch: T0 + 10_000_000n };

    talk(ctx, 'What news?');
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(2);
    expect(rows(ctx, 'llm_job')[1].dedupeKey).not.toBe(first.dedupeKey);
    expect(systemLines(ctx)).toEqual([]);
    expect(rows(ctx, 'npc_dialog').map((d: any) => d.text)).toEqual([
      'You: "Hello there"',
      'You: "What news?"',
    ]);
  });

  it('refuses an empty or whitespace-only message in voice with no job and no reservation', () => {
    for (const message of ['', '   ', '\n\t ']) {
      const ctx = newCtx(baseSeed());
      talk(ctx, message);
      expectNothingReserved(ctx);
      expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
      expect(systemLines(ctx)).toEqual(['You open your mouth, but nothing comes out.']);
      expect(rows(ctx, 'npc_dialog')).toHaveLength(0);
    }
  });

  it('over the daily cost limit creates nothing and answers with the refusal line, no player line', () => {
    const ctx = newCtx(baseSeed());
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    talk(ctx, 'Hello there');

    expectNothingReserved(ctx);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
    expect(systemLines(ctx)).toEqual([llmRefusalMessage('daily_cost')]);
    expect(rows(ctx, 'npc_dialog')).toHaveLength(0);
    expect(rows(ctx, 'event_private').filter((e: any) => e.kind === 'say')).toHaveLength(0);
  });

  it('over the per-player active-job cap answers busy, with no job, no reservation and no player line', () => {
    const ctx = newCtx(baseSeed());
    // Three active capped jobs of other routes, each holding a budget day.
    for (let i = 0; i < 3; i++) {
      ctx.db.llm_job.insert({
        id: 0n,
        playerId: alice,
        characterId: 1n,
        route: 'skill_gen',
        dedupeKey: `k${i}`,
        status: 'pending',
        attempt: 0n,
        requestJson: '{}',
        inputTokens: 0n,
        outputTokens: 0n,
        cacheWriteTokens: 0n,
        cacheReadTokens: 0n,
        createdAt: ctx.timestamp,
        reservedMicroUsd: 0n,
        costMicroUsd: 0n,
        budgetDay: utcDay(ctx.timestamp),
        applyAttempts: 0n,
      });
    }
    talk(ctx, 'Hello there');

    expect(rows(ctx, 'llm_job')).toHaveLength(3);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
    expect(systemLines(ctx)).toEqual([llmRefusalMessage('busy')]);
    expect(rows(ctx, 'npc_dialog')).toHaveLength(0);
  });

  it('keeps the ownership, location and combat checks ahead of the enqueue', () => {
    const away = newCtx({ ...baseSeed(), ...characterSeed({ locationId: 99n }) });
    talk(away, 'Hello');
    expectNothingReserved(away);
    expect(systemLines(away)).toEqual(['You are not near this NPC.']);

    const fighting = newCtx({ ...baseSeed(), ...characterSeed({ combatTargetEnemyId: 3n }) });
    talk(fighting, 'Hello');
    expectNothingReserved(fighting);
    expect(systemLines(fighting)).toEqual(['You cannot converse while in combat.']);

    const missing = newCtx(baseSeed());
    talk(missing, 'Hello', { npcId: 404n });
    expectNothingReserved(missing);
    expect(systemLines(missing)).toEqual(['NPC not found.']);
  });

  it('npc_interaction.ts no longer reads the legacy task table, the legacy budget helpers or a model literal', () => {
    const source = readFileSync(new URL('./npc_interaction.ts', import.meta.url), 'utf-8');
    expect(source).not.toMatch(/llm_task/);
    expect(source).not.toMatch(/checkBudget|incrementBudget/);
    expect(source).not.toMatch(/(?:gpt-\d|claude-)/i);
    expect(source.match(/enqueueLlmJob\(ctx/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Combat outro narration (41-11)
// ---------------------------------------------------------------------------

describe('combat outro narration (PIPE-07)', () => {
  const combatSource = readFileSync(new URL('./combat.ts', import.meta.url), 'utf-8');
  const victoryStart = combatSource.indexOf('const handleVictory = (');
  const defeatStart = combatSource.indexOf('const handleDefeat = (');
  const victoryText = combatSource.slice(victoryStart, defeatStart);
  const defeatText = combatSource.slice(defeatStart, combatSource.indexOf('Round-Based Combat Functions', defeatStart));
  const outroCall = (type: string) =>
    `enqueueCombatOutroNarration(ctx, combat, participants, enemies, '${type}')`;
  const clearCall = 'clearCombatArtifacts(ctx, combat.id)';

  it('handleVictory enqueues the victory outro once, before clearCombatArtifacts', () => {
    expect(victoryStart).toBeGreaterThan(0);
    expect(defeatStart).toBeGreaterThan(victoryStart);
    expect(victoryText.split(outroCall('victory'))).toHaveLength(2);
    expect(victoryText.indexOf(outroCall('victory'))).toBeLessThan(victoryText.indexOf(clearCall));
    expect(victoryText).not.toContain(outroCall('defeat'));
  });

  it('handleDefeat enqueues the defeat outro once, before its clearCombatArtifacts', () => {
    expect(defeatText.split(outroCall('defeat'))).toHaveLength(2);
    expect(defeatText.indexOf(outroCall('defeat'))).toBeLessThan(defeatText.indexOf(clearCall));
    expect(defeatText).not.toContain(outroCall('victory'));
  });

  it('combat.ts has exactly two outro calls; the other clearCombatArtifacts site has none', () => {
    expect(combatSource.match(/enqueueCombatOutroNarration\(ctx, combat/g)).toHaveLength(2);
    const otherClear = combatSource.indexOf(clearCall, combatSource.indexOf('const clearCombatArtifacts') + 10);
    expect(otherClear).toBeGreaterThan(0);
    expect(otherClear).toBeLessThan(victoryStart);
    const around = combatSource.slice(Math.max(0, otherClear - 600), otherClear + 200);
    expect(around).not.toContain('enqueueCombatOutroNarration');
  });

  // End to end: enqueue through the helper inside a transaction, then run the executor on it.
  const FAKE_KEY = ['sk', '-ant-', 'api03-', 'CUTOVERKEY'.repeat(4)].join('');
  const okText = (advanceMicros: bigint) => ({
    ...JSON.parse(
      readFileSync(new URL('../helpers/__fixtures__/claude/ok_text.json', import.meta.url), 'utf-8'),
    ),
    advanceMicros,
  });

  const narrationProc = (advanceMicros: bigint) => {
    const proc = createMockProcCtx({
      seed: {
        player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
        character: [
          { id: 1n, ownerUserId: 7n, name: 'Aldric', hp: 50n, maxHp: 100n },
          { id: 2n, ownerUserId: 8n, name: 'Brienne', hp: 60n, maxHp: 100n },
        ],
        location: [{ id: 10n, name: 'Saltmarsh', description: 'x', zone: 'z', regionId: 1n }],
        combat_encounter: [
          { id: 1n, locationId: 10n, leaderCharacterId: 1n, state: 'active', addCount: 0n, pendingAddCount: 0n, createdAt: { microsSinceUnixEpoch: T0 } },
        ],
        combat_participant: [
          { id: 1n, combatId: 1n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n },
          { id: 2n, combatId: 1n, characterId: 2n, status: 'active', nextAutoAttackAt: 0n },
        ],
        combat_enemy: [
          { id: 1n, combatId: 1n, spawnId: 1n, enemyTemplateId: 1n, displayName: 'Cave Rat', currentHp: 0n, maxHp: 30n, attackDamage: 3n, armorClass: 1n, nextAutoAttackAt: 0n },
        ],
        llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
      },
      timestampMicros: T0,
      responses: [okText(advanceMicros)],
      strict: true,
    });
    const combat = rows(proc, 'combat_encounter')[0];
    proc.ctx.withTx((tx: any) =>
      enqueueCombatOutroNarration(tx, combat, [...rows(proc, 'combat_participant')], [...rows(proc, 'combat_enemy')], 'victory'),
    );
    return proc;
  };

  const runNarration = (proc: any) => {
    const dispatch = rows(proc, 'llm_dispatch').splice(0, 1)[0];
    return runLlmJob(proc.ctx, dispatch, {
      nowMs: () => Number(proc.clock.now() / 1000n),
      log: () => {},
    });
  };

  it('a scripted reply is applied: a combat_narration private event for both participants', () => {
    const proc = narrationProc(2_000_000n);
    expect(rows(proc, 'llm_job')).toHaveLength(1);
    expect(runNarration(proc)).toBe('completed');

    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('completed');
    const events = rows(proc, 'event_private').filter((e: any) => e.kind === 'combat_narration');
    expect(events.map((e: any) => e.characterId).sort()).toEqual([1n, 2n]);
    for (const e of events) expect(e.message).toBe('The rat considers you, then the door, and chooses neither.');
    expect(rows(proc, 'combat_narrative')).toHaveLength(1);
    expect(rows(proc, 'combat_narrative')[0].narrativeType).toBe('victory');
  });

  it('a reply persisted more than 20 s after enqueue is dropped: expired, errorCode late, no narration event', () => {
    const proc = narrationProc(21_000_000n);
    expect(runNarration(proc)).toBe('expired');

    const job = rows(proc, 'llm_job')[0];
    expect(job.status).toBe('expired');
    expect(job.errorCode).toBe('late');
    expect(rows(proc, 'event_private').filter((e: any) => e.kind === 'combat_narration')).toHaveLength(0);
    expect(rows(proc, 'combat_narrative')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Skills and renown (41-12)
// ---------------------------------------------------------------------------

describe('skills and renown cutover (PIPE-01, PIPE-05)', () => {
  const levelSeed = (level = 2n, pendingLevels = 1n, over: Record<string, unknown> = {}): Seed => ({
    ...playerSeed(),
    ...worldSeed(),
    ...characterSeed({ level, pendingLevels, str: 10n, dex: 10n, cha: 10n, wis: 10n, int: 10n, hp: 50n, maxHp: 50n, ...over }),
    ability_template: [],
    pending_skill: [],
    character_creation_state: [],
  });

  const pendingSkillRow = (levelRequired = 3n) => ({
    id: 1n,
    characterId: 1n,
    name: 'A',
    description: 'x',
    kind: 'damage',
    targetRule: 'enemy',
    resourceType: 'mana',
    resourceCost: 1n,
    castSeconds: 0n,
    cooldownSeconds: 1n,
    scaling: 'int',
    value1: 1n,
    levelRequired,
    createdAt: { microsSinceUnixEpoch: T0 },
  });

  const abilityRow = (levelRequired = 3n) => ({
    id: 1n,
    characterId: 1n,
    name: 'A',
    description: 'x',
    kind: 'damage',
    targetRule: 'enemy',
    resourceType: 'mana',
    resourceCost: 1n,
    castSeconds: 0n,
    cooldownSeconds: 1n,
    scaling: 'int',
    value1: 1n,
    levelRequired,
    isGenerated: true,
  });

  const levelUp = (ctx: any) => handlers.apply_level_up(ctx, { characterId: 1n });
  const chooseSkill = (ctx: any, pendingSkillId: bigint) => handlers.choose_skill(ctx, { pendingSkillId });
  const requestOffer = (ctx: any, characterId = 1n) => handlers.request_skill_offer(ctx, { characterId });
  const intent = (ctx: any, text: string) => handlers.submit_intent(ctx, { characterId: 1n, text });
  const eventsOfKind = (ctx: any, kind: string): string[] =>
    rows(ctx, 'event_private').filter((e: any) => e.kind === kind).map((e: any) => e.message);

  it('prepare_skill_gen is no longer a reducer', () => {
    expect(capturedReducer('prepare_skill_gen')).toBeUndefined();
  });

  it('apply_level_up raises the level and enqueues exactly one skill_gen job and one dispatch, no legacy task', () => {
    const ctx = newCtx(levelSeed(1n, 1n));
    levelUp(ctx);

    expect(rows(ctx, 'character')[0].level).toBe(2n);
    const job = expectEnqueued(ctx, 'skill_gen');
    expect(job.playerId).toBe(alice);
    expect(job.characterId).toBe(1n);
    expect(JSON.parse(job.dedupeKey)).toEqual([alice.toHexString(), 'skill_gen', '1:2']);
    expect((resolveRouteInput(ctx, job) as any).level).toBe(2n);
    expect(eventsOfKind(ctx, 'narrative')).toEqual([
      'Something stirs within you. The Keeper stirs to present new abilities for your consideration.',
    ]);
  });

  it("apply_level_up takes the archetype from the player's creation state, not always warrior", () => {
    const ctx = newCtx({
      ...levelSeed(1n, 1n),
      character_creation_state: [
        { id: 1n, playerId: alice, step: 'COMPLETE', archetype: 'mystic', createdAt: { microsSinceUnixEpoch: T0 }, updatedAt: { microsSinceUnixEpoch: T0 } },
      ],
    });
    levelUp(ctx);
    const job = expectEnqueued(ctx, 'skill_gen');
    expect((resolveRouteInput(ctx, job) as any).archetype).toBe('mystic');
  });

  it('a skill offer asked from a second device (another identity, no creation state) keeps the mystic archetype (WR-B04)', () => {
    const bob = { toHexString: () => 'b'.repeat(64) };
    const ctx = newCtx(
      {
        ...levelSeed(3n, 0n),
        player: [{ id: alice, userId: 7n, activeCharacterId: 1n }, { id: bob, userId: 7n, activeCharacterId: 1n }],
        character_creation_state: [
          { id: 1n, playerId: alice, step: 'COMPLETE', archetype: 'mystic', characterName: 'Aldric', createdAt: { microsSinceUnixEpoch: T0 }, updatedAt: { microsSinceUnixEpoch: T0 } },
        ],
      },
      bob,
    );
    requestOffer(ctx);
    const job = expectEnqueued(ctx, 'skill_gen');
    expect(job.playerId).toBe(bob);
    expect((resolveRouteInput(ctx, job) as any).archetype).toBe('mystic');
  });

  it('apply_level_up with an offer already pending enqueues nothing and says so', () => {
    const seeded = levelSeed(1n, 1n);
    seeded.pending_skill = [pendingSkillRow(1n)];
    const ctx = newCtx(seeded);
    levelUp(ctx);
    expectNothingReserved(ctx);
    expect(systemLines(ctx)).toContain('Your offering awaits your choice.');
  });

  // CR-B02: claiming two levels quickly used to queue one job per level; both were billed and the
  // later apply overwrote the earlier offer, losing the level 2 offer for good.
  describe('two levels claimed quickly (CR-B02)', () => {
    const threeSkills = JSON.stringify({
      skills: ['Ember Lash', 'Soot Veil', 'Cinder Mend'].map((name) => ({
        name,
        description: 'A plain description of ' + name + '.',
        kind: 'damage',
        targetRule: 'single_enemy',
        resourceType: 'mana',
        resourceCost: 5,
        castSeconds: 1,
        cooldownSeconds: 6,
        scaling: 'int',
        value1: 10,
        damageType: 'fire',
      })),
    });
    const applyJob = (ctx: any, job: any) =>
      applySkillGenResult(ctx, { domain: 'skill_gen', playerId: job.playerId, contextJson: job.requestJson } as any, threeSkills);

    it('the second level-up queues nothing and says the offer is being prepared; the one job is for level 2', () => {
      const ctx = newCtx(levelSeed(1n, 2n));
      levelUp(ctx);
      levelUp(ctx);

      expect(rows(ctx, 'character')[0].level).toBe(3n);
      const job = expectEnqueued(ctx, 'skill_gen');
      expect(JSON.parse(job.requestJson).level).toBe('2');
      expect(systemLines(ctx)).toContain('The Keeper is already preparing an offering. Once you choose from it, any further offering you are owed follows.');
    });

    it('the offer applied after the character reached level 3 is labelled and gated at level 2, and [skills] then offers level 3', () => {
      const ctx = newCtx(levelSeed(1n, 2n));
      levelUp(ctx);
      levelUp(ctx);
      const job = expectEnqueued(ctx, 'skill_gen');

      applyJob(ctx, job);
      job.status = 'completed';
      const pending = rows(ctx, 'pending_skill');
      expect(pending).toHaveLength(3);
      for (const p of pending) expect(p.levelRequired).toBe(2n);
      expect(eventsOfKind(ctx, 'narrative').slice(-1)[0]).toContain('"Level 2.');

      // Choosing it leaves an ability at level 2; the level 3 offer is still available.
      rows(ctx, 'pending_skill').length = 0;
      ctx.db.ability_template.insert({ ...abilityRow(2n), id: 0n });
      intent(ctx, 'skills');
      const jobs = rows(ctx, 'llm_job');
      expect(jobs).toHaveLength(2);
      expect(JSON.parse(jobs[1].requestJson).level).toBe('3');
    });

    // WR-B02: choosing the level 2 offer queues the level 3 offer in the same transaction, so the
    // player never needs a [skills] nobody told them about.
    it('choosing from the level 2 offer queues the level 3 offer at once, with the created line', () => {
      const ctx = newCtx(levelSeed(1n, 2n));
      levelUp(ctx);
      levelUp(ctx);
      const job = expectEnqueued(ctx, 'skill_gen');
      applyJob(ctx, job);
      job.status = 'completed';

      const narrativeBefore = eventsOfKind(ctx, 'narrative').length;
      chooseSkill(ctx, rows(ctx, 'pending_skill')[0].id);

      expect(rows(ctx, 'pending_skill')).toHaveLength(0);
      expect(rows(ctx, 'ability_template').map((a: any) => a.levelRequired)).toEqual([2n]);
      const jobs = rows(ctx, 'llm_job');
      expect(jobs).toHaveLength(2);
      expect(JSON.parse(jobs[1].requestJson).level).toBe('3');
      expect(JSON.parse(jobs[1].dedupeKey)).toEqual([alice.toHexString(), 'skill_gen', '1:3']);
      expect(eventsOfKind(ctx, 'narrative').slice(narrativeBefore)).toContain(
        'Something stirs within you. The Keeper stirs to present new abilities for your consideration.',
      );

      // Choosing the level 3 offer leaves nothing owed: no third job, no extra line.
      jobs[1].status = 'completed';
      applyJob(ctx, jobs[1]);
      const systemBefore = systemLines(ctx).length;
      chooseSkill(ctx, rows(ctx, 'pending_skill')[0].id);
      expect(rows(ctx, 'llm_job')).toHaveLength(2);
      expect(rows(ctx, 'ability_template').map((a: any) => a.levelRequired).sort()).toEqual([2n, 3n]);
      expect(systemLines(ctx).slice(systemBefore).every((l: string) => l.startsWith('You learned'))).toBe(true);
    });

    it('a level 2 offer that failed while the character reached level 3 is still owed: [skills] offers 3, and choosing it offers 2', () => {
      const ctx = newCtx(levelSeed(1n, 2n));
      levelUp(ctx);
      levelUp(ctx);
      const first = expectEnqueued(ctx, 'skill_gen');
      first.status = 'failed';
      applyLlmFailure(ctx, { domain: 'skill_gen', playerId: alice, contextJson: first.requestJson } as any);

      intent(ctx, 'skills');
      const second = rows(ctx, 'llm_job')[1];
      expect(JSON.parse(second.requestJson).level).toBe('3');
      second.status = 'completed';
      applyJob(ctx, second);
      chooseSkill(ctx, rows(ctx, 'pending_skill')[0].id);

      const third = rows(ctx, 'llm_job')[2];
      expect(JSON.parse(third.requestJson).level).toBe('2');
      expect((resolveRouteInput(ctx, third) as any).level).toBe(2n);
    });

    it('a result never overwrites an offer that is already pending', () => {
      const ctx = newCtx(levelSeed(3n, 0n));
      requestOffer(ctx);
      const job = expectEnqueued(ctx, 'skill_gen');
      ctx.db.pending_skill.insert({ ...pendingSkillRow(3n), id: 0n, name: 'Kept' });

      applyJob(ctx, job);
      expect(rows(ctx, 'pending_skill').map((p: any) => p.name)).toEqual(['Kept']);
    });
  });

  it('request_skill_offer enqueues one job for a level 3 character; a repeat gets the dedupe line and no second job', () => {
    const ctx = newCtx(levelSeed(3n, 0n));
    requestOffer(ctx);
    expectEnqueued(ctx, 'skill_gen');
    requestOffer(ctx);
    expectEnqueued(ctx, 'skill_gen');
    expect(systemLines(ctx)).toEqual(['The Keeper is already preparing an offering. Once you choose from it, any further offering you are owed follows.']);
  });

  it("request_skill_offer rejects another player's character", () => {
    const ctx = newCtx({
      ...levelSeed(3n, 0n),
      ...characterSeed({ ownerUserId: 99n, level: 3n }),
    });
    expect(() => requestOffer(ctx)).toThrow('Not your character');
    expectNothingReserved(ctx);
  });

  it('request_skill_offer will not farm: pending choices, a generated ability at this level, or level 1 all write nothing', () => {
    const pendingSeed = levelSeed(3n, 0n);
    pendingSeed.pending_skill = [pendingSkillRow(3n)];
    const a = newCtx(pendingSeed);
    requestOffer(a);
    expectNothingReserved(a);
    expect(systemLines(a)).toEqual(['Your offering awaits your choice.']);

    const takenSeed = levelSeed(3n, 0n);
    takenSeed.ability_template = [{ ...abilityRow(2n), id: 1n }, { ...abilityRow(3n), id: 2n }];
    const b = newCtx(takenSeed);
    requestOffer(b);
    expectNothingReserved(b);
    expect(systemLines(b)).toEqual(['The Keeper shakes his head. "You have already claimed a new ability at this level. Grow first."']);

    const c = newCtx(levelSeed(1n, 0n));
    requestOffer(c);
    expectNothingReserved(c);
    expect(systemLines(c)).toHaveLength(1);
  });

  it('a refused skill offer (daily cost) creates no job and says how to ask again', () => {
    const ctx = newCtx(levelSeed(3n, 0n));
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    requestOffer(ctx);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(systemLines(ctx)).toEqual([llmRefusalMessage('daily_cost') + ' Ask again with [skills] later.']);
  });

  it('submit_intent "skills" behaves like request_skill_offer', () => {
    const ctx = newCtx(levelSeed(3n, 0n));
    intent(ctx, 'skills');
    expectEnqueued(ctx, 'skill_gen');
    intent(ctx, 'Skills');
    expectEnqueued(ctx, 'skill_gen');
    expect(systemLines(ctx)).toEqual(['The Keeper is already preparing an offering. Once you choose from it, any further offering you are owed follows.']);
  });

  it('a skill_gen failure tells the player to type [skills], and doing so enqueues a fresh job for the same level', () => {
    const ctx = newCtx(levelSeed(3n, 0n));
    requestOffer(ctx);
    const first = expectEnqueued(ctx, 'skill_gen');

    // The job fails for good; the executor runs the failure handling.
    first.status = 'failed';
    applyLlmFailure(ctx, { domain: 'skill_gen', playerId: alice, contextJson: first.requestJson } as any);
    const narrative = eventsOfKind(ctx, 'narrative');
    expect(narrative[narrative.length - 1]).toContain('[skills]');

    intent(ctx, 'skills');
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(2);
    expect(rows(ctx, 'llm_job')[1].dedupeKey).toBe(first.dedupeKey);
    expect(rows(ctx, 'llm_job')[1].status).toBe('pending');
  });

  it('a short skill offer (fewer than three valid skills) also names [skills]', () => {
    const ctx = newCtx(levelSeed(3n, 0n));
    applySkillGenResult(
      ctx,
      { domain: 'skill_gen', playerId: alice, contextJson: JSON.stringify({ characterId: '1' }) } as any,
      '{"skills":[]}',
    );
    const narrative = eventsOfKind(ctx, 'narrative');
    expect(narrative).toHaveLength(1);
    expect(narrative[0]).toContain('[skills]');
    expect(rows(ctx, 'pending_skill')).toHaveLength(0);
  });

  it('the help text lists [skills]', () => {
    const ctx = newCtx(levelSeed(3n, 0n));
    intent(ctx, 'help');
    expect(systemLines(ctx).join('\n')).toContain('[skills]');
  });

  // Renown (enqueue finished in 41-05): proven here through the admin reducer and the executor.
  const CLI_ADMIN = { toHexString: () => 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e' };

  it('a renown rank-up through grant_test_renown enqueues one renown_perk_gen job with a dispatch row', () => {
    const ctx = newCtx(
      { ...levelSeed(3n, 0n), player: [{ id: CLI_ADMIN, userId: 7n, activeCharacterId: 1n }] },
      CLI_ADMIN,
    );
    handlers.grant_test_renown(ctx, { characterId: 1n, points: 100n });
    const job = expectEnqueued(ctx, 'renown_perk_gen');
    expect(job.playerId).toBe(CLI_ADMIN);
    expect(JSON.parse(job.requestJson).rank).toBe(2);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
  });

  const FAKE_KEY = ['sk', '-ant-', 'api03-', 'SKILLSKEY'.repeat(4)].join('');
  const perk = (name: string) => ({
    name,
    description: 'A plain description of ' + name + '.',
    kind: '',
    targetRule: 'self',
    resourceType: 'none',
    resourceCost: 0,
    castSeconds: 0,
    cooldownSeconds: 0,
    scaling: 'none',
    value1: 0,
    value2: null,
    damageType: null,
    effectType: null,
    effectMagnitude: null,
    effectDuration: null,
    perkEffectJson: '{"maxHp":25}',
    perkDomain: 'combat',
  });

  it('a Phase 40 renown job with no input snapshot is resolved from its legacy keys and applied by the executor', () => {
    const okJson = JSON.parse(
      readFileSync(new URL('../helpers/__fixtures__/claude/ok_json.json', import.meta.url), 'utf-8'),
    );
    okJson.body.content = [{ type: 'text', text: JSON.stringify({ perks: [perk('One'), perk('Two'), perk('Three')] }) }];
    const proc = createMockProcCtx({
      seed: {
        player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
        character: [{ id: 1n, ownerUserId: 7n, name: 'Aldric', race: 'Kobold', className: 'Ashweaver' }],
        llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
      },
      timestampMicros: T0,
      responses: [okJson],
      strict: true,
    });
    const job = proc.db.llm_job.insert({
      id: 0n,
      playerId: alice,
      characterId: 1n,
      route: 'renown_perk_gen',
      dedupeKey: '["phase40"]',
      status: 'pending',
      attempt: 0n,
      requestJson: JSON.stringify({ characterId: '1', rank: 2, className: 'Ashweaver', raceName: 'Kobold', existingPerks: [] }),
      inputTokens: 0n,
      outputTokens: 0n,
      cacheWriteTokens: 0n,
      cacheReadTokens: 0n,
      createdAt: { microsSinceUnixEpoch: T0 },
      reservedMicroUsd: 0n,
      costMicroUsd: 0n,
      budgetDay: '',
      applyAttempts: 0n,
    });
    const dispatch = proc.ctx.withTx((tx: any) => insertLlmDispatch(tx, job.id, T0));

    const outcome = runLlmJob(proc.ctx, dispatch, {
      nowMs: () => Number(proc.clock.now() / 1000n),
      log: () => {},
    });

    expect(outcome).toBe('completed');
    expect(rows(proc, 'llm_job')[0].status).toBe('completed');
    const perks = rows(proc, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name).sort()).toEqual(['One', 'Three', 'Two']);
    expect(perks.every((p: any) => p.characterId === 1n && p.rank === 2n)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Character creation (41-13)
// ---------------------------------------------------------------------------

describe('submit_creation_input (creation cutover, PIPE-01 / PIPE-04)', () => {
  const stateRow = (step: string, over: Record<string, unknown> = {}) => ({
    id: 1n,
    playerId: alice,
    step,
    createdAt: { microsSinceUnixEpoch: T0 },
    updatedAt: { microsSinceUnixEpoch: T0 },
    ...over,
  });
  const creationSeed = (step: string, over: Record<string, unknown> = {}): Seed => ({
    ...playerSeed(),
    character_creation_state: [stateRow(step, over)],
  });
  const submit = (ctx: any, text: string) => handlers.submit_creation_input(ctx, { text });
  const creationEvents = (ctx: any) => rows(ctx, 'event_creation');
  const exhaustDay = (ctx: any) =>
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });

  it('at AWAITING_RACE moves to GENERATING_RACE, enqueues one creation_race job with a dispatch and says the Keeper is considering', () => {
    const ctx = newCtx(creationSeed('AWAITING_RACE'));
    submit(ctx, 'A quiet people of the salt marshes');

    const job = expectEnqueued(ctx, 'creation_race');
    expect(job.playerId).toBe(alice);
    expect(job.characterId).toBe(0n);
    expect(JSON.parse(job.dedupeKey)).toEqual([alice.toHexString(), 'creation_race', '1:race']);
    expect(resolveRouteInput(ctx, job)).toEqual({ raceDescription: 'A quiet people of the salt marshes' });

    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('GENERATING_RACE');
    expect(state.raceDescription).toBe('A quiet people of the salt marshes');
    expect(creationEvents(ctx).map((e: any) => e.message)).toEqual([
      'The Keeper is considering your... unique... heritage.',
    ]);
    expect(allRowsMatchSchema(ctx, ['character_creation_state', 'event_creation'])).toEqual([]);
  });

  // Phase 43 stages the class: the small reveal job comes first (the creation_class fill is enqueued by its apply).
  it('at AWAITING_ARCHETYPE moves to GENERATING_CLASS and enqueues one creation_class_reveal job', () => {
    const ctx = newCtx(creationSeed('AWAITING_ARCHETYPE', { raceName: 'Saltkin', raceNarrative: 'Marsh dwellers.' }));
    submit(ctx, 'Mystic');

    const job = expectEnqueued(ctx, 'creation_class_reveal');
    expect(JSON.parse(job.dedupeKey)).toEqual([alice.toHexString(), 'creation_class_reveal', '1:class']);
    expect(resolveRouteInput(ctx, job)).toEqual({
      raceName: 'Saltkin',
      raceNarrative: 'Marsh dwellers.',
      archetype: 'mystic',
    });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('GENERATING_CLASS');
    expect(state.archetype).toBe('mystic');
    expect(creationEvents(ctx).map((e: any) => e.message)).toEqual([
      'Mystic. Interesting. The Keeper is forging something... unique for you. Stand by.',
    ]);
  });

  it('caps a very long race description at the reducer: the public state row and the job snapshot carry at most the model limit', () => {
    const long = 'A people of salt and patience. '.repeat(3_000);
    const ctx = newCtx(creationSeed('AWAITING_RACE'));
    expect(() => submit(ctx, long)).not.toThrow();

    const capped = [...long.trim()].slice(0, PLAYER_INPUT_MAX_CHARS).join('');
    const job = expectEnqueued(ctx, 'creation_race');
    expect(resolveRouteInput(ctx, job)).toEqual({ raceDescription: capped });
    expect(rows(ctx, 'character_creation_state')[0].raceDescription).toBe(capped);
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('GENERATING_RACE');
  });

  it('a known race is reused: straight to AWAITING_ARCHETYPE, no job, no considering line', () => {
    const ctx = newCtx({
      ...creationSeed('AWAITING_RACE'),
      // the mock maps the by_name accessor to the column `name`
      race_definition: [
        {
          id: 1n,
          name: 'the salt folk',
          nameLower: 'the salt folk',
          narrative: 'Salt and patience.',
          bonusesJson: '{"primary":{"stat":"wis","value":2},"secondary":{"stat":"con","value":1},"flavor":""}',
          createdAt: { microsSinceUnixEpoch: T0 },
        },
      ],
    });
    submit(ctx, 'The Salt Folk');

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    const messages = creationEvents(ctx).map((e: any) => e.message);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('Salt and patience.');
    expect(messages.join('\n')).not.toContain('considering');
  });

  it('a refused race (daily cost) creates no job, stays at AWAITING_RACE and posts only the refusal', () => {
    const ctx = newCtx(creationSeed('AWAITING_RACE'));
    exhaustDay(ctx);
    submit(ctx, 'A quiet people of the salt marshes');

    expectNothingReserved(ctx);
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    const events = creationEvents(ctx);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('creation_error');
    expect(events[0].message).toBe(llmRefusalMessage('daily_cost'));
  });

  it('a refused class reverts to AWAITING_ARCHETYPE with only the refusal line', () => {
    const ctx = newCtx(creationSeed('AWAITING_ARCHETYPE', { raceName: 'Saltkin', raceNarrative: 'Marsh dwellers.' }));
    exhaustDay(ctx);
    submit(ctx, 'Warrior');

    expectNothingReserved(ctx);
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    expect(creationEvents(ctx).map((e: any) => [e.kind, e.message])).toEqual([
      ['creation_error', llmRefusalMessage('daily_cost')],
    ]);
  });

  it('the old prepare reducer is gone from the module', () => {
    expect(capturedReducer('prepare_creation_llm')).toBeUndefined();
  });

  describe('never auto-retries (T-41-05)', () => {
    const FAKE_KEY = ['sk', '-ant-', 'api03-', 'CREATIONKEY'.repeat(3)].join('');
    const err500 = () =>
      JSON.parse(readFileSync(new URL('../helpers/__fixtures__/claude/err_500.json', import.meta.url), 'utf-8'));

    const setup = (responses: any[]) => {
      const proc = createMockProcCtx({
        seed: {
          ...creationSeed('AWAITING_RACE'),
          llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
        },
        timestampMicros: T0,
        responses,
        strict: true,
      });
      // A reducer-shaped view of the same database and clock as the executor context.
      const reducerCtx = {
        db: proc.db,
        sender: alice,
        get timestamp() {
          return proc.ctx.timestamp;
        },
      };
      return { proc, reducerCtx };
    };
    const run = (proc: any) => {
      const dispatch = rows(proc, 'llm_dispatch').shift();
      return runLlmJob(proc.ctx, dispatch, {
        nowMs: () => Number(proc.clock.now() / 1000n),
        log: () => {},
      });
    };

    it.each([
      ['a 500 reply', () => [err500()]],
      ['a timeout', () => [{ throw: 'timeout' as const }]],
    ])('%s ends the job after one attempt, returns to AWAITING_RACE with the Try again line, and only a new submission starts another call', (_label, makeResponses) => {
      const { proc, reducerCtx } = setup(makeResponses());
      handlers.submit_creation_input(reducerCtx, { text: 'A quiet people of the salt marshes' });
      expect(rows(proc, 'llm_job')).toHaveLength(1);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(1);

      expect(run(proc)).toBe('failed');

      const jobs = rows(proc, 'llm_job');
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('failed');
      expect(jobs[0].attempt).toBe(1n);
      expect(proc.http.calls).toHaveLength(1);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0); // no retry dispatch
      expect(rows(proc, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
      const last = rows(proc, 'event_creation').slice(-1)[0];
      expect(last.kind).toBe('creation_error');
      expect(last.message).toContain('Try again');

      // The player's next submission is the only thing that starts a new call.
      handlers.submit_creation_input(reducerCtx, { text: 'A quiet people of the salt marshes' });
      expect(rows(proc, 'llm_job')).toHaveLength(2);
      expect(rows(proc, 'llm_job')[1].status).toBe('pending');
      expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
      expect(rows(proc, 'character_creation_state')[0].step).toBe('GENERATING_RACE');
      expect(proc.http.calls).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Staged class reveal (43-13, LAT-04)
// ---------------------------------------------------------------------------

describe('staged class reveal (LAT-04)', () => {
  const FAKE_KEY = ['sk', '-ant-', 'api03-', 'CLASSSTAGEKEY'.repeat(3)].join('');
  const T = { microsSinceUnixEpoch: T0 };

  const ability = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    description: `${name} description.`,
    kind: 'damage',
    targetRule: 'single_enemy',
    damageType: 'fire',
    resourceType: 'mana',
    resourceCost: 15,
    castSeconds: 1,
    cooldownSeconds: 6,
    value1: 12,
    scaling: 'int',
    effectType: null,
    effectMagnitude: null,
    effectDuration: null,
    ...over,
  });
  const REVEAL_JSON = {
    className: 'Tidecaller',
    classDescription: 'Speaks to the sea and is rarely answered.',
    firstAbility: ability('Brine Lash'),
  };
  const FILL_JSON = {
    stats: {
      primaryStat: 'int',
      secondaryStat: 'wis',
      bonusHp: 4,
      bonusMana: 20,
      weaponProficiencies: ['staff'],
      armorProficiencies: ['cloth'],
      usesMana: true,
    },
    abilities: [ability('Undertow'), ability('Salt Ward')],
  };

  const okJsonReply = (payload: unknown) => {
    const reply = JSON.parse(
      readFileSync(new URL('../helpers/__fixtures__/claude/ok_json.json', import.meta.url), 'utf-8'),
    );
    reply.body.content = [{ type: 'text', text: JSON.stringify(payload) }];
    return reply;
  };
  const err529 = () =>
    JSON.parse(readFileSync(new URL('../helpers/__fixtures__/claude/err_529.json', import.meta.url), 'utf-8'));

  const stateRow = (step: string, over: Record<string, unknown> = {}) => ({
    id: 1n,
    playerId: alice,
    step,
    raceName: 'Saltkin',
    raceNarrative: 'Marsh dwellers.',
    raceBonuses: '{"primary":{"stat":"wis","value":2},"secondary":{"stat":"con","value":1},"flavor":""}',
    archetype: 'mystic',
    createdAt: T,
    updatedAt: T,
    ...over,
  });
  /** A state that holds the stage-1 reveal (name, description, one ability). */
  const revealedRow = (step: string, over: Record<string, unknown> = {}) =>
    stateRow(step, {
      className: 'Tidecaller',
      classDescription: 'Speaks to the sea and is rarely answered.',
      abilities: JSON.stringify([ability('Brine Lash')]),
      ...over,
    });
  const seedFor = (row: Record<string, unknown>): Seed => ({ ...playerSeed(), character_creation_state: [row] });

  const submit = (ctx: any, text: string) => handlers.submit_creation_input(ctx, { text });
  const events = (ctx: any) => rows(ctx, 'event_creation');
  const messages = (ctx: any): string[] => events(ctx).map((e: any) => e.message);
  const state = (ctx: any) => rows(ctx, 'character_creation_state')[0];

  const setup = (row: Record<string, unknown>, responses: any[]) => {
    const proc = createMockProcCtx({
      seed: { ...seedFor(row), llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: T }] },
      timestampMicros: T0,
      responses,
      strict: true,
    });
    const reducerCtx = {
      db: proc.db,
      sender: alice,
      get timestamp() {
        return proc.ctx.timestamp;
      },
    };
    return { proc, reducerCtx };
  };
  const run = (proc: any) => {
    const dispatch = rows(proc, 'llm_dispatch').shift();
    return runLlmJob(proc.ctx, dispatch, { nowMs: () => Number(proc.clock.now() / 1000n), log: () => {} });
  };

  describe('the reducer at the two new steps', () => {
    it('input at CLASS_FILLING posts the patience line and writes nothing else', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILLING')));
      const before = { ...state(ctx) };
      submit(ctx, 'Brine Lash');

      expect(messages(ctx)).toEqual([CLASS_FILL_PATIENCE_LINE]);
      expect(state(ctx)).toEqual(before);
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    });

    it.each(['go back', 'start over', 'try again', 'undo'])(
      'a "%s" at CLASS_FILLING is not offered as a go-back: patience line, same step',
      (text) => {
        const ctx = newCtx(seedFor(revealedRow('CLASS_FILLING')));
        submit(ctx, text);
        expect(state(ctx).step).toBe('CLASS_FILLING');
        expect(messages(ctx)).toEqual([CLASS_FILL_PATIENCE_LINE]);
        expect(rows(ctx, 'llm_job')).toHaveLength(0);
      },
    );

    it('any input at CLASS_FILL_ERROR starts one creation_class job (no reveal job), moves to CLASS_FILLING and posts the retry line', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      submit(ctx, 'ok then');

      const job = expectEnqueued(ctx, 'creation_class');
      expect(JSON.parse(job.dedupeKey)).toEqual([alice.toHexString(), 'creation_class', '1:class']);
      const input = resolveRouteInput(ctx, job) as any;
      expect(input).toMatchObject({ raceName: 'Saltkin', archetype: 'mystic', className: 'Tidecaller' });
      expect(input.firstAbility).toMatchObject({ name: 'Brine Lash', resourceType: 'mana' });
      expect(() => buildRouteLayers('creation_class', input)).not.toThrow();
      expect(rows(ctx, 'llm_job').some((j: any) => j.route === 'creation_class_reveal')).toBe(false);
      expect(state(ctx)).toMatchObject({ step: 'CLASS_FILLING', className: 'Tidecaller' });
      expect(JSON.parse(state(ctx).abilities)).toHaveLength(1);
      expect(messages(ctx)).toEqual([CLASS_FILL_RETRY_LINE]);
      expect(allRowsMatchSchema(ctx, ['character_creation_state', 'event_creation'])).toEqual([]);
    });

    it('"try again" at CLASS_FILL_ERROR retries the fill (it is not a go-back there)', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      submit(ctx, 'try again');
      expectEnqueued(ctx, 'creation_class');
      expect(state(ctx).step).toBe('CLASS_FILLING');
      expect(messages(ctx)).toEqual([CLASS_FILL_RETRY_LINE]);
    });

    it('a second input while the retry runs only gets the patience line (one fill job at a time)', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      submit(ctx, 'ok then');
      submit(ctx, 'hello?');
      expectEnqueued(ctx, 'creation_class');
      expect(messages(ctx)).toEqual([CLASS_FILL_RETRY_LINE, CLASS_FILL_PATIENCE_LINE]);
    });

    it('with the kill switch off a retry creates no job, stays CLASS_FILL_ERROR and posts the resting line', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      setLlmEnabled(ctx, false);
      submit(ctx, 'ok then');

      expectNothingReserved(ctx);
      expect(state(ctx)).toMatchObject({ step: 'CLASS_FILL_ERROR', className: 'Tidecaller' });
      expect(events(ctx).map((e: any) => [e.kind, e.message])).toEqual([['creation_error', LLM_RESTING_LINE]]);
    });

    it('with the daily cost spent a retry stays CLASS_FILL_ERROR with only the refusal line', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      ctx.db.llm_player_budget.insert({
        id: 0n,
        playerId: alice,
        dayUtc: utcDay(ctx.timestamp),
        reservedMicroUsd: 0n,
        spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
        calls: 1n,
      });
      submit(ctx, 'ok then');
      expectNothingReserved(ctx);
      expect(state(ctx).step).toBe('CLASS_FILL_ERROR');
      expect(messages(ctx)).toEqual([llmRefusalMessage('daily_cost')]);
    });

    it('"go back" at CLASS_FILL_ERROR asks to confirm going back to AWAITING_ARCHETYPE; yes clears the class fields', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      submit(ctx, 'go back');
      expect(state(ctx)).toMatchObject({ step: 'CONFIRMING_GO_BACK', goBackTarget: 'AWAITING_ARCHETYPE', previousStep: 'CLASS_FILL_ERROR' });
      expect(events(ctx)[0].kind).toBe('creation_warning');
      expect(rows(ctx, 'llm_job')).toHaveLength(0);

      submit(ctx, 'yes');
      const s = state(ctx);
      expect(s.step).toBe('AWAITING_ARCHETYPE');
      expect(s.className).toBeUndefined();
      expect(s.classDescription).toBeUndefined();
      expect(s.abilities).toBeUndefined();
      expect(s.classStats).toBeUndefined();
      expect(s.archetype).toBeUndefined();
      expect(s.raceName).toBe('Saltkin');
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
    });

    it('declining the go-back at CLASS_FILL_ERROR restores CLASS_FILL_ERROR with the reveal intact', () => {
      const ctx = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      submit(ctx, 'go back');
      submit(ctx, 'no');
      expect(state(ctx)).toMatchObject({ step: 'CLASS_FILL_ERROR', className: 'Tidecaller' });
      expect(JSON.parse(state(ctx).abilities)).toHaveLength(1);
    });

    it('start_creation resumes CLASS_FILLING and CLASS_FILL_ERROR with their own lines and writes nothing else', () => {
      const filling = newCtx(seedFor(revealedRow('CLASS_FILLING')));
      handlers.start_creation(filling, {});
      expect(messages(filling)).toEqual([
        'The Keeper is still working out the rest of what you can do. Patience is a virtue you clearly lack, but try anyway.',
      ]);
      expect(state(filling).step).toBe('CLASS_FILLING');

      const failed = newCtx(seedFor(revealedRow('CLASS_FILL_ERROR')));
      handlers.start_creation(failed, {});
      expect(messages(failed)).toEqual([
        'The rest of your abilities slipped away from the Keeper. Say anything and he will try again, or type "go back."',
      ]);
      expect(state(failed).step).toBe('CLASS_FILL_ERROR');
      expect(rows(failed, 'llm_job')).toHaveLength(0);
    });

    it('a state at CLASS_FILLING or CLASS_FILL_ERROR can never be confirmed or named: the ability choice is not reachable', () => {
      for (const step of ['CLASS_FILLING', 'CLASS_FILL_ERROR']) {
        const ctx = newCtx(seedFor(revealedRow(step)));
        submit(ctx, 'Brine Lash');
        expect(['CLASS_FILLING', 'CLASS_FILL_ERROR']).toContain(state(ctx).step);
        expect(state(ctx).chosenAbilityIndex).toBeUndefined();
        expect(state(ctx).characterName).toBeUndefined();
      }
    });
  });

  describe('end to end through the reducers and the executor', () => {
    it('archetype, reveal, patience while filling, fill, ability choice: the player cannot pass stage 2', () => {
      const { proc, reducerCtx } = setup(stateRow('AWAITING_ARCHETYPE'), [okJsonReply(REVEAL_JSON), okJsonReply(FILL_JSON)]);

      submit(reducerCtx, 'Mystic');
      expect(state(proc).step).toBe('GENERATING_CLASS');
      expect(rows(proc, 'llm_job').map((j: any) => j.route)).toEqual(['creation_class_reveal']);

      // Stage 1 lands: the class identity and the first ability are visible, the fill job is pending.
      expect(run(proc)).toBe('completed');
      expect(state(proc)).toMatchObject({ step: 'CLASS_FILLING', className: 'Tidecaller' });
      expect(JSON.parse(state(proc).abilities).map((a: any) => a.name)).toEqual(['Brine Lash']);
      expect(rows(proc, 'llm_job').map((j: any) => [j.route, j.status])).toEqual([
        ['creation_class_reveal', 'completed'],
        ['creation_class', 'pending'],
      ]);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
      const reveal = messages(proc).slice(-1)[0];
      expect(reveal).toContain('Speaks to the sea and is rarely answered.');
      expect(reveal).toContain('**Tidecaller**');
      expect(reveal).toContain('Your first ability:');
      expect(reveal).toContain('Brine Lash');
      expect(reveal).toContain(CLASS_REVEAL_MILESTONE_LINE);
      expect(proc.http.calls).toHaveLength(1);

      // Input during CLASS_FILLING cannot reach AWAITING_NAME: patience, nothing changes.
      submit(reducerCtx, 'Brine Lash');
      expect(state(proc).step).toBe('CLASS_FILLING');
      expect(state(proc).chosenAbilityIndex).toBeUndefined();
      expect(messages(proc).slice(-1)).toEqual([CLASS_FILL_PATIENCE_LINE]);
      expect(rows(proc, 'llm_job')).toHaveLength(2);

      // Stage 2 lands: three abilities, and only now can one be chosen.
      expect(run(proc)).toBe('completed');
      expect(state(proc).step).toBe('CLASS_REVEALED');
      expect(JSON.parse(state(proc).abilities).map((a: any) => a.name)).toEqual(['Brine Lash', 'Undertow', 'Salt Ward']);
      expect(JSON.parse(state(proc).classStats)).toMatchObject({ primaryStat: 'int', usesMana: true });
      expect(messages(proc).slice(-1)[0]).toContain('Choose one.');

      submit(reducerCtx, 'Undertow');
      expect(state(proc)).toMatchObject({ step: 'AWAITING_NAME', chosenAbilityIndex: 1n });
      expect(rows(proc, 'llm_job')).toHaveLength(2);
      expect(proc.http.calls).toHaveLength(2);
      expect(allRowsMatchSchema(proc, ['character_creation_state', 'event_creation', 'llm_job', 'llm_dispatch'])).toEqual([]);
    });

    it('a fill that fails keeps the reveal; one input retries the fill only and a scripted reply completes the class', () => {
      const { proc, reducerCtx } = setup(stateRow('AWAITING_ARCHETYPE'), [
        okJsonReply(REVEAL_JSON),
        err529(),
        okJsonReply(FILL_JSON),
      ]);
      submit(reducerCtx, 'Mystic');
      expect(run(proc)).toBe('completed');
      expect(run(proc)).toBe('failed');

      expect(state(proc)).toMatchObject({ step: 'CLASS_FILL_ERROR', className: 'Tidecaller' });
      expect(JSON.parse(state(proc).abilities)).toHaveLength(1);
      expect(rows(proc, 'llm_job')).toHaveLength(2); // nothing retried it
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
      const failedLine = events(proc).slice(-1)[0];
      expect(failedLine).toMatchObject({ kind: 'creation_error', message: CLASS_FILL_FAILED_LINE });
      expect(proc.http.calls).toHaveLength(2);

      submit(reducerCtx, 'ok then');
      expect(state(proc).step).toBe('CLASS_FILLING');
      expect(rows(proc, 'llm_job').map((j: any) => [j.route, j.status])).toEqual([
        ['creation_class_reveal', 'completed'],
        ['creation_class', 'failed'],
        ['creation_class', 'pending'],
      ]);
      expect(messages(proc).slice(-1)).toEqual([CLASS_FILL_RETRY_LINE]);
      expect(state(proc).className).toBe('Tidecaller');

      expect(run(proc)).toBe('completed');
      expect(state(proc).step).toBe('CLASS_REVEALED');
      expect(JSON.parse(state(proc).abilities)).toHaveLength(3);
      expect(proc.http.calls).toHaveLength(3);
    });

    it('a failed reveal returns to AWAITING_ARCHETYPE and never queues a fill', () => {
      const { proc, reducerCtx } = setup(stateRow('AWAITING_ARCHETYPE'), [err529()]);
      submit(reducerCtx, 'Warrior');
      expect(run(proc)).toBe('failed');
      expect(state(proc).step).toBe('AWAITING_ARCHETYPE');
      expect(rows(proc, 'llm_job').map((j: any) => j.route)).toEqual(['creation_class_reveal']);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    });

    it('a malformed fill reply keeps the reveal at CLASS_FILL_ERROR and a retry is one input away', () => {
      const { proc, reducerCtx } = setup(stateRow('AWAITING_ARCHETYPE'), [
        okJsonReply(REVEAL_JSON),
        okJsonReply({ stats: FILL_JSON.stats, abilities: [] }),
      ]);
      submit(reducerCtx, 'Mystic');
      expect(run(proc)).toBe('completed');
      expect(run(proc)).toBe('completed'); // the call succeeded; the reply added no ability
      expect(state(proc)).toMatchObject({ step: 'CLASS_FILL_ERROR', className: 'Tidecaller' });
      expect(JSON.parse(state(proc).abilities)).toHaveLength(1);
      expect(events(proc).slice(-1)[0].message).toBe(CLASS_FILL_FAILED_LINE);

      submit(reducerCtx, 'go on');
      expect(state(proc).step).toBe('CLASS_FILLING');
    });
  });
});

// ---------------------------------------------------------------------------
// World generation (41-14)
// ---------------------------------------------------------------------------

describe('world generation cutover (PIPE-01 / PIPE-04 / PIPE-05)', () => {
  // Phase 43 stages world generation: every trigger enqueues the small reveal job (world_gen_start) first;
  // the world_gen fill job is enqueued by the stage-1 apply (see "staged world generation (LAT-03)" below).
  const T = { microsSinceUnixEpoch: T0 };
  const RIPPLE = 'The edges of reality ripple around you. The world pauses, as if remembering something it had forgotten...';
  const PATIENCE = 'The world is already taking shape around you. Patience.';
  const EXPLORE_LINE = 'Type [explore] to try again';

  const genRow = (over: Record<string, unknown> = {}) => ({
    id: 5n,
    playerId: alice,
    characterId: 1n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'ERROR',
    errorMessage: 'The Keeper falters.',
    createdAt: T,
    updatedAt: T,
    ...over,
  });
  const exhaustDay = (ctx: any) =>
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
  const worldGenStates = (ctx: any) => rows(ctx, 'world_gen_state');
  const explore = (ctx: any) => handlers.submit_intent(ctx, { characterId: 1n, text: 'explore' });

  // An uncharted location in region 1, connected from The Crossing (10).
  const unchartedSeed = (over: Seed = {}): Seed => {
    const world = worldSeed();
    return {
      ...playerSeed(),
      region: world.region,
      location: [
        ...world.location,
        { id: 11n, name: 'The Edge Beyond', description: 'Mist.', zone: 'Uncharted', regionId: 1n, isSafe: true, terrainType: 'uncharted' },
      ],
      location_connection: [
        { id: 1n, fromLocationId: 10n, toLocationId: 11n },
        { id: 2n, fromLocationId: 11n, toLocationId: 10n },
      ],
      ...characterSeed({ stamina: 100n, maxStamina: 100n, perception: 0n, level: 1n }),
      ...over,
    };
  };
  const atUncharted = (over: Seed = {}): Seed =>
    unchartedSeed({ ...characterSeed({ locationId: 11n, stamina: 100n, maxStamina: 100n, perception: 0n, level: 1n }), ...over });

  // A character still at location 0 (finalized, waiting on the starter region).
  const starterSeed = (states: Record<string, unknown>[], over: Seed = {}): Seed => ({
    ...playerSeed(),
    ...characterSeed({ locationId: 0n }),
    world_gen_state: states.map((s, i) => genRow({ id: BigInt(i + 1), ...s })),
    ...over,
  });

  describe('finalizing a character', () => {
    const confirmSeed = (): Seed => ({
      ...playerSeed(),
      character_creation_state: [
        {
          id: 1n,
          playerId: alice,
          step: 'CONFIRMING',
          raceName: 'Saltkin',
          raceNarrative: 'Marsh dwellers.',
          raceBonuses: '{"primary":{"stat":"wis","value":2},"secondary":{"stat":"con","value":1},"flavor":""}',
          archetype: 'mystic',
          className: 'Tidecaller',
          characterName: 'Mirel',
          createdAt: T,
          updatedAt: T,
        },
      ],
    });

    it('confirm creates the character at location 0 and starts one GENERATING world_gen_start job in the same transaction', () => {
      const ctx = newCtx(confirmSeed());
      handlers.submit_creation_input(ctx, { text: 'confirm' });

      const chars = rows(ctx, 'character');
      expect(chars).toHaveLength(1);
      expect(chars[0].locationId).toBe(0n);
      const states = worldGenStates(ctx);
      expect(states).toHaveLength(1);
      expect(states[0]).toMatchObject({ step: 'GENERATING', sourceLocationId: 0n, sourceRegionId: 0n, characterId: chars[0].id });

      const job = expectEnqueued(ctx, 'world_gen_start');
      expect(job.characterId).toBe(chars[0].id);
      expect(JSON.parse(job.requestJson).genStateId).toBe(states[0].id.toString());
      expect(JSON.parse(job.dedupeKey)).toEqual([alice.toHexString(), 'world_gen_start', states[0].id.toString()]);
      const input = resolveRouteInput(ctx, job) as any;
      expect(input).toMatchObject({
        characterRace: 'Saltkin',
        characterClass: 'Tidecaller',
        characterArchetype: 'mystic',
        sourceRegionName: 'the known world',
        neighborRegions: [],
      });
      expect(() => buildRouteLayers('world_gen_start', input)).not.toThrow();
      expect(allRowsMatchSchema(ctx, ['world_gen_state', 'character'])).toEqual([]);
    });

    it('a refused start leaves the character created and the state in ERROR with the in-voice [explore] line', () => {
      const ctx = newCtx(confirmSeed());
      exhaustDay(ctx);
      handlers.submit_creation_input(ctx, { text: 'confirm' });

      expect(rows(ctx, 'character')).toHaveLength(1);
      expectNothingReserved(ctx);
      const state = worldGenStates(ctx)[0];
      expect(state.step).toBe('ERROR');
      expect(state.errorMessage).toBe('The Keeper strains but cannot shape this realm right now.');
      const errors = rows(ctx, 'event_creation').filter((e: any) => e.kind === 'creation_error');
      expect(errors.map((e: any) => e.message)).toEqual([
        'The Keeper strains but cannot shape this realm right now. Type [explore] to try again later.',
      ]);
    });
  });

  describe('travelling to an uncharted location', () => {
    const go = (ctx: any) => handlers.submit_intent(ctx, { characterId: 1n, text: 'go The Edge Beyond' });

    it('starts one GENERATING state and job and posts the ripple line', () => {
      const ctx = newCtx(unchartedSeed());
      go(ctx);

      expect(rows(ctx, 'character')[0].locationId).toBe(11n);
      const states = worldGenStates(ctx);
      expect(states).toHaveLength(1);
      expect(states[0]).toMatchObject({ step: 'GENERATING', sourceLocationId: 11n, sourceRegionId: 1n, characterId: 1n });
      const job = expectEnqueued(ctx, 'world_gen_start');
      const input = resolveRouteInput(ctx, job) as any;
      expect(input.sourceRegionName).toBe('Ashen Reach');
      expect(input.characterRace).toBe('Kobold');
      expect(systemLines(ctx)).toContain(RIPPLE);
    });

    it('a refused start posts the refusal line but not the ripple line, and the state is ERROR', () => {
      const ctx = newCtx(unchartedSeed());
      exhaustDay(ctx);
      go(ctx);

      expectNothingReserved(ctx);
      expect(worldGenStates(ctx)[0].step).toBe('ERROR');
      const lines = systemLines(ctx);
      expect(lines).not.toContain(RIPPLE);
      expect(lines).toContain(
        'The Keeper strains but cannot shape this realm right now. Type [explore] to try again later.',
      );
    });
  });

  describe('explore', () => {
    it('at an uncharted location whose only state is ERROR starts a new GENERATING state and one job', () => {
      const ctx = newCtx(atUncharted({ world_gen_state: [genRow({ sourceLocationId: 11n, sourceRegionId: 1n })] }));
      explore(ctx);

      const states = worldGenStates(ctx);
      expect(states).toHaveLength(2);
      expect(states[0].step).toBe('ERROR');
      expect(states[1]).toMatchObject({ step: 'GENERATING', sourceLocationId: 11n, sourceRegionId: 1n });
      expectEnqueued(ctx, 'world_gen_start');
      expect(systemLines(ctx)).toEqual([RIPPLE]);
    });

    it('while the state is GENERATING a second explore answers with the patience line and starts nothing', () => {
      const ctx = newCtx(atUncharted({ world_gen_state: [genRow({ sourceLocationId: 11n, sourceRegionId: 1n })] }));
      explore(ctx);
      explore(ctx);

      expect(worldGenStates(ctx)).toHaveLength(2);
      expectEnqueued(ctx, 'world_gen_start');
      expect(systemLines(ctx)).toEqual([RIPPLE, PATIENCE]);
    });

    it('for a character at location 0 whose starter state is ERROR creates a fresh starter state and starts it', () => {
      const ctx = newCtx(starterSeed([{}]));
      explore(ctx);

      const states = worldGenStates(ctx);
      expect(states).toHaveLength(2);
      expect(states[0].step).toBe('ERROR');
      expect(states[1]).toMatchObject({
        step: 'GENERATING',
        sourceLocationId: 0n,
        sourceRegionId: 0n,
        characterId: 1n,
      });
      const job = expectEnqueued(ctx, 'world_gen_start');
      expect(JSON.parse(job.requestJson).genStateId).toBe(states[1].id.toString());
      expect(systemLines(ctx)).toEqual([RIPPLE]);
    });

    it('for a character at location 0 reuses a matching starter region for free', () => {
      const ctx = newCtx(
        starterSeed([{}], {
          region: [{ id: 2n, name: 'Emberdeep', dangerMultiplier: 100n, starterForRace: 'kobold' }],
          location: [{ id: 30n, name: 'Hearthhold', description: 'Warm.', zone: 'z', regionId: 2n, isSafe: true, terrainType: 'town' }],
        }),
      );
      explore(ctx);

      expectNothingReserved(ctx);
      expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: 30n, boundLocationId: 30n });
      expect(worldGenStates(ctx)[1]).toMatchObject({ step: 'COMPLETE', generatedRegionId: 2n });
    });

    it.each(['PENDING', 'GENERATING'])('for a character at location 0 with a %s starter state answers with the patience line and no job', (step) => {
      const ctx = newCtx(starterSeed([{ step, errorMessage: undefined }]));
      explore(ctx);

      expectNothingReserved(ctx);
      expect(worldGenStates(ctx)).toHaveLength(1);
      expect(systemLines(ctx)).toEqual([PATIENCE]);
    });

    it('for a character at location 0 with no starter state at all says there is nothing uncharted to explore', () => {
      const ctx = newCtx(starterSeed([]));
      explore(ctx);

      expectNothingReserved(ctx);
      expect(worldGenStates(ctx)).toHaveLength(0);
      expect(systemLines(ctx)).toEqual(['There is nothing uncharted to explore here.']);
    });

    it('a refused first-region retry leaves the state in ERROR with the [explore] line and no job', () => {
      const ctx = newCtx(starterSeed([{}]));
      exhaustDay(ctx);
      explore(ctx);

      expectNothingReserved(ctx);
      const states = worldGenStates(ctx);
      expect(states[states.length - 1].step).toBe('ERROR');
      const errors = rows(ctx, 'event_creation').filter((e: any) => e.kind === 'creation_error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain(EXPLORE_LINE);
    });

    it('the explore intent finds the starter state by character, so another identity of the same user can retry', () => {
      const bob = { toHexString: () => 'b'.repeat(64) };
      const ctx = newCtx(
        starterSeed([{}], { player: [{ id: alice, userId: 7n, activeCharacterId: 1n }, { id: bob, userId: 7n }] }),
        bob,
      );
      explore(ctx);

      const states = worldGenStates(ctx);
      expect(states).toHaveLength(2);
      expect(states[1]).toMatchObject({ step: 'GENERATING', playerId: bob, characterId: 1n, sourceRegionId: 0n });
      expect(expectEnqueued(ctx, 'world_gen_start').playerId).toBe(bob);
      expect(systemLines(ctx)).toEqual([RIPPLE]);
    });
  });

  // CR-B01: the client shows the creation console for a character at location 0, and every line or
  // click there goes to submit_creation_input. The first-region retry must be reachable from it.
  describe('first-region retry from the creation console (submit_creation_input)', () => {
    const bob = { toHexString: () => 'b'.repeat(64) };
    const completeState = () => ({
      id: 1n,
      playerId: alice,
      step: 'COMPLETE',
      characterName: 'Aldric',
      createdAt: T,
      updatedAt: T,
    });
    const submitCreation = (ctx: any, text: string) => handlers.submit_creation_input(ctx, { text });
    const creationLines = (ctx: any) => rows(ctx, 'event_creation').map((e: any) => [e.kind, e.message]);

    it.each(['explore', '[explore]', 'Explore'])('%s at COMPLETE with an ERROR starter state starts a fresh starter job', (text) => {
      const ctx = newCtx(starterSeed([{}], { character_creation_state: [completeState()] }));
      submitCreation(ctx, text);

      const states = worldGenStates(ctx);
      expect(states).toHaveLength(2);
      expect(states[0].step).toBe('ERROR');
      expect(states[1]).toMatchObject({ step: 'GENERATING', playerId: alice, characterId: 1n, sourceRegionId: 0n });
      const job = expectEnqueued(ctx, 'world_gen_start');
      expect(JSON.parse(job.requestJson).genStateId).toBe(states[1].id.toString());
      expect(creationLines(ctx)).toEqual([['creation', RIPPLE]]);
      // The finished creation is untouched: no new creation, no "already created" line.
      expect(rows(ctx, 'character_creation_state')).toHaveLength(1);
      expect(rows(ctx, 'character_creation_state')[0].step).toBe('COMPLETE');
    });

    it('while the starter state is GENERATING answers with the patience line and starts nothing', () => {
      const ctx = newCtx(
        starterSeed([{ step: 'GENERATING', errorMessage: undefined }], { character_creation_state: [completeState()] }),
      );
      submitCreation(ctx, 'explore');

      expectNothingReserved(ctx);
      expect(worldGenStates(ctx)).toHaveLength(1);
      expect(creationLines(ctx)).toEqual([['creation', PATIENCE]]);
    });

    it('a refused retry leaves the fresh state in ERROR with the [explore] line and no job', () => {
      const ctx = newCtx(starterSeed([{}], { character_creation_state: [completeState()] }));
      exhaustDay(ctx);
      submitCreation(ctx, 'explore');

      expectNothingReserved(ctx);
      const states = worldGenStates(ctx);
      expect(states).toHaveLength(2);
      expect(states[1].step).toBe('ERROR');
      const lines = creationLines(ctx);
      expect(lines).toHaveLength(1);
      expect(lines[0][0]).toBe('creation_error');
      expect(lines[0][1]).toContain(EXPLORE_LINE);
    });

    it('another device (another identity of the same user, no creation state) retries by character, not by sender', () => {
      const ctx = newCtx(
        starterSeed([{}], { player: [{ id: alice, userId: 7n, activeCharacterId: 1n }, { id: bob, userId: 7n }] }),
        bob,
      );
      submitCreation(ctx, 'explore');

      // No new creation is auto-started for the second identity.
      expect(rows(ctx, 'character_creation_state')).toHaveLength(0);
      const states = worldGenStates(ctx);
      expect(states).toHaveLength(2);
      expect(states[1]).toMatchObject({ step: 'GENERATING', playerId: bob, characterId: 1n });
      expect(expectEnqueued(ctx, 'world_gen_start').playerId).toBe(bob);
      expect(rows(ctx, 'event_creation').map((e: any) => [e.playerId, e.message])).toEqual([[bob, RIPPLE]]);
    });

    it('another device: a first line other than explore gets the [explore] hint, starts no creation, and explore then retries (WR-B01)', () => {
      const ctx = newCtx(
        starterSeed([{}], { player: [{ id: alice, userId: 7n, activeCharacterId: 1n }, { id: bob, userId: 7n }] }),
        bob,
      );
      submitCreation(ctx, 'hello');

      expectNothingReserved(ctx);
      expect(rows(ctx, 'character_creation_state')).toHaveLength(0);
      expect(rows(ctx, 'event_creation').map((e: any) => [e.playerId, e.kind, e.message])).toEqual([
        [bob, 'creation', STRANDED_CHARACTER_HINT],
      ]);

      submitCreation(ctx, 'explore');
      expect(rows(ctx, 'character_creation_state')).toHaveLength(0);
      expect(worldGenStates(ctx)[1]).toMatchObject({ step: 'GENERATING', playerId: bob, characterId: 1n });
      expect(expectEnqueued(ctx, 'world_gen_start').playerId).toBe(bob);
      expect(rows(ctx, 'llm_job').some((j: any) => j.route === 'creation_race')).toBe(false);
      expect(rows(ctx, 'event_creation').map((e: any) => e.message)).toEqual([STRANDED_CHARACTER_HINT, RIPPLE]);
    });

    it('explore at AWAITING_RACE with a stranded character retries the first region instead of billing a race named explore (WR-B01)', () => {
      const awaitingRace = { ...completeState(), step: 'AWAITING_RACE', characterName: undefined };
      const ctx = newCtx(starterSeed([{}], { character_creation_state: [awaitingRace] }));
      submitCreation(ctx, '[explore]');

      expect(rows(ctx, 'llm_job').some((j: any) => j.route === 'creation_race')).toBe(false);
      expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
      expect(expectEnqueued(ctx, 'world_gen_start').playerId).toBe(alice);
      expect(creationLines(ctx)).toEqual([['creation', RIPPLE]]);
    });

    it('any other line at COMPLETE with a stranded character points to [explore]', () => {
      const ctx = newCtx(starterSeed([{}], { character_creation_state: [completeState()] }));
      submitCreation(ctx, 'hello?');

      expectNothingReserved(ctx);
      expect(creationLines(ctx)).toEqual([
        ['creation', STRANDED_CHARACTER_HINT],
      ]);
    });

    it('explore at COMPLETE for a placed character starts nothing and keeps the usual line', () => {
      const ctx = newCtx({
        ...playerSeed(),
        ...characterSeed({ locationId: 10n }),
        character_creation_state: [completeState()],
        world_gen_state: [genRow({ step: 'COMPLETE', errorMessage: undefined })],
      });
      submitCreation(ctx, 'explore');

      expectNothingReserved(ctx);
      expect(worldGenStates(ctx)).toHaveLength(1);
      expect(creationLines(ctx)).toEqual([
        ['creation', 'Your character has already been created. Go forth and do something interesting.'],
      ]);
    });

    it('end to end: confirm, the starter job fails (529), and [explore] from the creation console starts the next job', () => {
      const FAKE_KEY = ['sk', '-ant-', 'api03-', 'STARTERKEY'.repeat(3)].join('');
      const err529 = JSON.parse(
        readFileSync(new URL('../helpers/__fixtures__/claude/err_529.json', import.meta.url), 'utf-8'),
      );
      const proc = createMockProcCtx({
        seed: {
          ...playerSeed(),
          character_creation_state: [
            {
              id: 1n,
              playerId: alice,
              step: 'CONFIRMING',
              raceName: 'Saltkin',
              raceNarrative: 'Marsh dwellers.',
              archetype: 'mystic',
              className: 'Tidecaller',
              characterName: 'Mirel',
              createdAt: T,
              updatedAt: T,
            },
          ],
          llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
        },
        timestampMicros: T0,
        responses: [err529],
        strict: true,
      });
      const reducerCtx = {
        db: proc.db,
        sender: alice,
        get timestamp() {
          return proc.ctx.timestamp;
        },
      };

      handlers.submit_creation_input(reducerCtx, { text: 'confirm' });
      const character = rows(proc, 'character')[0];
      expect(character.locationId).toBe(0n);
      expect(rows(proc, 'player')[0].activeCharacterId).toBe(character.id);
      expect(rows(proc, 'llm_job')).toHaveLength(1);

      const dispatch = rows(proc, 'llm_dispatch').shift();
      expect(runLlmJob(proc.ctx, dispatch, { nowMs: () => Number(proc.clock.now() / 1000n), log: () => {} })).toBe('failed');
      expect(worldGenStates(proc)[0].step).toBe('ERROR');
      const errorLine = rows(proc, 'event_creation').slice(-1)[0];
      expect(errorLine.kind).toBe('creation_error');
      expect(errorLine.message).toContain(EXPLORE_LINE);

      // The line the player is told to type goes to the reducer the client calls.
      handlers.submit_creation_input(reducerCtx, { text: 'explore' });
      expect(rows(proc, 'llm_job')).toHaveLength(2);
      expect(rows(proc, 'llm_job')[1]).toMatchObject({ route: 'world_gen_start', status: 'pending', characterId: character.id });
      expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
      expect(worldGenStates(proc)).toHaveLength(2);
      expect(worldGenStates(proc)[1].step).toBe('GENERATING');
      expect(rows(proc, 'event_creation').slice(-1)[0].message).toBe(RIPPLE);
      expect(proc.http.calls).toHaveLength(1);
    });
  });

  describe('never auto-retries (T-41-05)', () => {
    const FAKE_KEY = ['sk', '-ant-', 'api03-', 'WORLDGENKEY'.repeat(3)].join('');
    const err529 = () =>
      JSON.parse(readFileSync(new URL('../helpers/__fixtures__/claude/err_529.json', import.meta.url), 'utf-8'));

    it('a first-region job hit by a 529 ends failed after one attempt, leaves the state in ERROR with the [explore] line, and only the next explore starts a new job', () => {
      const proc = createMockProcCtx({
        seed: {
          ...starterSeed([{}]),
          llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
        },
        timestampMicros: T0,
        responses: [err529()],
        strict: true,
      });
      const reducerCtx = {
        db: proc.db,
        sender: alice,
        get timestamp() {
          return proc.ctx.timestamp;
        },
      };

      // The player's explore starts the first job.
      handlers.submit_intent(reducerCtx, { characterId: 1n, text: 'explore' });
      expect(rows(proc, 'llm_job')).toHaveLength(1);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
      expect(worldGenStates(proc)[1].step).toBe('GENERATING');

      const dispatch = rows(proc, 'llm_dispatch').shift();
      const outcome = runLlmJob(proc.ctx, dispatch, {
        nowMs: () => Number(proc.clock.now() / 1000n),
        log: () => {},
      });

      expect(outcome).toBe('failed');
      const jobs = rows(proc, 'llm_job');
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('failed');
      expect(jobs[0].attempt).toBe(1n);
      expect(proc.http.calls).toHaveLength(1);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(0); // no retry dispatch
      const state = worldGenStates(proc)[1];
      expect(state.step).toBe('ERROR');
      expect(state.errorMessage).not.toMatch(/\d/);
      expect(state.errorMessage).not.toMatch(/budget|limit|daily|529|overload/i);
      const last = rows(proc, 'event_creation').slice(-1)[0];
      expect(last.kind).toBe('creation_error');
      expect(last.message).toContain(EXPLORE_LINE);

      // Only the player's next explore starts another call.
      handlers.submit_intent(reducerCtx, { characterId: 1n, text: 'explore' });
      expect(rows(proc, 'llm_job')).toHaveLength(2);
      expect(rows(proc, 'llm_job')[1].status).toBe('pending');
      expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
      expect(worldGenStates(proc)).toHaveLength(3);
      expect(worldGenStates(proc)[2].step).toBe('GENERATING');
      expect(proc.http.calls).toHaveLength(1);
    });
  });

  it('the old prepare reducer is gone from the module', () => {
    expect(capturedReducer('prepare_world_gen_llm')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Staged world generation (Phase 43, LAT-03)
// ---------------------------------------------------------------------------

describe('staged world generation (LAT-03)', () => {
  const FAKE_KEY = ['sk', '-ant-', 'api03-', 'STAGEDKEY'.repeat(4)].join('');
  const T = { microsSinceUnixEpoch: T0 };
  const PERSONALITY = { traits: ['brisk'], speechPattern: 'clipped', knowledgeDomains: ['trade'], secrets: [], affinityMultiplier: 1.0 };

  // The same replies the apply characterization uses (copied: that file does not export them).
  const WORLD_START_JSON = {
    regionName: 'Cinderfall',
    regionDescription: 'Ash drifts down like a slow, grey snowfall.',
    biome: 'volcanic',
    startLocation: { name: 'Ember Hollow', description: 'A sheltered town.', terrainType: 'town', levelOffset: 0 },
    firstNpc: { name: 'Vessa', gender: 'female', npcType: 'vendor', description: 'A soot-streaked trader.', greeting: 'Buy something.', personality: PERSONALITY },
  };
  const REGION_FILL_JSON = {
    dominantFaction: 'Ash Court',
    landmarks: ['The Slag Spire'],
    threats: ['ember wolves'],
    locations: [
      { name: 'Slag Road', description: 'A cracked road.', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Ember Hollow', 'Ashen Pit'] },
      { name: 'Ashen Pit', description: 'A smoking crater.', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Slag Road'] },
    ],
    npcs: [
      { name: 'Old Brann', gender: 'male', npcType: 'lore', locationName: 'Slag Road', description: 'A hermit.', greeting: 'Hm.', personality: PERSONALITY },
    ],
    enemies: [
      { name: 'Ember Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 2, level: 1 },
    ],
  };

  const okJsonReply = (payload: unknown) => {
    const reply = JSON.parse(
      readFileSync(new URL('../helpers/__fixtures__/claude/ok_json.json', import.meta.url), 'utf-8'),
    );
    reply.body.content = [{ type: 'text', text: JSON.stringify(payload) }];
    return reply;
  };

  const setup = (responses: any[]) => {
    const proc = createMockProcCtx({
      seed: {
        ...playerSeed(),
        character_creation_state: [
          {
            id: 1n,
            playerId: alice,
            step: 'CONFIRMING',
            raceName: 'Saltkin',
            raceNarrative: 'Marsh dwellers.',
            raceBonuses: '{"primary":{"stat":"wis","value":2},"secondary":{"stat":"con","value":1},"flavor":""}',
            archetype: 'mystic',
            className: 'Tidecaller',
            characterName: 'Mirel',
            createdAt: T,
            updatedAt: T,
          },
        ],
        llm_config: [{ id: 1n, apiKey: FAKE_KEY, updatedAt: { microsSinceUnixEpoch: T0 } }],
      },
      timestampMicros: T0,
      responses,
      strict: true,
    });
    const reducerCtx = {
      db: proc.db,
      sender: alice,
      get timestamp() {
        return proc.ctx.timestamp;
      },
    };
    return { proc, reducerCtx };
  };
  const run = (proc: any) => {
    const dispatch = rows(proc, 'llm_dispatch').shift();
    return runLlmJob(proc.ctx, dispatch, { nowMs: () => Number(proc.clock.now() / 1000n), log: () => {} });
  };
  const state = (proc: any) => rows(proc, 'world_gen_state')[0];

  it('stage 1 makes the region playable while the fill job is still pending; stage 2 then completes it', () => {
    const { proc, reducerCtx } = setup([okJsonReply(WORLD_START_JSON), okJsonReply(REGION_FILL_JSON)]);

    // Finishing the character enqueues the small reveal job first.
    handlers.submit_creation_input(reducerCtx, { text: 'confirm' });
    const character = rows(proc, 'character')[0];
    expect(character.locationId).toBe(0n);
    expect(rows(proc, 'llm_job').map((j: any) => j.route)).toEqual(['world_gen_start']);
    expect(state(proc).step).toBe('GENERATING');

    // Stage 1 lands: the player stands on the start location with the first NPC; the fill job is pending.
    expect(run(proc)).toBe('completed');
    const start = rows(proc, 'location').find((l: any) => l.name === 'Ember Hollow');
    expect(start).toBeDefined();
    expect(rows(proc, 'character')[0]).toMatchObject({ locationId: start.id, boundLocationId: start.id });
    expect(rows(proc, 'region').map((r: any) => r.name)).toEqual(['Cinderfall']);
    expect(rows(proc, 'location')).toHaveLength(1);
    expect(rows(proc, 'npc').map((n: any) => [n.name, n.locationId, n.gender])).toEqual([['Vessa', start.id, 'female']]);
    expect(state(proc)).toMatchObject({ step: 'FILLING', generatedRegionId: rows(proc, 'region')[0].id });
    const pendingFills = rows(proc, 'llm_job').filter((j: any) => j.route === 'world_gen' && j.status === 'pending');
    expect(pendingFills).toHaveLength(1);
    expect(rows(proc, 'llm_job').find((j: any) => j.route === 'world_gen_start').status).toBe('completed');
    expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
    expect(rows(proc, 'enemy_template')).toHaveLength(0);
    expect(rows(proc, 'event_private').map((e: any) => e.message)).toContain(
      'The Keeper clears his throat. This ground will do; the rest of the region is still being remembered.',
    );
    expect(proc.http.calls).toHaveLength(1);

    // Stage 2 lands: the rest of the region.
    expect(run(proc)).toBe('completed');
    expect(state(proc).step).toBe('COMPLETE');
    expect(rows(proc, 'location').map((l: any) => l.name)).toEqual([
      'Ember Hollow', 'Slag Road', 'Ashen Pit', 'The Edge Beyond Cinderfall',
    ]);
    expect(rows(proc, 'location').length).toBeGreaterThan(1);
    expect(rows(proc, 'enemy_template').length).toBeGreaterThan(0);
    expect(rows(proc, 'location').some((l: any) => l.terrainType === 'uncharted')).toBe(true);
    expect(rows(proc, 'llm_job').map((j: any) => [j.route, j.status])).toEqual([
      ['world_gen_start', 'completed'],
      ['world_gen', 'completed'],
    ]);
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(proc.http.calls).toHaveLength(2);

    // Every row the flow inserted matches the recorded schema.
    expect(
      allRowsMatchSchema(proc, ['region', 'location', 'npc', 'world_gen_state', 'llm_job', 'llm_dispatch']),
    ).toEqual([]);
  });

  it('the fill job names the stage-1 facts it was started from', () => {
    const { proc, reducerCtx } = setup([okJsonReply(WORLD_START_JSON)]);
    handlers.submit_creation_input(reducerCtx, { text: 'confirm' });
    expect(run(proc)).toBe('completed');
    const fill = rows(proc, 'llm_job').find((j: any) => j.route === 'world_gen');
    expect(JSON.parse(fill.requestJson).genStateId).toBe(state(proc).id.toString());
    const input = resolveRouteInput(proc, fill) as any;
    expect(input).toMatchObject({
      regionName: 'Cinderfall',
      biome: 'volcanic',
      startLocation: { name: 'Ember Hollow' },
      npcsPresent: [{ name: 'Vessa', npcType: 'vendor', gender: 'female' }],
      characterClass: 'Tidecaller',
    });
    expect(() => buildRouteLayers('world_gen', input)).not.toThrow();
  });

  it('a stage-2 call failure leaves the stage-1 region playable with one [explore] line and no new job', () => {
    const err529 = JSON.parse(
      readFileSync(new URL('../helpers/__fixtures__/claude/err_529.json', import.meta.url), 'utf-8'),
    );
    const { proc, reducerCtx } = setup([okJsonReply(WORLD_START_JSON), err529]);
    handlers.submit_creation_input(reducerCtx, { text: 'confirm' });
    expect(run(proc)).toBe('completed');
    expect(run(proc)).toBe('failed');

    expect(state(proc).step).toBe('FILL_ERROR');
    expect(state(proc).errorMessage).not.toMatch(/\d/);
    const start = rows(proc, 'location').find((l: any) => l.name === 'Ember Hollow');
    const here = rows(proc, 'npc').filter((n: any) => n.locationId === start.id).map((n: any) => n.npcType).sort();
    expect(here).toEqual(['banker', 'vendor']);
    expect(rows(proc, 'character')[0].locationId).toBe(start.id);
    expect(rows(proc, 'llm_job')).toHaveLength(2); // nothing retried it
    expect(rows(proc, 'llm_dispatch')).toHaveLength(0);
    expect(rows(proc, 'event_private').slice(-1)[0].message).toContain('Type [explore] to try again.');
    expect(proc.http.calls).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // Plan 43-11: explore retries stage 2 only; travel and play continue
  // -------------------------------------------------------------------------
  describe('staged world generation: retries and play (LAT-03)', () => {
    const PATIENCE = 'The world is already taking shape around you. Patience.';
    const NOTHING = 'There is nothing uncharted to explore here.';

    // The Crossing (10, source region 1) - The Edge Beyond (11, the converted passage) - Ember Hollow (20, the
    // start location of the generated region 2). The state belongs to the passage's generation.
    const regionSeed = (step: string, charAt: bigint, stateOver: Record<string, unknown> = {}): Seed => ({
      ...playerSeed(),
      ...characterSeed({ locationId: charAt, stamina: 100n, maxStamina: 100n, perception: 0n, level: 1n }),
      region: [
        { id: 1n, name: 'Ashen Reach', dangerMultiplier: 100n, regionType: 'wild', biome: 'volcanic' },
        { id: 2n, name: 'Cinderfall', dangerMultiplier: 200n, regionType: 'wild', biome: 'volcanic' },
      ],
      location: [
        { id: 10n, name: 'The Crossing', description: 'A crossroads.', zone: 'z', regionId: 1n, terrainType: 'plains' },
        { id: 11n, name: 'The Edge Beyond', description: 'Mist.', zone: 'z', regionId: 1n, terrainType: 'plains', isSafe: true },
        { id: 20n, name: 'Ember Hollow', description: 'A sheltered town.', zone: 'Cinderfall', regionId: 2n, terrainType: 'town', isSafe: true },
      ],
      location_connection: [
        { id: 1n, fromLocationId: 10n, toLocationId: 11n },
        { id: 2n, fromLocationId: 11n, toLocationId: 10n },
        { id: 3n, fromLocationId: 11n, toLocationId: 20n },
        { id: 4n, fromLocationId: 20n, toLocationId: 11n },
      ],
      npc: [{ id: 5n, name: 'Vessa', npcType: 'vendor', locationId: 20n, description: 'A trader.', greeting: 'Buy.', gender: 'female' }],
      world_gen_state: [
        {
          id: 5n,
          playerId: alice,
          characterId: 1n,
          sourceLocationId: 11n,
          sourceRegionId: 1n,
          generatedRegionId: 2n,
          step,
          errorMessage: step === 'FILL_ERROR' ? 'The Keeper loses the thread.' : undefined,
          createdAt: { microsSinceUnixEpoch: T0 },
          updatedAt: { microsSinceUnixEpoch: T0 },
          ...stateOver,
        },
      ],
    });
    const exploreAs = (ctx: any) => handlers.submit_intent(ctx, { characterId: 1n, text: 'explore' });
    const states = (ctx: any) => rows(ctx, 'world_gen_state');

    it.each([
      ['the start location', 20n],
      ['the passage', 11n],
    ])('explore at %s of a FILL_ERROR region starts one world_gen fill job, no world_gen_start, and posts the retry line', (_name, at) => {
      const ctx = newCtx(regionSeed('FILL_ERROR', at));
      exploreAs(ctx);

      const job = expectEnqueued(ctx, 'world_gen');
      expect(rows(ctx, 'llm_job').filter((j: any) => j.route === 'world_gen_start')).toHaveLength(0);
      expect(JSON.parse(job.requestJson).genStateId).toBe('5');
      expect(states(ctx)).toHaveLength(1);
      expect(states(ctx)[0]).toMatchObject({ id: 5n, step: 'FILLING', generatedRegionId: 2n, playerId: alice });
      expect(states(ctx)[0].errorMessage).toBeUndefined();
      expect(systemLines(ctx)).toEqual([WORLD_FILL_RETRY_LINE]);
      expect(allRowsMatchSchema(ctx, ['world_gen_state', 'llm_job', 'llm_dispatch'])).toEqual([]);
    });

    it.each([
      ['the start location', 20n],
      ['the passage', 11n],
    ])('explore at %s while the region is FILLING answers with the patience line and starts nothing', (_name, at) => {
      const ctx = newCtx(regionSeed('FILLING', at));
      exploreAs(ctx);

      expectNothingReserved(ctx);
      expect(states(ctx)).toHaveLength(1);
      expect(states(ctx)[0].step).toBe('FILLING');
      expect(systemLines(ctx)).toEqual([PATIENCE]);
    });

    it.each([
      ['the kill switch', (ctx: any) => setLlmEnabled(ctx, false)],
      ['the ceiling', (ctx: any) => patchAdminState(ctx, { dailyCeilingMicroUsd: 1n })],
    ])('explore at a FILL_ERROR region while %s holds answers with the resting line, keeps FILL_ERROR and creates no job', (_name, hold) => {
      const ctx = newCtx(regionSeed('FILL_ERROR', 20n));
      hold(ctx);
      exploreAs(ctx);

      expectNothingReserved(ctx);
      expect(states(ctx)).toHaveLength(1);
      expect(states(ctx)[0].step).toBe('FILL_ERROR');
      const lines = systemLines(ctx);
      expect(lines).toHaveLength(1);
      expect(lines[0].startsWith(LLM_RESTING_LINE)).toBe(true);
      expect(lines).not.toContain(WORLD_FILL_RETRY_LINE);
    });

    it('explore at a charted location with nothing to retry still says there is nothing uncharted', () => {
      const ctx = newCtx(regionSeed('COMPLETE', 10n));
      exploreAs(ctx);

      expectNothingReserved(ctx);
      expect(states(ctx)).toHaveLength(1);
      expect(systemLines(ctx)).toEqual([NOTHING]);
    });

    it('explore at an uncharted location whose only state is ERROR still starts a new world_gen_start job', () => {
      const seed = regionSeed('ERROR', 11n, { generatedRegionId: undefined, sourceLocationId: 11n });
      seed.location = seed.location.map((l: any) => (l.id === 11n ? { ...l, terrainType: 'uncharted' } : l));
      const ctx = newCtx(seed);
      exploreAs(ctx);

      expectEnqueued(ctx, 'world_gen_start');
      expect(states(ctx)).toHaveLength(2);
      expect(states(ctx)[1]).toMatchObject({ step: 'GENERATING', sourceLocationId: 11n });
      expect(systemLines(ctx)).toHaveLength(1);
    });

    it.each(['FILLING', 'FILL_ERROR'])('travelling onto the passage of a %s region starts no new world generation', (step) => {
      const ctx = newCtx(regionSeed(step, 10n));
      handlers.submit_intent(ctx, { characterId: 1n, text: 'go The Edge Beyond' });

      expect(rows(ctx, 'character')[0].locationId).toBe(11n);
      expect(states(ctx)).toHaveLength(1);
      expect(states(ctx)[0].step).toBe(step);
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    });

    it.each(['FILLING', 'FILL_ERROR'])('the player keeps playing while the region is %s: look and travel work', (step) => {
      const ctx = newCtx(regionSeed(step, 20n));
      handlers.submit_intent(ctx, { characterId: 1n, text: 'look' });
      const lookText = rows(ctx, 'event_private').map((e: any) => e.message).join('\n');
      expect(lookText).toContain('Ember Hollow');
      expect(lookText).toContain('Vessa');

      handlers.submit_intent(ctx, { characterId: 1n, text: 'go The Edge Beyond' });
      expect(rows(ctx, 'character')[0].locationId).toBe(11n);
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(states(ctx)[0].step).toBe(step);
    });

    it('end to end: stage 1 applied, stage 2 fails, the region stays; explore re-enqueues stage 2 and a fill reply completes it', () => {
      const err529 = JSON.parse(
        readFileSync(new URL('../helpers/__fixtures__/claude/err_529.json', import.meta.url), 'utf-8'),
      );
      const { proc, reducerCtx } = setup([okJsonReply(WORLD_START_JSON), err529, okJsonReply(REGION_FILL_JSON)]);
      handlers.submit_creation_input(reducerCtx, { text: 'confirm' });
      expect(run(proc)).toBe('completed');
      expect(run(proc)).toBe('failed');
      expect(state(proc).step).toBe('FILL_ERROR');
      const regionRows = rows(proc, 'location').length;
      expect(regionRows).toBe(1);
      const characterId = rows(proc, 'character')[0].id;

      // The player path: explore retries stage 2 only.
      handlers.submit_intent(reducerCtx, { characterId, text: 'explore' });
      expect(state(proc).step).toBe('FILLING');
      expect(rows(proc, 'world_gen_state')).toHaveLength(1);
      expect(rows(proc, 'llm_job').map((j: any) => [j.route, j.status])).toEqual([
        ['world_gen_start', 'completed'],
        ['world_gen', 'failed'],
        ['world_gen', 'pending'],
      ]);
      expect(rows(proc, 'llm_dispatch')).toHaveLength(1);
      expect(rows(proc, 'location')).toHaveLength(regionRows); // stage 1 rows kept, stage 1 never re-run
      expect(systemLines(proc).slice(-1)).toEqual([WORLD_FILL_RETRY_LINE]);

      // A scripted fill reply then completes the region.
      expect(run(proc)).toBe('completed');
      expect(state(proc).step).toBe('COMPLETE');
      expect(rows(proc, 'region')).toHaveLength(1);
      expect(rows(proc, 'location').map((l: any) => l.name)).toEqual([
        'Ember Hollow', 'Slag Road', 'Ashen Pit', 'The Edge Beyond Cinderfall',
      ]);
      expect(proc.http.calls).toHaveLength(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Deleted client call sites (41-12, 41-13, 41-14)
// ---------------------------------------------------------------------------

describe('deleted prepare reducers: no client call site remains', () => {
  const walk = (dir: URL, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'module_bindings' || entry.name === 'node_modules') continue;
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(child, out);
      else if (/\.(ts|vue|js)$/.test(entry.name)) out.push(fileURLToPath(child));
    }
    return out;
  };

  it('no file under src/ outside src/module_bindings/ references a deleted prepare reducer or its client call', () => {
    const files = walk(new URL('../../../src/', import.meta.url));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) =>
      /prepareSkillGen|requestSkillGen|prepare_skill_gen|prepareCreationLlm|prepare_creation_llm|prepareWorldGenLlm|prepare_world_gen_llm|preparedGenStateId/.test(readFileSync(f, 'utf-8')),
    );
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Final "nothing left on the old path" state (41-15)
// ---------------------------------------------------------------------------

describe('the legacy task table is no longer written or reached (41-15)', () => {
  const walkTs = (dir: URL, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walkTs(child, out);
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(fileURLToPath(child));
    }
    return out;
  };

  // Built from fragments so this file does not match its own pattern.
  const TABLE = ['llm', 'task'].join('_');
  const INSERT = new RegExp(String.raw`\b${TABLE}\s*\.\s*insert\s*\(`);

  it('no non-test file under spacetimedb/src inserts into the legacy task table', () => {
    const files = walkTs(new URL('../', import.meta.url));
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => INSERT.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('the pattern catches the forms it is meant to catch', () => {
    expect(INSERT.test(`ctx.db.${TABLE}.insert({})`)).toBe(true);
    expect(INSERT.test(`ctx.db.${TABLE} .insert ({})`)).toBe(true);
    expect(INSERT.test(`ctx.db.${TABLE}.id.update(row)`)).toBe(false);
  });

  it('no file under src/ outside src/module_bindings references any of the three deleted prepare reducers', () => {
    const names = [
      ['prepare', 'Skill', 'Gen'],
      ['prepare', 'Creation', 'Llm'],
      ['prepare', 'WorldGen', 'Llm'],
    ].flatMap((parts) => [parts.join(''), parts.map((p) => p.toLowerCase()).join('_')]);
    const walkSrc = (dir: URL, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'module_bindings' || entry.name === 'node_modules') continue;
        const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        if (entry.isDirectory()) walkSrc(child, out);
        else if (/\.(ts|vue|js)$/.test(entry.name)) out.push(fileURLToPath(child));
      }
      return out;
    };
    const files = walkSrc(new URL('../../../src/', import.meta.url));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => {
      const text = readFileSync(f, 'utf-8');
      return names.some((n) => text.includes(n));
    });
    expect(offenders).toEqual([]);
  });

  it('the model-literal allowlist is empty', () => {
    const text = readFileSync(new URL('../data/model_literals.test.ts', import.meta.url), 'utf-8');
    const block = /const LEGACY_MODEL_LITERALS[^{]*\{([\s\S]*?)\n\};/.exec(text);
    expect(block).not.toBeNull();
    const keys = [...block![1].matchAll(/^\s*'([^']+)'\s*:/gm)].map((m) => m[1]).sort();
    expect(keys).toEqual([]);
  });
});
