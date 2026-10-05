import { onScopeDispose, readonly, ref, type Ref } from 'vue';

/** The single desktop/mobile breakpoint; CSS media queries elsewhere use the same 900px. */
export const DESKTOP_QUERY = '(min-width: 900px)';

const DESKTOP_MIN_WIDTH = 900;

export function useBreakpoint(): { isDesktop: Readonly<Ref<boolean>> } {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    const width = typeof window === 'undefined' ? DESKTOP_MIN_WIDTH : window.innerWidth;
    return { isDesktop: readonly(ref(width >= DESKTOP_MIN_WIDTH)) };
  }

  const query = window.matchMedia(DESKTOP_QUERY);
  const isDesktop = ref(query.matches);
  const onChange = (event: { matches: boolean }): void => {
    isDesktop.value = event.matches;
  };
  query.addEventListener('change', onChange);
  onScopeDispose(() => query.removeEventListener('change', onChange));
  return { isDesktop: readonly(isDesktop) };
}
