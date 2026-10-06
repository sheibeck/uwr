import { onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { prefersReducedMotion } from '../console/pinning';

// One shared ticker for every cooldown sweep (47-UI-SPEC "Cooldown data"): it samples the server
// clock every 250 ms (1 s under reduced motion) and only while something is cooling.
// Call it inside a component setup or an effect scope: the interval is cleared on scope dispose.

export const TICK_MS = 250;
export const TICK_MS_REDUCED = 1000;

export interface CooldownTickerOptions {
  clock: { nowMicros(): number };
  active: Readonly<Ref<boolean>>;
}

export function useCooldownTicker(options: CooldownTickerOptions): { nowMicros: Readonly<Ref<number>> } {
  const nowMicros = ref(options.clock.nowMicros());
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start(): void {
    if (timer !== null) return;
    // Catch up at once so a slot that started cooling does not wait a full tick.
    nowMicros.value = options.clock.nowMicros();
    timer = setInterval(() => {
      nowMicros.value = options.clock.nowMicros();
    }, prefersReducedMotion() ? TICK_MS_REDUCED : TICK_MS);
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

  return { nowMicros };
}
