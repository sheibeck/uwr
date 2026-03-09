/**
 * Shared mock DB utilities for SpacetimeDB unit tests.
 *
 * Provides a Proxy-based auto-creating mock that simulates
 * ctx.db table operations (insert, find, filter, update, delete, iter)
 * without requiring the SpacetimeDB WASM runtime.
 */

export function createMockDb(seed: Record<string, any[]> = {}) {
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
  function indexFor(tableName: string, column: string) {
    return {
      filter: (value: any) =>
        getTable(tableName).filter((r: any) => r[column] === value),
      find: (value: any) =>
        getTable(tableName).find((r: any) => r[column] === value),
      update: (row: any) => {
        const arr = getTable(tableName);
        const idx = arr.findIndex((r: any) => r[column] === row[column]);
        if (idx >= 0) arr[idx] = row;
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
  };

  return new Proxy({} as any, {
    get: (_: any, tableName: string) => {
      if (tableName === '_tables') return tables;

      return new Proxy({} as any, {
        get: (_: any, prop: string) => {
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
} = {}) {
  return {
    db: createMockDb(opts.seed ?? {}),
    timestamp: { microsSinceUnixEpoch: opts.timestampMicros ?? 1_000_000_000_000n },
    sender: opts.sender ?? { toHexString: () => 'mock-identity-hex' },
  };
}
