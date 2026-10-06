// Command word table for the console input router (47-CONTEXT "Input routing", Command rule).
// A typed line runs as a command only when it starts with "/" or when its first word is a command
// word AND the rest of the line has that command's exact shape. This file holds the words and
// shapes; routeInput.ts applies them.

export const COMMAND_WORDS = [
  'who',
  'accept',
  'decline',
  'leave',
  'invite',
  'kick',
  'promote',
  'whisper',
  'w',
  'friend',
  'endcombat',
  'end',
  'endc',
  'group',
  'renown',
  'factions',
  'faction',
  'events',
] as const;

export type CommandWord = (typeof COMMAND_WORDS)[number];

/** bare: nothing after the word. name: exactly one token. nameAndMessage: a name token plus a message. */
export type CommandShape = 'bare' | 'name' | 'nameAndMessage';

export const COMMAND_SHAPES: Readonly<Record<CommandWord, CommandShape>> = {
  who: 'bare',
  accept: 'bare',
  decline: 'bare',
  leave: 'bare',
  end: 'bare',
  endc: 'bare',
  endcombat: 'bare',
  renown: 'bare',
  factions: 'bare',
  events: 'bare',
  group: 'bare',
  invite: 'name',
  kick: 'name',
  promote: 'name',
  friend: 'name',
  faction: 'name',
  w: 'nameAndMessage',
  whisper: 'nameAndMessage',
};

/** Trim and split on runs of whitespace; an empty or blank line gives []. */
export function tokenize(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  return trimmed.split(/\s+/);
}

/** Exact word match after toLowerCase(); trailing punctuation ('who?') is not a command word. */
export function isCommandWord(token: string): token is CommandWord {
  return Object.prototype.hasOwnProperty.call(COMMAND_SHAPES, token.toLowerCase());
}
