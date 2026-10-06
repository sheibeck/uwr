// Markup stripping for static server lines (47-RESEARCH "Cleaning static server text (S4)").
// The server still writes color tokens and [bracket] command words into some rows. The new client
// shows plain text, so those are removed here. Applies ONLY to rows without segments and of
// server-authored kinds; segment text and player-authored kinds are never passed through this.

// An opening or closing color token: double braces, optional slash, the word color, an optional
// word boundary plus any value with no brace. Written without a function-call look (the word
// followed by an open paren) and without hex literals, because the colors guard scans source text.
const COLOR_TOKEN = /\{\{\/?color\b[^{}]*\}\}/g;
// One or more characters that are not a bracket or newline, wrapped in square brackets.
const BRACKET_WORD = /\[([^[\]\n]+)\]/g;

/**
 * Removes color tokens and unwraps [bracket] words. Newlines and indentation inside the text are
 * kept (the feed body uses pre-wrap so help keeps its layout). Leading and trailing whitespace is
 * trimmed, because pre-wrap would otherwise draw a blank row or push a closing quote onto its own
 * line.
 */
export function cleanServerText(message: string): string {
  if (typeof message !== 'string' || message === '') return '';
  return message.replace(COLOR_TOKEN, '').replace(BRACKET_WORD, '$1').trim();
}
