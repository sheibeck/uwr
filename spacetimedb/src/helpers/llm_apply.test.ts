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
  applyNpcConversationResult,
  extractJson,
  toApplyJob,
} from './llm_apply';
import { serializePerkEffect } from './renown';
import { RENOWN_PERK_POOLS } from '../data/renown_data';

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

describe('Phase 41: renown static fallback and failure path', () => {
  const renownJob = (rank: string | number = '2', characterId = '10') =>
    job('renown_perk_gen', JSON.stringify({ characterId, rank: String(rank) }));
  const KEEPER = 'The cosmos provided some... standard options';

  it.each([2, 3, 5, 9, 11])(
    'applyRenownPerkResult with fewer than 3 valid perks inserts the rank-%s static options with serialized effects',
    (rank) => {
      const ctx = moduleCtx({ character: [characterRow()] });
      expect(() =>
        applyRenownPerkResult(ctx, renownJob(rank), JSON.stringify({ perks: [{ name: 'Only one' }] })),
      ).not.toThrow();
      const perks = rows(ctx, 'pending_renown_perk');
      expect(perks).toHaveLength(3);
      const pool = RENOWN_PERK_POOLS[rank].slice(0, 3);
      expect(perks.map((p: any) => p.name)).toEqual(pool.map((p) => p.name));
      expect(perks.map((p: any) => p.perkEffectJson)).toEqual(
        pool.map((p) => (p.type === 'active' ? undefined : serializePerkEffect(p.effect))),
      );
      const events = rows(ctx, 'event_private');
      expect(events).toHaveLength(1);
      expect(events[0].message).toContain(KEEPER);
      expectBudgetOnlyForAlice(ctx, 1n);
    },
  );

  it('serializePerkEffect turns safe bigints into numbers and huge ones into strings', () => {
    expect(serializePerkEffect({ maxHp: 25n, str: 1n })).toBe('{"maxHp":25,"str":1}');
    expect(serializePerkEffect({ big: 2n ** 70n })).toBe(`{"big":"${(2n ** 70n).toString()}"}`);
  });

  it('applyLlmFailure inserts the static options once and posts one Keeper line', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applyLlmFailure(ctx, renownJob('2'));
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(ctx, 'pending_renown_perk').every((p: any) => p.characterId === 10n && p.rank === 2n)).toBe(true);
    let events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'narrative' });
    expect(events[0].message).toContain(KEEPER);

    applyLlmFailure(ctx, renownJob('2'));
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(rows(ctx, 'llm_budget')).toHaveLength(0);
  });

  it('applyLlmFailure for a different rank still inserts (idempotence is per rank)', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applyLlmFailure(ctx, renownJob('2'));
    applyLlmFailure(ctx, renownJob('3'));
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(6);
  });

  it('applyLlmFailure does not duplicate options already inserted by the LLM apply path', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applyRenownPerkResult(ctx, renownJob('4'), 'unusable');
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    applyLlmFailure(ctx, renownJob('4'));
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
  });

  it('applyLlmFailure does nothing when the character no longer exists', () => {
    const ctx = moduleCtx({});
    applyLlmFailure(ctx, renownJob('2'));
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('applyLlmFailure does nothing for a rank without a static pool or an unreadable context', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    const before = snapshotDb(ctx.db);
    applyLlmFailure(ctx, renownJob('99'));
    applyLlmFailure(ctx, job('renown_perk_gen', 'not json'));
    applyLlmFailure(ctx, job('renown_perk_gen', undefined));
    expect(snapshotDb(ctx.db)).toBe(before);
  });
});

describe('Phase 41: model numbers never throw', () => {
  it('an LLM perk with a fractional cooldown, an infinite value and a non-numeric magnitude stores clamped bigints', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    const perk = (name: string, over: Record<string, any> = {}) => ({
      name,
      description: `${name} description.`,
      kind: 'heal',
      ...over,
    });
    const reply = JSON.stringify({
      perks: [
        // Infinity is not valid JSON, so it arrives as a huge or string value in practice.
        perk('A', { cooldownSeconds: 12.5, value1: '1e999', effectMagnitude: 'x', value2: 3.9, castSeconds: -4 }),
        perk('B', { resourceCost: 1e30, effectDuration: 'NaN' }),
        perk('C', { perkEffectJson: { not: 'a string' }, damageType: 5 }),
      ],
    });
    const renown = job('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' }));
    expect(() => applyRenownPerkResult(ctx, renown, reply)).not.toThrow();
    const [a, b, c] = rows(ctx, 'pending_renown_perk');
    expect(a).toMatchObject({ cooldownSeconds: 12n, value1: 0n, effectMagnitude: 0n, value2: 3n, castSeconds: 0n });
    expect(b).toMatchObject({ resourceCost: 1_000_000n, effectDuration: 0n });
    expect(c.perkEffectJson).toBeUndefined();
    expect(c.damageType).toBeUndefined();
  });

  const npcSeed = () => ({
    character: [characterRow()],
    npc: [{ id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n, description: 'A baker.', greeting: 'Hello.', personalityJson: '{}' }],
    npc_memory: [{ id: 30n, characterId: 10n, npcId: 20n, memoryJson: '{}', lastUpdated: ts(1_600_000_000_000_000n) }],
    npc_affinity: [
      { id: 40n, characterId: 10n, npcId: 20n, affinity: 0n, lastInteraction: ts(1_600_000_000_000_000n), giftsGiven: 0n, conversationCount: 0n },
    ],
  });
  const npcJob = job('npc_conversation', JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' }));
  const questReply = (effect: Record<string, any>) =>
    JSON.stringify({
      dialogue: 'Hi.',
      effects: [{ type: 'offer_quest', questName: 'Q', questType: 'gather', ...effect }],
      memoryUpdate: {},
      internalThought: '',
    });

  it('a fractional targetCount and a non-numeric rewardXp store requiredCount 2n and the level-based default', () => {
    const ctx = moduleCtx(npcSeed());
    expect(() =>
      applyNpcConversationResult(ctx, npcJob, questReply({ targetCount: 2.9, rewardXp: 'NaN', rewardGold: 'lots' })),
    ).not.toThrow();
    // characterRow level is 3n: default reward 3 * 15 + 10 = 55
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ requiredCount: 2n, rewardXp: 55n, rewardGold: 0n });
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('out-of-range quest numbers are clamped and in-range integers are kept', () => {
    const ctx = moduleCtx(npcSeed());
    applyNpcConversationResult(ctx, npcJob, questReply({ targetCount: 99999, rewardXp: 1e12, rewardGold: 250 }));
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ requiredCount: 1000n, rewardXp: 1_000_000n, rewardGold: 250n });
  });

  it('a zero or negative targetCount becomes 1 and a zero rewardXp keeps the default', () => {
    const ctx = moduleCtx(npcSeed());
    applyNpcConversationResult(ctx, npcJob, questReply({ targetCount: -3, rewardXp: 0 }));
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ requiredCount: 1n, rewardXp: 55n });
    expect(rows(ctx, 'quest_template')[0].rewardGold).toBeUndefined();
  });

  it('a fractional affinity amount is truncated instead of throwing', () => {
    const ctx = moduleCtx(npcSeed());
    const r = JSON.stringify({ dialogue: 'Hi.', effects: [{ type: 'affinity_change', amount: 2.5 }], memoryUpdate: {}, internalThought: '' });
    expect(() => applyNpcConversationResult(ctx, npcJob, r)).not.toThrow();
    expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(2n);
  });
});

/** Pure: does this source read the caller identity from ctx/tx (property, bracket or destructuring)? */
function readsSender(text: string): boolean {
  return (
    /\b(?:ctx|tx)\s*\.\s*sender\b/.test(text) ||
    /\b(?:ctx|tx)\s*\[\s*['"`]sender['"`]\s*\]/.test(text) ||
    /\{[^}]*\bsender\b[^}]*\}\s*=\s*(?:ctx|tx)\b/.test(text)
  );
}

describe('static guards', () => {
  it('llm_apply.ts never reads the sender from ctx or tx', () => {
    const source = readFileSync(fileURLToPath(new URL('./llm_apply.ts', import.meta.url)), 'utf8');
    expect(readsSender(source)).toBe(false);
  });

  describe('readsSender (synthetic)', () => {
    it.each([
      'const who = ctx.sender;',
      'tx . sender',
      "ctx['sender']",
      'tx["sender"]',
      'const { sender } = ctx;',
      'const { db, sender } = tx;',
      'const {\n  sender,\n} = ctx;',
    ])('flags %j', (src) => {
      expect(readsSender(src)).toBe(true);
    });

    it.each([
      'job.playerId',
      'const sender = job.playerId;',
      'senderName = ctx.db.player.id.find(job.playerId)',
      '// the sender is never read from the context',
    ])('does not flag %j', (src) => {
      expect(readsSender(src)).toBe(false);
    });
  });

  it('submit_llm_result in index.ts is a thin wrapper', () => {
    const source = readFileSync(fileURLToPath(new URL('../index.ts', import.meta.url)), 'utf8');
    const lines = source.split('\n');
    const start = lines.findIndex((l: string) => l.includes("spacetimedb.reducer('submit_llm_result'"));
    expect(start).toBeGreaterThanOrEqual(0);
    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i] === '});') {
        end = i;
        break;
      }
    }
    expect(end).toBeGreaterThan(start);
    const slice = lines.slice(start, end + 1);
    expect(slice.length).toBeLessThanOrEqual(30);
    const text = slice.join('\n');
    expect(text).toContain('applyLlmResult(');
    expect(text).toContain('applyLlmFailure(');
    expect(text).not.toContain('domain ===');
    expect(text).not.toContain('extractJson(');
  });
});
