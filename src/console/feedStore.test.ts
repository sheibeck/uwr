import { describe, expect, it } from 'vitest';
import { FEED_LINE_CAP, acceptRow, createFeedStore } from './feedStore';
import type { EventRowLike, FeedEntry } from './feedStore';
import type { LineSource } from './lines';

function row(id: number, extra: Partial<EventRowLike> & { micros?: number } = {}): EventRowLike {
  const { micros, ...rest } = extra;
  return {
    id: BigInt(id),
    kind: 'narrative',
    message: `m${id}`,
    createdAt: { microsSinceUnixEpoch: BigInt(micros ?? id) },
    ...rest,
  };
}

function manualStore(cap?: number) {
  const queue: Array<() => void> = [];
  const store = createFeedStore({ cap, schedule: (fn) => queue.push(fn) });
  return {
    store,
    runScheduled() {
      const fns = queue.splice(0);
      for (const fn of fns) fn();
    },
    scheduledCount: () => queue.length,
  };
}

function keys(entries: readonly FeedEntry[]): string[] {
  return entries.map((e) => e.key);
}

describe('acceptRow', () => {
  it('private rows: presence always, others only for the active character', () => {
    expect(acceptRow('private', row(1, { kind: 'presence', characterId: 99n }), 5n)).toBe(true);
    expect(acceptRow('private', row(1, { kind: 'narrative', characterId: 5n }), 5n)).toBe(true);
    expect(acceptRow('private', row(1, { kind: 'narrative', characterId: 6n }), 5n)).toBe(false);
  });

  it('accepts nothing without an active character', () => {
    for (const source of ['private', 'location', 'group', 'world'] as const) {
      expect(acceptRow(source, row(1, { kind: 'presence', characterId: 5n }), null)).toBe(false);
    }
  });

  it('location rows honor excludeCharacterId', () => {
    expect(acceptRow('location', row(1, { excludeCharacterId: 5n }), 5n)).toBe(false);
    expect(acceptRow('location', row(1), 5n)).toBe(true);
    expect(acceptRow('location', row(1, { excludeCharacterId: null }), 5n)).toBe(true);
    expect(acceptRow('location', row(1, { excludeCharacterId: 6n }), 5n)).toBe(true);
  });

  it('group rows from the active character only when kind is group', () => {
    expect(acceptRow('group', row(1, { characterId: 5n, kind: 'move' }), 5n)).toBe(false);
    expect(acceptRow('group', row(1, { characterId: 5n, kind: 'group' }), 5n)).toBe(true);
    expect(acceptRow('group', row(1, { characterId: 6n, kind: 'move' }), 5n)).toBe(true);
    expect(acceptRow('group', row(1, { characterId: 6n, kind: 'group' }), 5n)).toBe(true);
  });

  it('world rows are always accepted for an active character', () => {
    expect(acceptRow('world', row(1), 5n)).toBe(true);
  });
});

describe('createFeedStore', () => {
  it('starts empty and accepts no rows until a character is set', () => {
    const { store, runScheduled } = manualStore();
    expect(store.entries.value).toEqual([]);
    store.ingest('world', row(1));
    runScheduled();
    expect(store.entries.value).toEqual([]);
    store.setCharacter(null);
    store.ingest('world', row(1));
    store.flush();
    expect(store.entries.value).toEqual([]);
  });

  it('buffers until a flush and flushes once per tick', () => {
    const { store, runScheduled, scheduledCount } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.ingest('world', row(2));
    expect(store.entries.value).toEqual([]);
    expect(scheduledCount()).toBe(1);
    runScheduled();
    expect(keys(store.entries.value)).toEqual(['world:1', 'world:2']);
  });

  it('flush() empties the pending batch immediately', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:1']);
  });

  it('sorts a batch by createdAt, then source order, then id', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1, { micros: 20 }));
    store.ingest('group', row(2, { micros: 10, characterId: 6n }));
    store.ingest('private', row(9, { micros: 10, characterId: 5n }));
    store.ingest('location', row(4, { micros: 10 }));
    store.ingest('location', row(3, { micros: 10 }));
    store.ingest('private', row(8, { micros: 5, characterId: 5n }));
    store.flush();
    expect(keys(store.entries.value)).toEqual([
      'private:8',
      'private:9',
      'location:3',
      'location:4',
      'group:2',
      'world:1',
    ]);
  });

  it('later batches append after earlier ones', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(5, { micros: 50 }));
    store.flush();
    store.ingest('world', row(1, { micros: 1 }));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:5', 'world:1']);
  });

  it('dedupes by source and id within a batch and across batches', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.ingest('world', row(1));
    store.flush();
    store.ingest('world', row(1));
    store.flush();
    store.ingest('location', row(1));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:1', 'location:1']);
  });

  it('drops rows rejected by acceptRow', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('private', row(1, { characterId: 6n }));
    store.ingest('location', row(2, { excludeCharacterId: 5n }));
    store.flush();
    expect(store.entries.value).toEqual([]);
  });

  it('keeps segments and counts them toward the line cap', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    const segments = [
      { kind: 'narration', speaker: 'The Keeper', text: 'a' },
      { kind: 'dialogue', speaker: 'Ayla', text: 'b' },
    ];
    store.ingest('private', row(1, { characterId: 5n, segments }));
    store.flush();
    expect(store.entries.value[0].segments).toEqual(segments);
    expect(store.entries.value[0].lineCount).toBe(2);
  });

  it('treats empty and missing segments as one line', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1, { segments: [] }));
    store.ingest('world', row(2, { segments: null }));
    store.ingest('world', row(3));
    store.flush();
    expect(store.entries.value.map((e) => e.lineCount)).toEqual([1, 1, 1]);
  });

  it('drops the oldest entries past the cap, counting segments as lines', () => {
    const { store } = manualStore(5);
    store.setCharacter(5n);
    const seg = (n: number) => Array.from({ length: n }, () => ({ kind: 'narration', speaker: 'k', text: 't' }));
    store.ingest('world', row(1, { segments: seg(3) }));
    store.ingest('world', row(2));
    store.ingest('world', row(3));
    store.ingest('world', row(4));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:2', 'world:3', 'world:4']);
    store.ingest('world', row(5));
    store.ingest('world', row(6));
    store.ingest('world', row(7));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:3', 'world:4', 'world:5', 'world:6', 'world:7']);
  });

  it('defaults to a 300 line cap', () => {
    expect(FEED_LINE_CAP).toBe(300);
    const { store } = manualStore();
    store.setCharacter(5n);
    for (let i = 1; i <= 305; i += 1) store.ingest('world', row(i));
    store.flush();
    expect(store.entries.value).toHaveLength(300);
    expect(store.entries.value[0].key).toBe('world:6');
  });

  it('allows a dropped row to be ingested again', () => {
    const { store } = manualStore(2);
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.ingest('world', row(2));
    store.ingest('world', row(3));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:2', 'world:3']);
  });

  it('appends local entries immediately and tracks queued state', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    const key = store.appendLocal('echo', 'look', { queued: true });
    expect(key).toMatch(/^local:\d+$/);
    expect(store.entries.value).toHaveLength(1);
    const entry = store.entries.value[0];
    expect(entry.queued).toBe(true);
    expect(entry.lineCount).toBe(1);
    expect(entry.source).toBe('local');
    expect(entry.kind).toBe('echo');
    expect(entry.message).toBe('look');
    store.setQueued(key, false);
    expect(store.entries.value[0].queued).toBe(false);
    store.remove(key);
    expect(store.entries.value).toEqual([]);
  });

  it('gives local entries distinct keys and keeps them after server rows', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    const a = store.appendLocal('system', 'a');
    const b = store.appendLocal('look', 'b');
    expect(a).not.toBe(b);
    store.ingest('world', row(1));
    store.flush();
    expect(keys(store.entries.value)).toEqual([a, b, 'world:1']);
  });

  it('ignores setQueued and remove for unknown keys', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.appendLocal('echo', 'x');
    const before = store.entries.value;
    store.setQueued('local:999', true);
    store.remove('local:999');
    expect(store.entries.value).toBe(before);
  });

  it('clears history and the pending batch when the character changes', () => {
    const { store, runScheduled } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.flush();
    store.ingest('world', row(2));
    store.setCharacter(7n);
    expect(store.entries.value).toEqual([]);
    runScheduled();
    expect(store.entries.value).toEqual([]);
    store.ingest('world', row(1));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:1']);
  });

  it('keeps entries when the same character is set again', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.flush();
    store.setCharacter(5n);
    expect(keys(store.entries.value)).toEqual(['world:1']);
  });

  it('setCharacter(null) clears and then accepts nothing', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.flush();
    store.setCharacter(null);
    expect(store.entries.value).toEqual([]);
    store.ingest('world', row(2));
    store.flush();
    expect(store.entries.value).toEqual([]);
  });

  it('clear() empties entries and the pending batch', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.flush();
    store.ingest('world', row(2));
    store.clear();
    store.flush();
    expect(store.entries.value).toEqual([]);
    store.ingest('world', row(1));
    store.flush();
    expect(keys(store.entries.value)).toEqual(['world:1']);
  });

  it('works with the default microtask scheduler', async () => {
    const store = createFeedStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    expect(store.entries.value).toEqual([]);
    await Promise.resolve();
    expect(keys(store.entries.value)).toEqual(['world:1']);
  });

  it('produces entries that fit the line classifier input', () => {
    const { store } = manualStore();
    store.setCharacter(5n);
    store.ingest('world', row(1));
    store.flush();
    const source: LineSource = store.entries.value[0];
    expect(source.key).toBe('world:1');
  });
});
