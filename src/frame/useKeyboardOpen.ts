import { onScopeDispose, readonly, ref, watch, type Ref } from 'vue';

/** The visual viewport must be this many pixels shorter than the window to count as a keyboard. */
export const KEYBOARD_THRESHOLD_PX = 120;

/**
 * True when the input has focus and the visual viewport is more than `threshold` pixels shorter
 * than the window: the software keyboard is up. Browser chrome that slides away is a smaller shrink.
 */
export function isKeyboardOpen(
  innerHeight: number,
  visualHeight: number,
  focused: boolean,
  threshold: number = KEYBOARD_THRESHOLD_PX,
): boolean {
  return focused && innerHeight - visualHeight > threshold;
}

/** Follows window.visualViewport; always false where the API is missing. */
export function useKeyboardOpen(focused: Readonly<Ref<boolean>>): { keyboardOpen: Readonly<Ref<boolean>> } {
  const keyboardOpen = ref(false);
  const viewport = typeof window === 'undefined' ? undefined : window.visualViewport;
  if (!viewport) return { keyboardOpen: readonly(keyboardOpen) };

  const update = (): void => {
    keyboardOpen.value = isKeyboardOpen(window.innerHeight, viewport.height, focused.value);
  };
  viewport.addEventListener('resize', update);
  const stopWatch = watch(focused, update, { immediate: true });
  onScopeDispose(() => {
    viewport.removeEventListener('resize', update);
    stopWatch();
  });
  return { keyboardOpen: readonly(keyboardOpen) };
}
