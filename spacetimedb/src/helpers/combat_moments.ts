/**
 * Phase 46.1 (RND-05): pure big-moment detection for round narration.
 *
 * At most one moment per round. None in the round that ends the fight (the end-of-fight
 * narration covers it), and none once MAX_COMBAT_NARRATIONS moments have fired in this fight.
 * A moment row is recorded by the caller even when the narration enqueue is refused, so a
 * moment never retries. A moment fires once per fight per kind and subject key.
 *
 * isBoss is rarely set on enemy templates today, so boss and phase moments fire rarely
 * (accepted per CONTEXT); the first-kill and near-death moments carry most fights.
 *
 * Priority: boss or named kill, then boss or named phase change, then player near death,
 * then the first kill of the fight. Ties go to the lowest id. No ctx, no SpacetimeDB imports.
 */
import { MAX_COMBAT_NARRATIONS } from '../data/combat_constants';

export const NEAR_DEATH_MOMENT_PERCENT = 20n;
export const PHASE_MOMENT_PERCENT = 50n;

export const MOMENT_KINDS = ['kill', 'near_death', 'phase'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export type EnemySnapshot = {
  id: bigint;
  name: string;
  hpBefore: bigint;
  hpAfter: bigint;
  maxHp: bigint;
  bossOrNamed: boolean;
};
export type PlayerSnapshot = {
  characterId: bigint;
  name: string;
  hpBefore: bigint;
  hpAfter: bigint;
  maxHp: bigint;
};
export type FiredMoment = { kind: string; subjectKey: string };
export type MomentPick = {
  kind: MomentKind;
  subjectKey: string;
  subjectId: bigint;
  subjectName: string;
  first: boolean;
  bossOrNamed: boolean;
};
export type MomentInput = {
  enemies: readonly EnemySnapshot[];
  players: readonly PlayerSnapshot[];
  fired: readonly FiredMoment[];
  fightEnded: boolean;
  cap?: bigint;
};

/** Alive after the hit, and went from at-or-above the near-death line to below it. */
export function crossedNearDeath(before: bigint, after: bigint, maxHp: bigint): boolean {
  const line = maxHp * NEAR_DEATH_MOMENT_PERCENT;
  return before * 100n >= line && after * 100n < line && after > 0n;
}

/** Alive after the hit, and went from above the phase line to at-or-below it. */
export function crossedPhase(before: bigint, after: bigint, maxHp: bigint): boolean {
  const line = maxHp * PHASE_MOMENT_PERCENT;
  return before * 100n > line && after * 100n <= line && after > 0n;
}

export function isBossOrNamed(
  template: { isBoss?: boolean | null } | null | undefined,
  enemyTemplateId: bigint,
  namedTemplateIds: ReadonlySet<bigint>,
): boolean {
  if (template?.isBoss === true) return true;
  return namedTemplateIds.has(enemyTemplateId);
}

const lowestBy = <T>(rows: readonly T[], key: (row: T) => bigint): T | undefined => {
  let best: T | undefined;
  for (const row of rows) {
    if (best === undefined || key(row) < key(best)) best = row;
  }
  return best;
};

export function detectMoment(input: MomentInput): MomentPick | null {
  if (input.fightEnded) return null;
  const cap = input.cap ?? MAX_COMBAT_NARRATIONS;
  if (BigInt(input.fired.length) >= cap) return null;

  const firedKeys = new Set<string>(input.fired.map((f) => f.kind + '|' + f.subjectKey));
  const isFired = (kind: MomentKind, subjectKey: string) => firedKeys.has(kind + '|' + subjectKey);

  const kills = input.enemies.filter((e) => e.hpBefore > 0n && e.hpAfter === 0n);
  const anyStartedDead = input.enemies.some((e) => e.hpBefore === 0n);
  const firstPossible = kills.length > 0 && !anyStartedDead && !isFired('kill', 'first');

  // (a) boss or named kill
  const bossKill = lowestBy(
    kills.filter((e) => e.bossOrNamed && !isFired('kill', 'enemy:' + e.id)),
    (e) => e.id,
  );
  if (bossKill) {
    return {
      kind: 'kill',
      subjectKey: 'enemy:' + bossKill.id,
      subjectId: bossKill.id,
      subjectName: bossKill.name,
      first: firstPossible,
      bossOrNamed: true,
    };
  }

  // (b) boss or named phase change
  const phase = lowestBy(
    input.enemies.filter(
      (e) => e.bossOrNamed && crossedPhase(e.hpBefore, e.hpAfter, e.maxHp) && !isFired('phase', 'enemy:' + e.id),
    ),
    (e) => e.id,
  );
  if (phase) {
    return {
      kind: 'phase',
      subjectKey: 'enemy:' + phase.id,
      subjectId: phase.id,
      subjectName: phase.name,
      first: false,
      bossOrNamed: true,
    };
  }

  // (c) player near death
  const nearDeath = lowestBy(
    input.players.filter(
      (p) =>
        crossedNearDeath(p.hpBefore, p.hpAfter, p.maxHp) && !isFired('near_death', 'character:' + p.characterId),
    ),
    (p) => p.characterId,
  );
  if (nearDeath) {
    return {
      kind: 'near_death',
      subjectKey: 'character:' + nearDeath.characterId,
      subjectId: nearDeath.characterId,
      subjectName: nearDeath.name,
      first: false,
      bossOrNamed: false,
    };
  }

  // (d) first kill of the fight
  if (firstPossible) {
    const kill = lowestBy(kills, (e) => e.id);
    if (kill) {
      return {
        kind: 'kill',
        subjectKey: 'first',
        subjectId: kill.id,
        subjectName: kill.name,
        first: true,
        bossOrNamed: kill.bossOrNamed,
      };
    }
  }

  return null;
}
