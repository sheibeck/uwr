// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { PhMapTrifold } from '@phosphor-icons/vue';
import { HEADER_SCREENS, SCREENS, getScreen } from './screens';

const COPY: Record<string, [string, string]> = {
  map: ['No places discovered yet.', 'This screen is still being built.'],
  bag: ['Your bag is empty.', 'This screen is still being built.'],
  stats: ['No stats to show yet.', 'This screen is still being built.'],
  craft: ['No recipes known yet.', 'This screen is still being built.'],
  social: ['No friends or party yet.', 'This screen is still being built.'],
  events: ['No world events right now.', 'This screen is still being built.'],
  vendor: ['No vendor nearby.', 'Visit a vendor in the world to trade.'],
};

describe('screen registry', () => {
  it('lists the seven screens in order', () => {
    expect(SCREENS.map((s) => s.id)).toEqual(['map', 'bag', 'stats', 'craft', 'social', 'events', 'vendor']);
  });

  it('header screens are map..events', () => {
    expect(HEADER_SCREENS.map((s) => s.id)).toEqual(['map', 'bag', 'stats', 'craft', 'social', 'events']);
  });

  it('resolves titles, labels and header flag', () => {
    expect(getScreen('bag').title).toBe('Inventory');
    expect(getScreen('bag').label).toBe('Bag');
    expect(getScreen('events').title).toBe('World events');
    expect(getScreen('vendor').inHeader).toBe(false);
  });

  it('map uses the PhMapTrifold icon', () => {
    expect(getScreen('map').icon).toBe(PhMapTrifold);
  });
});

describe('screen shells', () => {
  for (const screen of SCREENS) {
    it(`${screen.id} renders its empty-state copy and a hidden icon`, () => {
      const wrapper = mount(screen.component);
      const [line1, line2] = COPY[screen.id];
      expect(wrapper.text()).toContain(line1);
      expect(wrapper.text()).toContain(line2);
      expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
    });
  }
});
