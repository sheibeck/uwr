// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { PhMapTrifold } from '@phosphor-icons/vue';
import { HEADER_SCREENS, SCREENS, getScreen } from './screens';

const COPY: Record<string, [string, string]> = {
  map: ['No places discovered yet.', 'This screen is still being built.'],
  social: ['No friends or party yet.', 'This screen is still being built.'],
  events: ['No world events right now.', 'This screen is still being built.'],
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

// Map, Social and World events are still Phase 45 placeholders; the other four are the real screens.
describe('screen shells', () => {
  for (const screen of SCREENS.filter((candidate) => COPY[candidate.id])) {
    it(`${screen.id} renders its empty-state copy and a hidden icon`, () => {
      const wrapper = mount(screen.component);
      const [line1, line2] = COPY[screen.id];
      expect(wrapper.text()).toContain(line1);
      expect(wrapper.text()).toContain(line2);
      expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
    });
  }

  it('only map, social and events are placeholders', () => {
    expect(SCREENS.filter((candidate) => COPY[candidate.id]).map((s) => s.id)).toEqual(['map', 'social', 'events']);
  });
});

describe('ledger screens (Phase 50 registration)', () => {
  const LEDGER_COPY = {
    bag: 'Your backpack is empty.',
    stats: 'No stats to show yet.',
    craft: 'No recipes known yet.',
    vendor: 'No vendor here.',
  } as const;

  for (const id of ['bag', 'stats', 'craft', 'vendor'] as const) {
    it(`${id} mounts bare against the inert providers and shows its no-character line`, () => {
      const wrapper = mount(getScreen(id).component);
      expect(wrapper.text()).toContain(LEDGER_COPY[id]);
      wrapper.unmount();
    });

    it(`${id} has a header meta component`, () => {
      expect(getScreen(id).meta).toBeDefined();
    });
  }

  it('the vendor screen is titled Trade while its label stays Vendor', () => {
    expect(getScreen('vendor').title).toBe('Trade');
    expect(getScreen('vendor').label).toBe('Vendor');
  });

  it('map, social and events keep their placeholders and have no meta', () => {
    for (const id of ['map', 'social', 'events'] as const) {
      expect(getScreen(id).meta).toBeUndefined();
    }
  });
});
