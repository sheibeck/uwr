import { t, SenderError } from 'spacetimedb/server';
import { requireAdmin } from './data/admin';
import { ScheduleAt, Timestamp } from 'spacetimedb';
import { incrementBudget, checkBudget } from './helpers/llm';
import {
  buildCharacterCreationPrompt,
  buildWorldGenPrompt,
  buildCombatNarrationPrompt,
  buildSkillGenPrompt,
  buildSkillGenSystemPrompt,
  buildSkillGenUserPrompt,
  buildRaceInterpretationUserPrompt,
  buildClassGenerationUserPrompt,
  buildCombinedCreationUserPrompt,
  buildRegionGenerationUserPrompt,
} from './data/llm_prompts';
import { pickRippleMessage, pickDiscoveryMessage, computeRegionDanger } from './data/world_gen';
import { writeGeneratedRegion, buildRegionContext } from './helpers/world_gen';
import { parseSkillGenResult, insertPendingSkills } from './helpers/skill_gen';
import { updateNpcMemory, getActiveQuestCount, MAX_ACTIVE_QUESTS } from './helpers/npc_conversation';
import { awardNpcAffinity } from './helpers/npc_affinity';
import { handleCombatNarrationResult } from './helpers/combat_narration';
import { QUEST_TYPES } from './data/mechanical_vocabulary';
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
} from './seeding/ensure_items';

import {
  ensureNpcs,
  ensureQuestTemplates,
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

// === LLM TASK PREPARATION ===
// When creation/world-gen steps trigger, server builds prompts and writes to LlmTask.
// Client reads prompts, calls the LLM proxy directly, then submits results via reducer.

// Helper: extract JSON robustly from LLM response text
function extractJson(raw: string): any {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text);
}

// Helper: if world gen fails, reset the world_gen_state to PENDING so client retries.
function retryWorldGen(tx: any, genState: any, message: string) {
  const char = tx.db.character.id.find(genState.characterId);
  tx.db.world_gen_state.id.update({
    ...tx.db.world_gen_state.id.find(genState.id),
    step: 'PENDING',
    errorMessage: undefined,
    updatedAt: tx.timestamp,
  });
  if (char && char.locationId !== 0n) {
    appendPrivateEvent(tx, genState.characterId, char.ownerUserId, 'system', message);
  } else {
    appendCreationEvent(tx, genState.playerId, 'creation_error', message);
  }
}

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

// Reducer: prepare an LLM task for skill generation (called after level-up)
spacetimedb.reducer('prepare_skill_gen', { characterId: t.u64() }, (ctx: any, { characterId }: { characterId: bigint }) => {
  // Validate ownership
  const character = ctx.db.character.id.find(characterId);
  if (!character) throw new SenderError('Character not found');
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || !character.ownerUserId || player.userId !== character.ownerUserId) {
    throw new SenderError('Not your character');
  }

  // Check character has no existing PendingSkill rows (prevent duplicates)
  const existingPending = [...ctx.db.pending_skill.by_character.filter(characterId)];
  if (existingPending.length > 0) {
    appendPrivateEvent(ctx, characterId, character.ownerUserId, 'system',
      'The Keeper is already preparing skill offerings for you. Be patient.');
    return;
  }

  // Budget check
  const budget = checkBudget(ctx, ctx.sender);
  if (!budget.allowed) {
    appendPrivateEvent(ctx, characterId, character.ownerUserId, 'system',
      'The Keeper yawns. "Your daily allowance of cosmic creativity is spent. Come back tomorrow."');
    return;
  }

  // Concurrency check — one LLM task at a time per player for skill_gen
  const existingTasks = [...ctx.db.llm_task.by_player.filter(ctx.sender)];
  if (existingTasks.some((t: any) => t.status === 'pending' && t.domain === 'skill_gen')) return;

  // Read existing abilities for diversity context
  const existingAbilities: { name: string; kind: string }[] = [];
  for (const ab of ctx.db.ability_template.by_character.filter(characterId)) {
    existingAbilities.push({ name: ab.name, kind: ab.kind });
  }

  const systemPrompt = buildSkillGenSystemPrompt();
  const userPrompt = buildSkillGenUserPrompt(
    character.name,
    character.race || 'Unknown',
    character.className || 'Unknown',
    character.archetype || 'warrior',
    character.level,
    existingAbilities
  );

  ctx.db.llm_task.insert({
    id: 0n,
    playerId: ctx.sender,
    domain: 'skill_gen',
    model: 'gpt-5-mini',
    systemPrompt,
    userPrompt,
    maxTokens: 1500n,
    status: 'pending',
    contextJson: JSON.stringify({ characterId: characterId.toString() }),
    createdAt: ctx.timestamp,
  });
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

  // Auto-assign to first available hotbar slot (0-5)
  const existingSlots = [...ctx.db.hotbar_slot.by_character.filter(pending.characterId)];
  const usedSlots = new Set(existingSlots.map((s: any) => Number(s.slot)));
  let assignedSlot = -1;
  for (let i = 0; i <= 5; i++) {
    if (!usedSlots.has(i)) {
      assignedSlot = i;
      break;
    }
  }
  if (assignedSlot === -1) {
    // All slots full, overwrite slot 0
    assignedSlot = 0;
    const slot0 = existingSlots.find((s: any) => Number(s.slot) === 0);
    if (slot0) {
      ctx.db.hotbar_slot.id.update({
        ...slot0,
        abilityTemplateId: abilityRow.id,
        assignedAt: ctx.timestamp,
      });
    } else {
      ctx.db.hotbar_slot.insert({
        id: 0n,
        characterId: pending.characterId,
        slot: 0,
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

  if (!success) {
    // Handle error based on domain
    if (task.domain === 'creation_race') {
      appendCreationEvent(ctx, ctx.sender, 'creation_error',
        'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."');
      const s = [...ctx.db.character_creation_state.by_player.filter(ctx.sender)][0];
      if (s) ctx.db.character_creation_state.id.update({ ...s, step: 'AWAITING_RACE', updatedAt: ctx.timestamp });
    } else if (task.domain === 'creation_class') {
      appendCreationEvent(ctx, ctx.sender, 'creation_error',
        'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."');
      const s = [...ctx.db.character_creation_state.by_player.filter(ctx.sender)][0];
      if (s) ctx.db.character_creation_state.id.update({ ...s, step: 'AWAITING_ARCHETYPE', updatedAt: ctx.timestamp });
    } else if (task.domain === 'world_gen') {
      const context = task.contextJson ? JSON.parse(task.contextJson) : {};
      const genStateId = BigInt(context.genStateId);
      const genState = ctx.db.world_gen_state.id.find(genStateId);
      if (genState) {
        retryWorldGen(ctx, genState, 'The Keeper falters. "The world refuses to be remembered right now. Try again."');
      }
    } else if (task.domain === 'skill_gen') {
      const context = task.contextJson ? JSON.parse(task.contextJson) : {};
      const charId = BigInt(context.characterId);
      const character = ctx.db.character.id.find(charId);
      if (character) {
        appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
          'The Keeper flickers. "Your potential eludes crystallization. The power will come... eventually."');
      }
    } else if (task.domain === 'npc_conversation') {
      const context = task.contextJson ? JSON.parse(task.contextJson) : {};
      const charId = BigInt(context.characterId);
      const npcIdVal = BigInt(context.npcId);
      const character = ctx.db.character.id.find(charId);
      const npc = ctx.db.npc.id.find(npcIdVal);
      if (character && npc) {
        appendNpcDialog(ctx, charId, npc.id, `${npc.name} seems distracted.`);
        appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
          `${npc.name} seems distracted. Try again.`);
      }
    } else if (task.domain === 'combat_narration') {
      // Silent failure -- combat continues without narration
      handleCombatNarrationResult(ctx, task, '', false);
    }
    return;
  }

  // Process successful result based on domain
  if (task.domain === 'creation_race' || task.domain === 'creation_class') {
    const generationType = task.domain === 'creation_race' ? 'race' : 'class';
    const s = [...ctx.db.character_creation_state.by_player.filter(ctx.sender)][0];
    if (!s) return;

    incrementBudget(ctx, ctx.sender);

    try {
      const data = extractJson(resultText);

      if (generationType === 'race') {
        ctx.db.character_creation_state.id.update({
          ...s,
          step: 'AWAITING_ARCHETYPE',
          raceName: data.raceName || 'Unknown',
          raceNarrative: data.narrative || '',
          raceBonuses: JSON.stringify(data.bonuses || {}),
          updatedAt: ctx.timestamp,
        });

        const bonusText = data.bonuses
          ? `\n+${data.bonuses.primary?.value || 2} ${(data.bonuses.primary?.stat || 'STR').toUpperCase()}, +${data.bonuses.secondary?.value || 1} ${(data.bonuses.secondary?.stat || 'DEX').toUpperCase()}${data.bonuses.flavor ? `. ${data.bonuses.flavor}` : ''}`
          : '';

        appendCreationEvent(ctx, ctx.sender, 'creation',
          `${data.narrative || 'An interesting choice.'}\n\n` +
          `**${data.raceName}**${bonusText}\n\n` +
          `Now then. Every creature must choose its path. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
          `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`
        );

      } else if (generationType === 'class') {
        ctx.db.character_creation_state.id.update({
          ...s,
          step: 'CLASS_REVEALED',
          className: data.className || 'Unknown Class',
          classDescription: data.classDescription || '',
          classStats: JSON.stringify(data.stats || {}),
          abilities: JSON.stringify(data.abilities || []),
          updatedAt: ctx.timestamp,
        });

        const stats = data.stats || {};
        const statLine = `Primary: ${(stats.primaryStat || 'str').toUpperCase()}${stats.secondaryStat && stats.secondaryStat !== 'none' ? `, Secondary: ${stats.secondaryStat.toUpperCase()}` : ''}`;
        const weaponLine = Array.isArray(stats.weaponProficiencies) && stats.weaponProficiencies.length > 0
          ? `Weapons: ${stats.weaponProficiencies.join(', ')}` : '';
        const armorLine = Array.isArray(stats.armorProficiencies) && stats.armorProficiencies.length > 0
          ? `Armor: ${stats.armorProficiencies.join(', ')}` : `Armor: ${stats.armorProficiency || 'cloth'}`;
        const resourceLine = stats.usesMana ? `Mana user (+${stats.bonusMana || 0} bonus mana)` : `Physical (+${stats.bonusHp || 0} bonus HP)`;

        let abilityText = '\n\nYour starting abilities:\n';
        const abilities = data.abilities || [];
        for (let i = 0; i < abilities.length; i++) {
          const a = abilities[i];
          abilityText += `\n[${a.name}] — ${a.description}\n`;
          abilityText += `  ${a.damageType} damage, ${a.baseDamage} base, ${a.cooldownSeconds}s cooldown`;
          if (a.manaCost > 0) abilityText += `, ${a.manaCost} mana`;
          if (a.effect !== 'none') abilityText += `, ${a.effect} (${a.effectDuration}s)`;
          abilityText += '\n';
        }

        appendCreationEvent(ctx, ctx.sender, 'creation',
          `${data.classDescription || 'A unique class emerges.'}\n\n` +
          `**${data.className}**\n${statLine} | ${armorLine}${weaponLine ? ` | ${weaponLine}` : ''} | ${resourceLine}` +
          abilityText +
          `\nChoose one. Type the name of the ability you wish to begin with. Choose wisely — or don't. I find recklessness entertaining.` +
          `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`
        );
      }
    } catch (parseErr) {
      console.error(`Creation LLM JSON parse error [${generationType}]: ${parseErr}`);
      appendCreationEvent(ctx, ctx.sender, 'creation_error',
        'The Keeper grimaces. "The response from the cosmic machinery was... malformed. Let us try again."');
      const revertStep = generationType === 'race' ? 'AWAITING_RACE' : 'AWAITING_ARCHETYPE';
      ctx.db.character_creation_state.id.update({ ...s, step: revertStep, updatedAt: ctx.timestamp });
    }

  } else if (task.domain === 'world_gen') {
    const context = task.contextJson ? JSON.parse(task.contextJson) : {};
    const genStateId = BigInt(context.genStateId);
    const currentGenState = ctx.db.world_gen_state.id.find(genStateId);
    if (!currentGenState || currentGenState.step !== 'GENERATING') return;

    let data: any;
    try {
      data = extractJson(resultText);
    } catch (parseErr) {
      console.error(`World gen JSON parse error: ${parseErr}`);
      retryWorldGen(ctx, currentGenState,
        'The Keeper grimaces. "The world tried to form but... it came out wrong. Try again."');
      return;
    }

    if (!data.regionName || !data.locations || data.locations.length < 1) {
      retryWorldGen(ctx, currentGenState,
        'The Keeper shakes its head. "The world beyond is... incomplete. Try again."');
      return;
    }

    // Write generated region content into game tables
    const region = writeGeneratedRegion(ctx, data, currentGenState);

    // Update WorldGenState to COMPLETE
    ctx.db.world_gen_state.id.update({
      ...currentGenState,
      step: 'COMPLETE',
      generatedRegionId: region.id,
      updatedAt: ctx.timestamp,
    });

    // Transform the source edge location into a normal passage now that it's been explored
    const sourceEdge = ctx.db.location.id.find(currentGenState.sourceLocationId);
    if (sourceEdge && sourceEdge.terrainType === 'uncharted') {
      ctx.db.location.id.update({
        ...sourceEdge,
        terrainType: 'passage',
        name: `The Passage to ${data.regionName || 'the Beyond'}`,
        description: `The mists have parted. What was once the edge of the known world is now a well-trodden path between regions. The air still carries a faint shimmer of remembered possibility.`,
      });
    }

    // Place character in the new region if they have no location (first region)
    const character = ctx.db.character.id.find(currentGenState.characterId);
    if (character && character.locationId === 0n) {
      let homeLocation: any = null;
      for (const loc of ctx.db.location.iter()) {
        if (loc.regionId === region.id && loc.isSafe && loc.terrainType !== 'uncharted') {
          homeLocation = loc;
          break;
        }
      }
      if (!homeLocation) {
        for (const loc of ctx.db.location.iter()) {
          if (loc.regionId === region.id && loc.terrainType !== 'uncharted') {
            homeLocation = loc;
            break;
          }
        }
      }
      if (homeLocation) {
        ctx.db.character.id.update({
          ...ctx.db.character.id.find(character.id),
          locationId: homeLocation.id,
          boundLocationId: homeLocation.id,
        });
        ensureSpawnsForLocation(ctx, homeLocation.id);

        const regionDesc = data.regionDescription || `A ${data.biome || 'mysterious'} region.`;
        const locationNpcs: string[] = [];
        for (const npc of ctx.db.npc.iter()) {
          if (npc.locationId === homeLocation.id) {
            locationNpcs.push(npc.name);
          }
        }
        const nearbySet = new Set<string>();
        for (const conn of ctx.db.location_connection.by_from.filter(homeLocation.id)) {
          const loc = ctx.db.location.id.find(conn.toLocationId);
          if (loc && loc.terrainType !== 'uncharted') nearbySet.add(loc.name);
        }
        for (const conn of ctx.db.location_connection.by_to.filter(homeLocation.id)) {
          const loc = ctx.db.location.id.find(conn.fromLocationId);
          if (loc && loc.terrainType !== 'uncharted') nearbySet.add(loc.name);
        }
        const nearbyLocations = [...nearbySet];

        let arrivalMsg = `You open your eyes in ${homeLocation.name}, ${data.regionName}.\n\n${regionDesc}`;
        if (locationNpcs.length > 0) {
          arrivalMsg += `\n\nYou notice ${locationNpcs.join(' and ')} nearby. Perhaps they have something to say.`;
        }
        if (nearbyLocations.length > 0) {
          arrivalMsg += `\n\nPaths lead to ${nearbyLocations.join(', ')}. Try [look] to examine your surroundings, or [travel] to move.`;
        }
        appendPrivateEvent(ctx, currentGenState.characterId, character.ownerUserId, 'narrative', arrivalMsg);
      }
    }

    // Read source region name for ripple message
    const sourceRegion = ctx.db.region.id.find(currentGenState.sourceRegionId);
    const sourceRegionName = sourceRegion?.name || 'the known world';

    appendWorldEvent(ctx, 'world',
      pickRippleMessage(sourceRegionName, data.biome || 'plains', ctx.timestamp.microsSinceUnixEpoch));

    if (character) {
      appendPrivateEvent(ctx, currentGenState.characterId, character.ownerUserId, 'system',
        pickDiscoveryMessage(data.regionName, ctx.timestamp.microsSinceUnixEpoch));
    }

    incrementBudget(ctx, currentGenState.playerId);

  } else if (task.domain === 'skill_gen') {
    const context = task.contextJson ? JSON.parse(task.contextJson) : {};
    const charId = BigInt(context.characterId);
    const character = ctx.db.character.id.find(charId);
    if (!character) return;

    const { skills, errors } = parseSkillGenResult(resultText, charId, character.level);

    if (skills.length < 3) {
      console.error(`Skill gen produced ${skills.length} valid skills: ${errors.join('; ')}`);
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
        'The Keeper grimaces. "The cosmic machinery sputtered. Your potential remains... unformed. Try again."');
      return;
    }

    insertPendingSkills(ctx, charId, skills, character.level);
    incrementBudget(ctx, ctx.sender);

    // Present the 3 skills with The Keeper's sardonic narration
    let presentation = `The Keeper of Knowledge regards you with something resembling interest.\n\n`;
    presentation += `"Level ${character.level}. How quaint. The universe has deigned to offer you three new ways to embarrass yourself:"\n`;

    for (const skill of skills) {
      presentation += `\n[${skill.name}] -- ${skill.description}\n`;
      presentation += `  ${skill.kind} | ${skill.resourceCost} ${skill.resourceType} | ${skill.cooldownSeconds}s cooldown | ${skill.value1} power\n`;
    }

    presentation += `\n"Choose wisely. Or don't. The rejected skills will dissolve into the void, never to return."`;

    appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative', presentation);

  } else if (task.domain === 'npc_conversation') {
    const context = task.contextJson ? JSON.parse(task.contextJson) : {};
    const charId = BigInt(context.characterId);
    const npcIdVal = BigInt(context.npcId);
    const memoryId = BigInt(context.memoryId);
    const character = ctx.db.character.id.find(charId);
    if (!character) return;
    const npc = ctx.db.npc.id.find(npcIdVal);
    if (!npc) return;

    // Parse LLM response JSON
    let data: any;
    try {
      data = extractJson(resultText);
    } catch (parseErr) {
      console.error(`NPC conversation JSON parse error: ${parseErr}`);
      appendNpcDialog(ctx, charId, npc.id, `${npc.name} mutters something unintelligible.`);
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
        `${npc.name} mutters something unintelligible. (Try again.)`);
      return;
    }

    const dialogue = data.dialogue || '...';
    const effects = Array.isArray(data.effects) ? data.effects : [];
    const memoryUpdate = data.memoryUpdate || {};
    const internalThought = data.internalThought || '';

    // Log NPC dialogue
    appendNpcDialog(ctx, charId, npc.id, `${npc.name}: "${dialogue}"`);
    appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
      `${npc.name} says, "${dialogue}"`);

    // Process effects
    for (const effect of effects) {
      if (!effect || !effect.type) continue;

      if (effect.type === 'affinity_change') {
        let amount = Number(effect.amount) || 0;
        if (amount > 5) amount = 5;
        if (amount < -5) amount = -5;
        if (amount === 0) continue;
        awardNpcAffinity(ctx, character, npcIdVal, BigInt(amount));

        // Narrative cue for affinity shift
        let cue: string;
        if (amount >= 3) {
          cue = `${npc.name} seems genuinely pleased by your words.`;
        } else if (amount >= 1) {
          cue = `${npc.name} regards you with a hint of warmth.`;
        } else if (amount <= -3) {
          cue = `${npc.name}'s expression darkens. You've struck a nerve.`;
        } else {
          cue = `${npc.name}'s eyes narrow slightly. That didn't land well.`;
        }
        appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc', cue);

      } else if (effect.type === 'offer_quest') {
        // Validate quest type
        let questType = effect.questType || 'kill';
        if (!(QUEST_TYPES as readonly string[]).includes(questType)) {
          questType = 'kill';
        }

        // Check active quest count
        const activeQuests = getActiveQuestCount(ctx, charId);
        if (activeQuests >= MAX_ACTIVE_QUESTS) continue;

        // Create QuestTemplate
        const qt = ctx.db.quest_template.insert({
          id: 0n,
          name: effect.questName || 'Unknown Quest',
          npcId: npcIdVal,
          targetEnemyTemplateId: 0n,
          requiredCount: BigInt(effect.targetCount || 1),
          minLevel: character.level,
          maxLevel: character.level + 5n,
          rewardXp: BigInt(effect.rewardXp || Number(character.level) * 15 + 10),
          questType,
          description: effect.questDescription,
          rewardType: effect.rewardType || 'xp',
          rewardItemName: effect.rewardItemName,
          rewardItemDesc: effect.rewardItemDesc,
          rewardGold: effect.rewardGold ? BigInt(effect.rewardGold) : undefined,
          characterId: charId,
        });

        // Set location fields for delivery/explore quests
        if (['delivery', 'explore'].includes(questType)) {
          const npcLocation = npc.locationId;
          if (questType === 'delivery') {
            ctx.db.quest_template.id.update({
              ...ctx.db.quest_template.id.find(qt.id)!,
              sourceLocationId: npcLocation,
              targetItemName: effect.targetItemName || effect.questName || 'Package',
            });
          } else if (questType === 'explore') {
            ctx.db.quest_template.id.update({
              ...ctx.db.quest_template.id.find(qt.id)!,
              targetLocationId: npcLocation,
              targetItemName: effect.targetItemName || effect.questName || 'Hidden Object',
            });
          }
        }

        // For delivery quests, resolve targetNpcId if LLM provides a target NPC name
        if (questType === 'delivery' && effect.targetNpcName) {
          const targetNpc = [...ctx.db.npc.iter()].find(n => n.name === effect.targetNpcName);
          if (targetNpc) {
            ctx.db.quest_template.id.update({
              ...ctx.db.quest_template.id.find(qt.id)!,
              targetNpcId: targetNpc.id,
              targetLocationId: targetNpc.locationId,
            });
          }
        }

        // For kill-type quests, try to find an appropriate enemy template at the location
        if (['kill', 'kill_loot', 'boss_kill'].includes(questType)) {
          for (const ref of ctx.db.location_enemy_template.by_location.filter(character.locationId)) {
            ctx.db.quest_template.id.update({
              ...ctx.db.quest_template.id.find(qt.id)!,
              targetEnemyTemplateId: ref.enemyTemplateId,
            });
            break;
          }
        }

        // Create QuestInstance
        ctx.db.quest_instance.insert({
          id: 0n,
          characterId: charId,
          questTemplateId: qt.id,
          progress: 0n,
          completed: false,
          acceptedAt: ctx.timestamp,
        });

        appendPrivateEvent(ctx, charId, character.ownerUserId, 'quest',
          `New quest: ${effect.questName || 'Unknown Quest'}`);

      } else if (effect.type === 'reveal_location') {
        appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
          `${npc.name} reveals: "${effect.locationName || 'a hidden place'} -- ${effect.locationDescription || 'somewhere interesting.'}"`);

      } else if (effect.type === 'give_item') {
        appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
          `${npc.name} offers you something... (Item generation deferred.)`);

      } else {
        // warn_danger, open_shop, none, faction_info, etc. — narrative only
      }
    }

    // Update NPC memory
    const memoryRow = ctx.db.npc_memory.id.find(memoryId);
    if (memoryRow) {
      updateNpcMemory(ctx, memoryRow, {
        addTopics: memoryUpdate.addTopics,
        addSecret: memoryUpdate.addSecret,
      }, internalThought);
    }

    // Update conversation cooldown on affinity row
    const affinityRow = [...ctx.db.npc_affinity.by_character.filter(charId)]
      .find((r: any) => r.npcId === npcIdVal);
    if (affinityRow) {
      ctx.db.npc_affinity.id.update({
        ...affinityRow,
        lastInteraction: ctx.timestamp,
      });
    }

    incrementBudget(ctx, ctx.sender);

  } else if (task.domain === 'combat_narration') {
    handleCombatNarrationResult(ctx, task, resultText, true);
    // Budget already incremented in triggerCombatNarration -- no double increment
  }
});

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
  ensureRecipeTemplates,
  ensureNpcs,
  ensureQuestTemplates,
  ensureEnemyTemplatesAndRoles,
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
















