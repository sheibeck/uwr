// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/sweep_rules.test.mjs
// Pure rules for the effort sweep and caching proof (Phase 43), the fixtures, and static guards on the
// harness source. Nothing here touches the network, a key or a token.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MIN_CACHEABLE_PREFIX_TOKENS,
  SWEEP_CAP_MICRO_USD,
  SWEEP_MAX_TOKENS,
  SWEEP_MODES,
  SWEEP_RUN_B_CALLS,
  SWEEP_SAMPLES_PER_CELL,
  SWEEP_STOP_AT_MICRO_USD,
  TONE_RULES,
  buildMeasurementRecord,
  cacheVerdict,
  extractJsonObject,
  resolveSweepMode,
  samplePasses,
  shouldStopSweep,
  structuralCheck,
  sweepCallCostMicroUsd,
  sweepMayWriteRecord,
  sweepRetryAllowed,
  sweepRunRefusal,
  toneLint,
} from './sweep_rules.mjs';
import { SWEEP_FIXTURES, classFillInputFrom, worldFillInputFrom } from './sweep_fixtures.mjs';
import { REPO_ROOT } from './cli.mjs';
import { buildRouteLayers } from '../../spacetimedb/src/data/llm_layers.ts';
import { buildClaudeRequest } from '../../spacetimedb/src/helpers/claude_request.ts';
import { LLM_SWEEP_ROUTES, LLM_SWEEP_EFFORTS, LLM_ROUTE_BASELINES, deriveRouteTuning } from '../../spacetimedb/src/data/llm_tuning.ts';

// ---------------------------------------------------------------------------
// Clean replies, one per route (each must lint clean)
// ---------------------------------------------------------------------------

const ABILITY = {
  name: 'Rivet Volley',
  description: 'Hurls a handful of rivets with unsettling accuracy.',
  kind: 'damage',
  damageType: 'physical',
  targetRule: 'single_enemy',
  resourceType: 'stamina',
  resourceCost: 8,
  castSeconds: 0,
  cooldownSeconds: 6,
  value1: 10,
  scaling: 'dex',
  effectType: null,
  effectMagnitude: null,
  effectDuration: null,
};

const CLEAN = {
  creation_race: { raceName: 'Tidewright', narrative: 'River tinkers. They fix things nobody asked about.', bonuses: {} },
  creation_class_reveal: { className: 'Gearbreaker', classDescription: 'A salvager who takes machines apart mid-swing.', firstAbility: ABILITY },
  creation_class: { stats: { primaryStat: 'str' }, abilities: [ABILITY, { ...ABILITY, name: 'Scrap Shield' }] },
  world_gen_start: {
    regionName: 'Saltmere Reach',
    regionDescription: 'A coast where the fog arrives before the ferries do.',
    biome: 'coastal',
    startLocation: { name: 'Gullrest Landing', description: 'A weathered pier town.', terrainType: 'town', levelOffset: 0 },
    firstNpc: {
      name: 'Maren Voss',
      gender: 'female',
      npcType: 'questgiver',
      description: 'A dry-witted harbor clerk. She keeps her ledgers close.',
      greeting: 'Mind the planks. She who pays the toll, walks.',
      personality: {},
    },
  },
  world_gen: {
    dominantFaction: 'The Tollwardens',
    landmarks: ['Drowned Lighthouse'],
    threats: ['sea wolves'],
    locations: [{ name: 'Tarpit Shallows' }, { name: 'Brine Stair' }],
    npcs: [{ name: 'Orsk Dray', gender: 'male', npcType: 'vendor', description: 'A broad trader. He sells salvage.', greeting: 'Buy something.' }],
    enemies: [{ name: 'Sea Wolf' }, { name: 'Gravel Hound' }],
  },
  skill_gen: { skills: [{ ...ABILITY, name: 'Pry Bar Swing' }] },
  renown_perk_gen: { perks: [{ ...ABILITY, name: 'Merchant Favor', description: 'Shopkeepers remember you kindly.' }] },
  npc_conversation:
    '{"segments":[{"kind":"dialogue","speaker":"Maren Voss","text":"The tide table is on the wall. Read it or do not."}],"internalThought":"A stranger.","effects":[]}',
  combat_narration: JSON.stringify({
    segments: [
      {
        kind: 'narration',
        speaker: 'The Keeper',
        text: 'Your blade finds the hound twice before it understands the question. It falls with an expression of mild disappointment. You are left standing, slightly out of breath and entirely unimpressed.',
      },
    ],
  }),
};

const replyTextOf = (route) => (typeof CLEAN[route] === 'string' ? CLEAN[route] : JSON.stringify(CLEAN[route]));
const parsedOf = (route) => (typeof CLEAN[route] === 'string' ? undefined : CLEAN[route]);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('sweep constants', () => {
  it('pins the sample counts and the spend line', () => {
    expect(SWEEP_SAMPLES_PER_CELL).toBe(5);
    expect(SWEEP_RUN_B_CALLS).toBe(2);
    expect(SWEEP_CAP_MICRO_USD).toBe(5_000_000n);
    expect(SWEEP_STOP_AT_MICRO_USD).toBe(4_500_000n);
    expect(MIN_CACHEABLE_PREFIX_TOKENS).toBe(512);
  });

  it('SWEEP_MAX_TOKENS is generous and frozen, one entry per swept route', () => {
    expect(Object.keys(SWEEP_MAX_TOKENS)).toEqual(expect.arrayContaining([...LLM_SWEEP_ROUTES]));
    expect(Object.keys(SWEEP_MAX_TOKENS)).toHaveLength(LLM_SWEEP_ROUTES.length);
    expect(SWEEP_MAX_TOKENS.world_gen).toBe(4096);
    expect(SWEEP_MAX_TOKENS.world_gen_start).toBe(2048);
    expect(SWEEP_MAX_TOKENS.creation_class_reveal).toBe(1024);
    expect(SWEEP_MAX_TOKENS.creation_class).toBe(2048);
    for (const r of ['creation_race', 'skill_gen', 'renown_perk_gen', 'npc_conversation', 'combat_narration']) {
      expect(SWEEP_MAX_TOKENS[r]).toBe(LLM_ROUTE_BASELINES[r].maxTokens);
    }
    expect(Object.isFrozen(SWEEP_MAX_TOKENS)).toBe(true);
  });
});

describe('resolveSweepMode', () => {
  it('unset (or empty) is the free dry run', () => {
    expect(resolveSweepMode(undefined)).toBe('dry');
    expect(resolveSweepMode('')).toBe('dry');
  });

  it('accepts exactly check-key, A and B', () => {
    expect([...SWEEP_MODES]).toEqual(['dry', 'check-key', 'A', 'B']);
    expect(resolveSweepMode('check-key')).toBe('check-key');
    expect(resolveSweepMode('A')).toBe('A');
    expect(resolveSweepMode('B')).toBe('B');
  });

  it('throws on anything else, including lower case and the mode name dry', () => {
    for (const v of ['a', 'b', 'C', 'run', 'true', '1', 'AB', ' A']) expect(() => resolveSweepMode(v)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// toneLint
// ---------------------------------------------------------------------------

describe('toneLint', () => {
  it.each([...LLM_SWEEP_ROUTES])('a clean %s reply returns no rule ids', (route) => {
    expect(toneLint(route, replyTextOf(route), parsedOf(route))).toEqual([]);
  });

  it('lists the rule ids in a fixed order', () => {
    expect([...TONE_RULES]).toContain('meta_commentary');
    expect(TONE_RULES).toHaveLength(11);
  });

  it('banned_phrase: any banned phrase, case-insensitive, in a field or the text', () => {
    const parsed = { ...CLEAN.creation_class_reveal, classDescription: 'A true TAPESTRY of misery.' };
    expect(toneLint('creation_class_reveal', JSON.stringify(parsed), parsed)).toContain('banned_phrase');
    expect(toneLint('combat_narration', 'As an AI I would not. You win. It is over.')).toContain('banned_phrase');
  });

  it('markdown: bold, backtick, heading and bullet', () => {
    for (const bad of ['You hit **hard**. It dies.', 'You hit `it`. It dies.', '# Victory\nYou win. It dies.', 'You win.\n- It dies. Sad.']) {
      expect(toneLint('combat_narration', bad)).toContain('markdown');
    }
  });

  it('exclamation: in a description, dialogue or narration', () => {
    const d = { ...CLEAN.creation_class_reveal, classDescription: 'A salvager. Truly!' };
    expect(toneLint('creation_class_reveal', JSON.stringify(d), d)).toContain('exclamation');
    expect(toneLint('npc_conversation', '{"dialogue":"Buy something!"}')).toContain('exclamation');
    expect(toneLint('combat_narration', 'You win! It dies. Sad.')).toContain('exclamation');
  });

  it('exclamation: inside any segment text, on both segment routes', () => {
    const seg = (kind, text) => ({ kind, speaker: kind === 'dialogue' ? 'Maren Voss' : 'The Keeper', text });
    const npc = JSON.stringify({ segments: [seg('narration', 'She nods.'), seg('dialogue', 'Buy something!')] });
    expect(toneLint('npc_conversation', npc)).toContain('exclamation');
    const cmbDialogue = JSON.stringify({ segments: [seg('narration', 'You win. It dies. Sad.'), seg('dialogue', 'Stop!')] });
    expect(toneLint('combat_narration', cmbDialogue)).toContain('exclamation');
    const cmbNarration = JSON.stringify({ segments: [seg('narration', 'You win! It dies. Sad.')] });
    expect(toneLint('combat_narration', cmbNarration)).toContain('exclamation');
  });

  it('naming_overuse: an overused word in a region or location name, whole words only', () => {
    const bad = { ...CLEAN.world_gen_start, regionName: 'Ashen Verge' };
    expect(toneLint('world_gen_start', JSON.stringify(bad), bad)).toContain('naming_overuse');
    const loc = { ...CLEAN.world_gen, locations: [{ name: 'The Hollow Mire' }, { name: 'Brine Stair' }] };
    expect(toneLint('world_gen', JSON.stringify(loc), loc)).toContain('naming_overuse');
    const ok = { ...CLEAN.world_gen_start, regionName: 'Fellowship Reach' };
    expect(toneLint('world_gen_start', JSON.stringify(ok), ok)).not.toContain('naming_overuse');
  });

  it('class_name_words: a class name of 1-2 words only (a hyphen splits)', () => {
    for (const name of ['Mire-Crowned Gatebreaker', 'The Grand Pyroclast Of Doom']) {
      const bad = { ...CLEAN.creation_class_reveal, className: name };
      expect(toneLint('creation_class_reveal', JSON.stringify(bad), bad)).toContain('class_name_words');
    }
    const ok = { ...CLEAN.creation_class_reveal, className: 'Voidcaller' };
    expect(toneLint('creation_class_reveal', JSON.stringify(ok), ok)).not.toContain('class_name_words');
  });

  it('ability_name_words: an ability name of 2-3 words only', () => {
    for (const name of ['Smash', 'Smash The Living Daylights']) {
      const bad = { ...CLEAN.skill_gen, skills: [{ ...ABILITY, name }] };
      expect(toneLint('skill_gen', JSON.stringify(bad), bad)).toContain('ability_name_words');
    }
  });

  it('npc_gender_mismatch: pronouns in the description and greeting that disagree with the declared gender', () => {
    const bad = {
      ...CLEAN.world_gen_start,
      firstNpc: { ...CLEAN.world_gen_start.firstNpc, gender: 'male' },
    };
    expect(toneLint('world_gen_start', JSON.stringify(bad), bad)).toContain('npc_gender_mismatch');
    const noPronouns = { ...CLEAN.world_gen_start, firstNpc: { ...CLEAN.world_gen_start.firstNpc, description: 'A harbor clerk.', greeting: 'Hello.' } };
    expect(toneLint('world_gen_start', JSON.stringify(noPronouns), noPronouns)).not.toContain('npc_gender_mismatch');
  });

  it('text_json_wrapper and text_quotes on combat narration', () => {
    expect(toneLint('combat_narration', '{"narrative":"You win. It dies. Sad."}')).toContain('text_json_wrapper');
    expect(toneLint('combat_narration', '"You win. It dies. Sad."')).toContain('text_quotes');
  });

  describe('combat tone lints on segment replies (joined narration text)', () => {
    const narr = (...texts) => JSON.stringify({ segments: texts.map((text) => ({ kind: 'narration', speaker: 'The Keeper', text })) });

    it('a JSON reply with two to four narration sentences and no exclamation lints clean', () => {
      expect(toneLint('combat_narration', narr('You win. It dies.'))).toEqual([]);
      expect(toneLint('combat_narration', narr('You win. It dies.', 'Silence. Dust.'))).toEqual([]);
    });

    it('does not flag the JSON wrapper of a segment reply', () => {
      expect(toneLint('combat_narration', narr('You win. It dies. Sad.'))).not.toContain('text_json_wrapper');
    });

    it('counts sentences over the narration segments joined with one space', () => {
      expect(toneLint('combat_narration', narr('You win.'))).toContain('narration_sentences');
      expect(toneLint('combat_narration', narr('One. Two.', 'Three.', 'Four. Five.'))).toContain('narration_sentences');
      expect(toneLint('combat_narration', narr('One. Two.', 'Three.'))).not.toContain('narration_sentences');
    });

    it('text_quotes fires when the joined narration is wrapped in quotes', () => {
      expect(toneLint('combat_narration', narr('"You win. It dies. Sad."'))).toContain('text_quotes');
    });

    it('a parsed object is linted the same as its text', () => {
      const parsed = JSON.parse(narr('You win. It dies.'));
      expect(toneLint('combat_narration', JSON.stringify(parsed), parsed)).toEqual([]);
    });

    it('a reply without a segments array keeps the raw-text behavior', () => {
      expect(toneLint('combat_narration', '{"narrative":"You win. It dies. Sad."}')).toContain('text_json_wrapper');
      expect(toneLint('combat_narration', 'One. Two.')).not.toContain('narration_sentences');
    });
  });

  it('narration_sentences: 2 to 4 sentences', () => {
    expect(toneLint('combat_narration', 'You win.')).toContain('narration_sentences');
    expect(toneLint('combat_narration', 'One. Two. Three. Four. Five.')).toContain('narration_sentences');
    expect(toneLint('combat_narration', 'One. Two.')).not.toContain('narration_sentences');
    expect(toneLint('combat_narration', 'One. Two. Three. Four.')).not.toContain('narration_sentences');
  });

  describe('meta_commentary (evaluated on the raw reply)', () => {
    it.each([
      'Your blade falls. It dies. Wait: that uses their pronoun.\n\nYour blade falls. It dies.',
      'You win. It dies. Corrected below.',
      'You win. It dies. Correction: the hound is a beast.',
      'You win. Let me fix that. It dies.',
      "You win. I used 'their' there. It dies.",
      'You win. The rules forbid naming the player. It dies.',
      'You win. As the prompt says, the hound dies.',
      'You win. The user message names no ability. It dies.',
    ])('flags %j', (text) => {
      expect(toneLint('combat_narration', text)).toContain('meta_commentary');
    });

    it('flags a self-correction inside a string field of a json reply', () => {
      const d = { ...CLEAN.creation_class_reveal, classDescription: 'A salvager. Wait: that is two sentences too many.' };
      expect(toneLint('creation_class_reveal', JSON.stringify(d), d)).toContain('meta_commentary');
    });

    it('does not flag in-voice text that merely contains the words', () => {
      expect(toneLint('combat_narration', 'You wait for the opening. It never comes. You win anyway.')).not.toContain('meta_commentary');
      expect(toneLint('combat_narration', 'You note the hound. It dies. The rules of the arena are kind.')).not.toContain('meta_commentary');
    });
  });
});

// ---------------------------------------------------------------------------
// structuralCheck
// ---------------------------------------------------------------------------

describe('structuralCheck', () => {
  it.each([...LLM_SWEEP_ROUTES])('a clean %s reply is structurally valid', (route) => {
    expect(structuralCheck(route, typeof CLEAN[route] === 'string' ? CLEAN[route] : CLEAN[route])).toEqual([]);
  });

  it('creation_race needs raceName', () => {
    expect(structuralCheck('creation_race', {})).toEqual(['missing_race_name']);
  });

  it('creation_class_reveal needs className and a firstAbility object', () => {
    expect(structuralCheck('creation_class_reveal', { className: '', firstAbility: 'x' })).toEqual(['missing_class_name', 'missing_first_ability']);
  });

  it('creation_class needs stats and exactly 2 abilities', () => {
    expect(structuralCheck('creation_class', { stats: {}, abilities: [ABILITY] })).toEqual(['abilities_count']);
    expect(structuralCheck('creation_class', { abilities: [ABILITY, ABILITY] })).toEqual(['missing_stats']);
    expect(structuralCheck('creation_class', { stats: {}, abilities: [ABILITY, ABILITY, ABILITY] })).toEqual(['abilities_count']);
  });

  it('world_gen_start needs regionName, startLocation.name and a male or female first NPC', () => {
    expect(structuralCheck('world_gen_start', { firstNpc: { gender: 'other' } }).sort()).toEqual(
      ['missing_region_name', 'missing_start_location', 'npc_gender_missing'].sort(),
    );
  });

  it('world_gen needs 2-4 locations, 2-3 enemies and a male or female gender on every NPC', () => {
    expect(structuralCheck('world_gen', { locations: [{}], enemies: [{}, {}], npcs: [] })).toEqual(['locations_count']);
    expect(structuralCheck('world_gen', { locations: [{}, {}, {}, {}, {}], enemies: [{}, {}], npcs: [] })).toEqual(['locations_count']);
    expect(structuralCheck('world_gen', { locations: [{}, {}], enemies: [{}], npcs: [] })).toEqual(['enemies_count']);
    expect(structuralCheck('world_gen', { locations: [{}, {}], enemies: [{}, {}, {}], npcs: [{ gender: 'male' }, {}] })).toEqual(['npc_gender_missing']);
  });

  it('skill_gen needs a skill and renown_perk_gen needs a perk', () => {
    expect(structuralCheck('skill_gen', { skills: [] })).toEqual(['missing_skills']);
    expect(structuralCheck('renown_perk_gen', { perks: [] })).toEqual(['missing_perks']);
  });

  describe.each(['npc_conversation', 'combat_narration'])('%s needs a usable segment', (route) => {
    const good = { segments: [{ kind: 'narration', speaker: 'The Keeper', text: 'It dies.' }] };

    it('a valid segment passes as text, text around JSON and a parsed object', () => {
      expect(structuralCheck(route, JSON.stringify(good))).toEqual([]);
      expect(structuralCheck(route, 'Sure: ' + JSON.stringify(good) + ' done')).toEqual([]);
      expect(structuralCheck(route, good)).toEqual([]);
      expect(structuralCheck(route, { segments: [{ kind: 'dialogue', speaker: 'Marta', text: 'Hello.' }] })).toEqual([]);
    });

    it.each([
      ['no json', 'no json here'],
      ['empty string', ''],
      ['undefined', undefined],
      ['no segments key', '{"dialogue":"Hello."}'],
      ['segments not an array', { segments: 'x' }],
      ['empty array', { segments: [] }],
      ['blank text', { segments: [{ kind: 'narration', text: '   ' }] }],
      ['non-string text', { segments: [{ kind: 'narration', text: 5 }] }],
      ['unknown kind', { segments: [{ kind: 'shout', text: 'Hi.' }] }],
      ['non-object item', { segments: ['x', null] }],
    ])('flags %s as missing_segments', (_label, value) => {
      expect(structuralCheck(route, value)).toEqual(['missing_segments']);
    });

    it('one usable segment among bad ones is enough', () => {
      expect(structuralCheck(route, { segments: [{ kind: 'x', text: 'a' }, { kind: 'narration', text: 'b b' }] })).toEqual([]);
    });
  });

  it('combat prose with no segments is missing_segments', () => {
    expect(structuralCheck('combat_narration', 'Your blade falls. It dies.')).toEqual(['missing_segments']);
  });

  it('no longer produces missing_dialogue or empty_text', () => {
    for (const route of ['npc_conversation', 'combat_narration']) {
      for (const v of ['', '   ', undefined, '{"dialogue":""}', { segments: [] }]) {
        const ids = structuralCheck(route, v);
        expect(ids).not.toContain('missing_dialogue');
        expect(ids).not.toContain('empty_text');
      }
    }
  });

  it('extractJsonObject never throws', () => {
    expect(extractJsonObject('{bad')).toBeUndefined();
    expect(extractJsonObject(undefined)).toBeUndefined();
    expect(extractJsonObject('x {"a":1} y')).toEqual({ a: 1 });
  });
});

// ---------------------------------------------------------------------------
// samplePasses (shared with the tuning module)
// ---------------------------------------------------------------------------

describe('samplePasses', () => {
  const s = { ok: true, stopReason: 'end_turn', schemaOk: true, toneFailures: [] };
  it('is the shared rule', () => {
    expect(samplePasses(s)).toBe(true);
    expect(samplePasses({ ...s, toneFailures: ['markdown'] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cacheVerdict
// ---------------------------------------------------------------------------

describe('cacheVerdict', () => {
  const call = (over) => ({ inputTokens: 50, cacheWriteTokens: 2500, cacheReadTokens: 0, ...over });

  it('passes when call 2 read cached tokens', () => {
    expect(cacheVerdict({ call1: call(), call2: call({ cacheWriteTokens: 0, cacheReadTokens: 2500 }) })).toEqual({
      pass: true,
      notCacheable: false,
    });
  });

  it('a prefix under 512 tokens with no write and no read on call 1 is not cacheable, not a failure', () => {
    const c1 = call({ inputTokens: 300, cacheWriteTokens: 0, cacheReadTokens: 0 });
    expect(cacheVerdict({ call1: c1, call2: c1 })).toEqual({ pass: false, notCacheable: true });
  });

  it('is judged on the total input: 512 tokens or more with no cache activity is a real failure', () => {
    const c1 = call({ inputTokens: 512, cacheWriteTokens: 0, cacheReadTokens: 0 });
    expect(cacheVerdict({ call1: c1, call2: c1 })).toEqual({ pass: false, notCacheable: false });
    const c2 = call({ inputTokens: 511, cacheWriteTokens: 0, cacheReadTokens: 0 });
    expect(cacheVerdict({ call1: c2, call2: c2 })).toEqual({ pass: false, notCacheable: true });
  });

  it('a write on call 1 with no read on call 2 is a real failure', () => {
    expect(cacheVerdict({ call1: call(), call2: call({ cacheWriteTokens: 2500 }) })).toEqual({ pass: false, notCacheable: false });
  });
});

// ---------------------------------------------------------------------------
// shouldStopSweep
// ---------------------------------------------------------------------------

describe('shouldStopSweep', () => {
  it('stops when spent + next would pass 4_500_000; exactly at it is false', () => {
    expect(shouldStopSweep(4_000_000n, 500_000n)).toBe(false);
    expect(shouldStopSweep(4_000_000n, 500_001n)).toBe(true);
    expect(shouldStopSweep(0n, 0n)).toBe(false);
    expect(shouldStopSweep(4_500_001n, 0n)).toBe(true);
  });

  it('accepts integer numbers as well as bigint', () => {
    expect(shouldStopSweep(4_000_000, 500_001)).toBe(true);
  });
});

describe('sweepCallCostMicroUsd (review WR-A05)', () => {
  const R = 40_000n;
  const call = (over) => ({ usageCostMicroUsd: null, ok: false, failureClass: 'server', httpStatus: 500, ...over });

  it('charges the usage cost when the reply carried usage', () => {
    expect(sweepCallCostMicroUsd(call({ ok: true, failureClass: null, httpStatus: 200, usageCostMicroUsd: 1234n }), R)).toBe(1234n);
    expect(sweepCallCostMicroUsd(call({ usageCostMicroUsd: 77 }), R)).toBe(77n);
  });

  it('charges the reservation when billing is unknown: timeout, transport failure, or a 2xx with no usable usage', () => {
    expect(sweepCallCostMicroUsd(call({ failureClass: 'timeout', httpStatus: 0 }), R)).toBe(R);
    expect(sweepCallCostMicroUsd(call({ failureClass: 'network', httpStatus: 0 }), R)).toBe(R);
    // The executor's billedButUnparsed case: Anthropic ran the request, the body could not be used.
    expect(sweepCallCostMicroUsd(call({ failureClass: 'malformed', httpStatus: 200 }), R)).toBe(R);
    expect(sweepCallCostMicroUsd(call({ failureClass: 'malformed', httpStatus: 299 }), R)).toBe(R);
    expect(sweepCallCostMicroUsd(call({ ok: true, failureClass: null, httpStatus: 200 }), R)).toBe(R);
    expect(sweepCallCostMicroUsd(call({ failureClass: 'malformed', httpStatus: 200, usageCostMicroUsd: 0n }), R)).toBe(R);
  });

  it('charges nothing for a failure the API answered with a non-2xx status', () => {
    expect(sweepCallCostMicroUsd(call({ failureClass: 'rate_limit', httpStatus: 429 }), R)).toBe(0n);
    expect(sweepCallCostMicroUsd(call({ failureClass: 'server', httpStatus: 500 }), R)).toBe(0n);
    expect(sweepCallCostMicroUsd(call({ failureClass: 'bad_request', httpStatus: 400 }), R)).toBe(0n);
  });
});

describe('the record guard (review WR-A06)', () => {
  const rec = (status, calls) => ({ status, totals: { calls, costMicroUsd: 0 } });

  it('refuses both runs over an applied record', () => {
    expect(sweepRunRefusal('A', rec('applied', 126))).not.toBe('');
    expect(sweepRunRefusal('B', rec('applied', 126))).not.toBe('');
  });

  it('refuses Run A over a measured record that holds paid calls, and allows it over an empty one', () => {
    expect(sweepRunRefusal('A', rec('measured', 90))).not.toBe('');
    expect(sweepRunRefusal('A', rec('measured', 0))).toBe('');
    for (const status of ['not_run', 'declined', 'deferred']) expect(sweepRunRefusal('A', rec(status, 0))).toBe('');
    expect(sweepRunRefusal('A', undefined)).toBe('');
  });

  it('lets Run B run only over a measured record with at least one call', () => {
    expect(sweepRunRefusal('B', rec('measured', 90))).toBe('');
    expect(sweepRunRefusal('B', rec('measured', 0))).not.toBe('');
    expect(sweepRunRefusal('B', rec('not_run', 0))).not.toBe('');
    expect(sweepRunRefusal('B', undefined)).not.toBe('');
  });

  it('writes only after a paid call this run, and never over an applied record', () => {
    expect(sweepMayWriteRecord(rec('not_run', 0), 0)).toBe(false); // a crash before the first call
    expect(sweepMayWriteRecord(rec('not_run', 0), 1)).toBe(true);
    expect(sweepMayWriteRecord(rec('measured', 90), 2)).toBe(true); // Run B's own calls
    expect(sweepMayWriteRecord(rec('applied', 126), 5)).toBe(false);
    expect(sweepMayWriteRecord(undefined, 1)).toBe(true);
  });

  it('the committed record is protected from both paid runs', () => {
    const committed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'spacetimedb', 'src', 'data', 'llm_measurements.json'), 'utf8'));
    if (committed.status === 'applied') {
      expect(sweepRunRefusal('A', committed)).not.toBe('');
      expect(sweepRunRefusal('B', committed)).not.toBe('');
      expect(sweepMayWriteRecord(committed, 1)).toBe(false);
    }
  });
});

describe('sweepRetryAllowed (review WR-A05)', () => {
  it('lets the retry run only while spent + the failed attempt + the retry reservation stays within the stop line', () => {
    expect(sweepRetryAllowed(4_000_000n, 100_000n, 400_000n)).toBe(true); // exactly at the line
    expect(sweepRetryAllowed(4_000_000n, 100_001n, 400_000n)).toBe(false);
    expect(sweepRetryAllowed(4_400_000n, 0n, 100_001n)).toBe(false);
    expect(sweepRetryAllowed(0, 0, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildMeasurementRecord
// ---------------------------------------------------------------------------

const smp = (out, over = {}) => ({
  ok: true,
  stopReason: 'end_turn',
  latencyMs: 3000,
  inputTokens: 80,
  outputTokens: out,
  cacheWriteTokens: 0,
  cacheReadTokens: 2400,
  schemaOk: true,
  toneFailures: [],
  ...over,
});

describe('buildMeasurementRecord', () => {
  it('has the fixed key order, routes in sweep order and efforts low then medium', () => {
    const rec = buildMeasurementRecord({ status: 'not_run' });
    expect(Object.keys(rec)).toEqual(['schemaVersion', 'status', 'model', 'recordedAt', 'environment', 'totals', 'routes', 'caching', 'classReveal']);
    expect(Object.keys(rec.routes)).toEqual([...LLM_SWEEP_ROUTES]);
    for (const r of LLM_SWEEP_ROUTES) expect(Object.keys(rec.routes[r].efforts)).toEqual([...LLM_SWEEP_EFFORTS]);
    expect(Object.keys(rec.routes.world_gen)).toEqual([
      'efforts',
      'chosenEffort',
      'tie',
      'p99OutputTokens',
      'maxTokens',
      'suggestedTimeoutMs',
      'insufficientData',
      'runB',
    ]);
  });

  it('an empty input matches the committed not_run record exactly', () => {
    const committed = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'spacetimedb', 'src', 'data', 'llm_measurements.json'), 'utf8'));
    if (committed.status === 'not_run') {
      expect(JSON.parse(JSON.stringify(buildMeasurementRecord({ status: 'not_run' })))).toEqual(committed);
    }
  });

  it('keeps only the whitelisted sample fields (a text or prompt key is dropped)', () => {
    const rec = buildMeasurementRecord({
      routes: {
        skill_gen: {
          efforts: {
            low: { samples: [{ ...smp(100), text: 'SECRET REPLY', prompt: 'SECRET PROMPT', headers: { 'x-api-key': 'k' } }] },
            medium: { samples: [] },
          },
        },
      },
    });
    const sample = rec.routes.skill_gen.efforts.low.samples[0];
    expect(Object.keys(sample)).toEqual([
      'ok',
      'stopReason',
      'latencyMs',
      'inputTokens',
      'outputTokens',
      'cacheWriteTokens',
      'cacheReadTokens',
      'schemaOk',
      'toneFailures',
    ]);
    expect(JSON.stringify(rec)).not.toMatch(/SECRET|x-api-key/);
  });

  it('drops a free-text tone failure or stop reason (only rule ids and reason words are kept)', () => {
    const rec = buildMeasurementRecord({
      routes: { skill_gen: { efforts: { low: { samples: [smp(100, { toneFailures: ['markdown', 'You wrote a long secret reply!'], stopReason: 'a free text reason with spaces' })] } } } },
    });
    const sample = rec.routes.skill_gen.efforts.low.samples[0];
    expect(sample.toneFailures).toEqual(['markdown']);
    expect(sample.stopReason).toBeNull();
  });

  it('derives every route field through the shared tuning rules (same answer as deriveRouteTuning)', () => {
    const cell = (tokens) => ({ samples: tokens.map((t) => smp(t)) });
    const rec = buildMeasurementRecord({
      status: 'measured',
      model: 'm',
      recordedAt: '2026-01-01T00:00:00.000Z',
      totals: { calls: 10, costMicroUsd: 123456n },
      routes: { skill_gen: { efforts: { low: cell([500, 520, 480, 510, 490]), medium: cell([505, 515, 485, 500, 495]) } } },
    });
    const r = rec.routes.skill_gen;
    expect(r).toMatchObject({ chosenEffort: 'low', tie: true, p99OutputTokens: 520, maxTokens: 768, insufficientData: false });
    expect(deriveRouteTuning('skill_gen', r, LLM_ROUTE_BASELINES.skill_gen)).toMatchObject({ status: 'tuned', maxTokens: 768, effort: 'low' });
    expect(rec.routes.creation_race.insufficientData).toBe(true);
    expect(rec.totals).toEqual({ calls: 10, costMicroUsd: '123456' });
  });

  it('records caching verdicts and the class-reveal decision', () => {
    const call = (over) => ({ ok: true, stopReason: 'end_turn', latencyMs: 2000, inputTokens: 40, outputTokens: 80, cacheWriteTokens: 2500, cacheReadTokens: 0, ...over });
    const rec = buildMeasurementRecord({
      caching: { combat_narration: { call1: call(), call2: call({ cacheWriteTokens: 0, cacheReadTokens: 2500 }) } },
      classReveal: { latenciesMs: [4000, 5000, 6000], parallelBuilt: true },
    });
    expect(rec.caching.combat_narration).toMatchObject({ pass: true, notCacheable: false });
    expect(Object.keys(rec.caching)).toEqual(['combat_narration']);
    expect(rec.classReveal).toMatchObject({ p50Ms: 5300, p95Ms: 6300, thresholdMs: 10_000, verdict: 'leave_out', parallelBuilt: false });
  });

  it('parallelBuilt can only be true when the verdict is build', () => {
    const rec = buildMeasurementRecord({ classReveal: { latenciesMs: [11_000, 12_000, 13_000], parallelBuilt: true } });
    expect(rec.classReveal.verdict).toBe('build');
    expect(rec.classReveal.parallelBuilt).toBe(true);
    expect(buildMeasurementRecord({ classReveal: { latenciesMs: [], parallelBuilt: true } }).classReveal.parallelBuilt).toBe(false);
  });

  it('is deterministic: the same input gives byte-identical output', () => {
    const input = { status: 'measured', routes: { skill_gen: { efforts: { low: { samples: [smp(1), smp(2)] }, medium: { samples: [] } } } } };
    expect(JSON.stringify(buildMeasurementRecord(input))).toBe(JSON.stringify(buildMeasurementRecord(input)));
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

describe('SWEEP_FIXTURES', () => {
  it('has exactly 5 inputs for every swept route and nothing else', () => {
    expect(Object.keys(SWEEP_FIXTURES)).toEqual([...LLM_SWEEP_ROUTES]);
    for (const route of LLM_SWEEP_ROUTES) expect(SWEEP_FIXTURES[route]).toHaveLength(5);
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(SWEEP_FIXTURES)).toBe(true);
    expect(Object.isFrozen(SWEEP_FIXTURES.world_gen[0].startLocation)).toBe(true);
  });

  it.each([...LLM_SWEEP_ROUTES])('every %s input builds route layers and a valid request without throwing', (route) => {
    for (const input of SWEEP_FIXTURES[route]) {
      const layers = buildRouteLayers(route, input);
      expect(layers.volatile.length).toBeGreaterThan(0);
      const req = buildClaudeRequest(route, layers);
      expect(typeof req.bodyText).toBe('string');
    }
  });

  it('inputs for a route differ from one another', () => {
    for (const route of LLM_SWEEP_ROUTES) {
      const volatiles = SWEEP_FIXTURES[route].map((input) => buildRouteLayers(route, input).volatile);
      expect(new Set(volatiles).size).toBe(5);
    }
  });

  it('combat narration fixtures are outros (victory and defeat), with a lone character and a party', () => {
    const inputs = SWEEP_FIXTURES.combat_narration;
    expect(new Set(inputs.map((i) => i.narrativeType))).toEqual(new Set(['victory', 'defeat']));
    expect(inputs.every((i) => i.narrativeType === 'victory' || i.narrativeType === 'defeat')).toBe(true);
    expect(inputs.some((i) => i.playerNames.length === 1)).toBe(true);
    expect(inputs.some((i) => i.playerNames.length > 1)).toBe(true);
  });

  it('uses bigint where the input types do', () => {
    expect(typeof SWEEP_FIXTURES.skill_gen[0].level).toBe('bigint');
    expect(typeof SWEEP_FIXTURES.combat_narration[0].combatId).toBe('bigint');
  });
});

describe('worldFillInputFrom and classFillInputFrom', () => {
  it('build the fill inputs from a stage-1 reply and the stage-1 input', () => {
    const input = SWEEP_FIXTURES.world_gen_start[1];
    const fill = worldFillInputFrom(CLEAN.world_gen_start, input);
    expect(fill.regionName).toBe('Saltmere Reach');
    expect(fill.startLocation.name).toBe('Gullrest Landing');
    expect(fill.npcsPresent).toEqual([{ name: 'Maren Voss', npcType: 'questgiver', gender: 'female' }]);
    expect(fill.characterRace).toBe(input.characterRace);
    expect(fill.neighborRegions).toEqual(input.neighborRegions);
    expect(buildRouteLayers('world_gen', fill).volatile).toContain('Saltmere Reach');

    const cin = SWEEP_FIXTURES.creation_class_reveal[0];
    const cfill = classFillInputFrom(CLEAN.creation_class_reveal, cin);
    expect(cfill.className).toBe('Gearbreaker');
    expect(cfill.firstAbility.name).toBe('Rivet Volley');
    expect(cfill.raceName).toBe(cin.raceName);
    expect(buildRouteLayers('creation_class', cfill).volatile).toContain('Gearbreaker');
  });

  it('fall back to the static fixture fields when a field is missing, and never throw on junk', () => {
    const fb = SWEEP_FIXTURES.world_gen[2];
    const fill = worldFillInputFrom({ regionName: '  ', firstNpc: { gender: 'other' } }, undefined, fb);
    expect(fill.regionName).toBe(fb.regionName);
    expect(fill.startLocation).toEqual(fb.startLocation);
    expect(fill.npcsPresent[0].gender).toBe(fb.npcsPresent[0].gender);
    expect(fill.characterRace).toBe(fb.characterRace);
    expect(() => worldFillInputFrom(null, null, null)).not.toThrow();

    const cfb = SWEEP_FIXTURES.creation_class[3];
    const cfill = classFillInputFrom({ className: 7, firstAbility: 'x' }, {}, cfb);
    expect(cfill.className).toBe(cfb.className);
    expect(cfill.firstAbility).toEqual(cfb.firstAbility);
    expect(() => classFillInputFrom(undefined, undefined, undefined)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Static guards over the pure modules and the harness source (T-43-32, T-43-33, T-43-34)
// ---------------------------------------------------------------------------

const SCRIPTS = path.join(REPO_ROOT, 'scripts', 'llm');
const HARNESS_PATH = path.join(SCRIPTS, 'sweep.live.ts');
const HARNESS_EXISTS = fs.existsSync(HARNESS_PATH);
const MEASUREMENTS_REL = "'spacetimedb', 'src', 'data', 'llm_measurements.json'";

/** The brace-balanced body of `function NAME` / `async function NAME`, or '' when absent. */
function functionBody(src, name) {
  const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return '';
  const open = src.indexOf('{', src.indexOf(')', m.index));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

/** The balanced-parenthesis text of every `say(` call (the definition `function say(` is skipped). */
function sayCalls(src) {
  const out = [];
  const re = /(?<!function )\bsay\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 0;
    for (let i = m.index + 3; i < src.length; i += 1) {
      if (src[i] === '(') depth += 1;
      else if (src[i] === ')') {
        depth -= 1;
        if (depth === 0) {
          out.push(src.slice(m.index, i + 1));
          break;
        }
      }
    }
  }
  return out;
}

const count = (src, re) => (src.match(re) ?? []).length;

describe('the pure modules', () => {
  it.each(['sweep_rules.mjs', 'sweep_fixtures.mjs'])('%s performs no I/O', (file) => {
    const src = fs.readFileSync(path.join(SCRIPTS, file), 'utf8');
    expect(src).not.toMatch(/fetch\(|readFileSync|writeFileSync|process\.env|loadAnthropicKey/);
  });
});

describe('the sweep harness source', () => {
  const skip = !HARNESS_EXISTS;
  const src = HARNESS_EXISTS ? fs.readFileSync(HARNESS_PATH, 'utf8') : '';
  // Imports and whole-line comments are not code: the header names loadAnthropicKey() and fetch in prose.
  const code = src.replace(/^import .*$/gm, '').replace(/^\s*\/\/.*$/gm, '');

  it.skipIf(skip)('prints through one scrubbing say helper: console.log appears exactly once, inside say', () => {
    expect(count(src, /\bconsole\.(log|info|warn|error|debug)\s*\(/g)).toBe(1);
    expect(functionBody(src, 'say')).toMatch(/console\.log\(\s*scrub\(/);
  });

  it.skipIf(skip)('reads process.env only for SWEEP_LIVE_RUN', () => {
    expect(count(src, /process\.env/g)).toBe(count(src, /process\.env\.SWEEP_LIVE_RUN\b/g));
    expect(src).not.toMatch(/ANTHROPIC_API_KEY|\.env\.local|\.dev\.vars/);
  });

  it.skipIf(skip)('defaults to the dry mode and rejects unknown modes through resolveSweepMode', () => {
    expect(src).toContain('resolveSweepMode(process.env.SWEEP_LIVE_RUN)');
    expect(src).toContain("'dry'");
  });

  it.skipIf(skip)('calls loadAnthropicKey only inside the check-key and paid branches', () => {
    const calls = count(code, /\bloadAnthropicKey\s*\(/g);
    const inBranches = count(functionBody(src, 'runCheckKey'), /\bloadAnthropicKey\s*\(/g) + count(functionBody(src, 'runPaid'), /\bloadAnthropicKey\s*\(/g);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBe(inBranches);
    expect(functionBody(src, 'runDry')).not.toMatch(/loadAnthropicKey/);
  });

  it.skipIf(skip)('reaches the network only from the paid call helper, never from dry or check-key', () => {
    expect(count(code, /\bfetch\s*\(/g)).toBe(count(functionBody(src, 'callClaude'), /\bfetch\s*\(/g));
    expect(functionBody(src, 'runDry')).not.toMatch(/\bfetch\s*\(/);
    expect(functionBody(src, 'runCheckKey')).not.toMatch(/\bfetch\s*\(/);
    expect(functionBody(src, 'callClaude')).toMatch(/ANTHROPIC_MESSAGES_URL/);
  });

  it.skipIf(skip)('writes only the measurements file, and never from the dry or check-key modes', () => {
    const writes = count(src, /\b(writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|renameSync|copyFileSync)\s*\(/g);
    expect(writes).toBe(count(src, /\bfs\.writeFileSync\(\s*MEASUREMENTS_PATH\b/g));
    expect(src).toContain(MEASUREMENTS_REL);
    expect(functionBody(src, 'runDry')).not.toMatch(/writeFileSync|writeRecord/);
    expect(functionBody(src, 'runCheckKey')).not.toMatch(/writeFileSync|writeRecord/);
  });

  it.skipIf(skip)('does not print prompts, replies, headers or bodies', () => {
    // Every say(...) call is short status text: no interpolated expression names a key, a request body,
    // a reply, a prompt layer or headers.
    const calls = sayCalls(src);
    expect(calls.length).toBeGreaterThan(5);
    for (const call of calls) {
      for (const expr of call.match(/\$\{[^}]*\}/g) ?? []) {
        expect(expr).not.toMatch(/\b(key|apiKey|bodyText|replyText|replyJson|volatile|routeBlock|headers|body|text|prompt|completion)\b/);
      }
    }
  });

  it.skipIf(skip)('review WR-A05: charges each call through sweepCallCostMicroUsd and gates the retry on the stop line', () => {
    expect(functionBody(src, 'callClaude')).toMatch(/sweepCallCostMicroUsd\(/);
    expect(functionBody(src, 'callClaude')).toMatch(/httpStatus = res\.status/);
    const retry = functionBody(src, 'callWithRetry');
    expect(retry).toMatch(/sweepRetryAllowed\(spent, first\.costMicroUsd, reservation\)/);
    // The gate comes before the second paid call.
    expect(retry.indexOf('sweepRetryAllowed(')).toBeLessThan(retry.lastIndexOf('callClaude('));
    // Both runs pass their running spend in.
    expect(count(src, /callWithRetry\(key, route, bodyText, reservation, spent\)/g)).toBe(2);
  });

  it.skipIf(skip)('review WR-A06: guards the record before the key is read and before every write', () => {
    const paid = functionBody(src, 'runPaid');
    expect(paid).toMatch(/sweepRunRefusal\(mode, readRecord\(\)\)/);
    expect(paid.indexOf('sweepRunRefusal(')).toBeLessThan(paid.indexOf('loadAnthropicKey('));
    // The one write goes through writeRecord, which checks the record on disk and this run's call count first.
    const write = functionBody(src, 'writeRecord');
    expect(write).toMatch(/sweepMayWriteRecord\(readRecord\(\), callsThisRun\)/);
    expect(write.indexOf('sweepMayWriteRecord(')).toBeLessThan(write.indexOf('writeFileSync('));
    expect(functionBody(src, 'runA')).toMatch(/writeRecord\([\s\S]*,\s*calls,\s*\)/);
    expect(functionBody(src, 'runB')).toMatch(/writeRecord\([\s\S]*,\s*calls - startCalls,\s*\)/);
    expect(functionBody(src, 'runB')).toMatch(/sweepRunRefusal\('B', rec\)/);
  });

  it.skipIf(skip)('keeps the model id out of the harness (it comes from CLAUDE_MODEL)', () => {
    expect(src).not.toMatch(/claude-(sonnet|opus|haiku|fable|mythos|instant|\d)/i);
    expect(src).toContain('CLAUDE_MODEL');
  });
});
