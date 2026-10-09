// Nearby view models for the density pools (51.3.1.1-19; UI-SPEC "Nearby: Creatures", "Nearby:
// Named & quest targets", "Nearby: Resources", "Nearby: Also here" and UI Considerations Q1-Q3).
//
// Pure: rows in, rows out. Every density word, line, hint and empty line comes from the shared
// copy in @game-data/density_lines (PROPOSED, D-58); the group and action labels below are the
// Nearby copy of the same review. Difficulty comes from combat/difficulty (conFor), never from
// here. Numbers stay hidden (D-05): the only digits produced are the 'Lv a–b' range and the
// named sub-line's 'Lv n'; pool rows carry levels 0-3 only, and a harvest cap is only yes or no.
//
// Ordinary enemies are never individual rows: a family is one card with a Pull (D-01, D-03, D-12).
// Named enemies (the player's own named_enemy rows) and World event spawns (enemy_spawn rows here;
// the event link is server-side only, so every spawn here is treated as an individual) are cards
// with a Fight (D-07, D-39). Wiped-out families and Exhausted resources stay listed with their
// quiet line and no button (D-30, B7).
import {
  NOTHING_HUNTS,
  SLAIN_NAMED_LINE,
  allExhaustedLine,
  creatureLine,
  densityWord,
  groupHint,
  harvestCapRefusal,
  resourceLine,
} from '@game-data/density_lines';
import { effectiveEnemyLevel, placeSpawnLevel } from '@game-data/enemy_rules';
import { conFor } from '../combat/difficulty';
import type { ConView } from '../combat/difficulty';
import { enemyStatus } from './enemies';

/** The Nearby group and action labels (PROPOSED, D-58; listed for the phase copy review). */
export const NEARBY_COPY = {
  groups: {
    creatures: 'Creatures',
    named: 'Named & quest targets',
    resources: 'Resources',
    alsoHere: 'Also here',
  },
  actions: { pull: 'Pull', fight: 'Fight', gather: 'Gather' },
  named: { named: 'Named', boss: 'Boss', questPrefix: 'Quest: ', inCombat: 'In combat' },
} as const;

/** The disabled Gather reason while a gather runs (the existing wording of the exits and the server). */
export const GATHER_BUSY_REASON = 'Finish gathering first.';

const SEP = ' · ';

export type BadgeLevel = 0 | 1 | 2 | 3;

/** The pool_level fields the cards read (generated row shape). */
export interface PoolLike {
  id: bigint;
  locationId: bigint;
  kind: string;
  level: bigint;
  lvLo: bigint;
  lvHi: bigint;
  name: string;
  iconKey: string;
  temperament: string;
  singularNoun: string;
  pluralNoun: string;
  timeOfDay: string;
}

export interface FamilyRow {
  poolId: bigint;
  name: string;
  iconKey: string;
  /** 'Lv 4–5', or 'Lv 4' when the range is one level. */
  levelText: string;
  /** Difficulty of the range top for the player; null while the player level is unknown. */
  con: ConView | null;
  badgeWord: string;
  badgeLevel: BadgeLevel;
  line: string;
  /** The group-size hint; '' when wiped out. */
  hint: string;
  /** Level above 0: the card has a Pull button. */
  pullable: boolean;
  pullLabel: string;
  /** '{name} · {con meaning}', or the bare name while the difficulty is unknown. */
  title: string;
}

export type NamedState = 'alive' | 'inCombat' | 'slain';

export interface NamedRow {
  /** Stable keep-focus and v-for key: 'named-{id}' or 'event-{id}'. */
  key: string;
  /** 'named': a named_enemy row (pull_named_enemy); 'event': a World event spawn (start_combat). */
  kind: 'named' | 'event';
  id: bigint;
  name: string;
  /** A boss (PhSkull); otherwise a named enemy (PhCrownSimple). */
  boss: boolean;
  levelText: string | null;
  con: ConView | null;
  subLine: string;
  state: NamedState;
  fightable: boolean;
  fightLabel: string;
  title: string;
}

export interface ResourceRow {
  poolId: bigint;
  name: string;
  iconKey: string;
  badgeWord: string;
  badgeLevel: BadgeLevel;
  line: string;
  /** The visible disabled reason (harvest cap or a gather in progress); null when Gather is free. */
  reason: string | null;
  capped: boolean;
  /** Level above 0: the card has a Gather button. */
  gatherable: boolean;
  gatherLabel: string;
  title: string;
}

function badgeLevel(level: bigint): BadgeLevel {
  if (level <= 0n) return 0;
  if (level >= 3n) return 3;
  return Number(level) as BadgeLevel;
}

function byName(a: { name: string; id: bigint }, b: { name: string; id: bigint }): number {
  const order = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (order !== 0) return order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function desc(a: bigint, b: bigint): number {
  return a > b ? -1 : a < b ? 1 : 0;
}

function levelRange(lo: bigint, hi: bigint): string {
  return lo === hi || lo <= 0n ? `Lv ${hi}` : `Lv ${lo}–${hi}`;
}

/** One card per creature family here, danger first; wiped-out families last. */
export function familyRows(pools: readonly PoolLike[], playerLevel: bigint | null, place: string): FamilyRow[] {
  const rows: (FamilyRow & { id: bigint; density: bigint; lvHi: bigint })[] = [];
  for (const pool of pools) {
    if (pool.kind !== 'creature') continue;
    const plural = pool.pluralNoun.trim() || pool.name;
    const singular = pool.singularNoun.trim() || plural;
    const con = playerLevel === null ? null : conFor(pool.lvHi, playerLevel);
    rows.push({
      id: pool.id,
      density: pool.level,
      lvHi: pool.lvHi,
      poolId: pool.id,
      name: pool.name,
      iconKey: pool.iconKey,
      levelText: levelRange(pool.lvLo, pool.lvHi),
      con,
      badgeWord: densityWord('creature', pool.level),
      badgeLevel: badgeLevel(pool.level),
      line: creatureLine({ plural, singular, temperament: pool.temperament, level: pool.level, place }),
      hint: groupHint(pool.level),
      pullable: pool.level > 0n,
      pullLabel: `${NEARBY_COPY.actions.pull} ${pool.name}`,
      title: con === null ? pool.name : `${pool.name}${SEP}${con.meaning}`,
    });
  }
  rows.sort((a, b) => {
    const wipedA = a.density <= 0n ? 1 : 0;
    const wipedB = b.density <= 0n ? 1 : 0;
    if (wipedA !== wipedB) return wipedA - wipedB;
    return desc(a.density, b.density) || desc(a.lvHi, b.lvHi) || byName(a, b);
  });
  return rows.map(({ id: _id, density: _density, lvHi: _lvHi, ...row }) => row);
}

interface NamedLike {
  id: bigint;
  name: string;
  enemyTemplateId: bigint;
  isAlive: boolean;
}

interface SpawnLike {
  id: bigint;
  name: string;
  state: string;
  lockedCombatId?: bigint | null;
  enemyTemplateId: bigint;
  level?: bigint;
}

interface TemplateLike {
  id: bigint;
  level: bigint;
  isBoss?: boolean | null;
}

/** An active quest that targets an enemy template (the caller joins quest instances and templates). */
export interface QuestTargetLike {
  name: string;
  targetEnemyTemplateId: bigint;
}

function namedRow(input: {
  kind: 'named' | 'event';
  id: bigint;
  name: string;
  template: TemplateLike | undefined;
  level: bigint | undefined;
  state: NamedState;
  quest: QuestTargetLike | undefined;
  playerLevel: bigint | null;
}): NamedRow & { sortLevel: bigint } {
  const boss = input.template?.isBoss === true;
  const levelText = input.level === undefined ? null : `Lv ${input.level}`;
  const con = input.level === undefined || input.playerLevel === null ? null : conFor(input.level, input.playerLevel);
  let subLine: string;
  if (input.state === 'slain') {
    subLine = SLAIN_NAMED_LINE;
  } else {
    const parts: string[] = [boss ? NEARBY_COPY.named.boss : NEARBY_COPY.named.named];
    if (input.quest) parts.push(`${NEARBY_COPY.named.questPrefix}${input.quest.name}`);
    if (levelText !== null) parts.push(levelText);
    if (input.state === 'inCombat') parts.push(NEARBY_COPY.named.inCombat);
    subLine = parts.join(SEP);
  }
  return {
    key: `${input.kind}-${input.id}`,
    kind: input.kind,
    id: input.id,
    name: input.name,
    boss,
    levelText,
    con,
    subLine,
    state: input.state,
    fightable: input.state === 'alive',
    fightLabel: `${NEARBY_COPY.actions.fight} ${input.name}`,
    title: con === null ? input.name : `${input.name}${SEP}${con.meaning}`,
    sortLevel: input.level ?? -1n,
  };
}

/**
 * The place a named enemy stands at, as the server levels it: the place's target level
 * (placeTargetLevel, the server's computeLocationTargetLevel) and its levelOffset.
 */
export interface NamedPlace {
  target: bigint;
  levelOffset: bigint;
}

/**
 * The named, boss and quest individuals here: the player's own named enemies at this place and the
 * World event spawns here. Living before slain, then level desc, then name.
 *
 * A named enemy's level is the place-scaled level the server shows in the look text and fights at
 * (placeSpawnLevel of the template level in the place band, else the place target; WR-03). With no
 * place (its row or region not loaded) the named rows omit the level rather than show a wrong one.
 */
export function namedRows(
  namedHere: readonly NamedLike[],
  eventSpawnsHere: readonly SpawnLike[],
  templates: readonly TemplateLike[],
  quests: readonly QuestTargetLike[],
  playerLevel: bigint | null,
  place: NamedPlace | null,
): NamedRow[] {
  const templateById = new Map<bigint, TemplateLike>();
  for (const template of templates) templateById.set(template.id, template);
  const questFor = (templateId: bigint) => quests.find((quest) => quest.targetEnemyTemplateId === templateId);

  const rows: (NamedRow & { sortLevel: bigint })[] = [];
  for (const enemy of namedHere) {
    const template = templateById.get(enemy.enemyTemplateId);
    rows.push(
      namedRow({
        kind: 'named',
        id: enemy.id,
        name: enemy.name,
        template,
        level:
          template === undefined || place === null
            ? undefined
            : placeSpawnLevel(template.level, place.target, place.levelOffset),
        state: enemy.isAlive ? 'alive' : 'slain',
        quest: questFor(enemy.enemyTemplateId),
        playerLevel,
      }),
    );
  }
  for (const spawn of eventSpawnsHere) {
    const status = enemyStatus(spawn);
    if (status === null) continue;
    const template = templateById.get(spawn.enemyTemplateId);
    rows.push(
      namedRow({
        kind: 'event',
        id: spawn.id,
        name: spawn.name,
        template,
        level: effectiveEnemyLevel(spawn.level, template?.level),
        // A spawn being pulled is as unavailable as one in a fight.
        state: status === 'available' ? 'alive' : 'inCombat',
        quest: questFor(spawn.enemyTemplateId),
        playerLevel,
      }),
    );
  }
  rows.sort((a, b) => {
    const slainA = a.state === 'slain' ? 1 : 0;
    const slainB = b.state === 'slain' ? 1 : 0;
    if (slainA !== slainB) return slainA - slainB;
    return desc(a.sortLevel, b.sortLevel) || byName(a, b);
  });
  return rows.map(({ sortLevel: _sortLevel, ...row }) => row);
}

/** True when the pool is available now; an unknown time of day (null) lists every pool. */
function availableNow(timeOfDay: string, isNight: boolean | null): boolean {
  if (isNight === null) return true;
  const time = timeOfDay.trim().toLowerCase();
  if (time === 'day') return !isNight;
  if (time === 'night') return isNight;
  return true;
}

/**
 * One card per resource pool here that is available at this time of day (D-26, D-55), densest first.
 * Gather is disabled with a visible reason under the harvest cap of this place (cappedUntilMicros
 * after now) or while a gather runs; an Exhausted pool has no Gather and no reason.
 */
export function resourceRows(
  pools: readonly PoolLike[],
  isNight: boolean | null,
  caps: readonly { locationId: bigint; cappedUntilMicros: bigint }[],
  gathering: boolean,
  now: bigint,
  place: string,
): ResourceRow[] {
  const rows: (ResourceRow & { id: bigint; density: bigint })[] = [];
  for (const pool of pools) {
    if (pool.kind !== 'resource' || !availableNow(pool.timeOfDay, isNight)) continue;
    const capped = caps.some((cap) => cap.locationId === pool.locationId && cap.cappedUntilMicros > now);
    const gatherable = pool.level > 0n;
    let reason: string | null = null;
    if (gatherable && capped) reason = harvestCapRefusal();
    else if (gatherable && gathering) reason = GATHER_BUSY_REASON;
    rows.push({
      id: pool.id,
      density: pool.level,
      poolId: pool.id,
      name: pool.name,
      iconKey: pool.iconKey,
      badgeWord: densityWord('resource', pool.level),
      badgeLevel: badgeLevel(pool.level),
      line: resourceLine({ resource: pool.name, level: pool.level, place }),
      reason,
      capped,
      gatherable,
      gatherLabel: `${NEARBY_COPY.actions.gather} ${pool.name}`,
      title: pool.name,
    });
  }
  rows.sort((a, b) => desc(a.density, b.density) || byName(a, b));
  return rows.map(({ id: _id, density: _density, ...row }) => row);
}

/** True only with at least one resource row and every row Exhausted. */
export function allExhausted(rows: readonly ResourceRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.badgeLevel === 0);
}

export interface NearbyGroups {
  /** null: no Creatures group (safe, uncharted or not ready). emptyLine: 'Nothing hunts here now.' */
  creatures: { rows: FamilyRow[]; emptyLine: string | null } | null;
  /** null: no Named & quest targets group. */
  named: NamedRow[] | null;
  /** null: no Resources group. summary: the all-Exhausted line after the cards. */
  resources: { rows: ResourceRow[]; summary: string | null } | null;
  /** The 'Also here' label: only over at least one other row, and only when a group above renders. */
  alsoHereLabel: boolean;
  /** 'No one is nearby.': ready, and no families, named, resources or anyone else. */
  nothingAtAll: boolean;
}

/**
 * The Nearby groups of a place (UI Considerations Q1-Q3). Nothing pool-based renders until the
 * place's pool rows have applied (`ready`), so no group flashes empty. A safe or uncharted place has
 * no Creatures group; any other place shows its families or 'Nothing hunts here now.'.
 */
export function nearbyGroups(input: {
  isSafe: boolean;
  isUncharted: boolean;
  ready: boolean;
  families: readonly FamilyRow[];
  named: readonly NamedRow[];
  resources: readonly ResourceRow[];
  /** The place noun phrase for the all-Exhausted line. */
  place: string;
  /** NPC, bind stone, object and player rows ('Also here'). */
  others: number;
}): NearbyGroups {
  if (!input.ready) {
    return { creatures: null, named: null, resources: null, alsoHereLabel: false, nothingAtAll: false };
  }
  const creatures =
    input.isSafe || input.isUncharted
      ? null
      : { rows: [...input.families], emptyLine: input.families.length === 0 ? NOTHING_HUNTS : null };
  const named = input.named.length === 0 ? null : [...input.named];
  const resources =
    input.resources.length === 0
      ? null
      : { rows: [...input.resources], summary: allExhausted(input.resources) ? allExhaustedLine(input.place) : null };
  const anyGroup = creatures !== null || named !== null || resources !== null;
  return {
    creatures,
    named,
    resources,
    alsoHereLabel: anyGroup && input.others > 0,
    nothingAtAll: !anyGroup && input.others === 0,
  };
}
