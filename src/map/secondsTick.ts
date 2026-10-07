import { onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';

// One shared 1-second tick for the travel timers (51-UI-SPEC "Timers"). It samples the server
// clock once a second and only while a timer runs, so an idle Map costs nothing. Call it inside
// an effect scope: the interval is cleared on scope dispose.

export const SECOND_MS = 1000;

export interface SecondsTickOptions {
  clock: { nowMicros(): number };
  active: Readonly<Ref<boolean>>;
}

export function createSecondsTick(options: SecondsTickOptions): {
  nowMicros: Readonly<Ref<number>>;
  refresh(): void;
} {
  const nowMicros = ref(options.clock.nowMicros());
  let timer: ReturnType<typeof setInterval> | null = null;

  function refresh(): void {
    nowMicros.value = options.clock.nowMicros();
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(): void {
    if (timer !== null) return;
    // Catch up at once so a timer that just started does not wait a full second.
    refresh();
    timer = setInterval(refresh, SECOND_MS);
  }

  watch(
    options.active,
    (active) => {
      if (active) start();
      else stop();
    },
    { immediate: true },
  );

  onScopeDispose(stop);

  return { nowMicros, refresh };
}
