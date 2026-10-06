import { computed, watch } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type {
  AbilityCooldown,
  AbilityTemplate,
  Character,
  CharacterEffect,
  EventContribution,
  EventGroup,
  EventLocation,
  EventObjective,
  EventPrivate,
  EventWorld,
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
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import { createFeedStore } from '../console/feedStore';
import type { EventRowLike, FeedSource } from '../console/feedStore';
import type { GameData, GameReducers } from './context';
import type { BindEventTableOptions, EventTableBinding, EventTableLike } from './bindEventTable';
import { createKeyed, idListKey, keyedRows, parseIdListKey } from './keyedBinding';
import type { AttachableBinding } from './keyedBinding';
import type { GameQueries } from './queries';
import { createServerClock } from './serverClock';

// The game data hub: every Phase 47 subscription lives here (research "Subscription plan").
//
// Scope of each subscription:
//   once per connection  the five views, faction, active world events, event_world
//   by user              event_private
//   by location          event_location, npc, resource_node, character, location_connection
//   by character         hotbar, hotbar_slot, ability_template, ability_cooldown,
//                        event_contribution, renown, renown_perk
//   by group             group, group_member, event_group
//   by id list           party and inviter characters, quest templates, event objectives
//
// Shared-cache rule: the SDK cache is shared by every subscription of the same table, so
// bindTable's rows are whatever the whole cache holds. Every keyed table binding therefore
// passes a filter equal to its query, and the rows it exposes are the filtered ones.
//
// Location, character and id-list table bindings swap on applied (the old rows stay until
// the new binding has applied); event bindings swap at once because they carry no rows.

type Row<T> = TableLike<T>;
type EventRow<T> = EventTableLike<T>;

export interface GameConn extends ConnLike {
  db: {
    myCharacterEffects: Row<CharacterEffect>;
    myQuests: Row<QuestInstance>;
    myLlmJobs: Row<MyLlmJob>;
    myGroupInvites: Row<GroupInvite>;
    myFactionStandings: Row<FactionStanding>;
    faction: Row<Faction>;
    worldEvent: Row<WorldEvent>;
    eventPrivate: EventRow<EventPrivate>;
    eventLocation: EventRow<EventLocation>;
    eventGroup: EventRow<EventGroup>;
    eventWorld: EventRow<EventWorld>;
    npc: Row<Npc>;
    resourceNode: Row<ResourceNode>;
    character: Row<Character>;
    locationConnection: Row<LocationConnection>;
    hotbar: Row<Hotbar>;
    hotbarSlot: Row<HotbarSlot>;
    abilityTemplate: Row<AbilityTemplate>;
    abilityCooldown: Row<AbilityCooldown>;
    eventContribution: Row<EventContribution>;
    renown: Row<Renown>;
    renownPerk: Row<RenownPerk>;
    group: Row<Group>;
    groupMember: Row<GroupMember>;
    questTemplate: Row<QuestTemplate>;
    eventObjective: Row<EventObjective>;
  };
  reducers: GameReducers;
}

export interface GameInput<C> {
  conn: Readonly<ShallowRef<C | null>>;
  status: Readonly<Ref<ConnectionStatus>>;
  userId: Readonly<Ref<bigint | null>>;
  character: Readonly<Ref<Character | null>>;
  locations: Readonly<Ref<readonly Location[]>>;
  regions: Readonly<Ref<readonly Region[]>>;
}

export interface GameDeps<C> {
  bind: <R>(options: BindTableOptions<C, R>) => TableBinding<C, R>;
  bindEvent: <R>(options: BindEventTableOptions<C, R>) => EventTableBinding<C>;
  queries: GameQueries;
  now?: () => number;
}

type Source = Exclude<FeedSource, 'local'>;

export function createGameData<C extends GameConn>(deps: GameDeps<C>, input: GameInput<C>): GameData {
  const { queries } = deps;
  const feed = createFeedStore();
  const clock = createServerClock(deps.now);

  // Event rows sample the server clock (cooldowns and deadlines are server times), then
  // reach the feed store, which applies its own ownership filter.
  const onEvent =
    <R extends EventRowLike>(source: Source) =>
    (row: R): void => {
      clock.sample(row.createdAt.microsSinceUnixEpoch);
      feed.ingest(source, row);
    };

  // Once per connection ------------------------------------------------------------------
  const effects = deps.bind<CharacterEffect>({
    table: (c) => c.db.myCharacterEffects,
    sql: [queries.myCharacterEffects],
  });
  const quests = deps.bind<QuestInstance>({ table: (c) => c.db.myQuests, sql: [queries.myQuests] });
  const llmJobs = deps.bind<MyLlmJob>({ table: (c) => c.db.myLlmJobs, sql: [queries.myLlmJobs] });
  const groupInvites = deps.bind<GroupInvite>({
    table: (c) => c.db.myGroupInvites,
    sql: [queries.myGroupInvites],
  });
  const factionStandings = deps.bind<FactionStanding>({
    table: (c) => c.db.myFactionStandings,
    sql: [queries.myFactionStandings],
  });
  const factions = deps.bind<Faction>({ table: (c) => c.db.faction, sql: [queries.faction] });
  const worldEvents = deps.bind<WorldEvent>({
    table: (c) => c.db.worldEvent,
    sql: [queries.activeWorldEvents],
    filter: (row) => row.status === 'active',
  });
  const staticBindings: AttachableBinding<C>[] = [
    effects,
    quests,
    llmJobs,
    groupInvites,
    factionStandings,
    factions,
    worldEvents,
  ];
  const eventWorld = deps.bindEvent<EventWorld>({
    table: (c) => c.db.eventWorld,
    sql: [queries.eventWorld],
    onRow: onEvent('world'),
  });
  staticBindings.push(eventWorld);

  watch(
    input.conn,
    (conn) => {
      for (const binding of staticBindings) binding.attach(conn);
    },
    { immediate: true, flush: 'sync' },
  );

  // Keys ---------------------------------------------------------------------------------
  const userKey = computed<bigint | null>(() => input.userId.value);
  const characterKey = computed<bigint | null>(() => input.character.value?.id ?? null);
  const locationKey = computed<bigint | null>(() => input.character.value?.locationId ?? null);
  const groupKey = computed<bigint | null>(() => input.character.value?.groupId ?? null);

  const partyKey = computed<string | null>(() => {
    const me = characterKey.value;
    const ids: bigint[] = [];
    for (const member of groupMembersRows.value) ids.push(member.characterId);
    for (const invite of groupInvites.rows.value) ids.push(invite.fromCharacterId);
    return idListKey(ids.filter((id) => id !== me));
  });
  const questTemplateKey = computed<string | null>(() =>
    idListKey(quests.rows.value.map((quest) => quest.questTemplateId)),
  );
  const eventKey = computed<string | null>(() =>
    idListKey(worldEvents.rows.value.map((event) => event.id)),
  );

  // Keyed bindings -----------------------------------------------------------------------
  function keyedTable<R, K extends bigint | string>(
    key: Readonly<Ref<K | null>>,
    table: (c: C) => TableLike<R>,
    sql: (k: K) => string,
    matches: (row: R, k: K) => boolean,
  ) {
    return createKeyed<C, K, TableBinding<C, R>>({
      key,
      conn: input.conn,
      make: (k) =>
        deps.bind<R>({ table, sql: [sql(k)], filter: (row) => matches(row, k) }),
    });
  }

  // Id-list keys carry the ids in the key string; the filter checks membership.
  function keyedIdList<R>(
    key: Readonly<Ref<string | null>>,
    table: (c: C) => TableLike<R>,
    sql: (ids: bigint[]) => string,
    idOf: (row: R) => bigint,
  ) {
    return createKeyed<C, string, TableBinding<C, R>>({
      key,
      conn: input.conn,
      make: (k) => {
        const ids = parseIdListKey(k);
        const set = new Set(ids);
        return deps.bind<R>({ table, sql: [sql(ids)], filter: (row) => set.has(idOf(row)) });
      },
    });
  }

  function keyedEvent<R extends EventRowLike>(
    key: Readonly<Ref<bigint | null>>,
    table: (c: C) => EventTableLike<R>,
    sql: (k: bigint) => string,
    source: Source,
  ) {
    return createKeyed<C, bigint, EventTableBinding<C>>({
      key,
      conn: input.conn,
      swap: 'immediate',
      make: (k) =>
        deps.bindEvent<R>({
          table,
          sql: [sql(k)],
          onRow: onEvent<R>(source),
        }),
    });
  }

  const privateEvents = keyedEvent<EventPrivate>(
    userKey,
    (c) => c.db.eventPrivate,
    queries.eventPrivate,
    'private',
  );
  const locationEvents = keyedEvent<EventLocation>(
    locationKey,
    (c) => c.db.eventLocation,
    queries.eventLocation,
    'location',
  );
  const groupEvents = keyedEvent<EventGroup>(
    groupKey,
    (c) => c.db.eventGroup,
    queries.eventGroup,
    'group',
  );

  const npcs = keyedTable<Npc, bigint>(
    locationKey,
    (c) => c.db.npc,
    queries.npcsAt,
    (row, k) => row.locationId === k,
  );
  const nodes = keyedTable<ResourceNode, bigint>(
    locationKey,
    (c) => c.db.resourceNode,
    queries.resourceNodesAt,
    (row, k) => row.locationId === k,
  );
  const players = keyedTable<Character, bigint>(
    locationKey,
    (c) => c.db.character,
    queries.charactersAt,
    (row, k) => row.locationId === k,
  );
  const connectionRows = keyedTable<LocationConnection, bigint>(
    locationKey,
    (c) => c.db.locationConnection,
    queries.connectionsFrom,
    (row, k) => row.fromLocationId === k,
  );

  const hotbars = keyedTable<Hotbar, bigint>(
    characterKey,
    (c) => c.db.hotbar,
    queries.hotbars,
    (row, k) => row.characterId === k,
  );
  const hotbarSlots = keyedTable<HotbarSlot, bigint>(
    characterKey,
    (c) => c.db.hotbarSlot,
    queries.hotbarSlots,
    (row, k) => row.characterId === k,
  );
  const abilities = keyedTable<AbilityTemplate, bigint>(
    characterKey,
    (c) => c.db.abilityTemplate,
    queries.abilityTemplates,
    (row, k) => row.characterId === k,
  );
  const cooldowns = keyedTable<AbilityCooldown, bigint>(
    characterKey,
    (c) => c.db.abilityCooldown,
    queries.abilityCooldowns,
    (row, k) => row.characterId === k,
  );
  const contributions = keyedTable<EventContribution, bigint>(
    characterKey,
    (c) => c.db.eventContribution,
    queries.eventContributions,
    (row, k) => row.characterId === k,
  );
  const renown = keyedTable<Renown, bigint>(
    characterKey,
    (c) => c.db.renown,
    queries.renown,
    (row, k) => row.characterId === k,
  );
  const renownPerks = keyedTable<RenownPerk, bigint>(
    characterKey,
    (c) => c.db.renownPerk,
    queries.renownPerks,
    (row, k) => row.characterId === k,
  );

  const groups = keyedTable<Group, bigint>(
    groupKey,
    (c) => c.db.group,
    queries.group,
    (row, k) => row.id === k,
  );
  const members = keyedTable<GroupMember, bigint>(
    groupKey,
    (c) => c.db.groupMember,
    queries.groupMembers,
    (row, k) => row.groupId === k,
  );

  const groupMembersRows = keyedRows(members);

  const known = keyedIdList<Character>(
    partyKey,
    (c) => c.db.character,
    queries.charactersById,
    (row) => row.id,
  );
  const templates = keyedIdList<QuestTemplate>(
    questTemplateKey,
    (c) => c.db.questTemplate,
    queries.questTemplatesById,
    (row) => row.id,
  );
  const objectives = keyedIdList<EventObjective>(
    eventKey,
    (c) => c.db.eventObjective,
    queries.eventObjectivesByEvent,
    (row) => row.eventId,
  );

  const keyedAll: { reset(): void }[] = [
    privateEvents,
    locationEvents,
    groupEvents,
    npcs,
    nodes,
    players,
    connectionRows,
    hotbars,
    hotbarSlots,
    abilities,
    cooldowns,
    contributions,
    renown,
    renownPerks,
    groups,
    members,
    known,
    templates,
    objectives,
  ];

  // Derived ------------------------------------------------------------------------------
  const groupRows = keyedRows(groups);
  const playerRows = keyedRows(players);

  const characterId = characterKey;
  const connected = computed(() => input.status.value === 'connected' && input.conn.value !== null);
  const inCombat = computed(() => input.character.value?.combatTargetEnemyId != null);
  const playersHere = computed(() => {
    const me = characterId.value;
    return playerRows.value.filter((row) => row.id !== me);
  });
  const group = computed<Group | null>(() => groupRows.value[0] ?? null);
  const reducers = computed<GameReducers | null>(() => {
    const conn = input.conn.value;
    return connected.value && conn !== null ? conn.reducers : null;
  });
  const privateEventsApplied = computed(() => privateEvents.current.value?.applied.value ?? false);

  // The store follows the active character; a new character starts with an empty history.
  watch(characterId, (id) => feed.setCharacter(id), { immediate: true, flush: 'sync' });

  function reset(): void {
    for (const binding of staticBindings) binding.dispose();
    for (const keyed of keyedAll) keyed.reset();
    feed.clear();
  }

  return {
    connected,
    character: computed(() => input.character.value),
    characterId,
    inCombat,
    locations: input.locations,
    regions: input.regions,
    connections: keyedRows(connectionRows),
    npcsHere: keyedRows(npcs),
    nodesHere: keyedRows(nodes),
    playersHere,
    effects: effects.rows,
    quests: quests.rows,
    questTemplates: keyedRows(templates),
    llmJobs: llmJobs.rows,
    groupInvites: groupInvites.rows,
    group,
    groupMembers: groupMembersRows,
    knownCharacters: keyedRows(known),
    hotbars: keyedRows(hotbars),
    hotbarSlots: keyedRows(hotbarSlots),
    abilities: keyedRows(abilities),
    abilityCooldowns: keyedRows(cooldowns),
    worldEvents: worldEvents.rows,
    eventObjectives: keyedRows(objectives),
    contributions: keyedRows(contributions),
    factions: factions.rows,
    factionStandings: factionStandings.rows,
    renown: keyedRows(renown),
    renownPerks: keyedRows(renownPerks),
    privateEventsApplied,
    feed,
    clock,
    reducers,
    reset,
    dispose: reset,
  };
}
