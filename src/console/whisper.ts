// Parsers for the server's player-to-player and NPC line formats (47-RESEARCH Q5).
//   whisper sent:     You whisper to ${name}: "${message}"
//   whisper received: ${name} whispers: "${message}"
//   group chat:       ${name}: ${text}
//   NPC without segments: Name says, "text"  or  Name: text
// All three are total: a non-matching line returns null.

const WHISPER_SENT = /^You whisper to (.+?): "([\s\S]*)"$/;
const WHISPER_RECEIVED = /^(.+?) whispers: "([\s\S]*)"$/;
const NPC_SAYS = /^(.+?) says, "([\s\S]*)"$/;
const NPC_COLON = /^([^:\n]{1,80}): ([\s\S]+)$/;

export function parseWhisper(
  message: string,
): { direction: 'sent' | 'received'; name: string; text: string } | null {
  if (typeof message !== 'string') return null;
  const sent = WHISPER_SENT.exec(message);
  if (sent) return { direction: 'sent', name: sent[1], text: sent[2] };
  const received = WHISPER_RECEIVED.exec(message);
  if (received) return { direction: 'received', name: received[1], text: received[2] };
  return null;
}

/** Party chat is `${member}: ${text}`; names compare exactly (the server writes character.name). */
export function parsePartyChat(
  message: string,
  memberNames: readonly string[],
): { name: string; text: string } | null {
  if (typeof message !== 'string') return null;
  const names = memberNames.filter((n) => typeof n === 'string' && n !== '');
  names.sort((a, b) => b.length - a.length);
  for (const name of names) {
    const prefix = `${name}: `;
    if (message.startsWith(prefix)) return { name, text: message.slice(prefix.length) };
  }
  return null;
}

export function parseNpcSays(message: string): { name: string; text: string } | null {
  if (typeof message !== 'string') return null;
  const says = NPC_SAYS.exec(message);
  if (says) return { name: says[1], text: says[2] };
  const colon = NPC_COLON.exec(message);
  if (colon) return { name: colon[1], text: colon[2] };
  return null;
}
