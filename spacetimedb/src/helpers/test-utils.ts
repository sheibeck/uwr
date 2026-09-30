/**
 * Shared mock DB utilities for SpacetimeDB unit tests.
 *
 * Provides a Proxy-based auto-creating mock that simulates
 * ctx.db table operations (insert, find, filter, update, delete, iter)
 * without requiring the SpacetimeDB WASM runtime.
 */

import { strictTableSpec } from './schema_recorder';

/**
 * Strict mode (opt-in, off by default) makes the mock behave like the real database where
 * the lenient default hides bugs: an unknown table or index accessor throws (the default
 * guesses a column from the name), and an index update matching no row throws (the default
 * does nothing). Accessors come from the recorded schema, so import '../schema/tables'
 * under the recording spacetimedb/server mock before touching the db.
 */
export type MockDbOptions = { strict?: boolean };

export function createMockDb(seed: Record<string, any[]> = {}, dbOpts: MockDbOptions = {}) {
  const strict = dbOpts.strict === true;
  const tables: Record<string, any[]> = {};
  const nextIds: Record<string, bigint> = {};

  // Pre-seed tables and track max IDs for auto-increment continuity
  for (const [k, v] of Object.entries(seed)) {
    tables[k] = [...v];
    let maxId = 0n;
    for (const row of v) {
      if (row.id !== undefined && typeof row.id === 'bigint' && row.id > maxId) maxId = row.id;
      if (row.scheduledId !== undefined && typeof row.scheduledId === 'bigint' && row.scheduledId > maxId) maxId = row.scheduledId;
    }
    nextIds[k] = maxId + 1n;
  }

  function getTable(name: string): any[] {
    return (tables[name] ??= []);
  }

  function getNextId(name: string): bigint {
    const id = nextIds[name] ?? 1n;
    nextIds[name] = id + 1n;
    return id;
  }

  // Build an index accessor for a given table + column
  function indexFor(tableName: string, column: string, label: string = column) {
    return {
      filter: (value: any) =>
        getTable(tableName).filter((r: any) => r[column] === value),
      find: (value: any) =>
        getTable(tableName).find((r: any) => r[column] === value),
      update: (row: any) => {
        const arr = getTable(tableName);
        const idx = arr.findIndex((r: any) => r[column] === row[column]);
        if (idx >= 0) arr[idx] = row;
        else if (strict) throw new Error(`strict mock: update on ${tableName}.${label} matched no row (real update throws)`);
      },
      delete: (value: any) => {
        const arr = getTable(tableName);
        const idx = arr.findIndex((r: any) => r[column] === value);
        if (idx >= 0) arr.splice(idx, 1);
      },
    };
  }

  // Known index-name to column-name mapping (from codebase analysis)
  const INDEX_TO_COLUMN: Record<string, string> = {
    by_owner: 'ownerId',
    by_location: 'locationId',
    by_character: 'characterId',
    by_from: 'fromLocationId',
    by_to: 'toLocationId',
    by_combat: 'combatId',
    by_instance: 'instanceId',
    by_vendor: 'vendorNpcId',
    by_event: 'eventId',
    by_spawn: 'spawnId',
    by_name: 'name',
    by_player: 'playerId',
    by_score: 'score',
    by_group: 'groupId',
    by_dedupe_key: 'dedupeKey',
    by_status: 'status',
    by_job: 'jobId',
  };

  return new Proxy({} as any, {
    get: (_: any, tableName: string) => {
      if (tableName === '_tables') return tables;

      const spec = strict ? strictTableSpec(tableName) : undefined;
      const requireSpec = (what: string) => {
        if (strict && !spec) {
          throw new Error(
            `strict mock: ${what} on unknown table "${tableName}" (not in the recorded schema; import ../schema/tables first?)`,
          );
        }
      };
      return new Proxy({} as any, {
        get: (_: any, prop: string) => {
          if (strict && typeof prop === 'symbol') return undefined;
          // Strict mode: only real index and key accessors exist on a table.
          if (strict && prop !== 'insert' && prop !== 'iter' && prop !== '_rows') {
            requireSpec(`accessor "${prop}"`);
            if (spec && Object.prototype.hasOwnProperty.call(spec.indexes, prop)) {
              return indexFor(tableName, spec.indexes[prop], prop);
            }
            if (spec && spec.keys.includes(prop)) return indexFor(tableName, prop, prop);
            throw new Error(
              `strict mock: "${prop}" is not an index or key accessor on ${tableName} ` +
                `(indexes: ${Object.keys(spec?.indexes ?? {}).join(', ') || 'none'}; keys: ${(spec?.keys ?? []).join(', ') || 'none'})`,
            );
          }
          if (strict && (prop === 'insert' || prop === 'iter')) requireSpec(prop);
          // insert: auto-increment 0n IDs, push to table, return row
          if (prop === 'insert') {
            return (row: any) => {
              const r = { ...row };
              if (r.id === 0n) r.id = getNextId(tableName);
              if (r.scheduledId === 0n) r.scheduledId = getNextId(tableName);
              getTable(tableName).push(r);
              return r;
            };
          }
          // iter: return the array (iterable)
          if (prop === 'iter') {
            return () => getTable(tableName);
          }
          // _rows: raw array access for test assertions
          if (prop === '_rows') {
            return () => getTable(tableName);
          }
          // Named indexes: by_owner, by_location, etc.
          if (prop.startsWith('by_')) {
            const column = INDEX_TO_COLUMN[prop];
            if (column) return indexFor(tableName, column);
            // Fallback: by_X -> column XId
            const guessCol = prop.slice(3) + 'Id';
            return indexFor(tableName, guessCol);
          }
          // Primary key accessors: .id, .identity, .scheduledId
          if (prop === 'id' || prop === 'identity' || prop === 'scheduledId') {
            return indexFor(tableName, prop);
          }
          // Unknown property -- return index accessor for it
          return indexFor(tableName, prop);
        },
      });
    },
  });
}

export function createMockCtx(opts: {
  seed?: Record<string, any[]>;
  sender?: any;
  timestampMicros?: bigint;
  /** Opt-in strict db (see MockDbOptions). Default false: existing tests behave as before. */
  strict?: boolean;
  /** The module identity, distinct from the sender (lets tests prove a module-identity guard). */
  databaseIdentity?: any;
} = {}) {
  return {
    db: createMockDb(opts.seed ?? {}, { strict: opts.strict }),
    timestamp: { microsSinceUnixEpoch: opts.timestampMicros ?? 1_000_000_000_000n },
    sender: opts.sender ?? { toHexString: () => 'mock-identity-hex' },
    databaseIdentity: opts.databaseIdentity ?? { toHexString: () => 'module-identity-hex' },
  };
}

// ---------------------------------------------------------------------------
// Procedure context mock (QUAL-04)
// ---------------------------------------------------------------------------

export type MockReply = {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string | object;
  /** Advance the mock clock by this many micros before fetch returns (models call latency). */
  advanceMicros?: bigint;
};

export type MockThrow = {
  throw: 'timeout' | Error;
  /** Advance the mock clock by this many micros before fetch throws. */
  advanceMicros?: bigint;
};

export type MockFetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  timeoutMs: number | undefined;
};

export type MockProcCtxOptions = {
  seed?: Record<string, any[]>;
  sender?: any;
  timestampMicros?: bigint;
  responses?: Array<MockReply | MockThrow>;
  withTxReinvoke?: number;
  /** Opt-in strict db (see MockDbOptions). Default false. */
  strict?: boolean;
  /** The module identity. Defaults to the sender (unchanged behavior). */
  databaseIdentity?: any;
};

/**
 * Build a stand-in for the platform SyncResponse. Mirrors the real class
 * surface: status, ok, statusText, headers (case-insensitive), text(), json(),
 * bytes(). Object bodies are JSON-stringified; json() throws on invalid JSON.
 */
export function makeSyncResponse(reply: MockReply) {
  const bodyText =
    reply.body === undefined
      ? ''
      : typeof reply.body === 'string'
        ? reply.body
        : JSON.stringify(reply.body);
  const headers = new Headers(reply.headers ?? {});
  return {
    status: reply.status,
    ok: reply.status >= 200 && reply.status < 300,
    statusText: reply.statusText ?? '',
    headers,
    url: '',
    type: 'basic' as const,
    text: () => bodyText,
    json: () => JSON.parse(bodyText),
    bytes: () => new TextEncoder().encode(bodyText),
    arrayBuffer: () => new TextEncoder().encode(bodyText).buffer,
  };
}

/**
 * Fake SpacetimeDB ProcedureCtx. Deliberately has NO `ctx.db` (the real
 * ProcedureCtx has none), a scripted FIFO `http.fetch`, a synchronous-only
 * `withTx` that can be re-invoked N extra times with state restored between
 * runs (the platform may retry a transaction), and a module-identity sender.
 */
export function createMockProcCtx(opts: MockProcCtxOptions = {}) {
  const db = createMockDb(opts.seed ?? {}, { strict: opts.strict });
  let now = opts.timestampMicros ?? 1_000_000_000_000n;
  const moduleIdentity = opts.sender ?? { toHexString: () => 'module-identity-hex' };
  const queue: Array<MockReply | MockThrow> = [...(opts.responses ?? [])];
  const calls: MockFetchCall[] = [];

  function snapshotTables(): Record<string, any[]> {
    const tables = db._tables as Record<string, any[]>;
    const snap: Record<string, any[]> = {};
    for (const [name, rows] of Object.entries(tables)) {
      snap[name] = rows.map((r) => ({ ...r }));
    }
    return snap;
  }

  function restoreTables(snap: Record<string, any[]>): void {
    const tables = db._tables as Record<string, any[]>;
    for (const name of Object.keys(tables)) {
      if (!(name in snap)) delete tables[name];
    }
    for (const [name, rows] of Object.entries(snap)) {
      const arr = (tables[name] ??= []);
      arr.length = 0;
      for (const r of rows) arr.push({ ...r });
    }
  }

  const ctx = {
    sender: moduleIdentity,
    identity: moduleIdentity,
    databaseIdentity: opts.databaseIdentity ?? moduleIdentity,
    connectionId: null as any,
    get timestamp() {
      return { microsSinceUnixEpoch: now };
    },
    http: {
      fetch(url: string, init: any = {}) {
        const timeout = init.timeout;
        calls.push({
          url,
          method: init.method ?? 'GET',
          headers: { ...(init.headers ?? {}) },
          body: init.body,
          timeoutMs: timeout ? Number(timeout.micros / 1000n) : undefined,
        });
        const next = queue.shift();
        if (!next) throw new Error('mock fetch: no scripted response left');
        now += next.advanceMicros ?? 0n;
        if ('throw' in next) {
          throw next.throw === 'timeout' ? new Error('operation timed out') : next.throw;
        }
        return makeSyncResponse(next);
      },
    },
    withTx<T>(body: (tx: any) => T): T {
      const runs = 1 + (opts.withTxReinvoke ?? 0);
      let result!: T;
      for (let i = 0; i < runs; i++) {
        const snap = snapshotTables();
        try {
          result = body({
            db,
            get timestamp() {
              return { microsSinceUnixEpoch: now };
            },
            sender: ctx.sender,
          });
          if (result && typeof (result as any).then === 'function') {
            throw new Error('withTx callback returned a Promise: withTx must be synchronous');
          }
        } catch (e) {
          restoreTables(snap);
          throw e;
        }
        if (i < runs - 1) restoreTables(snap);
      }
      return result;
    },
  };

  return {
    ctx,
    db,
    http: { calls, remaining: () => queue.length },
    clock: {
      advance: (micros: bigint) => {
        now += micros;
      },
      now: () => now,
    },
  };
}
