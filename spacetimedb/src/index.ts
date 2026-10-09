import { t, SenderError } from 'spacetimedb/server';
import { requireAdmin } from './data/admin';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { ensureDefaultHotbar } from './helpers/items';
import { offerNextOwedSkill, requestSkillOffer } from './helpers/skill_offer';
import spacetimedb, {
  scheduledReducers,
  Player, Character,
  FriendRequest, Friend,
  GroupMember, GroupInvite, EventGroup,
  CharacterEffect, CombatResult, CombatLoot,
  NpcDialog, QuestInstance,
  Faction, FactionStanding, UiPanelLayout, VendorBuyback, ActionResult, VisitedLocation,
  CombatParticipant, CombatLoopTick,
  CombatRound, CombatAction, CombatNarrative, RoundTimerTick,
  PullState, PullTick,
  HealthRegenTick, EffectTick, HotTick, CastTick,
  DayNightTick, DisconnectLogoutTick, CharacterLogoutTick, GroupInviteExpiryTick,
  ResourceGatherTick, EnemyRespawnTick, InactivityTick,
  TradeSession, TradeItem,
  EnemyAbility, CombatEnemyCooldown, CombatEnemyCast,
  CombatPendingAdd, AggroEntry,
  Corpse, CorpseItem,
  PendingSpellCast,
  QuestItem, NamedEnemy, SearchResult,
  AppVersion,
  ActiveBardSong, BardSongTick,
  ActivePet,
  PendingSkill,
  PendingRenownPerk,
  VendorRestockTick,
  PassageSweepTick,
  PoolTick,
} from './schema/tables';
import { PASSAGE_SWEEP_INTERVAL_MICROS, sweepPassages } from './helpers/passages';
import { DENSITY_RULES } from './data/density_rules';
import { reconcileOnline, syncCharacterOnline } from './helpers/online';
import { announcePartyPresence, sessionOnReconnect } from './helpers/party_presence';
import { pruneFinishedReinviteWaits } from './helpers/group_invites';
import {
  VENDOR_RESTOCK_BATCH,
  VENDOR_RESTOCK_CONTINUE_MICROS,
  VENDOR_RESTOCK_INTERVAL_MICROS,
  baseStockQuantity,
  listPriceFor,
  planRestockBatch,
  restockSeed,
  selectBaseStock,
  type StockOrigin,
} from './data/vendor_stock';
export default spacetimedb;
import { registerReducers } from './reducers';
import {
  effectiveGroupId,
  effectiveGroupKey,
  getGroupOrSoloParticipants,
  requirePullerOrLog,
} from './helpers/group';
import { startCombat, startCombatForSpawn } from './reducers/combat';
import type { CombatOrigin, DrawnEnemy } from './reducers/combat';
import { registerViews } from './views';
import {
  ARMOR_TYPES_WITH_NONE,
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  MANA_MULTIPLIER,
  normalizeArmorType,
  normalizeClassName,
  characterUsesResource,
  bestCasterStat,
} from './data/class_stats';
import { findRaceDefinition, levelUpBaseStats } from './data/race_bonuses';
import { MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel } from './data/xp';
import { RACE_DATA, ensureRaces } from './data/races';
// ensureFactions removed -- factions are now generated through play
import {
  calculateCritChance,
  getCritMultiplier,
  getAbilityStatScaling,
  getAbilityMultiplier,
  calculateHealingPower,
  applyMagicResistMitigation,
  DOT_SCALING_RATE_MODIFIER,
  AOE_DAMAGE_MULTIPLIER,
  DEBUFF_POWER_COST_PERCENT,
  ENEMY_BASE_POWER,
  ENEMY_LEVEL_POWER_SCALING,
  GLOBAL_DAMAGE_MULTIPLIER,
  TANK_THREAT_MULTIPLIER,
  HEALER_THREAT_MULTIPLIER,
  HEALING_THREAT_PERCENT,
  ABILITY_STAT_SCALING,
} from './data/combat_scaling.js';

// Helper functions - imported from modular files
import {
  tableHasRows,
  requirePlayerUserId,
  requireCharacterOwnedBy,
  activeCombatIdForCharacter,
  appendWorldEvent,
  appendLocationEvent,
  appendPrivateEvent,
  appendSystemMessage,
  logPrivateAndGroup,
  appendPrivateAndGroupEvent,
  fail,
  appendNpcDialog,
  appendGroupEvent,
  appendCreationEvent,
} from './helpers/events';

import {
  EQUIPMENT_SLOTS,
  STARTER_ARMOR,
  STARTER_WEAPONS,
  getEquippedBonuses,
  getEquippedWeaponStats,
  findItemTemplateByName,
  getItemCount,
  addItemToInventory,
  getInventorySlotCount,
  hasInventorySpace,
  removeItemFromInventory,
  grantStarterItems,
  ensureStarterItemTemplates,
  MAX_INVENTORY_SLOTS,
} from './helpers/items';

import {
  abilityResourceCost,
  hasShieldEquipped,
  abilityCooldownMicros,
  abilityCastMicros,
  rollAttackOutcome,
  abilityDamageFromWeapon,
  addCharacterEffect,
  addEnemyEffect,
  applyHpBonus,
  getTopAggroId,
  sumCharacterEffect,
  sumEnemyEffect,
  executeAbility,
  applyEnemyAbilityDamage,
  executeEnemyAbility,
  executePetAbility,
  executeAbilityAction,
  GROUP_SIZE_DANGER_BASE,
  GROUP_SIZE_BIAS_RANGE,
  GROUP_SIZE_BIAS_MAX,
} from './helpers/combat';

import {
  getEnemyRole,
  scaleByPercent,
  applyArmorMitigation,
  applyVariance,
  computeEnemyStats,
} from './helpers/combat_enemies';

import {
  applyPerkProcs,
  executePerkAbility,
  calculateFleeChance,
} from './helpers/combat_perks';

import {
  awardXp,
  applyDeathXpPenalty,
  computeRacialAtLevelFromRow,
} from './helpers/combat_rewards';

import {
  isGroupLeaderOrSolo,
  partyMembersInLocation,
  recomputeCharacterDerived,
  isClassAllowed,
  friendUserIds,
  findCharacterByName,
  autoRespawnDeadCharacter,
  campCharacter,
  grantRaceAbility,
} from './helpers/character';

import {
  DAY_DURATION_MICROS,
  NIGHT_DURATION_MICROS,
  DEFAULT_LOCATION_SPAWNS,
  RESOURCE_GATHER_CAST_MICROS,
  getGatherableResourceTemplates,
  spawnResourceNode,
  computeLocationTargetLevel,
  getWorldState,
  isNightTime,
  connectLocations,
  areLocationsConnected,
  findEnemyTemplateByName,
  getEnemyRoleTemplates,
  pickRoleTemplate,
  seedSpawnMembers,
  refreshSpawnGroupCount,
  spawnEnemy,
  spawnEnemyWithTemplate,
  ensureAvailableSpawn,
} from './helpers/location';
import { ensurePoolsForLocation } from './helpers/families';
import { ensureLocationRuntimeBootstrap } from './helpers/world_gen';

import {
  STANDING_PER_KILL,
  RIVAL_STANDING_PENALTY,
  mutateStanding,
  grantFactionStandingForKill,
} from './helpers/economy';

import {
  createCorpse,
  cleanupDecayedCorpses,
  removeCorpseIfEmpty,
  executeResurrect,
  executeCorpseSummon,
} from './helpers/corpse';

import {
  initScheduledTables,
  ensureHealthRegenScheduled,
  ensureEffectTickScheduled,
  ensureHotTickScheduled,
  ensureCastTickScheduled,
  ensureDayNightTickScheduled,
  ensureInactivityTickScheduled,
} from './helpers/scheduling';
import { ensureLlmSweepScheduled } from './helpers/llm_schedule';
import { ensureLlmAdminState } from './helpers/llm_admin_state';
import { ensureEconomyDials } from './helpers/economy_state';

import { myBankSlotsView } from './schema/tables';

// === V2 EXPORT COLLECTION ===
// SpacetimeDB v2 requires all reducers, lifecycle hooks, and views to be named exports.
// Monkey-patch registration methods to auto-collect return values, then export via exportGroup.
const _moduleExports: Record<string, any> = {};
let _exportCounter = 0;

const _wrapMethod = (methodName: string, nameExtractor: (args: any[]) => string | undefined) => {
  const orig = (spacetimedb as any)[methodName].bind(spacetimedb);
  (spacetimedb as any)[methodName] = (...args: any[]) => {
    // Fix v1 string-name convention: ('name', ...) → ({ name }, ...)
    const fixedArgs = [...args];
    if (methodName === 'reducer' && args.length >= 2 && typeof args[0] === 'string') {
      fixedArgs[0] = { name: args[0] };
    }
    const result = orig(...fixedArgs);
    const exportName = nameExtractor(args) || `_${methodName}_${_exportCounter++}`;
    _moduleExports[exportName] = result;
    return result;
  };
};

_wrapMethod('reducer', (args) => typeof args[0] === 'string' ? args[0] : args[0]?.name);
_wrapMethod('init', () => '__init__');
_wrapMethod('clientConnected', () => '__client_connected__');
_wrapMethod('clientDisconnected', () => '__client_disconnected__');
_wrapMethod('view', (args) => args[0]?.name);
_wrapMethod('procedure', (args) => {
  // procedure(opts, params, ret, fn) — opts is first arg when 4 args
  if (args.length >= 4 && typeof args[0]?.name === 'string') return args[0].name;
  // procedure(params, ret, fn) — no name, use counter fallback
  return undefined;
});

// Include the view defined in tables.ts (runs before monkey-patch)
_moduleExports['my_bank_slots'] = myBankSlotsView;
// === END V2 EXPORT COLLECTION ===

scheduledReducers['tick_day_night'] = spacetimedb.reducer('tick_day_night', { arg: DayNightTick.rowType }, (ctx) => {
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
  const world = getWorldState(ctx);
  if (!world) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (world.nextTransitionAtMicros > now) {
    ctx.db.day_night_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(world.nextTransitionAtMicros),
    });
    return;
  }
  const nextIsNight = !world.isNight;
  const nextDuration = nextIsNight ? NIGHT_DURATION_MICROS : DAY_DURATION_MICROS;
  const nextTransition = now + nextDuration;
  ctx.db.world_state.id.update({
    ...world,
    isNight: nextIsNight,
    nextTransitionAtMicros: nextTransition,
  });
  const message = nextIsNight ? 'Night falls over the realm.' : 'Dawn breaks over the realm.';
  appendWorldEvent(ctx, 'world', message);
  // Ordinary creatures are pools now (Phase 51.3.1.1, D-01): the turn no longer respawns anything.
  ctx.db.day_night_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextTransition),
  });
});

// Server-side sweep: safety net for players who disconnect without camping.
// The client handles the 15-minute idle timer for connected sessions.
const INACTIVITY_TIMEOUT_MICROS = 900_000_000n; // 15 minutes
const INACTIVITY_SWEEP_INTERVAL_MICROS = 300_000_000n; // 5 minutes

scheduledReducers['sweep_inactivity'] = spacetimedb.reducer('sweep_inactivity', { arg: InactivityTick.rowType }, (ctx) => {
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;

  ctx.db.inactivity_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(now + INACTIVITY_SWEEP_INTERVAL_MICROS),
  });

  const cutoff = now - INACTIVITY_TIMEOUT_MICROS;

  for (const player of ctx.db.player.iter()) {
    if (!player.activeCharacterId || !player.userId) continue;

    const lastActive = player.lastActivityAt ?? player.lastSeenAt;
    if (!lastActive || lastActive.microsSinceUnixEpoch > cutoff) continue;

    const character = ctx.db.character.id.find(player.activeCharacterId);
    if (!character) {
      ctx.db.player.id.update({ ...player, activeCharacterId: undefined, lastActivityAt: undefined });
      continue;
    }

    if (activeCombatIdForCharacter(ctx, character.id)) continue;

    campCharacter(ctx, player, character, true);
  }

  // Online status (51.1): repair every drifted flag. This is also the backfill after the 51.1
  // publish (every row starts offline); no client-callable reducer does this.
  reconcileOnline(ctx);

  // Finished re-invite waits for people nobody invites again (51.1 review 2 IN-05).
  pruneFinishedReinviteWaits(ctx);
});

// Vendor base stock: a private scheduled tick refills each vendor's base listings about every 15
// minutes. Only listings with a vendor_base_stock marker are replaced; player-sold ones never are.
// A tick due now is armed on connect when none is pending, because init does not run again on a
// republish (the first fill on an existing database comes from clientConnected).
function ensureVendorRestockScheduled(ctx: any): void {
  if ([...ctx.db.vendor_restock_tick.iter()].length > 0) return;
  ctx.db.vendor_restock_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch),
    afterNpcId: 0n,
  });
}

function restockVendor(
  ctx: any,
  npc: any,
  templates: any[],
  tickMicros: bigint,
  origins: Map<bigint, StockOrigin>,
): void {
  // Drop this vendor's previous base stock (marked rows only), then forget the markers.
  for (const marker of [...ctx.db.vendor_base_stock.by_vendor.filter(npc.id)]) {
    if (ctx.db.vendor_inventory.id.find(marker.listingId)) {
      ctx.db.vendor_inventory.id.delete(marker.listingId);
    }
    ctx.db.vendor_base_stock.listingId.delete(marker.listingId);
  }
  // What is left are player-sold listings: never edited or deleted here, and never duplicated.
  const excludeTemplateIds: bigint[] = [];
  for (const row of ctx.db.vendor_inventory.by_vendor.filter(npc.id)) {
    excludeTemplateIds.push(row.itemTemplateId);
  }
  const location = ctx.db.location.id.find(npc.locationId);
  const region = location ? ctx.db.region.id.find(location.regionId) : undefined;
  const picks = selectBaseStock({
    templates,
    vendor: npc,
    dangerMultiplier: region?.dangerMultiplier ?? 100n,
    levelOffset: location?.levelOffset ?? 0n,
    excludeTemplateIds,
    tickMicros,
    originOf: (id: bigint) => origins.get(id),
    vendorRegionId: location?.regionId,
  });
  for (const pick of picks) {
    const listing = ctx.db.vendor_inventory.insert({
      id: 0n,
      npcId: npc.id,
      itemTemplateId: pick.id,
      price: listPriceFor(pick.vendorValue ?? 0n),
      qualityTier: undefined,
      quantity: baseStockQuantity(pick.rarity, restockSeed(npc.id, tickMicros), pick.id),
    });
    ctx.db.vendor_base_stock.insert({ listingId: listing.id, npcId: npc.id });
  }
}

scheduledReducers['restock_vendors'] = spacetimedb.reducer('restock_vendors', { arg: VendorRestockTick.rowType }, (ctx, { arg }) => {
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const vendors = [...ctx.db.npc.iter()].filter((n: any) => n.npcType === 'vendor');
  const plan = planRestockBatch(
    vendors.map((n: any) => n.id),
    arg.afterNpcId ?? 0n,
    VENDOR_RESTOCK_BATCH
  );
  if (plan.batch.length > 0) {
    const templates = [...ctx.db.item_template.iter()];
    // Phase 51.3: the origin of every generated template, built once per tick (template id -> region, role, rarity).
    const origins = new Map<bigint, StockOrigin>();
    for (const row of ctx.db.economy_item.iter()) {
      origins.set(row.itemTemplateId, { regionId: row.regionId, role: row.role, rarity: row.rarity });
    }
    for (const id of plan.batch) {
      const npc = vendors.find((n: any) => n.id === id);
      if (npc) restockVendor(ctx, npc, templates, now, origins);
    }
  }
  ctx.db.vendor_restock_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(now + (plan.more ? VENDOR_RESTOCK_CONTINUE_MICROS : VENDOR_RESTOCK_INTERVAL_MICROS)),
    afterNpcId: plan.more ? plan.nextAfterNpcId : 0n,
  });
});

// Passage sweep: a private scheduled tick every 5 minutes returns offline characters standing in an
// explored passage to their own side and collapses empty passages into border crossings. The first
// tick is also the one-time cleanup of passages that existed before this phase. A tick due now is
// armed in init and on connect when none is pending, because init does not run again on a republish.
function ensurePassageSweepScheduled(ctx: any): void {
  if ([...ctx.db.passage_sweep_tick.iter()].length > 0) return;
  ctx.db.passage_sweep_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch),
  });
}

scheduledReducers['sweep_passages'] = spacetimedb.reducer('sweep_passages', { arg: PassageSweepTick.rowType }, (ctx) => {
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
  ctx.db.passage_sweep_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + PASSAGE_SWEEP_INTERVAL_MICROS),
  });
  sweepPassages(ctx);
});

// Density pools (Phase 51.3.1.1): a private scheduled tick that settles regrowth and runs the
// hunters, trends and migration. This plan only registers it, guarded and rescheduling one row;
// Plan 14 adds the work and the arming (no pool_tick row is inserted anywhere yet).
scheduledReducers['tick_pools'] = spacetimedb.reducer('tick_pools', { arg: PoolTick.rowType }, (ctx) => {
  if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
  ctx.db.pool_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + DENSITY_RULES.POOL_TICK_MICROS),
    afterRegionId: 0n,
  });
});

spacetimedb.reducer('set_app_version',{ version: t.string() }, (ctx, { version }) => {
  requireAdmin(ctx);
  const existing = [...ctx.db.app_version.iter()][0];
  if (existing) {
    ctx.db.app_version.id.update({ ...existing, version, updatedAt: ctx.timestamp });
  } else {
    ctx.db.app_version.insert({ id: 0n, version, updatedAt: ctx.timestamp });
  }
});

registerViews({
  spacetimedb,
  t,
  Player,
  FriendRequest,
  Friend,
  GroupInvite,
  EventGroup,
  GroupMember,
  CharacterEffect,
  CombatResult,
  CombatLoot,
  NpcDialog,
  QuestInstance,
  Faction,
  FactionStanding,
  UiPanelLayout,
  VendorBuyback,
  ActionResult,
  VisitedLocation,
});

// Reducer: the player asks the Keeper for a new skill offer (recovers a failed or missed offer)
spacetimedb.reducer('request_skill_offer', { characterId: t.u64() }, (ctx: any, { characterId }: { characterId: bigint }) => {
  const character = requireCharacterOwnedBy(ctx, characterId);
  const offer = requestSkillOffer(ctx, character, ctx.sender);
  if (offer.kind === 'system') {
    fail(ctx, character, offer.text);
    return;
  }
  appendPrivateEvent(ctx, characterId, character.ownerUserId, 'narrative', offer.text);
});

// Reducer: player chooses one of 3 pending skills
spacetimedb.reducer('choose_skill', { pendingSkillId: t.u64() }, (ctx: any, { pendingSkillId }: { pendingSkillId: bigint }) => {
  // Find the PendingSkill row
  const pending = ctx.db.pending_skill.id.find(pendingSkillId);
  if (!pending) throw new SenderError('Pending skill not found');

  // Validate ownership
  const character = ctx.db.character.id.find(pending.characterId);
  if (!character) throw new SenderError('Character not found');
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || !character.ownerUserId || player.userId !== character.ownerUserId) {
    throw new SenderError('Not your character');
  }

  // Insert chosen skill into ability_template
  const abilityRow = ctx.db.ability_template.insert({
    id: 0n,
    characterId: pending.characterId,
    name: pending.name,
    description: pending.description,
    kind: pending.kind,
    targetRule: pending.targetRule,
    resourceType: pending.resourceType,
    resourceCost: pending.resourceCost,
    castSeconds: pending.castSeconds,
    cooldownSeconds: pending.cooldownSeconds,
    scaling: pending.scaling,
    value1: pending.value1,
    value2: pending.value2,
    damageType: pending.damageType,
    effectType: pending.effectType,
    effectMagnitude: pending.effectMagnitude,
    effectDuration: pending.effectDuration,
    levelRequired: pending.levelRequired,
    isGenerated: true,
  });

  // Auto-assign to first available hotbar slot (1-6, client uses 1-based slots)
  const defaultHotbar = ensureDefaultHotbar(ctx, pending.characterId);
  const existingSlots = [...ctx.db.hotbar_slot.by_hotbar.filter(defaultHotbar.id)];
  const usedSlots = new Set(existingSlots.map((s: any) => Number(s.slot)));
  let assignedSlot = -1;
  for (let i = 1; i <= 6; i++) {
    if (!usedSlots.has(i)) {
      assignedSlot = i;
      break;
    }
  }
  if (assignedSlot === -1) {
    // All slots full, overwrite slot 1
    assignedSlot = 1;
    const slot1 = existingSlots.find((s: any) => Number(s.slot) === 1);
    if (slot1) {
      ctx.db.hotbar_slot.id.update({
        ...slot1,
        abilityTemplateId: abilityRow.id,
        assignedAt: ctx.timestamp,
      });
    } else {
      ctx.db.hotbar_slot.insert({
        id: 0n,
        characterId: pending.characterId,
        hotbarId: defaultHotbar.id,
        slot: 1,
        abilityTemplateId: abilityRow.id,
        assignedAt: ctx.timestamp,
      });
    }
    appendPrivateEvent(ctx, pending.characterId, character.ownerUserId, 'system',
      'All hotbar slots were full. The new ability was placed in slot 1, replacing the previous occupant.');
  } else {
    ctx.db.hotbar_slot.insert({
      id: 0n,
      characterId: pending.characterId,
      hotbarId: defaultHotbar.id,
      slot: assignedSlot,
      abilityTemplateId: abilityRow.id,
      assignedAt: ctx.timestamp,
    });
  }

  // Delete ALL PendingSkill rows for this character (chosen + unchosen)
  const allPending = [...ctx.db.pending_skill.by_character.filter(pending.characterId)];
  for (const row of allPending) {
    ctx.db.pending_skill.id.delete(row.id);
  }

  // Narrative: skill chosen
  appendPrivateEvent(ctx, pending.characterId, character.ownerUserId, 'narrative',
    `[${pending.name}] it is. The others scatter like forgotten dreams. You will never see them again.`);
  appendPrivateEvent(ctx, pending.characterId, character.ownerUserId, 'system',
    `You learned [${pending.name}] — ${pending.kind}, ${pending.value1} power, ${pending.cooldownSeconds}s cooldown`);

  // One offer per level (WR-B02): a level claimed while this offer waited gets its offer now.
  const next = offerNextOwedSkill(ctx, character, ctx.sender);
  if (next) appendPrivateEvent(ctx, pending.characterId, character.ownerUserId, next.kind, next.text);
});

// Reducer: player manually applies one pending level-up
spacetimedb.reducer('apply_level_up', { characterId: t.u64() }, (ctx: any, { characterId }: { characterId: bigint }) => {
  // Validate ownership
  const character = ctx.db.character.id.find(characterId);
  if (!character) throw new SenderError('Character not found');
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || !character.ownerUserId || player.userId !== character.ownerUserId) {
    throw new SenderError('Not your character');
  }

  // Check there are pending levels to apply
  const currentPending = character.pendingLevels ?? 0n;
  if (currentPending <= 0n) {
    appendPrivateEvent(ctx, characterId, character.ownerUserId, 'system',
      'You have no pending levels to apply.');
    return;
  }

  // Block level-up during active combat
  const activeCombatId = activeCombatIdForCharacter(ctx, characterId);
  if (activeCombatId !== null) {
    appendPrivateEvent(ctx, characterId, character.ownerUserId, 'system',
      'You cannot level up during combat. Finish the fight first.');
    return;
  }

  // Process exactly ONE level
  const newLevel = character.level + 1n;

  // Compute new base stats; the race_definition bonus is kept through the rebuild (D1).
  const raceDef = findRaceDefinition(ctx, character.race);
  const raceRow = [...ctx.db.race.iter()].find((r: any) => r.name === character.race);
  // The legacy race-table stat delta from the previous level-up is on the character too (finalize
  // adds none at level 1), so it is removed before primary/secondary detection (WR-01).
  const legacyNow = raceRow && character.level > 1n ? computeRacialAtLevelFromRow(raceRow, character.level) : null;
  const { stats: newBase } = levelUpBaseStats(character, newLevel, raceDef?.bonusesJson, legacyNow);

  // Compute racial bonuses at new level
  const racial = raceRow ? computeRacialAtLevelFromRow(raceRow, newLevel) : null;

  const updated = {
    ...character,
    level: newLevel,
    pendingLevels: currentPending - 1n,
    str: newBase.str + (racial?.str ?? 0n),
    dex: newBase.dex + (racial?.dex ?? 0n),
    cha: newBase.cha + (racial?.cha ?? 0n),
    wis: newBase.wis + (racial?.wis ?? 0n),
    int: newBase.int + (racial?.int ?? 0n),
    racialSpellDamage: racial?.racialSpellDamage || undefined,
    racialPhysDamage: racial?.racialPhysDamage || undefined,
    racialMaxHp: racial?.racialMaxHp || undefined,
    racialMaxMana: racial?.racialMaxMana || undefined,
    racialManaRegen: racial?.racialManaRegen || undefined,
    racialStaminaRegen: racial?.racialStaminaRegen || undefined,
    racialCritBonus: racial?.racialCritBonus || undefined,
    racialArmorBonus: racial?.racialArmorBonus || undefined,
    racialDodgeBonus: racial?.racialDodgeBonus || undefined,
    racialHpRegen: racial?.racialHpRegen || undefined,
    racialMaxStamina: racial?.racialMaxStamina || undefined,
    racialTravelCostIncrease: racial?.racialTravelCostIncrease || undefined,
    racialTravelCostDiscount: racial?.racialTravelCostDiscount || undefined,
    racialHitBonus: racial?.racialHitBonus || undefined,
    racialParryBonus: racial?.racialParryBonus || undefined,
    racialFactionBonus: racial?.racialFactionBonus || undefined,
    racialMagicResist: racial?.racialMagicResist || undefined,
    racialPerceptionBonus: racial?.racialPerceptionBonus || undefined,
    racialLootBonus: racial?.racialLootBonus || undefined,
  };
  ctx.db.character.id.update(updated);
  recomputeCharacterDerived(ctx, updated);

  // Notify racial bonus every level
  if (raceRow) {
    const bonusAmount = raceRow.levelBonusValue;
    const bonusLabel = raceRow.levelBonusType.replace(/_/g, ' ');
    appendPrivateEvent(ctx, characterId, character.ownerUserId, 'system',
      `Your ${raceRow.name} heritage grows stronger — +${bonusAmount} ${bonusLabel} at level ${newLevel}.`);
  }

  // Level-up announcement
  appendPrivateEvent(ctx, characterId, character.ownerUserId, 'system',
    `You have reached level ${newLevel}!`);

  const remaining = currentPending - 1n;
  if (remaining > 0n) {
    appendPrivateEvent(ctx, characterId, character.ownerUserId, 'system',
      `You have ${remaining} more level(s) to claim.`);
  }

  // Queue the skill offer for the new level (same transaction; one offer at a time per character)
  const offer = requestSkillOffer(ctx, updated, ctx.sender);
  appendPrivateEvent(ctx, characterId, character.ownerUserId, offer.kind, offer.text);
});

spacetimedb.init((ctx) => {
  // Ensure races exist (mechanical data, not seeded content)
  ensureRaces(ctx);
  // Ensure world_state row exists
  const world = ctx.db.world_state.id.find(1n);
  if (!world) {
    ctx.db.world_state.insert({
      id: 1n,
      startingLocationId: 0n,
      isNight: false,
      nextTransitionAtMicros: ctx.timestamp.microsSinceUnixEpoch + DAY_DURATION_MICROS,
    });
  }
  // Ensure starter item templates exist
  ensureStarterItemTemplates(ctx);
  // A fresh database starts with the kill switch on (calls run) and the default daily ceiling.
  ensureLlmAdminState(ctx);
  // A fresh database starts with today's tuning and the AI economy off.
  ensureEconomyDials(ctx);
  initScheduledTables(ctx);
  ensureVendorRestockScheduled(ctx);
  ensurePassageSweepScheduled(ctx);
});

spacetimedb.clientConnected((ctx) => {
  const existing = ctx.db.player.id.find(ctx.sender);
  if (!existing) {
    ctx.db.player.insert({
      id: ctx.sender,
      createdAt: ctx.timestamp,
      lastSeenAt: ctx.timestamp,
      displayName: undefined,
      activeCharacterId: undefined,
      userId: undefined,
      sessionStartedAt: undefined,
    });
  } else {
    // A signed-in account that comes back inside the logout window gets its session back, so a later
    // drop reads as link-dead.
    ctx.db.player.id.update({
      ...existing,
      sessionStartedAt: sessionOnReconnect(existing, ctx.timestamp),
      lastSeenAt: ctx.timestamp,
    });
  }
  // Online status (51.1): re-sync the reconnecting player's active character (a new player row has
  // none). With the sweep's reconcile, this backfills the flags after the publish.
  if (syncCharacterOnline(ctx, existing?.activeCharacterId)) {
    announcePartyPresence(ctx, existing?.activeCharacterId, 'back');
  }
  ensureHealthRegenScheduled(ctx);
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
  ensureDayNightTickScheduled(ctx);
  ensureInactivityTickScheduled(ctx);
  ensureLlmSweepScheduled(ctx);
  ensureVendorRestockScheduled(ctx);
  ensurePassageSweepScheduled(ctx);
});

spacetimedb.clientDisconnected((_ctx) => {
  // Presence events are written here so others see logout.
  // Note: _ctx.sender is still available in disconnect.
  const ctx = _ctx as any;
  const player = ctx.db.player.id.find(ctx.sender);
  if (player) {
    ctx.db.player.id.update({ ...player, lastSeenAt: ctx.timestamp });
  }

  if (player) {
    const disconnectAtMicros = ctx.timestamp.microsSinceUnixEpoch;
    ctx.db.disconnect_logout_tick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(disconnectAtMicros + 30_000_000n),
      playerId: player.id,
      disconnectAtMicros,
    });
  }
});

const reducerDeps = {
  spacetimedb,
  t,
  SenderError,
  requireAdmin,
  ScheduleAt,
  Timestamp,
  Character,
  GroupMember,
  GroupInvite,
  CombatParticipant,
  CombatLoopTick,
  RoundTimerTick,
  PullState,
  PullTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  DayNightTick,
  DisconnectLogoutTick,
  CharacterLogoutTick,
  GroupInviteExpiryTick,
  ResourceGatherTick,
  EnemyRespawnTick,
  InactivityTick,
  BardSongTick,
  TradeSession,
  TradeItem,
  EnemyAbility,
  CombatEnemyCooldown,
  CombatEnemyCast,
  CombatPendingAdd,
  AggroEntry,
  ActivePet,
  requirePlayerUserId,
  requireCharacterOwnedBy,
  findCharacterByName,
  friendUserIds,
  appendPrivateEvent,
  appendSystemMessage,
  fail,
  appendNpcDialog,
  appendGroupEvent,
  logPrivateAndGroup,
  appendPrivateAndGroupEvent,
  appendLocationEvent,
  ensurePoolsForLocation,
  ensureAvailableSpawn,
  computeEnemyStats,
  activeCombatIdForCharacter,
  recomputeCharacterDerived,
  executeAbilityAction,
  isClassAllowed,
  RACE_DATA,
  normalizeArmorType,
  EQUIPMENT_SLOTS,
  ARMOR_TYPES_WITH_NONE,
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  MANA_MULTIPLIER,
  normalizeClassName,
  abilityCooldownMicros,
  abilityCastMicros,
  ensureCastTickScheduled,
  grantStarterItems,
  areLocationsConnected,
  sumCharacterEffect,
  sumEnemyEffect,
  applyArmorMitigation,
  applyVariance,
  spawnEnemy,
  spawnEnemyWithTemplate,
  getEquippedWeaponStats,
  addItemToInventory,
  removeItemFromInventory,
  getItemCount,
  getGatherableResourceTemplates,
  ensureStarterItemTemplates,
  ensureLocationRuntimeBootstrap,
  initScheduledTables,
  spawnResourceNode,
  awardXp,
  xpRequiredForLevel,
  MAX_LEVEL,
  applyDeathXpPenalty,
  rollAttackOutcome,
  hasShieldEquipped,
  calculateFleeChance,
  isGroupLeaderOrSolo,
  effectiveGroupId,
  effectiveGroupKey,
  getGroupOrSoloParticipants,
  requirePullerOrLog,
  getInventorySlotCount,
  hasInventorySpace,
  MAX_INVENTORY_SLOTS,
  Faction,
  FactionStanding,
  grantFactionStandingForKill,
  UiPanelLayout,
  Corpse,
  CorpseItem,
  PendingSpellCast,
  createCorpse,
  cleanupDecayedCorpses,
  removeCorpseIfEmpty,
  executeResurrect,
  executeCorpseSummon,
  autoRespawnDeadCharacter,
  campCharacter,
  grantRaceAbility,
  appendCreationEvent,
  startCombatForSpawn: null as any,
  startCombat: null as any,
  submitCombatChoice: null as any,
};

reducerDeps.startCombatForSpawn = (
  ctx: any,
  leader: any,
  spawnToUse: any,
  participants: any[],
  groupId: bigint | null
) => startCombatForSpawn(reducerDeps, ctx, leader, spawnToUse, participants, groupId);

// The generalised fight start (Phase 51.3.1.1 Plan 10): a drawn group of pool enemies (or any list of
// DrawnEnemy) with its origin recorded on the fight row.
reducerDeps.startCombat = (
  ctx: any,
  leader: any,
  candidates: any[],
  groupId: bigint | null,
  drawn: DrawnEnemy[],
  origin: CombatOrigin
) => startCombat(reducerDeps, ctx, leader, candidates, groupId, drawn, origin);

registerReducers(reducerDeps);

// V2: Export all collected reducers, lifecycle hooks, and views
export const _stdb_exports = spacetimedb.exportGroup(_moduleExports);
















