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
 * skills does not increment it, NPC budget is charged again at result, renown
 * failure does nothing, and the static renown fallback serializes perk.effect
 * with plain JSON.stringify (a bigint throw pinned for a Phase 41 fix).
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
import {
  updateNpcMemory,
  getActiveQuestCount,
  getActiveQuestCountForNpc,
  MAX_ACTIVE_QUESTS,
  MAX_QUESTS_PER_NPC,
} from './npc_conversation';
import { awardNpcAffinity } from './npc_affinity';
import { handleCombatNarrationResult } from './combat_narration';
import { RENOWN_PERK_POOLS } from '../data/renown_data';
import { QUEST_TYPES } from '../data/mechanical_vocabulary';

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

// Helper: if world gen fails, reset the world_gen_state to PENDING so client retries.
export function retryWorldGen(tx: any, genState: any, message: string) {
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

/** Failure handling per domain (the former `if (!success)` block). */
export function applyLlmFailure(ctx: any, job: ApplyJob): void {
  if (job.domain === 'creation_race') {
    appendCreationEvent(ctx, job.playerId, 'creation_error',
      'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."');
    const s = [...ctx.db.character_creation_state.by_player.filter(job.playerId)][0];
    if (s) ctx.db.character_creation_state.id.update({ ...s, step: 'AWAITING_RACE', updatedAt: ctx.timestamp });
  } else if (job.domain === 'creation_class') {
    appendCreationEvent(ctx, job.playerId, 'creation_error',
      'The Keeper flickers. "Something went wrong in the cosmic machinery. Try again."');
    const s = [...ctx.db.character_creation_state.by_player.filter(job.playerId)][0];
    if (s) ctx.db.character_creation_state.id.update({ ...s, step: 'AWAITING_ARCHETYPE', updatedAt: ctx.timestamp });
  } else if (job.domain === 'world_gen') {
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const genStateId = BigInt(context.genStateId);
    const genState = ctx.db.world_gen_state.id.find(genStateId);
    if (genState) {
      retryWorldGen(ctx, genState, 'The Keeper falters. "The world refuses to be remembered right now. Try again."');
    }
  } else if (job.domain === 'skill_gen') {
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const charId = BigInt(context.characterId);
    const character = ctx.db.character.id.find(charId);
    if (character) {
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
        'The Keeper flickers. "Your potential eludes crystallization. The power will come... eventually."');
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
  }
}

/** creation_race and creation_class success. */
export function applyCreationResult(ctx: any, job: ApplyJob, resultText: string): void {
  const generationType = job.domain === 'creation_race' ? 'race' : 'class';
  const s = [...ctx.db.character_creation_state.by_player.filter(job.playerId)][0];
  if (!s) return;

  incrementBudget(ctx, job.playerId);

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

      appendCreationEvent(ctx, job.playerId, 'creation',
        `${data.narrative || 'An interesting choice.'}\n\n` +
        `**${data.raceName}**${bonusText}\n\n` +
        `Now then. Every creature must choose its path. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
        `\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`
      );

      // Persist race definition for reuse by future players
      const raceLower = (data.raceName || '').trim().toLowerCase();
      if (raceLower) {
        let alreadySaved = false;
        for (const existing of ctx.db.race_definition.by_name.filter(raceLower)) {
          alreadySaved = true;
          break;
        }
        if (!alreadySaved) {
          ctx.db.race_definition.insert({
            id: 0n,
            name: data.raceName,
            nameLower: raceLower,
            narrative: data.narrative || '',
            bonusesJson: JSON.stringify(data.bonuses || {}),
            createdAt: ctx.timestamp,
          });
        }
      }

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
        const castTime = a.castSeconds > 0 ? `${a.castSeconds}s cast` : 'instant';
        const baseValue = a.value1 ?? a.baseDamage ?? '?';
        const cost = a.resourceCost ?? a.manaCost ?? 0;
        const resType = a.resourceType ?? (cost > 0 ? 'mana' : '');
        const kindLabel = a.kind ?? a.effect ?? 'damage';
        abilityText += `  ${a.damageType ?? 'physical'} ${kindLabel}, ${baseValue} base, ${castTime}, ${a.cooldownSeconds}s cooldown`;
        if (cost > 0) abilityText += `, ${cost} ${resType}`;
        const effectKind = a.effectType ?? a.effect;
        if (effectKind && effectKind !== 'none') abilityText += `, ${effectKind} (${a.effectDuration ?? '?'}s)`;
        abilityText += '\n';
      }

      appendCreationEvent(ctx, job.playerId, 'creation',
        `${data.classDescription || 'A unique class emerges.'}\n\n` +
        `**${data.className}**\n${statLine} | ${armorLine}${weaponLine ? ` | ${weaponLine}` : ''} | ${resourceLine}` +
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
}

/** skill_gen success. */
export function applySkillGenResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
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
  incrementBudget(ctx, job.playerId);

  // Present the 3 skills with The Keeper's sardonic narration
  let presentation = `The Keeper of Knowledge regards you with something resembling interest.\n\n`;
  presentation += `"Level ${character.level}. How quaint. The universe has deigned to offer you three new ways to embarrass yourself:"\n`;

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

      // Create QuestTemplate
      const qt = ctx.db.quest_template.insert({
        id: 0n,
        name: questName,
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

  if (perks.length < 3) {
    // Fall back to static RENOWN_PERK_POOLS for this rank
    const pool = RENOWN_PERK_POOLS[rank];
    if (pool && pool.length > 0) {
      const staticPerks = pool.slice(0, 3);
      for (const perk of staticPerks) {
        const isActive = perk.type === 'active';
        ctx.db.pending_renown_perk.insert({
          id: 0n,
          characterId: charId,
          rank: BigInt(rank),
          name: perk.name,
          description: perk.description,
          kind: isActive ? 'utility' : '',
          targetRule: 'self',
          resourceType: isActive ? 'stamina' : 'none',
          resourceCost: 0n,
          castSeconds: 0n,
          cooldownSeconds: isActive ? BigInt((perk.effect as any).cooldownSeconds ?? 300) : 0n,
          scaling: 'none',
          value1: 0n,
          perkEffectJson: isActive ? undefined : JSON.stringify(perk.effect),
          perkDomain: perk.domain,
          createdAt: ctx.timestamp,
        });
      }
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'narrative',
        'The Keeper shrugs. "The cosmos provided some... standard options for your consideration."');
    }
    incrementBudget(ctx, job.playerId);
    return;
  }

  // Insert up to 3 valid perk options
  const perksToInsert = perks.slice(0, 3);
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
      resourceCost: BigInt(Number(perk.resourceCost) || 0),
      castSeconds: BigInt(Number(perk.castSeconds) || 0),
      cooldownSeconds: BigInt(Number(perk.cooldownSeconds) || 0),
      scaling: String(perk.scaling || 'none'),
      value1: BigInt(Number(perk.value1) || 0),
      value2: perk.value2 != null ? BigInt(Number(perk.value2)) : undefined,
      damageType: perk.damageType || undefined,
      effectType: perk.effectType || undefined,
      effectMagnitude: perk.effectMagnitude != null ? BigInt(Number(perk.effectMagnitude)) : undefined,
      effectDuration: perk.effectDuration != null ? BigInt(Number(perk.effectDuration)) : undefined,
      perkEffectJson: perk.perkEffectJson || undefined,
      perkDomain: perk.perkDomain || 'combat',
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
    if (perk.kind && perk.kind.trim()) {
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
