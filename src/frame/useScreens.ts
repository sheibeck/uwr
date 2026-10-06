import { nextTick, readonly, ref, watch, type Ref } from 'vue';
import type { ScreenId } from '../screens/screens';

// 'encounter' is the mobile encounter sheet (48-CONTEXT A28). It is an active value only, never a
// SCREENS registry entry: it has no header button or More row.
export type ActiveScreen = ScreenId | 'more' | 'encounter' | null;

export interface ScreensOptions {
  /**
   * True while the player is in combat (48-UI-SPEC A5): only the encounter and More sheets can
   * open, any other open screen closes when it turns true, and an open encounter sheet closes
   * when it turns false.
   */
  locked?: Readonly<Ref<boolean>>;
}

export interface ScreensApi {
  readonly active: Readonly<Ref<ActiveScreen>>;
  /** Opens a screen, replacing any open one. */
  open(screen: ScreenId | 'more' | 'encounter', opener: HTMLElement | null): void;
  /** Desktop header buttons: closes when that screen is already open. */
  toggle(screen: ScreenId, opener: HTMLElement | null): void;
  /** Replaces the More sheet with a screen; the More tab stays the opener. */
  openFromMore(screen: ScreenId): void;
  /**
   * Replaces the open screen with another and keeps the original opener, with no focus return of
   * its own. For an open that starts inside the open sheet (mobile Nearby in the Map sheet), where
   * the clicked control unmounts with the sheet and the tab is still the right place to return to.
   */
  replace(screen: ScreenId): void;
  /** Clears the active screen and returns focus to the opener. */
  close(): void;
  /** Crossing to desktop turns an open More or encounter sheet into no screen. */
  syncLayout(isDesktop: boolean): void;
}

export function useScreens(options: ScreensOptions = {}): ScreensApi {
  const { locked } = options;
  const active = ref<ActiveScreen>(null);
  let opener: HTMLElement | null = null;

  function allowed(screen: ScreenId | 'more' | 'encounter'): boolean {
    return locked === undefined || !locked.value || screen === 'encounter' || screen === 'more';
  }

  function open(screen: ScreenId | 'more' | 'encounter', nextOpener: HTMLElement | null): void {
    if (!allowed(screen)) return;
    active.value = screen;
    opener = nextOpener;
  }

  function toggle(screen: ScreenId, nextOpener: HTMLElement | null): void {
    if (active.value === screen) {
      close();
      return;
    }
    open(screen, nextOpener);
  }

  function replace(screen: ScreenId): void {
    if (!allowed(screen)) return;
    active.value = screen;
  }

  const openFromMore = replace;

  function close(): void {
    active.value = null;
    const target = opener;
    opener = null;
    void nextTick(() => {
      if (target && target.isConnected) target.focus();
    });
  }

  function syncLayout(isDesktop: boolean): void {
    if (isDesktop && (active.value === 'more' || active.value === 'encounter')) {
      active.value = null;
      opener = null;
    }
  }

  if (locked !== undefined) {
    watch(
      locked,
      (isLocked) => {
        const current = active.value;
        if (isLocked) {
          if (current !== null && current !== 'encounter' && current !== 'more') close();
        } else if (current === 'encounter') {
          close();
        }
      },
      { flush: 'sync' },
    );
  }

  return { active: readonly(active), open, toggle, openFromMore, replace, close, syncLayout };
}
