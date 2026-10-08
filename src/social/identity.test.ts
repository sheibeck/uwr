// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhFlagBanner, PhFootprints, PhPersonSimple } from '@phosphor-icons/vue';
import StatusDot from './StatusDot.vue';
import CharacterName from './CharacterName.vue';
import FollowIcon from './FollowIcon.vue';
import { FOLLOW_TEXT } from './follow';
import type { FollowState } from './follow';

// The three small identity pieces (51.1-UI-SPEC "Shared Components", "Travel with Leader" states).

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function source(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/social', name), 'utf8');
}

describe('StatusDot', () => {
  const STATUSES = ['online', 'offline', 'busy'] as const;

  it('renders one aria-hidden span per status with its own class', () => {
    const classes = new Set<string>();
    for (const status of STATUSES) {
      const w = mount(StatusDot, { props: { status } });
      expect(w.element.tagName).toBe('SPAN');
      expect(w.attributes('aria-hidden')).toBe('true');
      expect(w.classes()).toContain(status);
      classes.add(w.classes().join(' '));
      w.unmount();
    }
    expect(classes.size).toBe(3);
  });

  it('carries no text: the host owns the status word', () => {
    wrapper = mount(StatusDot, { props: { status: 'online' } });
    expect(wrapper.text()).toBe('');
  });

  it('is an 8 x 8 circle and draws the three states with three distinct tokens', () => {
    const text = source('StatusDot.vue');
    expect(text).toMatch(/width:\s*8px/);
    expect(text).toMatch(/height:\s*8px/);
    expect(text).toMatch(/border-radius:\s*50%/);
    expect(text).toMatch(/\.online\s*\{[^}]*var\(--color-con-light-green\)/);
    expect(text).toMatch(/\.busy\s*\{[^}]*var\(--color-con-yellow\)/);
    expect(text).toMatch(/\.offline\s*\{[^}]*inset 0 0 0 1px var\(--color-neutral-600\)/);
    expect(text).toMatch(/\.offline\s*\{[^}]*background:\s*transparent/);
  });
});

describe('CharacterName', () => {
  it('renders the name as text with the full name in title', () => {
    wrapper = mount(CharacterName, { props: { name: 'Ann' } });
    expect(wrapper.text()).toBe('Ann');
    expect(wrapper.attributes('title')).toBe('Ann');
  });

  it('renders markup in a name as literal text, never as elements', () => {
    const name = '<img src=x onerror=alert(1)>';
    wrapper = mount(CharacterName, { props: { name } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toBe(name);
    expect(wrapper.attributes('title')).toBe(name);
  });

  it('adds " (you)" only with the you prop', () => {
    wrapper = mount(CharacterName, { props: { name: 'Ann' } });
    expect(wrapper.text()).toBe('Ann');
    wrapper.unmount();
    wrapper = mount(CharacterName, { props: { name: 'Ann', you: true } });
    expect(wrapper.text()).toBe('Ann (you)');
    expect(wrapper.attributes('title')).toBe('Ann');
  });

  it('renders the default slot after the name (empty in 51.1)', () => {
    wrapper = mount(CharacterName, {
      props: { name: 'Ann', you: true },
      slots: { default: '<span class="guild">[Owls]</span>' },
    });
    const html = wrapper.html();
    expect(wrapper.find('.guild').text()).toBe('[Owls]');
    expect(html.indexOf('(you)')).toBeLessThan(html.indexOf('guild'));
    expect(html.indexOf('Ann')).toBeLessThan(html.indexOf('guild'));
  });

  it('ellipsizes on one line (source)', () => {
    const text = source('CharacterName.vue');
    expect(text).toMatch(/text-overflow:\s*ellipsis/);
    expect(text).toMatch(/white-space:\s*nowrap/);
    expect(text).toMatch(/min-width:\s*0/);
    expect(text).toContain('var(--color-neutral-500)');
    expect(text).toContain('<slot');
  });
});

describe('FollowIcon', () => {
  const CASES: Array<[FollowState, typeof PhFootprints, string]> = [
    ['leader', PhFlagBanner, 'leader'],
    ['comes_along', PhFootprints, 'comes'],
    ['following_elsewhere', PhFootprints, 'elsewhere'],
    ['not_following', PhPersonSimple, 'none'],
  ];

  for (const [state, icon, cls] of CASES) {
    it(`${state} draws its icon at 12px with the FOLLOW_TEXT title and a screen-reader twin`, () => {
      wrapper = mount(FollowIcon, { props: { state } });
      expect(wrapper.attributes('title')).toBe(FOLLOW_TEXT[state]);
      expect(wrapper.classes()).toContain(cls);
      expect(wrapper.attributes('aria-hidden')).toBeUndefined();
      const glyph = wrapper.findComponent(icon);
      expect(glyph.exists()).toBe(true);
      expect(glyph.props('size')).toBe(12);
      expect(wrapper.find('.sr-only').text()).toBe(FOLLOW_TEXT[state]);
    });
  }

  it('the two footprint states differ by class (accent-300 vs neutral-500)', () => {
    const a = mount(FollowIcon, { props: { state: 'comes_along' } });
    const b = mount(FollowIcon, { props: { state: 'following_elsewhere' } });
    expect(a.classes().join(' ')).not.toBe(b.classes().join(' '));
    a.unmount();
    b.unmount();
    const text = source('FollowIcon.vue');
    expect(text).toMatch(/\.leader\s*\{[^}]*var\(--color-accent\)/);
    expect(text).toMatch(/\.comes\s*\{[^}]*var\(--color-accent-300\)/);
    expect(text).toMatch(/\.elsewhere\s*\{[^}]*var\(--color-neutral-500\)/);
    expect(text).toMatch(/\.none\s*\{[^}]*var\(--color-neutral-500\)/);
  });

  it('decorative hides from assistive tech, keeps the title and drops the twin', () => {
    wrapper = mount(FollowIcon, { props: { state: 'comes_along', decorative: true } });
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(wrapper.attributes('title')).toBe(FOLLOW_TEXT.comes_along);
    expect(wrapper.find('.sr-only').exists()).toBe(false);
  });

  it('takes its text from FOLLOW_TEXT, never a copy', () => {
    expect(source('FollowIcon.vue')).toContain('FOLLOW_TEXT');
  });
});
