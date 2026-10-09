/**
 * The respawn placeholder (owner, 2026-10-09): nothing respawns on its own and the old death modal is
 * gone, so a dead character gets a death prompt with a clickable [respawn], the typed command brings
 * him back at his bind point, and coming back in dead prompts again. Real handlers on the strict mock
 * db; no model call is reachable.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { DEATH_LINE_OPENINGS, RESPAWN_IN_COMBAT, RESPAWN_NOT_DEAD } from '../data/death_lines';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let submitIntent: (...args: any[]) => any;
let respawnCharacter: (...args: any[]) => any;
let setActiveCharacter: (...args: any[]) => any;
let promptRespawnIfDead: typeof import('../helpers/character').promptRespawnIfDead;
let applyDeathPenalties: typeof import('../helpers/combat_rewards').applyDeathPenalties;

beforeAll(async () => {
  await import('../index');
  const grab = (name: string) => {
    const h = capturedReducer(name);
    if (typeof h !== 'function') throw new Error(`capturedReducer('${name}') is not a function`);
    return h;
  };
  submitIntent = grab('submit_intent');
  respawnCharacter = grab('respawn_character');
  setActiveCharacter = grab('set_active_character');
  promptRespawnIfDead = (await import('../helpers/character')).promptRespawnIfDead;
  applyDeathPenalties = (await import('../helpers/combat_rewards')).applyDeathPenalties;
}, 120_000);

const character = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Elfansworth',
  level: 3n,
  locationId: 6n,
  boundLocationId: 5n,
  stamina: 0n,
  maxStamina: 50n,
  hp: 0n,
  maxHp: 20n,
  mana: 0n,
  maxMana: 30n,
  perception: 100n,
  str: 10n,
  dex: 10n,
  cha: 10n,
  wis: 10n,
  int: 10n,
  ...over,
});

const place = (id: bigint, name: string) => ({
  id,
  name,
  description: `${name} lies here.`,
  regionId: 1n,
  isSafe: true,
  bindStone: id === 5n,
  craftingAvailable: false,
  terrainType: 'plains',
  levelOffset: 0n,
});

function newCtx(seed: Record<string, any[]> = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [character()],
      region: [{ id: 1n, name: 'Kestrane Saltpans', dangerMultiplier: 400n }],
      location: [place(5n, 'Last Lantern Camp'), place(6n, "Brinewright's Yard")],
      location_connection: [
        { id: 1n, fromLocationId: 5n, toLocationId: 6n },
        { id: 2n, fromLocationId: 6n, toLocationId: 5n },
      ],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 3_600_000_000n }],
      ...seed,
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const table = (ctx: any, name: string): any[] => ctx.db._tables[name] ?? [];
const me = (ctx: any) => table(ctx, 'character').find((c) => c.id === 1n);
const lines = (ctx: any): string[] => table(ctx, 'event_private').map((r) => r.message);
const prompts = (ctx: any): string[] => lines(ctx).filter((m) => m.includes('Type [respawn] to awaken at'));
const inCombat = {
  combat_encounter: [{ id: 9n, state: 'active', locationId: 6n }],
  combat_participant: [{ id: 1n, combatId: 9n, characterId: 1n, status: 'dead' }],
};

describe('the typed respawn command', () => {
  it('brings a dead character back at his bind point with 1 hp, mana and stamina', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: 'respawn' });
    expect(me(ctx)).toMatchObject({ locationId: 5n, hp: 1n, mana: 1n, stamina: 1n });
    expect(lines(ctx)).toContain('You awaken at Last Lantern Camp, shaken but alive.');
  });

  it('is case-insensitive and trims (the [respawn] link sends the bare word)', () => {
    const ctx = newCtx();
    submitIntent(ctx, { characterId: 1n, text: '  Respawn ' });
    expect(me(ctx).hp).toBe(1n);
  });

  it('wakes him where he fell when he never bound', () => {
    const ctx = newCtx({ character: [character({ boundLocationId: undefined })] });
    submitIntent(ctx, { characterId: 1n, text: 'respawn' });
    expect(me(ctx)).toMatchObject({ locationId: 6n, hp: 1n });
  });

  it('refuses a living character and changes nothing', () => {
    const ctx = newCtx({ character: [character({ hp: 12n })] });
    submitIntent(ctx, { characterId: 1n, text: 'respawn' });
    expect(me(ctx)).toMatchObject({ locationId: 6n, hp: 12n });
    expect(lines(ctx)).toContain(RESPAWN_NOT_DEAD);
  });

  it('refuses while the fight that killed him is still going', () => {
    const ctx = newCtx(inCombat);
    submitIntent(ctx, { characterId: 1n, text: 'respawn' });
    expect(me(ctx)).toMatchObject({ locationId: 6n, hp: 0n });
    expect(lines(ctx)).toContain(RESPAWN_IN_COMBAT);
  });

  it('the respawn_character reducer takes the same path', () => {
    const ctx = newCtx();
    respawnCharacter(ctx, { characterId: 1n });
    expect(me(ctx)).toMatchObject({ locationId: 5n, hp: 1n });
  });
});

describe('the death prompt', () => {
  it('names the bind point and carries [respawn] after a sarcastic opening', () => {
    const ctx = newCtx();
    expect(promptRespawnIfDead(ctx, me(ctx))).toBe(true);
    const [line] = prompts(ctx);
    expect(line).toMatch(/Type \[respawn\] to awaken at Last Lantern Camp\.$/);
    expect(DEATH_LINE_OPENINGS.some((opening) => line.startsWith(opening))).toBe(true);
  });

  it('is not written for a living character or mid-fight', () => {
    const alive = newCtx({ character: [character({ hp: 5n })] });
    expect(promptRespawnIfDead(alive, me(alive))).toBe(false);
    const fighting = newCtx(inCombat);
    expect(promptRespawnIfDead(fighting, me(fighting))).toBe(false);
    expect(prompts(alive)).toEqual([]);
    expect(prompts(fighting)).toEqual([]);
  });

  it('comes again when he is chosen while dead (logging back in)', () => {
    const ctx = newCtx({ player: [{ id: alice, userId: 7n, activeCharacterId: undefined }] });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(prompts(ctx)).toHaveLength(1);
  });

  it('does not come when he is chosen alive', () => {
    const ctx = newCtx({
      player: [{ id: alice, userId: 7n, activeCharacterId: undefined }],
      character: [character({ hp: 20n })],
    });
    setActiveCharacter(ctx, { characterId: 1n });
    expect(prompts(ctx)).toEqual([]);
  });

  it('comes at the end of a fight for each fallen fighter, after the XP loss line', () => {
    const ctx = newCtx({ character: [character(), character({ id: 2n, ownerUserId: 8n, name: 'Other', hp: 9n })] });
    const deps = { applyDeathXpPenalty: () => 12n };
    const append = (c: any, characterId: bigint, owner: bigint, kind: string, message: string) =>
      c.db.event_private.insert({ id: 0n, ownerUserId: owner, characterId, kind, message, createdAt: c.timestamp });
    applyDeathPenalties(ctx, deps, [{ characterId: 1n }, { characterId: 2n }], append);
    const mine = table(ctx, 'event_private').filter((r) => r.characterId === 1n).map((r) => r.message);
    expect(mine[0]).toBe('You lose 12 XP from the defeat.');
    expect(mine[1]).toMatch(/Type \[respawn\] to awaken at Last Lantern Camp\.$/);
    expect(table(ctx, 'event_private').filter((r) => r.characterId === 2n)).toEqual([]);
  });
});
