import { t, SenderError } from 'spacetimedb/server';
import { requireAdmin } from './data/admin';
import { ScheduleAt, Timestamp, TimeDuration } from 'spacetimedb';
import { buildAnthropicRequest, parseAnthropicResponse, incrementBudget } from './helpers/llm';
import {
  buildCharacterCreationPrompt,
  buildWorldGenPrompt,
  buildCombatNarrationPrompt,
  buildSkillGenPrompt,
} from './data/llm_prompts';
import spacetimedb, {
  scheduledReducers,
  Player, Character,
  FriendRequest, Friend,
  GroupMember, GroupInvite, EventGroup,
  CharacterEffect, CombatResult, CombatLoot,
  NpcDialog, QuestInstance,
  Faction, FactionStanding, UiPanelLayout,
  CombatParticipant, CombatLoopTick,
  PullState, PullTick,
  HealthRegenTick, EffectTick, HotTick, CastTick,
  DayNightTick, DisconnectLogoutTick, CharacterLogoutTick,
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
  LlmCleanupTick,
} from './schema/tables';
export default spacetimedb;
import { registerReducers } from './reducers';
import {
  effectiveGroupId,
  effectiveGroupKey,
  getGroupOrSoloParticipants,
  requirePullerOrLog,
} from './helpers/group';
import { startCombatForSpawn } from './reducers/combat';
import { registerViews } from './views';
import {
  ARMOR_TYPES_WITH_NONE,
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  CLASS_ARMOR,
  baseArmorForClass,
  canParry,
  computeBaseStats,
  isArmorAllowedForClass,
  manaStatForClass,
  normalizeArmorType,
  normalizeClassName,
  usesMana,
  computeBaseStatsForGenerated,
  TANK_CLASSES,
  HEALER_CLASSES,
  MANA_MULTIPLIER,
  HYBRID_MANA_MULTIPLIER,
  HYBRID_MANA_CLASSES,
} from './data/class_stats';
import { GLOBAL_COOLDOWN_MICROS } from './data/ability_catalog';
import { MAX_LEVEL, xpModifierForDiff, xpRequiredForLevel } from './data/xp';
import { RACE_DATA, ensureRaces } from './data/races';
import { ensureFactions } from './data/faction_data';
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
  MAX_INVENTORY_SLOTS,
} from './helpers/items';

import {
  abilityResourceCost,
  hasShieldEquipped,
  abilityCooldownMicros,
  abilityCastMicros,
  enemyAbilityCastMicros,
  enemyAbilityCooldownMicros,
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
  COMBAT_LOOP_INTERVAL_MICROS,
  AUTO_ATTACK_INTERVAL,
  GROUP_SIZE_DANGER_BASE,
  GROUP_SIZE_BIAS_RANGE,
  GROUP_SIZE_BIAS_MAX,
  scheduleCombatTick,
} from './helpers/combat';

import {
  getEnemyRole,
  scaleByPercent,
  applyArmorMitigation,
  applyVariance,
  computeEnemyStats,
  getEnemyAttackSpeed,
} from './helpers/combat_enemies';

import {
  applyPerkProcs,
  executePerkAbility,
  calculateFleeChance,
} from './helpers/combat_perks';

import {
  awardXp,
  applyDeathXpPenalty,
} from './helpers/combat_rewards';

import {
  getGroupParticipants,
  isGroupLeaderOrSolo,
  partyMembersInLocation,
  recomputeCharacterDerived,
  isClassAllowed,
  friendUserIds,
  findCharacterByName,
  autoRespawnDeadCharacter,
  campCharacter,
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
  ensureSpawnsForLocation,
  ensureLocationRuntimeBootstrap,
  respawnLocationSpawns,
  getLocationSpawnCap,
} from './helpers/location';

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
  ensureHealthRegenScheduled,
  ensureEffectTickScheduled,
  ensureHotTickScheduled,
  ensureCastTickScheduled,
  ensureDayNightTickScheduled,
  ensureInactivityTickScheduled,
  ensureLlmCleanupScheduled,
  syncAllContent,
} from './seeding/ensure_content';

import {
  ensureStarterItemTemplates,
  ensureResourceItemTemplates,
  ensureFoodItemTemplates,
  ensureRecipeTemplates,
  ensureAbilityTemplates,
} from './seeding/ensure_items';

import {
  ensureNpcs,
  ensureQuestTemplates,
  ensureEnemyAbilities,
  ensureWorldLayout,
} from './seeding/ensure_world';

import {
  ensureLootTables,
  ensureVendorInventory,
  ensureLocationEnemyTemplates,
  ensureEnemyTemplatesAndRoles,
} from './seeding/ensure_enemies';

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
  for (const location of ctx.db.location.iter()) {
    if (!location.isSafe) {
      respawnLocationSpawns(ctx, location.id, getLocationSpawnCap(ctx, location.id));
    }
  }
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
});

const LLM_CLEANUP_INTERVAL_MICROS = 300_000_000n; // 5 minutes
const LLM_ERROR_TTL_MICROS = 300_000_000n; // 5 minutes

scheduledReducers['sweep_llm_errors'] = spacetimedb.reducer('sweep_llm_errors', { arg: LlmCleanupTick.rowType }, (ctx) => {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const cutoff = now - LLM_ERROR_TTL_MICROS;

  // Clean up error and completed requests older than 5 minutes
  for (const request of [...ctx.db.llm_request.iter()]) {
    if ((request.status === 'error' || request.status === 'completed') &&
        request.createdAt.microsSinceUnixEpoch < cutoff) {
      ctx.db.llm_request.id.delete(request.id);
    }
  }

  // Re-schedule next sweep
  ctx.db.llm_cleanup_tick.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(now + LLM_CLEANUP_INTERVAL_MICROS),
  });
});

spacetimedb.reducer('set_app_version', { version: t.string() }, (ctx, { version }) => {
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
});

// === LLM PROCEDURE ===
// The LLM procedure -- calls Anthropic API and writes results back.
// CRITICAL: ctx.http.fetch() and ctx.withTx() CANNOT overlap.
// Structure: withTx(read) -> fetch() -> withTx(write)
spacetimedb.procedure(
  { name: 'call_llm' },
  { requestId: t.u64() },
  t.string(),
  (ctx: any, { requestId }: { requestId: bigint }) => {
    // === PHASE 1: Read request and API key (transaction) ===
    let request: any;
    let apiKey: string = '';
    let character: any;

    ctx.withTx((tx: any) => {
      request = tx.db.llm_request.id.find(requestId);
      if (!request) throw new SenderError('Request not found');
      if (request.status !== 'pending') throw new SenderError('Request already processed');

      // Update status to processing
      tx.db.llm_request.id.update({ ...request, status: 'processing' });

      // Read API key from private config
      const config = tx.db.llm_config.id.find(1n);
      if (!config || !config.apiKey) throw new SenderError('LLM not configured');
      apiKey = config.apiKey;

      // Load character for error messaging
      character = tx.db.character.id.find(request.characterId);
    });

    // === PHASE 2: Resolve system prompt ===
    const promptBuilders: Record<string, (ctx: string) => string> = {
      character_creation: buildCharacterCreationPrompt,
      world_gen: buildWorldGenPrompt,
      combat_narration: buildCombatNarrationPrompt,
      skill_gen: buildSkillGenPrompt,
    };
    const buildPrompt = promptBuilders[request.domain];
    if (!buildPrompt) {
      ctx.withTx((tx: any) => {
        const req = tx.db.llm_request.id.find(requestId);
        if (req) tx.db.llm_request.id.update({ ...req, status: 'error', errorMessage: `Unknown domain: ${request.domain}` });
      });
      return 'error';
    }

    // Build system prompt (context will be enriched by downstream phases)
    const systemPrompt = buildPrompt('');
    const requestBody = buildAnthropicRequest(request.model, systemPrompt, request.userPrompt);

    // === PHASE 3: Call Anthropic API (NO transaction open) ===
    let responseText = '';
    let responseOk = false;
    let attempts = 0;
    const maxAttempts = 2; // Retry once on failure (locked decision)

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const response = ctx.http.fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: requestBody,
          timeout: TimeDuration.fromMillis(30000),
        });
        responseText = response.text();
        responseOk = response.ok;

        if (responseOk) break; // Success -- stop retrying
        if (attempts < maxAttempts) {
          console.error(`LLM API attempt ${attempts} failed, retrying...`);
          continue;
        }
      } catch (err: any) {
        console.error(`LLM API attempt ${attempts} threw: ${err?.message ?? err}`);
        if (attempts >= maxAttempts) {
          responseText = '';
          responseOk = false;
        }
      }
    }

    // === PHASE 4: Parse response and write results (transaction) ===
    const parsed = parseAnthropicResponse(responseText, responseOk);

    ctx.withTx((tx: any) => {
      const req = tx.db.llm_request.id.find(requestId);
      if (!req) return;

      if (parsed.ok) {
        // Log usage for monitoring (visible in spacetime logs)
        if (parsed.usage) {
          console.log(`LLM usage [${request.domain}/${request.model}]: input=${parsed.usage.inputTokens}, output=${parsed.usage.outputTokens}, cache_read=${parsed.usage.cacheReadTokens}`);
        }

        // Store the result in the request row for the client to read.
        // Downstream phases will write domain-specific results to their own tables.
        // NOTE: We reuse errorMessage field as resultText since the table is ephemeral.
        tx.db.llm_request.id.update({
          ...req,
          status: 'completed',
          errorMessage: parsed.text,  // Stores result text temporarily
        });

        // Increment budget only on success (locked decision)
        incrementBudget(tx, request.playerId);
      } else {
        // Mark as error with raw details (only visible server-side since table is private)
        const errorMsg = parsed.error ?? 'Unknown error';
        console.error(`LLM API error [${request.domain}]: ${errorMsg}`);

        tx.db.llm_request.id.update({
          ...req,
          status: 'error',
          errorMessage: errorMsg,
        });

        // Send thematic error to player via event system
        if (character) {
          const charRow = tx.db.character.id.find(request.characterId);
          if (charRow) {
            tx.db.event_private.insert({
              id: 0n,
              ownerUserId: charRow.ownerUserId,
              characterId: charRow.id,
              kind: 'system',
              message: 'The System falters momentarily. Try again.',
              createdAt: tx.timestamp,
            });
          }
        }
      }
    });

    return parsed.ok ? 'completed' : 'error';
  }
);

spacetimedb.init((ctx) => {
  syncAllContent(ctx);

  ensureHealthRegenScheduled(ctx);
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
  ensureDayNightTickScheduled(ctx);
  ensureInactivityTickScheduled(ctx);
  ensureLlmCleanupScheduled(ctx);
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
    ctx.db.player.id.update({ ...existing, lastSeenAt: ctx.timestamp });
  }
  ensureHealthRegenScheduled(ctx);
  ensureEffectTickScheduled(ctx);
  ensureHotTickScheduled(ctx);
  ensureCastTickScheduled(ctx);
  ensureDayNightTickScheduled(ctx);
  ensureInactivityTickScheduled(ctx);
  ensureLlmCleanupScheduled(ctx);
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
  PullState,
  PullTick,
  HealthRegenTick,
  EffectTick,
  HotTick,
  CastTick,
  DayNightTick,
  DisconnectLogoutTick,
  CharacterLogoutTick,
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
  ensureSpawnsForLocation,
  ensureAvailableSpawn,
  computeEnemyStats,
  getEnemyAttackSpeed,
  activeCombatIdForCharacter,
  scheduleCombatTick,
  recomputeCharacterDerived,
  executeAbilityAction,
  executePerkAbility,
  isClassAllowed,
  RACE_DATA,
  isArmorAllowedForClass,
  normalizeArmorType,
  EQUIPMENT_SLOTS,
  ARMOR_TYPES_WITH_NONE,
  computeBaseStats,
  manaStatForClass,
  baseArmorForClass,
  BASE_HP,
  HP_STR_MULTIPLIER,
  BASE_MANA,
  MANA_MULTIPLIER,
  HYBRID_MANA_MULTIPLIER,
  HYBRID_MANA_CLASSES,
  normalizeClassName,
  abilityCooldownMicros,
  abilityCastMicros,
  enemyAbilityCastMicros,
  enemyAbilityCooldownMicros,
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
  ensureResourceItemTemplates,
  ensureFoodItemTemplates,
  ensureLootTables,
  ensureVendorInventory,
  ensureAbilityTemplates,
  ensureRecipeTemplates,
  ensureNpcs,
  ensureQuestTemplates,
  ensureEnemyTemplatesAndRoles,
  ensureEnemyAbilities,
  ensureWorldLayout,
  ensureLocationEnemyTemplates,
  ensureLocationRuntimeBootstrap,
  syncAllContent,
  spawnResourceNode,
  awardXp,
  xpRequiredForLevel,
  MAX_LEVEL,
  applyDeathXpPenalty,
  rollAttackOutcome,
  hasShieldEquipped,
  canParry,
  calculateFleeChance,
  getGroupParticipants,
  isGroupLeaderOrSolo,
  effectiveGroupId,
  effectiveGroupKey,
  getGroupOrSoloParticipants,
  requirePullerOrLog,
  getInventorySlotCount,
  hasInventorySpace,
  MAX_INVENTORY_SLOTS,
  usesMana,
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
  appendCreationEvent,
  computeBaseStatsForGenerated,
  startCombatForSpawn: null as any,
};

reducerDeps.startCombatForSpawn = (
  ctx: any,
  leader: any,
  spawnToUse: any,
  participants: any[],
  groupId: bigint | null
) => startCombatForSpawn(reducerDeps, ctx, leader, spawnToUse, participants, groupId);

registerReducers(reducerDeps);

// V2: Export all collected reducers, lifecycle hooks, and views
export const _stdb_exports = spacetimedb.exportGroup(_moduleExports);
















