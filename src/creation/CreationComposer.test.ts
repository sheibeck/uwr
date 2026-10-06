// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import CreationComposer from './CreationComposer.vue';
import { controlsFor } from './creationControls';
import type { CreationControls } from './creationControls';
import { INPUT_MAX_CHARS } from '../input/limits';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function controls(step: string | null, extra: Partial<Parameters<typeof controlsFor>[0]> = {}): CreationControls {
  return controlsFor({ step, known: true, regionFailed: false, startFailed: false, connected: true, ...extra });
}

function mountComposer(
  options: {
    controls?: CreationControls;
    inert?: boolean;
    desktop?: boolean;
    send?: (text: string) => Promise<boolean>;
    start?: () => void;
  } = {},
) {
  const send = vi.fn(options.send ?? (() => Promise.resolve(true)));
  const start = vi.fn(options.start ?? (() => {}));
  wrapper = mount(CreationComposer, {
    props: {
      controls: options.controls ?? controls('AWAITING_NAME'),
      inert: options.inert ?? false,
      desktop: options.desktop ?? true,
      send,
      start,
    },
  });
  return { wrapper, send, start };
}

const input = (w: VueWrapper) => w.find('input.input');
const names = (w: VueWrapper) => w.findAll('.decision-row button').map((b) => b.text());

describe('CreationComposer: input row', () => {
  it('sends the trimmed text on Enter, clears the draft on true and recalls it with ArrowUp', async () => {
    const { wrapper: w, send } = mountComposer();
    await input(w).setValue('  A tall elf ');
    await input(w).trigger('keydown', { key: 'Enter' });
    expect(send).toHaveBeenCalledWith('A tall elf');
    await flushPromises();
    expect((input(w).element as HTMLInputElement).value).toBe('');
    await input(w).trigger('keydown', { key: 'ArrowUp' });
    expect((input(w).element as HTMLInputElement).value).toBe('A tall elf');
    await input(w).trigger('keydown', { key: 'ArrowDown' });
    expect((input(w).element as HTMLInputElement).value).toBe('');
  });

  it('keeps the draft when send resolves false', async () => {
    const { wrapper: w, send } = mountComposer({ send: () => Promise.resolve(false) });
    await input(w).setValue('Elf');
    await input(w).trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(1);
    expect((input(w).element as HTMLInputElement).value).toBe('Elf');
  });

  it('does not send on Enter during IME composition, nor for whitespace-only drafts', async () => {
    const { wrapper: w, send } = mountComposer();
    await input(w).setValue('Elf');
    await input(w).trigger('keydown', { key: 'Enter', isComposing: true });
    expect(send).not.toHaveBeenCalled();
    await input(w).setValue('    ');
    await input(w).trigger('keydown', { key: 'Enter' });
    await w.find('button.send').trigger('click');
    expect(send).not.toHaveBeenCalled();
  });

  it('sends through the Send button too', async () => {
    const { wrapper: w, send } = mountComposer();
    await input(w).setValue('Mirel');
    await w.find('button.send').trigger('click');
    expect(send).toHaveBeenCalledWith('Mirel');
  });

  it('labels the input "Your answer", caps its length and uses the controls placeholder', () => {
    const c = controls('AWAITING_RACE');
    const desktop = mountComposer({ controls: c, desktop: true });
    expect(input(desktop.wrapper).attributes('aria-label')).toBe('Your answer');
    expect(input(desktop.wrapper).attributes('maxlength')).toBe(String(INPUT_MAX_CHARS));
    expect(input(desktop.wrapper).attributes('placeholder')).toBe(c.placeholder);
    desktop.wrapper.unmount();
    wrapper = null;
    const mobile = mountComposer({ controls: c, desktop: false });
    expect(input(mobile.wrapper).attributes('placeholder')).toBe(c.mobilePlaceholder);
    expect(c.mobilePlaceholder).not.toBe(c.placeholder);
  });

  it('disables the input and Send when locked, shows the locked text and keeps the draft', async () => {
    const { wrapper: w, send } = mountComposer({ controls: controls('AWAITING_NAME') });
    await input(w).setValue('Mirel');
    await w.setProps({ controls: controls('GENERATING_RACE') });
    const el = input(w);
    expect(el.attributes('disabled')).toBeDefined();
    expect(el.attributes('aria-disabled')).toBe('true');
    expect(el.attributes('placeholder')).toBe('The Keeper is working…');
    expect((el.element as HTMLInputElement).value).toBe('Mirel');
    expect(w.find('button.send').attributes('disabled')).toBeDefined();
    await w.find('button.send').trigger('click');
    expect(send).not.toHaveBeenCalled();
  });

  it('shows a Send text button on desktop and a 44px icon button labelled Send on mobile', () => {
    const desktop = mountComposer({ desktop: true });
    const text = desktop.wrapper.find('button.send');
    expect(text.text()).toBe('Send');
    expect(text.classes()).not.toContain('btn-icon');
    desktop.wrapper.unmount();
    wrapper = null;
    const mobile = mountComposer({ desktop: false });
    const icon = mobile.wrapper.find('button.send');
    expect(icon.attributes('aria-label')).toBe('Send');
    expect(icon.classes()).toContain('btn-icon');
    expect(icon.text()).toBe('');
  });

  it('emits focusChange true on focus and false on blur', async () => {
    const { wrapper: w } = mountComposer();
    await input(w).trigger('focus');
    await input(w).trigger('blur');
    expect(w.emitted('focusChange')).toEqual([[true], [false]]);
  });

  it('renders the name hint under the input row only when the controls carry it', () => {
    const withHint = mountComposer({ controls: controls('AWAITING_NAME') });
    expect(withHint.wrapper.text()).toContain('3 to 20 letters. One word.');
    withHint.wrapper.unmount();
    wrapper = null;
    const without = mountComposer({ controls: controls('AWAITING_RACE') });
    expect(without.wrapper.text()).not.toContain('3 to 20 letters');
  });
});

describe('CreationComposer: quick row', () => {
  it('shows a Surprise me chip with a sparkle icon that sends the fixed text', async () => {
    const { wrapper: w, send } = mountComposer({ controls: controls('AWAITING_RACE') });
    const chip = w.find('.quick-row button');
    expect(chip.text()).toBe('Surprise me');
    expect(chip.classes()).toEqual(expect.arrayContaining(['tag', 'tag-outline']));
    expect(chip.find('.quick-icon').exists()).toBe(true);
    await chip.trigger('click');
    expect(send).toHaveBeenCalledWith('Surprise me.');
  });

  it('renders no quick row element when there is no quick action', () => {
    const { wrapper: w } = mountComposer({ controls: controls('AWAITING_NAME') });
    expect(w.find('.quick-row').exists()).toBe(false);
  });
});

describe('CreationComposer: decision row', () => {
  it('shows each decision button and sends a send action through send', async () => {
    const { wrapper: w, send } = mountComposer({ controls: controls('AWAITING_ARCHETYPE') });
    expect(names(w)).toEqual(['Go back a step']);
    await w.find('.decision-row button').trigger('click');
    expect(send).toHaveBeenCalledWith('go back');
  });

  it('calls the start prop for a start action', async () => {
    const { wrapper: w, send, start } = mountComposer({ controls: controls(null, { startFailed: true }) });
    expect(names(w)).toEqual(['Retry']);
    await w.find('.decision-row button').trigger('click');
    expect(start).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('uses the variant classes and the retry and back icons', () => {
    const { wrapper: w } = mountComposer({ controls: controls('CLASS_FILL_ERROR') });
    const buttons = w.findAll('.decision-row button');
    expect(buttons[0].classes()).toContain('btn-primary');
    expect(buttons[0].find('.icon-retry').exists()).toBe(true);
    expect(buttons[1].classes()).toContain('btn-ghost');
    expect(buttons[1].find('.icon-back').exists()).toBe(true);
  });

  it('Start over swaps the row for a confirmation; Yes sends "start over"', async () => {
    const { wrapper: w, send } = mountComposer({ controls: controls('CONFIRMING') });
    expect(names(w)).toEqual(['Enter the realm', 'Start over']);
    await w.findAll('.decision-row button')[1].trigger('click');
    expect(send).not.toHaveBeenCalled();
    expect(w.text()).toContain('Start over? Your race, class and ability are discarded.');
    expect(names(w)).toEqual(['Yes, start over', 'Keep my choices']);
    const yes = w.findAll('.decision-row button')[0];
    expect(yes.classes()).toEqual(expect.arrayContaining(['btn-secondary', 'danger']));
    await yes.trigger('click');
    expect(send).toHaveBeenCalledWith('start over');
    expect(names(w)).toEqual(['Enter the realm', 'Start over']);
  });

  it('Keep my choices restores the row and sends nothing', async () => {
    const { wrapper: w, send } = mountComposer({ controls: controls('CONFIRMING') });
    await w.findAll('.decision-row button')[1].trigger('click');
    const keep = w.findAll('.decision-row button')[1];
    expect(keep.classes()).toContain('btn-primary');
    await keep.trigger('click');
    expect(send).not.toHaveBeenCalled();
    expect(names(w)).toEqual(['Enter the realm', 'Start over']);
    expect(w.text()).not.toContain('Start over? Your race');
  });

  it('closes the confirmation when the step changes', async () => {
    const { wrapper: w } = mountComposer({ controls: controls('CONFIRMING') });
    await w.findAll('.decision-row button')[1].trigger('click');
    expect(w.text()).toContain('Start over? Your race');
    await w.setProps({ controls: controls('AWAITING_NAME') });
    expect(w.text()).not.toContain('Start over? Your race');
  });

  it('disables quick and decision buttons when inert or disabled', async () => {
    const inert = mountComposer({ controls: controls('AWAITING_RACE'), inert: true });
    expect(inert.wrapper.find('.quick-row button').attributes('disabled')).toBeDefined();
    inert.wrapper.unmount();
    wrapper = null;
    const decisions = mountComposer({ controls: controls('CONFIRMING'), inert: true });
    for (const button of decisions.wrapper.findAll('.decision-row button')) {
      expect(button.attributes('disabled')).toBeDefined();
    }
    decisions.wrapper.unmount();
    wrapper = null;
    const offline = mountComposer({ controls: controls('CONFIRMING', { connected: false }) });
    for (const button of offline.wrapper.findAll('.decision-row button')) {
      expect(button.attributes('disabled')).toBeDefined();
    }
    await offline.wrapper.find('.decision-row button').trigger('click');
    expect(offline.send).not.toHaveBeenCalled();
  });

  it('renders no row when there is nothing to show', () => {
    const { wrapper: w } = mountComposer({ controls: controls('AWAITING_NAME') });
    expect(w.find('.decision-row').exists()).toBe(false);
    expect(w.find('.quick-row').exists()).toBe(false);
  });
});

describe('CreationComposer: text only', () => {
  it('renders markup-shaped control text as text, never an element', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const c = controls('AWAITING_RACE');
    const custom: CreationControls = {
      ...c,
      quick: { label: evil, sends: 'x' },
      nameHint: evil,
      decisions: [{ id: 'd', label: evil, variant: 'ghost', icon: null, action: { type: 'dismiss' }, danger: false }],
    };
    const { wrapper: w } = mountComposer({ controls: custom });
    expect(w.text()).toContain(evil);
    expect(w.element.querySelector('img')).toBeNull();
  });
});
