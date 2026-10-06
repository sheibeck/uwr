import { computed, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';

// The shared reducer-call rules of the ledger screens (UI-SPEC "Pending" and "Notice line"): a call
// makes its action inert until the promise settles, a second run of the same key is ignored, there
// are no timers and nothing is optimistic. A rejected promise is reported through the rejection
// counter, which the notice line turns into the send error line.

export const SEND_ERROR_TEXT = "Couldn't send that. Try again.";

export interface ActionRunner {
  /** Keys with a call in flight. Replaced, never mutated, so computed readers update. */
  readonly pending: Readonly<Ref<ReadonlySet<string>>>;
  isPending(key: string): boolean;
  /** Counts client rejections (a rejected reducer promise). */
  readonly rejection: Readonly<Ref<number>>;
  /** True when the call ran and resolved; false when ignored, offline or rejected. Never throws. */
  run(key: string, call: () => Promise<unknown>): Promise<boolean>;
}

export function createActionRunner(options: { online: Readonly<Ref<boolean>> }): ActionRunner {
  const pendingSet = shallowRef<ReadonlySet<string>>(new Set());
  const rejection = ref(0);

  function setPending(key: string, on: boolean): void {
    const next = new Set(pendingSet.value);
    if (on) next.add(key);
    else next.delete(key);
    pendingSet.value = next;
  }

  function isPending(key: string): boolean {
    return pendingSet.value.has(key);
  }

  async function run(key: string, call: () => Promise<unknown>): Promise<boolean> {
    if (!options.online.value || isPending(key)) return false;
    setPending(key, true);
    try {
      await call();
      return true;
    } catch {
      rejection.value += 1;
      return false;
    } finally {
      setPending(key, false);
    }
  }

  return {
    pending: computed(() => pendingSet.value),
    isPending,
    rejection: computed(() => rejection.value),
    run,
  };
}
