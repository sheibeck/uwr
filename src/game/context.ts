import { computed, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';
import type {
  AbilityCooldown,
  AbilityTemplate,
  Character,
  CharacterEffect,
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
  sendFriendRequestToCharacter(a: { characterId: bigint; targetName: string }): Promise<void>;
  switchHotbar(a: { characterId: bigint; hotbarName: string }): Promise<void>;
  useAbility(a: {
    characterId: bigint;
    abilityTemplateId: bigint;
    targetCharacterId?: bigint;
  }): Promise<void>;
  moveCharacter(a: { characterId: bigint; locationId: bigint }): Promise<void>;
  startGatherResource(a: { characterId: bigint; nodeId: bigint }): Promise<void>;
}

type List<T> = Readonly<Ref<readonly T[]>>;

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
  openScreen(id: ScreenId): void;
  /** No-op when nothing is open. */
  closeScreen(): void;
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
  whisperTo(name: string): void;
  invite(name: string): void;
  trade(): void;
}

export const GAME_KEY: InjectionKey<GameData> = Symbol('uwr.game');
export const FRAME_KEY: InjectionKey<FrameControls> = Symbol('uwr.frame');
export const CONSOLE_KEY: InjectionKey<ConsoleApi> = Symbol('uwr.console');

// A constant, read-only ref. computed() keeps rows out of deep reactivity.
function constant<T>(value: T): Readonly<Ref<T>> {
  return computed(() => value);
}

function empty<T>(): List<T> {
  return constant<readonly T[]>([]);
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
    whisperTo() {},
    invite() {},
    trade() {},
  };
}
