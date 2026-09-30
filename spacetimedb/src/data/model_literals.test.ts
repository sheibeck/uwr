import { describe, it, expect } from 'vitest';
// This tsconfig has no @types/node; vitest runs the file in Node, so the built-ins resolve at runtime.
// @ts-ignore
import { readdirSync, readFileSync, statSync } from 'node:fs';
// @ts-ignore
import { join, relative, sep } from 'node:path';
// @ts-ignore
import { fileURLToPath } from 'node:url';

// ============================================================================
// Repository model-ID guard (CLAUDE-01)
// ============================================================================
//
// spacetimedb/src/data/llm_models.ts is the ONLY file allowed to define a Claude
// model ID. Legacy sites that still carry an OpenAI (or stale Claude) literal are
// pinned below with their exact count. The allowlist is shrinkable: Phase 41
// removes each entry as its domain moves to the new layer, and the guard fails
// if an allowlisted site loses its literal without the entry being removed.
// ============================================================================

/** Repo-relative posix path -> exact number of model literals in that file. */
const LEGACY_MODEL_LITERALS: Record<string, number> = {
  'spacetimedb/src/index.ts': 4,
  'spacetimedb/src/helpers/combat_narration.ts': 1,
  'spacetimedb/src/reducers/npc_interaction.ts': 1,
  'spacetimedb/src/reducers/llm.ts': 2,
  'spacetimedb/src/helpers/renown.ts': 1, // removed by Plan 40-07
  'spacetimedb/src/schema/tables.ts': 1, // stale comment in the dead LlmRequest table, Phase 42
  'src/composables/useLlm.ts': 2, // dead client composable, Phase 42
};

const MODEL_LITERAL = /\b(?:gpt-\d[0-9a-z.-]*|claude-(?:sonnet|opus|haiku|fable|mythos|instant|\d)[0-9a-z.-]*)/gi;

/** Pure: report literal sites not in the allowlist, and allowlisted sites whose count differs (including zero). */
function auditModelLiterals(files: Record<string, string>, allowlist: Record<string, number>): string[] {
  const problems: string[] = [];
  const counts: Record<string, number> = {};
  for (const [path, text] of Object.entries(files)) {
    const n = (text.match(MODEL_LITERAL) ?? []).length;
    if (n > 0) counts[path] = n;
  }
  for (const [path, n] of Object.entries(counts)) {
    if (!(path in allowlist)) problems.push(`${path}: ${n} model literal(s) not in the allowlist`);
  }
  for (const [path, expected] of Object.entries(allowlist)) {
    const actual = counts[path] ?? 0;
    if (actual !== expected) problems.push(`${path}: expected ${expected} model literal(s), found ${actual}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Synthetic cases
// ---------------------------------------------------------------------------

describe('auditModelLiterals (synthetic)', () => {
  it('passes an exact match', () => {
    expect(auditModelLiterals({ 'a.ts': "const m = 'gpt-5-mini';" }, { 'a.ts': 1 })).toEqual([]);
  });

  it('fails a literal at a site not in the allowlist', () => {
    const problems = auditModelLiterals({ 'a.ts': "'claude-sonnet-5-5'", 'b.ts': 'clean' }, {});
    expect(problems).toEqual(['a.ts: 1 model literal(s) not in the allowlist']);
  });

  it('fails an allowlisted site that no longer contains its literal', () => {
    const problems = auditModelLiterals({ 'a.ts': 'clean' }, { 'a.ts': 1 });
    expect(problems).toEqual(['a.ts: expected 1 model literal(s), found 0']);
  });

  it('fails an allowlisted site that is missing from the scan', () => {
    expect(auditModelLiterals({}, { 'a.ts': 2 })).toEqual(['a.ts: expected 2 model literal(s), found 0']);
  });

  it('fails a count mismatch', () => {
    const problems = auditModelLiterals({ 'a.ts': "'gpt-5.4' 'gpt-5-mini' 'gpt-4o'" }, { 'a.ts': 2 });
    expect(problems).toEqual(['a.ts: expected 2 model literal(s), found 3']);
  });

  it('does not flag non-model words', () => {
    expect(auditModelLiterals({ 'a.ts': 'claude-code gptx-1 the claude family' }, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Real repository scan
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // spacetimedb/src/data -> repo root
const SCAN_ROOTS = ['spacetimedb/src', 'src', 'llm-proxy/src'];
const EXCLUDED_DIRS = new Set(['node_modules', 'module_bindings', 'dist', '__fixtures__', '__snapshots__']);
const EXTENSIONS = ['.ts', '.vue', '.js'];
const MODELS_FILE = 'spacetimedb/src/data/llm_models.ts';

function walk(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return; // a scan root that does not exist is simply empty
  }
  for (const name of names) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDED_DIRS.has(name)) walk(full, out);
    } else if (EXTENSIONS.some((e) => name.endsWith(e)) && !name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
}

function scanRepo(): Record<string, string> {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
  const out: Record<string, string> = {};
  for (const f of files) {
    const rel = relative(REPO_ROOT, f).split(sep).join('/');
    if (rel === MODELS_FILE) continue;
    out[rel] = readFileSync(f, 'utf8');
  }
  return out;
}

describe('repository model-literal guard', () => {
  const files = scanRepo();

  it('scans a plausible number of files', () => {
    expect(Object.keys(files).length).toBeGreaterThan(50);
  });

  it('matches the pinned legacy allowlist exactly', () => {
    expect(auditModelLiterals(files, LEGACY_MODEL_LITERALS)).toEqual([]);
  });

  it('llm_models.ts holds exactly one model literal, claude-sonnet-5-5', () => {
    const text = readFileSync(join(REPO_ROOT, MODELS_FILE), 'utf8');
    const matches = text.match(MODEL_LITERAL) ?? [];
    expect(matches).toEqual(['claude-sonnet-5-5']);
  });

  it('no production module under spacetimedb/src calls http.fetch( (spend safety, until the Phase 41 executor)', () => {
    const offenders = Object.entries(files)
      .filter(([path]) => path.startsWith('spacetimedb/src/'))
      .filter(([, text]) => text.includes('http.fetch('))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
