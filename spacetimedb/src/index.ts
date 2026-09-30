import { t, SenderError } from 'spacetimedb/server';
import { requireAdmin } from './data/admin';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { checkBudget } from './helpers/llm';
import { ensureDefaultHotbar } from './helpers/items';
import {
  buildCharacterCreationPrompt,
  buildWorldGenPrompt,
  buildCombatNarrationPrompt,
  buildRaceInterpretationUserPrompt,
  buildClassGenerationUserPrompt,
  buildCombinedCreationUserPrompt,
  buildRegionGenerationUserPrompt,
} from './data/llm_prompts';
import { requestSkillOffer } from './helpers/skill_offer';
import { computeRegionDanger } from './helpers/world_gen';
import { buildRegionContext } from './helpers/world_gen';
import { applyLlmResult, applyLlmFailure, toApplyJob } from './helpers/llm_apply';
import spacetimedb, {
  scheduledReducers,
  Player, Character,
  FriendRequest, Friend,
  GroupMember, GroupInvite, EventGroup,
  CharacterEffect, CombatResult, CombatLoot,
  NpcDialog, QuestInstance,
  Faction, FactionStanding, UiPanelLayout,
  CombatParticipant, CombatLoopTick,
  CombatRound, CombatAction, CombatNarrative, RoundTimerTick,
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
  PendingSkill,
  PendingRenownPerk,
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
  MANA_MULTIPLIER,
  normalizeArmorType,
  normalizeClassName,
  computeBaseStatsForGenerated,
  characterUsesResource,
  bestCasterStat,
  detectPrimarySecondary,
} from './data/class_stats';
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
  COMBAT_LOOP_INTERVAL_MICROS,
  AUTO_ATTACK_INTERVAL,
  GROUP_SIZE_DANGER_BASE,
  GROUP_SIZE_BIAS_RANGE,
  GROUP_SIZE_BIAS_MAX,
  scheduleCombatTick,
  convertDurationToRounds,
  scheduleRoundTimer,
  createFirstRound,
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
  computeRacialAtLevelFromRow,
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
  initScheduledTables,
  ensureHealthRegenScheduled,
  ensureEffectTickScheduled,
  ensureHotTickScheduled,
  ensureCastTickScheduled,
  ensureDayNightTickScheduled,
  ensureInactivityTickScheduled,
  ensureLlmCleanupScheduled,
} from './helpers/scheduling';
import { ensureLlmSweepScheduled } from './helpers/llm_schedule';

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

// === LLM TASK PREPARATION ===
// When creation/world-gen steps trigger, server builds prompts and writes to LlmTask.
// Client reads prompts, calls the LLM proxy directly, then submits results via reducer.

// Reducer: prepare an LLM task for character creation (race or class generation)
spacetimedb.reducer('prepare_creation_llm', { generationType: t.string() }, (ctx: any, { generationType }: { generationType: string }) => {
  const rows = [...ctx.db.character_creation_state.by_player.filter(ctx.sender)];
  const state = rows[0];
  if (!state) throw new SenderError('No creation state found');

  // Budget check
  const budget = checkBudget(ctx, ctx.sender);
  if (!budget.allowed) {
    appendCreationEvent(ctx, ctx.sender, 'creation_error',
      'The Keeper yawns. "You have exhausted my patience — and your daily allowance of cosmic creativity. Come back tomorrow."');
    return;
  }

  // Concurrency check — one LLM task at a time per player
  const existingTasks = [...ctx.db.llm_task.by_player.filter(ctx.sender)];
  if (existingTasks.some((t: any) => t.status === 'pending')) return;

  let systemPrompt: string;
  let userPrompt: string;

  if (generationType === 'race') {
    if (state.step !== 'GENERATING_RACE') throw new SenderError('Invalid step for race generation');

    // Check for existing race definition (case-insensitive)
    const nameLower = (state.raceDescription || '').trim().toLowerCase();
    let existingRace: any = null;
    for (const rd of ctx.db.race_definition.by_name.filter(nameLower)) {
      existingRace = rd;
      break;
    }

    if (existingRace) {
      // Reuse existing race definition — skip LLM entirely
      ctx.db.character_creation_state.id.update({
        ...state,
        step: 'AWAITING_ARCHETYPE',
        raceName: existingRace.name,
        raceNarrative: existingRace.narrative,
        raceBonuses: existingRace.bonusesJson,
        updatedAt: ctx.timestamp,
      });

      let bonuses: any = {};
      try { bonuses = JSON.parse(existingRace.bonusesJson); } catch {}
      const bonusText = bonuses.primary
        ? `\n+${bonuses.primary.value || 2} ${(bonuses.primary.stat || 'STR').toUpperCase()}, +${bonuses.secondary?.value || 1} ${(bonuses.secondary?.stat || 'DEX').toUpperCase()}${bonuses.flavor ? `. ${bonuses.flavor}` : ''}`
        : '';

      appendCreationEvent(ctx, ctx.sender, 'creation',
        `${existingRace.narrative || 'An interesting choice.'}\n\n` +
        `**${existingRace.name}**${bonusText}\n\n` +
        `Now then. Every creature must choose its path. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
        `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`
      );
      return;
    }

    systemPrompt = buildCharacterCreationPrompt('Interpreting a new arrival\'s race description.');
    userPrompt = buildRaceInterpretationUserPrompt(state.raceDescription);
  } else if (generationType === 'class') {
    if (state.step !== 'GENERATING_CLASS') throw new SenderError('Invalid step for class generation');
    systemPrompt = buildCharacterCreationPrompt(`Race: ${state.raceName}. Generating a unique class.`);
    userPrompt = buildClassGenerationUserPrompt(state.raceName, state.raceNarrative || '', state.archetype);
  } else {
    throw new SenderError('Invalid generation type — must be "race" or "class"');
  }

  ctx.db.llm_task.insert({
    id: 0n,
    playerId: ctx.sender,
    domain: `creation_${generationType}`,
    model: 'gpt-5.4',
    systemPrompt,
    userPrompt,
    maxTokens: 1024n,
    status: 'pending',
    contextJson: undefined,
    createdAt: ctx.timestamp,
  });
});

// Reducer: prepare an LLM task for world generation
spacetimedb.reducer('prepare_world_gen_llm', { genStateId: t.u64() }, (ctx: any, { genStateId }: { genStateId: bigint }) => {
  const genState = ctx.db.world_gen_state.id.find(genStateId);
  if (!genState) throw new SenderError('WorldGenState not found');
  if (genState.step !== 'PENDING') throw new SenderError('WorldGenState not in PENDING step');

  // Budget check
  const budget = checkBudget(ctx, genState.playerId);
  if (!budget.allowed) {
    ctx.db.world_gen_state.id.update({
      ...genState,
      step: 'ERROR',
      errorMessage: 'Daily LLM budget exceeded',
      updatedAt: ctx.timestamp,
    });
    const char = ctx.db.character.id.find(genState.characterId);
    if (char) {
      appendPrivateEvent(ctx, char.id, char.ownerUserId, 'system',
        'The Keeper strains but cannot shape this realm right now. Type [explore] to try again later.');
    }
    throw new SenderError('Daily LLM budget exceeded');
  }

  // If this is a starter region request, check if another character of the same race already generated one
  if (genState.sourceRegionId === 0n) {
    const character = ctx.db.character.id.find(genState.characterId);
    const raceLower = (character?.race || '').toLowerCase();
    if (raceLower) {
      let existingStarterRegion: any = null;
      for (const region of ctx.db.region.iter()) {
        if (region.starterForRace && region.starterForRace.toLowerCase() === raceLower) {
          existingStarterRegion = region;
          break;
        }
      }
      if (existingStarterRegion) {
        // Find the home location in the existing starter region
        let homeLocation: any = null;
        for (const loc of ctx.db.location.iter()) {
          if (loc.regionId === existingStarterRegion.id && loc.isSafe && loc.terrainType !== 'uncharted') {
            homeLocation = loc;
            break;
          }
        }
        if (!homeLocation) {
          for (const loc of ctx.db.location.iter()) {
            if (loc.regionId === existingStarterRegion.id && loc.terrainType !== 'uncharted') {
              homeLocation = loc;
              break;
            }
          }
        }
        if (homeLocation && character) {
          // Place character in the existing starter region
          ctx.db.character.id.update({
            ...ctx.db.character.id.find(character.id),
            locationId: homeLocation.id,
            boundLocationId: homeLocation.id,
          });
          ensureSpawnsForLocation(ctx, homeLocation.id);

          // Mark world gen complete
          ctx.db.world_gen_state.id.update({
            ...genState,
            step: 'COMPLETE',
            generatedRegionId: existingStarterRegion.id,
            updatedAt: ctx.timestamp,
          });

          // Send arrival narrative
          const locationNpcs: string[] = [];
          for (const npc of ctx.db.npc.by_location.filter(homeLocation.id)) {
            locationNpcs.push(npc.name);
          }
          let arrivalMsg = `You open your eyes in ${homeLocation.name}, ${existingStarterRegion.name}.`;
          if (locationNpcs.length > 0) {
            arrivalMsg += `\n\nYou notice ${locationNpcs.join(' and ')} nearby. Perhaps they have something to say.`;
          }
          arrivalMsg += `\n\nTry [look] to examine your surroundings, or [travel] to move.`;
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'narrative', arrivalMsg);
          return;
        }
      }
    }
  }

  // Concurrency check
  const existingTasks = [...ctx.db.llm_task.by_player.filter(ctx.sender)];
  if (existingTasks.some((t: any) => t.status === 'pending' && t.domain === 'world_gen')) return;

  // Update step to GENERATING
  ctx.db.world_gen_state.id.update({ ...genState, step: 'GENERATING', updatedAt: ctx.timestamp });

  // Read character data
  const character = ctx.db.character.id.find(genState.characterId);
  const characterRace = character?.race || 'Unknown';
  const characterClass = character?.className || 'Unknown';

  // Read archetype from creation state
  const creationStates = [...ctx.db.character_creation_state.by_player.filter(genState.playerId)];
  const characterArchetype = creationStates.length > 0 ? (creationStates[0].archetype || 'warrior') : 'warrior';

  // Read source region name
  const sourceRegion = ctx.db.region.id.find(genState.sourceRegionId);
  const sourceRegionName = sourceRegion?.name || 'the known world';

  // Build neighbor context
  const neighbors = buildRegionContext(ctx, genState.sourceRegionId);

  const systemPrompt = buildWorldGenPrompt('');
  const userPrompt = buildRegionGenerationUserPrompt(
    characterRace, characterClass, characterArchetype,
    sourceRegionName, neighbors
  );

  ctx.db.llm_task.insert({
    id: 0n,
    playerId: ctx.sender,
    domain: 'world_gen',
    model: 'gpt-5.4',
    systemPrompt,
    userPrompt,
    maxTokens: 2048n,
    status: 'pending',
    contextJson: JSON.stringify({ genStateId: genStateId.toString() }),
    createdAt: ctx.timestamp,
  });
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
    `The Keeper nods. "[${pending.name}] it is. The others scatter like forgotten dreams. You will never see them again."`);
  appendPrivateEvent(ctx, pending.characterId, character.ownerUserId, 'system',
    `You learned [${pending.name}] — ${pending.kind}, ${pending.value1} power, ${pending.cooldownSeconds}s cooldown`);
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

  // Compute new base stats
  const { primary, secondary } = detectPrimarySecondary(character);
  const newBase = computeBaseStatsForGenerated(primary, secondary, newLevel);

  // Compute racial bonuses at new level
  const raceRow = [...ctx.db.race.iter()].find((r: any) => r.name === character.race);
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

  // Queue the skill offer for the new level (own transaction; one job per character and level)
  const offer = requestSkillOffer(ctx, updated, ctx.sender);
  appendPrivateEvent(ctx, characterId, character.ownerUserId, offer.kind, offer.text);
});

// Reducer: client submits LLM result after calling the proxy
spacetimedb.reducer('submit_llm_result', {
  taskId: t.u64(),
  resultText: t.string(),
  success: t.bool(),
  errorMessage: t.string().optional(),
}, (ctx: any, { taskId, resultText, success, errorMessage }: { taskId: bigint; resultText: string; success: boolean; errorMessage?: string }) => {
  const task = ctx.db.llm_task.id.find(taskId);
  if (!task) throw new SenderError('LLM task not found');
  if (task.playerId.toHexString() !== ctx.sender.toHexString()) throw new SenderError('Not your task');
  if (task.status !== 'pending') throw new SenderError('Task already processed');

  // Mark task as completed
  ctx.db.llm_task.id.update({ ...task, status: success ? 'completed' : 'error' });

  const job = toApplyJob(task);
  if (!success) {
    applyLlmFailure(ctx, job);
    return;
  }

  applyLlmResult(ctx, job, resultText);
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
  initScheduledTables(ctx);
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
  ensureLlmSweepScheduled(ctx);
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
  getGroupParticipants,
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
















