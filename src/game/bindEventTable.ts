import { ref } from 'vue';
import type { Ref } from 'vue';
import type { ConnLike, SubscriptionHandleLike } from '../net/bindTable';

// Event rows are never cached by the SDK (iter() is always empty), so rows are pushed
// to a callback from the insert listener instead of being mirrored into a ref.
type Listener = (...args: any[]) => void;

export interface EventTableLike<Row> {
  // The SDK calls listeners with (ctx, row).
  onInsert(cb: (ctx: any, row: Row) => void): void;
  removeOnInsert(cb: (ctx: any, row: Row) => void): void;
}

export interface BindEventTableOptions<C, Row> {
  table(conn: C): EventTableLike<Row>;
  sql: string[];
  onRow(row: Row): void;
}

export interface EventTableBinding<C> {
  readonly applied: Readonly<Ref<boolean>>;
  readonly failed: Readonly<Ref<boolean>>;
  /** The same connection is a no-op; null detaches. */
  attach(conn: C | null): void;
  /** Detach the listener, unsubscribe, reset applied and failed. */
  dispose(): void;
}

export function bindEventTable<C extends ConnLike, Row>(
  options: BindEventTableOptions<C, Row>,
): EventTableBinding<C> {
  const applied = ref(false);
  const failed = ref(false);

  let currentConn: C | null = null;
  let currentTable: EventTableLike<Row> | null = null;
  let currentHandle: SubscriptionHandleLike | null = null;

  // One stable reference so removeOnInsert finds it. The SDK passes (ctx, row).
  const listener: Listener = (_ctx: unknown, row: Row) => options.onRow(row);

  function detach(): void {
    currentTable?.removeOnInsert(listener);
    const handle = currentHandle;
    if (handle) {
      try {
        if (handle.isActive()) handle.unsubscribe();
      } catch {
        // Unsubscribing an ended handle throws; nothing to clean up.
      }
    }
    currentTable = null;
    currentHandle = null;
    currentConn = null;
    applied.value = false;
  }

  function attach(conn: C | null): void {
    if (conn === currentConn) return;
    detach();
    if (conn === null) return;

    currentConn = conn;
    const table = options.table(conn);
    currentTable = table;
    table.onInsert(listener);

    // Captured for the stale-apply path below; assigned once subscribe() returns.
    let handle: SubscriptionHandleLike | null = null;
    handle = conn
      .subscriptionBuilder()
      .onApplied(() => {
        if (currentConn !== conn) {
          // Detached while still pending (detach skips inactive handles): the server
          // subscription is live now, so release it here instead of leaking it.
          try {
            handle?.unsubscribe();
          } catch {
            // Already ended; nothing to clean up.
          }
          return;
        }
        applied.value = true;
        failed.value = false;
      })
      .onError((...args: unknown[]) => {
        if (currentConn !== conn) return;
        console.warn('[bindEventTable] subscription error', options.sql, ...args);
        failed.value = true;
      })
      .subscribe(options.sql);
    currentHandle = handle;
  }

  function dispose(): void {
    detach();
    failed.value = false;
  }

  return { applied, failed, attach, dispose };
}
