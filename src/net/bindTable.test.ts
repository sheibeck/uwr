import { describe, expect, it, vi } from 'vitest';
import { watch } from 'vue';
import { bindTable } from './bindTable';
import type { ConnLike, TableLike } from './bindTable';

interface Row {
  id: number;
  mine?: boolean;
}

function makeConn(options: { withUpdate?: boolean; initial?: Row[] } = {}) {
  const withUpdate = options.withUpdate ?? true;
  const rows: Row[] = options.initial ? [...options.initial] : [];
  const insertListeners = new Set<(...args: unknown[]) => void>();
  const deleteListeners = new Set<(...args: unknown[]) => void>();
  const updateListeners = new Set<(...args: unknown[]) => void>();

  const table: TableLike<Row> = {
    iter: () => rows[Symbol.iterator](),
    onInsert: vi.fn((cb) => void insertListeners.add(cb)),
    removeOnInsert: vi.fn((cb) => void insertListeners.delete(cb)),
    onDelete: vi.fn((cb) => void deleteListeners.add(cb)),
    removeOnDelete: vi.fn((cb) => void deleteListeners.delete(cb)),
  };
  if (withUpdate) {
    table.onUpdate = vi.fn((cb) => void updateListeners.add(cb));
    table.removeOnUpdate = vi.fn((cb) => void updateListeners.delete(cb));
  }

  let applied: (() => void) | null = null;
  let errored: (() => void) | null = null;
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
    onError(cb: () => void) {
      errored = cb;
      return builder;
    },
    subscribe: vi.fn(() => handle),
  };
  const conn: ConnLike & { table: TableLike<Row> } = {
    table,
    subscriptionBuilder: () => builder,
  };

  return {
    conn,
    table,
    rows,
    handle,
    builder,
    fireApplied: () => applied?.(),
    fireError: () => errored?.(),
    insert(row: Row) {
      rows.push(row);
      insertListeners.forEach((cb) => cb({}, row));
    },
    update(row: Row) {
      updateListeners.forEach((cb) => cb({}, row, row));
    },
    remove(id: number) {
      const i = rows.findIndex((r) => r.id === id);
      const [row] = rows.splice(i, 1);
      deleteListeners.forEach((cb) => cb({}, row));
    },
    listenerCount: () => insertListeners.size + deleteListeners.size + updateListeners.size,
  };
}

type Fake = ReturnType<typeof makeConn>;

function binding(filter?: (row: Row) => boolean) {
  return bindTable<Fake['conn'], Row>({
    table: (c) => c.table,
    sql: ['SELECT * FROM thing'],
    filter,
  });
}

describe('bindTable', () => {
  it('subscribes once and exposes rows only after the subscription applies', () => {
    const f = makeConn({ initial: [{ id: 1 }] });
    const b = binding();
    b.attach(f.conn);
    expect(f.builder.subscribe).toHaveBeenCalledWith(['SELECT * FROM thing']);
    expect(b.rows.value).toEqual([]);
    expect(b.applied.value).toBe(false);
    f.fireApplied();
    expect(b.rows.value).toEqual([{ id: 1 }]);
    expect(b.applied.value).toBe(true);
  });

  it('publishes the snapshot rows before the applied flag (the SDK emits applied before the row callbacks)', () => {
    const f = makeConn({ initial: [{ id: 1 }, { id: 2 }] });
    const b = binding();
    b.attach(f.conn);
    // A synchronous watcher on applied, like the wind-up snapshot in combatFeed.
    const seen: number[][] = [];
    const stop = watch(
      () => b.applied.value,
      (isApplied) => {
        if (isApplied) seen.push(b.rows.value.map((row) => row.id));
      },
      { flush: 'sync' },
    );
    f.fireApplied();
    stop();
    expect(seen).toEqual([[1, 2]]);
  });

  it('re-reads iter() on insert, update and delete', () => {
    const f = makeConn();
    const b = binding();
    b.attach(f.conn);
    f.fireApplied();
    f.insert({ id: 1 });
    expect(b.rows.value).toEqual([{ id: 1 }]);
    f.insert({ id: 2 });
    f.update({ id: 2 });
    expect(b.rows.value).toHaveLength(2);
    f.remove(1);
    expect(b.rows.value).toEqual([{ id: 2 }]);
  });

  it('keeps rows when attach(null) is called', () => {
    const f = makeConn({ initial: [{ id: 1 }] });
    const b = binding();
    b.attach(f.conn);
    f.fireApplied();
    b.attach(null);
    expect(b.rows.value).toEqual([{ id: 1 }]);
    expect(b.applied.value).toBe(true);
  });

  it('on a new connection removes the same listeners, unsubscribes the old handle and keeps old rows until the new apply', () => {
    const a = makeConn({ initial: [{ id: 1 }] });
    const b = binding();
    b.attach(a.conn);
    a.fireApplied();

    const added = (a.table.onInsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const addedDelete = (a.table.onDelete as ReturnType<typeof vi.fn>).mock.calls[0][0];

    const next = makeConn({ initial: [{ id: 7 }] });
    b.attach(next.conn);

    expect(a.table.removeOnInsert).toHaveBeenCalledWith(added);
    expect(a.table.removeOnDelete).toHaveBeenCalledWith(addedDelete);
    expect(a.table.removeOnUpdate).toHaveBeenCalled();
    expect(a.listenerCount()).toBe(0);
    expect(a.handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(b.rows.value).toEqual([{ id: 1 }]);

    next.fireApplied();
    expect(b.rows.value).toEqual([{ id: 7 }]);
  });

  it('does not unsubscribe an inactive handle and swallows unsubscribe errors', () => {
    const a = makeConn();
    const b = binding();
    b.attach(a.conn);
    a.handle.isActive.mockReturnValue(false);
    b.attach(makeConn().conn);
    expect(a.handle.unsubscribe).not.toHaveBeenCalled();

    const c = makeConn();
    const b2 = binding();
    b2.attach(c.conn);
    c.handle.unsubscribe.mockImplementation(() => {
      throw new Error('already ended');
    });
    expect(() => b2.attach(makeConn().conn)).not.toThrow();
  });

  it('ignores a stale applied callback from a replaced connection', () => {
    const a = makeConn({ initial: [{ id: 1 }] });
    const b = binding();
    b.attach(a.conn);
    const next = makeConn({ initial: [{ id: 2 }] });
    b.attach(next.conn);
    a.fireApplied();
    expect(b.applied.value).toBe(false);
    expect(b.rows.value).toEqual([]);
  });

  it('unsubscribes a still-pending handle when it applies after a detach', () => {
    const a = makeConn({ initial: [{ id: 1 }] });
    const b = binding();
    b.attach(a.conn);
    // Pending: not active yet, so detach cannot unsubscribe it.
    a.handle.isActive.mockReturnValue(false);
    b.attach(makeConn().conn);
    expect(a.handle.unsubscribe).not.toHaveBeenCalled();

    // The server applies it late: it must be released, not leaked, and not touch state.
    a.handle.isActive.mockReturnValue(true);
    a.fireApplied();
    expect(a.handle.unsubscribe).toHaveBeenCalledTimes(1);
    expect(b.applied.value).toBe(false);
    expect(b.rows.value).toEqual([]);
  });

  it('a late apply after dispose also releases the pending subscription and swallows errors', () => {
    const a = makeConn();
    const b = binding();
    b.attach(a.conn);
    a.handle.isActive.mockReturnValue(false);
    a.handle.unsubscribe.mockImplementation(() => {
      throw new Error('already ended');
    });
    b.dispose();
    expect(() => a.fireApplied()).not.toThrow();
    expect(a.handle.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('attaching the same connection twice subscribes and listens once', () => {
    const f = makeConn();
    const b = binding();
    b.attach(f.conn);
    b.attach(f.conn);
    expect(f.builder.subscribe).toHaveBeenCalledTimes(1);
    expect(f.table.onInsert).toHaveBeenCalledTimes(1);
  });

  it('applies the filter option', () => {
    const f = makeConn({ initial: [{ id: 1, mine: true }, { id: 2 }] });
    const b = binding((r) => r.mine === true);
    b.attach(f.conn);
    f.fireApplied();
    expect(b.rows.value).toEqual([{ id: 1, mine: true }]);
    f.insert({ id: 3 });
    expect(b.rows.value).toEqual([{ id: 1, mine: true }]);
  });

  it('onError sets failed, keeps rows, and a later apply clears failed', () => {
    const f = makeConn({ initial: [{ id: 1 }] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const b = binding();
    b.attach(f.conn);
    f.fireApplied();
    f.fireError();
    expect(b.failed.value).toBe(true);
    expect(b.rows.value).toEqual([{ id: 1 }]);
    f.fireApplied();
    expect(b.failed.value).toBe(false);
    warn.mockRestore();
  });

  it('dispose detaches, unsubscribes and clears rows', () => {
    const f = makeConn({ initial: [{ id: 1 }] });
    const b = binding();
    b.attach(f.conn);
    f.fireApplied();
    b.dispose();
    expect(f.listenerCount()).toBe(0);
    expect(f.handle.unsubscribe).toHaveBeenCalled();
    expect(b.rows.value).toEqual([]);
    expect(b.applied.value).toBe(false);
  });

  it('handles a table without onUpdate', () => {
    const f = makeConn({ withUpdate: false });
    const b = binding();
    expect(() => b.attach(f.conn)).not.toThrow();
    f.fireApplied();
    expect(() => b.attach(makeConn({ withUpdate: false }).conn)).not.toThrow();
    expect(() => b.dispose()).not.toThrow();
  });
});
