// Anthropic key setup script (Plan 41-09, SEC-04).
//
//   node scripts/llm/set-key.mjs --dry-run
//       prints presence and length of ANTHROPIC_API_KEY in spacetimedb/.env.local only
//   node scripts/llm/set-key.mjs
//       reads the key inside this process and stores it in the LOCAL uwr database through
//       the set_api_key reducer over the HTTP call endpoint (key only in the request body,
//       never in argv, shell history or printed output)
//   node scripts/llm/set-key.mjs --target maincloud --confirm-maincloud
//       maincloud, user only. Claude never runs this form.
//   --key-file <path>   read the key from another env file (test hook)
//
// Exit: 0 ok (confirmed by the module log line), 1 store failed or unconfirmed,
//       2 key missing or unexpected format.

import { ENV_LOCAL, getCliToken, keyFormatOk, loadAnthropicKey, resolveTarget, scrub, storeKey } from './cli.mjs';

function fail(code, msg) {
  console.log(msg);
  process.exit(code);
}

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const keyFileIdx = argv.indexOf('--key-file');
const keyFile = keyFileIdx === -1 ? ENV_LOCAL : argv[keyFileIdx + 1];

let target;
try {
  target = resolveTarget(argv);
} catch (e) {
  fail(2, scrub(e && e.message ? e.message : String(e)));
}

const key = loadAnthropicKey(keyFile);
if (key === null) fail(2, 'ANTHROPIC_API_KEY: missing');
if (!keyFormatOk(key)) fail(2, 'ANTHROPIC_API_KEY: present (format unexpected)');

if (dryRun) {
  console.log('ANTHROPIC_API_KEY: present (format ok, len ' + key.length + ')');
  process.exit(0);
}

const token = getCliToken();
if (!token) fail(1, 'spacetime login token: not found (run: spacetime login)');

console.log('target: ' + target.name);
try {
  process.exit(await storeKey({ target, key, token, print: (line) => console.log(line) }));
} catch (e) {
  fail(1, scrub(e && e.message ? e.message : String(e), [key, token]));
}
