// The player's choice for the open round: the chip text and the Ready and Flee state
// (48-UI-SPEC "Round Contract", CMB-06).
//
// Everything here derives from the server's combat_action row for the open round plus the
// enemy rows. Nothing is stored or guessed on the client (no optimistic chip, chosen slot or
// Flee state): a click shows its effect only once the row echoes back. Names are server or
// model text and pass through concatenation only; components render them as text nodes.
import type { TargetRule } from '@game-data/mechanical_vocabulary';

const SINGLE_ALLY: TargetRule = 'single_ally';
const SINGLE_ENEMY: TargetRule = 'single_enemy';

export type ChipIcon = 'sword' | 'check' | 'run' | 'ability' | 'none';

export interface ChoiceChip {
  text: string;
  tone: 'neutral' | 'accent' | 'danger';
  icon: ChipIcon;
  /** The ability's kind, for the kind icon, only on an ability chip with a known ability. */
  abilityKind: string | null;
}

export interface ChoiceAction {
  actionType: string;
  abilityTemplateId?: bigint | null;
  targetEnemyId?: bigint | null;
  targetCharacterId?: bigint | null;
}

export interface ChoiceAbility {
  id: bigint;
  name: string;
  kind: string;
  targetRule: string;
}

export interface ChoiceEnemy {
  id: bigint;
  displayName: string;
  currentHp: bigint;
}

function isPresent(value: bigint | null | undefined): value is bigint {
  return value !== null && value !== undefined;
}

/** The current target only when it is alive; the argument Ready sends (a dead id is refused). */
export function livingTargetId(
  enemies: readonly ChoiceEnemy[],
  currentTargetId: bigint | null,
): bigint | undefined {
  if (currentTargetId === null) return undefined;
  const target = enemies.find((e) => e.id === currentTargetId);
  if (target === undefined || target.currentHp <= 0n) return undefined;
  return target.id;
}

/** The living current target, else the lowest-id living enemy, else null. */
export function autoAttackTarget(
  enemies: readonly ChoiceEnemy[],
  currentTargetId: bigint | null,
): { id: bigint; name: string } | null {
  const currentId = livingTargetId(enemies, currentTargetId);
  if (currentId !== undefined) {
    const current = enemies.find((e) => e.id === currentId);
    if (current !== undefined) return { id: current.id, name: current.displayName };
  }
  let lowest: ChoiceEnemy | null = null;
  for (const enemy of enemies) {
    if (enemy.currentHp <= 0n) continue;
    if (lowest === null || enemy.id < lowest.id) lowest = enemy;
  }
  return lowest === null ? null : { id: lowest.id, name: lowest.displayName };
}

export function choiceChip(input: {
  action: ChoiceAction | null;
  abilities: readonly ChoiceAbility[];
  enemies: readonly ChoiceEnemy[];
  currentTargetId: bigint | null;
  selfId: bigint | null;
  characterNames: ReadonlyMap<bigint, string>;
  down: boolean;
}): ChoiceChip {
  const { action, abilities, enemies, currentTargetId, selfId, characterNames } = input;
  if (input.down) return { text: 'You are down', tone: 'neutral', icon: 'none', abilityKind: null };

  if (action !== null && action.actionType === 'flee') {
    return { text: 'Fleeing', tone: 'danger', icon: 'run', abilityKind: null };
  }

  if (action !== null && action.actionType === 'ability') {
    const ability = abilities.find((a) => a.id === action.abilityTemplateId);
    if (ability === undefined) return { text: 'Ability', tone: 'accent', icon: 'ability', abilityKind: null };
    let target: string | null = null;
    if (ability.targetRule === SINGLE_ALLY) {
      const allyId = action.targetCharacterId;
      if (!isPresent(allyId) || allyId === selfId) target = 'you';
      else target = characterNames.get(allyId) ?? 'Member';
    } else if (ability.targetRule === SINGLE_ENEMY) {
      // A stored target is shown as stored; the live fallback is the current target only while alive.
      const enemyId = isPresent(action.targetEnemyId)
        ? action.targetEnemyId
        : (livingTargetId(enemies, currentTargetId) ?? null);
      const enemy = enemyId === null ? undefined : enemies.find((e) => e.id === enemyId);
      if (enemy !== undefined) target = enemy.displayName;
    }
    return {
      text: target === null ? ability.name : `${ability.name} → ${target}`,
      tone: 'accent',
      icon: 'ability',
      abilityKind: ability.kind,
    };
  }

  // No row means the engine auto-attacks at resolution; an auto_attack row is the same choice
  // made explicit (Ready pressed).
  const explicit = action !== null && action.actionType === 'auto_attack';
  let target = autoAttackTarget(enemies, currentTargetId);
  if (explicit && isPresent(action.targetEnemyId)) {
    const stored = enemies.find((e) => e.id === action.targetEnemyId);
    if (stored !== undefined && stored.currentHp > 0n) target = { id: stored.id, name: stored.displayName };
  }
  return {
    text: target === null ? 'Auto-attack' : `Auto-attack → ${target.name}`,
    tone: explicit ? 'accent' : 'neutral',
    icon: explicit ? 'check' : 'sword',
    abilityKind: null,
  };
}

export interface RoundControls {
  /** Slots, Ready and Flee ignore clicks and keys. */
  inert: boolean;
  readyDisabled: boolean;
  fleeDisabled: boolean;
  /** The flee row exists: the button reads 'Flee chosen'. */
  fleeChosen: boolean;
}

export function roundControls(input: {
  actionType: string | null;
  resolving: boolean;
  down: boolean;
  connected: boolean;
}): RoundControls {
  const inert = input.resolving || input.down || !input.connected;
  return {
    inert,
    readyDisabled: inert || input.actionType !== null,
    fleeDisabled: inert,
    fleeChosen: input.actionType === 'flee',
  };
}
