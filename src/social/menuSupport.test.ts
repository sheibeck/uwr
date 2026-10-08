import { afterEach, describe, expect, it, vi } from 'vitest';
import { MENU_WIDTH, menuPosition } from './menuPosition';
import { claimMenu, newMenuId, releaseMenu } from './menuRegistry';

// The pure placement of the desktop menu panel and the one-open-menu registry (51.1-UI-SPEC
// "Menu anatomy": 4px from the opener, right in the vitals rail, left in the context rail, a
// vertical flip to stay in the viewport, an 8px viewport margin; "Opening one menu closes any other").

const VIEWPORT = { width: 1280, height: 800 };
const ANCHOR = { top: 100, bottom: 128, left: 200, right: 228 };

describe('menuPosition', () => {
  it('is 224 wide', () => {
    expect(MENU_WIDTH).toBe(224);
  });

  it('right side: 4px right of the opener, top aligned with it', () => {
    expect(menuPosition({ anchor: ANCHOR, side: 'right', height: 200, viewport: VIEWPORT })).toEqual({
      top: 100,
      left: 232,
    });
  });

  it('left side: the panel ends 4px left of the opener', () => {
    const anchor = { top: 100, bottom: 128, left: 900, right: 928 };
    expect(menuPosition({ anchor, side: 'left', height: 200, viewport: VIEWPORT })).toEqual({
      top: 100,
      left: 900 - 224 - 4,
    });
  });

  it('flips up when the panel is taller than the space below: its bottom meets the opener bottom', () => {
    const anchor = { top: 700, bottom: 728, left: 200, right: 228 };
    expect(menuPosition({ anchor, side: 'right', height: 300, viewport: VIEWPORT })).toEqual({
      top: 728 - 300,
      left: 232,
    });
  });

  it('does not flip when the panel fits exactly above the 8px bottom margin', () => {
    const anchor = { top: 592, bottom: 620, left: 200, right: 228 };
    expect(menuPosition({ anchor, side: 'right', height: 200, viewport: VIEWPORT }).top).toBe(592);
  });

  it('clamps to the 8px viewport margin on every side', () => {
    // Left side near the left edge.
    const nearLeft = { top: 100, bottom: 128, left: 20, right: 48 };
    expect(menuPosition({ anchor: nearLeft, side: 'left', height: 100, viewport: VIEWPORT }).left).toBe(8);
    // Right side near the right edge.
    const nearRight = { top: 100, bottom: 128, left: 1200, right: 1228 };
    expect(menuPosition({ anchor: nearRight, side: 'right', height: 100, viewport: VIEWPORT }).left).toBe(
      1280 - 224 - 8,
    );
    // A flip that would leave the top of the viewport.
    const high = { top: 50, bottom: 78, left: 200, right: 228 };
    expect(menuPosition({ anchor: high, side: 'right', height: 780, viewport: VIEWPORT }).top).toBe(8);
    // An opener above the viewport.
    const above = { top: -40, bottom: -12, left: 200, right: 228 };
    expect(menuPosition({ anchor: above, side: 'right', height: 100, viewport: VIEWPORT }).top).toBe(8);
  });
});

describe('menuRegistry', () => {
  afterEach(() => {
    releaseMenu('a');
    releaseMenu('b');
  });

  it("claiming 'b' closes the previous holder 'a' once", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    claimMenu('a', closeA);
    claimMenu('b', closeB);
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();
  });

  it('releaseMenu clears the holder, so the next claim closes nothing', () => {
    const closeA = vi.fn();
    claimMenu('a', closeA);
    releaseMenu('a');
    claimMenu('b', vi.fn());
    expect(closeA).not.toHaveBeenCalled();
  });

  it('releasing an id that is not the holder leaves the holder in place', () => {
    const closeA = vi.fn();
    claimMenu('a', closeA);
    releaseMenu('b');
    claimMenu('b', vi.fn());
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it('newMenuId gives a new id on every call', () => {
    const a = newMenuId();
    const b = newMenuId();
    expect(a).not.toBe(b);
    expect(a.startsWith('player-menu-')).toBe(true);
  });

  it('claiming the same id twice does not close itself', () => {
    const closeA = vi.fn();
    claimMenu('a', closeA);
    claimMenu('a', closeA);
    expect(closeA).not.toHaveBeenCalled();
  });

  it('a close that releases its own id during the claim does not drop the new holder', () => {
    const closeA = vi.fn(() => releaseMenu('a'));
    const closeB = vi.fn();
    claimMenu('a', closeA);
    claimMenu('b', closeB);
    claimMenu('c', vi.fn());
    expect(closeB).toHaveBeenCalledTimes(1);
    releaseMenu('c');
  });
});
