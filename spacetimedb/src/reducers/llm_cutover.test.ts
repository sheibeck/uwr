/**
 * Per-domain cutover tests (Phase 41): each triggering reducer, called through the REAL handler
 * captured from `spacetimedb/src/index.ts`, must enqueue exactly one job (plus its dispatch row)
 * in its own transaction and must not touch the legacy `llm_task` table. Plans 41-11 to 41-15
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
  for (const name of ['talk_to_npc', 'apply_level_up', 'request_skill_offer', 'submit_intent', 'grant_test_renown']) {
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
 * Asserts the reducer left exactly one job for `route`, exactly one dispatch row for it, and no
 * legacy `llm_task` rows; returns the job.
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
  expect(rows(ctx, 'llm_task')).toHaveLength(0);
  expect(allRowsMatchSchema(ctx, ['llm_job', 'llm_dispatch'])).toEqual([]);
  return jobs[jobs.length - 1];
}

/** No job, no dispatch row, no sweep tick, no reservation anywhere. */
function expectNothingReserved(ctx: any) {
  expect(rows(ctx, 'llm_job')).toHaveLength(0);
  expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
  expect(rows(ctx, 'llm_task')).toHaveLength(0);
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
    expect(input.npc).toEqual({ name: 'Mirel', npcType: 'villager' });
    expect(input.region.name).toBe('Ashen Reach');
    expect(input.location).toEqual({ name: 'The Crossing' });

    const { volatile } = buildRouteLayers('npc_conversation', input);
    expect(volatile).toMatch(/<player_input>\s*Hello there\s*<\/player_input>/);
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
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
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

  it('apply_level_up with an offer already pending enqueues nothing and says so', () => {
    const seeded = levelSeed(1n, 1n);
    seeded.pending_skill = [pendingSkillRow(1n)];
    const ctx = newCtx(seeded);
    levelUp(ctx);
    expectNothingReserved(ctx);
    expect(systemLines(ctx)).toContain('Your offering awaits your choice.');
  });

  it('request_skill_offer enqueues one job for a level 3 character; a repeat gets the dedupe line and no second job', () => {
    const ctx = newCtx(levelSeed(3n, 0n));
    requestOffer(ctx);
    expectEnqueued(ctx, 'skill_gen');
    requestOffer(ctx);
    expectEnqueued(ctx, 'skill_gen');
    expect(systemLines(ctx)).toEqual(['The Keeper is already preparing your offering. Be patient.']);
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
    takenSeed.ability_template = [abilityRow(3n)];
    const b = newCtx(takenSeed);
    requestOffer(b);
    expectNothingReserved(b);
    expect(systemLines(b)).toHaveLength(1);

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
    expect(systemLines(ctx)).toEqual(['The Keeper is already preparing your offering. Be patient.']);
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
// Deleted client call sites (41-12)
// ---------------------------------------------------------------------------

describe('deleted skill-gen prepare reducer: no client call site remains', () => {
  const walk = (dir: URL, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'module_bindings' || entry.name === 'node_modules') continue;
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) walk(child, out);
      else if (/\.(ts|vue|js)$/.test(entry.name)) out.push(fileURLToPath(child));
    }
    return out;
  };

  it('no file under src/ outside src/module_bindings/ references prepareSkillGen or requestSkillGen', () => {
    const files = walk(new URL('../../../src/', import.meta.url));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((f) => /prepareSkillGen|requestSkillGen|prepare_skill_gen/.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });
});
