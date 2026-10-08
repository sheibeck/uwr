import { computed, ref, shallowRef, watch } from 'vue';
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

/** Where reportRejections writes: the game feed's local append. */
export interface RejectionFeed {
  appendLocal(kind: 'system', message: string): unknown;
}

/**
 * The one client-rejection report for controls that have no notice line of their own (the rail
 * Nearby actions and every party control; 51.1 review WR-01). Each rejected call of this runner
 * appends SEND_ERROR_TEXT to the feed once, as a local system line. Server refusals stay the
 * server's own lines; these controls write no other line. A screen that covers the feed shows
 * the line through its NoticeLine with sendErrors. Call it from a component's setup.
 */
export function reportRejections(runner: ActionRunner, feed: RejectionFeed): void {
  watch(
    () => runner.rejection.value,
    (next, previous) => {
      if (next > previous) feed.appendLocal('system', SEND_ERROR_TEXT);
    },
  );
}
