import { ref } from 'vue';
import type { Ref } from 'vue';

// Cooldowns and event deadlines are server times. The skew is estimated from live
// event rows (createdAt of a just-inserted row): the latest sample wins, default 0.

export interface ServerClock {
  /** Estimated server minus client time, in microseconds. */
  readonly skewMicros: Readonly<Ref<number>>;
  sample(serverMicros: bigint): void;
  /** Estimated server time now, in microseconds. */
  nowMicros(): number;
}

export function createServerClock(now: () => number = Date.now): ServerClock {
  const skewMicros = ref(0);

  return {
    skewMicros,
    sample(serverMicros: bigint): void {
      skewMicros.value = Number(serverMicros) - now() * 1000;
    },
    nowMicros(): number {
      return now() * 1000 + skewMicros.value;
    },
  };
}
