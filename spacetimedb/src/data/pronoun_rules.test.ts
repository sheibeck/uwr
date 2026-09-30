import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';

// ============================================================================
// Repository pronoun guard (Plan 41-18; user decision of 2026-09-30)
// ============================================================================
//
// The Keeper is male (he, him, his). Every NPC is male or female (he or she).
// The player's own character is always addressed as you, and text another player
// reads about a player's character carries no pronoun (player characters have no
// gender). Beasts and monsters may be it.
//
// Three line patterns are scanned over non-comment lines:
//   KEEPER_IT_OR_THEY  - a line where "Keeper" is followed, in the same sentence,
//                        by its, itself, they, them, their, theirs or themselves.
//                        Scanned in production .ts and .vue files AND in every
//                        .snap file under spacetimedb/src.
//   NAME_IT_OR_THEY    - a template line that interpolates a name and then uses a
//                        plural or neuter pronoun for that name. Two lines about
//                        things (not people) are allowlisted with a reason.
//   reflexive          - "themselves" or "themself" inside production string
//                        literals.
// plus a structural check: the Character table has no gender column, the Npc
// table does.
// ============================================================================

const KEEPER_IT_OR_THEY = /\bKeeper\b[^.]*\b(its|itself|they|them|their|theirs|themselves)\b/;
const NAME_IT_OR_THEY =
  /\$\{[^}]*[nN]ame[^}]*\}[^`'"]*\b(they|them|their|theirs|themselves|its|itself)\b/;
const REFLEXIVE = /\b(themselves|themself)\b/;

/** Lines about things, not people. Each entry must match exactly one line. */
const NAME_ALLOWLIST: { file: string; contains: string; reason: string }[] = [
  {
    file: 'spacetimedb/src/helpers/corpse.ts',
    contains: 'return to claim them',
    reason: 'them is the dead character\'s belongings (items), not the character',
  },
  {
    file: 'spacetimedb/src/index.ts',
    contains: 'You will never see them again',
    reason: 'them is the unchosen abilities, not a person',
  },
];

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--');
}

/** Pure: lines (1-based) of non-comment text matching the pattern. */
function auditLines(text: string, pattern: RegExp): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  text.split('\n').forEach((l, i) => {
    if (!isCommentLine(l) && pattern.test(l)) out.push({ line: i + 1, text: l.trim() });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Synthetic cases
// ---------------------------------------------------------------------------

describe('pronoun audit (synthetic)', () => {
  it('flags the Keeper called it or they, and passes he', () => {
    expect(auditLines("'The Keeper shakes its head.'", KEEPER_IT_OR_THEY)).toHaveLength(1);
    expect(auditLines("'The Keeper shakes their head.'", KEEPER_IT_OR_THEY)).toHaveLength(1);
    expect(auditLines("'The Keeper shakes his head.'", KEEPER_IT_OR_THEY)).toHaveLength(0);
  });

  it('ignores comment lines', () => {
    expect(auditLines('// The Keeper shakes its head.', KEEPER_IT_OR_THEY)).toHaveLength(0);
    expect(auditLines(' * The Keeper shakes its head.', KEEPER_IT_OR_THEY)).toHaveLength(0);
  });

  it('flags a name interpolation followed by a plural pronoun', () => {
    expect(auditLines('`${npc.name} eyes you warily. Something about you puts them on edge.`', NAME_IT_OR_THEY)).toHaveLength(1);
    expect(auditLines('`${npc.name} eyes you warily and keeps his distance.`', NAME_IT_OR_THEY)).toHaveLength(0);
  });

  it('flags a reflexive plural in a string', () => {
    expect(auditLines("'Leader cannot kick themselves'", REFLEXIVE)).toHaveLength(1);
    expect(auditLines("'You cannot kick yourself.'", REFLEXIVE)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Repository scan
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // spacetimedb/src/data -> repo root
const SCAN_ROOTS = ['spacetimedb/src', 'src'];
const EXCLUDED_DIRS = new Set(['node_modules', 'module_bindings', 'dist', '__fixtures__']);

function isTestFile(name: string): boolean {
  return name.endsWith('.test.ts') || name.endsWith('.spec.ts') || name.endsWith('.test.mjs');
}

function walk(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!EXCLUDED_DIRS.has(name)) walk(full, out);
    } else {
      out.push(full);
    }
  }
}

const source: Record<string, string> = {};
const snapshots: Record<string, string> = {};
{
  const all: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), all);
  for (const f of all) {
    const rel = relative(REPO_ROOT, f).split(sep).join('/');
    const name = rel.split('/').pop() as string;
    if ((name.endsWith('.ts') || name.endsWith('.vue')) && !isTestFile(name)) {
      source[rel] = readFileSync(f, 'utf8');
    } else if (name.endsWith('.snap') && rel.startsWith('spacetimedb/src/')) {
      snapshots[rel] = readFileSync(f, 'utf8');
    }
  }
}

function scanAll(files: Record<string, string>, pattern: RegExp): string[] {
  const hits: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const h of auditLines(text, pattern)) hits.push(`${file}:${h.line}: ${h.text.slice(0, 160)}`);
  }
  return hits;
}

describe('repository pronoun guard', () => {
  it('scans a plausible number of files', () => {
    expect(Object.keys(source).length).toBeGreaterThan(50);
    expect(Object.keys(snapshots).length).toBeGreaterThan(1);
  });

  it('KEEPER_IT_OR_THEY: no fixed line in source or snapshots calls the Keeper it or they', () => {
    expect(scanAll(source, KEEPER_IT_OR_THEY)).toEqual([]);
    expect(scanAll(snapshots, KEEPER_IT_OR_THEY)).toEqual([]);
  });

  it('NAME_IT_OR_THEY: no name interpolation is followed by a plural or neuter pronoun, outside the allowlist', () => {
    const hits = scanAll(source, NAME_IT_OR_THEY).filter(
      (h) => !NAME_ALLOWLIST.some((a) => h.startsWith(a.file + ':') && h.includes(a.contains))
    );
    expect(hits).toEqual([]);
  });

  it('the allowlist holds exactly two entries and each matches exactly one line (none stale)', () => {
    expect(NAME_ALLOWLIST).toHaveLength(2);
    for (const a of NAME_ALLOWLIST) {
      expect(a.reason.length).toBeGreaterThan(0);
      const matches = scanAll({ [a.file]: source[a.file] ?? '' }, NAME_IT_OR_THEY).filter((h) => h.includes(a.contains));
      expect(matches, `stale or ambiguous allowlist entry: ${a.file} ${a.contains}`).toHaveLength(1);
    }
  });

  it('reflexive: no production string literal says themselves or themself', () => {
    const hits = scanAll(source, REFLEXIVE).filter((h) => /['"`][^'"`]*\b(themselves|themself)\b/.test(h));
    expect(hits).toEqual([]);
  });

  it('player characters have no gender: the Character table has none, the Npc table has it', () => {
    const tables = source['spacetimedb/src/schema/tables.ts'];
    const block = (name: string): string => {
      const start = tables.indexOf(`export const ${name} = table(`);
      expect(start, `${name} table`).toBeGreaterThanOrEqual(0);
      const next = tables.indexOf('\nexport const ', start + 10);
      return tables.slice(start, next === -1 ? undefined : next);
    };
    expect(block('Character')).not.toMatch(/\bgender\b/i);
    expect(block('Npc')).toMatch(/gender: t\.string\(\)\.default\(''\)/);
  });
});
