import { computed } from 'vue';
import type { Ref } from 'vue';
import type { PoolLevel, ResourceGather } from '../module_bindings/types';
import { useCooldownTicker } from '../hotbar/useCooldownTicker';
import type { ServerClock } from '../game/serverClock';
import type { ActionFirstSeen } from './actionFirstSeen';
import { actionProgress, actionStartMicros, currentAction } from './actionProgress';
import type {
  AbilityRow,
  ActionProgress,
  ActionSources,
  ActionView,
  CastRow,
  GatherRow,
  NodeRow,
} from './actionProgress';

/** A resource_gather row with its pool (51.3.1.1-18): poolId > 0 for a pool gather, 0 for a legacy node gather. */
export type PoolGatherRow = GatherRow & Pick<ResourceGather, 'poolId'>;
/** The pool name source: pool_level rows (game.poolLevels). */
export type PoolNameRow = Pick<PoolLevel, 'id' | 'name'>;

// The shown action, its progress and the single shared ticker for the action row (quick task
// 261006-a13). First-seen times come from the data layer (createActionFirstSeen), so they survive a
// remount. Call it inside a component setup or an effect scope: the interval is stopped on scope dispose.

export interface ActionProgressInput {
  characterId: Readonly<Ref<bigint | null>>;
  gathers: Readonly<Ref<readonly PoolGatherRow[]>>;
  casts: Readonly<Ref<readonly CastRow[]>>;
  /** pool_level rows: a pool gather is labelled with the name of the row whose id is its poolId. */
  pools: Readonly<Ref<readonly PoolNameRow[]>>;
  abilities: Readonly<Ref<readonly AbilityRow[]>>;
  /** The Phase 48 round row owns the composer slot during the character's own fight. */
  inCombat: Readonly<Ref<boolean>>;
  /** The Phase 47 server clock: first-seen is kept in client time and re-based with the current skew. */
  clock: Pick<ServerClock, 'nowMicros' | 'skewMicros'>;
  /** Row key -> client microseconds at which the row first appeared; lives at the data layer. */
  firstSeen: ActionFirstSeen;
}

export function useActionProgress(input: ActionProgressInput): {
  action: Readonly<Ref<ActionView | null>>;
  progress: Readonly<Ref<ActionProgress | null>>;
} {
  // Resources are pools now (51.3.1.1-18) and resource_node is no longer subscribed. currentAction
  // names a gather by the node row whose id is its nodeId, so each pool gather gets a name row keyed
  // by a negative id (minus the gather row id, which no real node id can equal) and is passed with
  // that key as its nodeId. A legacy node gather keeps its nodeId and finds no row: 'Gathering'.
  const sources = computed<ActionSources>(() => {
    const gathers: GatherRow[] = [];
    const nodes: NodeRow[] = [];
    for (const gather of input.gathers.value) {
      if (gather.poolId <= 0n) {
        gathers.push(gather);
        continue;
      }
      const key = -gather.id;
      gathers.push({ ...gather, nodeId: key });
      const pool = input.pools.value.find((row) => row.id === gather.poolId);
      if (pool !== undefined) nodes.push({ id: key, name: pool.name });
    }
    return {
      characterId: input.characterId.value,
      gathers,
      casts: input.casts.value,
      nodes,
      abilities: input.abilities.value,
    };
  });

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
    const seenClient = input.firstSeen.value.get(view.key);
    const seen = seenClient === undefined ? tick : seenClient + skew;
    // The ticker can lag the row's arrival by up to a tick (a cast replacing a running gather does not
    // restart it): never read a time before the action was first seen, or the seconds exceed the total.
    const now = Math.max(tick, seen);
    return actionProgress(view.endsAtMicros, actionStartMicros(view, seen), now);
  });

  return { action, progress };
}
