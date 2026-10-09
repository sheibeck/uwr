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

/** True for a real calendar date written YYYY-MM-DD. */
const isCalendarDate = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/**
 * Splits a draft into lines and reads its status line. The draft must be LF-only. The status line is read from the
 * header only: the lines before the first `## ` heading, outside fenced blocks (a `Status:` line in a later section
 * or inside a fenced example never counts). Approved means the line reads `Status: APPROVED YYYY-MM-DD` with a
 * real date.
 */
export function parseDraft(text) {
  if (text.includes('\r')) throw new Error('draft contains a carriage return; it must be LF-only');
  const lines = text.split('\n');
  let line = null;
  let inFence = false;
  for (const l of lines) {
    if (FENCE.test(l)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (l.startsWith('## ')) break;
    if (l.startsWith('Status: ')) {
      line = l;
      break;
    }
  }
  const m = line ? /^Status: APPROVED (\d{4}-\d{2}-\d{2})\b/.exec(line) : null;
  const approved = m !== null && isCalendarDate(m[1]);
  return { status: { approved, date: approved ? m[1] : null, line }, lines };
}

/** Throws unless the draft's status line reads `Status: APPROVED YYYY-MM-DD`. `what` names the refused action. */
export function assertApproved(status, what) {
  if (!(status.approved && status.date)) {
    throw new Error(`${what}: draft is not APPROVED (${status.line ?? 'no status line in the header'})`);
  }
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
 * are skipped. The text comes from that section's fence with the named label; a choice whose variant cannot be
 * found throws. When the bullet quotes text in backticks (whichever label it names), its first quote must equal the
 * chosen fence text, so an owner's edit written into the bullet fails loudly instead of being dropped. Only the keys
 * listed in `raw` may yield their raw bullet text, and only when their section has no labelled fences (section 6,
 * indicator lines). A key listed twice throws. The draft must be APPROVED. `required` lists keys that must be present.
 */
export function ownerChoices(text, { required = [], raw = [] } = {}) {
  const { status, lines } = parseDraft(text);
  assertApproved(status, 'owner choices');
  const start = lines.findIndex((l) => l.startsWith('## Owner choices'));
  if (start < 0) throw new Error('draft has no ## Owner choices section');

  const bullets = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## ') && !lines[i].startsWith('# '); i++) {
    const l = lines[i];
    if (l.startsWith('- ')) bullets.push(l.slice(2));
    else if (/^\s+\S/.test(l) && bullets.length) bullets[bullets.length - 1] += ` ${l.trim()}`;
  }

  const choices = {};
  const seen = new Set();
  for (const bullet of bullets) {
    const m = /^\*\*(?:Section (\d+)|(\d+[a-z])) \([^)]*\):\*\*(.*)$/.exec(bullet);
    if (!m) continue;
    const key = m[1] ?? m[2];
    const rest = m[3];
    if (seen.has(key)) throw new Error(`owner choice ${key} is listed twice`);
    seen.add(key);
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
    if (raw.includes(key)) {
      if (labelled.length > 0) {
        throw new Error(`owner choice ${key}: listed as a raw choice, but its section has labelled fences`);
      }
      choices[key] = bullet;
      continue;
    }
    if (labelled.length === 0) {
      throw new Error(`owner choice ${key}: section has no labelled (**Recommended** / **Alternative**) fences`);
    }
    const chosen = labelled.filter((f) => f.label === label);
    if (chosen.length !== 1) {
      throw new Error(`owner choice ${key}: section has ${chosen.length} ${label} fences, expected 1`);
    }
    const quote = /`([^`]*)`/.exec(rest);
    if (quote && quote[1] !== chosen[0].text) {
      throw new Error(
        `owner choice ${key}: quoted text differs from the ${label} fence at index ${firstDiff(quote[1], chosen[0].text)}` +
          ' (an edit written into the bullet is not supported: edit the fence text instead)',
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

// ---------------------------------------------------------------------------------------------------------------
// Command line: node scripts/llm/prompt_draft.mjs <mode> <draft> [args]   (paths relative to the current directory)
//   (chosen, pins, write and check refuse a draft whose status line is not `Status: APPROVED YYYY-MM-DD`)
//   status                              the status line; exit 1 unless APPROVED with a date
//   block <heading>                     the raw rule-delimited block
//   fences <heading>                    the fenced blocks as JSON
//   chosen                              the owner's chosen lines as JSON (keys 5, 6, 7a to 7e required)
//   pins <heading> <layersPath>         length and sha256 of the block with the naming rules substituted
//   write <heading> <CONST> <layersPath> write the block into that const, print 'written'
//   check <heading> <CONST> <layersPath> MATCH or DIFFER at index N, plus length and sha256; exit 1 on a difference
// ---------------------------------------------------------------------------------------------------------------

export const REQUIRED_CHOICES = ['5', '6', '7a', '7b', '7c', '7d', '7e'];

/** The 51.3.1.2 choices that ship as their raw owner bullet (section 6, indicator lines: no labelled fences). */
export const RAW_BULLET_CHOICES = ['6'];

/** The modes that copy or certify approved text: each refuses a draft that is not APPROVED. */
export const APPROVED_ONLY_MODES = ['chosen', 'pins', 'write', 'check'];

/**
 * The repo-relative path of a phase file, in the live phase folder or, once the milestone is archived, in a
 * `.planning/milestones/*-phases/` or `.planning/*-phases/` folder. `fsLike` supplies `existsSync` and
 * `readdirSync` (node:fs in practice), so this stays testable without the disk. Throws naming every place searched.
 */
export function findPhaseFile(repoRoot, phaseDir, fileName, fsLike) {
  const join = (...parts) => parts.join('/');
  const tried = [join('.planning', 'phases', phaseDir, fileName)];
  for (const root of ['.planning/milestones', '.planning']) {
    let entries = [];
    try {
      entries = fsLike.readdirSync(join(repoRoot, root));
    } catch {
      entries = [];
    }
    for (const entry of [...entries].map(String).filter((e) => e.endsWith('-phases')).sort()) {
      tried.push(join(root, entry, phaseDir, fileName));
    }
  }
  const found = tried.find((rel) => fsLike.existsSync(join(repoRoot, rel)));
  if (found) return found;
  throw new Error(
    `${fileName} not found: searched .planning/phases/${phaseDir}/ and the .planning/milestones/*-phases/ and ` +
      `.planning/*-phases/ archives (${tried.length} places)`,
  );
}

const USAGE = 'usage: node scripts/llm/prompt_draft.mjs <status|block|fences|chosen|pins|write|check> <draft> [args]';

async function main(argv) {
  const fs = await import('node:fs');
  const [mode, draftPath, ...args] = argv;
  if (!mode || !draftPath) throw new Error(USAGE);
  const text = fs.readFileSync(draftPath, 'utf8');
  const { status, lines } = parseDraft(text);
  if (APPROVED_ONLY_MODES.includes(mode)) assertApproved(status, mode);
  const need = (n) => {
    if (args.length < n) throw new Error(`${mode}: missing arguments\n${USAGE}`);
  };

  switch (mode) {
    case 'status':
      console.log(status.line ?? '(no status line)');
      return status.approved && status.date ? 0 : 1;
    case 'block':
      need(1);
      console.log(ruleBlock(lines, args[0]));
      return 0;
    case 'fences':
      need(1);
      console.log(JSON.stringify(fencedBlocks(lines, args[0]), null, 2));
      return 0;
    case 'chosen':
      console.log(
        JSON.stringify(ownerChoices(text, { required: REQUIRED_CHOICES, raw: RAW_BULLET_CHOICES }), null, 2),
      );
      return 0;
    case 'pins': {
      need(2);
      const src = fs.readFileSync(args[1], 'utf8');
      const block = substituteNaming(ruleBlock(lines, args[0]), evaluateBlock(src, 'WORLD_NAMING_RULES'));
      console.log(`${args[0]} length ${block.length}, sha256 ${sha256Hex(block)}`);
      return 0;
    }
    case 'write': {
      need(3);
      const src = fs.readFileSync(args[2], 'utf8');
      fs.writeFileSync(args[2], writeTemplate(src, args[1], ruleBlock(lines, args[0])));
      console.log('written');
      return 0;
    }
    case 'check': {
      need(3);
      const src = fs.readFileSync(args[2], 'utf8');
      const approved = substituteNaming(ruleBlock(lines, args[0]), evaluateBlock(src, 'WORLD_NAMING_RULES'));
      const r = compareBlock(approved, evaluateBlock(src, args[1]));
      console.log(
        `${args[0]} vs ${args[1]}: ${r.match ? 'MATCH' : `DIFFER at index ${r.index}`} (length ${r.length}, sha256 ${r.sha256})`,
      );
      return r.match ? 0 : 1;
    }
    default:
      throw new Error(`unknown mode ${mode}\n${USAGE}`);
  }
}

const isMain = await (async () => {
  if (!process.argv[1]) return false;
  const { pathToFileURL } = await import('node:url');
  const { resolve } = await import('node:path');
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
})();

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
