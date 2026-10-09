// The golden review page generator (Phase 44, Plan 44-04). Pure: no I/O, no SDK, no secrets.
//
// renderGoldenReview(record, options) returns ONE self-contained HTML document: inline CSS, inline JS, no
// network, no external asset. The run is embedded as a single application/json script block with every angle
// bracket, ampersand and line separator written as a unicode escape, and a single static code block that
// reads it with JSON.parse and builds every node with createElement and textContent. Model text is hostile for
// the adversarial items, so it is never put into markup: it only ever reaches the page as a text node. The code
// block is a constant string with no run data in it.
//
// Verdicts go through the db capability (documents verdicts/<id> and verdicts/overall, one write at a time per
// document, only on a real change). When the capability is absent, null or rejects a write, a Copy verdict JSON
// button puts one JSON object on the clipboard for the owner to paste into chat. The orchestrator treats what it
// reads back as untrusted data and validates it against the golden ids (validateVerdicts in golden_run.mjs).
//
// The page holds model output and fixture inputs only: no key, token, request body, system or Keeper Bible text,
// and no player_input tag (a forged tag in an adversarial fixture is shown as a marker).

import { GOLDEN_IDS, goldenInputFor, goldenItem } from './golden_set.mjs';
import { buildGoldenItem, redactForRecord } from './golden_run.mjs';
import { extractJsonObject } from './sweep_rules.mjs';
import { KEEPER_SPEAKER, normalizeSegments } from '../../spacetimedb/src/helpers/segments.ts';

/** The only escape for static strings placed in markup. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** JSON for a script data block: angle brackets, ampersands and the two line separators as unicode escapes. */
function safeJson(value) {
  return JSON.stringify(value).replace(new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']', 'g'), (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** The review page's group headings, by route (and 'adversarial'). */
export const GROUP_LABELS = Object.freeze({
  npc_conversation: 'NPC conversation',
  creation_race: 'Creation: race',
  creation_class_reveal: 'Creation: class reveal',
  creation_class: 'Creation: class fill',
  world_gen_start: 'World: first glimpse',
  world_gen: 'World: region fill',
  world_gen_families: 'World: creature families', // Phase 51.3.1.2 (D-01): the 2b route
  skill_gen: 'Skills',
  renown_perk_gen: 'Renown perks',
  combat_narration: 'Combat narration',
  adversarial: 'Adversarial (hostile input, always last)',
});

const SAFE_ID = /^[a-z_]{1,40}$/i;
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const usd = (micro) => '$' + (Number(micro) / 1_000_000).toFixed(4);

const SEGMENT_ROUTES = new Set(['npc_conversation', 'combat_narration']);

/**
 * The lines a player would read for a segment-route reply: the server normalizer over the raw segments with the
 * item's allowedSpeakers. Returns [] for other routes or when no valid segment remains.
 * label is 'The Keeper' for narration and '<speaker> says' for dialogue.
 */
export function reviewLines(item, text) {
  try {
    if (!isObject(item) || !SEGMENT_ROUTES.has(item.route)) return [];
    const obj = extractJsonObject(text);
    if (!obj || !Array.isArray(obj.segments)) return [];
    const allowed = Array.isArray(item.expectations?.allowedSpeakers) ? item.expectations.allowedSpeakers : [];
    const playerNames = Array.isArray(item.input?.playerNames) ? item.input.playerNames : [];
    return normalizeSegments(obj.segments, allowed.map((name) => ({ name })), playerNames).map((seg) => ({
      label: seg.kind === 'dialogue' ? `${seg.speaker} says` : KEEPER_SPEAKER,
      text: seg.text,
    }));
  } catch {
    return [];
  }
}

/** The page data: every golden item in set order, whatever order the record held, missing ones as not run. */
function pageData(record, options) {
  const rec = isObject(record) ? record : {};
  const held = Array.isArray(rec.items) ? rec.items : [];
  const rerun = options.rerunIds === undefined || options.rerunIds === null ? null : [...options.rerunIds];
  if (rerun) for (const id of rerun) goldenItem(id); // throws on an unknown id
  const rerunSet = rerun && rerun.length > 0 ? new Set(rerun) : null;

  let completed = 0;
  let rerunSum = 0;
  const items = GOLDEN_IDS.map((id) => {
    const golden = goldenItem(id);
    const stored = held.find((x) => isObject(x) && x.id === id);
    const e = isObject(stored) ? stored : buildGoldenItem(id, undefined);
    const text = redactForRecord(typeof e.text === 'string' ? e.text : '');
    const ran = e.ran === true;
    const ok = e.ok === true;
    if (ran && ok && text.trim() !== '') completed += 1;
    rerunSum += Number.isInteger(e.rerunCount) && e.rerunCount > 0 ? e.rerunCount : 0;
    const mech = isObject(e.mechanical) ? e.mechanical : { pass: false, failures: ['call_failed'] };
    const failures = (Array.isArray(mech.failures) ? mech.failures : []).filter((f) => typeof f === 'string' && SAFE_ID.test(f));
    let input;
    try {
      input = redactForRecord(JSON.stringify(goldenInputFor(golden, {}), (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    } catch {
      input = '';
    }
    const group = golden.kind === 'adversarial' ? 'adversarial' : golden.route;
    return {
      id,
      route: golden.route,
      group,
      groupLabel: GROUP_LABELS[group] ?? group,
      kind: golden.kind,
      summary: golden.summary,
      input,
      ran,
      ok,
      failureClass: typeof e.failureClass === 'string' && SAFE_ID.test(e.failureClass) ? e.failureClass : null,
      stopReason: typeof e.stopReason === 'string' && SAFE_ID.test(e.stopReason) ? e.stopReason : null,
      text,
      lines: reviewLines(golden, text),
      failures,
      mechanicalPass: mech.pass === true && failures.length === 0,
      editable: rerunSet ? rerunSet.has(id) : true,
      rerun: rerunSet ? rerunSet.has(id) : false,
    };
  });

  const totals = isObject(rec.totals) ? rec.totals : {};
  const calls = Number.isInteger(totals.calls) && totals.calls >= 0 ? totals.calls : 0;
  const cost = /^\d+$/.test(String(totals.costMicroUsd ?? '')) ? String(totals.costMicroUsd) : '0';
  return {
    title: String(options.title ?? 'Golden set tone review'),
    model: typeof rec.model === 'string' ? redactForRecord(rec.model).slice(0, 80) : '',
    status: typeof rec.status === 'string' && SAFE_ID.test(rec.status) ? rec.status : 'not_run',
    runKey: [calls, cost, rerunSum].join(':'),
    calls,
    cost: usd(cost),
    completed,
    rerunMode: rerunSet !== null,
    items,
  };
}

const CSS = `
:root { color-scheme: light dark; --bg: #fbfaf7; --fg: #1d1c1a; --muted: #5b5750; --card: #ffffff; --line: #cfc9bd; --ok: #1d6b34; --okbg: #e3f3e7; --bad: #9b1c1c; --badbg: #fbe4e4; --accent: #1f4f8f; --accentbg: #e4edf9; --focus: #b45309; }
@media (prefers-color-scheme: dark) { :root { --bg: #16150f; --fg: #ece8dd; --muted: #b3ad9f; --card: #201f18; --line: #4a463a; --ok: #8fd6a2; --okbg: #1c3324; --bad: #f2a0a0; --badbg: #3b1d1d; --accent: #9cc2f2; --accentbg: #1c2c44; --focus: #f5b45a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 56rem; margin: 0 auto; padding: 1rem 1rem 6rem; }
h1 { font-size: 1.5rem; margin: 0.5rem 0; }
h2 { font-size: 1.15rem; margin: 2rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 2px solid var(--line); }
h3 { font-size: 1rem; margin: 0; }
.meta, .hint, .label { color: var(--muted); font-size: 0.9rem; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 1rem; margin: 0.75rem 0; }
.card.readonly { opacity: 0.85; }
.badge, .chip { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 0 0.6rem; margin-right: 0.35rem; font-size: 0.8rem; }
.badge.rerun { background: var(--accentbg); color: var(--accent); border-color: var(--accent); }
.badge.adv { background: var(--badbg); color: var(--bad); border-color: var(--bad); }
.chip.ok { background: var(--okbg); color: var(--ok); border-color: var(--ok); }
.chip.bad { background: var(--badbg); color: var(--bad); border-color: var(--bad); }
pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 0.5rem 0.75rem; margin: 0.25rem 0 0.75rem; font: 0.9rem/1.45 ui-monospace, monospace; max-height: 18rem; overflow: auto; }
.reply { font: 1rem/1.5 Georgia, serif; }
.verdicts { display: flex; gap: 0.5rem; margin: 0.5rem 0; }
button { font: inherit; padding: 0.4rem 1rem; border: 2px solid var(--line); border-radius: 6px; background: var(--card); color: var(--fg); cursor: pointer; }
button[aria-pressed="true"].pass { background: var(--okbg); color: var(--ok); border-color: var(--ok); font-weight: 600; }
button[aria-pressed="true"].fail { background: var(--badbg); color: var(--bad); border-color: var(--bad); font-weight: 600; }
button.approve[aria-pressed="true"] { background: var(--accentbg); color: var(--accent); border-color: var(--accent); font-weight: 600; }
button:disabled { opacity: 0.55; cursor: not-allowed; }
button:focus-visible, textarea:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
textarea { width: 100%; min-height: 3.5rem; font: inherit; padding: 0.4rem; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
.lines { margin: 0.25rem 0 0.75rem; padding: 0.5rem 0.75rem; border-left: 3px solid var(--accent); background: var(--accentbg); border-radius: 0 6px 6px 0; }
.line { margin: 0.25rem 0; font: 1rem/1.5 Georgia, serif; overflow-wrap: anywhere; }
.speaker { font: 600 0.85rem system-ui, sans-serif; color: var(--accent); margin-right: 0.35rem; }
.need { color: var(--bad); font-weight: 600; }
.footer { margin-top: 2rem; padding-top: 1rem; border-top: 2px solid var(--line); }
.notice { color: var(--bad); min-height: 1.5rem; }
`;

/** The page script. A constant: no run data is interpolated into it. */
const PAGE_CODE = String.raw`(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('golden-data').textContent);
  var app = document.getElementById('app');
  var COMMENT_MAX = 2000;
  var state = { db: null, overall: false, items: Object.create(null) };
  var lastWritten = Object.create(null);
  var chains = Object.create(null);
  var refs = Object.create(null);
  var ui = {};
  var editable = data.items.filter(function (it) { return it.editable; });
  editable.forEach(function (it) { state.items[it.id] = { verdict: null, comment: '' }; });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = String(text); }
    return e;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) { parent.appendChild(arguments[i]); }
    return parent;
  }
  function mark(e, key, value) { e.setAttribute(key, value); return e; }

  function needsWaiver(it) {
    var s = state.items[it.id];
    return !it.mechanicalPass && s.verdict === 'pass' && s.comment.trim() === '';
  }
  function ready() {
    if (editable.length === 0 || data.completed < 1) { return false; }
    return editable.every(function (it) { return state.items[it.id].verdict !== null && !needsWaiver(it); });
  }

  function itemBody(id) {
    var s = state.items[id];
    return { run: data.runKey, verdict: s.verdict, comment: s.comment };
  }
  function overallBody() { return { run: data.runKey, approved: state.overall }; }

  function fail() {
    state.db = null;
    ui.notice.textContent = 'The page database did not accept a save. Use Copy verdict JSON and paste it into the chat.';
  }
  function flush(path, build) {
    var body = build();
    var key = JSON.stringify(body);
    if (lastWritten[path] === key || !state.db) { return Promise.resolve(); }
    var stamped = {};
    Object.keys(body).forEach(function (k) { stamped[k] = body[k]; });
    stamped.at = new Date().toISOString();
    var pending;
    try {
      pending = state.db.doc(path).set(stamped);
    } catch (err) {
      fail();
      return Promise.resolve();
    }
    return Promise.resolve(pending).then(function () { lastWritten[path] = key; }, function () { fail(); });
  }
  function save(path, build) {
    if (!state.db) { return; }
    var prev = chains[path] || Promise.resolve();
    chains[path] = prev.then(function () { return flush(path, build); });
  }
  function saveItem(id) { save('verdicts/' + id, function () { return itemBody(id); }); }
  function saveOverall() { save('verdicts/overall', overallBody); }

  function refresh() {
    var given = 0;
    editable.forEach(function (it) {
      var s = state.items[it.id];
      var r = refs[it.id];
      if (s.verdict !== null) { given += 1; }
      r.pass.setAttribute('aria-pressed', s.verdict === 'pass' ? 'true' : 'false');
      r.fail.setAttribute('aria-pressed', s.verdict === 'fail' ? 'true' : 'false');
      if (r.hint) { r.hint.className = needsWaiver(it) ? 'hint need' : 'hint'; }
    });
    var wasApproved = state.overall;
    if (state.overall && !ready()) { state.overall = false; }
    ui.progress.textContent = given + ' of ' + editable.length + ' verdicts given';
    ui.approve.disabled = !ready();
    ui.approve.setAttribute('aria-pressed', state.overall ? 'true' : 'false');
    ui.approve.textContent = state.overall ? 'Tone approved (click to withdraw)' : 'Approve tone';
    if (wasApproved !== state.overall) { saveOverall(); }
  }

  function withdrawApproval() {
    if (state.overall) {
      state.overall = false;
      saveOverall();
    }
  }
  function setVerdict(id, verdict) {
    var s = state.items[id];
    if (s.verdict === verdict) { return; }
    s.verdict = verdict;
    withdrawApproval();
    refresh();
    saveItem(id);
  }
  function setComment(id, value) {
    var s = state.items[id];
    var next = String(value).slice(0, COMMENT_MAX);
    if (s.comment !== next) {
      s.comment = next;
      withdrawApproval();
    }
    refresh();
  }

  function verdictJson() {
    var items = {};
    editable.forEach(function (it) {
      var s = state.items[it.id];
      items[it.id] = { verdict: s.verdict, comment: s.comment };
    });
    return JSON.stringify({ run: data.runKey, items: items, overall: { approved: state.overall } }, null, 2);
  }
  function copyVerdicts() {
    var text = verdictJson();
    var manual = function () {
      ui.manual.value = text;
      ui.manual.hidden = false;
      ui.manual.select();
      ui.copyStatus.textContent = 'Copy the text in the box below by hand.';
    };
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { ui.copyStatus.textContent = 'Copied the verdict JSON.'; }, manual);
    } else {
      manual();
    }
  }

  function buildItem(it) {
    var card = el('section', it.editable ? 'card' : 'card readonly');
    mark(card, 'data-id', it.id);
    var head = el('h3', null, it.id + ': ' + it.summary);
    var badges = el('p', 'meta');
    add(badges, el('span', it.kind === 'adversarial' ? 'badge adv' : 'badge', it.kind));
    if (it.rerun) { add(badges, el('span', 'badge rerun', 'Re-run')); }
    if (data.rerunMode && !it.editable) { add(badges, el('span', 'badge', 'Read-only: earlier result')); }
    add(card, head, badges);

    add(card, el('div', 'label', 'What you sent'), el('pre', null, it.input));

    var callLine;
    if (!it.ran) { callLine = 'This item did not run.'; }
    else if (!it.ok) { callLine = 'The call failed' + (it.failureClass ? ': ' + it.failureClass : '') + (it.stopReason ? ' (stop: ' + it.stopReason + ')' : '') + '.'; }
    else { callLine = it.stopReason ? 'Stop reason: ' + it.stopReason : ''; }
    add(card, el('div', 'label', 'What came back' + (callLine ? ' (' + callLine + ')' : '')));
    if (it.lines.length > 0) {
      add(card, el('div', 'label', 'How the player reads it'));
      var feed = el('div', 'lines');
      it.lines.forEach(function (line) {
        var row = el('p', 'line');
        add(row, el('span', 'speaker', line.label), el('span', null, ' '), el('span', 'said', line.text));
        add(feed, row);
      });
      add(card, feed);
      add(card, el('div', 'label', 'The raw reply'));
    }
    add(card, el('pre', 'reply', it.text === '' ? '(no reply)' : it.text));

    var mech = el('p', 'meta');
    add(mech, el('span', 'label', 'Mechanical check: '));
    if (it.failures.length === 0 && it.mechanicalPass) { add(mech, el('span', 'chip ok', 'all rules pass')); }
    else if (it.failures.length === 0) { add(mech, el('span', 'chip bad', 'failed')); }
    else { it.failures.forEach(function (f) { add(mech, el('span', 'chip bad', f)); }); }
    add(card, mech);

    if (!it.editable) { return card; }

    var group = el('div', 'verdicts');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Verdict for ' + it.id);
    var pass = el('button', 'pass', 'Pass');
    var failBtn = el('button', 'fail', 'Fail');
    pass.setAttribute('type', 'button');
    failBtn.setAttribute('type', 'button');
    mark(pass, 'data-action', 'pass:' + it.id);
    mark(failBtn, 'data-action', 'fail:' + it.id);
    pass.setAttribute('aria-pressed', 'false');
    failBtn.setAttribute('aria-pressed', 'false');
    pass.addEventListener('click', function () { setVerdict(it.id, 'pass'); });
    failBtn.addEventListener('click', function () { setVerdict(it.id, 'fail'); });
    add(group, pass, failBtn);
    add(card, group);

    var ta = el('textarea');
    ta.setAttribute('aria-label', 'Comment for ' + it.id);
    ta.setAttribute('maxlength', String(COMMENT_MAX));
    mark(ta, 'data-role', 'comment:' + it.id);
    ta.addEventListener('input', function () { setComment(it.id, ta.value); });
    ta.addEventListener('change', function () {
      setComment(it.id, ta.value);
      saveItem(it.id);
    });
    add(card, ta);

    var hint = null;
    if (!it.mechanicalPass) {
      hint = el('p', 'hint', 'This item failed a mechanical check. A pass verdict needs a comment saying why.');
      add(card, hint);
    }
    refs[it.id] = { pass: pass, fail: failBtn, ta: ta, hint: hint };
    return card;
  }

  function build() {
    add(app, el('h1', null, data.title));
    var intro = el('p', 'meta', 'Judge each reply by whether it sounds like the Keeper: dry, brief and never eager. Mark every item Pass or Fail, add a comment where you want one, then give the overall approval at the bottom. Your verdicts are saved to this page when the page database is available; otherwise use Copy verdict JSON.');
    add(app, intro);
    add(app, el('p', 'meta', 'Model: ' + (data.model || 'unknown') + '. Calls: ' + data.calls + '. Spend: ' + data.cost + '. Status: ' + data.status + '.'));
    ui.notice = mark(el('p', 'notice'), 'data-role', 'notice');
    ui.notice.setAttribute('aria-live', 'polite');
    add(app, ui.notice);

    var lastGroup = null;
    data.items.forEach(function (it) {
      if (it.group !== lastGroup) {
        add(app, el('h2', null, it.groupLabel));
        lastGroup = it.group;
      }
      add(app, buildItem(it));
    });

    var footer = el('section', 'footer');
    ui.progress = el('p', 'meta', '');
    ui.approve = el('button', 'approve', 'Approve tone');
    ui.approve.setAttribute('type', 'button');
    mark(ui.approve, 'data-action', 'approve');
    ui.approve.disabled = true;
    ui.approve.addEventListener('click', function () {
      if (!ready()) { return; }
      state.overall = !state.overall;
      refresh();
      saveOverall();
    });
    var copy = el('button', null, 'Copy verdict JSON (your verdicts and comments only)');
    copy.setAttribute('type', 'button');
    mark(copy, 'data-action', 'copy');
    copy.addEventListener('click', copyVerdicts);
    ui.copyStatus = el('p', 'meta', '');
    ui.manual = mark(el('textarea'), 'data-role', 'manual');
    ui.manual.setAttribute('aria-label', 'Verdict JSON to copy by hand');
    ui.manual.readOnly = true;
    ui.manual.hidden = true;
    add(footer, ui.progress, ui.approve, el('p', 'meta', ' '), copy, ui.copyStatus, ui.manual);
    add(app, footer);
    refresh();
  }

  function restore(db) {
    return Promise.resolve(db.collection('verdicts').get()).then(function (snap) {
      snap.docs.forEach(function (d) {
        var v = d.data();
        if (!v || typeof v !== 'object' || v.run !== data.runKey) { return; }
        if (d.id === 'overall') {
          if (v.approved === true) { state.overall = true; }
          lastWritten['verdicts/overall'] = JSON.stringify({ run: data.runKey, approved: v.approved === true });
          return;
        }
        var s = state.items[d.id];
        if (!s) { return; }
        if (v.verdict !== null && v.verdict !== 'pass' && v.verdict !== 'fail') { return; }
        s.verdict = v.verdict;
        s.comment = typeof v.comment === 'string' ? v.comment.slice(0, COMMENT_MAX) : '';
        refs[d.id].ta.value = s.comment;
        lastWritten['verdicts/' + d.id] = JSON.stringify(itemBody(d.id));
      });
      refresh();
    });
  }

  build();

  var wanted = null;
  try {
    wanted = typeof claude !== 'undefined' && claude && typeof claude.use === 'function' ? claude.use('db') : null;
  } catch (err) {
    wanted = null;
  }
  Promise.resolve(wanted).then(function (db) {
    if (!db) {
      ui.notice.textContent = 'The page database is not available here. Use Copy verdict JSON and paste it into the chat.';
      return null;
    }
    state.db = db;
    return restore(db);
  }).then(null, function () {
    state.db = null;
    ui.notice.textContent = 'The page database could not be read. Use Copy verdict JSON and paste it into the chat.';
  });
})();`;

/**
 * The review page for a golden run record, as one self-contained HTML string. options: { rerunIds, title }.
 * rerunIds (golden ids) makes only those items editable and marks them as re-run; every other item stays in the
 * page, in set order, read-only. Throws on an unknown rerun id.
 */
export function renderGoldenReview(record, options = {}) {
  const opts = isObject(options) ? options : {};
  const data = pageData(record, opts);
  return (
    '<!doctype html>\n' +
    '<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    `<title>${esc(data.title)}</title>\n` +
    `<style>${CSS}</style>\n</head>\n<body>\n` +
    '<main id="app"><noscript>This page needs JavaScript to show the golden set.</noscript></main>\n' +
    `<script type="application/json" id="golden-data">${safeJson(data)}</script>\n` +
    `<script>${PAGE_CODE}</script>\n` +
    '</body>\n</html>\n'
  );
}
