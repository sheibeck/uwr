/**
 * TEST-ONLY. Never import this module from production code (anything the `spacetime build`
 * bundler can reach). It must not import vitest.
 *
 * The seeded fight and helpers shared by the Phase 46.1 round-engine integration tests
 * (combat_rounds.integration.test.ts, combat_round_clock.invariant.test.ts and the later plans
 * that extend them). One fight (combat 1) at location 10 between ALICE's character 1 (and
 * optionally BOB's character 2) and the listed enemies, in the shape the real tables hold it.
 */
import { createMockCtx } from './test-utils';

/** The shared test clock: 2023-11-14T22:13:20Z in microseconds. */
export const T0 = 1_700_000_000_000_000n;

/** The module identity (equal to createMockCtx's default databaseIdentity). */
export const MODULE = { toHexString: () => 'module-identity-hex' };
/** Owns character 1 (userId 7n). */
export const ALICE = { toHexString: () => 'a'.repeat(64) };
/** Owns character 2 (userId 8n). */
export const BOB = { toHexString: () => 'b'.repeat(64) };

export type FightEnemy = {
  id: bigint;
  name: string;
  hp: bigint;
  maxHp?: bigint;
  attackDamage?: bigint;
};

export type FightSeedOptions = {
  players?: 1 | 2;
  enemies?: FightEnemy[];
  playerHp?: bigint;
  withOpenRound?: boolean;
  /** Extra rows, appended to (never replacing) the table rows built here. */
  extra?: Record<string, any[]>;
};

const DEFAULT_ENEMIES: FightEnemy[] = [{ id: 1n, name: 'Cave Rat', hp: 40n }];

function characterRow(id: bigint, ownerUserId: bigint, name: string, hp: bigint, targetEnemyId?: bigint) {
  return {
    id,
    ownerUserId,
    name,
    race: 'Human',
    className: 'Warrior',
    level: 1n,
    xp: 0n,
    gold: 0n,
    locationId: 10n,
    boundLocationId: 10n,
    groupId: undefined,
    hp,
    maxHp: hp > 100n ? hp : 100n,
    mana: 50n,
    maxMana: 50n,
    stamina: 50n,
    maxStamina: 50n,
    str: 10n,
    dex: 10n,
    cha: 10n,
    wis: 10n,
    int: 10n,
    hitChance: 0n,
    dodgeChance: 0n,
    parryChance: 0n,
    critMelee: 0n,
    critRanged: 0n,
    critDivine: 0n,
    critArcane: 0n,
    armorClass: 0n,
    perception: 0n,
    search: 0n,
    ccPower: 0n,
    vendorBuyMod: 0n,
    vendorSellMod: 0n,
    createdAt: { microsSinceUnixEpoch: T0 },
    combatTargetEnemyId: targetEnemyId,
    pendingLevels: 0n,
  };
}

function worldRows(): Record<string, any[]> {
  return {
    region: [
      {
        id: 1n,
        name: 'Ashen Reach',
        dangerMultiplier: 100n,
        regionType: 'wild',
        biome: 'volcanic',
        landmarks: '[]',
        threats: '[]',
      },
    ],
    location: [{ id: 10n, name: 'The Crossing', description: 'A crossroads.', zone: 'z', regionId: 1n }],
    enemy_template: [
      {
        id: 1n,
        name: 'Cave Rat',
        role: 'damage',
        roleDetail: '',
        abilityProfile: '',
        terrainTypes: 'plains',
        creatureType: 'beast',
        timeOfDay: 'any',
        socialGroup: '',
        socialRadius: 0n,
        awareness: 'normal',
        groupMin: 1n,
        groupMax: 1n,
        armorClass: 0n,
        level: 1n,
        maxHp: 40n,
        baseDamage: 5n,
        xpReward: 10n,
      },
    ],
  };
}

function playerRows(players: 1 | 2): Record<string, any[]> {
  const rows = [{ id: ALICE, userId: 7n, activeCharacterId: 1n }];
  if (players === 2) rows.push({ id: BOB, userId: 8n, activeCharacterId: 2n } as any);
  return { player: rows };
}

/**
 * A fight that is already running (combat 1, state 'active'). With `withOpenRound` it also has
 * round 1 open for choices (deadline T0 + 10 s) and its tick; without it the fight looks like one
 * that was running on the old per-second loop when the module was published.
 */
export function fightSeed(opts: FightSeedOptions = {}): Record<string, any[]> {
  const players = opts.players ?? 1;
  const enemies = opts.enemies ?? DEFAULT_ENEMIES;
  const playerHp = opts.playerHp ?? 10_000n;
  const firstEnemy = enemies[0];
  // Two-player fights are seeded characters 2 then 1, so id ordering is proven, not assumed.
  const characters = [characterRow(1n, 7n, 'Aldric', playerHp, firstEnemy?.id)];
  if (players === 2) characters.unshift(characterRow(2n, 8n, 'Brienne', playerHp, firstEnemy?.id));
  const participantIds = players === 2 ? [2n, 1n] : [1n];

  const seed: Record<string, any[]> = {
    ...playerRows(players),
    ...worldRows(),
    character: characters,
    enemy_spawn: [
      { id: 1n, locationId: 10n, enemyTemplateId: 1n, name: 'Cave Rat', state: 'engaged', lockedCombatId: 1n, groupCount: 0n },
    ],
    combat_encounter: [
      {
        id: 1n,
        locationId: 10n,
        groupId: undefined,
        leaderCharacterId: undefined,
        state: 'active',
        addCount: 0n,
        pendingAddCount: 0n,
        pendingAddAtMicros: undefined,
        createdAt: { microsSinceUnixEpoch: T0 },
      },
    ],
    combat_participant: participantIds.map((characterId, i) => ({
      id: BigInt(i + 1),
      combatId: 1n,
      characterId,
      status: 'active',
      nextAutoAttackAt: 0n,
    })),
    combat_enemy: enemies.map((e) => ({
      id: e.id,
      combatId: 1n,
      spawnId: 1n,
      enemyTemplateId: 1n,
      enemyRoleTemplateId: undefined,
      displayName: e.name,
      currentHp: e.hp,
      maxHp: e.maxHp ?? (e.hp > 40n ? e.hp : 40n),
      attackDamage: e.attackDamage ?? 5n,
      armorClass: 0n,
      aggroTargetCharacterId: undefined,
      aggroTargetPetId: undefined,
      nextAutoAttackAt: 0n,
    })),
    aggro_entry: [] as any[],
  };

  let aggroId = 1n;
  for (const enemy of enemies) {
    for (const characterId of participantIds) {
      seed.aggro_entry.push({ id: aggroId++, combatId: 1n, enemyId: enemy.id, characterId, petId: undefined, value: 0n });
    }
  }

  if (opts.withOpenRound) {
    seed.combat_round = [
      {
        id: 1n,
        combatId: 1n,
        roundNumber: 1n,
        state: 'action_select',
        timerExpiresAtMicros: T0 + 10_000_000n,
        narrationCount: 0n,
        startedAtMicros: T0,
      },
    ];
    seed.round_timer_tick = [
      { scheduledId: 1n, scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: T0 + 10_000_000n } }, combatId: 1n, roundNumber: 1n },
    ];
  }

  for (const [table, extraRows] of Object.entries(opts.extra ?? {})) {
    seed[table] = [...(seed[table] ?? []), ...extraRows];
  }
  return seed;
}

/**
 * No fight yet: ALICE's character 1 at location 10 and one available spawn (enemy_spawn 1), ready
 * for the start_combat reducer.
 */
export function startSeed(extra: Record<string, any[]> = {}): Record<string, any[]> {
  const seed: Record<string, any[]> = {
    ...playerRows(1),
    ...worldRows(),
    character: [characterRow(1n, 7n, 'Aldric', 10_000n)],
    enemy_spawn: [
      { id: 1n, locationId: 10n, enemyTemplateId: 1n, name: 'Cave Rat', state: 'available', lockedCombatId: undefined, groupCount: 1n },
    ],
  };
  for (const [table, rowsToAdd] of Object.entries(extra)) {
    seed[table] = [...(seed[table] ?? []), ...rowsToAdd];
  }
  return seed;
}

/** A strict mock ctx (unknown tables and index accessors throw) with the module identity set. */
export function fightCtx(seed: Record<string, any[]>, sender: any = MODULE, timestampMicros: bigint = T0): any {
  return createMockCtx({ strict: true, seed, sender, databaseIdentity: MODULE, timestampMicros });
}

export function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

/** The pending round_timer_tick row of the fight, as the `{ arg }` the scheduler hands the reducer. */
export function openTickArg(ctx: any, combatId: bigint = 1n): { arg: any } {
  const ticks = rows(ctx, 'round_timer_tick').filter((r: any) => r.combatId === combatId);
  if (ticks.length === 0) throw new Error(`no round_timer_tick for combat ${combatId}`);
  return { arg: { ...ticks[ticks.length - 1] } };
}
