// Player-authored free text (say, whisper, group chat, the command echo, a group name) must stay
// on one line. The console renders server-kind lines with white-space: pre-wrap, so a newline
// inside a stored player message could draw a fake second line that looks like a system notice
// (T-a3d-03). Pure: no spacetimedb/server import.

// Line separators by code unit: LF, VT, FF, CR, NEL, LINE SEPARATOR and PARAGRAPH SEPARATOR.
const LINE_BREAK_CODES = new Set([0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029]);

/** Turns every run of line breaks into one space, then trims. Other spacing is left alone. */
export function flattenLineBreaks(text: string): string {
  const source = String(text ?? '');
  let out = '';
  let inBreak = false;
  for (let i = 0; i < source.length; i += 1) {
    if (LINE_BREAK_CODES.has(source.charCodeAt(i))) {
      if (!inBreak) out += ' ';
      inBreak = true;
    } else {
      out += source.charAt(i);
      inBreak = false;
    }
  }
  return out.trim();
}
