// Bundle credential guard (Plan 42-02, SEC-03).
//
// Scans every text file under dist/ for anything that would hand a browser visitor an LLM
// credential, a proxy host or a provider key. Run it right after `pnpm build`:
//
//   node scripts/check-bundle.mjs [--explain] [distDir]
//
// Exit codes: 0 clean, 1 at least one problem, 2 dist/ missing or holds no JavaScript.
//
// OUTPUT RULE (never broken, for any rule): the guard prints rule ids, relative file paths and,
// in --explain mode, the byte offset of each hit plus whether the hit sits inside a string
// literal, a comment or code. It never prints, returns or logs matched or neighbouring bundle
// text, because a hit could be a real secret.
//
// The one allowed use of the retired storage key name is a single removeItem(...) call with a
// double, single or backtick quote (src/legacyCredentials.ts). Any other occurrence, or a
// second occurrence, fails.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** File extensions read as UTF-8 text. Everything else (images, fonts) is skipped. */
export const BUNDLE_TEXT_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map']);

const JS_EXTENSIONS = Object.freeze(['.js', '.mjs', '.cjs']);

/**
 * Forbidden patterns. Patterns carry no global flag here; matching code builds its own copy.
 * `key-shaped` forbids sk-ant- anywhere, and sk- plus at least 20 key characters when the
 * character before the s is not a letter, digit or underscore (so task-... or risk-... pass).
 */
export const BUNDLE_RULES = Object.freeze([
  Object.freeze({ id: 'proxy-key-name', pattern: /llm_proxy_secret/ }),
  Object.freeze({ id: 'proxy-secret', pattern: /proxy[-_]?secret/i }),
  Object.freeze({ id: 'proxy-env', pattern: /VITE_LLM_PROXY/ }),
  Object.freeze({
    id: 'proxy-url',
    pattern: /localhost:8787|127\.0\.0\.1:8787|\/api\/llm\b|uwr-llm-proxy|workers\.dev/,
  }),
  Object.freeze({ id: 'provider-host', pattern: /api\.anthropic\.com|api\.openai\.com/ }),
  Object.freeze({ id: 'provider-key', pattern: /OPENAI_API_KEY|ANTHROPIC_API_KEY|x-api-key/i }),
  Object.freeze({
    id: 'key-shaped',
    pattern: /sk-ant-|(?<![A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
  }),
]);

/** The single allowed shape: removeItem( "llm_proxy_secret" ) with matching quotes. */
const ALLOWED_REMOVE_ITEM = /removeItem\(\s*(["'`])llm_proxy_secret\1\s*\)/;

/** Sorted relative paths of a files object (deterministic walk order). */
function sortedPaths(files) {
  return Object.keys(files).sort();
}

/**
 * Copy of the files with the first allowed removeItem span (in sorted path order, across the
 * whole bundle) replaced by spaces of equal length, so offsets stay valid. Only that one span
 * is blanked: a second occurrence or any other use of the key name stays visible to the rules.
 */
function blankAllowedSpan(files) {
  const out = { ...files };
  for (const p of sortedPaths(files)) {
    const match = ALLOWED_REMOVE_ITEM.exec(files[p]);
    if (match) {
      const text = files[p];
      out[p] = text.slice(0, match.index) + ' '.repeat(match[0].length) + text.slice(match.index + match[0].length);
      break;
    }
  }
  return out;
}

/**
 * Audit a bundle.
 * @param {Record<string, string>} files relative posix path -> UTF-8 text
 * @returns {string[]} sorted, de-duplicated "<rule id>: <path>" strings (never bundle text)
 */
export function auditBundle(files) {
  const blanked = blankAllowedSpan(files);
  const problems = new Set();
  for (const p of sortedPaths(blanked)) {
    for (const rule of BUNDLE_RULES) {
      if (rule.pattern.test(blanked[p])) problems.add(`${rule.id}: ${p}`);
    }
  }
  return [...problems].sort();
}

/**
 * Classify UTF-16 indexes of a text as inside a 'string', a 'comment' or 'code'.
 * A small forward scanner over double, single and backtick strings (backslash escapes) and
 * line and block comments. Heuristic: it does not model regex literals or template
 * substitutions, and plain strings end at a newline so one misread quote cannot taint the rest
 * of a file.
 * @param {string} text
 * @param {number[]} indexes ascending
 * @returns {string[]} one class per index
 */
function classifyIndexes(text, indexes) {
  const result = [];
  let next = 0;
  let state = 'code'; // code | dq | sq | bt | line | block
  let i = 0;
  while (next < indexes.length && i <= text.length) {
    while (next < indexes.length && indexes[next] <= i) {
      result.push(state === 'code' ? 'code' : state === 'line' || state === 'block' ? 'comment' : 'string');
      next += 1;
    }
    if (i >= text.length) break;
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (state === 'code') {
      if (two === '//') {
        state = 'line';
        i += 2;
        continue;
      }
      if (two === '/*') {
        state = 'block';
        i += 2;
        continue;
      }
      if (ch === '"') state = 'dq';
      else if (ch === "'") state = 'sq';
      else if (ch === '`') state = 'bt';
    } else if (state === 'line') {
      if (ch === '\n') state = 'code';
    } else if (state === 'block') {
      if (two === '*/') {
        // Indexes inside the closing pair belong to the comment.
        if (next < indexes.length && indexes[next] === i + 1) {
          result.push('comment');
          next += 1;
        }
        state = 'code';
        i += 2;
        continue;
      }
    } else {
      // A string state.
      if (ch === '\\') {
        if (next < indexes.length && indexes[next] === i + 1) {
          result.push('string');
          next += 1;
        }
        i += 2;
        continue;
      }
      if ((state === 'dq' && ch === '"') || (state === 'sq' && ch === "'") || (state === 'bt' && ch === '`')) {
        state = 'code';
      } else if ((state === 'dq' || state === 'sq') && ch === '\n') {
        state = 'code';
      }
    }
    i += 1;
  }
  while (result.length < indexes.length) result.push('code');
  return result;
}

/**
 * Locate every hit of every rule, after blanking the one allowed removeItem span.
 * Returns no text from the files.
 * @param {Record<string, string>} files relative posix path -> UTF-8 text
 * @returns {{ rule: string, path: string, offset: number, inside: 'string' | 'comment' | 'code' }[]}
 *   sorted by path, then offset, then rule; offset is the UTF-8 byte offset of the match start
 */
export function locateBundleHits(files) {
  const blanked = blankAllowedSpan(files);
  const hits = [];
  for (const p of sortedPaths(blanked)) {
    const text = blanked[p];
    const found = [];
    for (const rule of BUNDLE_RULES) {
      const re = new RegExp(rule.pattern.source, `${rule.pattern.flags.replace('g', '')}g`);
      let match;
      while ((match = re.exec(text)) !== null) {
        found.push({ rule: rule.id, index: match.index });
        if (match[0].length === 0) re.lastIndex += 1;
      }
    }
    if (found.length === 0) continue;
    found.sort((a, b) => a.index - b.index || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
    const classes = classifyIndexes(
      text,
      found.map((f) => f.index),
    );
    // Convert UTF-16 indexes to UTF-8 byte offsets incrementally.
    let byteOffset = 0;
    let cursor = 0;
    found.forEach((f, n) => {
      byteOffset += Buffer.byteLength(text.slice(cursor, f.index), 'utf8');
      cursor = f.index;
      hits.push({ rule: f.rule, path: p, offset: byteOffset, inside: classes[n] });
    });
  }
  return hits;
}

/**
 * Read every text file under a directory.
 * @param {string} distDir
 * @returns {Record<string, string>} posix path relative to distDir -> UTF-8 text
 */
export function collectBundleFiles(distDir) {
  const files = {};
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && BUNDLE_TEXT_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
        const rel = path.relative(distDir, full).split(path.sep).join('/');
        files[rel] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  walk(distDir);
  return files;
}

/**
 * Run the guard over a directory.
 * @param {string} distDir
 * @param {{ explain?: boolean }} [options]
 * @returns {{ code: 0 | 1 | 2, lines: string[] }}
 */
export function runBundleCheck(distDir, { explain = false } = {}) {
  let isDir = false;
  try {
    isDir = fs.statSync(distDir).isDirectory();
  } catch {
    isDir = false;
  }
  if (!isDir) return { code: 2, lines: ['dist directory not found: run pnpm build first'] };

  const files = collectBundleFiles(distDir);
  const names = Object.keys(files);
  if (!names.some((n) => JS_EXTENSIONS.includes(path.extname(n).toLowerCase()))) {
    return { code: 2, lines: ['dist holds no JavaScript: run pnpm build first'] };
  }

  const problems = auditBundle(files);
  if (problems.length === 0) return { code: 0, lines: [`bundle clean: ${names.length} files scanned`] };

  if (explain) {
    const lines = locateBundleHits(files).map((h) => `${h.rule}: ${h.path} @${h.offset} (${h.inside})`);
    return { code: 1, lines: lines.length > 0 ? lines : problems };
  }
  return { code: 1, lines: problems };
}

function main(argv) {
  const explain = argv.includes('--explain');
  const dir = argv.find((a) => !a.startsWith('--')) ?? path.join(REPO_ROOT, 'dist');
  const { code, lines } = runBundleCheck(path.resolve(dir), { explain });
  for (const line of lines) console.log(line);
  process.exitCode = code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
