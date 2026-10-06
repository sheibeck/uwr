import { computed, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import { useCooldownTicker } from '../hotbar/useCooldownTicker';
import type { ServerClock } from '../game/serverClock';
import { actionKeys, actionProgress, actionStartMicros, currentAction } from './actionProgress';
import type {
  AbilityRow,
  ActionProgress,
  ActionSources,
  ActionView,
  CastRow,
  GatherRow,
  NodeRow,
} from './actionProgress';

// First-seen tracking per row plus the single shared ticker for the action row (quick task
// 261006-a13). Call it inside a component setup or an effect scope: the watch and the interval are
// stopped on scope dispose.

export interface ActionProgressInput {
  characterId: Readonly<Ref<bigint | null>>;
  gathers: Readonly<Ref<readonly GatherRow[]>>;
  casts: Readonly<Ref<readonly CastRow[]>>;
  nodes: Readonly<Ref<readonly NodeRow[]>>;
  abilities: Readonly<Ref<readonly AbilityRow[]>>;
  /** The Phase 48 round row owns the composer slot during the character's own fight. */
  inCombat: Readonly<Ref<boolean>>;
  /** The Phase 47 server clock: first-seen is kept in client time and re-based with the current skew. */
  clock: Pick<ServerClock, 'nowMicros' | 'skewMicros'>;
}

export function useActionProgress(input: ActionProgressInput): {
  action: Readonly<Ref<ActionView | null>>;
  progress: Readonly<Ref<ActionProgress | null>>;
} {
  const sources = computed<ActionSources>(() => ({
    characterId: input.characterId.value,
    gathers: input.gathers.value,
    casts: input.casts.value,
    nodes: input.nodes.value,
    abilities: input.abilities.value,
  }));

  // Row key -> CLIENT-clock microseconds at which the row was first seen. Client time never moves
  // when the skew estimate changes; every read adds the current skew, so the start and the end of the
  // bar always share one estimate. Covers every row of the character, so a gather keeps its start
  // while a cast is shown over it; a key that is gone is dropped.
  const firstSeen = shallowRef<ReadonlyMap<string, number>>(new Map());
  const signature = computed(() => actionKeys(sources.value).join('|'));

  watch(
    signature,
    () => {
      const keys = actionKeys(sources.value);
      const previous = firstSeen.value;
      const next = new Map<string, number>();
      let changed = keys.length !== previous.size;
      for (const key of keys) {
        const seen = previous.get(key);
        if (seen === undefined) {
          next.set(key, input.clock.nowMicros() - input.clock.skewMicros.value);
          changed = true;
        } else {
          next.set(key, seen);
        }
      }
      if (changed) firstSeen.value = next;
    },
    { immediate: true, flush: 'sync' },
  );

  const action = computed<ActionView | null>(() => (input.inCombat.value ? null : currentAction(sources.value)));

  // The one ticker: 250 ms (1 s under reduced motion), only while an action is shown. It samples
  // client time too, so a skew change moves now and the start together.
  const ticker = useCooldownTicker({
    clock: { nowMicros: () => input.clock.nowMicros() - input.clock.skewMicros.value },
    active: computed(() => action.value !== null),
  });

  const progress = computed<ActionProgress | null>(() => {
    const view = action.value;
    if (view === null) return null;
    const skew = input.clock.skewMicros.value;
    const tick = ticker.nowMicros.value + skew;
    const seenClient = firstSeen.value.get(view.key);
    const seen = seenClient === undefined ? tick : seenClient + skew;
    // The ticker can lag the row's arrival by up to a tick (a cast replacing a running gather does not
    // restart it): never read a time before the action was first seen, or the seconds exceed the total.
    const now = Math.max(tick, seen);
    return actionProgress(view.endsAtMicros, actionStartMicros(view, seen), now);
  });

  return { action, progress };
}
