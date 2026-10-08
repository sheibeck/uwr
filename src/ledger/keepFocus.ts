import { watch } from 'vue';
import type { WatchSource } from 'vue';

// Focus after removal (50-UI-SPEC, kept by 51.1-UI-SPEC "Accessibility Contract": focus never falls to
// body when a control goes away). One rule for every list or control that a data change re-renders
// (51.1 reviews client-social WR-03, client-rest WR-02/03/05):
// - before the DOM update, if focus sits inside the host's area, `capture` notes where (a row index,
//   the kind of control);
// - after the update, if that element is gone and focus fell to body, `restore` names where focus
//   goes: the next equivalent control (the row now at that index, the same member's card in the
//   other recipe), else the area's tabindex="-1" heading. A restore may also hand the move to its
//   host (an emitted event) and return null.
// Focus the player moved elsewhere in the meantime is never taken back.

/** True when nothing useful has focus: no element, body, or an element no longer in the document. */
export function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
}

export interface KeepFocusOptions<T> {
  /** What changes the rendered structure (rows, the combat recipe, a v-if). */
  source: WatchSource<unknown>;
  /** The element focus is watched inside (null while not rendered). */
  area: () => HTMLElement | null;
  /** Before the update: where focus sits, from the focused element inside the area. */
  capture: (active: HTMLElement, area: HTMLElement) => T;
  /** After the update, only when the focused element went away: the element to focus, or null. */
  restore: (mark: T) => HTMLElement | null;
}

/** Call from a component's setup. */
export function keepFocus<T>(options: KeepFocusOptions<T>): void {
  let held: { mark: T } | null = null;

  watch(
    options.source,
    () => {
      held = null;
      const area = options.area();
      const active = document.activeElement;
      if (area === null || !(active instanceof HTMLElement) || active === document.body) return;
      if (!area.contains(active)) return;
      held = { mark: options.capture(active, area) };
    },
    { flush: 'pre' },
  );

  watch(
    options.source,
    () => {
      const mark = held;
      held = null;
      if (mark === null || !focusLost()) return;
      options.restore(mark.mark)?.focus();
    },
    { flush: 'post' },
  );
}
