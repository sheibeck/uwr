// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PhLockSimple, PhMapPin } from '@phosphor-icons/vue';
import RegionsListbox from './RegionsListbox.vue';
import type { RegionChip } from './regionChips';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/RegionsListbox.vue'), 'utf8');
const XSS = '<img src=x onerror=alert(1)>';

const chip = (regionId: bigint, name: string, over: Partial<RegionChip> = {}): RegionChip => ({
  regionId,
  name,
  levelLabel: 'Lv 3–5',
  range: { lo: 3, hi: 5 },
  band: 'even',
  isShown: false,
  isYours: false,
  ...over,
});

const CHIPS = (): RegionChip[] => [
  chip(1n, 'Ashfall Wilds', { isYours: true, isShown: false }),
  chip(2n, 'Saltmarsh', { levelLabel: 'Lv 4–7', isShown: true }),
  chip(3n, 'Quiet Shore', { levelLabel: 'Safe', range: null, band: null }),
];

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function mountList(over: { chips?: RegionChip[]; locked?: boolean } = {}): VueWrapper {
  wrapper = mount(RegionsListbox, {
    attachTo: document.body,
    props: {
      chips: over.chips ?? CHIPS(),
      locked: over.locked ?? false,
      timeText: '3:12',
      aboutText: 'about 4 minutes',
    },
  });
  return wrapper;
}

const options = (w: VueWrapper) => w.findAll('[role="option"]');

describe('RegionsListbox', () => {
  it('is a listbox with one option per chip and aria-selected for the shown region', () => {
    const w = mountList();
    expect(w.get('[role="listbox"]').attributes('aria-label')).toBe('Regions');
    expect(options(w).map((o) => o.get('.option-name').text())).toEqual(['Ashfall Wilds', 'Saltmarsh', 'Quiet Shore']);
    expect(options(w).map((o) => o.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(options(w).map((o) => o.get('.option-level').text())).toEqual(['Lv 3–5', 'Lv 4–7', 'Safe']);
  });

  it('marks your region while another is shown and labels it for the screen reader', () => {
    const w = mountList();
    expect(options(w)[0].findComponent(PhMapPin).exists()).toBe(true);
    expect(options(w)[0].attributes('aria-label')).toBe('Ashfall Wilds, Lv 3–5, you are here');
    expect(options(w)[1].findComponent(PhMapPin).exists()).toBe(false);
  });

  it('while the timer runs every region but yours shows the lock and the time, and stays operable', async () => {
    const w = mountList({ locked: true });
    expect(options(w)[0].findComponent(PhLockSimple).exists()).toBe(false);
    expect(options(w)[0].find('.option-clock').exists()).toBe(false);
    for (const index of [1, 2]) {
      expect(options(w)[index].findComponent(PhLockSimple).exists()).toBe(true);
      expect(options(w)[index].get('.option-clock').text()).toBe('3:12');
      expect(options(w)[index].get('.option-clock').attributes('aria-hidden')).toBe('true');
      expect(options(w)[index].find('.option-level').exists()).toBe(false);
    }
    expect(options(w)[1].attributes('aria-label')).toBe('Saltmarsh, Lv 4–7, region travel locked for about 4 minutes');
    await options(w)[2].trigger('click');
    expect(w.emitted('choose')).toEqual([[3n]]);
  });

  it('choosing an option emits its region id', async () => {
    const w = mountList();
    await options(w)[0].trigger('click');
    expect(w.emitted('choose')).toEqual([[1n]]);
  });

  it('focuses the shown option on open, with a roving tabindex', () => {
    const w = mountList();
    expect(document.activeElement).toBe(options(w)[1].element);
    expect(options(w).map((o) => o.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('arrow keys, Home and End move focus; Enter and Space choose', async () => {
    const w = mountList();
    await options(w)[1].trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect(document.activeElement).toBe(options(w)[2].element);
    await options(w)[2].trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect(document.activeElement).toBe(options(w)[2].element);
    await options(w)[2].trigger('keydown', { key: 'Home' });
    await nextTick();
    expect(document.activeElement).toBe(options(w)[0].element);
    await options(w)[0].trigger('keydown', { key: 'ArrowUp' });
    await nextTick();
    expect(document.activeElement).toBe(options(w)[0].element);
    await options(w)[0].trigger('keydown', { key: 'End' });
    await nextTick();
    expect(document.activeElement).toBe(options(w)[2].element);
    await options(w)[2].trigger('keydown', { key: 'Enter' });
    await options(w)[0].trigger('keydown', { key: ' ' });
    expect(w.emitted('choose')).toEqual([[3n], [1n]]);
  });

  it('Escape emits close and is marked handled so the sheet stays open', async () => {
    const w = mountList();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    options(w)[1].element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('renders a hostile region name as text', () => {
    const w = mountList({ chips: [chip(9n, XSS, { isShown: true })] });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.option-name').text()).toBe(XSS);
  });

  it('source: 44px options, no v-html and tokens only', () => {
    expect(SOURCE).toContain('role="listbox"');
    expect(SOURCE).toMatch(/\.region-option \{[^}]*min-height: 44px;/);
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
