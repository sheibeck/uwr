// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhHammer, PhMagnifyingGlass, PhScroll, PhTShirt } from '@phosphor-icons/vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ReagentPicker from '../crafting/ReagentPicker.vue';
import InlineConfirm from './InlineConfirm.vue';
import ResultCard from './ResultCard.vue';
import type { ResultCardView, ResultLineView } from './resultCard';

const XSS = '<img src=x onerror=alert(1)>';
const source = readFileSync(resolve(process.cwd(), 'src/ledger/ResultCard.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function line(over: Partial<ResultLineView> = {}): ResultLineView {
  return {
    key: 'used:1:0',
    kind: 'used',
    icon: PhScroll,
    iconColor: 'var(--color-neutral-400)',
    name: 'Marsh Lily',
    qtyText: '−6',
    totalText: '',
    tag: '',
    ring: false,
    tone: 'used',
    ...over,
  };
}

function view(over: Partial<ResultCardView> = {}): ResultCardView {
  return {
    kind: 'craft',
    seq: 1n,
    kicker: 'Crafted',
    title: 'Herbal Draught',
    titleColor: 'var(--color-con-light-green)',
    sub: 'Added to your bag',
    qtyTag: 'x3',
    icon: PhHammer,
    iconColor: 'var(--color-con-light-green)',
    stats: [
      { key: 'int', label: 'Intelligence', abbr: 'INT', text: '+2' },
      { key: 'armorClass', label: 'Armor Class', abbr: 'Armor', text: '4' },
    ] as unknown as ResultCardView['stats'],
    effect: 'Restores 20 health',
    listTitle: 'Used',
    lines: [line(), line({ key: 'used:2:1', name: 'Glass Vial', qtyText: '−3' })],
    emptyText: '',
    footer: 'Items went to your backpack. Also written to your log.',
    announce: 'Crafted 3 Herbal Draught.',
    equipInstanceId: null,
    scrollInstanceId: null,
    recipeTemplateId: null,
    craftCount: 3n,
    ...over,
  };
}

const ACTIONS = [
  { id: 'again', label: 'Craft again', tone: 'secondary' as const },
  { id: 'equip', label: 'Equip', icon: PhTShirt, tone: 'primary' as const },
];

function mountCard(props: Record<string, unknown> = {}) {
  wrapper = mount(ResultCard, { attachTo: document.body, props: { view: view(), ...props } });
  return wrapper;
}

function key(el: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

describe('ResultCard mounting', () => {
  it('renders no dialog without a view, but keeps an empty polite live region', () => {
    const w = mountCard({ view: null });
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    const live = w.get('[role="status"]');
    expect(live.attributes('aria-live')).toBe('polite');
    expect(live.text()).toBe('');
    expect(live.classes()).toContain('sr-only');
  });
});

describe('ResultCard craft view', () => {
  it('is a labelled, described modal dialog with the card content as text', async () => {
    const w = mountCard({ actions: ACTIONS });
    await nextTick();
    const dialog = w.get('section[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    const title = w.get('h4');
    expect(dialog.attributes('aria-labelledby')).toBe(title.attributes('id'));
    expect(title.text()).toBe('Herbal Draught');
    const sub = dialog.attributes('aria-describedby');
    expect(w.get(`#${sub}`).text()).toBe('Added to your bag');
    expect(w.text()).toContain('Crafted');
    expect(w.text()).toContain('x3');
    expect(w.findAll('.chip').map((c) => c.text())).toEqual(['INT +2', 'Armor 4']);
    expect(w.findAll('.chip').every((c) => c.classes().includes('tag') && c.classes().includes('tag-neutral'))).toBe(
      true,
    );
    expect(w.text()).toContain('Restores 20 health');
    expect(w.get('h6').text()).toBe('Used');
    const rows = w.findAll('.result-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('Marsh Lily');
    expect(rows[0].get('.qty').text()).toBe('−6');
    expect(rows[0].get('.qty').classes()).toContain('tone-used');
    expect(w.text()).toContain('Items went to your backpack. Also written to your log.');
  });

  it('lists Done first and then the passed actions in order', () => {
    const w = mountCard({ actions: ACTIONS });
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Done', 'Craft again', 'Equip']);
    const buttons = w.findAll('button');
    expect(buttons[0].classes()).toContain('btn-ghost');
    expect(buttons[1].classes()).toContain('btn-secondary');
    expect(buttons[2].classes()).toContain('btn-primary');
  });

  it('omits the effect and chips when the view has none', () => {
    const w = mountCard({ view: view({ effect: null, stats: [], qtyTag: '' }) });
    expect(w.find('.chip').exists()).toBe(false);
    expect(w.find('.effect').exists()).toBe(false);
    expect(w.find('.qty-tag').exists()).toBe(false);
  });
});

describe('ResultCard mobile', () => {
  it('uses the sheet class, no chips, full-width buttons and 44px targets', () => {
    const w = mountCard({ mobile: true, actions: ACTIONS });
    expect(w.get('.result-scrim').classes()).toContain('mobile');
    expect(w.find('.chip').exists()).toBe(false);
    expect(w.findAll('button.card-btn').every((b) => b.classes().includes('full'))).toBe(true);
    expect(w.get('button').classes()).toContain('btn-secondary');
    expect(source).toMatch(/\.mobile \.card-btn\s*\{[^}]*min-height: 44px;/);
    expect(source).toMatch(/border-radius: 20px 20px 0 0;/);
  });
});

describe('ResultCard salvage and discover', () => {
  it('shows the bonus and recipe tags with the ring and the now-total as its own text', () => {
    const w = mountCard({
      view: view({
        kind: 'salvage',
        kicker: 'Salvaged',
        qtyTag: '',
        stats: [],
        effect: null,
        listTitle: 'Received',
        lines: [
          line({ key: 'g:1', kind: 'received', name: 'Copper Ore', qtyText: '+2', totalText: 'now 6', tone: 'gain' }),
          line({
            key: 'b:2',
            kind: 'bonus',
            name: 'Spirit Essence',
            qtyText: '+1',
            tag: 'Bonus',
            ring: true,
            tone: 'gain',
          }),
          line({
            key: 's:3',
            kind: 'scroll',
            name: 'Scroll: Fortified Robe',
            qtyText: '',
            tag: 'Recipe found',
            ring: true,
            tone: 'found',
          }),
        ],
      }),
    });
    const rows = w.findAll('.result-row');
    expect(rows[0].get('.total').text()).toBe('now 6');
    expect(rows[0].find('.tag-accent').exists()).toBe(false);
    expect(rows[0].classes()).not.toContain('ring');
    expect(rows[1].get('.tag-accent').text()).toBe('Bonus');
    expect(rows[1].classes()).toContain('ring');
    expect(rows[2].get('.tag-accent').text()).toBe('Recipe found');
    expect(rows[2].classes()).toContain('ring');
    expect(rows[0].get('.qty').classes()).toContain('tone-gain');
  });

  it('shows the empty text when there are no lines', () => {
    const w = mountCard({ view: view({ lines: [], emptyText: 'Nothing usable was left.' }) });
    expect(w.findAll('.result-row')).toHaveLength(0);
    expect(w.get('.empty').text()).toBe('Nothing usable was left.');
  });

  it('shows Nothing new with the tip row for Discover', () => {
    const w = mountCard({
      view: view({
        kind: 'discover',
        kicker: 'Discover recipes',
        title: 'Nothing new',
        icon: PhMagnifyingGlass,
        qtyTag: '',
        stats: [],
        effect: null,
        listTitle: 'Tip',
        lines: [line({ key: 'tip', kind: 'tip', name: 'Gather other materials to find new recipes.', qtyText: '', tone: 'tip' })],
      }),
    });
    expect(w.get('h4').text()).toBe('Nothing new');
    expect(w.get('h6').text()).toBe('Tip');
    expect(w.get('.result-row').text()).toContain('Gather other materials');
  });
});

describe('ResultCard focus and keys', () => {
  it('focuses Done on open', async () => {
    const w = mountCard({ view: null, actions: ACTIONS });
    await w.setProps({ view: view() });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.findAll('button')[0].element);
  });

  it('focuses Done when mounted with a view', async () => {
    const w = mountCard({ actions: ACTIONS });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.findAll('button')[0].element);
  });

  it('wraps Tab and Shift+Tab inside the card and keeps the events from the document', async () => {
    const w = mountCard({ actions: ACTIONS });
    await nextTick();
    const buttons = w.findAll('button');
    const seen: KeyboardEvent[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event);
    document.addEventListener('keydown', listener);
    const last = buttons[buttons.length - 1].element;
    last.focus();
    const forward = key(last, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0].element);
    expect(forward.defaultPrevented).toBe(true);
    const back = key(buttons[0].element, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(back.defaultPrevented).toBe(true);
    document.removeEventListener('keydown', listener);
    expect(seen).toHaveLength(0);
  });

  it('Escape emits close once and is prevented before the drawer would see it', async () => {
    const w = mountCard({ actions: ACTIONS });
    await nextTick();
    let seen: boolean | null = null;
    const later = (event: KeyboardEvent) => {
      seen = event.defaultPrevented;
    };
    document.addEventListener('keydown', later);
    const event = key(document.body, { key: 'Escape' });
    document.removeEventListener('keydown', later);
    expect(event.defaultPrevented).toBe(true);
    expect(seen).toBe(true);
    expect(w.emitted('close')).toHaveLength(1);
  });

  // IN-01 (iteration 3): a reagent picker (it stays open when Craft is clicked with the pointer) or an
  // inline confirm can sit under the scrim. Both listen on the document in the capture phase and were
  // registered first. One Esc must close only the card, the top layer.
  it('one Escape closes only the card, not a picker or a confirm left open under it', async () => {
    const under: VueWrapper[] = [];
    const confirm = mount(InlineConfirm, {
      attachTo: document.body,
      props: { prompt: 'Salvage destroys this item.', confirmLabel: 'Salvage' },
    });
    under.push(confirm);
    const picker = mount(ReagentPicker, { attachTo: document.body, props: { kind: 'essence', options: [] } });
    under.push(picker);
    await nextTick();
    const w = mountCard({ actions: ACTIONS });
    await nextTick();
    const event = key(document.body, { key: 'Escape' });
    expect(event.defaultPrevented).toBe(true);
    expect(w.emitted('close')).toHaveLength(1);
    expect(confirm.emitted('keep')).toBeUndefined();
    expect(picker.emitted('close')).toBeUndefined();
    // With the card closed, the next Esc reaches the layers under it again, and still closes one only.
    await w.setProps({ view: null });
    key(document.body, { key: 'Escape' });
    expect(w.emitted('close')).toHaveLength(1);
    expect(Number(confirm.emitted('keep')?.length ?? 0) + Number(picker.emitted('close')?.length ?? 0)).toBe(1);
    for (const layer of under) layer.unmount();
  });

  it('does not handle Escape while no card is shown, and stops after unmount', async () => {
    const w = mountCard({ view: null });
    const idle = key(document.body, { key: 'Escape' });
    expect(idle.defaultPrevented).toBe(false);
    expect(w.emitted('close')).toBeUndefined();
    await w.setProps({ view: view() });
    await w.setProps({ view: null });
    const after = key(document.body, { key: 'Escape' });
    expect(after.defaultPrevented).toBe(false);
    await w.setProps({ view: view({ seq: 2n }) });
    w.unmount();
    wrapper = null;
    const gone = key(document.body, { key: 'Escape' });
    expect(gone.defaultPrevented).toBe(false);
  });

  it('Done and a scrim press (pointerdown and click on the scrim) emit close; a click inside the card does not', async () => {
    const w = mountCard({ actions: ACTIONS });
    await w.get('.result-card').trigger('pointerdown');
    await w.get('.result-card').trigger('click');
    expect(w.emitted('close')).toBeUndefined();
    await w.get('.result-scrim').trigger('pointerdown');
    await w.get('.result-scrim').trigger('click');
    expect(w.emitted('close')).toHaveLength(1);
    await w.findAll('button')[0].trigger('click');
    expect(w.emitted('close')).toHaveLength(2);
  });

  // WR-05 (iteration 3): the second click of a double-click on Craft or Salvage lands on the scrim
  // once the card has appeared, but its pointerdown came before the scrim existed.
  it('a scrim click with no pointerdown on the scrim keeps the card open', async () => {
    const w = mountCard({ actions: ACTIONS });
    await w.get('.result-scrim').trigger('click');
    expect(w.emitted('close')).toBeUndefined();
    expect(w.find('[role="dialog"]').exists()).toBe(true);
  });

  it('a press that starts inside the card and ends on the scrim keeps it open', async () => {
    const w = mountCard({ actions: ACTIONS });
    await w.get('.result-card').trigger('pointerdown');
    await w.get('.result-scrim').trigger('click');
    expect(w.emitted('close')).toBeUndefined();
  });

  it('a scrim pointerdown from before the card closed does not carry over to the next card', async () => {
    const w = mountCard({ actions: ACTIONS });
    await w.get('.result-scrim').trigger('pointerdown');
    await w.setProps({ view: null });
    await w.setProps({ view: view({ seq: 2n }) });
    await w.get('.result-scrim').trigger('click');
    expect(w.emitted('close')).toBeUndefined();
  });
});

describe('ResultCard actions', () => {
  it('emits the action id on click', async () => {
    const w = mountCard({ actions: ACTIONS });
    await w.findAll('button')[2].trigger('click');
    expect(w.emitted('action')).toEqual([['equip']]);
  });

  it('a pending action is aria-disabled and emits nothing', async () => {
    const w = mountCard({ actions: [{ ...ACTIONS[0], pending: true }, ACTIONS[1]] });
    const again = w.findAll('button')[1];
    expect(again.attributes('aria-disabled')).toBe('true');
    await again.trigger('click');
    expect(w.emitted('action')).toBeUndefined();
  });

  it('an action with a reason is aria-disabled, described by one visible reason line, and emits nothing', async () => {
    const reason = "You're offline. Try again once you're reconnected.";
    const w = mountCard({ actions: [{ ...ACTIONS[0], reason }, { ...ACTIONS[1], reason }] });
    const buttons = w.findAll('button');
    expect(buttons[0].attributes('aria-disabled')).toBeUndefined();
    for (const button of [buttons[1], buttons[2]]) {
      expect(button.attributes('aria-disabled')).toBe('true');
      expect(w.get(`#${button.attributes('aria-describedby')}`).text()).toBe(reason);
      await button.trigger('click');
    }
    expect(w.findAll('.reason')).toHaveLength(1);
    expect(w.emitted('action')).toBeUndefined();
  });

  it('shows no reason line when every action is available', () => {
    const w = mountCard({ actions: ACTIONS });
    expect(w.find('.reason').exists()).toBe(false);
    expect(w.findAll('button').every((b) => b.attributes('aria-describedby') === undefined)).toBe(true);
  });

  it('uses the action aria label when given', () => {
    const w = mountCard({ actions: [{ ...ACTIONS[0], ariaLabel: 'Craft 3 more Herbal Draught' }] });
    expect(w.findAll('button')[1].attributes('aria-label')).toBe('Craft 3 more Herbal Draught');
  });
});

describe('ResultCard live region', () => {
  const settle = async () => {
    await nextTick();
    await nextTick();
  };

  // Every text the region shows, in order, while the given change settles.
  async function regionTexts(w: VueWrapper, change: () => Promise<unknown>): Promise<string[]> {
    const region = w.get('[role="status"]').element;
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });
    await change();
    await settle();
    await new Promise((r) => setTimeout(r, 0));
    observer.disconnect();
    return seen;
  }

  it('announces the one-line summary on open and replaces it for a new result', async () => {
    const w = mountCard({ view: null });
    expect(w.get('[role="status"]').text()).toBe('');
    await w.setProps({ view: view() });
    await settle();
    expect(w.get('[role="status"]').text()).toBe('Crafted 3 Herbal Draught.');
    await w.setProps({ view: view({ seq: 2n, announce: 'Crafted 1 Healing Salve.' }) });
    await settle();
    expect(w.get('[role="status"]').text()).toBe('Crafted 1 Healing Salve.');
  });

  it('keeps the last announcement after the card closes', async () => {
    const w = mountCard({ view: null });
    await w.setProps({ view: view() });
    await w.setProps({ view: null });
    await settle();
    expect(w.get('[role="status"]').text()).toBe('Crafted 3 Herbal Draught.');
  });

  // WR-02 (iteration 3): Craft again with the same count, or two empty salvages, repeat the text. The
  // region clears and then sets it again, so the repeat is a real change and is announced.
  it('announces a new result whose text repeats the previous one: clear, then set', async () => {
    const w = mountCard({ view: null });
    await w.setProps({ view: view() });
    await settle();
    expect(w.get('[role="status"]').text()).toBe('Crafted 3 Herbal Draught.');
    const seen = await regionTexts(w, () => w.setProps({ view: view({ seq: 2n }) }));
    expect(seen).toEqual(['', 'Crafted 3 Herbal Draught.']);
    const again = await regionTexts(w, () => w.setProps({ view: view({ seq: 3n }) }));
    expect(again).toEqual(['', 'Crafted 3 Herbal Draught.']);
  });

  it('does not announce again for the same seq (a re-render of the open card)', async () => {
    const w = mountCard({ view: null });
    await w.setProps({ view: view() });
    await settle();
    const seen = await regionTexts(w, () => w.setProps({ view: view({ title: 'Herbal Draught' }) }));
    expect(seen).toEqual([]);
    expect(w.get('[role="status"]').text()).toBe('Crafted 3 Herbal Draught.');
  });

  it('a newer result is never overwritten by an older pending announcement', async () => {
    const w = mountCard({ view: null });
    await w.setProps({ view: view() });
    await w.setProps({ view: view({ seq: 2n, announce: 'Crafted 1 Healing Salve.' }) });
    await settle();
    expect(w.get('[role="status"]').text()).toBe('Crafted 1 Healing Salve.');
  });
});

describe('ResultCard text nodes', () => {
  it('renders markup in server strings as text', async () => {
    const w = mountCard({
      view: view({
        title: XSS,
        sub: XSS,
        announce: XSS,
        effect: XSS,
        footer: XSS,
        lines: [line({ name: XSS, tag: XSS, totalText: XSS })],
      }),
      actions: [{ id: 'x', label: XSS, tone: 'primary' }],
    });
    await nextTick();
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('h4').text()).toBe(XSS);
    expect(w.get('[role="status"]').text()).toBe(XSS);
    expect(w.get('.result-row').text()).toContain(XSS);
  });

  it('has no raw-HTML directive, inline svg or 1200px query in the source', () => {
    expect(source).not.toMatch(/v-html|<svg|@media \(min-width: 1200px\)/);
    expect(source.match(/trapTabKey\(/g)).toHaveLength(1);
    expect(source).toContain('stopPropagation');
    expect(source.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(source.match(/role="dialog"/g)).toHaveLength(1);
  });
});
