// Action label for a keyword button (title and aria-label). 47-UI-SPEC "Keywords (CON-02)".

import { NEARBY_COPY } from '../rails/pools';
import type { KeywordEntry, KeywordKind } from './keywords';

const VERBS: Readonly<Record<KeywordKind, string>> = {
  npc: 'Talk to',
  enemy: NEARBY_COPY.actions.pull,
  place: 'Travel to',
  node: 'Examine',
  player: 'Whisper',
  loot: 'Take',
  lootAll: 'Take',
  command: '',
};

// An enemy keyword reads like the Nearby card it acts as (51.3.1.1 D-39): a named or World event enemy
// is fought, a family (or an entry with no target) is pulled. The words are the Nearby action words,
// so the keyword and the button share one string (D-58 copy review).
function enemyVerb(entry: KeywordEntry): string {
  return entry.target === 'named' || entry.target === 'event' ? NEARBY_COPY.actions.fight : NEARBY_COPY.actions.pull;
}

export function keywordActionLabel(entry: KeywordEntry): string {
  // A command link reads as the command itself: 'Respawn'.
  if (entry.kind === 'command') return entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
  const verb = entry.kind === 'enemy' ? enemyVerb(entry) : VERBS[entry.kind];
  return `${verb} ${entry.name}`;
}
