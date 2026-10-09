// Scrolls a Map node into view inside its own scroll area only. Element.scrollIntoView also scrolls every
// scrollable ancestor (overflow: hidden ones too), which pushed the whole game frame up when a place sat far
// down a big region's graph. Centre puts the node in the middle of the area; nearest moves only as far
// as needed to show it (and not at all when it is already in view).

export type ScrollBlock = 'center' | 'nearest';

function axisTarget(
  current: number,
  offset: number,
  size: number,
  viewport: number,
  block: ScrollBlock,
): number {
  if (block === 'center') return current + offset - (viewport - size) / 2;
  if (offset < 0) return current + offset;
  if (offset + size > viewport) return current + offset + size - viewport;
  return current;
}

export function scrollWithin(area: HTMLElement, element: HTMLElement, block: ScrollBlock): void {
  const box = area.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const top = axisTarget(area.scrollTop, rect.top - box.top, rect.height, area.clientHeight, block);
  const left = axisTarget(area.scrollLeft, rect.left - box.left, rect.width, area.clientWidth, block);
  area.scrollTop = Math.max(0, top);
  area.scrollLeft = Math.max(0, left);
}
