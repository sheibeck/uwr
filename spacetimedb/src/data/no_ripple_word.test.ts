import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';

// ============================================================================
// Banned-word guard: "ripple"
// ============================================================================
//
// "Ripple System" is a copyrighted name. World-growing announcements (new
// regions, discoveries) are always called World events, in code identifiers,
// CSS classes and player-facing text alike. This guard fails if the word
// appears in any form, in any case, in non-test source under spacetimedb/src
// or src (generated bindings in src/module_bindings are excluded).
// ============================================================================

const BANNED = /ripple/i;

/** Pure: report every `path:line` whose text contains the banned word. */
function findBannedWord(files: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [path, text] of Object.entries(files)) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (BANNED.test(line)) hits.push(`${path}:${i + 1}`);
    });
  }
  return hits;
}

describe('findBannedWord (synthetic)', () => {
  it('flags the word in any case and inside identifiers', () => {
    const files = {
      'a.ts': "const RIPPLE_TEMPLATES = [];\nconst ok = 1;",
      'b.vue': '.line-ripple { color: red; }',
      'c.ts': "label: 'Ripple'",
    };
    expect(findBannedWord(files)).toEqual(['a.ts:1', 'b.vue:1', 'c.ts:1']);
  });

  it('passes clean text', () => {
    expect(findBannedWord({ 'a.ts': "label: 'World event'" })).toEqual([]);
  });
});

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // spacetimedb/src/data -> repo root
const SCAN_ROOTS = ['spacetimedb/src', 'src'];
const EXCLUDED_DIRS = new Set(['node_modules', 'module_bindings', 'dist', '__snapshots__']);
const EXTENSIONS = ['.ts', '.vue', '.js', '.css', '.html', '.json'];

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
    } else if (EXTENSIONS.some((e) => name.endsWith(e)) && !/\.test\.ts$/.test(name)) {
      out.push(full);
    }
  }
}

describe('repository source never uses the word "ripple"', () => {
  it('scans spacetimedb/src and src (excluding tests and generated bindings)', () => {
    const paths: string[] = [];
    for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), paths);
    expect(paths.length).toBeGreaterThan(50); // the scan really found the source tree
    const files: Record<string, string> = {};
    for (const p of paths) files[relative(REPO_ROOT, p).split(sep).join('/')] = readFileSync(p, 'utf8');
    expect(findBannedWord(files)).toEqual([]);
  });
});
