// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/cli.test.mjs
// Fake keys and tokens only, built from fragments; nothing here reads the real key files.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LLM_KEY_SET_LOG_PREFIX,
  REPO_ROOT,
  TARGETS,
  callReducerHttp,
  confirmKeySet,
  extractToken,
  keyFormatOk,
  loadAnthropicKey,
  resolveTarget,
  scrub,
  storeKey,
} from './cli.mjs';

const PREFIX = ['sk', '-ant-'].join('');
const FAKE_KEY = PREFIX + 'abcdefghij'.repeat(4);
const FAKE_TOKEN = ['eyJhbGciOiJFUzI1NiJ9', 'eyJzdWIiOiJ0ZXN0LXVzZXIifQ', 'c2lnbmF0dXJlLXBhcnQtdGVzdA'].join('.');
const SET_KEY = path.join(REPO_ROOT, 'scripts', 'llm', 'set-key.mjs');

let tmp;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uwr-key-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeEnv(name, body) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, body);
  return p;
}

describe('keyFormatOk', () => {
  it('accepts a fragment-built key and rejects short, empty and other-prefix values', () => {
    expect(keyFormatOk(PREFIX + 'x'.repeat(40))).toBe(true);
    expect(keyFormatOk('x'.repeat(20))).toBe(false);
    expect(keyFormatOk('')).toBe(false);
    expect(keyFormatOk(['sk', '-other-'].join('') + 'x'.repeat(50))).toBe(false);
  });
});

describe('scrub', () => {
  it('removes needles of 8+ chars and key-shaped strings, keeping surrounding text', () => {
    const out = scrub('a ' + FAKE_TOKEN + ' b ' + PREFIX + 'z'.repeat(30) + ' c', [FAKE_TOKEN]);
    expect(out).not.toContain(FAKE_TOKEN);
    expect(out).not.toContain(PREFIX);
    expect(out.startsWith('a ')).toBe(true);
    expect(out.endsWith(' c')).toBe(true);
  });
});

describe('extractToken', () => {
  it('returns only the three-part token from mixed text', () => {
    expect(extractToken('Your token is ' + FAKE_TOKEN + '\nkeep it safe')).toBe(FAKE_TOKEN);
  });
  it('returns null when there is no token', () => {
    expect(extractToken('not logged in')).toBeNull();
    expect(extractToken('')).toBeNull();
  });
});

describe('resolveTarget', () => {
  it('defaults to local', () => {
    expect(resolveTarget([])).toBe(TARGETS.local);
    expect(TARGETS.local.httpBase).toBe('http://127.0.0.1:3000');
    expect(TARGETS.local.db).toBe('uwr');
  });
  it('refuses maincloud without --confirm-maincloud, naming the flag', () => {
    expect(() => resolveTarget(['--target', 'maincloud'])).toThrow(/--confirm-maincloud/);
  });
  it('allows maincloud only with both flags', () => {
    expect(resolveTarget(['--target', 'maincloud', '--confirm-maincloud'])).toBe(TARGETS.maincloud);
  });
  it('refuses an unknown target', () => {
    expect(() => resolveTarget(['--target', 'other'])).toThrow();
  });
});

describe('loadAnthropicKey', () => {
  it('reads the key from an env file and returns null for missing file or empty value', () => {
    expect(loadAnthropicKey(writeEnv('a.env', 'ANTHROPIC_API_KEY=' + FAKE_KEY + '\n'))).toBe(FAKE_KEY);
    expect(loadAnthropicKey(path.join(tmp, 'does-not-exist.env'))).toBeNull();
    expect(loadAnthropicKey(writeEnv('empty.env', 'ANTHROPIC_API_KEY=\n'))).toBeNull();
    expect(loadAnthropicKey(writeEnv('other.env', 'OTHER=1\n'))).toBeNull();
  });
});

describe('confirmKeySet', () => {
  it('matches the exact length only', () => {
    expect(confirmKeySet(['x', LLM_KEY_SET_LOG_PREFIX + '48'], 48)).toBe(true);
    expect(confirmKeySet(['x', LLM_KEY_SET_LOG_PREFIX + '48'], 47)).toBe(false);
    expect(confirmKeySet(['x', LLM_KEY_SET_LOG_PREFIX + '480'], 48)).toBe(false);
    expect(confirmKeySet(['unrelated'], 48)).toBe(false);
  });
});

describe('callReducerHttp', () => {
  it('posts to the call endpoint with a bearer token and the key only in the body, and scrubs the response', async () => {
    const seen = {};
    const fetchImpl = async (url, init) => {
      Object.assign(seen, { url, init });
      return { status: 400, text: async () => 'bad request for ' + FAKE_KEY + ' with ' + FAKE_TOKEN };
    };
    const r = await callReducerHttp(TARGETS.local, FAKE_TOKEN, 'set_api_key', [FAKE_KEY], fetchImpl);
    expect(seen.url).toBe('http://127.0.0.1:3000/v1/database/uwr/call/set_api_key');
    expect(seen.init.method).toBe('POST');
    expect(seen.init.headers.authorization).toBe('Bearer ' + FAKE_TOKEN);
    expect(seen.init.body).toBe(JSON.stringify([FAKE_KEY]));
    expect(r.status).toBe(400);
    expect(r.bodyText).not.toContain(FAKE_KEY);
    expect(r.bodyText).not.toContain(FAKE_TOKEN);
  });
});

describe('storeKey', () => {
  function run(callImpl, logLines) {
    const printed = [];
    const calls = [];
    return storeKey({
      target: TARGETS.local,
      key: FAKE_KEY,
      token: FAKE_TOKEN,
      print: (l) => printed.push(l),
      deps: {
        call: async (args) => {
          calls.push(args);
          return callImpl(args);
        },
        logs: () => logLines,
      },
    }).then((code) => ({ code, printed, calls }));
  }

  it('exits 0 and prints only status lines when the log confirms the length', async () => {
    const { code, printed, calls } = await run(() => ({ status: 200, bodyText: '' }), [LLM_KEY_SET_LOG_PREFIX + FAKE_KEY.length]);
    expect(code).toBe(0);
    expect(calls).toEqual([[FAKE_KEY]]);
    expect(printed.join('\n')).toContain('key stored: yes (len ' + FAKE_KEY.length + ')');
    expect(printed.join('\n')).not.toContain(FAKE_KEY);
  });

  it('retries once with the named form on a 400 and reports which form worked', async () => {
    const { code, printed, calls } = await run(
      (args) => (Array.isArray(args) ? { status: 400, bodyText: 'x' } : { status: 200, bodyText: '' }),
      [LLM_KEY_SET_LOG_PREFIX + FAKE_KEY.length],
    );
    expect(code).toBe(0);
    expect(calls).toEqual([[FAKE_KEY], { apiKey: FAKE_KEY }]);
    expect(printed.join('\n')).toContain('named arguments');
    expect(printed.join('\n')).not.toContain(FAKE_KEY);
  });

  it('exits 1 without confirmation and on a non-2xx status', async () => {
    expect((await run(() => ({ status: 200, bodyText: '' }), ['nothing here'])).code).toBe(1);
    const denied = await run(() => ({ status: 401, bodyText: 'denied ' + FAKE_TOKEN }), []);
    expect(denied.code).toBe(1);
    expect(denied.printed.join('\n')).not.toContain(FAKE_TOKEN);
  });
});

describe('set-key.mjs --dry-run', () => {
  function dry(file) {
    return spawnSync(process.execPath, [SET_KEY, '--dry-run', '--key-file', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: REPO_ROOT,
    });
  }

  it('prints exactly one presence line with the length, exit 0, no key fragment', () => {
    const r = dry(writeEnv('dry.env', 'ANTHROPIC_API_KEY=' + FAKE_KEY + '\n'));
    expect(r.status).toBe(0);
    const lines = r.stdout.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^ANTHROPIC_API_KEY: present \(format ok, len \d+\)$/);
    const all = r.stdout + r.stderr;
    expect(all).not.toContain(FAKE_KEY);
    expect(all).not.toContain(FAKE_KEY.slice(PREFIX.length, PREFIX.length + 12));
  });

  it('exits 2 with the missing line when the variable is absent', () => {
    const r = dry(writeEnv('nokey.env', 'OTHER=1\n'));
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('ANTHROPIC_API_KEY: missing');
  });

  it('exits 2 with the unexpected-format line and never prints the value', () => {
    const r = dry(writeEnv('bad.env', 'ANTHROPIC_API_KEY=notakey-' + 'q'.repeat(50) + '\n'));
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('format unexpected');
    expect(r.stdout + r.stderr).not.toContain('qqqqqqqqqq');
  });

  it('refuses maincloud with only one flag (exit 2, before any key or token work)', () => {
    const r = spawnSync(process.execPath, [SET_KEY, '--dry-run', '--target', 'maincloud', '--key-file', writeEnv('mc.env', 'ANTHROPIC_API_KEY=' + FAKE_KEY + '\n')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: REPO_ROOT,
    });
    expect(r.status).toBe(2);
    expect(r.stdout).toContain('--confirm-maincloud');
  });
});

describe('static safety checks', () => {
  const setKeySrc = fs.readFileSync(SET_KEY, 'utf8');
  const cliSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'llm', 'cli.mjs'), 'utf8');

  it('set-key.mjs never uses process.env and never spawns', () => {
    expect(setKeySrc).not.toContain('process.env');
    expect(setKeySrc).not.toMatch(/spawn|exec\(|execSync|child_process/);
  });

  it('cli.mjs spawns only with literal argument arrays that never mention the key', () => {
    const calls = [...cliSrc.matchAll(/spawnSync\(\s*'spacetime',\s*(\[[^\]]*\])/g)].map((m) => m[1]);
    expect(calls.length).toBe(2);
    for (const arr of calls) expect(arr).not.toMatch(/\bkey\b|apiKey|needles/);
    expect([...cliSrc.matchAll(/spawnSync\(/g)].length).toBe(2);
    expect(cliSrc).not.toMatch(/shell:\s*true/);
  });

  it('cli.mjs reads the key via parseEnv and holds no key-shaped literal', () => {
    expect(cliSrc).toContain('parseEnv');
    for (const src of [cliSrc, setKeySrc, fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'llm', 'cli.test.mjs'), 'utf8')]) {
      expect(src).not.toMatch(new RegExp(PREFIX + '[A-Za-z0-9]'));
    }
  });
});

describe('log-line contract', () => {
  it('the set_api_key reducer still emits the prefix the script matches', () => {
    const reducerSrc = fs.readFileSync(path.join(REPO_ROOT, 'spacetimedb', 'src', 'reducers', 'llm.ts'), 'utf8');
    expect(reducerSrc).toContain("LLM_KEY_SET_LOG_PREFIX = '" + LLM_KEY_SET_LOG_PREFIX + "'");
    expect(reducerSrc).toContain('console.info(LLM_KEY_SET_LOG_PREFIX + trimmed.length)');
  });
});
