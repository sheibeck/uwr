// Pronoun and tone check on the REAL replies the live-proof harness observes (Plan 44-05; the Phase 41 deferred
// item). Pure: no I/O, no SDK, no secrets. The golden mechanical rules judge a pseudo item built from what the
// harness saw, and only rule ids come back, never text.
//
// Rule ids reported: keeper_pronoun, npc_gender_mismatch, player_pronoun, lone_player_named, meta_commentary.
// Everything else evaluateGoldenItem can say (schema, range, structure) is not judged here, because an observed
// line is already applied game text, not the raw model reply.

import { evaluateGoldenItem } from './golden_rules.mjs';

/** The only rule ids this module ever reports. */
export const OBSERVED_RULE_IDS = Object.freeze([
  'keeper_pronoun',
  'npc_gender_mismatch',
  'player_pronoun',
  'lone_player_named',
  'meta_commentary',
]);

/** Kinds of observed text, with the golden route each is judged as. */
export const OBSERVED_KINDS = Object.freeze(['npc_line', 'npc_description', 'region_text', 'outro']);

const isGender = (g) => g === 'male' || g === 'female';

/**
 * Judge one observed text. `kind` is one of OBSERVED_KINDS; `info` carries what the harness knows:
 *   npc_line / npc_description: { npcGender } (npc_description checks the stored gender against the pronouns
 *                               the description uses, the same rule as an NPC's private thought)
 *   region_text:                {} (Keeper pronoun and tone only)
 *   outro:                      { loneBeast, playerName, enemyNames } (a lone character fighting beasts: the
 *                               player is "you", never named, and plural pronouns need a beast to refer to)
 * Returns the matching rule ids in OBSERVED_RULE_IDS order. Never throws; an unknown kind or empty text gives [].
 */
export function observedRuleIds(kind, text, info = {}) {
  const value = typeof text === 'string' ? text : '';
  if (!OBSERVED_KINDS.includes(kind) || value.trim() === '') return [];
  const i = info !== null && typeof info === 'object' ? info : {};

  let item;
  let body = value;
  if (kind === 'npc_line') {
    item = { route: 'npc_conversation', expectations: { npcGender: isGender(i.npcGender) ? i.npcGender : undefined } };
  } else if (kind === 'npc_description') {
    // The gender rule reads the pronouns of internalThought, so the description is judged in that slot.
    item = { route: 'npc_conversation', expectations: { npcGender: isGender(i.npcGender) ? i.npcGender : undefined } };
    body = JSON.stringify({ internalThought: value });
  } else if (kind === 'outro') {
    item = {
      route: 'combat_narration',
      expectations: {
        loneBeastOutro: i.loneBeast === true,
        playerName: typeof i.playerName === 'string' ? i.playerName : undefined,
        enemyNames: Array.isArray(i.enemyNames) ? i.enemyNames.map(String) : [],
      },
    };
  } else {
    item = { route: 'combat_narration', expectations: {} };
  }

  const result = evaluateGoldenItem(item, { ok: true, failureClass: null, stopReason: 'end_turn', text: body, usage: {} });
  return OBSERVED_RULE_IDS.filter((id) => result.failures.includes(id));
}
