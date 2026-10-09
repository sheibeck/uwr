import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gatherTargets, pullTargets } from './pullTargets';

// The feed keyword vocabulary for enemies and resources (51.3.1.1-18, UI-SPEC P3): families by
// pool id (not individual ordinary enemies), living named enemies and available event spawns.

function family(id: bigint, name: string, level: bigint, extra: Record<string, unknown> = {}) {
  return { id, kind: 'creature', level, name, locationId: 10n, ...extra };
}

function resource(id: bigint, name: string, level: bigint) {
  return { id, kind: 'resource', level, name, locationId: 10n };
}

function named(id: bigint, name: string, isAlive = true) {
  return { id, name, isAlive, locationId: 10n };
}

function spawn(id: bigint, name: string, state = 'available', lockedCombatId: bigint | null = null) {
  return { id, name, state, lockedCombatId };
}

describe('pullTargets', () => {
  it('offers families with a level above 0, by pool id and family name', () => {
    const out = pullTargets(
      [family(5n, 'Goblins', 2n), family(6n, 'Skitterers', 0n), resource(9n, 'Panlight Salt', 3n)],
      [],
      [],
    );
    expect(out).toEqual([{ id: 5n, name: 'Goblins', target: 'family' }]);
  });

  it('offers living named enemies and available event spawns', () => {
    const out = pullTargets(
      [],
      [named(3n, 'Old Brannoc'), named(4n, 'Greymaw', false)],
      [spawn(7n, 'Ash Wraith'), spawn(8n, 'Bone Rat', 'engaged'), spawn(9n, 'Dust Imp', 'available', 2n)],
    );
    expect(out).toEqual([
      { id: 7n, name: 'Ash Wraith', target: 'event' },
      { id: 3n, name: 'Old Brannoc', target: 'named' },
    ]);
  });

  it('sorts every target by name, ties by id', () => {
    const out = pullTargets(
      [family(5n, 'goblins', 1n), family(2n, 'Adders', 3n)],
      [named(3n, 'Brannoc')],
      [spawn(1n, 'Goblins'), spawn(4n, 'Cinder Wisp')],
    );
    expect(out.map((t) => `${t.target}:${t.name}`)).toEqual([
      'family:Adders',
      'named:Brannoc',
      'event:Cinder Wisp',
      'event:Goblins',
      'family:goblins',
    ]);
  });

  it('is empty for empty inputs (the caller passes [] in a fight)', () => {
    expect(pullTargets([], [], [])).toEqual([]);
  });

  it('skips blank names', () => {
    expect(pullTargets([family(5n, '  ', 2n)], [named(3n, '')], [spawn(1n, ' ')])).toEqual([]);
  });
});

describe('gatherTargets', () => {
  it('offers the resource pools with a level above 0, sorted by name', () => {
    const out = gatherTargets([
      resource(9n, 'Panlight Salt', 2n),
      resource(10n, 'Iron Ore', 1n),
      resource(11n, 'Bitterleaf', 0n),
      family(5n, 'Goblins', 2n),
    ]);
    expect(out).toEqual([
      { id: 10n, name: 'Iron Ore' },
      { id: 9n, name: 'Panlight Salt' },
    ]);
  });
});

describe('pullTargets module', () => {
  it('imports nothing from the server except types', () => {
    const source = readFileSync(resolve(__dirname, 'pullTargets.ts'), 'utf8');
    for (const line of source.split('\n')) {
      if (!line.startsWith('import ')) continue;
      if (line.includes('spacetimedb') || line.includes('@game-data')) expect(line).toMatch(/^import type /);
    }
  });
});
