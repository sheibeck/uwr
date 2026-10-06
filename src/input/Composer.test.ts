// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref, shallowRef } from 'vue';
import type { Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import Composer from './Composer.vue';
import { INPUT_MAX_CHARS } from './limits';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { ConsoleApi, ConversationTarget, FrameControls, GameData } from '../game/context';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

interface Setup {
  wrapper: VueWrapper;
  console: ConsoleApi;
  submit: ReturnType<typeof vi.fn>;
  recallPrevious: ReturnType<typeof vi.fn>;
  recallNext: ReturnType<typeof vi.fn>;
  endConversation: ReturnType<typeof vi.fn>;
  draft: Ref<string>;
  conversation: Ref<ConversationTarget | null>;
  focusTick: Ref<number>;
  inputFocused: Ref<boolean>;
  connected: Ref<boolean>;
  isDesktop: Ref<boolean>;
  activeScreen: Ref<any>;
}

function setup(opts: { desktop?: boolean; connected?: boolean } = {}): Setup {
  const draft = ref('');
  const conversation = shallowRef<ConversationTarget | null>(null);
  const focusTick = ref(0);
  const inputFocused = ref(false);
  const connected = ref(opts.connected ?? true);
  const isDesktop = ref(opts.desktop ?? true);
  const activeScreen = ref<any>(null);
  const submit = vi.fn(() => 'sent' as const);
  const recallPrevious = vi.fn();
  const recallNext = vi.fn();
  const endConversation = vi.fn();
  const consoleApi = {
    ...createInertConsole(),
    draft,
    conversation,
    focusTick,
    inputFocused,
    submit,
    recallPrevious,
    recallNext,
    endConversation,
  } as unknown as ConsoleApi;
  const game = { ...createInertGame(), connected } as unknown as GameData;
  const frame = { ...createInertFrame(), isDesktop, activeScreen } as unknown as FrameControls;
  const el = document.createElement('div');
  document.body.appendChild(el);
  const w = mount(Composer, {
    attachTo: el,
    global: { provide: { [CONSOLE_KEY as symbol]: consoleApi, [GAME_KEY as symbol]: game, [FRAME_KEY as symbol]: frame } },
  });
  wrapper = w;
  return {
    wrapper: w,
    console: consoleApi,
    submit,
    recallPrevious,
    recallNext,
    endConversation,
    draft,
    conversation,
    focusTick,
    inputFocused,
    connected,
    isDesktop,
    activeScreen,
  };
}

function input(w: VueWrapper): HTMLInputElement {
  return w.find('input.input').element as HTMLInputElement;
}

describe('Composer input', () => {
  it('renders the input with the contract attributes', () => {
    const s = setup();
    const el = s.wrapper.find('input.input');
    expect(el.attributes('aria-label')).toBe('Your action');
    expect(el.attributes('placeholder')).toBe('What do you do?');
    expect(el.attributes('autocomplete')).toBe('off');
    expect(el.attributes('autocapitalize')).toBe('sentences');
    expect(el.attributes('enterkeyhint')).toBe('send');
    expect(el.attributes('maxlength')).toBe('1000');
    expect(s.wrapper.find('svg').exists()).toBe(true);
  });

  it('typing updates the console draft and Enter submits and keeps focus', async () => {
    const s = setup();
    const el = s.wrapper.find('input.input');
    await el.setValue('look around');
    expect(s.draft.value).toBe('look around');
    await el.trigger('keydown', { key: 'Enter' });
    expect(s.submit).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(el.element);
  });

  it('Enter during an IME composition does nothing', async () => {
    const s = setup();
    await s.wrapper.find('input.input').trigger('keydown', { key: 'Enter', isComposing: true });
    expect(s.submit).not.toHaveBeenCalled();
  });

  it('ArrowUp and ArrowDown recall history; Escape blurs and keeps the draft', async () => {
    const s = setup();
    const el = s.wrapper.find('input.input');
    await el.setValue('keep me');
    (el.element as HTMLInputElement).focus();
    await el.trigger('keydown', { key: 'ArrowUp' });
    await el.trigger('keydown', { key: 'ArrowDown' });
    expect(s.recallPrevious).toHaveBeenCalledTimes(1);
    expect(s.recallNext).toHaveBeenCalledTimes(1);
    await el.trigger('keydown', { key: 'Escape' });
    expect(document.activeElement).not.toBe(el.element);
    expect(s.draft.value).toBe('keep me');
  });

  it('arrow keys do nothing during a composition', async () => {
    const s = setup();
    await s.wrapper.find('input.input').trigger('keydown', { key: 'ArrowUp', isComposing: true });
    expect(s.recallPrevious).not.toHaveBeenCalled();
  });

  it('focus and blur update console.inputFocused', async () => {
    const s = setup();
    const el = s.wrapper.find('input.input');
    await el.trigger('focus');
    expect(s.inputFocused.value).toBe(true);
    await el.trigger('blur');
    expect(s.inputFocused.value).toBe(false);
  });

  it('a draft with markup stays an input value and creates no element', async () => {
    const s = setup();
    await s.wrapper.find('input.input').setValue(PAYLOAD);
    expect(s.wrapper.find('img').exists()).toBe(false);
    expect(document.body.querySelector('img')).toBeNull();
    expect(input(s.wrapper).value).toBe(PAYLOAD);
  });
});

describe('Composer Send', () => {
  it('desktop shows a Send text button labelled Send action', async () => {
    const s = setup({ desktop: true });
    const btn = s.wrapper.find('button.btn.btn-primary');
    expect(btn.text()).toBe('Send');
    expect(btn.attributes('aria-label')).toBe('Send action');
    expect(btn.attributes('disabled')).toBeDefined();
    await s.wrapper.find('input.input').setValue('hi');
    expect(btn.attributes('disabled')).toBeUndefined();
    await btn.trigger('click');
    expect(s.submit).toHaveBeenCalledTimes(1);
  });

  it('mobile shows a 44px icon button labelled Send action', () => {
    const s = setup({ desktop: false });
    const btn = s.wrapper.find('button.btn-primary');
    expect(btn.classes()).toContain('btn-icon');
    expect(btn.text()).toBe('');
    expect(btn.attributes('aria-label')).toBe('Send action');
    expect(btn.find('svg').exists()).toBe(true);
  });

  it('Send stays disabled for a whitespace-only draft', async () => {
    const s = setup();
    await s.wrapper.find('input.input').setValue('   ');
    expect(s.wrapper.find('button.btn-primary').attributes('disabled')).toBeDefined();
  });
});

describe('Composer offline', () => {
  it('disables the input and Send, shows Reconnecting and keeps the draft', async () => {
    const s = setup({ connected: false });
    s.draft.value = 'half done';
    await nextTick();
    const el = s.wrapper.find('input.input');
    expect(el.attributes('disabled')).toBeDefined();
    expect(el.attributes('placeholder')).toBe('Reconnecting…');
    expect(input(s.wrapper).value).toBe('half done');
    expect(s.wrapper.find('button.btn-primary').attributes('disabled')).toBeDefined();
    s.connected.value = true;
    await nextTick();
    expect(el.attributes('disabled')).toBeUndefined();
    expect(input(s.wrapper).value).toBe('half done');
  });
});

describe('Composer conversation chip', () => {
  it('renders nothing extra outside a conversation', () => {
    const s = setup();
    expect(s.wrapper.find('.chip-row').exists()).toBe(false);
    expect(s.wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('shows the chip, the end button and the placeholder in a conversation', async () => {
    const s = setup();
    s.conversation.value = { npcId: 3n, name: 'Ferryman' };
    await nextTick();
    const chip = s.wrapper.find('[role="status"]');
    expect(chip.text()).toContain('Talking with Ferryman');
    expect(chip.find('.chip-name').attributes('title')).toBe('Ferryman');
    expect(chip.find('svg').exists()).toBe(true);
    const end = s.wrapper.find('button.chip-end');
    expect(end.attributes('aria-label')).toBe('End conversation with Ferryman');
    expect(s.wrapper.find('input.input').attributes('placeholder')).toBe('Say something to Ferryman…');
    await end.trigger('click');
    expect(s.endConversation).toHaveBeenCalledTimes(1);
  });

  it('renders an NPC name as text, never markup', async () => {
    const s = setup();
    s.conversation.value = { npcId: 3n, name: PAYLOAD };
    await nextTick();
    expect(s.wrapper.find('img').exists()).toBe(false);
    expect(s.wrapper.find('.chip-name').text()).toContain(PAYLOAD);
  });
});

describe('Composer focus', () => {
  it('desktop mount focuses the input; mobile mount does not', () => {
    const d = setup({ desktop: true });
    expect(document.activeElement).toBe(input(d.wrapper));
    d.wrapper.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    const m = setup({ desktop: false });
    expect(document.activeElement).not.toBe(input(m.wrapper));
  });

  it('a focusTick change focuses the input with the caret at the end', async () => {
    const s = setup({ desktop: false });
    s.draft.value = 'whisper Mara ';
    s.focusTick.value += 1;
    await nextTick();
    await nextTick();
    const el = input(s.wrapper);
    expect(document.activeElement).toBe(el);
    expect(el.selectionStart).toBe(el.value.length);
  });

  it('Enter with nothing focused and no screen open focuses the input', () => {
    const s = setup({ desktop: false });
    expect(document.activeElement).toBe(document.body);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).toBe(input(s.wrapper));
  });

  it('Enter with a screen open does nothing', () => {
    const s = setup({ desktop: false });
    s.activeScreen.value = 'bag';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).not.toBe(input(s.wrapper));
  });

  it('stops listening after unmount', () => {
    const s = setup({ desktop: false });
    const el = input(s.wrapper);
    s.wrapper.unmount();
    wrapper = null;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(document.activeElement).not.toBe(el);
  });
});

describe('INPUT_MAX_CHARS', () => {
  it('equals PLAYER_INPUT_MAX_CHARS in the server source', () => {
    const source = readFileSync(resolve(process.cwd(), 'spacetimedb/src/data/llm_layers.ts'), 'utf8');
    const match = /PLAYER_INPUT_MAX_CHARS = (\d+)/.exec(source);
    expect(match).not.toBeNull();
    expect(INPUT_MAX_CHARS).toBe(Number(match![1]));
  });
});

describe('Composer source contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/input/Composer.vue'), 'utf8');

  it('keeps the checker-note copy and the exact mobile end-button margin', () => {
    expect(source).toContain('aria-label="Send action"');
    expect(source).toContain('What do you do?');
    expect(source).toContain('Reconnecting…');
    expect(source).toContain('Talking with');
    expect(source).toContain('calc((32px - 44px) / 2)');
  });
});
