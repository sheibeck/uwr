// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import StepBar from './StepBar.vue';
import { deriveCreationStep } from './creationSteps';
import type { CreationStepView } from './creationSteps';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function viewFor(step: string | null, regionFailed = false): CreationStepView {
  return deriveCreationStep({ step, previousStep: null, regionFailed, lastKnown: null });
}

function mountBar(view: CreationStepView, desktop = true, keyboardOpen = false) {
  wrapper = mount(StepBar, { props: { view, desktop, keyboardOpen } });
  return wrapper;
}

describe('StepBar: structure', () => {
  it('renders an ol labelled "Character creation steps" with the five steps in order', () => {
    const w = mountBar(viewFor('AWAITING_RACE'));
    const list = w.find('ol');
    expect(list.attributes('aria-label')).toBe('Character creation steps');
    const items = w.findAll('li');
    expect(items).toHaveLength(5);
    expect(items.map((li) => li.find('.label').text())).toEqual([
      'Race',
      'Archetype',
      'Class',
      'Name',
      'Enter the realm',
    ]);
  });

  it('marks exactly one li as aria-current step', () => {
    for (const step of ['AWAITING_RACE', 'AWAITING_ARCHETYPE', 'CLASS_REVEALED', 'AWAITING_NAME', 'CONFIRMING']) {
      const w = mountBar(viewFor(step));
      const current = w.findAll('li').filter((li) => li.attributes('aria-current') === 'step');
      expect(current).toHaveLength(1);
      w.unmount();
      wrapper = null;
    }
    const w = mountBar(viewFor('AWAITING_ARCHETYPE'));
    expect(w.findAll('li')[1].attributes('aria-current')).toBe('step');
  });

  it('at position 2 shows done, current and to-do icons with their aria labels', () => {
    const w = mountBar(viewFor('AWAITING_ARCHETYPE'));
    const items = w.findAll('li');
    expect(items[0].find('.icon-done').exists()).toBe(true);
    expect(items[1].find('.icon-current').exists()).toBe(true);
    for (const li of items.slice(2)) expect(li.find('.icon-todo').exists()).toBe(true);
    expect(items.map((li) => li.attributes('aria-label'))).toEqual([
      'Race, done',
      'Archetype, current',
      'Class, to do',
      'Name, to do',
      'Enter the realm, to do',
    ]);
  });

  it('shows the warning-circle icon on the current item for an error view', () => {
    const w = mountBar(viewFor('CLASS_FILL_ERROR'));
    const current = w.findAll('li')[2];
    expect(current.find('.icon-error').exists()).toBe(true);
    expect(current.find('.icon-current').exists()).toBe(false);
  });

  it('adds a spinning class to the current icon while the view is working only', () => {
    const working = mountBar(viewFor('GENERATING_RACE'));
    expect(working.findAll('li')[0].find('.icon-current').classes()).toContain('spinning');
    working.unmount();
    wrapper = null;
    const idle = mountBar(viewFor('AWAITING_RACE'));
    expect(idle.findAll('li')[0].find('.icon-current').classes()).not.toContain('spinning');
  });

  it('stops the spinner under prefers-reduced-motion (source pin)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/creation/StepBar.vue'), 'utf8');
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.spinning[^}]*animation:\s*none/);
  });
});

describe('StepBar: mobile', () => {
  it('shows the text row and a Sheet chip that emits openSheet', async () => {
    const w = mountBar(viewFor('AWAITING_ARCHETYPE'), false);
    expect(w.find('.step-text').text()).toBe('Step 2 of 5 · Archetype');
    const chip = w.find('button.sheet-chip');
    expect(chip.attributes('aria-label')).toBe('Open character sheet');
    expect(chip.text()).toBe('Sheet');
    expect(chip.classes()).toEqual(expect.arrayContaining(['tag', 'tag-neutral']));
    await chip.trigger('click');
    expect(w.emitted('openSheet')).toHaveLength(1);
  });

  it('keeps the five segments with aria labels and hides the visible labels', () => {
    const w = mountBar(viewFor('AWAITING_ARCHETYPE'), false);
    expect(w.findAll('li')).toHaveLength(5);
    expect(w.findAll('li .label')).toHaveLength(0);
    expect(w.findAll('li')[1].attributes('aria-label')).toBe('Archetype, current');
  });

  it('hides the text row and the chip while the keyboard is open', () => {
    const w = mountBar(viewFor('AWAITING_ARCHETYPE'), false, true);
    expect(w.find('.step-text').exists()).toBe(false);
    expect(w.find('button.sheet-chip').exists()).toBe(false);
    expect(w.findAll('li')).toHaveLength(5);
  });

  it('desktop has neither the text row nor the chip', () => {
    const w = mountBar(viewFor('AWAITING_ARCHETYPE'), true);
    expect(w.find('.step-text').exists()).toBe(false);
    expect(w.find('button.sheet-chip').exists()).toBe(false);
  });

  it('focusChip focuses the chip', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    wrapper = mount(StepBar, {
      attachTo: host,
      props: { view: viewFor('AWAITING_RACE'), desktop: false, keyboardOpen: false },
    });
    (wrapper.vm as unknown as { focusChip(): void }).focusChip();
    expect(document.activeElement).toBe(wrapper.find('button.sheet-chip').element);
    wrapper.unmount();
    wrapper = null;
    host.remove();
  });
});

describe('StepBar: announcements', () => {
  it('has an empty status line on first mount and announces the step after it moves', async () => {
    const w = mountBar(viewFor('AWAITING_ARCHETYPE'));
    const status = w.find('[role="status"]');
    expect(status.text()).toBe('');
    await w.setProps({ view: viewFor('CLASS_REVEALED') });
    expect(w.find('[role="status"]').text()).toBe('Step 3 of 5: Class');
  });

  it('does not announce when the position stays the same', async () => {
    const w = mountBar(viewFor('GENERATING_CLASS'));
    await w.setProps({ view: viewFor('CLASS_FILLING') });
    expect(w.find('[role="status"]').text()).toBe('');
  });
});

describe('StepBar: text only', () => {
  it('renders no element from a server-shaped label', () => {
    const view = { ...viewFor('AWAITING_RACE'), label: '<img src=x onerror=alert(1)>' };
    const w = mountBar(view, false);
    expect(w.find('.step-text').text()).toContain('<img src=x onerror=alert(1)>');
    expect(w.element.querySelector('img')).toBeNull();
  });
});
