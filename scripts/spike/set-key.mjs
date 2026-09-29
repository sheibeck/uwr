// Phase 39 spike key runner. Throwaway: deleted in the phase cleanup plan.
//
//   node scripts/spike/set-key.mjs --dry-run
//       prints presence and length of ANTHROPIC_API_KEY in spacetimedb/.env.local only
//   node scripts/spike/set-key.mjs
//       reads the key inside this process and stores it in uwr-spike via the CLI-identity
//       gated spike_set_key reducer (spawnSync, shell:false; the key never appears on a
//       typed command line, in shell history or in any printed output)
//   node scripts/spike/set-key.mjs --value-from-env LEAK_NEEDLE
//       stores the value of that environment variable instead (used for the leak canary)
//
// Exit: 0 ok, 1 store failed or rejected, 2 key missing or unexpected format.

import { keyFormatOk, loadAnthropicKey, readLogs, scrub, setKeyViaCli } from './cli.mjs';

function fail(code, msg) {
  console.log(msg);
  process.exit(code);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const envIdx = argv.indexOf('--value-from-env');
const envName = envIdx === -1 ? null : argv[envIdx + 1];

let key;
let canary = false;
if (envName) {
  canary = true;
  key = process.env[envName] ?? '';
  if (key.length < 8) fail(2, 'value-from-env: variable missing or too short');
} else {
  key = loadAnthropicKey();
  if (key === null) fail(2, 'ANTHROPIC_API_KEY: missing');
  if (!keyFormatOk(key)) fail(2, 'ANTHROPIC_API_KEY: present (format unexpected)');
}

if (dryRun) {
  console.log('ANTHROPIC_API_KEY: present (format ok, len ' + key.length + ')');
  process.exit(0);
}

const len = key.length;
const r = setKeyViaCli(key);
const out = r.stdout.trim();
const err = r.stderr.trim();
if (out) console.log(out);
if (err) console.error(err);

const logs = readLogs(50, { needles: [key] }).lines.map((l) => scrub(l, [key]));
const rejected = [...logs].reverse().find((l) => l.includes('spike_set_key rejected'));
if (rejected) {
  console.log(rejected);
  process.exit(1);
}
const stored = logs.some((l) => l.includes('spike key set, len=' + len));
if (!stored) {
  console.log('key stored: no (no confirmation line in the last 50 log lines)');
  process.exit(1);
}
console.log('key stored: yes (len ' + len + ')' + (canary ? ' [canary value]' : ''));
process.exit(0);
