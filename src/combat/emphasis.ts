// Amount emphasis for damage and heal lines (48-UI-SPEC "Combat lines", A10, CMB-04).
//
// The last standalone integer of a line is split out so the feed can wrap it in a span. The
// result is three plain strings; the component renders each as a text node, so markup in a
// server line (for example '<b>7</b>') stays literal text and never reaches the DOM as markup.

const INTEGER = /\b\d+\b/g;

export interface SplitLine {
  before: string;
  amount: string;
  after: string;
}

/** Split around the last standalone integer, or null when the text has none. */
export function splitLastInteger(text: string): SplitLine | null {
  let last: { index: number; value: string } | null = null;
  INTEGER.lastIndex = 0;
  let match = INTEGER.exec(text);
  while (match !== null) {
    last = { index: match.index, value: match[0] };
    match = INTEGER.exec(text);
  }
  if (last === null) return null;
  return {
    before: text.slice(0, last.index),
    amount: last.value,
    after: text.slice(last.index + last.value.length),
  };
}
