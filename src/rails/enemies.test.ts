import { describe, expect, it } from 'vitest';
import * as enemies from './enemies';
import { enemyStatus } from './enemies';

// quick-261006-a0i, slimmed in 51.3.1.1-19: ordinary enemies are pools now, so Nearby has no
// per-spawn row model and no pullable-spawn list (pullTargets replaced it in 51.3.1.1-18). The
// spawn-state mapping stays: pullTargets and the named & quest rows (pools.ts) read it for the
// World event spawns.

describe('ordinary-spawn rows are retired (51.3.1.1-19)', () => {
  it('exports no row model and no pullable-spawn list', () => {
    expect('enemyRows' in enemies).toBe(false);
    expect('pullableSpawns' in enemies).toBe(false);
  });
});

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
