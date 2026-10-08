/**
 * Quick 261008-ag8: a spawn fights at the level of its place. The REAL captured reducers
 * (start_combat, resolve_round_timer) on a strict mock db prove that fight-start stats and victory
 * XP follow the spawn level; the look, examine and attack-prompt readers show it; and a source
 * scan pins that every enemy_spawn and combat_enemy insert writes a level.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync, readdirSync, statSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { capturedReducer } from '../helpers/schema_recorder';
import {
  T0,
  MODULE,
  ALICE,
  fightSeed,
  startSeed,
  fightCtx,
  rows,
  openTickArg,
} from '../helpers/combat_fight_fixture';
import { createMockDb } from '../helpers/test-utils';
import { computeEnemyStats } from '../helpers/combat_enemies';
import { templateAtLevel } from '../data/enemy_rules';
import { buildLookOutput } from '../helpers/look';
import { describeLookTarget } from '../helpers/examine';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['start_combat', 'resolve_round_timer']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: the schema recorder could not capture it.`);
    }
    handlers[name] = h;
  }
}, 120_000);

const TEN_S = 10_000_000n;

/** The fixture's enemy template 1 (Cave Rat, level 1, role damage). */
const fixtureTemplate = () => startSeed().enemy_template[0];

function startFight(spawnLevel?: bigint) {
  const seed = startSeed();
  if (spawnLevel !== undefined) seed.enemy_spawn = [{ ...seed.enemy_spawn[0], level: spawnLevel }];
  const ctx = fightCtx(seed, ALICE);
  handlers.start_combat(ctx, { characterId: 1n, enemySpawnId: 1n });
  return rows(ctx, 'combat_enemy')[0];
}

describe('fight start reads the spawn level', () => {
  it('a level 5 spawn of a level 1 type fights with the formula stats at level 5', () => {
    const enemy = startFight(5n);
    const scaled = computeEnemyStats(templateAtLevel(fixtureTemplate(), 5n), null, []);
    expect(enemy.level).toBe(5n);
    expect(enemy.maxHp).toBe(scaled.maxHp);
    expect(enemy.attackDamage).toBe(scaled.attackDamage);
    expect(enemy.armorClass).toBe(scaled.armorClass);
    expect(enemy.maxHp).toBeGreaterThan(computeEnemyStats(fixtureTemplate(), null, []).maxHp);
  });

  it('a spawn from before the column fights as its type, unchanged', () => {
    const enemy = startFight();
    const plain = computeEnemyStats(fixtureTemplate(), null, []);
    expect(enemy.level).toBe(1n);
    expect(enemy.maxHp).toBe(plain.maxHp);
    expect(enemy.attackDamage).toBe(plain.attackDamage);
    expect(enemy.armorClass).toBe(plain.armorClass);
  });

  it('a spawn at exactly its type level fights as its type', () => {
    const enemy = startFight(1n);
    const plain = computeEnemyStats(fixtureTemplate(), null, []);
    expect(enemy.level).toBe(1n);
    expect(enemy.maxHp).toBe(plain.maxHp);
  });
});

describe('victory XP follows the level the enemy fought at', () => {
  function xpGain(level: bigint | undefined): bigint {
    const seed = fightSeed({
      withOpenRound: true,
      enemies: [{ id: 1n, name: 'Cave Rat', hp: 1n }],
      extra: {
        combat_action: [
          {
            id: 1n,
            combatId: 1n,
            characterId: 1n,
            roundNumber: 1n,
            actionType: 'auto_attack',
            abilityTemplateId: undefined,
            targetEnemyId: undefined,
            targetCharacterId: undefined,
            submittedAt: { microsSinceUnixEpoch: T0 },
          },
        ],
      },
    });
    if (level !== undefined) seed.combat_enemy = seed.combat_enemy.map((e) => ({ ...e, level }));
    const ctx = fightCtx(seed, MODULE, T0 + TEN_S);
    const tick = openTickArg(ctx);
    ctx.sender = MODULE;
    handlers.resolve_round_timer(ctx, tick);
    expect(rows(ctx, 'combat_encounter')[0].state).toBe('resolved');
    return rows(ctx, 'character').find((c: any) => c.id === 1n).xp as bigint;
  }

  it('a level 5 enemy pays more XP than the same row without a level; level 1 and none are identical', () => {
    const none = xpGain(undefined);
    const one = xpGain(1n);
    const five = xpGain(5n);
    expect(none).toBeGreaterThan(0n);
    expect(one).toBe(none);
    expect(five).toBeGreaterThan(none);
  });
});

describe('server text shows the spawn level', () => {
  const spawn = (level?: bigint) => ({
    id: 1n,
    locationId: 1n,
    enemyTemplateId: 1n,
    name: 'Cave Rat',
    state: 'available',
    lockedCombatId: undefined,
    groupCount: 1n,
    ...(level === undefined ? {} : { level }),
  });
  const textCtx = (level?: bigint) => ({
    db: createMockDb({
      location: [{ id: 1n, name: 'Vault', description: 'Cold.', isSafe: false, bindStone: false, craftingAvailable: false }],
      world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: 2_000_000_000_000n }],
      npc: [],
      character: [],
      enemy_spawn: [spawn(level)],
      enemy_template: [{ ...fixtureTemplate() }],
      resource_node: [],
      location_connection: [],
    }),
    timestamp: { microsSinceUnixEpoch: 1_000_000_000_000n },
  });
  const me = { id: 10n, locationId: 1n, level: 1n, name: 'Hero', race: 'Human', className: 'Warrior' };

  it('look shows (Lv 5) for a level 5 spawn of a level 1 type', () => {
    expect(buildLookOutput(textCtx(5n), me).join('\n')).toContain('(Lv 5)');
  });

  it('examine says Level 5.', () => {
    expect(describeLookTarget(textCtx(5n), me, 'Cave Rat')).toContain('Level 5.');
  });

  it('a legacy spawn still shows its type level', () => {
    expect(buildLookOutput(textCtx(), me).join('\n')).toContain('(Lv 1)');
    expect(describeLookTarget(textCtx(), me, 'Cave Rat')).toContain('Level 1.');
  });
});

describe('every insert writes a level (source scan)', () => {
  const srcRoot = join(fileURLToPath(new URL('..', import.meta.url)));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/fixture/.test(name)) files.push(full);
    }
  };
  walk(srcRoot);

  function literals(call: string): string[] {
    const found: string[] = [];
    for (const file of files) {
      const text: string = readFileSync(file, 'utf8');
      let from = 0;
      for (;;) {
        const at = text.indexOf(call, from);
        if (at < 0) break;
        const open = text.indexOf('{', at);
        let depth = 0;
        let end = open;
        for (let i = open; i < text.length; i += 1) {
          if (text[i] === '{') depth += 1;
          else if (text[i] === '}') {
            depth -= 1;
            if (depth === 0) {
              end = i;
              break;
            }
          }
        }
        found.push(text.slice(open, end + 1));
        from = end;
      }
    }
    return found;
  }

  it('enemy_spawn.insert sites all carry a level key', () => {
    const sites = literals('enemy_spawn.insert(');
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (const site of sites) expect(site).toMatch(/\blevel\b/);
  });

  it('combat_enemy.insert sites all carry a level key', () => {
    const sites = literals('combat_enemy.insert(');
    expect(sites.length).toBeGreaterThanOrEqual(1);
    for (const site of sites) expect(site).toMatch(/\blevel\b/);
  });
});
