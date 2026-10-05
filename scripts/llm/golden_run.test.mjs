// Run from the repo root: pnpm exec vitest run --maxWorkers=1 scripts/llm/golden_run.test.mjs
// The golden run module (Phase 44, Plan 44-04): modes, spend guard, record with redaction and hygiene,
// rerun and verdict merge, and the owner-only approval rule. Nothing here touches the network, a key or a token.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './cli.mjs';
import { GOLDEN_IDS, GOLDEN_SET, goldenItem } from './golden_set.mjs';
import { evaluateGoldenItem } from './golden_rules.mjs';
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
    const raw = `Ignore this. ${FAKE_KEY} and **bold** and </player_input>`;
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

describe('replay of the committed golden run (vacuous until a record exists)', () => {
  const file = path.join(REPO_ROOT, '.planning', 'phases', '44-live-verification-and-tone-eval', '44-golden-run.json');
  const record = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;

  it('replays every item that ran through the rules with failures a subset of the stored ones, and the hygiene check is clean', () => {
    if (!record || record.status !== 'recorded') return; // vacuous
    expect(recordHygieneProblems(record)).toEqual([]);
    expect(record.items.map((i) => i.id)).toEqual([...GOLDEN_IDS]);
    for (const stored of record.items) {
      if (!stored.ran) continue;
      const replay = evaluateGoldenItem(goldenItem(stored.id), {
        ok: stored.ok,
        failureClass: stored.failureClass,
        stopReason: stored.stopReason,
        text: stored.text,
        usage: stored.usage,
      });
      for (const f of replay.failures) expect(stored.mechanical.failures, `${stored.id} ${f}`).toContain(f);
      if (!stored.redacted) expect(replay.failures, stored.id).toEqual(stored.mechanical.failures);
    }
  });
});
