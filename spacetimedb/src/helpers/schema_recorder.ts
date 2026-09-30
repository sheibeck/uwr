/**
 * TEST-ONLY. Never import this module from production code (anything the
 * `spacetime build` bundler can reach). It must not import the real SpacetimeDB
 * server entry or vitest.
 *
 * A recording stand-in for `spacetimedb/server`, so plain Node vitest can load
 * `schema/tables.ts` and `index.ts`:
 *   - records every `table(opts, cols)` call (options plus per-column flags),
 *   - captures reducer / view / procedure handlers as callable functions,
 *   - validates inserted rows against the recorded columns (the guard against
 *     the PIPE-08 bug class: a mock DB that accepts any column name),
 *   - serializes a mock DB to a stable string for before/after comparisons.
 *
 * Usage in a test file:
 *   vi.mock('spacetimedb/server', async () =>
 *     (await import('./schema_recorder')).createRecordingServerMock());
 *   const tablesMod = await import('../schema/tables');
 */

export interface ColumnInfo {
  kind: string;
  optional: boolean;
  primaryKey: boolean;
  autoInc: boolean;
  unique: boolean;
}

export interface RecordedTable {
  name: string;
  opts: any;
  cols: Record<string, ColumnInfo>;
}

export interface CapturedView {
  opts: any;
  returnType: any;
  fn: (...args: any[]) => any;
}

const recorded: RecordedTable[] = [];
const reducers = new Map<string, (...args: any[]) => any>();
const views: CapturedView[] = [];
const procedures = new Map<string, (...args: any[]) => any>();

const BUILDER_STATE_KEY = '__recordedColumn';
const FLAG_METHODS = new Set(['optional', 'primaryKey', 'autoInc', 'unique']);

/** A chainable column builder that records kind and the four flags we care about. */
function makeBuilder(kind: string): any {
  const state: ColumnInfo = {
    kind,
    optional: false,
    primaryKey: false,
    autoInc: false,
    unique: false,
  };
  const proxy: any = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === BUILDER_STATE_KEY) return state;
      // Never look like a thenable or an iterable to await / spread / JSON.
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
      if (typeof prop === 'string' && FLAG_METHODS.has(prop)) {
        return () => {
          (state as any)[prop] = true;
          return proxy;
        };
      }
      // Any other method (.default(), .index(), .name(), ...) stays chainable.
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

function columnInfoOf(builder: any): ColumnInfo {
  const state = builder?.[BUILDER_STATE_KEY];
  return state
    ? { ...state }
    : { kind: 'unknown', optional: false, primaryKey: false, autoInc: false, unique: false };
}

function nameOf(nameOrOpts: any): string {
  return typeof nameOrOpts === 'string' ? nameOrOpts : nameOrOpts?.name;
}

function lastFunction(args: any[]): ((...a: any[]) => any) | undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === 'function') return args[i];
  }
  return undefined;
}

/** Result of a vi.mock('spacetimedb/server') factory. */
export function createRecordingServerMock() {
  const t: any = new Proxy(
    {},
    {
      get(_target, kind) {
        if (typeof kind === 'symbol' || kind === 'then') return undefined;
        return (..._args: any[]) => makeBuilder(String(kind));
      },
    },
  );

  const table = (opts: any, cols: any) => {
    const infos: Record<string, ColumnInfo> = {};
    for (const [key, builder] of Object.entries(cols ?? {})) {
      infos[key] = columnInfoOf(builder);
    }
    recorded.push({ name: opts?.name, opts, cols: infos });
    return { opts, cols, rowType: {} };
  };

  // Real functions (not arrow-only stubs) because index.ts rebinds them via _wrapMethod.
  const schema = (defs: any) => {
    const mod: any = {
      __defs: defs,
      reducer(nameOrOpts: any, ...rest: any[]) {
        const name = nameOf(nameOrOpts);
        const fn = lastFunction(rest);
        if (name && fn) reducers.set(name, fn);
        return { __reducer: name };
      },
      view(opts: any, returnType: any, fn: any) {
        views.push({ opts, returnType, fn });
        return { __view: opts?.name };
      },
      anonymousView(opts: any, returnType: any, fn: any) {
        views.push({ opts, returnType, fn });
        return { __view: opts?.name };
      },
      procedure(...args: any[]) {
        const name = typeof args[0]?.name === 'string' ? args[0].name : typeof args[0] === 'string' ? args[0] : undefined;
        const fn = lastFunction(args);
        if (name && fn) procedures.set(name, fn);
        return { __procedure: name };
      },
      init(fn?: any) {
        if (typeof fn === 'function') reducers.set('__init__', fn);
        return { __init: true };
      },
      clientConnected(fn?: any) {
        if (typeof fn === 'function') reducers.set('__client_connected__', fn);
        return { __clientConnected: true };
      },
      clientDisconnected(fn?: any) {
        if (typeof fn === 'function') reducers.set('__client_disconnected__', fn);
        return { __clientDisconnected: true };
      },
      exportGroup() {
        return {};
      },
    };
    return mod;
  };

  class SenderError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'SenderError';
    }
  }

  return { t, table, schema, SenderError };
}

/** First recorded table with this name, or undefined. */
export function recordedTable(name: string): RecordedTable | undefined {
  return recorded.find((r) => r.name === name);
}

/** What a strict mock DB may touch on one table: real index accessors and key accessors. */
export interface StrictTableSpec {
  /** Declared btree index accessor to the column its filter matches (the first index column). */
  indexes: Record<string, string>;
  /** Primary-key and unique column names; each is also an accessor (find/update/delete). */
  keys: string[];
}

/**
 * The accessors real SpacetimeDB generates for a recorded table, or undefined when the
 * table was never recorded (import schema/tables first). Feeds createMockDb's strict mode.
 */
export function strictTableSpec(tableName: string): StrictTableSpec | undefined {
  const rec = recordedTable(tableName);
  if (!rec) return undefined;
  const indexes: Record<string, string> = {};
  for (const idx of rec.opts?.indexes ?? []) {
    const accessor = idx?.accessor ?? idx?.name;
    const column = Array.isArray(idx?.columns) ? idx.columns[0] : undefined;
    if (typeof accessor === 'string' && typeof column === 'string') indexes[accessor] = column;
  }
  const keys = Object.entries(rec.cols)
    .filter(([, info]) => info.primaryKey || info.unique)
    .map(([col]) => col);
  return { indexes, keys };
}

export function recordedTables(): RecordedTable[] {
  return [...recorded];
}

/**
 * Problems with an inserted row relative to the recorded table definition:
 * unknown table, unknown column keys, and missing required columns
 * (neither optional nor autoInc). Empty array means the row is well-formed.
 */
export function rowColumnProblems(tableName: string, row: Record<string, unknown>): string[] {
  const rec = recordedTable(tableName);
  if (!rec) return [`unknown table ${tableName}`];
  const problems: string[] = [];
  for (const key of Object.keys(row)) {
    if (!(key in rec.cols)) problems.push(`unknown column ${key}`);
  }
  for (const [col, info] of Object.entries(rec.cols)) {
    if (info.optional || info.autoInc) continue;
    if (!(col in row)) problems.push(`missing column ${col}`);
  }
  return problems;
}

export function capturedReducer(name: string): ((...args: any[]) => any) | undefined {
  return reducers.get(name);
}

export function capturedViews(): CapturedView[] {
  return [...views];
}

export function capturedProcedure(name: string): ((...args: any[]) => any) | undefined {
  return procedures.get(name);
}

function serialize(v: any): any {
  if (typeof v === 'bigint') return `${v}n`;
  if (typeof v === 'function') return undefined;
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toHexString === 'function') return `identity:${v.toHexString()}`;
  if ('microsSinceUnixEpoch' in v) return `ts:${v.microsSinceUnixEpoch}n`;
  if (Array.isArray(v)) return v.map((x) => serialize(x) ?? null);
  const out: Record<string, any> = {};
  for (const key of Object.keys(v).sort()) {
    const s = serialize(v[key]);
    if (s !== undefined) out[key] = s;
  }
  return out;
}

/** Stable, bigint- and identity-safe serialization of a createMockDb database. */
export function snapshotDb(db: any): string {
  const tables: Record<string, any[]> = db._tables;
  const out: Record<string, any> = {};
  for (const name of Object.keys(tables).sort()) {
    out[name] = tables[name].map((row) => serialize(row));
  }
  return JSON.stringify(out);
}
