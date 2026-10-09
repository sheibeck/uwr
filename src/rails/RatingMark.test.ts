// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import RatingMark from './RatingMark.vue';

// The one rating mark (51.3.1.1 UI-SPEC "Rating Marks"): an 8px dot (aria-hidden) and the rating word
// in the rating colour; the host sets the text size and carries the word in its accessible text.

const SOURCE = readFileSync(resolve(process.cwd(), 'src/rails/RatingMark.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('RatingMark', () => {
  it('renders an aria-hidden dot and the word in the rating class', () => {
    wrapper = mount(RatingMark, { props: { rating: { key: 'risky', word: 'Risky' } } });
    const root = wrapper.get('.rating-mark');
    expect(root.classes()).toContain('rate-risky');
    const dot = root.get('.dot');
    expect(dot.attributes('aria-hidden')).toBe('true');
    expect(dot.text()).toBe('');
    expect(root.get('.word').text()).toBe('Risky');
    expect(wrapper.text()).toBe('Risky');
  });

  it('unknown with no word renders the dot only, in the neutral class', () => {
    wrapper = mount(RatingMark, { props: { rating: { key: 'unknown', word: '' } } });
    const root = wrapper.get('.rating-mark');
    expect(root.classes()).toContain('rate-unknown');
    expect(root.find('.dot').exists()).toBe(true);
    expect(root.find('.word').exists()).toBe(false);
  });

  it('can drop the dot where a ring already carries the colour, and takes the host size', () => {
    wrapper = mount(RatingMark, { props: { rating: { key: 'deadly', word: 'Deadly' }, dot: false, size: 10 } });
    const root = wrapper.get('.rating-mark');
    expect(root.find('.dot').exists()).toBe(false);
    expect(root.classes()).toContain('size-10');
    expect(root.get('.word').text()).toBe('Deadly');
  });

  it('maps the five classes to the con and neutral tokens, with an 8px dot and no literal colour', () => {
    expect(SOURCE).toMatch(/\.rate-safe\s*\{\s*color: var\(--color-con-light-green\);/);
    expect(SOURCE).toMatch(/\.rate-quiet\s*\{\s*color: var\(--color-con-blue\);/);
    expect(SOURCE).toMatch(/\.rate-risky\s*\{\s*color: var\(--color-con-yellow\);/);
    expect(SOURCE).toMatch(/\.rate-deadly\s*\{\s*color: var\(--color-con-red\);/);
    expect(SOURCE).toMatch(/\.rate-unknown\s*\{\s*color: var\(--color-neutral-500\);/);
    expect(SOURCE).toMatch(/\.dot\s*\{[^}]*width: 8px;[^}]*height: 8px;/);
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,6}\b|oklch\(|rgb\(|v-html/);
  });

  it('a word with markup stays text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    wrapper = mount(RatingMark, { props: { rating: { key: 'quiet', word: payload } } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('.word').text()).toBe(payload);
  });
});
