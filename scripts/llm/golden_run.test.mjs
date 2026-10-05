// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_run.test.mjs
// The golden run module (Phase 44, Plan 44-04): modes, spend guard, record with redaction and hygiene,
// rerun and verdict merge, and the owner-only approval rule. Nothing here touches the network, a key or a token.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './cli.mjs';
import { GOLDEN_IDS, GOLDEN_SET, goldenItem } from './golden_set.mjs';
import { evaluateGoldenItem, GOLDEN_RULES_ADDED_IN_46, GOLDEN_SHAPE_CHANGED_ROUTES } from './golden_rules.mjs';
import { KEEPER_BIBLE_HEADINGS } from '../../spacetimedb/src/data/keeper_bible.ts';
import {
  GOLDEN_CAP_MICRO_USD,
  GOLDEN_MODES,
  GOLDEN_STOP_AT_MICRO_USD,
  approvalAllowed,
  buildGoldenItem,
  buildGoldenRecord,
  goldenRunRefusal,
  goldenShouldStop,
  mergeRerun,
  mergeVerdicts,
  parseGoldenOnly,
  recordHygieneProblems,
  redactForRecord,
  resolveGoldenMode,
} from './golden_run.mjs';

// Key-shaped and token-shaped strings are built from fragments so this file holds no literal secret.
const FAKE_KEY = ['sk', '-ant-', 'api03-', 'A'.repeat(30)].join('');
const FAKE_TOKEN = ['eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjMifQ', '.', 'c2lnbmF0dXJl'].join('');

const USAGE = { input: 100, output: 50, cacheWrite: 10, cacheRead: 5 };
const okResult = (text = 'A short reply.', extra = {}) => ({
  ran: true,
  ok: true,
  failureClass: null,
  stopReason: 'end_turn',
  latencyMs: 1200,
  usage: USAGE,
  costMicroUsd: 1500n,
  text,
  ...extra,
});

/** A record where every item ran, with a plain text reply (mechanical results are whatever the rules say). */
function fullRecord(textFor = () => 'The road bends. Nothing else of note.') {
  const results = {};
  for (const id of GOLDEN_IDS) results[id] = okResult(textFor(id));
  return buildGoldenRecord({
    model: 'test-model',
    window: { startedAt: '2026-10-05T10:00:00.000Z', endedAt: '2026-10-05T10:20:00.000Z' },
    results,
  });
}

describe('resolveGoldenMode', () => {
  it('treats unset or empty as dry and accepts the four modes', () => {
    expect(resolveGoldenMode(undefined)).toBe('dry');
    expect(resolveGoldenMode(null)).toBe('dry');
    expect(resolveGoldenMode('')).toBe('dry');
    for (const m of ['dry', 'check-key', 'run', 'rerun']) expect(resolveGoldenMode(m)).toBe(m);
    expect([...GOLDEN_MODES]).toEqual(['dry', 'check-key', 'run', 'rerun']);
  });

  it('throws on anything else, including case and whitespace variants', () => {
    for (const bad of ['A', 'RUN', 'Run', ' run', 'run ', 'paid', 'true', '1', 'dry-run', 'check_key']) {
      expect(() => resolveGoldenMode(bad), JSON.stringify(bad)).toThrow(/GOLDEN_LIVE_RUN/);
    }
  });
});

describe('parseGoldenOnly', () => {
  it('trims, de-duplicates and returns ids in golden-set order whatever order they were typed in', () => {
    expect(parseGoldenOnly(' adv-1 , npc-01,npc-01 ,cmb-02')).toEqual(['npc-01', 'cmb-02', 'adv-1']);
    expect(parseGoldenOnly(GOLDEN_IDS.slice().reverse().join(','))).toEqual([...GOLDEN_IDS]);
  });

  it('rejects unknown ids and empty lists', () => {
    expect(() => parseGoldenOnly('npc-01,npc-99')).toThrow(/unknown golden item id/);
    expect(() => parseGoldenOnly('NPC-01')).toThrow(/unknown golden item id/);
    for (const empty of [undefined, null, '', '  ', ',', ' , ,']) {
      expect(() => parseGoldenOnly(empty), JSON.stringify(empty)).toThrow(/GOLDEN_ONLY/);
    }
  });
});

describe('goldenShouldStop', () => {
  it('has the $2.00 cap and a $1.80 stop line', () => {
    expect(GOLDEN_CAP_MICRO_USD).toBe(2_000_000n);
    expect(GOLDEN_STOP_AT_MICRO_USD).toBe(1_800_000n);
  });

  it('is false exactly at the stop line and true one micro-USD past it', () => {
    expect(goldenShouldStop(1_700_000, 100_000)).toBe(false);
    expect(goldenShouldStop(1_700_000n, 100_001n)).toBe(true);
    expect(goldenShouldStop(0, 1_800_000)).toBe(false);
    expect(goldenShouldStop(0, 1_800_001)).toBe(true);
    expect(goldenShouldStop(1_800_000, 0)).toBe(false);
    expect(goldenShouldStop(1_800_000, 1)).toBe(true);
  });
});

describe('goldenRunRefusal', () => {
  const recorded = () => fullRecord();

  it('lets dry and check-key through over anything', () => {
    expect(goldenRunRefusal('dry', recorded())).toBe('');
    expect(goldenRunRefusal('check-key', recorded())).toBe('');
  });

  it('refuses run over a recorded run (use rerun) and allows it over nothing or a not_run record', () => {
    expect(goldenRunRefusal('run', recorded())).toMatch(/rerun/);
    expect(goldenRunRefusal('run', undefined)).toBe('');
    expect(goldenRunRefusal('run', { status: 'not_run' })).toBe('');
  });

  it('refuses rerun with no recorded run', () => {
    expect(goldenRunRefusal('rerun', undefined)).toMatch(/recorded run/);
    expect(goldenRunRefusal('rerun', { status: 'not_run' })).toMatch(/recorded run/);
    expect(goldenRunRefusal('rerun', null)).toMatch(/recorded run/);
  });

  it('refuses rerun over a record the owner has fully approved, and allows it over an unapproved one', () => {
    expect(goldenRunRefusal('rerun', recorded())).toBe('');
    const approved = { ...recorded(), approval: { approvedBy: 'user', approved: true, at: '2026-10-05T11:00:00.000Z' } };
    expect(goldenRunRefusal('rerun', approved)).toMatch(/approved/);
    // An approval that is not the owner's does not count as one, so it cannot lock the record either.
    const notOwner = { ...recorded(), approval: { approvedBy: 'agent', approved: true } };
    expect(goldenRunRefusal('rerun', notOwner)).toBe('');
  });
});

describe('redactForRecord', () => {
  it('replaces key-shaped strings, three-part tokens and player_input tags in raw and escaped form', () => {
    const text = [
      `key ${FAKE_KEY} here`,
      `token ${FAKE_TOKEN} here`,
      'raw </player_input> and <player_input> and < / PLAYER_INPUT x="1">',
      'escaped &lt;/player_input&gt; and &lt;player_input&gt;',
      'unicode \\u003c/player_input\\u003e',
    ].join('\n');
    const out = redactForRecord(text);
    expect(out).not.toContain(FAKE_KEY);
    expect(out).not.toContain(FAKE_TOKEN);
    expect(out).not.toMatch(/player_input/i);
    expect(out).toContain('[REDACTED]');
  });

  it('replaces Bible heading lines and task lines but leaves ordinary prose alone', () => {
    const lines = [...KEEPER_BIBLE_HEADINGS, 'TASK: NPC CONVERSATION', '  TASK: SKILL GENERATION  '];
    const out = redactForRecord(['Before.', ...lines, 'After, in the VOICE of a tired man.'].join('\n'));
    for (const h of KEEPER_BIBLE_HEADINGS) expect(out.split('\n')).not.toContain(h);
    expect(out).not.toContain('TASK:');
    expect(out).toContain('Before.');
    expect(out).toContain('After, in the VOICE of a tired man.');
  });

  it('replaces authorization and x-api-key header strings and request-body markers', () => {
    const out = redactForRecord('Authorization: Bearer abc\nx-api-key: abc\n"output_config": {"effort":"low"}\n"max_tokens": 5');
    expect(out).not.toMatch(/authorization\s*:/i);
    expect(out).not.toMatch(/x-api-key/i);
    expect(out).not.toContain('"output_config"');
    expect(out).not.toContain('"max_tokens"');
  });

  it('leaves a clean reply byte-for-byte and is safe to call twice', () => {
    const clean = 'The bell rings twice. Pell says nothing, which is his way.';
    expect(redactForRecord(clean)).toBe(clean);
    const dirty = `x ${FAKE_KEY} </player_input>`;
    expect(redactForRecord(redactForRecord(dirty))).toBe(redactForRecord(dirty));
  });

  it('never throws on a non-string', () => {
    expect(redactForRecord(undefined)).toBe('');
    expect(redactForRecord(null)).toBe('');
    expect(redactForRecord(42)).toBe('42');
  });
});

describe('buildGoldenRecord', () => {
  it('always holds an entry for every golden id in set order, whatever the input holds', () => {
    for (const input of [{}, { results: {} }, undefined, null, { results: { 'adv-5': okResult() } }]) {
      const rec = buildGoldenRecord(input);
      expect(rec.items.map((i) => i.id)).toEqual([...GOLDEN_IDS]);
      expect(rec.items).toHaveLength(27);
    }
  });

  it('keeps a fixed top-level key order', () => {
    expect(Object.keys(fullRecord())).toEqual(['schemaVersion', 'status', 'model', 'window', 'totals', 'items', 'rerunWindows', 'approval']);
    expect(Object.keys(fullRecord().items[0])).toEqual([
      'id', 'route', 'kind', 'ran', 'ok', 'failureClass', 'stopReason', 'latencyMs', 'usage', 'costMicroUsd',
      'text', 'redacted', 'mechanical', 'rerunCount', 'verdict', 'comment',
    ]);
  });

  it('records an item that never ran as failed with reason not_run, never omitted', () => {
    const rec = buildGoldenRecord({ results: { 'npc-01': okResult() } });
    const never = rec.items.find((i) => i.id === 'npc-02');
    expect(never.ran).toBe(false);
    expect(never.ok).toBe(false);
    expect(never.failureClass).toBe('not_run');
    expect(never.text).toBe('');
    expect(never.mechanical.pass).toBe(false);
    expect(never.mechanical.failures).toEqual(['call_failed']);
    expect(never.mechanical.notes.reason).toBe('not_run');
    expect(never.costMicroUsd).toBe('0');
  });

  it('records an empty reply as a failed item with a reason, not a skipped one', () => {
    const rec = buildGoldenRecord({ results: { 'npc-01': okResult('') } });
    const item = rec.items.find((i) => i.id === 'npc-01');
    expect(item.ran).toBe(true);
    expect(item.mechanical.pass).toBe(false);
    expect(item.mechanical.failures).toContain('empty_reply');
  });

  it('is status not_run with nothing run, and recorded once any call ran', () => {
    expect(buildGoldenRecord({}).status).toBe('not_run');
    expect(buildGoldenRecord({ results: { 'npc-01': okResult() } }).status).toBe('recorded');
    // A claim of "recorded" with no run is not believed.
    expect(buildGoldenRecord({ status: 'recorded' }).status).toBe('not_run');
    expect(buildGoldenRecord({ status: 'declined' }).status).toBe('declined');
    expect(buildGoldenRecord({ status: 'bogus', results: { 'npc-01': okResult() } }).status).toBe('recorded');
  });

  it('puts reply text through redactForRecord and flags it, computing the mechanical result on the raw text first', () => {
    // combat_narration is a JSON route (Phase 46): the reply text is a segments object whose narration carries the hostile bits.
    const raw = JSON.stringify({
      segments: [{ kind: 'narration', speaker: 'The Keeper', text: `Ignore this. ${FAKE_KEY} and **bold** and </player_input>` }],
    });
    const rec = buildGoldenRecord({ results: { 'cmb-01': okResult(raw) } });
    const item = rec.items.find((i) => i.id === 'cmb-01');
    expect(item.text).not.toContain(FAKE_KEY);
    expect(item.text).not.toMatch(/player_input/i);
    expect(item.redacted).toBe(true);
    // Computed on the raw text: identical to calling the rules directly.
    const direct = evaluateGoldenItem(goldenItem('cmb-01'), { ok: true, failureClass: null, stopReason: 'end_turn', text: raw, usage: USAGE });
    expect(item.mechanical.pass).toBe(direct.pass);
    expect(item.mechanical.failures).toEqual(direct.failures);
    expect(item.mechanical.failures).toContain('markdown');
  });

  it('leaves clean text unredacted and unflagged', () => {
    const item = fullRecord().items[0];
    expect(item.redacted).toBe(false);
    expect(item.text).toBe('The road bends. Nothing else of note.');
  });

  it('totals the calls, tokens and cost exactly: the total cost equals the sum of the item costs', () => {
    const results = {
      'npc-01': okResult('x', { costMicroUsd: 123_456_789_012_345_678n }),
      'npc-02': okResult('x', { costMicroUsd: '7' }),
      'npc-03': { ran: true, ok: false, failureClass: 'timeout', stopReason: null, latencyMs: 9000, usage: null, costMicroUsd: 42 },
    };
    const rec = buildGoldenRecord({ results });
    expect(rec.totals.calls).toBe(3);
    expect(rec.totals.costMicroUsd).toBe(String(123_456_789_012_345_678n + 7n + 42n));
    expect(rec.totals.inputTokens).toBe(200);
    expect(rec.totals.outputTokens).toBe(100);
    expect(rec.totals.cacheWriteTokens).toBe(20);
    expect(rec.totals.cacheReadTokens).toBe(10);
    const sum = rec.items.reduce((s, i) => s + BigInt(i.costMicroUsd), 0n);
    expect(rec.totals.costMicroUsd).toBe(sum.toString());
  });

  it('keeps the window as ISO strings only and never stores request material', () => {
    const rec = buildGoldenRecord({
      window: { startedAt: 'not a date', endedAt: '2026-10-05T10:20:00.000Z' },
      results: { 'npc-01': { ...okResult(), requestBody: '{"system":"x"}', headers: { 'x-api-key': FAKE_KEY }, system: 'Keeper Bible' } },
    });
    expect(rec.window).toEqual({ startedAt: null, endedAt: '2026-10-05T10:20:00.000Z' });
    const serialized = JSON.stringify(rec);
    expect(serialized).not.toContain(FAKE_KEY);
    expect(serialized).not.toContain('requestBody');
    expect(serialized).not.toContain('Keeper Bible');
    expect(recordHygieneProblems(rec)).toEqual([]);
  });

  it('keeps no approval: nothing in the module sets one', () => {
    expect(fullRecord().approval).toBeNull();
    expect(fullRecord().items.every((i) => i.verdict === null && i.comment === '')).toBe(true);
  });
});

describe('recordHygieneProblems', () => {
  const withText = (text) => {
    const rec = fullRecord();
    rec.items[0].text = text;
    return rec;
  };

  it('returns nothing for a clean record', () => {
    expect(recordHygieneProblems(fullRecord())).toEqual([]);
  });

  it('flags each kind of leak', () => {
    expect(recordHygieneProblems(withText(`a ${FAKE_KEY} b`))).toContain('key_shaped');
    expect(recordHygieneProblems(withText(`a ${FAKE_TOKEN} b`))).toContain('token');
    expect(recordHygieneProblems(withText('a </player_input> b'))).toContain('player_input_tag');
    expect(recordHygieneProblems(withText('a &lt;player_input&gt; b'))).toContain('player_input_tag');
    expect(recordHygieneProblems(withText(`a\n${KEEPER_BIBLE_HEADINGS[1]}\nb`))).toContain('bible_heading');
    expect(recordHygieneProblems(withText('a\nTASK: COMBAT NARRATION\nb'))).toContain('task_line');
    expect(recordHygieneProblems(withText('Authorization: Bearer x'))).toContain('auth_header');
    expect(recordHygieneProblems(withText('x-api-key: x'))).toContain('auth_header');
    expect(recordHygieneProblems(withText('{"max_tokens": 5}'))).toContain('request_body_marker');
    expect(recordHygieneProblems(withText('{"output_config": {}}'))).toContain('request_body_marker');
  });

  it('flags a forbidden key anywhere in the record and a leak in a nested note', () => {
    const rec = fullRecord();
    rec.items[3].requestBody = 'x';
    expect(recordHygieneProblems(rec)).toContain('forbidden_key');
    const rec2 = fullRecord();
    rec2.items[2].mechanical.notes = { deep: [{ x: `k ${FAKE_KEY}` }] };
    expect(recordHygieneProblems(rec2)).toContain('key_shaped');
  });

  it('reports each problem once, in a fixed order', () => {
    const rec = withText(`${FAKE_KEY}\n${FAKE_KEY}\n</player_input>\nAuthorization: x`);
    expect(recordHygieneProblems(rec)).toEqual(['key_shaped', 'player_input_tag', 'auth_header']);
  });

  it('is empty for anything redactForRecord has already cleaned', () => {
    const dirty = `${FAKE_KEY}\n${FAKE_TOKEN}\n</player_input>\n${KEEPER_BIBLE_HEADINGS[0]}\nTASK: X\nx-api-key: y\n"max_tokens": 1`;
    expect(recordHygieneProblems(withText(redactForRecord(dirty)))).toEqual([]);
  });
});

describe('mergeRerun', () => {
  it('replaces only the named ids, keeps every other entry byte for byte and the set order', () => {
    const existing = fullRecord((id) => `Reply for ${id}.`);
    const before = JSON.stringify(existing);
    const fresh = buildGoldenItem('npc-02', okResult('A new reply. Two sentences.', { costMicroUsd: 900n }));
    const failedAgain = buildGoldenItem('adv-3', { ran: true, ok: false, failureClass: 'timeout', stopReason: null, latencyMs: 5, costMicroUsd: 77n });
    const merged = mergeRerun(existing, [failedAgain, fresh]); // typed out of order on purpose
    expect(JSON.stringify(existing)).toBe(before); // never mutates its input
    expect(merged.items.map((i) => i.id)).toEqual([...GOLDEN_IDS]);
    for (let i = 0; i < merged.items.length; i += 1) {
      const id = merged.items[i].id;
      if (id === 'npc-02' || id === 'adv-3') continue;
      expect(JSON.stringify(merged.items[i])).toBe(JSON.stringify(existing.items[i]));
    }
    const m2 = merged.items.find((i) => i.id === 'npc-02');
    expect(m2.text).toBe('A new reply. Two sentences.');
    expect(m2.rerunCount).toBe(1);
    expect(m2.verdict).toBeNull();
    const m3 = merged.items.find((i) => i.id === 'adv-3');
    expect(m3.ok).toBe(false);
    expect(m3.failureClass).toBe('timeout');
  });

  it('accumulates the totals and keeps the cost sum exact, adding the earlier charge to the item', () => {
    const existing = fullRecord();
    const fresh = buildGoldenItem('npc-02', okResult('A new reply. Two sentences.', { costMicroUsd: 900n }));
    const merged = mergeRerun(existing, [fresh]);
    expect(merged.totals.calls).toBe(existing.totals.calls + 1);
    expect(merged.totals.costMicroUsd).toBe(String(BigInt(existing.totals.costMicroUsd) + 900n));
    expect(merged.totals.inputTokens).toBe(existing.totals.inputTokens + 100);
    expect(merged.totals.outputTokens).toBe(existing.totals.outputTokens + 50);
    expect(merged.items.find((i) => i.id === 'npc-02').costMicroUsd).toBe(String(1500n + 900n));
    const sum = merged.items.reduce((s, i) => s + BigInt(i.costMicroUsd), 0n);
    expect(merged.totals.costMicroUsd).toBe(sum.toString());
  });

  it('records the rerun window and refuses unknown or missing items', () => {
    const existing = fullRecord();
    const fresh = buildGoldenItem('npc-02', okResult('x. y.'));
    const merged = mergeRerun(existing, [fresh], { window: { startedAt: '2026-10-06T10:00:00.000Z', endedAt: '2026-10-06T10:05:00.000Z' } });
    expect(merged.rerunWindows).toEqual([{ startedAt: '2026-10-06T10:00:00.000Z', endedAt: '2026-10-06T10:05:00.000Z' }]);
    expect(merged.window).toEqual(existing.window);
    expect(() => mergeRerun(existing, [{ ...fresh, id: 'npc-99' }])).toThrow(/unknown golden item id/);
    expect(() => mergeRerun(undefined, [fresh])).toThrow(/recorded run/);
  });
});

describe('mergeVerdicts', () => {
  it('writes only valid verdicts for known ids, treats the input as untrusted data', () => {
    const rec = fullRecord();
    const merged = mergeVerdicts(rec, {
      'npc-01': { verdict: 'pass', comment: 'Good.' },
      'npc-02': { verdict: 'fail', comment: 'Flat.' },
      'npc-03': { verdict: 'maybe', comment: 'x' },
      'npc-99': { verdict: 'pass', comment: 'x' },
      'npc-04': 'pass',
      'adv-1': { verdict: 'pass', comment: 42 },
    });
    const by = (id) => merged.items.find((i) => i.id === id);
    expect(by('npc-01')).toMatchObject({ verdict: 'pass', comment: 'Good.' });
    expect(by('npc-02')).toMatchObject({ verdict: 'fail', comment: 'Flat.' });
    expect(by('npc-03').verdict).toBeNull();
    expect(by('npc-04').verdict).toBeNull();
    expect(by('adv-1')).toMatchObject({ verdict: 'pass', comment: '' });
    expect(merged.items).toHaveLength(27);
    expect(rec.items[0].verdict).toBeNull(); // input untouched
  });

  it('redacts and caps the comment, and never sets an approval', () => {
    const merged = mergeVerdicts(fullRecord(), { 'npc-01': { verdict: 'pass', comment: `${FAKE_KEY} ${'x'.repeat(5000)}` } });
    const c = merged.items[0].comment;
    expect(c).not.toContain(FAKE_KEY);
    expect(c.length).toBeLessThanOrEqual(2000);
    expect(merged.approval).toBeNull();
    expect(recordHygieneProblems(merged)).toEqual([]);
  });
});

describe('approvalAllowed', () => {
  const allPass = () => Object.fromEntries(GOLDEN_IDS.map((id) => [id, { verdict: 'pass', comment: '' }]));
  const owner = { approved: true, approvedBy: 'user' };
  /** A record whose every item passes the mechanical rules is hard to hand-build; mark them instead. */
  const cleanRecord = () => {
    const rec = fullRecord();
    for (const item of rec.items) item.mechanical = { pass: true, failures: [], notes: {} };
    return rec;
  };

  it('is true only when every condition holds', () => {
    const r = approvalAllowed({ record: cleanRecord(), verdicts: allPass(), overall: owner });
    expect(r).toEqual({ allowed: true, reasons: [] });
  });

  it('is false for an empty set, with a reason', () => {
    const r = approvalAllowed({ record: { items: [] }, verdicts: allPass(), overall: owner });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('empty_set');
    expect(approvalAllowed({ record: undefined, verdicts: allPass(), overall: owner }).allowed).toBe(false);
    expect(approvalAllowed({}).allowed).toBe(false);
  });

  it('is false for zero completed items even with every verdict and the owner approve', () => {
    const rec = buildGoldenRecord({}); // nothing ran
    const r = approvalAllowed({ record: rec, verdicts: Object.fromEntries(GOLDEN_IDS.map((id) => [id, { verdict: 'fail', comment: 'not run' }])), overall: owner });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('no_completed_items');
  });

  it('is false for any item missing a verdict, naming it', () => {
    const v = allPass();
    delete v['wld-03'];
    const r = approvalAllowed({ record: cleanRecord(), verdicts: v, overall: owner });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('missing_verdict:wld-03');
    const v2 = allPass();
    v2['wld-03'] = { verdict: 'perhaps', comment: '' };
    expect(approvalAllowed({ record: cleanRecord(), verdicts: v2, overall: owner }).reasons).toContain('missing_verdict:wld-03');
  });

  it('is false for a pass over a mechanical failure without a non-empty comment, true with a waiver', () => {
    const rec = cleanRecord();
    rec.items.find((i) => i.id === 'cmb-01').mechanical = { pass: false, failures: ['markdown'], notes: {} };
    const noWaiver = approvalAllowed({ record: rec, verdicts: allPass(), overall: owner });
    expect(noWaiver.allowed).toBe(false);
    expect(noWaiver.reasons).toContain('waiver_comment_needed:cmb-01');
    const blank = allPass();
    blank['cmb-01'] = { verdict: 'pass', comment: '   ' };
    expect(approvalAllowed({ record: rec, verdicts: blank, overall: owner }).allowed).toBe(false);
    const waived = allPass();
    waived['cmb-01'] = { verdict: 'pass', comment: 'The markdown is the narrator quoting a sign; fine.' };
    expect(approvalAllowed({ record: rec, verdicts: waived, overall: owner }).allowed).toBe(true);
    // A fail verdict over a mechanical failure needs no waiver.
    const failV = allPass();
    failV['cmb-01'] = { verdict: 'fail', comment: '' };
    expect(approvalAllowed({ record: rec, verdicts: failV, overall: owner }).allowed).toBe(true);
  });

  it('is false for an overall approve that is not the owner own', () => {
    for (const overall of [undefined, null, {}, { approved: true }, { approved: true, approvedBy: 'agent' }, { approved: true, approvedBy: 'User' }, { approved: false, approvedBy: 'user' }, { approved: 'true', approvedBy: 'user' }]) {
      const r = approvalAllowed({ record: cleanRecord(), verdicts: allPass(), overall });
      expect(r.allowed, JSON.stringify(overall)).toBe(false);
      expect(r.reasons).toContain('overall_not_owner_approve');
    }
  });

  it('collects every reason at once, and falls back to the verdicts stored on the record', () => {
    const r = approvalAllowed({ record: buildGoldenRecord({}), verdicts: {}, overall: null });
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain('no_completed_items');
    expect(r.reasons).toContain('overall_not_owner_approve');
    expect(r.reasons.filter((x) => x.startsWith('missing_verdict:'))).toHaveLength(27);

    const merged = mergeVerdicts(cleanRecord(), allPass());
    expect(approvalAllowed({ record: merged, overall: owner }).allowed).toBe(true);
  });
});

describe('golden-set cross-check', () => {
  it('has the 27 ids the record is built around', () => {
    expect(GOLDEN_SET).toHaveLength(27);
  });
});

/**
 * The Phase 44 record was taken before the segment shape. Its npc and combat items are skipped on replay (their
 * shape changed in Phase 46), and the two rules added in Phase 46 are ignored for the rest.
 */
const shapeChanged = (id) => GOLDEN_SHAPE_CHANGED_ROUTES.includes(goldenItem(id).route);
const replayFailures = (stored) =>
  evaluateGoldenItem(goldenItem(stored.id), {
    ok: stored.ok,
    failureClass: stored.failureClass,
    stopReason: stored.stopReason,
    text: stored.text,
    usage: stored.usage,
  }).failures.filter((f) => !GOLDEN_RULES_ADDED_IN_46.includes(f));

describe('replay of the committed golden run (vacuous until a record exists)', () => {
  const file = path.join(REPO_ROOT, '.planning', 'milestones', 'v2.2-phases', '44-live-verification-and-tone-eval', '44-golden-run.json');
  const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;

  it('replays every item that ran through the rules with failures a subset of the stored ones, and the hygiene check is clean', () => {
    if (!record || record.status !== 'recorded') return; // vacuous
    expect(recordHygieneProblems(record)).toEqual([]);
    expect(record.items.map((i) => i.id)).toEqual([...GOLDEN_IDS]);
    for (const stored of record.items) {
      if (!stored.ran || shapeChanged(stored.id)) continue;
      const failures = replayFailures(stored);
      for (const f of failures) expect(stored.mechanical.failures, `${stored.id} ${f}`).toContain(f);
      if (!stored.redacted) expect(failures, stored.id).toEqual(stored.mechanical.failures);
    }
  });
});

describe('pinned golden record', () => {
  const dir = path.join(REPO_ROOT, '.planning', 'milestones', 'v2.2-phases', '44-live-verification-and-tone-eval');
  const file = path.join(dir, '44-golden-run.json');
  const pagePath = path.join(dir, '44-golden-review.html');
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));

  it('has a recorded, declined or deferred status', () => {
    expect(['recorded', 'declined', 'deferred']).toContain(record.status);
  });

  it('holds exactly the 27 golden ids in set order, each with a reason when it did not run or failed', () => {
    expect(record.items.map((i) => i.id)).toEqual([...GOLDEN_IDS]);
    for (const item of record.items) {
      if (!item.ran) expect(typeof item.failureClass, item.id).toBe('string');
      if (item.ran && item.ok === false) expect(item.failureClass ?? item.stopReason, item.id).toBeTruthy();
      if (item.mechanical && item.mechanical.pass === false) expect(item.mechanical.failures.length, item.id).toBeGreaterThan(0);
    }
  });

  it('records the window and keeps the total cost exactly equal to the sum of the item costs', () => {
    if (record.status === 'recorded') {
      expect(typeof record.window.startedAt).toBe('string');
      expect(typeof record.window.endedAt).toBe('string');
      expect(Number.isNaN(Date.parse(record.window.startedAt))).toBe(false);
      expect(Number.isNaN(Date.parse(record.window.endedAt))).toBe(false);
    }
    const sum = record.items.reduce((acc, i) => acc + BigInt(i.costMicroUsd), 0n);
    expect(BigInt(record.totals.costMicroUsd)).toBe(sum);
    expect(BigInt(record.totals.costMicroUsd) <= GOLDEN_STOP_AT_MICRO_USD).toBe(true);
    expect(record.totals.calls).toBe(record.items.filter((i) => i.ran).length);
  });

  it('is hygiene-clean and carries no approval', () => {
    expect(recordHygieneProblems(record)).toEqual([]);
    expect(record.approval).toBeNull();
  });

  it('has a review page with no key-shaped string and exactly two script elements (recorded run)', () => {
    if (record.status !== 'recorded') return;
    expect(fs.existsSync(pagePath)).toBe(true);
    const page = fs.readFileSync(pagePath, 'utf8');
    expect(page).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/);
    expect(page).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
    expect(page.match(/<script\b/gi) ?? []).toHaveLength(2);
  });

  it('replays every item that ran within its stored mechanical result, non-vacuously', () => {
    if (record.status !== 'recorded') return;
    let replayed = 0;
    for (const stored of record.items) {
      if (!stored.ran || shapeChanged(stored.id)) continue;
      replayed += 1;
      for (const f of replayFailures(stored)) expect(stored.mechanical.failures, `${stored.id} ${f}`).toContain(f);
    }
    expect(replayed).toBe(record.items.filter((i) => i.ran && !shapeChanged(i.id)).length);
    expect(replayed).toBeGreaterThan(0);
  });
});

describe('pinned golden verdicts', () => {
  const dir = path.join(REPO_ROOT, '.planning', 'milestones', 'v2.2-phases', '44-live-verification-and-tone-eval');
  const verdictsFile = path.join(dir, '44-golden-verdicts.json');
  const run = JSON.parse(fs.readFileSync(path.join(dir, '44-golden-run.json'), 'utf8'));
  const text = fs.readFileSync(verdictsFile, 'utf8');
  const rec = JSON.parse(text);

  /** The record's verdicts in the shape the page hands back (id to { verdict, comment }). */
  const verdictsOf = () => Object.fromEntries(rec.items.map((i) => [i.id, { verdict: i.verdict, comment: i.comment }]));

  it('has a status in approved, needs_fixes, incomplete or deferred, with item ids in golden set order', () => {
    expect(['approved', 'needs_fixes', 'incomplete', 'deferred']).toContain(rec.status);
    const ids = rec.items.map((i) => i.id);
    const inSetOrder = GOLDEN_IDS.filter((id) => ids.includes(id));
    expect(ids).toEqual(inSetOrder);
    // the sign-off covers the whole set whenever a golden run exists
    if (run.status === 'recorded') expect(ids).toEqual([...GOLDEN_IDS]);
  });

  it('holds only pass, fail or no verdict, and keeps the mechanical failures of the run record', () => {
    for (const item of rec.items) {
      expect(['pass', 'fail', null], item.id).toContain(item.verdict);
      const stored = run.items.find((x) => x.id === item.id);
      expect(item.route, item.id).toBe(stored.route);
      expect(item.mechanicalFailures, item.id).toEqual(stored.mechanical.failures);
    }
  });

  it('records approved only when approvalAllowed says every condition holds and the overall approve is the owner own', () => {
    // The status is derived by code: the owner approval and approvalAllowed decide it, never a hand-typed status.
    const merged = mergeVerdicts(run, verdictsOf());
    const overall = rec.overall?.approved === true && rec.overall?.approvedBy === 'user' ? { approved: true, approvedBy: 'user' } : { approved: false };
    const { allowed, reasons } = approvalAllowed({ record: merged, verdicts: verdictsOf(), overall });
    if (rec.status === 'approved') {
      expect(allowed, reasons.join(',')).toBe(true);
      expect(rec.items).toHaveLength(27);
      expect(rec.items.every((i) => i.verdict === 'pass')).toBe(true);
      expect(rec.overall).toMatchObject({ approved: true, approvedBy: 'user' });
      expect(rec.items.some((i) => i.verdict === 'pass' && run.items.find((x) => x.id === i.id).ran)).toBe(true);
      for (const id of rec.waivers) expect(rec.items.find((i) => i.id === id).comment.trim(), id).not.toBe('');
      expect(rec.failedIds).toEqual([]);
    } else {
      expect(allowed).toBe(false);
      expect(rec.overall?.approvedBy ?? null).not.toBe('user');
      expect(rec.overall?.approved).not.toBe(true);
    }
    expect(rec.reasons).toEqual(approvalAllowed({ record: merged, verdicts: verdictsOf(), overall }).reasons);
  });

  it('lists the failing ids in set order for needs_fixes, each with a fail verdict, and never approves incomplete or deferred', () => {
    const failing = rec.items.filter((i) => i.verdict === 'fail').map((i) => i.id);
    if (rec.status === 'needs_fixes') {
      expect(rec.failedIds.length).toBeGreaterThan(0);
      expect(rec.failedIds).toEqual(failing);
      for (const id of rec.failedIds) expect(rec.items.find((i) => i.id === id).verdict, id).toBe('fail');
    }
    if (rec.status === 'incomplete' || rec.status === 'deferred') {
      expect(rec.overall?.approved).not.toBe(true);
    }
    // an item the owner left unrated is never counted as a pass
    for (const item of rec.items) if (item.verdict === null) expect(rec.failedIds).not.toContain(item.id);
    // a pass over a mechanical failure is a waiver and needs a comment
    for (const item of rec.items) {
      if (item.verdict === 'pass' && item.mechanicalFailures.length > 0) {
        expect(item.comment.trim(), item.id).not.toBe('');
        expect(rec.waivers).toContain(item.id);
      }
    }
  });

  it('holds no key-shaped string, no token and no player_input tag, and every comment is a bounded string', () => {
    expect(recordHygieneProblems(rec)).toEqual([]);
    expect(text).not.toMatch(/sk-ant-[A-Za-z0-9_-]{8,}/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/);
    expect(text).not.toMatch(/player_input/i);
    for (const item of rec.items) {
      expect(typeof item.comment, item.id).toBe('string');
      expect(item.comment.length, item.id).toBeLessThanOrEqual(2000);
    }
    for (const w of rec.overall?.ownerWords ?? []) {
      expect(typeof w).toBe('string');
      expect(w.length).toBeLessThanOrEqual(2000);
    }
  });
});

// ---------------------------------------------------------------------------
// Static guards on the harness source (T-44-04-02, T-44-04-03)
// ---------------------------------------------------------------------------

describe('golden harness source', () => {
  // Normalise line endings: a Windows checkout may hold CRLF, and bodyOf looks for a closing brace at column 0.
  const harness = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'llm', 'golden.live.ts'), 'utf8').split(String.fromCharCode(13)).join('');

  /** The text of one top-level function, from its declaration to the closing brace at column 0. */
  const bodyOf = (name) => {
    const start = harness.search(new RegExp(`^(async )?function ${name}\\b`, 'm'));
    expect(start, `function ${name} exists`).toBeGreaterThanOrEqual(0);
    const rest = harness.slice(start);
    const end = rest.search(/\n}\n/);
    return rest.slice(0, end + 3);
  };

  it('writes the Phase 46 record and review page and never names the Phase 44 record file', () => {
    expect(harness).toContain('46-structured-keeper-replies');
    expect(harness).toContain('46-golden-run.json');
    expect(harness).toContain('46-golden-review.html');
    expect(harness).not.toContain('44-golden-run.json');
    expect(harness).not.toContain('44-golden-review.html');
    expect(harness).not.toContain('44-live-verification-and-tone-eval');
  });

  it('selects the mode through resolveGoldenMode at import time', () => {
    expect(harness).toContain('resolveGoldenMode(');
    expect(harness).toMatch(/const MODE = resolveGoldenMode\(process\.env\.GOLDEN_LIVE_RUN\)/);
  });

  it('the dry body never loads the key and stubs fetch', () => {
    const dry = bodyOf('runDry');
    expect(dry).not.toContain('loadAnthropicKey');
    expect(dry).toContain('globalThis.fetch =');
    expect(dry).toContain('network is disabled');
  });

  it('only the check-key and paid bodies load the key', () => {
    expect(bodyOf('runCheckKey')).toContain('loadAnthropicKey(');
    expect(bodyOf('runPaid')).toContain('loadAnthropicKey(');
    expect(bodyOf('runPaid').indexOf('goldenRunRefusal(')).toBeLessThan(bodyOf('runPaid').indexOf('loadAnthropicKey('));
    const outside = harness
      .replace(bodyOf('runCheckKey'), '')
      .replace(bodyOf('runPaid'), '')
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith('//'))
      .join(' ');
    expect(outside.match(/loadAnthropicKey\(/g) ?? []).toHaveLength(0);
  });

  it('makes at most one direct console call (the scrubbing say helper)', () => {
    const direct = harness.split(/\r?\n/).filter((l) => /\bconsole\.(log|info|warn|error)\s*\(/.test(l));
    expect(direct.length).toBeLessThanOrEqual(1);
  });

  it('never names the hosted target and never reads an env file itself', () => {
    expect(harness.toLowerCase()).not.toContain('maincloud');
    expect(harness).not.toMatch(/\.env(?!\.GOLDEN_)/);
    expect(harness).not.toMatch(/ANTHROPIC_API_KEY/);
    expect(harness).not.toMatch(/process\.env\.(?!GOLDEN_LIVE_RUN|GOLDEN_ONLY)/);
  });

  it('judges with evaluateGoldenItem and classifies with classifyClaudeResponse, like the executor', () => {
    expect(harness).toMatch(/import \{[^}]*\bevaluateGoldenItem\b[^}]*\} from '\.\/golden_rules\.mjs'/);
    expect(harness).toMatch(/import \{[^}]*\bclassifyClaudeResponse\b[^}]*\} from/);
    expect(harness).toContain('classifyClaudeResponse(');
    expect(harness).toContain('buildClaudeRequest(');
    expect(harness).toContain('buildRouteLayers(');
    expect(harness).toContain('goldenInputFor(');
    expect(harness).toContain('evaluateGoldenItem(');
  });

  it('uses the tuned route settings, not sweep overrides, and has no automatic retry', () => {
    expect(harness).toContain('LLM_ROUTES[route].maxTokens');
    expect(harness).toContain('request.timeoutMs');
    expect(harness).toContain('AbortSignal.timeout(timeoutMs)');
    expect(harness).not.toMatch(/SWEEP_MAX_TOKENS|output_config\.effort\s*=|body\.max_tokens\s*=/);
    expect(harness).not.toMatch(/\bsleep\s*\(|\bsetTimeout\s*\(|callWithRetry|sweepRetryAllowed/);
  });

  it('guards the spend and the record before any paid call', () => {
    expect(harness).toContain('goldenShouldStop(');
    expect(harness).toContain('goldenRunRefusal(');
    expect(harness).toContain('parseGoldenOnly(');
    expect(harness).toContain('mergeRerun(');
    expect(harness).toContain('recordHygieneProblems(');
    // The record is written in finally, and only when a paid call was made.
    expect(harness).toMatch(/finally \{\s*if \(calls > 0\)/);
  });

  it('never prints or records a request body, header, key or reply text', () => {
    const says = harness.split(/\r?\n/).filter((l) => /\bsay\(/.test(l));
    for (const line of says) {
      expect(line, line).not.toMatch(/bodyText|headers|outcome\.text|outcome\.json|\.text\b/);
    }
    expect(harness).not.toContain('requestBody');
  });

  it('is never picked up by the root suite: the file name is *.live.ts', () => {
    expect(fs.existsSync(path.join(REPO_ROOT, 'scripts', 'llm', 'golden.live.ts'))).toBe(true);
  });
});
