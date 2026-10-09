// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CharacterName from './CharacterName.vue';

describe('CharacterName dead marker (owner, 2026-10-09)', () => {
  it('a living name has no skull', () => {
    const w = mount(CharacterName, { props: { name: 'Elfansworth' } });
    expect(w.find('.dead').exists()).toBe(false);
    expect(w.text()).toBe('Elfansworth');
  });

  it('a dead name shows a small skull titled Dead, read as (dead)', () => {
    const w = mount(CharacterName, { props: { name: 'Elfansworth', dead: true } });
    const mark = w.get('.dead');
    expect(mark.attributes('title')).toBe('Dead');
    expect(mark.find('svg').exists()).toBe(true);
    expect(mark.find('svg').attributes('aria-hidden')).toBe('true');
    expect(mark.get('.sr-only').text()).toBe('(dead)');
  });
});
