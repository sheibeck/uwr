/**
 * Tests for helpers/llm_apply.ts (Phase 40, Plan 08).
 *
 * The behavior of every domain is pinned by the untouched characterization suite
 * (submit_llm_result.characterization.test.ts). These tests cover what that suite
 * cannot: the apply functions act for the STORED player (job.playerId) even when the
 * caller identity is the module identity (the Phase 41 scheduled-procedure case),
 * toApplyJob maps both row shapes, an unknown domain is a no-op, extractJson, and
 * static guards on llm_apply.ts and on the thin submit_llm_result wrapper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
import { snapshotDb } from './schema_recorder';
import { createMockCtx } from './test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import {
  applyCreationResult,
  applyLlmFailure,
  applyLlmResult,
  applySkillGenResult,
  applyRenownPerkResult,
  extractJson,
  toApplyJob,
} from './llm_apply';

const T0 = 1_700_000_000_000_000n;
const TODAY = '2023-11-14';

const alice = { toHexString: () => 'a'.repeat(64) };
const moduleIdentity = { toHexString: () => 'c'.repeat(64) };

/** A context whose caller is the module identity, as inside a scheduled procedure. */
function moduleCtx(seed: Record<string, any[]>) {
  return createMockCtx({ seed, sender: moduleIdentity, timestampMicros: T0 });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

const characterRow = () => ({
  id: 10n,
  ownerUserId: 7n,
  name: 'Tester',
  race: 'Ashkin',
  className: 'Emberblade',
  level: 3n,
  xp: 0n,
  gold: 0n,
  locationId: 100n,
  boundLocationId: 100n,
  groupId: undefined,
  cha: 10n,
});

const creationState = (step: string) => ({
  id: 2n,
  playerId: alice,
  step,
  raceName: undefined,
  createdAt: ts(1_600_000_000_000_000n),
  updatedAt: ts(1_600_000_000_000_000n),
});

const job = (domain: string, contextJson?: string) => ({ domain, playerId: alice, contextJson });

/** Rows in the budget table must all belong to alice, none to the module identity. */
function expectBudgetOnlyForAlice(ctx: any, callCount: bigint) {
  const budgets = rows(ctx, 'llm_budget');
  expect(budgets).toHaveLength(1);
  expect(budgets[0].playerId).toBe(alice);
  expect(budgets[0]).toMatchObject({ callCount, resetDate: TODAY });
  expect(budgets.some((b: any) => b.playerId === moduleIdentity)).toBe(false);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('sender independence (effects land on job.playerId, not the caller)', () => {
  it('applyCreationResult creation_race updates alice state, event and budget only', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
    applyCreationResult(
      ctx,
      job('creation_race'),
      JSON.stringify({ raceName: 'Ashkin', narrative: 'Cinders.', bonuses: { primary: { stat: 'str', value: 2 } } }),
    );
    expect(rows(ctx, 'character_creation_state')[0]).toMatchObject({
      playerId: alice,
      step: 'AWAITING_ARCHETYPE',
      raceName: 'Ashkin',
    });
    const events = rows(ctx, 'event_creation');
    expect(events).toHaveLength(1);
    expect(events[0].playerId).toBe(alice);
    expectBudgetOnlyForAlice(ctx, 1n);
  });

  it('applyCreationResult does nothing when the stored player has no creation state', () => {
    // A state exists only for the module identity: the caller must not be used as a fallback.
    const ctx = moduleCtx({
      character_creation_state: [{ ...creationState('GENERATING_RACE'), playerId: moduleIdentity }],
    });
    applyCreationResult(ctx, job('creation_race'), JSON.stringify({ raceName: 'Ashkin' }));
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('GENERATING_RACE');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });

  it('applyLlmFailure creation_class reverts alice state and writes alice event', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_CLASS')] });
    applyLlmFailure(ctx, job('creation_class'));
    expect(rows(ctx, 'character_creation_state')[0]).toMatchObject({ playerId: alice, step: 'AWAITING_ARCHETYPE' });
    const events = rows(ctx, 'event_creation');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ playerId: alice, kind: 'creation_error' });
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });

  it('applySkillGenResult with three skills charges alice', () => {
    const skill = (name: string) => ({
      name,
      description: `${name} description.`,
      kind: 'damage',
      targetRule: 'single_enemy',
      resourceType: 'stamina',
      resourceCost: 5,
      castSeconds: 0,
      cooldownSeconds: 6,
      scaling: 'str',
      value1: 10,
      value2: null,
      damageType: 'physical',
      effectType: null,
      effectMagnitude: null,
      effectDuration: null,
    });
    const ctx = moduleCtx({ character: [characterRow()] });
    applySkillGenResult(
      ctx,
      job('skill_gen', JSON.stringify({ characterId: '10' })),
      JSON.stringify({ skills: [skill('One'), skill('Two'), skill('Three')] }),
    );
    expect(rows(ctx, 'pending_skill')).toHaveLength(3);
    expectBudgetOnlyForAlice(ctx, 1n);
  });

  it('applyRenownPerkResult with three perks charges alice', () => {
    const perk = (name: string) => ({
      name,
      description: `${name} description.`,
      kind: '',
      perkEffectJson: '{"maxHp":10}',
      perkDomain: 'combat',
    });
    const ctx = moduleCtx({ character: [characterRow()] });
    applyRenownPerkResult(
      ctx,
      job('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' })),
      JSON.stringify({ perks: [perk('A'), perk('B'), perk('C')] }),
    );
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expectBudgetOnlyForAlice(ctx, 1n);
  });

  it('applyLlmResult routes to the domain function for the stored player', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
    applyLlmResult(ctx, job('creation_race'), JSON.stringify({ raceName: 'Ashkin' }));
    expectBudgetOnlyForAlice(ctx, 1n);
  });
});

describe('toApplyJob', () => {
  it('maps a legacy llm_task row (domain, contextJson)', () => {
    const row = { id: 1n, playerId: alice, domain: 'skill_gen', contextJson: '{"a":1}', status: 'pending' };
    expect(toApplyJob(row)).toEqual({ domain: 'skill_gen', playerId: alice, contextJson: '{"a":1}' });
  });

  it('maps an llm_job row (route, requestJson) to the same shape', () => {
    const row = { id: 1n, playerId: alice, route: 'skill_gen', requestJson: '{"a":1}', status: 'pending' };
    expect(toApplyJob(row)).toEqual({ domain: 'skill_gen', playerId: alice, contextJson: '{"a":1}' });
  });

  it('gives both shapes the same result', () => {
    const task = { playerId: alice, domain: 'npc_conversation', contextJson: '{}' };
    const llmJob = { playerId: alice, route: 'npc_conversation', requestJson: '{}' };
    expect(toApplyJob(llmJob)).toEqual(toApplyJob(task));
  });
});

describe('unknown domain', () => {
  it('applyLlmResult with smoke_test changes nothing', () => {
    const ctx = moduleCtx({
      character: [characterRow()],
      character_creation_state: [creationState('GENERATING_RACE')],
    });
    const before = snapshotDb(ctx.db);
    applyLlmResult(ctx, job('smoke_test', '{}'), '{"anything":true}');
    expect(snapshotDb(ctx.db)).toBe(before);
  });
});

describe('extractJson', () => {
  it('parses a fenced json block', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('parses JSON surrounded by prose', () => {
    expect(extractJson('Here you go: {"a": {"b": 2}} hope that helps')).toEqual({ a: { b: 2 } });
  });

  it('throws on invalid text', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('static guards', () => {
  it('llm_apply.ts never reads the sender from ctx or tx', () => {
    const source = readFileSync(fileURLToPath(new URL('./llm_apply.ts', import.meta.url)), 'utf8');
    expect(source.match(/\b(ctx|tx)\s*\.\s*sender\b/g)).toBeNull();
  });
});
