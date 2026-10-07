import { computed, shallowRef } from 'vue';
import type { Ref } from 'vue';

// One in-flight travel guard per session (review WR-04, client rest): the rail's Here card, the mobile
// exit chips and the Map's Travel button all ask it before they send move_character, so a quick tap
// on a second surface cannot send a second move before the first one's character row arrives. The
// map hub owns it and ends it when the character's place (or the character) changes; a refused trip
// leaves the place unchanged, so the guard also lapses by itself after TRIP_LAPSE_MS. A rejected send
// ends it at once so "Try again" works.

export const TRIP_LAPSE_MS = 2000;

export interface TripGuard {
  /** A trip was sent and neither the place changed nor the lapse ran out. */
  readonly pending: Readonly<Ref<boolean>>;
  /** Starts a trip when none is pending and returns true; false (send nothing) while one is. */
  begin(): boolean;
  /** Ends the pending trip now (an arrival, a character switch, a rejected send). */
  end(): void;
}

export function createTripGuard(lapseMs: number = TRIP_LAPSE_MS): TripGuard {
  const pending = shallowRef(false);
  let lapse: ReturnType<typeof setTimeout> | null = null;

  function end(): void {
    if (lapse !== null) clearTimeout(lapse);
    lapse = null;
    pending.value = false;
  }

  function begin(): boolean {
    if (pending.value) return false;
    pending.value = true;
    lapse = setTimeout(() => {
      lapse = null;
      pending.value = false;
    }, lapseMs);
    return true;
  }

  return { pending: computed(() => pending.value), begin, end };
}
