// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { KEYBOARD_THRESHOLD_PX, isKeyboardOpen, useKeyboardOpen } from './useKeyboardOpen';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isKeyboardOpen', () => {
  it('is open when focused and the viewport shrank a lot', () => {
    expect(isKeyboardOpen(844, 500, true)).toBe(true);
  });

  it('is closed for a small shrink (browser chrome)', () => {
    expect(isKeyboardOpen(844, 800, true)).toBe(false);
  });

  it('is closed without focus', () => {
    expect(isKeyboardOpen(844, 500, false)).toBe(false);
  });

  it('uses a strict threshold of 120', () => {
    expect(KEYBOARD_THRESHOLD_PX).toBe(120);
    expect(isKeyboardOpen(844, 844 - 120, true)).toBe(false);
    expect(isKeyboardOpen(844, 844 - 121, true)).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(isKeyboardOpen(844, 800, true, 40)).toBe(true);
  });
});

class StubViewport extends EventTarget {
  height = 844;
}

function stubViewport(innerHeight: number): StubViewport {
  const viewport = new StubViewport();
  viewport.height = innerHeight;
  vi.stubGlobal('innerHeight', innerHeight);
  window.innerHeight = innerHeight;
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  return viewport;
}

function removeViewport(): void {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
}

describe('useKeyboardOpen', () => {
  it('is false without window.visualViewport', () => {
    removeViewport();
    const scope = effectScope();
    const focused = ref(true);
    const result = scope.run(() => useKeyboardOpen(focused));
    expect(result?.keyboardOpen.value).toBe(false);
    scope.stop();
  });

  it('follows the viewport height on resize while focused', async () => {
    const viewport = stubViewport(844);
    const scope = effectScope();
    const focused = ref(true);
    const result = scope.run(() => useKeyboardOpen(focused))!;
    expect(result.keyboardOpen.value).toBe(false);

    viewport.height = 500;
    viewport.dispatchEvent(new Event('resize'));
    expect(result.keyboardOpen.value).toBe(true);

    viewport.height = 844;
    viewport.dispatchEvent(new Event('resize'));
    expect(result.keyboardOpen.value).toBe(false);
    scope.stop();
    removeViewport();
  });

  it('follows focus: a short viewport only counts while the input is focused', async () => {
    const viewport = stubViewport(844);
    viewport.height = 500;
    const scope = effectScope();
    const focused = ref(false);
    const result = scope.run(() => useKeyboardOpen(focused))!;
    expect(result.keyboardOpen.value).toBe(false);

    focused.value = true;
    await nextTick();
    expect(result.keyboardOpen.value).toBe(true);

    focused.value = false;
    await nextTick();
    expect(result.keyboardOpen.value).toBe(false);
    scope.stop();
    removeViewport();
  });

  it('removes the resize listener when the scope is disposed', () => {
    const viewport = stubViewport(844);
    const remove = vi.spyOn(viewport, 'removeEventListener');
    const scope = effectScope();
    const focused = ref(true);
    scope.run(() => useKeyboardOpen(focused));
    scope.stop();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    removeViewport();
  });
});
