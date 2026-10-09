// The enemy and resource keyword feed (51.3.1.1-18, UI-SPEC P3). Fights come from pools now: the
// vocabulary offers a family by its name (target 'family', id = the pool_level id = place_pool id,
// which pull_family takes), the player's living named enemies here (target 'named', id =
// named_enemy id for pull_named_enemy) and the available individual spawns here, the World event
// enemies (target 'event', id = enemy_spawn id for start_combat). Ordinary individual enemies are
// never offered. The caller passes [] for every list in a fight, so the result is empty there.
// Names are server text; the keyword scanner never builds a regex from them (T-47-02).
import { enemyStatus } from './enemies';

export type PullTarget = 'family' | 'named' | 'event';

export interface PullTargetEntry {
  id: bigint;
  name: string;
  target: PullTarget;
}

interface PoolLike {
  id: bigint;
  kind: string;
  level: bigint;
  name: string;
}

function byName(a: { id: bigint; name: string }, b: { id: bigint; name: string }): number {
  const order = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (order !== 0) return order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function named(name: string): boolean {
  return name.trim() !== '';
}

/** Families here with a level above 0, living named enemies here and available event spawns here, by name. */
export function pullTargets(
  poolsHere: readonly PoolLike[],
  namedHere: readonly { id: bigint; name: string; isAlive: boolean }[],
  eventSpawnsHere: readonly { id: bigint; name: string; state: string; lockedCombatId?: bigint | null }[],
): PullTargetEntry[] {
  const out: PullTargetEntry[] = [];
  for (const pool of poolsHere) {
    if (pool.kind !== 'creature' || pool.level <= 0n || !named(pool.name)) continue;
    out.push({ id: pool.id, name: pool.name, target: 'family' });
  }
  for (const enemy of namedHere) {
    if (!enemy.isAlive || !named(enemy.name)) continue;
    out.push({ id: enemy.id, name: enemy.name, target: 'named' });
  }
  for (const spawn of eventSpawnsHere) {
    if (enemyStatus(spawn) !== 'available' || !named(spawn.name)) continue;
    out.push({ id: spawn.id, name: spawn.name, target: 'event' });
  }
  out.sort(byName);
  return out;
}

/** The gatherable resource pools here (level above 0), by name: the node keywords and typed gather names. */
export function gatherTargets(poolsHere: readonly PoolLike[]): { id: bigint; name: string }[] {
  const out: { id: bigint; name: string }[] = [];
  for (const pool of poolsHere) {
    if (pool.kind !== 'resource' || pool.level <= 0n || !named(pool.name)) continue;
    out.push({ id: pool.id, name: pool.name });
  }
  out.sort(byName);
  return out;
}
