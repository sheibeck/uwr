// action_result.ts
// The result card contract (Phase 50 plan 28). The server's craft, salvage and Discover reducers write
// one private action_result row per character (plans 50-29 and 50-30) with these lines encoded in its
// linesJson column; the client decodes them for the shared result card (plan 50-31). The card shows
// exactly what the server did, so the client never guesses from inventory changes.
//
// Every number is a decimal string in the JSON because JSON.stringify throws on a bigint (the same
// precedent as the vendor buy-back affix snapshot). Decoding never throws and drops any entry that is
// not exactly the shape written here, so a stale or hand-made row cannot break the card.
//
// No imports, so the client can reach it through @game-data. Browser-safe, ES2020 only.

/** The action a result row reports. */
export const RESULT_KINDS = ['craft', 'salvage', 'discover'] as const;
export type ResultKind = (typeof RESULT_KINDS)[number];

export function isResultKind(value: unknown): value is ResultKind {
  return typeof value === 'string' && (RESULT_KINDS as readonly string[]).indexOf(value) !== -1;
}

/**
 * What one line of a result card means:
 * - used: a material, essence or reagent a craft consumed. quantity is the units, and total is the bag
 *   count after.
 * - received: a salvage component that came back (a chance, never guaranteed).
 * - bonus: the salvage reagent bonus.
 * - scroll: a recipe scroll from salvage, with instanceId being the scroll's bag row.
 * - recipe: a recipe Discover found. templateId is its output template and name is the recipe name.
 */
export const RESULT_LINE_KINDS = ['used', 'received', 'bonus', 'scroll', 'recipe'] as const;
export type ResultLineKind = (typeof RESULT_LINE_KINDS)[number];

export interface ResultLine {
  kind: ResultLineKind;
  templateId: bigint;
  name: string;
  quantity: bigint;
  total: bigint;
  /** The bag row of the line's item when it has one (a scroll), else null. */
  instanceId: bigint | null;
}

/** A card shows at most this many lines; encode and decode both cap here. */
export const MAX_RESULT_LINES = 12;

const DECIMAL = /^\d{1,20}$/;

function isLineKind(value: unknown): value is ResultLineKind {
  return typeof value === 'string' && (RESULT_LINE_KINDS as readonly string[]).indexOf(value) !== -1;
}

function own(source: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(source, key) ? (source as Record<string, unknown>)[key] : undefined;
}

function decimal(value: unknown): bigint | null {
  return typeof value === 'string' && DECIMAL.test(value) ? BigInt(value) : null;
}

/** The lines as a JSON array of { kind, templateId, name, quantity, total, instanceId }, numbers as strings. */
export function encodeResultLines(lines: ReadonlyArray<ResultLine>): string {
  const out: Record<string, string>[] = [];
  if (!Array.isArray(lines)) return '[]';
  for (const l of lines) {
    if (out.length >= MAX_RESULT_LINES) break;
    if (l === null || typeof l !== 'object') continue;
    out.push({
      kind: String(l.kind),
      templateId: String(l.templateId),
      name: typeof l.name === 'string' ? l.name : '',
      quantity: String(l.quantity),
      total: String(l.total),
      instanceId: l.instanceId === null || l.instanceId === undefined ? '' : String(l.instanceId),
    });
  }
  return JSON.stringify(out);
}

/** The lines of a linesJson column, or [] for anything that is not the written shape. Never throws. */
export function decodeResultLines(json: unknown): ResultLine[] {
  if (typeof json !== 'string' || json === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ResultLine[] = [];
  for (const item of parsed) {
    if (out.length >= MAX_RESULT_LINES) break;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const kind = own(item, 'kind');
    const name = own(item, 'name');
    const templateId = decimal(own(item, 'templateId'));
    const quantity = decimal(own(item, 'quantity'));
    const total = decimal(own(item, 'total'));
    const rawInstance = own(item, 'instanceId');
    const instanceId = rawInstance === '' ? null : decimal(rawInstance);
    if (!isLineKind(kind) || typeof name !== 'string') continue;
    if (templateId === null || quantity === null || total === null) continue;
    if (rawInstance !== '' && instanceId === null) continue;
    out.push({ kind, templateId, name, quantity, total, instanceId });
  }
  return out;
}
