/**
 * Quick 261008-ag8: a spawn takes the level of its place. Owner bug: Mother Pan Undercroft (region
 * danger 100, levelOffset 4) is a level 4-6 place but only level-1 types are linked to it, so every
 * nearby enemy was level 1. When no type fits the place's band the spawn now takes the place's target
 * level; a type that fits keeps its own level. Since Phase 51.3.1.1 Plan 27 the only spawn path is
 * spawnEnemyWithTemplate (named enemies, World events, quest targets); ordinary creatures are pools.
 * The strict mock db throws on an unknown table or accessor, so the seed lists every table the spawn
 * paths touch.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockCtx } from './test-utils';
import { recordedTable } from './schema_recorder';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

let loc: typeof import('./location');
let rules: typeof import('../data/enemy_rules');

beforeAll(async () => {
  await import('../schema/tables');
  loc = await import('./location');
  rules = await import('../data/enemy_rules');
});

const T0 = 1_700_000_000_000_000n;

const tpl = (id: bigint, level: bigint, name = `Beast ${id}`) => ({
  id,
  name,
  role: 'melee',
  roleDetail: 'melee',
  abilityProfile: 'melee',
  terrainTypes: 'dungeon',
  creatureType: 'beast',
  timeOfDay: 'any',
  socialGroup: name,
  socialRadius: 0n,
  awareness: 'normal',
  groupMin: 1n,
  groupMax: 1n,
  armorClass: level * 2n + 2n,
  level,
  maxHp: level * 12n + 20n,
  baseDamage: level * 3n + 5n,
  xpReward: level * 15n + 10n,
});

const roleFor = (templateId: bigint) => ({
  id: templateId,
  enemyTemplateId: templateId,
  roleKey: 'melee',
  displayName: 'Melee',
  role: 'melee',
  roleDetail: 'melee',
  abilityProfile: 'melee',
});

const spawnRow = (id: bigint, templateId: bigint, extra: Record<string, unknown> = {}) => ({
  id,
  locationId: 5n,
  enemyTemplateId: templateId,
  name: `Beast ${templateId}`,
  state: 'available',
  lockedCombatId: undefined,
  groupCount: 1n,
  ...extra,
});

type SeedOpts = {
  dangerMultiplier?: bigint;
  levelOffset?: bigint;
  extraTemplates?: ReturnType<typeof tpl>[];
  linkExtraTo?: bigint[];
  spawns?: ReturnType<typeof spawnRow>[];
  eventSpawnIds?: bigint[];
  timestampMicros?: bigint;
  withPlayer?: boolean;
};

function build(o: SeedOpts = {}) {
  const templates = [tpl(1n, 1n), tpl(2n, 1n), tpl(3n, 1n), ...(o.extraTemplates ?? [])];
  const links: any[] = [];
  let linkId = 1n;
  for (const t of templates) {
    const isExtra = (o.extraTemplates ?? []).some((e) => e.id === t.id);
    const toPlaces = isExtra ? o.linkExtraTo ?? [5n] : [5n, 6n];
    for (const locationId of toPlaces) {
      links.push({ id: linkId, locationId, enemyTemplateId: t.id });
      linkId += 1n;
    }
  }
  return createMockCtx({
    strict: true,
    timestampMicros: o.timestampMicros ?? T0,
    seed: {
      region: [
        { id: 1n, name: 'Kesterlane Basin', dangerMultiplier: o.dangerMultiplier ?? 100n, regionType: 'wild' },
        { id: 2n, name: 'Deep Hollow', dangerMultiplier: 300n, regionType: 'wild' },
      ],
      location: [
        {
          id: 5n,
          name: 'Mother Pan Undercroft',
          description: 'A cold vault.',
          zone: 'z',
          regionId: 1n,
          levelOffset: o.levelOffset ?? 4n,
          isSafe: false,
          terrainType: 'dungeon',
          bindStone: false,
          craftingAvailable: false,
        },
        {
          id: 6n,
          name: 'Hollow Gate',
          description: 'A gate.',
          zone: 'z',
          regionId: 2n,
          levelOffset: 0n,
          isSafe: false,
          terrainType: 'dungeon',
          bindStone: false,
          craftingAvailable: false,
        },
      ],
      world_state: [{ id: 1n, startingLocationId: 5n, isNight: false, nextTransitionAtMicros: T0 + 10n ** 12n }],
      enemy_template: templates,
      enemy_role_template: templates.map((t) => roleFor(t.id)),
      location_enemy_template: links,
      enemy_spawn: o.spawns ?? [],
      enemy_spawn_member: [],
      event_spawn_enemy: (o.eventSpawnIds ?? []).map((spawnId, i) => ({
        id: BigInt(i + 1),
        eventId: 1n,
        spawnId,
        locationId: 5n,
      })),
      player: o.withPlayer ? [{ id: 1n, activeCharacterId: 1n }] : [],
      character: o.withPlayer ? [{ id: 1n, locationId: 5n, groupId: undefined }] : [],
    },
  });
}

const spawnsAt = (ctx: any, locationId: bigint) =>
  [...ctx.db.enemy_spawn.iter()].filter((r: any) => r.locationId === locationId);

describe('a place no enemy type fits (Mother Pan Undercroft, +4)', () => {
  it('computes a target of 5 and a band of 4-6', () => {
    const ctx = build();
    const target = loc.computeLocationTargetLevel(ctx, 5n, 1n);
    expect(target).toBe(5n);
    expect(rules.placeLevelBand(target, 4n)).toEqual({ min: 4n, max: 6n });
  });

  it('spawnEnemyWithTemplate gives level 5', () => {
    const ctx = build();
    const spawn = loc.spawnEnemyWithTemplate(ctx, 5n, 1n) as any;
    expect(spawn.level).toBe(5n);
  });
});

describe('a type that fits the band keeps its level', () => {
  it('a level 4 type at the +4 place spawns at level 4, not 5', () => {
    const ctx = build({ extraTemplates: [tpl(4n, 4n, 'Vault Warden')], linkExtraTo: [5n] });
    const spawn = loc.spawnEnemyWithTemplate(ctx, 5n, 4n) as any;
    expect(spawn.enemyTemplateId).toBe(4n);
    expect(spawn.level).toBe(4n);
  });

  it('a type at an offset-0 place level spawns at exactly that level', () => {
    // Hollow Gate: region danger 300, offset 0 -> target 3, band 3-3.
    const ctx = build({ extraTemplates: [tpl(5n, 3n, 'Gate Ghoul')], linkExtraTo: [6n] });
    const target = loc.computeLocationTargetLevel(ctx, 6n, 1n);
    expect(target).toBe(3n);
    const spawn = loc.spawnEnemyWithTemplate(ctx, 6n, 5n) as any;
    expect(spawn.enemyTemplateId).toBe(5n);
    expect(spawn.level).toBe(3n);
  });
});

describe('schema: the level columns are additive', () => {
  // Phase 51.3.1.1 appended combat_enemy.poolId and healTargetEnemyId after level (pool_privacy.test.ts).
  it('enemy_spawn and combat_enemy have a defaulted, required u64 level after their old columns and stay public', () => {
    for (const name of ['enemy_spawn', 'combat_enemy']) {
      const rec = recordedTable(name)!;
      const keys = Object.keys(rec.cols);
      expect(keys[name === 'enemy_spawn' ? 7 : 13]).toBe('level');
      expect(rec.cols.level.kind).toBe('u64');
      expect(rec.cols.level.defaulted).toBe(true);
      expect(rec.cols.level.optional).toBe(false);
      expect(rec.opts.public).toBe(true);
    }
  });

  it('pins the full column order of both tables (current columns, then level)', () => {
    expect(Object.keys(recordedTable('enemy_spawn')!.cols)).toEqual([
      'id', 'locationId', 'enemyTemplateId', 'name', 'state', 'lockedCombatId', 'groupCount', 'level',
    ]);
    expect(Object.keys(recordedTable('combat_enemy')!.cols)).toEqual([
      'id', 'combatId', 'spawnId', 'enemyTemplateId', 'enemyRoleTemplateId', 'displayName', 'currentHp',
      'maxHp', 'attackDamage', 'armorClass', 'aggroTargetCharacterId', 'aggroTargetPetId',
      'nextAutoAttackAt', 'level', 'poolId', 'healTargetEnemyId',
    ]);
  });
});
