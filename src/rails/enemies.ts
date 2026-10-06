// Enemy rows for Nearby and the enemy feed keywords (quick-261006-a0i, CON-02, CON-04, CMB-01).
// Server spawn-state vocabulary (enemy_spawn.state): 'available' can be pulled, 'pulling' has a
// pull in progress, 'engaged' is in a fight (lockedCombatId holds the fight id). Any other
// state is not shown. Difficulty colors come from combat/difficulty (conFor), never from here.
import { conFor } from '../combat/difficulty';
import type { ConView } from '../combat/difficulty';

export type EnemyStatus = 'available' | 'pulling' | 'inCombat';

export interface EnemyRow {
  id: bigint;
  name: string;
  status: EnemyStatus;
  groupCount: bigint;
  /** 'Lv n' when the template is known, else null. */
  levelText: string | null;
  /** Difficulty view; null while the template level or the player level is unknown (neutral row). */
  con: ConView | null;
  /** True once the template level is known. The Pull button stays aria-disabled until then. */
  levelKnown: boolean;
  /** Level, group count and state, joined with ' · '. */
  hint: string;
  /** '{name} · {con meaning}' once difficulty is known, else just the name. */
  title: string;
  /** Pull button name: 'Pull {name} (Lv n, {meaning})', dropping what is not known yet. */
  pullLabel: string;
}

interface SpawnLike {
  id: bigint;
  name: string;
  state: string;
  lockedCombatId?: bigint | null;
  enemyTemplateId: bigint;
  groupCount: bigint;
}

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

function compareSpawns(a: { id: bigint; name: string }, b: { id: bigint; name: string }): number {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const STATUS_HINTS: Record<EnemyStatus, string> = {
  available: '',
  pulling: 'Being pulled',
  inCombat: 'In combat',
};

export function enemyRows(input: {
  spawns: readonly SpawnLike[];
  templates: readonly { id: bigint; level: bigint }[];
  playerLevel: bigint | null;
}): EnemyRow[] {
  const levels = new Map<bigint, bigint>();
  for (const template of input.templates) levels.set(template.id, template.level);

  const rows: EnemyRow[] = [];
  for (const spawn of input.spawns) {
    const status = enemyStatus(spawn);
    if (status === null) continue;
    const level = levels.get(spawn.enemyTemplateId);
    const levelText = level === undefined ? null : `Lv ${level}`;
    // No difficulty while the template (chained subscription) or the player level is unknown:
    // a missing template must not read as "Even match" (review WR-02).
    const con =
      input.playerLevel === null || level === undefined ? null : conFor(level, input.playerLevel);
    const pullDetail =
      levelText === null ? '' : ` (${con === null ? levelText : `${levelText}, ${con.meaning}`})`;
    const parts: string[] = [];
    if (levelText !== null) parts.push(levelText);
    if (spawn.groupCount > 1n) parts.push(`×${spawn.groupCount}`);
    if (STATUS_HINTS[status] !== '') parts.push(STATUS_HINTS[status]);
    rows.push({
      id: spawn.id,
      name: spawn.name,
      status,
      groupCount: spawn.groupCount,
      levelText,
      con,
      levelKnown: level !== undefined,
      hint: parts.join(' · '),
      title: con === null ? spawn.name : `${spawn.name} · ${con.meaning}`,
      pullLabel: `Pull ${spawn.name}${pullDetail}`,
    });
  }
  rows.sort(compareSpawns);
  return rows;
}

/** Spawns that can be pulled now, in row order. These feed the keyword vocabulary. */
export function pullableSpawns(
  spawns: readonly { id: bigint; name: string; state: string; lockedCombatId?: bigint | null }[],
): { id: bigint; name: string }[] {
  const out: { id: bigint; name: string }[] = [];
  for (const spawn of spawns) {
    if (enemyStatus(spawn) === 'available') out.push({ id: spawn.id, name: spawn.name });
  }
  out.sort(compareSpawns);
  return out;
}
