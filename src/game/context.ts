import { computed, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';
import type {
  AbilityCooldown,
  AbilityTemplate,
  ActivePet,
  Character,
  CharacterEffect,
  CombatAction,
  CombatEnemy,
  CombatEnemyCast,
  CombatNarrative,
  CombatParticipant,
  CombatRound,
  EnemyAbility,
  EnemySpawn,
  EnemyTemplate,
  EventContribution,
  EventObjective,
  Faction,
  FactionStanding,
  Group,
  GroupInvite,
  GroupMember,
  Hotbar,
  HotbarSlot,
  Location,
  LocationConnection,
  MyCombatAggroEntry,
  MyLlmJob,
  Npc,
  QuestInstance,
  QuestTemplate,
  Region,
  Renown,
  RenownPerk,
  ResourceNode,
  WorldEvent,
} from '../module_bindings/types';
import { createFeedStore } from '../console/feedStore';
import type { FeedStore } from '../console/feedStore';
import type { KeywordEntry } from '../console/keywords';
import type { ScreenId } from '../screens/screens';
import type { ActiveScreen } from '../frame/useScreens';
import type { RoundTimerState } from '../combat/roundClock';
import { createServerClock } from './serverClock';
import type { ServerClock } from './serverClock';

// Injection contracts for the Phase 47 components (research Pattern 4). Every key has an
// inert default so a bare mount (the Phase 45 shell tests) still works without a provider.
//
// The view tables (my_quests, my_character_effects, ...) are generated with an empty row
// type (MyQuests = {}), so the lists below use the table row type that the view returns
// (QuestInstance, CharacterEffect, GroupInvite, FactionStanding) and MyLlmJob.

export interface GameReducers {
  submitIntent(a: { characterId: bigint; text: string }): Promise<void>;
  submitCommand(a: { characterId: bigint; text: string }): Promise<void>;
  talkToNpc(a: { characterId: bigint; npcId: bigint; message: string }): Promise<void>;
  whisper(a: { characterId: bigint; targetName: string; message: string }): Promise<void>;
  groupMessage(a: { characterId: bigint; message: string }): Promise<void>;
  inviteToGroup(a: { characterId: bigint; targetName: string }): Promise<void>;
  acceptGroupInvite(a: { characterId: bigint; fromName: string }): Promise<void>;
  rejectGroupInvite(a: { characterId: bigint; fromName: string }): Promise<void>;
  leaveGroup(a: { characterId: bigint }): Promise<void>;
  kickGroupMember(a: { characterId: bigint; targetName: string }): Promise<void>;
  promoteGroupLeader(a: { characterId: bigint; targetName: string }): Promise<void>;
  endCombat(a: { characterId: bigint }): Promise<void>;
  submitCombatAction(a: {
    characterId: bigint;
    abilityTemplateId?: bigint;
    targetEnemyId?: bigint;
    targetCharacterId?: bigint;
  }): Promise<void>;
  fleeCombat(a: { characterId: bigint }): Promise<void>;
  setCombatTarget(a: { characterId: bigint; enemyId?: bigint }): Promise<void>;
  sendFriendRequestToCharacter(a: { characterId: bigint; targetName: string }): Promise<void>;
  switchHotbar(a: { characterId: bigint; hotbarName: string }): Promise<void>;
  useAbility(a: {
    characterId: bigint;
    abilityTemplateId: bigint;
    targetCharacterId?: bigint;
  }): Promise<void>;
  moveCharacter(a: { characterId: bigint; locationId: bigint }): Promise<void>;
  startGatherResource(a: { characterId: bigint; nodeId: bigint }): Promise<void>;
  startPull(a: { characterId: bigint; enemySpawnId: bigint; pullType: string }): Promise<void>;
}

type List<T> = Readonly<Ref<readonly T[]>>;

/**
 * The player's own fight (Phase 48). Every list is scoped to the fight of the own
 * participant row, so a row of another fight never shows. Empty and null outside a fight.
 */
export interface CombatData {
  /** The active character's own combat_participant row exists. inCombat stays the Phase 47 effect flag. */
  readonly active: Readonly<Ref<boolean>>;
  /** The fight's enemy binding has applied (the encounter can be drawn). */
  readonly applied: Readonly<Ref<boolean>>;
  /** The fight's enemy cast binding has applied. */
  readonly castsApplied: Readonly<Ref<boolean>>;
  /** The threat view has applied. */
  readonly aggroApplied: Readonly<Ref<boolean>>;
  /** The fight's round binding has applied; round rows that arrive after it are live, not a snapshot. */
  readonly roundsApplied: Readonly<Ref<boolean>>;
  /**
   * The own-participant binding has applied. With `active` false it means the server confirmed the
   * character is not in a fight, as opposed to nothing having arrived yet.
   */
  readonly participantApplied: Readonly<Ref<boolean>>;
  readonly combatId: Readonly<Ref<bigint | null>>;
  /** The own participant row. */
  readonly self: Readonly<Ref<CombatParticipant | null>>;
  readonly participants: List<CombatParticipant>;
  readonly enemies: List<CombatEnemy>;
  readonly enemyTemplates: List<EnemyTemplate>;
  readonly enemyAbilities: List<EnemyAbility>;
  readonly rounds: List<CombatRound>;
  /** The round row with state 'action_select', else null. */
  readonly openRound: Readonly<Ref<CombatRound | null>>;
  /** The open round number, else the highest round number seen, else null. */
  readonly roundNumber: Readonly<Ref<bigint | null>>;
  /** The player's own choice rows. */
  readonly actions: List<CombatAction>;
  /** The player's choice row for the open round only. */
  readonly ownAction: Readonly<Ref<CombatAction | null>>;
  readonly casts: List<CombatEnemyCast>;
  /** Lingers for a short while after the fight ends, so a late narration still matches its round. */
  readonly narratives: List<CombatNarrative>;
  readonly pets: List<ActivePet>;
  /** The threat view rows of the player's fights. */
  readonly aggro: List<MyCombatAggroEntry>;
  /** Fight participants, party and the player, by id. */
  readonly characterNames: Readonly<Ref<ReadonlyMap<bigint, string>>>;
  readonly petNames: Readonly<Ref<ReadonlyMap<bigint, string>>>;
}

export interface GameData {
  readonly connected: Readonly<Ref<boolean>>;
  readonly character: Readonly<Ref<Character | null>>;
  readonly characterId: Readonly<Ref<bigint | null>>;
  /** character.combatTargetEnemyId is set. */
  readonly inCombat: Readonly<Ref<boolean>>;
  readonly locations: List<Location>;
  readonly regions: List<Region>;
  /** From the current location. */
  readonly connections: List<LocationConnection>;
  readonly npcsHere: List<Npc>;
  /** Raw; consumers apply visibleNodes (47-03). */
  readonly nodesHere: List<ResourceNode>;
  /** Raw enemy spawns at the location; consumers derive with src/rails/enemies.ts. */
  readonly enemiesHere: List<EnemySpawn>;
  /** Templates of the spawns here (level for the con color). */
  readonly enemyTemplatesHere: List<EnemyTemplate>;
  /** Other characters at the location. */
  readonly playersHere: List<Character>;
  /** Whole party; consumers filter by characterId. */
  readonly effects: List<CharacterEffect>;
  readonly quests: List<QuestInstance>;
  readonly questTemplates: List<QuestTemplate>;
  readonly llmJobs: List<MyLlmJob>;
  readonly groupInvites: List<GroupInvite>;
  readonly group: Readonly<Ref<Group | null>>;
  readonly groupMembers: List<GroupMember>;
  /** Party members and pending inviters, by id. */
  readonly knownCharacters: List<Character>;
  readonly hotbars: List<Hotbar>;
  readonly hotbarSlots: List<HotbarSlot>;
  readonly abilities: List<AbilityTemplate>;
  readonly abilityCooldowns: List<AbilityCooldown>;
  /** Status 'active', every region. */
  readonly worldEvents: List<WorldEvent>;
  readonly eventObjectives: List<EventObjective>;
  readonly contributions: List<EventContribution>;
  readonly factions: List<Faction>;
  readonly factionStandings: List<FactionStanding>;
  readonly renown: List<Renown>;
  readonly renownPerks: List<RenownPerk>;
  readonly privateEventsApplied: Readonly<Ref<boolean>>;
  readonly combat: CombatData;
  readonly feed: FeedStore;
  readonly clock: ServerClock;
  /** Null unless connected: reducers are never exposed while reconnecting. */
  readonly reducers: Readonly<Ref<GameReducers | null>>;
  reset(): void;
  dispose(): void;
}

export interface FrameControls {
  readonly isDesktop: Readonly<Ref<boolean>>;
  readonly activeScreen: Readonly<Ref<ActiveScreen>>;
  openScreen(id: ScreenId | 'encounter'): void;
  /** No-op when nothing is open. */
  closeScreen(): void;
}

/**
 * The per-frame combat controller (Phase 48): targets, Tab and Esc keys, ally selection and the
 * round clock, shared by the rail, strip, round row, hotbar and party block.
 */
export interface CombatController {
  /** The selected ally; the player's own id by default, null while no character is active. */
  readonly allyTargetId: Readonly<Ref<bigint | null>>;
  readonly timer: Readonly<Ref<RoundTimerState>>;
  /** True at 0 and with no open round. */
  readonly resolving: Readonly<Ref<boolean>>;
  /** The character is at 0 HP. */
  readonly down: Readonly<Ref<boolean>>;
  /** Hidden status line: 'Target: {name}', empty when nothing was requested. */
  readonly targetStatus: Readonly<Ref<string>>;
  selectAlly(characterId: bigint): void;
  /** Targets a living hostile; a defeated or unknown hostile is never requested. */
  requestTarget(enemyId: bigint): void;
  /** Tab (1) and Shift+Tab (-1). True when the target changed (the key acted). */
  cycle(dir: 1 | -1): boolean;
  /** The ally id to send for an ability, or undefined to omit it. */
  allyArgFor(ability: { targetRule: string }): bigint | undefined;
  dispose(): void;
}

export type SubmitResult = 'sent' | 'queued' | 'refused' | 'empty' | 'offline';

export interface ConversationTarget {
  npcId: bigint;
  name: string;
}

export interface ConsoleApi {
  readonly draft: Ref<string>;
  readonly conversation: Readonly<Ref<ConversationTarget | null>>;
  readonly queuedCount: Readonly<Ref<number>>;
  /** Bumps on every accepted send or action (the feed re-pins). */
  readonly sendTick: Readonly<Ref<number>>;
  /** Bumps when the input should take focus (pre-fill). */
  readonly focusTick: Readonly<Ref<number>>;
  readonly inputFocused: Ref<boolean>;
  submit(): SubmitResult;
  recallPrevious(): void;
  recallNext(): void;
  prefill(text: string): void;
  endConversation(): void;
  actOnKeyword(entry: KeywordEntry): void;
  hail(npc: { id: bigint; name: string }): void;
  travel(location: { id: bigint; name: string }): void;
  examine(name: string): void;
  gather(node: { id: bigint; name: string }): void;
  /** Starts a pull on an enemy spawn. No-op offline and while game.combat.active. */
  pull(enemy: { id: bigint; name: string }, pullType: 'careful' | 'body'): void;
  whisperTo(name: string): void;
  invite(name: string): void;
  trade(): void;
}

export const GAME_KEY: InjectionKey<GameData> = Symbol('uwr.game');
export const FRAME_KEY: InjectionKey<FrameControls> = Symbol('uwr.frame');
export const CONSOLE_KEY: InjectionKey<ConsoleApi> = Symbol('uwr.console');
export const COMBAT_KEY: InjectionKey<CombatController> = Symbol('uwr.combat');

// A constant, read-only ref. computed() keeps rows out of deep reactivity.
function constant<T>(value: T): Readonly<Ref<T>> {
  return computed(() => value);
}

function empty<T>(): List<T> {
  return constant<readonly T[]>([]);
}

export function createInertCombatData(): CombatData {
  return {
    active: constant(false),
    applied: constant(false),
    castsApplied: constant(false),
    aggroApplied: constant(false),
    roundsApplied: constant(false),
    participantApplied: constant(false),
    combatId: constant<bigint | null>(null),
    self: constant<CombatParticipant | null>(null),
    participants: empty<CombatParticipant>(),
    enemies: empty<CombatEnemy>(),
    enemyTemplates: empty<EnemyTemplate>(),
    enemyAbilities: empty<EnemyAbility>(),
    rounds: empty<CombatRound>(),
    openRound: constant<CombatRound | null>(null),
    roundNumber: constant<bigint | null>(null),
    actions: empty<CombatAction>(),
    ownAction: constant<CombatAction | null>(null),
    casts: empty<CombatEnemyCast>(),
    narratives: empty<CombatNarrative>(),
    pets: empty<ActivePet>(),
    aggro: empty<MyCombatAggroEntry>(),
    characterNames: constant<ReadonlyMap<bigint, string>>(new Map()),
    petNames: constant<ReadonlyMap<bigint, string>>(new Map()),
  };
}

export function createInertGame(): GameData {
  return {
    connected: constant(false),
    character: constant<Character | null>(null),
    characterId: constant<bigint | null>(null),
    inCombat: constant(false),
    locations: empty<Location>(),
    regions: empty<Region>(),
    connections: empty<LocationConnection>(),
    npcsHere: empty<Npc>(),
    nodesHere: empty<ResourceNode>(),
    enemiesHere: empty<EnemySpawn>(),
    enemyTemplatesHere: empty<EnemyTemplate>(),
    playersHere: empty<Character>(),
    effects: empty<CharacterEffect>(),
    quests: empty<QuestInstance>(),
    questTemplates: empty<QuestTemplate>(),
    llmJobs: empty<MyLlmJob>(),
    groupInvites: empty<GroupInvite>(),
    group: constant<Group | null>(null),
    groupMembers: empty<GroupMember>(),
    knownCharacters: empty<Character>(),
    hotbars: empty<Hotbar>(),
    hotbarSlots: empty<HotbarSlot>(),
    abilities: empty<AbilityTemplate>(),
    abilityCooldowns: empty<AbilityCooldown>(),
    worldEvents: empty<WorldEvent>(),
    eventObjectives: empty<EventObjective>(),
    contributions: empty<EventContribution>(),
    factions: empty<Faction>(),
    factionStandings: empty<FactionStanding>(),
    renown: empty<Renown>(),
    renownPerks: empty<RenownPerk>(),
    privateEventsApplied: constant(false),
    combat: createInertCombatData(),
    feed: createFeedStore(),
    clock: createServerClock(),
    reducers: constant<GameReducers | null>(null),
    reset() {},
    dispose() {},
  };
}

export function createInertFrame(): FrameControls {
  return {
    isDesktop: constant(true),
    activeScreen: constant<ActiveScreen>(null),
    openScreen() {},
    closeScreen() {},
  };
}

export function createInertCombat(): CombatController {
  return {
    allyTargetId: constant<bigint | null>(null),
    timer: constant<RoundTimerState>({ resolving: true, seconds: 0, fraction: 0, totalSeconds: 0 }),
    resolving: constant(true),
    down: constant(false),
    targetStatus: constant(''),
    selectAlly() {},
    requestTarget() {},
    cycle: () => false,
    allyArgFor: () => undefined,
    dispose() {},
  };
}

export function createInertConsole(): ConsoleApi {
  return {
    draft: ref(''),
    conversation: constant<ConversationTarget | null>(null),
    queuedCount: constant(0),
    sendTick: constant(0),
    focusTick: constant(0),
    inputFocused: ref(false),
    submit: () => 'offline',
    recallPrevious() {},
    recallNext() {},
    prefill() {},
    endConversation() {},
    actOnKeyword() {},
    hail() {},
    travel() {},
    examine() {},
    gather() {},
    pull() {},
    whisperTo() {},
    invite() {},
    trade() {},
  };
}
