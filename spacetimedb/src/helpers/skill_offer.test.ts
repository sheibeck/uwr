/**
 * Skill offer rules and enqueue (Phase 41, Plan 12, PIPE-01 / PIPE-05).
 * Strict mock db (accessors from the recorded schema); one shared identity per player.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { rowColumnProblems } from './schema_recorder';
import {
  canRequestSkillOffer,
  enqueueSkillOffer,
  offerNextOwedSkill,
  owedSkillOfferLevel,
  requestSkillOffer,
  SKILL_OFFER_MESSAGES,
} from './skill_offer';
import { resolveRouteInput } from './llm_inputs';
import { llmRefusalMessage } from './llm_queue';
import { utcDay } from './llm_budget';
import { buildRouteLayers } from '../data/llm_layers';
import { LLM_PLAYER_DAILY_COST_MICRO_USD } from '../data/llm_limits';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

type Seed = Record<string, any[]>;

const characterRow = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Aldric',
  race: 'Kobold',
  className: 'Ashweaver',
  level: 3n,
  ...over,
});

const abilityRow = (over: Record<string, unknown> = {}) => ({
  id: 0n,
  characterId: 1n,
  name: 'Cinder Cut',
  description: 'x',
  kind: 'damage',
  targetRule: 'enemy',
  resourceType: 'mana',
  resourceCost: 5n,
  castSeconds: 0n,
  cooldownSeconds: 6n,
  scaling: 'int',
  value1: 10n,
  levelRequired: 2n,
  isGenerated: true,
  ...over,
});

const pendingRow = () => ({
  id: 0n,
  characterId: 1n,
  name: 'Ash Ward',
  description: 'x',
  kind: 'shield',
  targetRule: 'self',
  resourceType: 'mana',
  resourceCost: 5n,
  castSeconds: 0n,
  cooldownSeconds: 6n,
  scaling: 'wis',
  value1: 10n,
  levelRequired: 3n,
  createdAt: { microsSinceUnixEpoch: T0 },
});

const seed = (over: Seed = {}): Seed => ({
  player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
  character: [characterRow()],
  ability_template: [],
  pending_skill: [],
  character_creation_state: [],
  ...over,
});

const newCtx = (s: Seed = seed()) => createMockCtx({ seed: s, sender: alice, timestampMicros: T0, strict: true });
const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const characterOf = (ctx: any) => rows(ctx, 'character')[0];

describe('canRequestSkillOffer', () => {
  it('refuses a level 1 character in voice', () => {
    const ctx = newCtx(seed({ character: [characterRow({ level: 1n })] }));
    const r = canRequestSkillOffer(ctx, characterOf(ctx));
    expect(r.ok).toBe(false);
    expect((r as any).message).toBe(SKILL_OFFER_MESSAGES.tooLow);
  });

  it('refuses while skill choices are pending', () => {
    const ctx = newCtx(seed({ pending_skill: [pendingRow()] }));
    const r = canRequestSkillOffer(ctx, characterOf(ctx));
    expect(r).toEqual({ ok: false, message: 'Your offering awaits your choice.' });
  });

  it('refuses when a generated ability was already taken at every level from 2 to the current one', () => {
    const ctx = newCtx(seed({ ability_template: [abilityRow({ id: 1n, levelRequired: 2n }), abilityRow({ id: 2n, levelRequired: 3n })] }));
    const r = canRequestSkillOffer(ctx, characterOf(ctx));
    expect(r).toEqual({ ok: false, message: SKILL_OFFER_MESSAGES.alreadyTaken });
  });

  it('allows an owed earlier level when the current level is taken (WR-B02)', () => {
    const ctx = newCtx(seed({ ability_template: [abilityRow({ levelRequired: 3n })] }));
    expect(canRequestSkillOffer(ctx, characterOf(ctx))).toEqual({ ok: true });
  });

  it('is not blocked by a class (non-generated) ability at the current level', () => {
    const ctx = newCtx(seed({ ability_template: [abilityRow({ levelRequired: 3n, isGenerated: false })] }));
    expect(canRequestSkillOffer(ctx, characterOf(ctx))).toEqual({ ok: true });
  });

  it('allows level 3 with only a level 2 generated ability and no pending skills', () => {
    const ctx = newCtx(seed({ ability_template: [abilityRow({ levelRequired: 2n })] }));
    expect(canRequestSkillOffer(ctx, characterOf(ctx))).toEqual({ ok: true });
  });

  it('allows level 2 with nothing taken', () => {
    const ctx = newCtx(seed({ character: [characterRow({ level: 2n })] }));
    expect(canRequestSkillOffer(ctx, characterOf(ctx))).toEqual({ ok: true });
  });
});

describe('owedSkillOfferLevel (WR-B02)', () => {
  it('is the current level when nothing was taken at it', () => {
    const ctx = newCtx(seed({ ability_template: [abilityRow({ levelRequired: 2n })] }));
    expect(owedSkillOfferLevel(ctx, characterOf(ctx))).toBe(3n);
  });

  it('is the lowest earlier level still owed when the current level is taken', () => {
    const ctx = newCtx(seed({
      character: [characterRow({ level: 5n })],
      ability_template: [abilityRow({ id: 1n, levelRequired: 2n }), abilityRow({ id: 2n, levelRequired: 5n })],
    }));
    expect(owedSkillOfferLevel(ctx, characterOf(ctx))).toBe(3n);
  });

  it('ignores level 1 and non-generated abilities, and is null when nothing is owed', () => {
    const ctx = newCtx(seed({
      character: [characterRow({ level: 2n })],
      ability_template: [abilityRow({ id: 1n, levelRequired: 1n }), abilityRow({ id: 2n, levelRequired: 2n, isGenerated: false })],
    }));
    expect(owedSkillOfferLevel(ctx, characterOf(ctx))).toBe(2n);
    ctx.db.ability_template.insert(abilityRow({ id: 0n, levelRequired: 2n }));
    expect(owedSkillOfferLevel(ctx, characterOf(ctx))).toBeNull();
    const low = newCtx(seed({ character: [characterRow({ level: 1n })] }));
    expect(owedSkillOfferLevel(low, characterOf(low))).toBeNull();
  });
});

describe('offerNextOwedSkill (WR-B02)', () => {
  it('queues the owed level and returns the created line', () => {
    const ctx = newCtx(seed({ ability_template: [abilityRow({ levelRequired: 3n })] }));
    expect(offerNextOwedSkill(ctx, characterOf(ctx), alice)).toEqual({ kind: 'narrative', text: SKILL_OFFER_MESSAGES.created });
    expect(JSON.parse(rows(ctx, 'llm_job')[0].requestJson).level).toBe('2');
  });

  it('returns null and writes nothing when nothing is owed or an offer is open', () => {
    const none = newCtx(seed({ ability_template: [abilityRow({ id: 1n, levelRequired: 2n }), abilityRow({ id: 2n, levelRequired: 3n })] }));
    expect(offerNextOwedSkill(none, characterOf(none), alice)).toBeNull();
    const open = newCtx(seed({ pending_skill: [pendingRow()] }));
    expect(offerNextOwedSkill(open, characterOf(open), alice)).toBeNull();
    expect(rows(none, 'llm_job')).toHaveLength(0);
    expect(rows(open, 'llm_job')).toHaveLength(0);
  });
});

describe('enqueueSkillOffer', () => {
  it('creates one skill_gen job and one dispatch, with the snapshot the executor decodes', () => {
    const ctx = newCtx(seed({ ability_template: [abilityRow({ levelRequired: 2n })] }));
    const result = enqueueSkillOffer(ctx, characterOf(ctx), alice);
    expect(result.created).toBe(true);

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_task')).toHaveLength(0);
    expect(jobs[0]).toMatchObject({ route: 'skill_gen', characterId: 1n, playerId: alice, status: 'pending' });
    expect(JSON.parse(jobs[0].dedupeKey)).toEqual([alice.toHexString(), 'skill_gen', '1:3']);
    expect(rowColumnProblems('llm_job', jobs[0])).toEqual([]);

    const req = JSON.parse(jobs[0].requestJson);
    expect(req.characterId).toBe('1');
    const input = resolveRouteInput(ctx, jobs[0]) as any;
    expect(input.characterName).toBe('Aldric');
    expect(input.race).toBe('Kobold');
    expect(input.className).toBe('Ashweaver');
    expect(input.level).toBe(3n);
    expect(input.existingAbilities).toEqual([{ name: 'Cinder Cut', kind: 'damage' }]);
    expect(input.archetype).toBe('warrior');
    expect(() => buildRouteLayers('skill_gen', input)).not.toThrow();
  });

  it("takes the archetype from the player's creation state", () => {
    const ctx = newCtx(
      seed({ character_creation_state: [{ id: 1n, playerId: alice, step: 'COMPLETE', archetype: 'mystic', createdAt: { microsSinceUnixEpoch: T0 }, updatedAt: { microsSinceUnixEpoch: T0 } }] }),
    );
    enqueueSkillOffer(ctx, characterOf(ctx), alice);
    const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;
    expect(input.archetype).toBe('mystic');
  });

  it('falls back to Unknown for a missing race or class', () => {
    const ctx = newCtx(seed({ character: [characterRow({ race: undefined, className: undefined })] }));
    enqueueSkillOffer(ctx, characterOf(ctx), alice);
    const input = resolveRouteInput(ctx, rows(ctx, 'llm_job')[0]) as any;
    expect(input.race).toBe('Unknown');
    expect(input.className).toBe('Unknown');
  });
});

describe('requestSkillOffer', () => {
  it('returns the created narrative and writes one job', () => {
    const ctx = newCtx();
    const out = requestSkillOffer(ctx, characterOf(ctx), alice);
    expect(out).toEqual({
      kind: 'narrative',
      text: 'Something stirs within you. The Keeper stirs to present new abilities for your consideration.',
    });
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
  });

  it('answers a second request for the same level with the dedupe line and writes nothing more', () => {
    const ctx = newCtx();
    requestSkillOffer(ctx, characterOf(ctx), alice);
    const out = requestSkillOffer(ctx, characterOf(ctx), alice);
    expect(out).toEqual({ kind: 'system', text: 'The Keeper is already preparing an offering. Once you choose from it, any further offering you are owed follows.' });
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
    expect(rows(ctx, 'llm_player_budget')[0].calls).toBe(1n);
  });

  it('a refused offer (daily cost) creates nothing and says how to ask again', () => {
    const ctx = newCtx();
    ctx.db.llm_player_budget.insert({
      id: 0n,
      playerId: alice,
      dayUtc: utcDay(ctx.timestamp),
      reservedMicroUsd: 0n,
      spentMicroUsd: LLM_PLAYER_DAILY_COST_MICRO_USD,
      calls: 1n,
    });
    const out = requestSkillOffer(ctx, characterOf(ctx), alice);
    expect(out.kind).toBe('system');
    expect(out.text).toBe(llmRefusalMessage('daily_cost') + ' Ask again with [skills] later.');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
    expect(rows(ctx, 'llm_sweep_tick')).toHaveLength(0);
    expect(rows(ctx, 'llm_player_budget')[0].reservedMicroUsd).toBe(0n);
  });

  it('an ineligible character gets the rule line and no writes', () => {
    const ctx = newCtx(seed({ pending_skill: [pendingRow()] }));
    const out = requestSkillOffer(ctx, characterOf(ctx), alice);
    expect(out).toEqual({ kind: 'system', text: 'Your offering awaits your choice.' });
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(0);
  });

  it.each(['failed', 'expired'])('a %s job for the same level does not block a new request', (status) => {
    const ctx = newCtx();
    requestSkillOffer(ctx, characterOf(ctx), alice);
    rows(ctx, 'llm_job')[0].status = status;
    const out = requestSkillOffer(ctx, characterOf(ctx), alice);
    expect(out.kind).toBe('narrative');
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(2);
  });

  it('a completed job that produced no skills (nothing pending, nothing taken) does not block a new request', () => {
    const ctx = newCtx();
    requestSkillOffer(ctx, characterOf(ctx), alice);
    rows(ctx, 'llm_job')[0].status = 'completed';
    expect(requestSkillOffer(ctx, characterOf(ctx), alice).kind).toBe('narrative');
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
  });

  // CR-B02 (deliberate change): one offer at a time. Two jobs for consecutive levels were both
  // billed, and the later apply overwrote the earlier offer, losing an earned level for good.
  it.each(['pending', 'in_flight', 'received'])('a %s skill_gen job for an earlier level blocks a new request (one offer at a time)', (status) => {
    const ctx = newCtx();
    requestSkillOffer(ctx, characterOf(ctx), alice);
    rows(ctx, 'llm_job')[0].status = status;
    ctx.db.character.id.update({ ...characterOf(ctx), level: 4n });
    expect(canRequestSkillOffer(ctx, characterOf(ctx))).toEqual({ ok: false, message: SKILL_OFFER_MESSAGES.duplicate });
    const out = requestSkillOffer(ctx, characterOf(ctx), alice);
    expect(out).toEqual({ kind: 'system', text: SKILL_OFFER_MESSAGES.duplicate });
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
    expect(rows(ctx, 'llm_dispatch')).toHaveLength(1);
  });

  it('an active skill_gen job enqueued by another identity of the same user also blocks', () => {
    const bob = { toHexString: () => 'b'.repeat(64) };
    const ctx = newCtx();
    requestSkillOffer(ctx, characterOf(ctx), alice);
    const out = requestSkillOffer(ctx, characterOf(ctx), bob);
    expect(out).toEqual({ kind: 'system', text: SKILL_OFFER_MESSAGES.duplicate });
    expect(rows(ctx, 'llm_job')).toHaveLength(1);
  });

  it('an active skill_gen job for another character does not block', () => {
    const ctx = newCtx();
    requestSkillOffer(ctx, characterOf(ctx), alice);
    Object.assign(rows(ctx, 'llm_job')[0], { characterId: 2n, dedupeKey: JSON.stringify([alice.toHexString(), 'skill_gen', '2:3']) });
    expect(requestSkillOffer(ctx, characterOf(ctx), alice).kind).toBe('narrative');
    expect(rows(ctx, 'llm_job')).toHaveLength(2);
  });

  it('the job records the level it was queued for', () => {
    const ctx = newCtx();
    requestSkillOffer(ctx, characterOf(ctx), alice);
    expect(JSON.parse(rows(ctx, 'llm_job')[0].requestJson).level).toBe('3');
  });
});
