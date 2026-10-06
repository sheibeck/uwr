import { onScopeDispose, readonly, ref, type Ref } from 'vue';

/**
 * The crafting screen's wide tier (50-UI-SPEC "Layout Contract > Crafting"): Materials on hand is a
 * column from 1200px, and a disclosure inside the recipe list below that. The desktop shell
 * itself still switches at 900px (useBreakpoint); this only picks which Materials form is mounted,
 * so exactly one exists in the page.
 */
export const WIDE_QUERY = '(min-width: 1200px)';

const WIDE_MIN_WIDTH = 1200;

export function useWideLayout(): Readonly<Ref<boolean>> {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    const width = typeof window === 'undefined' ? WIDE_MIN_WIDTH : window.innerWidth;
    return readonly(ref(width >= WIDE_MIN_WIDTH));
  }
  const query = window.matchMedia(WIDE_QUERY);
  const wide = ref(query.matches);
  const onChange = (event: { matches: boolean }): void => {
    wide.value = event.matches;
  };
  query.addEventListener('change', onChange);
  onScopeDispose(() => query.removeEventListener('change', onChange));
  return readonly(wide);
}
