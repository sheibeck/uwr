/**
 * Combat outro narration (Phase 41, Plan 11, PIPE-07): enqueue, silent refusal, failure isolation.
 * Strict mock db (accessors from the recorded schema); one shared identity per player.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import { buildCombatOutroSummary, enqueueCombatOutroNarration } from './combat_narration';
import { resolveRouteInput, encodeRouteInput } from './llm_inputs';
import { utcDay } from './llm_budget';
import { buildRouteLayers } from '../data/llm_layers';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';
import { appendPrivateEvent } from './events';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

vi.mock('./events', () => ({
  appendSystemMessage: vi.fn(),
  appendPrivateEvent: vi.fn(),
  appendWorldEvent: vi.fn(),
  appendNpcDialog: vi.fn(),
  appendCreationEvent: vi.fn(),
}));

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };
const bob = { toHexString: () => 'b'.repeat(64) };

/** A fake key built from fragments so no key-shaped literal appears in the source. */
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'NARRTESTKEY'.repeat(4)].join('');

type Seed = Record<string, any[]>;

const seed = (over: Seed = {}): Seed => ({
  player: [
    { id: alice, userId: 7n, activeCharacterId: 1n },
    { id: bob, userId: 8n, activeCharacterId: 2n },
  ],
  character: [
    { id: 1n, ownerUserId: 7n, name: 'Aldric', hp: 50n, maxHp: 100n },
    { id: 2n, ownerUserId: 8n, name: 'Brienne', hp: 5n, maxHp: 100n },
  ],
  location: [{ id: 10n, name: 'Saltmarsh', description: 'A salt flat.', zone: 'z', regionId: 1n }],
  combat_encounter: [
    { id: 1n, locationId: 10n, leaderCharacterId: 1n, state: 'active', addCount: 0n, pendingAddCount: 0n, createdAt: { microsSinceUnixEpoch: T0 } },
  ],
  combat_participant: [
    { id: 1n, combatId: 1n, characterId: 1n, status: 'active', nextAutoAttackAt: 0n },
    { id: 2n, combatId: 1n, characterId: 2n, status: 'active', nextAutoAttackAt: 0n },
  ],
  combat_enemy: [
    { id: 1n, combatId: 1n, spawnId: 1n, enemyTemplateId: 1n, displayName: 'Cave Rat', currentHp: 0n, maxHp: 30n, attackDamage: 3n, armorClass: 1n, nextAutoAttackAt: 0n },
    { id: 2n, combatId: 1n, spawnId: 2n, enemyTemplateId: 1n, displayName: 'Cave Bat', currentHp: 12n, maxHp: 20n, attackDamage: 3n, armorClass: 1n, nextAutoAttackAt: 0n },
  ],
  ...over,
});

const newCtx = (s: Seed = seed()) => createMockCtx({ seed: s, sender: alice, timestampMicros: T0, strict: true });
const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

/** The combat as the handlers see it: rows read from the db. */
const combatOf = (ctx: any) => rows(ctx, 'combat_encounter')[0];
const participantsOf = (ctx: any) => [...rows(ctx, 'combat_participant')];
const enemiesOf = (ctx: any) => [...rows(ctx, 'combat_enemy')];

const outro = (ctx: any, type: 'victory' | 'defeat' = 'victory') =>
  enqueueCombatOutroNarration(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), type);

const fillDay = (ctx: any, playerId: any, spent: bigint) =>
  ctx.db.llm_player_budget.insert({
    id: 0n,
    playerId,
    dayUtc: utcDay(ctx.timestamp),
    reservedMicroUsd: 0n,
    spentMicroUsd: spent,
    calls: 1n,
  });

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('enqueueCombatOutroNarration: the enqueue', () => {
  it("creates one combat_narration job for the leader's player, one dispatch row, and the keys the result handler reads", () => {
    const ctx = newCtx();
    outro(ctx, 'victory');

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')[0].jobId).toBe(jobs[0].id);
    expect(jobs[0].route).toBe('combat_narration');
    expect(jobs[0].playerId).toBe(alice);
    expect(jobs[0].characterId).toBe(1n);
    expect(jobs[0].status).toBe('pending');

    const req = JSON.parse(jobs[0].requestJson);
    expect(req.combatId).toBe('1');
    expect(req.roundNumber).toBe('0');
    expect(req.narrativeType).toBe('victory');
    expect(req.participantCharacterIds).toEqual(['1', '2']);

    for (const table of ['llm_job', 'llm_dispatch']) {
      for (const row of rows(ctx, table)) expect(rowColumnProblems(table, row)).toEqual([]);
    }
  });

  it('snapshots an outro input that decodes with bigint HP and builds its layers', () => {
    const ctx = newCtx();
    outro(ctx, 'victory');
    const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;

    expect(input.narrativeType).toBe('victory');
    expect(input.roundNumber).toBe(0n);
    expect(input.combatId).toBe(1n);
    expect(input.locationName).toBe('Saltmarsh');
    expect(input.playerNames).toEqual(['Aldric', 'Brienne']);
    expect(input.enemyNames).toEqual(['Cave Rat', 'Cave Bat']);
    expect(input.deaths).toEqual(['Cave Rat']);
    expect(input.nearDeathNames).toEqual(['Brienne']);
    expect(input.participantHpSummary).toEqual([
      { name: 'Aldric', hp: 50n, maxHp: 100n, isEnemy: false },
      { name: 'Brienne', hp: 5n, maxHp: 100n, isEnemy: false },
      { name: 'Cave Rat', hp: 0n, maxHp: 30n, isEnemy: true },
      { name: 'Cave Bat', hp: 12n, maxHp: 20n, isEnemy: true },
    ]);
    expect(() => buildRouteLayers('combat_narration', input)).not.toThrow();
    const { volatile } = buildRouteLayers('combat_narration', input);
    expect(volatile).toContain('VICTORY');
  });

  it('a defeat records dead participants in deaths and marks the type', () => {
    const ctx = newCtx();
    rows(ctx, 'character')[1].hp = 0n;
    outro(ctx, 'defeat');
    const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;
    expect(input.narrativeType).toBe('defeat');
    expect(input.deaths).toEqual(['Brienne', 'Cave Rat']);
    expect(input.hasKill).toBe(true);
    expect(input.nearDeathNames).toEqual([]);
    expect(JSON.parse(rows(ctx, 'llm_job')[0].requestJson).narrativeType).toBe('defeat');
  });

  it("charges the first participant's owner when the combat has no leader", () => {
    const ctx = newCtx();
    const combat = { ...combatOf(ctx), leaderCharacterId: undefined };
    const participants = [participantsOf(ctx)[1], participantsOf(ctx)[0]];
    enqueueCombatOutroNarration(ctx, combat, participants, enemiesOf(ctx), 'victory');
    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].playerId).toBe(bob);
    expect(jobs[0].characterId).toBe(2n);
  });

  it('called twice for the same combat and type creates one job', () => {
    const ctx = newCtx();
    outro(ctx, 'victory');
    outro(ctx, 'victory');
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
  });

  it('is cap-exempt: three active capped jobs do not stop the narration', () => {
    const ctx = newCtx();
    for (let i = 0; i < 3; i++) {
      ctx.db.llm_job.insert({
        id: 0n, playerId: alice, characterId: 1n, route: 'skill_gen', dedupeKey: `k${i}`, status: 'pending',
        attempt: 0n, requestJson: '{}', inputTokens: 0n, outputTokens: 0n, cacheWriteTokens: 0n,
        cacheReadTokens: 0n, createdAt: ctx.timestamp, reservedMicroUsd: 0n, costMicroUsd: 0n,
        budgetDay: utcDay(ctx.timestamp), applyAttempts: 0n,
      });
    }
    outro(ctx, 'victory');
    expect(rows(ctx, 'llm_job').filter((j) => j.route === 'combat_narration')).toHaveLength(1);
  });
});

describe('enqueueCombatOutroNarration: silent skips', () => {
  it('a refusal at the daily cost limit writes nothing and says nothing', () => {
    const ctx = newCtx();
    fillDay(ctx, alice, LLM_PLAYER_DAILY_COST_MICRO_USD);
    expect(() => outro(ctx, 'victory')).not.toThrow();

    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(appendPrivateEvent).not.toHaveBeenCalled();
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].reservedMicroUsd).toBe(0n);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
    for (const led of rows(ctx, 'llm_spend')) expect(led.reservedMicroUsd).toBe(0n);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('nothing is written and nothing throws when no player resolves for the leader', () => {
    const ctx = newCtx(seed({ player: [] }));
    expect(() => outro(ctx, 'victory')).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')).toHaveLength(0);
  });

  it('nothing is written when the combat has no participants', () => {
    const ctx = newCtx();
    const combat = { ...combatOf(ctx), leaderCharacterId: undefined };
    expect(() => enqueueCombatOutroNarration(ctx, combat, [], enemiesOf(ctx), 'victory')).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });
});

describe('enqueueCombatOutroNarration: failure isolation (T-41-23)', () => {
  const snapshotCombat = (ctx: any): string =>
    JSON.stringify(
      ['combat_encounter', 'combat_participant', 'combat_enemy', 'character'].map((t) => rows(ctx, t)),
      (_k, v) => (typeof v === 'bigint' ? `${v}n` : v),
    );

  it('a throwing job insert is caught: returns normally, logs a redacted line, leaves combat rows unchanged', () => {
    const ctx = newCtx();
    const realDb = ctx.db;
    ctx.db = new Proxy(realDb, {
      get: (_t, name: string) => {
        const table = (realDb as any)[name];
        if (name !== 'llm_job') return table;
        return new Proxy(table, {
          get: (tt, prop: string) =>
            prop === 'insert'
              ? () => {
                  throw new Error(`insert exploded with ${FAKE_KEY}`);
                }
              : (tt as any)[prop],
        });
      },
    });
    const before = snapshotCombat(ctx);

    expect(() => outro(ctx, 'victory')).not.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line).toContain('combat narration skipped');
    expect(line).not.toContain(FAKE_KEY);
    expect(snapshotCombat(ctx)).toBe(before);
  });

  it('an error while building the summary (missing location table row is fine; a throwing lookup is not) is caught', () => {
    const ctx = newCtx();
    const realDb = ctx.db;
    ctx.db = new Proxy(realDb, {
      get: (_t, name: string) => {
        if (name === 'location') throw new Error('location lookup exploded');
        return (realDb as any)[name];
      },
    });
    expect(() => outro(ctx, 'victory')).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  });

  it('buildCombatOutroSummary with an unknown location leaves locationName undefined', () => {
    const ctx = newCtx(seed({ location: [] }));
    const summary = buildCombatOutroSummary(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), 'victory');
    expect(summary.locationName).toBeUndefined();
    expect(summary.roundNumber).toBe(0n);
  });
});

describe('combat_narration.ts static shape', () => {
  const source = readFileSync(new URL('./combat_narration.ts', import.meta.url), 'utf-8');

  it('no longer has the round trigger, the round qualification, the legacy task table, the legacy budget helpers or a model literal', () => {
    expect(source).not.toMatch(/triggerCombatNarration|shouldNarrateRound/);
    expect(source).not.toMatch(/llm_task/);
    expect(source).not.toMatch(/checkBudget|incrementBudget/);
    expect(source).not.toMatch(/gpt-|claude-/i);
  });

  it('keeps the exports the rest of the module needs', () => {
    expect(source).toMatch(/export function enqueueCombatOutroNarration/);
    expect(source).toMatch(/export function buildCombatOutroSummary/);
    expect(source).toMatch(/export function handleCombatNarrationResult/);
    expect(source).toMatch(/export function sendNarrationSkippedMessage/);
    expect(source).toMatch(/export type RoundEventSummary/);
  });
});

describe('stripNarrationSelfCorrection: a leaked self-check never reaches the player', () => {
  // The exact shape seen live on 2026-09-30 (victory outro).
  const LEAKED = [
    'Elfansworth walked out of the Cut with all their limbs still attached, which the Skitterer had not planned for.',
    'Wait: that uses "their" for a single player character, which the rules forbid. Corrected below.',
    'You walked out of the Cut with every limb still attached, which the Skitterer had clearly not planned for.',
  ].join('\n\n');

  it('keeps only the corrected text after the self-check paragraph', async () => {
    const { stripNarrationSelfCorrection } = await import('./combat_narration');
    expect(stripNarrationSelfCorrection(LEAKED)).toBe(
      'You walked out of the Cut with every limb still attached, which the Skitterer had clearly not planned for.',
    );
  });

  it('drops a trailing note and keeps the narration before it', async () => {
    const { stripNarrationSelfCorrection } = await import('./combat_narration');
    expect(stripNarrationSelfCorrection('You won, barely.\n\nNote: kept to two sentences.')).toBe('You won, barely.');
  });

  it('leaves clean narration unchanged, including words like "wait" mid-sentence', async () => {
    const { stripNarrationSelfCorrection } = await import('./combat_narration');
    const clean = 'You did not wait for the second blow. The creature regrets that, briefly.';
    expect(stripNarrationSelfCorrection(clean)).toBe(clean);
    expect(stripNarrationSelfCorrection('  You won.  ')).toBe('You won.');
  });

  it('handleCombatNarrationResult stores only the cleaned narrative', async () => {
    const { handleCombatNarrationResult } = await import('./combat_narration');
    const inserted: any[] = [];
    const ctx: any = {
      db: {
        combat_narrative: { insert: (row: any) => inserted.push(row) },
        character: { id: { find: () => undefined } },
      },
      timestamp: { microsSinceUnixEpoch: 0n },
    };
    handleCombatNarrationResult(ctx, { contextJson: JSON.stringify({ combatId: '1', narrativeType: 'victory' }) }, LEAKED, true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].narrativeText).toBe(
      'You walked out of the Cut with every limb still attached, which the Skitterer had clearly not planned for.',
    );
  });
});

// ── Phase 46 (SEG-01, SEG-02, SEG-04): segment-aware combat apply ──

const sentCalls = () => (appendPrivateEvent as any).mock.calls as any[][];

describe('Phase 46: handleCombatNarrationResult stores canonical segments', () => {
  const KEEPER = 'The Keeper';
  const placed = (): Seed =>
    seed({
      character: [
        { id: 1n, ownerUserId: 7n, name: 'Aldric', hp: 50n, maxHp: 100n, locationId: 10n },
        { id: 2n, ownerUserId: 8n, name: 'Brienne', hp: 5n, maxHp: 100n, locationId: 10n },
      ],
      npc: [{ id: 30n, name: 'Old Tam', locationId: 10n }],
    });
  const input = (over: Record<string, any> = {}) =>
    encodeRouteInput({ enemyNames: ['Gravel Hound'], playerNames: ['Aldric', 'Brienne'], ...over });
  const taskOf = (over: Record<string, any> = {}) => ({
    contextJson: JSON.stringify({
      combatId: '1',
      roundNumber: '0',
      narrativeType: 'victory',
      participantCharacterIds: ['1', '2'],
      input: input(),
      ...over,
    }),
  });
  const run = async (ctx: any, resultText: string, task: any = taskOf(), success = true) => {
    const { handleCombatNarrationResult } = await import('./combat_narration');
    handleCombatNarrationResult(ctx, task, resultText, success);
  };
  const keeper = (text: string) => ({ kind: 'narration', speaker: KEEPER, text });

  it('stores the flattened text per participant with Keeper narration plus a listed enemy dialogue segment', async () => {
    const ctx = newCtx(placed());
    const reply = JSON.stringify({
      segments: [
        { kind: 'narration', speaker: KEEPER, text: 'The hound circles once.' },
        { kind: 'dialogue', speaker: 'Gravel Hound', text: 'Grrrk.' },
      ],
    });
    await run(ctx, reply);
    const flat = 'The hound circles once.\n\nGravel Hound says, "Grrrk."';
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe(flat);
    expect(sentCalls()).toHaveLength(2);
    for (const c of sentCalls()) {
      expect(c[3]).toBe('combat_narration');
      expect(c[4]).toBe(flat);
      expect(c[5]).toEqual([keeper('The hound circles once.'), { kind: 'dialogue', speaker: 'Gravel Hound', text: 'Grrrk.' }]);
      expect(c[5][1].speakerNpcId).toBeUndefined();
    }
  });

  it('keeps dialogue by an NPC at the first participant location with that NPC id', async () => {
    const ctx = newCtx(placed());
    await run(ctx, JSON.stringify({ segments: [{ kind: 'dialogue', speaker: 'old tam', text: 'Well fought.' }] }));
    expect(sentCalls()[0][5]).toEqual([{ kind: 'dialogue', speaker: 'Old Tam', text: 'Well fought.', speakerNpcId: 30n }]);
  });

  it('drops dialogue by a participant name and turns an unlisted speaker into quoted Keeper narration', async () => {
    const ctx = newCtx(placed());
    await run(
      ctx,
      JSON.stringify({
        segments: [
          { kind: 'dialogue', speaker: 'Aldric', text: 'I yield.' },
          { kind: 'dialogue', speaker: 'Mystery Voice', text: 'Boo.' },
          { kind: 'narration', speaker: 'Mystery Voice', text: 'Dust settles.' },
        ],
      }),
    );
    expect(sentCalls()[0][5]).toEqual([keeper('"Boo."'), keeper('Dust settles.')]);
    expect(sentCalls()[0][4]).toBe('"Boo."\n\nDust settles.');
  });

  it('plain prose with a leaked self-check stores only the cleaned prose as Keeper narration', async () => {
    const ctx = newCtx(placed());
    const leaked = [
      'Elfansworth walked out with all their limbs, which the Skitterer had not planned for.',
      'Wait: that uses "their" for a single player character. Corrected below.',
      'You walked out of the Cut with every limb still attached, which the Skitterer had not planned for.',
    ].join('\n\n');
    await run(ctx, leaked);
    const clean = 'You walked out of the Cut with every limb still attached, which the Skitterer had not planned for.';
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe(clean);
    expect(sentCalls()[0][5]).toEqual([keeper(clean)]);
  });

  it('legacy {"narrative"} JSON and fenced JSON both store Keeper narration of the narrative text', async () => {
    const ctx = newCtx(placed());
    await run(ctx, JSON.stringify({ narrative: 'Steel meets bone.' }));
    await run(ctx, '```json\n{"narrative":"Sparks fly."}\n```');
    const stored = sentCalls().map((c) => [c[4], c[5]]);
    expect(stored).toEqual([
      ['Steel meets bone.', [keeper('Steel meets bone.')]],
      ['Steel meets bone.', [keeper('Steel meets bone.')]],
      ['Sparks fly.', [keeper('Sparks fly.')]],
      ['Sparks fly.', [keeper('Sparks fly.')]],
    ]);
  });

  it('JSON with neither segments nor narrative stores exactly one fallback Keeper line per participant', async () => {
    const { COMBAT_NARRATION_FALLBACK_LINE } = await import('./combat_narration');
    const ctx = newCtx(placed());
    await run(ctx, '{"note":"no narrative here"}');
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe(COMBAT_NARRATION_FALLBACK_LINE);
    expect(sentCalls()).toHaveLength(2);
    for (const c of sentCalls()) {
      expect(c[4]).toBe(COMBAT_NARRATION_FALLBACK_LINE);
      expect(c[5]).toEqual([keeper(COMBAT_NARRATION_FALLBACK_LINE)]);
    }
  });

  it('a whitespace-only successful reply stores one fallback line and one combat_narrative row', async () => {
    const { COMBAT_NARRATION_FALLBACK_LINE } = await import('./combat_narration');
    const ctx = newCtx(placed());
    await run(ctx, '   \n ');
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
    expect(sentCalls().map((c) => c[5])).toEqual([[keeper(COMBAT_NARRATION_FALLBACK_LINE)], [keeper(COMBAT_NARRATION_FALLBACK_LINE)]]);
  });

  it('a failed job writes nothing', async () => {
    const ctx = newCtx(placed());
    await run(ctx, '', taskOf(), false);
    expect(rows(ctx, 'combat_narrative')).toHaveLength(0);
    expect(sentCalls()).toHaveLength(0);
  });

  it('a round narration is no longer prefixed: the message always equals the flattened segments', async () => {
    const ctx = newCtx(placed());
    await run(ctx, JSON.stringify({ narrative: 'Steel meets bone.' }), taskOf({ narrativeType: 'round', roundNumber: '2' }));
    expect(sentCalls()[0][4]).toBe('Steel meets bone.');
    expect(rows(ctx, 'combat_narrative')[0]).toMatchObject({ narrativeType: 'round', roundNumber: 2n, narrativeText: 'Steel meets bone.' });
  });

  it('a snapshot with no input still works: dialogue by an enemy becomes quoted Keeper narration', async () => {
    const ctx = newCtx(placed());
    const task = { contextJson: JSON.stringify({ combatId: '1', narrativeType: 'victory', participantCharacterIds: ['1'] }) };
    await run(ctx, JSON.stringify({ segments: [{ kind: 'dialogue', speaker: 'Gravel Hound', text: 'Grrrk.' }] }), task);
    expect(sentCalls()[0][5]).toEqual([keeper('"Grrrk."')]);
  });
});

describe('Phase 46: combatPresentSpeakers is total', () => {
  it('lists enemy names (de-duplicated), then NPCs at the first participant location with ids; players include participants', async () => {
    const { combatPresentSpeakers } = await import('./combat_narration');
    const ctx = newCtx(
      seed({
        character: [
          { id: 1n, ownerUserId: 7n, name: 'Aldric', hp: 50n, maxHp: 100n, locationId: 10n },
          { id: 2n, ownerUserId: 8n, name: 'Brienne', hp: 5n, maxHp: 100n, locationId: 11n },
        ],
        npc: [
          { id: 30n, name: 'Old Tam', locationId: 10n },
          { id: 31n, name: 'Elsewhere', locationId: 11n },
        ],
      }),
    );
    const out = combatPresentSpeakers(ctx, {
      participantCharacterIds: ['1', '2'],
      input: encodeRouteInput({ enemyNames: ['Gravel Hound', 'gravel  hound', 'Cave Rat'], playerNames: ['Aldric'] }),
    });
    expect(out.present).toEqual([{ name: 'Gravel Hound' }, { name: 'Cave Rat' }, { name: 'Old Tam', id: 30n }]);
    expect(out.playerNames).toEqual(['Aldric', 'Aldric', 'Brienne']);
  });

  it('gives empty lists for missing input, missing participants and an unknown character, and never touches npc then', async () => {
    const { combatPresentSpeakers } = await import('./combat_narration');
    const ctx = newCtx();
    const dbProxy = new Proxy(ctx.db, {
      get: (t, name: string) => {
        if (name === 'npc') throw new Error('npc must not be read');
        return (t as any)[name];
      },
    });
    const guarded = { ...ctx, db: dbProxy };
    expect(combatPresentSpeakers(guarded, {})).toEqual({ present: [], playerNames: [] });
    expect(combatPresentSpeakers(guarded, { participantCharacterIds: [], input: null })).toEqual({ present: [], playerNames: [] });
    expect(combatPresentSpeakers(guarded, { participantCharacterIds: ['999'] })).toEqual({ present: [], playerNames: [] });
    expect(combatPresentSpeakers(guarded, { participantCharacterIds: ['not a number'], input: 'junk' })).toEqual({ present: [], playerNames: [] });
    expect(combatPresentSpeakers(undefined, undefined as any)).toEqual({ present: [], playerNames: [] });
  });
});

describe('Phase 46: the shared fallback line', () => {
  it('sendNarrationSkippedMessage writes the same text as before, through the constant', async () => {
    const { sendNarrationSkippedMessage, COMBAT_NARRATION_FALLBACK_LINE } = await import('./combat_narration');
    expect(COMBAT_NARRATION_FALLBACK_LINE).toBe('The Keeper of Knowledge has lost interest in your skirmish.');
    const ctx = newCtx();
    sendNarrationSkippedMessage(ctx, 1n, participantsOf(ctx));
    expect(sentCalls().map((c) => [c[3], c[4]])).toEqual([
      ['system', COMBAT_NARRATION_FALLBACK_LINE],
      ['system', COMBAT_NARRATION_FALLBACK_LINE],
    ]);
  });
});
