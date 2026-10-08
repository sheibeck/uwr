// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { focusLost, keepFocus } from './keepFocus';

// The shared focus-after-removal rule (51.1 reviews): a re-render that removes the focused control
// moves focus to the next equivalent control or the heading, never to body, and never takes focus
// back from where the player moved it.

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = '';
});

function host(initial: string[]) {
  const rows = ref(initial);
  const list = ref<HTMLElement | null>(null);
  const heading = ref<HTMLElement | null>(null);
  const restore = vi.fn((index: number) => {
    const buttons = list.value?.querySelectorAll<HTMLElement>('button') ?? [];
    return buttons[index] ?? heading.value;
  });
  const Host = defineComponent({
    setup() {
      keepFocus({
        source: () => rows.value.join(','),
        area: () => list.value,
        capture: (active, area) => Array.from(area.querySelectorAll('button')).indexOf(active as HTMLButtonElement),
        restore,
      });
      return () =>
        h('section', [
          h('h6', { ref: heading, tabindex: '-1' }, 'Party'),
          h('button', { class: 'outside' }, 'Outside'),
          rows.value.length > 0
            ? h(
                'ul',
                { ref: list },
                rows.value.map((name) => h('li', { key: name }, [h('button', { class: `row-${name}` }, name)])),
              )
            : null,
        ]);
    },
  });
  const w = mount(Host, { attachTo: document.body });
  mounted.push(w);
  const button = (name: string) => w.get(`button.row-${name}`).element as HTMLElement;
  return { w, rows, heading, restore, button };
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe('keepFocus', () => {
  it('focuses the control now at the removed row index', async () => {
    const h1 = host(['a', 'b', 'c']);
    h1.button('b').focus();
    h1.rows.value = ['a', 'c'];
    await settle();
    expect(h1.restore).toHaveBeenCalledWith(1);
    expect(document.activeElement).toBe(h1.button('c'));
  });

  it('falls back to the heading when the last row goes and the list unmounts', async () => {
    const h1 = host(['a']);
    h1.button('a').focus();
    h1.rows.value = [];
    await settle();
    expect(document.activeElement).toBe(h1.heading.value);
  });

  it('does nothing when the focused control survives the update', async () => {
    const h1 = host(['a', 'b']);
    h1.button('b').focus();
    h1.rows.value = ['b'];
    await settle();
    expect(h1.restore).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(h1.button('b'));
  });

  it('ignores focus outside the area', async () => {
    const h1 = host(['a', 'b']);
    (h1.w.get('button.outside').element as HTMLElement).focus();
    h1.rows.value = ['b'];
    await settle();
    expect(h1.restore).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(h1.w.get('button.outside').element);
  });

  it('ignores a change when nothing had focus', async () => {
    const h1 = host(['a', 'b']);
    h1.rows.value = ['b'];
    await settle();
    expect(h1.restore).not.toHaveBeenCalled();
  });

  it('focusLost reads body and detached elements as lost', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    el.focus();
    expect(focusLost()).toBe(false);
    el.blur();
    expect(focusLost()).toBe(true);
  });
});
