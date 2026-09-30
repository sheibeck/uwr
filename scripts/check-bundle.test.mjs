// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/check-bundle.test.mjs
// Pure rules for the dist/ credential guard, plus a few runs over temp directories and the CLI.
// Every fixture is synthetic. Nothing here reads a real bundle, key, token or env file, and the
// tests assert that the guard never echoes matched or neighbouring text.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BUNDLE_RULES,
  BUNDLE_TEXT_EXTENSIONS,
  auditBundle,
  collectBundleFiles,
  locateBundleHits,
  runBundleCheck,
} from './check-bundle.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'check-bundle.mjs');
const KEY = 'llm_proxy_secret';

const tempDirs = [];
function tempDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-bundle-'));
  tempDirs.push(dir);
  return dir;
}
function put(dir, rel, content) {
  const full = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

const ruleIds = (files) => auditBundle(files).map((p) => p.split(':')[0]);

describe('constants', () => {
  it('lists the text extensions and is frozen', () => {
    expect([...BUNDLE_TEXT_EXTENSIONS]).toEqual(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map']);
    expect(Object.isFrozen(BUNDLE_TEXT_EXTENSIONS)).toBe(true);
    expect(Object.isFrozen(BUNDLE_RULES)).toBe(true);
  });

  it('has the expected rule ids', () => {
    expect(BUNDLE_RULES.map((r) => r.id)).toEqual([
      'proxy-key-name',
      'proxy-secret',
      'proxy-env',
      'proxy-url',
      'provider-host',
      'provider-key',
      'key-shaped',
    ]);
  });
});

describe('auditBundle: the one allowed removeItem', () => {
  it('passes clean code', () => {
    expect(auditBundle({ 'assets/app.js': 'clean code' })).toEqual([]);
  });

  it.each([
    ['double quotes', `localStorage.removeItem("${KEY}")`],
    ['single quotes', `localStorage.removeItem('${KEY}')`],
    ['a backtick', `localStorage.removeItem(\`${KEY}\`)`],
    ['inner whitespace', `localStorage.removeItem(  "${KEY}"  )`],
  ])('allows one removeItem call with %s', (_name, code) => {
    expect(auditBundle({ 'assets/app.js': code })).toEqual([]);
  });

  it('fails the key-name rule on two removeItem calls in one file', () => {
    const code = `a.removeItem("${KEY}");b.removeItem("${KEY}")`;
    expect(ruleIds({ 'assets/app.js': code })).toContain('proxy-key-name');
  });

  it('fails the key-name rule on two removeItem calls in two files', () => {
    const code = `a.removeItem("${KEY}")`;
    const problems = auditBundle({ 'assets/a.js': code, 'assets/b.js': code });
    expect(problems).toContain('proxy-key-name: assets/b.js');
    // The first file in sorted order holds the allowed span.
    expect(problems).not.toContain('proxy-key-name: assets/a.js');
  });

  it('fails on a getItem of the key', () => {
    expect(ruleIds({ 'assets/app.js': `localStorage.getItem("${KEY}")` })).toContain('proxy-key-name');
  });

  it('fails on a setItem of the key', () => {
    expect(ruleIds({ 'assets/app.js': `localStorage.setItem("${KEY}","v")` })).toContain('proxy-key-name');
  });

  it('fails on a bare occurrence of the key name', () => {
    expect(ruleIds({ 'assets/app.js': `const k="${KEY}";` })).toContain('proxy-key-name');
  });

  it('fails on a removeItem with mismatched quotes', () => {
    expect(ruleIds({ 'assets/app.js': `a.removeItem("${KEY}')` })).toContain('proxy-key-name');
  });

  it('fails on a removeItem of the key plus a getItem in the same file', () => {
    const code = `a.removeItem("${KEY}");a.getItem("${KEY}")`;
    expect(ruleIds({ 'assets/app.js': code })).toContain('proxy-key-name');
  });
});

describe('auditBundle: rules', () => {
  it.each([
    'http://localhost:8787/x',
    'http://127.0.0.1:8787/x',
    'fetch(`${u}/api/llm`)',
    'uwr-llm-proxy',
    'https://thing.workers.dev',
  ])('fails the proxy-url rule on %s', (text) => {
    expect(auditBundle({ 'assets/app.js': text })).toContain('proxy-url: assets/app.js');
  });

  it('fails the proxy-env rule on VITE_LLM_PROXY_URL', () => {
    expect(auditBundle({ 'assets/app.js': 'VITE_LLM_PROXY_URL' })).toContain('proxy-env: assets/app.js');
  });

  it.each(['PROXY_SECRET', 'my-proxy-secret-123'])('fails the proxy-secret rule on %s', (text) => {
    expect(auditBundle({ 'assets/app.js': text })).toContain('proxy-secret: assets/app.js');
  });

  it.each(['sk-ant-abc', 'sk-abcdefghijklmnopqrstuvwx'])('fails the key-shaped rule on %s', (text) => {
    expect(auditBundle({ 'assets/app.js': `const k="${text}"` })).toContain('key-shaped: assets/app.js');
  });

  it.each(['task-list-item-renderer-component', 'risk-assessment-alpha-beta-gamma-delta'])(
    'does not fire the key-shaped rule on %s',
    (text) => {
      expect(auditBundle({ 'assets/app.js': `const c="${text}"` })).toEqual([]);
    },
  );

  it.each(['api.anthropic.com', 'api.openai.com'])('fails the provider-host rule on %s', (text) => {
    expect(auditBundle({ 'assets/app.js': text })).toContain('provider-host: assets/app.js');
  });

  it.each(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'x-api-key'])('fails the provider-key rule on %s', (text) => {
    expect(auditBundle({ 'assets/app.js': text })).toContain('provider-key: assets/app.js');
  });

  it('returns sorted, de-duplicated "<rule id>: <path>" strings', () => {
    const problems = auditBundle({
      'b.js': 'VITE_LLM_PROXY_A VITE_LLM_PROXY_B',
      'a.js': 'VITE_LLM_PROXY_C',
    });
    expect(problems).toEqual(['proxy-env: a.js', 'proxy-env: b.js']);
  });

  it('never puts the planted text in a problem string', () => {
    const problems = auditBundle({ 'assets/app.js': 'const k="sk-ant-SECRETVALUE123";' });
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      expect(problem).not.toContain('SECRETVALUE');
      expect(problem).toMatch(/^[a-z-]+: \S+$/);
    }
  });
});

describe('locateBundleHits', () => {
  it('returns exactly the keys rule, path, offset and inside', () => {
    const hits = locateBundleHits({ 'a.js': 'const x = VITE_LLM_PROXY_URL;' });
    expect(hits).toHaveLength(1);
    expect(Object.keys(hits[0]).sort()).toEqual(['inside', 'offset', 'path', 'rule']);
    expect(hits[0]).toEqual({ rule: 'proxy-env', path: 'a.js', offset: 10, inside: 'code' });
  });

  it.each([
    ['double-quoted', 'const a = "VITE_LLM_PROXY_X";', 'string'],
    ['single-quoted', "const a = 'VITE_LLM_PROXY_X';", 'string'],
    ['backtick', 'const a = `VITE_LLM_PROXY_X`;', 'string'],
    ['escaped quote inside a string', 'const a = "q\\"VITE_LLM_PROXY_X";', 'string'],
    ['line comment', 'var a = 1; // VITE_LLM_PROXY_X\nvar b = 2;', 'comment'],
    ['block comment', 'var a = 1; /* VITE_LLM_PROXY_X */ var b = 2;', 'comment'],
    ['bare identifier', 'const a = VITE_LLM_PROXY_X;', 'code'],
    ['code after a finished string', 'var a = "ok"; VITE_LLM_PROXY_X', 'code'],
    ['code after a finished comment', '/* c */ VITE_LLM_PROXY_X', 'code'],
    ['code on the line after a line comment', '// c\nVITE_LLM_PROXY_X', 'code'],
  ])('classifies a token in a %s as %s', (_name, text, expected) => {
    const hits = locateBundleHits({ 'a.js': text });
    expect(hits).toHaveLength(1);
    expect(hits[0].inside).toBe(expected);
  });

  it('counts the offset in UTF-8 bytes after non-ASCII characters', () => {
    const prefix = 'const s = "é€😀"; ';
    const hits = locateBundleHits({ 'a.js': `${prefix}VITE_LLM_PROXY_X` });
    expect(hits).toHaveLength(1);
    expect(hits[0].offset).toBe(Buffer.byteLength(prefix, 'utf8'));
    expect(hits[0].offset).toBeGreaterThan(prefix.length);
  });

  it('produces no hit for the single allowed removeItem span', () => {
    expect(locateBundleHits({ 'a.js': `x.removeItem("${KEY}")` })).toEqual([]);
  });

  it('reports the getItem use and not the allowed span', () => {
    const text = `x.removeItem("${KEY}");y.getItem("${KEY}")`;
    const hits = locateBundleHits({ 'a.js': text });
    expect(hits.length).toBeGreaterThan(0);
    const second = text.indexOf(`getItem("`) + `getItem("`.length;
    for (const hit of hits) {
      expect(hit.offset).toBeGreaterThanOrEqual(second);
      expect(hit.offset).toBeLessThan(second + KEY.length);
    }
    expect(hits.find((h) => h.rule === 'proxy-key-name').offset).toBe(second);
    expect(new Set(hits.map((h) => h.rule))).toEqual(new Set(['proxy-key-name', 'proxy-secret']));
  });

  it('sorts hits by path then offset', () => {
    const hits = locateBundleHits({
      'b.js': 'VITE_LLM_PROXY_A',
      'a.js': 'xx VITE_LLM_PROXY_B yy VITE_LLM_PROXY_C',
    });
    expect(hits.map((h) => [h.path, h.offset])).toEqual([
      ['a.js', 3],
      ['a.js', 23],
      ['b.js', 0],
    ]);
  });

  it('returns hits for the same set of files that auditBundle flags', () => {
    const files = {
      'a.js': 'const k="sk-ant-X";',
      'b.css': 'a{}',
      'c.html': 'api.openai.com',
    };
    const fromAudit = auditBundle(files).sort();
    const fromLocate = [...new Set(locateBundleHits(files).map((h) => `${h.rule}: ${h.path}`))].sort();
    expect(fromLocate).toEqual(fromAudit);
  });

  it('returns no matched text', () => {
    const hits = locateBundleHits({ 'a.js': 'const k="sk-ant-SECRETVALUE123";' });
    expect(JSON.stringify(hits)).not.toContain('SECRETVALUE');
  });
});

describe('collectBundleFiles', () => {
  it('reads only text extensions, recursively, keyed by posix path', () => {
    const dir = tempDist();
    put(dir, 'index.html', '<html></html>');
    put(dir, 'assets/app.js', 'x');
    put(dir, 'assets/app.css', 'y');
    put(dir, 'assets/app.js.map', '{}');
    put(dir, 'assets/deep/chunk.mjs', 'z');
    put(dir, 'assets/logo.png', randomBytes(32));
    const files = collectBundleFiles(dir);
    expect(Object.keys(files).sort()).toEqual([
      'assets/app.css',
      'assets/app.js',
      'assets/app.js.map',
      'assets/deep/chunk.mjs',
      'index.html',
    ]);
    expect(files['assets/app.js']).toBe('x');
  });
});

describe('runBundleCheck', () => {
  it('returns code 0 for a clean dist', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', 'console.log("hi")');
    put(dir, 'index.html', '<html></html>');
    const result = runBundleCheck(dir);
    expect(result.code).toBe(0);
    expect(result.lines).toEqual(['bundle clean: 2 files scanned']);
  });

  it('accepts the one allowed removeItem in a real-looking dist', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', `localStorage.removeItem("${KEY}")`);
    expect(runBundleCheck(dir).code).toBe(0);
  });

  it('fails and lists css, html and map files that hold a planted token', () => {
    const dir = tempDist();
    const token = 'VITE_LLM_PROXY_URL';
    put(dir, 'assets/app.js', 'clean');
    put(dir, 'assets/app.css', `/* ${token} */`);
    put(dir, 'index.html', `<script>${token}</script>`);
    put(dir, 'assets/app.js.map', `{"sourcesContent":["${token}"]}`);
    const result = runBundleCheck(dir);
    expect(result.code).toBe(1);
    expect(result.lines.sort()).toEqual([
      'proxy-env: assets/app.css',
      'proxy-env: assets/app.js.map',
      'proxy-env: index.html',
    ]);
  });

  it('catches a planted token in a UTF-8 file with non-ASCII text', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', 'const t="héllo € 😀"; const k="sk-ant-X";');
    const result = runBundleCheck(dir);
    expect(result.code).toBe(1);
    expect(result.lines).toEqual(['key-shaped: assets/app.js']);
  });

  it('skips a .png of random bytes even when it holds a token', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', 'clean');
    put(dir, 'assets/logo.png', Buffer.concat([randomBytes(64), Buffer.from('sk-ant-HIDDEN'), randomBytes(64)]));
    expect(runBundleCheck(dir).code).toBe(0);
  });

  it('returns code 2 for a missing dir', () => {
    const dir = path.join(tempDist(), 'nope');
    const result = runBundleCheck(dir);
    expect(result.code).toBe(2);
    expect(result.lines.join(' ')).toMatch(/pnpm build/);
  });

  it('returns code 2 for a dir with no JavaScript', () => {
    const dir = tempDist();
    put(dir, 'index.html', '<html></html>');
    put(dir, 'assets/app.css', 'a{}');
    const result = runBundleCheck(dir);
    expect(result.code).toBe(2);
    expect(result.lines.join(' ')).toMatch(/pnpm build/);
  });

  it('in explain mode adds offset and the inside class, nothing else', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', 'const a = "x"; // VITE_LLM_PROXY_URL\n');
    const result = runBundleCheck(dir, { explain: true });
    expect(result.code).toBe(1);
    expect(result.lines).toEqual(['proxy-env: assets/app.js @18 (comment)']);
  });
});

describe('CLI', () => {
  it('exits 1 on a planted token and prints no planted text', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', 'const k="sk-ant-SECRETVALUE123";');
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('key-shaped: assets/app.js');
    expect(run.stdout).not.toContain('SECRETVALUE');
    expect(run.stderr).not.toContain('SECRETVALUE');
  });

  it('exits 0 on a clean dist', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', 'clean');
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('bundle clean: 1 files scanned');
  });

  it('exits 2 for an empty dir', () => {
    const dir = tempDist();
    const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
    expect(run.status).toBe(2);
  });

  it('exits 2 for a missing dir', () => {
    const run = spawnSync(process.execPath, [SCRIPT, path.join(tempDist(), 'missing')], { encoding: 'utf8' });
    expect(run.status).toBe(2);
  });

  it('--explain prints one line per hit with rule, path, offset and class, and no bundle text', () => {
    const dir = tempDist();
    const before = 'const endpointZQX="http://localhost:8787/relay-ZQX-neighbour/v9";';
    const planted = 'sk-ant-FIXTUREVALUE0123456789';
    const after = 'const afterZQX="trailing-ZQX-neighbour-text";';
    const text = `${before}const credentialZQX="${planted}";${after}`;
    put(dir, 'assets/app.js', text);

    const run = spawnSync(process.execPath, [SCRIPT, '--explain', dir], { encoding: 'utf8' });
    expect(run.status).toBe(1);

    const lines = run.stdout.split(/\r?\n/).filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(line).toMatch(/^[a-z-]+: assets\/app\.js @\d+ \((string|comment|code)\)$/);
    }
    expect(lines.some((l) => l.startsWith('key-shaped: '))).toBe(true);
    expect(lines.some((l) => l.startsWith('proxy-url: '))).toBe(true);

    const start = text.indexOf(planted);
    const window = text.slice(Math.max(0, start - 40), start + planted.length + 40);
    const output = run.stdout + run.stderr;
    expect(output).not.toContain(planted);
    expect(output).not.toContain('FIXTUREVALUE');
    for (let i = 0; i + 10 <= window.length; i += 1) {
      expect(output).not.toContain(window.slice(i, i + 10));
    }
  });

  it('the --explain flag may follow the directory', () => {
    const dir = tempDist();
    put(dir, 'assets/app.js', 'VITE_LLM_PROXY_X');
    const run = spawnSync(process.execPath, [SCRIPT, dir, '--explain'], { encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stdout).toMatch(/proxy-env: assets\/app\.js @0 \(code\)/);
  });
});

// WR-04: the guard only protects a deploy if the build runs it and a failing guard fails the build.
describe('build wiring', () => {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

  it('pnpm build runs the guard as its last step, chained with && so a failure fails the build', () => {
    const build = pkg.scripts.build;
    const steps = build.split('&&').map((s) => s.trim());
    expect(steps[steps.length - 1]).toBe('node scripts/check-bundle.mjs');
    expect(steps.indexOf('vite build')).toBeGreaterThanOrEqual(0);
    expect(steps.indexOf('vite build')).toBeLessThan(steps.length - 1);
    // No separator that would swallow the guard's exit code.
    expect(build).not.toMatch(/\|\||;|\|/);
  });

  it('the guard runs with its default dist/ and prints no bundle text (no --explain in the build)', () => {
    expect(pkg.scripts.build).not.toContain('--explain');
  });

  it('README lists the guard under Available Scripts and in the manual deploy steps', () => {
    const scripts = readme.slice(readme.indexOf('## Available Scripts'), readme.indexOf('## Deployment'));
    expect(scripts).toContain('node scripts/check-bundle.mjs');
    expect(scripts).toMatch(/pnpm build\s+#[^\n]*bundle credential guard/);
    const pages = readme.slice(readme.indexOf('### Frontend — GitHub Pages'));
    expect(pages).toContain('scripts/check-bundle.mjs');
    expect(pages).toMatch(/do NOT deploy/);
  });
});
