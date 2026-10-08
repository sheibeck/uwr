// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import {
  PhChatCircleDots,
  PhCrownSimple,
  PhEye,
  PhFootprints,
  PhHeart,
  PhSignOut,
  PhUserMinus,
  PhUserPlus,
  PhXCircle,
} from '@phosphor-icons/vue';
import ActionMenu from './ActionMenu.vue';
import InlineConfirm from '../ledger/InlineConfirm.vue';
import type { MenuAction, MenuEntry, MenuGroup, MenuIcon } from './playerMenu';

// The menu renderer (51.1-UI-SPEC "Party and Player Menus"): any ordered list of entry groups with
// separators between non-empty groups, menu roles, the keyboard rules, inline confirms and, on a
// phone, the action sheet. Placement is pure (menuSupport.test.ts); happy-dom has no layout.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function entry(action: MenuAction, label: string, icon: MenuIcon, over: Partial<MenuEntry> = {}): MenuEntry {
  return { action, label, icon, tone: 'default', disabled: false, hint: null, confirm: null, ...over };
}

const INVITE = entry('invite', 'Invite to party', 'userPlus', { tone: 'accent' });
const WHISPER = entry('whisper', 'Whisper', 'chatCircleDots');
const EXAMINE = entry('examine', 'Examine', 'eye');
const FRIEND = entry('addFriend', 'Add friend', 'heart');
const LEADER = entry('makeLeader', 'Make party leader', 'crownSimple', { tone: 'accent' });
const REMOVE = entry('remove', 'Remove from party', 'userMinus', {
  tone: 'danger',
  confirm: { prompt: 'Remove Bram from the party?', confirmLabel: 'Remove', keepLabel: 'Keep Bram' },
});

const THREE: MenuGroup[] = [
  { key: 'party', entries: [INVITE] },
  { key: 'social', entries: [WHISPER, EXAMINE, FRIEND] },
  { key: 'leader', entries: [LEADER, REMOVE] },
];

const HEADER = { name: 'Bram', you: false, line: 'Lv 5 Orc Shaman · in your party' };

function mountMenu(props: Record<string, unknown> = {}): VueWrapper {
  wrapper = mount(ActionMenu, {
    attachTo: document.body,
    props: {
      groups: THREE,
      header: HEADER,
      mobile: false,
      menuId: 'menu-1',
      anchor: { top: 100, bottom: 128, left: 200, right: 228 },
      side: 'right',
      initialFocus: 'first',
      pendingAction: null,
      ...props,
    } as never,
  });
  return wrapper;
}

function items(w: VueWrapper) {
  return w.findAll('[role="menuitem"]');
}

function itemEl(w: VueWrapper, label: string): HTMLElement {
  const found = items(w).find((item) => item.text().includes(label));
  if (!found) throw new Error(`no item ${label}`);
  return found.element as HTMLElement;
}

function key(target: Element, keyName: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function active(): Element | null {
  return document.activeElement;
}

describe('ActionMenu groups and separators', () => {
  it('three groups render in order with two separators', () => {
    const w = mountMenu();
    expect(items(w).map((item) => item.text())).toEqual([
      'Invite to party',
      'Whisper',
      'Examine',
      'Add friend',
      'Make party leader',
      'Remove from party',
    ]);
    expect(w.findAll('[role="separator"]')).toHaveLength(2);
    const menu = w.get('[role="menu"]');
    const children = Array.from(menu.element.children).map((el) =>
      el.getAttribute('role') === 'separator' ? '|' : (el.textContent ?? '').trim(),
    );
    expect(children).toEqual([
      'Invite to party',
      '|',
      'Whisper',
      'Examine',
      'Add friend',
      '|',
      'Make party leader',
      'Remove from party',
    ]);
  });

  it('a fourth group renders with a third separator and no renderer change', () => {
    const guild: MenuGroup = { key: 'guild', entries: [entry('addFriend', 'Guild thing', 'heart')] };
    const w = mountMenu({ groups: [...THREE, guild] });
    expect(w.findAll('[role="separator"]')).toHaveLength(3);
    expect(items(w).map((item) => item.text()).pop()).toBe('Guild thing');
  });

  it('an empty group renders nothing and adds no separator', () => {
    const w = mountMenu({
      groups: [{ key: 'party', entries: [] }, { key: 'social', entries: [WHISPER] }, { key: 'leader', entries: [] }],
    });
    expect(items(w)).toHaveLength(1);
    expect(w.findAll('[role="separator"]')).toHaveLength(0);
  });

  it('the panel carries the menu id and the menu is labelled by the header name', () => {
    const w = mountMenu();
    const panel = w.get('#menu-1');
    const menu = panel.get('[role="menu"]');
    const labelId = menu.attributes('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)?.textContent).toContain('Bram');
  });
});

describe('ActionMenu items', () => {
  it('each item is a button with role menuitem, its icon, its label and its hint', () => {
    const disabled = entry('invite', 'Invite to party', 'userPlus', { disabled: true, hint: 'In another party' });
    const w = mountMenu({ groups: [{ key: 'party', entries: [disabled] }, { key: 'social', entries: [WHISPER] }] });
    for (const item of items(w)) {
      expect(item.element.tagName).toBe('BUTTON');
      expect(item.attributes('type')).toBe('button');
      expect(item.find('svg').exists()).toBe(true);
    }
    expect(items(w)[0].text()).toContain('Invite to party');
    expect(items(w)[0].text()).toContain('In another party');
  });

  it('a full set of icon ids maps to nine different Phosphor icons', () => {
    const all: MenuGroup[] = [
      {
        key: 'all',
        entries: [
          entry('invite', 'a', 'userPlus'),
          entry('cancelInvite', 'b', 'xCircle'),
          entry('whisper', 'c', 'chatCircleDots'),
          entry('examine', 'd', 'eye'),
          entry('addFriend', 'e', 'heart'),
          entry('makeLeader', 'f', 'crownSimple'),
          entry('remove', 'g', 'userMinus'),
          entry('travelWithLeader', 'h', 'footprints'),
          entry('leave', 'i', 'signOut'),
        ],
      },
    ];
    const w = mountMenu({ groups: all });
    const icons = [
      PhUserPlus,
      PhXCircle,
      PhChatCircleDots,
      PhEye,
      PhHeart,
      PhCrownSimple,
      PhUserMinus,
      PhFootprints,
      PhSignOut,
    ];
    for (const icon of icons) expect(w.findAllComponents(icon)).toHaveLength(1);
  });

  it('a disabled entry is aria-disabled, named "{label}, {hint}" and a click emits nothing', async () => {
    const disabled = entry('invite', 'Invite to party', 'userPlus', { disabled: true, hint: 'In another party' });
    const w = mountMenu({ groups: [{ key: 'party', entries: [disabled] }, { key: 'social', entries: [WHISPER] }] });
    const item = items(w)[0];
    expect(item.attributes('aria-disabled')).toBe('true');
    expect(item.attributes('aria-label')).toBe('Invite to party, In another party');
    await item.trigger('click');
    expect(w.emitted('select')).toBeUndefined();
    expect(items(w)[1].attributes('aria-disabled')).toBeUndefined();
  });

  it('the danger and accent tones are classes on the item', () => {
    const w = mountMenu();
    expect(itemEl(w, 'Remove from party').classList.contains('tone-danger')).toBe(true);
    expect(itemEl(w, 'Make party leader').classList.contains('tone-accent')).toBe(true);
  });
});

describe('ActionMenu focus and keys', () => {
  it('initialFocus first focuses the first enabled item after mount', async () => {
    const disabled = entry('invite', 'Invite to party', 'userPlus', { disabled: true, hint: 'Party full' });
    const w = mountMenu({ groups: [{ key: 'party', entries: [disabled] }, { key: 'social', entries: [WHISPER, EXAMINE] }] });
    await nextTick();
    expect(active()).toBe(itemEl(w, 'Whisper'));
  });

  it('initialFocus last focuses the last enabled item', async () => {
    const offline = entry('examine', 'Examine', 'eye', { disabled: true, hint: 'Offline' });
    const w = mountMenu({ groups: [{ key: 'social', entries: [WHISPER, FRIEND, offline] }], initialFocus: 'last' });
    await nextTick();
    expect(active()).toBe(itemEl(w, 'Add friend'));
  });

  it('Arrow Down wraps from the last item to the first, Arrow Up back, disabled items are visited', async () => {
    const disabled = entry('invite', 'Invite to party', 'userPlus', { disabled: true, hint: 'Party full' });
    const w = mountMenu({ groups: [{ key: 'party', entries: [disabled] }, { key: 'social', entries: [WHISPER, EXAMINE] }] });
    await nextTick();
    itemEl(w, 'Examine').focus();
    const down = key(itemEl(w, 'Examine'), 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(active()).toBe(itemEl(w, 'Invite to party'));
    key(itemEl(w, 'Invite to party'), 'ArrowUp');
    expect(active()).toBe(itemEl(w, 'Examine'));
    key(itemEl(w, 'Examine'), 'ArrowUp');
    expect(active()).toBe(itemEl(w, 'Whisper'));
  });

  it('Home and End jump to the first and last items', async () => {
    const w = mountMenu();
    await nextTick();
    key(itemEl(w, 'Invite to party'), 'End');
    expect(active()).toBe(itemEl(w, 'Remove from party'));
    key(itemEl(w, 'Remove from party'), 'Home');
    expect(active()).toBe(itemEl(w, 'Invite to party'));
  });

  it('Escape emits close(true), prevented and stopped', async () => {
    const w = mountMenu();
    await nextTick();
    let reachedDocument = false;
    const listener = () => {
      reachedDocument = true;
    };
    document.addEventListener('keydown', listener);
    const event = key(itemEl(w, 'Whisper'), 'Escape');
    document.removeEventListener('keydown', listener);
    expect(w.emitted('close')).toEqual([[true]]);
    expect(event.defaultPrevented).toBe(true);
    expect(reachedDocument).toBe(false);
  });

  it('Tab emits close(false) and is not prevented', async () => {
    const w = mountMenu();
    await nextTick();
    const event = key(itemEl(w, 'Whisper'), 'Tab');
    expect(w.emitted('close')).toEqual([[false]]);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('ActionMenu selection and inline confirm', () => {
  it('an entry without a confirm emits select once', async () => {
    const w = mountMenu();
    await items(w)[1].trigger('click');
    expect(w.emitted('select')).toEqual([[WHISPER]]);
  });

  it('an entry with a confirm shows InlineConfirm with focus on the keep button', async () => {
    const w = mountMenu();
    await nextTick();
    itemEl(w, 'Remove from party').click();
    await nextTick();
    expect(w.emitted('select')).toBeUndefined();
    expect(items(w)).toHaveLength(0);
    const confirm = w.getComponent(InlineConfirm);
    expect(confirm.props('prompt')).toBe('Remove Bram from the party?');
    expect(confirm.props('confirmLabel')).toBe('Remove');
    expect(confirm.props('keepLabel')).toBe('Keep Bram');
    expect(confirm.props('mobile')).toBe(false);
    expect(active()?.textContent?.trim()).toBe('Keep Bram');
  });

  it('keep restores the items and focuses the entry', async () => {
    const w = mountMenu();
    await nextTick();
    itemEl(w, 'Remove from party').click();
    await nextTick();
    const keep = w.findAll('button').find((button) => button.text() === 'Keep Bram');
    await keep?.trigger('click');
    await nextTick();
    await nextTick();
    expect(items(w)).toHaveLength(6);
    expect(active()).toBe(itemEl(w, 'Remove from party'));
    expect(w.emitted('select')).toBeUndefined();
    expect(w.emitted('close')).toBeUndefined();
  });

  it('Escape inside the confirm returns to the items and does not close the menu', async () => {
    const w = mountMenu();
    await nextTick();
    itemEl(w, 'Remove from party').click();
    await nextTick();
    key(active() as Element, 'Escape');
    await nextTick();
    await nextTick();
    expect(items(w)).toHaveLength(6);
    expect(w.emitted('close')).toBeUndefined();
    expect(active()).toBe(itemEl(w, 'Remove from party'));
  });

  it('confirm emits select once', async () => {
    const w = mountMenu();
    await nextTick();
    itemEl(w, 'Remove from party').click();
    await nextTick();
    const remove = w.findAll('button').find((button) => button.text() === 'Remove');
    await remove?.trigger('click');
    expect(w.emitted('select')).toEqual([[REMOVE]]);
  });

  it('while pendingAction equals an entry action that item is inert', async () => {
    const w = mountMenu({ pendingAction: 'whisper' });
    const item = items(w)[1];
    expect(item.attributes('aria-disabled')).toBe('true');
    await item.trigger('click');
    expect(w.emitted('select')).toBeUndefined();
    await items(w)[2].trigger('click');
    expect(w.emitted('select')).toEqual([[EXAMINE]]);
  });

  it('a pending confirm entry makes the confirm button inert', async () => {
    const w = mountMenu();
    await nextTick();
    itemEl(w, 'Remove from party').click();
    await nextTick();
    await w.setProps({ pendingAction: 'remove' });
    expect(w.getComponent(InlineConfirm).props('pending')).toBe(true);
    const remove = w.findAll('button').find((button) => button.text() === 'Remove');
    await remove?.trigger('click');
    expect(w.emitted('select')).toBeUndefined();
  });
});

describe('ActionMenu header', () => {
  it('shows the name as text, the line, and no " you" for someone else', () => {
    const w = mountMenu({ header: { name: '<b>Bram</b>', you: false, line: 'Lv 5 Orc Shaman' } });
    const head = w.get('.menu-head');
    expect(head.text()).toContain('<b>Bram</b>');
    expect(head.find('b').exists()).toBe(false);
    expect(head.text()).toContain('Lv 5 Orc Shaman');
    expect(head.text()).not.toContain(' you');
  });

  it("shows ' you' for yourself", () => {
    const w = mountMenu({ header: { name: 'Ann', you: true, line: 'Lv 5 Orc Shaman' } });
    expect(w.get('.head-you').text()).toBe('you');
    expect(w.get('.menu-head').text()).toContain('Ann you');
  });

  it('the header is not focusable', () => {
    const w = mountMenu();
    expect(w.get('.menu-head').findAll('button, [tabindex]')).toHaveLength(0);
  });

  it('desktop renders a fixed panel with no scrim or dialog', () => {
    const w = mountMenu();
    expect(w.find('.menu-panel').exists()).toBe(true);
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.find('.menu-scrim').exists()).toBe(false);
    const style = (w.get('.menu-panel').element as HTMLElement).style;
    expect(style.top).toBe('100px');
    expect(style.left).toBe('232px');
  });

  it('no menu item contains another interactive element', () => {
    const w = mountMenu();
    for (const item of items(w)) expect(item.findAll('button, a, input, select, textarea')).toHaveLength(0);
  });
});

describe('ActionMenu mobile sheet', () => {
  function mountSheet(props: Record<string, unknown> = {}): VueWrapper {
    return mountMenu({ mobile: true, anchor: null, ...props });
  }

  it('renders a scrim and a modal dialog labelled by the header name, holding the menu', () => {
    const w = mountSheet();
    expect(w.find('.menu-scrim').exists()).toBe(true);
    const dialog = w.get('section[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    const labelId = dialog.attributes('aria-labelledby') as string;
    expect(document.getElementById(labelId)?.textContent).toContain('Bram');
    expect(dialog.find('[role="menu"]').exists()).toBe(true);
    expect(dialog.attributes('id')).toBe('menu-1');
    expect(w.find('.menu-panel').exists()).toBe(false);
  });

  it('the header shows a 40px initial tile with the first letter, the name and the sub-line', () => {
    const w = mountSheet();
    const tile = w.get('.head-tile');
    expect(tile.text()).toBe('B');
    expect(tile.attributes('aria-hidden')).toBe('true');
    expect(tile.classes()).not.toContain('you');
    expect(w.get('.sheet-head').text()).toContain('Bram');
    expect(w.get('.sheet-line').text()).toBe('Lv 5 Orc Shaman · in your party');
  });

  it('your own tile carries the you class', () => {
    const w = mountSheet({ header: { name: 'ann', you: true, line: '' } });
    expect(w.get('.head-tile').text()).toBe('A');
    expect(w.get('.head-tile').classes()).toContain('you');
  });

  it('items carry the mobile class and the sheet has a Cancel button', () => {
    const w = mountSheet();
    for (const item of items(w)) expect(item.classes()).toContain('mobile');
    const cancel = w.get('.menu-cancel');
    expect(cancel.element.tagName).toBe('BUTTON');
    expect(cancel.text()).toBe('Cancel');
    expect(cancel.classes()).toEqual(expect.arrayContaining(['btn', 'btn-ghost']));
  });

  it('the style block sets the 48px rows and the 44px Cancel', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(process.cwd(), 'src/social/ActionMenu.vue'), 'utf8');
    expect(source).toMatch(/\.menu-item\.mobile\s*\{[^}]*min-height: 48px/);
    expect(source).toMatch(/\.menu-cancel\s*\{[^}]*min-height: 44px/);
  });

  it('focuses the first enabled item on open', async () => {
    const w = mountSheet();
    await nextTick();
    expect(active()).toBe(itemEl(w, 'Invite to party'));
  });

  it('Tab from the last focusable wraps to the first, Shift+Tab from the first to the last', async () => {
    const w = mountSheet();
    await nextTick();
    const cancel = w.get('.menu-cancel').element as HTMLElement;
    cancel.focus();
    const tab = key(cancel, 'Tab');
    expect(tab.defaultPrevented).toBe(true);
    expect(active()).toBe(itemEl(w, 'Invite to party'));
    const back = key(itemEl(w, 'Invite to party'), 'Tab', { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(active()).toBe(cancel);
    expect(w.emitted('close')).toBeUndefined();
  });

  it('arrows, Home and End work as on desktop', async () => {
    const w = mountSheet();
    await nextTick();
    key(itemEl(w, 'Invite to party'), 'ArrowUp');
    expect(active()).toBe(itemEl(w, 'Remove from party'));
    key(itemEl(w, 'Remove from party'), 'Home');
    expect(active()).toBe(itemEl(w, 'Invite to party'));
    key(itemEl(w, 'Invite to party'), 'End');
    expect(active()).toBe(itemEl(w, 'Remove from party'));
  });

  it('Escape closes with focus return, prevented and stopped', async () => {
    const w = mountSheet();
    await nextTick();
    let reachedDocument = false;
    const listener = () => {
      reachedDocument = true;
    };
    document.addEventListener('keydown', listener);
    const event = key(itemEl(w, 'Whisper'), 'Escape');
    document.removeEventListener('keydown', listener);
    expect(event.defaultPrevented).toBe(true);
    expect(reachedDocument).toBe(false);
    expect(w.emitted('close')).toEqual([[true]]);
  });

  it('Cancel closes with focus return', async () => {
    const w = mountSheet();
    await w.get('.menu-cancel').trigger('click');
    expect(w.emitted('close')).toEqual([[true]]);
  });

  it('a tap on the scrim closes with focus return', async () => {
    const w = mountSheet();
    await w.get('.menu-scrim').trigger('click');
    expect(w.emitted('close')).toEqual([[true]]);
  });

  it('an entry with a confirm shows InlineConfirm with mobile true', async () => {
    const w = mountSheet();
    await nextTick();
    itemEl(w, 'Remove from party').click();
    await nextTick();
    const confirm = w.getComponent(InlineConfirm);
    expect(confirm.props('mobile')).toBe(true);
    expect(confirm.props('prompt')).toBe('Remove Bram from the party?');
    expect(active()?.textContent?.trim()).toBe('Keep Bram');
  });

  it('names render as text', () => {
    const w = mountSheet({ header: { name: '<img src=x onerror=alert(1)>', you: false, line: '<i>x</i>' } });
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('i').exists()).toBe(false);
    expect(w.get('.sheet-head').text()).toContain('<img src=x onerror=alert(1)>');
    expect(w.get('.sheet-line').text()).toBe('<i>x</i>');
  });

  it('the sheet has no inline placement', () => {
    const w = mountSheet();
    expect((w.get('section[role="dialog"]').element as HTMLElement).style.top).toBe('');
  });
});

// Review client-social IN-09: the panel width and the placement clamp share MENU_WIDTH.
describe('ActionMenu width', () => {
  it('the desktop panel takes its width from MENU_WIDTH, and the CSS hard-codes none', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { MENU_WIDTH } = await import('./menuPosition');
    const source = readFileSync(resolve(process.cwd(), 'src/social/ActionMenu.vue'), 'utf8');
    expect(source).not.toMatch(/width:\s*224px/);
    expect(source).toContain('width: `${MENU_WIDTH}px`');
    expect(MENU_WIDTH).toBe(224);
  });
});
