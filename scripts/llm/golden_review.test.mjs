// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_review.test.mjs
// The golden review page generator (Phase 44, Plan 44-04): self-contained, inert against hostile model text,
// set-ordered, verdicts through the db capability with a paste fallback. The page script is executed against a
// small fake DOM, so these tests drive the real buttons. No network, no key, no token.

import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { GOLDEN_IDS, GOLDEN_SET, goldenItem } from './golden_set.mjs';
import { KEEPER_IT_OR_THEY } from './golden_rules.mjs';
import { buildGoldenRecord } from './golden_run.mjs';
import { renderGoldenReview, reviewLines } from './golden_review.mjs';

const FAKE_KEY = ['sk', '-ant-', 'api03-', 'B'.repeat(30)].join('');

const HOSTILE = [
  '<script>alert(1)</script>',
  '</script><script>alert(2)</script>',
  '</textarea><img src=x onerror=alert(3)>',
  `quotes " ' & < > and a line separator ${String.fromCharCode(0x2028)} and ${String.fromCharCode(0x2029)} done`,
].join('\n');

const result = (text) => ({
  ran: true,
  ok: true,
  failureClass: null,
  stopReason: 'end_turn',
  latencyMs: 900,
  usage: { input: 10, output: 5, cacheWrite: 0, cacheRead: 0 },
  costMicroUsd: 100n,
  text,
});

/** A record where every item ran. Mechanical results are forced to pass except for the ids in `failing`. */
function recordWith(textFor = () => 'A dry line. And another.', failing = []) {
  const results = {};
  for (const id of GOLDEN_IDS) results[id] = result(textFor(id));
  const rec = buildGoldenRecord({ model: 'test-model-xyz', window: { startedAt: '2026-10-05T10:00:00.000Z', endedAt: '2026-10-05T10:10:00.000Z' }, results });
  for (const item of rec.items) item.mechanical = failing.includes(item.id) ? { pass: false, failures: ['markdown'], notes: {} } : { pass: true, failures: [], notes: {} };
  return rec;
}

/** The two script blocks of a page: the JSON data block and the static code block. */
function blocks(html) {
  const found = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  return { count: (html.match(/<script\b/g) ?? []).length, found };
}
function dataOf(html) {
  const { found } = blocks(html);
  const json = found.find((m) => /application\/json/.test(m[1]));
  return { raw: json[2], parsed: JSON.parse(json[2]) };
}
function codeOf(html) {
  const { found } = blocks(html);
  return found.find((m) => !/application\/json/.test(m[1]))[2];
}

describe('renderGoldenReview: structure', () => {
  const html = renderGoldenReview(recordWith());

  it('is one complete HTML document with inline CSS and JS and exactly two script elements', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('</html>');
    expect(html).toContain('<style>');
    expect(blocks(html).count).toBe(2);
    expect(blocks(html).found).toHaveLength(2);
    expect(blocks(html).found[0][1]).toMatch(/application\/json/);
  });

  it('has no external URL, font, stylesheet or script source', () => {
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/\bsrc\s*=/i);
    expect(html).not.toMatch(/url\(/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/@font-face/i);
  });

  it('works at light and dark themes', () => {
    expect(html).toContain('color-scheme');
    expect(html).toContain('prefers-color-scheme: dark');
  });

  it('the code block is the same constant text for every record (no run data interpolated)', () => {
    const other = renderGoldenReview(recordWith(() => 'Entirely different words here. Truly.'), { title: 'Another title', rerunIds: ['npc-01'] });
    expect(codeOf(other)).toBe(codeOf(html));
  });
});

describe('renderGoldenReview: hostile model text is inert', () => {
  const html = renderGoldenReview(recordWith((id) => (id === 'adv-1' ? HOSTILE : 'A dry line. And another.')));
  const data = dataOf(html);
  const code = codeOf(html);

  it('the data block holds no raw less-than, greater-than, ampersand, line separator or closing script sequence', () => {
    expect(data.raw).not.toContain('<');
    expect(data.raw).not.toContain('>');
    expect(data.raw).not.toContain('&');
    expect(data.raw).not.toContain(String.fromCharCode(0x2028));
    expect(data.raw).not.toContain(String.fromCharCode(0x2029));
    expect(data.raw.toLowerCase()).not.toContain('</script');
  });

  it('the hostile text survives intact inside the parsed data and nowhere else in the page', () => {
    expect(data.parsed.items.find((i) => i.id === 'adv-1').text).toBe(HOSTILE);
    const outsideData = html.replace(data.raw, '');
    expect(outsideData).not.toContain('alert(');
    expect(outsideData).not.toContain('onerror');
    expect(html).not.toContain('<script>alert');
    expect(blocks(html).count).toBe(2); // the payload added no script element
    expect(html.match(/<textarea/g)).toBeNull(); // no textarea in static markup for a payload to close
  });

  it('the code block uses none of the markup-parsing insertion APIs, no document write and no dynamic evaluation', () => {
    for (const banned of [
      'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'insertAdjacentText', 'document.write', 'document.writeln',
      'eval(', 'new Function', 'Function(', 'DOMParser', 'createContextualFragment', 'srcdoc', 'setTimeout(\'', 'setTimeout("', 'setInterval(\'', 'importScripts', 'import(',
    ]) {
      expect(code, banned).not.toContain(banned);
    }
    expect(code).toContain('textContent');
    expect(code).toContain('createElement');
    expect(code).toContain('JSON.parse');
  });

  it('keeps run data out of the code block', () => {
    expect(code).not.toContain('test-model-xyz');
    expect(code).not.toContain('npc-01');
    expect(code).not.toContain('A dry line');
  });

  it('a script-shaped title is escaped in the document head', () => {
    const titled = renderGoldenReview(recordWith(), { title: '</title><script>alert(9)</script>' });
    expect(titled).not.toContain('alert(9)</script>');
    expect(blocks(titled).count).toBe(2);
  });
});

describe('renderGoldenReview: ordering and content', () => {
  it('lists items in golden-set order grouped by route with the adversarial group last, whatever order the record held', () => {
    const rec = recordWith();
    rec.items.reverse();
    const parsed = dataOf(renderGoldenReview(rec)).parsed;
    expect(parsed.items.map((i) => i.id)).toEqual([...GOLDEN_IDS]);
    const groups = parsed.items.map((i) => i.group);
    const changes = groups.filter((g, i) => i === 0 || g !== groups[i - 1]);
    expect(new Set(changes).size).toBe(changes.length); // every group is contiguous
    expect(groups[groups.length - 1]).toBe('adversarial');
    expect(parsed.items.filter((i) => i.group === 'adversarial').map((i) => i.id)).toEqual(['adv-1', 'adv-2', 'adv-3', 'adv-4', 'adv-5']);
    expect(parsed.items.find((i) => i.id === 'npc-01').group).toBe('npc_conversation');
  });

  it('a record missing entries still shows all 27 items, the missing ones as not run', () => {
    const rec = recordWith();
    rec.items = rec.items.filter((i) => i.id !== 'ren-01');
    const parsed = dataOf(renderGoldenReview(rec)).parsed;
    expect(parsed.items).toHaveLength(27);
    const missing = parsed.items.find((i) => i.id === 'ren-01');
    expect(missing.ran).toBe(false);
    expect(missing.mechanicalPass).toBe(false);
  });

  it('shows the player-visible input only, the output, the failure ids, never system or Bible text or a player_input tag', () => {
    const rec = recordWith((id) => `Output for ${id}. Second sentence.`, ['cmb-01']);
    const html = renderGoldenReview(rec);
    const parsed = dataOf(html).parsed;
    const cmb = parsed.items.find((i) => i.id === 'cmb-01');
    expect(cmb.text).toBe('Output for cmb-01. Second sentence.');
    expect(cmb.failures).toEqual(['markdown']);
    expect(cmb.mechanicalPass).toBe(false);
    expect(cmb.input).toContain('Brenna'); // the raw golden input
    expect(JSON.stringify(parsed)).not.toMatch(/IDENTITY|BANNED PHRASES AND FORMATTING|TASK:/);
    // The adversarial inputs carry forged tags; the page shows a marker, never the tag.
    const adv = parsed.items.find((i) => i.id === 'adv-1');
    expect(adv.input).toContain('CANARY-RACE-3157');
    expect(adv.input).not.toMatch(/player_input/i);
    expect(html).not.toMatch(/player_input/i);
  });

  it('holds no key-shaped string, token or request-body marker even when the record text had one', () => {
    const rec = recordWith((id) => (id === 'npc-01' ? `leak ${FAKE_KEY} and "max_tokens": 5 and Authorization: x` : 'Fine. Truly.'));
    rec.items[0].text = `leak ${FAKE_KEY} and "max_tokens": 5 and Authorization: x`;
    const html = renderGoldenReview(rec);
    expect(html).not.toContain(FAKE_KEY);
    expect(html).not.toMatch(/"max_tokens"/);
    expect(html).not.toMatch(/authorization\s*:/i);
    expect(html).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./);
  });

  it('page copy follows the pronoun rule', () => {
    const html = renderGoldenReview(recordWith());
    const { raw } = dataOf(html);
    const staticPart = html.replace(raw, '');
    expect(staticPart).not.toMatch(/\b(they|them|their|theirs|themselves)\b/i);
    expect(staticPart).not.toMatch(KEEPER_IT_OR_THEY);
    expect(staticPart).toMatch(/Keeper/);
  });

  it('throws on an unknown rerun id rather than silently making nothing editable', () => {
    expect(() => renderGoldenReview(recordWith(), { rerunIds: ['npc-99'] })).toThrow(/unknown golden item id/);
  });
});

describe('renderGoldenReview: segment replies as labelled lines', () => {
  const npc = goldenItem('npc-01');
  const npcName = npc.input.npc.name;
  const segmentReply = (...segments) => JSON.stringify({ segments });
  const GOOD = segmentReply(
    { kind: 'narration', speaker: 'The Keeper', text: 'The lamp gutters as you step in.' },
    { kind: 'dialogue', speaker: npcName, text: 'You are late.' },
  );

  it('reviewLines labels narration The Keeper and dialogue with the speaker', () => {
    expect(reviewLines(npc, GOOD)).toEqual([
      { label: 'The Keeper', text: 'The lamp gutters as you step in.' },
      { label: `${npcName} says`, text: 'You are late.' },
    ]);
  });

  it('reviewLines works for a combat narration item and a reply wrapped in prose', () => {
    const cmb = goldenItem('cmb-01');
    const lines = reviewLines(cmb, 'Here: ' + segmentReply({ kind: 'narration', speaker: 'The Keeper', text: 'The hound drops.' }));
    expect(lines).toEqual([{ label: 'The Keeper', text: 'The hound drops.' }]);
  });

  it('reviewLines returns [] for a stage route, unparseable text and a reply with no valid segment', () => {
    expect(reviewLines(goldenItem('cre-01'), GOOD)).toEqual([]);
    expect(reviewLines(npc, 'just prose, no object')).toEqual([]);
    expect(reviewLines(npc, '{"segments": "nope"}')).toEqual([]);
    expect(reviewLines(npc, segmentReply({ kind: 'narration', speaker: 'The Keeper', text: '   ' }))).toEqual([]);
    expect(reviewLines(npc, undefined)).toEqual([]);
  });

  it('a speaker outside the allowed speakers is shown as Keeper narration, as the server stores it', () => {
    const lines = reviewLines(npc, segmentReply({ kind: 'dialogue', speaker: 'Somebody Else', text: 'Hello.' }));
    expect(lines).toHaveLength(1);
    expect(lines[0].label).toBe('The Keeper');
  });

  it('the page data carries lines for segment routes and an empty list elsewhere', () => {
    const parsed = dataOf(renderGoldenReview(recordWith((id) => (id === 'npc-01' ? GOOD : 'A dry line. And another.')))).parsed;
    expect(parsed.items.find((i) => i.id === 'npc-01').lines).toHaveLength(2);
    expect(parsed.items.find((i) => i.id === 'cre-01').lines).toEqual([]);
    expect(parsed.items.find((i) => i.id === 'npc-02').lines).toEqual([]);
  });

  it('hostile segment text appears only inside the escaped data block and the code block stays constant', () => {
    const hostile = segmentReply(
      { kind: 'narration', speaker: 'The Keeper', text: '<script>alert(1)</script>' },
      { kind: 'narration', speaker: 'The Keeper', text: '<img src=x onerror=alert(2)>' },
      { kind: 'narration', speaker: 'The Keeper', text: '</script><script>alert(3)</script>' },
    );
    const html = renderGoldenReview(recordWith((id) => (id === 'npc-01' ? hostile : 'A dry line. And another.')));
    const data = dataOf(html);
    const lines = data.parsed.items.find((i) => i.id === 'npc-01').lines;
    expect(lines.map((l) => l.text)).toEqual(['<script>alert(1)</script>', '<img src=x onerror=alert(2)>', '</script><script>alert(3)</script>']);
    expect(data.raw).not.toContain('<');
    const outside = html.replace(data.raw, '');
    expect(outside).not.toContain('alert(');
    expect(outside).not.toContain('onerror');
    expect(blocks(html).count).toBe(2);
    expect(codeOf(html)).toBe(codeOf(renderGoldenReview(recordWith())));
  });

  it('the code block builds the lines with createElement and textContent under a How the player reads it label', () => {
    const code = codeOf(renderGoldenReview(recordWith()));
    expect(code).toContain('How the player reads it');
    expect(code).toContain('it.lines');
    expect(code).not.toContain('innerHTML');
  });
});

// ---------------------------------------------------------------------------
// The page script, run against a minimal fake DOM
// ---------------------------------------------------------------------------

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.parent = null;
    this._text = '';
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.className = '';
    this.readOnly = false;
    this.style = {};
  }
  set textContent(v) {
    this._text = String(v);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  appendChild(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  removeChild(c) {
    this.children = this.children.filter((x) => x !== c);
    return c;
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type) {
    for (const fn of this.listeners[type] ?? []) fn({ type, target: this, preventDefault() {} });
  }
  click() {
    if (!this.disabled) this.fire('click');
  }
  focus() {}
  select() {}
}

function walk(node, out = []) {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/** Load a page into the fake DOM. `claude` may be undefined (no capability), or an object with use(). */
async function loadPage(html, { claude, clipboard } = {}) {
  const app = new El('main');
  const dataEl = { textContent: dataOf(html).raw };
  const document = {
    getElementById: (id) => (id === 'golden-data' ? dataEl : id === 'app' ? app : null),
    createElement: (tag) => new El(tag),
  };
  const copied = [];
  const sandbox = {
    document,
    JSON,
    Promise,
    Date,
    Object,
    Array,
    String,
    Number,
    Math,
    console,
    navigator: clipboard === null ? {} : { clipboard: { writeText: async (t) => void copied.push(t) } },
  };
  if (claude !== undefined) sandbox.claude = claude;
  vm.runInNewContext(codeOf(html), sandbox);
  await flush();
  const all = () => walk(app);
  const byAttr = (k, v) => all().find((e) => e.attrs[k] === v);
  return {
    app,
    copied,
    all,
    button: (id, which) => byAttr('data-action', `${which}:${id}`),
    comment: (id) => byAttr('data-role', `comment:${id}`),
    approve: () => byAttr('data-action', 'approve'),
    copy: () => byAttr('data-action', 'copy'),
    notice: () => byAttr('data-role', 'notice'),
    text: () => app.textContent,
  };
}

/** A fake db: records every set, can restore documents, can be made to reject or to hold writes open. */
function fakeDb({ docs = [], reject = false, hold = false } = {}) {
  const writes = [];
  const inFlight = {};
  let maxInFlight = 0;
  const releases = [];
  const db = {
    writes,
    releases,
    get maxInFlight() {
      return maxInFlight;
    },
    doc: (path) => ({
      set: (body) => {
        if (reject) return Promise.reject({ code: 'invalid_argument', message: 'no' });
        inFlight[path] = (inFlight[path] ?? 0) + 1;
        maxInFlight = Math.max(maxInFlight, inFlight[path]);
        writes.push({ path, body });
        const done = () => {
          inFlight[path] -= 1;
        };
        if (!hold) return Promise.resolve().then(done);
        return new Promise((resolve) => releases.push(() => (done(), resolve())));
      },
    }),
    collection: () => ({
      get: async () => ({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) }),
    }),
  };
  return db;
}
const withDb = (db) => ({ use: async (name) => (name === 'db' ? db : null) });

describe('the page script: verdict capture through the db capability', () => {
  const html = renderGoldenReview(recordWith());
  const runKey = dataOf(html).parsed.runKey;

  it('renders every item with a pass and a fail control and a comment box', async () => {
    const page = await loadPage(html, { claude: withDb(fakeDb()) });
    for (const id of GOLDEN_IDS) {
      expect(page.button(id, 'pass'), id).toBeTruthy();
      expect(page.button(id, 'fail'), id).toBeTruthy();
      expect(page.comment(id), id).toBeTruthy();
    }
    expect(page.text()).toContain(goldenItem('npc-01').summary.slice(0, 20));
  });

  it('writes verdicts/<id> with the verdict, comment and a timestamp, and only on a real change', async () => {
    const db = fakeDb();
    const page = await loadPage(html, { claude: withDb(db) });
    page.button('npc-01', 'pass').click();
    await flush();
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0].path).toBe('verdicts/npc-01');
    expect(db.writes[0].body).toMatchObject({ run: runKey, verdict: 'pass', comment: '' });
    expect(typeof db.writes[0].body.at).toBe('string');
    page.button('npc-01', 'pass').click(); // same verdict: no change, no write
    await flush();
    expect(db.writes).toHaveLength(1);
    const ta = page.comment('npc-01');
    ta.value = 'Dry enough.';
    ta.fire('input');
    ta.fire('change');
    await flush();
    expect(db.writes).toHaveLength(2);
    expect(db.writes[1].body).toMatchObject({ verdict: 'pass', comment: 'Dry enough.' });
    ta.fire('change'); // unchanged
    await flush();
    expect(db.writes).toHaveLength(2);
    page.button('npc-01', 'fail').click();
    await flush();
    expect(db.writes).toHaveLength(3);
    expect(db.writes[2].body.verdict).toBe('fail');
  });

  it('awaits each write before the next one to the same document', async () => {
    const db = fakeDb({ hold: true });
    const page = await loadPage(html, { claude: withDb(db) });
    page.button('npc-02', 'pass').click();
    await flush();
    expect(db.writes).toHaveLength(1); // held open
    page.button('npc-02', 'fail').click();
    await flush();
    expect(db.writes).toHaveLength(1); // the second waits for the first
    db.releases.shift()();
    await flush();
    expect(db.writes).toHaveLength(2);
    expect(db.writes[1].body.verdict).toBe('fail');
    expect(db.maxInFlight).toBe(1);
  });

  it('coalesces a burst of changes into the latest state instead of writing every step', async () => {
    const db = fakeDb();
    const page = await loadPage(html, { claude: withDb(db) });
    page.button('npc-03', 'pass').click();
    page.button('npc-03', 'fail').click();
    page.button('npc-03', 'pass').click();
    await flush();
    expect(db.writes.map((w) => w.body.verdict)).toEqual(['pass']);
  });

  it('keeps the overall approve disabled until every item has a verdict, then writes verdicts/overall', async () => {
    const db = fakeDb();
    const page = await loadPage(html, { claude: withDb(db) });
    expect(page.approve().disabled).toBe(true);
    for (const id of GOLDEN_IDS.slice(0, -1)) page.button(id, 'pass').click();
    await flush();
    expect(page.approve().disabled).toBe(true);
    page.button(GOLDEN_IDS[GOLDEN_IDS.length - 1], 'fail').click();
    await flush();
    expect(page.approve().disabled).toBe(false);
    const before = db.writes.length;
    page.approve().click();
    await flush();
    expect(db.writes).toHaveLength(before + 1);
    const last = db.writes[db.writes.length - 1];
    expect(last.path).toBe('verdicts/overall');
    expect(last.body).toMatchObject({ run: runKey, approved: true });
    expect(typeof last.body.at).toBe('string');
    // Changing a verdict afterwards withdraws the approval.
    page.button('npc-01', 'fail').click();
    await flush();
    expect(page.approve().disabled).toBe(false);
    const overallWrites = db.writes.filter((w) => w.path === 'verdicts/overall');
    expect(overallWrites[overallWrites.length - 1].body.approved).toBe(false);
  });

  it('needs a comment on a pass over a mechanical failure before the approve control enables', async () => {
    const failing = recordWith(undefined, ['cmb-01']);
    const page = await loadPage(renderGoldenReview(failing), { claude: withDb(fakeDb()) });
    expect(page.text()).toMatch(/mechanical/i);
    for (const id of GOLDEN_IDS) page.button(id, 'pass').click();
    await flush();
    expect(page.approve().disabled).toBe(true); // cmb-01 passed with no comment
    const ta = page.comment('cmb-01');
    ta.value = 'Fine: the asterisks are the narrator quoting a sign.';
    ta.fire('input');
    ta.fire('change');
    await flush();
    expect(page.approve().disabled).toBe(false);
  });

  it('does not approve when no item completed', async () => {
    const empty = buildGoldenRecord({});
    const page = await loadPage(renderGoldenReview(empty), { claude: withDb(fakeDb()) });
    for (const id of GOLDEN_IDS) page.button(id, 'fail').click();
    await flush();
    expect(page.approve().disabled).toBe(true);
  });

  it('restores only valid verdicts for this run from the db, without writing them back', async () => {
    const db = fakeDb({
      docs: [
        { id: 'npc-01', data: { run: runKey, verdict: 'pass', comment: 'Kept.' } },
        { id: 'npc-02', data: { run: 'some-other-run', verdict: 'pass', comment: 'Stale.' } },
        { id: 'npc-03', data: { run: runKey, verdict: 'definitely', comment: 'Bad value.' } },
        { id: 'npc-99', data: { run: runKey, verdict: 'pass', comment: 'Unknown id.' } },
        { id: '__proto__', data: { run: runKey, verdict: 'pass', comment: 'x' } },
      ],
    });
    const page = await loadPage(html, { claude: withDb(db) });
    expect(page.comment('npc-01').value).toBe('Kept.');
    expect(page.comment('npc-02').value).toBe('');
    expect(page.comment('npc-03').value).toBe('');
    expect(db.writes).toHaveLength(0);
  });

  it('shows a short notice and the copy fallback when a write is rejected, and stops writing', async () => {
    const db = fakeDb({ reject: true });
    const page = await loadPage(html, { claude: withDb(db) });
    page.button('npc-01', 'pass').click();
    await flush();
    expect(page.notice().textContent).toMatch(/Copy verdict JSON/);
    expect(page.copy()).toBeTruthy();
    expect(page.notice().textContent.length).toBeLessThan(200);
  });
});

describe('the page script: paste fallback', () => {
  const html = renderGoldenReview(recordWith());

  it('works with no capability at all and copies one JSON object of verdicts and comments', async () => {
    const page = await loadPage(html); // no claude global
    page.button('npc-01', 'pass').click();
    page.button('npc-02', 'fail').click();
    const ta = page.comment('npc-02');
    ta.value = 'Too soft.';
    ta.fire('input');
    ta.fire('change');
    page.copy().click();
    await flush();
    expect(page.copied).toHaveLength(1);
    const payload = JSON.parse(page.copied[0]);
    expect(payload.items['npc-01']).toEqual({ verdict: 'pass', comment: '' });
    expect(payload.items['npc-02']).toEqual({ verdict: 'fail', comment: 'Too soft.' });
    expect(payload.overall).toEqual({ approved: false });
    expect(Object.keys(payload).sort()).toEqual(['items', 'overall', 'run']);
    expect(JSON.stringify(payload)).not.toMatch(/A dry line/); // verdicts only, no run text
  });

  it('handles claude.use("db") resolving null the same way', async () => {
    const page = await loadPage(html, { claude: { use: async () => null } });
    page.button('npc-01', 'pass').click();
    await flush();
    expect(page.copy()).toBeTruthy();
    expect(page.notice().textContent).toMatch(/Copy verdict JSON/);
  });

  it('the copy button label states what it copies', () => {
    const code = codeOf(html);
    expect(code).toContain('Copy verdict JSON');
    expect(code).toMatch(/Copy verdict JSON \(/);
  });

  it('writes through the documented db paths and uses no other capability', () => {
    const code = codeOf(html);
    expect(code).toContain("claude.use('db')");
    expect(code).toContain("'verdicts/'");
    expect(code).toContain("'verdicts/overall'");
    expect(code).not.toMatch(/claude\.use\('(?!db')/);
  });

  it('a clipboard that is absent shows the JSON in a box to copy by hand', async () => {
    const page = await loadPage(html, { clipboard: null });
    page.button('npc-01', 'pass').click();
    page.copy().click();
    await flush();
    const manual = page.all().find((e) => e.attrs['data-role'] === 'manual');
    expect(manual.hidden).toBe(false);
    expect(JSON.parse(manual.value).items['npc-01'].verdict).toBe('pass');
  });
});

describe('the page script: rerun mode', () => {
  const rerunIds = ['npc-02', 'adv-3'];
  const html = renderGoldenReview(recordWith(), { rerunIds });

  it('makes only the re-run items editable and marks them, earlier results read-only', async () => {
    const parsed = dataOf(html).parsed;
    expect(parsed.items.filter((i) => i.editable).map((i) => i.id)).toEqual(rerunIds);
    expect(parsed.items.filter((i) => i.rerun).map((i) => i.id)).toEqual(rerunIds);
    const page = await loadPage(html, { claude: withDb(fakeDb()) });
    expect(page.button('npc-02', 'pass')).toBeTruthy();
    expect(page.button('npc-01', 'pass')).toBeUndefined();
    expect(page.comment('npc-01')).toBeUndefined();
    expect(page.text()).toMatch(/Re-run/);
    expect(page.text()).toMatch(/earlier result/i);
  });

  it('enables the approve control once every re-run item has a verdict', async () => {
    const page = await loadPage(html, { claude: withDb(fakeDb()) });
    expect(page.approve().disabled).toBe(true);
    page.button('npc-02', 'pass').click();
    page.button('adv-3', 'pass').click();
    await flush();
    expect(page.approve().disabled).toBe(false);
  });

  it('every item stays in the page in set order', () => {
    expect(dataOf(html).parsed.items.map((i) => i.id)).toEqual([...GOLDEN_IDS]);
    expect(GOLDEN_SET).toHaveLength(27);
  });
});

describe('the page renders labelled lines as text nodes', () => {
  it('shows each line with its label before the raw reply, hostile text as plain text', async () => {
    const npcName = goldenItem('npc-01').input.npc.name;
    const reply = JSON.stringify({ segments: [
      { kind: 'narration', speaker: 'The Keeper', text: '<b>bold</b> rain falls.' },
      { kind: 'dialogue', speaker: npcName, text: 'Mind the step.' },
    ] });
    const page = await loadPage(renderGoldenReview(recordWith((id) => (id === 'npc-01' ? reply : 'A dry line. And another.'))));
    const text = page.text();
    expect(text).toContain('How the player reads it');
    expect(text).toContain('The Keeper');
    expect(text).toContain('<b>bold</b> rain falls.');
    expect(text).toContain(`${npcName} says`);
    expect(text.indexOf('How the player reads it')).toBeLessThan(text.indexOf('The raw reply'));
    // every element built by the page is a plain element: no node was made from markup
    expect(page.all().some((e) => e.tagName === 'B')).toBe(false);
  });
});
