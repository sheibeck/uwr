// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/proof_observed.test.mjs
// The pronoun and tone check the live-proof harness applies to real replies. Pure; no network, no key.

import { describe, expect, it } from 'vitest';

import { OBSERVED_KINDS, OBSERVED_RULE_IDS, observedRuleIds } from './proof_observed.mjs';
import { GOLDEN_RULES } from './golden_rules.mjs';

describe('observedRuleIds', () => {
  it('reports only ids the golden rules define', () => {
    for (const id of OBSERVED_RULE_IDS) expect(GOLDEN_RULES).toContain(id);
  });

  it('a clean region text, NPC line and outro report nothing', () => {
    expect(observedRuleIds('region_text', 'Mist lies thick over the reeds, and the old Keeper of Knowledge forgets nothing.')).toEqual([]);
    expect(observedRuleIds('npc_line', 'Aye, the ferry runs at dusk, if the river lets it.', { npcGender: 'male' })).toEqual([]);
    expect(
      observedRuleIds('outro', 'You stand over the hound as the marsh goes quiet.', { loneBeast: true, playerName: 'Brenna', enemyNames: ['Gravel Hound'] }),
    ).toEqual([]);
  });

  it('the Keeper called it or they is keeper_pronoun, in every kind', () => {
    const line = 'The Keeper pauses, and then they remember the place.';
    for (const kind of ['region_text', 'npc_line', 'outro']) {
      expect(observedRuleIds(kind, line, {})).toContain('keeper_pronoun');
    }
    expect(observedRuleIds('region_text', 'The Keeper pauses, and then he remembers the place.')).toEqual([]);
  });

  it('a lone-beast outro that calls the player he, they or by name is flagged', () => {
    const info = { loneBeast: true, playerName: 'Brenna', enemyNames: ['Gravel Hound'] };
    expect(observedRuleIds('outro', 'He wipes the blade clean.', info)).toContain('player_pronoun');
    expect(observedRuleIds('outro', 'They stagger back from the fight.', info)).toContain('player_pronoun');
    expect(observedRuleIds('outro', 'Brenna stands over the hound.', info)).toContain('lone_player_named');
  });

  it('plural pronouns for the beasts are not flagged when a beast is named in the sentence', () => {
    const info = { loneBeast: true, playerName: 'Brenna', enemyNames: ['Gravel Hound'] };
    expect(observedRuleIds('outro', 'The hounds fall, and their howls thin out over the marsh.', info)).toEqual([]);
  });

  it('the player rules apply only to a declared lone-beast outro', () => {
    expect(observedRuleIds('outro', 'He wipes the blade clean.', { loneBeast: false, playerName: 'Brenna' })).toEqual([]);
  });

  it('an NPC description whose pronouns contradict the stored gender is npc_gender_mismatch', () => {
    const desc = 'Marta keeps the ferry. She ties her knots tight and her tongue tighter.';
    expect(observedRuleIds('npc_description', desc, { npcGender: 'male' })).toContain('npc_gender_mismatch');
    expect(observedRuleIds('npc_description', desc, { npcGender: 'female' })).toEqual([]);
    expect(observedRuleIds('npc_description', desc, {})).toEqual([]);
  });

  it('returns ids in the fixed order and never any text', () => {
    const ids = observedRuleIds('outro', 'He sees Brenna. The Keeper and its eyes watch.', {
      loneBeast: true,
      playerName: 'Brenna',
      enemyNames: [],
    });
    expect(ids).toEqual(OBSERVED_RULE_IDS.filter((id) => ids.includes(id)));
    for (const id of ids) expect(OBSERVED_RULE_IDS).toContain(id);
  });

  it('empty, non-string and unknown-kind input gives no ids and does not throw', () => {
    expect(observedRuleIds('region_text', '')).toEqual([]);
    expect(observedRuleIds('region_text', undefined)).toEqual([]);
    expect(observedRuleIds('region_text', '   ')).toEqual([]);
    expect(observedRuleIds('nonsense', 'The Keeper and their eyes.')).toEqual([]);
    expect(observedRuleIds('outro', 'x', null)).toEqual([]);
  });

  it('knows its kinds', () => {
    expect([...OBSERVED_KINDS]).toEqual(['npc_line', 'npc_description', 'region_text', 'outro']);
  });
});
