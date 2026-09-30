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
  'spacetimedb/src/reducers/llm.ts': 2,
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

// ---------------------------------------------------------------------------
// Spend-safety fetch guard
// ---------------------------------------------------------------------------

/**
 * Files exempt from the fetch guard. test-utils.ts is test support that defines a fake fetch and is
 * never bundled into the module. llm_executor.ts is the Phase 41 executor: the only production file
 * that reaches the outbound call.
 */
const FETCH_GUARD_EXEMPT = new Set([
  'spacetimedb/src/helpers/test-utils.ts',
  'spacetimedb/src/helpers/llm_executor.ts',
]);

const FETCH_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/, // http.fetch(, ctx.http.fetch (, a global fetch(
  /\[\s*['"`]fetch['"`]\s*\]/, // ctx.http["fetch"](
  /\b(?:ctx|tx)\s*(?:\.\s*http\b|\[\s*['"`]http['"`]\s*\])/, // reaching http through the context at all
  /\{[^}]*\bhttp\b[^}]*\}\s*=\s*(?:ctx|tx)\b/, // const { http } = ctx
];

/** Pure: does this source text reach the outbound fetch by any common spelling? */
function usesFetch(text: string): boolean {
  return FETCH_PATTERNS.some((re) => re.test(text));
}

describe('usesFetch (synthetic)', () => {
  it.each([
    'ctx.http.fetch(url)',
    'ctx.http.fetch (url)',
    'const { http } = ctx;\nhttp.fetch (url);',
    'ctx["http"].fetch(url)',
    "ctx['http']['fetch'](url)",
    'await fetch(url)',
    'globalThis.fetch(url)',
    'const { fetch } = ctx.http;',
    'tx.http',
  ])('flags %j', (src) => {
    expect(usesFetch(src)).toBe(true);
  });

  it.each([
    'const fetchedAt = ctx.timestamp;',
    'classify the response after a fetch failed',
    'const prefetched = 1;',
    'ctx.db.llm_job.insert(row)',
  ])('does not flag %j', (src) => {
    expect(usesFetch(src)).toBe(false);
  });
});

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

  it('only the executor reaches fetch (spend safety): exactly spacetimedb/src/helpers/llm_executor.ts', () => {
    const offenders = Object.entries(files)
      .filter(([path]) => path.startsWith('spacetimedb/src/'))
      .filter(([path]) => path !== 'spacetimedb/src/helpers/test-utils.ts')
      .filter(([, text]) => usesFetch(text))
      .map(([path]) => path)
      .sort();
    expect(offenders).toEqual(['spacetimedb/src/helpers/llm_executor.ts']);
  });

  it('the fetch-guard exemption list is exactly test-utils.ts and the executor', () => {
    expect([...FETCH_GUARD_EXEMPT].sort()).toEqual([
      'spacetimedb/src/helpers/llm_executor.ts',
      'spacetimedb/src/helpers/test-utils.ts',
    ]);
  });
});
