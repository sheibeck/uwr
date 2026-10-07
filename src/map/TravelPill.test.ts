// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PhCheckCircle, PhHourglassMedium } from '@phosphor-icons/vue';
import { FRAME_KEY, createInertFrame } from '../game/context';
import type { FrameControls } from '../game/context';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import MapActions from './MapActions.vue';
import TravelPill from './TravelPill.vue';
import type { TravelTimer } from './travelTimer';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/TravelPill.vue'), 'utf8');
const UNLOCK = 'You can cross into another region again.';

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function build(props: { compact: boolean } = { compact: false }, timer: TravelTimer = { running: false, secondsLeft: 0 }) {
  const selfTimer = ref<TravelTimer>(timer);
  const map = { ...createInertMap(), selfTimer } as unknown as MapData;
  wrapper = mount(TravelPill, {
    props,
    attachTo: document.body,
    global: { provide: { [MAP_KEY as symbol]: map } },
  });
  return { w: wrapper, selfTimer };
}

const status = (w: VueWrapper) => w.get('[role="status"]');

describe('TravelPill', () => {
  it('idle: the check icon and Region travel: Ready', () => {
    const { w } = build();
    expect(w.findComponent(PhCheckCircle).exists()).toBe(true);
    expect(w.findComponent(PhHourglassMedium).exists()).toBe(false);
    expect(w.get('.pill-text').text()).toBe('Region travel: Ready');
    expect(w.classes()).toContain('ready');
  });

  it('running: the hourglass, the hidden clock and a screen reader minute sentence', () => {
    const { w } = build({ compact: false }, { running: true, secondsLeft: 192 });
    expect(w.findComponent(PhHourglassMedium).exists()).toBe(true);
    expect(w.get('.pill-text').text()).toBe('Region travel: 3:12 left');
    const clock = w.get('.pill-clock');
    expect(clock.text()).toBe('3:12');
    expect(clock.attributes('aria-hidden')).toBe('true');
    expect(w.get('.sr-only:not([role])').text()).toBe('Region travel ready in about 4 minutes');
    expect(w.classes()).toContain('running');
    expect(w.text()).not.toContain('5:00');
  });

  it('shows the server time, never a fixed duration', () => {
    const { w } = build({ compact: false }, { running: true, secondsLeft: 61 });
    expect(w.get('.pill-clock').text()).toBe('1:01');
    expect(w.text()).not.toContain('5:00');
  });

  it('compact reads Ready or the clock alone', async () => {
    const { w, selfTimer } = build({ compact: true });
    expect(w.get('.pill-text').text()).toBe('Ready');
    selfTimer.value = { running: true, secondsLeft: 192 };
    await nextTick();
    expect(w.get('.pill-text').text()).toBe('3:12');
    expect(w.get('.sr-only:not([role])').text()).toBe('Region travel ready in about 4 minutes');
  });

  it('follows the timer each second', async () => {
    const { w, selfTimer } = build({ compact: false }, { running: true, secondsLeft: 5 });
    selfTimer.value = { running: true, secondsLeft: 4 };
    await nextTick();
    expect(w.get('.pill-clock').text()).toBe('0:04');
  });

  it('has no focusable element', () => {
    const { w } = build({ compact: false }, { running: true, secondsLeft: 192 });
    expect(w.find('button, a, input, select, textarea, [tabindex]').exists()).toBe(false);
  });

  it('announces the unlock once when the timer ends, not on mount and not again on later renders', async () => {
    const { w, selfTimer } = build({ compact: false }, { running: true, secondsLeft: 2 });
    expect(status(w).text()).toBe('');
    selfTimer.value = { running: false, secondsLeft: 0 };
    await nextTick();
    expect(status(w).text()).toBe(UNLOCK);
    expect(w.get('.pill-text').text()).toBe('Region travel: Ready');
    // an unrelated re-render (the same idle value replaced) does not announce again
    selfTimer.value = { running: false, secondsLeft: 0 };
    await nextTick();
    expect(w.findAll('[role="status"]')).toHaveLength(1);
    expect(status(w).text()).toBe(UNLOCK);
  });

  it('never announces for an idle pill that was never running', async () => {
    const { w, selfTimer } = build();
    selfTimer.value = { running: false, secondsLeft: 0 };
    await nextTick();
    expect(status(w).text()).toBe('');
  });

  it('clears the message when a new run starts and announces again only after that run ends', async () => {
    const { w, selfTimer } = build({ compact: false }, { running: true, secondsLeft: 2 });
    selfTimer.value = { running: false, secondsLeft: 0 };
    await nextTick();
    expect(status(w).text()).toBe(UNLOCK);
    selfTimer.value = { running: true, secondsLeft: 300 };
    await nextTick();
    expect(status(w).text()).toBe('');
    selfTimer.value = { running: false, secondsLeft: 0 };
    await nextTick();
    expect(status(w).text()).toBe(UNLOCK);
  });

  it('source: height 24, 999px radius, tokens and the unlock copy', () => {
    expect(SOURCE).toContain(UNLOCK);
    expect(SOURCE).toMatch(/height:\s*24px/);
    expect(SOURCE).toMatch(/border-radius:\s*999px/);
    expect(SOURCE).toMatch(/padding:\s*4px 8px/);
    expect(SOURCE).toContain('var(--color-con-light-green)');
    expect(SOURCE).toContain('var(--color-stamina)');
    expect(SOURCE).toMatch(/45%/);
    expect(SOURCE).toMatch(/50%/);
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('MapActions', () => {
  function mountActions(desktop: boolean): VueWrapper {
    const map = { ...createInertMap(), selfTimer: ref<TravelTimer>({ running: false, secondsLeft: 0 }) } as unknown as MapData;
    const frame = { ...createInertFrame(), isDesktop: ref(desktop) } as unknown as FrameControls;
    wrapper = mount(MapActions, {
      attachTo: document.body,
      global: { provide: { [MAP_KEY as symbol]: map, [FRAME_KEY as symbol]: frame } },
    });
    return wrapper;
  }

  it('renders the Region travel pill on desktop', () => {
    const w = mountActions(true);
    expect(w.findComponent(TravelPill).exists()).toBe(true);
    expect(w.text()).toContain('Region travel: Ready');
  });

  it('renders nothing on mobile (the pill lives in the mobile region row)', () => {
    const w = mountActions(false);
    expect(w.findComponent(TravelPill).exists()).toBe(false);
    expect(w.text()).toBe('');
    expect(w.element.nodeType).toBe(Node.COMMENT_NODE);
  });
});
