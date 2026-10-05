/**
 * Combat narration (Phase 41, PIPE-07): a victory or defeat outro only.
 *
 * Combat is real-time (no round hook), so narration is enqueued once per fight from
 * handleVictory / handleDefeat, BEFORE the combat artifacts (participant rows) are cleared.
 * The outro summary is snapshotted into the job's request, so the executor never reads combat
 * state later. Narration is lowest priority and can never touch combat: enqueueCombatOutroNarration
 * catches every error, a refusal (daily cost, daily calls, phase cap) is skipped silently, and the
 * executor drops a narration that is older than 20 s. handleCombatNarrationResult applies a reply.
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
  narrativeType: 'intro' | 'round' | 'victory' | 'defeat';
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
};

// ── Outro enqueue ──

/** A participant at or below this share of max HP (percent) counts as near death. */
const NEAR_DEATH_PERCENT = 10n;

/**
 * Snapshot of a finished fight for the outro prompt. Reads characters fresh (their HP is final
 * once handleVictory / handleDefeat has marked the dead) and the location by id.
 */
export function buildCombatOutroSummary(
  ctx: any,
  combat: any,
  participants: any[],
  enemies: any[],
  narrativeType: 'victory' | 'defeat',
): RoundEventSummary {
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
  return {
    combatId: combat.id,
    roundNumber: 0n,
    narrativeType,
    playerActions: [],
    enemyActions: [],
    effectsApplied: [],
    effectsExpired: [],
    deaths,
    nearDeathNames,
    hasCrit: false,
    hasKill: deaths.length > 0,
    hasNearDeath: nearDeathNames.length > 0,
    participantHpSummary,
    locationName: location?.name,
    enemyNames,
    playerNames,
  };
}

/**
 * Enqueue the outro narration for a finished fight. Never throws and never changes combat: any
 * error is logged (redacted) and swallowed, a refused enqueue (budget) is skipped silently, and
 * nothing is written unless a leader's player resolves. Charged to the combat leader's player
 * (else the first participant's).
 */
export function enqueueCombatOutroNarration(
  ctx: any,
  combat: any,
  participants: any[],
  enemies: any[],
  narrativeType: 'victory' | 'defeat',
): void {
  try {
    const leaderId = combat.leaderCharacterId ?? participants[0]?.characterId;
    if (leaderId === undefined) return;
    const leader = ctx.db.character.id.find(leaderId);
    if (!leader) return;
    const playerId = resolveCharacterPlayerId(ctx, leader);
    if (!playerId) return;

    const summary = buildCombatOutroSummary(ctx, combat, participants, enemies, narrativeType);
    // A refusal (result.refused) is deliberately ignored: narration is skipped silently.
    enqueueLlmJob(ctx, {
      route: 'combat_narration',
      playerId,
      characterId: leader.id,
      sourceKey: SOURCE_KEYS.combatNarration(combat.id, 0, narrativeType),
      request: {
        combatId: combat.id.toString(),
        roundNumber: '0',
        narrativeType,
        participantCharacterIds: participants.map((p: any) => p.characterId.toString()),
        input: encodeRouteInput(summary),
      },
    });
  } catch (e) {
    console.error('combat narration skipped: ' + redactSecrets(String(e)));
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
export const COMBAT_NARRATION_FALLBACK_LINE = 'The Keeper of Knowledge has lost interest in your skirmish.';

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
