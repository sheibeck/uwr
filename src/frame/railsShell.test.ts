// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import ContextRail from './ContextRail.vue';
import FeedShell from './FeedShell.vue';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function read(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/frame', file), 'utf8');
}

describe('ContextRail', () => {
  it('renders Here, Nearby and Tracking headings in order', () => {
    wrapper = mount(ContextRail);
    expect(wrapper.findAll('h6').map((h) => h.text())).toEqual(['Here', 'Nearby', 'Tracking']);
  });

  it('renders each documented empty line under its heading', () => {
    wrapper = mount(ContextRail);
    const sections = wrapper.findAll('section');
    expect(sections).toHaveLength(3);
    expect(sections[0].get('p').text()).toBe('Your location appears here.');
    expect(sections[1].get('p').text()).toBe('No one is nearby.');
    expect(sections[2].get('p').text()).toBe('No quests tracked.');
  });

  it('is a labelled aside', () => {
    wrapper = mount(ContextRail);
    const root = wrapper.get('aside');
    expect(root.attributes('aria-label')).toBe('Context');
  });

  it('is 288px wide', () => {
    expect(read('ContextRail.vue')).toContain('width: 288px');
  });
});

describe('FeedShell', () => {
  it('renders the empty story line', () => {
    wrapper = mount(FeedShell);
    expect(wrapper.text()).toBe('Your story will appear here.');
  });

  it('adds the compact class only when compact', () => {
    wrapper = mount(FeedShell);
    expect(wrapper.classes()).not.toContain('compact');
    wrapper.unmount();
    wrapper = mount(FeedShell, { props: { compact: true } });
    expect(wrapper.classes()).toContain('compact');
  });

  it('bottom-anchors with a 760px line width and a mobile padding variant', () => {
    const source = read('FeedShell.vue');
    expect(source).toContain('max-width: 760px');
    expect(source).toContain('justify-content: flex-end');
    expect(source).toContain('padding: 16px 32px');
    expect(source).toContain('padding: 4px 16px 8px');
  });
});
