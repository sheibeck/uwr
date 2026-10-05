export const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('tabindex') !== '-1' && !element.closest('[hidden]'),
  );
}

/**
 * Wraps Tab / Shift+Tab inside `container`. Only Tab is handled and pointer use is never blocked,
 * so Esc and the close button always remain a way out.
 */
export function trapTabKey(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const items = focusableWithin(container);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const current = document.activeElement;
  const inside = current instanceof HTMLElement && container.contains(current);

  if (!inside) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && current === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && current === last) {
    event.preventDefault();
    first.focus();
  }
}
