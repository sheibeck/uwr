/**
 * Combat narration helpers: qualification logic, LLM task creation, result handling.
 * Wires the LLM narration pipeline into the round-based combat engine.
 */

import { MAX_COMBAT_NARRATIONS, NARRATION_BUDGET_THRESHOLD } from '../data/combat_constants';
import { checkBudget, incrementBudget } from './llm';
import { appendPrivateEvent } from './events';
import { scheduleCombatTick } from './combat';
import {
  buildCombatNarrationPrompt,
  buildCombatRoundUserPrompt,
  buildCombatIntroUserPrompt,
  buildCombatOutroUserPrompt,
} from '../data/llm_prompts';

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

// ── Qualification ──

/**
 * Determine if a round qualifies for LLM narration.
 * - intro/victory/defeat always narrate if budget allows
 * - mid-combat rounds only narrate on key events (crit, kill, near-death) and within narration cap
 */
export function shouldNarrateRound(
  narrativeType: 'intro' | 'round' | 'victory' | 'defeat',
  narrationCount: bigint,
  remainingBudget: number,
  hasCrit: boolean,
  hasKill: boolean,
  hasNearDeath: boolean,
): boolean {
  // No budget at all -- skip
  if (remainingBudget <= 0) return false;

  // Intro, victory, defeat always qualify if budget allows
  if (narrativeType !== 'round') return true;

  // Mid-combat: cap check
  if (narrationCount >= MAX_COMBAT_NARRATIONS) return false;

  // Mid-combat: budget threshold check
  if (BigInt(remainingBudget) < NARRATION_BUDGET_THRESHOLD) return false;

  // Mid-combat: only on key events
  return hasCrit || hasKill || hasNearDeath;
}

// ── Trigger ──

/**
 * Attempt to trigger LLM narration for a combat round.
 * Handles budget rotation, qualification check, and LlmTask creation.
 *
 * Budget is charged once per combat (on intro only). Outro narration
 * (victory/defeat) is free — it still checks budget but does not decrement it.
 */
export function triggerCombatNarration(
  ctx: any,
  combat: any,
  round: any,
  events: RoundEventSummary,
): void {
  const narrationCount = round.narrationCount ?? 0n;

  // Get all active combat participants for budget rotation
  const participants = [...ctx.db.combat_participant.by_combat.filter(combat.id)]
    .filter((p: any) => p.status === 'active' || p.status === 'dead' || p.status === 'fled');
  if (participants.length === 0) return;

  // Round-robin: charge index cycles through participants
  const chargeIndex = Number(narrationCount % BigInt(participants.length));
  const chargedParticipant = participants[chargeIndex];
  if (!chargedParticipant) return;

  const character = ctx.db.character.id.find(chargedParticipant.characterId);
  if (!character) return;

  // Find the player identity for budget checking
  // Player table has no userId index, so iterate to find matching player
  let chargedPlayerIdentity: any = null;
  for (const p of ctx.db.player.iter()) {
    if (p.userId === character.ownerUserId) {
      chargedPlayerIdentity = p.id;
      break;
    }
  }
  if (!chargedPlayerIdentity) return;

  // Budget check
  const budget = checkBudget(ctx, chargedPlayerIdentity);

  // Qualification check
  if (!shouldNarrateRound(
    events.narrativeType,
    narrationCount,
    budget.remaining,
    events.hasCrit,
    events.hasKill,
    events.hasNearDeath,
  )) return;

  if (!budget.allowed) return;

  // Only charge budget for intro narration (1 credit per combat, not 2)
  if (events.narrativeType === 'intro') {
    incrementBudget(ctx, chargedPlayerIdentity);
  }

  // Build context for the system prompt
  const contextParts: string[] = [];
  if (events.locationName) contextParts.push(`Location: ${events.locationName}`);
  if (events.playerNames?.length) contextParts.push(`Players: ${events.playerNames.join(', ')}`);
  if (events.enemyNames?.length) contextParts.push(`Enemies: ${events.enemyNames.join(', ')}`);
  contextParts.push(`Round: ${events.roundNumber}`);
  const contextString = contextParts.join('\n');

  // Build prompts
  const systemPrompt = buildCombatNarrationPrompt(contextString);
  let userPrompt: string;
  if (events.narrativeType === 'intro') {
    userPrompt = buildCombatIntroUserPrompt(
      events.enemyNames || [],
      events.playerNames || [],
      events.locationName || 'an unknown place',
    );
  } else if (events.narrativeType === 'victory' || events.narrativeType === 'defeat') {
    userPrompt = buildCombatOutroUserPrompt(events, events.narrativeType === 'victory');
  } else {
    userPrompt = buildCombatRoundUserPrompt(events);
  }

  // Collect participant character IDs for broadcast on result
  const participantCharacterIds = participants.map((p: any) => String(p.characterId));

  // Insert LlmTask
  ctx.db.llm_task.insert({
    id: 0n,
    playerId: chargedPlayerIdentity,
    domain: 'combat_narration',
    model: 'gpt-5-mini',
    systemPrompt,
    userPrompt,
    maxTokens: 400n,
    status: 'pending',
    contextJson: JSON.stringify({
      combatId: String(events.combatId),
      roundNumber: String(events.roundNumber),
      narrativeType: events.narrativeType,
      participantCharacterIds,
    }),
    createdAt: ctx.timestamp,
  });

  // Increment narration count on the round (only if a real round row exists)
  if (round.id) {
    const currentRound = ctx.db.combat_round.id.find(round.id);
    if (currentRound) {
      ctx.db.combat_round.id.update({
        ...currentRound,
        narrationCount: (currentRound.narrationCount ?? 0n) + 1n,
      });
    }
  }
}

// ── Result Handler ──

/**
 * Handle the LLM result for combat narration domain.
 * Parses the narrative, inserts CombatNarrative row, broadcasts to all participants.
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
    // For intro narration failure, start combat anyway
    if (narrativeType === 'intro') {
      if (combatId > 0n) {
        scheduleCombatTick(ctx, combatId);
      }
    }
    return;
  }

  // Parse the result JSON -- extract narrative field with brace extraction fallback
  let narrative: string;
  try {
    let text = resultText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
    const data = JSON.parse(text);
    narrative = data.narrative || text;
  } catch {
    // If JSON parse fails, use raw text as narrative
    narrative = resultText.trim();
  }

  if (!narrative || narrative.length === 0) return;

  // Insert CombatNarrative row
  ctx.db.combat_narrative.insert({
    id: 0n,
    combatId,
    roundNumber,
    narrativeText: narrative,
    narrativeType,
    createdAt: ctx.timestamp,
  });

  // Prefix round narrations with round number for temporal context
  const prefix = narrativeType === 'round' ? `[Round ${roundNumber}] ` : '';

  // Broadcast to all participant characters
  for (const charIdStr of participantCharacterIds) {
    const charId = BigInt(charIdStr);
    const character = ctx.db.character.id.find(charId);
    if (!character) continue;
    appendPrivateEvent(ctx, charId, character.ownerUserId, 'combat_narration', prefix + narrative);
  }

  // Intro flavor: add a System settling-in message and start combat loop
  if (narrativeType === 'intro') {
    for (const charIdStr of participantCharacterIds) {
      const charId = BigInt(charIdStr);
      const character = ctx.db.character.id.find(charId);
      if (!character) continue;
      appendPrivateEvent(ctx, charId, character.ownerUserId, 'system',
        'The System settles in to watch.');
    }

    // Start combat loop now that intro narration is displayed
    scheduleCombatTick(ctx, combatId);
  }
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
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
      'The System has lost interest in your skirmish.');
  }
}
