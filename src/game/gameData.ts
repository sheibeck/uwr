import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type {
  AbilityCooldown,
  AbilityTemplate,
  ActivePet,
  Character,
  CharacterCast,
  CharacterEffect,
  CombatAction,
  CombatEnemy,
  CombatEnemyCast,
  CombatEnemyEffect,
  CombatLoot,
  CombatNarrative,
  CombatParticipant,
  CombatRound,
  EnemyAbility,
  EnemySpawn,
  EnemyTemplate,
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
  MyCombatAggroEntry,
  MyHarvestCap,
  MyLlmJob,
  NamedEnemy,
  Npc,
  PoolLevel,
  QuestInstance,
  QuestTemplate,
  Region,
  Renown,
  RenownPerk,
  ResourceGather,
  VisitedLocation,
  WorldEvent,
} from '../module_bindings/types';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions, ConnLike, TableBinding, TableLike } from '../net/bindTable';
import { createActionFirstSeen } from '../action/actionFirstSeen';
import { createFeedStore } from '../console/feedStore';
import { wireCombatFeed } from '../combat/combatFeed';
import type { EventRowLike, ServerFeedSource } from '../console/feedStore';
import type { CombatData, GameData, GameReducers } from './context';
import type { BindEventTableOptions, EventTableBinding, EventTableLike } from './bindEventTable';
import { createKeyed, idListKey, keyedRows, parseIdListKey } from './keyedBinding';
import type { AttachableBinding } from './keyedBinding';
import type { GameQueries } from './queries';
import { createServerClock } from './serverClock';

// The game data hub: every Phase 47 subscription lives here (research "Subscription plan").
//
// Scope of each subscription:
//   once per connection  the five views, faction, active world events, event_world,
//                        my_combat_aggro and my_combat_loot (the loot links, quick 261008-f3m),
//                        my_harvest_caps and my_visited_locations (51.3.1.1-18)
//   by user              event_private
//   by location          event_location, npc, enemy_spawn, character, location_connection
//                        (resource_node is gone: resources are pools now, 51.3.1.1-18)
//   by region list       pool_level, keyed by the regions of here, the exit destinations and the
//                        visited places (51.3.1.1 UI-SPEC P1); a place outside them reads Unknown
//   by character         hotbar, hotbar_slot, ability_template, ability_cooldown,
//                        event_contribution, renown, renown_perk, resource_gather, character_cast,
//                        named_enemy (the own named enemies, 51.3.1.1-18)
//   by group             group, group_member, event_group
//   by id list           party and inviter characters, quest templates, event objectives,
//                        the enemy templates of the spawns here (level, for the con color)
//   combat (48)          own participant and own choice rows by character; participants,
//                        enemies, enemy effects, rounds, casts, narratives and pets of the one fight by combat
//                        id (the key follows the own participant row); enemy templates and
//                        abilities by id list; my_combat_aggro once per connection
//
// Shared-cache rule: the SDK cache is shared by every subscription of the same table, so
// bindTable's rows are whatever the whole cache holds. Every keyed table binding therefore
// passes a filter equal to its query, and the rows it exposes are the filtered ones.
//
// Location, character and id-list table bindings swap on applied (the old rows stay until
// the new binding has applied); event bindings swap at once because they carry no rows.

// Narratives outlive the fight by this long, so a late victory or defeat narration can still
// be matched to its round (research Pitfall 7, A1).
export const NARRATIVE_LINGER_MS = 30_000;

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
    enemySpawn: Row<EnemySpawn>;
    poolLevel: Row<PoolLevel>;
    namedEnemy: Row<NamedEnemy>;
    myHarvestCaps: Row<MyHarvestCap>;
    myVisitedLocations: Row<VisitedLocation>;
    character: Row<Character>;
    locationConnection: Row<LocationConnection>;
    hotbar: Row<Hotbar>;
    hotbarSlot: Row<HotbarSlot>;
    abilityTemplate: Row<AbilityTemplate>;
    abilityCooldown: Row<AbilityCooldown>;
    eventContribution: Row<EventContribution>;
    renown: Row<Renown>;
    renownPerk: Row<RenownPerk>;
    resourceGather: Row<ResourceGather>;
    characterCast: Row<CharacterCast>;
    group: Row<Group>;
    groupMember: Row<GroupMember>;
    questTemplate: Row<QuestTemplate>;
    eventObjective: Row<EventObjective>;
    combatParticipant: Row<CombatParticipant>;
    combatEnemy: Row<CombatEnemy>;
    enemyTemplate: Row<EnemyTemplate>;
    enemyAbility: Row<EnemyAbility>;
    combatRound: Row<CombatRound>;
    combatAction: Row<CombatAction>;
    combatEnemyCast: Row<CombatEnemyCast>;
    combatEnemyEffect: Row<CombatEnemyEffect>;
    combatNarrative: Row<CombatNarrative>;
    activePet: Row<ActivePet>;
    myCombatAggro: Row<MyCombatAggroEntry>;
    myCombatLoot: Row<CombatLoot>;
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

type Source = ServerFeedSource;

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
  const combatAggro = deps.bind<MyCombatAggroEntry>({
    table: (c) => c.db.myCombatAggro,
    sql: [queries.myCombatAggro],
  });
  const combatLoot = deps.bind<CombatLoot>({
    table: (c) => c.db.myCombatLoot,
    sql: [queries.myCombatLoot],
  });
  // The harvest caps of the active character (51.3.1.1-18): where and until when, never an amount.
  const harvestCaps = deps.bind<MyHarvestCap>({
    table: (c) => c.db.myHarvestCaps,
    sql: [queries.myHarvestCaps],
  });
  // The visited places (51.3.1.1-18), for the pool region key. The Map binds the same view with the
  // same query; the shared cache holds the active character's rows, and visitedLocationIds below
  // still keeps only the rows of the active character.
  const visited = deps.bind<VisitedLocation>({
    table: (c) => c.db.myVisitedLocations,
    sql: [queries.myVisitedLocations],
  });
  const staticBindings: AttachableBinding<C>[] = [
    effects,
    quests,
    llmJobs,
    groupInvites,
    factionStandings,
    factions,
    worldEvents,
    combatAggro,
    combatLoot,
    harvestCaps,
    visited,
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
    // Fight participants outside the group still need names (threat, ally HP, wind-up targets).
    for (const participant of fightParticipantRows.value) ids.push(participant.characterId);
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
    matches: (row: R, k: bigint) => boolean,
  ) {
    return createKeyed<C, bigint, EventTableBinding<C>>({
      key,
      conn: input.conn,
      swap: 'immediate',
      make: (k) =>
        deps.bindEvent<R>({
          table,
          sql: [sql(k)],
          // The event listener is table-wide, so it also sees rows delivered for a previous
          // key (a straggler after a swap). Only rows for this binding's key are accepted.
          onRow: (row) => {
            if (matches(row, k)) onEvent<R>(source)(row);
          },
        }),
    });
  }

  const privateEvents = keyedEvent<EventPrivate>(
    userKey,
    (c) => c.db.eventPrivate,
    queries.eventPrivate,
    'private',
    (row, k) => row.ownerUserId === k,
  );
  const locationEvents = keyedEvent<EventLocation>(
    locationKey,
    (c) => c.db.eventLocation,
    queries.eventLocation,
    'location',
    (row, k) => row.locationId === k,
  );
  const groupEvents = keyedEvent<EventGroup>(
    groupKey,
    (c) => c.db.eventGroup,
    queries.eventGroup,
    'group',
    (row, k) => row.groupId === k,
  );

  const npcs = keyedTable<Npc, bigint>(
    locationKey,
    (c) => c.db.npc,
    queries.npcsAt,
    (row, k) => row.locationId === k,
  );
  const spawns = keyedTable<EnemySpawn, bigint>(
    locationKey,
    (c) => c.db.enemySpawn,
    queries.enemySpawnsAt,
    (row, k) => row.locationId === k,
  );
  const spawnRows = keyedRows(spawns);
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
  const ownGathers = keyedTable<ResourceGather, bigint>(
    characterKey,
    (c) => c.db.resourceGather,
    queries.resourceGathers,
    (row, k) => row.characterId === k,
  );
  const ownCasts = keyedTable<CharacterCast, bigint>(
    characterKey,
    (c) => c.db.characterCast,
    queries.characterCasts,
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

  // Combat (Phase 48). In combat means the own participant row exists; every fight binding
  // follows its combat id, so it appears with the row and is disposed when the row goes.
  const ownParticipant = keyedTable<CombatParticipant, bigint>(
    characterKey,
    (c) => c.db.combatParticipant,
    queries.combatParticipantsOf,
    (row, k) => row.characterId === k,
  );
  const ownActions = keyedTable<CombatAction, bigint>(
    characterKey,
    (c) => c.db.combatAction,
    queries.combatActions,
    (row, k) => row.characterId === k,
  );
  const ownParticipantRows = keyedRows(ownParticipant);
  const ownActionRows = keyedRows(ownActions);
  const combatKey = computed<bigint | null>(() => ownParticipantRows.value[0]?.combatId ?? null);

  const fightParticipants = keyedTable<CombatParticipant, bigint>(
    combatKey,
    (c) => c.db.combatParticipant,
    queries.combatParticipants,
    (row, k) => row.combatId === k,
  );
  const fightEnemies = keyedTable<CombatEnemy, bigint>(
    combatKey,
    (c) => c.db.combatEnemy,
    queries.combatEnemies,
    (row, k) => row.combatId === k,
  );
  const fightRounds = keyedTable<CombatRound, bigint>(
    combatKey,
    (c) => c.db.combatRound,
    queries.combatRounds,
    (row, k) => row.combatId === k,
  );
  const fightCasts = keyedTable<CombatEnemyCast, bigint>(
    combatKey,
    (c) => c.db.combatEnemyCast,
    queries.combatCasts,
    (row, k) => row.combatId === k,
  );
  const fightEnemyEffects = keyedTable<CombatEnemyEffect, bigint>(
    combatKey,
    (c) => c.db.combatEnemyEffect,
    queries.combatEnemyEffects,
    (row, k) => row.combatId === k,
  );
  const fightPets = keyedTable<ActivePet, bigint>(
    combatKey,
    (c) => c.db.activePet,
    queries.combatPets,
    (row, k) => row.combatId === k,
  );
  const fightParticipantRows = keyedRows(fightParticipants);
  const fightEnemyRows = keyedRows(fightEnemies);

  // The narrative key follows the combat id and, when the fight ends, lingers on the last id
  // for NARRATIVE_LINGER_MS before it is dropped. A new fight clears the timer.
  const narrativeKey = ref<bigint | null>(null);
  let lingerTimer: ReturnType<typeof setTimeout> | null = null;
  function clearLinger(): void {
    if (lingerTimer !== null) clearTimeout(lingerTimer);
    lingerTimer = null;
  }
  const stopNarrativeWatch = watch(
    combatKey,
    (id) => {
      clearLinger();
      if (id !== null) {
        narrativeKey.value = id;
        return;
      }
      if (narrativeKey.value === null) return;
      lingerTimer = setTimeout(() => {
        lingerTimer = null;
        narrativeKey.value = null;
      }, NARRATIVE_LINGER_MS);
    },
    { immediate: true, flush: 'sync' },
  );
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopNarrativeWatch();
      clearLinger();
    });
  }
  const fightNarratives = keyedTable<CombatNarrative, bigint>(
    narrativeKey,
    (c) => c.db.combatNarrative,
    queries.combatNarratives,
    (row, k) => row.combatId === k,
  );

  const templateKey = computed<string | null>(() =>
    idListKey(fightEnemyRows.value.map((enemy) => enemy.enemyTemplateId)),
  );
  const enemyTemplates = keyedIdList<EnemyTemplate>(
    templateKey,
    (c) => c.db.enemyTemplate,
    queries.enemyTemplatesById,
    (row) => row.id,
  );
  const enemyAbilities = keyedIdList<EnemyAbility>(
    templateKey,
    (c) => c.db.enemyAbility,
    queries.enemyAbilitiesByTemplate,
    (row) => row.enemyTemplateId,
  );

  // Templates of the spawns here (level, for the con color). A SEPARATE binding from the
  // fight's enemyTemplates above: the two keys differ and the fight contract stays untouched.
  const spawnTemplateKey = computed<string | null>(() =>
    idListKey(spawnRows.value.map((spawn) => spawn.enemyTemplateId)),
  );
  const spawnTemplates = keyedIdList<EnemyTemplate>(
    spawnTemplateKey,
    (c) => c.db.enemyTemplate,
    queries.enemyTemplatesById,
    (row) => row.id,
  );

  // Density pools (51.3.1.1-18) ----------------------------------------------------------------
  const connectionList = keyedRows(connectionRows);
  const locationById = computed(
    () => new Map(input.locations.value.map((location) => [location.id, location])),
  );
  const visitedLocationIds = computed<readonly bigint[]>(() => {
    const me = characterKey.value;
    if (me === null) return [];
    return visited.rows.value.filter((row) => row.characterId === me).map((row) => row.locationId);
  });
  // The regions of the current place, every exit destination and every visited place (UI-SPEC P1),
  // sorted and de-duplicated; a location id the session does not know is skipped.
  const poolRegionKey = computed<string | null>(() => {
    const here = locationKey.value;
    if (here === null) return null;
    const byId = locationById.value;
    const regions: bigint[] = [];
    const add = (locationId: bigint): void => {
      const location = byId.get(locationId);
      if (location !== undefined) regions.push(location.regionId);
    };
    add(here);
    for (const connection of connectionList.value) add(connection.toLocationId);
    for (const id of visitedLocationIds.value) add(id);
    return idListKey(regions);
  });
  // keyedIdList on the region key (filter = membership of row.regionId, the shared-cache rule),
  // written out to record each binding's region set: a place reads ready only once the binding
  // covering its region has applied.
  const poolRegionsOf = new WeakMap<object, ReadonlySet<bigint>>();
  const pools = createKeyed<C, string, TableBinding<C, PoolLevel>>({
    key: poolRegionKey,
    conn: input.conn,
    make: (k) => {
      const ids = parseIdListKey(k);
      const set = new Set(ids);
      const binding = deps.bind<PoolLevel>({
        table: (c) => c.db.poolLevel,
        sql: [queries.poolLevelsInRegions(ids)],
        filter: (row) => set.has(row.regionId),
      });
      poolRegionsOf.set(binding, set);
      return binding;
    },
  });
  const poolRows = keyedRows(pools);
  const NO_REGIONS: ReadonlySet<bigint> = new Set();
  const poolRegionsApplied = computed<ReadonlySet<bigint>>(() => {
    const binding = pools.current.value;
    if (binding === null || !binding.applied.value) return NO_REGIONS;
    return poolRegionsOf.get(binding) ?? NO_REGIONS;
  });
  function poolsAppliedFor(locationId: bigint): boolean {
    const location = locationById.value.get(locationId);
    return location !== undefined && poolRegionsApplied.value.has(location.regionId);
  }
  const poolLevelsHere = computed<readonly PoolLevel[]>(() => {
    const here = locationKey.value;
    if (here === null) return [];
    return poolRows.value.filter((row) => row.locationId === here);
  });
  const namedEnemies = keyedTable<NamedEnemy, bigint>(
    characterKey,
    (c) => c.db.namedEnemy,
    queries.namedEnemiesOf,
    (row, k) => row.characterId === k,
  );

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
    spawns,
    spawnTemplates,
    pools,
    namedEnemies,
    players,
    connectionRows,
    hotbars,
    hotbarSlots,
    abilities,
    cooldowns,
    contributions,
    renown,
    renownPerks,
    ownGathers,
    ownCasts,
    groups,
    members,
    known,
    templates,
    objectives,
    ownParticipant,
    ownActions,
    fightParticipants,
    fightEnemies,
    fightRounds,
    fightCasts,
    fightEnemyEffects,
    fightPets,
    fightNarratives,
    enemyTemplates,
    enemyAbilities,
  ];

  // Derived ------------------------------------------------------------------------------
  const groupRows = keyedRows(groups);
  const playerRows = keyedRows(players);
  const gatherRows = keyedRows(ownGathers);
  const castRows = keyedRows(ownCasts);

  // First-seen time of every own gather and cast row (action row, a13), in client microseconds. It is
  // kept here so a FeedShell remount keeps the bar's start; entries drop with their row, reset() empties it.
  const actionSeen = createActionFirstSeen({
    gathers: gatherRows,
    casts: castRows,
    now: () => (deps.now ?? Date.now)() * 1000,
  });

  const characterId = characterKey;
  const connected = computed(() => input.status.value === 'connected' && input.conn.value !== null);
  const inCombat = computed(() => input.character.value?.combatTargetEnemyId != null);
  const playersHere = computed(() => {
    const me = characterId.value;
    return playerRows.value.filter((row) => row.id !== me);
  });
  const group = computed<Group | null>(() => groupRows.value[0] ?? null);
  const knownRows = keyedRows(known);
  const roundRows = keyedRows(fightRounds);
  const petRows = keyedRows(fightPets);
  const openRound = computed<CombatRound | null>(() => {
    let open: CombatRound | null = null;
    for (const round of roundRows.value) {
      if (round.state !== 'action_select') continue;
      if (open === null || round.roundNumber > open.roundNumber) open = round;
    }
    return open;
  });
  const roundNumber = computed<bigint | null>(() => {
    if (openRound.value !== null) return openRound.value.roundNumber;
    let highest: bigint | null = null;
    for (const round of roundRows.value) {
      if (highest === null || round.roundNumber > highest) highest = round.roundNumber;
    }
    return highest;
  });
  const ownAction = computed<CombatAction | null>(() => {
    const open = openRound.value;
    if (open === null) return null;
    return (
      ownActionRows.value.find(
        (action) => action.combatId === open.combatId && action.roundNumber === open.roundNumber,
      ) ?? null
    );
  });
  const characterNames = computed<ReadonlyMap<bigint, string>>(() => {
    const names = new Map<bigint, string>();
    for (const character of knownRows.value) names.set(character.id, character.name);
    const me = input.character.value;
    if (me !== null) names.set(me.id, me.name);
    return names;
  });
  const petNames = computed<ReadonlyMap<bigint, string>>(() => {
    const names = new Map<bigint, string>();
    for (const pet of petRows.value) names.set(pet.id, pet.name);
    return names;
  });
  const combat: CombatData = {
    active: computed(() => ownParticipantRows.value.length > 0),
    applied: computed(
      () => combatKey.value !== null && (fightEnemies.current.value?.applied.value ?? false),
    ),
    castsApplied: computed(() => fightCasts.current.value?.applied.value ?? false),
    aggroApplied: computed(() => combatAggro.applied.value),
    roundsApplied: computed(() => fightRounds.current.value?.applied.value ?? false),
    participantApplied: computed(() => ownParticipant.current.value?.applied.value ?? false),
    combatId: combatKey,
    self: computed(() => ownParticipantRows.value[0] ?? null),
    participants: fightParticipantRows,
    enemies: fightEnemyRows,
    enemyTemplates: keyedRows(enemyTemplates),
    enemyAbilities: keyedRows(enemyAbilities),
    rounds: roundRows,
    openRound,
    roundNumber,
    actions: ownActionRows,
    ownAction,
    casts: keyedRows(fightCasts),
    enemyEffects: keyedRows(fightEnemyEffects),
    narratives: keyedRows(fightNarratives),
    pets: petRows,
    aggro: combatAggro.rows,
    characterNames,
    petNames,
  };
  // Round headers, wind-up blocks and narrated rounds reach the feed from the combat rows.
  wireCombatFeed({ combat, feed, clock, selfId: characterKey });
  const reducers = computed<GameReducers | null>(() => {
    const conn = input.conn.value;
    return connected.value && conn !== null ? conn.reducers : null;
  });
  const privateEventsApplied = computed(() => privateEvents.current.value?.applied.value ?? false);

  // The store follows the active character; a new character starts with an empty history.
  watch(characterId, (id) => feed.setCharacter(id), { immediate: true, flush: 'sync' });

  function reset(): void {
    clearLinger();
    narrativeKey.value = null;
    for (const binding of staticBindings) binding.dispose();
    for (const keyed of keyedAll) keyed.reset();
    actionSeen.reset();
    feed.clear();
  }

  return {
    connected,
    character: computed(() => input.character.value),
    characterId,
    inCombat,
    locations: input.locations,
    regions: input.regions,
    connections: connectionList,
    npcsHere: keyedRows(npcs),
    enemiesHere: spawnRows,
    enemyTemplatesHere: keyedRows(spawnTemplates),
    poolLevels: poolRows,
    poolLevelsHere,
    poolRegionsApplied,
    poolsAppliedFor,
    namedEnemies: keyedRows(namedEnemies),
    harvestCaps: harvestCaps.rows,
    visitedLocationIds,
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
    gathers: gatherRows,
    characterCasts: castRows,
    loot: combatLoot.rows,
    actionFirstSeen: actionSeen.firstSeen,
    privateEventsApplied,
    combat,
    feed,
    clock,
    reducers,
    reset,
    dispose: reset,
  };
}
