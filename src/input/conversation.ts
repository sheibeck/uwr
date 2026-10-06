// Conversation-mode words (47-CONTEXT "Conversation mode"): a farewell ends the conversation, a game
// action ends it and runs as a normal intent, anything else is spoken to the NPC.
// Place and node names are compared as strings and never compiled into a pattern.

export const FAREWELL_WORDS: readonly string[] = ['bye', 'farewell', 'leave', 'goodbye', 'end', 'quit', 'exit', 'back'];

export const BARE_GAME_ACTIONS: readonly string[] = [
  'look', 'l', 'inventory', 'inv', 'i', 'backpack', 'bp', 'bag', 'stats', 'abilities', 'ab',
  'quests', 'quest', 'bank', 'vendor', 'shop', 'store', 'craft', 'recipes', 'bind', 'camp', 'rest',
  'flee', 'run', 'loot', 'enemies', 'mobs', 'players', 'who', 'help', 'time', 'skills', 'explore',
  'hotbars', 'hotbar',
];

export interface GameActionContext {
  placeNames: readonly string[];
  nodeNames: readonly string[];
}

/** Case-insensitive, trimmed membership test. */
function hasName(names: readonly string[], candidate: string): boolean {
  const wanted = candidate.trim().toLowerCase();
  if (wanted === '') return false;
  for (const name of names) {
    if (name.trim().toLowerCase() === wanted) return true;
  }
  return false;
}

/** Case-insensitive farewell; one trailing run of '.', '!' or '?' is ignored. */
export function isFarewell(text: string): boolean {
  let lower = text.trim().toLowerCase();
  let end = lower.length;
  while (end > 0) {
    const ch = lower.charAt(end - 1);
    if (ch === '.' || ch === '!' || ch === '?') end -= 1;
    else break;
  }
  lower = lower.slice(0, end);
  return FAREWELL_WORDS.indexOf(lower) !== -1;
}

/** Shape-checked game actions that break out of a conversation (research A4). */
export function isGameAction(text: string, ctx: GameActionContext): boolean {
  const lower = text.trim().toLowerCase();
  if (lower === '') return false;
  if (BARE_GAME_ACTIONS.indexOf(lower) !== -1) return true;

  const split = /^(\S+)\s+([\s\S]+)$/.exec(lower);
  const first = split ? split[1] : lower;
  const rest = split ? split[2] : '';

  if (first === 'attack' || first === 'fight' || first === 'kill') return true;
  if (!split) return false;

  if (first === 'look') {
    const at = /^at\s+\S/.test(rest);
    if (at) return true;
  }
  if (first === 'go' || first === 'travel') {
    if (hasName(ctx.placeNames, rest)) return true;
    const afterTo = /^to\s+([\s\S]+)$/.exec(rest);
    if (afterTo && hasName(ctx.placeNames, afterTo[1])) return true;
    return false;
  }
  if (first === 'gather') return hasName(ctx.nodeNames, rest);
  if (first === 'buy' || first === 'sell' || first === 'craft') return true;
  return false;
}
