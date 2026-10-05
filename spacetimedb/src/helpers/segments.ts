/**
 * Keeper reply segments (Phase 46, SEG-01, SEG-02, SEG-04): the pure contract.
 *
 * A narrative reply is stored as an ordered list of segments, `{kind, speaker, text}`, with an
 * optional `speakerNpcId` for dialogue by a known NPC. This module owns every rule about them:
 * the clamps (6 segments, 600 code points each), the canonical speaker (only "The Keeper" or the
 * canonical name of a present speaker is ever stored, never a string copied from the model), the
 * Keeper wrapping of server-composed prose, the flattening used for the plain `message`, and the
 * malformed-reply fallback ladder that never throws and never returns nothing.
 *
 * Narrative-type agnostic on purpose: the caller supplies the present speakers, the player names
 * and the fallback line, so Phase 46.1 reuses it unchanged for big-moment and end-of-fight combat
 * narration.
 *
 * Pure: the only import is truncateCodePoints. No server SDK, no events, no apply layer, so
 * scripts/llm/*.mjs can import this file directly and the suites that mock ./events are unaffected.
 * Every function is total: no input makes any of them throw.
 */
import { truncateCodePoints } from '../data/llm_layers';

export const SEGMENT_KINDS = ['narration', 'dialogue'] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];
export const KEEPER_SPEAKER = 'The Keeper';
export const MAX_SEGMENTS = 6;
/** Per-segment text cap, counted in Unicode code points. */
export const MAX_SEGMENT_CHARS = 600;
export const TRUNCATION_MARK = '…';

export type Segment = { kind: SegmentKind; speaker: string; text: string; speakerNpcId?: bigint };
export type PresentSpeaker = { name: string; id?: bigint };
export type SegmentSource = 'segments' | 'legacy_dialogue' | 'legacy_narrative' | 'prose' | 'fallback';

export interface ReplyLadderOptions {
  /** Who may speak in a dialogue segment. */
  present: readonly PresentSpeaker[];
  /** Dialogue attributed to these (or to "you") is dropped. */
  playerNames: readonly string[];
  /** In-voice line when nothing usable remains. */
  fallbackLine: string;
  /** npc_conversation: salvage a top-level "dialogue" string (OQ2). */
  legacyDialogueSpeaker?: PresentSpeaker;
  /** combat_narration: salvage a top-level "narrative" string. */
  legacyNarrativeField?: boolean;
  /** combat_narration: wrap usable non-JSON prose as Keeper narration. */
  salvageProse?: boolean;
  /** combat_narration passes stripNarrationSelfCorrection. */
  cleanProse?: (text: string) => string;
}

export interface ReplyLadderResult {
  segments: Segment[];
  source: SegmentSource;
  parsed: Record<string, unknown> | undefined;
}

/** How many items of a model array are examined at all (bounds the work before per-item processing). */
const EXAMINE_LIMIT = MAX_SEGMENTS * 2;
/** A cut lands on whitespace only when it keeps at least this many code points of the allowed slice. */
const CUT_WINDOW = 120;

/** A lone (unpaired) surrogate half. Local copy: llm_layers.ts does not export it and must not change. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** C0 controls except LF (CR and tab are converted first), DEL and C1, bidi controls, zero-width space, BOM. */
const STRIPPED_CHARS = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩​﻿]/g;

const PLAYER_SPEAKER_KEYS = ['you', 'yourself', 'player', 'the player'];
const KEEPER_SPEAKER_KEYS = ['the keeper', 'keeper', 'keeper of knowledge', 'the keeper of knowledge'];

/** NFKC, lower case, whitespace runs to one space, trimmed. */
export function speakerKey(name: string): string {
  try {
    return String(name ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

/** Everything cleanSegmentText does except the quote strip and the clamp. */
function sanitize(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(LONE_SURROGATE, '�')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(STRIPPED_CHARS, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Keep at most `max` code points; a cut text ends with U+2026 and never splits an astral character. */
function clampTo(text: string, max: number): string {
  if (Array.from(text).length <= max) return text;
  const allowed = Array.from(truncateCodePoints(text, max - 1));
  const floor = Math.max(0, max - 1 - CUT_WINDOW);
  let cut = allowed.length;
  for (let i = allowed.length - 1; i >= floor; i--) {
    if (/\s/.test(allowed[i])) {
      cut = i;
      break;
    }
  }
  return allowed.slice(0, cut).join('').trimEnd() + TRUNCATION_MARK;
}

function stripOuterQuotes(text: string): string {
  const cps = Array.from(text);
  if (cps.length < 2) return text;
  const first = cps[0];
  const last = cps[cps.length - 1];
  const straight = first === '"' && last === '"';
  const curly = first === '“' && last === '”';
  if (!straight && !curly) return text;
  const inner = cps.slice(1, -1);
  if (!innerQuotesBalanced(inner)) return text; // the outer marks are two separate quoted phrases, not one pair
  return inner.join('').trim();
}

/**
 * Do the double quotes inside the candidate pair nest cleanly (every one opened is closed, none closes
 * first)? A straight quote opens when it follows the start or whitespace and precedes a non-space
 * character, and closes otherwise. `"Hello," he said, "goodbye"` fails (the first inner quote closes
 * before anything opened), so its outer marks are kept. `"He said "no" to me"` passes.
 */
function innerQuotesBalanced(inner: readonly string[]): boolean {
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '“') {
      depth++;
    } else if (c === '”') {
      depth--;
    } else if (c === '"') {
      const prev = i === 0 ? '' : inner[i - 1];
      const next = i === inner.length - 1 ? '' : inner[i + 1];
      const opens = (prev === '' || /\s/.test(prev)) && next !== '' && !/\s/.test(next);
      depth += opens ? 1 : -1;
    } else {
      continue;
    }
    if (depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Clean one segment text. Non-string gives ''. Dialogue loses exactly one matching pair of outer
 * double quotes (the flattened message adds its own). Over 600 code points it is cut cleanly.
 */
export function cleanSegmentText(raw: unknown, kind: SegmentKind): string {
  let text = sanitize(raw);
  // One speaker turn is one paragraph: a newline inside dialogue could forge a second attributed
  // line in the flattened message.
  if (kind === 'dialogue') text = stripOuterQuotes(text.replace(/\s*\n\s*/g, ' '));
  return clampTo(text, MAX_SEGMENT_CHARS);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keeperNarration(text: string): Segment {
  return { kind: 'narration', speaker: KEEPER_SPEAKER, text };
}

/**
 * Validate a model's segment array into stored segments. Order is preserved, duplicates and
 * same-speaker neighbours are kept. [] means "nothing valid": the caller runs the ladder.
 */
export function normalizeSegments(
  raw: unknown,
  present: readonly PresentSpeaker[],
  playerNames: readonly string[] = [],
): Segment[] {
  const list = Array.isArray(raw) ? raw.slice(0, EXAMINE_LIMIT) : [];
  const playerKeys = new Set<string>(PLAYER_SPEAKER_KEYS);
  for (const name of Array.isArray(playerNames) ? playerNames : []) {
    const key = speakerKey(name);
    if (key !== '') playerKeys.add(key);
  }
  const speakers = Array.isArray(present) ? present : [];
  const out: Segment[] = [];
  for (const item of list) {
    if (out.length >= MAX_SEGMENTS) break;
    if (!isPlainObject(item)) continue;
    const kind: SegmentKind = item.kind === 'dialogue' ? 'dialogue' : 'narration';
    const text = cleanSegmentText(item.text, kind);
    if (text === '') continue;
    if (kind === 'narration') {
      out.push(keeperNarration(text));
      continue;
    }
    const key = speakerKey(typeof item.speaker === 'string' ? item.speaker : '');
    if (key !== '' && playerKeys.has(key)) continue; // the player is never a speaker
    const who = key === '' ? undefined : speakers.find((p) => speakerKey(p?.name) === key);
    if (who) {
      const seg: Segment = { kind: 'dialogue', speaker: who.name, text };
      if (who.id !== undefined) seg.speakerNpcId = who.id;
      out.push(seg);
      continue;
    }
    if (KEEPER_SPEAKER_KEYS.includes(key)) {
      out.push(keeperNarration(text));
      continue;
    }
    // Unmatched or missing speaker: Keeper narration, the speech kept inside quotes (formatting only).
    out.push(keeperNarration(`"${clampTo(text, MAX_SEGMENT_CHARS - 2)}"`));
  }
  return out;
}

/** Merge the adjacent pair with the smallest combined length (leftmost on ties) until at most `max` remain. */
function packParagraphs(paragraphs: string[], max: number): string[] {
  const parts = paragraphs.slice();
  while (parts.length > max) {
    let best = 0;
    let bestLen = Infinity;
    for (let i = 0; i < parts.length - 1; i++) {
      const len = Array.from(parts[i]).length + Array.from(parts[i + 1]).length;
      if (len < bestLen) {
        bestLen = len;
        best = i;
      }
    }
    parts.splice(best, 2, parts[best] + '\n\n' + parts[best + 1]);
  }
  return parts;
}

/**
 * Wrap server-composed prose as Keeper narration: one segment per blank-line paragraph, packed
 * down to 6 when there are more, each clamped to 600 code points. Blank input gives [].
 */
export function keeperSegments(text: string): Segment[] {
  const clean = sanitize(text);
  if (clean === '') return [];
  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  return packParagraphs(paragraphs, MAX_SEGMENTS)
    .map((p) => cleanSegmentText(p, 'narration'))
    .filter((p) => p !== '')
    .map(keeperNarration);
}

/** The in-voice line as exactly one Keeper narration segment (never split, never empty). */
export function keeperFallback(line: string): Segment[] {
  return [keeperNarration(cleanSegmentText(line, 'narration') || '...')];
}

/** The plain `message` for a segment list: narration as is, dialogue as `<speaker> says, "<text>"`. */
export function flattenSegments(segments: readonly Segment[]): string {
  if (!Array.isArray(segments)) return '';
  return segments
    .map((s) => (s.kind === 'dialogue' ? `${s.speaker} says, "${s.text}"` : s.text))
    .join('\n\n');
}

/** Tolerant JSON object extraction (fence strip, brace slice). Never throws; undefined unless a plain object. */
export function parseReplyObject(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    let text = raw.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
    const value: unknown = JSON.parse(text);
    return isPlainObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

const REFUSAL_OPENING = /^(?:i can't|i cannot|i won't|i am unable|i'm unable|sorry\b)/i;

/** Is this reply usable as salvaged narration (not JSON debris, not a refusal, not too short)? */
export function isUsableProse(text: string): boolean {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t === '') return false;
  if (t.startsWith('{') || t.startsWith('[') || t.startsWith('```')) return false;
  const letters = t.match(/\p{L}/gu);
  if (!letters || letters.length < 8) return false;
  const lower = t.toLowerCase().replace(/’/g, "'");
  if (lower.includes('as an ai') || lower.includes('language model') || lower.includes("i'm sorry, but")) {
    return false;
  }
  if (REFUSAL_OPENING.test(lower)) return false;
  return true;
}

/**
 * The fallback ladder. Never throws, never returns an empty list.
 *  1. a parsed object whose `segments` normalize to at least one segment
 *  2. the legacy top-level `dialogue` string, as one dialogue segment from a known speaker
 *  3. the legacy top-level `narrative` string, as Keeper narration
 *  4. usable non-JSON prose, as Keeper narration
 *  5. the caller's in-voice line
 * `parsed` is returned in every case.
 */
export function segmentsFromReply(resultText: unknown, options: ReplyLadderOptions): ReplyLadderResult {
  const parsed = parseReplyObject(resultText);
  try {
    const present = options?.present ?? [];
    const playerNames = options?.playerNames ?? [];

    if (parsed && Array.isArray(parsed.segments)) {
      const segments = normalizeSegments(parsed.segments, present, playerNames);
      if (segments.length > 0) return { segments, source: 'segments', parsed };
    }

    const speaker = options?.legacyDialogueSpeaker;
    if (parsed && speaker && typeof parsed.dialogue === 'string') {
      const text = cleanSegmentText(parsed.dialogue, 'dialogue');
      if (text !== '') {
        const seg: Segment = { kind: 'dialogue', speaker: speaker.name, text };
        if (speaker.id !== undefined) seg.speakerNpcId = speaker.id;
        return { segments: [seg], source: 'legacy_dialogue', parsed };
      }
    }

    if (parsed && options?.legacyNarrativeField && typeof parsed.narrative === 'string') {
      const cleaned = options.cleanProse ? options.cleanProse(parsed.narrative) : parsed.narrative;
      const segments = keeperSegments(cleaned);
      if (segments.length > 0) return { segments, source: 'legacy_narrative', parsed };
    }

    if (!parsed && options?.salvageProse && typeof resultText === 'string') {
      const cleaned = options.cleanProse ? options.cleanProse(resultText) : resultText;
      if (isUsableProse(cleaned)) {
        const segments = keeperSegments(cleaned);
        if (segments.length > 0) return { segments, source: 'prose', parsed };
      }
    }
  } catch {
    // fall through to the in-voice line: a malformed reply must never roll back the apply
  }
  return { segments: keeperFallback(options?.fallbackLine ?? ''), source: 'fallback', parsed };
}
