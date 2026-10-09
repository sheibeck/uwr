// Run from the repo root: npx vitest run scripts/llm/prompt_draft.test.mjs --maxWorkers=1
// The prompt-draft tool (Phase 51.3.1.2, Plan 01): reads an owner-approved PROMPT-DRAFT.md, resolves the chosen
// variants, and copies or checks a block against spacetimedb/src/data/llm_layers.ts. Nothing here touches the
// network, a key or a token. The only child processes are the CLI tests, which run `node` on local files (a refused
// unapproved draft is written to a temp folder, never to the repo).

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APPROVED_ONLY_MODES,
  assertApproved,
  compareBlock,
  evaluateBlock,
  fencedBlocks,
  findPhaseFile,
  firstDiff,
  REQUIRED_CHOICES,
  ownerChoices,
  parseDraft,
  RAW_BULLET_CHOICES,
  ruleBlock,
  sha256Hex,
  substituteNaming,
  templateBody,
  writeTemplate,
} from './prompt_draft.mjs';
import { ROUTE_BLOCKS } from '../../spacetimedb/src/data/llm_layers.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The drafts live in the phase folder until the milestone is archived, then under a *-phases archive (WR-05).
const DRAFT_PATH = findPhaseFile(REPO_ROOT, '51.3.1.2-bigger-regions', '51.3.1.2-PROMPT-DRAFT.md', fs);
const FROZEN_DRAFT_PATH = findPhaseFile(REPO_ROOT, '51.3.1.1-density-pools', '51.3.1.1-PROMPT-DRAFT.md', fs);
const LAYERS_PATH = 'spacetimedb/src/data/llm_layers.ts';
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const DRAFT = read(DRAFT_PATH);
const FROZEN = read(FROZEN_DRAFT_PATH);
const LAYERS = read(LAYERS_PATH);

// Raw-bullet keys: section 6 of the real draft, section 3 of the synthetic one (no labelled fences).
const DRAFT_RAW = { raw: RAW_BULLET_CHOICES };
const SYN_RAW = { raw: ['3'] };

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
  const choices = ownerChoices(DRAFT, DRAFT_RAW);

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
    expect(ownerChoices(SYNTHETIC, SYN_RAW)).toEqual({
      2: 'Second alt line.',
      3: '**Section 3 (raw):** the ALTERNATIVE: move only `x` to `y`.',
      '4a': 'Four a rec.',
      '4b': 'Four b rec.',
    });
  });

  it('throws when a quoted choice differs from its Alternative fence', () => {
    const bad = SYNTHETIC.replace('ships: `Second alt line.`', 'ships: `Second alt line, edited.`');
    expect(() => ownerChoices(bad, SYN_RAW)).toThrow(/Section 2|2/);
  });

  it('throws when a chosen section is missing', () => {
    const bad = SYNTHETIC.replace('### 4b. Second', '### 4c. Second');
    expect(() => ownerChoices(bad, SYN_RAW)).toThrow(/4b/);
  });

  it('throws when the named variant has no fence', () => {
    const bad = SYNTHETIC.replace('- **4b (sub):** RECOMMENDED, and', '- **4b (sub):** ALTERNATIVE, and');
    expect(() => ownerChoices(bad, SYN_RAW)).toThrow(/4b/);
  });

  it('throws when a required key is missing', () => {
    expect(() => ownerChoices(SYNTHETIC, { required: ['2', '9'], ...SYN_RAW })).toThrow(/9/);
    expect(() => ownerChoices(DRAFT, { required: ['5', '6', '7a', '7b', '7c', '7d', '7e'], ...DRAFT_RAW })).not.toThrow();
  });

  it('throws without an Owner choices section', () => {
    expect(() => ownerChoices('# D\n\nStatus: APPROVED 2026-01-01\n\n## 1. x\n')).toThrow(/Owner choices/);
  });
});

describe('approval and choice guards (code review B, CR-01)', () => {
  const unapprove = (text) => text.replace(/^Status: APPROVED [^\n]*$/m, 'Status: AWAITING OWNER APPROVAL');

  it('reads the status line from the header only, never from a later section or a fenced example', () => {
    const late = '# D\n\n## 1. x\n\nStatus: APPROVED 2026-01-02\n';
    expect(parseDraft(late).status).toEqual({ approved: false, date: null, line: null });
    const fenced = '# D\n\n```\nStatus: APPROVED 2026-01-02\n```\n\nStatus: AWAITING OWNER APPROVAL\n\n## 1. x\n';
    expect(parseDraft(fenced).status.approved).toBe(false);
    expect(parseDraft(fenced).status.line).toBe('Status: AWAITING OWNER APPROVAL');
  });

  it('needs a real date on the APPROVED line', () => {
    expect(parseDraft('# D\n\nStatus: APPROVED 2026-13-40\n').status.approved).toBe(false);
    expect(parseDraft('# D\n\nStatus: APPROVED soon\n').status.approved).toBe(false);
    expect(() => assertApproved(parseDraft('# D\n\nStatus: APPROVED 2026-13-40\n').status, 'chosen')).toThrow(
      /chosen: draft is not APPROVED/,
    );
  });

  it('refuses the owner choices of a draft that is not APPROVED', () => {
    expect(() => ownerChoices(unapprove(SYNTHETIC), SYN_RAW)).toThrow(/not APPROVED/);
    expect(() => ownerChoices(unapprove(DRAFT), DRAFT_RAW)).toThrow(/not APPROVED/);
  });

  it('never falls back to the bullet text when a section lost its bold labels (the review reproduction, 7a)', () => {
    const start = DRAFT.indexOf('### 7a.');
    const end = DRAFT.indexOf('### 7b.');
    const section = DRAFT.slice(start, end).replace('**Recommended:**', 'Recommended:').replace('**Alternative:**', 'Alternative:');
    const bad = DRAFT.slice(0, start) + section + DRAFT.slice(end);
    expect(() => ownerChoices(bad, DRAFT_RAW)).toThrow(/owner choice 7a: section has no labelled/);
  });

  it('allows the raw bullet only for a listed key, and only when its section has no labelled fences', () => {
    expect(() => ownerChoices(SYNTHETIC)).toThrow(/owner choice 3: section has no labelled/);
    expect(() => ownerChoices(SYNTHETIC, { raw: ['3', '2'] })).toThrow(/owner choice 2: listed as a raw choice/);
    expect(() => ownerChoices(DRAFT)).toThrow(/owner choice 6/);
  });

  it('fails loudly on a quoted edit to a RECOMMENDED bullet, and accepts a quote equal to the fence', () => {
    const edited = SYNTHETIC.replace('- **4a (sub):** RECOMMENDED.', '- **4a (sub):** RECOMMENDED, but please say `Edited by owner.`');
    expect(() => ownerChoices(edited, SYN_RAW)).toThrow(/owner choice 4a: quoted text differs from the recommended fence/);
    const same = SYNTHETIC.replace('- **4a (sub):** RECOMMENDED.', '- **4a (sub):** RECOMMENDED: `Four a rec.`');
    expect(ownerChoices(same, SYN_RAW)['4a']).toBe('Four a rec.');
  });

  it('fails on a choice key listed twice, whichever variant the second bullet names', () => {
    const twice = SYNTHETIC.replace('- **Discovery line:**', '- **4a (sub):** ALTERNATIVE.\n- **Discovery line:**');
    expect(() => ownerChoices(twice, SYN_RAW)).toThrow(/owner choice 4a is listed twice/);
    const twiceSame = SYNTHETIC.replace('- **Discovery line:**', '- **4b (again):** RECOMMENDED.\n- **Discovery line:**');
    expect(() => ownerChoices(twiceSame, SYN_RAW)).toThrow(/owner choice 4b is listed twice/);
  });

  it('lists exactly the copying modes as approved-only', () => {
    expect(APPROVED_ONLY_MODES).toEqual(['chosen', 'pins', 'write', 'check']);
  });
});

describe('findPhaseFile (code review B, WR-05)', () => {
  const fakeFs = (files) => ({
    existsSync: (p) => files.includes(p),
    readdirSync: (dir) => {
      if (dir === 'R/.planning') return ['phases', 'v2.2-phases', 'notes'];
      if (dir === 'R/.planning/milestones') return ['v3.0-phases', 'v3.1-phases'];
      throw new Error('ENOENT');
    },
  });

  it('prefers the live phase folder', () => {
    const files = ['R/.planning/phases/P/F.md', 'R/.planning/milestones/v3.1-phases/P/F.md'];
    expect(findPhaseFile('R', 'P', 'F.md', fakeFs(files))).toBe('.planning/phases/P/F.md');
  });

  it('finds the file in a milestone archive after the phase folder moved', () => {
    expect(findPhaseFile('R', 'P', 'F.md', fakeFs(['R/.planning/milestones/v3.1-phases/P/F.md']))).toBe(
      '.planning/milestones/v3.1-phases/P/F.md',
    );
    expect(findPhaseFile('R', 'P', 'F.md', fakeFs(['R/.planning/v2.2-phases/P/F.md']))).toBe('.planning/v2.2-phases/P/F.md');
  });

  it('fails with a clear message when neither place has it', () => {
    expect(() => findPhaseFile('R', 'P', 'F.md', fakeFs([]))).toThrow(
      /F\.md not found: searched \.planning\/phases\/P\/ and the \.planning\/milestones\/\*-phases\//,
    );
  });

  it('resolves the real 51.3.1.2 draft', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, DRAFT_PATH))).toBe(true);
    expect(DRAFT_PATH.endsWith('51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md')).toBe(true);
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

describe('command line', () => {
  it('prints the chosen variants as JSON', () => {
    const out = execFileSync(process.execPath, ['scripts/llm/prompt_draft.mjs', 'chosen', DRAFT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out);
    expect(Object.keys(parsed).sort()).toEqual([...REQUIRED_CHOICES].sort());
    expect(parsed).toEqual(ownerChoices(DRAFT, DRAFT_RAW));
    expect(parsed['5']).toBe(ownerChoices(DRAFT, DRAFT_RAW)['5']);
  });

  it('refuses chosen, pins, write and check on a draft that is not APPROVED, and writes nothing (CR-01)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-draft-'));
    try {
      const draft = path.join(dir, 'draft.md');
      const layers = path.join(dir, 'layers.ts');
      fs.writeFileSync(draft, DRAFT.replace(/^Status: APPROVED [^\n]*$/m, 'Status: AWAITING OWNER APPROVAL'));
      fs.writeFileSync(layers, LAYERS);
      const runs = [
        ['chosen', draft],
        ['pins', draft, '## 1.', layers],
        ['write', draft, '## 1.', 'WORLD_GEN_BLOCK', layers],
        ['check', draft, '## 1.', 'WORLD_GEN_BLOCK', layers],
      ];
      for (const args of runs) {
        const r = spawnSync(process.execPath, ['scripts/llm/prompt_draft.mjs', ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
        expect(r.status, args[0]).toBe(1);
        expect(r.stdout, args[0]).toBe('');
        expect(r.stderr).toContain(`${args[0]}: draft is not APPROVED (Status: AWAITING OWNER APPROVAL)`);
      }
      expect(fs.readFileSync(layers, 'utf8')).toBe(LAYERS);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
