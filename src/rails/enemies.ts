// Enemy spawn state for the individual enemies left in the world (quick-261006-a0i; slimmed in
// 51.3.1.1-19). Ordinary enemies are density pools now: Nearby shows one card per family (pools.ts)
// and never lists an ordinary spawn, so the per-spawn row model and the pullable-spawn list are gone
// (pullTargets replaced the list in 51.3.1.1-18). What stays is the spawn-state mapping that
// pullTargets and the named & quest cards (pools.ts namedRows) read for the World event spawns.
// Server spawn-state vocabulary (enemy_spawn.state): 'available' can be fought, 'pulling' has a
// pull in progress, 'engaged' is in a fight (lockedCombatId holds the fight id). Any other state
// is not shown.

export type EnemyStatus = 'available' | 'pulling' | 'inCombat';

export function enemyStatus(spawn: {
  state: string;
  lockedCombatId?: bigint | null;
}): EnemyStatus | null {
  const locked = spawn.lockedCombatId !== undefined && spawn.lockedCombatId !== null;
  if (spawn.state === 'engaged' || locked) return 'inCombat';
  if (spawn.state === 'pulling') return 'pulling';
  if (spawn.state === 'available') return 'available';
  return null;
}
