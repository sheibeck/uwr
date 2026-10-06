import { describe, expect, it } from 'vitest';
import { enemyRows, enemyStatus, pullableSpawns } from './enemies';

// quick-261006-a0i: pure derivation of the enemy rows and pull keywords.

function spawn(
  id: bigint,
  name: string,
  state: string,
  extra: { lockedCombatId?: bigint; enemyTemplateId?: bigint; groupCount?: bigint } = {},
) {
  return { id, name, state, enemyTemplateId: 1n, groupCount: 1n, ...extra };
}

describe('enemyStatus', () => {
  it('maps the server spawn states', () => {
    expect(enemyStatus({ state: 'available' })).toBe('available');
    expect(enemyStatus({ state: 'pulling' })).toBe('pulling');
    expect(enemyStatus({ state: 'engaged' })).toBe('inCombat');
    expect(enemyStatus({ state: 'gone' })).toBeNull();
  });

  it('treats a locked combat id as in combat, whatever the state', () => {
    expect(enemyStatus({ state: 'available', lockedCombatId: 4n })).toBe('inCombat');
    expect(enemyStatus({ state: 'available', lockedCombatId: undefined })).toBe('available');
    expect(enemyStatus({ state: 'available', lockedCombatId: null })).toBe('available');
  });
});

describe('enemyRows', () => {
  const templates = [{ id: 1n, level: 8n }];

  it('colors by con and builds title and level text', () => {
    const [row] = enemyRows({
      spawns: [spawn(1n, 'Goblin Scout', 'available')],
      templates,
      playerLevel: 6n,
    });
    expect(row.con.className).toBe('con-orange');
    expect(row.levelText).toBe('Lv 8');
    expect(row.title).toBe('Goblin Scout · Hard');
    expect(row.status).toBe('available');
  });

  it('joins level, group count and state with a middle dot', () => {
    const hint = (s: ReturnType<typeof spawn>, tpl = templates) =>
      enemyRows({ spawns: [s], templates: tpl, playerLevel: 6n })[0].hint;
    expect(hint(spawn(1n, 'A', 'available', { groupCount: 3n }))).toBe('Lv 8 · ×3');
    expect(hint(spawn(1n, 'A', 'pulling'))).toBe('Lv 8 · Being pulled');
    expect(hint(spawn(1n, 'A', 'engaged', { groupCount: 3n }))).toBe(
      'Lv 8 · ×3 · In combat',
    );
    expect(hint(spawn(1n, 'A', 'available'), [])).toBe('');
    expect(hint(spawn(1n, 'A', 'available', { groupCount: 0n }))).toBe('Lv 8');
  });

  it('reads white and has no level text without a template or a player level', () => {
    const [noTemplate] = enemyRows({
      spawns: [spawn(1n, 'A', 'available')],
      templates: [],
      playerLevel: 6n,
    });
    expect(noTemplate.levelText).toBeNull();
    expect(noTemplate.con.className).toBe('con-white');
    expect(noTemplate.con.meaning).toBe('Even match');

    const [noLevel] = enemyRows({
      spawns: [spawn(1n, 'A', 'available')],
      templates,
      playerLevel: null,
    });
    expect(noLevel.con.className).toBe('con-white');
    expect(noLevel.levelText).toBe('Lv 8');
  });

  it('leaves out unknown states and sorts by name, ties by id', () => {
    const rows = enemyRows({
      spawns: [
        spawn(5n, 'wolf', 'available'),
        spawn(4n, 'Ghost', 'gone'),
        spawn(3n, 'Bone Rat', 'engaged'),
        spawn(2n, 'Wolf', 'available'),
        spawn(1n, 'Ash Wolf', 'pulling'),
      ],
      templates,
      playerLevel: 6n,
    });
    expect(rows.map((r) => r.id)).toEqual([1n, 3n, 2n, 5n]);
  });
});

describe('pullableSpawns', () => {
  it('returns only available spawns, sorted', () => {
    expect(
      pullableSpawns([
        spawn(3n, 'Zed', 'available'),
        spawn(2n, 'Ash', 'pulling'),
        spawn(1n, 'Bone', 'available'),
        spawn(4n, 'Cog', 'available', { lockedCombatId: 9n }),
        spawn(5n, 'Gone', 'gone'),
      ]),
    ).toEqual([
      { id: 1n, name: 'Bone' },
      { id: 3n, name: 'Zed' },
    ]);
  });
});
