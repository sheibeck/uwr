// Classifies creation entries (event_creation rows plus local echoes and errors) into FeedLine-ready
// lines (CRE-01). Phase 47's lines.ts ignores the row kind for segment rows, so the creation slice
// classifies by kind first (RESEARCH Pitfall 6). All transforms are plain-text: no markup is
// interpreted, keywords and color tokens are never honored, and every string reaches FeedLine as a
// text node. Pure: no Vue, no server imports.

import { cleanServerText } from '../console/cleanServerText';
import { KEEPER_LABEL } from '../console/lines';
import type { FeedLineView, LineKind, SegmentLike } from '../console/lines';

/** Structural subset of an entry in the creation feed store. */
export interface CreationEntryLike {
  key: string;
  origin: 'server' | 'local';
  kind: string;
  message: string;
  segments: readonly SegmentLike[] | null;
}

export interface CreationLine {
  key: string;
  line: FeedLineView;
  /** creation_warning: the first line carries the warning icon. */
  warning: boolean;
}

const BOLD_MARKER = /\*\*/g;

/**
 * The server writes [bracket] command words and **bold** markers into creation text. Both are
 * removed as plain text (brackets unwrapped, color tokens dropped, ends trimmed). Newlines stay.
 * Markers go first so the trim in cleanServerText is the last step.
 */
export function cleanCreationText(text: string): string {
  if (typeof text !== 'string') return '';
  return cleanServerText(text.replace(BOLD_MARKER, ''));
}

function makeLine(
  key: string,
  kind: LineKind,
  text: string,
  label: string | null,
  continued = false,
): FeedLineView {
  return {
    key,
    kind,
    label,
    speaker: null,
    speakerNpcId: null,
    direction: null,
    title: null,
    text,
    queued: false,
    keywordEligible: false,
    parts: null,
    titleParts: null,
    speakerKeyword: null,
    ...(continued ? { continued: true } : {}),
  };
}

function localLines(entry: CreationEntryLike): CreationLine[] {
  // Local text is what the player typed or clicked, or the client's own copy: never cleaned.
  if (entry.message === '') return [];
  const key = `${entry.key}:0`;
  const kind: LineKind = entry.kind === 'echo' ? 'echo' : 'error';
  return [{ key, line: makeLine(key, kind, entry.message, null), warning: false }];
}

function serverLines(entry: CreationEntryLike): CreationLine[] {
  if (entry.kind === 'creation_error') {
    const text = cleanCreationText(entry.message);
    if (text === '') return [];
    const key = `${entry.key}:0`;
    return [{ key, line: makeLine(key, 'error', text, null), warning: false }];
  }
  const warn = entry.kind === 'creation_warning';
  const out: CreationLine[] = [];
  const push = (text: string): void => {
    const key = `${entry.key}:${out.length}`;
    // Every segment of one row is Keeper narration: the first carries the label, the rest are paragraphs.
    out.push({
      key,
      line: makeLine(key, 'keeper', text, KEEPER_LABEL, out.length > 0),
      warning: warn && out.length === 0,
    });
  };
  const segments = entry.segments;
  if (Array.isArray(segments) && segments.length > 0) {
    for (const segment of segments) {
      const text = segment ? cleanCreationText(segment.text) : '';
      if (text !== '') push(text);
    }
    return out;
  }
  const text = cleanCreationText(entry.message);
  if (text !== '') push(text);
  return out;
}

export function creationLines(entries: readonly CreationEntryLike[]): CreationLine[] {
  const out: CreationLine[] = [];
  for (const entry of entries) {
    const lines = entry.origin === 'local' ? localLines(entry) : serverLines(entry);
    for (const line of lines) out.push(line);
  }
  return out;
}
