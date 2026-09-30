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
    expect(app).toContain('resolveDisplayedLine(creationLlmStatus.value.indicatorLine, isLlmInputLocked.value)');
    expect(app).toContain('resolveDisplayedLine(gameLlmStatus.value.indicatorLine, isLlmInputLocked.value)');
    expect(app).toMatch(/const isNarrativeLlmProcessing = isLlmInputLocked;/);
  });

  it('App.vue passes each console its own scoped indicator line (WR-02) and locks on isLlmInputLocked', () => {
    expect(app).toMatch(
      /const \{ creationStatus: creationLlmStatus, gameStatus: gameLlmStatus \} = useLlmStatus\(\{ llmJobs \}\);/
    );
    expect(countMatches(app, /:llm-indicator-line="creationLlmIndicatorLine"/)).toBe(1);
    expect(countMatches(app, /:llm-indicator-line="gameLlmIndicatorLine"/)).toBe(1);
    expect(countMatches(app, /:llm-indicator-line="/)).toBe(2);
    // The creation console (creation-mode) gets the creation line; the game console gets the game line.
    const creationConsole = app.match(/<NarrativeConsole[^>]*:creation-mode="true"[^>]*>/s)?.[0] ?? '';
    expect(creationConsole).toContain(':llm-indicator-line="creationLlmIndicatorLine"');
    expect(app).toContain(':is-llm-processing="isLlmInputLocked"');
    expect(app).toContain(':is-llm-processing="isNarrativeLlmProcessing"');
  });

  it('no is-llm-processing binding reads the status or the indicator line', () => {
    const bindings = app.match(/:is-llm-processing="[^"]*"/g) ?? [];
    expect(bindings.length).toBe(2);
    for (const binding of bindings) {
      expect(binding).not.toMatch(/LlmStatus|llmStatus|IndicatorLine|indicatorLine/);
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

// ---------------------------------------------------------------------------
// docs
// ---------------------------------------------------------------------------

describe('docs', () => {
  const readme = read('README.md');
  const skill = read('.claude/skills/run-local/SKILL.md');
  const banned = /llm-proxy|wrangler|workerd|8787|llm_proxy_secret|\.dev\.vars/i;

  it('README and the run-local skill no longer mention the proxy', () => {
    expect(readme).not.toMatch(banned);
    expect(skill).not.toMatch(banned);
  });

  it('both point to the key runbook', () => {
    expect(readme).toContain('docs/runbooks/llm-key.md');
    expect(skill).toContain('docs/runbooks/llm-key.md');
  });

  it('README steps are renumbered without the proxy step', () => {
    expect(readme).toContain('### 6. Start the frontend dev server');
    expect(readme).not.toContain('### 7.');
  });

  it('the skill keeps its stop-and-ask rule and checks only ports 3000 and 5173', () => {
    expect(skill).toContain('stop-and-ask');
    const portChecks = skill.match(/:\((?:[0-9]+\|?)+\)/g) ?? [];
    expect(portChecks.length).toBe(2);
    for (const check of portChecks) expect(check).toBe(':(3000|5173)');
  });
});

// ---------------------------------------------------------------------------
// generated bindings after publish 2 (Plan 42-07; flips the publish-1 pin from 42-05)
// ---------------------------------------------------------------------------

describe('generated bindings after publish 2', () => {
  const bindingsDir = `${ROOT}src/module_bindings`;
  const names = readdirSync(bindingsDir);
  const REMOVED_FILE =
    /llm_task|llm_request|llm_budget|llm_cleanup_tick|submit_llm_result|validate_llm_request|purge_llm_tasks|purge_legacy_llm|sweep_llm_errors/;

  it('has no table or reducer file for the legacy tables, the removed reducers, the sweep or the purge', () => {
    expect(names.filter((name) => REMOVED_FILE.test(name))).toEqual([]);
  });

  it('index.ts names none of the removed tables or reducers', () => {
    const index = readFileSync(`${bindingsDir}/index.ts`, 'utf8');
    expect(index).not.toMatch(
      /llmTask|llm_task|purgeLegacyLlm|purge_legacy_llm|submitLlmResult|submit_llm_result|validateLlmRequest|validate_llm_request/
    );
  });

  it('keeps the player job view and the admin key-status view', () => {
    expect(names).toContain('my_llm_jobs_table.ts');
    expect(names).toContain('admin_llm_status_table.ts');
  });

  it('no generated reducer takes a resultText argument', () => {
    const offenders = names
      .filter((name) => name.endsWith('_reducer.ts'))
      .filter((name) => /resultText|result_text/.test(readFileSync(`${bindingsDir}/${name}`, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
