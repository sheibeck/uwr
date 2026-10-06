/**
 * Phase 46.1 (RND-05): the pure big-moment detector. No mocks: the module is pure.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import {
  NEAR_DEATH_MOMENT_PERCENT,
  PHASE_MOMENT_PERCENT,
  MOMENT_KINDS,
  crossedNearDeath,
  crossedPhase,
  isBossOrNamed,
  detectMoment,
  type EnemySnapshot,
  type PlayerSnapshot,
  type FiredMoment,
} from './combat_moments';

const enemy = (
  id: bigint,
  hpBefore: bigint,
  hpAfter: bigint,
  bossOrNamed = false,
  maxHp = 100n,
): EnemySnapshot => ({ id, name: `Enemy${id}`, hpBefore, hpAfter, maxHp, bossOrNamed });

const player = (characterId: bigint, hpBefore: bigint, hpAfter: bigint, maxHp = 100n): PlayerSnapshot => ({
  characterId,
  name: `Hero${characterId}`,
  hpBefore,
  hpAfter,
  maxHp,
});

const base = (over: Partial<Parameters<typeof detectMoment>[0]> = {}) => ({
  enemies: [] as EnemySnapshot[],
  players: [] as PlayerSnapshot[],
  fired: [] as FiredMoment[],
  fightEnded: false,
  ...over,
});

describe('constants', () => {
  it('thresholds and kinds', () => {
    expect(NEAR_DEATH_MOMENT_PERCENT).toBe(20n);
    expect(PHASE_MOMENT_PERCENT).toBe(50n);
    expect([...MOMENT_KINDS]).toEqual(['kill', 'near_death', 'phase']);
  });
});

describe('crossedNearDeath', () => {
  it('fires once when crossing below 20% while alive', () => {
    expect(crossedNearDeath(20n, 19n, 100n)).toBe(true);
    expect(crossedNearDeath(25n, 10n, 100n)).toBe(true);
    expect(crossedNearDeath(100n, 1n, 100n)).toBe(true);
  });
  it('does not fire when already below, unchanged, or dead', () => {
    expect(crossedNearDeath(19n, 10n, 100n)).toBe(false);
    expect(crossedNearDeath(20n, 20n, 100n)).toBe(false);
    expect(crossedNearDeath(30n, 0n, 100n)).toBe(false);
  });
});

describe('crossedPhase', () => {
  it('fires when crossing from above 50% to 50% or below while alive', () => {
    expect(crossedPhase(51n, 50n, 100n)).toBe(true);
    expect(crossedPhase(80n, 30n, 100n)).toBe(true);
    expect(crossedPhase(51n, 50n, 101n)).toBe(true);
  });
  it('does not fire when already at or below half, or dead', () => {
    expect(crossedPhase(50n, 40n, 100n)).toBe(false);
    expect(crossedPhase(60n, 0n, 100n)).toBe(false);
  });
});

describe('isBossOrNamed', () => {
  const named = new Set<bigint>([9n]);
  it('boss template is true', () => {
    expect(isBossOrNamed({ isBoss: true }, 1n, named)).toBe(true);
  });
  it('non-boss is false unless the template is a named one', () => {
    expect(isBossOrNamed({ isBoss: false }, 1n, named)).toBe(false);
    expect(isBossOrNamed({ isBoss: undefined }, 1n, named)).toBe(false);
    expect(isBossOrNamed(undefined, 1n, named)).toBe(false);
    expect(isBossOrNamed(null, 1n, named)).toBe(false);
    expect(isBossOrNamed({ isBoss: false }, 9n, named)).toBe(true);
    expect(isBossOrNamed(undefined, 9n, named)).toBe(true);
  });
});

describe('detectMoment gating', () => {
  it('returns null when the fight ended, even when a boss died', () => {
    expect(detectMoment(base({ fightEnded: true, enemies: [enemy(1n, 40n, 0n, true)] }))).toBeNull();
  });
  it('returns null at the cap', () => {
    const fired: FiredMoment[] = [
      { kind: 'kill', subjectKey: 'first' },
      { kind: 'phase', subjectKey: 'enemy:7' },
      { kind: 'near_death', subjectKey: 'character:3' },
    ];
    expect(detectMoment(base({ fired, enemies: [enemy(1n, 40n, 0n, true)] }))).toBeNull();
  });
  it('honours a cap override', () => {
    const fired: FiredMoment[] = [{ kind: 'phase', subjectKey: 'enemy:7' }];
    expect(detectMoment(base({ fired, cap: 1n, enemies: [enemy(1n, 40n, 0n, true)] }))).toBeNull();
  });
  it('still picks with 2 fired and the default cap', () => {
    const fired: FiredMoment[] = [
      { kind: 'phase', subjectKey: 'enemy:7' },
      { kind: 'near_death', subjectKey: 'character:3' },
    ];
    const pick = detectMoment(base({ fired, enemies: [enemy(1n, 40n, 0n)] }));
    expect(pick?.kind).toBe('kill');
  });
  it('returns null when nothing happened', () => {
    expect(detectMoment(base({ enemies: [enemy(1n, 100n, 90n)], players: [player(1n, 100n, 90n)] }))).toBeNull();
  });
});

describe('first kill', () => {
  it('picks the first kill of a non-boss enemy', () => {
    const pick = detectMoment(base({ enemies: [enemy(1n, 100n, 0n), enemy(2n, 100n, 90n)] }));
    expect(pick).toEqual({
      kind: 'kill',
      subjectKey: 'first',
      subjectId: 1n,
      subjectName: 'Enemy1',
      first: true,
      bossOrNamed: false,
    });
  });
  it('is not possible when an enemy started the round at 0 HP', () => {
    expect(detectMoment(base({ enemies: [enemy(1n, 0n, 0n), enemy(2n, 10n, 0n)] }))).toBeNull();
  });
  it('is not possible when already fired', () => {
    const fired: FiredMoment[] = [{ kind: 'kill', subjectKey: 'first' }];
    expect(detectMoment(base({ fired, enemies: [enemy(2n, 10n, 0n)] }))).toBeNull();
  });
  it('two kills in one round picks the lower id', () => {
    const pick = detectMoment(base({ enemies: [enemy(5n, 10n, 0n), enemy(3n, 10n, 0n)] }));
    expect(pick?.subjectId).toBe(3n);
    expect(pick?.subjectKey).toBe('first');
  });
});

describe('boss or named kill', () => {
  it('beats every other candidate in the same round', () => {
    const pick = detectMoment(
      base({
        enemies: [enemy(1n, 40n, 0n, true), enemy(2n, 60n, 45n, true)],
        players: [player(4n, 30n, 10n)],
      }),
    );
    expect(pick?.kind).toBe('kill');
    expect(pick?.subjectKey).toBe('enemy:1');
    expect(pick?.bossOrNamed).toBe(true);
    expect(pick?.first).toBe(true);
  });
  it('first is false when another enemy already started the round dead', () => {
    const pick = detectMoment(base({ enemies: [enemy(1n, 40n, 0n, true), enemy(2n, 0n, 0n)] }));
    expect(pick?.subjectKey).toBe('enemy:1');
    expect(pick?.first).toBe(false);
  });
  it('is blocked by a fired key for that enemy', () => {
    const fired: FiredMoment[] = [
      { kind: 'kill', subjectKey: 'enemy:1' },
      { kind: 'kill', subjectKey: 'first' },
    ];
    const pick = detectMoment(base({ fired, enemies: [enemy(1n, 40n, 0n, true)] }));
    expect(pick).toBeNull();
  });
});

describe('phase', () => {
  it('a named enemy crossing 50% beats near death and first kill', () => {
    const pick = detectMoment(
      base({
        enemies: [enemy(1n, 60n, 45n, true), enemy(2n, 10n, 0n)],
        players: [player(4n, 30n, 10n)],
      }),
    );
    expect(pick?.kind).toBe('phase');
    expect(pick?.subjectKey).toBe('enemy:1');
    expect(pick?.subjectId).toBe(1n);
  });
  it('a fired phase key blocks a second phase moment for that enemy', () => {
    const fired: FiredMoment[] = [{ kind: 'phase', subjectKey: 'enemy:1' }];
    const pick = detectMoment(base({ fired, enemies: [enemy(1n, 60n, 45n, true)] }));
    expect(pick).toBeNull();
  });
  it('a non-boss enemy crossing 50% is not a phase moment', () => {
    expect(detectMoment(base({ enemies: [enemy(1n, 60n, 45n, false)] }))).toBeNull();
  });
});

describe('near death', () => {
  it('beats first kill', () => {
    const pick = detectMoment(
      base({ enemies: [enemy(1n, 10n, 0n)], players: [player(4n, 30n, 10n)] }),
    );
    expect(pick?.kind).toBe('near_death');
    expect(pick?.subjectKey).toBe('character:4');
    expect(pick?.subjectName).toBe('Hero4');
  });
  it('ties pick the lowest characterId', () => {
    const pick = detectMoment(base({ players: [player(8n, 30n, 10n), player(2n, 30n, 10n)] }));
    expect(pick?.subjectKey).toBe('character:2');
  });
  it('a fired key blocks that character but another can still fire', () => {
    const fired: FiredMoment[] = [{ kind: 'near_death', subjectKey: 'character:2' }];
    const pick = detectMoment(base({ fired, players: [player(8n, 30n, 10n), player(2n, 30n, 10n)] }));
    expect(pick?.subjectKey).toBe('character:8');
    expect(detectMoment(base({ fired, players: [player(2n, 30n, 10n)] }))).toBeNull();
  });
});

describe('determinism', () => {
  it('shuffling the input arrays gives the same pick', () => {
    const enemies = [enemy(5n, 10n, 0n), enemy(3n, 10n, 0n), enemy(9n, 60n, 45n, true)];
    const players = [player(8n, 30n, 10n), player(2n, 30n, 10n)];
    const a = detectMoment(base({ enemies, players }));
    const b = detectMoment(base({ enemies: [...enemies].reverse(), players: [...players].reverse() }));
    expect(b).toEqual(a);
    const c = detectMoment(base({ enemies: [enemies[1], enemies[0]], players: [players[1], players[0]] }));
    expect(c).toEqual(detectMoment(base({ enemies: [enemies[0], enemies[1]], players })));
  });
});

describe('static guard', () => {
  it('imports only combat_constants', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const source: string = readFileSync(join(here, 'combat_moments.ts'), 'utf8');
    expect(source.match(/^import\b/gm)).toHaveLength(1);
    expect(source.match(/\bfrom\s+'[^']+'/g)).toEqual(["from '../data/combat_constants'"]);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
  });
});
