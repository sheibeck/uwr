// Run from the repo root: npx vitest run scripts/llm/prompt_draft.test.mjs --maxWorkers=1
// The prompt-draft tool (Phase 51.3.1.2, Plan 01): reads an owner-approved PROMPT-DRAFT.md, resolves the chosen
// variants, and copies or checks a block against spacetimedb/src/data/llm_layers.ts. Nothing here touches the
// network, a key or a token. The only child process is the one CLI test, which runs `node` on a local file.

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compareBlock,
  evaluateBlock,
  fencedBlocks,
  firstDiff,
  ownerChoices,
  parseDraft,
  ruleBlock,
  sha256Hex,
  substituteNaming,
  templateBody,
  writeTemplate,
} from './prompt_draft.mjs';
import { ROUTE_BLOCKS } from '../../spacetimedb/src/data/llm_layers.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DRAFT_PATH = '.planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md';
const FROZEN_DRAFT_PATH = '.planning/phases/51.3.1.1-density-pools/51.3.1.1-PROMPT-DRAFT.md';
const LAYERS_PATH = 'spacetimedb/src/data/llm_layers.ts';
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const DRAFT = read(DRAFT_PATH);
const FROZEN = read(FROZEN_DRAFT_PATH);
const LAYERS = read(LAYERS_PATH);

// A small synthetic draft that exercises every edge case.
const SYNTHETIC = [
  '# Synthetic draft',
  '',
  'Status: APPROVED 2026-01-02 (owner)',
  '',
  '## Owner choices (2026-01-02)',
  '',
  '- **Section 1 (block):** approved as drafted.',
  '- **Section 2 (line):** the ALTERNATIVE ships: `Second alt line.`',
  '- **Section 3 (raw):** the ALTERNATIVE: move only `x` to `y`.',
  '- **4a (sub):** RECOMMENDED.',
  '- **4b (sub):** RECOMMENDED, and it is reused',
  '  for another case.',
  '- **Discovery line:** posted later.',
  '',
  '## 1. Block',
  '',
  '---',
  '',
  'TASK: SYNTHETIC',
  '',
  '{WORLD_NAMING_RULES}',
  '',
  'Reply with the JSON object only.',
  '',
  '---',
  '',
  '## 2. Line',
  '',
  '**Recommended:**',
  '',
  '```',
  'Second rec line.',
  '```',
  '',
  '**Alternative:**',
  '',
  '```',
  'Second alt line.',
  '```',
  '',
  '## 3. Raw',
  '',
  '- pools:',
  '  ```',
  "  'a line'",
  "  'b line'",
  '  ```',
  '',
  '## 4. Subs',
  '',
  '```',
  '# not a heading inside a fence',
  '```',
  '',
  '### 4a. First',
  '',
  '**Recommended** (to somewhere):',
  '',
  '```',
  'Four a rec.',
  '```',
  '',
  '**Alternative:**',
  '',
  '```',
  'Four a alt.',
  '```',
  '',
  '### 4b. Second',
  '',
  '**Recommended:**',
  '',
  '```',
  'Four b rec.',
  '```',
  '',
  '## 5. End',
  '',
].join('\n');

describe('parseDraft', () => {
  it('reads the approved status and date of the 51.3.1.2 draft', () => {
    const { status, lines } = parseDraft(DRAFT);
    expect(status.approved).toBe(true);
    expect(status.date).toBe('2026-10-09');
    expect(status.line.startsWith('Status: APPROVED 2026-10-09')).toBe(true);
    expect(Array.isArray(lines)).toBe(true);
  });

  it('reports an unapproved draft as not approved', () => {
    const { status } = parseDraft('# D\n\nStatus: AWAITING OWNER APPROVAL\n');
    expect(status.approved).toBe(false);
    expect(status.date).toBe(null);
  });

  it('throws on a carriage return', () => {
    expect(() => parseDraft('Status: APPROVED 2026-10-09\r\n')).toThrow(/carriage return/);
  });
});

describe('ruleBlock', () => {
  const { lines } = parseDraft(DRAFT);

  it('returns the exact 2a block of section 1', () => {
    const block = ruleBlock(lines, '## 1.');
    expect(block.startsWith('TASK: WORLD GENERATION, FILL IN THE REGION')).toBe(true);
    expect(block.endsWith('Reply with the JSON object only.')).toBe(true);
    expect(block).toContain('\n{WORLD_NAMING_RULES}\n');
    expect(block).not.toContain('What changed');
  });

  it('returns the exact 2b block of section 2', () => {
    const block = ruleBlock(lines, '## 2.');
    expect(block.startsWith('TASK: WORLD GENERATION, CREATURE FAMILIES')).toBe(true);
    expect(block.endsWith('Reply with the JSON object only.')).toBe(true);
  });

  it('trims blank lines on a synthetic draft', () => {
    const block = ruleBlock(parseDraft(SYNTHETIC).lines, '## 1.');
    expect(block).toBe('TASK: SYNTHETIC\n\n{WORLD_NAMING_RULES}\n\nReply with the JSON object only.');
  });

  it('throws naming a missing heading', () => {
    expect(() => ruleBlock(lines, '## 9.')).toThrow(/## 9\./);
  });

  it('throws when the section has no two rule lines', () => {
    expect(() => ruleBlock(parseDraft(SYNTHETIC).lines, '## 2.')).toThrow(/rule lines/);
  });
});

describe('fencedBlocks', () => {
  const { lines } = parseDraft(DRAFT);

  it('returns the labelled variants of 7b and stops at 7c', () => {
    const blocks = fencedBlocks(lines, '### 7b.');
    expect(blocks.map((b) => b.label)).toEqual(['recommended', 'alternative']);
    expect(blocks[0].text.startsWith('A great storm brews on the horizon')).toBe(true);
    expect(blocks[1].text.startsWith('Thunderheads pile up')).toBe(true);
  });

  it('returns the three unlabelled fences of section 4 in order', () => {
    const blocks = fencedBlocks(lines, '## 4.');
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.label === null)).toBe(true);
    expect(blocks[0].text.startsWith('Region: {region name} ({biome})')).toBe(true);
    expect(blocks[1].text.startsWith('Region: Kesterlane Basin (coastal)')).toBe(true);
    expect(blocks[2].text).toBe('Feud: none.');
  });

  it('reads the 7e label with trailing words', () => {
    const blocks = fencedBlocks(lines, '### 7e.');
    expect(blocks[0].label).toBe('recommended');
    expect(blocks[0].text.startsWith('The Keeper clears his throat. A region is taking shape')).toBe(true);
  });

  it('strips the indent of an indented fence and ignores a heading-like line inside a fence', () => {
    const syn = parseDraft(SYNTHETIC).lines;
    expect(fencedBlocks(syn, '## 3.')).toEqual([{ label: null, text: "'a line'\n'b line'" }]);
    const four = fencedBlocks(syn, '## 4.');
    expect(four.map((b) => b.text)).toEqual(['# not a heading inside a fence', 'Four a rec.', 'Four a alt.', 'Four b rec.']);
  });

  it('throws naming a missing heading', () => {
    expect(() => fencedBlocks(lines, '### 7z.')).toThrow(/### 7z\./);
  });
});

describe('ownerChoices', () => {
  const choices = ownerChoices(DRAFT);

  it('resolves every chosen line of the approved draft', () => {
    expect(Object.keys(choices).sort()).toEqual(['5', '6', '7a', '7b', '7c', '7d', '7e']);
    expect(choices['5']).toBe('The land is remembered, but not yet what lives in it. Type [explore] to try again.');
    expect(choices['7a']).toBe(
      'You stand at the edge of the known world, preparing to travel into an unknown region. The sky beyond is darkening.',
    );
    expect(choices['7b'].startsWith('A great storm brews on the horizon')).toBe(true);
    expect(choices['7c']).toContain('{region name}');
    expect(choices['7c'].startsWith('The storm on the horizon breaks')).toBe(true);
    expect(choices['7d'].startsWith('The storm on the horizon does not pass.')).toBe(true);
    expect(choices['7e'].startsWith('The Keeper clears his throat. A region is taking shape')).toBe(true);
  });

  it('returns the raw bullet text of section 6', () => {
    expect(choices['6']).toContain('the ALTERNATIVE: move only');
    expect(choices['6']).toContain("'The Keeper is placing things that will want to eat you...'");
    expect(choices['6']).toContain("'The Keeper is deciding who else lives out here...'");
  });

  it('resolves a synthetic draft, including a wrapped bullet and a raw section', () => {
    expect(ownerChoices(SYNTHETIC)).toEqual({
      2: 'Second alt line.',
      3: '**Section 3 (raw):** the ALTERNATIVE: move only `x` to `y`.',
      '4a': 'Four a rec.',
      '4b': 'Four b rec.',
    });
  });

  it('throws when a quoted choice differs from its Alternative fence', () => {
    const bad = SYNTHETIC.replace('ships: `Second alt line.`', 'ships: `Second alt line, edited.`');
    expect(() => ownerChoices(bad)).toThrow(/Section 2|2/);
  });

  it('throws when a chosen section is missing', () => {
    const bad = SYNTHETIC.replace('### 4b. Second', '### 4c. Second');
    expect(() => ownerChoices(bad)).toThrow(/4b/);
  });

  it('throws when the named variant has no fence', () => {
    const bad = SYNTHETIC.replace('- **4b (sub):** RECOMMENDED, and', '- **4b (sub):** ALTERNATIVE, and');
    expect(() => ownerChoices(bad)).toThrow(/4b/);
  });

  it('throws when a required key is missing', () => {
    expect(() => ownerChoices(SYNTHETIC, { required: ['2', '9'] })).toThrow(/9/);
    expect(() => ownerChoices(DRAFT, { required: ['5', '6', '7a', '7b', '7c', '7d', '7e'] })).not.toThrow();
  });

  it('throws without an Owner choices section', () => {
    expect(() => ownerChoices('# D\n\nStatus: APPROVED 2026-01-01\n\n## 1. x\n')).toThrow(/Owner choices/);
  });
});

describe('firstDiff and sha256Hex', () => {
  it('finds the first differing index', () => {
    expect(firstDiff('abc', 'abd')).toBe(2);
    expect(firstDiff('abc', 'abc')).toBe(-1);
    expect(firstDiff('abc', 'abcd')).toBe(3);
  });

  it('matches node:crypto', () => {
    const text = 'The Keeper clears his throat.';
    expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});

describe('templateBody, evaluateBlock and compareBlock on the shipped source', () => {
  it('reads the body of a named template literal', () => {
    const body = templateBody(LAYERS, 'WORLD_GEN_START_BLOCK');
    expect(body.startsWith('TASK: WORLD GENERATION, FIRST GLIMPSE')).toBe(true);
    expect(body).toContain('${WORLD_NAMING_RULES}');
    expect(() => templateBody(LAYERS, 'NO_SUCH_BLOCK')).toThrow(/NO_SUCH_BLOCK/);
  });

  it('evaluates a block the same way the module does', () => {
    expect(evaluateBlock(LAYERS, 'WORLD_GEN_START_BLOCK')).toBe(ROUTE_BLOCKS.world_gen_start);
    expect(evaluateBlock(LAYERS, 'WORLD_GEN_BLOCK')).toBe(ROUTE_BLOCKS.world_gen);
  });

  it('reports MATCH for the frozen 51.3.1.1 A0 against the shipped WORLD_GEN_START_BLOCK', () => {
    const a0 = ruleBlock(parseDraft(FROZEN).lines, '### A0.');
    const naming = templateBody(LAYERS, 'WORLD_NAMING_RULES');
    const result = compareBlock(substituteNaming(a0, naming), evaluateBlock(LAYERS, 'WORLD_GEN_START_BLOCK'));
    expect(result.match).toBe(true);
    expect(result.index).toBe(-1);
    expect(result.length).toBe(ROUTE_BLOCKS.world_gen_start.length);
    expect(result.sha256).toBe(sha256Hex(ROUTE_BLOCKS.world_gen_start));
  });

  it('reports the first differing index for a changed block', () => {
    const result = compareBlock('abcdef', 'abcxef');
    expect(result.match).toBe(false);
    expect(result.index).toBe(3);
    expect(result.length).toBe(6);
    expect(result.sha256).toBe(sha256Hex('abcxef'));
  });

  it('substitutes only the placeholder line', () => {
    expect(substituteNaming('A\n\n{WORLD_NAMING_RULES}\n\nB', 'NAMES')).toBe('A\n\nNAMES\n\nB');
    expect(substituteNaming('A {WORLD_NAMING_RULES} B', 'NAMES')).toBe('A {WORLD_NAMING_RULES} B');
  });

  it('refuses to evaluate a literal with another interpolation or an escape', () => {
    const src = 'const WORLD_NAMING_RULES = `names`;\nconst X = `a ${OTHER} b`;\nconst Y = `a \\n b`;\n';
    expect(() => evaluateBlock(src, 'X')).toThrow(/interpolation/);
    expect(() => evaluateBlock(src, 'Y')).toThrow(/backslash/);
  });
});

describe('writeTemplate', () => {
  const SRC = [
    'const WORLD_NAMING_RULES = `NAMES`;',
    '',
    'const X = `old x`;',
    '',
    'export const Y = `old y ${WORLD_NAMING_RULES}`;',
    '',
  ].join('\n');

  it('replaces only the named const and turns the placeholder line into the interpolation', () => {
    const out = writeTemplate(SRC, 'X', 'TASK: NEW\n\n{WORLD_NAMING_RULES}\n\nReply.');
    expect(out).toBe(SRC.replace('`old x`', '`TASK: NEW\n\n${WORLD_NAMING_RULES}\n\nReply.`'));
    expect(evaluateBlock(out, 'X')).toBe('TASK: NEW\n\nNAMES\n\nReply.');
    expect(templateBody(out, 'Y')).toBe('old y ${WORLD_NAMING_RULES}');
  });

  it('writes an exported const too, and keeps $& and $1 literal', () => {
    const out = writeTemplate(SRC, 'Y', 'costs $& and $1');
    expect(templateBody(out, 'Y')).toBe('costs $& and $1');
    expect(templateBody(out, 'X')).toBe('old x');
  });

  it('round-trips the approved 2a block through the shipped source', () => {
    const block = ruleBlock(parseDraft(DRAFT).lines, '## 1.');
    const out = writeTemplate(LAYERS, 'WORLD_GEN_BLOCK', block);
    const naming = templateBody(LAYERS, 'WORLD_NAMING_RULES');
    expect(compareBlock(substituteNaming(block, naming), evaluateBlock(out, 'WORLD_GEN_BLOCK')).match).toBe(true);
    expect(evaluateBlock(out, 'WORLD_GEN_START_BLOCK')).toBe(ROUTE_BLOCKS.world_gen_start);
  });

  it('keeps CRLF line endings in a CRLF source', () => {
    const crlf = SRC.split('\n').join('\r\n');
    const out = writeTemplate(crlf, 'X', 'one\ntwo');
    expect(out).toContain('const X = `one\r\ntwo`;');
    expect(evaluateBlock(out, 'X')).toBe('one\ntwo');
  });

  it('throws on a backtick, a backslash or another ${ sequence', () => {
    expect(() => writeTemplate(SRC, 'X', 'a ` b')).toThrow(/backtick/);
    expect(() => writeTemplate(SRC, 'X', 'a \\ b')).toThrow(/backslash/);
    expect(() => writeTemplate(SRC, 'X', 'a ${EVIL} b')).toThrow(/\$\{/);
    expect(() => writeTemplate(SRC, 'X', 'a ${WORLD_NAMING_RULES} b')).toThrow(/\$\{/);
  });

  it('throws for a const that does not exist', () => {
    expect(() => writeTemplate(SRC, 'Z', 'text')).toThrow(/Z/);
  });
});
