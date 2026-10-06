// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import CharacterPicker from './CharacterPicker.vue';
import PreFrameHeader from './PreFrameHeader.vue';
import type { Character } from '../module_bindings/types';
import { parseDecls, sfcStyleBlocks } from '../styles/cssContract';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function makeCharacter(overrides: Partial<Record<string, unknown>> = {}): Character {
  return {
    id: 1n,
    name: 'Aria',
    race: 'Elf',
    className: 'Wizard',
    level: 6n,
    ...overrides,
  } as unknown as Character;
}

const ARIA = makeCharacter();
const BORIN = makeCharacter({ id: 2n, name: 'Borin', race: 'Dwarf', className: 'Cleric', level: 3n });

function mountPicker(props: { characters: readonly Character[]; pendingId?: bigint | null; failed?: boolean }) {
  wrapper = mount(CharacterPicker, {
    props: { characters: props.characters, pendingId: props.pendingId ?? null, failed: props.failed ?? false },
  });
  return wrapper;
}

describe('PreFrameHeader', () => {
  it('shows brand, title and a Log out button that emits logout', async () => {
    wrapper = mount(PreFrameHeader, { props: { title: 'Characters' } });
    expect(wrapper.text()).toContain('Unwritten Realms');
    expect(wrapper.text()).toContain('Characters');
    const button = wrapper.find('button.btn-ghost');
    expect(button.text()).toContain('Log out');
    await button.trigger('click');
    expect(wrapper.emitted('logout')).toHaveLength(1);
  });
});

describe('CharacterPicker', () => {
  it('renders the heading and one labelled row per character in the given order', () => {
    const w = mountPicker({ characters: [ARIA, BORIN] });
    expect(w.find('h4').text()).toBe('Choose a character');
    const rows = w.findAll('button.row');
    expect(rows).toHaveLength(2);
    expect(rows[0].attributes('aria-label')).toBe('Play as Aria');
    expect(rows[1].attributes('aria-label')).toBe('Play as Borin');
    expect(rows[0].text()).toContain('Aria');
    expect(rows[0].text()).toContain('Lv 6 · Elf Wizard');
    expect(rows[1].text()).toContain('Lv 3 · Dwarf Cleric');
    expect(rows[0].find('.name').attributes('title')).toBe('Aria');
  });

  it('lists a single character and does not auto-select it', () => {
    const w = mountPicker({ characters: [ARIA] });
    expect(w.findAll('button.row')).toHaveLength(1);
    expect(w.emitted('select')).toBeUndefined();
  });

  it('emits select with the bigint id of the clicked row', async () => {
    const w = mountPicker({ characters: [ARIA, BORIN] });
    await w.findAll('button.row')[1].trigger('click');
    expect(w.emitted('select')).toEqual([[2n]]);
  });

  it('disables every row while pending and shows a spinner on the chosen row only', () => {
    const w = mountPicker({ characters: [ARIA, BORIN], pendingId: 2n });
    const rows = w.findAll('button.row');
    expect(rows.every((r) => r.attributes('disabled') !== undefined)).toBe(true);
    expect(rows[0].find('svg.spin').exists()).toBe(false);
    expect(rows[1].find('svg.spin').exists()).toBe(true);
  });

  it('shows no spinner and enabled rows when nothing is pending', () => {
    const w = mountPicker({ characters: [ARIA, BORIN] });
    expect(w.find('svg.spin').exists()).toBe(false);
    expect(w.findAll('button.row').every((r) => r.attributes('disabled') === undefined)).toBe(true);
  });

  it('shows the failure alert above the list and keeps rows enabled', () => {
    const w = mountPicker({ characters: [ARIA], failed: true });
    const alert = w.find('[role="alert"]');
    expect(alert.text()).toBe("Couldn't open that character. Try again.");
    expect(w.find('button.row').attributes('disabled')).toBeUndefined();
    expect(w.find('[role="alert"]').element.compareDocumentPosition(w.find('.list').element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('shows no alert when not failed', () => {
    expect(mountPicker({ characters: [ARIA] }).find('[role="alert"]').exists()).toBe(false);
  });

  it('emits logout from the header', async () => {
    const w = mountPicker({ characters: [ARIA] });
    await w.find('header button').trigger('click');
    expect(w.emitted('logout')).toHaveLength(1);
  });

  it('scrolls inside the card with the pinned max-height', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/session/CharacterPicker.vue'), 'utf8');
    const decls = sfcStyleBlocks(source).flatMap((block) => parseDecls(block, 'CharacterPicker.vue'));
    const list = Object.fromEntries(decls.filter((d) => d.selector === '.list').map((d) => [d.prop, d.value]));
    expect(list['max-height']).toBe('calc(100dvh - 160px)');
    expect(list['overflow-y']).toBe('auto');
  });

  it('keeps long names on one line with an ellipsis', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/session/CharacterPicker.vue'), 'utf8');
    const decls = sfcStyleBlocks(source).flatMap((block) => parseDecls(block, 'CharacterPicker.vue'));
    const name = Object.fromEntries(decls.filter((d) => d.selector === '.name').map((d) => [d.prop, d.value]));
    expect(name['white-space']).toBe('nowrap');
    expect(name['overflow']).toBe('hidden');
    expect(name['text-overflow']).toBe('ellipsis');
  });

  it('sets the row text color so names never fall back to the browser button default', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/session/CharacterPicker.vue'), 'utf8');
    const decls = sfcStyleBlocks(source).flatMap((block) => parseDecls(block, 'CharacterPicker.vue'));
    const row = Object.fromEntries(decls.filter((d) => d.selector === '.row').map((d) => [d.prop, d.value]));
    expect(row['color']).toBe('var(--color-text)');
  });

  it('has no New character button (one character per account)', () => {
    const w = mountPicker({ characters: [ARIA, BORIN] });
    expect(w.text()).not.toContain('New character');
  });

  it('renders markup in a name as text, never as elements', () => {
    const w = mountPicker({ characters: [makeCharacter({ name: '<b>x</b>' })] });
    expect(w.find('.name b').exists()).toBe(false);
    expect(w.find('.name').text()).toBe('<b>x</b>');
  });
});
