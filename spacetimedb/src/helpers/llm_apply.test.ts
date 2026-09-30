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
} from './llm_apply';
import { serializePerkEffect } from './renown';
import { RENOWN_PERK_POOLS } from '../data/renown_data';

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

  it('applyLlmFailure creation_class reverts alice state and writes alice event', () => {
    const ctx = moduleCtx({ character_creation_state: [creationState('GENERATING_CLASS')] });
    applyLlmFailure(ctx, job('creation_class'));
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
    expect(toApplyJob(row)).toEqual({ domain: 'skill_gen', playerId: alice, contextJson: '{"a":1}' });
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
    expect(msg).not.toContain('The cosmos provided some... standard options');
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
    expect(rows(ctx, 'event_private')[0].message).not.toContain('The cosmos provided some... standard options');
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
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmos provided some... standard options');
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
  const worldJob = { domain: 'world_gen', playerId: alice, contextJson: JSON.stringify({ genStateId: '5' }) } as any;

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

  it('a failed world_gen job (call failure, sweeper expiry) ends in ERROR through applyLlmFailure', () => {
    const ctx = moduleCtx({ character: [characterRow()], world_gen_state: [genRow()] });
    applyLlmFailure(ctx, worldJob);
    const state = rows(ctx, 'world_gen_state')[0];
    expect(state.step).toBe('ERROR');
    expect(state.errorMessage).toContain('The Keeper falters.');
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
