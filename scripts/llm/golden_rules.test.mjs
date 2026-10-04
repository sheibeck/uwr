// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_rules.test.mjs
// The golden set (Phase 44, Plan 44-01): set integrity, then the mechanical rules. Nothing here touches the
// network, a key or a token.

import { describe, expect, it } from 'vitest';

import {
  GOLDEN_ADVERSARIAL_COUNT,
  GOLDEN_IDS,
  GOLDEN_ROUTE_COUNTS,
  GOLDEN_SET,
  goldenInputFor,
  goldenItem,
  renderGoldenTable,
} from './golden_set.mjs';
import { SWEEP_FIXTURES } from './sweep_fixtures.mjs';
import { PLAYER_INPUT_TAG_PATTERN, buildRouteLayers } from '../../spacetimedb/src/data/llm_layers.ts';
import { assertValidClaudeBody, buildClaudeRequest } from '../../spacetimedb/src/helpers/claude_request.ts';

// ---------------------------------------------------------------------------
// Golden set integrity
// ---------------------------------------------------------------------------

describe('golden set integrity', () => {
  const benign = GOLDEN_SET.filter((i) => i.kind === 'benign');
  const adversarial = GOLDEN_SET.filter((i) => i.kind === 'adversarial');

  it('holds 27 unique ids with the per-route counts and exactly 5 adversarial items', () => {
    expect(GOLDEN_SET).toHaveLength(27);
    expect(new Set(GOLDEN_IDS).size).toBe(27);
    expect(GOLDEN_IDS).toEqual(GOLDEN_SET.map((i) => i.id));
    expect(GOLDEN_ADVERSARIAL_COUNT).toBe(5);
    expect(adversarial).toHaveLength(5);
    expect(benign).toHaveLength(22);

    const count = (routes) => benign.filter((i) => routes.includes(i.route)).length;
    expect(count(['npc_conversation'])).toBe(6);
    expect(count(['creation_race', 'creation_class_reveal', 'creation_class'])).toBe(5);
    expect(count(['world_gen_start', 'world_gen'])).toBe(4);
    expect(count(['skill_gen'])).toBe(3);
    expect(count(['renown_perk_gen'])).toBe(2);
    expect(count(['combat_narration'])).toBe(2);

    for (const [route, n] of Object.entries(GOLDEN_ROUTE_COUNTS)) {
      expect(benign.filter((i) => i.route === route), route).toHaveLength(n);
    }
    expect(Object.values(GOLDEN_ROUTE_COUNTS).reduce((a, b) => a + b, 0)).toBe(22);
  });

  it('keeps the id scheme and puts the adversarial items last', () => {
    expect(GOLDEN_IDS).toEqual([
      'npc-01', 'npc-02', 'npc-03', 'npc-04', 'npc-05', 'npc-06',
      'cre-01', 'cre-02', 'cre-03', 'cre-04', 'cre-05',
      'wld-01', 'wld-02', 'wld-03', 'wld-04',
      'skl-01', 'skl-02', 'skl-03',
      'ren-01', 'ren-02',
      'cmb-01', 'cmb-02',
      'adv-1', 'adv-2', 'adv-3', 'adv-4', 'adv-5',
    ]);
  });

  it('runs every chained item after its source item', () => {
    const chained = GOLDEN_SET.filter((i) => i.chain);
    expect(chained.map((i) => i.id)).toEqual(['cre-05', 'wld-03', 'wld-04']);
    for (const item of chained) {
      expect(GOLDEN_IDS.indexOf(item.chain.from), item.id).toBeGreaterThanOrEqual(0);
      expect(GOLDEN_IDS.indexOf(item.chain.from), item.id).toBeLessThan(GOLDEN_IDS.indexOf(item.id));
    }
    expect(goldenItem('cre-05').chain.from).toBe('cre-03');
    expect(goldenItem('wld-03').chain.from).toBe('wld-01');
    expect(goldenItem('wld-04').chain.from).toBe('wld-02');
  });

  it('is deeply frozen: mutating an item throws in strict mode', () => {
    'use strict';
    expect(Object.isFrozen(GOLDEN_SET)).toBe(true);
    expect(Object.isFrozen(GOLDEN_IDS)).toBe(true);
    for (const item of GOLDEN_SET) {
      expect(Object.isFrozen(item), item.id).toBe(true);
      expect(Object.isFrozen(item.expectations), item.id).toBe(true);
      expect(() => {
        item.summary = 'changed';
      }, item.id).toThrow(TypeError);
      expect(() => {
        item.expectations.extra = true;
      }, item.id).toThrow(TypeError);
    }
    expect(() => GOLDEN_SET.push({})).toThrow(TypeError);
  });

  it('reuses the sweep fixtures by reference instead of copying them', () => {
    expect(goldenItem('npc-01').input).toBe(SWEEP_FIXTURES.npc_conversation[0]);
    expect(goldenItem('npc-05').input).toBe(SWEEP_FIXTURES.npc_conversation[4]);
    expect(goldenItem('cre-01').input).toBe(SWEEP_FIXTURES.creation_race[0]);
    expect(goldenItem('cre-02').input).toBe(SWEEP_FIXTURES.creation_race[3]);
    expect(goldenItem('cre-03').input).toBe(SWEEP_FIXTURES.creation_class_reveal[0]);
    expect(goldenItem('cre-04').input).toBe(SWEEP_FIXTURES.creation_class_reveal[1]);
    expect(goldenItem('wld-01').input).toBe(SWEEP_FIXTURES.world_gen_start[0]);
    expect(goldenItem('wld-02').input).toBe(SWEEP_FIXTURES.world_gen_start[1]);
    expect(goldenItem('skl-01').input).toBe(SWEEP_FIXTURES.skill_gen[2]);
    expect(goldenItem('skl-02').input).toBe(SWEEP_FIXTURES.skill_gen[1]);
    expect(goldenItem('skl-03').input).toBe(SWEEP_FIXTURES.skill_gen[3]);
    expect(goldenItem('ren-01').input).toBe(SWEEP_FIXTURES.renown_perk_gen[0]);
    expect(goldenItem('ren-02').input).toBe(SWEEP_FIXTURES.renown_perk_gen[3]);
    expect(goldenItem('cmb-01').input).toBe(SWEEP_FIXTURES.combat_narration[0]);
    expect(goldenItem('cmb-02').input).toBe(SWEEP_FIXTURES.combat_narration[3]);
  });

  it('covers the intended shapes: skill levels 2, 5, 8; rank 2 with no perks and rank 5 with two; NPC genders and tiers', () => {
    expect(['skl-01', 'skl-02', 'skl-03'].map((id) => goldenItem(id).input.level)).toEqual([2n, 5n, 8n]);
    expect(goldenItem('ren-01').input.rank).toBe(2);
    expect(goldenItem('ren-01').input.existingPerks).toHaveLength(0);
    expect(goldenItem('ren-02').input.rank).toBe(5);
    expect(goldenItem('ren-02').input.existingPerks).toHaveLength(2);

    const npcGenders = ['npc-01', 'npc-02', 'npc-03', 'npc-04', 'npc-05', 'npc-06'].map((id) => goldenItem(id).expectations.npcGender);
    expect(npcGenders).toEqual(['female', 'male', 'male', 'female', 'male', 'female']);
    for (const id of ['npc-01', 'npc-02', 'npc-03', 'npc-04', 'npc-05', 'npc-06']) {
      expect(goldenItem(id).input.npc.gender, id).toBe(goldenItem(id).expectations.npcGender);
    }
    expect(['npc-01', 'npc-02', 'npc-03', 'npc-04', 'npc-05'].map((id) => goldenItem(id).input.affinityTier)).toEqual([
      'neutral', 'friendly', 'trusted', 'unfriendly', 'bonded',
    ]);
    const hostile = goldenItem('npc-06').input;
    expect(hostile.affinityTier).toBe('hostile');
    expect(hostile.activeQuestCount).toBe(hostile.maxQuests);
    expect(hostile.npc.gender).toBe('female');

    expect(goldenItem('cmb-01').expectations.loneBeastOutro).toBe(true);
    expect(goldenItem('cmb-01').input.playerNames).toHaveLength(1);
    expect(goldenItem('cmb-02').input.playerNames.length).toBeGreaterThan(1);
  });

  it('builds a chained item from its source reply, and from the static fixture when the reply is missing', () => {
    const reveal = {
      className: 'Sparkwright',
      classDescription: 'You build small storms in jars.',
      firstAbility: { name: 'Jar Storm', description: 'You shake the jar.', kind: 'damage', damageType: 'arcane', resourceType: 'mana' },
    };
    const fromReply = goldenInputFor(goldenItem('cre-05'), { 'cre-03': reveal });
    expect(fromReply.className).toBe('Sparkwright');
    expect(fromReply.firstAbility.name).toBe('Jar Storm');
    expect(fromReply.raceName).toBe(goldenItem('cre-03').input.raceName);

    const fallback = goldenInputFor(goldenItem('cre-05'), {});
    expect(fallback.className).toBe(SWEEP_FIXTURES.creation_class[0].className);

    const start = {
      regionName: 'Saltwind Reach',
      biome: 'coastal',
      startLocation: { name: 'Gull Steps', description: 'A stair of wet stone.', terrainType: 'town' },
      firstNpc: { name: 'Edda Vane', npcType: 'vendor', gender: 'female' },
    };
    const world = goldenInputFor(goldenItem('wld-03'), { 'wld-01': start });
    expect(world.regionName).toBe('Saltwind Reach');
    expect(world.npcsPresent[0].gender).toBe('female');
    expect(goldenInputFor(goldenItem('wld-04'), {}).regionName).toBe(SWEEP_FIXTURES.world_gen[1].regionName);

    expect(goldenInputFor(goldenItem('npc-01'), {})).toBe(goldenItem('npc-01').input);
  });

  it('throws on an unknown id so a typo is never a silently skipped item', () => {
    expect(() => goldenItem('npc-99')).toThrow(/unknown golden item id/);
  });

  it('builds a valid, byte-stable Claude request for every item through the production path', () => {
    for (const item of GOLDEN_SET) {
      const input = goldenInputFor(item, {});
      const layers = buildRouteLayers(item.route, input);
      const first = buildClaudeRequest(item.route, layers);
      expect(() => assertValidClaudeBody(first.body, item.route), item.id).not.toThrow();
      const second = buildClaudeRequest(item.route, buildRouteLayers(item.route, goldenInputFor(item, {})));
      expect(second.bodyText, item.id).toBe(first.bodyText);
    }
  });

  it('gives each adversarial item a unique canary that is inside its raw payload', () => {
    const canaries = adversarial.map((i) => i.expectations.canary);
    expect(new Set(canaries).size).toBe(5);
    for (const item of adversarial) {
      expect(item.expectations.canary, item.id).toMatch(/^CANARY-[A-Z]+-\d{4}$/);
      expect(item.payload, item.id).toContain(item.expectations.canary);
    }
  });

  it('wraps every adversarial payload in exactly one tag pair per wrapped field, with the forged tag escaped', () => {
    for (const item of adversarial) {
      const { volatile } = buildRouteLayers(item.route, goldenInputFor(item, {}));
      const tags = volatile.match(PLAYER_INPUT_TAG_PATTERN) ?? [];
      expect(tags, item.id).toHaveLength(2 * item.expectations.wrappedFieldCount);
      const opens = tags.filter((t) => !t.includes('/'));
      const closes = tags.filter((t) => t.includes('/'));
      expect(opens, item.id).toHaveLength(item.expectations.wrappedFieldCount);
      expect(closes, item.id).toHaveLength(item.expectations.wrappedFieldCount);
      expect(volatile, item.id).toContain('&lt;/player_input&gt;');
    }
  });

  it('keeps the canary and the injected instruction inside the first 40 code points of the two name payloads', () => {
    const nameItems = adversarial.filter((i) => i.expectations.vector === 'name');
    expect(nameItems.map((i) => i.id)).toEqual(['adv-2', 'adv-5']);
    for (const item of nameItems) {
      const codePoints = Array.from(item.payload);
      const head = codePoints.slice(0, 40).join('');
      expect(head, item.id).toContain(item.expectations.canary);
      expect(head, item.id).toContain(item.expectations.injectedInstruction);
      expect(head, item.id).toContain('</player_input>');
      // And the cap leaves them in the built request.
      const { volatile } = buildRouteLayers(item.route, goldenInputFor(item, {}));
      expect(volatile, item.id).toContain(item.expectations.canary);
      expect(volatile, item.id).toContain(item.expectations.injectedInstruction);
    }
  });

  it('renders a review table with one row per item in set order and no player_input tag text', () => {
    const table = renderGoldenTable();
    const rows = table.trim().split('\n');
    expect(rows).toHaveLength(2 + 27);
    expect(rows[0]).toMatch(/\bid\b.*\broute\b.*\bkind\b.*\bsummary\b/);
    const bodyRows = rows.slice(2);
    expect(bodyRows.map((r) => r.split('|')[1].trim())).toEqual([...GOLDEN_IDS]);
    for (const item of GOLDEN_SET) {
      const row = bodyRows[GOLDEN_IDS.indexOf(item.id)];
      expect(row, item.id).toContain(item.route);
      expect(row, item.id).toContain(item.kind);
      expect(row, item.id).toContain(item.summary.replace(/[<>]/g, ''));
      if (item.kind === 'adversarial') expect(row, item.id).toContain(item.expectations.canary);
      else expect(row.split('|')[5].trim(), item.id).toBe('');
    }
    expect(table).not.toMatch(/player_input/i);
    expect(table).not.toMatch(/[<>]/);
  });

  it('keeps summaries free of it and they for people (pronoun rule)', () => {
    for (const item of GOLDEN_SET) {
      expect(item.summary, item.id).not.toMatch(/\b(it|its|itself|they|them|their|themselves)\b/i);
    }
  });
});
