import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
