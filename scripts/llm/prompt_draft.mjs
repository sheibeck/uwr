// Prompt-draft tool (Phase 51.3.1.2, Plan 01).
//
// Reads an owner-approved PROMPT-DRAFT.md and copies or checks its exact wording against the template literals of
// spacetimedb/src/data/llm_layers.ts. Every later wording plan copies approved text through this file, never by
// hand, and proves the copy with `check` (MATCH, or the first differing index, plus length and sha256).
//
// The exported functions are pure: they take text and return text. Only the command line at the bottom reads or
// writes files. No network, no key, no paid call.

import { createHash } from 'node:crypto';

const NAMING_PLACEHOLDER = '{WORLD_NAMING_RULES}';
const NAMING_INTERPOLATION = '${WORLD_NAMING_RULES}';
const FENCE = /^(\s*)```/;

// ---------------------------------------------------------------------------------------------------------------
// Draft structure
// ---------------------------------------------------------------------------------------------------------------

/** Splits a draft into lines and reads its status line. The draft must be LF-only. */
export function parseDraft(text) {
  if (text.includes('\r')) throw new Error('draft contains a carriage return; it must be LF-only');
  const lines = text.split('\n');
  const line = lines.find((l) => l.startsWith('Status: ')) ?? null;
  const m = line ? /^Status: APPROVED (\d{4}-\d{2}-\d{2})\b/.exec(line) : null;
  return { status: { approved: m !== null, date: m ? m[1] : null, line }, lines };
}

const headingLevel = (line) => {
  const m = /^(#+) /.exec(line);
  return m ? m[1].length : 0;
};

/**
 * The lines of a section: from the line after the heading (matched by prefix) up to the next heading of the same or
 * a higher level. Lines inside fenced code blocks never end a section.
 */
function sectionLines(lines, heading) {
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = headingLevel(lines[start]) || heading.replace(/[^#].*$/, '').length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (FENCE.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const l = headingLevel(lines[i]);
    if (l > 0 && l <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

/** The exact block between the first two lines that are exactly `---` in a section, blank edges trimmed. */
export function ruleBlock(lines, heading) {
  const body = sectionLines(lines, heading);
  const a = body.indexOf('---');
  const b = a < 0 ? -1 : body.indexOf('---', a + 1);
  if (a < 0 || b < 0) throw new Error(`section ${heading} has no two rule lines (---)`);
  const block = body.slice(a + 1, b);
  while (block.length && block[0] === '') block.shift();
  while (block.length && block[block.length - 1] === '') block.pop();
  return block.join('\n');
}

const labelOf = (line) => {
  if (line === null) return null;
  const t = line.trim();
  if (t.startsWith('**Recommended')) return 'recommended';
  if (t.startsWith('**Alternative')) return 'alternative';
  return null;
};

/**
 * The fenced code blocks of a section, in order. Each has the label of its nearest preceding non-empty line
 * ('recommended', 'alternative' or null). An indented fence has its opening indent stripped from its lines.
 */
export function fencedBlocks(lines, heading) {
  const body = sectionLines(lines, heading);
  const out = [];
  let lastNonEmpty = null;
  for (let i = 0; i < body.length; i++) {
    const open = FENCE.exec(body[i]);
    if (!open) {
      if (body[i].trim() !== '') lastNonEmpty = body[i];
      continue;
    }
    const indent = open[1].length;
    const content = [];
    let j = i + 1;
    while (j < body.length && !FENCE.test(body[j])) {
      const l = body[j];
      content.push(l.slice(0, indent).trim() === '' ? l.slice(indent) : l);
      j++;
    }
    if (j >= body.length) throw new Error(`section ${heading} has an unclosed fence`);
    out.push({ label: labelOf(lastNonEmpty), text: content.join('\n') });
    lastNonEmpty = body[j];
    i = j;
  }
  return out;
}

const choiceHeading = (key) => (/^\d+$/.test(key) ? `## ${key}.` : `### ${key}.`);

/**
 * The owner's chosen line for each section the `## Owner choices` list names with ALTERNATIVE or RECOMMENDED.
 * Bullets start `- **Section N (...):**` or `- **Nx (...):**`; other bullets (blocks approved as drafted, notes)
 * are skipped. The text comes from that section's fence with the named label. When the bullet quotes text in
 * backticks and names the alternative, its first quote must equal the fence text. A section with no labelled fences
 * (section 6, indicator lines) yields its raw bullet text. `required` lists keys that must be present.
 */
export function ownerChoices(text, { required = [] } = {}) {
  const { lines } = parseDraft(text);
  const start = lines.findIndex((l) => l.startsWith('## Owner choices'));
  if (start < 0) throw new Error('draft has no ## Owner choices section');

  const bullets = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## ') && !lines[i].startsWith('# '); i++) {
    const l = lines[i];
    if (l.startsWith('- ')) bullets.push(l.slice(2));
    else if (/^\s+\S/.test(l) && bullets.length) bullets[bullets.length - 1] += ` ${l.trim()}`;
  }

  const choices = {};
  for (const bullet of bullets) {
    const m = /^\*\*(?:Section (\d+)|(\d+[a-z])) \([^)]*\):\*\*(.*)$/.exec(bullet);
    if (!m) continue;
    const key = m[1] ?? m[2];
    const rest = m[3];
    const alt = /\bALTERNATIVE\b/.test(rest);
    const rec = /\bRECOMMENDED\b/.test(rest);
    if (!alt && !rec) continue;
    if (alt && rec) throw new Error(`owner choice ${key} names both ALTERNATIVE and RECOMMENDED`);
    const label = alt ? 'alternative' : 'recommended';

    let fences;
    try {
      fences = fencedBlocks(lines, choiceHeading(key));
    } catch (err) {
      throw new Error(`owner choice ${key}: ${err.message}`);
    }
    const labelled = fences.filter((f) => f.label !== null);
    if (labelled.length === 0) {
      choices[key] = bullet;
      continue;
    }
    const chosen = labelled.filter((f) => f.label === label);
    if (chosen.length !== 1) {
      throw new Error(`owner choice ${key}: section has ${chosen.length} ${label} fences, expected 1`);
    }
    const quote = /`([^`]*)`/.exec(rest);
    if (alt && quote && quote[1] !== chosen[0].text) {
      throw new Error(
        `owner choice ${key}: quoted text differs from the alternative fence at index ${firstDiff(quote[1], chosen[0].text)}`,
      );
    }
    choices[key] = chosen[0].text;
  }

  const missing = required.filter((k) => !(k in choices));
  if (missing.length) throw new Error(`owner choices missing: ${missing.join(', ')}`);
  return choices;
}

// ---------------------------------------------------------------------------------------------------------------
// Source templates (llm_layers.ts)
// ---------------------------------------------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templateRe = (name) => new RegExp(`((?:export )?const ${escapeRe(name)} = \`)([^\`]*)(\`;)`, 'g');

/** Replaces each line that is exactly the naming placeholder with the naming paragraph. */
export function substituteNaming(block, naming) {
  return block
    .split('\n')
    .map((l) => (l === NAMING_PLACEHOLDER ? naming : l))
    .join('\n');
}

/** The raw body of `const NAME = \`...\`;` (exported or not). Throws when absent or ambiguous. */
export function templateBody(src, name) {
  const matches = [...src.matchAll(templateRe(name))];
  if (matches.length !== 1) throw new Error(`template const ${name}: found ${matches.length}, expected 1`);
  return matches[0][2];
}

/**
 * The runtime value of a world block: its body with `${WORLD_NAMING_RULES}` replaced by the naming paragraph and
 * CRLF read as LF, as JavaScript reads a template literal. Throws on any other interpolation or a backslash.
 */
export function evaluateBlock(src, name) {
  const plain = (body, label) => {
    if (body.includes('\\')) throw new Error(`${label} holds a backslash; it cannot be evaluated here`);
    return body.replace(/\r\n/g, '\n');
  };
  const naming = plain(templateBody(src, 'WORLD_NAMING_RULES'), 'WORLD_NAMING_RULES');
  if (naming.includes('${')) throw new Error('WORLD_NAMING_RULES holds an interpolation');
  const parts = plain(templateBody(src, name), name).split(NAMING_INTERPOLATION);
  if (parts.some((p) => p.includes('${'))) {
    throw new Error(`${name} holds an interpolation other than ${NAMING_INTERPOLATION}`);
  }
  return parts.join(naming);
}

/**
 * Writes an approved draft block into `const NAME`'s template literal, changing nothing else. The draft line
 * `{WORLD_NAMING_RULES}` becomes `${WORLD_NAMING_RULES}`. Throws for a backtick, a backslash or any `${` in the
 * block, and for a const that is absent or ambiguous. Keeps the source's CRLF line endings when it has them.
 */
export function writeTemplate(src, name, block) {
  if (block.includes('`')) throw new Error('block holds a backtick');
  if (block.includes('\\')) throw new Error('block holds a backslash');
  if (block.includes('${')) throw new Error('block holds a ${ sequence');
  templateBody(src, name);
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const body = block
    .split('\n')
    .map((l) => (l === NAMING_PLACEHOLDER ? NAMING_INTERPOLATION : l))
    .join(eol);
  return src.replace(templateRe(name), (_all, head, _old, tail) => head + body + tail);
}

// ---------------------------------------------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------------------------------------------

/** The first index where two strings differ, or -1 when they are equal. */
export function firstDiff(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Compares the approved text with the shipped text; length and sha256 are the shipped text's. */
export function compareBlock(approved, shipped) {
  const index = firstDiff(approved, shipped);
  return { match: index < 0, index, length: shipped.length, sha256: sha256Hex(shipped) };
}
