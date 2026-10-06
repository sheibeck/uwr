/**
 * Phase 46.1 (RND-03, RND-04): the round-based combat schema is additive only. Every new round
 * column is a defaulted u64 appended LAST, combat_moment is private, combat_round and combat_action
 * stay public, and the scheduled tables are untouched. A source scan keeps every insert honest.
 */
import { describe, it, expect, vi } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import { recordedTable } from '../helpers/schema_recorder';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

async function cols(name: string): Promise<string[]> {
  await import('./tables');
  const rec = recordedTable(name);
  expect(rec, name).toBeDefined();
  return Object.keys(rec!.cols);
}

describe('defaulted round columns are last (RND-03)', () => {
  const lastOne: Array<[string, string]> = [
    ['ability_cooldown', 'roundsRemaining'],
    ['combat_enemy_cooldown', 'readyAtRound'],
    ['combat_pending_add', 'arriveAtRound'],
    ['combat_round', 'startedAtMicros'],
  ];
  for (const [table, col] of lastOne) {
    it(`${table} ends with ${col}, a defaulted required u64`, async () => {
      const keys = await cols(table);
      expect(keys[keys.length - 1]).toBe(col);
      const info = recordedTable(table)!.cols[col];
      expect(info.kind).toBe('u64');
      expect(info.defaulted).toBe(true);
      expect(info.optional).toBe(false);
    });
  }

  it('combat_enemy_cast ends with announcedRound then landsAtRound, both defaulted u64', async () => {
    const keys = await cols('combat_enemy_cast');
    expect(keys.slice(-2)).toEqual(['announcedRound', 'landsAtRound']);
    for (const col of ['announcedRound', 'landsAtRound']) {
      const info = recordedTable('combat_enemy_cast')!.cols[col];
      expect(info.kind).toBe('u64');
      expect(info.defaulted).toBe(true);
      expect(info.optional).toBe(false);
    }
  });

  it('full column orders are pinned (no existing column removed, renamed or reordered)', async () => {
    expect(await cols('ability_cooldown')).toEqual([
      'id', 'characterId', 'abilityTemplateId', 'startedAtMicros', 'durationMicros', 'roundsRemaining',
    ]);
    expect(await cols('combat_round')).toEqual([
      'id', 'combatId', 'roundNumber', 'state', 'timerExpiresAtMicros', 'narrationCount', 'startedAtMicros',
    ]);
    expect(await cols('combat_action')).toEqual([
      'id', 'combatId', 'characterId', 'roundNumber', 'actionType', 'abilityTemplateId',
      'targetEnemyId', 'targetCharacterId', 'submittedAt',
    ]);
    expect(await cols('combat_enemy_cast')).toEqual([
      'id', 'combatId', 'enemyId', 'abilityKey', 'endsAtMicros', 'targetCharacterId', 'targetPetId',
      'announcedRound', 'landsAtRound',
    ]);
    expect(await cols('combat_enemy_cooldown')).toEqual([
      'id', 'combatId', 'enemyId', 'abilityKey', 'readyAtMicros', 'readyAtRound',
    ]);
    expect(await cols('combat_pending_add')).toEqual([
      'id', 'combatId', 'enemyTemplateId', 'enemyRoleTemplateId', 'spawnId', 'arriveAtMicros', 'arriveAtRound',
    ]);
  });

  it('every new column is defaulted (no required column without a default was added)', async () => {
    const base: Record<string, string[]> = {
      ability_cooldown: ['id', 'characterId', 'abilityTemplateId', 'startedAtMicros', 'durationMicros'],
      combat_round: ['id', 'combatId', 'roundNumber', 'state', 'timerExpiresAtMicros', 'narrationCount'],
      combat_enemy_cast: ['id', 'combatId', 'enemyId', 'abilityKey', 'endsAtMicros', 'targetCharacterId', 'targetPetId'],
      combat_enemy_cooldown: ['id', 'combatId', 'enemyId', 'abilityKey', 'readyAtMicros'],
      combat_pending_add: ['id', 'combatId', 'enemyTemplateId', 'enemyRoleTemplateId', 'spawnId', 'arriveAtMicros'],
    };
    await import('./tables');
    for (const [table, baseCols] of Object.entries(base)) {
      const rec = recordedTable(table)!;
      for (const [col, info] of Object.entries(rec.cols)) {
        if (!baseCols.includes(col)) expect(info.defaulted, `${table}.${col}`).toBe(true);
      }
    }
  });

  it('nextAutoAttackAt still exists on combat_participant and combat_enemy', async () => {
    await import('./tables');
    expect('nextAutoAttackAt' in recordedTable('combat_participant')!.cols).toBe(true);
    expect('nextAutoAttackAt' in recordedTable('combat_enemy')!.cols).toBe(true);
  });
});

describe('RND-04 visibility and combat_moment', () => {
  it('combat_round and combat_action are public', async () => {
    await import('./tables');
    expect(recordedTable('combat_round')!.opts.public).toBe(true);
    expect(recordedTable('combat_action')!.opts.public).toBe(true);
  });

  it('combat_moment is private with the pinned columns and a by_combat index', async () => {
    await import('./tables');
    const rec = recordedTable('combat_moment');
    expect(rec).toBeDefined();
    expect(rec!.opts.public).toBeFalsy();
    expect(Object.keys(rec!.cols)).toEqual(['id', 'combatId', 'kind', 'subjectKey', 'roundNumber', 'createdAt']);
    expect(rec!.cols.id.primaryKey).toBe(true);
    expect(rec!.cols.id.autoInc).toBe(true);
    expect(rec!.opts.indexes).toEqual([{ accessor: 'by_combat', algorithm: 'btree', columns: ['combatId'] }]);
  });

  it('no combat_round_choice table is added', async () => {
    await import('./tables');
    expect(recordedTable('combat_round_choice')).toBeUndefined();
  });

  it('combat_loop_tick and round_timer_tick stay scheduled; round_timer_tick columns unchanged', async () => {
    await import('./tables');
    expect(typeof recordedTable('combat_loop_tick')!.opts.scheduled).toBe('function');
    expect(typeof recordedTable('round_timer_tick')!.opts.scheduled).toBe('function');
    expect(Object.keys(recordedTable('round_timer_tick')!.cols)).toEqual([
      'scheduledId', 'scheduledAt', 'combatId', 'roundNumber',
    ]);
  });

  it('combat_moment is registered in the schema object', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const source: string = readFileSync(join(here, 'tables.ts'), 'utf8');
    expect(source.match(/combat_moment: CombatMoment/g)).toHaveLength(1);
  });
});
