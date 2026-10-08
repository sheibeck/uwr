// One open party or player menu at a time (51.1-UI-SPEC "Keyboard and focus": opening one menu
// closes any other). Module-level state shared by every PlayerMenu in the page.

interface Holder {
  id: string;
  close: () => void;
}

let holder: Holder | null = null;
let count = 0;

/**
 * A page-unique menu id, used for the registry and as the panel's DOM id (aria-controls). Vue's
 * useId() repeats across app instances, so it is not unique enough for a module-level registry.
 */
export function newMenuId(): string {
  count += 1;
  return `player-menu-${count}`;
}

/** Makes `id` the open menu; the previous holder (another id) is closed first. */
export function claimMenu(id: string, close: () => void): void {
  const previous = holder;
  // The new holder is set before the old close runs, so a close that releases its own id
  // cannot drop the new one.
  holder = { id, close };
  if (previous !== null && previous.id !== id) previous.close();
}

/** Clears the holder when it is `id`; any other id is ignored. */
export function releaseMenu(id: string): void {
  if (holder !== null && holder.id === id) holder = null;
}
