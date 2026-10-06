// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import WorldEventCard from './WorldEventCard.vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';

let wrapper: VueWrapper | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

const PAYLOAD = '<img src=x onerror=alert(1)>';
const MINUTE = 60_000_000n;

function nowMicros(): bigint {
  return BigInt(Date.now()) * 1000n;
}

function event(id: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    name: 'The Hollowmere Siege',
    regionId: 7n,
    status: 'active',
    deadlineAtMicros: nowMicros() + 134n * MINUTE,
    successCounter: 0n,
    failureCounter: 0n,
    ...over,
  };
}

function objective(id: bigint, eventId: bigint, name: string, current: bigint, target: bigint) {
  return { id, eventId, name, currentCount: current, targetCount: target };
}

interface Setup {
  events?: unknown[];
  objectives?: unknown[];
  contributions?: unknown[];
  character?: unknown;
}

function mountCard(setup: Setup = {}): { w: VueWrapper; openScreen: ReturnType<typeof vi.fn> } {
  const openScreen = vi.fn();
  const game = {
    ...createInertGame(),
    character: ref(setup.character === undefined ? { id: 1n, locationId: 70n } : setup.character),
    characterId: ref(1n),
    locations: ref([{ id: 70n, regionId: 7n }]),
    worldEvents: ref(setup.events ?? []),
    eventObjectives: ref(setup.objectives ?? []),
    contributions: ref(setup.contributions ?? []),
    clock: { skewMicros: ref(0), sample() {}, nowMicros: () => Date.now() * 1000 },
  } as unknown as GameData;
  const frame = { ...createInertFrame(), openScreen } as unknown as FrameControls;
  wrapper = mount(WorldEventCard, {
    global: { provide: { [GAME_KEY as symbol]: game, [FRAME_KEY as symbol]: frame } },
  });
  return { w: wrapper, openScreen };
}

describe('WorldEventCard', () => {
  it('renders nothing with no active event in the region', () => {
    const { w } = mountCard();
    expect(w.find('section').exists()).toBe(false);
    expect(w.html()).not.toContain('World event');
  });

  it('renders nothing for an event in another region or one that is not active', () => {
    const { w } = mountCard({ events: [event(1n, { regionId: 9n }), event(2n, { status: 'ended' })] });
    expect(w.find('section').exists()).toBe(false);
  });

  it('renders nothing when the character has no known location', () => {
    const { w } = mountCard({ events: [event(1n)], character: null });
    expect(w.find('section').exists()).toBe(false);
  });

  it('shows the kicker, time left, title and objective progress lines with 3px bars', () => {
    const { w } = mountCard({
      events: [event(1n)],
      objectives: [
        objective(11n, 1n, 'Defeat the Invaders', 12n, 20n),
        objective(12n, 1n, 'Protect the Villagers', 3n, 10n),
      ],
    });
    const card = w.get('section.card.elev-sm');
    expect(card.get('.card-kicker').text()).toBe('World event');
    expect(card.text()).toContain('2h 14m');
    expect(card.get('.card-title').text()).toBe('The Hollowmere Siege');
    const bars = card.findAll('[role="progressbar"]');
    expect(bars.map((b) => b.attributes('aria-label'))).toEqual([
      'Defeat the Invaders 12/20',
      'Protect the Villagers 3/10',
    ]);
    expect(card.text()).toContain('Defeat the Invaders');
    expect(card.text()).toContain('12/20');
    expect(card.text()).toContain('3/10');
    expect(bars[0].get('.fill').attributes('style')).toContain('width: 60%');
    expect(bars[1].get('.fill').attributes('style')).toContain('width: 30%');
  });

  it('shows no split bar and no For/Against labels while both counters are zero', () => {
    const { w } = mountCard({ events: [event(1n)] });
    expect(w.find('.split').exists()).toBe(false);
    expect(w.text()).not.toContain('For');
    expect(w.text()).not.toContain('Against');
  });

  it('shows a two-segment split bar and For/Against percentages once a counter moved', () => {
    const { w } = mountCard({ events: [event(1n, { successCounter: 62n, failureCounter: 38n })] });
    const bar = w.get('.split');
    expect(bar.get('.split-for').attributes('style')).toContain('width: 62%');
    expect(bar.get('.split-against').attributes('style')).toContain('width: 38%');
    const meta = w.get('.card-meta');
    expect(meta.text()).toContain('For 62%');
    expect(meta.text()).toContain('Against 38%');
  });

  it('shows the split when only one counter moved', () => {
    const { w } = mountCard({ events: [event(1n, { successCounter: 0n, failureCounter: 4n })] });
    expect(w.get('.card-meta').text()).toContain('For 0%');
    expect(w.get('.card-meta').text()).toContain('Against 100%');
  });

  it('shows the own contribution when non-zero and hides it when zero or missing', () => {
    const mine = { eventId: 1n, characterId: 1n, count: 5n };
    expect(mountCard({ events: [event(1n)], contributions: [mine] }).w.text()).toContain('Your contribution 5');
    wrapper?.unmount();
    expect(
      mountCard({ events: [event(1n)], contributions: [{ ...mine, count: 0n }] }).w.text(),
    ).not.toContain('Your contribution');
    wrapper?.unmount();
    expect(mountCard({ events: [event(1n)] }).w.text()).not.toContain('Your contribution');
    wrapper?.unmount();
    expect(
      mountCard({
        events: [event(1n)],
        contributions: [{ eventId: 1n, characterId: 2n, count: 9n }],
      }).w.text(),
    ).not.toContain('Your contribution');
  });

  it('shows the sooner event with a ghost "1 more" button that opens the Events screen', async () => {
    const { w, openScreen } = mountCard({
      events: [
        event(1n, { name: 'Later Event', deadlineAtMicros: nowMicros() + 600n * MINUTE }),
        event(2n, { name: 'Sooner Event', deadlineAtMicros: nowMicros() + 30n * MINUTE }),
      ],
    });
    expect(w.get('.card-title').text()).toBe('Sooner Event');
    expect(w.text()).toContain('30m');
    const more = w.get('button.btn.btn-ghost');
    expect(more.text()).toBe('1 more');
    await more.trigger('click');
    expect(openScreen).toHaveBeenCalledWith('events');
  });

  it('shows no more button for a single event', () => {
    const { w } = mountCard({ events: [event(1n)] });
    expect(w.find('button').exists()).toBe(false);
  });

  it('refreshes the time left once a minute and clears the interval on unmount', async () => {
    const { w } = mountCard({ events: [event(1n)] });
    expect(w.text()).toContain('2h 14m');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(60_000);
    await w.vm.$nextTick();
    expect(w.text()).toContain('2h 13m');
    w.unmount();
    wrapper = null;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads Ending past the deadline', () => {
    const { w } = mountCard({ events: [event(1n, { deadlineAtMicros: nowMicros() - MINUTE })] });
    expect(w.text()).toContain('Ending');
  });

  it('renders markup in names as text', () => {
    const { w } = mountCard({
      events: [event(1n, { name: PAYLOAD })],
      objectives: [objective(11n, 1n, PAYLOAD, 1n, 2n)],
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.card-title').text()).toBe(PAYLOAD);
    expect(w.text()).toContain(PAYLOAD);
  });

  it('renders nothing with no provider (inert defaults)', () => {
    wrapper = mount(WorldEventCard);
    expect(wrapper.find('section').exists()).toBe(false);
  });

  it('overrides the card title to 14px / 500 and pins to the rail bottom', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/rails/WorldEventCard.vue'), 'utf8');
    expect(source).toContain('margin-top: auto');
    expect(source).toContain('font-size: 14px');
    expect(source).toContain('font-weight: 500');
    expect(source).toContain('height: 6px');
  });
});
