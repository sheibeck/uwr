// Pinned-to-bottom math for the feed (47-UI-SPEC "Scrolling and the New lines pill").
// Pinned means within 48px of the bottom: one feed line (14px at 1.6) plus the 8px gap is about
// 30px, so 48px tolerates sub-line drift and momentum scrolling without unpinning.

export const PIN_THRESHOLD_PX = 48;

/** True when the scroller is within `threshold` pixels of its bottom edge. */
export function isPinned(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold: number = PIN_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

/** False when matchMedia is missing (tests, old browsers). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
