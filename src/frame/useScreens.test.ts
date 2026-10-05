// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useScreens } from './useScreens';
import { DESKTOP_QUERY, useBreakpoint } from './useBreakpoint';
import { focusableWithin, trapTabKey } from './focusTrap';

function button(label: string, parent: HTMLElement = document.body): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;
  parent.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('useScreens', () => {
  it('open replaces any open screen', () => {
    const screens = useScreens();
    screens.open('map', button('a'));
    screens.open('bag', button('b'));
    expect(screens.active.value).toBe('bag');
  });

  it('toggle opens then closes', () => {
    const screens = useScreens();
    const btn = button('a');
    screens.toggle('map', btn);
    expect(screens.active.value).toBe('map');
    screens.toggle('map', btn);
    expect(screens.active.value).toBeNull();
  });

  it('toggle on a different screen swaps instead of closing', () => {
    const screens = useScreens();
    screens.toggle('map', button('a'));
    screens.toggle('bag', button('b'));
    expect(screens.active.value).toBe('bag');
  });

  it('close returns focus to the opener after nextTick', async () => {
    const screens = useScreens();
    const btn = button('a');
    screens.open('map', btn);
    screens.close();
    expect(screens.active.value).toBeNull();
    await nextTick();
    expect(document.activeElement).toBe(btn);
  });

  it('skips an opener that left the DOM', async () => {
    const screens = useScreens();
    const btn = button('a');
    screens.open('map', btn);
    btn.remove();
    expect(() => screens.close()).not.toThrow();
    await nextTick();
    expect(document.activeElement).not.toBe(btn);
  });

  it('close with a null opener does not throw', async () => {
    const screens = useScreens();
    screens.open('map', null);
    expect(() => screens.close()).not.toThrow();
    await nextTick();
  });

  it('openFromMore keeps the More tab as opener', async () => {
    const screens = useScreens();
    const moreTab = button('more');
    screens.open('more', moreTab);
    screens.openFromMore('stats');
    expect(screens.active.value).toBe('stats');
    screens.close();
    await nextTick();
    expect(document.activeElement).toBe(moreTab);
  });

  it('syncLayout turns more into null on desktop only', () => {
    const screens = useScreens();
    screens.open('more', button('m'));
    screens.syncLayout(false);
    expect(screens.active.value).toBe('more');
    screens.syncLayout(true);
    expect(screens.active.value).toBeNull();

    screens.open('map', button('a'));
    screens.syncLayout(true);
    expect(screens.active.value).toBe('map');
    screens.syncLayout(false);
    expect(screens.active.value).toBe('map');
  });
});

describe('trapTabKey', () => {
  function tab(shift = false): KeyboardEvent {
    return new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, cancelable: true, bubbles: true });
  }

  function container(): { root: HTMLElement; first: HTMLElement; mid: HTMLElement; last: HTMLElement } {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const first = button('1', root);
    const mid = button('2', root);
    const last = button('3', root);
    return { root, first, mid, last };
  }

  it('wraps from last to first on Tab', () => {
    const { root, first, last } = container();
    last.focus();
    const event = tab();
    trapTabKey(event, root);
    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it('wraps from first to last on Shift+Tab', () => {
    const { root, first, last } = container();
    first.focus();
    const event = tab(true);
    trapTabKey(event, root);
    expect(document.activeElement).toBe(last);
    expect(event.defaultPrevented).toBe(true);
  });

  it('pulls focus from outside into the container', () => {
    const { root, first } = container();
    const outside = button('out');
    outside.focus();
    const event = tab();
    trapTabKey(event, root);
    expect(document.activeElement).toBe(first);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves middle focus to the browser', () => {
    const { root, mid } = container();
    mid.focus();
    const event = tab();
    trapTabKey(event, root);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores other keys', () => {
    const { root, last } = container();
    last.focus();
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    trapTabKey(event, root);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(last);
  });

  it('skips disabled, hidden and tabindex=-1 elements', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const first = button('1', root);
    const disabled = button('d', root);
    disabled.disabled = true;
    const skipped = button('s', root);
    skipped.tabIndex = -1;
    const hiddenWrap = document.createElement('div');
    hiddenWrap.hidden = true;
    root.appendChild(hiddenWrap);
    button('h', hiddenWrap);
    const last = button('3', root);

    expect(focusableWithin(root)).toEqual([first, last]);
  });
});

describe('useBreakpoint', () => {
  type ChangeListener = (event: { matches: boolean }) => void;

  function stubMatchMedia(initial: boolean): {
    fire: (matches: boolean) => void;
    listeners: Set<ChangeListener>;
    query: () => string | undefined;
  } {
    const listeners = new Set<ChangeListener>();
    let queried: string | undefined;
    const mql = {
      matches: initial,
      addEventListener: (_: string, fn: ChangeListener) => listeners.add(fn),
      removeEventListener: (_: string, fn: ChangeListener) => listeners.delete(fn),
    };
    vi.stubGlobal('matchMedia', (query: string) => {
      queried = query;
      return mql;
    });
    return {
      listeners,
      query: () => queried,
      fire: (matches) => {
        mql.matches = matches;
        for (const fn of [...listeners]) fn({ matches });
      },
    };
  }

  it('uses the 900px query', () => {
    expect(DESKTOP_QUERY).toBe('(min-width: 900px)');
  });

  it('follows matches and change events, and unsubscribes on scope stop', () => {
    const stub = stubMatchMedia(true);
    const scope = effectScope();
    const api = scope.run(() => useBreakpoint())!;
    expect(stub.query()).toBe(DESKTOP_QUERY);
    expect(api.isDesktop.value).toBe(true);
    stub.fire(false);
    expect(api.isDesktop.value).toBe(false);
    stub.fire(true);
    expect(api.isDesktop.value).toBe(true);
    expect(stub.listeners.size).toBe(1);
    scope.stop();
    expect(stub.listeners.size).toBe(0);
  });

  it('falls back to innerWidth when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    vi.stubGlobal('innerWidth', 1000);
    const scope = effectScope();
    const api = scope.run(() => useBreakpoint())!;
    expect(api.isDesktop.value).toBe(true);
    scope.stop();
  });
});
