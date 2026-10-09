// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import RoleChip from './RoleChip.vue';
import { roleView } from './roles';

// The role chip (51.3.1.1 UI-SPEC "Enemy card"): a span with the role icon (12, aria-hidden) and the
// uppercase word, coloured from existing tokens only.

const SOURCE = readFileSync(resolve(process.cwd(), 'src/combat/RoleChip.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('RoleChip', () => {
  it('renders a span with the role class, an aria-hidden 12px icon and the word', () => {
    wrapper = mount(RoleChip, { props: { role: roleView('healer') } });
    const root = wrapper.get('span.role-chip');
    expect(root.element.tagName).toBe('SPAN');
    expect(root.classes()).toContain('role-support');
    const icon = root.get('svg');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.attributes('width')).toBe('12');
    expect(root.get('.role-word').text()).toBe('Support');
    expect(wrapper.text()).toBe('Support');
  });

  it('shows Boss and Named in their own classes', () => {
    wrapper = mount(RoleChip, { props: { role: roleView('tank', { boss: true }) } });
    expect(wrapper.get('.role-chip').classes()).toContain('role-boss');
    expect(wrapper.text()).toBe('Boss');
    wrapper.unmount();
    wrapper = mount(RoleChip, { props: { role: roleView('tank', { named: true }) } });
    expect(wrapper.get('.role-chip').classes()).toContain('role-named');
    expect(wrapper.text()).toBe('Named');
  });

  it('holds no button or interactive element', () => {
    wrapper = mount(RoleChip, { props: { role: roleView('caster') } });
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('uses Micro 10 / 500 uppercase with 0.1em tracking, padding 0 4px, radius-sm and line-height 16', () => {
    expect(SOURCE).toMatch(/font-size:\s*10px/);
    expect(SOURCE).toMatch(/font-weight:\s*500/);
    expect(SOURCE).toMatch(/text-transform:\s*uppercase/);
    expect(SOURCE).toMatch(/letter-spacing:\s*0\.1em/);
    expect(SOURCE).toMatch(/padding:\s*0 4px/);
    expect(SOURCE).toContain('var(--radius-sm)');
    expect(SOURCE).toMatch(/line-height:\s*16px/);
    expect(SOURCE).toMatch(/gap:\s*4px/);
  });

  it('colours each role from the existing tokens of the UI-SPEC Color table', () => {
    const rule = (cls: string) => SOURCE.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`))?.[0] ?? '';
    expect(rule('role-tank')).toContain('var(--color-neutral-200)');
    expect(rule('role-damage')).toContain('var(--color-con-orange)');
    expect(rule('role-caster')).toContain('var(--color-line-npc)');
    expect(rule('role-support')).toContain('var(--color-con-light-green)');
    expect(rule('role-named')).toContain('var(--color-line-quest)');
    expect(rule('role-boss')).toContain('var(--color-con-red)');
  });

  it('has no literal colour, no v-html and no inline svg', () => {
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/\b(rgba?|hsla?|oklch)\(/);
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toContain('<svg');
  });
});
