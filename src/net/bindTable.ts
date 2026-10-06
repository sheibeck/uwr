import { ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';

// Structural contracts instead of the generated SDK context types (those trigger TS2589).
type Listener = (...args: any[]) => void;

export interface SubscriptionHandleLike {
  unsubscribe(): void;
  isActive(): boolean;
  isEnded(): boolean;
}

export interface SubscriptionBuilderLike {
  onApplied(cb: Listener): SubscriptionBuilderLike;
  onError(cb: Listener): SubscriptionBuilderLike;
  subscribe(query: string[]): SubscriptionHandleLike;
}

export interface TableLike<Row> {
  iter(): Iterable<Row>;
  onInsert(cb: Listener): void;
  removeOnInsert(cb: Listener): void;
  onDelete(cb: Listener): void;
  removeOnDelete(cb: Listener): void;
  // Views may lack onUpdate.
  onUpdate?(cb: Listener): void;
  removeOnUpdate?(cb: Listener): void;
}

export interface ConnLike {
  subscriptionBuilder(): SubscriptionBuilderLike;
}

export interface BindTableOptions<C, Row> {
  table(conn: C): TableLike<Row>;
  sql: string[];
  filter?(row: Row): boolean;
}

export interface TableBinding<C, Row> {
  readonly rows: Readonly<ShallowRef<readonly Row[]>>;
  readonly applied: Readonly<Ref<boolean>>;
  readonly failed: Readonly<Ref<boolean>>;
  /** null keeps the rows; the same connection is a no-op. */
  attach(conn: C | null): void;
  /** Detach listeners, unsubscribe, clear rows and applied. */
  dispose(): void;
}

/**
 * Mirror of one subscribed table. Rows are kept through a disconnect (stale while
 * reconnecting) and replaced only when a fresh subscription applies. Listeners are
 * removed with the same function references on re-attach, so they never stack.
 */
export function bindTable<C extends ConnLike, Row>(
  options: BindTableOptions<C, Row>,
): TableBinding<C, Row> {
  // Rows hold bigint, Identity and Timestamp instances: no deep reactivity.
  const rows = shallowRef<readonly Row[]>([]);
  const applied = ref(false);
  const failed = ref(false);

  let currentConn: C | null = null;
  let currentTable: TableLike<Row> | null = null;
  let currentHandle: SubscriptionHandleLike | null = null;

  const refresh: Listener = () => {
    if (!currentTable) return;
    const all = [...currentTable.iter()];
    rows.value = options.filter ? all.filter((row) => options.filter!(row)) : all;
  };

  function detach(): void {
    const table = currentTable;
    if (table) {
      table.removeOnInsert(refresh);
      table.removeOnDelete(refresh);
      table.removeOnUpdate?.(refresh);
    }
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
  }

  function attach(conn: C | null): void {
    if (conn === currentConn) return;
    detach();
    if (conn === null) return;

    currentConn = conn;
    const table = options.table(conn);
    currentTable = table;
    table.onInsert(refresh);
    table.onDelete(refresh);
    table.onUpdate?.(refresh);

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
        // Rows first, then the flag: the SDK emits 'applied' before it dispatches the row
        // callbacks, so a synchronous watcher that sees applied === true must already see the
        // snapshot rows (the wind-up snapshot in combat/combatFeed.ts depends on it).
        refresh();
        applied.value = true;
        failed.value = false;
      })
      .onError((...args: unknown[]) => {
        if (currentConn !== conn) return;
        console.warn('[bindTable] subscription error', options.sql, ...args);
        failed.value = true;
      })
      .subscribe(options.sql);
    currentHandle = handle;
  }

  function dispose(): void {
    detach();
    rows.value = [];
    applied.value = false;
    failed.value = false;
  }

  return { rows, applied, failed, attach, dispose };
}
