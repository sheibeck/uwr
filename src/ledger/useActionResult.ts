import { nextTick, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { ResultKind } from '@game-data/action_result';
import type { ActionResult } from '../module_bindings/types';
import type { ActionRunner } from './actionRunner';

// A screen opens the shared result card only for the result of an action it started. A runner key
// entering pending arms it with the expected kind, the current seq and the focused element. The
// server's action_result row with a higher seq and that kind opens it. Rows never open a card on
// their own, so the first subscription apply cannot show a stale card. Nothing is optimistic: the
// card shows only what the server wrote. Done and Esc call close(), which returns focus to the
// element that started the action (50-CONTEXT default "Result card").

// The kinds come from the server's own list (RESULT_KINDS in action_result.ts), never a client copy.
export type { ResultKind };

export interface UseActionResultOptions {
  runner: ActionRunner;
  lastResult: Readonly<Ref<ActionResult | null>>;
  /** Runner key to the kind of result that action produces. */
  keys: Readonly<Record<string, ResultKind>>;
  /** Where focus goes on close when the opener is gone (the salvage confirm button is removed). */
  fallbackFocus: () => void;
}

export interface ActionResultState {
  readonly shown: Readonly<Ref<ActionResult | null>>;
  close(): void;
}

interface Armed {
  kind: ResultKind;
  baseline: bigint;
}

export function useActionResult(options: UseActionResultOptions): ActionResultState {
  const shown = shallowRef<ActionResult | null>(null);
  let armed: Armed | null = null;
  let opener: HTMLElement | null = null;

  // Sync, so the arm exists before the reducer's rows can reach the lastResult watch below.
  watch(
    () => options.runner.pending.value,
    (now, before) => {
      for (const key of Object.keys(options.keys)) {
        if (!Object.prototype.hasOwnProperty.call(options.keys, key)) continue;
        if (!now.has(key) || before.has(key)) continue;
        armed = { kind: options.keys[key], baseline: options.lastResult.value?.seq ?? 0n };
        // While a card is open, focus sits inside it: keep the first opener for the final close.
        if (shown.value === null) {
          const active = document.activeElement;
          opener = active instanceof HTMLElement && active !== document.body ? active : null;
        }
      }
    },
    { flush: 'sync' },
  );

  watch(
    () => options.lastResult.value,
    (row) => {
      if (row === null || armed === null) return;
      if (row.kind !== armed.kind || row.seq <= armed.baseline) return;
      shown.value = row;
      armed = null;
    },
  );

  function close(): void {
    if (shown.value === null) return;
    shown.value = null;
    const target = opener;
    opener = null;
    void nextTick(() => {
      if (target && target.isConnected) target.focus();
      else options.fallbackFocus();
    });
  }

  return { shown, close };
}
