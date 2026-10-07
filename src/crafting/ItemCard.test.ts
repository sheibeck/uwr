// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhSword } from '@phosphor-icons/vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ItemCard from './ItemCard.vue';
import type { ItemDetails } from '../ledger/itemDetails';

const XSS = '<img src=x onerror=alert(1)>';
const source = readFileSync(resolve(process.cwd(), 'src/crafting/ItemCard.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function details(over: Partial<ItemDetails> = {}): ItemDetails {
  return {
    typeParts: [
      { text: 'Main hand', tone: 'normal' },
      { text: 'Dagger', tone: 'normal' },
      { text: 'Requires Lv 6', tone: 'short' },
    ],
    stats: [
      { key: 'weaponBaseDamage', label: 'Damage', abbr: 'DMG', text: '4' },
      { key: 'weaponDps', label: 'DPS', abbr: 'DPS', text: '5' },
      { key: 'strBonus', label: 'Strength', abbr: 'STR', text: '+2' },
    ],
    effect: null,
    meta: 'Sells for 7',
    description: 'A dagger forged from Iron Shard.',
    ...over,
  };
}

function mountCard(props: Record<string, unknown> = {}) {
  wrapper = mount(ItemCard, {
    attachTo: document.body,
    props: {
      kicker: 'Creates',
      name: 'Iron Shard Dagger',
      color: 'var(--color-rarity-rare)',
      icon: PhSword,
      yieldTag: 'x2',
      details: details(),
      ...props,
    },
  });
  return wrapper;
}

describe('ItemCard desktop', () => {
  it('draws the kicker, the icon box with the ring and glow, the yield tag, the name and the type line', () => {
    const w = mountCard();
    expect(w.get('.kicker').text()).toBe('Creates');
    const box = w.get('.icon-box');
    const style = box.attributes('style') ?? '';
    expect(style).toContain('var(--color-rarity-rare)');
    expect(style).toContain('0 0 18px');
    expect(style).toContain('color-mix(in srgb, var(--color-rarity-rare) 22%, transparent)');
    expect(box.find('svg').exists()).toBe(true);
    expect(box.get('.yield-tag').text()).toBe('x2');
    const name = w.get('h4.name');
    expect(name.text()).toBe('Iron Shard Dagger');
    expect(name.attributes('style')).toContain('var(--color-rarity-rare)');
    expect(w.get('.type-line').text()).toBe('Main hand · Dagger · Requires Lv 6');
    expect(w.findAll('.type-part').map((p) => p.classes().includes('short'))).toEqual([false, false, true]);
  });

  it('draws one stat tile per stat with the label and the value as text', () => {
    const w = mountCard();
    const tiles = w.findAll('.stat-tiles .stat-tile');
    expect(tiles.map((t) => [t.get('.stat-label').text(), t.get('.stat-value').text()])).toEqual([
      ['Damage', '4'],
      ['DPS', '5'],
      ['Strength', '+2'],
    ]);
    expect(w.find('.stat-chips').exists()).toBe(false);
  });

  it('draws the effect with the heartbeat icon, the meta line and the description', () => {
    const w = mountCard({ details: details({ effect: 'Eat to be well fed: +2 strength.' }) });
    expect(w.get('.effect').text()).toBe('Eat to be well fed: +2 strength.');
    expect(w.get('.effect').find('svg').exists()).toBe(true);
    expect(w.get('.meta').text()).toBe('Sells for 7');
    expect(w.get('.description').text()).toBe('A dagger forged from Iron Shard.');
  });

  it('renders nothing for an absent effect, description, yield tag, stats or kicker', () => {
    const w = mountCard({
      kicker: '',
      yieldTag: '',
      details: details({ effect: null, description: null, stats: [] }),
    });
    expect(w.find('.kicker').exists()).toBe(false);
    expect(w.find('.yield-tag').exists()).toBe(false);
    expect(w.find('.effect').exists()).toBe(false);
    expect(w.find('.description').exists()).toBe(false);
    expect(w.find('.stat-tiles').exists()).toBe(false);
    expect(w.find('.stat-chips').exists()).toBe(false);
  });
});

describe('ItemCard mobile', () => {
  it('shows the stats as neutral chips and has no kicker and no description', () => {
    const w = mountCard({ mobile: true, details: details({ effect: 'Eat to be well fed: +2 strength.' }) });
    expect(w.find('.kicker').exists()).toBe(false);
    expect(w.find('.description').exists()).toBe(false);
    expect(w.find('.stat-tiles').exists()).toBe(false);
    const chips = w.findAll('.stat-chips .tag.tag-neutral');
    expect(chips.map((c) => c.text())).toEqual(['Damage 4', 'DPS 5', 'Strength +2']);
    expect(w.get('.effect').text()).toContain('well fed');
    expect(w.get('.meta').text()).toBe('Sells for 7');
    expect(w.get('.icon-box').attributes('style')).not.toContain('0 0 18px');
  });
});

describe('ItemCard escaping', () => {
  it('renders markup in the name, a stat label, the meta and the description as text', () => {
    const w = mountCard({
      name: XSS,
      details: details({
        stats: [{ key: 'strBonus', label: XSS, abbr: 'STR', text: '+1' }],
        meta: XSS,
        description: XSS,
        effect: XSS,
        typeParts: [{ text: XSS, tone: 'normal' }],
      }),
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('h4.name').text()).toBe(XSS);
    expect(w.get('.stat-label').text()).toBe(XSS);
    expect(w.get('.meta').text()).toBe(XSS);
    expect(w.get('.description').text()).toBe(XSS);
    expect(w.get('.effect').text()).toBe(XSS);
    expect(w.get('.type-line').text()).toBe(XSS);
    wrapper?.unmount();
    wrapper = null;
    const mobile = mountCard({
      mobile: true,
      details: details({ stats: [{ key: 'strBonus', label: XSS, abbr: 'STR', text: '+1' }] }),
    });
    expect(mobile.find('img').exists()).toBe(false);
    expect(mobile.get('.stat-chip').text()).toBe(`${XSS} +1`);
  });
});

describe('ItemCard source pins', () => {
  it('sets the three-column tile grid, the 64px and 56px icon boxes, and uses no literal color', () => {
    expect(source).toMatch(/\.stat-tiles\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[^}]*gap: 8px;/);
    expect(source).toMatch(/\.icon-box\s*\{[^}]*width: 64px;\s*height: 64px;/);
    expect(source).toMatch(/\.mobile \.icon-box\s*\{\s*width: 56px;\s*height: 56px;/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:rgb|rgba|hsl|hsla|oklch)\(/);
    expect(source).not.toMatch(/v-html|<svg/);
  });
});
