// Loot links in the feed (quick 261008-f3m, owner 2026-10-08): the pieces of a server loot line
// (parsed by @game-data/loot_line) become keyword parts. Text only: an item is drawn as `[name]`
// and the take-all link as `[Take all]`; tokens are never shown. An item is clickable only while
// its loot id is in the player's own my_combat_loot (matched by id, never by name), and
// [Take all] only while any item of THIS line still is. The server re-checks ownership and writes
// every success and refusal line itself.
//
// Phase 51.4 (Loot Rails) keep-or-retire, ROADMAP owner note 2026-10-08: these links stay until
// the loot rails ship, then the owner decides whether they remain as a shortcut or retire. The
// loot rails can reuse @game-data/loot_line, the loot/lootAll keyword kinds, game.loot and the
// take actions. Retiring removes the parseLootLine branch in lines.ts and the two keyword kinds.
//
// Pure: no Vue.

import type { LootLinePiece } from '@game-data/loot_line';
import type { KeywordPart } from './keywords';

/** The entry name of the take-all link; keywordActionLabel makes it 'Take all loot'. */
export const TAKE_ALL_ENTRY_NAME = 'all loot';

/** The line as the player reads it: items and take-all in brackets. */
export function lootPlainText(pieces: readonly LootLinePiece[]): string {
  let text = '';
  for (const piece of pieces) {
    if (piece.kind === 'text') text += piece.text;
    else if (piece.kind === 'item') text += `[${piece.name}]`;
    else text += `[${piece.label}]`;
  }
  return text;
}

/** One keyword part per piece; entries only for ids still in my_combat_loot. */
export function lootParts(pieces: readonly LootLinePiece[], available: ReadonlySet<bigint>): KeywordPart[] {
  let anyAvailable = false;
  for (const piece of pieces) {
    if (piece.kind === 'item' && available.has(piece.lootId)) anyAvailable = true;
  }
  return pieces.map((piece): KeywordPart => {
    if (piece.kind === 'text') return { text: piece.text, entry: null };
    if (piece.kind === 'item') {
      return {
        text: `[${piece.name}]`,
        entry: available.has(piece.lootId) ? { kind: 'loot', id: piece.lootId, name: piece.name } : null,
        rarity: piece.rarity,
      };
    }
    return {
      text: `[${piece.label}]`,
      entry: anyAvailable ? { kind: 'lootAll', id: 0n, name: TAKE_ALL_ENTRY_NAME } : null,
    };
  });
}
