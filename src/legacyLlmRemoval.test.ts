import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static guards for the client cutover from the LLM proxy to the player's own job-status
// view (Plan 42-04). These read source text only; nothing here needs a DOM or a connection.

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

function read(relativePath: string): string {
  return readFileSync(`${ROOT}${relativePath}`, 'utf8');
}

function countMatches(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return (text.match(new RegExp(pattern.source, flags)) ?? []).length;
}

describe('client wiring', () => {
  const core = read('src/composables/data/useCoreData.ts');
  const app = read('src/App.vue');
  const consoleSrc = read('src/components/NarrativeConsole.vue');

  it('useCoreData subscribes to and rebinds my_llm_jobs only', () => {
    expect(core).toContain('toSql(tables.my_llm_jobs)');
    expect(core).toMatch(/rebind\(dbConn\.db\.my_llm_jobs,\s*llmJobs,/);
    expect(core).toMatch(/llmJobs\.value\s*=\s*\[\.\.\.dbConn\.db\.my_llm_jobs\.iter\(\)\]/);
    expect(core).toMatch(/^\s+llmJobs,$/m);
    expect(core).not.toMatch(/llm_task|llmTasks|llm_request/);
  });

  it('App.vue wires useLlmStatus and locks input only for creation and world generation', () => {
    expect(app).toMatch(/import\s*\{[^}]*useLlmStatus[^}]*\}\s*from\s*'\.\/composables\/useLlmStatus'/);
    expect(app).toMatch(/import\s*\{[^}]*resolveDisplayedLine[^}]*\}\s*from\s*'\.\/composables\/useLlmStatus'/);
    expect(app).toContain('useLlmStatus({ llmJobs })');
    expect(app).toMatch(
      /const isLlmInputLocked = computed\(\(\) => isCreationLlmProcessing\.value \|\| isWorldGenProcessing\.value\);/
    );
    expect(app).toContain('resolveDisplayedLine(llmStatus.value.indicatorLine, isLlmInputLocked.value)');
    expect(app).toMatch(/const isNarrativeLlmProcessing = isLlmInputLocked;/);
  });

  it('App.vue passes the indicator line to both consoles and locks on isLlmInputLocked', () => {
    expect(countMatches(app, /:llm-indicator-line="llmIndicatorLine"/)).toBe(2);
    expect(app).toContain(':is-llm-processing="isLlmInputLocked"');
    expect(app).toContain(':is-llm-processing="isNarrativeLlmProcessing"');
  });

  it('no is-llm-processing binding reads the status or the indicator line', () => {
    const bindings = app.match(/:is-llm-processing="[^"]*"/g) ?? [];
    expect(bindings.length).toBe(2);
    for (const binding of bindings) {
      expect(binding).not.toMatch(/llmStatus|llmIndicatorLine/);
    }
  });

  it('NarrativeConsole shows an accessible indicator from the prop', () => {
    expect(consoleSrc).toMatch(/llmIndicatorLine\?:\s*string\s*\|\s*null;/);
    const div = consoleSrc.match(/<div[^>]*class="llm-indicator"[^>]*>/s)?.[0] ?? '';
    expect(div).toContain('v-if="llmIndicatorLine"');
    expect(div).toContain('role="status"');
    expect(div).toContain('aria-live="polite"');
    expect(div).toContain(':style="consideringStyle"');
    expect(consoleSrc).toContain('{{ llmIndicatorLine }}');
    expect(consoleSrc).not.toContain('considering your fate');
  });

  it('NarrativeConsole keeps the pulse, adds a reduced-motion rule and the same input lock', () => {
    expect(consoleSrc).toMatch(/color:\s*'#ffd43b'/);
    expect(consoleSrc).toMatch(/fontStyle:\s*'italic'/);
    expect(consoleSrc).toMatch(/padding:\s*'4px 0'/);
    expect(consoleSrc).toContain("animation: 'narrativePulse 1.5s ease-in-out infinite'");
    expect(countMatches(consoleSrc, /@media \(prefers-reduced-motion: reduce\)/)).toBe(1);
    const media = consoleSrc.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\{[^}]*\}\s*\}/s)?.[0] ?? '';
    expect(media).toContain('.llm-indicator');
    expect(media).toContain('animation: none !important');
    expect(consoleSrc).toContain(':disabled="animIsAnimating || isLlmProcessing"');
  });
});

// ---------------------------------------------------------------------------
// proxy removal
// ---------------------------------------------------------------------------

const SKIPPED_DIRS = new Set(['module_bindings', 'node_modules']);
const SOURCE_EXTENSIONS = ['.ts', '.vue', '.js'];

function walkProduction(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walkProduction(`${dir}/${entry.name}`, out);
      continue;
    }
    const name = entry.name;
    if (name.endsWith('.test.ts')) continue;
    if (!SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))) continue;
    out.push(`${dir}/${name}`);
  }
  return out;
}

// The word list stays in this test file; the scan skips test files, so it never matches itself.
const FORBIDDEN_WORDS = [
  'llm_task',
  'llmTasks',
  'LlmTask',
  'useLlmProxy',
  'submitLlmResult',
  'isLlmProxyProcessing',
  'VITE_LLM_PROXY',
  'PROXY_SECRET',
  'localhost:8787',
  '127.0.0.1:8787',
  '/api/llm',
];

describe('proxy removal', () => {
  const files = walkProduction(`${ROOT}src`);

  it('scans a meaningful number of production files', () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it('no production client file names the proxy plumbing', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const word of FORBIDDEN_WORDS) {
        if (text.includes(word)) offenders.push(`${file.slice(ROOT.length)}: ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the retired credential key name appears only in legacyCredentials.ts', () => {
    const holders = files
      .filter((file) => readFileSync(file, 'utf8').includes('llm_proxy_secret'))
      .map((file) => file.slice(ROOT.length));
    expect(holders).toEqual(['src/legacyCredentials.ts']);
  });

  it('nothing reads import.meta.env as a whole object', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const re = /import\.meta\.env(?!\.)/g;
      if (re.test(text)) offenders.push(file.slice(ROOT.length));
    }
    expect(offenders).toEqual([]);
  });

  it('the proxy composable, the Worker source and the stale bindings copy are gone', () => {
    for (const gone of [
      'src/composables/useLlmProxy.ts',
      'llm-proxy/src/index.ts',
      'llm-proxy/package.json',
      'llm-proxy/wrangler.toml',
      'client',
    ]) {
      expect(existsSync(`${ROOT}${gone}`), gone).toBe(false);
    }
  });
});
