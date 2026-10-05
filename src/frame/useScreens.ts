import { nextTick, readonly, ref, type Ref } from 'vue';
import type { ScreenId } from '../screens/screens';

export type ActiveScreen = ScreenId | 'more' | null;

export interface ScreensApi {
  readonly active: Readonly<Ref<ActiveScreen>>;
  /** Opens a screen, replacing any open one. */
  open(screen: ScreenId | 'more', opener: HTMLElement | null): void;
  /** Desktop header buttons: closes when that screen is already open. */
  toggle(screen: ScreenId, opener: HTMLElement | null): void;
  /** Replaces the More sheet with a screen; the More tab stays the opener. */
  openFromMore(screen: ScreenId): void;
  /** Clears the active screen and returns focus to the opener. */
  close(): void;
  /** Crossing to desktop turns an open More sheet into no screen. */
  syncLayout(isDesktop: boolean): void;
}

export function useScreens(): ScreensApi {
  const active = ref<ActiveScreen>(null);
  let opener: HTMLElement | null = null;

  function open(screen: ScreenId | 'more', nextOpener: HTMLElement | null): void {
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

  function openFromMore(screen: ScreenId): void {
    active.value = screen;
  }

  function close(): void {
    active.value = null;
    const target = opener;
    opener = null;
    void nextTick(() => {
      if (target && target.isConnected) target.focus();
    });
  }

  function syncLayout(isDesktop: boolean): void {
    if (isDesktop && active.value === 'more') {
      active.value = null;
      opener = null;
    }
  }

  return { active: readonly(active), open, toggle, openFromMore, close, syncLayout };
}
