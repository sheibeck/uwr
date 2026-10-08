/**
 * Quick 261008-e7t (owner 2026-10-08: tap a party member to target them, everywhere). An ally
 * target out of combat goes through the REAL captured use_ability and tick_casts reducers on a
 * strict mock db. Out of combat the ally must be in your party, online, at your place and
 * standing (data/ally_target_rules.ts); anything else is refused with a visible line, and nothing
 * is spent, cooled down or cast.
 *
 * The seed is the shared fight fixture with every combat row removed (peace), and Aldric (1, ALICE)
 * and Brienne (2, BOB) in group 5 at location 10.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { T0, MODULE, ALICE, fightSeed, fightCtx, rows } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['use_ability', 'tick_casts']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: the schema recorder could not capture it.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const events = (ctx: any, characterId: bigint) =>
  rows(ctx, 'event_private').filter((e: any) => e.characterId === characterId);
const lines = (ctx: any, characterId: bigint, pattern: RegExp) =>
  events(ctx, characterId).filter((e: any) => pattern.test(e.message));
const charRow = (ctx: any, id: bigint) => rows(ctx, 'character').find((c: any) => c.id === id);

const ability = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  characterId: 1n,
  name: 'Mend',
  description: 'Closes wounds.',
  kind: 'heal',
  targetRule: 'single_ally',
  resourceType: 'stamina',
  resourceCost: 5n,
  castSeconds: 0n,
  cooldownSeconds: 6n,
  scaling: 'wis',
  value1: 10n,
  value2: undefined,
  damageType: undefined,
  effectType: undefined,
  effectMagnitude: undefined,
  effectDuration: undefined,
  levelRequired: 1n,
  isGenerated: false,
  ...over,
});

const COMBAT_TABLES = ['combat_encounter', 'combat_participant', 'combat_enemy', 'aggro_entry', 'combat_round', 'round_timer_tick'];

/** Peace: no fight, both characters in group 5 at location 10; Brienne at 50 of 100 HP. */
function peaceSeed(brienne: Record<string, unknown> = {}): Record<string, any[]> {
  const seed = fightSeed({ players: 2 });
  for (const table of COMBAT_TABLES) seed[table] = [];
  seed.enemy_spawn = [];
  seed.character = seed.character.map((c: any) => {
    const base = { ...c, groupId: 5n, combatTargetEnemyId: undefined };
    return c.id === 2n ? { ...base, hp: 50n, maxHp: 100n, ...brienne } : { ...base, hp: 100n, maxHp: 100n };
  });
  seed.location = [
    ...seed.location,
    { id: 11n, name: 'The Far Field', description: 'Open ground.', zone: 'z', regionId: 1n },
  ];
  seed.group = [{ id: 5n, name: "Aldric's group", leaderCharacterId: 1n, pullerCharacterId: 1n, createdAt: { microsSinceUnixEpoch: T0 } }];
  seed.group_member = [
    { id: 1n, groupId: 5n, characterId: 1n, ownerUserId: 7n, role: 'leader', followLeader: true, joinedAt: { microsSinceUnixEpoch: T0 } },
    { id: 2n, groupId: 5n, characterId: 2n, ownerUserId: 8n, role: 'member', followLeader: true, joinedAt: { microsSinceUnixEpoch: T0 } },
  ];
  seed.ability_template = [ability(), ability({ id: 2n, name: 'Greater Mend', resourceType: 'mana' })];
  seed.ability_cooldown = [];
  seed.character_cast = [];
  return seed;
}

function peaceCtx(brienne: Record<string, unknown> = {}): any {
  return fightCtx(peaceSeed(brienne), ALICE);
}

const refusals = /^(That target is not in your party\.|Brienne is offline\.|Brienne is not here\.|Brienne has fallen\.)$/;

describe('use_ability with an out-of-combat ally target (owner 2026-10-08)', () => {
  it('a party member who is online, here and standing is healed, with the use line and a cooldown', () => {
    const ctx = peaceCtx();
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n, targetCharacterId: 2n });
    expect(charRow(ctx, 2n).hp > 50n).toBe(true);
    expect(lines(ctx, 1n, /^You use Mend on Brienne\.$/)).toHaveLength(1);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(1);
    expect(lines(ctx, 1n, refusals)).toHaveLength(0);
  });

  /** One refusal: exactly one matching line, no use line, nothing spent, no cooldown, no cast. */
  function expectRefused(brienne: Record<string, unknown>, targetId: bigint, line: RegExp) {
    const ctx = peaceCtx(brienne);
    const hpBefore = charRow(ctx, 2n).hp;
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n, targetCharacterId: targetId });
    expect(lines(ctx, 1n, line)).toHaveLength(1);
    expect(lines(ctx, 1n, refusals)).toHaveLength(1);
    expect(lines(ctx, 1n, /^You use /)).toHaveLength(0);
    expect(charRow(ctx, 2n).hp).toBe(hpBefore);
    expect(charRow(ctx, 1n).stamina).toBe(50n);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(0);
    expect(rows(ctx, 'character_cast')).toHaveLength(0);
  }

  it('refuses a target in another party with the nameless party line', () => {
    expectRefused({ groupId: 6n }, 2n, /^That target is not in your party\.$/);
  });

  it('refuses an offline target', () => {
    expectRefused({ online: false }, 2n, /^Brienne is offline\.$/);
  });

  it('refuses a target at another place', () => {
    expectRefused({ locationId: 11n }, 2n, /^Brienne is not here\.$/);
  });

  it('refuses a fallen target', () => {
    expectRefused({ hp: 0n }, 2n, /^Brienne has fallen\.$/);
  });

  it('refuses an unknown id with the nameless party line', () => {
    expectRefused({}, 404n, /^That target is not in your party\.$/);
  });

  it('a fallen target stays at 0 HP (no raise without the corpse flow)', () => {
    const ctx = peaceCtx({ hp: 0n });
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n, targetCharacterId: 2n });
    expect(charRow(ctx, 2n).hp).toBe(0n);
  });

  it('a mana ability (cast path) is refused before the cast starts', () => {
    const ctx = peaceCtx({ locationId: 11n });
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 2n, targetCharacterId: 2n });
    expect(lines(ctx, 1n, /^Brienne is not here\.$/)).toHaveLength(1);
    expect(lines(ctx, 1n, /^Casting /)).toHaveLength(0);
    expect(rows(ctx, 'character_cast')).toHaveLength(0);
  });

  it('targeting yourself by id is no refusal: the ability resolves', () => {
    const ctx = peaceCtx();
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n, targetCharacterId: 1n });
    expect(lines(ctx, 1n, refusals)).toHaveLength(0);
    expect(lines(ctx, 1n, /^You use Mend on Aldric\.$/)).toHaveLength(1);
    expect(rows(ctx, 'ability_cooldown')).toHaveLength(1);
  });

  it('no target id: unchanged, on yourself', () => {
    const ctx = peaceCtx();
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 1n });
    expect(lines(ctx, 1n, refusals)).toHaveLength(0);
    expect(lines(ctx, 1n, /^You use Mend on yourself\.$/)).toHaveLength(1);
  });
});

describe('tick_casts re-checks an out-of-combat ally target when the cast completes', () => {
  function startCast(ctx: any) {
    handlers.use_ability(ctx, { characterId: 1n, abilityTemplateId: 2n, targetCharacterId: 2n });
    const casts = rows(ctx, 'character_cast');
    expect(casts).toHaveLength(1);
    expect(casts[0].targetCharacterId).toBe(2n);
    expect(lines(ctx, 1n, /^Casting Greater Mend\.\.\.$/)).toHaveLength(1);
    return casts[0];
  }
  function tick(ctx: any, atMicros: bigint) {
    ctx.timestamp = { microsSinceUnixEpoch: atMicros };
    const sender = ctx.sender;
    ctx.sender = MODULE;
    handlers.tick_casts(ctx, { arg: { scheduledId: 1n } });
    ctx.sender = sender;
  }

  it('a target who walked away is refused: one line, no heal, the cast row gone, no cooldown', () => {
    const ctx = peaceCtx();
    const cast = startCast(ctx);
    const brienne = charRow(ctx, 2n);
    brienne.locationId = 11n;
    tick(ctx, cast.endsAtMicros);
    expect(lines(ctx, 1n, /^Brienne is not here\.$/)).toHaveLength(1);
    expect(charRow(ctx, 2n).hp).toBe(50n);
    expect(rows(ctx, 'character_cast')).toHaveLength(0);
    expect(rows(ctx, 'ability_cooldown').filter((r: any) => r.abilityTemplateId === 2n)).toHaveLength(0);
  });

  it('a target who stayed is healed when the cast completes', () => {
    const ctx = peaceCtx();
    const cast = startCast(ctx);
    tick(ctx, cast.endsAtMicros);
    expect(charRow(ctx, 2n).hp > 50n).toBe(true);
    expect(rows(ctx, 'character_cast')).toHaveLength(0);
    expect(lines(ctx, 1n, refusals)).toHaveLength(0);
  });
});
