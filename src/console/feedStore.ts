// The console feed store: an in-memory, capped, per-character history.
//
// CONTEXT "History and reload": history lives in memory only (about 300 lines), nothing is
// persisted, and a reload starts empty. Research "Store behavior": rows are batched per tick,
// ordered, deduped by (source, id), and filtered once more on the client.
//
// - ingest() buffers a server row; one flush per tick (microtask by default) appends the batch
//   sorted by createdAt, then source (private, location, group, world), then id.
// - appendLocal() appends at send time and is never re-sorted with server rows.
// - A row already in the store or the pending batch (same source and id) is ignored, so a
//   resubscribe never duplicates a line. The same id in two sources is two entries.
// - setCharacter() with a different id clears the history and the pending batch, so rows
//   buffered for the old character never land. With no active character nothing is accepted.
// - The cap counts lines: an entry with N segments counts N. The oldest entries drop first.
//
// acceptRow is the second, client-side filter after the server-side subscription filters
// (T-47-04a; research Pitfall 9):
//   private  - presence rows (by ownerUserId, not character) or rows for the active character
//   location - rows not excluding the active character
//   group    - the active character's own rows only when kind is 'group' (research A3: the
//              server writes the author's other group rows to the private feed too)
//   world    - everything
//
// Pure apart from Vue refs: no connection, no timers beyond the injected scheduler.

import { ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';

export const FEED_LINE_CAP = 300;

export type FeedSource = 'private' | 'location' | 'group' | 'world' | 'local';
export type LocalKind = 'echo' | 'system' | 'look';

export interface SegmentRowLike {
  kind: string;
  speaker: string;
  text: string;
  speakerNpcId?: bigint | null;
}

export interface EventRowLike {
  id: bigint;
  kind: string;
  message: string;
  createdAt: { microsSinceUnixEpoch: bigint };
  segments?: readonly SegmentRowLike[] | null;
  characterId?: bigint;
  excludeCharacterId?: bigint | null;
}

/** Structurally compatible with LineSource in ./lines. */
export interface FeedEntry {
  key: string;
  source: FeedSource;
  id: bigint;
  kind: string;
  message: string;
  segments: readonly SegmentRowLike[] | null;
  characterId: bigint | null;
  createdAtMicros: bigint;
  queued: boolean;
  /** Lines this entry counts toward the cap (segment count, else 1). */
  lineCount: number;
}

export interface FeedStore {
  readonly entries: Readonly<ShallowRef<readonly FeedEntry[]>>;
  readonly characterId: Readonly<Ref<bigint | null>>;
  /** Clears history and the pending batch when the id changes. */
  setCharacter(id: bigint | null): void;
  /** Buffered; flushed in a microtask. */
  ingest(source: Exclude<FeedSource, 'local'>, row: EventRowLike): void;
  /** Returns the entry key. */
  appendLocal(kind: LocalKind, message: string, options?: { queued?: boolean }): string;
  setQueued(key: string, queued: boolean): void;
  remove(key: string): void;
  clear(): void;
  /** Flush the pending batch now. */
  flush(): void;
}

const SOURCE_RANK: Record<Exclude<FeedSource, 'local'>, number> = {
  private: 0,
  location: 1,
  group: 2,
  world: 3,
};

export function acceptRow(
  source: Exclude<FeedSource, 'local'>,
  row: EventRowLike,
  characterId: bigint | null,
): boolean {
  if (characterId === null) return false;
  switch (source) {
    case 'private':
      return row.kind === 'presence' || row.characterId === characterId;
    case 'location':
      return row.excludeCharacterId === undefined || row.excludeCharacterId === null
        ? true
        : row.excludeCharacterId !== characterId;
    case 'group':
      return !(row.characterId === characterId && row.kind !== 'group');
    case 'world':
      return true;
    default:
      return false;
  }
}

function segmentsOf(row: EventRowLike): readonly SegmentRowLike[] | null {
  return row.segments ?? null;
}

function lineCountOf(segments: readonly SegmentRowLike[] | null): number {
  return segments !== null && segments.length > 0 ? segments.length : 1;
}

function compareBatch(a: FeedEntry, b: FeedEntry): number {
  if (a.createdAtMicros !== b.createdAtMicros) return a.createdAtMicros < b.createdAtMicros ? -1 : 1;
  const rankA = SOURCE_RANK[a.source as Exclude<FeedSource, 'local'>] ?? 0;
  const rankB = SOURCE_RANK[b.source as Exclude<FeedSource, 'local'>] ?? 0;
  if (rankA !== rankB) return rankA - rankB;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function createFeedStore(options: { cap?: number; schedule?: (fn: () => void) => void } = {}): FeedStore {
  const cap = options.cap ?? FEED_LINE_CAP;
  const schedule = options.schedule ?? ((fn: () => void) => queueMicrotask(fn));

  const entries = shallowRef<readonly FeedEntry[]>([]);
  const characterId = ref<bigint | null>(null);

  let pending: FeedEntry[] = [];
  const pendingKeys = new Set<string>();
  const knownKeys = new Set<string>();
  let scheduled = false;
  let localCounter = 0;

  function enforceCap(list: FeedEntry[]): FeedEntry[] {
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

  function reset(): void {
    entries.value = [];
    pending = [];
    pendingKeys.clear();
    knownKeys.clear();
  }

  function flush(): void {
    scheduled = false;
    if (pending.length === 0) return;
    const batch = pending.slice().sort(compareBatch);
    pending = [];
    pendingKeys.clear();
    for (const entry of batch) knownKeys.add(entry.key);
    entries.value = enforceCap([...entries.value, ...batch]);
  }

  return {
    entries,
    characterId,
    setCharacter(id) {
      if (characterId.value === id) return;
      characterId.value = id;
      reset();
    },
    ingest(source, row) {
      if (!acceptRow(source, row, characterId.value)) return;
      const key = `${source}:${row.id}`;
      if (knownKeys.has(key) || pendingKeys.has(key)) return;
      const segments = segmentsOf(row);
      pendingKeys.add(key);
      pending.push({
        key,
        source,
        id: row.id,
        kind: row.kind,
        message: row.message,
        segments,
        characterId: row.characterId ?? null,
        createdAtMicros: row.createdAt.microsSinceUnixEpoch,
        queued: false,
        lineCount: lineCountOf(segments),
      });
      if (!scheduled) {
        scheduled = true;
        schedule(flush);
      }
    },
    appendLocal(kind, message, opts) {
      localCounter += 1;
      const key = `local:${localCounter}`;
      const entry: FeedEntry = {
        key,
        source: 'local',
        id: BigInt(localCounter),
        kind,
        message,
        segments: null,
        characterId: null,
        createdAtMicros: BigInt(Date.now()) * 1000n,
        queued: opts?.queued === true,
        lineCount: 1,
      };
      knownKeys.add(key);
      entries.value = enforceCap([...entries.value, entry]);
      return key;
    },
    setQueued(key, queued) {
      const index = entries.value.findIndex((e) => e.key === key);
      if (index === -1 || entries.value[index].queued === queued) return;
      const next = entries.value.slice();
      next[index] = { ...next[index], queued };
      entries.value = next;
    },
    remove(key) {
      if (!knownKeys.has(key)) return;
      knownKeys.delete(key);
      entries.value = entries.value.filter((e) => e.key !== key);
    },
    clear() {
      reset();
    },
    flush,
  };
}
