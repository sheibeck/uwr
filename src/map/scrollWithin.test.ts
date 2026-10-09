// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { scrollWithin } from './scrollWithin';

function rect(x: number, y: number, size: number): DOMRect {
  return { top: y, left: x, bottom: y + size, right: x + size, width: size, height: size, x, y, toJSON() {} } as DOMRect;
}

/** A 300 x 200 scroll area at the page origin, already scrolled to (left, top), holding one node. */
function setup(nodeX: number, nodeY: number, top = 0, left = 0) {
  const outer = document.createElement('div');
  const area = document.createElement('div');
  const node = document.createElement('button');
  outer.appendChild(area);
  area.appendChild(node);
  document.body.appendChild(outer);
  area.scrollTop = top;
  area.scrollLeft = left;
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: 200 });
  Object.defineProperty(area, 'clientWidth', { configurable: true, value: 300 });
  vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 0));
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(rect(nodeX, nodeY, 32));
  return { outer, area, node };
}

describe('scrollWithin', () => {
  it('centres the node inside the area and never scrolls the containers above it', () => {
    const { outer, area, node } = setup(400, 600);
    const pageScroll = vi.fn();
    node.scrollIntoView = pageScroll;
    scrollWithin(area, node, 'center');
    expect(area.scrollTop).toBe(516);
    expect(area.scrollLeft).toBe(266);
    expect(outer.scrollTop).toBe(0);
    expect(pageScroll).not.toHaveBeenCalled();
  });

  it('nearest leaves a node already in view where it is', () => {
    const { area, node } = setup(100, 50, 40, 20);
    scrollWithin(area, node, 'nearest');
    expect(area.scrollTop).toBe(40);
    expect(area.scrollLeft).toBe(20);
  });

  it('nearest moves only far enough to show a node below or to the right', () => {
    const { area, node } = setup(290, 190);
    scrollWithin(area, node, 'nearest');
    expect(area.scrollTop).toBe(22);
    expect(area.scrollLeft).toBe(22);
  });

  it('nearest moves back to show a node above or to the left, never below zero', () => {
    const { area, node } = setup(-10, -50, 30, 5);
    scrollWithin(area, node, 'nearest');
    expect(area.scrollTop).toBe(0);
    expect(area.scrollLeft).toBe(0);
  });
});
