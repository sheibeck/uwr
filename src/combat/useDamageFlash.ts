import { onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { prefersReducedMotion } from '../console/pinning';
import { barFraction } from '../frame/vitals';

// HP drop flash for the active character's vitals (48-UI-SPEC "Damage flash", A19, CMB-05).
//
// A drop between two consecutive HP values of the same character sets a short-lived state:
// `active` (the color state, 600 ms), `ghost` (the lost chunk of the track, same 600 ms) and
// `delta` (the summed loss, cleared 1500 ms after the last drop). Healing, the first value and
// a character switch never flash. Under reduced motion the same state is used as a timed
// class: `reduced` tells the component to bind the static class and declare no animation.
// There is no DOM access here; components bind the refs.
//
// `key` and `hp` should come from the same character row so a switch updates both together.
// Call inside a component setup or an effect scope: both timers are cleared on scope dispose.

export const FLASH_COLOR_MS = 600;
export const DELTA_MS = 1500;

export interface DamageFlash {
  active: Readonly<Ref<boolean>>;
  reduced: Readonly<Ref<boolean>>;
  delta: Readonly<Ref<bigint | null>>;
  ghost: Readonly<Ref<{ left: string; width: string } | null>>;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 10000) / 100}%`;
}

export function useDamageFlash(source: {
  hp: () => bigint;
  maxHp: () => bigint;
  key: () => bigint | null;
}): DamageFlash {
  const active = ref(false);
  const reduced = ref(false);
  const delta = ref<bigint | null>(null);
  const ghost = ref<{ left: string; width: string } | null>(null);

  let colorTimer: ReturnType<typeof setTimeout> | null = null;
  let deltaTimer: ReturnType<typeof setTimeout> | null = null;
  let seen = false;
  let lastKey: bigint | null = null;
  let lastHp = 0n;

  function clearColorTimer(): void {
    if (colorTimer !== null) {
      clearTimeout(colorTimer);
      colorTimer = null;
    }
  }

  function clearDeltaTimer(): void {
    if (deltaTimer !== null) {
      clearTimeout(deltaTimer);
      deltaTimer = null;
    }
  }

  function reset(): void {
    clearColorTimer();
    clearDeltaTimer();
    active.value = false;
    ghost.value = null;
    delta.value = null;
  }

  watch(
    [() => source.key(), () => source.hp()] as const,
    ([key, hp]) => {
      // First value, or another character: remember it and compare from here on. A pending
      // flash belonged to the previous character, so it is dropped.
      if (!seen || key !== lastKey) {
        if (seen) reset();
        seen = true;
        lastKey = key;
        lastHp = hp;
        return;
      }
      const previous = lastHp;
      lastHp = hp;
      if (hp >= previous) return; // a heal or no change never flashes

      const lost = previous - hp;
      const max = source.maxHp();
      ghost.value = { left: percent(barFraction(hp, max)), width: percent(barFraction(lost, max)) };
      reduced.value = prefersReducedMotion();
      active.value = true;
      delta.value = (delta.value ?? 0n) + lost;

      clearColorTimer();
      colorTimer = setTimeout(() => {
        colorTimer = null;
        active.value = false;
        ghost.value = null;
      }, FLASH_COLOR_MS);

      clearDeltaTimer();
      deltaTimer = setTimeout(() => {
        deltaTimer = null;
        delta.value = null;
      }, DELTA_MS);
    },
    { immediate: true, flush: 'sync' },
  );

  onScopeDispose(() => {
    clearColorTimer();
    clearDeltaTimer();
  });

  return { active, reduced, delta, ghost };
}
