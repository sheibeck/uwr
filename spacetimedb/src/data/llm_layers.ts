// ============================================================================
// Prompt layers (pure module)
// ============================================================================
//
// Layout of a Claude request (locked by the phase CONTEXT):
//   system[0]  KEEPER_BIBLE          static, shared by every route, cached
//   system[1]  ROUTE_BLOCKS[route]   static per route, cached
//   user       volatile tail         per-call facts and tagged player text
//
// Everything a player wrote reaches the model ONLY inside <player_input> tags,
// after every < and > has been escaped, so no tag of any kind can be forged.
// Everything else that is interpolated (stored model output such as race, class,
// ability, NPC and region names, narratives, memory) goes through
// sanitizeWorldData, which escapes the same two characters without tagging.
//
// Pure-module rule (RESEARCH Pitfall 1): no runtime import from the server entry
// point, schema/tables, helpers/events or helpers/location. Type-only imports
// are erased at compile time.
// ============================================================================

// ----------------------------------------------------------------------------
// Player text isolation
// ----------------------------------------------------------------------------

/** Free player text (race description, NPC message) is truncated to this many code points. */
export const PLAYER_INPUT_MAX_CHARS = 1000;
/** Character names are truncated to this many code points. */
export const PLAYER_NAME_MAX_CHARS = 40;

/**
 * Matches any opening or closing player_input tag variant (mixed case, inner
 * whitespace, attributes). Global: use String.prototype.match, or reset lastIndex.
 */
export const PLAYER_INPUT_TAG_PATTERN = /<\s*\/?\s*player_input\b[^>]*>/gi;

/** A lone (unpaired) surrogate half. Replaced so the output is always well-formed. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Keep at most `max` code points. Never splits an astral character (it is kept whole or dropped whole). */
export function truncateCodePoints(text: string, max: number): string {
  return Array.from(text).slice(0, max).join('');
}

function escapeAngles(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Trim, cap at `max` code points, then escape < and >. The cap is applied
 * before escaping so escape expansion never counts against it. Truncates,
 * never throws.
 */
export function neutralizePlayerText(text: string, max: number): string {
  const wellFormed = String(text ?? '').replace(LONE_SURROGATE, '�');
  return escapeAngles(truncateCodePoints(wellFormed.trim(), max));
}

/** Block form for free player text. Empty input keeps an empty tag pair (constant message shape). */
export function wrapPlayerInput(text: string): string {
  return '<player_input>\n' + neutralizePlayerText(text, PLAYER_INPUT_MAX_CHARS) + '\n</player_input>';
}

/** Inline form for character names: whitespace collapsed to single spaces. */
export function wrapPlayerName(name: string): string {
  const collapsed = String(name ?? '').replace(/\s+/g, ' ');
  return '<player_input>' + neutralizePlayerText(collapsed, PLAYER_NAME_MAX_CHARS).trim() + '</player_input>';
}

/**
 * World data (stored model output, generated names, narratives): escape < and >
 * so a forged tag cannot arrive through stored text. Never tagged.
 */
export function sanitizeWorldData(text: string, opts?: { singleLine?: boolean }): string {
  let out = escapeAngles(String(text ?? '').replace(LONE_SURROGATE, '�'));
  if (opts?.singleLine) out = out.replace(/\s+/g, ' ').trim();
  return out;
}
