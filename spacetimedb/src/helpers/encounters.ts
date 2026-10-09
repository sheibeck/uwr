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
import { effectiveEnemyLevel, placeSpawnLevel } from '../data/enemy_rules';
import { normalizeEnemyRole } from '../data/family_rules';
import { DENSITY_SR_PREFIX, densityWord, pullLeadIn, pullRefusal } from '../data/density_lines';
import { activeCombatIdForCharacter, appendPrivateEvent } from './events';
import { effectiveGroupId, fightRoster, getGroupOrSoloParticipants } from './group';
import { computeLocationTargetLevel, spawnEnemyWithTemplate } from './location';
import { poolsAt, settlePool } from './pools';
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
  /** The template name (examine and typed commands match a family by a member name). */
  name: string;
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
      name: String(template.name ?? ''),
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

// ---------------------------------------------------------------------------
// Reading a place (Plan 16: look, examine and the typed commands; D-03, D-07, D-26, D-55)
// ---------------------------------------------------------------------------

/**
 * Danger order (UI-SPEC Nearby "Order"): the highest density first, then the family's top level
 * (descending), then the name (case-insensitive), then the pool id. Wiped-out families sort last.
 */
export function compareDanger(a: PoolHere, b: PoolHere): number {
  if (a.level !== b.level) return b.level - a.level;
  if (a.lvHi !== b.lvHi) return a.lvHi > b.lvHi ? -1 : 1;
  const an = String(a.family.name ?? '').toLowerCase();
  const bn = String(b.family.name ?? '').toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.pool.id < b.pool.id ? -1 : a.pool.id > b.pool.id ? 1 : 0;
}

/** creaturePoolsHere in danger order. */
export function creaturePoolsByDanger(ctx: any, locationId: bigint, now: bigint): PoolHere[] {
  return creaturePoolsHere(ctx, locationId, now).sort(compareDanger);
}

/** `Lv a-b`, or `Lv a` when the range is one level (UI-SPEC family card). */
export function levelRangeLabel(lo: bigint, hi: bigint): string {
  return lo === hi ? `Lv ${lo}` : `Lv ${lo}-${hi}`;
}

/** Every name a family answers to: its name, plural noun, singular noun and member names. */
export function familyNames(here: PoolHere): string[] {
  const names = [here.family.name, here.family.pluralNoun, here.family.singularNoun, ...here.members.map((m) => m.name)];
  return names.map((n) => String(n ?? '').trim()).filter((n) => n !== '');
}

/** Whether a family answers to a name: exact (case-insensitive) or, when `exact` is false, contains. */
export function familyMatches(here: PoolHere, name: string, exact: boolean): boolean {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return false;
  return familyNames(here).some((n) => {
    const lower = n.toLowerCase();
    return exact ? lower === wanted : lower.includes(wanted);
  });
}

/** A resource pool of a place that can be gathered now (D-55), with its item template. */
export interface ResourceHere {
  pool: PlacePoolRow;
  template: any;
  name: string;
  level: DensityLevel;
}

/** Whether a pool's time of day ('any', 'day', 'night') allows it now (D-55). */
export function availableNow(timeOfDay: string, isNight: boolean): boolean {
  const when = (timeOfDay || 'any').trim().toLowerCase();
  if (when === 'night') return isNight;
  if (when === 'day') return !isNight;
  return true;
}

/**
 * The resource pools of a place available at this time of day, settled, in id order. A pool whose
 * item template is missing is skipped (it has no name to show).
 */
export function resourcePoolsNow(ctx: any, locationId: bigint, isNight: boolean, now: bigint): ResourceHere[] {
  const result: ResourceHere[] = [];
  for (const pool of poolsAt(ctx, locationId, 'resource', now)) {
    if (!availableNow(pool.timeOfDay, isNight)) continue;
    const template = ctx.db.item_template.id.find(pool.refId);
    if (!template) continue;
    result.push({ pool, template, name: String(template.name ?? ''), level: countToLevel(pool.count) });
  }
  return result;
}

/** A named enemy or an individual spawn at a place (D-07): never an ordinary family creature. */
export interface IndividualHere {
  kind: 'named' | 'spawn';
  name: string;
  /** The level it fights at here. */
  level: bigint;
  template: any;
  named?: any;
  spawn?: any;
}

const LIVING_SPAWN_STATES = new Set(['available', 'engaged', 'pulling']);

/**
 * An individual spawn: one linked to a World event, or one whose template belongs to no family
 * (a boss, a named enemy's fight, a boss_kill target). A legacy ordinary standing spawn (its template
 * is a family member) is not an individual and is never listed.
 */
export function isIndividualSpawn(ctx: any, spawn: any): boolean {
  for (const _link of ctx.db.event_spawn_enemy.by_spawn.filter(spawn.id)) return true;
  for (const _member of ctx.db.family_member.by_template.filter(spawn.enemyTemplateId)) return false;
  return true;
}

const byIdAsc = (a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The individuals a character sees at their place: their own living named enemies here first, then
 * the living individual spawns here (isIndividualSpawn), each in id order.
 */
export function individualsHere(ctx: any, character: any): IndividualHere[] {
  const result: IndividualHere[] = [];
  const locationId: bigint = character.locationId;
  const named = [...ctx.db.named_enemy.by_character.filter(character.id)]
    .filter((row: any) => row.locationId === locationId && row.isAlive === true)
    .sort(byIdAsc);
  if (named.length > 0) {
    const location = ctx.db.location.id.find(locationId);
    const target: bigint = computeLocationTargetLevel(ctx, locationId, 1n);
    const offset: bigint = location?.levelOffset ?? 0n;
    for (const row of named) {
      const template = ctx.db.enemy_template.id.find(row.enemyTemplateId);
      if (!template) continue;
      result.push({
        kind: 'named',
        name: String(row.name),
        level: placeSpawnLevel(template.level, target, offset),
        template,
        named: row,
      });
    }
  }
  const spawns = [...ctx.db.enemy_spawn.by_location.filter(locationId)]
    .filter((s: any) => LIVING_SPAWN_STATES.has(s.state))
    .sort(byIdAsc);
  for (const spawn of spawns) {
    const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
    if (!template) continue;
    if (!isIndividualSpawn(ctx, spawn)) continue;
    result.push({
      kind: 'spawn',
      name: String(spawn.name),
      level: effectiveEnemyLevel(spawn.level, template.level),
      template,
      spawn,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Finding and fighting by name (Plan 16: typed con and attack/fight/kill/pull; D-07, D-12, P3)
// ---------------------------------------------------------------------------

/**
 * Refusal lines of a family pull, shared by pull_family and the typed pull (PROPOSED, D-58: listed in
 * 51.3.1.1-11-SUMMARY.md). A wiped-out family uses density_lines pullRefusal.
 */
export const PULL_REFUSALS = Object.freeze({
  notHere: 'That is not here.',
  safe: 'Nothing will fight you here.',
  fighting: 'You are already in a fight.',
  gathering: 'Finish gathering first.',
});

/**
 * Lines of the typed fight commands (PROPOSED, D-58: listed in 51.3.1.1-16-SUMMARY.md). `nothing` and
 * `notHere` keep the existing wording of the old typed attack and of start_combat.
 */
export const FIGHT_TEXT = Object.freeze({
  nothing: 'There is nothing to fight here.',
  notHere: 'That enemy is not here to fight.',
  unknown: (name: string) => `No enemy named "${name}" here.`,
  unknownNearby: (name: string, nearby: string) => `No enemy named "${name}" here. Nearby: ${nearby}.`,
});

/**
 * The con threat phrasing by level difference (target level minus the character's level). The
 * singular lines are today's typed con wording; the plural forms (a family name such as "Goblins")
 * are PROPOSED (D-58).
 */
export function threatLine(subject: string, levelDiff: number, plural = false): string {
  const v = (one: string, many: string) => (plural ? many : one);
  if (levelDiff <= -10) return `${subject} would be trivial prey. Hardly worth the effort.`;
  if (levelDiff <= -5) return `${subject} ${v('poses', 'pose')} little threat. You could handle this in your sleep.`;
  if (levelDiff <= -2) return `${subject} ${v('is', 'are')} beneath you, but not entirely without teeth.`;
  if (levelDiff <= 1) return `${subject} ${v('appears', 'appear')} to be an even match. A fair fight awaits.`;
  if (levelDiff <= 4) return `${subject} ${v('looks', 'look')} dangerous. Proceed with caution.`;
  if (levelDiff <= 8) return `${subject} ${v('radiates', 'radiate')} menace. This would be a brutal fight — you may not survive.`;
  return `${subject} would wipe the floor with you. Turn back unless you have a death wish.`;
}

/** The typed con answer for a family: the threat for its top level here, then its population word. */
export function familyConLine(here: PoolHere, characterLevel: bigint): string {
  const threat = threatLine(String(here.family.name), Number(here.lvHi - characterLevel), true);
  return `${threat} ${DENSITY_SR_PREFIX.creature}${densityWord('creature', here.level)}.`;
}

/** The typed con answer for an individual (today's wording, plus the boss line). */
export function individualConLine(one: IndividualHere, characterLevel: bigint): string {
  let line = threatLine(one.name, Number(one.level - characterLevel));
  if (one.template?.isBoss) line += ' This creature carries the weight of something ancient and terrible.';
  return line;
}

/**
 * The creature pool at a place whose family answers to a name (family name, plural, singular or a
 * member's name), case-insensitive: an exact match first, then a contains match, each in danger order.
 * Only the pools at `locationId` are searched (T-51.3.1.1-51); wiped-out families are included, so a
 * pull on one refuses with the pull refusal.
 */
export function findFamilyPoolByName(ctx: any, locationId: bigint, name: string, now: bigint): PoolHere | null {
  const families = creaturePoolsByDanger(ctx, locationId, now);
  return (
    families.find((h) => familyMatches(h, name, true)) ??
    families.find((h) => familyMatches(h, name, false)) ??
    null
  );
}

/** What a typed name resolves to at the character's place. */
export type FightTarget = { kind: 'individual'; one: IndividualHere } | { kind: 'family'; here: PoolHere };

/**
 * A typed name at the character's place: exact matches first (individuals, named before spawns, then
 * families in danger order), then contains matches in the same order. Null when nothing answers.
 */
export function findFightTarget(ctx: any, character: any, name: string, now: bigint): FightTarget | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const individuals = individualsHere(ctx, character);
  const families = creaturePoolsByDanger(ctx, character.locationId, now);
  for (const exact of [true, false]) {
    const one = individuals.find((i) => {
      const lower = i.name.toLowerCase();
      return exact ? lower === wanted : lower.includes(wanted);
    });
    if (one) return { kind: 'individual', one };
    const here = families.find((h) => familyMatches(h, wanted, exact));
    if (here) return { kind: 'family', here };
  }
  return null;
}

/**
 * The target of a bare `attack`: the first living family in danger order, else the first individual
 * that can be fought (a named enemy, or an available spawn). Null when there is nothing to fight.
 */
export function firstFightTarget(ctx: any, character: any, now: bigint): FightTarget | null {
  const here = creaturePoolsByDanger(ctx, character.locationId, now).find((h) => h.level > 0);
  if (here) return { kind: 'family', here };
  const one = individualsHere(ctx, character).find((i) => i.kind === 'named' || i.spawn?.state === 'available');
  return one ? { kind: 'individual', one } : null;
}

/** The names a refusal lists as nearby: living families in danger order, then the individuals. */
export function nearbyFightNames(ctx: any, character: any, now: bigint): string[] {
  const families = creaturePoolsByDanger(ctx, character.locationId, now)
    .filter((h) => h.level > 0)
    .map((h) => String(h.family.name));
  return [...families, ...individualsHere(ctx, character).map((i) => i.name)];
}

/**
 * Pulls a creature family (SC3, D-11, D-12, D-32, D-56): the one body of the pull_family reducer and
 * the typed pull, so their refusals and draws are identical. Checks, in order: fighting, gathering,
 * the pool (missing, foreign, a resource pool or a missing family: not here), a safe place, then the
 * settled density (wiped out: the pull refusal), then draws from the fight roster's LOWEST level and
 * starts the fight with origin 'pull' and the lead-in line. Returns the refusal text, or null when
 * the fight started. `deps.startCombat` is the bound fight start from index.ts.
 */
export function pullFamilyFor(
  deps: { startCombat: (...args: any[]) => any },
  ctx: any,
  character: any,
  stored: PlacePoolRow | null | undefined,
  now: bigint,
): string | null {
  if (activeCombatIdForCharacter(ctx, character.id)) return PULL_REFUSALS.fighting;
  for (const _gather of ctx.db.resource_gather.by_character.filter(character.id)) return PULL_REFUSALS.gathering;

  // The pool must be a creature pool at the character's place, at a place that is not safe
  // (T-51.3.1.1-34, T-51.3.1.1-51). A missing, foreign or resource pool reads the same: not here.
  if (!stored || stored.kind !== 'creature' || stored.locationId !== character.locationId) return PULL_REFUSALS.notHere;
  const location = ctx.db.location.id.find(character.locationId);
  if (!location || location.isSafe) return PULL_REFUSALS.safe;
  const family = ctx.db.creature_family.id.find(stored.refId);
  if (!family) return PULL_REFUSALS.notHere;

  const pool = settlePool(ctx, stored, now).pool;
  if (countToLevel(pool.count) === 0) return pullRefusal(family.pluralNoun);

  // The fight roster (online, here, not in another fight) and its LOWEST level (D-56).
  const candidates = getGroupOrSoloParticipants(ctx, character);
  const roster = fightRoster(character, candidates, (characterId: bigint) => activeCombatIdForCharacter(ctx, characterId) !== null);
  const drawn = drawForPull(ctx, pool, family, rosterLevel(roster), character.id, now);
  if (drawn.length === 0) return pullRefusal(family.pluralNoun);

  startPoolFight(deps, ctx, {
    leader: character,
    candidates,
    groupId: effectiveGroupId(character) ?? null,
    pool,
    family,
    drawn,
    originKind: 'pull',
    line: { kind: 'combat', text: pullLeadIn(drawn.length, family.singularNoun, family.pluralNoun) },
  });
  return null;
}

/**
 * Starts the fight with an individual (D-07): a named enemy as pull_named_enemy does (spawn one with
 * spawnEnemyWithTemplate, mark it slain, startCombatForSpawn, "You engage {name}!"), or an available
 * spawn as start_combat does. Returns the refusal text, or null when the fight started.
 * `deps.startCombatForSpawn` is the bound form from index.ts.
 */
export function fightIndividualFor(
  deps: { startCombatForSpawn: (...args: any[]) => any },
  ctx: any,
  character: any,
  one: IndividualHere,
): string | null {
  if (activeCombatIdForCharacter(ctx, character.id)) return PULL_REFUSALS.fighting;
  for (const _gather of ctx.db.resource_gather.by_character.filter(character.id)) return PULL_REFUSALS.gathering;
  const groupId = effectiveGroupId(character) ?? null;

  if (one.kind === 'named') {
    const named = ctx.db.named_enemy.id.find(one.named.id);
    if (!named || named.characterId !== character.id || named.isAlive !== true || named.locationId !== character.locationId) {
      return FIGHT_TEXT.notHere;
    }
    let spawn: any;
    try {
      // Throws before any write (safe place, not tracked here, wrong time of day).
      spawn = spawnEnemyWithTemplate(ctx, character.locationId, named.enemyTemplateId);
    } catch (err: any) {
      return String(err?.message ?? FIGHT_TEXT.notHere);
    }
    ctx.db.named_enemy.id.update({ ...named, isAlive: false, lastKilledAt: ctx.timestamp });
    deps.startCombatForSpawn(ctx, character, spawn, getGroupOrSoloParticipants(ctx, character), groupId);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat', `You engage ${named.name}!`);
    return null;
  }

  const spawn = ctx.db.enemy_spawn.id.find(one.spawn.id);
  if (!spawn || spawn.locationId !== character.locationId || spawn.state !== 'available') return FIGHT_TEXT.notHere;
  const participants = getGroupOrSoloParticipants(ctx, character);
  for (const p of participants) {
    if (activeCombatIdForCharacter(ctx, p.id)) return `${p.name} is already in combat`;
  }
  deps.startCombatForSpawn(ctx, character, spawn, participants, groupId);
  return null;
}
