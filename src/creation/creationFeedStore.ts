// The creation feed store: an in-memory, capped, ordered list of creation entries (event_creation
// rows plus the client's local echoes and errors). It is owned by the session-level creation hub,
// not by a component, so lines survive a remount of the view (RESEARCH Pitfall 7).
//
// - ingest() is synchronous: rows of one transaction share one createdAt and arrive in id order, so
//   no microtask batching is needed. A row already held (same id) is ignored.
// - A row that arrives out of order is placed by (createdAtMicros, id) among the trailing server
//   entries, scanning back no further than a local entry. A local entry is never moved.
// - The cap counts lines, as in the Phase 47 store: an entry with N segments counts N, and the
//   oldest entries drop first (at least one entry always stays).
//
// Pure apart from the Vue ref: no connection, no timers.

import { shallowRef } from 'vue';
import type { ShallowRef } from 'vue';
import { FEED_LINE_CAP } from '../console/feedStore';
import type { SegmentRowLike } from '../console/feedStore';

export interface EventCreationLike {
  id: bigint;
  kind: string;
  message: string;
  createdAt: { microsSinceUnixEpoch: bigint };
  segments?: readonly SegmentRowLike[] | null;
}

export interface CreationEntry {
  /** 'creation:{id}' for server rows, 'local:{n}' for local echoes and errors. */
  key: string;
  origin: 'server' | 'local';
  id: bigint;
  /** Server: the row kind. Local: 'echo' or 'error'. */
  kind: string;
  message: string;
  segments: readonly SegmentRowLike[] | null;
  createdAtMicros: bigint;
  /** Lines this entry counts toward the cap (segment count, else 1). */
  lineCount: number;
}

export interface CreationFeedStore {
  readonly entries: Readonly<ShallowRef<readonly CreationEntry[]>>;
  ingest(row: EventCreationLike): void;
  appendEcho(text: string): void;
  appendError(text: string): void;
  clear(): void;
}

function compareEntries(a: CreationEntry, b: CreationEntry): number {
  if (a.createdAtMicros !== b.createdAtMicros) return a.createdAtMicros < b.createdAtMicros ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function createCreationFeedStore(options: { cap?: number; now?: () => number } = {}): CreationFeedStore {
  const cap = options.cap ?? FEED_LINE_CAP;
  const now = options.now ?? Date.now;

  const entries = shallowRef<readonly CreationEntry[]>([]);
  const knownKeys = new Set<string>();
  let localCounter = 0;

  function enforceCap(list: CreationEntry[]): CreationEntry[] {
    let total = 0;
    for (const entry of list) total += entry.lineCount;
    let drop = 0;
    while (total > cap && drop < list.length - 1) {
      total -= list[drop].lineCount;
      knownKeys.delete(list[drop].key);
      drop += 1;
    }
    return drop > 0 ? list.slice(drop) : list;
  }

  function appendLocal(kind: 'echo' | 'error', message: string): void {
    localCounter += 1;
    const key = `local:${localCounter}`;
    knownKeys.add(key);
    const entry: CreationEntry = {
      key,
      origin: 'local',
      id: BigInt(localCounter),
      kind,
      message,
      segments: null,
      createdAtMicros: BigInt(now()) * 1000n,
      lineCount: 1,
    };
    entries.value = enforceCap([...entries.value, entry]);
  }

  return {
    entries,
    ingest(row) {
      const key = `creation:${row.id}`;
      if (knownKeys.has(key)) return;
      const segments = row.segments ?? null;
      const entry: CreationEntry = {
        key,
        origin: 'server',
        id: row.id,
        kind: row.kind,
        message: row.message,
        segments,
        createdAtMicros: row.createdAt.microsSinceUnixEpoch,
        lineCount: segments !== null && segments.length > 0 ? segments.length : 1,
      };
      knownKeys.add(key);
      const next = entries.value.slice();
      let at = next.length;
      while (at > 0 && next[at - 1].origin === 'server' && compareEntries(next[at - 1], entry) > 0) at -= 1;
      next.splice(at, 0, entry);
      entries.value = enforceCap(next);
    },
    appendEcho(text) {
      appendLocal('echo', text);
    },
    appendError(text) {
      appendLocal('error', text);
    },
    clear() {
      entries.value = [];
      knownKeys.clear();
    },
  };
}
