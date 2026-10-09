// encounters.ts
// The one encounter layer of Phase 51.3.1.1 (D-10, D-11, D-13, D-56; RESEARCH Section 1). Every
// encounter (a family pull, a travel ambush, a gather ambush, the quest-item ambush) goes through it:
//   - creaturePoolsHere: the settled creature pools of a place with their family and members;
//   - rollEncounter: one seeded roll over those pools (density x temperament x level gap);
//   - drawGroup / drawForPull: the group a hit family sends, sized by density, roles by rule;
//   - startPoolFight: the lead-in or ambush line to the fight roster, then deps.startCombat.
//
// Deterministic: every roll is seeded from (server timestamp, leader, place, phase) through the
// density rules (encounterSeed + a fixed POOL_ROLL index); no Math.random, no timestamp modulo.
// It never imports reducers/combat.ts at run time (that would be an import cycle): the fight start
// comes in through deps.startCombat, the bound form index.ts builds.

import {
  POOL_ROLL,
  composeGroupRoles,
  countToLevel,
  encounterChanceBp,
  encounterHit,
  encounterSeed,
  groupSizeFor,
  partyLevel,
  pickEncounterPool,
} from '../data/density_rules';
import type { DensityLevel, EncounterPhase } from '../data/density_rules';
import { rollBelow } from '../data/economy_rules';
import { placeSpawnLevel } from '../data/enemy_rules';
import { normalizeEnemyRole } from '../data/family_rules';
import { activeCombatIdForCharacter, appendPrivateEvent } from './events';
import { fightRoster } from './group';
import { computeLocationTargetLevel } from './location';
import { poolsAt } from './pools';
import type { PlacePoolRow } from './pools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Type-only references to the fight start (no run-time import of reducers/combat.ts).
type DrawnEnemy = import('../reducers/combat').DrawnEnemy;
type CombatOrigin = import('../reducers/combat').CombatOrigin;
type CombatOriginKind = import('../reducers/combat').CombatOriginKind;

/** One member of a family as it fights at a place. */
export interface PoolMember {
  templateId: bigint;
  /** The server role (tank, damage, healer, caster). */
  role: string;
  /** The level it fights at here (placeSpawnLevel of the place target and offset). */
  level: bigint;
}

/** A settled creature pool of a place with its family, density level, level range and members. */
export interface PoolHere {
  pool: PlacePoolRow;
  family: any;
  level: DensityLevel;
  lvLo: bigint;
  lvHi: bigint;
  members: PoolMember[];
}

/** An encounter hit: the pool, its family, its density level at the roll and the roll's seed. */
export interface EncounterHit {
  pool: PlacePoolRow;
  family: any;
  level: DensityLevel;
  seed: bigint;
  members: PoolMember[];
}

export interface RollEncounterInput {
  locationId: bigint;
  isSafe: boolean;
  partyLevel: bigint;
  phase: EncounterPhase;
  leaderId: bigint;
  now: bigint;
  /** A share of the place chance in percent (GATHER_AMBUSH_FACTOR_PCT, QUEST_ITEM_AMBUSH_FACTOR_PCT). */
  factorPct?: number;
}

/** The line written to the fight roster before the fight starts. */
export interface EncounterLine {
  kind: 'combat' | 'ambush';
  text: string;
}

export interface StartPoolFightInput {
  leader: any;
  candidates: any[];
  groupId: bigint | null;
  pool: PlacePoolRow;
  family: any;
  drawn: DrawnEnemy[];
  originKind: CombatOriginKind;
  line: EncounterLine | null;
}

// ---------------------------------------------------------------------------
// Pools of a place
// ---------------------------------------------------------------------------

/** A family's members at a place, in family_member id order (missing templates skipped). */
function membersAt(ctx: any, familyId: bigint, locationId: bigint): PoolMember[] {
  const location = ctx.db.location.id.find(locationId);
  const target: bigint = computeLocationTargetLevel(ctx, locationId, 1n);
  const offset: bigint = location?.levelOffset ?? 0n;
  const rows = [...ctx.db.family_member.by_family.filter(familyId)].sort((a: any, b: any) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const members: PoolMember[] = [];
  for (const row of rows) {
    const template = ctx.db.enemy_template.id.find(row.enemyTemplateId);
    if (!template) continue;
    members.push({
      templateId: template.id,
      role: normalizeEnemyRole(row.role || template.role),
      level: placeSpawnLevel(template.level, target, offset),
    });
  }
  return members;
}

function levelRange(members: readonly PoolMember[]): { lo: bigint; hi: bigint } {
  if (members.length === 0) return { lo: 0n, hi: 0n };
  let lo = members[0]!.level;
  let hi = members[0]!.level;
  for (const m of members) {
    if (m.level < lo) lo = m.level;
    if (m.level > hi) hi = m.level;
  }
  return { lo, hi };
}

/**
 * The creature pools of a place, each settled first (helpers/pools.ts poolsAt), in id order, with its
 * creature_family row (temperament, nouns, ambush words), density level, level range and members.
 * A pool whose family row is missing is skipped.
 */
export function creaturePoolsHere(ctx: any, locationId: bigint, now: bigint): PoolHere[] {
  const result: PoolHere[] = [];
  for (const pool of poolsAt(ctx, locationId, 'creature', now)) {
    const family = ctx.db.creature_family.id.find(pool.refId);
    if (!family) continue;
    const members = membersAt(ctx, family.id, locationId);
    const range = levelRange(members);
    result.push({ pool, family, level: countToLevel(pool.count), lvLo: range.lo, lvHi: range.hi, members });
  }
  return result;
}

/** The party level every encounter uses: the LOWEST member of the roster (D-56). */
export function rosterLevel(characters: readonly any[]): bigint {
  return partyLevel(characters.map((c: any) => BigInt(c.level ?? 1n)));
}

// ---------------------------------------------------------------------------
// Roll and draw
// ---------------------------------------------------------------------------

/**
 * One encounter roll at a place (D-10): null at a safe place, when every family is wiped out or far
 * below the party, or when the seeded roll misses. On a hit, the pool is picked weighted by each
 * pool's own chance. Seed: encounterSeed(now, leader, place, phase).
 */
export function rollEncounter(ctx: any, input: RollEncounterInput): EncounterHit | null {
  if (input.isSafe) return null;
  const here = creaturePoolsHere(ctx, input.locationId, input.now);
  const pools = here.map((h) => ({ level: h.level, temperament: h.family.temperament ?? '', lvHi: h.lvHi, here: h }));
  const bp = encounterChanceBp({ isSafe: false, pools, partyLevel: input.partyLevel, factorPct: input.factorPct });
  if (bp <= 0) return null;
  const seed = encounterSeed(input.now, input.leaderId, input.locationId, input.phase);
  if (!encounterHit(seed, bp)) return null;
  const pick = pickEncounterPool(seed, pools, input.partyLevel);
  if (!pick) return null;
  return { pool: pick.here.pool, family: pick.here.family, level: pick.here.level, seed, members: pick.here.members };
}

/**
 * The group a family sends (D-11): the size from its density level (Scarce 1, Stable 1-2, Overrun
 * 2-4), one fewer when its top level here is GROUP_TRIM_GAP or more above the party; the roles by
 * composeGroupRoles (slot 0 a tank or damage member, support capped, never only support); for each
 * slot a member of that role (POOL_ROLL.MEMBER_BASE + slot). Each enemy fights at its place level,
 * with spawnId 0n and poolId = the pool. Empty for a wiped-out family or one without members.
 */
export function drawGroup(
  ctx: any,
  input: { pool: PlacePoolRow; family: any; partyLevel: bigint; seed: bigint },
): DrawnEnemy[] {
  const members = membersAt(ctx, input.family.id, input.pool.locationId);
  if (members.length === 0) return [];
  const level = countToLevel(input.pool.count);
  const { hi } = levelRange(members);
  const size = groupSizeFor(level, Number(hi - input.partyLevel), input.seed);
  if (size <= 0) return [];
  const available = [...new Set(members.map((m) => m.role))];
  const roles = composeGroupRoles(size, available, input.seed);
  return roles.map((role, slot) => {
    const ofRole = members.filter((m) => m.role === role);
    const from = ofRole.length > 0 ? ofRole : members;
    const member = from[Number(rollBelow(input.seed, POOL_ROLL.MEMBER_BASE + BigInt(slot), BigInt(from.length)))]!;
    return { enemyTemplateId: member.templateId, level: member.level, spawnId: 0n, poolId: input.pool.id };
  });
}

/** The draw of a family pull: drawGroup seeded with the 'pull' phase of the leader at the pool's place. */
export function drawForPull(
  ctx: any,
  pool: PlacePoolRow,
  family: any,
  partyLevelValue: bigint,
  leaderId: bigint,
  now: bigint,
): DrawnEnemy[] {
  const seed = encounterSeed(now, leaderId, pool.locationId, 'pull');
  return drawGroup(ctx, { pool, family, partyLevel: partyLevelValue, seed });
}

// ---------------------------------------------------------------------------
// Fight start
// ---------------------------------------------------------------------------

/**
 * Starts a pool fight: writes the lead-in (kind 'combat') or ambush line (kind 'ambush') privately to
 * each member of the fight roster (fightRoster, the rule startCombat applies too), then calls
 * deps.startCombat(ctx, leader, candidates, groupId, drawn, origin) with the family as the origin and
 * the pool's density level at the draw (D-32). Returns the fight row, or null for an empty draw.
 */
export function startPoolFight(deps: { startCombat: (...args: any[]) => any }, ctx: any, input: StartPoolFightInput): any {
  if (input.drawn.length === 0) return null;
  if (input.line) {
    const roster = fightRoster(input.leader, input.candidates, (characterId: bigint) => activeCombatIdForCharacter(ctx, characterId) !== null);
    for (const member of roster) {
      appendPrivateEvent(ctx, member.id, member.ownerUserId, input.line.kind, input.line.text);
    }
  }
  const origin: CombatOrigin = {
    kind: input.originKind,
    familyId: input.family.id,
    level: countToLevel(input.pool.count),
    name: input.family.name,
    plural: input.family.pluralNoun,
  };
  return deps.startCombat(ctx, input.leader, input.candidates, input.groupId, input.drawn, origin);
}
