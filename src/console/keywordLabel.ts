// Action label for a keyword button (title and aria-label). 47-UI-SPEC "Keywords (CON-02)".

import type { KeywordEntry, KeywordKind } from './keywords';

const VERBS: Readonly<Record<KeywordKind, string>> = {
  npc: 'Talk to',
  enemy: 'Pull',
  place: 'Travel to',
  node: 'Examine',
  player: 'Whisper',
  loot: 'Take',
  lootAll: 'Take',
};

export function keywordActionLabel(entry: KeywordEntry): string {
  return `${VERBS[entry.kind]} ${entry.name}`;
}
