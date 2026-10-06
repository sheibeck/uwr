// Row classification: one feed entry (a server event row or a local entry) becomes zero or more
// labelled line views. See 47-RESEARCH "Row classification" and 47-UI-SPEC "Line kinds" and
// "Keywords (CON-02)".
//
// Rules that matter:
//   - A row with a non-empty segments array becomes one line per segment. Segment text is never
//     cleaned or interpreted (Phase 46 contract A6): markup in it stays literal text.
//   - A row without segments is classified by kind. Server-authored kinds have their old color
//     tokens and [bracket] markup removed; player-authored kinds (say, emote, whisper, group,
//     command) and local entries are never cleaned.
//   - Keywords apply only to eligible lines. Player-authored text (say, emote, whisper, party
//     chat, group-kind rows, the server command echo, local echoes) is never eligible, so a player
//     cannot plant a clickable travel, hail or whisper control in another player's feed (T-47-06).
//   - Combat entries (source 'combat', made by the feed store) become a Round header line or a
//     wind-up warning block line; neither is ever keyword-eligible. The server kinds
//     combat_round_header and combat_resolving render nothing: the client draws the headers and
//     the server writes no such rows today (48-UI-SPEC A15).
//   - buildFeedLines gives the first Keeper line of an entry carrying narratedRound a roundTag when
//     that round differs from the nearest preceding round header, or no header precedes it
//     (late narration, 48-UI-SPEC A22).
//   - The Error line for failed jobs is not produced here (research S1: the server already writes
//     its own in-voice failure line).
// Pure: no Vue, no server imports.

import { cleanServerText } from './cleanServerText';
import { findKeywords } from './keywords';
import type { KeywordEntry, KeywordPart, KeywordVocabulary } from './keywords';
import { parseNpcSays, parsePartyChat, parseWhisper } from './whisper';

export const KEEPER_LABEL = 'The Keeper';
export const DIALOGUE_SEGMENT_KIND = 'dialogue';

export type FeedSourceName = 'private' | 'location' | 'group' | 'world' | 'local' | 'combat';

export interface SegmentLike {
  kind: string;
  speaker: string;
  text: string;
  speakerNpcId?: bigint | null;
}

/** Structural subset of a feed entry. */
export interface LineSource {
  key: string;
  source: FeedSourceName;
  kind: string;
  message: string;
  segments: readonly SegmentLike[] | null | undefined;
  queued?: boolean;
  combatId?: bigint;
  roundNumber?: bigint;
  narratedRound?: bigint;
  windup?: { lead: string; ability: string; tail: string };
}

export type LineKind =
  | 'keeper'
  | 'npc'
  | 'whisper'
  | 'party'
  | 'system'
  | 'warning'
  | 'quest'
  | 'ripple'
  | 'worldEvent'
  | 'scene'
  | 'echo'
  | 'error'
  | 'say'
  | 'combat'
  | 'damage'
  | 'heal'
  | 'round'
  | 'windup';

export interface FeedLineView {
  /** `${source.key}:${index}` */
  key: string;
  kind: LineKind;
  /** 'The Keeper' | 'Quest' | 'Reward' | 'Faction' | 'Ripple' | 'World event' | null */
  label: string | null;
  /** NPC, whisper or party author name. */
  speaker: string | null;
  speakerNpcId: bigint | null;
  /** Whisper only. */
  direction: 'sent' | 'received' | null;
  /** Scene title. */
  title: string | null;
  text: string;
  /** Local echo held by the narrative queue. */
  queued: boolean;
  keywordEligible: boolean;
  /** Filled by buildFeedLines for eligible lines. */
  parts: KeywordPart[] | null;
  titleParts: KeywordPart[] | null;
  /** NPC speaker that is still at the location. */
  speakerKeyword: KeywordEntry | null;
  /** Round header lines. */
  roundNumber?: bigint | null;
  /** Round header lines: '{combatId}:{roundNumber}'. */
  roundKey?: string | null;
  /** Late narration: the round it narrates, when it differs from the header it sits under. */
  roundTag?: bigint | null;
  /** Wind-up block lines. */
  windup?: { lead: string; ability: string; tail: string } | null;
  /**
   * Player-typed text that fell back to a server-looking kind (group chat whose sender is not in
   * the party list, the command echo). Set only when true. FeedLine pins its body to normal
   * wrapping so a typed newline cannot draw a fake second system line.
   */
  playerAuthored?: boolean;
}

const KEEPER_KINDS = new Set(['narrative', 'llm', 'creation', 'combat_narration', 'class', 'character_created']);
const COMBAT_KINDS = new Set([
  'ability',
  'buff',
  'debuff',
  'combat',
  'combat_prompt',
  'combat_status',
]);
// Rendered nothing: the client draws the round headers and the server writes no such rows.
const RENDER_NOTHING_KINDS = new Set(['combat_round_header', 'combat_resolving']);
const QUEST_LABELS: Readonly<Record<string, string>> = {
  quest: 'Quest',
  reward: 'Reward',
  faction: 'Faction',
};

interface LineFields {
  kind: LineKind;
  text: string;
  label?: string | null;
  speaker?: string | null;
  speakerNpcId?: bigint | null;
  direction?: 'sent' | 'received' | null;
  title?: string | null;
  queued?: boolean;
  keywordEligible: boolean;
  roundNumber?: bigint | null;
  roundKey?: string | null;
  windup?: { lead: string; ability: string; tail: string } | null;
  playerAuthored?: boolean;
}

function makeLine(key: string, fields: LineFields): FeedLineView {
  return {
    key,
    kind: fields.kind,
    label: fields.label ?? null,
    speaker: fields.speaker ?? null,
    speakerNpcId: fields.speakerNpcId ?? null,
    direction: fields.direction ?? null,
    title: fields.title ?? null,
    text: fields.text,
    queued: fields.queued ?? false,
    keywordEligible: fields.keywordEligible,
    parts: null,
    titleParts: null,
    speakerKeyword: null,
    roundNumber: fields.roundNumber ?? null,
    roundKey: fields.roundKey ?? null,
    roundTag: null,
    windup: fields.windup ?? null,
    ...(fields.playerAuthored === true ? { playerAuthored: true } : {}),
  };
}

function splitScene(text: string): { title: string | null; body: string } {
  const lines = text.split('\n');
  if (lines.length < 2) return { title: null, body: text };
  return { title: lines[0], body: lines.slice(1).join('\n') };
}

function isBlank(text: unknown): boolean {
  return typeof text !== 'string' || text.trim() === '';
}

function classifySegments(entry: LineSource, segments: readonly SegmentLike[]): FeedLineView[] {
  const lines: FeedLineView[] = [];
  for (const segment of segments) {
    if (!segment || isBlank(segment.text)) continue;
    const key = `${entry.key}:${lines.length}`;
    if (segment.kind === DIALOGUE_SEGMENT_KIND) {
      lines.push(
        makeLine(key, {
          kind: 'npc',
          text: segment.text,
          speaker: segment.speaker,
          speakerNpcId: segment.speakerNpcId ?? null,
          keywordEligible: true,
        }),
      );
    } else {
      lines.push(makeLine(key, { kind: 'keeper', label: KEEPER_LABEL, text: segment.text, keywordEligible: true }));
    }
  }
  return lines;
}

function classifyLocal(entry: LineSource, key: string): FeedLineView[] {
  const text = entry.message;
  if (entry.kind === 'echo') {
    return [makeLine(key, { kind: 'echo', text, queued: entry.queued === true, keywordEligible: false })];
  }
  if (entry.kind === 'look') {
    const { title, body } = splitScene(text);
    return [makeLine(key, { kind: 'scene', title, text: body, keywordEligible: true })];
  }
  return [makeLine(key, { kind: 'system', text, keywordEligible: false })];
}

function classifyByKind(entry: LineSource, key: string, partyNames: readonly string[]): FeedLineView[] {
  const kind = entry.kind;
  const raw = entry.message;

  // Player-authored kinds: raw text, never keyword-eligible.
  if (kind === 'whisper') {
    const parsed = parseWhisper(raw);
    return [
      makeLine(key, {
        kind: 'whisper',
        text: parsed ? parsed.text : raw,
        speaker: parsed ? parsed.name : null,
        direction: parsed ? parsed.direction : null,
        keywordEligible: false,
      }),
    ];
  }
  if (kind === 'group') {
    const parsed = parsePartyChat(raw, partyNames);
    if (parsed) {
      return [makeLine(key, { kind: 'party', text: parsed.text, speaker: parsed.name, keywordEligible: false })];
    }
    return [makeLine(key, { kind: 'system', text: raw, keywordEligible: false, playerAuthored: true })];
  }
  if (kind === 'say' || kind === 'emote') {
    return [makeLine(key, { kind: 'say', text: raw, keywordEligible: false })];
  }
  if (kind === 'command') {
    return [makeLine(key, { kind: 'system', text: raw, keywordEligible: false, playerAuthored: true })];
  }

  if (RENDER_NOTHING_KINDS.has(kind)) return [];

  // Server-authored kinds: old markup removed.
  const text = cleanServerText(raw);
  if (isBlank(text)) return [];

  if (KEEPER_KINDS.has(kind)) {
    return [makeLine(key, { kind: 'keeper', label: KEEPER_LABEL, text, keywordEligible: true })];
  }
  if (kind === 'npc') {
    const parsed = parseNpcSays(text);
    return [
      makeLine(key, {
        kind: 'npc',
        // The spoken text sits inside typographic quotes, so its own ends are trimmed too.
        text: parsed ? parsed.text.trim() : text,
        speaker: parsed ? parsed.name : null,
        keywordEligible: true,
      }),
    ];
  }
  if (kind === 'look') {
    const { title, body } = splitScene(text);
    return [makeLine(key, { kind: 'scene', title, text: body, keywordEligible: true })];
  }
  if (Object.prototype.hasOwnProperty.call(QUEST_LABELS, kind)) {
    return [makeLine(key, { kind: 'quest', label: QUEST_LABELS[kind], text, keywordEligible: true })];
  }
  if (kind === 'world' || kind === 'renown') {
    return [makeLine(key, { kind: 'ripple', label: 'Ripple', text, keywordEligible: true })];
  }
  if (kind === 'world_event') {
    return [makeLine(key, { kind: 'worldEvent', label: 'World event', text, keywordEligible: true })];
  }
  if (kind === 'creation_error' || kind === 'blocked') {
    return [makeLine(key, { kind: 'error', text, keywordEligible: false })];
  }
  if (kind === 'warning') {
    return [makeLine(key, { kind: 'warning', text, keywordEligible: true })];
  }
  if (kind === 'damage') return [makeLine(key, { kind: 'damage', text, keywordEligible: false })];
  if (kind === 'heal') return [makeLine(key, { kind: 'heal', text, keywordEligible: false })];
  if (COMBAT_KINDS.has(kind)) return [makeLine(key, { kind: 'combat', text, keywordEligible: false })];

  // system, move, movement, presence, day_night, avoid, server_first and any unknown kind.
  return [makeLine(key, { kind: 'system', text, keywordEligible: true })];
}

function classifyCombat(entry: LineSource, key: string): FeedLineView[] {
  if (entry.kind === 'round') {
    if (entry.roundNumber === undefined) return [];
    return [
      makeLine(key, {
        kind: 'round',
        text: entry.message,
        roundNumber: entry.roundNumber,
        roundKey: entry.combatId === undefined ? null : `${entry.combatId}:${entry.roundNumber}`,
        keywordEligible: false,
      }),
    ];
  }
  if (entry.kind === 'windup' && entry.windup) {
    const { lead, ability, tail } = entry.windup;
    return [makeLine(key, { kind: 'windup', text: entry.message, windup: { lead, ability, tail }, keywordEligible: false })];
  }
  return [];
}

/** Classifies one entry into labelled line views (keyword parts are filled by buildFeedLines). */
export function classifyEntry(entry: LineSource, options: { partyNames: readonly string[] }): FeedLineView[] {
  if (entry.source === 'combat') return classifyCombat(entry, `${entry.key}:0`);
  const segments = entry.segments;
  if (Array.isArray(segments) && segments.length > 0) {
    return classifySegments(entry, segments);
  }
  if (isBlank(entry.message)) return [];
  const key = `${entry.key}:0`;
  if (entry.source === 'local') return classifyLocal(entry, key);
  return classifyByKind(entry, key, options.partyNames);
}

/** Classifies every entry, then fills keyword parts for eligible lines. */
export function buildFeedLines(
  entries: readonly LineSource[],
  options: {
    vocabulary: KeywordVocabulary;
    partyNames: readonly string[];
    npcsHere: readonly { id: bigint; name: string }[];
  },
): FeedLineView[] {
  const out: FeedLineView[] = [];
  let currentRound: bigint | null = null;
  for (const entry of entries) {
    const built: FeedLineView[] = [];
    for (const line of classifyEntry(entry, { partyNames: options.partyNames })) {
      if (line.kind === 'round' && line.roundNumber !== null && line.roundNumber !== undefined) {
        currentRound = line.roundNumber;
      }
      if (!line.keywordEligible) {
        built.push(line);
        continue;
      }
      const speakerNpc =
        line.speakerNpcId === null ? undefined : options.npcsHere.find((npc) => npc.id === line.speakerNpcId);
      built.push({
        ...line,
        parts: findKeywords(line.text, options.vocabulary),
        titleParts: line.title === null ? null : findKeywords(line.title, options.vocabulary),
        speakerKeyword: speakerNpc ? { kind: 'npc', id: speakerNpc.id, name: speakerNpc.name } : null,
      });
    }
    const narrated = entry.narratedRound;
    if (narrated !== undefined && (currentRound === null || narrated !== currentRound)) {
      const at = built.findIndex((line) => line.kind === 'keeper');
      if (at !== -1) built[at] = { ...built[at], roundTag: narrated };
    }
    for (const line of built) out.push(line);
  }
  return out;
}
