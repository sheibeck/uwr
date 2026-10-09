import { toSql } from 'spacetimedb';
import { tables } from '../module_bindings';

// Typed, filtered subscription SQL for every table Phase 47 and 48 read. Never subscribe a
// whole public table: each keyed table carries a WHERE on an indexed column. The
// private event table is filtered by owner_user_id, not character id, because presence
// rows are addressed to the owner (research Pitfall 8). Views (my_*), faction and
// event_world are small or already scoped server-side, so they stay unfiltered.
// The combat tables are keyed by character id (own participant and own choice rows) or by
// combat id (everything of the one fight); enemy templates and abilities are id-list OR
// chains. The loot view my_combat_loot is static: it is scoped server-side (the active character's
// untaken drops, quick 261008-f3m). The threat view my_combat_aggro is no longer subscribed: the
// threat block is gone (51.3.1.1-22, D-40) and nothing reads it (review C WR-06).
// Density pools (51.3.1.1-18): pool_level is keyed by region ids (an OR chain on region_id), the own
// named_enemy rows by character_id; my_harvest_caps and my_visited_locations are per-sender views
// (no WHERE). resource_node is no longer subscribed.
// 51.3.1.1-31: the own fight's combat_encounter row is keyed by its id (= the combat id), for the
// encounter heading and source line. active_pet.combat_id is an OPTIONAL u64, and SpacetimeDB cannot
// parse a bare literal as an option ("cannot be parsed as type (some: U64 | none: ())"), so the
// fight's pets come through the fight roster: a semijoin of combat_participant (by combat_id) to
// active_pet on the indexed character_id columns; the client keeps the rows whose combatId matches.
// Never compare an optional column with a literal (queries.test.ts checks every query).

export interface GameQueries {
  myCharacterEffects: string;
  myQuests: string;
  myLlmJobs: string;
  myGroupInvites: string;
  myFactionStandings: string;
  faction: string;
  eventWorld: string;
  activeWorldEvents: string;
  myCombatLoot: string;
  /** The active character's harvest caps (per-sender view, no WHERE). */
  myHarvestCaps: string;
  /** The active character's visited places (per-sender view, no WHERE). */
  myVisitedLocations: string;
  eventPrivate(userId: bigint): string;
  eventLocation(locationId: bigint): string;
  eventGroup(groupId: bigint): string;
  npcsAt(locationId: bigint): string;
  enemySpawnsAt(locationId: bigint): string;
  charactersAt(locationId: bigint): string;
  connectionsFrom(locationId: bigint): string;
  hotbars(characterId: bigint): string;
  hotbarSlots(characterId: bigint): string;
  abilityTemplates(characterId: bigint): string;
  abilityCooldowns(characterId: bigint): string;
  eventContributions(characterId: bigint): string;
  combatParticipantsOf(characterId: bigint): string;
  combatActions(characterId: bigint): string;
  combatParticipants(combatId: bigint): string;
  combatEnemies(combatId: bigint): string;
  combatRounds(combatId: bigint): string;
  combatCasts(combatId: bigint): string;
  combatNarratives(combatId: bigint): string;
  combatPets(combatId: bigint): string;
  combatEnemyEffects(combatId: bigint): string;
  /** The fight's combat_encounter row (its id is the combat id). */
  combatEncounter(combatId: bigint): string;
  renown(characterId: bigint): string;
  renownPerks(characterId: bigint): string;
  resourceGathers(characterId: bigint): string;
  characterCasts(characterId: bigint): string;
  group(groupId: bigint): string;
  groupMembers(groupId: bigint): string;
  /** Non-empty list: an OR chain on id. */
  charactersById(ids: readonly bigint[]): string;
  /** Non-empty list: an OR chain on id. */
  questTemplatesById(ids: readonly bigint[]): string;
  /** Non-empty list: an OR chain on event_id. */
  eventObjectivesByEvent(eventIds: readonly bigint[]): string;
  /** Non-empty list: an OR chain on id. */
  enemyTemplatesById(ids: readonly bigint[]): string;
  /** Non-empty list: an OR chain on enemy_template_id. */
  enemyAbilitiesByTemplate(ids: readonly bigint[]): string;
  /** Non-empty list: an OR chain on region_id. */
  poolLevelsInRegions(ids: readonly bigint[]): string;
  namedEnemiesOf(characterId: bigint): string;
}

function requireIds(ids: readonly bigint[]): void {
  if (ids.length === 0) throw new Error('[queries] an id list must not be empty');
}

export function gameQueries(): GameQueries {
  return {
    myCharacterEffects: toSql(tables.myCharacterEffects),
    myQuests: toSql(tables.myQuests),
    myLlmJobs: toSql(tables.myLlmJobs),
    myGroupInvites: toSql(tables.myGroupInvites),
    myFactionStandings: toSql(tables.myFactionStandings),
    faction: toSql(tables.faction),
    eventWorld: toSql(tables.eventWorld),
    activeWorldEvents: toSql(tables.worldEvent.where((r) => r.status.eq('active'))),
    myCombatLoot: toSql(tables.myCombatLoot),
    myHarvestCaps: toSql(tables.myHarvestCaps),
    myVisitedLocations: toSql(tables.myVisitedLocations),
    eventPrivate: (userId) => toSql(tables.eventPrivate.where((r) => r.ownerUserId.eq(userId))),
    eventLocation: (locationId) =>
      toSql(tables.eventLocation.where((r) => r.locationId.eq(locationId))),
    eventGroup: (groupId) => toSql(tables.eventGroup.where((r) => r.groupId.eq(groupId))),
    npcsAt: (locationId) => toSql(tables.npc.where((r) => r.locationId.eq(locationId))),
    enemySpawnsAt: (locationId) =>
      toSql(tables.enemySpawn.where((r) => r.locationId.eq(locationId))),
    charactersAt: (locationId) => toSql(tables.character.where((r) => r.locationId.eq(locationId))),
    connectionsFrom: (locationId) =>
      toSql(tables.locationConnection.where((r) => r.fromLocationId.eq(locationId))),
    hotbars: (characterId) => toSql(tables.hotbar.where((r) => r.characterId.eq(characterId))),
    hotbarSlots: (characterId) =>
      toSql(tables.hotbarSlot.where((r) => r.characterId.eq(characterId))),
    abilityTemplates: (characterId) =>
      toSql(tables.abilityTemplate.where((r) => r.characterId.eq(characterId))),
    abilityCooldowns: (characterId) =>
      toSql(tables.abilityCooldown.where((r) => r.characterId.eq(characterId))),
    eventContributions: (characterId) =>
      toSql(tables.eventContribution.where((r) => r.characterId.eq(characterId))),
    combatParticipantsOf: (characterId) =>
      toSql(tables.combatParticipant.where((r) => r.characterId.eq(characterId))),
    combatActions: (characterId) =>
      toSql(tables.combatAction.where((r) => r.characterId.eq(characterId))),
    combatParticipants: (combatId) =>
      toSql(tables.combatParticipant.where((r) => r.combatId.eq(combatId))),
    combatEnemies: (combatId) => toSql(tables.combatEnemy.where((r) => r.combatId.eq(combatId))),
    combatRounds: (combatId) => toSql(tables.combatRound.where((r) => r.combatId.eq(combatId))),
    combatCasts: (combatId) =>
      toSql(tables.combatEnemyCast.where((r) => r.combatId.eq(combatId))),
    combatNarratives: (combatId) =>
      toSql(tables.combatNarrative.where((r) => r.combatId.eq(combatId))),
    combatPets: (combatId) =>
      toSql(
        tables.combatParticipant
          .where((r) => r.combatId.eq(combatId))
          .rightSemijoin(tables.activePet, (participant, pet) => participant.characterId.eq(pet.characterId)),
      ),
    combatEnemyEffects: (combatId) =>
      toSql(tables.combatEnemyEffect.where((r) => r.combatId.eq(combatId))),
    combatEncounter: (combatId) => toSql(tables.combatEncounter.where((r) => r.id.eq(combatId))),
    renown: (characterId) => toSql(tables.renown.where((r) => r.characterId.eq(characterId))),
    renownPerks: (characterId) =>
      toSql(tables.renownPerk.where((r) => r.characterId.eq(characterId))),
    resourceGathers: (characterId) =>
      toSql(tables.resourceGather.where((r) => r.characterId.eq(characterId))),
    characterCasts: (characterId) =>
      toSql(tables.characterCast.where((r) => r.characterId.eq(characterId))),
    group: (groupId) => toSql(tables.group.where((r) => r.id.eq(groupId))),
    groupMembers: (groupId) => toSql(tables.groupMember.where((r) => r.groupId.eq(groupId))),
    charactersById: (ids) => {
      requireIds(ids);
      return toSql(
        tables.character.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
    questTemplatesById: (ids) => {
      requireIds(ids);
      return toSql(
        tables.questTemplate.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
    eventObjectivesByEvent: (eventIds) => {
      requireIds(eventIds);
      return toSql(
        tables.eventObjective.where((r) =>
          eventIds.map((id) => r.eventId.eq(id)).reduce((a, b) => a.or(b)),
        ),
      );
    },
    enemyTemplatesById: (ids) => {
      requireIds(ids);
      return toSql(
        tables.enemyTemplate.where((r) => ids.map((id) => r.id.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
    enemyAbilitiesByTemplate: (ids) => {
      requireIds(ids);
      return toSql(
        tables.enemyAbility.where((r) =>
          ids.map((id) => r.enemyTemplateId.eq(id)).reduce((a, b) => a.or(b)),
        ),
      );
    },
    poolLevelsInRegions: (ids) => {
      requireIds(ids);
      return toSql(
        tables.poolLevel.where((r) => ids.map((id) => r.regionId.eq(id)).reduce((a, b) => a.or(b))),
      );
    },
    namedEnemiesOf: (characterId) =>
      toSql(tables.namedEnemy.where((r) => r.characterId.eq(characterId))),
  };
}
