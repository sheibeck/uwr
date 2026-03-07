import { computed, ref, watchEffect } from 'vue';

export type AnimationState = {
  sentences: string[];
  revealed: number;
  complete: boolean;
};

type AnimationEntry = AnimationState & {
  timerId: ReturnType<typeof setTimeout> | null;
};

export function useNarrativeAnimation() {
  const entries = ref<Map<string, AnimationEntry>>(new Map());

  const animationStates = computed(() => {
    const result = new Map<string, AnimationState>();
    for (const [key, entry] of entries.value.entries()) {
      result.set(key, {
        sentences: entry.sentences,
        revealed: entry.revealed,
        complete: entry.complete,
      });
    }
    return result;
  });

  const isAnimating = computed(() => {
    for (const entry of entries.value.values()) {
      if (!entry.complete) return true;
    }
    return false;
  });

  function revealNext(eventId: string) {
    const map = entries.value;
    const entry = map.get(eventId);
    if (!entry || entry.complete) return;

    entry.revealed++;
    if (entry.revealed >= entry.sentences.length) {
      entry.complete = true;
      entry.timerId = null;
    } else {
      entry.timerId = setTimeout(() => revealNext(eventId), 300);
    }
    // Trigger reactivity
    entries.value = new Map(map);
  }

  function startAnimation(eventId: string, text: string) {
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    const entry: AnimationEntry = {
      sentences,
      revealed: 0,
      complete: false,
      timerId: null,
    };
    const map = new Map(entries.value);
    map.set(eventId, entry);
    entries.value = map;

    // Start revealing after a brief delay for the first sentence
    entry.timerId = setTimeout(() => revealNext(eventId), 300);
  }

  function skipAll() {
    const map = entries.value;
    let changed = false;
    for (const entry of map.values()) {
      if (!entry.complete) {
        if (entry.timerId !== null) {
          clearTimeout(entry.timerId);
          entry.timerId = null;
        }
        entry.revealed = entry.sentences.length;
        entry.complete = true;
        changed = true;
      }
    }
    if (changed) {
      entries.value = new Map(map);
    }
  }

  // Safety timeout: force-complete all animations after 10 seconds
  let safetyTimerId: ReturnType<typeof setTimeout> | null = null;
  watchEffect(() => {
    if (isAnimating.value) {
      if (safetyTimerId === null) {
        safetyTimerId = setTimeout(() => {
          skipAll();
          safetyTimerId = null;
        }, 10000);
      }
    } else {
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
    }
  });

  return {
    animationStates,
    isAnimating,
    startAnimation,
    skipAll,
  };
}
