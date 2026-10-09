// Hostile rows for the encounter rail, strip and sheet (48-UI-SPEC "Encounter panel", CMB-01/CMB-03).
//
// One HostileView per combat_enemy row of the fight, in ascending enemy id (the engine's
// resolution order). Everything a component needs is derived here so the components only
// render text nodes and apply classes. Names are server or model text and pass through
// concatenation only, never markup.
import { effectiveEnemyLevel } from '@game-data/enemy_rules';
import {
  densityWord,
  encounterHeading as sharedEncounterHeading,
  encounterSource,
  sentenceCase,
} from '@game-data/density_lines';
import { barFraction } from '../frame/vitals';
import { effectIcon, effectName, effectPolarity, effectTimeText, type EffectView } from '../rails/effects';
import { enemyEffectKind, kindLabel } from './kindLabel';
import { conFor, type ConView } from './difficulty';
import { roleView, type RoleView } from './roles';
import {
  enemyAbilityName,
  landsInAtAnnouncement,
  landsInLive,
  windupParts,
  windupTarget,
  type WindupParts,
} from './windup';

export interface HostileEnemyRow {
  id: bigint;
  enemyTemplateId: bigint;
  displayName: string;
  currentHp: bigint;
  maxHp: bigint;
  /** combat_enemy.level; 0 (or absent) means a row from before the column. */
  level?: bigint;
  /** The enemy's aggro target (server-written, Plan 05); a pet target clears the character column. */
  aggroTargetCharacterId?: bigint | null;
  /** Checked first: the old pet taunt may still write both columns. */
  aggroTargetPetId?: bigint | null;
  /** The ally of an announced or landed heal/shield; 0n = none (Plan 05). */
  healTargetEnemyId?: bigint | null;
}

export interface HostileTemplateRow {
  id: bigint;
  level: bigint;
  isBoss?: boolean;
  /** The server role (tank, damage, healer, caster) or an older world word; read through roleView. */
  role?: string;
}

export interface HostileAbilityRow {
  enemyTemplateId: bigint;
  abilityKey: string;
  name: string;
}

export interface HostileCastRow {
  id: bigint;
  enemyId: bigint;
  abilityKey: string;
  targetCharacterId?: bigint | null;
  targetPetId?: bigint | null;
  announcedRound: bigint;
  landsAtRound: bigint;
}

/** Effect chips on a hostile row before the "+N" chip (desktop rail and sheet). */
export const HOSTILE_EFFECT_LIMIT = 3;

/** Effect chips on a mobile strip chip before the "+N" chip. */
export const STRIP_EFFECT_LIMIT = 1;

/** One combat_enemy_effect row. */
export interface HostileEffectRow {
  id: bigint;
  enemyId: bigint;
  effectType: string;
  magnitude: bigint;
  roundsRemaining: bigint;
  sourceAbility?: string | null;
}

/**
 * What the enemy is doing, for the card's target line (51.3.1.1 UI-SPEC "Enemy target line"). Phase
 * 51.3.2 replaces the sources but keeps this shape. A defeated enemy has kind 'none' and reads
 * 'Out of the fight' from its `defeated` flag.
 */
export interface HostileIntent {
  kind: 'targeting' | 'healing' | 'none';
  /** The target's display name ('you' for the viewer); null for 'none'. */
  name: string | null;
  /** The target is the viewer. */
  self: boolean;
}

export interface HostileView {
  id: bigint;
  name: string;
  /** Role chip: Tank, Damage, Caster, Support (server healer), Named or Boss. */
  role: RoleView;
  intent: HostileIntent;
  /** 'Lv 4' from the enemy's fight level (or its template's); null when neither is known. */
  levelText: string | null;
  con: ConView;
  isBoss: boolean;
  hp: bigint;
  maxHp: bigint;
  /** '212/480'; 'Down' once defeated. */
  hpText: string;
  /** Bar width, '44%'. */
  widthPercent: string;
  /** Whole percent for aria-valuenow and the label. */
  percent: number;
  defeated: boolean;
  targeted: boolean;
  windups: WindupParts[];
  /** Effects on this enemy in ascending id; none once it is defeated. */
  effects: EffectView[];
  ariaLabel: string;
  title: string;
}

export interface HostileViewsInput {
  enemies: readonly HostileEnemyRow[];
  templates: readonly HostileTemplateRow[];
  abilities: readonly HostileAbilityRow[];
  casts: readonly HostileCastRow[];
  /** combat_enemy_effect rows of the fight; omitted means none. */
  effects?: readonly HostileEffectRow[];
  /** Open round number, or null when no round row is known (casts then use the announcement N). */
  currentRound: bigint | null;
  playerLevel: bigint;
  targetId: bigint | null;
  selfId: bigint | null;
  characterNames: ReadonlyMap<bigint, string>;
  petNames: ReadonlyMap<bigint, string>;
  /** Template ids of the viewer's named enemies (named_enemy rows); such an enemy reads Named. */
  namedTemplateIds?: ReadonlySet<bigint>;
  /** The fight's origin is 'named' (a single named enemy); every enemy reads Named. */
  namedFight?: boolean;
}

const NO_INTENT: HostileIntent = Object.freeze({ kind: 'none', name: null, self: false }) as HostileIntent;

function isSet(id: bigint | null | undefined): id is bigint {
  return id !== null && id !== undefined && id > 0n;
}

function compareIds(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Chips for the effects on one enemy. Text reads '{Type} · N rounds' with the type in the server
 * vocabulary's words ('Damage over time'); the compact text is the rounds alone ('3 rounds'). The
 * title names the effect, and the aria text reads '{effect} on {enemy}, N rounds left'. Effect names
 * are server or model text and pass through concatenation only.
 */
export function enemyEffectViews(rows: readonly HostileEffectRow[], enemyName: string): EffectView[] {
  return [...rows]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((row): EffectView => {
      const polarity = effectPolarity(row.effectType, row.magnitude);
      const name = effectName(row);
      const type = kindLabel(enemyEffectKind(row.effectType, row.magnitude));
      const timeText = effectTimeText(row.roundsRemaining, true);
      const text = timeText === null ? type : `${type} · ${timeText}`;
      return {
        id: row.id,
        name,
        polarity,
        icon: effectIcon(row.effectType, polarity),
        timeText,
        text,
        compactText: timeText === null ? type : timeText,
        title: `${name} · ${text}`,
        ariaText: timeText === null ? `${name} on ${enemyName}` : `${name} on ${enemyName}, ${timeText} left`,
      };
    });
}

export function hostileViews(input: HostileViewsInput): HostileView[] {
  const templateById = new Map<bigint, HostileTemplateRow>();
  for (const template of input.templates) templateById.set(template.id, template);

  const castsByEnemy = new Map<bigint, HostileCastRow[]>();
  for (const cast of [...input.casts].sort((a, b) => compareIds(a.id, b.id))) {
    const list = castsByEnemy.get(cast.enemyId);
    if (list) list.push(cast);
    else castsByEnemy.set(cast.enemyId, [cast]);
  }

  const effectsByEnemy = new Map<bigint, HostileEffectRow[]>();
  for (const effect of input.effects ?? []) {
    const list = effectsByEnemy.get(effect.enemyId);
    if (list) list.push(effect);
    else effectsByEnemy.set(effect.enemyId, [effect]);
  }

  const enemyById = new Map<bigint, HostileEnemyRow>();
  for (const enemy of input.enemies) enemyById.set(enemy.id, enemy);

  // Healing a living ally first; then the aggro target (pet column first). A target whose name has
  // not arrived yet shows no line until the character or pet rows apply.
  const intentOf = (enemy: HostileEnemyRow): HostileIntent => {
    if (enemy.currentHp <= 0n) return NO_INTENT;
    if (isSet(enemy.healTargetEnemyId)) {
      const ally = enemyById.get(enemy.healTargetEnemyId);
      if (ally && ally.currentHp > 0n) return { kind: 'healing', name: ally.displayName, self: false };
    }
    if (isSet(enemy.aggroTargetPetId)) {
      const pet = input.petNames.get(enemy.aggroTargetPetId);
      return pet === undefined ? NO_INTENT : { kind: 'targeting', name: pet, self: false };
    }
    if (isSet(enemy.aggroTargetCharacterId)) {
      if (input.selfId !== null && enemy.aggroTargetCharacterId === input.selfId) {
        return { kind: 'targeting', name: 'you', self: true };
      }
      const name = input.characterNames.get(enemy.aggroTargetCharacterId);
      return name === undefined ? NO_INTENT : { kind: 'targeting', name, self: false };
    }
    return NO_INTENT;
  };

  return [...input.enemies]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((enemy): HostileView => {
      const template = templateById.get(enemy.enemyTemplateId);
      const level = effectiveEnemyLevel(enemy.level, template?.level);
      const con = conFor(level === undefined ? null : level, input.playerLevel);
      const levelText = level === undefined ? null : `Lv ${level}`;
      const isBoss = template !== undefined && template.isBoss === true;
      const fraction = barFraction(enemy.currentHp, enemy.maxHp);
      const percent = Math.round(fraction * 100);
      const defeated = enemy.currentHp <= 0n;
      const targeted = !defeated && input.targetId !== null && input.targetId === enemy.id;
      const role = roleView(template?.role, {
        boss: isBoss,
        named: input.namedFight === true || (input.namedTemplateIds?.has(enemy.enemyTemplateId) ?? false),
      });
      const intent = intentOf(enemy);

      const abilityNames: string[] = [];
      const windups = (castsByEnemy.get(enemy.id) ?? []).map((cast) => {
        const ability = enemyAbilityName(input.abilities, enemy.enemyTemplateId, cast.abilityKey);
        abilityNames.push(ability);
        const rounds =
          input.currentRound !== null
            ? landsInLive(cast.landsAtRound, input.currentRound)
            : landsInAtAnnouncement(cast);
        return windupParts({
          enemy: enemy.displayName,
          ability,
          target: windupTarget({
            targetCharacterId: cast.targetCharacterId,
            targetPetId: cast.targetPetId,
            selfId: input.selfId,
            characterNames: input.characterNames,
            petNames: input.petNames,
          }),
          rounds,
        });
      });

      const effects = defeated ? [] : enemyEffectViews(effectsByEnemy.get(enemy.id) ?? [], enemy.displayName);

      let ariaLabel = `${enemy.displayName}, ${role.word}`;
      if (level !== undefined) ariaLabel += `, level ${level}`;
      ariaLabel += `, ${con.meaning}, ${percent}% health`;
      if (isBoss) ariaLabel += ', boss';
      if (abilityNames.length > 0) ariaLabel += `, winding up ${abilityNames[0]}`;
      for (const effect of effects) ariaLabel += `, ${effect.ariaText}`;
      if (defeated) ariaLabel += ', out of the fight';
      else if (intent.kind === 'targeting') ariaLabel += `, targeting ${intent.name}`;
      else if (intent.kind === 'healing') ariaLabel += `, healing ${intent.name}`;

      return {
        id: enemy.id,
        name: enemy.displayName,
        role,
        intent,
        levelText,
        con,
        isBoss,
        hp: enemy.currentHp,
        maxHp: enemy.maxHp,
        hpText: defeated ? 'Down' : `${enemy.currentHp}/${enemy.maxHp}`,
        widthPercent: `${Math.round(fraction * 10000) / 100}%`,
        percent,
        defeated,
        targeted,
        windups,
        effects,
        ariaLabel,
        title: `${enemy.displayName} · ${con.meaning}`,
      };
    });
}

/** Ids of the hostiles that are still alive, in list order (Tab cycling input). */
export function livingHostileIds(views: readonly HostileView[]): bigint[] {
  return views.filter((view) => !view.defeated).map((view) => view.id);
}

/**
 * 'Encounter · {title} · {n} left', or 'Encounter · {n} left' with no title; n counts living enemies.
 * The copy lives in @game-data/density_lines (PROPOSED, D-58).
 */
export function encounterHeading(title: string, livingCount: number): string {
  return sharedEncounterHeading(title, livingCount);
}

/** The combat_encounter origin columns the heading and source line read (Plan 10, D-32). */
export interface EncounterOriginRow {
  origin: string;
  originName: string;
  originPlural: string;
  originLevel: bigint;
}

/**
 * The heading title: the family name, or for a named fight the enemy's own name (the origin name is
 * the template name there). '' when no origin is recorded, so the heading falls back.
 */
export function encounterTitle(
  encounter: EncounterOriginRow | null,
  hostiles: readonly { name: string }[],
): string {
  if (!encounter || encounter.origin === '') return '';
  if (encounter.origin === 'named' && hostiles.length > 0) return hostiles[0].name;
  return encounter.originName;
}

export interface EncounterSourceView {
  text: string;
  /** Ambush origins read in --color-con-orange; the others in neutral-400. */
  tone: 'ambush' | 'neutral';
}

/** The source line under the heading, or null for a fight with no recorded origin (D-32). */
export function encounterSourceView(encounter: EncounterOriginRow | null): EncounterSourceView | null {
  if (!encounter) return null;
  const plural = sentenceCase(encounter.originPlural.trim());
  const text = encounterSource(encounter.origin, plural, densityWord('creature', encounter.originLevel));
  if (text === '') return null;
  return { text, tone: encounter.origin.startsWith('ambush_') ? 'ambush' : 'neutral' };
}
