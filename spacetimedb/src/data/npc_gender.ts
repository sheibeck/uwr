// ============================================================================
// NPC gender (pure module, no imports)
// ============================================================================
//
// User decision of 2026-09-30 (PR-02, PR-05): every NPC is male or female and is
// referred to as he or she, never it or a singular they. The Keeper is he, and
// the player's own character is always addressed as you (player characters have
// no stored gender).
//
// Resolution order for any NPC: a valid stored or model value, then the pronouns
// already written in the NPC's own description and greeting, then a stable
// FNV-1a hash of the lowercased name. The same input always gives the same
// answer and the result is never empty.
// ============================================================================

export const NPC_GENDERS = ['male', 'female'] as const;
export type NpcGender = (typeof NPC_GENDERS)[number];

/** Deterministic gender from a name: FNV-1a 32-bit over the trimmed, lowercased name. Even hash is male. */
export function genderFromName(name: unknown): NpcGender {
  const s = String(name ?? '').trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash = hash >>> 0;
  return hash % 2 === 0 ? 'male' : 'female';
}

const MALE_WORDS = /\b(?:he|him|his|himself)\b/gi;
const FEMALE_WORDS = /\b(?:she|her|hers|herself)\b/gi;

/** Gender implied by the pronouns in a text, or null on a tie or when there are none. */
export function inferGenderFromText(text: unknown): NpcGender | null {
  const s = typeof text === 'string' ? text : '';
  const male = (s.match(MALE_WORDS) ?? []).length;
  const female = (s.match(FEMALE_WORDS) ?? []).length;
  if (male > female) return 'male';
  if (female > male) return 'female';
  return null;
}

/** Clamp any value to male or female. Never returns anything else and never throws. */
export function resolveNpcGender(value: unknown, name: unknown, text?: string): NpcGender {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'male' || v === 'female') return v;
  }
  const inferred = inferGenderFromText(text ?? '');
  if (inferred !== null) return inferred;
  return genderFromName(name);
}

/** The single reader every consumer uses. Also covers rows written before the gender column existed. */
export function npcGender(row: any): NpcGender {
  return resolveNpcGender(
    row?.gender,
    row?.name ?? '',
    (row?.description ?? '') + ' ' + (row?.greeting ?? '')
  );
}

export function npcPronouns(gender: NpcGender): { subject: string; object: string; possessive: string } {
  return gender === 'female'
    ? { subject: 'she', object: 'her', possessive: 'her' }
    : { subject: 'he', object: 'him', possessive: 'his' };
}

/** The arrival sentence about NPCs at the home location. Empty when there are none. */
export function npcNoticeLine(npcs: { name: string; gender: NpcGender }[]): string {
  if (npcs.length === 0) return '';
  const names = npcs.map((n) => n.name).join(' and ');
  if (npcs.length === 1) {
    const p = npcPronouns(npcs[0].gender);
    return `You notice ${names} nearby. Perhaps ${p.subject} has something to say.`;
  }
  return `You notice ${names} nearby. Perhaps someone here has something to say.`;
}

/** The eight affinity lines of the consider command, built with the NPC's pronouns. */
export function npcRegardLine(name: string, gender: NpcGender, affinity: number): string {
  const p = npcPronouns(gender);
  if (affinity >= 100) return `${name} is devoted to you. A rare and unshakeable bond.`;
  if (affinity >= 75) return `${name} considers you a close friend. Trust runs deep here.`;
  if (affinity >= 50) return `${name} regards you warmly. You have earned ${p.possessive} respect.`;
  if (affinity >= 25) return `${name} recognizes you as a passing acquaintance. There is room to grow.`;
  if (affinity >= 0) return `${name} regards you with polite indifference. You are a stranger to ${p.object}.`;
  if (affinity >= -25) return `${name} eyes you warily. Something about you puts ${p.object} on edge.`;
  if (affinity >= -50) return `${name} makes no effort to hide ${p.possessive} dislike. Tread carefully.`;
  return `${name} despises you. Every word you speak deepens ${p.possessive} contempt.`;
}
