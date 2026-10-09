/**
 * Tests for helpers/llm_apply.ts (Phase 40, Plan 08).
 *
 * The behavior of every domain is pinned by the characterization suite
 * (llm_apply.characterization.test.ts). These tests cover what that suite
 * cannot: the apply functions act for the STORED player (job.playerId) even when the
 * caller identity is the module identity (the scheduled-procedure case), toApplyJob maps
 * a stored llm_job row, an unknown domain is a no-op, extractJson, and static guards:
 * llm_apply.ts never reads the sender, and only the executor and the sweeper call the
 * apply entry points (no reducer applies LLM output a client supplies).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync, readdirSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
import { snapshotDb } from './schema_recorder';
import { createMockCtx } from './test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

import {
  applyCreationResult,
  failWorldGen,
  applyLlmFailure,
  applyLlmResult,
  applySkillGenResult,
  applyRenownPerkResult,
  validateRenownActivePerk,
  applyNpcConversationResult,
  extractJson,
  toApplyJob,
  creationStateForJob,
} from './llm_apply';
import { CLASS_REVEAL_MILESTONE_LINE, CLASS_FILL_FAILED_LINE, CLASS_FILL_RETRY_HINT } from './creation_generation';
import { serializePerkEffect } from './renown';
import { LLM_RESTING_LINE } from './llm_queue';
import { WORLD_FILL_FAILED_MESSAGE, WORLD_FILL_REFUSED_MESSAGE } from './world_gen';
import { setLlmEnabled } from './llm_admin_state';
import { utcDay } from './llm_budget';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { DEFAULT_DIALS } from '../data/economy_rules';

const T0 = 1_700_000_000_000_000n;

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

/**
 * Review WR-B01: the player's other active capped jobs while a stage-1 result is applied. The stage-1 job
 * itself is still 'received' (the executor completes it after apply returns), so with two more the cap is full.
 */
const heldJobs = (stage1Route: string) =>
  [
    [1n, stage1Route, 'received'],
    [2n, 'npc_conversation', 'pending'],
    [3n, 'skill_gen', 'in_flight'],
  ].map(([id, route, status]) => ({
    id,
    playerId: alice,
    route,
    dedupeKey: `held-${String(id)}`,
    status,
    budgetDay: utcDay(ts(T0)),
  }));

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

// WR-B03: creation apply and failure act only on the job's own state, and only at its GENERATING step.
describe('creation jobs are tied to their state row and GENERATING step', () => {
  const stateJob = (domain: string, stateId: bigint | string = 2n) =>
    job(domain, JSON.stringify({ creationStateId: String(stateId), generationType: domain === 'creation_race' ? 'race' : 'class', input: {} }));
  const RACE_REPLY = JSON.stringify({ raceName: 'Ashkin', narrative: 'Cinders.', bonuses: { primary: { stat: 'str', value: 2 } } });

  it.each(['COMPLETE', 'AWAITING_NAME', 'CLASS_REVEALED', 'AWAITING_RACE'])(
    'a late creation_race failure never touches a state at %s',
    (step) => {
      const ctx = moduleCtx({ character_creation_state: [creationState(step)] });
      applyLlmFailure(ctx, stateJob('creation_race'));
      expect(rows(ctx, 'character_creation_state')[0].step).toBe(step);
      expect(rows(ctx, 'event_creation')).toHaveLength(0);
    },
  );

  it('a late creation_class failure cannot reopen a COMPLETE creation', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('COMPLETE')] });
    applyLlmFailure(ctx, stateJob('creation_class'));
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('COMPLETE');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('a late race result never overwrites race data after the player moved on to the class step', () => {
    const ctx = moduleCtx({
      character_creation_state: [{ ...creationState('GENERATING_CLASS'), raceName: 'Saltkin', archetype: 'mystic' }],
    });
    applyCreationResult(ctx, stateJob('creation_race'), RACE_REPLY);
    expect(rows(ctx, 'character_creation_state')[0]).toMatchObject({ step: 'GENERATING_CLASS', raceName: 'Saltkin' });
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('the job acts on the state it names, not on another state of the same player', () => {
    const ctx = moduleCtx({
      character_creation_state: [
        { ...creationState('COMPLETE'), id: 1n },
        { ...creationState('GENERATING_RACE'), id: 2n },
      ],
    });
    applyCreationResult(ctx, stateJob('creation_race', 2n), RACE_REPLY);
    const states = rows(ctx, 'character_creation_state');
    expect(states.find((s: any) => s.id === 1n).step).toBe('COMPLETE');
    expect(states.find((s: any) => s.id === 2n)).toMatchObject({ step: 'AWAITING_ARCHETYPE', raceName: 'Ashkin' });
  });

  it('at the matching GENERATING step the failure still reverts with the try again line', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
    applyLlmFailure(ctx, stateJob('creation_race'));
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    expect(rows(ctx, 'event_creation')[0]).toMatchObject({ playerId: alice, kind: 'creation_error' });
  });

  it('an unreadable creationStateId does nothing', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
    applyLlmFailure(ctx, stateJob('creation_race', 'not-a-number'));
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('GENERATING_RACE');
  });
});

describe('sender independence (effects land on job.playerId, not the caller)', () => {
  it('applyCreationResult creation_race updates alice state and event only', () => {
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
  });

  it('applyCreationResult does nothing when the stored player has no creation state', () => {
    // A state exists only for the module identity: the caller must not be used as a fallback.
    const ctx = moduleCtx({
      character_creation_state: [{ ...creationState('GENERATING_RACE'), playerId: moduleIdentity }],
    });
    applyCreationResult(ctx, job('creation_race'), JSON.stringify({ raceName: 'Ashkin' }));
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('GENERATING_RACE');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('applyLlmFailure creation_class_reveal reverts alice state and writes alice event', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_CLASS')] });
    applyLlmFailure(ctx, job('creation_class_reveal'));
    expect(rows(ctx, 'character_creation_state')[0]).toMatchObject({ playerId: alice, step: 'AWAITING_ARCHETYPE' });
    const events = rows(ctx, 'event_creation');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ playerId: alice, kind: 'creation_error' });
  });

  it('applySkillGenResult with three skills inserts the pending skills', () => {
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
  });

  it('applyRenownPerkResult with three perks inserts the pending perks', () => {
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
  });

  it('applyLlmResult routes to the domain function for the stored player', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
    applyLlmResult(ctx, job('creation_race'), JSON.stringify({ raceName: 'Ashkin' }));
    expect(rows(ctx, 'character_creation_state')[0]).toMatchObject({ playerId: alice, step: 'AWAITING_ARCHETYPE' });
    expect(rows(ctx, 'event_creation')[0].playerId).toBe(alice);
  });
});

describe('toApplyJob', () => {
  it('maps an llm_job row (route, requestJson) to { domain, playerId, contextJson }', () => {
    const row = { id: 1n, playerId: alice, route: 'skill_gen', requestJson: '{"a":1}', status: 'pending' };
    expect(toApplyJob(row)).toEqual({ domain: 'skill_gen', playerId: alice, contextJson: '{"a":1}', jobId: 1n });
  });

  it('carries the stored errorCode, and undefined when the row has none (Phase 43)', () => {
    const base = { id: 1n, playerId: alice, route: 'skill_gen', requestJson: '{}', status: 'failed' };
    expect(toApplyJob({ ...base, errorCode: 'halted' }).errorCode).toBe('halted');
    expect(toApplyJob(base).errorCode).toBeUndefined();
    expect(toApplyJob({ ...base, errorCode: undefined }).errorCode).toBeUndefined();
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

// WR-B02: an active renown perk becomes a combat ability, so it gets the skill_budget treatment.
describe('renown active perks are validated and clamped like generated skills', () => {
  const renownJob = () => job('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' }));
  const passive = (name: string) => ({ name, description: `${name}.`, kind: '', perkEffectJson: '{"maxHp":10}' });
  const active = (name: string, over: Record<string, unknown> = {}) => ({
    name,
    description: `${name}.`,
    kind: 'damage',
    targetRule: 'single_enemy',
    resourceType: 'mana',
    resourceCost: 0,
    castSeconds: 0,
    cooldownSeconds: 0,
    scaling: 'int',
    value1: 5000,
    damageType: 'fire',
    ...over,
  });
  const apply = (ctx: any, perks: any[]) => applyRenownPerkResult(ctx, renownJob(), JSON.stringify({ perks }));

  it('a one-shot reply (value1 5000, no cost, no cooldown, instant mana) is clamped to the damage budget at the character level with a 1 s cast', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    apply(ctx, [active('Sunfall'), passive('B'), passive('C')]);

    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Sunfall', 'B', 'C']);
    // damage at level 3: midpoint 12 + 5 * 3 = 27, max ceil(27 * 1.3) = 36
    expect(perks[0]).toMatchObject({ kind: 'damage', value1: 36n, castSeconds: 1n, resourceType: 'mana', damageType: 'fire' });
    const msg = rows(ctx, 'event_private')[0].message as string;
    expect(msg).not.toContain('The cosmos shrugs and offers some... standard options');
  });

  it('a buff perk with an unknown effectType is kept, defaulted to damage_up and clamped, so the billed reply is used (WR-B03)', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    apply(ctx, [
      active('Iron Reputation', { kind: 'buff', targetRule: 'self', effectType: 'defense_up', effectMagnitude: 999, effectDuration: 12 }),
      passive('B'),
      passive('C'),
    ]);

    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Iron Reputation', 'B', 'C']);
    expect(perks[0]).toMatchObject({ kind: 'buff', effectType: 'damage_up', effectMagnitude: 9n, effectDuration: 12n });
    expect(rows(ctx, 'event_private')[0].message).not.toContain('The cosmos shrugs and offers some... standard options');
  });

  it.each([
    ['an unknown kind', { kind: 'annihilate' }],
    ['an unknown targetRule', { targetRule: 'everyone_everywhere' }],
    ['an unknown resourceType', { resourceType: 'souls' }],
    ['an unknown damageType', { damageType: 'plasma' }],
  ])('a perk with %s is dropped, so the static options cover the rank', (_label, over) => {
    const ctx = moduleCtx({ character: [characterRow()] });
    apply(ctx, [active('Bad', over), passive('B'), passive('C')]);

    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(RENOWN_PERK_POOLS[2].slice(0, 3).map((p) => p.name));
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmos shrugs and offers some... standard options');
  });

  it('a valid effectType keeps the perk and clamps its magnitude', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    apply(ctx, [active('Ember Ward', { kind: 'buff', targetRule: 'self', effectType: 'damage_up', effectMagnitude: 999, effectDuration: 3 }), passive('B'), passive('C')]);
    const perk = rows(ctx, 'pending_renown_perk')[0];
    expect(perk.effectType).toBe('damage_up');
    // buff at level 3: midpoint 5 + 2 * 3 = 11, max ceil(16.5) = 17, effect max ceil(17 * 0.5) = 9
    expect(perk.effectMagnitude).toBe(9n);
    expect(perk.effectDuration).toBe(9n); // buff durations are floored at 9 s
  });

  it('validateRenownActivePerk returns null for an invalid enum and the clamped perk otherwise', () => {
    expect(validateRenownActivePerk(active('X', { scaling: 'luck' }), 3n)).toBeNull();
    expect(validateRenownActivePerk(active('X'), 3n)).toMatchObject({ value1: 36n, castSeconds: 1 });
  });

  it('validateRenownActivePerk defaults an unknown effectType to damage_up and keeps a valid one (WR-B03)', () => {
    expect(validateRenownActivePerk(active('X', { effectType: 'nope' }), 3n)).toMatchObject({ effectType: 'damage_up' });
    expect(validateRenownActivePerk(active('X', { effectType: 'armor_up' }), 3n)).toMatchObject({ effectType: 'armor_up' });
    expect(validateRenownActivePerk(active('X'), 3n)!.effectType).toBeUndefined();
  });
});

describe('Phase 41: renown static fallback and failure path', () => {
  const renownJob = (rank: string | number = '2', characterId = '10') =>
    job('renown_perk_gen', JSON.stringify({ characterId, rank: String(rank) }));
  const KEEPER = 'The cosmos shrugs and offers some... standard options';

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
    // Unusable numbers fall back to 0 and are then clamped into the heal budget at level 3
    // (WR-B02: value1 min 15, effect magnitude min 7), never thrown.
    expect(a).toMatchObject({ cooldownSeconds: 12n, value1: 15n, effectMagnitude: 7n, value2: 3n, castSeconds: 0n });
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

  it('llm_apply.ts has no call-count writes (no legacy helper import, no old counter table)', () => {
    const source = readFileSync(fileURLToPath(new URL('./llm_apply.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/from\s+['"]\.\/llm['"]/);
    expect(source).not.toContain('incrementBudget');
    expect(source).not.toContain('llm_budget');
  });

  it('only the executor and the sweeper call the apply entry points', () => {
    const srcDir = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
        const full = dir + entry.name + (entry.isDirectory() ? '/' : '');
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
      }
    };
    walk(srcDir);
    expect(files.length).toBeGreaterThan(50);
    const code = (text: string) =>
      text
        .split('\n')
        .filter((l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l))
        .join('\n');
    const callers = files
      .filter((f) => !f.endsWith('/helpers/llm_apply.ts'))
      .filter((f) => /\bapplyLlm(Result|Failure)\b/.test(code(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(srcDir.length))
      .sort();
    expect(callers).toEqual(['helpers/llm_executor.ts', 'helpers/llm_sweeper.ts']);
  });
});

describe('Phase 41 (plan 14): world-gen failures end in ERROR, never PENDING', () => {
  const genRow = (over: Record<string, unknown> = {}) => ({
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'GENERATING',
    createdAt: ts(T0 - 1000n),
    updatedAt: ts(T0 - 1000n),
    ...over,
  });
  // Stage 1 (world_gen_start) fails a GENERATING state; stage 2 (world_gen) is covered in the staged block below.
  const worldJob = { domain: 'world_gen_start', playerId: alice, contextJson: JSON.stringify({ genStateId: '5' }) } as any;

  it('failWorldGen sets ERROR, stores the in-voice message and appends the [explore] line for a placed character', () => {
    const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
    failWorldGen(ctx, rows(ctx, 'world_gen_state')[0], 'The Keeper falters.');
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'ERROR', errorMessage: 'The Keeper falters.' });
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'system',
      characterId: 10n,
      message: 'The Keeper falters. Type [explore] to try again.',
    });
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('failWorldGen routes the line to a creation_error event for a character not yet placed', () => {
    const ctx = moduleCtx({
      character: [{ ...characterRow(), locationId: 0n }],
      world_gen_state: [genRow()],
    });
    failWorldGen(ctx, rows(ctx, 'world_gen_state')[0], 'The Keeper falters.');
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0]).toMatchObject({
      kind: 'creation_error',
      playerId: alice,
      message: 'The Keeper falters. Type [explore] to try again.',
    });
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('a failed world_gen_start job (call failure, sweeper expiry) ends in ERROR through applyLlmFailure', () => {
    const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
    applyLlmFailure(ctx, worldJob);
    const state = rows(ctx, 'world_gen_state')[0];
    expect(state.step).toBe('ERROR');
    expect(state.errorMessage).toContain('The map blurs and will not settle.');
    expect(rows(ctx, 'event_private')[0].message).toMatch(/Type \[explore\] to try again\.$/);
  });

  it('a parse failure and an incomplete region both end in ERROR with the [explore] line', () => {
    for (const reply of ['not json at all', JSON.stringify({ regionName: 'Only A Name' })]) {
      const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
      applyLlmResult(ctx, worldJob, reply);
      expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
      expect(rows(ctx, 'region')).toHaveLength(0);
      expect(rows(ctx, 'event_private')[0].message).toMatch(/Type \[explore\] to try again\.$/);
    }
  });

  it('the failure text is in-voice: no digits, no budget words, the Keeper is "his", never "its"', () => {
    const replies = ['not json at all', JSON.stringify({ regionName: 'Only A Name' })];
    const messages: string[] = [];
    for (const reply of replies) {
      const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
      applyLlmResult(ctx, worldJob, reply);
      messages.push(rows(ctx, 'world_gen_state')[0].errorMessage);
    }
    const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
    applyLlmFailure(ctx, worldJob);
    messages.push(rows(ctx, 'world_gen_state')[0].errorMessage);
    for (const m of messages) {
      expect(m).not.toMatch(/\d/);
      expect(m).not.toMatch(/budget|limit|daily/i);
      expect(m).not.toMatch(/\b(its|they|them)\b/i);
    }
  });

  it('llm_apply.ts has no retryWorldGen and never writes a PENDING world-gen step', () => {
    const source = readFileSync(fileURLToPath(new URL('./llm_apply.ts', import.meta.url)), 'utf-8');
    expect(source).not.toContain('retryWorldGen');
    expect(source).not.toContain("step: 'PENDING'");
    expect(source).toContain('export function failWorldGen');
  });
});

describe('Phase 43: a failure caused by the kill switch or the ceiling shows the resting line', () => {
  const restingJob = (domain: string, contextJson: string | undefined, errorCode: string | undefined) =>
    ({ ...job(domain, contextJson), errorCode }) as any;
  const CODES = ['halted', 'ceiling'];
  const genRow = () => ({
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'GENERATING',
    createdAt: ts(T0 - 1000n),
    updatedAt: ts(T0 - 1000n),
  });
  const npcSeed = () => ({
    character: [characterRow()],
    npc: [{ id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n, description: 'A baker.', greeting: 'Hello.', personalityJson: '{}' }],
  });
  const NPC_CTX = JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' });

  it.each(CODES)('creation_race, creation_class_reveal and creation_class (%s): one creation_error equal to the resting line, the step reverts or becomes CLASS_FILL_ERROR', (code) => {
    for (const [domain, from, back] of [
      ['creation_race', 'GENERATING_RACE', 'AWAITING_RACE'],
      ['creation_class_reveal', 'GENERATING_CLASS', 'AWAITING_ARCHETYPE'],
      ['creation_class', 'CLASS_FILLING', 'CLASS_FILL_ERROR'],
    ]) {
      const ctx = moduleCtx({ character_creation_state: [creationState(from)] });
      applyLlmFailure(ctx, restingJob(domain, undefined, code));
      expect(rows(ctx, 'character_creation_state')[0].step).toBe(back);
      const events = rows(ctx, 'event_creation');
      expect(events).toHaveLength(1);
      // Review WR-B03: CLASS_FILL_ERROR waits for input, so its resting line also says how to retry.
      const expected = domain === 'creation_class' ? `${LLM_RESTING_LINE} ${CLASS_FILL_RETRY_HINT}` : LLM_RESTING_LINE;
      expect(events[0]).toMatchObject({ playerId: alice, kind: 'creation_error', message: expected });
    }
  });

  it.each(CODES)('world_gen_start (%s): ERROR with the resting errorMessage and one line that starts with it and names [explore]', (code) => {
    const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
    applyLlmFailure(ctx, restingJob('world_gen_start', JSON.stringify({ genStateId: '5' }), code));
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'ERROR', errorMessage: LLM_RESTING_LINE });
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0].message.startsWith(LLM_RESTING_LINE)).toBe(true);
    expect(events[0].message).toContain('[explore]');
    expect(events[0].message).not.toContain('falters');
  });

  it.each(CODES)('world_gen (%s): FILL_ERROR with the resting errorMessage and one line that starts with it and names [explore]', (code) => {
    const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [{ ...genRow(), step: 'FILLING' }] });
    applyLlmFailure(ctx, restingJob('world_gen', JSON.stringify({ genStateId: '5' }), code));
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FILL_ERROR', errorMessage: LLM_RESTING_LINE });
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe(`${LLM_RESTING_LINE} Type [explore] to try again.`);
    expect(events[0].message).not.toContain('thread');
  });

  it.each(CODES)('skill_gen (%s): one line that starts with the resting line and names [skills]', (code) => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applyLlmFailure(ctx, restingJob('skill_gen', JSON.stringify({ characterId: '10' }), code));
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n });
    expect(events[0].message.startsWith(LLM_RESTING_LINE)).toBe(true);
    expect(events[0].message).toContain('[skills]');
    expect(events[0].message).not.toContain('eludes');
  });

  it.each(CODES)('npc_conversation (%s): one system line equal to the resting line and no distracted dialog line', (code) => {
    const ctx = moduleCtx(npcSeed());
    applyLlmFailure(ctx, restingJob('npc_conversation', NPC_CTX, code));
    expect(rows(ctx, 'npc_dialog')).toHaveLength(0);
    const events = rows(ctx, 'event_private');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'system', characterId: 10n, ownerUserId: 7n, message: LLM_RESTING_LINE });
  });

  it.each(CODES)('renown_perk_gen (%s) still inserts the static options; combat_narration stays silent', (code) => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applyLlmFailure(ctx, restingJob('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' }), code));
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].message).toContain('standard options');

    const quiet = moduleCtx({ character: [characterRow()] });
    const before = snapshotDb(quiet.db);
    applyLlmFailure(quiet, restingJob('combat_narration', JSON.stringify({ characterId: '10', round: '1' }), code));
    expect(rows(quiet, 'event_private')).toHaveLength(0);
    expect(snapshotDb(quiet.db)).toBe(before);
  });

  it('any other error code, or none, keeps the Phase 41 lines byte for byte', () => {
    for (const code of ['rate_limit', 'billing', 'auth', 'expired', '', undefined]) {
      const race = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
      applyLlmFailure(race, restingJob('creation_race', undefined, code));
      expect(rows(race, 'event_creation')[0].message).toBe(
        'The page flickers. Something went wrong in the cosmic machinery. Try again.',
      );

      const world = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
      applyLlmFailure(world, restingJob('world_gen_start', JSON.stringify({ genStateId: '5' }), code));
      expect(rows(world, 'world_gen_state')[0].errorMessage).toBe(
        'The map blurs and will not settle. The world refuses to be remembered right now.',
      );

      const fill = moduleCtx({ character: [characterRow()], world_gen_state: [{ ...genRow(), step: 'FILLING' }] });
      applyLlmFailure(fill, restingJob('world_gen', JSON.stringify({ genStateId: '5' }), code));
      expect(rows(fill, 'world_gen_state')[0].errorMessage).toBe(WORLD_FILL_FAILED_MESSAGE);

      const skills = moduleCtx({ character: [characterRow()] });
      applyLlmFailure(skills, restingJob('skill_gen', JSON.stringify({ characterId: '10' }), code));
      expect(rows(skills, 'event_private')[0].message).toBe(
        'The page flickers. Your potential eludes crystallization. Type [skills] when you want another attempt.',
      );

      const npc = moduleCtx(npcSeed());
      applyLlmFailure(npc, restingJob('npc_conversation', NPC_CTX, code));
      expect(rows(npc, 'npc_dialog')[0].text).toBe('Marta seems distracted.');
      expect(rows(npc, 'event_private')[0].message).toBe('Marta seems distracted. Try again.');
    }
  });

  it('the resting line carries no digit, no provider word and no wrong-gender pronoun', () => {
    expect(LLM_RESTING_LINE).not.toMatch(/\d/);
    expect(LLM_RESTING_LINE).not.toMatch(/anthropic|claude|budget|limit|ceiling|daily/i);
    expect(LLM_RESTING_LINE).not.toMatch(/\b(it|its|they|them)\b/i);
  });
});

// ---------------------------------------------------------------------------
// Phase 43 (plan 08): staged world generation (LAT-03, LAT-05)
// ---------------------------------------------------------------------------

describe('Phase 43 (plan 08): staged world apply', () => {
  const PERSONALITY = { traits: ['quiet'], speechPattern: 'slow', knowledgeDomains: ['ferries'], secrets: [], affinityMultiplier: 1.0 };
  const START_REPLY = {
    regionName: 'Cinderfall',
    regionDescription: 'Ash drifts down like a slow, grey snowfall.',
    biome: 'volcanic',
    startLocation: { name: 'Ember Hollow', description: 'A sheltered town.', terrainType: 'town', levelOffset: 0 },
    firstNpc: { name: 'Vessa', gender: 'female', npcType: 'vendor', description: 'A soot-streaked trader.', greeting: 'Buy something.', personality: PERSONALITY },
  };
  const FILL_REPLY = {
    dominantFaction: 'Ash Court',
    landmarks: ['The Slag Spire'],
    threats: ['ember wolves'],
    locations: [
      { name: 'Slag Road', description: 'A cracked road.', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Ember Hollow', 'Ashen Pit'] },
      { name: 'Ashen Pit', description: 'A smoking crater.', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Slag Road'] },
    ],
    npcs: [
      { name: 'Vessa', gender: 'female', npcType: 'vendor', locationName: 'Ember Hollow', description: 'Again.', greeting: 'Again.', personality: PERSONALITY },
      { name: 'Old Brann', gender: 'male', npcType: 'lore', locationName: 'Slag Road', description: 'A hermit.', greeting: 'Hm.', personality: PERSONALITY },
    ],
    enemies: [
      { name: 'Ember Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 2, level: 1 },
    ],
  };

  const genRow = (over: Record<string, unknown> = {}) => ({
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'GENERATING',
    createdAt: ts(T0 - 1000n),
    updatedAt: ts(T0 - 1000n),
    ...over,
  });
  const unplaced = () => ({ ...characterRow(), locationId: 0n, boundLocationId: 0n });
  const CTX = JSON.stringify({ genStateId: '5' });
  const startJob = { domain: 'world_gen_start', playerId: alice, contextJson: CTX } as any;
  const fillJob = { domain: 'world_gen', playerId: alice, contextJson: CTX } as any;
  const newCtx = (over: Record<string, any[]> = {}) =>
    moduleCtx({ player: [{ id: alice, userId: 7n }], character: [unplaced()], world_gen_state: [genRow()], ...over });
  const state = (ctx: any) => rows(ctx, 'world_gen_state')[0];

  it('stage 1 then stage 2 on one context: stage 1 is playable before stage 2, stage 2 completes the region', () => {
    const ctx = newCtx();
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));

    // Stage 1: the region, the start location and the first NPC, one transaction
    const region = rows(ctx, 'region')[0];
    expect(region).toMatchObject({ name: 'Cinderfall', dangerMultiplier: 100n, isGenerated: true, starterForRace: 'ashkin', generatedByCharacterId: 10n });
    const locations = rows(ctx, 'location');
    expect(locations.map((l: any) => l.name)).toEqual(['Ember Hollow']);
    expect(locations[0]).toMatchObject({ isSafe: true, bindStone: true, craftingAvailable: true, regionId: region.id });
    expect(rows(ctx, 'npc').map((n: any) => [n.name, n.gender, n.locationId])).toEqual([['Vessa', 'female', locations[0].id]]);
    expect(rows(ctx, 'enemy_template')).toHaveLength(0);
    // The player stands on the start location and meets the first NPC while the fill is still pending
    expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: locations[0].id, boundLocationId: locations[0].id });
    expect(state(ctx)).toMatchObject({ step: 'FILLING', generatedRegionId: region.id });
    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'world_gen', status: 'pending', playerId: alice, characterId: 10n });
    expect(JSON.parse(jobs[0].requestJson).genStateId).toBe('5');
    // The fill input is read back from the stored rows
    const input = JSON.parse(jobs[0].requestJson).input;
    expect(input.regionName).toBe('Cinderfall');
    expect(input.startLocation.name).toBe('Ember Hollow');
    expect(input.npcsPresent).toEqual([{ name: 'Vessa', npcType: 'vendor', gender: 'female' }]);

    const lines = rows(ctx, 'event_private');
    expect(lines.map((e: any) => e.kind)).toEqual(['narrative', 'system', 'system']);
    expect(lines[0].message).toContain('You open your eyes in Ember Hollow, Cinderfall.');
    expect(lines[0].message).toContain('Ash drifts down like a slow, grey snowfall.');
    expect(lines[0].message).toContain('You notice Vessa nearby. Perhaps she has something to say.');
    expect(lines[0].message).toContain('Try [look] to examine your surroundings. The roads out are still being remembered.');
    expect(lines[0].message).not.toContain('Paths lead to');
    expect(lines[2].message).toBe(
      'The Keeper clears his throat. This ground will do; the rest of the region is still being remembered.',
    );
    expect(rows(ctx, 'event_world')).toHaveLength(1);

    // Stage 2
    applyLlmResult(ctx, fillJob, JSON.stringify(FILL_REPLY));
    expect(state(ctx)).toMatchObject({ step: 'COMPLETE', generatedRegionId: region.id });
    expect(rows(ctx, 'location').map((l: any) => l.name)).toEqual([
      'Ember Hollow', 'Slag Road', 'Ashen Pit', 'The Edge Beyond Cinderfall',
    ]);
    // The reply's one enemy type plus its family's three server-made filler members (Plan 09).
    expect(rows(ctx, 'enemy_template')).toHaveLength(4);
    expect(rows(ctx, 'family_member').filter((m: any) => !m.filler)).toHaveLength(1);
    // The stage-1 NPC is not repeated, the safety net adds the banker, the model vendor is kept
    expect(rows(ctx, 'npc').map((n: any) => n.name)).toEqual(['Vessa', 'Old Brann', 'The Ledger Keeper']);
    expect(rows(ctx, 'region')[0]).toMatchObject({ dominantFaction: 'Ash Court', name: 'Cinderfall' });
    expect(rows(ctx, 'llm_job')).toHaveLength(1); // stage 2 enqueued nothing
    const all = rows(ctx, 'event_private');
    expect(all[all.length - 1]).toMatchObject({
      kind: 'system',
      message: 'The rest of Cinderfall settles into place. Try [travel] to see where the roads lead.',
    });
    expect(all).toHaveLength(4);
  });

  it('review WR-B01: stage 1 still reaches FILLING when the player already holds the stage-1 job and two others', () => {
    const ctx = newCtx({ llm_job: heldJobs('world_gen_start') });
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
    expect(state(ctx).step).toBe('FILLING');
    const fill = rows(ctx, 'llm_job').filter((j: any) => j.route === 'world_gen');
    expect(fill).toHaveLength(1);
    expect(fill[0]).toMatchObject({ status: 'pending', playerId: alice });
    expect(rows(ctx, 'event_private').map((e: any) => e.message).join('\n')).not.toContain(WORLD_FILL_REFUSED_MESSAGE);
  });

  it('a non-starter stage 1 turns the uncharted source edge into a passage and connects the start location to it', () => {
    const ctx = newCtx({
      world_gen_state: [genRow({ sourceRegionId: 100n, sourceLocationId: 50n })],
      character: [{ ...characterRow(), locationId: 50n }],
      region: [{ id: 100n, name: 'Old Reach', dangerMultiplier: 300n }],
      location: [{ id: 50n, name: 'The Edge Beyond Old Reach', regionId: 100n, isSafe: true, terrainType: 'uncharted' }],
    });
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
    const edge = rows(ctx, 'location').find((l: any) => l.id === 50n);
    expect(edge).toMatchObject({ terrainType: 'passage', name: 'The Passage to Cinderfall' });
    const start = rows(ctx, 'location').find((l: any) => l.name === 'Ember Hollow');
    const conns = rows(ctx, 'location_connection').map((c: any) => [c.fromLocationId, c.toLocationId]);
    expect(conns).toContainEqual([start.id, 50n]);
    expect(conns).toContainEqual([50n, start.id]);
    // The character already had a location: no placement, no arrival message; the discovery and milestone lines still post.
    expect(rows(ctx, 'character')[0].locationId).toBe(50n);
    expect(rows(ctx, 'event_private').map((e: any) => e.kind)).toEqual(['system', 'system']);
    expect(rows(ctx, 'event_world')[0].message).toContain('Old Reach');
    expect(state(ctx).step).toBe('FILLING');
  });

  it('a late or stale result never touches a state that has moved on', () => {
    const results: [any, any, string[]][] = [
      [startJob, START_REPLY, ['PENDING', 'FILLING', 'FILL_ERROR', 'COMPLETE', 'ERROR']],
      [fillJob, FILL_REPLY, ['PENDING', 'GENERATING', 'FILL_ERROR', 'COMPLETE', 'ERROR']],
    ];
    for (const [j, reply, steps] of results) {
      for (const step of steps) {
        const ctx = newCtx({ world_gen_state: [genRow({ step })] });
        const before = snapshotDb(ctx.db);
        applyLlmResult(ctx, j, JSON.stringify(reply));
        expect(snapshotDb(ctx.db)).toBe(before);
      }
    }
    // A failure is guarded the same way: a stage-1 failure after stage 1 landed, a stage-2 failure before it started.
    const failures: [any, string][] = [
      [startJob, 'FILLING'],
      [startJob, 'COMPLETE'],
      [fillJob, 'GENERATING'],
      [fillJob, 'COMPLETE'],
      [fillJob, 'FILL_ERROR'],
    ];
    for (const [j, step] of failures) {
      const ctx = newCtx({ world_gen_state: [genRow({ step })] });
      const before = snapshotDb(ctx.db);
      applyLlmFailure(ctx, j);
      expect(snapshotDb(ctx.db)).toBe(before);
    }
  });

  it('stage 1: a malformed reply or one without regionName or startLocation.name ends in ERROR with the grimace or incomplete line', () => {
    const replies: [string, string][] = [
      ['not json at all', 'came out wrong'],
      [JSON.stringify({ ...START_REPLY, regionName: '' }), 'incomplete'],
      [JSON.stringify({ ...START_REPLY, startLocation: undefined }), 'incomplete'],
      [JSON.stringify({ ...START_REPLY, startLocation: { description: 'No name.' } }), 'incomplete'],
      ['null', 'incomplete'],
    ];
    for (const [reply, word] of replies) {
      const ctx = newCtx();
      applyLlmResult(ctx, startJob, reply);
      expect(state(ctx).step).toBe('ERROR');
      expect(rows(ctx, 'region')).toHaveLength(0);
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
      expect(rows(ctx, 'event_creation')[0].message).toContain(word);
      expect(rows(ctx, 'event_creation')[0].message).toContain('Type [explore] to try again.');
    }
  });

  it('stage 1 with the enqueue refused (kill switch) leaves the stage-1 rows and a FILL_ERROR state with the resting line', () => {
    const ctx = newCtx();
    setLlmEnabled(ctx, false);
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));

    expect(state(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: LLM_RESTING_LINE });
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'region').map((r: any) => r.name)).toEqual(['Cinderfall']);
    const start = rows(ctx, 'location').find((l: any) => l.name === 'Ember Hollow');
    expect(start).toBeDefined();
    expect(rows(ctx, 'character')[0].locationId).toBe(start.id);
    // The start location is playable with its services
    const here = rows(ctx, 'npc').filter((n: any) => n.locationId === start.id).map((n: any) => n.npcType).sort();
    expect(here).toEqual(['banker', 'vendor']);
    const last = rows(ctx, 'event_private').slice(-1)[0];
    expect(last.message).toBe(`${LLM_RESTING_LINE} Type [explore] to try again.`);
  });

  it('stage 1 with the enqueue refused (player day exhausted) stores the refused message and posts one line naming [explore]', () => {
    const ctx = newCtx();
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
    expect(state(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_REFUSED_MESSAGE });
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'location').map((l: any) => l.name)).toEqual(['Ember Hollow']);
    const last = rows(ctx, 'event_private').slice(-1)[0];
    expect(last.message).toBe(`${WORLD_FILL_REFUSED_MESSAGE} Type [explore] to try again.`);
  });

  function filling() {
    const ctx = newCtx();
    applyLlmResult(ctx, startJob, JSON.stringify(START_REPLY));
    expect(state(ctx).step).toBe('FILLING');
    return ctx;
  }

  it.each([
    ['unparseable text', 'the world did not say anything useful'],
    ['a reply without a locations array', JSON.stringify({ ...FILL_REPLY, locations: undefined })],
    ['a reply whose locations is not an array', JSON.stringify({ ...FILL_REPLY, locations: 'Slag Road' })],
    ['a reply that is JSON null', 'null'],
  ])('stage 2: %s fails the fill, keeps every stage-1 row and enqueues nothing', (_label, reply) => {
    const ctx = filling();
    const locationsBefore = rows(ctx, 'location').map((l: any) => l.name);
    const regionBefore = { ...rows(ctx, 'region')[0] };
    const jobsBefore = rows(ctx, 'llm_job').length;
    applyLlmResult(ctx, fillJob, reply);

    expect(state(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE });
    expect(rows(ctx, 'location').map((l: any) => l.name)).toEqual(locationsBefore);
    expect(rows(ctx, 'region')[0]).toEqual(regionBefore);
    expect(rows(ctx, 'enemy_template')).toHaveLength(0);
    // The stage-1 NPC stays; the vendor is there already, the banker is added so the region is playable
    expect(rows(ctx, 'npc').map((n: any) => n.name).sort()).toEqual(['The Ledger Keeper', 'Vessa']);
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore); // never retried on its own
    const last = rows(ctx, 'event_private').slice(-1)[0];
    expect(last).toMatchObject({ kind: 'system', message: `${WORLD_FILL_FAILED_MESSAGE} Type [explore] to try again.` });
  });

  it('stage 2: a failed fill job (call failure, sweeper expiry) ends in FILL_ERROR and starts no new job', () => {
    const ctx = filling();
    const jobsBefore = rows(ctx, 'llm_job').length;
    applyLlmFailure(ctx, fillJob);
    expect(state(ctx)).toMatchObject({ step: 'FILL_ERROR', errorMessage: WORLD_FILL_FAILED_MESSAGE });
    expect(rows(ctx, 'llm_job')).toHaveLength(jobsBefore);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(jobsBefore);
    // A late stage-2 success for the same state does nothing now
    const before = snapshotDb(ctx.db);
    applyLlmResult(ctx, fillJob, JSON.stringify(FILL_REPLY));
    expect(snapshotDb(ctx.db)).toBe(before);
  });

  it('every line the staged flow posts or stores is in voice: no digit on the public state, no it or they for the Keeper', () => {
    const ctx = filling();
    applyLlmResult(ctx, fillJob, 'not json');
    expect(state(ctx).errorMessage).not.toMatch(/\d/);
    for (const e of rows(ctx, 'event_private')) {
      expect(e.message).not.toMatch(/\bKeeper\b[^.]*\b(its|itself|they|them|their|themselves)\b/);
    }
  });

  it('only the stage-1 apply and the explore retry start a fill (no stage-2 retry of its own)', () => {
    const srcDir = fileURLToPath(new URL('../', import.meta.url)).replace(/\\/g, '/');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
        const full = dir + entry.name + (entry.isDirectory() ? '/' : '');
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
      }
    };
    walk(srcDir);
    const code = (text: string) =>
      text
        .split('\n')
        .filter((l: string) => !/^\s*(\/\/|\/\*|\*)/.test(l))
        .join('\n');
    const callers = files
      .filter((f) => /\bstartWorldFill\(/.test(code(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(srcDir.length))
      .sort();
    expect(callers).toEqual(['helpers/llm_apply.ts', 'helpers/world_gen.ts']);
  });
});

// ---------------------------------------------------------------------------
// Phase 43 (plan 13): staged class reveal (LAT-04, LAT-05)
// ---------------------------------------------------------------------------

describe('Phase 43 (plan 13): staged class apply', () => {
  const FIRST = {
    name: 'Brine Lash',
    description: 'A whip of salt water.',
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
  };
  const REVEAL = { className: 'Tidecaller', classDescription: 'Speaks to the sea and is rarely answered.', firstAbility: FIRST };
  const more = (name: string) => ({ ...FIRST, name, description: `${name} description.`, value1: 9 });
  const FILL = {
    stats: {
      primaryStat: 'int',
      secondaryStat: 'wis',
      bonusHp: 4,
      bonusMana: 20,
      weaponProficiencies: ['staff', 'dagger'],
      armorProficiencies: ['cloth'],
      usesMana: true,
    },
    abilities: [more('Undertow'), more('Salt Ward')],
  };

  const ctxJson = JSON.stringify({ creationStateId: '2', generationType: 'class', input: {} });
  const revealJob = { domain: 'creation_class_reveal', playerId: alice, contextJson: ctxJson } as any;
  const fillJob = { domain: 'creation_class', playerId: alice, contextJson: ctxJson } as any;
  const base = (over: Record<string, unknown> = {}) => ({
    ...creationState('GENERATING_CLASS'),
    raceName: 'Saltkin',
    raceNarrative: 'Marsh dwellers.',
    archetype: 'mystic',
    ...over,
  });
  const newCtx = (over: Record<string, unknown> = {}) =>
    moduleCtx({ player: [{ id: alice, userId: 7n }], character_creation_state: [base(over)] });
  const state = (ctx: any) => rows(ctx, 'character_creation_state')[0];
  const events = (ctx: any) => rows(ctx, 'event_creation');
  const MALFORMED = 'The answer comes back garbled, as though the cosmic machinery had choked on it. Try again.';
  const FLICKER = 'The page flickers. Something went wrong in the cosmic machinery. Try again.';

  it('creationStateForJob maps each route to its own step and ignores every other step', () => {
    const cases: [string, string][] = [
      ['creation_race', 'GENERATING_RACE'],
      ['creation_class_reveal', 'GENERATING_CLASS'],
      ['creation_class', 'CLASS_FILLING'],
    ];
    for (const [domain, step] of cases) {
      const ctx = moduleCtx({ character_creation_state: [creationState(step)] });
      expect(creationStateForJob(ctx, { domain, playerId: alice, contextJson: ctxJson } as any)).not.toBeNull();
      for (const other of ['GENERATING_RACE', 'GENERATING_CLASS', 'CLASS_FILLING', 'CLASS_FILL_ERROR', 'CLASS_REVEALED', 'AWAITING_NAME', 'COMPLETE']) {
        if (other === step) continue;
        const c2 = moduleCtx({ character_creation_state: [creationState(other)] });
        expect(creationStateForJob(c2, { domain, playerId: alice, contextJson: ctxJson } as any)).toBeNull();
      }
    }
  });

  it('review WR-B01: the reveal still reaches CLASS_FILLING when the player already holds the reveal job and two others', () => {
    const ctx = moduleCtx({
      player: [{ id: alice, userId: 7n }],
      character_creation_state: [base()],
      llm_job: heldJobs('creation_class_reveal'),
    });
    applyLlmResult(ctx, revealJob, JSON.stringify(REVEAL));
    expect(state(ctx).step).toBe('CLASS_FILLING');
    expect(rows(ctx, 'llm_job').filter((j: any) => j.route === 'creation_class')).toHaveLength(1);
    expect(events(ctx).filter((e: any) => e.kind === 'creation_error')).toHaveLength(0);
  });

  it('the reveal stores the class name, description and exactly one ability, and queues the fill in the same apply', () => {
    const ctx = newCtx();
    applyLlmResult(ctx, revealJob, JSON.stringify(REVEAL));

    const s = state(ctx);
    expect(s).toMatchObject({ step: 'CLASS_FILLING', className: 'Tidecaller', classDescription: 'Speaks to the sea and is rarely answered.' });
    const abilities = JSON.parse(s.abilities);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({ name: 'Brine Lash', kind: 'damage', resourceType: 'mana' });
    expect(s.classStats).toBeUndefined();

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'creation_class', status: 'pending', playerId: alice });
    const req = JSON.parse(jobs[0].requestJson);
    expect(req.creationStateId).toBe('2');
    expect(req.input).toMatchObject({ className: 'Tidecaller', raceName: 'Saltkin', archetype: 'mystic' });
    expect(req.input.firstAbility).toMatchObject({ name: 'Brine Lash', resourceType: 'mana' });

    const evs = events(ctx);
    expect(evs).toHaveLength(1);
    expect(evs[0].kind).toBe('creation');
    const m = evs[0].message as string;
    expect(m).toContain('Speaks to the sea and is rarely answered.');
    expect(m).toContain('**Tidecaller**');
    expect(m).toContain('Your first ability:');
    expect(m).toContain('Brine Lash');
    expect(m).toContain('A whip of salt water.');
    expect(m).toContain('fire damage, 12 base, 1s cast, 6s cooldown, 15 mana');
    expect(m).not.toContain('[Brine Lash]');
    expect(m.endsWith(CLASS_REVEAL_MILESTONE_LINE)).toBe(true);
    expect(m).not.toContain('Choose one');
  });

  it('reveal then fill on one context: the class is complete only after the fill (CLASS_REVEALED, three abilities)', () => {
    const ctx = newCtx();
    applyLlmResult(ctx, revealJob, JSON.stringify(REVEAL));
    expect(state(ctx).step).toBe('CLASS_FILLING');

    applyLlmResult(ctx, fillJob, JSON.stringify(FILL));
    const s = state(ctx);
    expect(s.step).toBe('CLASS_REVEALED');
    expect(s).toMatchObject({ className: 'Tidecaller', classDescription: 'Speaks to the sea and is rarely answered.' });
    const abilities = JSON.parse(s.abilities);
    expect(abilities.map((a: any) => a.name)).toEqual(['Brine Lash', 'Undertow', 'Salt Ward']);
    expect(JSON.parse(s.classStats)).toMatchObject({ primaryStat: 'int', secondaryStat: 'wis', bonusHp: 4, bonusMana: 20, usesMana: true });
    expect(rows(ctx, 'llm_job')).toHaveLength(1); // the fill enqueued nothing
    const evs = events(ctx);
    expect(evs).toHaveLength(2);
    const full = evs[1].message as string;
    expect(full).toContain('**Tidecaller**');
    expect(full).toContain('Your starting abilities:');
    expect(full).toContain('[Brine Lash]');
    expect(full).toContain('[Undertow]');
    expect(full).toContain('[Salt Ward]');
    expect(full).toContain('Choose one.');
  });

  it('the fill clamps its numbers and keeps at most three abilities with the stage-1 ability first', () => {
    const ctx = newCtx();
    applyLlmResult(ctx, revealJob, JSON.stringify(REVEAL));
    applyLlmResult(
      ctx,
      fillJob,
      JSON.stringify({
        stats: { ...FILL.stats, bonusHp: 9999, bonusMana: -5 },
        abilities: [more('A'), more('B'), more('C'), more('D')],
      }),
    );
    const s = state(ctx);
    expect(s.step).toBe('CLASS_REVEALED');
    expect(JSON.parse(s.abilities).map((a: any) => a.name)).toEqual(['Brine Lash', 'A', 'B']);
    expect(JSON.parse(s.classStats)).toMatchObject({ bonusHp: 20, bonusMana: 0 });
  });

  it.each([
    ['not JSON', 'the cosmos mumbles'],
    ['an empty object', '{}'],
    ['no firstAbility', JSON.stringify({ className: 'Tidecaller', classDescription: 'x' })],
    ['a non-object firstAbility', JSON.stringify({ className: 'Tidecaller', classDescription: 'x', firstAbility: 'Brine Lash' })],
    ['an array firstAbility', JSON.stringify({ className: 'Tidecaller', classDescription: 'x', firstAbility: [FIRST] })],
  ])('a reveal reply that is %s reverts to AWAITING_ARCHETYPE with the malformed line and enqueues nothing', (_n, reply) => {
    const ctx = newCtx();
    applyLlmResult(ctx, revealJob, reply);
    expect(state(ctx).step).toBe('AWAITING_ARCHETYPE');
    expect(state(ctx).className).toBeUndefined();
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(events(ctx)).toEqual([expect.objectContaining({ kind: 'creation_error', message: MALFORMED })]);
  });

  it('a refused fill enqueue (kill switch) leaves CLASS_FILL_ERROR with the reveal kept and the resting line after it', () => {
    const ctx = newCtx();
    setLlmEnabled(ctx, false);
    applyLlmResult(ctx, revealJob, JSON.stringify(REVEAL));
    expect(state(ctx)).toMatchObject({ step: 'CLASS_FILL_ERROR', className: 'Tidecaller' });
    expect(JSON.parse(state(ctx).abilities)).toHaveLength(1);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    const evs = events(ctx);
    expect(evs.map((e: any) => e.kind)).toEqual(['creation', 'creation_error']);
    // Review WR-B03: after "do not touch anything", the refusal tells the player that any input retries.
    expect(evs[1].message).toBe(`${LLM_RESTING_LINE} ${CLASS_FILL_RETRY_HINT}`);
  });

  it.each(['CLASS_FILLING', 'CLASS_FILL_ERROR', 'CLASS_REVEALED', 'AWAITING_ARCHETYPE', 'COMPLETE'])(
    'a stale reveal result never touches a state at %s',
    (step) => {
      const ctx = newCtx({ step });
      const before = { ...state(ctx) };
      applyLlmResult(ctx, revealJob, JSON.stringify(REVEAL));
      expect(state(ctx)).toEqual(before);
      expect(events(ctx)).toHaveLength(0);
      expect(rows(ctx, 'llm_job')).toHaveLength(0);
    },
  );

  const revealed = (step = 'CLASS_FILLING') =>
    newCtx({
      step,
      className: 'Tidecaller',
      classDescription: 'Speaks to the sea and is rarely answered.',
      abilities: JSON.stringify([FIRST]),
    });

  it.each([
    ['not JSON', 'the cosmos mumbles'],
    ['an empty object (no extra abilities)', '{}'],
    ['stats but no abilities', JSON.stringify({ stats: FILL.stats })],
    ['abilities that are all unusable', JSON.stringify({ stats: FILL.stats, abilities: ['x', null, 3] })],
  ])('a fill reply that is %s sets CLASS_FILL_ERROR, keeps the reveal and posts the failed line', (_n, reply) => {
    const ctx = revealed();
    applyLlmResult(ctx, fillJob, reply);
    const s = state(ctx);
    expect(s.step).toBe('CLASS_FILL_ERROR');
    expect(s).toMatchObject({ className: 'Tidecaller', classDescription: 'Speaks to the sea and is rarely answered.' });
    expect(JSON.parse(s.abilities)).toHaveLength(1);
    expect(s.classStats).toBeUndefined();
    expect(events(ctx)).toEqual([expect.objectContaining({ kind: 'creation_error', message: CLASS_FILL_FAILED_LINE })]);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it.each(['CLASS_FILL_ERROR', 'CLASS_REVEALED', 'GENERATING_CLASS', 'AWAITING_NAME', 'COMPLETE'])(
    'a stale fill result never touches a state at %s',
    (step) => {
      const ctx = revealed(step);
      const before = { ...state(ctx) };
      applyLlmResult(ctx, fillJob, JSON.stringify(FILL));
      expect(state(ctx)).toEqual(before);
      expect(events(ctx)).toHaveLength(0);
    },
  );

  it('a fill with no stored first ability fails to CLASS_FILL_ERROR (nothing is invented)', () => {
    const ctx = newCtx({ step: 'CLASS_FILLING', className: 'Tidecaller', classDescription: 'x' });
    applyLlmResult(ctx, fillJob, JSON.stringify(FILL));
    expect(state(ctx).step).toBe('CLASS_FILL_ERROR');
    expect(events(ctx)).toEqual([expect.objectContaining({ kind: 'creation_error', message: CLASS_FILL_FAILED_LINE })]);
  });

  it('failures: reveal reverts to AWAITING_ARCHETYPE; fill keeps stage 1 as CLASS_FILL_ERROR; resting codes use the resting line', () => {
    const rev = newCtx();
    applyLlmFailure(rev, revealJob);
    expect(state(rev).step).toBe('AWAITING_ARCHETYPE');
    expect(events(rev)).toEqual([expect.objectContaining({ kind: 'creation_error', message: FLICKER })]);

    const fill = revealed();
    applyLlmFailure(fill, fillJob);
    expect(state(fill)).toMatchObject({ step: 'CLASS_FILL_ERROR', className: 'Tidecaller' });
    expect(JSON.parse(state(fill).abilities)).toHaveLength(1);
    expect(events(fill)).toEqual([expect.objectContaining({ kind: 'creation_error', message: CLASS_FILL_FAILED_LINE })]);

    for (const code of ['halted', 'ceiling']) {
      const r = revealed();
      applyLlmFailure(r, { ...fillJob, errorCode: code });
      expect(state(r).step).toBe('CLASS_FILL_ERROR');
      expect(events(r)).toEqual([
        expect.objectContaining({ kind: 'creation_error', message: `${LLM_RESTING_LINE} ${CLASS_FILL_RETRY_HINT}` }),
      ]);
    }
  });

  it('a late failure never touches a state that moved on', () => {
    for (const [job2, step] of [
      [fillJob, 'CLASS_REVEALED'],
      [fillJob, 'CLASS_FILL_ERROR'],
      [fillJob, 'GENERATING_CLASS'],
      [revealJob, 'CLASS_FILLING'],
      [revealJob, 'COMPLETE'],
    ] as const) {
      const ctx = newCtx({ step });
      applyLlmFailure(ctx, job2);
      expect(state(ctx).step).toBe(step);
      expect(events(ctx)).toHaveLength(0);
    }
  });

  it('the new class lines never call the Keeper it or they, and never say your name', () => {
    const all = [CLASS_REVEAL_MILESTONE_LINE, CLASS_FILL_FAILED_LINE];
    for (const l of all) {
      expect(l).not.toMatch(/\b(it|its|they|them|their)\b/i);
      expect(l).not.toMatch(/your name/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 46 (plan 02): segments on every narrative write path
// ---------------------------------------------------------------------------

describe('Phase 46: NPC replies as segments', () => {
  const KEEPER = 'The Keeper';
  const npcRow = (id: bigint, name: string, locationId = 100n) => ({
    id, name, npcType: 'lore', locationId, description: 'x', greeting: 'Hi.', personalityJson: '{}',
  });
  const seed = (extraNpcs: any[] = []) => ({
    character: [characterRow()],
    npc: [npcRow(20n, 'Marta'), ...extraNpcs],
    npc_memory: [{ id: 30n, characterId: 10n, npcId: 20n, memoryJson: '{"topics":[],"questsCompleted":[],"secretsShared":[],"giftsGiven":[],"lastConversationSummary":""}', lastUpdated: ts(1_600_000_000_000_000n) }],
    npc_affinity: [
      { id: 40n, characterId: 10n, npcId: 20n, affinity: 0n, lastInteraction: ts(1_600_000_000_000_000n), giftsGiven: 0n, conversationCount: 0n },
    ],
  });
  const npcJob = job('npc_conversation', JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' }));
  const segReply = (segments: any[], extra: Record<string, any> = {}) => JSON.stringify({ segments, ...extra });
  const npcRows = (ctx: any) => rows(ctx, 'event_private').filter((r: any) => r.kind === 'npc');
  const noCanary = (canary: string) => {
    expect(errorSpy).toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      expect(call.map((a: unknown) => String(a)).join(' ')).not.toContain(canary);
    }
  };

  it('stores one npc row with Keeper narration and NPC dialogue, the speaker taken from the database', () => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, segReply([
      { kind: 'narration', speaker: 'The Keeper', text: 'Flour hangs in the air.' },
      { kind: 'dialogue', speaker: '  MARTA ', text: '"The bread is warm."' },
    ], { effects: [{ type: 'affinity_change', amount: 2 }] }));
    const stored = npcRows(ctx);
    // the reply row comes first, the effect cue after it
    expect(stored[0].segments).toEqual([
      { kind: 'narration', speaker: KEEPER, text: 'Flour hangs in the air.' },
      { kind: 'dialogue', speaker: 'Marta', text: 'The bread is warm.', speakerNpcId: 20n },
    ]);
    expect(stored[0].message).toBe('Flour hangs in the air.\n\nMarta says, "The bread is warm."');
    expect(stored).toHaveLength(2);
    expect(stored[1].segments).toBeUndefined();
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "The bread is warm."');
  });

  it('accepts dialogue from a second NPC at the character location, with that NPC name and id', () => {
    const ctx = moduleCtx(seed([npcRow(21n, 'Old Brann')]));
    applyNpcConversationResult(ctx, npcJob, segReply([
      { kind: 'dialogue', speaker: 'Marta', text: 'Mind the tide.' },
      { kind: 'dialogue', speaker: 'old brann', text: 'Aye.' },
    ]));
    expect(npcRows(ctx)[0].segments).toEqual([
      { kind: 'dialogue', speaker: 'Marta', text: 'Mind the tide.', speakerNpcId: 20n },
      { kind: 'dialogue', speaker: 'Old Brann', text: 'Aye.', speakerNpcId: 21n },
    ]);
    // npc_dialog keeps only the conversation NPC's own words
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "Mind the tide."');
  });

  it('does not accept dialogue from an NPC at another location', () => {
    const ctx = moduleCtx(seed([npcRow(22n, 'Far Away', 999n)]));
    applyNpcConversationResult(ctx, npcJob, segReply([{ kind: 'dialogue', speaker: 'Far Away', text: 'Hello from afar.' }]));
    expect(npcRows(ctx)[0].segments).toEqual([
      { kind: 'narration', speaker: KEEPER, text: '"Hello from afar."' },
    ]);
  });

  it('turns dialogue by an absent or Keeper speaker into Keeper narration (the absent one in quotes)', () => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, segReply([
      { kind: 'dialogue', speaker: 'The Mayor', text: 'Make way.' },
      { kind: 'dialogue', speaker: 'The Keeper', text: 'So it goes.' },
    ]));
    const [row] = npcRows(ctx);
    expect(row.segments.every((s: any) => s.kind === 'narration' && s.speaker === KEEPER && s.speakerNpcId === undefined)).toBe(true);
    expect(row.segments.map((s: any) => s.text)).toEqual(['"Make way."', 'So it goes.']);
    expect(row.segments.some((s: any) => s.speaker === 'The Mayor')).toBe(false);
  });

  it.each(['Tester', 'You', 'you', 'the player'])('drops dialogue attributed to the player (%s)', (who) => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, segReply([
      { kind: 'dialogue', speaker: who, text: 'I never said this out loud.' },
      { kind: 'dialogue', speaker: 'Marta', text: 'Welcome.' },
    ]));
    const [row] = npcRows(ctx);
    expect(row.segments).toEqual([{ kind: 'dialogue', speaker: 'Marta', text: 'Welcome.', speakerNpcId: 20n }]);
    expect(row.message).not.toContain('I never said this out loud');
    expect(JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain('never said');
  });

  it('a legacy top-level dialogue string stores one dialogue segment, the message is the same as before Phase 46', () => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, JSON.stringify({ dialogue: 'Mind the current, traveller.', effects: [], memoryUpdate: {} }));
    const [row] = npcRows(ctx);
    expect(row.segments).toEqual([{ kind: 'dialogue', speaker: 'Marta', text: 'Mind the current, traveller.', speakerNpcId: 20n }]);
    expect(row.message).toBe('Marta says, "Mind the current, traveller."');
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "Mind the current, traveller."');
  });

  it('a reply that is not a JSON object stores one Keeper narration segment and writes no memory, affinity or cooldown', () => {
    for (const reply of ['Marta hums a tune', '[1,2,3]', '"just a string"', 'null', '']) {
      const ctx = moduleCtx(seed());
      applyNpcConversationResult(ctx, npcJob, reply);
      const stored = npcRows(ctx);
      expect(stored).toHaveLength(1);
      expect(stored[0].segments).toEqual([
        { kind: 'narration', speaker: KEEPER, text: 'Marta mutters something you cannot make out. (Try again.)' },
      ]);
      expect(stored[0].message).toBe('Marta mutters something you cannot make out. (Try again.)');
      expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta mutters something unintelligible.');
      expect(rows(ctx, 'npc_memory')[0].lastUpdated).toEqual(ts(1_600_000_000_000_000n));
      expect(rows(ctx, 'npc_affinity')[0].lastInteraction).toEqual(ts(1_600_000_000_000_000n));
    }
  });

  it('valid JSON with neither segments nor dialogue stores the mutter narration, writes "..." to the dialog log and still applies effects', () => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, JSON.stringify({
      effects: [{ type: 'affinity_change', amount: 2 }],
      memoryUpdate: { addTopics: ['bread'] },
      internalThought: 'curious',
    }));
    const [row] = npcRows(ctx);
    expect(row.segments).toEqual([{ kind: 'narration', speaker: KEEPER, text: 'Marta mutters something you cannot make out.' }]);
    expect(row.message).toBe('Marta mutters something you cannot make out.');
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "..."');
    expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(2n);
    expect(rows(ctx, 'npc_memory')[0].lastUpdated).toEqual(ts(T0));
  });

  it('npc_dialog joins the conversation NPC dialogue texts with one space', () => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, segReply([
      { kind: 'dialogue', speaker: 'Marta', text: 'First.' },
      { kind: 'narration', speaker: 'The Keeper', text: 'She wipes her hands.' },
      { kind: 'dialogue', speaker: 'Marta', text: 'Second.' },
    ]));
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "First. Second."');
  });

  it('effect cue rows and the quest row keep their text and carry no segments', () => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, segReply(
      [{ kind: 'dialogue', speaker: 'Marta', text: 'Take this.' }],
      {
        effects: [
          { type: 'affinity_change', amount: 4 },
          { type: 'reveal_location', locationName: 'Gull Rock', locationDescription: 'A bare rock.' },
          { type: 'give_item' },
          { type: 'offer_quest', questName: 'Q', questType: 'gather' },
        ],
      },
    ));
    const privates = rows(ctx, 'event_private');
    expect(privates[0].segments).toHaveLength(1);
    expect(privates.slice(1).map((r: any) => [r.kind, r.message, r.segments])).toEqual([
      ['npc', 'Marta seems genuinely pleased by your words.', undefined],
      ['npc', 'Marta reveals: "Gull Rock -- A bare rock."', undefined],
      ['npc', 'Marta offers you something... (Item generation deferred.)', undefined],
      ['quest', 'New quest: Q', undefined],
    ]);
  });

  it('never logs reply text: a non-JSON reply holding a canary reaches no console.error argument', () => {
    const ctx = moduleCtx(seed());
    applyNpcConversationResult(ctx, npcJob, 'CANARY-7f3a {not json CANARY-7f3a');
    noCanary('CANARY-7f3a');
  });

  it('a hostile reply (many segments, unknown kinds, control characters, huge speaker) is stored bounded and never throws', () => {
    const ctx = moduleCtx(seed());
    const segments = Array.from({ length: 30 }, (_v, i) => ({
      kind: i % 2 ? 'dialogue' : 'shout',
      speaker: i % 3 ? 'Marta' : 'x'.repeat(5000),
      text: 'a‮\u0000b'.repeat(400),
    }));
    expect(() => applyNpcConversationResult(ctx, npcJob, segReply(segments))).not.toThrow();
    const [row] = npcRows(ctx);
    expect(row.segments.length).toBeLessThanOrEqual(6);
    for (const s of row.segments) {
      expect(Array.from(s.text).length).toBeLessThanOrEqual(600);
      expect(s.speaker === KEEPER || s.speaker === 'Marta').toBe(true);
      expect(s.text).not.toMatch(/[\u0000‮]/);
    }
  });
});

describe('Phase 46: Keeper narration segments on server-composed rows', () => {
  const KEEPER = 'The Keeper';
  const flat = (segs: any[]) => segs.map((s) => (s.kind === 'dialogue' ? `${s.speaker} says, "${s.text}"` : s.text)).join('\n\n');
  const expectKeeperOnly = (row: any, max = 6) => {
    expect(Array.isArray(row.segments)).toBe(true);
    expect(row.segments.length).toBeGreaterThan(0);
    expect(row.segments.length).toBeLessThanOrEqual(max);
    for (const s of row.segments) expect(s).toMatchObject({ kind: 'narration', speaker: KEEPER });
    expect(row.message).toBe(flat(row.segments));
  };
  const expectOneFallback = (row: any) => {
    expect(row.segments).toEqual([{ kind: 'narration', speaker: KEEPER, text: row.message }]);
  };
  const stateJob = (domain: string) => job(domain, JSON.stringify({ creationStateId: '2' }));
  const noCanary = (canary: string) => {
    expect(errorSpy).toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      expect(call.map((a: unknown) => String(a)).join(' ')).not.toContain(canary);
    }
  };

  it('creation_race success: Keeper narration only, message derived from the segments', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
    applyCreationResult(ctx, stateJob('creation_race'), JSON.stringify({
      raceName: 'Ashkin', narrative: 'Cinders.', bonuses: { primary: { stat: 'str', value: 2 } },
    }));
    const [row] = rows(ctx, 'event_creation');
    expect(row.kind).toBe('creation');
    expectKeeperOnly(row);
    expect(row.message.startsWith('Cinders.\n\n**Ashkin**\n+2 STR')).toBe(true);
    expect(row.message).toContain('Are you a [Warrior]');
    expect(row.message.endsWith('Nobody will judge... much.)')).toBe(true);
  });

  it('renown success with three perks: seven paragraphs pack into six Keeper narration segments, message text unchanged', () => {
    const perk = (name: string) => ({ name, description: `${name} description.`, kind: '', perkEffectJson: '{"maxHp":10}', perkDomain: 'combat' });
    const ctx = moduleCtx({ character: [characterRow()] });
    applyRenownPerkResult(ctx, job('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' })),
      JSON.stringify({ perks: [perk('A'), perk('B'), perk('C')] }));
    const [row] = rows(ctx, 'event_private');
    expect(row.kind).toBe('narrative');
    expect(row.segments).toHaveLength(6);
    expectKeeperOnly(row);
    // the text composed before Phase 46 (modulo whitespace: the six-segment pack merges one adjacent paragraph pair)
    expect(row.message.replace(/\s+/g, ' ')).toBe(
      'Your renown has grown. The world takes notice. ' +
        'Something resembling mild respect stirs in the air. ' +
        'Rank 2. The world owes you something. Choose your due: ' +
        '[A] -- A description. Passive bonus [B] -- B description. Passive bonus [C] -- C description. Passive bonus ' +
        'Choose wisely. Your reputation preceded you here. Don\'t let it down.',
    );
  });

  it('creation_race reply that is not JSON: one creation_error row with exactly one Keeper segment, the malformed line', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
    applyCreationResult(ctx, stateJob('creation_race'), 'not json at all');
    const [row] = rows(ctx, 'event_creation');
    expect(row.kind).toBe('creation_error');
    expect(row.message).toBe('The answer comes back garbled, as though the cosmic machinery had choked on it. Try again.');
    expectOneFallback(row);
  });

  it('skill_gen with fewer than three valid skills: one narrative row with one Keeper segment equal to the line', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applySkillGenResult(ctx, job('skill_gen', JSON.stringify({ characterId: '10' })), '{"skills": []}');
    const [row] = rows(ctx, 'event_private');
    expect(row.kind).toBe('narrative');
    expect(row.message).toContain('The cosmic machinery sputtered.');
    expectOneFallback(row);
  });

  it('skill_gen success: Keeper narration segments whose message is the composed presentation', () => {
    const skill = (name: string) => ({
      name, description: `${name} description.`, kind: 'damage', targetRule: 'single_enemy', resourceType: 'stamina',
      resourceCost: 5, castSeconds: 0, cooldownSeconds: 6, scaling: 'str', value1: 10, value2: null,
      damageType: 'physical', effectType: null, effectMagnitude: null, effectDuration: null,
    });
    const ctx = moduleCtx({ character: [characterRow()] });
    applySkillGenResult(ctx, job('skill_gen', JSON.stringify({ characterId: '10' })),
      JSON.stringify({ skills: [skill('One'), skill('Two'), skill('Three')] }));
    const [row] = rows(ctx, 'event_private');
    expectKeeperOnly(row);
    expect(row.message.startsWith('Something resembling interest stirs in the air.')).toBe(true);
    expect(row.message.endsWith('never to return.')).toBe(true);
  });

  describe('applyLlmFailure', () => {
    const fail = (ctx: any, domain: string, context: string, errorCode?: string) =>
      applyLlmFailure(ctx, { ...job(domain, context), errorCode });
    const CHAR = JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' });
    const marta = { id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n };

    it.each([undefined, 'halted'])('creation_race (%s): one Keeper segment equal to the line', (code) => {
      const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_RACE')] });
      fail(ctx, 'creation_race', JSON.stringify({ creationStateId: '2' }), code);
      const [row] = rows(ctx, 'event_creation');
      expect(row.kind).toBe('creation_error');
      expectOneFallback(row);
    });

    it.each([undefined, 'ceiling'])('skill_gen (%s): one Keeper segment equal to the line', (code) => {
      const ctx = moduleCtx({ character: [characterRow()] });
      fail(ctx, 'skill_gen', CHAR, code);
      expectOneFallback(rows(ctx, 'event_private')[0]);
    });

    it('npc_conversation (not resting): the distracted line is one Keeper segment', () => {
      const ctx = moduleCtx({ character: [characterRow()], npc: [marta] });
      fail(ctx, 'npc_conversation', CHAR);
      const [row] = rows(ctx, 'event_private');
      expect(row.message).toBe('Marta seems distracted. Try again.');
      expectOneFallback(row);
    });

    it('npc_conversation (resting): the system line carries no segments', () => {
      const ctx = moduleCtx({ character: [characterRow()], npc: [marta] });
      fail(ctx, 'npc_conversation', CHAR, 'halted');
      const [row] = rows(ctx, 'event_private');
      expect(row.kind).toBe('system');
      expect(row.segments).toBeUndefined();
    });

    it('renown_perk_gen: the standard-options line is one Keeper segment', () => {
      const ctx = moduleCtx({ character: [characterRow()] });
      fail(ctx, 'renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' }));
      const [row] = rows(ctx, 'event_private');
      expect(row.message).toContain('standard options');
      expectOneFallback(row);
    });

    it('world_gen_start failure for a placed character: the system line carries no segments', () => {
      const gen = { id: 5n, playerId: alice, characterId: 10n, sourceLocationId: 0n, sourceRegionId: 0n, step: 'GENERATING', createdAt: ts(T0), updatedAt: ts(T0) };
      const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [gen] });
      fail(ctx, 'world_gen_start', JSON.stringify({ genStateId: '5' }));
      const [row] = rows(ctx, 'event_private');
      expect(row.kind).toBe('system');
      expect(row.segments).toBeUndefined();
    });
  });

  describe('world_gen_start', () => {
    const START = {
      regionName: 'Cinderfall', regionDescription: 'Ash drifts down.', biome: 'volcanic',
      startLocation: { name: 'Ember Hollow', description: 'A town.', terrainType: 'town', levelOffset: 0 },
      firstNpc: { name: 'Vessa', gender: 'female', npcType: 'vendor', description: 'A trader.', greeting: 'Buy.', personality: { traits: ['quiet'], speechPattern: 'slow', knowledgeDomains: ['x'], secrets: [], affinityMultiplier: 1 } },
    };
    const gen = () => ({ id: 5n, playerId: alice, characterId: 10n, sourceLocationId: 0n, sourceRegionId: 0n, step: 'GENERATING', createdAt: ts(T0), updatedAt: ts(T0) });
    const startJob = job('world_gen_start', JSON.stringify({ genStateId: '5' }));
    const unplaced = () => ({ ...characterRow(), locationId: 0n, boundLocationId: 0n });
    const newCtx = () => moduleCtx({ player: [{ id: alice, userId: 7n }], character: [unplaced()], world_gen_state: [gen()] });

    it('the arrival row carries Keeper narration segments; discovery and milestone lines carry none', () => {
      const ctx = newCtx();
      applyLlmResult(ctx, startJob, JSON.stringify(START));
      const privates = rows(ctx, 'event_private');
      const arrival = privates.find((r: any) => r.kind === 'narrative');
      expectKeeperOnly(arrival);
      expect(arrival.message.startsWith('You open your eyes in Ember Hollow, Cinderfall.')).toBe(true);
      const systems = privates.filter((r: any) => r.kind === 'system');
      expect(systems.length).toBeGreaterThanOrEqual(2);
      for (const r of systems) expect(r.segments).toBeUndefined();
    });

    it('a malformed reply writes a creation_error row with one Keeper segment', () => {
      const ctx = newCtx();
      applyLlmResult(ctx, startJob, 'garbled');
      const [row] = rows(ctx, 'event_creation');
      expect(row.kind).toBe('creation_error');
      expectOneFallback(row);
    });

    it('a malformed reply logs no reply text', () => {
      const ctx = newCtx();
      applyLlmResult(ctx, startJob, 'CANARY-91bc {broken CANARY-91bc');
      noCanary('CANARY-91bc');
    });
  });

  it('a creation reply that is not JSON and holds a canary: no console.error argument contains it', () => {
    for (const domain of ['creation_race', 'creation_class_reveal', 'creation_class'] as const) {
      const step = { creation_race: 'GENERATING_RACE', creation_class_reveal: 'GENERATING_CLASS', creation_class: 'CLASS_FILLING' }[domain];
      const ctx = moduleCtx({ character_creation_state: [{ ...creationState(step), abilities: '[{"name":"x"}]', archetype: 'warrior' }] });
      applyLlmResult(ctx, stateJob(domain), 'CANARY-5d2e {nope CANARY-5d2e');
    }
    noCanary('CANARY-5d2e');
  });

  it('a skill_gen reply that is not JSON and holds a canary logs no reply text', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applySkillGenResult(ctx, job('skill_gen', JSON.stringify({ characterId: '10' })), 'CANARY-c0de {nope CANARY-c0de');
    noCanary('CANARY-c0de');
  });

  it('no Keeper line changed wording: the skill failure line is byte-identical to the pre-Phase-46 string', () => {
    const ctx = moduleCtx({ character: [characterRow()] });
    applyLlmFailure(ctx, job('skill_gen', JSON.stringify({ characterId: '10' })));
    expect(rows(ctx, 'event_private')[0].message).toBe(
      'The page flickers. Your potential eludes crystallization. Type [skills] when you want another attempt.',
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 51.3.1.1 Plan 09: invented quest kill targets become families of one (D-54); boss_kill stays
// an individual (D-07). Strict mock db; no LLM call.
// ---------------------------------------------------------------------------

describe('Plan 09: invented quest kill targets get a pool of their own (D-54, D-07)', () => {
  beforeEach(async () => {
    await import('../schema/tables');
  });

  const placeRow = (id: bigint, name: string, terrainType: string, isSafe: boolean) => ({
    id,
    name,
    description: `${name}.`,
    zone: 'z',
    regionId: 1n,
    levelOffset: 0n,
    isSafe,
    terrainType,
    bindStone: false,
    craftingAvailable: false,
    shortName: '',
    placeNoun: '',
    isHub: false,
  });
  /** The character and Marta stand at place 100 (safe or not); 101 and 102 are hostile neighbours. */
  const questSeed = (hereSafe: boolean, extra: Record<string, any[]> = {}) => ({
    character: [characterRow()],
    region: [{ id: 1n, name: 'Mirefold', dangerMultiplier: 200n, regionType: 'generated', biome: 'swamp', landmarks: '[]', threats: '[]' }],
    location: [
      placeRow(100n, 'Mill Square', hereSafe ? 'town' : 'swamp', hereSafe),
      placeRow(101n, 'Black Fen', 'swamp', false),
      placeRow(102n, 'Reed Hollow', 'woods', false),
    ],
    location_connection: [
      { id: 1n, fromLocationId: 100n, toLocationId: 102n },
      { id: 2n, fromLocationId: 100n, toLocationId: 101n },
    ],
    npc: [{ id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n, description: 'A baker.', greeting: 'Hello.', personalityJson: '{}' }],
    npc_memory: [{ id: 30n, characterId: 10n, npcId: 20n, memoryJson: '{}', lastUpdated: ts(1_600_000_000_000_000n) }],
    npc_affinity: [
      { id: 40n, characterId: 10n, npcId: 20n, affinity: 0n, lastInteraction: ts(1_600_000_000_000_000n), giftsGiven: 0n, conversationCount: 0n },
    ],
    ...extra,
  });
  const strictCtx = (seed: Record<string, any[]>) =>
    createMockCtx({ seed, sender: moduleIdentity, timestampMicros: T0, strict: true } as any);
  const npcJob = job('npc_conversation', JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' }));
  const killReply = (questType: string, targetEnemyName: string) =>
    JSON.stringify({
      dialogue: 'Hi.',
      effects: [{ type: 'offer_quest', questName: 'Cull the Fen', questType, targetEnemyName, targetCount: 3 }],
      memoryUpdate: {},
      internalThought: '',
    });
  const invented = (ctx: any) => rows(ctx, 'enemy_template').find((t: any) => t.name === 'Gloomfang');
  const creaturePools = (ctx: any) => rows(ctx, 'place_pool').filter((p: any) => p.kind === 'creature');

  it.each(['kill', 'kill_loot'])('%s at a hostile place: the new template, family quest:<id> of one and a Scarce pool there', (questType) => {
    const ctx = strictCtx(questSeed(false));
    applyNpcConversationResult(ctx, npcJob, killReply(questType, 'Gloomfang'));

    const template = invented(ctx);
    expect(template).toBeTruthy();
    const family = rows(ctx, 'creature_family').find((f: any) => f.key === `quest:${template.id}`);
    expect(family).toBeTruthy();
    expect(rows(ctx, 'family_member').filter((m: any) => m.familyId === family.id)).toEqual([
      expect.objectContaining({ enemyTemplateId: template.id, filler: false }),
    ]);
    const pools = creaturePools(ctx).filter((p: any) => p.refId === family.id);
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({ locationId: 100n, homeLevel: 1n });
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(template.id);
  });

  it('kill at a safe town: the pool goes to the nearest hosting place (lowest id at one hop), recorded on the quest (D-74)', () => {
    const ctx = strictCtx(questSeed(true));
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'Gloomfang'));
    const template = invented(ctx);
    const family = rows(ctx, 'creature_family').find((f: any) => f.key === `quest:${template.id}`);
    expect(creaturePools(ctx).filter((p: any) => p.refId === family.id).map((p: any) => p.locationId)).toEqual([101n]);
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ targetEnemyTemplateId: template.id, targetLocationId: 101n });
  });

  it('boss_kill: the new template stays an individual, with no family and no pool', () => {
    const ctx = strictCtx(questSeed(false));
    applyNpcConversationResult(ctx, npcJob, killReply('boss_kill', 'Gloomfang'));
    const template = invented(ctx);
    expect(template).toBeTruthy();
    expect(rows(ctx, 'creature_family')).toEqual([]);
    expect(rows(ctx, 'family_member')).toEqual([]);
    expect(creaturePools(ctx)).toEqual([]);
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(template.id);
  });

  // Plan 25 (D-47, D-54): the family of one gets the same late family job as any family (switch on,
  // region economy complete); boss_kill keeps no family and no job.
  const economyOn = (complete = true): Record<string, any[]> => ({
    economy_dials: [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: true }],
    region_economy: complete
      ? [{ regionId: 1n, status: 'complete', jobId: 1n, otherRegionIds: '[]', createdAt: ts(T0 - 10n), updatedAt: ts(T0 - 10n) }]
      : [],
    llm_job: [],
  });
  const familyJobs = (ctx: any) =>
    rows(ctx, 'llm_job').filter((j: any) => j.route === 'region_economy' && JSON.parse(j.requestJson).mode === 'family');

  it.each(['kill', 'kill_loot'])('%s with the AI economy on: one family-mode job for the family of one (family:<id>)', (questType) => {
    const ctx = strictCtx(questSeed(false, economyOn()));
    applyNpcConversationResult(ctx, npcJob, killReply(questType, 'Gloomfang'));
    const template = invented(ctx);
    const family = rows(ctx, 'creature_family').find((f: any) => f.key === `quest:${template.id}`);
    const jobs = familyJobs(ctx);
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0].dedupeKey)[2]).toBe(`family:${family.id}`);
    expect(JSON.parse(jobs[0].requestJson)).toMatchObject({ regionId: '1', mode: 'family', familyId: String(family.id), characterId: '10' });
    expect(rows(ctx, 'llm_job').filter((j: any) => JSON.parse(j.requestJson).mode === 'enemy')).toEqual([]);
  });

  it('kill with the AI economy off, or the region not designed: no job', () => {
    for (const extra of [{}, { ...economyOn(), economy_dials: [{ id: 1n, ...DEFAULT_DIALS, aiEnabled: false }] }, economyOn(false)]) {
      const ctx = strictCtx(questSeed(false, extra));
      applyNpcConversationResult(ctx, npcJob, killReply('kill', 'Gloomfang'));
      expect(invented(ctx)).toBeTruthy();
      expect(rows(ctx, 'llm_job')).toEqual([]);
    }
  });

  it('boss_kill with the AI economy on: no family and no job', () => {
    const ctx = strictCtx(questSeed(false, economyOn()));
    applyNpcConversationResult(ctx, npcJob, killReply('boss_kill', 'Gloomfang'));
    expect(rows(ctx, 'creature_family')).toEqual([]);
    expect(rows(ctx, 'llm_job')).toEqual([]);
  });

  it('kill naming an existing template linked here but in no pool creates no quest (D-74) and no new family', () => {
    const ctx = strictCtx(
      questSeed(false, { enemy_template: [wightRow(900n, 'Bog Wight', 'damage')], location_enemy_template: [{ id: 1n, locationId: 100n, enemyTemplateId: 900n }] }),
    );
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'bog wight'));
    expect(rows(ctx, 'enemy_template')).toHaveLength(1);
    expect(rows(ctx, 'creature_family')).toEqual([]);
    expect(rows(ctx, 'quest_template')).toEqual([]);
    expect(rows(ctx, 'quest_instance')).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Plan 32 (D-74): a kill quest is created only when its target lives in a reachable pool.
  // -------------------------------------------------------------------------

  function wightRow(id: bigint, name: string, role: string) {
    return {
      id, name, role, roleDetail: role, abilityProfile: role, terrainTypes: 'swamp', creatureType: 'undead',
      timeOfDay: 'any', socialGroup: 'wights', socialRadius: 0n, awareness: 'normal', groupMin: 1n, groupMax: 1n, armorClass: 5n,
      level: 2n, maxHp: 44n, baseDamage: 11n, xpReward: 40n,
    };
  }
  /** The Bog Wights (a damage member 900 and a tank 901) pooled at Reed Hollow (102), one hop from the town. */
  const wightFamily = (): Record<string, any[]> => ({
    enemy_template: [wightRow(900n, 'Bog Wight', 'damage'), wightRow(901n, 'Bog Brute', 'tank')],
    creature_family: [{
      id: 7n, regionId: 1n, key: '1:undead', name: 'Bog Wights', singularNoun: 'bog wight', pluralNoun: 'bog wights',
      temperament: 'wary', iconKey: 'undead', creatureType: 'undead', ambushVerb: 'rise', ambushRest: 'from the bog', fitTerrains: 'swamp,woods', history: '',
    }],
    family_member: [
      { id: 1n, familyId: 7n, enemyTemplateId: 900n, role: 'damage', filler: false },
      { id: 2n, familyId: 7n, enemyTemplateId: 901n, role: 'tank', filler: false },
    ],
    place_pool: [{
      id: 50n, regionId: 1n, locationId: 102n, kind: 'creature', refId: 7n, count: 50n, homeLevel: 2n,
      wipedAtMicros: 0n, lastSettledMicros: T0, dirty: false, timeOfDay: 'any',
    }],
  });
  const replyWith = (effects: any[]) =>
    JSON.stringify({ dialogue: 'The fen keeps its own.', effects, memoryUpdate: {}, internalThought: '' });
  const questLines = (ctx: any) => rows(ctx, 'event_private').filter((e: any) => String(e.message).startsWith('New quest'));

  it.each(['kill', 'kill_loot'])('%s naming a pooled member: that member, the pool place on the quest, no new template', (questType) => {
    const ctx = strictCtx(questSeed(true, wightFamily()));
    applyNpcConversationResult(ctx, npcJob, killReply(questType, 'Bog Wight'));
    expect(rows(ctx, 'enemy_template')).toHaveLength(2);
    expect(rows(ctx, 'quest_template')).toEqual([
      expect.objectContaining({ questType, targetEnemyTemplateId: 900n, targetLocationId: 102n }),
    ]);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
    expect(questLines(ctx)).toHaveLength(1);
  });

  it("naming the family resolves to its front-liner (the tank)", () => {
    const ctx = strictCtx(questSeed(true, wightFamily()));
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'bog wights'));
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ targetEnemyTemplateId: 901n, targetLocationId: 102n });
  });

  it('an invented target two hops away: the family of one is pooled there and the quest records it', () => {
    // Mill Square (100, safe) - Toll Bridge (103, safe) - Black Fen (101, hostile); Reed Hollow is gone.
    const seed = questSeed(true, {
      location_connection: [
        { id: 1n, fromLocationId: 100n, toLocationId: 103n },
        { id: 2n, fromLocationId: 103n, toLocationId: 101n },
      ],
    });
    seed.location = [seed.location[0], { ...seed.location[0], id: 103n, name: 'Toll Bridge' }, seed.location[1]];
    const ctx = strictCtx(seed);
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'Gloomfang'));
    const template = invented(ctx);
    const family = rows(ctx, 'creature_family').find((f: any) => f.key === `quest:${template.id}`);
    expect(creaturePools(ctx).filter((p: any) => p.refId === family.id).map((p: any) => p.locationId)).toEqual([101n]);
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ targetEnemyTemplateId: template.id, targetLocationId: 101n });
    expect(rows(ctx, 'location_enemy_template').some((l: any) => l.locationId === 100n && l.enemyTemplateId === template.id)).toBe(true);
  });

  it('no hosting place in reach: no template, no quest, no New quest line', () => {
    const seed = questSeed(true);
    seed.location = seed.location.map((l: any) => ({ ...l, isSafe: true, terrainType: 'town' }));
    const ctx = strictCtx(seed);
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'Gloomfang'));
    expect(rows(ctx, 'enemy_template')).toEqual([]);
    expect(rows(ctx, 'creature_family')).toEqual([]);
    expect(rows(ctx, 'quest_template')).toEqual([]);
    expect(rows(ctx, 'quest_instance')).toEqual([]);
    expect(questLines(ctx)).toEqual([]);
  });

  it('no name with a pool in reach: the nearest ordinary family\'s front-liner', () => {
    const ctx = strictCtx(questSeed(true, wightFamily()));
    applyNpcConversationResult(ctx, npcJob, replyWith([{ type: 'offer_quest', questName: 'Clear the Hollow', questType: 'kill', targetCount: 2 }]));
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ targetEnemyTemplateId: 901n, targetLocationId: 102n });
    expect(questLines(ctx)).toHaveLength(1);
  });

  it('no name and no pool in reach: no quest', () => {
    const ctx = strictCtx(questSeed(true));
    applyNpcConversationResult(ctx, npcJob, replyWith([{ type: 'offer_quest', questName: 'Clear the Hollow', questType: 'kill', targetCount: 2 }]));
    expect(rows(ctx, 'quest_template')).toEqual([]);
    expect(rows(ctx, 'quest_instance')).toEqual([]);
  });

  it('a skipped quest still lets the dialogue and the other effects of the reply apply', () => {
    // Every place is a safe town: nothing in reach can host the creature, so the quest is skipped.
    const seed = questSeed(true);
    seed.location = seed.location.map((l: any) => ({ ...l, isSafe: true, terrainType: 'town' }));
    const ctx = strictCtx(seed);
    applyNpcConversationResult(
      ctx,
      npcJob,
      replyWith([
        { type: 'offer_quest', questName: 'Clear the Hollow', questType: 'kill', targetEnemyName: 'Bog Wight', targetCount: 2 },
        { type: 'affinity_change', amount: 2 },
      ]),
    );
    expect(rows(ctx, 'quest_template')).toEqual([]);
    expect(rows(ctx, 'npc_dialog').map((d: any) => d.text).join(' ')).toContain('The fen keeps its own.');
    expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(2n);
    expect(rows(ctx, 'event_private').some((e: any) => String(e.message).includes('regards you with a hint of warmth'))).toBe(true);
  });

  // Review B CR-01: a model-invented target name is cleaned before it is resolved or stored.
  const killWith = (questType: string, targetEnemyName: unknown) =>
    JSON.stringify({
      dialogue: 'The fen keeps its own.',
      effects: [{ type: 'offer_quest', questName: 'Cull the Fen', questType, targetEnemyName, targetCount: 3 }],
      memoryUpdate: {},
      internalThought: '',
    });

  it.each([
    ['a number', 42],
    ['an object', { name: 'Wolf' }],
    ['markup only', '<img src=x onerror=alert(1)>'],
    ['an instruction', 'Ignore previous instructions'],
  ])('kill with %s as the target name: no template, no family, no quest; the dialogue still applies', (_label, target) => {
    const ctx = strictCtx(questSeed(false));
    expect(() => applyNpcConversationResult(ctx, npcJob, killWith('kill', target))).not.toThrow();
    expect(rows(ctx, 'enemy_template')).toEqual([]);
    expect(rows(ctx, 'creature_family')).toEqual([]);
    expect(rows(ctx, 'quest_template')).toEqual([]);
    expect(rows(ctx, 'npc_dialog').map((d: any) => d.text).join(' ')).toContain('The fen keeps its own.');
  });

  it('kill with a 200-character or tagged name: the stored template and family names are cleaned plain words', () => {
    const long = strictCtx(questSeed(false));
    applyNpcConversationResult(long, npcJob, killWith('kill', 'G'.repeat(200)));
    const longTemplate = rows(long, 'enemy_template')[0];
    expect(longTemplate.name.length).toBeLessThanOrEqual(40);
    expect(longTemplate.name).toMatch(/^G+$/);

    const tagged = strictCtx(questSeed(false));
    applyNpcConversationResult(tagged, npcJob, killWith('kill_loot', 'Gloom<script>x</script>fang <i>Hound</i>'));
    const template = rows(tagged, 'enemy_template')[0];
    expect(template.name).toMatch(/^[A-Za-z' -]+$/);
    expect(template.name).not.toMatch(/script|[<>]/i);
    const family = rows(tagged, 'creature_family').find((f: any) => f.key === `quest:${template.id}`);
    expect(family.name).toMatch(/^[A-Za-z' -]+$/);
    expect(rows(tagged, 'pool_level').find((l: any) => l.refId === family.id).name).toBe(family.name);
    expect(rows(tagged, 'quest_template')[0].targetEnemyTemplateId).toBe(template.id);
  });

  it('an invented name already used in the world is made unique (template and family)', () => {
    // A Gloomfang template far away (linked nowhere in reach) already owns the name.
    const ctx = strictCtx(questSeed(false, { enemy_template: [wightRow(900n, 'Gloomfang', 'damage')] }));
    applyNpcConversationResult(ctx, npcJob, killWith('kill', 'gloomfang'));
    const created = rows(ctx, 'enemy_template').filter((t: any) => t.id !== 900n);
    expect(created).toHaveLength(1);
    expect(created[0].name.toLowerCase()).not.toBe('gloomfang');
    expect(created[0].name.endsWith('gloomfang')).toBe(true);
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(created[0].id);
  });

  // Review B WR-02: D-74 resolves from the quest giver's place, not where the player stands at apply time.
  const movedAway = (seed: Record<string, any[]>) => {
    seed.region = [...seed.region, { id: 2n, name: 'Far Fen', dangerMultiplier: 200n, regionType: 'generated', biome: 'swamp', landmarks: '[]', threats: '[]' }];
    seed.location = [...seed.location, { ...placeRow(200n, 'Far Marsh', 'swamp', false), regionId: 2n }];
    seed.character = seed.character.map((c: any) => ({ ...c, locationId: 200n }));
    return seed;
  };

  it('a player who moved to another region before the reply landed: the invented pool sits at the NPC side', () => {
    const ctx = strictCtx(movedAway(questSeed(false)));
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'Gloomfang'));
    const template = invented(ctx);
    const family = rows(ctx, 'creature_family').find((f: any) => f.key === `quest:${template.id}`);
    expect(family.regionId).toBe(1n);
    expect(creaturePools(ctx).filter((p: any) => p.refId === family.id).map((p: any) => p.locationId)).toEqual([100n]);
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ targetEnemyTemplateId: template.id, targetLocationId: 100n });
    expect(rows(ctx, 'location_enemy_template').some((l: any) => l.locationId === 200n)).toBe(false);
    expect(rows(ctx, 'place_pool').some((p: any) => p.locationId === 200n)).toBe(false);
  });

  it("a player who moved away: a pooled target is still found from the NPC's place", () => {
    const ctx = strictCtx(movedAway(questSeed(true, wightFamily())));
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'Bog Wight'));
    expect(rows(ctx, 'quest_template')).toEqual([expect.objectContaining({ targetEnemyTemplateId: 900n, targetLocationId: 102n })]);
  });

  it("the quest giver's place is gone: no kill quest", () => {
    const seed = questSeed(false);
    seed.npc = seed.npc.map((n: any) => ({ ...n, locationId: 999n }));
    const ctx = strictCtx(seed);
    applyNpcConversationResult(ctx, npcJob, killReply('kill', 'Gloomfang'));
    expect(rows(ctx, 'enemy_template')).toEqual([]);
    expect(rows(ctx, 'quest_template')).toEqual([]);
  });

  it('boss_kill cleans the name the same way: an unusable name invents nothing', () => {
    const ctx = strictCtx(questSeed(false));
    expect(() => applyNpcConversationResult(ctx, npcJob, killWith('boss_kill', 42))).not.toThrow();
    expect(rows(ctx, 'enemy_template')).toEqual([]);
    const tagged = strictCtx(questSeed(false));
    applyNpcConversationResult(tagged, npcJob, killWith('boss_kill', 'Bog <b>Tyrant</b>'));
    expect(rows(tagged, 'enemy_template').map((t: any) => t.name)).toEqual(['Bog Tyrant']);
  });

  it('boss_kill resolves exactly as before: the named template linked at the current or a connected place', () => {
    const ctx = strictCtx(
      questSeed(false, { enemy_template: [wightRow(900n, 'Bog Wight', 'damage')], location_enemy_template: [{ id: 1n, locationId: 102n, enemyTemplateId: 900n }] }),
    );
    applyNpcConversationResult(ctx, npcJob, killReply('boss_kill', 'bog wight'));
    expect(rows(ctx, 'quest_template')).toEqual([expect.objectContaining({ questType: 'boss_kill', targetEnemyTemplateId: 900n })]);
    expect(rows(ctx, 'quest_template')[0].targetLocationId).toBeUndefined();
    expect(rows(ctx, 'creature_family')).toEqual([]);
  });
});
