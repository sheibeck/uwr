// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import HeaderBar from './HeaderBar.vue';
import AccountMenu from './AccountMenu.vue';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function mountHeader(overrides: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(HeaderBar, {
    attachTo: document.body,
    props: {
      placeLabel: 'Ashen Reach · Hollow Gate',
      timeOfDay: 'day',
      levelUp: false,
      newSkill: false,
      activeScreen: null,
      characterName: 'Brannoch the Wanderer',
      accountLine: 'Lv 6 · Human Ranger',
      ...overrides,
    },
  });
  return wrapper;
}

function readSource(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/frame', name), 'utf8');
}

describe('HeaderBar', () => {
  it('renders brand, place label with title, and time of day', () => {
    const w = mountHeader();
    expect(w.text()).toContain('Unwritten Realms');
    const place = w.find('.place');
    expect(place.text()).toBe('Ashen Reach · Hollow Gate');
    expect(place.attributes('title')).toBe('Ashen Reach · Hollow Gate');
    expect(w.find('.time').text()).toBe('Day');
  });

  it('renders Night and omits time when null', async () => {
    const w = mountHeader({ timeOfDay: 'night' });
    expect(w.find('.time').text()).toBe('Night');
    await w.setProps({ timeOfDay: null });
    expect(w.find('.time').exists()).toBe(false);
  });

  it('toggles the Level up and New skill tags and keeps them unfocusable', async () => {
    const w = mountHeader();
    expect(w.find('.tag-outline').exists()).toBe(false);
    expect(w.find('.tag-accent').exists()).toBe(false);
    await w.setProps({ levelUp: true, newSkill: true });
    const level = w.find('.tag.tag-outline');
    const skill = w.find('.tag.tag-accent');
    expect(level.text()).toContain('Level up');
    expect(skill.text()).toContain('New skill');
    expect(level.element.tagName).toBe('SPAN');
    expect(skill.element.tagName).toBe('SPAN');
    expect(level.attributes('tabindex')).toBeUndefined();
    expect(skill.attributes('tabindex')).toBeUndefined();
  });

  it('renders six screen buttons in order with labels, aria-label and title', () => {
    const w = mountHeader();
    const buttons = w.findAll('button.screen-btn');
    expect(buttons.map((b) => b.attributes('data-screen'))).toEqual([
      'map',
      'bag',
      'stats',
      'craft',
      'social',
      'events',
    ]);
    const labels = ['Map', 'Bag', 'Stats', 'Craft', 'Social', 'Events'];
    buttons.forEach((b, i) => {
      expect(b.text()).toBe(labels[i]);
      expect(b.attributes('aria-label')).toBe(labels[i]);
      expect(b.attributes('title')).toBe(labels[i]);
    });
  });

  it('marks the active screen button pressed with the open class', () => {
    const w = mountHeader({ activeScreen: 'bag' });
    const bag = w.find('button[data-screen="bag"]');
    expect(bag.attributes('aria-pressed')).toBe('true');
    expect(bag.classes()).toContain('open');
    const map = w.find('button[data-screen="map"]');
    expect(map.attributes('aria-pressed')).toBe('false');
    expect(map.classes()).not.toContain('open');
  });

  it('emits toggle-screen with the screen id and the button element', async () => {
    const w = mountHeader();
    const craft = w.find('button[data-screen="craft"]');
    await craft.trigger('click');
    const events = w.emitted('toggle-screen');
    expect(events).toHaveLength(1);
    expect(events![0][0]).toBe('craft');
    expect(events![0][1]).toBe(craft.element);
  });

  it('disables all screen buttons when disabled', () => {
    const w = mountHeader({ disabled: true });
    const buttons = w.findAll('button.screen-btn');
    expect(buttons).toHaveLength(6);
    buttons.forEach((b) => expect(b.attributes('disabled')).toBeDefined());
  });

  it('re-emits logout from the account menu', async () => {
    const w = mountHeader();
    await w.find('button[aria-label="Account menu"]').trigger('click');
    await nextTick();
    await w.find('[role="menuitem"]').trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
  });

  it('declares a 48px height, inline-size container and a 1100px label rule', () => {
    const src = readSource('HeaderBar.vue');
    expect(src).toContain('height: 48px');
    expect(src).toContain('container-type: inline-size');
    expect(src).toContain('max-width: 1099px');
    expect(src).toContain('HEADER_SCREENS');
    expect(src).toContain('aria-pressed');
  });
});

describe('AccountMenu', () => {
  function mountMenu(): VueWrapper {
    wrapper = mount(AccountMenu, {
      attachTo: document.body,
      props: { characterName: 'Brannoch the Wanderer', accountLine: 'Lv 6 · Human Ranger' },
    });
    return wrapper;
  }

  it('has an accessible account button reflecting expanded state', async () => {
    const w = mountMenu();
    const btn = w.find('button[aria-label="Account menu"]');
    expect(btn.attributes('aria-haspopup')).toBe('menu');
    expect(btn.attributes('aria-expanded')).toBe('false');
    await btn.trigger('click');
    expect(btn.attributes('aria-expanded')).toBe('true');
  });

  it('opens a menu with name, account line and a focused Log out item', async () => {
    const w = mountMenu();
    await w.find('button[aria-label="Account menu"]').trigger('click');
    await nextTick();
    const menu = w.find('[role="menu"]');
    expect(menu.exists()).toBe(true);
    expect(menu.text()).toContain('Brannoch the Wanderer');
    expect(menu.text()).toContain('Lv 6 · Human Ranger');
    const item = w.find('[role="menuitem"]');
    expect(item.text()).toBe('Log out');
    expect(document.activeElement).toBe(item.element);
  });

  it('emits logout and closes when Log out is clicked', async () => {
    const w = mountMenu();
    await w.find('button[aria-label="Account menu"]').trigger('click');
    await nextTick();
    await w.find('[role="menuitem"]').trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it('closes on Esc, refocuses the button and stops propagation to the document', async () => {
    const w = mountMenu();
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    try {
      const btn = w.find('button[aria-label="Account menu"]');
      await btn.trigger('click');
      await nextTick();
      await w.find('[role="menu"]').trigger('keydown', { key: 'Escape' });
      expect(w.find('[role="menu"]').exists()).toBe(false);
      expect(document.activeElement).toBe(btn.element);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', spy);
    }
  });

  it('closes on a pointerdown outside and ignores one inside', async () => {
    const w = mountMenu();
    await w.find('button[aria-label="Account menu"]').trigger('click');
    await nextTick();
    w.find('[role="menu"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(w.find('[role="menu"]').exists()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(w.find('[role="menu"]').exists()).toBe(false);
  });

  it('declares menu semantics, a 200px width and stopPropagation', () => {
    const src = readSource('AccountMenu.vue');
    expect(src).toContain('role="menu"');
    expect(src).toContain('role="menuitem"');
    expect(src).toContain('stopPropagation');
    expect(src).toContain('width: 200px');
  });
});
