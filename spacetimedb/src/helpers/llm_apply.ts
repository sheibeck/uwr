/**
 * Executor-agnostic apply logic for LLM results.
 *
 * Extracted from the removed client-trusted result reducer in Phase 40.
 * Every function acts for the STORED requester (job.playerId), never for the
 * caller identity: in a scheduled procedure (Phase 41) the caller is the module
 * identity, so reading the sender from the context here would be a spoofing bug.
 *
 * Quirks are preserved on purpose and pinned in llm_apply.characterization.test.ts.
 * Spend is owned by the executor's reservation and settlement (Phase 41), so this
 * layer writes no call counts.
 *
 * Phase 41 (plan 03) hardened this layer against real model output: creation
 * replies are clamped (creation_validate), every model-supplied number that becomes
 * a bigint goes through toBigIntSafe (a throw rolls back the whole apply), the renown
 * static fallback is the shared bigint-safe insertStaticRenownPerkOptions, and a
 * terminal renown_perk_gen failure delivers the static options instead of nothing.
 *
 * Phase 43 (plan 08) stages world generation: world_gen_start (stage 1) writes the region, its
 * start location and the first NPC and enqueues world_gen (stage 2) in the same transaction;
 * world_gen fills in the rest. Each result touches only a state at its own step (stage 1 needs
 * GENERATING, stage 2 needs FILLING), and a failed stage 2 leaves the stage-1 region playable.
 *
 * Phase 43 (plan 13) stages the class the same way: creation_class_reveal (stage 1, at
 * GENERATING_CLASS) stores the class name, description and one ability and enqueues the
 * creation_class fill in the same transaction; creation_class (stage 2, at CLASS_FILLING) merges
 * the stats and the other abilities through validateClassReply and only then moves to
 * CLASS_REVEALED. A failed fill keeps the reveal (CLASS_FILL_ERROR).
 */
import {
  appendWorldEvent,
  appendPrivateEvent,
  appendNpcDialog,
  appendCreationEvent,
} from './events';
import {
  pickWorldEventMessage,
  pickDiscoveryMessage,
  writeRegionStart,
  writeRegionFill,
  findRegionStart,
  startWorldFill,
  failWorldFill,
  WORLD_START_MILESTONE_LINE,
  WORLD_FILL_FAILED_MESSAGE,
  worldFillCompleteLine,
} from './world_gen';
import { ensurePoolsForLocation, familyOfOne, resolveKillQuestTarget } from './families';
import { cleanQuestTargetName, freeCreatureName } from './family_validate';
import { nameKey } from '../data/economy_design_rules';
import { nounsFromTemplateName } from '../data/family_rules';
import { markLocationVisited } from './visited';
import { parseSkillGenResult, insertPendingSkills } from './skill_gen';
import { validateRenownActivePerk } from './renown_perk_validate';
// Re-exported: the validator lives in a pure module so offline harnesses can run it without the server runtime.
export { validateRenownActivePerk };
import {
  updateNpcMemory,
  getActiveQuestCount,
  getActiveQuestCountForNpc,
  MAX_ACTIVE_QUESTS,
  MAX_QUESTS_PER_NPC,
} from './npc_conversation';
import { awardNpcAffinity } from './npc_affinity';
import { findRaceDefinition, isPlaceholderRace, PLACEHOLDER_RACE_NAME, raceBonusText } from '../data/race_bonuses';
import { handleCombatNarrationResult } from './combat_narration';
import { insertStaticRenownPerkOptions, renownRankSettled } from './renown';
import { toBigIntSafe } from './safe_numbers';
import { validateRaceReply, validateClassReply } from './creation_validate';
import { isRestingErrorCode } from './llm_status';
import { LLM_RESTING_LINE } from './llm_queue';
import {
  startClassFill,
  CLASS_REVEAL_MILESTONE_LINE,
  CLASS_FILL_FAILED_LINE,
  classFillRetryLine,
} from './creation_generation';
import { QUEST_TYPES } from '../data/mechanical_vocabulary';
import { npcGender, npcNoticeLine } from '../data/npc_gender';
import type { NpcGender } from '../data/npc_gender';
import { segmentsFromReply, keeperSegments, keeperFallback, flattenSegments } from './segments';
import { applyRegionEconomyResult, failRegionEconomy, startRegionEconomy, startFamilyLoot } from './region_economy';
import type { Segment, PresentSpeaker } from './segments';

/**
 * Phase 46: every narrative row stores its segments next to a message derived from them
 * (message = flattenSegments(segments)). Local on purpose, NOT exported and NOT added to events.ts:
 * eight suites mock ./events with a fixed export list.
 */
function writePrivateSegments(ctx: any, characterId: bigint, ownerUserId: bigint, kind: string, segs: Segment[]) {
  appendPrivateEvent(ctx, characterId, ownerUserId, kind, flattenSegments(segs), segs);
}
function writeCreationSegments(ctx: any, playerId: any, kind: string, segs: Segment[]) {
  appendCreationEvent(ctx, playerId, kind, flattenSegments(segs), segs);
}

/** A caught error reduced to its name: the message of a JSON.parse error can quote the model's reply. */
function errName(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/**
 * The fields of a stored llm_job the apply step needs. errorCode is set on a failed job only; the
 * resting codes 'halted' and 'ceiling' (Phase 43) pick the one in-voice resting line over the generic copy.
 */
export type ApplyJob = { domain: string; playerId: any; contextJson?: string; errorCode?: string; jobId?: bigint };

/** Map a stored llm_job row (route, requestJson, playerId, errorCode) to ApplyJob. */
export function toApplyJob(row: any): ApplyJob {
  return {
    domain: row.route,
    playerId: row.playerId,
    contextJson: row.requestJson,
    errorCode: row.errorCode ?? undefined,
    // The llm_job id: the region economy apply checks it against region_economy.jobId (review B IN-02).
    jobId: typeof row.id === 'bigint' ? row.id : undefined,
  };
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
    writeCreationSegments(tx, genState.playerId, 'creation_error', keeperFallback(line));
  }
}

/** The step each creation route's job holds the state at while it runs. */
const CREATION_JOB_STEP: Readonly<Record<string, string>> = Object.freeze({
  creation_race: 'GENERATING_RACE',
  creation_class_reveal: 'GENERATING_CLASS',
  creation_class: 'CLASS_FILLING',
});

/**
 * The creation state a creation_race / creation_class_reveal / creation_class job belongs to, but
 * only while that state is still at the job's own step (GENERATING_RACE, GENERATING_CLASS or
 * CLASS_FILLING). A stale result or failure (a sweeper expiry racing a late
 * apply, a re-run) never touches a state that has moved on: it cannot reopen a COMPLETE creation
 * or overwrite race data after the player reached the class or name step. The job names its state
 * by creationStateId; a job without one (as in older rows and the tests) falls back to the
 * player's creation state, still behind the step check.
 */
export function creationStateForJob(ctx: any, job: ApplyJob): any | null {
  const expected = CREATION_JOB_STEP[job.domain];
  if (!expected) return null;
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
  // The kill switch or the global ceiling stopped this job: one resting line, never the generic copy.
  const resting = isRestingErrorCode(job.errorCode);
  if (job.domain === 'creation_race' || job.domain === 'creation_class_reveal') {
    const s = creationStateForJob(ctx, job);
    if (!s) return; // the state has moved on: nothing to revert, nothing to say
    writeCreationSegments(ctx, s.playerId, 'creation_error', keeperFallback(
      resting ? LLM_RESTING_LINE : 'The page flickers. Something went wrong in the cosmic machinery. Try again.'));
    const back = job.domain === 'creation_race' ? 'AWAITING_RACE' : 'AWAITING_ARCHETYPE';
    ctx.db.character_creation_state.id.update({ ...s, step: back, updatedAt: ctx.timestamp });
  } else if (job.domain === 'creation_class') {
    // Stage 2 failed: the reveal (name, description, first ability) stays, any input retries the fill.
    const s = creationStateForJob(ctx, job);
    if (!s) return;
    failClassFill(ctx, s, resting ? classFillRetryLine(LLM_RESTING_LINE) : CLASS_FILL_FAILED_LINE);
  } else if (job.domain === 'world_gen_start') {
    // Stage 1 failed: nothing was written. Only a state still waiting on stage 1 is failed.
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const genStateId = BigInt(context.genStateId);
    const genState = ctx.db.world_gen_state.id.find(genStateId);
    if (genState && (genState.step === 'PENDING' || genState.step === 'GENERATING')) {
      failWorldGen(ctx, genState, resting ? LLM_RESTING_LINE : 'The map blurs and will not settle. The world refuses to be remembered right now.');
    }
  } else if (job.domain === 'world_gen') {
    // Stage 2 failed: the stage-1 region stays playable. Only a FILLING state is failed, and never retried here.
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const genStateId = BigInt(context.genStateId);
    const genState = ctx.db.world_gen_state.id.find(genStateId);
    if (genState && genState.step === 'FILLING') {
      failWorldFill(ctx, genState, resting ? LLM_RESTING_LINE : WORLD_FILL_FAILED_MESSAGE);
    }
  } else if (job.domain === 'skill_gen') {
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const charId = BigInt(context.characterId);
    const character = ctx.db.character.id.find(charId);
    if (character) {
      writePrivateSegments(ctx, charId, character.ownerUserId, 'narrative', keeperFallback(
        resting
          ? `${LLM_RESTING_LINE} Type [skills] when you want another attempt.`
          : 'The page flickers. Your potential eludes crystallization. Type [skills] when you want another attempt.'));
    }
  } else if (job.domain === 'npc_conversation') {
    const context = job.contextJson ? JSON.parse(job.contextJson) : {};
    const charId = BigInt(context.characterId);
    const npcIdVal = BigInt(context.npcId);
    const character = ctx.db.character.id.find(charId);
    const npc = ctx.db.npc.id.find(npcIdVal);
    if (resting) {
      // One system line, no NPC dialog line: the NPC did not fail to answer, the Keeper is resting.
      if (character) appendPrivateEvent(ctx, charId, character.ownerUserId, 'system', LLM_RESTING_LINE);
    } else if (character && npc) {
      appendNpcDialog(ctx, charId, npc.id, `${npc.name} seems distracted.`);
      writePrivateSegments(ctx, charId, character.ownerUserId, 'npc',
        keeperFallback(`${npc.name} seems distracted. Try again.`));
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
      writePrivateSegments(ctx, charId, character.ownerUserId, 'narrative',
        keeperFallback('The cosmos shrugs and offers some... standard options for your consideration.'));
    }
  } else if (job.domain === 'region_economy') {
    // Silent: the region keeps its fallbacks and /economy shows it as failed.
    failRegionEconomy(ctx, job);
  }
}

/** The malformed-reply line, shared by the race and the class reveal. */
const CREATION_MALFORMED_LINE =
  'The answer comes back garbled, as though the cosmic machinery had choked on it. Try again.';

/** creation_race success (the class has its own two stages: applyClassRevealResult and applyClassFillResult). */
export function applyCreationResult(ctx: any, job: ApplyJob, resultText: string): void {
  if (job.domain !== 'creation_race') return;
  const s = creationStateForJob(ctx, job);
  if (!s) return;

  try {
    const raw = extractJson(resultText);

    // Clamp, never reject: everything below is built from the validated reply only.
    const race = validateRaceReply(raw);
    // A reply that named no race (validated to the placeholder 'Unknown') is not saved for reuse.
    // The name 'Unknown' is reserved for that placeholder (review WR-06): a reply that names it is
    // treated as naming no race, so no definition is ever saved under it.
    const namedRace = typeof raw?.raceName === 'string' && raw.raceName.trim() !== ''
      && !isPlaceholderRace(race.raceName);
    const raceLower = namedRace ? race.raceName.toLowerCase() : '';

    // One source of truth (review CR-01): the stored race_definition row. When the name is already
    // saved, its name and bonuses go on the creation state, so the sheet, finalize and level-up all
    // read the same bonuses. A reply that named no race has no definition, so it carries no bonus
    // at all (finalize and level-up both look the race up by name and would find nothing).
    const existing: any = raceLower ? findRaceDefinition(ctx, raceLower) : undefined;
    const bonusesJson: string = existing ? existing.bonusesJson : namedRace ? JSON.stringify(race.bonuses) : '{}';
    // A reply that names the placeholder in any case is stored under its canonical spelling.
    const raceName: string = existing ? existing.name : isPlaceholderRace(race.raceName) ? PLACEHOLDER_RACE_NAME : race.raceName;

    ctx.db.character_creation_state.id.update({
      ...s,
      step: 'AWAITING_ARCHETYPE',
      raceName,
      raceNarrative: race.narrative,
      raceBonuses: bonusesJson,
      updatedAt: ctx.timestamp,
    });

    const bonusText = raceBonusText(bonusesJson);

    writeCreationSegments(ctx, job.playerId, 'creation', keeperSegments(
      `${race.narrative || 'An interesting choice.'}\n\n` +
      `**${raceName}**${bonusText}\n\n` +
      `Now then. Every creature must choose a path, and you are no exception. Are you a [Warrior] — all muscle and stubborn refusal to die gracefully? Or a [Mystic] — convinced that reality is merely a suggestion? Choose.` +
      `\n\n(If you're already regretting your choices, type "go back." Nobody will judge... much.)`
    ));

    // Persist the race definition for reuse by future players.
    if (raceLower && !existing) {
      ctx.db.race_definition.insert({
        id: 0n,
        name: race.raceName,
        nameLower: raceLower,
        narrative: race.narrative,
        bonusesJson: JSON.stringify(race.bonuses),
        createdAt: ctx.timestamp,
      });
    }
  } catch (parseErr) {
    console.error(`Creation LLM reply could not be parsed [creation_race]: ${errName(parseErr)}`);
    writeCreationSegments(ctx, job.playerId, 'creation_error', keeperFallback(CREATION_MALFORMED_LINE));
    ctx.db.character_creation_state.id.update({ ...s, step: 'AWAITING_RACE', updatedAt: ctx.timestamp });
  }
}

/** One ability's mechanics line, shared by the stage-1 reveal and the full class message. */
function abilityMechanicsLine(a: any): string {
  const castTime = a.castSeconds > 0 ? `${a.castSeconds}s cast` : 'instant';
  let line = `  ${a.damageType} ${a.kind}, ${a.value1} base, ${castTime}, ${a.cooldownSeconds}s cooldown`;
  if (a.resourceCost > 0) line += `, ${a.resourceCost} ${a.resourceType}`;
  if (a.effectType && a.effectType !== 'none') line += `, ${a.effectType} (${a.effectDuration ?? '?'}s)`;
  return line;
}

/**
 * The fill failed (call failure, malformed reply, expiry, refusal): the state becomes
 * CLASS_FILL_ERROR, the class name, description and first ability stay on it, and the player gets
 * one in-voice line. Nothing is retried here: only the player's next input starts a new fill.
 */
export function failClassFill(ctx: any, state: any, message: string): void {
  const current = ctx.db.character_creation_state.id.find(state.id) ?? state;
  ctx.db.character_creation_state.id.update({ ...current, step: 'CLASS_FILL_ERROR', updatedAt: ctx.timestamp });
  writeCreationSegments(ctx, state.playerId, 'creation_error', keeperFallback(message));
}

/**
 * creation_class_reveal success (stage 1 of the class, Phase 43).
 *
 * Stores the class name, description and exactly one ability (clamped by validateClassReply), shows
 * the player the class identity and the first ability with the milestone line, and enqueues the
 * creation_class fill in the same transaction (CLASS_FILLING with one pending job, or
 * CLASS_FILL_ERROR when that enqueue is refused). Only a GENERATING_CLASS state is touched. A reply
 * that is not JSON or has no usable firstAbility object reverts to AWAITING_ARCHETYPE.
 */
export function applyClassRevealResult(ctx: any, job: ApplyJob, resultText: string): void {
  const s = creationStateForJob(ctx, job);
  if (!s || job.domain !== 'creation_class_reveal') return;

  let cls: ReturnType<typeof validateClassReply>;
  try {
    const raw = extractJson(resultText);
    const first = raw?.firstAbility;
    if (first === null || typeof first !== 'object' || Array.isArray(first)) {
      throw new Error('class reveal has no firstAbility object');
    }
    // Clamp, never reject: the reveal carries one ability, whatever else the reply held.
    cls = validateClassReply(
      { className: raw.className, classDescription: raw.classDescription, abilities: [first] },
      s.archetype ?? 'warrior',
    );
  } catch (parseErr) {
    console.error(`Creation LLM reply could not be parsed [creation_class_reveal]: ${errName(parseErr)}`);
    writeCreationSegments(ctx, job.playerId, 'creation_error', keeperFallback(CREATION_MALFORMED_LINE));
    ctx.db.character_creation_state.id.update({ ...s, step: 'AWAITING_ARCHETYPE', updatedAt: ctx.timestamp });
    return;
  }

  const revealed = {
    ...s,
    step: 'CLASS_FILLING',
    className: cls.className,
    classDescription: cls.classDescription,
    abilities: JSON.stringify(cls.abilities.slice(0, 1)),
    updatedAt: ctx.timestamp,
  };
  ctx.db.character_creation_state.id.update(revealed);

  const a = cls.abilities[0];
  writeCreationSegments(ctx, job.playerId, 'creation', keeperSegments(
    `${cls.classDescription || 'A unique class emerges.'}\n\n` +
    `**${cls.className}**\n\n` +
    `Your first ability:\n\n${a.name} — ${a.description}\n${abilityMechanicsLine(a)}\n\n` +
    CLASS_REVEAL_MILESTONE_LINE
  ));

  // Stage 2, in this same transaction: CLASS_FILLING with one pending job, or CLASS_FILL_ERROR when refused
  startClassFill(ctx, revealed);
}

/**
 * creation_class success (stage 2 of the class, Phase 43): the stats and the other abilities.
 *
 * Merges the reply with the stored reveal and clamps the result through validateClassReply (never
 * rejects a number; at most three abilities, the stage-1 ability first). Only a CLASS_FILLING state
 * is touched. A reply that is not JSON, or that adds no usable ability, fails the fill
 * (CLASS_FILL_ERROR) and leaves the reveal as it was: a class never reaches CLASS_REVEALED with only
 * the stage-1 ability.
 */
export function applyClassFillResult(ctx: any, job: ApplyJob, resultText: string): void {
  const s = creationStateForJob(ctx, job);
  if (!s || job.domain !== 'creation_class') return;

  let cls: ReturnType<typeof validateClassReply>;
  try {
    const stored = JSON.parse(String(s.abilities ?? ''));
    const first = Array.isArray(stored) ? stored[0] : undefined;
    if (first === null || typeof first !== 'object' || Array.isArray(first)) {
      throw new Error('class fill has no stored first ability');
    }
    const raw = extractJson(resultText);
    const extra = Array.isArray(raw?.abilities) ? raw.abilities : [];
    cls = validateClassReply(
      {
        className: s.className,
        classDescription: s.classDescription,
        stats: raw?.stats,
        abilities: [first, ...extra],
      },
      s.archetype ?? 'warrior',
    );
    if (cls.abilities.length < 2) throw new Error('class fill added no usable ability');
  } catch (parseErr) {
    console.error(`Creation LLM reply could not be parsed [creation_class]: ${errName(parseErr)}`);
    failClassFill(ctx, s, CLASS_FILL_FAILED_LINE);
    return;
  }

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
    abilityText += `\n[${a.name}] — ${a.description}\n${abilityMechanicsLine(a)}\n`;
  }

  writeCreationSegments(ctx, job.playerId, 'creation', keeperSegments(
    `${cls.classDescription || 'A unique class emerges.'}\n\n` +
    `**${cls.className}**\n${statLine} | ${armorLine}${weaponLine ? ` | ${weaponLine}` : ''} | ${resourceLine}` +
    abilityText +
    `\nChoose one. Type the name of the ability you wish to begin with. Choose wisely — or don't. Recklessness has its own entertainment value.` +
    `\n\n(If you're already regretting your choices, type "go back." Nobody will judge... much.)`
  ));
}

/**
 * world_gen_start success (stage 1 of world generation, Phase 43).
 *
 * Writes the region, its safe start location and the first NPC, connects the start location to the
 * source edge, places a still-unplaced character there and tells the player, then enqueues the
 * world_gen fill (stage 2) in the same transaction. The state is FILLING with one pending fill job,
 * or FILL_ERROR when that enqueue is refused (the stage-1 rows stay). Only a GENERATING state is
 * touched: a late or stale stage-1 result does nothing.
 */
export function applyWorldStartResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
  const genStateId = BigInt(context.genStateId);
  const currentGenState = ctx.db.world_gen_state.id.find(genStateId);
  if (!currentGenState || currentGenState.step !== 'GENERATING') return;

  let data: any;
  try {
    data = extractJson(resultText);
  } catch (parseErr) {
    console.error(`World gen reply could not be parsed [world_gen_start]: ${errName(parseErr)}`);
    failWorldGen(ctx, currentGenState,
      'The world tried to take shape but... it came out wrong.');
    return;
  }

  if (!data?.regionName || !data.startLocation?.name) {
    failWorldGen(ctx, currentGenState,
      'The world beyond is... incomplete.');
    return;
  }

  // For starter regions (sourceRegionId=0n), mark the region with the race so same-race chars reuse it
  const genCharacter = ctx.db.character.id.find(currentGenState.characterId);
  const starterRace = currentGenState.sourceRegionId === 0n && genCharacter?.race
    ? genCharacter.race.toLowerCase()
    : undefined;
  const { region, startLocation } = writeRegionStart(ctx, data, currentGenState, starterRace);

  // Record the region now, so the fill input can be read back from the stored rows
  ctx.db.world_gen_state.id.update({
    ...currentGenState,
    generatedRegionId: region.id,
    updatedAt: ctx.timestamp,
  });

  // Transform the source edge location into a normal passage now that it's been explored
  const sourceEdge = ctx.db.location.id.find(currentGenState.sourceLocationId);
  if (sourceEdge && sourceEdge.terrainType === 'uncharted') {
    ctx.db.location.id.update({
      ...sourceEdge,
      terrainType: 'passage',
      name: `The Passage to ${region.name || 'the Beyond'}`,
      description: `The mists have parted. What was once the edge of the known world is now a well-trodden path between regions. The air still carries a faint shimmer of remembered possibility.`,
    });
  }

  // Place character on the start location if they have no location (first region)
  const character = ctx.db.character.id.find(currentGenState.characterId);
  if (character && character.locationId === 0n) {
    ctx.db.character.id.update({
      ...ctx.db.character.id.find(character.id),
      locationId: startLocation.id,
      boundLocationId: startLocation.id,
    });
    // Visited places: the first spawn is the first place the character has stood in (no origin).
    markLocationVisited(ctx, character.id, startLocation.id);
    ensurePoolsForLocation(ctx, startLocation.id);

    const regionDesc = data.regionDescription || `A ${data.biome || 'mysterious'} region.`;
    const locationNpcs: { name: string; gender: NpcGender }[] = [];
    for (const npc of ctx.db.npc.by_location.filter(startLocation.id)) {
      locationNpcs.push({ name: npc.name, gender: npcGender(npc) });
    }

    let arrivalMsg = `You open your eyes in ${startLocation.name}, ${region.name}.\n\n${regionDesc}`;
    if (locationNpcs.length > 0) {
      arrivalMsg += '\n\n' + npcNoticeLine(locationNpcs);
    }
    arrivalMsg += `\n\nTry [look] to examine your surroundings. The roads out are still being remembered.`;
    writePrivateSegments(ctx, currentGenState.characterId, character.ownerUserId, 'narrative', keeperSegments(arrivalMsg));
  }

  // Read source region name for the World event message
  const sourceRegion = ctx.db.region.id.find(currentGenState.sourceRegionId);
  const sourceRegionName = sourceRegion?.name || 'the known world';

  appendWorldEvent(ctx, 'world',
    pickWorldEventMessage(sourceRegionName, data.biome || 'plains', ctx.timestamp.microsSinceUnixEpoch));

  if (character) {
    appendPrivateEvent(ctx, currentGenState.characterId, character.ownerUserId, 'system',
      pickDiscoveryMessage(region.name, ctx.timestamp.microsSinceUnixEpoch));
    appendPrivateEvent(ctx, currentGenState.characterId, character.ownerUserId, 'system',
      WORLD_START_MILESTONE_LINE);
  }

  // Stage 2, in this same transaction: FILLING with one pending job, or FILL_ERROR when refused
  startWorldFill(ctx, ctx.db.world_gen_state.id.find(genStateId));
}

/**
 * world_gen success (stage 2 of world generation, Phase 43): the rest of the region around the
 * stage-1 start location. Only a FILLING state is touched. A malformed reply, or one without a
 * locations array, fails the fill (FILL_ERROR) and leaves every stage-1 row as it was.
 */
export function applyWorldFillResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
  const genStateId = BigInt(context.genStateId);
  const currentGenState = ctx.db.world_gen_state.id.find(genStateId);
  if (!currentGenState || currentGenState.step !== 'FILLING') return;

  let data: any;
  try {
    data = extractJson(resultText);
  } catch (parseErr) {
    console.error(`World fill reply could not be parsed [world_gen]: ${errName(parseErr)}`);
    failWorldFill(ctx, currentGenState, WORLD_FILL_FAILED_MESSAGE);
    return;
  }
  if (!data || !Array.isArray(data.locations)) {
    failWorldFill(ctx, currentGenState, WORLD_FILL_FAILED_MESSAGE);
    return;
  }

  const region = currentGenState.generatedRegionId != null
    ? ctx.db.region.id.find(currentGenState.generatedRegionId)
    : undefined;
  const startLocation = region ? findRegionStart(ctx, region.id) : null;
  if (!region || !startLocation) {
    failWorldFill(ctx, currentGenState, WORLD_FILL_FAILED_MESSAGE);
    return;
  }

  writeRegionFill(ctx, data, currentGenState, region, startLocation);

  ctx.db.world_gen_state.id.update({
    ...currentGenState,
    step: 'COMPLETE',
    errorMessage: undefined,
    updatedAt: ctx.timestamp,
  });

  // Phase 51.3: chain the region economy job (only when the AI economy switch is on). The region_economy
  // row is the once-only lock; an economy bug never fails the fill. The region is read again: the fill
  // just wrote its faction, landmarks and threats.
  try {
    const filledRegion = ctx.db.region.id.find(region.id) ?? region;
    startRegionEconomy(ctx, filledRegion, { playerId: currentGenState.playerId, characterId: currentGenState.characterId });
  } catch (err) {
    console.error('Region economy start failed for region ' + region.id + ': ' + errName(err));
  }

  const character = ctx.db.character.id.find(currentGenState.characterId);
  if (character) {
    appendPrivateEvent(ctx, currentGenState.characterId, character.ownerUserId, 'system',
      worldFillCompleteLine(region.name));
  }
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
    // A JSON.parse message can quote the reply: log a fixed reason for that entry.
    const safeErrors = errors.map((e) => (e.startsWith('JSON parse error') ? 'reply could not be parsed' : e));
    console.error(`Skill gen produced ${skills.length} valid skills: ${safeErrors.join('; ')}`);
    writePrivateSegments(ctx, charId, character.ownerUserId, 'narrative', keeperFallback(
      'The cosmic machinery sputtered. Your potential remains... unformed. Type [skills] to try again.'));
    return;
  }

  insertPendingSkills(ctx, charId, skills, offerLevel);

  // Present the 3 skills with The Keeper's sardonic narration
  let presentation = `Something resembling interest stirs in the air.\n\n`;
  presentation += `Level ${offerLevel}. How quaint. The universe has deigned to offer you three new ways to embarrass yourself:\n`;

  for (const skill of skills) {
    presentation += `\n[${skill.name}] -- ${skill.description}\n`;
    const castLabel = skill.castSeconds > 0n ? `${skill.castSeconds}s cast` : 'instant';
    presentation += `  ${skill.kind} | ${skill.resourceCost} ${skill.resourceType} | ${castLabel} | ${skill.cooldownSeconds}s cooldown | ${skill.value1} power\n`;
  }

  presentation += `\nChoose wisely. Or don't. The rejected skills will dissolve into the void, never to return.`;

  writePrivateSegments(ctx, charId, character.ownerUserId, 'narrative', keeperSegments(presentation));
}

/** Whether an offer_quest effect gave a target name at all (any value but a missing or blank one). */
function hasTargetName(raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  return typeof raw !== 'string' || raw.trim() !== '';
}

/**
 * Whether a creature name is already used in the world (review B CR-01): an enemy template of that
 * name, or a family named like it or like the family a template of that name would form. Reads the
 * names once per call; the returned check is case-insensitive.
 */
function creatureNameTaken(ctx: any): (name: string) => boolean {
  const used = new Set<string>();
  for (const template of ctx.db.enemy_template.iter()) used.add(nameKey(String(template.name ?? '')));
  for (const family of ctx.db.creature_family.iter()) used.add(nameKey(String(family.name ?? '')));
  return (name: string) => used.has(nameKey(name)) || used.has(nameKey(nounsFromTemplateName(name).familyName));
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

  // Who may speak in a dialogue segment: the conversation NPC first, then the NPCs at the
  // character's location. Names come from the database, never from the model.
  const present: PresentSpeaker[] = [{ name: npc.name, id: npc.id }];
  if (typeof character.locationId === 'bigint' && character.locationId !== 0n) {
    for (const other of ctx.db.npc.by_location.filter(character.locationId)) {
      if (other.id !== npc.id) present.push({ name: other.name, id: other.id });
    }
  }
  const result = segmentsFromReply(resultText, {
    present,
    playerNames: [character.name],
    legacyDialogueSpeaker: { name: npc.name, id: npc.id },
    fallbackLine: `${npc.name} mutters something you cannot make out.`,
  });

  if (result.parsed === undefined) {
    // Fixed reason only: the reply (and a parse error quoting it) never reaches the log.
    console.error('NPC conversation [npc_conversation]: reply was not a JSON object');
    appendNpcDialog(ctx, charId, npc.id, `${npc.name} mutters something unintelligible.`);
    writePrivateSegments(ctx, charId, character.ownerUserId, 'npc',
      keeperFallback(`${npc.name} mutters something you cannot make out. (Try again.)`));
    return;
  }

  const data: any = result.parsed;
  const effects = Array.isArray(data.effects) ? data.effects : [];
  const memoryUpdate = data.memoryUpdate || {};
  const internalThought = data.internalThought || '';

  // Log NPC dialogue: the conversation NPC's own spoken text only
  const spoken = result.segments
    .filter((seg) => seg.kind === 'dialogue' && seg.speakerNpcId === npc.id)
    .map((seg) => seg.text)
    .join(' ');
  appendNpcDialog(ctx, charId, npc.id, `${npc.name}: "${spoken || '...'}"`);
  writePrivateSegments(ctx, charId, character.ownerUserId, 'npc', result.segments);

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

      // Phase 51.3.1.1 D-74: a kill or kill_loot quest is created only when its target lives in a creature
      // pool the player can reach in the region (resolveKillQuestTarget). An existing pooled member (or a
      // family named by the model, its front-liner) is the target; an unknown name becomes a family of one
      // pooled at the nearest hosting place; anything else skips this quest (no player line, D-58), while
      // the NPC's dialogue and the reply's other effects still apply.
      let killTarget: { templateId: bigint; placeId: bigint } | null = null;
      if (questType === 'kill' || questType === 'kill_loot') {
        // Review B WR-02: resolved from the quest giver's place, not from where the player stands when the
        // reply lands (the player may have moved, even to another region, since the talk was enqueued).
        const questPlaceId: bigint = npc.locationId;
        if (!ctx.db.location.id.find(questPlaceId)) {
          console.log(`offer_quest "${questName}": the quest giver's place is gone (D-74); quest skipped`);
          continue;
        }
        // Review B CR-01: the model's creature name is cleaned (1-3 plain words, no markup, digits or
        // instruction words) before it is resolved or stored; a name given but unusable skips the quest.
        const targetName = cleanQuestTargetName(effect.targetEnemyName);
        if (hasTargetName(effect.targetEnemyName) && targetName === '') {
          console.log(`offer_quest "${questName}": unusable target name (D-74); quest skipped`);
          continue;
        }
        const resolved = resolveKillQuestTarget(ctx, questPlaceId, targetName);
        if (!resolved) {
          console.log(`offer_quest "${questName}": no reachable creature pool (D-74); quest skipped`);
          continue;
        }
        if (resolved.kind === 'pooled') {
          killTarget = { templateId: resolved.templateId, placeId: resolved.placeId };
        } else {
          // The model invented the creature: a template with sensible defaults, linked here as before.
          // Its cleaned name is made unique against the world's creature and family names (review B CR-01).
          const inventedName = freeCreatureName(targetName, creatureNameTaken(ctx));
          const charLevel = Number(character.level);
          const newEt = ctx.db.enemy_template.insert({
            id: 0n,
            name: inventedName,
            role: 'melee',
            roleDetail: 'standard',
            abilityProfile: 'basic',
            terrainTypes: 'any',
            creatureType: inventedName.toLowerCase().includes('undead') ? 'undead' : 'beast',
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
          ctx.db.location_enemy_template.insert({
            id: 0n,
            locationId: questPlaceId,
            enemyTemplateId: newEt.id,
          });
          // D-54: its family of one, with its own Scarce pool at the resolved place.
          let family: any = null;
          try {
            family = familyOfOne(ctx, newEt, questPlaceId, ctx.timestamp.microsSinceUnixEpoch);
          } catch (err) {
            console.error('Quest family start failed for enemy ' + newEt.id + ': ' + errName(err));
          }
          const pooledThere =
            !!family &&
            [...ctx.db.place_pool.by_location.filter(resolved.placeId)].some(
              (pool: any) => pool.kind === 'creature' && pool.refId === family.id,
            );
          if (!pooledThere) {
            console.log(`offer_quest "${questName}": the invented target has no pool (D-74); quest skipped`);
            continue;
          }
          // Phase 51.3.1.1 (D-47, D-54): the family of one gets the same late family economy job as any
          // family in a designed region (switch on only).
          try {
            startFamilyLoot(ctx, family, family.regionId, { playerId: job.playerId, characterId: character.id });
          } catch (err) {
            console.error('Family loot start failed for family ' + family.id + ': ' + errName(err));
          }
          killTarget = { templateId: newEt.id, placeId: resolved.placeId };
        }
      }

      // Create QuestTemplate. Model-supplied numbers never throw: a fractional or non-finite
      // value is floored or replaced, and a zero reward keeps the level-based default.
      const defaultRewardXp = BigInt(Number(character.level) * 15 + 10);
      const suppliedXp = toBigIntSafe(effect.rewardXp, { min: 0n, max: 1_000_000n, fallback: defaultRewardXp });
      const questRewardXp = suppliedXp === 0n ? defaultRewardXp : suppliedXp;
      const qt = ctx.db.quest_template.insert({
        id: 0n,
        name: questName,
        npcId: npcIdVal,
        targetEnemyTemplateId: killTarget?.templateId ?? 0n,
        requiredCount: toBigIntSafe(effect.targetCount, { min: 1n, max: 1_000n, fallback: 1n }),
        minLevel: character.level,
        maxLevel: character.level + 5n,
        rewardXp: questRewardXp,
        questType,
        // D-74: a kill or kill_loot quest records its pool's place (the Map shows it as the goal).
        targetLocationId: killTarget?.placeId,
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

      // boss_kill: resolve targetEnemyName from the LLM against real enemy templates (kill and kill_loot
      // were resolved against the pools before the insert, D-74). A boss stays an individual (D-07).
      if (questType === 'boss_kill') {
        let resolvedEnemyTemplateId: bigint | null = null;

        // Review B CR-01: the same cleaning as kill and kill_loot; an unusable name reads as no name.
        const bossName = cleanQuestTargetName(effect.targetEnemyName);
        if (bossName) {
          const targetName = bossName.toLowerCase();

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
            const inventedBoss = freeCreatureName(bossName, creatureNameTaken(ctx));
            const charLevel = Number(character.level);
            const newEt = ctx.db.enemy_template.insert({
              id: 0n,
              name: inventedBoss,
              role: 'melee',
              roleDetail: 'standard',
              abilityProfile: 'basic',
              terrainTypes: 'any',
              creatureType: inventedBoss.toLowerCase().includes('undead') ? 'undead' : 'beast',
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
}

/** combat_narration success. */
export function applyCombatNarrationResult(ctx: any, job: ApplyJob, resultText: string): void {
  handleCombatNarrationResult(ctx, job, resultText, true);
}

/** renown_perk_gen success. */
export function applyRenownPerkResult(ctx: any, job: ApplyJob, resultText: string): void {
  const context = job.contextJson ? JSON.parse(job.contextJson) : {};
  const charId = BigInt(context.characterId);
  const rank = Number(context.rank) || 2;
  const character = ctx.db.character.id.find(charId);
  if (!character) return;

  // Ranks stay independent (CR-B01): never stack a second set of options on a rank that
  // already has pending options, and never re-offer a rank the character has claimed.
  if (renownRankSettled(ctx, charId, rank)) {
    console.error(`Renown perk result for character ${charId} rank ${rank} dropped: the rank is already offered or claimed`);
    return;
  }

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
      writePrivateSegments(ctx, charId, character.ownerUserId, 'narrative',
        keeperFallback('The cosmos shrugs and offers some... standard options for your consideration.'));
    }
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

  // Present options to the player
  let presentation = `Your renown has grown. The world takes notice.\n\n`;
  presentation += `Something resembling mild respect stirs in the air.\n\n`;
  presentation += `Rank ${rank}. The world owes you something. Choose your due:\n`;
  for (const perk of perksToInsert) {
    presentation += `\n[${perk.name}] -- ${perk.description}\n`;
    if (String(perk.kind || '').trim()) {
      presentation += `  Active ability | ${perk.resourceCost || 0} ${perk.resourceType || 'none'} | ${perk.cooldownSeconds || 0}s cooldown\n`;
    } else {
      presentation += `  Passive bonus\n`;
    }
  }
  presentation += `\nChoose wisely. Your reputation preceded you here. Don't let it down.`;

  writePrivateSegments(ctx, charId, character.ownerUserId, 'narrative', keeperSegments(presentation));
}

/** Success dispatcher. An unknown domain (for example smoke_test) does nothing. */
export function applyLlmResult(ctx: any, job: ApplyJob, resultText: string): void {
  if (job.domain === 'creation_race') {
    applyCreationResult(ctx, job, resultText);
  } else if (job.domain === 'creation_class_reveal') {
    applyClassRevealResult(ctx, job, resultText);
  } else if (job.domain === 'creation_class') {
    applyClassFillResult(ctx, job, resultText);
  } else if (job.domain === 'world_gen_start') {
    applyWorldStartResult(ctx, job, resultText);
  } else if (job.domain === 'world_gen') {
    applyWorldFillResult(ctx, job, resultText);
  } else if (job.domain === 'skill_gen') {
    applySkillGenResult(ctx, job, resultText);
  } else if (job.domain === 'npc_conversation') {
    applyNpcConversationResult(ctx, job, resultText);
  } else if (job.domain === 'combat_narration') {
    applyCombatNarrationResult(ctx, job, resultText);
  } else if (job.domain === 'renown_perk_gen') {
    applyRenownPerkResult(ctx, job, resultText);
  } else if (job.domain === 'region_economy') {
    // Silent background work: no player line on success.
    applyRegionEconomyResult(ctx, job, resultText);
  }
}
