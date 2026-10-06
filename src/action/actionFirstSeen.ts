import { computed, getCurrentScope, onScopeDispose, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import { actionRowKeys } from './actionProgress';

// The first-seen map of the action row (quick task 261006-a13), kept at the data layer so a FeedShell
// remount (the desktop breakpoint, a mobile sheet) never restarts a bar mid-action.
//
// Row key ('gather:{id}' / 'cast:{id}') -> CLIENT-clock microseconds at which the row first appeared.
// Keyed by row id, so a row of another character can never collide; an entry is dropped as soon as its
// row is gone; reset() empties it (logout, connection reset). The map is replaced, never mutated, so
// readers react to a change.

export type ActionFirstSeen = Readonly<Ref<ReadonlyMap<string, number>>>;

export interface ActionFirstSeenOptions {
  gathers: Readonly<Ref<readonly { id: bigint }[]>>;
  casts: Readonly<Ref<readonly { id: bigint }[]>>;
  /** Client epoch microseconds, not the skew-corrected server estimate. */
  now: () => number;
}

export function createActionFirstSeen(options: ActionFirstSeenOptions): {
  firstSeen: ActionFirstSeen;
  reset(): void;
  stop(): void;
} {
  const firstSeen = shallowRef<ReadonlyMap<string, number>>(new Map());
  const signature = computed(() => actionRowKeys(options.gathers.value, options.casts.value).join('|'));

  // Synchronous, so a row's first-seen time is the moment it arrives, before any render or tick.
  const stop = watch(
    signature,
    () => {
      const keys = actionRowKeys(options.gathers.value, options.casts.value);
      const previous = firstSeen.value;
      const next = new Map<string, number>();
      let changed = keys.length !== previous.size;
      for (const key of keys) {
        const seen = previous.get(key);
        if (seen === undefined) {
          next.set(key, options.now());
          changed = true;
        } else {
          next.set(key, seen);
        }
      }
      if (changed) firstSeen.value = next;
    },
    { immediate: true, flush: 'sync' },
  );
  if (getCurrentScope()) onScopeDispose(stop);

  function reset(): void {
    if (firstSeen.value.size > 0) firstSeen.value = new Map();
  }

  return { firstSeen, reset, stop };
}
