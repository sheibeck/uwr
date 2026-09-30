// Helpers for the Anthropic key script (Plan 41-09, SEC-04). Restored from the Phase 39
// spike helper, with the transport changed from `spacetime call` (key in the child's argv)
// to the documented HTTP call endpoint (key only in the request body).
//
// Safety properties:
//   - the key is read with util.parseEnv (never process.env) and lives only in memory
//   - the only spawns are fixed argument arrays that never contain the key (shell:false)
//   - every string that may be printed goes through scrub() with the key and token as needles
//   - the target is the local server unless BOTH --target maincloud and --confirm-maincloud
//     are given (an agent never runs that form; the user does)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { redactSecrets } from '../../spacetimedb/src/helpers/measurement.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENV_LOCAL = path.resolve(REPO_ROOT, 'spacetimedb', '.env.local');

/** The exact prefix `set_api_key` logs (spacetimedb/src/reducers/llm.ts): the prefix plus the key length. */
export const LLM_KEY_SET_LOG_PREFIX = 'llm key set, len=';

// Key shape, built from fragments so this source holds no key-shaped literal.
const KEY_PREFIX = ['sk', '-ant-'].join('');
const KEY_MIN_LENGTH = 40;

export const TARGETS = {
  local: { name: 'local', db: 'uwr', server: 'local', httpBase: 'http://127.0.0.1:3000' },
  maincloud: { name: 'maincloud', db: 'uwr', server: 'maincloud', httpBase: 'https://maincloud.spacetimedb.com' },
};

/**
 * Local by default. Maincloud needs both --target maincloud and --confirm-maincloud.
 * Any other target value is refused.
 */
export function resolveTarget(argv = []) {
  const idx = argv.indexOf('--target');
  if (idx === -1) return TARGETS.local;
  const value = argv[idx + 1];
  if (value === 'local') return TARGETS.local;
  if (value === 'maincloud') {
    if (!argv.includes('--confirm-maincloud')) {
      throw new Error('maincloud target refused: add --confirm-maincloud (the user runs this form, never an agent)');
    }
    return TARGETS.maincloud;
  }
  throw new Error('unknown target: ' + JSON.stringify(String(value ?? '')) + ' (use local or maincloud)');
}

/** Redact key-shaped strings and any supplied needles (8+ chars). */
export function scrub(text, needles = []) {
  return redactSecrets(String(text ?? ''), needles);
}

/** Read ANTHROPIC_API_KEY from an env file without touching process.env. Null when missing or empty. */
export function loadAnthropicKey(file = ENV_LOCAL) {
  try {
    const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
    const v = (parsed.ANTHROPIC_API_KEY ?? '').trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** True when the value looks like an Anthropic key (prefix and length only). */
export function keyFormatOk(value) {
  return typeof value === 'string' && value.startsWith(KEY_PREFIX) && value.length >= KEY_MIN_LENGTH;
}

/** First three-part base64url token beginning with eyJ, or null. Never returns surrounding text. */
export function extractToken(text) {
  const m = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.exec(String(text ?? ''));
  return m ? m[0] : null;
}

/** The user's CLI login token, obtained in-process. Nothing is printed. */
export function getCliToken() {
  const r = spawnSync('spacetime', ['login', 'show', '--token'], {
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: REPO_ROOT,
  });
  return extractToken((r.stdout ?? '') + '\n' + (r.stderr ?? ''));
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

/**
 * POST the reducer arguments to the documented HTTP call endpoint. The key travels only in the
 * request body. Returns { status, bodyText } with bodyText scrubbed of the token and every
 * string argument. `fetchImpl` is a test hook.
 */
export async function callReducerHttp(target, token, reducer, args, fetchImpl = fetch) {
  const url = `${target.httpBase}/v1/database/${target.db}/call/${reducer}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  return { status: res.status, bodyText: scrub(text, [token, ...collectStrings(args)]) };
}

/** Last n log lines of the target database (the whole log is read, then sliced), scrubbed. */
export function readLogs(target, n = 200, needles = []) {
  const r = spawnSync('spacetime', ['logs', '--server', target.server, '--no-config', target.db], {
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: REPO_ROOT,
    maxBuffer: 512 * 1024 * 1024,
  });
  const lines = scrub(r.stdout ?? '', needles).split(/\r?\n/);
  return lines.slice(-n);
}

/** True when the log lines contain the reducer's confirmation for a key of this length. */
export function confirmKeySet(lines, len) {
  const wanted = LLM_KEY_SET_LOG_PREFIX + len;
  return lines.some((l) => {
    const i = l.indexOf(LLM_KEY_SET_LOG_PREFIX);
    if (i === -1) return false;
    // Exact length: the character after the digits must not be another digit.
    const rest = l.slice(i);
    return rest.startsWith(wanted) && !/^\d/.test(rest.slice(wanted.length));
  });
}

/**
 * Store the key through the HTTP endpoint (positional form first, named form once on a 400),
 * then confirm through the module log. `deps` are test hooks. Prints only scrubbed status lines
 * through `print`. Returns the process exit code (0 confirmed, 1 failed or unconfirmed).
 */
export async function storeKey({ target, key, token, print, deps = {} }) {
  const call = deps.call ?? ((args) => callReducerHttp(target, token, 'set_api_key', args));
  const logs = deps.logs ?? ((n) => readLogs(target, n, [key, token]));
  const out = (line) => print(scrub(line, [key, token]));

  let form = 'positional';
  let r = await call([key]);
  if (r.status === 400) {
    form = 'named';
    r = await call({ apiKey: key });
  }
  out('set_api_key: HTTP ' + r.status + (r.status >= 200 && r.status < 300 ? ' (' + form + ' arguments)' : ''));
  if (r.status < 200 || r.status >= 300) {
    if (r.bodyText) out(r.bodyText.slice(0, 300));
    out('key stored: no');
    return 1;
  }
  if (confirmKeySet(logs(200), key.length)) {
    out('key stored: yes (len ' + key.length + ')');
    return 0;
  }
  out('key stored: unconfirmed (no "' + LLM_KEY_SET_LOG_PREFIX + '<n>" line in the last 200 log lines)');
  return 1;
}
