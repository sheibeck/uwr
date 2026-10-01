// Pure rules for the effort sweep and caching proof (Phase 43). No I/O, no SDK, no secrets.
// The harness (sweep.live.ts) imports these; tests live in sweep_rules.test.mjs.
//
// The derivation rules (effort choice, p99, max_tokens, insufficient data, LAT-06) live in
// spacetimedb/src/data/llm_tuning.ts and are imported here, never copied.

import { KEEPER_BANNED_PHRASES } from '../../spacetimedb/src/data/keeper_bible.ts';
import { inferGenderFromText } from '../../spacetimedb/src/data/npc_gender.ts';
import {
  LLM_ROUTE_BASELINES,
  LLM_SWEEP_EFFORTS,
  LLM_SWEEP_ROUTES,
  LLM_CLASS_REVEAL_THRESHOLD_MS,
  deriveRecordFields,
  lat06Decision,
  samplePasses,
} from '../../spacetimedb/src/data/llm_tuning.ts';

export { samplePasses };

// -- Constants ---------------------------------------------------------------

/** Fixtures per (route, effort) cell. */
export const SWEEP_SAMPLES_PER_CELL = 5;
/** Identical sequential calls per route in Run B (the caching pair). */
export const SWEEP_RUN_B_CALLS = 2;
/** The user-approved cap for the whole sweep: $5. */
export const SWEEP_CAP_MICRO_USD = 5_000_000n;
/** The harness stops before a call that would pass this: the cap minus a $0.50 margin. */
export const SWEEP_STOP_AT_MICRO_USD = 4_500_000n;
/** Below this many prefix tokens the model does not write a cache entry. */
export const MIN_CACHEABLE_PREFIX_TOKENS = 512;

/** Run A max_tokens per swept route: generous, so nothing truncates while measuring. */
export const SWEEP_MAX_TOKENS = Object.freeze({
  creation_race: LLM_ROUTE_BASELINES.creation_race.maxTokens,
  creation_class_reveal: 1024,
  creation_class: 2048,
  world_gen_start: 2048,
  world_gen: 4096,
  skill_gen: LLM_ROUTE_BASELINES.skill_gen.maxTokens,
  renown_perk_gen: LLM_ROUTE_BASELINES.renown_perk_gen.maxTokens,
  npc_conversation: LLM_ROUTE_BASELINES.npc_conversation.maxTokens,
  combat_narration: LLM_ROUTE_BASELINES.combat_narration.maxTokens,
});

export const SWEEP_MODES = Object.freeze(['dry', 'check-key', 'A', 'B']);

/** SWEEP_LIVE_RUN to a mode. Unset (or empty) is the free dry run; anything not listed throws. */
export function resolveSweepMode(value) {
  if (value === undefined || value === null || value === '') return 'dry';
  if (SWEEP_MODES.includes(value)) return value;
  throw new Error('SWEEP_LIVE_RUN must be unset (dry), check-key, A or B');
}

// -- Spend guard -------------------------------------------------------------

/** True when spending `nextReserve` more would pass the stop line. Exactly at the line is false. */
export function shouldStopSweep(spentMicroUsd, nextReserveMicroUsd) {
  return BigInt(spentMicroUsd) + BigInt(nextReserveMicroUsd) > SWEEP_STOP_AT_MICRO_USD;
}

// -- Cache verdict -----------------------------------------------------------

const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

/**
 * Two identical-prefix calls. Pass when call 2 read cached tokens. A prefix under the model minimum
 * (call 1 wrote and read nothing, and its whole input is under MIN_CACHEABLE_PREFIX_TOKENS) is
 * "not cacheable", not a failure. Anything else is a real failure.
 */
export function cacheVerdict({ call1, call2 }) {
  if (n(call2?.cacheReadTokens) > 0) return { pass: true, notCacheable: false };
  const noCache = n(call1?.cacheWriteTokens) === 0 && n(call1?.cacheReadTokens) === 0;
  const total = n(call1?.inputTokens) + n(call1?.cacheWriteTokens) + n(call1?.cacheReadTokens);
  if (noCache && total < MIN_CACHEABLE_PREFIX_TOKENS) return { pass: false, notCacheable: true };
  return { pass: false, notCacheable: false };
}

// -- Helpers over a reply ----------------------------------------------------

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isNonEmptyString = (x) => typeof x === 'string' && x.trim() !== '';

/** A JSON object inside a text reply (first '{' to last '}'), or undefined. Tolerant, never throws. */
export function extractJsonObject(text) {
  if (typeof text !== 'string') return undefined;
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last <= first) return undefined;
  try {
    const v = JSON.parse(text.slice(first, last + 1));
    return isObject(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Every string value in a parsed reply, with the key it sits under. */
function collectStrings(value, key = '', out = []) {
  if (typeof value === 'string') out.push({ key, value });
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, key, out);
  else if (isObject(value)) for (const [k, v] of Object.entries(value)) collectStrings(v, k, out);
  return out;
}

// -- Tone lint ---------------------------------------------------------------

/** Fixed order of the rule ids toneLint can return. */
export const TONE_RULES = Object.freeze([
  'banned_phrase',
  'markdown',
  'exclamation',
  'naming_overuse',
  'class_name_words',
  'ability_name_words',
  'npc_gender_mismatch',
  'text_json_wrapper',
  'text_quotes',
  'narration_sentences',
  'meta_commentary',
]);

const OVERUSED_NAME_WORDS = Object.freeze(['verge', 'veil', 'ashen', 'dusk', 'shadow', 'gloom', 'hollow', 'mire', 'blight', 'fell']);

const MARKDOWN = /\*\*|`|^[ \t]*#{1,6}[ \t]|^[ \t]*-[ \t]/m;

/** Fields whose text is narrative: no exclamation marks. */
const NARRATIVE_KEY = /description$|^(dialogue|narrative|narration)$/i;

/**
 * The model talking about its own output instead of staying in voice: a self-correction ("Wait:",
 * "Corrected below", "correction:", "let me fix", "I used 'their'") or a mention of the rules, the
 * prompt or the user message. A live outro leaked exactly this (commit 41a68823). Evaluated on the
 * raw reply, before any production cleanup such as stripNarrationSelfCorrection.
 */
const META_COMMENTARY = [
  /\b(wait|note|correction|corrections|edit|revised|revision)\s*:/i,
  /\b(corrected|revised|fixed)\s+(below|version|text|draft)\b/i,
  /\bcorrected\b[^.\n]{0,24}\bbelow\b/i,
  /\blet me (fix|correct|redo|rewrite|rephrase|try again)\b/i,
  /\bI (used|wrote|said|meant|slipped)\s+['"‘“](their|they|them|its?|themselves)\b/i,
  /\b(the|these|those|my) (rules|instructions)\s+(forbid|say|require|state|specify|prohibit|ask)\b/i,
  /\b(per|as per|following) (the|my) (rules|instructions)\b/i,
  /\b(the|this|my) (system )?prompt\b/i,
  /\bthe user(?:'s)? (message|prompt|input|request)\b/i,
];

const wordsOf = (s) => String(s ?? '').split(/\s+/).filter(Boolean);

function sentenceCount(text) {
  return text
    .split(/[.!?]+["'”’)\]]*(?:\s+|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;
}

function npcsOf(parsed) {
  const out = [];
  if (isObject(parsed?.firstNpc)) out.push(parsed.firstNpc);
  if (Array.isArray(parsed?.npcs)) for (const x of parsed.npcs) if (isObject(x)) out.push(x);
  return out;
}

function abilityNamesOf(parsed) {
  const out = [];
  if (isObject(parsed?.firstAbility)) out.push(parsed.firstAbility.name);
  for (const key of ['abilities', 'skills', 'perks']) {
    if (Array.isArray(parsed?.[key])) for (const x of parsed[key]) if (isObject(x)) out.push(x.name);
  }
  return out.filter((x) => typeof x === 'string');
}

function placeNamesOf(parsed) {
  const out = [];
  if (typeof parsed?.regionName === 'string') out.push(parsed.regionName);
  if (isObject(parsed?.startLocation) && typeof parsed.startLocation.name === 'string') out.push(parsed.startLocation.name);
  if (Array.isArray(parsed?.locations)) for (const x of parsed.locations) if (isObject(x) && typeof x.name === 'string') out.push(x.name);
  return out;
}

/**
 * Keeper-tone lint over the RAW reply. `text` is the reply text, `parsed` its parsed JSON (for a text
 * route the JSON inside the text is used when `parsed` is not given). Returns rule ids in a fixed order,
 * each at most once. A clean reply returns [].
 */
export function toneLint(route, text, parsed) {
  const raw = typeof text === 'string' ? text : '';
  const obj = isObject(parsed) ? parsed : route === 'npc_conversation' ? extractJsonObject(raw) : undefined;
  const fields = obj ? collectStrings(obj) : [];
  const all = [raw, ...fields.map((f) => f.value)];
  const failed = new Set();

  const lowered = all.map((s) => s.toLowerCase());
  for (const phrase of KEEPER_BANNED_PHRASES) {
    const p = phrase.toLowerCase();
    if (lowered.some((s) => s.includes(p))) failed.add('banned_phrase');
  }

  if (all.some((s) => MARKDOWN.test(s))) failed.add('markdown');

  if (route === 'combat_narration' && raw.includes('!')) failed.add('exclamation');
  if (fields.some((f) => NARRATIVE_KEY.test(f.key) && f.value.includes('!'))) failed.add('exclamation');

  for (const name of placeNamesOf(obj)) {
    const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (words.some((w) => OVERUSED_NAME_WORDS.includes(w))) failed.add('naming_overuse');
  }

  if (typeof obj?.className === 'string') {
    const count = obj.className.split(/[\s-]+/).filter(Boolean).length;
    if (count < 1 || count > 2) failed.add('class_name_words');
  }

  for (const name of abilityNamesOf(obj)) {
    const count = wordsOf(name).length;
    if (count < 2 || count > 3) failed.add('ability_name_words');
  }

  for (const npc of npcsOf(obj)) {
    const inferred = inferGenderFromText(String(npc.description ?? '') + ' ' + String(npc.greeting ?? ''));
    if (inferred !== null && (npc.gender === 'male' || npc.gender === 'female') && inferred !== npc.gender) {
      failed.add('npc_gender_mismatch');
    }
  }

  if (route === 'combat_narration') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) failed.add('text_json_wrapper');
    if (/^["'“‘]/.test(trimmed) && /["'”’]$/.test(trimmed)) failed.add('text_quotes');
    const sentences = sentenceCount(trimmed);
    if (sentences < 2 || sentences > 4) failed.add('narration_sentences');
  }

  if (all.some((s) => META_COMMENTARY.some((re) => re.test(s)))) failed.add('meta_commentary');

  return TONE_RULES.filter((id) => failed.has(id));
}

// -- Structural check --------------------------------------------------------

const GENDERS = ['male', 'female'];
const inRange = (arr, min, max) => Array.isArray(arr) && arr.length >= min && arr.length <= max;

/**
 * Offline structural validity of a reply: `parsedOrText` is the parsed object for a json route and the
 * reply text for a text route. Returns rule ids; an empty array means the reply is structurally valid.
 */
export function structuralCheck(route, parsedOrText) {
  const bad = [];
  const p = parsedOrText;
  switch (route) {
    case 'creation_race':
      if (!isObject(p) || !isNonEmptyString(p.raceName)) bad.push('missing_race_name');
      break;
    case 'creation_class_reveal':
      if (!isObject(p) || !isNonEmptyString(p.className)) bad.push('missing_class_name');
      if (!isObject(p) || !isObject(p.firstAbility)) bad.push('missing_first_ability');
      break;
    case 'creation_class':
      if (!isObject(p) || !isObject(p.stats)) bad.push('missing_stats');
      if (!isObject(p) || !Array.isArray(p.abilities) || p.abilities.length !== 2) bad.push('abilities_count');
      break;
    case 'world_gen_start':
      if (!isObject(p) || !isNonEmptyString(p.regionName)) bad.push('missing_region_name');
      if (!isObject(p) || !isObject(p.startLocation) || !isNonEmptyString(p.startLocation.name)) bad.push('missing_start_location');
      if (!isObject(p) || !isObject(p.firstNpc) || !GENDERS.includes(p.firstNpc.gender)) bad.push('npc_gender_missing');
      break;
    case 'world_gen':
      if (!isObject(p) || !inRange(p.locations, 2, 4)) bad.push('locations_count');
      if (!isObject(p) || !inRange(p.enemies, 2, 3)) bad.push('enemies_count');
      if (!isObject(p) || (Array.isArray(p.npcs) && p.npcs.some((x) => !isObject(x) || !GENDERS.includes(x.gender)))) {
        bad.push('npc_gender_missing');
      }
      break;
    case 'skill_gen':
      if (!isObject(p) || !Array.isArray(p.skills) || p.skills.length < 1) bad.push('missing_skills');
      break;
    case 'renown_perk_gen':
      if (!isObject(p) || !Array.isArray(p.perks) || p.perks.length < 1) bad.push('missing_perks');
      break;
    case 'npc_conversation': {
      const obj = typeof p === 'string' ? extractJsonObject(p) : isObject(p) ? p : undefined;
      if (!obj || !isNonEmptyString(obj.dialogue)) bad.push('missing_dialogue');
      break;
    }
    case 'combat_narration':
      if (typeof p !== 'string' || p.trim() === '') bad.push('empty_text');
      break;
    default:
      bad.push('unknown_route');
  }
  return bad;
}

// -- Record builder ----------------------------------------------------------

const STOP_REASON = /^[a-z_]{1,40}$/i;
const RULE_ID = /^[a-z_]{1,40}$/;

/** A sample with only the whitelisted fields; anything else (text, prompt, headers) is dropped. */
function cleanSample(s) {
  const x = isObject(s) ? s : {};
  return {
    ok: x.ok === true,
    stopReason: typeof x.stopReason === 'string' && STOP_REASON.test(x.stopReason) ? x.stopReason : null,
    latencyMs: n(x.latencyMs),
    inputTokens: n(x.inputTokens),
    outputTokens: n(x.outputTokens),
    cacheWriteTokens: n(x.cacheWriteTokens),
    cacheReadTokens: n(x.cacheReadTokens),
    schemaOk: x.schemaOk === true,
    toneFailures: Array.isArray(x.toneFailures) ? x.toneFailures.filter((r) => typeof r === 'string' && RULE_ID.test(r)) : [],
  };
}

/** A Run B or caching call: the sample fields minus the quality flags. */
function cleanCall(c) {
  const s = cleanSample(c);
  return {
    ok: s.ok,
    stopReason: s.stopReason,
    latencyMs: s.latencyMs,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheWriteTokens: s.cacheWriteTokens,
    cacheReadTokens: s.cacheReadTokens,
  };
}

/**
 * The measurement record in its fixed key order (so re-runs diff cleanly), with every derived field
 * recomputed from the raw samples. input: { status, model, recordedAt, environment, totals: { calls,
 * costMicroUsd }, routes: { [route]: { efforts: { low: { samples }, medium: { samples } }, runB } },
 * caching: { [route]: { call1, call2 } }, classReveal: { latenciesMs, parallelBuilt } }.
 */
export function buildMeasurementRecord(input) {
  const i = isObject(input) ? input : {};
  const routes = {};
  for (const route of LLM_SWEEP_ROUTES) {
    const src = isObject(i.routes) && isObject(i.routes[route]) ? i.routes[route] : {};
    const efforts = {};
    for (const effort of LLM_SWEEP_EFFORTS) {
      const cell = isObject(src.efforts) && isObject(src.efforts[effort]) ? src.efforts[effort] : {};
      efforts[effort] = { samples: (Array.isArray(cell.samples) ? cell.samples : []).map(cleanSample) };
    }
    const runB = (Array.isArray(src.runB) ? src.runB : []).map(cleanCall);
    const d = deriveRecordFields({ efforts, runB });
    routes[route] = {
      efforts,
      chosenEffort: d.chosenEffort,
      tie: d.tie,
      p99OutputTokens: d.p99OutputTokens,
      maxTokens: d.maxTokens,
      suggestedTimeoutMs: d.suggestedTimeoutMs,
      insufficientData: d.insufficientData,
      runB,
    };
  }

  const caching = {};
  for (const route of LLM_SWEEP_ROUTES) {
    const c = isObject(i.caching) ? i.caching[route] : undefined;
    if (!isObject(c)) continue;
    const call1 = cleanCall(c.call1);
    const call2 = cleanCall(c.call2);
    caching[route] = { call1, call2, ...cacheVerdict({ call1, call2 }) };
  }

  const latencies = (Array.isArray(i.classReveal?.latenciesMs) ? i.classReveal.latenciesMs : []).filter(
    (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0,
  );
  const lat = lat06Decision(latencies);
  const totals = isObject(i.totals) ? i.totals : {};

  return {
    schemaVersion: 1,
    status: typeof i.status === 'string' ? i.status : 'not_run',
    model: typeof i.model === 'string' ? i.model : null,
    recordedAt: typeof i.recordedAt === 'string' ? i.recordedAt : null,
    environment: typeof i.environment === 'string' ? i.environment : 'local',
    totals: { calls: Math.trunc(n(totals.calls)), costMicroUsd: String(BigInt(totals.costMicroUsd ?? 0)) },
    routes,
    caching,
    classReveal: {
      latenciesMs: latencies,
      p50Ms: lat.p50Ms,
      p95Ms: lat.p95Ms,
      thresholdMs: LLM_CLASS_REVEAL_THRESHOLD_MS,
      verdict: lat.verdict,
      parallelBuilt: lat.verdict === 'build' && i.classReveal?.parallelBuilt === true,
    },
  };
}
