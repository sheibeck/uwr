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

/**
 * Document-level variant of `trapTabKey` for dialogs that sit beside live app chrome (the
 * header, rail and tab bar stay operable next to an open drawer or sheet). Tab is trapped only
 * when focus is lost (on <body> or nothing) or already inside the dialog; focus that is
 * deliberately on a control outside the dialog is left alone so Tab can move between that chrome.
 */
export function trapTabKeyAtDocument(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const active = document.activeElement;
  const lost = active === null || active === document.body;
  const inside = active instanceof Node && container.contains(active);
  if (lost || inside) trapTabKey(event, container);
}
