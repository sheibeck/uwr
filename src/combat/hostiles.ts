// Hostile rows for the encounter rail, strip and sheet (48-UI-SPEC "Encounter panel", CMB-01/CMB-03).
//
// One HostileView per combat_enemy row of the fight, in ascending enemy id (the engine's
// resolution order). Everything a component needs is derived here so the components only
// render text nodes and apply classes. Names are server or model text and pass through
// concatenation only, never markup.
import { barFraction } from '../frame/vitals';
import { conFor, type ConView } from './difficulty';
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
}

export interface HostileTemplateRow {
  id: bigint;
  level: bigint;
  isBoss?: boolean;
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

export interface HostileView {
  id: bigint;
  name: string;
  /** 'Lv 4', or null when the enemy template is missing. */
  levelText: string | null;
  con: ConView;
  isBoss: boolean;
  hp: bigint;
  maxHp: bigint;
  /** '212/480'. */
  hpText: string;
  /** Bar width, '44%'. */
  widthPercent: string;
  /** Whole percent for aria-valuenow and the label. */
  percent: number;
  defeated: boolean;
  targeted: boolean;
  windups: WindupParts[];
  ariaLabel: string;
  title: string;
}

export interface HostileViewsInput {
  enemies: readonly HostileEnemyRow[];
  templates: readonly HostileTemplateRow[];
  abilities: readonly HostileAbilityRow[];
  casts: readonly HostileCastRow[];
  /** Open round number, or null when no round row is known (casts then use the announcement N). */
  currentRound: bigint | null;
  playerLevel: bigint;
  targetId: bigint | null;
  selfId: bigint | null;
  characterNames: ReadonlyMap<bigint, string>;
  petNames: ReadonlyMap<bigint, string>;
}

function compareIds(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
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

  return [...input.enemies]
    .sort((a, b) => compareIds(a.id, b.id))
    .map((enemy): HostileView => {
      const template = templateById.get(enemy.enemyTemplateId);
      const con = conFor(template ? template.level : null, input.playerLevel);
      const levelText = template ? `Lv ${template.level}` : null;
      const isBoss = template !== undefined && template.isBoss === true;
      const fraction = barFraction(enemy.currentHp, enemy.maxHp);
      const percent = Math.round(fraction * 100);
      const defeated = enemy.currentHp <= 0n;
      const targeted = !defeated && input.targetId !== null && input.targetId === enemy.id;

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

      let ariaLabel = enemy.displayName;
      if (template) ariaLabel += `, level ${template.level}`;
      ariaLabel += `, ${con.meaning}, ${percent}% health`;
      if (isBoss) ariaLabel += ', boss';
      if (abilityNames.length > 0) ariaLabel += `, winding up ${abilityNames[0]}`;

      return {
        id: enemy.id,
        name: enemy.displayName,
        levelText,
        con,
        isBoss,
        hp: enemy.currentHp,
        maxHp: enemy.maxHp,
        hpText: `${enemy.currentHp}/${enemy.maxHp}`,
        widthPercent: `${Math.round(fraction * 10000) / 100}%`,
        percent,
        defeated,
        targeted,
        windups,
        ariaLabel,
        title: `${enemy.displayName} · ${con.meaning}`,
      };
    });
}

/** Ids of the hostiles that are still alive, in list order (Tab cycling input). */
export function livingHostileIds(views: readonly HostileView[]): bigint[] {
  return views.filter((view) => !view.defeated).map((view) => view.id);
}

/** 'Encounter · 1 hostile' / 'Encounter · {n} hostiles'; n counts living hostiles. */
export function encounterHeading(livingCount: number): string {
  return `Encounter · ${livingCount} ${livingCount === 1 ? 'hostile' : 'hostiles'}`;
}
