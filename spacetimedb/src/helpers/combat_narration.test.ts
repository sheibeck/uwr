/**
 * Combat outro narration (Phase 41, Plan 11, PIPE-07): enqueue, silent refusal, failure isolation.
 * Strict mock db (accessors from the recorded schema); one shared identity per player.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import {
  buildCombatOutroSummary,
  enqueueCombatOutroNarration,
  buildCombatMomentSummary,
  enqueueCombatMomentNarration,
  finalCombatRound,
} from './combat_narration';
import type { CombatMomentFacts } from './combat_narration';
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

  describe('the outro length tier (standard fight, boss or named foe)', () => {
    const lengthLine = (ctx: any, type: 'victory' | 'defeat' = 'victory') => {
      const summary = buildCombatOutroSummary(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), type);
      const { volatile } = buildRouteLayers('combat_narration', summary);
      return { summary, line: volatile.split('\n').filter((l: string) => l.startsWith('Length:')) };
    };
    const withRounds = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: BigInt(i + 1), combatId: 1n, roundNumber: BigInt(i + 1),
      }));
    const tpl = (isBoss: boolean) => ({ id: 1n, name: 'Rat', isBoss });

    it('a 3-round fight with no boss or named foe is standard: exactly one short segment of 2 or 3 sentences', () => {
      const ctx = newCtx(seed({ combat_round: withRounds(3), enemy_template: [tpl(false)] }));
      const { summary, line } = lengthLine(ctx);
      expect(summary.roundNumber).toBe(3n);
      expect(summary.fightBossOrNamed).toBe(false);
      expect(line).toEqual([
        'Length: this was a standard fight (3 rounds). Write exactly one short narration segment of 2 or 3 sentences.',
      ]);
    });

    it('a 5-round fight with no boss or named foe is still standard: exactly one short segment', () => {
      const ctx = newCtx(seed({ combat_round: withRounds(5), enemy_template: [tpl(false)] }));
      expect(lengthLine(ctx).line).toEqual([
        'Length: this was a standard fight (5 rounds). Write exactly one short narration segment of 2 or 3 sentences.',
      ]);
    });

    it('a boss template earns up to 3 segments even in a 2-round fight', () => {
      const ctx = newCtx(seed({ combat_round: withRounds(2), enemy_template: [tpl(true)] }));
      const { summary, line } = lengthLine(ctx, 'defeat');
      expect(summary.fightBossOrNamed).toBe(true);
      expect(line).toEqual([
        'Length: this fight had a boss or a named foe (2 rounds). Write at most 3 narration segments.',
      ]);
    });

    it("a named foe of a participant earns up to 3 segments", () => {
      const ctx = newCtx(
        seed({
          combat_round: withRounds(2),
          enemy_template: [tpl(false)],
          named_enemy: [
            { id: 1n, characterId: 2n, name: 'Brine Sentinel', enemyTemplateId: 1n, locationId: 10n, isAlive: true, respawnMinutes: 60n },
          ],
        }),
      );
      expect(lengthLine(ctx).summary.fightBossOrNamed).toBe(true);
      expect(lengthLine(ctx).line[0]).toContain('at most 3 narration segments');
    });

    it('a named foe of another character does not count', () => {
      const ctx = newCtx(
        seed({
          combat_round: withRounds(2),
          enemy_template: [tpl(false)],
          named_enemy: [
            { id: 1n, characterId: 99n, name: 'Brine Sentinel', enemyTemplateId: 1n, locationId: 10n, isAlive: true, respawnMinutes: 60n },
          ],
        }),
      );
      expect(lengthLine(ctx).summary.fightBossOrNamed).toBe(false);
    });

    it('the flag survives the job snapshot into the volatile text', () => {
      const ctx = newCtx(seed({ combat_round: withRounds(1), enemy_template: [tpl(true)] }));
      outro(ctx, 'victory');
      const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;
      expect(input.fightBossOrNamed).toBe(true);
      expect(buildRouteLayers('combat_narration', input).volatile).toContain(
        'Length: this fight had a boss or a named foe (1 round). Write at most 3 narration segments.',
      );
    });
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

  it('Phase 46.1: exports the moment enqueue, the moment summary, the final-round lookup and the facts type', () => {
    expect(source).toMatch(/export function enqueueCombatMomentNarration/);
    expect(source).toMatch(/export function buildCombatMomentSummary/);
    expect(source).toMatch(/export function finalCombatRound/);
    expect(source).toMatch(/export type CombatMomentFacts/);
    expect(source).toMatch(/'kill' \| 'near_death' \| 'phase'/);
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
    expect(COMBAT_NARRATION_FALLBACK_LINE).toBe('The skirmish carries on, and none of it is worth the ink.');
    const ctx = newCtx();
    sendNarrationSkippedMessage(ctx, 1n, participantsOf(ctx));
    expect(sentCalls().map((c) => [c[3], c[4]])).toEqual([
      ['system', COMBAT_NARRATION_FALLBACK_LINE],
      ['system', COMBAT_NARRATION_FALLBACK_LINE],
    ]);
  });
});

// ── Phase 46.1 (RND-05): big moments and the end of the fight ──

describe('Phase 46.1: big-moment narration', () => {
  const killFacts = (over: Partial<CombatMomentFacts> = {}): CombatMomentFacts => ({
    kind: 'kill',
    roundNumber: 3n,
    subjectName: 'Cave Rat',
    first: true,
    killerName: 'Aldric',
    abilityName: 'Cleave',
    damage: 14n,
    ...over,
  });
  const moment = (ctx: any, facts: CombatMomentFacts) =>
    enqueueCombatMomentNarration(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), facts);

  it('a kill in round 3 enqueues one combat_narration job with the request fields the result handler reads', () => {
    const ctx = newCtx();
    moment(ctx, killFacts());

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(jobs[0].route).toBe('combat_narration');
    expect(jobs[0].playerId).toBe(alice);
    expect(jobs[0].characterId).toBe(1n);
    expect(jobs[0].dedupeKey).toContain('1:3:kill');

    const req = JSON.parse(jobs[0].requestJson);
    expect(req.combatId).toBe('1');
    expect(req.roundNumber).toBe('3');
    expect(req.narrativeType).toBe('kill');
    expect(req.participantCharacterIds).toEqual(['1', '2']);

    const input = resolveRouteInput(ctx, jobs[0]) as any;
    expect(input.narrativeType).toBe('kill');
    expect(input.roundNumber).toBe(3n);
    expect(input.momentSubject).toBe('Cave Rat');
    expect(input.momentFirst).toBe(true);
    expect(input.playerActions).toEqual([
      { characterName: 'Aldric', actionType: 'ability', abilityName: 'Cleave', targetName: 'Cave Rat', damageDealt: 14n },
    ]);
    expect(() => buildRouteLayers('combat_narration', input)).not.toThrow();

    for (const table of ['llm_job', 'llm_dispatch']) {
      for (const row of rows(ctx, table)) expect(rowColumnProblems(table, row)).toEqual([]);
    }
  });

  it('an auto-attack killing blow has actionType auto_attack and no ability name', () => {
    const ctx = newCtx();
    const summary = buildCombatMomentSummary(
      ctx,
      combatOf(ctx),
      participantsOf(ctx),
      enemiesOf(ctx),
      killFacts({ abilityName: undefined, damage: 9n }),
    );
    expect(summary.playerActions).toHaveLength(1);
    expect(summary.playerActions[0].actionType).toBe('auto_attack');
    expect(summary.playerActions[0].abilityName).toBeUndefined();
    expect(summary.playerActions[0].damageDealt).toBe(9n);
  });

  it('the moment summary carries the facts: kill flags, the boss flag and string-or-boolean-only moment fields', () => {
    const ctx = newCtx();
    const kill = buildCombatMomentSummary(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), killFacts({ bossOrNamed: true }));
    expect(kill.narrativeType).toBe('kill');
    expect(kill.roundNumber).toBe(3n);
    expect(kill.hasKill).toBe(true);
    expect(kill.momentSubject).toBe('Cave Rat');
    expect(kill.momentFirst).toBe(true);
    expect(kill.momentBossOrNamed).toBe(true);
    expect(kill.locationName).toBe('Saltmarsh');
    expect(kill.playerNames).toEqual(['Aldric', 'Brienne']);
    expect(kill.enemyNames).toEqual(['Cave Rat', 'Cave Bat']);

    const near = buildCombatMomentSummary(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), {
      kind: 'near_death',
      roundNumber: 2n,
      subjectName: 'Brienne',
    });
    expect(near.narrativeType).toBe('near_death');
    expect(near.hasNearDeath).toBe(true);
    expect(near.momentFirst).toBe(false);
    expect(near.momentBossOrNamed).toBe(false);
  });

  it('the same moment twice creates one job; a different kind or round creates another', () => {
    const ctx = newCtx();
    moment(ctx, killFacts());
    moment(ctx, killFacts());
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    moment(ctx, { kind: 'near_death', roundNumber: 3n, subjectName: 'Brienne' });
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
    moment(ctx, killFacts({ roundNumber: 4n }));
    expect(rows(ctx, 'llm_job')).toHaveLength(3);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(3);
  });

  it('near_death and phase moments carry their narrativeType and no playerActions entry', () => {
    const ctx = newCtx();
    moment(ctx, { kind: 'near_death', roundNumber: 2n, subjectName: 'Brienne', killerName: 'Cave Bat' });
    moment(ctx, { kind: 'phase', roundNumber: 4n, subjectName: 'Cave Bat' });
    const jobs = rows(ctx, 'llm_job');
    expect(jobs.map((j) => JSON.parse(j.requestJson).narrativeType)).toEqual(['near_death', 'phase']);
    expect(jobs.map((j) => JSON.parse(j.requestJson).roundNumber)).toEqual(['2', '4']);
    for (const j of jobs) expect((resolveRouteInput(ctx, j) as any).playerActions).toEqual([]);
  });

  it('is charged to the first participant when the combat has no leader', () => {
    const ctx = newCtx();
    const combat = { ...combatOf(ctx), leaderCharacterId: undefined };
    enqueueCombatMomentNarration(ctx, combat, [participantsOf(ctx)[1], participantsOf(ctx)[0]], enemiesOf(ctx), killFacts());
    expect(rows(ctx, 'llm_job')[0].playerId).toBe(bob);
  });

  it('a refusal at the daily cost limit writes nothing, says nothing and does not throw', () => {
    const ctx = newCtx();
    fillDay(ctx, alice, LLM_PLAYER_DAILY_COST_MICRO_USD);
    expect(() => moment(ctx, killFacts())).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(appendPrivateEvent).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('writes nothing when no player resolves or the participant list is empty', () => {
    const noPlayer = newCtx(seed({ player: [] }));
    expect(() => moment(noPlayer, killFacts())).not.toThrow();
    expect(rows(noPlayer, 'llm_job')).toHaveLength(0);

    const ctx = newCtx();
    expect(() => enqueueCombatMomentNarration(ctx, combatOf(ctx), [], enemiesOf(ctx), killFacts())).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  });

  it('a throwing job insert is caught and logged redacted', () => {
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
    expect(() => moment(ctx, killFacts())).not.toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line).toContain('combat narration skipped');
    expect(line).not.toContain(FAKE_KEY);
  });

  it('handleCombatNarrationResult stores a kill like a victory: one narrative row and one private event per participant', async () => {
    const { handleCombatNarrationResult } = await import('./combat_narration');
    const ctx = newCtx(
      seed({
        character: [
          { id: 1n, ownerUserId: 7n, name: 'Aldric', hp: 50n, maxHp: 100n, locationId: 10n },
          { id: 2n, ownerUserId: 8n, name: 'Brienne', hp: 5n, maxHp: 100n, locationId: 10n },
        ],
      }),
    );
    moment(ctx, killFacts());
    const task = { contextJson: rows(ctx, 'llm_job')[0].requestJson };
    handleCombatNarrationResult(
      ctx,
      task,
      JSON.stringify({ segments: [{ kind: 'narration', speaker: 'The Keeper', text: 'The rat folds.' }] }),
      true,
    );
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
    expect(rows(ctx, 'combat_narrative')[0]).toMatchObject({ narrativeType: 'kill', roundNumber: 3n, narrativeText: 'The rat folds.' });
    expect(sentCalls()).toHaveLength(2);
    for (const c of sentCalls()) expect(c[3]).toBe('combat_narration');
  });
});

describe('Phase 46.1: finalCombatRound and the outro round number', () => {
  const roundRow = (combatId: bigint, roundNumber: bigint) => ({
    id: 0n,
    combatId,
    roundNumber,
    state: 'resolved',
    timerExpiresAtMicros: 0n,
    narrationCount: 0n,
    startedAtMicros: 0n,
  });
  const firstKey = (ctx: any): string => rows(ctx, 'llm_job')[0].dedupeKey;

  it('is 0n with no round rows, the highest round for the fight, and ignores another combat', () => {
    expect(finalCombatRound(newCtx(), 1n)).toBe(0n);
    const ctx = newCtx(seed({ combat_round: [roundRow(1n, 1n), roundRow(1n, 4n), roundRow(1n, 2n), roundRow(2n, 9n)] }));
    expect(finalCombatRound(ctx, 1n)).toBe(4n);
    expect(finalCombatRound(ctx, 2n)).toBe(9n);
    expect(finalCombatRound(ctx, 3n)).toBe(0n);
  });

  it('never throws, even when the lookup does', () => {
    const ctx: any = {
      db: {
        combat_round: {
          by_combat: {
            filter: () => {
              throw new Error('boom');
            },
          },
        },
      },
    };
    expect(finalCombatRound(ctx, 1n)).toBe(0n);
    expect(finalCombatRound(undefined, 1n)).toBe(0n);
  });

  it('the outro carries the final round in its request, source key and summary', () => {
    const ctx = newCtx(seed({ combat_round: [roundRow(1n, 3n), roundRow(1n, 5n)] }));
    outro(ctx, 'victory');
    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0].requestJson).roundNumber).toBe('5');
    expect(firstKey(ctx)).toContain('1:5:victory');
    expect((resolveRouteInput(ctx, jobs[0]) as any).roundNumber).toBe(5n);
    expect(buildCombatOutroSummary(ctx, combatOf(ctx), participantsOf(ctx), enemiesOf(ctx), 'defeat').roundNumber).toBe(5n);
  });

  it('a fight with no round rows keeps round 0 in the outro', () => {
    const ctx = newCtx();
    outro(ctx, 'victory');
    expect(JSON.parse(rows(ctx, 'llm_job')[0].requestJson).roundNumber).toBe('0');
    expect(firstKey(ctx)).toContain('1:0:victory');
  });

  it('the outro writes nothing for an empty participant list even when the combat has a leader', () => {
    const ctx = newCtx();
    expect(() => enqueueCombatOutroNarration(ctx, combatOf(ctx), [], enemiesOf(ctx), 'victory')).not.toThrow();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });
});
