// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { LLM_INDICATOR_POOLS, LLM_PROGRESS_ROTATE_MS } from '@game-data/llm_indicator_lines';
import FeedView from './FeedView.vue';
import KeeperProgress from './KeeperProgress.vue';
import { createFeedStore } from './feedStore';
import type { FeedStore } from './feedStore';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { ConsoleApi, GameData } from '../game/context';

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

interface Harness {
  game: GameData;
  console: ConsoleApi;
  feed: FeedStore;
  jobs: Ref<readonly any[]>;
  connected: Ref<boolean>;
  sendTick: Ref<number>;
  actOnKeyword: ReturnType<typeof vi.fn>;
}

function harness(overrides: Partial<Record<keyof GameData, unknown>> = {}): Harness {
  const feed = createFeedStore();
  feed.setCharacter(1n);
  const jobs = ref<readonly any[]>([]);
  const connected = ref(true);
  const sendTick = ref(0);
  const actOnKeyword = vi.fn();
  const base = createInertGame();
  const game = {
    ...base,
    connected,
    feed,
    llmJobs: jobs,
    character: ref({ id: 1n, name: 'Bob' }),
    characterId: ref(1n),
    ...overrides,
  } as unknown as GameData;
  const consoleApi = { ...createInertConsole(), sendTick, actOnKeyword } as unknown as ConsoleApi;
  return { game, console: consoleApi, feed, jobs, connected, sendTick, actOnKeyword };
}

function mountView(h: Harness, props: { compact?: boolean } = {}): VueWrapper {
  wrapper = mount(FeedView, {
    props,
    global: { provide: { [GAME_KEY as symbol]: h.game, [CONSOLE_KEY as symbol]: h.console } },
  });
  return wrapper;
}

let rowId = 0n;
function ingest(h: Harness, row: Record<string, unknown>): void {
  rowId += 1n;
  h.feed.ingest('location', {
    id: rowId,
    kind: 'narrative',
    message: '',
    createdAt: { microsSinceUnixEpoch: rowId },
    ...row,
  } as never);
  h.feed.flush();
}

async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe('FeedView log', () => {
  it('renders a labelled live log with the empty line', () => {
    const w = mountView(harness());
    const log = w.get('[role="log"]');
    expect(log.attributes('aria-label')).toBe('Story');
    expect(log.attributes('aria-live')).toBe('polite');
    expect(log.attributes('aria-relevant')).toBe('additions');
    expect(log.text()).toBe('Your story will appear here.');
  });

  it('renders entries in order, one line per segment', async () => {
    const h = harness();
    const w = mountView(h);
    ingest(h, { kind: 'system', message: 'First.' });
    ingest(h, {
      kind: 'npc',
      segments: [
        { kind: 'narration', speaker: 'The Keeper', text: 'The ferry bumps the dock.' },
        { kind: 'dialogue', speaker: 'The Ferryman', text: 'Mind the current.' },
      ],
    });
    await settle();
    const lines = w.findAll('.line');
    expect(lines).toHaveLength(3);
    expect(lines[0].text()).toBe('First.');
    expect(lines[1].text()).toContain('The ferry bumps the dock.');
    expect(lines[2].text()).toBe('The Ferryman says, “Mind the current.”');
    expect(w.text()).not.toContain('Your story will appear here.');
  });

  it('renders model and player text as literal text', async () => {
    const h = harness();
    const w = mountView(h);
    ingest(h, { segments: [{ kind: 'narration', speaker: 'The Keeper', text: `${PAYLOAD} {{color:#fff}}x{{/color}}` }] });
    ingest(h, { kind: 'whisper', message: `Mara whispers: ${PAYLOAD}` });
    await settle();
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toContain(`${PAYLOAD} {{color:#fff}}x{{/color}}`);
  });

  it('switches the scroll padding class when compact', () => {
    const w = mountView(harness(), { compact: true });
    expect(w.get('.feed-scroll').classes()).toContain('compact');
    w.unmount();
    wrapper = mountView(harness());
    expect(wrapper.get('.feed-scroll').classes()).not.toContain('compact');
  });

  it('mounts bare with inert defaults', () => {
    wrapper = mount(FeedView);
    expect(wrapper.text()).toBe('Your story will appear here.');
  });
});

describe('FeedView keywords', () => {
  function keywordHarness(): Harness {
    return harness({
      npcsHere: ref([{ id: 5n, name: 'Ferryman', npcType: 'npc' }]),
      locations: ref([
        { id: 10n, name: 'Here' },
        { id: 20n, name: 'Gloamwood' },
      ]),
      connections: ref([{ id: 1n, fromLocationId: 10n, toLocationId: 20n }]),
      nodesHere: ref([{ id: 7n, name: 'Old Well', state: 'available', characterId: null }]),
      playersHere: ref([{ id: 9n, name: 'Marisol', level: 2n }]),
    });
  }

  it('builds keywords from npcs, connected places, nodes and players, never the own name', async () => {
    const h = keywordHarness();
    const w = mountView(h);
    ingest(h, {
      segments: [
        {
          kind: 'narration',
          speaker: 'The Keeper',
          text: 'Ferryman points at Gloamwood. The Old Well waits. Marisol nods at Bob.',
        },
      ],
    });
    await settle();
    const labels = w.findAll('button.keyword').map((b) => b.attributes('aria-label'));
    expect(labels).toEqual(['Hail Ferryman', 'Travel to Gloamwood', 'Examine Old Well', 'Whisper Marisol']);
  });

  it('calls actOnKeyword with the entry on click', async () => {
    const h = keywordHarness();
    const w = mountView(h);
    ingest(h, { segments: [{ kind: 'narration', speaker: 'The Keeper', text: 'Walk to Gloamwood.' }] });
    await settle();
    await w.get('button.keyword').trigger('click');
    expect(h.actOnKeyword).toHaveBeenCalledTimes(1);
    expect(h.actOnKeyword).toHaveBeenCalledWith({ kind: 'place', id: 20n, name: 'Gloamwood' });
  });

  it('hides nodes that belong to another character', async () => {
    const h = harness({
      nodesHere: ref([{ id: 7n, name: 'Old Well', state: 'available', characterId: 99n }]),
    });
    const w = mountView(h);
    ingest(h, { segments: [{ kind: 'narration', speaker: 'The Keeper', text: 'The Old Well waits.' }] });
    await settle();
    expect(w.find('button.keyword').exists()).toBe(false);
  });

  it('keeps keywords visible but inert while disconnected', async () => {
    const h = keywordHarness();
    const w = mountView(h);
    ingest(h, { segments: [{ kind: 'narration', speaker: 'The Keeper', text: 'Walk to Gloamwood.' }] });
    await settle();
    expect(w.get('button.keyword').attributes('aria-disabled')).toBeUndefined();
    h.connected.value = false;
    await settle();
    const button = w.get('button.keyword');
    expect(button.attributes('aria-disabled')).toBe('true');
    await button.trigger('click');
    expect(h.actOnKeyword).not.toHaveBeenCalled();
  });

  it('never makes a keyword out of player-authored text', async () => {
    const h = keywordHarness();
    const w = mountView(h);
    ingest(h, { kind: 'whisper', message: 'Mara whispers: meet me at Gloamwood' });
    ingest(h, { kind: 'say', message: 'Mara says: go to Gloamwood' });
    await settle();
    expect(w.find('button.keyword').exists()).toBe(false);
  });
});

function job(route: string, status: string, id = 1n): Record<string, unknown> {
  return { id, route, status, createdAt: { microsSinceUnixEpoch: 1n }, errorCode: undefined, userMessage: '' };
}

describe('FeedView progress line', () => {
  it('shows the route indicator line while a job is active, then clears it', async () => {
    const h = harness();
    const w = mountView(h);
    expect(w.find('[role="status"]').exists()).toBe(false);
    h.jobs.value = [job('npc_conversation', 'in_flight')];
    await settle();
    const status = w.get('[role="status"]');
    expect(status.text()).toBe('The Keeper leans in to listen...');
    expect(status.attributes('aria-live')).toBe('polite');
    h.jobs.value = [job('npc_conversation', 'done')];
    await settle();
    expect(w.find('[role="status"]').exists()).toBe(false);
  });

  it('puts the progress line after the log, outside the line history', async () => {
    const h = harness();
    const w = mountView(h);
    h.jobs.value = [job('npc_conversation', 'pending')];
    await settle();
    expect(w.get('[role="log"]').find('[role="status"]').exists()).toBe(false);
    expect(w.findAll('.line')).toHaveLength(0);
  });

  it('rotates through the route pool every LLM_PROGRESS_ROTATE_MS', async () => {
    const pool = LLM_INDICATOR_POOLS.world_gen;
    expect(pool.length).toBeGreaterThan(1);
    const h = harness();
    const w = mountView(h);
    h.jobs.value = [job('world_gen', 'in_flight')];
    await settle();
    expect(w.get('[role="status"]').text()).toBe(pool[0]);
    vi.advanceTimersByTime(LLM_PROGRESS_ROTATE_MS);
    await settle();
    expect(w.get('[role="status"]').text()).toBe(pool[1]);
    vi.advanceTimersByTime(LLM_PROGRESS_ROTATE_MS);
    await settle();
    expect(w.get('[role="status"]').text()).toBe(pool[2]);
  });

  it('adds no client Error line for a failed job (the server writes its own)', async () => {
    const h = harness();
    const w = mountView(h);
    h.jobs.value = [job('npc_conversation', 'in_flight')];
    await settle();
    h.jobs.value = [{ ...job('npc_conversation', 'failed'), errorCode: 'timeout', userMessage: 'The Keeper lost the thread.' }];
    await settle();
    expect(w.find('[role="status"]').exists()).toBe(false);
    expect(w.findAll('.line')).toHaveLength(0);
    expect(w.text()).not.toContain('The Keeper lost the thread.');
  });

  it('runs one interval only while a job is active and clears it afterwards and on unmount', async () => {
    const h = harness();
    const w = mountView(h);
    expect(vi.getTimerCount()).toBe(0);
    h.jobs.value = [job('world_gen', 'in_flight')];
    await settle();
    expect(vi.getTimerCount()).toBe(1);
    h.jobs.value = [job('world_gen', 'done')];
    await settle();
    expect(vi.getTimerCount()).toBe(0);
    h.jobs.value = [job('world_gen', 'in_flight', 2n)];
    await settle();
    expect(vi.getTimerCount()).toBe(1);
    w.unmount();
    wrapper = null;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('renders the progress text as a text node', () => {
    wrapper = mount(KeeperProgress, { props: { text: PAYLOAD } });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe(PAYLOAD);
    expect(wrapper.get('svg').classes()).toContain('spin');
  });
});

function stubMetrics(el: HTMLElement, m: { scrollTop: number; scrollHeight: number; clientHeight: number }): void {
  for (const [key, value] of Object.entries(m)) {
    Object.defineProperty(el, key, { value, configurable: true, writable: true });
  }
}

describe('FeedView pinning and the New lines pill', () => {
  function setup(): { h: Harness; w: VueWrapper; el: HTMLElement; scrollTo: ReturnType<typeof vi.fn> } {
    const h = harness();
    const w = mountView(h);
    const el = w.get('.feed-scroll').element as HTMLElement;
    const scrollTo = vi.fn();
    Object.defineProperty(el, 'scrollTo', { value: scrollTo, configurable: true, writable: true });
    return { h, w, el, scrollTo };
  }

  async function scrollUp(w: VueWrapper, el: HTMLElement): Promise<void> {
    stubMetrics(el, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
    await w.get('.feed-scroll').trigger('scroll');
  }

  it('follows new lines while pinned and shows no pill', async () => {
    const { h, w, scrollTo } = setup();
    ingest(h, { kind: 'system', message: 'One.' });
    await settle();
    expect(scrollTo).toHaveBeenCalled();
    expect(w.find('.new-lines').exists()).toBe(false);
  });

  it('shows the pill when a line arrives while scrolled up, and the pill jumps to the bottom', async () => {
    const { h, w, el, scrollTo } = setup();
    ingest(h, { kind: 'system', message: 'One.' });
    await settle();
    await scrollUp(w, el);
    scrollTo.mockClear();
    ingest(h, { kind: 'system', message: 'Two.' });
    await settle();
    const pill = w.get('button.new-lines');
    expect(pill.attributes('aria-label')).toBe('New lines, jump to latest');
    expect(pill.text()).toBe('New lines');
    expect(scrollTo).not.toHaveBeenCalled();
    await pill.trigger('click');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0][0].top).toBe(1000);
    expect(w.find('.new-lines').exists()).toBe(false);
  });

  it('hides the pill when the player scrolls back to the bottom by hand', async () => {
    const { h, w, el } = setup();
    ingest(h, { kind: 'system', message: 'One.' });
    await settle();
    await scrollUp(w, el);
    ingest(h, { kind: 'system', message: 'Two.' });
    await settle();
    expect(w.find('.new-lines').exists()).toBe(true);
    stubMetrics(el, { scrollTop: 600, scrollHeight: 1000, clientHeight: 400 });
    await w.get('.feed-scroll').trigger('scroll');
    expect(w.find('.new-lines').exists()).toBe(false);
  });

  it('re-pins and scrolls to the bottom on any send', async () => {
    const { h, w, el, scrollTo } = setup();
    ingest(h, { kind: 'system', message: 'One.' });
    await settle();
    await scrollUp(w, el);
    ingest(h, { kind: 'system', message: 'Two.' });
    await settle();
    expect(w.find('.new-lines').exists()).toBe(true);
    scrollTo.mockClear();
    h.sendTick.value += 1;
    await settle();
    expect(w.find('.new-lines').exists()).toBe(false);
    expect(scrollTo).toHaveBeenCalled();
    ingest(h, { kind: 'system', message: 'Three.' });
    await settle();
    expect(w.find('.new-lines').exists()).toBe(false);
  });

  it('never shows the pill with zero lines', async () => {
    const { w, el } = setup();
    await scrollUp(w, el);
    await settle();
    expect(w.find('.new-lines').exists()).toBe(false);
  });

  it('ignores scroll events while the smooth jump is still travelling', async () => {
    const { h, w, el } = setup();
    ingest(h, { kind: 'system', message: 'One.' });
    await settle();
    await scrollUp(w, el);
    ingest(h, { kind: 'system', message: 'Two.' });
    await settle();
    await w.get('button.new-lines').trigger('click');
    await scrollUp(w, el);
    ingest(h, { kind: 'system', message: 'Three.' });
    await settle();
    expect(w.find('.new-lines').exists()).toBe(false);
    vi.advanceTimersByTime(700);
    await scrollUp(w, el);
    ingest(h, { kind: 'system', message: 'Four.' });
    await settle();
    expect(w.find('.new-lines').exists()).toBe(true);
  });
});

describe('FeedView source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/console/FeedView.vue'), 'utf8');

  it('declares the log contract, the pill and the indicator selector', () => {
    expect(source).toContain('role="log"');
    expect(source).toContain('aria-label="Story"');
    expect(source).toContain('New lines');
    expect(source).toContain('selectLlmIndicator');
    expect(source).toContain('buildFeedLines');
  });

  it('uses the spec line width, bottom anchoring and wrap-safe anchoring', () => {
    expect(source).toContain('max-width: 760px');
    expect(source).toContain('margin-top: auto');
    expect(source).toContain('overflow-anchor: auto');
  });
});
