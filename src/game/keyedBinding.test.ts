import { effectScope, ref, shallowRef } from 'vue';
import type { EffectScope, Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKeyed, idListKey, keyedRows, parseIdListKey } from './keyedBinding';

interface Conn {
  name: string;
}
interface Row {
  id: number;
}

function makeBinding(key: string) {
  return {
    key,
    rows: shallowRef<readonly Row[]>([{ id: key.charCodeAt(0) }]),
    applied: ref(false),
    failed: ref(false),
    attach: vi.fn(),
    dispose: vi.fn(),
  };
}
type Binding = ReturnType<typeof makeBinding>;

const scopes: EffectScope[] = [];
afterEach(() => {
  while (scopes.length) scopes.pop()!.stop();
});

function setup(options: { key?: string | null; conn?: Conn | null; swap?: 'onApplied' | 'immediate' } = {}) {
  const key: Ref<string | null> = ref(options.key ?? null);
  const conn: Ref<Conn | null> = ref(options.conn ?? { name: 'one' });
  const made: Binding[] = [];
  const scope = effectScope();
  scopes.push(scope);
  const keyed = scope.run(() =>
    createKeyed<Conn, string, Binding>({
      key,
      conn,
      swap: options.swap,
      make: (k) => {
        const b = makeBinding(k);
        made.push(b);
        return b;
      },
    }),
  )!;
  return { key, conn, made, keyed, scope };
}

describe('createKeyed', () => {
  it('makes nothing for a null key', () => {
    const { made, keyed } = setup();
    expect(made).toHaveLength(0);
    expect(keyed.current.value).toBeNull();
    const rows = scopes[0].run(() => keyedRows<Row>(keyed))!;
    expect(rows.value).toEqual([]);
  });

  it('makes, attaches and shows the first binding immediately', () => {
    const c = { name: 'one' };
    const { made, keyed } = setup({ key: 'a', conn: c });
    expect(made).toHaveLength(1);
    expect(made[0].attach).toHaveBeenCalledWith(c);
    expect(keyed.current.value).toBe(made[0]);
  });

  it('keeps the old rows until the new binding applies, then disposes the old one', () => {
    const { key, made, keyed } = setup({ key: 'a' });
    const rows = scopes[0].run(() => keyedRows<Row>(keyed))!;
    made[0].applied.value = true;

    key.value = 'b';
    expect(made).toHaveLength(2);
    expect(made[1].attach).toHaveBeenCalled();
    expect(keyed.current.value).toBe(made[0]);
    expect(rows.value).toEqual([{ id: 'a'.charCodeAt(0) }]);
    expect(made[0].dispose).not.toHaveBeenCalled();

    made[1].applied.value = true;
    expect(keyed.current.value).toBe(made[1]);
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
    expect(rows.value).toEqual([{ id: 'b'.charCodeAt(0) }]);
  });

  it('promotes a pending binding that fails and clears the old rows (WR-05)', () => {
    const { key, made, keyed } = setup({ key: 'a' });
    const rows = scopes[0].run(() => keyedRows<Row>(keyed))!;
    made[0].applied.value = true;
    expect(keyed.failed.value).toBe(false);

    key.value = 'b';
    expect(keyed.current.value).toBe(made[0]);
    expect(rows.value).toEqual([{ id: 'a'.charCodeAt(0) }]);

    // The old binding's dispose empties its rows, like the real bindings.
    made[0].dispose.mockImplementation(() => {
      made[0].rows.value = [];
    });
    made[1].rows.value = [];
    made[1].failed.value = true;

    expect(keyed.current.value).toBe(made[1]);
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
    expect(rows.value).toEqual([]);
    expect(keyed.failed.value).toBe(true);
    // The failed binding is the shown one now, not a leaked pending one.
    expect(made[1].dispose).not.toHaveBeenCalled();
  });

  it('recovers when the promoted failed binding later applies', () => {
    const { key, made, keyed } = setup({ key: 'a' });
    key.value = 'b';
    made[1].failed.value = true;
    expect(keyed.failed.value).toBe(true);
    made[1].failed.value = false;
    made[1].applied.value = true;
    expect(keyed.failed.value).toBe(false);
    expect(keyed.current.value).toBe(made[1]);
  });

  it('promotes at once a binding that has already failed when made (WR-05)', () => {
    const key = ref<string | null>('a');
    const conn = ref<Conn | null>({ name: 'x' });
    const made: Binding[] = [];
    const scope = effectScope();
    scopes.push(scope);
    const keyed = scope.run(() =>
      createKeyed<Conn, string, Binding>({
        key,
        conn,
        make: (k) => {
          const b = makeBinding(k);
          if (made.length > 0) b.failed.value = true;
          made.push(b);
          return b;
        },
      }),
    )!;
    key.value = 'b';
    expect(keyed.current.value).toBe(made[1]);
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
    expect(keyed.failed.value).toBe(true);
  });

  it('promotes at once a binding that is already applied when made', () => {
    const key = ref<string | null>('a');
    const conn = ref<Conn | null>({ name: 'x' });
    const made: Binding[] = [];
    const scope = effectScope();
    scopes.push(scope);
    const keyed = scope.run(() =>
      createKeyed<Conn, string, Binding>({
        key,
        conn,
        make: (k) => {
          const b = makeBinding(k);
          b.applied.value = true;
          made.push(b);
          return b;
        },
      }),
    )!;
    key.value = 'b';
    expect(keyed.current.value).toBe(made[1]);
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a pending binding when the key changes again', () => {
    const { key, made, keyed } = setup({ key: 'a' });
    key.value = 'b';
    key.value = 'c';
    expect(made[1].dispose).toHaveBeenCalledTimes(1);
    expect(keyed.current.value).toBe(made[0]);

    // A late apply of the disposed binding does nothing.
    made[1].applied.value = true;
    expect(keyed.current.value).toBe(made[0]);

    made[2].applied.value = true;
    expect(keyed.current.value).toBe(made[2]);
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
  });

  it("swaps at once with swap 'immediate'", () => {
    const { key, made, keyed } = setup({ key: 'a', swap: 'immediate' });
    key.value = 'b';
    expect(keyed.current.value).toBe(made[1]);
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes current and pending when the key goes to null', () => {
    const { key, made, keyed } = setup({ key: 'a' });
    key.value = 'b';
    key.value = null;
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
    expect(made[1].dispose).toHaveBeenCalledTimes(1);
    expect(keyed.current.value).toBeNull();
  });

  it('re-attaches current and pending to a new connection, and null on disconnect', () => {
    const { key, conn, made } = setup({ key: 'a' });
    key.value = 'b';
    const next = { name: 'two' };
    conn.value = next;
    expect(made[0].attach).toHaveBeenLastCalledWith(next);
    expect(made[1].attach).toHaveBeenLastCalledWith(next);
    conn.value = null;
    expect(made[0].attach).toHaveBeenLastCalledWith(null);
    expect(made[1].attach).toHaveBeenLastCalledWith(null);
  });

  it('reset disposes everything and a later key change makes a new binding', () => {
    const { key, made, keyed } = setup({ key: 'a' });
    key.value = 'b';
    keyed.reset();
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
    expect(made[1].dispose).toHaveBeenCalledTimes(1);
    expect(keyed.current.value).toBeNull();

    key.value = null;
    key.value = 'a';
    expect(made).toHaveLength(3);
    expect(keyed.current.value).toBe(made[2]);
  });

  it('does not rebind for an equal key value', () => {
    const { key, made } = setup({ key: 'a' });
    key.value = 'a';
    expect(made).toHaveLength(1);

    const bigKey = ref<bigint | null>(5n);
    const conn = ref<Conn | null>({ name: 'x' });
    const bigMade: Binding[] = [];
    const scope = effectScope();
    scopes.push(scope);
    scope.run(() =>
      createKeyed<Conn, bigint, Binding>({
        key: bigKey,
        conn,
        make: (k) => {
          const b = makeBinding(String(k));
          bigMade.push(b);
          return b;
        },
      }),
    );
    bigKey.value = 5n;
    expect(bigMade).toHaveLength(1);
  });

  it('disposes its bindings when the owning scope stops', () => {
    const { made, scope } = setup({ key: 'a' });
    scope.stop();
    expect(made[0].dispose).toHaveBeenCalledTimes(1);
  });
});

describe('idListKey / parseIdListKey', () => {
  it('sorts numerically, de-duplicates and joins', () => {
    expect(idListKey([9n, 5n, 9n])).toBe('5,9');
    expect(idListKey([10n, 9n, 100n])).toBe('9,10,100');
  });

  it('returns null for an empty set', () => {
    expect(idListKey([])).toBeNull();
    expect(idListKey(new Set<bigint>())).toBeNull();
  });

  it('parses a key back to bigints', () => {
    expect(parseIdListKey('5,9')).toEqual([5n, 9n]);
    expect(parseIdListKey('')).toEqual([]);
  });
});
