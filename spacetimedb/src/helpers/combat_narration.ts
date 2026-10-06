/**
 * Combat narration (Phase 41, PIPE-07; Phase 46.1, RND-05): the end of the fight and its big moments.
 *
 * Phase 46.1 narrates big moments (kill, near death, phase change) through the same
 * combat_narration route: at most 3 per fight plus the end (the cap lives with the round
 * resolver), and rounds never wait for narration. The victory or defeat outro is enqueued once
 * per fight from handleVictory / handleDefeat, BEFORE the combat artifacts (participant rows) are
 * cleared, and carries the final round number. Each summary is snapshotted into the job's request,
 * so the executor never reads combat state later. Narration is lowest priority and can never touch
 * combat: the enqueue helpers catch every error, a refusal (daily cost, daily calls, phase cap) is
 * skipped silently, and the executor drops a narration that is older than 20 s.
 * handleCombatNarrationResult applies a reply of any narrativeType through one segment path.
 */

import { appendPrivateEvent } from './events';
import { enqueueLlmJob, resolveCharacterPlayerId, SOURCE_KEYS } from './llm_queue';
import { encodeRouteInput, decodeRouteInput } from './llm_inputs';
import { segmentsFromReply, flattenSegments, speakerKey } from './segments';
import type { PresentSpeaker } from './segments';
import { redactSecrets } from './measurement';

// ── Types ──

export type RoundEventSummary = {
  combatId: bigint;
  roundNumber: bigint;
  narrativeType: 'intro' | 'round' | 'kill' | 'near_death' | 'phase' | 'victory' | 'defeat';
  playerActions: Array<{
    characterName: string;
    actionType: string;
    abilityName?: string;
    targetName?: string;
    damageDealt?: bigint;
    healingDone?: bigint;
    wasCrit?: boolean;
    missed?: boolean;
    fled?: boolean;
    fleeSuccess?: boolean;
  }>;
  enemyActions: Array<{
    enemyName: string;
    abilityName?: string;
    targetName?: string;
    damageDealt?: bigint;
    healingDone?: bigint;
    wasCrit?: boolean;
  }>;
  effectsApplied: string[];
  effectsExpired: string[];
  deaths: string[];
  nearDeathNames: string[];
  hasCrit: boolean;
  hasKill: boolean;
  hasNearDeath: boolean;
  participantHpSummary: Array<{ name: string; hp: bigint; maxHp: bigint; isEnemy: boolean }>;
  // Extra context for prompts
  locationName?: string;
  enemyNames?: string[];
  playerNames?: string[];
  // Big-moment fields (strings and booleans only: no bigint revival path is needed)
  momentSubject?: string;      // name of the fallen enemy, the player near death or the enemy past half
  momentFirst?: boolean;       // kill only: it is the first death of the fight
  momentBossOrNamed?: boolean; // kill only: the fallen enemy is a boss or a named foe
};

/** The facts of one big moment, supplied by the round resolver (46.1-08) after detectMoment. */
export type CombatMomentFacts = {
  kind: 'kill' | 'near_death' | 'phase';
  roundNumber: bigint;
  subjectName: string;
  first?: boolean;
  bossOrNamed?: boolean;
  killerName?: string;   // kill only, a player character who landed the killing blow
  abilityName?: string;  // kill only, absent for an auto-attack
  damage?: bigint;       // kill only, damage of the killing action
};

// ── Shared enqueue ──

/** A participant at or below this share of max HP (percent) counts as near death. */
const NEAR_DEATH_PERCENT = 10n;

/**
 * The highest combat_round.roundNumber of a fight, 0n when it has no round rows. Never throws.
 */
export function finalCombatRound(ctx: any, combatId: bigint): bigint {
  try {
    let max = 0n;
    for (const row of ctx.db.combat_round.by_combat.filter(combatId)) {
      if (row.roundNumber > max) max = row.roundNumber;
    }
    return max;
  } catch {
    return 0n;
  }
}

/** The facts every summary shares: names, HP, who is down, the location. Reads characters fresh. */
function gatherFight(ctx: any, combat: any, participants: any[], enemies: any[]) {
  const deaths: string[] = [];
  const nearDeathNames: string[] = [];
  const playerNames: string[] = [];
  const participantHpSummary: RoundEventSummary['participantHpSummary'] = [];

  for (const p of participants) {
    const character = ctx.db.character.id.find(p.characterId);
    if (!character) continue;
    playerNames.push(character.name);
    participantHpSummary.push({ name: character.name, hp: character.hp, maxHp: character.maxHp, isEnemy: false });
    if (character.hp === 0n) deaths.push(character.name);
    else if (character.hp * 100n <= character.maxHp * NEAR_DEATH_PERCENT) nearDeathNames.push(character.name);
  }

  const enemyNames: string[] = [];
  for (const e of enemies) {
    enemyNames.push(e.displayName);
    participantHpSummary.push({ name: e.displayName, hp: e.currentHp, maxHp: e.maxHp, isEnemy: true });
    if (e.currentHp === 0n) deaths.push(e.displayName);
  }

  const location = ctx.db.location.id.find(combat.locationId);
  return { deaths, nearDeathNames, playerNames, enemyNames, participantHpSummary, locationName: location?.name };
}

function logNarrationSkipped(e: unknown): void {
  console.error('combat narration skipped: ' + redactSecrets(String(e)));
}

/**
 * Enqueue one combat_narration job. Never throws and never changes combat: any error is logged
 * (redacted) and swallowed, a refused enqueue (budget) is skipped silently, and nothing is written
 * with no participants or unless a leader's player resolves. Charged to the combat leader's player
 * (else the first participant's). The request fields are the keys handleCombatNarrationResult reads.
 */
function enqueueNarrationJob(
  ctx: any,
  combat: any,
  participants: any[],
  job: { narrativeType: string; roundNumber: bigint; sourceKey: string; buildSummary: () => RoundEventSummary },
): void {
  try {
    if (participants.length === 0) return;
    const leaderId = combat.leaderCharacterId ?? participants[0]?.characterId;
    if (leaderId === undefined) return;
    const leader = ctx.db.character.id.find(leaderId);
    if (!leader) return;
    const playerId = resolveCharacterPlayerId(ctx, leader);
    if (!playerId) return;

    const summary = job.buildSummary();
    // A refusal (result.refused) is deliberately ignored: narration is skipped silently.
    enqueueLlmJob(ctx, {
      route: 'combat_narration',
      playerId,
      characterId: leader.id,
      sourceKey: job.sourceKey,
      request: {
        combatId: combat.id.toString(),
        roundNumber: job.roundNumber.toString(),
        narrativeType: job.narrativeType,
        participantCharacterIds: participants.map((p: any) => p.characterId.toString()),
        input: encodeRouteInput(summary),
      },
    });
  } catch (e) {
    logNarrationSkipped(e);
  }
}

// ── Outro enqueue ──

/**
 * Snapshot of a finished fight for the outro prompt. Reads characters fresh (their HP is final
 * once handleVictory / handleDefeat has marked the dead) and the location by id. The round number
 * is the fight's final round (0 when it has no round rows).
 */
export function buildCombatOutroSummary(
  ctx: any,
  combat: any,
  participants: any[],
  enemies: any[],
  narrativeType: 'victory' | 'defeat',
): RoundEventSummary {
  const fight = gatherFight(ctx, combat, participants, enemies);
  return {
    combatId: combat.id,
    roundNumber: finalCombatRound(ctx, combat.id),
    narrativeType,
    playerActions: [],
    enemyActions: [],
    effectsApplied: [],
    effectsExpired: [],
    deaths: fight.deaths,
    nearDeathNames: fight.nearDeathNames,
    hasCrit: false,
    hasKill: fight.deaths.length > 0,
    hasNearDeath: fight.nearDeathNames.length > 0,
    participantHpSummary: fight.participantHpSummary,
    locationName: fight.locationName,
    enemyNames: fight.enemyNames,
    playerNames: fight.playerNames,
  };
}

/** Enqueue the outro narration for a finished fight (victory or defeat), tagged with its final round. */
export function enqueueCombatOutroNarration(
  ctx: any,
  combat: any,
  participants: any[],
  enemies: any[],
  narrativeType: 'victory' | 'defeat',
): void {
  try {
    const roundNumber = finalCombatRound(ctx, combat.id);
    enqueueNarrationJob(ctx, combat, participants, {
      narrativeType,
      roundNumber,
      sourceKey: SOURCE_KEYS.combatNarration(combat.id, roundNumber, narrativeType),
      buildSummary: () => buildCombatOutroSummary(ctx, combat, participants, enemies, narrativeType),
    });
  } catch (e) {
    logNarrationSkipped(e);
  }
}

// ── Big-moment enqueue ──

/**
 * Snapshot of one big moment (kill, near death, phase change) for the moment prompt. Same fight
 * facts as the outro; the moment fields carry the subject, and a kill with a known killer adds one
 * player action (the killing blow).
 */
export function buildCombatMomentSummary(
  ctx: any,
  combat: any,
  participants: any[],
  enemies: any[],
  facts: CombatMomentFacts,
): RoundEventSummary {
  const fight = gatherFight(ctx, combat, participants, enemies);
  const playerActions: RoundEventSummary['playerActions'] = [];
  if (facts.kind === 'kill' && facts.killerName) {
    playerActions.push({
      characterName: facts.killerName,
      actionType: facts.abilityName ? 'ability' : 'auto_attack',
      abilityName: facts.abilityName,
      targetName: facts.subjectName,
      damageDealt: facts.damage,
    });
  }
  return {
    combatId: combat.id,
    roundNumber: facts.roundNumber,
    narrativeType: facts.kind,
    playerActions,
    enemyActions: [],
    effectsApplied: [],
    effectsExpired: [],
    deaths: fight.deaths,
    nearDeathNames: fight.nearDeathNames,
    hasCrit: false,
    hasKill: facts.kind === 'kill',
    hasNearDeath: facts.kind === 'near_death',
    participantHpSummary: fight.participantHpSummary,
    locationName: fight.locationName,
    enemyNames: fight.enemyNames,
    playerNames: fight.playerNames,
    momentSubject: facts.subjectName,
    momentFirst: Boolean(facts.first),
    momentBossOrNamed: Boolean(facts.bossOrNamed),
  };
}

/**
 * Enqueue the narration of one big moment, keyed on the combat, the real round and the kind (so the
 * same moment is never narrated twice). Fire and forget: never throws, a refusal is silent.
 */
export function enqueueCombatMomentNarration(
  ctx: any,
  combat: any,
  participants: any[],
  enemies: any[],
  facts: CombatMomentFacts,
): void {
  try {
    enqueueNarrationJob(ctx, combat, participants, {
      narrativeType: facts.kind,
      roundNumber: facts.roundNumber,
      sourceKey: SOURCE_KEYS.combatNarration(combat.id, facts.roundNumber, facts.kind),
      buildSummary: () => buildCombatMomentSummary(ctx, combat, participants, enemies, facts),
    });
  } catch (e) {
    logNarrationSkipped(e);
  }
}

// ── Result Handler ──

/** A paragraph in which the model talks about its own draft instead of narrating. */
const SELF_CORRECTION_RE =
  /^\s*(wait|note|correction|edit|revised|revision)\b[\s:,.!-]|\b(corrected|revised|fixed) (below|version|text)\b|\b(the|these) (rules|instructions) (forbid|say|require)/i;

/**
 * Plain-prose narration can leak a self-check ("Wait: that uses their... Corrected below.")
 * followed by a second draft. Keep only the text after the last such paragraph; when the
 * marker is the final paragraph, keep the text before it. Clean text comes back unchanged.
 */
export function stripNarrationSelfCorrection(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  let last = -1;
  paragraphs.forEach((p, i) => {
    if (SELF_CORRECTION_RE.test(p)) last = i;
  });
  if (last === -1) return text.trim();
  const after = paragraphs.slice(last + 1);
  const kept = after.length > 0 ? after : paragraphs.slice(0, last);
  return kept.filter((p) => !SELF_CORRECTION_RE.test(p)).join('\n\n');
}

/** Same text as the skipped-narration line; wording is an owner decision (46-06). */
export const COMBAT_NARRATION_FALLBACK_LINE = 'The skirmish carries on, and none of it is worth the ink.';

/**
 * Who may speak in a combat dialogue segment, and which names are the player's. Total: never throws.
 * Enemy display names come from the server-written request snapshot (no id); NPCs are read from the
 * database at the first participant's location (with id), so no speaker is ever taken from model text.
 */
export function combatPresentSpeakers(
  ctx: any,
  context: Record<string, any>,
): { present: PresentSpeaker[]; playerNames: string[] } {
  const present: PresentSpeaker[] = [];
  const playerNames: string[] = [];
  try {
    const decoded: any = decodeRouteInput('combat_narration', context?.input);
    const seen = new Set<string>();
    for (const name of Array.isArray(decoded?.enemyNames) ? decoded.enemyNames : []) {
      if (typeof name !== 'string') continue;
      const key = speakerKey(name);
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      present.push({ name });
    }
    for (const name of Array.isArray(decoded?.playerNames) ? decoded.playerNames : []) {
      if (typeof name === 'string') playerNames.push(name);
    }
  } catch {
    // a bad snapshot leaves the lists as they are
  }
  try {
    let locationId: bigint | undefined;
    const ids: unknown[] = Array.isArray(context?.participantCharacterIds) ? context.participantCharacterIds : [];
    for (const idStr of ids) {
      let character: any;
      try {
        character = ctx.db.character.id.find(BigInt(idStr as any));
      } catch {
        continue;
      }
      if (!character) continue;
      if (typeof character.name === 'string') playerNames.push(character.name);
      if (locationId === undefined && typeof character.locationId === 'bigint' && character.locationId !== 0n) {
        locationId = character.locationId;
      }
    }
    if (locationId !== undefined) {
      for (const npc of ctx.db.npc.by_location.filter(locationId)) {
        present.push({ name: npc.name, id: npc.id });
      }
    }
  } catch {
    // the allow-list keeps what was gathered
  }
  return { present, playerNames };
}

/**
 * Handle the LLM result for combat narration domain (every narrativeType alike).
 * Normalizes the reply to segments, inserts the CombatNarrative row with the flattened text and
 * broadcasts the segments to all participants. A failed job stays silent; a successful reply that
 * yields nothing usable stores one Keeper fallback line.
 */
export function handleCombatNarrationResult(
  ctx: any,
  task: any,
  resultText: string,
  success: boolean,
): void {
  const context = task.contextJson ? JSON.parse(task.contextJson) : {};
  const combatId = BigInt(context.combatId || '0');
  const roundNumber = BigInt(context.roundNumber || '0');
  const narrativeType: string = context.narrativeType || 'round';
  const participantCharacterIds: string[] = context.participantCharacterIds || [];

  if (!success) {
    return;
  }

  const { present, playerNames } = combatPresentSpeakers(ctx, context);
  const result = segmentsFromReply(resultText, {
    present,
    playerNames,
    fallbackLine: COMBAT_NARRATION_FALLBACK_LINE,
    legacyNarrativeField: true,
    salvageProse: true,
    cleanProse: stripNarrationSelfCorrection,
  });
  const text = flattenSegments(result.segments);

  // Insert CombatNarrative row
  ctx.db.combat_narrative.insert({
    id: 0n,
    combatId,
    roundNumber,
    narrativeText: text,
    narrativeType,
    createdAt: ctx.timestamp,
  });

  // Broadcast to all participant characters
  for (const charIdStr of participantCharacterIds) {
    const charId = BigInt(charIdStr);
    const character = ctx.db.character.id.find(charId);
    if (!character) continue;
    appendPrivateEvent(ctx, charId, character.ownerUserId, 'combat_narration', text, result.segments);
  }

  // Note: intro narration now uses static messages (no LLM), so no intro handling here
}

/**
 * Send a fallback message when narration was skipped due to budget exhaustion
 * for victory/defeat moments. Called once per combat.
 */
export function sendNarrationSkippedMessage(
  ctx: any,
  combatId: bigint,
  participants: any[],
): void {
  for (const p of participants) {
    const character = ctx.db.character.id.find(p.characterId);
    if (!character) continue;
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', COMBAT_NARRATION_FALLBACK_LINE);
  }
}
