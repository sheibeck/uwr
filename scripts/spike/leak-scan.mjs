// Phase 39 spike leak scanner. Throwaway: deleted in the phase cleanup plan.
//
// Counts secret occurrences across every place the key could land. Reports counts
// only, never matched text or any needle. Everything is read in-process; needles are
// never passed as process arguments.
//
//   node scripts/spike/leak-scan.mjs [--require-server]
//
// Target: SPIKE_TARGET picks the server-logs source (local uwr-spike, or the maincloud
// database with the explicit opt-in). Under maincloud the raw log is counted in-process
// and only a scrubbed copy is written to scripts/spike/out/maincloud-logs.txt.
//
// Needles: the real key from spacetimedb/.env.local (when loadable) and the value of
// the LEAK_NEEDLE environment variable (when set).
// Exit: 0 clean, 1 hits, 3 --require-server given and the server is unreachable.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { findSecretLeaks } from '../../spacetimedb/src/helpers/measurement.ts';
import { LOCAL_RESULTS_PATH, MAINCLOUD_RESULTS_PATH, OUT_DIR, RECORD_PATH, TARGET } from './config.ts';
import { REPO_ROOT, loadAnthropicKey, readLogs, scrub, serverUp } from './cli.mjs';

const requireServer = process.argv.includes('--require-server');

const needles = [];
const realKey = loadAnthropicKey();
if (realKey) needles.push(realKey);
console.log('real-key needle: ' + (realKey ? 'loaded' : 'absent'));
if (process.env.LEAK_NEEDLE) needles.push(process.env.LEAK_NEEDLE);

let totalHits = 0;

function report(name, state, counts) {
  if (counts) {
    totalHits += counts.patternHits + counts.needleHits;
    console.log(name + ': ' + state + ' pattern=' + counts.patternHits + ' needle=' + counts.needleHits);
  } else {
    console.log(name + ': ' + state + ' pattern=0 needle=0');
  }
}

function scanText(text, strict) {
  return findSecretLeaks(text, { needles, strictPrefix: strict });
}

function sum(a, b) {
  return { patternHits: a.patternHits + b.patternHits, needleHits: a.needleHits + b.needleHits, total: a.total + b.total };
}
const ZERO = { patternHits: 0, needleHits: 0, total: 0 };

function readAll(p) {
  return fs.readFileSync(p, 'latin1');
}

function walk(dir, filter, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, filter, out);
    else if (e.isFile() && filter(full)) out.push(full);
  }
  return out;
}

function scanFiles(files, strict) {
  let acc = ZERO;
  for (const f of files) {
    try {
      acc = sum(acc, scanText(readAll(f), strict));
    } catch {
      // file vanished between listing and reading; nothing to scan
    }
  }
  return acc;
}

// ---- server-logs -----------------------------------------------------------
const logLabel = 'server-logs (' + TARGET.name + ')';
const up = await serverUp();
if (!up && requireServer) {
  console.log(logLabel + ': skipped (server unreachable)');
  console.log('LEAK-SCAN: SERVER REQUIRED BUT UNREACHABLE');
  process.exit(3);
}
if (!up) {
  report(logLabel, 'skipped (server unreachable)');
} else {
  const logs = readLogs(5000, { raw: true });
  if (logs.status !== 0) {
    report(logLabel, 'skipped (' + TARGET.db + ' has no readable log)');
  } else {
    const rawText = logs.lines.join('\n');
    report(logLabel, 'scanned', scanText(rawText, true));
    if (TARGET.name === 'maincloud') {
      // Only the scrubbed copy ever touches the disk; the raw log stays in memory.
      const outDir = path.resolve(REPO_ROOT, OUT_DIR);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'maincloud-logs.txt'), scrub(rawText, needles) + '\n');
    }
  }
}

// ---- data-logs -------------------------------------------------------------
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
  report('data-logs', 'skipped (LOCALAPPDATA not set)');
} else {
  const dir = path.join(localAppData, 'SpacetimeDB', 'data', 'logs');
  if (!fs.existsSync(dir)) {
    report('data-logs', 'skipped (directory absent)');
  } else {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    const files = walk(dir, (f) => {
      try {
        return fs.statSync(f).mtimeMs >= cutoff;
      } catch {
        return false;
      }
    });
    report('data-logs', 'scanned ' + files.length + ' file(s)', scanFiles(files, true));
  }
}

// ---- results / record / out ------------------------------------------------
for (const [name, rel] of [['results-local', LOCAL_RESULTS_PATH], ['results-maincloud', MAINCLOUD_RESULTS_PATH], ['record', RECORD_PATH]]) {
  const p = path.resolve(REPO_ROOT, rel);
  if (!fs.existsSync(p)) report(name, 'skipped (absent)');
  else report(name, 'scanned', scanText(readAll(p), true));
}
{
  const files = walk(path.resolve(REPO_ROOT, OUT_DIR), () => true);
  if (files.length === 0) report('out', 'skipped (no files)');
  else report('out', 'scanned ' + files.length + ' file(s)', scanFiles(files, true));
}

// ---- git-tracked -----------------------------------------------------------
function git(args) {
  return spawnSync('git', args, { cwd: REPO_ROOT, shell: false, encoding: 'latin1', maxBuffer: 1024 * 1024 * 1024 });
}
{
  const ls = git(['ls-files', '-z']);
  if (ls.status !== 0) {
    report('git-tracked', 'skipped (git ls-files failed)');
  } else {
    const files = ls.stdout.split('\0').filter(Boolean).map((f) => path.join(REPO_ROOT, f));
    report('git-tracked', 'scanned ' + files.length + ' file(s)', scanFiles(files, false));
  }
}

// ---- git-history -----------------------------------------------------------
{
  let sha = null;
  try {
    const summary = fs.readFileSync(path.resolve(REPO_ROOT, '.planning/phases/39-procedure-to-claude-spike/39-02-SUMMARY.md'), 'utf8');
    const m = summary.match(/Phase-start SHA:\s*([0-9a-f]{7,40})/);
    if (m) sha = m[1];
  } catch {
    // no summary yet
  }
  if (!sha) {
    console.log('history: skipped (no phase-start sha yet)');
  } else {
    const log = git(['log', '-p', sha + '..HEAD']);
    if (log.status !== 0) report('git-history', 'skipped (git log failed)');
    else report('git-history', 'scanned', scanText(log.stdout, false));
  }
}

console.log(totalHits === 0 ? 'LEAK-SCAN: CLEAN' : 'LEAK-SCAN: HITS');
process.exit(totalHits === 0 ? 0 : 1);
