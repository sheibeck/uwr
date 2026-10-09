// The death prompt (owner, 2026-10-09: "It's ok if we just have commands to respawn instead of a full
// ui. something that shows up as a clickable [respawn] in the narrative interface as a placeholder
// mechanism." and "Sarcastic you have fallen verbiage. Type [respawn] to awaken at {place}.").
// The server writes the line after a fight in which you fell, and again when you come back in while
// dead (refresh, reconnect, choosing the character). The client turns [respawn] in a server system
// line into a button that sends the command. Pure data, shared with the client through @game-data.

/** The typed command that brings a dead character back at the bind point. */
export const RESPAWN_COMMAND = 'respawn';

/**
 * Commands the client may draw as buttons when a server system line names them in brackets. Only
 * these: any other bracketed word stays plain text.
 */
export const CLICKABLE_COMMANDS: readonly string[] = [RESPAWN_COMMAND];

/** The sarcastic opening; one is picked per line, deterministically from a seed. */
export const DEATH_LINE_OPENINGS: readonly string[] = [
  'You have fallen, which is certainly one way to end a fight.',
  'You died bravely, some will say. Not many, but some.',
  'You are dead. The ground seems unimpressed.',
];

/** The death prompt: a sarcastic opening, then how to get up again. */
export function deathPromptLine(place: string, seed: bigint): string {
  const count = BigInt(DEATH_LINE_OPENINGS.length);
  const index = Number(((seed % count) + count) % count);
  return `${DEATH_LINE_OPENINGS[index]} Type [${RESPAWN_COMMAND}] to awaken at ${place}.`;
}

/** Shown when a living character types the command. */
export const RESPAWN_NOT_DEAD = 'You are not dead. Yet.';
/** Shown when the command is typed while the fight that killed you is still going. */
export const RESPAWN_IN_COMBAT = 'You cannot respawn until the fight is over.';
