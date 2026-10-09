/**
 * The dead act only to respawn, take or refuse a resurrection, and talk (owner, 2026-10-09: "the game
 * let me pull while I was dead. And it let me gather while I was dead ... Respawning should be the
 * only action you can take." and "Or, if someone ressurects you of course"). Every in-world reducer
 * refuses a dead character with a visible private line (the death prompt, or DEAD_IN_FIGHT while the
 * fight that killed him goes on) and changes nothing. Real handlers on the strict mock db; no model
 * call is reachable. A source scan keeps every guarded reducer guarded.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { DEAD_IN_FIGHT } from '../data/death_lines';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};
const NAMES = [
  'submit_intent',
  'pull_family',
  'gather_pool',
  'move_character',
  'take_loot',
  'use_ability',
  'bind_location',
  'accept_resurrect',
  'say',
];

beforeAll(async () => {
  await import('../index');
  for (const name of NAMES) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') throw new Error(`capturedReducer('${name}') is not a function`);
    handlers[name] = h;
  }
}, 120_000);

const character = (over: Record<string, unknown> = {}) => ({
  id: 1n,
  ownerUserId: 7n,
  name: 'Elfansworth',
  level: 3n,
  locationId: 5n,
  boundLocationId: 6n,
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
  online: true,
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
      place_pool: [
        { id: 20n, locationId: 5n, kind: 'creature', name: 'Salt Wolves' },
        { id: 21n, locationId: 5n, kind: 'resource', name: 'Brine Reeds' },
      ],
      item_template: [{ id: 30n, name: 'Wolf Pelt', slot: 'resource', stackable: true }],
      combat_loot: [{ id: 31n, characterId: 1n, ownerUserId: 7n, itemTemplateId: 30n }],
      ability_template: [{ id: 40n, characterId: 1n, name: 'Ember Lash', kind: 'damage', castSeconds: 0n }],
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
  combat_encounter: [{ id: 9n, state: 'active', locationId: 5n }],
  combat_participant: [{ id: 1n, combatId: 9n, characterId: 1n, status: 'dead' }],
};

/** Every table but the ones named, as text (bigint-safe), to prove nothing else moved. */
const snapshot = (ctx: any, except: string[]): string => {
  const tables = ctx.db._tables as Record<string, any[]>;
  const kept = Object.keys(tables)
    .filter((name) => !except.includes(name) && (tables[name]?.length ?? 0) > 0)
    .sort()
    .map((name) => [name, tables[name]]);
  return JSON.stringify(kept, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
};

const REDUCER_CALLS: Array<[string, Record<string, unknown>]> = [
  ['pull_family', { characterId: 1n, poolId: 20n }],
  ['gather_pool', { characterId: 1n, poolId: 21n }],
  ['move_character', { characterId: 1n, locationId: 6n }],
  ['take_loot', { characterId: 1n, lootId: 31n }],
  ['use_ability', { characterId: 1n, abilityTemplateId: 40n, targetCharacterId: undefined }],
  ['bind_location', { characterId: 1n }],
];

describe('a dead character cannot act', () => {
  for (const [name, args] of REDUCER_CALLS) {
    it(`${name} changes nothing and gives the death prompt`, () => {
      const ctx = newCtx();
      const before = snapshot(ctx, ['event_private']);
      handlers[name](ctx, args);
      expect(snapshot(ctx, ['event_private'])).toBe(before);
      expect(me(ctx)).toMatchObject({ hp: 0n, locationId: 5n, boundLocationId: 6n });
      expect(prompts(ctx)).toHaveLength(1);
      expect(lines(ctx)).toHaveLength(1);
    });

    it(`${name} says the fight goes on without him while it does`, () => {
      const ctx = newCtx(inCombat);
      const before = snapshot(ctx, ['event_private']);
      handlers[name](ctx, args);
      expect(snapshot(ctx, ['event_private'])).toBe(before);
      expect(lines(ctx)).toEqual([DEAD_IN_FIGHT]);
    });
  }

  for (const text of ['travel', 'camp', 'pull salt wolves', 'gather brine reeds', 'go yard', 'explore', 'bind']) {
    it(`the typed "${text}" changes nothing and gives the death prompt`, () => {
      const ctx = newCtx();
      const before = snapshot(ctx, ['event_private', 'player']);
      handlers.submit_intent(ctx, { characterId: 1n, text });
      expect(snapshot(ctx, ['event_private', 'player'])).toBe(before);
      expect(prompts(ctx)).toHaveLength(1);
      expect(lines(ctx)).toHaveLength(1);
    });
  }

  it('a typed action mid-fight gets DEAD_IN_FIGHT', () => {
    const ctx = newCtx(inCombat);
    handlers.submit_intent(ctx, { characterId: 1n, text: 'camp' });
    expect(lines(ctx)).toEqual([DEAD_IN_FIGHT]);
  });
});

describe('what the dead may still do', () => {
  it('help and look answer as before, with no death prompt', () => {
    const ctx = newCtx();
    handlers.submit_intent(ctx, { characterId: 1n, text: 'help' });
    handlers.submit_intent(ctx, { characterId: 1n, text: 'look' });
    expect(prompts(ctx)).toEqual([]);
    expect(lines(ctx).some((m) => m.startsWith('Commands:'))).toBe(true);
    expect(table(ctx, 'event_private').some((r) => r.kind === 'look')).toBe(true);
  });

  it('say works, typed or through the say reducer', () => {
    const ctx = newCtx();
    handlers.submit_intent(ctx, { characterId: 1n, text: 'say someone help' });
    handlers.say(ctx, { characterId: 1n, message: 'anyone?' });
    const said = table(ctx, 'event_location').map((r) => r.message);
    expect(said).toContain('Elfansworth says, "someone help"');
    expect(said.some((m) => m.includes('anyone?'))).toBe(true);
    expect(prompts(ctx)).toEqual([]);
  });

  it('respawn still brings him back', () => {
    const ctx = newCtx();
    handlers.submit_intent(ctx, { characterId: 1n, text: 'respawn' });
    expect(me(ctx)).toMatchObject({ hp: 1n, locationId: 6n });
  });

  it('accepting a resurrection still works: the caster starts casting', () => {
    const ctx = newCtx({
      character: [character(), character({ id: 2n, ownerUserId: 8n, name: 'Mender', hp: 20n, mana: 100n })],
      corpse: [{ id: 50n, characterId: 1n, locationId: 5n }],
      pending_spell_cast: [
        {
          id: 60n,
          spellType: 'resurrect',
          casterCharacterId: 2n,
          targetCharacterId: 1n,
          corpseId: 50n,
          createdAtMicros: T0,
        },
      ],
    });
    handlers.accept_resurrect(ctx, { characterId: 1n, pendingId: 60n });
    expect(table(ctx, 'pending_spell_cast')).toEqual([]);
    expect(table(ctx, 'character_cast')).toEqual([
      expect.objectContaining({ characterId: 2n, targetCharacterId: 1n }),
    ]);
    expect(table(ctx, 'character').find((c) => c.id === 2n).mana).toBe(50n);
    expect(prompts(ctx)).toEqual([]);
  });
});

describe('a living character is unaffected', () => {
  it('binds as before', () => {
    const ctx = newCtx({ character: [character({ hp: 12n })] });
    handlers.bind_location(ctx, { characterId: 1n });
    expect(me(ctx).boundLocationId).toBe(5n);
    expect(prompts(ctx)).toEqual([]);
    expect(lines(ctx)).not.toContain(DEAD_IN_FIGHT);
  });
});

// ---------------------------------------------------------------------------------------------------
// Source scan: every in-world reducer refuses the dead before its first write.
// ---------------------------------------------------------------------------------------------------

const SRC = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(`${SRC}/${rel}`, 'utf8');

const GUARDED: Record<string, string[]> = {
  'index.ts': ['request_skill_offer', 'choose_skill', 'apply_level_up'],
  'reducers/world_events.ts': ['collect_event_item'],
  'reducers/quests.ts': ['loot_quest_item', 'pull_named_enemy', 'turn_in_quest'],
  'reducers/pools.ts': ['pull_family', 'gather_pool'],
  'reducers/npc_interaction.ts': ['talk_to_npc', 'give_gift_to_npc'],
  'reducers/movement.ts': ['move_character'],
  'reducers/items_trading.ts': ['start_trade', 'add_trade_item', 'offer_trade'],
  'reducers/items_crafting.ts': ['research_recipes', 'craft_recipe', 'craft_recipe_count', 'learn_recipe_scroll', 'salvage_item'],
  'reducers/items.ts': [
    'buy_item', 'buy_listing', 'sell_item', 'sell_item_quantity', 'buyback_last_sale', 'sell_all_junk',
    'take_loot', 'take_all_loot', 'equip_item', 'unequip_item', 'use_ability', 'use_item',
  ],
  'reducers/hunger.ts': ['eat_food'],
  'reducers/corpse.ts': ['loot_corpse_item', 'loot_all_corpse', 'initiate_resurrect', 'initiate_corpse_summon'],
  'reducers/commands.ts': ['hail_npc'],
  'reducers/combat.ts': ['start_combat', 'set_combat_target'],
  'reducers/characters.ts': ['bind_location'],
  'reducers/bank.ts': ['deposit_to_bank', 'withdraw_from_bank'],
  'reducers/renown.ts': ['choose_perk', 'choose_renown_perk'],
};

/** Reducers the dead keep (respawn, resurrection answers, talk, housekeeping): never guarded. */
const OPEN: Record<string, string[]> = {
  'reducers/corpse.ts': ['accept_resurrect', 'decline_resurrect', 'accept_corpse_summon', 'decline_corpse_summon'],
  'reducers/commands.ts': ['say'],
  'reducers/characters.ts': ['respawn_character'],
};

/** A handler that only forwards to a shared body is checked in that body. */
const DELEGATES: Record<string, string> = {
  craft_recipe: 'craftBatch',
  craft_recipe_count: 'craftBatch',
  sell_item: 'sellFromBag',
  sell_item_quantity: 'sellFromBag',
};

function handlerText(source: string, name: string): string {
  const def = new RegExp(`reducer\\(\\s*'${name}'`).exec(source);
  if (!def) throw new Error(`reducer '${name}' not found`);
  const rest = source.slice(def.index + 1);
  const next = rest.search(/spacetimedb\.reducer\(|scheduledReducers\[/);
  return next < 0 ? rest : rest.slice(0, next);
}

function delegateText(source: string, fn: string): string {
  const start = source.indexOf(`const ${fn} = (`);
  if (start < 0) throw new Error(`delegate ${fn} not found`);
  const end = source.indexOf('\n  };', start);
  return source.slice(start, end < 0 ? undefined : end);
}

describe('every in-world reducer refuses the dead (source scan)', () => {
  for (const [file, names] of Object.entries(GUARDED)) {
    const source = read(file);
    for (const name of names) {
      it(`${name} calls refuseWhileDead before its first write`, () => {
        let body = handlerText(source, name);
        const delegate = DELEGATES[name];
        if (delegate) {
          expect(body).toContain(`${delegate}(`);
          body = delegateText(source, delegate);
        }
        const guard = body.indexOf('if (refuseWhileDead(ctx, ');
        expect(guard, `${name} has no refuseWhileDead guard`).toBeGreaterThan(-1);
        const firstWrite = body.search(/\.(insert|update|delete)\(/);
        if (firstWrite >= 0) expect(guard).toBeLessThan(firstWrite);
      });
    }
  }

  for (const [file, names] of Object.entries(OPEN)) {
    const source = read(file);
    for (const name of names) {
      it(`${name} stays open to the dead`, () => {
        expect(handlerText(source, name)).not.toContain('refuseWhileDead');
      });
    }
  }

  it('submit_intent gates the dead with the allow-list right after respawn', () => {
    const body = handlerText(read('reducers/intent.ts'), 'submit_intent');
    const respawn = body.indexOf('respawnDeadCharacter(ctx, character)');
    const gate = body.indexOf('!allowedWhileDead(lower)');
    const help = body.indexOf("lower === 'help'");
    expect(respawn).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(respawn);
    expect(gate).toBeLessThan(help);
  });
});
