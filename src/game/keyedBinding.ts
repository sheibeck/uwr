import { computed, getCurrentScope, onScopeDispose, shallowRef, watch } from 'vue';
import type { ComputedRef, Ref, ShallowRef, WatchStopHandle } from 'vue';

// Keyed bindings (location, group, character, id lists). When the key changes the old
// binding's rows stay visible until the new binding has applied, so Nearby and routes
// never flash empty on a move. Watchers are 'sync', like the session watchers.

export interface AttachableBinding<C> {
  readonly applied: Readonly<Ref<boolean>>;
  attach(conn: C | null): void;
  dispose(): void;
}

export interface Keyed<B> {
  /** The binding whose data is shown. */
  readonly current: Readonly<ShallowRef<B | null>>;
  /** Dispose the current and pending bindings and forget the key. */
  reset(): void;
}

export function createKeyed<C, K extends string | bigint, B extends AttachableBinding<C>>(options: {
  key: Readonly<Ref<K | null>>;
  conn: Readonly<Ref<C | null>>;
  make(key: K): B;
  /** 'onApplied' (default) keeps the old rows until the new binding applies. */
  swap?: 'onApplied' | 'immediate';
}): Keyed<B> {
  const swap = options.swap ?? 'onApplied';
  // Cast: shallowRef over a generic B resolves to an unwrapped union otherwise.
  const current = shallowRef(null) as ShallowRef<B | null>;

  let currentKey: K | null = null;
  let pending: B | null = null;
  let stopPendingWatch: WatchStopHandle | null = null;

  function clearPending(): void {
    stopPendingWatch?.();
    stopPendingWatch = null;
    const binding = pending;
    pending = null;
    binding?.dispose();
  }

  function setCurrent(binding: B | null): void {
    const old = current.value;
    current.value = binding;
    if (old !== null && old !== binding) old.dispose();
  }

  function promote(binding: B): void {
    stopPendingWatch?.();
    stopPendingWatch = null;
    pending = null;
    setCurrent(binding);
  }

  function reset(): void {
    currentKey = null;
    clearPending();
    setCurrent(null);
  }

  const stopKey = watch(
    options.key,
    (key) => {
      if (key === currentKey) return;
      currentKey = key;
      clearPending();
      if (key === null) {
        setCurrent(null);
        return;
      }

      const binding = options.make(key);
      binding.attach(options.conn.value);

      // Nothing to keep on screen yet, or the caller wants an immediate swap.
      if (current.value === null || swap === 'immediate') {
        setCurrent(binding);
        return;
      }

      pending = binding;
      if (binding.applied.value) {
        promote(binding);
        return;
      }
      stopPendingWatch = watch(
        binding.applied,
        (applied) => {
          if (applied) promote(binding);
        },
        { flush: 'sync' },
      );
    },
    { immediate: true, flush: 'sync' },
  );

  // A reconnect re-attaches both the shown and the pending binding.
  const stopConn = watch(
    options.conn,
    (conn) => {
      current.value?.attach(conn);
      pending?.attach(conn);
    },
    { flush: 'sync' },
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stopKey();
      stopConn();
      reset();
    });
  }

  return { current, reset };
}

const NO_ROWS: readonly never[] = [];

export function keyedRows<Row>(
  keyed: Keyed<{ rows: Readonly<Ref<readonly Row[]>> } & AttachableBinding<any>>,
): ComputedRef<readonly Row[]> {
  return computed(() => keyed.current.value?.rows.value ?? NO_ROWS);
}

/** Canonical key for an id set: sorted numerically, de-duplicated, comma-joined. */
export function idListKey(ids: Iterable<bigint>): string | null {
  const sorted = [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted.length === 0 ? null : sorted.join(',');
}

export function parseIdListKey(key: string): bigint[] {
  return key === '' ? [] : key.split(',').map((part) => BigInt(part));
}
