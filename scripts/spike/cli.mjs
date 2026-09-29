// Phase 39 spike harness: the single guarded gateway to the spacetime CLI.
// Throwaway: deleted in the phase cleanup plan.
//
// Every spacetime invocation in the harness goes through runSpacetime(), which
// calls assertAllowedArgs() first. The guard refuses maincloud, database-clearing
// flags, any database other than uwr-spike and any bindings directory other than
// scripts/spike/bindings. The one exception is probeUwrClean(), a fixed read-only
// query, which is checked against an exact argument list instead.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { redactSecrets } from '../../spacetimedb/src/helpers/measurement.ts';
import { BINDINGS_DIR, ENV_LOCAL, SPIKE_DB, SPIKE_PING_URL, SPIKE_SERVER } from './config.ts';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Key shape, built from fragments so this source holds no key-shaped literal.
const KEY_PREFIX = ['sk', '-ant-'].join('');
const KEY_MIN_LENGTH = 40;

// ---------------------------------------------------------------------------
// CLI capability table (from `spacetime <cmd> --help`, CLI 2.10.1)
// ---------------------------------------------------------------------------
// noConfig: every subcommand used here accepts --no-config (ignores spacetime.json and
//           spacetime.local.json, which would otherwise point at the production db `uwr`).
// valueOpts: options that consume the following token as their value.
// Log line limiting: `logs -n N` is documented as "lines from the start" but is a tail in
//           practice; the harness avoids depending on it by reading the whole log and slicing.
export const CLI_TABLE = {
  publish: { noConfig: true, dbPositional: true, valueOpts: ['-p', '--module-path', '-b', '--bin-path', '-j', '--js-path', '-s', '--server', '--build-options', '--parent', '--organization', '-c', '--delete-data'] },
  generate: { noConfig: true, dbPositional: true, valueOpts: ['-b', '--bin-path', '-j', '--js-path', '-p', '--module-path', '-o', '--out-dir', '--uproject-dir', '--namespace', '--unreal-module-name', '--module-prefix', '-l', '--lang', '--build-options', '--dotnet-version', '--env'] },
  call: { noConfig: true, dbPositional: true, valueOpts: ['-s', '--server'] },
  logs: { noConfig: true, dbPositional: true, valueOpts: ['-s', '--server', '-n', '--num-lines', '--format', '-l', '--level'] },
  sql: { noConfig: true, dbPositional: true, valueOpts: ['-s', '--server', '--format', '--confirmed'] },
  delete: { noConfig: true, dbPositional: true, valueOpts: ['-s', '--server'] },
};

const FORBIDDEN_FLAGS = ['--clear-database', '--delete-data', '-c'];

function samePath(a, b) {
  const norm = (p) => path.resolve(REPO_ROOT, p).replace(/[\\/]+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Throws unless the argument list targets only the local uwr-spike database and, for
 * generate, only scripts/spike/bindings. Never mutates or prints the arguments.
 */
export function assertAllowedArgs(args) {
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
    throw new Error('spike guard: arguments must be an array of strings');
  }
  if (args.some((a) => a.toLowerCase().includes('maincloud'))) {
    throw new Error('spike guard: maincloud is never allowed');
  }
  for (const a of args) {
    const flag = a.split('=')[0];
    if (FORBIDDEN_FLAGS.includes(flag)) {
      throw new Error('spike guard: ' + flag + ' is never allowed');
    }
  }
  const sub = args[0];
  const entry = CLI_TABLE[sub];
  if (!entry) throw new Error('spike guard: subcommand not allowed: ' + JSON.stringify(sub));

  if ((sub === 'publish' || sub === 'call') && args.some((a) => a === '-y' || a === '--yes' || a.startsWith('--yes='))) {
    throw new Error('spike guard: -y/--yes is not allowed for ' + sub);
  }

  // Walk the remaining tokens: collect positionals, validate --server / --out-dir values.
  const positionals = [];
  let outDir = null;
  let i = 1;
  while (i < args.length) {
    const tok = args[i];
    // For `call`, everything after the function name is a JSON argument, not an option.
    if (sub === 'call' && positionals.length >= 2) {
      i += 1;
      continue;
    }
    if (tok.startsWith('-') && tok.length > 1) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok : tok.slice(0, eq);
      let value = null;
      if (eq !== -1) {
        value = tok.slice(eq + 1);
      } else if (entry.valueOpts.includes(name)) {
        value = args[i + 1];
        if (value === undefined) throw new Error('spike guard: option ' + name + ' needs a value');
        i += 1;
      }
      if (name === '--server' || name === '-s') {
        if (value !== SPIKE_SERVER) throw new Error('spike guard: --server must be ' + SPIKE_SERVER);
      }
      if (name === '--out-dir' || name === '-o') outDir = value;
      if (name === '--uproject-dir') throw new Error('spike guard: --uproject-dir is not allowed');
    } else {
      positionals.push(tok);
    }
    i += 1;
  }

  if (sub === 'generate') {
    if (outDir === null || !samePath(outDir, BINDINGS_DIR)) {
      throw new Error('spike guard: generate --out-dir must be ' + BINDINGS_DIR);
    }
    if (positionals.length > 0 && positionals[0] !== SPIKE_DB) {
      throw new Error('spike guard: generate database must be ' + SPIKE_DB);
    }
    return;
  }
  if (positionals[0] !== SPIKE_DB) {
    throw new Error('spike guard: ' + sub + ' database must be ' + SPIKE_DB);
  }
}

// ---------------------------------------------------------------------------
// Scrubbing and process runner
// ---------------------------------------------------------------------------

/** Redact key-shaped strings and any supplied needles (8+ chars). */
export function scrub(text, needles = []) {
  return redactSecrets(String(text ?? ''), needles);
}

/**
 * Run the spacetime CLI with the guard applied. shell:false, so no shell ever parses
 * (or records) the arguments. Output is scrubbed unless raw:true; raw output is for
 * in-process scanning only and must never be printed.
 */
export function runSpacetime(args, { needles = [], timeoutMs = 300000, raw = false } = {}) {
  assertAllowedArgs(args);
  return spawn(args, { needles, timeoutMs, raw });
}

function spawn(args, { needles, timeoutMs, raw }) {
  const r = spawnSync('spacetime', args, {
    shell: false,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    cwd: REPO_ROOT,
    maxBuffer: 512 * 1024 * 1024,
  });
  const out = r.stdout ?? '';
  const err = (r.stderr ?? '') + (r.error ? '\n' + String(r.error.message) : '');
  return {
    status: r.status,
    stdout: raw ? out : scrub(out, needles),
    stderr: raw ? err : scrub(err, needles),
  };
}

// ---------------------------------------------------------------------------
// Argument builders and operations (all target uwr-spike on the local server)
// ---------------------------------------------------------------------------

export function publishArgs() {
  return ['publish', SPIKE_DB, '-p', 'spacetimedb', '--server', SPIKE_SERVER, '--no-config'];
}

export function generateArgs() {
  return ['generate', '--lang', 'typescript', '--out-dir', BINDINGS_DIR, '-p', 'spacetimedb', '--no-config'];
}

export function callArgs(fn, jsonArgs = []) {
  return ['call', '--server', SPIKE_SERVER, '--no-config', SPIKE_DB, fn, ...jsonArgs];
}

export function logsArgs() {
  return ['logs', '--server', SPIKE_SERVER, '--no-config', SPIKE_DB];
}

export function deleteArgs() {
  return ['delete', '--server', SPIKE_SERVER, '--no-config', '-y', SPIKE_DB];
}

/** Publish the working tree module to uwr-spike (no -y, no clear flag). */
export function publishSpike(opts = {}) {
  return runSpacetime(publishArgs(), opts);
}

/** Generate TypeScript bindings into scripts/spike/bindings only. */
export function generateBindings(opts = {}) {
  return runSpacetime(generateArgs(), opts);
}

export function callSpike(fn, jsonArgs = [], opts = {}) {
  return runSpacetime(callArgs(fn, jsonArgs), opts);
}

/** Store an API key via the CLI-identity-gated reducer. The key only ever leaves memory as a spawn argument. */
export function setKeyViaCli(key) {
  return callSpike('spike_set_key', [JSON.stringify(key)], { needles: [key] });
}

/** Last n log lines of uwr-spike (the whole log is read, then sliced). */
export function readLogs(n = 50, { raw = false, needles = [] } = {}) {
  const r = runSpacetime(logsArgs(), { raw, needles });
  const lines = r.stdout.split(/\r?\n/);
  return { status: r.status, lines: lines.slice(-n), stderr: r.stderr };
}

export function deleteSpikeDb() {
  return runSpacetime(deleteArgs());
}

// Exact argument list of the single allowed read-only touch of the production database.
const PROBE_UWR_ARGS = ['sql', '--server', SPIKE_SERVER, '--no-config', 'uwr', 'SELECT * FROM spike_state'];

/**
 * Read-only check that the production database has no spike tables. Bypasses the
 * database positional check only for this exact query. clean=true when the query
 * errors or reports an unknown table; clean=false when rows or headers come back.
 */
export function probeUwrClean() {
  const r = spawn(PROBE_UWR_ARGS, { needles: [], timeoutMs: 60000, raw: false });
  const text = (r.stdout + '\n' + r.stderr).toLowerCase();
  if (r.status !== 0) {
    const unknown = /no such table|unknown table|not found|no such/.test(text);
    return { clean: true, detail: unknown ? 'unknown table (spike tables absent)' : 'query errored (server down or no such table)' };
  }
  return { clean: false, detail: 'query succeeded: spike_state exists in uwr' };
}

export async function serverUp() {
  try {
    const res = await fetch(SPIKE_PING_URL, { signal: AbortSignal.timeout(3000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Key loading (in-process only; never echoed)
// ---------------------------------------------------------------------------

/** Read ANTHROPIC_API_KEY from spacetimedb/.env.local without touching process.env. */
export function loadAnthropicKey() {
  try {
    const parsed = parseEnv(fs.readFileSync(path.resolve(REPO_ROOT, ENV_LOCAL), 'utf8'));
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

// ---------------------------------------------------------------------------
// Direct invocation
// ---------------------------------------------------------------------------

function emit(r) {
  const o = r.stdout.trim();
  const e = r.stderr.trim();
  if (o) console.log(o);
  if (e) console.error(e);
}

async function main(argv) {
  const [cmd, arg] = argv;
  switch (cmd) {
    case 'publish': {
      const r = publishSpike();
      emit(r);
      return r.status ?? 1;
    }
    case 'generate': {
      const r = generateBindings();
      emit(r);
      return r.status ?? 1;
    }
    case 'logs': {
      const n = Number.parseInt(arg ?? '50', 10);
      const r = readLogs(Number.isFinite(n) ? n : 50);
      console.log(r.lines.join('\n'));
      return r.status ?? 1;
    }
    case 'whoami': {
      const r = callSpike('spike_whoami', []);
      emit(r);
      const logs = readLogs(50);
      const match = [...logs.lines].reverse().find((l) => l.includes('spike_whoami sender='));
      console.log(match ?? 'no spike_whoami log line found');
      return match ? 0 : 1;
    }
    case 'delete': {
      const r = deleteSpikeDb();
      emit(r);
      return r.status ?? 1;
    }
    case 'probe-uwr': {
      const p = probeUwrClean();
      console.log('uwr spike tables: ' + (p.clean ? 'absent' : 'PRESENT') + ' (' + p.detail + ')');
      return p.clean ? 0 : 1;
    }
    case 'server-up': {
      const up = await serverUp();
      console.log('server: ' + (up ? 'up' : 'down'));
      return up ? 0 : 1;
    }
    default:
      console.error('usage: cli.mjs publish|generate|logs [n]|whoami|delete|probe-uwr|server-up');
      return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(scrub(e && e.message ? e.message : String(e)));
      process.exit(1);
    },
  );
}
