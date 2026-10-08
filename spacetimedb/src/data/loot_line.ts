// The loot line: one grammar for the server line that lists dropped loot and the client that turns
// it into links (quick 261008-f3m, owner 2026-10-08: "make the dropped items have square brackets
// and clicking them puts them in our bag if the bag has room").
//
// Grammar, all on one line:
//   <lead> {{loot:<id>:<rarity>}}<name>{{/loot}}, {{loot:...}}...{{/loot}} {{lootall}}Take all{{/lootall}}
// <id> is the combat_loot row id, <rarity> one of QUALITY_TIERS, <name> the cleaned item name.
//
// Why the id travels in the line: a link must take exactly the row it names. Names repeat (two
// Wolf Pelts), order breaks once a row is taken, and private event rows carry no combat id to join
// on. Ids are unique and never reused. A forged token is harmless: the client makes it clickable
// only while its id is in the player's own my_combat_loot, and take_loot re-checks ownership.
//
// The server writes the line (the victory announcement in reducers/combat.ts and the `loot`
// command in reducers/intent.ts). The client parses it through @game-data/loot_line, draws
// `[name]` and `[Take all]`, and never displays a token; cleaned-text surfaces call
// stripLootTokens.
//
// Phase 51.4 (Loot Rails) keep-or-retire, ROADMAP owner note 2026-10-08: these links stay until the
// loot rails ship, then the owner decides whether they remain as a shortcut or retire. If they
// retire, remove the client's parseLootLine branch (src/console/lines.ts) and the loot/lootAll
// keyword kinds, and either keep stripLootTokens or change this server line.
//
// Pure: imports only the mechanical vocabulary, so the browser can import it.
import { QUALITY_TIERS, type QualityTier } from './mechanical_vocabulary';

export const LOOT_DROPPED_LEAD = 'Loot dropped:';
export const LOOT_AVAILABLE_LEAD = 'Loot available:';
export const TAKE_ALL_LABEL = 'Take all';
export const LOOT_NAME_MAX = 80;

export type LootLinePiece =
  | { kind: 'text'; text: string }
  | { kind: 'item'; lootId: bigint; rarity: QualityTier; name: string }
  | { kind: 'takeAll'; label: string };

/** A combat_loot row, as far as the line needs it. */
export interface LootRowLike {
  id: bigint;
  itemTemplateId: bigint;
  qualityTier?: string | null;
}

/** An item_template row, as far as the line needs it. */
export interface LootTemplateLike {
  name: string;
  rarity?: string | null;
}

function toTier(raw: unknown): QualityTier {
  const key = typeof raw === 'string' ? raw.toLowerCase() : '';
  return (QUALITY_TIERS as readonly string[]).indexOf(key) !== -1 ? (key as QualityTier) : 'common';
}

/** An item name safe to place inside a token: no brackets, braces or control characters, one line, capped. */
export function cleanLootName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[[\]{}]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LOOT_NAME_MAX)
    .trim();
}

/** The loot line for these rows, in the given order; null when no row has a usable template and name. */
export function formatLootLine(
  lead: string,
  rows: readonly LootRowLike[],
  templateOf: (templateId: bigint) => LootTemplateLike | null | undefined,
): string | null {
  const items: string[] = [];
  for (const row of rows) {
    const template = templateOf(row.itemTemplateId);
    if (!template) continue;
    const name = cleanLootName(template.name);
    if (name === '') continue;
    const rarity = toTier(row.qualityTier || template.rarity || 'common');
    items.push(`{{loot:${row.id}:${rarity}}}${name}{{/loot}}`);
  }
  if (items.length === 0) return null;
  return `${lead} ${items.join(', ')} {{lootall}}${TAKE_ALL_LABEL}{{/lootall}}`;
}

// Fixed module regexes, never built from data: bounded quantifiers, none nested.
const TOKEN_RE =
  /\{\{loot:(\d{1,20}):([a-z]{1,16})\}\}([^{}\n]{1,80})\{\{\/loot\}\}|\{\{lootall\}\}([^{}\n]{1,40})\{\{\/lootall\}\}/g;
const ITEM_STRIP_RE = /\{\{loot:\d{1,20}:[a-z]{1,16}\}\}([^{}\n]{1,80})\{\{\/loot\}\}/g;
const TAKE_ALL_STRIP_RE = / ?\{\{lootall\}\}[^{}\n]{1,40}\{\{\/lootall\}\}/g;

/**
 * The pieces of a loot line, or null when the input is not a string or holds no item token.
 * Text between tokens stays literal (a malformed token is text). Never throws.
 */
export function parseLootLine(raw: unknown): LootLinePiece[] | null {
  if (typeof raw !== 'string') return null;
  try {
    const pieces: LootLinePiece[] = [];
    let hasItem = false;
    let last = 0;
    TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(raw)) !== null) {
      if (match.index > last) pieces.push({ kind: 'text', text: raw.slice(last, match.index) });
      if (match[1] !== undefined) {
        pieces.push({ kind: 'item', lootId: BigInt(match[1]), rarity: toTier(match[2]), name: match[3] });
        hasItem = true;
      } else {
        pieces.push({ kind: 'takeAll', label: match[4] });
      }
      last = match.index + match[0].length;
    }
    TOKEN_RE.lastIndex = 0;
    if (!hasItem) return null;
    if (last < raw.length) pieces.push({ kind: 'text', text: raw.slice(last) });
    const first = pieces[0];
    if (first.kind === 'text') first.text = first.text.trimStart();
    const tail = pieces[pieces.length - 1];
    if (tail.kind === 'text') tail.text = tail.text.trimEnd();
    return pieces.filter((p) => p.kind !== 'text' || p.text !== '');
  } catch {
    TOKEN_RE.lastIndex = 0;
    return null;
  }
}

/** Plain text of a loot line: item tokens become their names; the take-all token goes, with one space before it. */
export function stripLootTokens(raw: string): string {
  return raw.replace(ITEM_STRIP_RE, '$1').replace(TAKE_ALL_STRIP_RE, '');
}
