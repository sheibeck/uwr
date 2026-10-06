import { computed } from 'vue';
import type { Ref } from 'vue';
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

// The shown action, its progress and the single shared ticker for the action row (quick task
// 261006-a13). First-seen times come from the data layer (createActionFirstSeen), so they survive a
// remount. Call it inside a component setup or an effect scope: the interval is stopped on scope dispose.

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
  /** Row key -> client microseconds at which the row first appeared; lives at the data layer. */
  firstSeen: ActionFirstSeen;
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
