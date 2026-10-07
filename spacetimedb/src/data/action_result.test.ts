import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  MAX_RESULT_LINES,
  RESULT_KINDS,
  RESULT_LINE_KINDS,
  decodeResultLines,
  encodeResultLines,
  isResultKind,
} from './action_result';
import type { ResultLine } from './action_result';

const line = (over: Partial<ResultLine> = {}): ResultLine => ({
  kind: 'used',
  templateId: 7n,
  name: 'Copper Ore',
  quantity: 3n,
  total: 12n,
  instanceId: null,
  ...over,
});

const raw = (entries: unknown[]): string => JSON.stringify(entries);
const entry = (over: Record<string, unknown> = {}) => ({
  kind: 'used',
  templateId: '7',
  name: 'Copper Ore',
  quantity: '3',
  total: '12',
  instanceId: '',
  ...over,
});

describe('constants', () => {
  it('lists the result kinds and the line kinds', () => {
    expect([...RESULT_KINDS]).toEqual(['craft', 'salvage', 'discover']);
    expect([...RESULT_LINE_KINDS]).toEqual(['used', 'received', 'bonus', 'scroll', 'recipe']);
    expect(MAX_RESULT_LINES).toBe(12);
  });

  it('isResultKind accepts exactly the three kinds', () => {
    for (const k of ['craft', 'salvage', 'discover']) expect(isResultKind(k)).toBe(true);
    for (const k of ['', 'Craft', 'used', 'constructor', '__proto__', null, undefined, 3, {}]) {
      expect(isResultKind(k)).toBe(false);
    }
  });
});

describe('encodeResultLines', () => {
  it('writes decimal strings and an empty string for a null instance id', () => {
    const json = encodeResultLines([line(), line({ kind: 'scroll', instanceId: 99n })]);
    expect(JSON.parse(json)).toEqual([
      entry(),
      entry({ kind: 'scroll', instanceId: '99' }),
    ]);
  });

  it('keeps only the first MAX_RESULT_LINES lines', () => {
    const many = Array.from({ length: 20 }, (_, i) => line({ templateId: BigInt(i) }));
    const parsed = JSON.parse(encodeResultLines(many)) as { templateId: string }[];
    expect(parsed).toHaveLength(12);
    expect(parsed[11].templateId).toBe('11');
  });

  it('round-trips a name with markup and quotes as a plain string', () => {
    const name = '<img src=x onerror=alert(1)> "quoted" \'single\'';
    const out = decodeResultLines(encodeResultLines([line({ name })]));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe(name);
  });

  it('never throws on bad input', () => {
    expect(() => encodeResultLines(null as unknown as ResultLine[])).not.toThrow();
    expect(encodeResultLines(null as unknown as ResultLine[])).toBe('[]');
    expect(() => encodeResultLines([null as unknown as ResultLine])).not.toThrow();
  });
});

describe('decodeResultLines', () => {
  it('gives [] for non-string input, empty text, null, an object and broken JSON', () => {
    for (const bad of [undefined, null, 5, {}, [], '', 'null', '{}', '[', 'not json', '"x"', '7']) {
      expect(decodeResultLines(bad as unknown as string)).toEqual([]);
    }
  });

  it('returns bigints', () => {
    expect(decodeResultLines(raw([entry({ kind: 'scroll', instanceId: '41' })]))).toEqual([
      line({ kind: 'scroll', instanceId: 41n }),
    ]);
  });

  it('drops an entry with an unknown kind, a non-string name or a bad number', () => {
    const entries = [
      entry({ kind: 'bogus' }),
      entry({ name: 5 }),
      entry({ name: null }),
      entry({ templateId: '-1' }),
      entry({ quantity: '1.5' }),
      entry({ total: 12 }),
      entry({ total: '' }),
      entry({ templateId: '1'.repeat(21) }),
      entry({ instanceId: 'x' }),
      entry({ instanceId: 5 }),
      null,
      'text',
      7,
      [],
      entry({ name: 'Kept' }),
    ];
    const out = decodeResultLines(raw(entries));
    expect(out.map((l) => l.name)).toEqual(['Kept']);
  });

  it('ignores extra properties and never lets __proto__ or constructor through', () => {
    const json =
      '[{"kind":"used","templateId":"7","name":"Copper Ore","quantity":"3","total":"12","instanceId":"",' +
      '"extra":"x","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}]';
    const out = decodeResultLines(json);
    expect(out).toEqual([line()]);
    expect(Object.keys(out[0]).sort()).toEqual(['instanceId', 'kind', 'name', 'quantity', 'templateId', 'total']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((out[0] as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('an entry with missing fields is dropped, not read from the prototype', () => {
    const out = decodeResultLines('[{"kind":"used","name":"A"},{"templateId":"1"},{"__proto__":{"kind":"used"}}]');
    expect(out).toEqual([]);
  });

  it('returns at most MAX_RESULT_LINES entries', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry({ templateId: String(i) }));
    const out = decodeResultLines(raw(entries));
    expect(out).toHaveLength(12);
    expect(out[0].templateId).toBe(0n);
  });

  it('decode(encode(x)) deep-equals x for lines of every kind, quantity 0n and a null instance', () => {
    const lines: ResultLine[] = [
      line({ kind: 'used' }),
      line({ kind: 'received', templateId: 50n, name: 'Rough Hide', quantity: 2n, total: 8n }),
      line({ kind: 'bonus', templateId: 61n, name: 'Iron Ward', quantity: 1n, total: 1n }),
      line({ kind: 'scroll', templateId: 90n, name: 'Recipe: Iron Sword', quantity: 1n, total: 1n, instanceId: 4096n }),
      line({ kind: 'recipe', templateId: 301n, name: 'Herbal Draught', quantity: 0n, total: 0n }),
      line({ quantity: 0n, total: 0n, instanceId: 0n }),
      line({ templateId: 18446744073709551615n, instanceId: 18446744073709551615n }),
    ];
    expect(decodeResultLines(encodeResultLines(lines))).toEqual(lines);
  });
});

describe('import pin', () => {
  it('action_result.ts has no import specifier at all', () => {
    const path = fileURLToPath(new URL('./action_result.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(/^\s*import\b/m.test(source)).toBe(false);
    expect([...source.matchAll(/from\s+'([^']+)'/g)]).toEqual([]);
  });
});
