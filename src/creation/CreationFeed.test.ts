// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { LLM_PROGRESS_ROTATE_MS } from '@game-data/llm_indicator_lines';
import CreationFeed from './CreationFeed.vue';
import { createCreationFeedStore } from './creationFeedStore';
import type { CreationFeedStore } from './creationFeedStore';
import type { LlmJobRowLike } from '../console/indicator';
import { selectLlmIndicator } from '../console/indicator';

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

const EVIL = '<img src=x onerror=alert(1)>';

let nextId = 0n;
function serverRow(
  store: CreationFeedStore,
  kind: string,
  message: string,
  segments: { kind: string; speaker: string; text: string }[] | null = null,
): void {
  nextId += 1n;
  store.ingest({
    id: nextId,
    kind,
    message,
    createdAt: { microsSinceUnixEpoch: nextId },
    segments,
  });
}

function job(id: bigint, route: string, status = 'in_flight'): LlmJobRowLike {
  return { id, route, status, createdAt: { microsSinceUnixEpoch: id } };
}

function mountFeed(
  store: CreationFeedStore,
  options: { jobs?: LlmJobRowLike[]; desktop?: boolean; slot?: boolean } = {},
) {
  wrapper = mount(CreationFeed, {
    props: { entries: store.entries.value, llmJobs: options.jobs ?? [], desktop: options.desktop ?? true },
    slots: options.slot ? { default: () => h('div', { class: 'choice-slot' }, 'cards') } : {},
  });
  return wrapper;
}

describe('CreationFeed: lines', () => {
  it('shows the empty line when there are no entries', () => {
    const w = mountFeed(createCreationFeedStore());
    expect(w.find('[role="log"]').text()).toContain('Your story will appear here.');
  });

  it('renders a two-segment creation entry as two Keeper paragraphs under one The Keeper label', () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation', 'x', [
      { kind: 'narration', speaker: '', text: 'First part.' },
      { kind: 'narration', speaker: '', text: 'Second part.' },
    ]);
    const w = mountFeed(store);
    const lines = w.findAll('.line-keeper');
    expect(lines).toHaveLength(2);
    expect(w.findAll('.micro').map((m) => m.text())).toEqual(['The Keeper']);
    expect(lines[0].find('.micro').exists()).toBe(true);
    expect(lines[1].find('.micro').exists()).toBe(false);
    expect(lines[0].text()).toContain('First part.');
    expect(lines[1].text()).toBe('Second part.');
    expect(w.text()).not.toContain('Your story will appear here.');
  });

  it('renders creation_error as an Error line', () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation_error', 'That name is taken.');
    const w = mountFeed(store);
    expect(w.findAll('.line-error')).toHaveLength(1);
    expect(w.find('.line-error').text()).toContain('That name is taken.');
    expect(w.find('.warn-row').exists()).toBe(false);
  });

  it('renders creation_warning inside a wrapper whose warning icon comes before the line', () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation_warning', 'Going back loses your race.');
    const w = mountFeed(store);
    const wrap = w.find('.warn-row');
    expect(wrap.exists()).toBe(true);
    const children = Array.from(wrap.element.children);
    expect(children[0].classList.contains('icon-warn')).toBe(true);
    expect(children[0].getAttribute('aria-hidden')).toBe('true');
    expect(children[1].classList.contains('line-keeper')).toBe(true);
    expect(wrap.text()).toContain('Going back loses your race.');
  });

  it('renders a local echo as "› text"', () => {
    const store = createCreationFeedStore();
    store.appendEcho('Warrior');
    const w = mountFeed(store);
    expect(w.find('.line-echo').text()).toBe('› Warrior');
  });

  it('removes ** markers and keeps newlines in a Keeper line', () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation', 'You are **Eldrin**.\nRace: Elf\nClass: Mage');
    const w = mountFeed(store);
    const body = w.find('.line-keeper .body');
    expect(body.text()).toBe('You are Eldrin.\nRace: Elf\nClass: Mage');
    expect(body.text()).not.toContain('**');
  });

  it('renders markup-shaped server and echo text as text, never an element', () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation', EVIL);
    serverRow(store, 'creation_error', EVIL);
    store.appendEcho(EVIL);
    const w = mountFeed(store);
    expect(w.find('[role="log"]').text()).toContain(EVIL);
    expect(w.element.querySelector('img')).toBeNull();
  });

  it('exposes the log attributes', () => {
    const w = mountFeed(createCreationFeedStore());
    const log = w.find('[role="log"]');
    expect(log.attributes('aria-label')).toBe('Story');
    expect(log.attributes('aria-live')).toBe('polite');
    expect(log.attributes('aria-relevant')).toBe('additions');
  });
});

describe('CreationFeed: progress line and slot', () => {
  it('shows the indicator line while a creation-scope job is active and none for a game route', () => {
    const active = [job(1n, 'creation_race')];
    const expected = selectLlmIndicator(active, 'creation', 0).indicatorLine;
    expect(expected).not.toBeNull();
    const w = mountFeed(createCreationFeedStore(), { jobs: active });
    expect(w.find('[role="status"]').text()).toBe(expected);
    w.unmount();
    wrapper = null;

    const game = mountFeed(createCreationFeedStore(), { jobs: [job(2n, 'narrative')] });
    expect(game.find('[role="status"]').exists()).toBe(false);
  });

  it('shows no progress line for a finished job', () => {
    const w = mountFeed(createCreationFeedStore(), { jobs: [job(1n, 'creation_race', 'failed')] });
    expect(w.find('[role="status"]').exists()).toBe(false);
  });

  it('renders the default slot after the progress line and the last line, in the scroller but outside the live log', () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation', 'Greeting.');
    const w = mountFeed(store, {
      jobs: [job(1n, 'creation_race')],
      slot: true,
    });
    const log = w.find('[role="log"]').element;
    const scroller = w.find('.feed-scroll').element;
    const slot = scroller.querySelector('.choice-slot');
    const progress = log.querySelector('[role="status"]');
    const line = log.querySelector('.line-keeper');
    expect(slot).not.toBeNull();
    expect(log.contains(slot)).toBe(false);
    expect(progress).not.toBeNull();
    expect(line).not.toBeNull();
    expect(line!.compareDocumentPosition(progress!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(progress!.compareDocumentPosition(slot!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('rotates the progress line while active and clears the interval on unmount', async () => {
    const w = mountFeed(createCreationFeedStore(), { jobs: [job(1n, 'creation_race')] });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(LLM_PROGRESS_ROTATE_MS);
    expect(vi.getTimerCount()).toBe(1);
    w.unmount();
    wrapper = null;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts no interval without an active job', () => {
    mountFeed(createCreationFeedStore());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the interval when the job ends', async () => {
    const w = mountFeed(createCreationFeedStore(), { jobs: [job(1n, 'creation_race')] });
    expect(vi.getTimerCount()).toBe(1);
    await w.setProps({ llmJobs: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('CreationFeed: pinning', () => {
  function unpin(w: VueWrapper): HTMLElement {
    const el = w.find('.feed-scroll').element as HTMLElement;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 });
    el.scrollTop = 0;
    return el;
  }

  it('shows the New lines pill when a line arrives while scrolled up, and the pill jumps to latest', async () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation', 'First.');
    const w = mountFeed(store);
    unpin(w);
    await w.find('.feed-scroll').trigger('scroll');
    serverRow(store, 'creation', 'Second.');
    await w.setProps({ entries: store.entries.value });
    const pill = w.find('button.new-lines');
    expect(pill.exists()).toBe(true);
    expect(pill.attributes('aria-label')).toBe('New lines, jump to latest');
    expect(pill.classes()).toEqual(expect.arrayContaining(['btn', 'btn-secondary']));
    await pill.trigger('click');
    expect(w.find('button.new-lines').exists()).toBe(false);
  });

  it('shows no pill when pinned', async () => {
    const store = createCreationFeedStore();
    serverRow(store, 'creation', 'First.');
    const w = mountFeed(store);
    serverRow(store, 'creation', 'Second.');
    await w.setProps({ entries: store.entries.value });
    expect(w.find('button.new-lines').exists()).toBe(false);
  });
});
