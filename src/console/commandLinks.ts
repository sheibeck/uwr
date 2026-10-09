// Command links in the feed (owner, 2026-10-09: "something that shows up as a clickable [respawn] in
// the narrative interface as a placeholder mechanism"). A server system line that names one of the
// CLICKABLE_COMMANDS in brackets gets that word as a button that sends the command, as if typed. Only
// the listed commands, only in server-authored system lines (never player-typed text), and the
// brackets stay visible. Pure: no Vue.

import { CLICKABLE_COMMANDS } from '@game-data/death_lines';
import type { KeywordPart } from './keywords';

const COMMANDS = new Set(CLICKABLE_COMMANDS.map((command) => command.toLowerCase()));

/** Whether a word is one of the commands the feed may draw as a button. */
export function isClickableCommand(word: string): boolean {
  return COMMANDS.has(word.trim().toLowerCase());
}

/** Splits the plain parts of a line on `[command]` tokens; existing keyword parts are kept as they are. */
export function withCommandParts(parts: readonly KeywordPart[]): KeywordPart[] {
  const out: KeywordPart[] = [];
  for (const part of parts) {
    if (part.entry !== null || !part.text.includes('[')) {
      out.push(part);
      continue;
    }
    const pattern = /\[([^[\]\n]+)\]/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(part.text)) !== null) {
      const word = match[1];
      if (!isClickableCommand(word)) continue;
      if (match.index > last) out.push({ text: part.text.slice(last, match.index), entry: null });
      out.push({ text: match[0], entry: { kind: 'command', id: 0n, name: word.trim().toLowerCase() } });
      last = match.index + match[0].length;
    }
    if (last === 0) {
      out.push(part);
    } else if (last < part.text.length) {
      out.push({ text: part.text.slice(last), entry: null });
    }
  }
  return out;
}
