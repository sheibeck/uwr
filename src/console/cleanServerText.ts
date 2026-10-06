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

/** Removes color tokens and unwraps [bracket] words. Newlines and indentation are kept. */
export function cleanServerText(message: string): string {
  if (typeof message !== 'string' || message === '') return '';
  return message.replace(COLOR_TOKEN, '').replace(BRACKET_WORD, '$1');
}
