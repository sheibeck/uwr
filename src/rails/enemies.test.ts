import { describe, expect, it } from 'vitest';
import { conFor } from '../combat/difficulty';
import { enemyRows, enemyStatus, pullableSpawns } from './enemies';

// quick-261006-a0i: pure derivation of the enemy rows and pull keywords.

function spawn(
  id: bigint,
  name: string,
  state: string,
  extra: {
    lockedCombatId?: bigint;
    enemyTemplateId?: bigint;
    groupCount?: bigint;
    level?: bigint;
  } = {},
) {
  return { id, name, state, enemyTemplateId: 1n, groupCount: 1n, ...extra };
}

describe('enemyStatus', () => {
  it('maps the server spawn states', () => {
    expect(enemyStatus({ state: 'available' })).toBe('available');
    expect(enemyStatus({ state: 'pulling' })).toBe('pulling');
    expect(enemyStatus({ state: 'engaged' })).toBe('inCombat');
    expect(enemyStatus({ state: 'depleted' })).toBeNull();
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
    expect(row.con?.className).toBe('con-orange');
    expect(row.levelText).toBe('Lv 8');
    expect(row.title).toBe('Goblin Scout · Hard');
    expect(row.status).toBe('available');
    expect(row.levelKnown).toBe(true);
  });

  it('puts the level and difficulty word in the Pull label', () => {
    const [row] = enemyRows({
      spawns: [spawn(1n, 'Rotfang', 'available')],
      templates,
      playerLevel: 6n,
    });
    expect(row.pullLabel).toBe('Pull Rotfang (Lv 8, Hard)');
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

  it('shows the spawn level, not the template level, when the spawn was scaled to its place', () => {
    const [row] = enemyRows({
      spawns: [spawn(1n, 'Rotfang', 'available', { level: 5n })],
      templates: [{ id: 1n, level: 1n }],
      playerLevel: 5n,
    });
    expect(row.levelText).toBe('Lv 5');
    expect(row.con).toEqual(conFor(5n, 5n));
    expect(row.hint.startsWith('Lv 5')).toBe(true);
    expect(row.pullLabel).toContain('Lv 5');
    expect(row.levelKnown).toBe(true);
  });

  it('reads the template level for a spawn with level 0 or no level field', () => {
    for (const extra of [{ level: 0n }, {}]) {
      const [row] = enemyRows({
        spawns: [spawn(1n, 'Rotfang', 'available', extra)],
        templates: [{ id: 1n, level: 8n }],
        playerLevel: 6n,
      });
      expect(row.levelText).toBe('Lv 8');
      expect(row.con).toEqual(conFor(8n, 6n));
    }
  });

  it('shows the spawn level before its template is loaded', () => {
    const [row] = enemyRows({
      spawns: [spawn(1n, 'Rotfang', 'available', { level: 5n })],
      templates: [],
      playerLevel: 5n,
    });
    expect(row.levelText).toBe('Lv 5');
    expect(row.levelKnown).toBe(true);
  });

  it('keeps the neutral row for a level 0 spawn with no template', () => {
    const [row] = enemyRows({
      spawns: [spawn(1n, 'Rotfang', 'available', { level: 0n })],
      templates: [],
      playerLevel: 5n,
    });
    expect(row.levelText).toBeNull();
    expect(row.levelKnown).toBe(false);
    expect(row.con).toBeNull();
  });

  it('has no difficulty, no level and a bare label while the template is unknown', () => {
    const [noTemplate] = enemyRows({
      spawns: [spawn(1n, 'Rotfang', 'available')],
      templates: [],
      playerLevel: 6n,
    });
    expect(noTemplate.levelText).toBeNull();
    expect(noTemplate.levelKnown).toBe(false);
    expect(noTemplate.con).toBeNull();
    expect(noTemplate.title).toBe('Rotfang');
    expect(noTemplate.pullLabel).toBe('Pull Rotfang');
    expect(noTemplate.title).not.toContain('Even match');
  });

  it('keeps the level but claims no difficulty while the player level is unknown', () => {
    const [noLevel] = enemyRows({
      spawns: [spawn(1n, 'Rotfang', 'available')],
      templates,
      playerLevel: null,
    });
    expect(noLevel.con).toBeNull();
    expect(noLevel.levelText).toBe('Lv 8');
    expect(noLevel.levelKnown).toBe(true);
    expect(noLevel.title).toBe('Rotfang');
    expect(noLevel.pullLabel).toBe('Pull Rotfang (Lv 8)');
  });

  it('still reads Even match for a known same-level enemy', () => {
    const [row] = enemyRows({
      spawns: [spawn(1n, 'Rotfang', 'available')],
      templates: [{ id: 1n, level: 6n }],
      playerLevel: 6n,
    });
    expect(row.con?.className).toBe('con-white');
    expect(row.title).toBe('Rotfang · Even match');
  });

  it('leaves out unknown states and sorts by name, ties by id', () => {
    const rows = enemyRows({
      spawns: [
        spawn(5n, 'wolf', 'available'),
        spawn(4n, 'Ghost', 'depleted'),
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
        spawn(5n, 'Gone', 'depleted'),
      ]),
    ).toEqual([
      { id: 1n, name: 'Bone' },
      { id: 3n, name: 'Zed' },
    ]);
  });
});
