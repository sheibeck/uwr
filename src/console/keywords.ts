// Keyword vocabulary and matcher (47-RESEARCH "Keyword matcher (Q11)", 47-UI-SPEC "Keywords (CON-02)").
// Names known to the client (NPCs, pullable enemies, places, resource nodes, nearby players) are found in line text
// as soft-accent keywords. Design:
//   - manual code-point scanner, leftmost-longest, non-overlapping; no regex is ever built from a
//     name, so hostile names cannot cause ReDoS or regex errors (T-47-02)
//   - case folding is per code point and never changes the UTF-16 length, so indexes into the
//     folded copy are valid indexes into the original text
//   - whole-word: an edge is checked only where the name's own edge character is a letter, digit
//     or underscore (so "St." and "C++" work); neighbors are tested with Unicode property classes
//   - the vocabulary is capped at KEYWORD_LIMIT, higher-priority kinds first
// findKeywords is total: it never throws and the joined part texts always equal the input.

export type KeywordKind = 'npc' | 'enemy' | 'place' | 'node' | 'player';
export interface KeywordEntry {
  kind: KeywordKind;
  id: bigint;
  name: string;
}
export interface KeywordVocabulary {
  readonly size: number;
}
export type KeywordPart = { text: string; entry: KeywordEntry | null };

export const KEYWORD_LIMIT = 200;

interface Candidate {
  folded: string;
  entry: KeywordEntry;
  startsWord: boolean;
  endsWord: boolean;
}
interface InternalVocabulary extends KeywordVocabulary {
  readonly buckets: ReadonlyMap<string, readonly Candidate[]>;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Lower-cases per code point (only when the length is unchanged) and maps curly apostrophes to ASCII. */
export function foldText(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === '’' || ch === '‘') {
      out += "'";
      continue;
    }
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

function firstCodePoint(text: string): string {
  const cp = text.codePointAt(0);
  return cp === undefined ? '' : String.fromCodePoint(cp);
}

function lastCodePoint(text: string): string {
  const n = text.length;
  if (n === 0) return '';
  const low = text.charCodeAt(n - 1);
  if (n >= 2 && low >= 0xdc00 && low <= 0xdfff) {
    const high = text.charCodeAt(n - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(n - 2);
  }
  return text.slice(n - 1);
}

function isWordChar(ch: string): boolean {
  return ch !== '' && WORD_CHAR.test(ch);
}

type NameInput = readonly { id: bigint; name: string }[];

export function buildVocabulary(input: {
  npcs: NameInput;
  enemies?: NameInput;
  places: NameInput;
  nodes: NameInput;
  players: NameInput;
  selfName?: string | null;
}): KeywordVocabulary {
  const selfFolded = typeof input.selfName === 'string' ? foldText(input.selfName.trim()) : '';
  const seen = new Set<string>();
  const accepted: Candidate[] = [];
  const groups: [KeywordKind, NameInput][] = [
    ['npc', input.npcs ?? []],
    ['enemy', input.enemies ?? []],
    ['place', input.places ?? []],
    ['node', input.nodes ?? []],
    ['player', input.players ?? []],
  ];
  for (const [kind, rows] of groups) {
    for (const row of rows) {
      if (accepted.length >= KEYWORD_LIMIT) break;
      if (!row || typeof row.name !== 'string') continue;
      const name = row.name.trim();
      if (name === '') continue;
      const folded = foldText(name);
      if (folded === selfFolded || seen.has(folded)) continue;
      seen.add(folded);
      accepted.push({
        folded,
        entry: { kind, id: row.id, name },
        startsWord: isWordChar(firstCodePoint(folded)),
        endsWord: isWordChar(lastCodePoint(folded)),
      });
    }
  }
  const buckets = new Map<string, Candidate[]>();
  for (const candidate of accepted) {
    const key = firstCodePoint(candidate.folded);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(candidate);
    else buckets.set(key, [candidate]);
  }
  buckets.forEach((bucket) => bucket.sort((a, b) => b.folded.length - a.folded.length));
  const vocabulary: InternalVocabulary = { size: accepted.length, buckets };
  return vocabulary;
}

function previousIsWord(folded: string, index: number): boolean {
  if (index <= 0) return false;
  return isWordChar(lastCodePoint(folded.slice(Math.max(0, index - 2), index)));
}

function nextIsWord(folded: string, index: number): boolean {
  if (index >= folded.length) return false;
  const cp = folded.codePointAt(index);
  return cp !== undefined && isWordChar(String.fromCodePoint(cp));
}

/** Splits text into plain and keyword parts. Total; parts joined always equal the input. */
export function findKeywords(text: string, vocabulary: KeywordVocabulary): KeywordPart[] {
  if (typeof text !== 'string' || text === '') return [];
  try {
    const buckets = (vocabulary as Partial<InternalVocabulary> | null | undefined)?.buckets;
    if (!buckets || buckets.size === 0) return [{ text, entry: null }];
    const folded = foldText(text);
    if (folded.length !== text.length) return [{ text, entry: null }];
    const parts: KeywordPart[] = [];
    let plainStart = 0;
    let i = 0;
    while (i < folded.length) {
      const cp = folded.codePointAt(i) ?? 0;
      const step = cp > 0xffff ? 2 : 1;
      const bucket = buckets.get(String.fromCodePoint(cp));
      let hit: Candidate | null = null;
      if (bucket) {
        for (const candidate of bucket) {
          const end = i + candidate.folded.length;
          if (end > folded.length) continue;
          if (!folded.startsWith(candidate.folded, i)) continue;
          if (candidate.startsWord && previousIsWord(folded, i)) continue;
          if (candidate.endsWord && nextIsWord(folded, end)) continue;
          hit = candidate;
          break;
        }
      }
      if (hit) {
        const end = i + hit.folded.length;
        if (i > plainStart) parts.push({ text: text.slice(plainStart, i), entry: null });
        parts.push({ text: text.slice(i, end), entry: hit.entry });
        plainStart = end;
        i = end;
      } else {
        i += step;
      }
    }
    if (plainStart < text.length) parts.push({ text: text.slice(plainStart), entry: null });
    return parts;
  } catch {
    return [{ text, entry: null }];
  }
}
