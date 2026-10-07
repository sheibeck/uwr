// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GraphList from './GraphList.vue';
import type { ListRow } from './nodeView';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/GraphList.vue'), 'utf8');
const XSS = '<img src=x onerror=alert(1)>';

const row = (id: bigint, over: Partial<ListRow> = {}): ListRow => ({
  id,
  name: `Place ${id}`,
  stateWord: 'visited',
  levelText: 'Lv 3–5',
  bandWord: 'even',
  stepsText: '2 steps',
  connectsTo: 'Connects to Alpha, Beta (Saltmarsh)',
  selected: false,
  ...over,
});

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountList(rows: ListRow[]): VueWrapper {
  wrapper = mount(GraphList, { props: { rows } });
  return wrapper;
}

describe('GraphList', () => {
  it('is a ul of buttons in the given order', () => {
    const w = mountList([row(3n), row(1n), row(2n)]);
    expect(w.get('ul').exists()).toBe(true);
    const buttons = w.findAll('li > button');
    expect(buttons.map((b) => b.get('.name').text())).toEqual(['Place 3', 'Place 1', 'Place 2']);
  });

  it('shows the name with a title, the state word, the level with its band word and the steps', () => {
    const w = mountList([row(1n, { name: 'Gloamwood', stateWord: 'heard of' })]);
    const button = w.get('button');
    expect(button.get('.name').text()).toBe('Gloamwood');
    expect(button.get('.name').attributes('title')).toBe('Gloamwood');
    expect(button.get('.state').text()).toBe('heard of');
    expect(button.get('.level').text()).toBe('Lv 3–5 · even');
    expect(button.get('.steps').text()).toBe('2 steps');
  });

  it('colours the level by band, safe and unknown through classes', () => {
    const w = mountList([
      row(1n, { bandWord: 'easy' }),
      row(2n, { bandWord: 'even' }),
      row(3n, { bandWord: 'tough' }),
      row(4n, { bandWord: 'deadly' }),
      row(5n, { levelText: 'Safe', bandWord: '' }),
      row(6n, { levelText: 'Danger unknown', bandWord: '' }),
    ]);
    const levels = w.findAll('.level');
    expect(levels.map((l) => l.classes().filter((c) => c.startsWith('lv-')))).toEqual([
      ['lv-easy'],
      ['lv-even'],
      ['lv-tough'],
      ['lv-deadly'],
      ['lv-safe'],
      ['lv-unknown'],
    ]);
    // safe and unknown have no band word
    expect(levels[4].text()).toBe('Safe');
    expect(levels[5].text()).toBe('Danger unknown');
  });

  it('shows the Connects to sub-line only when present and wraps it', () => {
    const w = mountList([row(1n), row(2n, { connectsTo: null })]);
    const connects = w.findAll('.connects');
    expect(connects).toHaveLength(1);
    expect(connects[0].text()).toBe('Connects to Alpha, Beta (Saltmarsh)');
  });

  it('the selected row has aria-pressed true and the selected class; others have no aria-pressed', () => {
    const w = mountList([row(1n), row(2n, { selected: true })]);
    const buttons = w.findAll('button');
    expect(buttons[0].attributes('aria-pressed')).toBeUndefined();
    expect(buttons[0].classes()).not.toContain('selected');
    expect(buttons[1].attributes('aria-pressed')).toBe('true');
    expect(buttons[1].classes()).toContain('selected');
  });

  it('clicking a row emits select with the id', async () => {
    const w = mountList([row(7n), row(9n)]);
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('select')).toEqual([[9n]]);
  });

  it('renders an empty list as an empty ul', () => {
    const w = mountList([]);
    expect(w.findAll('li')).toHaveLength(0);
  });

  it('renders hostile names as text, never as elements', () => {
    const w = mountList([row(1n, { name: XSS, connectsTo: `Connects to ${XSS}` })]);
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.name').text()).toBe(XSS);
    expect(w.get('.connects').text()).toBe(`Connects to ${XSS}`);
  });

  it('source: 32px rows, 44px under 899px, ellipsis names, wrapping sub-line, no v-html', () => {
    expect(SOURCE).toMatch(/min-height:\s*32px/);
    expect(SOURCE).toContain('max-width: 899px');
    expect(SOURCE).toMatch(/min-height:\s*44px/);
    expect(SOURCE).toContain('text-overflow: ellipsis');
    expect(SOURCE).toContain('overflow-wrap: anywhere');
    expect(SOURCE).toContain('var(--color-bg)');
    expect(SOURCE).not.toContain('v-html');
  });
});
