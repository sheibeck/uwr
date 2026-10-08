// Where the desktop menu panel opens (51.1-UI-SPEC "Menu anatomy"): 4px beside its opener, to
// the right in the vitals rail and to the left in the context rail, flipped up when it would run
// past the bottom of the viewport, and kept 8px inside the viewport. Pure: the panel is
// position: fixed from the opener's getBoundingClientRect(), so it escapes the rails' scroll
// clipping without a Teleport.

export const MENU_WIDTH = 224;

const GAP = 4;
const MARGIN = 8;

export interface MenuAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

function clamp(value: number, min: number, max: number): number {
  // The minimum wins when the viewport is smaller than the panel.
  return Math.max(min, Math.min(value, max));
}

export function menuPosition(input: {
  anchor: MenuAnchor;
  side: 'right' | 'left';
  height: number;
  viewport: { width: number; height: number };
}): { top: number; left: number } {
  const { anchor, side, height, viewport } = input;
  const left = side === 'right' ? anchor.right + GAP : anchor.left - MENU_WIDTH - GAP;
  // Flip up: the panel's bottom meets the opener's bottom.
  const top = anchor.top + height > viewport.height - MARGIN ? anchor.bottom - height : anchor.top;
  return {
    top: clamp(top, MARGIN, viewport.height - height - MARGIN),
    left: clamp(left, MARGIN, viewport.width - MENU_WIDTH - MARGIN),
  };
}
