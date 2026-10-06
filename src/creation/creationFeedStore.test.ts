import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEED_LINE_CAP } from '../console/feedStore';
import { createCreationFeedStore } from './creationFeedStore';
import type { EventCreationLike } from './creationFeedStore';
import { creationLines } from './creationLines';

function row(id: number, extra: Partial<EventCreationLike> & { micros?: number } = {}): EventCreationLike {
  const { micros, ...rest } = extra;
  return {
    id: BigInt(id),
    kind: 'creation',
    message: `m${id}`,
    createdAt: { microsSinceUnixEpoch: BigInt(micros ?? id) },
    ...rest,
  };
}

const seg = (text: string) => ({ kind: 'narration', speaker: 'The Keeper', text });

function keys(store: ReturnType<typeof createCreationFeedStore>): string[] {
  return store.entries.value.map(e => e.key);
}

describe('createCreationFeedStore: ingest', () => {
  it('adds one server entry with its fields', () => {
    const store = createCreationFeedStore();
    store.ingest(row(7, { kind: 'creation_warning', message: 'careful', micros: 99, segments: [seg('a'), seg('b')] }));
    expect(store.entries.value).toHaveLength(1);
    const entry = store.entries.value[0];
    expect(entry.key).toBe('creation:7');
    expect(entry.origin).toBe('server');
    expect(entry.id).toBe(7n);
    expect(entry.kind).toBe('creation_warning');
    expect(entry.message).toBe('careful');
    expect(entry.segments).toHaveLength(2);
    expect(entry.createdAtMicros).toBe(99n);
    expect(entry.lineCount).toBe(2);
  });

  it('keeps segments null when absent, and counts one line', () => {
    const store = createCreationFeedStore();
    store.ingest(row(1));
    store.ingest(row(2, { segments: null }));
    store.ingest(row(3, { segments: [] }));
    const entries = store.entries.value;
    expect(entries.map(e => e.segments === null || e.segments.length === 0)).toEqual([true, true, true]);
    expect(entries[0].segments).toBeNull();
    expect(entries.map(e => e.lineCount)).toEqual([1, 1, 1]);
  });

  it('ignores the same id ingested twice', () => {
    const store = createCreationFeedStore();
    store.ingest(row(1));
    store.ingest(row(1, { message: 'changed' }));
    expect(keys(store)).toEqual(['creation:1']);
    expect(store.entries.value[0].message).toBe('m1');
  });

  it('is synchronous', () => {
    const store = createCreationFeedStore();
    store.ingest(row(1));
    expect(store.entries.value).toHaveLength(1);
  });
});

describe('createCreationFeedStore: ordering', () => {
  it('places out-of-order rows by (createdAtMicros, id) among trailing server entries', () => {
    const store = createCreationFeedStore();
    store.ingest(row(3, { micros: 30 }));
    store.ingest(row(1, { micros: 10 }));
    store.ingest(row(2, { micros: 20 }));
    expect(keys(store)).toEqual(['creation:1', 'creation:2', 'creation:3']);
  });

  it('breaks createdAt ties by id', () => {
    const store = createCreationFeedStore();
    store.ingest(row(5, { micros: 10 }));
    store.ingest(row(4, { micros: 10 }));
    store.ingest(row(6, { micros: 10 }));
    expect(keys(store)).toEqual(['creation:4', 'creation:5', 'creation:6']);
  });

  it('appends rows that arrive in order', () => {
    const store = createCreationFeedStore();
    store.ingest(row(1));
    store.ingest(row(2));
    store.ingest(row(3));
    expect(keys(store)).toEqual(['creation:1', 'creation:2', 'creation:3']);
  });

  it('never moves a local echo and never scans back past one', () => {
    const store = createCreationFeedStore({ now: () => 1 });
    store.ingest(row(10, { micros: 100 }));
    store.appendEcho('Surprise me.');
    // A server row stamped before the echo and before row 10 still lands after the echo.
    store.ingest(row(2, { micros: 5 }));
    expect(keys(store)).toEqual(['creation:10', 'local:1', 'creation:2']);
    // A later server row older than creation:2 sorts before it but stays after the echo.
    store.ingest(row(1, { micros: 1 }));
    expect(keys(store)).toEqual(['creation:10', 'local:1', 'creation:1', 'creation:2']);
  });
});

describe('createCreationFeedStore: local entries', () => {
  it('appendEcho adds a local echo entry at the end', () => {
    const store = createCreationFeedStore({ now: () => 5 });
    store.ingest(row(1));
    store.appendEcho('Surprise me.');
    const entry = store.entries.value[1];
    expect(entry.origin).toBe('local');
    expect(entry.kind).toBe('echo');
    expect(entry.message).toBe('Surprise me.');
    expect(entry.segments).toBeNull();
    expect(entry.lineCount).toBe(1);
    expect(entry.createdAtMicros).toBe(5000n);
  });

  it("appendError adds a local error entry at the end", () => {
    const store = createCreationFeedStore();
    store.appendError("Couldn't send that. Try again.");
    const entry = store.entries.value[0];
    expect(entry.origin).toBe('local');
    expect(entry.kind).toBe('error');
    expect(entry.message).toBe("Couldn't send that. Try again.");
  });

  it('gives unique local keys', () => {
    const store = createCreationFeedStore();
    store.appendEcho('a');
    store.appendError('b');
    store.appendEcho('c');
    expect(keys(store)).toEqual(['local:1', 'local:2', 'local:3']);
  });

  it('defaults now to the clock', () => {
    const store = createCreationFeedStore();
    const before = BigInt(Date.now()) * 1000n;
    store.appendEcho('a');
    const after = BigInt(Date.now()) * 1000n;
    const at = store.entries.value[0].createdAtMicros;
    expect(at >= before && at <= after).toBe(true);
  });

  it('feeds creationLines as echo and error lines', () => {
    const store = createCreationFeedStore();
    store.appendEcho('Warrior');
    store.appendError('Nope');
    const lines = creationLines(store.entries.value);
    expect(lines.map(l => l.line.kind)).toEqual(['echo', 'error']);
  });
});

describe('createCreationFeedStore: cap', () => {
  it('defaults to the Phase 47 line cap', () => {
    expect(FEED_LINE_CAP).toBe(300);
    const store = createCreationFeedStore();
    for (let i = 1; i <= FEED_LINE_CAP + 10; i++) store.ingest(row(i));
    expect(store.entries.value).toHaveLength(FEED_LINE_CAP);
    expect(store.entries.value[0].key).toBe('creation:11');
  });

  it('counts lines: with cap 5, entries of 2 + 2 + 2 lines drop the oldest entry', () => {
    const store = createCreationFeedStore({ cap: 5 });
    store.ingest(row(1, { segments: [seg('a'), seg('b')] }));
    store.ingest(row(2, { segments: [seg('c'), seg('d')] }));
    store.ingest(row(3, { segments: [seg('e'), seg('f')] }));
    expect(keys(store)).toEqual(['creation:2', 'creation:3']);
  });

  it('counts local entries toward the cap', () => {
    const store = createCreationFeedStore({ cap: 3 });
    store.ingest(row(1));
    store.appendEcho('a');
    store.ingest(row(2));
    store.appendEcho('b');
    expect(keys(store)).toEqual(['local:1', 'creation:2', 'local:2']);
  });

  it('keeps one entry even when it alone exceeds the cap', () => {
    const store = createCreationFeedStore({ cap: 2 });
    store.ingest(row(1, { segments: [seg('a'), seg('b'), seg('c')] }));
    expect(keys(store)).toEqual(['creation:1']);
  });

  it('lets a dropped server row be re-ingested as a new entry without crashing', () => {
    const store = createCreationFeedStore({ cap: 2 });
    store.ingest(row(1));
    store.ingest(row(2));
    store.ingest(row(3));
    expect(keys(store)).toEqual(['creation:2', 'creation:3']);
    expect(() => store.ingest(row(1))).not.toThrow();
    expect(keys(store).length).toBeLessThanOrEqual(2);
    // A row still held stays deduped.
    store.ingest(row(3));
    expect(keys(store).filter(k => k === 'creation:3')).toHaveLength(1);
  });
});

describe('createCreationFeedStore: clear', () => {
  it('empties entries and forgets every key', () => {
    const store = createCreationFeedStore();
    store.ingest(row(1));
    store.appendEcho('a');
    store.clear();
    expect(store.entries.value).toEqual([]);
    store.ingest(row(1));
    expect(keys(store)).toEqual(['creation:1']);
  });
});

describe('createCreationFeedStore: reactivity', () => {
  it('changes the array identity on each mutation', () => {
    const store = createCreationFeedStore();
    const seen = [store.entries.value];
    store.ingest(row(1));
    seen.push(store.entries.value);
    store.appendEcho('a');
    seen.push(store.entries.value);
    store.appendError('b');
    seen.push(store.entries.value);
    store.clear();
    seen.push(store.entries.value);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('does not change identity for an ignored duplicate', () => {
    const store = createCreationFeedStore();
    store.ingest(row(1));
    const before = store.entries.value;
    store.ingest(row(1));
    expect(store.entries.value).toBe(before);
  });
});

describe('source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/creation/creationFeedStore.ts'), 'utf8');

  it('takes the cap from the console feed store', () => {
    expect(source).toContain("FEED_LINE_CAP } from '../console/feedStore'");
  });

  it('owns no component, timer or microtask', () => {
    expect(source).not.toMatch(/setTimeout|queueMicrotask|onMounted|defineComponent/);
  });
});
