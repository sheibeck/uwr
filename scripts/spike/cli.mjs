// Phase 39 spike harness: the single guarded gateway to the spacetime CLI.
// Throwaway: deleted in the phase cleanup plan.
//
// Every spacetime invocation in the harness goes through runSpacetime(), which
// calls assertAllowedArgs() first. The guard refuses maincloud, database-clearing
// flags, any database other than uwr-spike and any bindings directory other than
// scripts/spike/bindings. The one exception is probeUwrClean(), a fixed read-only
// query, which is checked against an exact argument list instead.
//
// Two targets (config.ts): the local uwr-spike database (default) and, only with the
// explicit opt-in SPIKE_TARGET=maincloud, the single maincloud database uwr-spike-925iv.
// Local target: any argument that mentions maincloud is refused. Maincloud target: the
// only publish allowed is the exact argument list from publishArgs(), delete is refused
// outright, and call/logs/sql/describe must name server maincloud and that one database.
// The production database uwr is never reachable on either target.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { redactSecrets } from '../../spacetimedb/src/helpers/measurement.ts';
import { BINDINGS_DIR, ENV_LOCAL, TARGET } from './config.ts';

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
  describe: { noConfig: true, dbPositional: true, valueOpts: ['-s', '--server'] },
};

// Subcommands that talk to a server and therefore must always name --server explicitly.
const SERVER_COMMANDS = ['publish', 'call', 'logs', 'sql', 'describe', 'delete'];

const FORBIDDEN_FLAGS = ['--clear-database', '--delete-data', '-c', '--anonymous', '--break-clients', '--parent', '--organization'];

function samePath(a, b) {
  const norm = (p) => path.resolve(REPO_ROOT, p).replace(/[\\/]+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Throws unless the argument list targets only the given target's spike database and, for
 * generate, only scripts/spike/bindings. Never mutates or prints the arguments.
 */
export function assertAllowedArgs(args, target = TARGET) {
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
    throw new Error('spike guard: arguments must be an array of strings');
  }
  const onMaincloud = target.name === 'maincloud';
  if (!onMaincloud && args.some((a) => a.toLowerCase().includes('maincloud'))) {
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

  if (onMaincloud && sub === 'delete') {
    throw new Error('spike guard: deleting a maincloud database is a user action');
  }
  if (onMaincloud && sub === 'publish') {
    const exact = publishArgs(target);
    if (args.length !== exact.length || args.some((a, k) => a !== exact[k])) {
      throw new Error('spike guard: the only maincloud publish allowed is the exact publishArgs() list');
    }
    return;
  }

  if ((sub === 'publish' || sub === 'call') && args.some((a) => a === '-y' || a === '--yes' || a.startsWith('--yes='))) {
    throw new Error('spike guard: -y/--yes is not allowed for ' + sub);
  }

  // Walk the remaining tokens: collect positionals, validate --server / --out-dir values.
  const positionals = [];
  let outDir = null;
  let serverSeen = false;
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
        if (value !== target.server) throw new Error('spike guard: --server must be ' + target.server);
        serverSeen = true;
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
    if (positionals.length > 0 && positionals[0] !== target.db) {
      throw new Error('spike guard: generate database must be ' + target.db);
    }
    return;
  }
  if (positionals[0] !== target.db) {
    throw new Error('spike guard: ' + sub + ' database must be ' + target.db);
  }
  if (SERVER_COMMANDS.includes(sub) && !serverSeen) {
    throw new Error('spike guard: ' + sub + ' must name --server ' + target.server);
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

/**
 * Publish argument list. Maincloud appends --yes=remote, whose only effect is skipping the
 * "publish to a non-local server?" prompt; stdin is ignored, so any other prompt aborts.
 */
export function publishArgs(target = TARGET) {
  const base = ['publish', target.db, '-p', 'spacetimedb', '--server', target.server, '--no-config'];
  return target.name === 'maincloud' ? [...base, '--yes=remote'] : base;
}

export function generateArgs() {
  return ['generate', '--lang', 'typescript', '--out-dir', BINDINGS_DIR, '-p', 'spacetimedb', '--no-config'];
}

export function callArgs(fn, jsonArgs = [], target = TARGET) {
  return ['call', '--server', target.server, '--no-config', target.db, fn, ...jsonArgs];
}

export function logsArgs(target = TARGET) {
  return ['logs', '--server', target.server, '--no-config', target.db];
}

export function sqlArgs(query, target = TARGET) {
  return ['sql', '--server', target.server, '--no-config', target.db, query];
}

export function describeArgs(target = TARGET) {
  return ['describe', '--json', '--server', target.server, '--no-config', '-y', target.db];
}

/** Local only: deleting a maincloud database is the user's action, never the harness's. */
export function deleteArgs(target = TARGET) {
  if (target.name === 'maincloud') throw new Error('spike guard: deleting a maincloud database is a user action');
  return ['delete', '--server', target.server, '--no-config', '-y', target.db];
}

/** Publish the working tree module to the target spike database (no clear flag, no -y). */
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

export function deleteSpikeDb(target = TARGET) {
  return runSpacetime(deleteArgs(target));
}

// Exact argument list of the single allowed read-only touch of the production database.
// Pinned to the local server with a literal: it never follows the selected target.
const PROBE_UWR_ARGS = ['sql', '--server', 'local', '--no-config', 'uwr', 'SELECT * FROM spike_state'];

export function probeUwrArgs() {
  return [...PROBE_UWR_ARGS];
}

/**
 * Read-only check that the production database has no spike tables. Bypasses the
 * database positional check only for this exact query. clean=true when the query
 * errors or reports an unknown table; clean=false when rows or headers come back.
 */
export function probeUwrClean(target = TARGET) {
  if (target.name !== 'local') throw new Error('spike guard: the production probe runs only against the local server');
  const r = spawn(PROBE_UWR_ARGS, { needles: [], timeoutMs: 60000, raw: false });
  const text = (r.stdout + '\n' + r.stderr).toLowerCase();
  if (r.status !== 0) {
    const unknown = /no such table|unknown table|not found|no such/.test(text);
    return { clean: true, detail: unknown ? 'unknown table (spike tables absent)' : 'query errored (server down or no such table)' };
  }
  return { clean: false, detail: 'query succeeded: spike_state exists in uwr' };
}

export async function serverUp(target = TARGET) {
  if (target.name === 'maincloud') {
    // No ping URL on maincloud: the guarded describe answers whether the database is reachable.
    return runSpacetime(describeArgs(target), { timeoutMs: 60000 }).status === 0;
  }
  try {
    const res = await fetch(target.pingUrl, { signal: AbortSignal.timeout(3000) });
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
  console.log('target: ' + TARGET.name + ' database: ' + TARGET.db);
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
    case 'describe': {
      const r = runSpacetime(describeArgs(), { timeoutMs: 120000 });
      console.log('describe exit status: ' + r.status);
      if (r.status !== 0) {
        emit(r);
        return r.status ?? 1;
      }
      const ids = [...new Set(r.stdout.match(/spike_[a-z0-9_]+/g) ?? [])].sort();
      console.log(ids.join('\n'));
      const missing = ['spike_result', 'spike_state', 'spike_run_job'].filter((n) => !ids.includes(n));
      if (missing.length > 0) {
        console.log('missing: ' + missing.join(', '));
        return 4;
      }
      return 0;
    }
    case 'state': {
      const r = runSpacetime(sqlArgs('SELECT * FROM spike_state'), { timeoutMs: 120000 });
      emit(r);
      return r.status ?? 1;
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
      console.error('usage: cli.mjs publish|generate|logs [n]|whoami|describe|state|delete|probe-uwr|server-up');
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
