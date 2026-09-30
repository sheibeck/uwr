/**
 * Executor-agnostic apply logic for LLM results.
 *
 * Extracted verbatim from the submit_llm_result reducer (Phase 40, plan 08).
 * Every function acts for the STORED requester (job.playerId), never for the
 * caller identity: in a scheduled procedure (Phase 41) the caller is the module
 * identity, so reading the sender from the context here would be a spoofing bug.
 *
 * Quirks are preserved on purpose (see submit_llm_result.characterization.test.ts):
 * creation increments the budget before parsing, skill_gen with fewer than three
 * skills does not increment it, and NPC budget is charged again at result.
 *
 * Phase 41 (plan 03) hardened this layer against real model output: creation
 * replies are clamped (creation_validate), every model-supplied number that becomes
 * a bigint goes through toBigIntSafe (a throw rolls back the whole apply), the renown
 * static fallback is the shared bigint-safe insertStaticRenownPerkOptions, and a
 * terminal renown_perk_gen failure delivers the static options instead of nothing.
 */
import { incrementBudget } from './llm';
import {
  appendWorldEvent,
  appendPrivateEvent,
  appendNpcDialog,
  appendCreationEvent,
} from './events';
import { pickRippleMessage, pickDiscoveryMessage, writeGeneratedRegion } from './world_gen';
import { ensureSpawnsForLocation } from './location';
import { parseSkillGenResult, insertPendingSkills } from './skill_gen';
import { processGeneratedSkill, validateSkillFields, type SkillFields } from './skill_budget';
import {
  updateNpcMemory,
  getActiveQuestCount,
  getActiveQuestCountForNpc,
  MAX_ACTIVE_QUESTS,
  MAX_QUESTS_PER_NPC,
} from './npc_conversation';
import { awardNpcAffinity } from './npc_affinity';
import { handleCombatNarrationResult } from './combat_narration';
import { insertStaticRenownPerkOptions } from './renown';
import { toBigIntSafe } from './safe_numbers';
import { validateRaceReply, validateClassReply } from './creation_validate';
import { QUEST_TYPES } from '../data/mechanical_vocabulary';
import { npcGender, npcNoticeLine } from '../data/npc_gender';
import type { NpcGender } from '../data/npc_gender';

/** The fields of a stored job the apply step needs. Works for llm_task and llm_job rows. */
export type ApplyJob = { domain: string; playerId: any; contextJson?: string };

/**
 * Map a stored row to ApplyJob. An llm_job row (route, requestJson) and a legacy
 * llm_task row (domain, contextJson) produce the same shape.
 */
export function toApplyJob(row: any): ApplyJob {
  if (row && row.route !== undefined && row.requestJson !== undefined) {
    return { domain: row.route, playerId: row.playerId, contextJson: row.requestJson };
  }
  return { domain: row.domain, playerId: row.playerId, contextJson: row.contextJson };
}

// Helper: extract JSON robustly from LLM response text
export function extractJson(raw: string): any {
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

// Helper: a world-gen failure parks the state in ERROR with an in-voice message and tells the
// player how to retry. The state never goes back to PENDING (that meant "call again", an
// unbounded automatic retry): only the player's [explore] starts a new job. world_gen_state is a
// public table, so errorMessage carries only the in-voice Keeper line, never a provider detail.
export function failWorldGen(tx: any, genState: any, message: string) {
  const char = tx.db.character.id.find(genState.characterId);
  tx.db.world_gen_state.id.update({
    ...tx.db.world_gen_state.id.find(genState.id),
    step: 'ERROR',
    errorMessage: message,
    updatedAt: tx.timestamp,
  });
  const line = message + ' Type [explore] to try again.';
  if (char && char.locationId !== 0n) {
    appendPrivateEvent(tx, genState.characterId, char.ownerUserId, 'system', line);
  } else {
    appendCreationEvent(tx, genState.playerId, 'creation_error', line);
  }
}

/**
 * The creation state a creation_race / creation_class job belongs to, but only while that state
 * is still at the job's GENERATING step. A stale result or failure (a sweeper expiry racing a late
 * apply, a re-run) never touches a state that has moved on: it cannot reopen a COMPLETE creation
 * or overwrite race data after the player reached the class or name step. The job names its state
 * by creationStateId; a legacy llm_task row (no id; submit_llm_result, removed in Phase 42) falls
 * back to the player's creation state, still behind the step check.
 */
export function creationStateForJob(ctx: any, job: ApplyJob): any | null {
  const expected = job.domain === 'creation_race' ? 'GENERATING_RACE' : 'GENERATING_CLASS';
  let context: any = {};
  try {
    context = job.contextJson ? JSON.parse(job.contextJson) : {};
  } catch {
    context = {};
  }
  let state: any;
  if (context && context.creationStateId != null) {
    let id: bigint;
    try {
      id = BigInt(context.creationStateId);
    } catch {
      return null;
    }
    state = ctx.db.character_creation_state.id.find(id);
  } else {
    state = [...ctx.db.character_creation_state.by_player.filter(job.playerId)][0];
  }
  if (!state || state.step !== expected) return null;
  return state;
}

/** Failure handling per domain (the former `if (!success)` block). */
export function applyLlmFailure(ctx: any, job: ApplyJob): void {
  if (job.domain === 'creation_race' || job.domain === 'creation_class') {
    const s = creationStateForJob(ctx, job);
    if (!s) return; // the state has moved on: nothing to revert, nothing to say
    appendCreationEvent(ctx, s.playerId, 'creation_error',
      'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."');
    const back = job.domain === 'creation_race' ? 'AWAITING_RACE' : 'AWAITING_ARCHETYPE';
    ctx.db.character_creation_state.id.update({ ...s, step: back, updatedAt: ctx.timestamp });
  } else if (job.domain === 'world_gen') {
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const genStateId = BigInt(context.genStateId);
    const genState = ctx.db.world_gen_state.id.find(genStateId);
    if (genState) {
      failWorldGen(ctx, genState, 'The Keeper falters. "The world refuses to be remembered right now."');
    }
  } else if (job.domain === 'skill_gen') {
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const charId = BigInt(context.characterId);
    const character = ctx.db.character.id.find(charId);
    if (character) {
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
        'The Keeper flickers. "Your potential eludes crystallization. Type [skills] when you want me to try again."');
    }
  } else if (job.domain === 'npc_conversation') {
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const charId = BigInt(context.characterId);
    const npcIdVal = BigInt(context.npcId);
    const character = ctx.db.character.id.find(charId);
    const npc = ctx.db.npc.id.find(npcIdVal);
    if (character && npc) {
      appendNpcDialog(ctx, charId, npc.id, `${npc.name} seems distracted.`);
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'npc',
        `${npc.name} seems distracted. Try again.`);
    }
  } else if (job.domain === 'combat_narration') {
    // Silent failure -- combat continues without narration
    handleCombatNarrationResult(ctx, job, '', false);
  } else if (job.domain === 'renown_perk_gen') {
    // An earned perk offer is never lost: fall back to the static options for the rank.
    let charId: bigint;
    let rank: number;
    try {
      const context = job.contextJson ? JSON.parse(job.contextJson) : {};
      charId = BigInt(context.characterId);
      rank = Number(context.rank) || 2;
    } catch (_err) {
      return;
    }
    const character = ctx.db.character.id.find(charId);
    if (!character) return;
    if (insertStaticRenownPerkOptions(ctx, charId, rank) > 0) {
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
        'The Keeper shrugs. "The cosmos provided some... standard options for your consideration."');
    }
  }
}

/** creation_race and creation_class success. */
export function applyCreationResult(ctx: any, job: ApplyJob, resultText: string): void {
  const generationType = job.domain === 'creation_race' ? 'race' : 'class';
  const s = creationStateForJob(ctx, job);
  if (!s) return;

  incrementBudget(ctx, job.playerId);

  try {
    const raw = extractJson(resultText);

    if (generationType === 'race') {
      // Clamp, never reject: everything below is built from the validated reply only.
      const race = validateRaceReply(raw);
      const { primary, secondary, flavor } = race.bonuses;
      ctx.db.character_creation_state.id.update({
        ...s,
        step: 'AWAITING_ARCHETYPE',
        raceName: race.raceName,
        raceNarrative: race.narrative,
        raceBonuses: JSON.stringify(race.bonuses),
        updatedAt: ctx.timestamp,
      });

      const bonusText =
        `\n+${primary.value} ${primary.stat.toUpperCase()}, +${secondary.value} ${secondary.stat.toUpperCase()}${flavor ? `. ${flavor}` : ''}`;

      appendCreationEvent(ctx, job.playerId, 'creation',
        `${race.narrative || 'An interesting choice.'}\n\n` +
        `**${race.raceName}**${bonusText}\n\n` +
        `Now then. Every creature must choose a path, and you are no exception. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
        `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`
      );

      // Persist race definition for reuse by future players. A reply that named no race
      // (validated to the placeholder 'Unknown') is not saved for reuse.
      const namedRace = typeof raw?.raceName === 'string' && raw.raceName.trim() !== '';
      const raceLower = namedRace ? race.raceName.toLowerCase() : '';
      if (raceLower) {
        let alreadySaved = false;
        for (const existing of ctx.db.race_definition.by_name.filter(raceLower)) {
          alreadySaved = true;
          break;
        }
        if (!alreadySaved) {
          ctx.db.race_definition.insert({
            id: 0n,
            name: race.raceName,
            nameLower: raceLower,
            narrative: race.narrative,
            bonusesJson: JSON.stringify(race.bonuses),
            createdAt: ctx.timestamp,
          });
        }
      }

    } else if (generationType === 'class') {
      // Clamp, never reject: everything below is built from the validated reply only.
      const cls = validateClassReply(raw, s.archetype ?? 'warrior');
      ctx.db.character_creation_state.id.update({
        ...s,
        step: 'CLASS_REVEALED',
        className: cls.className,
        classDescription: cls.classDescription,
        classStats: JSON.stringify(cls.stats),
        abilities: JSON.stringify(cls.abilities),
        updatedAt: ctx.timestamp,
      });

      const stats = cls.stats;
      const statLine = `Primary: ${stats.primaryStat.toUpperCase()}${stats.secondaryStat !== 'none' ? `, Secondary: ${stats.secondaryStat.toUpperCase()}` : ''}`;
      const weaponLine = stats.weaponProficiencies.length > 0
        ? `Weapons: ${stats.weaponProficiencies.join(', ')}` : '';
      const armorLine = stats.armorProficiencies.length > 0
        ? `Armor: ${stats.armorProficiencies.join(', ')}` : 'Armor: cloth';
      const resourceLine = stats.usesMana ? `Mana user (+${stats.bonusMana} bonus mana)` : `Physical (+${stats.bonusHp} bonus HP)`;

      let abilityText = '\n\nYour starting abilities:\n';
      for (const a of cls.abilities) {
        abilityText += `\n[${a.name}] — ${a.description}\n`;
        const castTime = a.castSeconds > 0 ? `${a.castSeconds}s cast` : 'instant';
        abilityText += `  ${a.damageType} ${a.kind}, ${a.value1} base, ${castTime}, ${a.cooldownSeconds}s cooldown`;
        if (a.resourceCost > 0) abilityText += `, ${a.resourceCost} ${a.resourceType}`;
        if (a.effectType && a.effectType !== 'none') abilityText += `, ${a.effectType} (${a.effectDuration ?? '?'}s)`;
        abilityText += '\n';
      }

      appendCreationEvent(ctx, job.playerId, 'creation',
        `${cls.classDescription || 'A unique class emerges.'}\n\n` +
        `**${cls.className}**\n${statLine} | ${armorLine}${weaponLine ? ` | ${weaponLine}` : ''} | ${resourceLine}` +
        abilityText +
        `\nChoose one. Type the name of the ability you wish to begin with. Choose wisely — or don't. I find recklessness entertaining.` +
        `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`
      );
    }
  } catch (parseErr) {
    console.error(`Creation LLM JSON parse error [${generationType}]: ${parseErr}`);
    appendCreationEvent(ctx, job.playerId, 'creation_error',
      'The Keeper grimaces. "The response from the cosmic machinery was... malformed. Let us try again."');
    const revertStep = generationType === 'race' ? 'AWAITING_RACE' : 'AWAITING_ARCHETYPE';
    ctx.db.character_creation_state.id.update({ ...s, step: revertStep, updatedAt: ctx.timestamp });
  }
}

/** world_gen success. */
export function applyWorldGenResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
  const genStateId = BigInt(context.genStateId);
  const currentGenState = ctx.db.world_gen_state.id.find(genStateId);
  if (!currentGenState || currentGenState.step !== 'GENERATING') return;

  let data: any;
  try {
    data = extractJson(resultText);
  } catch (parseErr) {
    console.error(`World gen JSON parse error: ${parseErr}`);
    failWorldGen(ctx, currentGenState,
      'The Keeper grimaces. "The world tried to form but... it came out wrong."');
    return;
  }

  if (!data.regionName || !data.locations || data.locations.length < 1) {
    failWorldGen(ctx, currentGenState,
      'The Keeper shakes his head. "The world beyond is... incomplete."');
    return;
  }

  // Write generated region content into game tables
  // For starter regions (sourceRegionId=0n), mark region with race so same-race chars reuse it
  const genCharacter = ctx.db.character.id.find(currentGenState.characterId);
  const starterRace = currentGenState.sourceRegionId === 0n && genCharacter?.race
    ? genCharacter.race.toLowerCase()
    : undefined;
  const region = writeGeneratedRegion(ctx, data, currentGenState, starterRace);

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
      const locationNpcs: { name: string; gender: NpcGender }[] = [];
      for (const npc of ctx.db.npc.iter()) {
        if (npc.locationId === homeLocation.id) {
          locationNpcs.push({ name: npc.name, gender: npcGender(npc) });
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
        arrivalMsg += '\n\n' + npcNoticeLine(locationNpcs);
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
}

/** skill_gen success. */
export function applySkillGenResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
  const charId = BigInt(context.characterId);
  const character = ctx.db.character.id.find(charId);
  if (!character) return;

  // The offer is for the level the job was queued for, not the character's level now.
  const offerLevel = toBigIntSafe(context.level, { min: 1n, max: 1_000_000n, fallback: character.level });

  // Never overwrite an offer the player may be looking at: keep the existing one.
  if ([...ctx.db.pending_skill.by_character.filter(charId)].length > 0) {
    console.error(`Skill gen result for character ${charId} dropped: an offer is already pending`);
    return;
  }

  const { skills, errors } = parseSkillGenResult(resultText, charId, offerLevel);

  if (skills.length < 3) {
    console.error(`Skill gen produced ${skills.length} valid skills: ${errors.join('; ')}`);
    appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
      'The Keeper grimaces. "The cosmic machinery sputtered. Your potential remains... unformed. Type [skills] to try again."');
    return;
  }

  insertPendingSkills(ctx, charId, skills, offerLevel);
  incrementBudget(ctx, job.playerId);

  // Present the 3 skills with The Keeper's sardonic narration
  let presentation = `The Keeper of Knowledge regards you with something resembling interest.\n\n`;
  presentation += `"Level ${offerLevel}. How quaint. The universe has deigned to offer you three new ways to embarrass yourself:"\n`;

  for (const skill of skills) {
    presentation += `\n[${skill.name}] -- ${skill.description}\n`;
    const castLabel = skill.castSeconds > 0n ? `${skill.castSeconds}s cast` : 'instant';
    presentation += `  ${skill.kind} | ${skill.resourceCost} ${skill.resourceType} | ${castLabel} | ${skill.cooldownSeconds}s cooldown | ${skill.value1} power\n`;
  }

  presentation += `\n"Choose wisely. Or don't. The rejected skills will dissolve into the void, never to return."`;

  appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative', presentation);
}

/** npc_conversation success. */
export function applyNpcConversationResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
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
      let amount = Math.trunc(Number(effect.amount)) || 0;
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

      // Check active quest count (global cap)
      const activeQuests = getActiveQuestCount(ctx, charId);
      if (activeQuests >= MAX_ACTIVE_QUESTS) continue;

      // Per-NPC cap enforcement (safety net — LLM prompt already discourages this)
      if (getActiveQuestCountForNpc(ctx, charId, npcIdVal) >= MAX_QUESTS_PER_NPC) continue;

      // Duplicate quest name prevention: skip if same NPC+character already has this quest name
      const questName = effect.questName || 'Unknown Quest';
      let isDuplicate = false;
      for (const existingQt of ctx.db.quest_template.by_npc.filter(npcIdVal)) {
        if (existingQt.characterId === charId && existingQt.name === questName) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) continue;

      // Create QuestTemplate. Model-supplied numbers never throw: a fractional or non-finite
      // value is floored or replaced, and a zero reward keeps the level-based default.
      const defaultRewardXp = BigInt(Number(character.level) * 15 + 10);
      const suppliedXp = toBigIntSafe(effect.rewardXp, { min: 0n, max: 1_000_000n, fallback: defaultRewardXp });
      const questRewardXp = suppliedXp === 0n ? defaultRewardXp : suppliedXp;
      const qt = ctx.db.quest_template.insert({
        id: 0n,
        name: questName,
        npcId: npcIdVal,
        targetEnemyTemplateId: 0n,
        requiredCount: toBigIntSafe(effect.targetCount, { min: 1n, max: 1_000n, fallback: 1n }),
        minLevel: character.level,
        maxLevel: character.level + 5n,
        rewardXp: questRewardXp,
        questType,
        description: effect.questDescription,
        rewardType: effect.rewardType || 'xp',
        rewardItemName: effect.rewardItemName,
        rewardItemDesc: effect.rewardItemDesc,
        rewardGold: effect.rewardGold
          ? toBigIntSafe(effect.rewardGold, { min: 0n, max: 1_000_000n, fallback: 0n })
          : undefined,
        characterId: charId,
      });

      // Set location fields for delivery/explore quests
      if (['delivery', 'explore'].includes(questType)) {
        const npcLocation = npc.locationId;
        if (questType === 'delivery') {
          // Resolve sourceLocationId: must be DIFFERENT from NPC's location
          const npcLoc = ctx.db.location.id.find(npc.locationId);
          const regionLocations = npcLoc
            ? [...ctx.db.location.iter()].filter(l => l.regionId === npcLoc.regionId)
            : [];

          let sourceLocId: bigint | undefined;
          // Try LLM-provided sourceLocationName (case-insensitive match)
          if (effect.sourceLocationName) {
            const match = regionLocations.find((l: any) =>
              l.name.toLowerCase() === effect.sourceLocationName.toLowerCase() && l.id !== npc.locationId
            );
            if (match) sourceLocId = match.id;
          }
          // Fallback: pick a random connected location that is NOT the NPC's location
          if (!sourceLocId) {
            const connections = [...ctx.db.location_connection.by_from.filter(npc.locationId)];
            const neighbors = connections
              .map((c: any) => c.toLocationId)
              .filter((id: bigint) => id !== npc.locationId);
            if (neighbors.length > 0) {
              const idx = Number(ctx.timestamp.microsSinceUnixEpoch % BigInt(neighbors.length));
              sourceLocId = neighbors[idx];
            }
          }

          ctx.db.quest_template.id.update({
            ...ctx.db.quest_template.id.find(qt.id)!,
            sourceLocationId: sourceLocId || npcLocation,
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

      // For kill-type quests, resolve targetEnemyName from LLM against real enemy templates
      if (['kill', 'kill_loot', 'boss_kill'].includes(questType)) {
        let resolvedEnemyTemplateId: bigint | null = null;

        if (effect.targetEnemyName) {
          const targetName = effect.targetEnemyName.toLowerCase();

          // Search current location + connected locations for matching enemy template
          const searchLocIds: bigint[] = [character.locationId];
          for (const conn of ctx.db.location_connection.by_from.filter(character.locationId)) {
            searchLocIds.push(conn.toLocationId);
          }

          for (const locId of searchLocIds) {
            if (resolvedEnemyTemplateId) break;
            for (const ref of ctx.db.location_enemy_template.by_location.filter(locId)) {
              const et = ctx.db.enemy_template.id.find(ref.enemyTemplateId);
              if (et && et.name.toLowerCase() === targetName) {
                resolvedEnemyTemplateId = et.id;
                break;
              }
            }
          }

          // LLM invented a new enemy — create template with sensible defaults
          if (!resolvedEnemyTemplateId) {
            const charLevel = Number(character.level);
            const newEt = ctx.db.enemy_template.insert({
              id: 0n,
              name: effect.targetEnemyName,
              role: 'melee',
              roleDetail: 'standard',
              abilityProfile: 'basic',
              terrainTypes: 'any',
              creatureType: effect.targetEnemyName.toLowerCase().includes('undead') ? 'undead' : 'beast',
              timeOfDay: 'any',
              socialGroup: 'loner',
              socialRadius: 0n,
              awareness: 'normal',
              groupMin: 1n,
              groupMax: 1n,
              armorClass: BigInt(8 + charLevel),
              level: character.level,
              maxHp: BigInt(20 + charLevel * 8),
              baseDamage: BigInt(3 + charLevel * 2),
              xpReward: BigInt(charLevel * 10 + 15),
            });
            // Link to character's current location
            ctx.db.location_enemy_template.insert({
              id: 0n,
              locationId: character.locationId,
              enemyTemplateId: newEt.id,
            });
            resolvedEnemyTemplateId = newEt.id;
          }
        }

        // Fallback: grab first enemy at the location if no targetEnemyName
        if (!resolvedEnemyTemplateId) {
          for (const ref of ctx.db.location_enemy_template.by_location.filter(character.locationId)) {
            resolvedEnemyTemplateId = ref.enemyTemplateId;
            break;
          }
        }

        if (resolvedEnemyTemplateId) {
          ctx.db.quest_template.id.update({
            ...ctx.db.quest_template.id.find(qt.id)!,
            targetEnemyTemplateId: resolvedEnemyTemplateId,
          });
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

  incrementBudget(ctx, job.playerId);
}

/** combat_narration success. */
export function applyCombatNarrationResult(ctx: any, job: ApplyJob, resultText: string): void {
  handleCombatNarrationResult(ctx, job, resultText, true);
  // Budget already incremented in triggerCombatNarration -- no double increment
}

/**
 * An active renown perk (non-empty kind) becomes a combat ability when chosen, so it goes through
 * the same skill_budget validator and clamps as a generated skill at the character's level:
 * every enum (kind, targetRule, resourceType, scaling, damageType, effectType) must be in the
 * mechanical vocabulary, value1 and effectMagnitude are clamped to the kind's budget, and a mana
 * perk casts for at least 1 s. Returns the perk with the clamped fields, or null when any enum is
 * invalid (the perk is dropped, and with fewer than three the static options cover the rank).
 */
export function validateRenownActivePerk(perk: any, level: bigint): any | null {
  const optStr = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
  const num = (v: unknown, fallback: number) => Number(toBigIntSafe(v, { min: 0n, max: 1_000_000n, fallback: BigInt(fallback) }));
  const fields: SkillFields = {
    kind: String(perk.kind).trim(),
    targetRule: String(perk.targetRule || 'self'),
    resourceType: String(perk.resourceType || 'none'),
    scaling: String(perk.scaling || 'none'),
    damageType: optStr(perk.damageType),
    effectType: optStr(perk.effectType),
    value1: num(perk.value1, 0),
    value2: perk.value2 != null ? num(perk.value2, 0) : undefined,
    effectMagnitude: perk.effectMagnitude != null ? num(perk.effectMagnitude, 0) : undefined,
    effectDuration: perk.effectDuration != null ? num(perk.effectDuration, 0) : undefined,
    resourceCost: num(perk.resourceCost, 0),
    castSeconds: num(perk.castSeconds, 0),
    cooldownSeconds: num(perk.cooldownSeconds, 0),
  };
  if (!validateSkillFields(fields).valid) return null;
  const processed = processGeneratedSkill(fields, level);
  return {
    ...perk,
    kind: processed.kind,
    targetRule: processed.targetRule,
    resourceType: processed.resourceType,
    scaling: processed.scaling,
    damageType: processed.damageType,
    effectType: processed.effectType,
    value1: processed.value1,
    value2: processed.value2,
    effectMagnitude: processed.effectMagnitude,
    effectDuration: processed.effectDuration,
    resourceCost: processed.resourceCost,
    castSeconds: processed.castSeconds,
    cooldownSeconds: processed.cooldownSeconds,
  };
}

/** renown_perk_gen success. */
export function applyRenownPerkResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
  const charId = BigInt(context.characterId);
  const rank = Number(context.rank) || 2;
  const character = ctx.db.character.id.find(charId);
  if (!character) return;

  // Parse LLM response
  let perks: any[] = [];
  try {
    const data = extractJson(resultText);
    if (Array.isArray(data.perks)) {
      perks = data.perks.filter((p: any) =>
        p && typeof p.name === 'string' && typeof p.description === 'string' &&
        (typeof p.kind === 'string' || typeof p.perkEffectJson === 'string')
      );
    }
  } catch (_err) {
    perks = [];
  }

  // Active perks are validated and clamped like generated skills; an invalid one is dropped.
  const perkLevel: bigint = typeof character.level === 'bigint' && character.level > 0n ? character.level : 1n;
  perks = perks
    .map((p: any) => (typeof p.kind === 'string' && p.kind.trim() !== '' ? validateRenownActivePerk(p, perkLevel) : p))
    .filter((p: any) => p !== null);

  if (perks.length < 3) {
    // Fall back to the static RENOWN_PERK_POOLS options for this rank (bigint-safe serializer).
    if (insertStaticRenownPerkOptions(ctx, charId, rank) > 0) {
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
        'The Keeper shrugs. "The cosmos provided some... standard options for your consideration."');
    }
    incrementBudget(ctx, job.playerId);
    return;
  }

  // Insert up to 3 valid perk options. Every model-supplied number goes through toBigIntSafe.
  const perksToInsert = perks.slice(0, 3);
  const perkInt = (v: unknown) => toBigIntSafe(v, { min: 0n, max: 1_000_000n, fallback: 0n });
  const optStr = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined);
  for (const perk of perksToInsert) {
    ctx.db.pending_renown_perk.insert({
      id: 0n,
      characterId: charId,
      rank: BigInt(rank),
      name: String(perk.name || 'Unknown Perk'),
      description: String(perk.description || ''),
      kind: String(perk.kind || ''),
      targetRule: String(perk.targetRule || 'self'),
      resourceType: String(perk.resourceType || 'none'),
      resourceCost: perkInt(perk.resourceCost),
      castSeconds: perkInt(perk.castSeconds),
      cooldownSeconds: perkInt(perk.cooldownSeconds),
      scaling: String(perk.scaling || 'none'),
      value1: perkInt(perk.value1),
      value2: perk.value2 != null ? perkInt(perk.value2) : undefined,
      damageType: optStr(perk.damageType),
      effectType: optStr(perk.effectType),
      effectMagnitude: perk.effectMagnitude != null ? perkInt(perk.effectMagnitude) : undefined,
      effectDuration: perk.effectDuration != null ? perkInt(perk.effectDuration) : undefined,
      perkEffectJson: optStr(perk.perkEffectJson),
      perkDomain: String(perk.perkDomain || 'combat'),
      createdAt: ctx.timestamp,
    });
  }

  incrementBudget(ctx, job.playerId);

  // Present options to the player
  let presentation = `Your renown has grown. The world takes notice.\n\n`;
  presentation += `The Keeper of Knowledge regards you with something resembling mild respect.\n\n`;
  presentation += `"Rank ${rank}. The world owes you something. Choose your due:"\n`;
  for (const perk of perksToInsert) {
    presentation += `\n[${perk.name}] -- ${perk.description}\n`;
    if (String(perk.kind || '').trim()) {
      presentation += `  Active ability | ${perk.resourceCost || 0} ${perk.resourceType || 'none'} | ${perk.cooldownSeconds || 0}s cooldown\n`;
    } else {
      presentation += `  Passive bonus\n`;
    }
  }
  presentation += `\n"Choose wisely. Your reputation preceded you here. Don't let it down."`;

  appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative', presentation);
}

/** Success dispatcher. An unknown domain (for example smoke_test) does nothing. */
export function applyLlmResult(ctx: any, job: ApplyJob, resultText: string): void {
  if (job.domain === 'creation_race' || job.domain === 'creation_class') {
    applyCreationResult(ctx, job, resultText);
  } else if (job.domain === 'world_gen') {
    applyWorldGenResult(ctx, job, resultText);
  } else if (job.domain === 'skill_gen') {
    applySkillGenResult(ctx, job, resultText);
  } else if (job.domain === 'npc_conversation') {
    applyNpcConversationResult(ctx, job, resultText);
  } else if (job.domain === 'combat_narration') {
    applyCombatNarrationResult(ctx, job, resultText);
  } else if (job.domain === 'renown_perk_gen') {
    applyRenownPerkResult(ctx, job, resultText);
  }
}
