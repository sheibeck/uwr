// Current-path Worker hop baseline (not a gate input).
// Measures client -> llm-proxy Worker -> stubbed provider response, against a local
// `wrangler dev` started with --var STUB_PROVIDER:1 (or, when the stub is not
// available, the zero-diff missing-fields 400 path). Only the Worker hop is timed; it
// is a lower bound of today's path, composed with the reducer and push legs elsewhere.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { percentile } from '../../spacetimedb/src/helpers/measurement.ts';
import { ResultsStore } from './results-store.ts';

const PROXY_URL = 'http://127.0.0.1:8787/api/llm';
const WARMUPS = 5;
const TIMED = 50;
const MODE: 'stub' | 'missing_fields_400' = process.env.HOP_MODE === 'missing_fields_400' ? 'missing_fields_400' : 'stub';

/** Tolerant .dev.vars parse: CRLF, optional export, spaces around =, surrounding quotes. */
function readProxySecret(): string {
  const file = path.resolve('llm-proxy/.dev.vars');
  const text = fs.readFileSync(file, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?PROXY_SECRET\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    return m[1].replace(/^["']/, '').replace(/["']$/, '');
  }
  throw new Error('PROXY_SECRET missing in llm-proxy/.dev.vars');
}

describe('current-path Worker hop', () => {
  it('times 50 sequential requests through the local Worker', async () => {
    const secret = readProxySecret();
    const body: Record<string, unknown> = {
      model: 'stub',
      userPrompt: 'u'.repeat(1500),
      maxTokens: 1024,
    };
    if (MODE === 'stub') body.systemPrompt = 's'.repeat(4000);

    async function once(): Promise<number> {
      const t0 = performance.now();
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
        body: JSON.stringify(body),
      });
      const json: any = await res.json();
      const ms = performance.now() - t0;
      if (MODE === 'stub') {
        expect(res.status).toBe(200);
        expect(json.ok).toBe(true);
        expect(json.text).toBe('{}');
      } else {
        expect(res.status).toBe(400);
      }
      return ms;
    }

    for (let i = 0; i < WARMUPS; i++) await once();
    const samplesMs: number[] = [];
    for (let i = 0; i < TIMED; i++) samplesMs.push(Math.round((await once()) * 1000) / 1000);
    expect(samplesMs).toHaveLength(TIMED);

    const store = new ResultsStore();
    if (store.get('schemaVersion') === undefined) store.set('schemaVersion', 1);
    store.set('hop', {
      mode: MODE,
      samplesMs,
      warmups: WARMUPS,
      notes:
        'Worker hop only (client -> local wrangler dev -> ' +
        (MODE === 'stub' ? 'stubbed provider response' : 'missing-fields 400 before any provider client') +
        '); a lower bound of today\'s path, to be composed with the reducer and push legs in the record. ' +
        '4000-char system prompt, 1500-char user prompt, sequential requests, ' + WARMUPS + ' warmups. Not a gate input.',
    });

    const p50 = percentile(samplesMs, 50);
    const p95 = percentile(samplesMs, 95);
    console.log('hop mode=' + MODE + ' p50=' + p50.toFixed(2) + 'ms p95=' + p95.toFixed(2) + 'ms n=' + samplesMs.length);
  });
});
