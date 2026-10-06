import { describe, expect, it, vi } from 'vitest';
import { bindEventTable } from './bindEventTable';
import type { EventTableLike } from './bindEventTable';
import type { ConnLike } from '../net/bindTable';

interface Row {
  id: number;
}

// An event table has no iter(): the SDK never caches its rows.
function makeConn() {
  const insertListeners = new Set<(...args: unknown[]) => void>();
  const table: EventTableLike<Row> = {
    onInsert: vi.fn((cb) => void insertListeners.add(cb)),
    removeOnInsert: vi.fn((cb) => void insertListeners.delete(cb)),
  };

  let applied: (() => void) | null = null;
  let errored: ((...args: unknown[]) => void) | null = null;
  const handle = {
    unsubscribe: vi.fn(),
    isActive: vi.fn(() => true),
    isEnded: vi.fn(() => false),
  };
  const builder = {
    onApplied(cb: () => void) {
      applied = cb;
      return builder;
    },
    onError(cb: (...args: unknown[]) => void) {
      errored = cb;
      return builder;
    },
    subscribe: vi.fn(() => handle),
  };
  const conn: ConnLike & { table: EventTableLike<Row> } = {
    table,
    subscriptionBuilder: () => builder,
  };

  return {
    conn,
    table,
    handle,
    builder,
    fireApplied: () => applied?.(),
    fireError: (...args: unknown[]) => errored?.(...args),
    insert(row: Row) {
      insertListeners.forEach((cb) => cb({}, row));
    },
    listenerCount: () => insertListeners.size,
  };
}

type Fake = ReturnType<typeof makeConn>;

function binding(onRow: (row: Row) => void = () => {}) {
  return bindEventTable<Fake['conn'], Row>({
    table: (c) => c.table,
    sql: ['SELECT * FROM event_thing'],
    onRow,
  });
}

describe('bindEventTable', () => {
  it('registers one listener, subscribes, and pushes each inserted row to onRow', () => {
    const f = makeConn();
    const onRow = vi.fn();
    const b = binding(onRow);
    b.attach(f.conn);

    expect(f.table.onInsert).toHaveBeenCalledTimes(1);
    expect(f.builder.subscribe).toHaveBeenCalledWith(['SELECT * FROM event_thing']);
    f.insert({ id: 1 });
    f.insert({ id: 2 });
    expect(onRow.mock.calls).toEqual([[{ id: 1 }], [{ id: 2 }]]);
  });

  it('flips applied on onApplied and starts not applied', () => {
    const f = makeConn();
    const b = binding();
    b.attach(f.conn);
    expect(b.applied.value).toBe(false);
    f.fireApplied();
    expect(b.applied.value).toBe(true);
    expect(b.failed.value).toBe(false);
  });

  it('sets failed and warns with the sql on a subscription error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = makeConn();
    const b = binding();
    b.attach(f.conn);
    f.fireError('boom');
    expect(b.failed.value).toBe(true);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0]).toContainEqual(['SELECT * FROM event_thing']);
    warn.mockRestore();
  });

  it('is a no-op for the same connection', () => {
    const f = makeConn();
    const b = binding();
    b.attach(f.conn);
    b.attach(f.conn);
    expect(f.table.onInsert).toHaveBeenCalledTimes(1);
    expect(f.builder.subscribe).toHaveBeenCalledTimes(1);
  });

  it('moves to another connection with the same listener reference and resets applied', () => {
    const a = makeConn();
    const c = makeConn();
    const onRow = vi.fn();
    const b = binding(onRow);
    b.attach(a.conn);
    a.fireApplied();
    const registered = (a.table.onInsert as ReturnType<typeof vi.fn>).mock.calls[0][0];

    b.attach(c.conn);
    expect(a.table.removeOnInsert).toHaveBeenCalledWith(registered);
    expect(a.handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(a.listenerCount()).toBe(0);
    expect(b.applied.value).toBe(false);
    expect(c.table.onInsert).toHaveBeenCalledTimes(1);

    c.insert({ id: 9 });
    a.insert({ id: 10 });
    expect(onRow.mock.calls).toEqual([[{ id: 9 }]]);
  });

  it('detaches on null and leaves applied false', () => {
    const f = makeConn();
    const b = binding();
    b.attach(f.conn);
    f.fireApplied();
    b.attach(null);
    expect(f.listenerCount()).toBe(0);
    expect(f.handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(b.applied.value).toBe(false);
  });

  it('dispose detaches and resets applied and failed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = makeConn();
    const b = binding();
    b.attach(f.conn);
    f.fireApplied();
    f.fireError();
    b.dispose();
    expect(f.listenerCount()).toBe(0);
    expect(b.applied.value).toBe(false);
    expect(b.failed.value).toBe(false);
    warn.mockRestore();
  });

  it('unsubscribes a stale onApplied handle and does not set applied', () => {
    const a = makeConn();
    const c = makeConn();
    // The handle is still pending, so detach skips it.
    a.handle.isActive.mockReturnValue(false);
    const b = binding();
    b.attach(a.conn);
    b.attach(c.conn);
    expect(a.handle.unsubscribe).not.toHaveBeenCalled();

    a.fireApplied();
    expect(a.handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(b.applied.value).toBe(false);
  });

  it('never reads iter() on the table', () => {
    const f = makeConn();
    const b = binding();
    expect('iter' in f.table).toBe(false);
    b.attach(f.conn);
    f.fireApplied();
    f.insert({ id: 1 });
    // A missing iter would have thrown above.
    expect(b.applied.value).toBe(true);
  });

  it('swallows an unsubscribe that throws', () => {
    const f = makeConn();
    f.handle.unsubscribe.mockImplementation(() => {
      throw new Error('ended');
    });
    const b = binding();
    b.attach(f.conn);
    expect(() => b.attach(null)).not.toThrow();
    expect(() => b.dispose()).not.toThrow();
  });
});
