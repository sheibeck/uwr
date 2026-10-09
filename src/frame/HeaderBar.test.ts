// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import HeaderBar from './HeaderBar.vue';
import AccountMenu from './AccountMenu.vue';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function mountHeader(overrides: Record<string, unknown> = {}, game?: GameData): VueWrapper {
  wrapper = mount(HeaderBar, {
    attachTo: document.body,
    global: game ? { provide: { [GAME_KEY as symbol]: game } } : {},
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

describe('HeaderBar in combat', () => {
  it('shows no tag and no lock when inCombat is false or absent', () => {
    const w = mountHeader();
    expect(w.find('.in-combat-tag').exists()).toBe(false);
    const absent = w.findAll('button.screen-btn');
    absent.forEach((b) => {
      expect(b.attributes('aria-disabled')).toBeUndefined();
      expect(b.classes()).not.toContain('combat-locked');
    });
    w.unmount();
    const off = mountHeader({ inCombat: false, roundNumber: 3n });
    expect(off.find('.in-combat-tag').exists()).toBe(false);
  });

  it('renders the tag between the location and the time of day with the round', () => {
    const w = mountHeader({ inCombat: true, roundNumber: 3n });
    const tag = w.get('.in-combat-tag');
    expect(tag.text()).toBe('In combat · Round 3');
    expect(tag.attributes('aria-label')).toBe('In combat, round 3');
    expect(tag.get('.dot').attributes('aria-hidden')).toBe('true');
    const html = w.html();
    expect(html.indexOf('class="location"')).toBeLessThan(html.indexOf('in-combat-tag'));
    expect(html.indexOf('in-combat-tag')).toBeLessThan(html.indexOf('class="time"'));
  });

  it('reads In combat without a round number', () => {
    const w = mountHeader({ inCombat: true, roundNumber: null });
    expect(w.get('.in-combat-tag').text()).toBe('In combat');
    expect(w.get('.in-combat-tag').attributes('aria-label')).toBe('In combat');
  });

  it('locks every screen button with aria-disabled, the title and no native disabled', () => {
    const w = mountHeader({ inCombat: true, roundNumber: 1n });
    const buttons = w.findAll('button.screen-btn');
    expect(buttons).toHaveLength(6);
    buttons.forEach((b) => {
      expect(b.attributes('aria-disabled')).toBe('true');
      expect(b.attributes('title')).toBe('Unavailable in combat');
      expect(b.classes()).toContain('combat-locked');
      expect(b.attributes('disabled')).toBeUndefined();
    });
  });

  it('keeps the locked buttons focusable and a click emits nothing', async () => {
    const w = mountHeader({ inCombat: true, roundNumber: 1n });
    const map = w.get('button[data-screen="map"]');
    (map.element as HTMLElement).focus();
    expect(document.activeElement).toBe(map.element);
    await map.trigger('click');
    await w.get('button[data-screen="bag"]').trigger('click');
    expect(w.emitted('toggle-screen')).toBeUndefined();
  });

  it('leaves the account button enabled and the Level up and New skill tags in place', async () => {
    const w = mountHeader({ inCombat: true, roundNumber: 1n, levelUp: true, newSkill: true });
    const account = w.get('button[aria-label="Account menu"]');
    expect(account.attributes('aria-disabled')).toBeUndefined();
    expect(account.attributes('disabled')).toBeUndefined();
    expect(w.find('.tag-outline').exists()).toBe(true);
    expect(w.find('.tag-accent').exists()).toBe(true);
    await account.trigger('click');
    expect(account.attributes('aria-expanded')).toBe('true');
  });

  it('keeps the native disabled prop working alongside inCombat', () => {
    const w = mountHeader({ disabled: true, inCombat: true });
    w.findAll('button.screen-btn').forEach((b) => expect(b.attributes('disabled')).toBeDefined());
  });

  it('swaps the tag and the lock instantly when the fight starts and ends', async () => {
    const w = mountHeader();
    await w.setProps({ inCombat: true, roundNumber: 2n });
    expect(w.find('.in-combat-tag').exists()).toBe(true);
    expect(w.get('button[data-screen="map"]').attributes('aria-disabled')).toBe('true');
    await w.setProps({ inCombat: false });
    expect(w.find('.in-combat-tag').exists()).toBe(false);
    expect(w.get('button[data-screen="map"]').attributes('aria-disabled')).toBeUndefined();
    expect(w.get('button[data-screen="map"]').attributes('title')).toBe('Map');
  });

  it('declares the lock style and no animation for the tag', () => {
    const src = readSource('HeaderBar.vue');
    expect(src).toContain('Unavailable in combat');
    expect(src).toContain('combat-locked');
    expect(src).toContain('InCombatTag');
    const tagSrc = readFileSync(resolve(process.cwd(), 'src/combat/InCombatTag.vue'), 'utf8');
    expect(tagSrc).not.toContain('animation');
    expect(tagSrc).not.toContain('transition');
    expect(tagSrc).toContain('in-combat-tag');
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

// 51.3.1.1 UI-SPEC "Rating Marks": the desktop header pill after the place name (dot plus word, the
// rating colour), hidden until the Here data applies; Unknown never reads Safe.
interface PlaceOptions {
  isSafe?: boolean;
  terrainType?: string;
  applied?: boolean;
  familyLevel?: bigint;
}

function placeGame(options: PlaceOptions = {}): GameData {
  return {
    ...createInertGame(),
    character: ref({ id: 1n, name: 'Hero', level: 4n, locationId: 10n }),
    locations: ref([
      {
        id: 10n,
        name: 'Hollow Gate',
        description: '',
        regionId: 1n,
        isSafe: options.isSafe ?? false,
        levelOffset: 0n,
        terrainType: options.terrainType ?? 'woods',
        bindStone: false,
        craftingAvailable: false,
        shortName: '',
      },
    ]),
    regions: ref([{ id: 1n, name: 'Ashen Reach', dangerMultiplier: 400n }]),
    // One family at Lv 3-4 for the level-4 hero: Stable is Quiet, Overrun is Risky.
    poolLevelsHere: ref([
      { id: 1n, regionId: 1n, locationId: 10n, kind: 'creature', level: options.familyLevel ?? 2n, lvLo: 3n, lvHi: 4n },
    ]),
    poolsAppliedFor: () => options.applied ?? true,
  } as unknown as GameData;
}

describe('HeaderBar rating pill', () => {
  it('shows no pill without place data', () => {
    const w = mountHeader();
    expect(w.find('.rating-pill').exists()).toBe(false);
  });

  it('shows the dot and the word in the rating colour after the place name', () => {
    const w = mountHeader({}, placeGame());
    const pill = w.get('.rating-pill');
    expect(pill.text()).toBe('Quiet');
    expect(pill.classes()).toContain('rate-quiet');
    expect(pill.get('.dot').attributes('aria-hidden')).toBe('true');
    expect(pill.attributes('title')).toBe('Something lives here, but it keeps to itself.');
    const html = w.html();
    expect(html.indexOf('class="location"')).toBeLessThan(html.indexOf('rating-pill'));
    expect(html.indexOf('rating-pill')).toBeLessThan(html.indexOf('class="time"'));
  });

  it('reads Risky for an Overrun family and Safe for a safe place', () => {
    const risky = mountHeader({}, placeGame({ familyLevel: 3n }));
    expect(risky.get('.rating-pill').text()).toBe('Risky');
    expect(risky.get('.rating-pill').classes()).toContain('rate-risky');
    risky.unmount();
    const safe = mountHeader({}, placeGame({ isSafe: true, terrainType: 'town' }));
    expect(safe.get('.rating-pill').text()).toBe('Safe');
    expect(safe.get('.rating-pill').classes()).toContain('rate-safe');
  });

  it('is hidden until the pool rows apply and never reads Safe meanwhile', () => {
    const w = mountHeader({}, placeGame({ applied: false }));
    expect(w.find('.rating-pill').exists()).toBe(false);
    expect(w.text()).not.toContain('Safe');
  });

  it('stays in combat, before the In combat tag', () => {
    const w = mountHeader({ inCombat: true, roundNumber: 2n }, placeGame());
    const html = w.html();
    expect(w.get('.rating-pill').text()).toBe('Quiet');
    expect(html.indexOf('rating-pill')).toBeLessThan(html.indexOf('in-combat-tag'));
  });

  it('declares the pill form and lets the place name ellipsize first', () => {
    const src = readSource('HeaderBar.vue');
    expect(src).toMatch(/RatingMark/);
    expect(src).toMatch(
      /\.rating-pill\s*\{[^}]*border-radius: 999px;[^}]*padding: 0 8px;[^}]*font-size: 12px;[^}]*box-shadow: inset 0 0 0 1px color-mix\(in srgb, currentColor 50%, transparent\);/,
    );
    // the pill keeps its width (fixed short words); the location shrinks and the name ellipsizes
    expect(src).toMatch(/\.header-bar > \* \{\s*flex-shrink: 0;/);
    expect(src).toMatch(/\.header-bar > \.location \{[^}]*min-width: 0;[^}]*flex-shrink: 1;/);
    expect(src).toMatch(/\.place \{[^}]*text-overflow: ellipsis;/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}|oklch\(|v-html/);
  });
});
