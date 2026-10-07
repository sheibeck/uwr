// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PhArrowBendUpRight,
  PhCheckCircle,
  PhDoorOpen,
  PhHourglassMedium,
  PhSignpost,
  PhXCircle,
} from '@phosphor-icons/vue';
import { createFeedStore } from '../console/feedStore';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import DetailPanel from './DetailPanel.vue';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import { adjacencyOf } from './route';
import { useDestination } from './useDestination';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/DetailPanel.vue'), 'utf8');
const XSS = '<img src=x onerror=alert(1)>';
const NOW = 1_000_000_000;
const CHARACTER = 1n;

const place = (id: bigint, name: string, regionId: bigint, over: Record<string, unknown> = {}): Location =>
  ({
    id,
    name,
    description: '',
    zone: '',
    regionId,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
    ...over,
  }) as unknown as Location;

const links = (pairs: Array<[bigint, bigint]>) =>
  pairs.flatMap(([a, b]) => [
    { fromLocationId: a, toLocationId: b },
    { fromLocationId: b, toLocationId: a },
  ]);

interface Options {
  at?: bigint;
  selected?: bigint | null;
  stamina?: bigint;
  moveImpl?: () => Promise<void>;
  locations?: Location[];
  quests?: boolean;
  npcs?: Array<{ npcType: string; locationId: bigint }>;
  visited?: bigint[];
  /** The selected place's people subscriptions have applied (default true). */
  peopleApplied?: boolean;
}

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

function build(over: Options = {}) {
  const selectedApplied = ref(over.peopleApplied ?? true);
  const character = ref<Record<string, unknown>>({
    id: CHARACTER,
    name: 'Brannoch',
    locationId: over.at ?? 10n,
    level: 6n,
    stamina: over.stamina ?? 20n,
    boundLocationId: 0n,
    racialTravelCostIncrease: null,
    racialTravelCostDiscount: null,
  });
  const locations = ref<Location[]>(
    over.locations ?? [
      place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true, bindStone: true }),
      place(11n, 'Gloamwood', 1n, { description: 'Pines lean over a narrow trail.', craftingAvailable: true }),
      place(12n, 'Ridge Walk', 1n, { terrainType: 'mountains' }),
      place(20n, 'Saltmarsh Gate', 2n, { description: 'Reeds hiss in the wind.' }),
      place(13n, 'Far Hollow', 1n),
    ],
  );
  const visitedIds = ref<bigint[]>(over.visited ?? [10n, 11n, 12n]);
  const connections = ref(links([[10n, 11n], [11n, 12n], [11n, 20n], [12n, 13n]]));
  const known = computed(() =>
    knownPlaces<Location>({
      visitedIds: visitedIds.value,
      currentLocationId: character.value.locationId as bigint,
      connections: connections.value,
      locations: locations.value,
    }),
  );
  const selectedId = ref<bigint | null>(over.selected === undefined ? null : over.selected);
  const select = vi.fn((id: bigint | null) => {
    selectedId.value = id;
  });
  const nowMicros = ref(NOW);
  const cooldowns = ref<Array<{ characterId: bigint; readyAtMicros: bigint }>>([]);
  const connected = ref(true);
  const gathers = ref<unknown[]>([]);
  const feed = createFeedStore();
  feed.setCharacter(CHARACTER);

  let release: () => void = () => {};
  const moveCharacter = vi.fn(
    over.moveImpl ??
      (() =>
        new Promise<void>((done) => {
          release = done;
        })),
  );
  const travelSpy = vi.fn();

  const questRows = over.quests
    ? [
        {
          id: 1n,
          characterId: CHARACTER,
          questTemplateId: 5n,
          progress: 1n,
          completed: false,
          acceptedAt: { microsSinceUnixEpoch: 1n },
          completedAt: null,
        },
      ]
    : [];
  const questTemplates = over.quests
    ? [{ id: 5n, name: XSS, requiredCount: 3n, description: '', npcId: 99n, targetLocationId: 11n, sourceLocationId: null }]
    : [];

  const map = {
    ...createInertMap(),
    ready: ref(true),
    known,
    adjacency: computed(() => adjacencyOf(known.value.edges)),
    cooldowns,
    nowMicros,
    selectedId,
    select,
    npcsAtSelected: ref(over.npcs ?? []),
    selectedApplied,
  } as unknown as MapData;

  const game = {
    ...createInertGame(),
    connected,
    character,
    locations,
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 400n },
    ]),
    gathers,
    quests: ref(questRows),
    questTemplates: ref(questTemplates),
    feed,
    reducers: computed(() => (connected.value ? { moveCharacter } : null)),
  } as unknown as GameData;

  const Host = defineComponent({
    emits: ['travelled'],
    setup(_, { emit, expose }) {
      const destination = useDestination();
      const panel = ref<InstanceType<typeof DetailPanel> | null>(null);
      expose({ panel });
      return () =>
        h(DetailPanel, {
          ref: panel,
          destination,
          onTravelled: () => emit('travelled'),
        });
    },
  });

  wrapper = mount(Host, {
    attachTo: document.body,
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [MAP_KEY as symbol]: map,
        [CONSOLE_KEY as symbol]: { ...createInertConsole(), travel: travelSpy },
      },
    },
  });

  let nextFeed = 1n;
  function systemLine(message: string): void {
    feed.ingest('private', {
      id: nextFeed,
      kind: 'system',
      message,
      createdAt: { microsSinceUnixEpoch: nextFeed * 10n },
      characterId: CHARACTER,
    } as never);
    nextFeed += 1n;
    feed.flush();
  }

  return {
    w: wrapper,
    selectedApplied,
    game,
    map,
    character,
    select,
    selectedId,
    nowMicros,
    cooldowns,
    connected,
    gathers,
    moveCharacter,
    travelSpy,
    systemLine,
    resolveMove: () => release(),
  };
}

const button = (w: VueWrapper) => w.get('button.travel-button');

describe('DetailPanel: populated states', () => {
  it('shows a same-region neighbour in UI-SPEC order', () => {
    const { w } = build({ selected: 11n });
    expect(w.get('.kicker').text()).toBe('Destination');
    const heading = w.get('h4');
    expect(heading.text()).toBe('Gloamwood');
    expect(heading.attributes('tabindex')).toBe('-1');
    expect(w.get('.region-line').text()).toBe('Ashfall Wilds · Lv 3 · visited');
    const tagTexts = w.findAll('.tags li').map((t) => t.text());
    expect(tagTexts).toContain('Woods');
    expect(tagTexts).toContain('Crafting');
    expect(tagTexts.some((t) => t.startsWith('Lv 3'))).toBe(true);
    expect(w.find('.crossing').exists()).toBe(false);
    expect(w.get('.description').text()).toBe('Pines lean over a narrow trail.');
    const grid = w.get('dl.trip').text();
    expect(grid).toContain('Stamina5 stamina');
    expect(grid).toContain('Region travelNone within a region');
    expect(grid).toContain('ServicesNone');
    expect(grid).toContain('PlayersNone');
    expect(w.get('h6').text()).toBe('Can you go?');
    expect(w.findAll('.check').map((c) => c.get('.check-label').text())).toEqual([
      'You have the stamina',
      'Not in combat or gathering',
    ]);
    const order = [
      w.get('.kicker').element,
      heading.element,
      w.get('.region-line').element,
      w.get('.tags').element,
      w.get('.description').element,
      w.get('dl.trip').element,
      w.get('.checklist').element,
      w.get('.footer').element,
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('docks the button and its note below the scrolling body', () => {
    const { w } = build({ selected: 11n });
    const body = w.get('.body').element;
    const footer = w.get('.footer').element;
    expect(body.contains(button(w).element)).toBe(false);
    expect(footer.contains(button(w).element)).toBe(true);
    expect(footer.querySelector('.note')?.textContent).toBe('Arrive instantly');
    expect(button(w).classes()).toContain('btn-primary');
    expect(button(w).findComponent(PhSignpost).exists()).toBe(true);
    expect(button(w).text()).toBe('Travel to Gloamwood');
    expect(button(w).attributes('aria-label')).toBe('Travel to Gloamwood');
    expect(button(w).attributes('title')).toBe('Travel to Gloamwood');
    expect(button(w).attributes('aria-disabled')).toBeUndefined();
  });

  it('shows the Region crossing block and the Cross button for an other-region neighbour', () => {
    const { w } = build({ at: 11n, selected: 20n });
    const block = w.get('.crossing');
    expect(block.text()).toContain('Region crossing');
    expect(block.text()).toContain('Ashfall Wilds');
    expect(block.text()).toContain('Saltmarsh');
    expect(block.get('.sr-only').text()).toBe('to');
    expect(block.findComponent(PhDoorOpen).exists()).toBe(true);
    expect(w.get('dl.trip').text()).toContain('Region travelStarts the region travel timer');
    expect(w.get('dl.trip').text()).toContain('Stamina10 stamina');
    expect(button(w).text()).toBe('Cross into Saltmarsh');
    expect(button(w).findComponent(PhDoorOpen).exists()).toBe(true);
    expect(w.findAll('.check').map((c) => c.attributes('data-check'))).toEqual(['region', 'stamina', 'activity']);
    expect(w.get('[data-check="region"]').get('.check-label').text()).toBe('Region travel ready');
  });

  it('a far place shows the route, the chain and Select first stop as a secondary button', () => {
    const { w } = build({ selected: 13n });
    const headings = w.findAll('h6').map((h6) => h6.text());
    expect(headings).toEqual(['Not directly connected · route']);
    expect(w.findAll('.step .step-name').map((s) => s.text())).toEqual(['Ember Gate', 'Gloamwood', 'Ridge Walk', 'Far Hollow']);
    expect(w.get('.route-note').text()).toBe('3 stops · all within Ashfall Wilds');
    expect(w.find('.checklist').exists()).toBe(false);
    expect(w.get('dl.trip').text()).not.toContain('Stamina');
    expect(w.get('dl.trip').text()).toContain('Services');
    expect(w.get('dl.trip').text()).toContain('Players');
    expect(button(w).classes()).toContain('btn-secondary');
    expect(button(w).classes()).not.toContain('btn-primary');
    expect(button(w).text()).toBe('Select first stop: Gloamwood');
    expect(button(w).findComponent(PhArrowBendUpRight).exists()).toBe(true);
    expect(w.get('.note').text()).toBe('Not next to you. Walk there step by step, or use a teleport ability.');
  });

  it('your own place has no trip stamina, no checklist and no button', () => {
    const { w } = build({ selected: 10n });
    expect(w.get('.kicker').text()).toBe('You are here');
    expect(w.find('.checklist').exists()).toBe(false);
    expect(w.find('button.travel-button').exists()).toBe(false);
    expect(w.find('.footer').exists()).toBe(false);
    const grid = w.get('dl.trip').text();
    expect(grid).not.toContain('Stamina');
    expect(grid).not.toContain('Region travel');
    expect(grid).toContain('Services');
    expect(grid).toContain('Players');
  });

  it('a place with no known path shows only its note', () => {
    const lonely = [
      place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }),
      place(30n, 'Lost Shrine', 1n),
    ];
    const { w } = build({ selected: 30n, locations: lonely, visited: [10n, 30n] });
    expect(w.find('button.travel-button').exists()).toBe(false);
    expect(w.get('.note').text()).toBe('No known path from here.');
  });

  it('lists vendor and banker services, and a related quest card as text', () => {
    const { w } = build({
      selected: 11n,
      quests: true,
      npcs: [
        { npcType: 'vendor', locationId: 11n },
        { npcType: 'banker', locationId: 11n },
      ],
    });
    expect(w.get('.trip-services').text()).toBe('VendorBanker');
    const card = w.get('.quest');
    expect(card.get('.card-kicker').text()).toBe('Quest');
    expect(card.get('.quest-name').text()).toBe(`${XSS} · 1/3`);
    expect(card.get('.quest-role').text()).toBe('Goal here');
    expect(card.get('.quest-name').attributes('title')).toBe(`${XSS} · 1/3`);
    expect(w.find('img').exists()).toBe(false);
  });
});

describe('DetailPanel: the selected place still loading', () => {
  it('leaves Services and Players out until its subscriptions apply, never None (review WR-02)', async () => {
    const { w, selectedApplied } = build({ selected: 11n, peopleApplied: false, npcs: [{ npcType: 'vendor', locationId: 11n }] });
    const grid = w.get('dl.trip');
    expect(grid.text()).toContain('Stamina5 stamina');
    expect(grid.text()).not.toContain('Services');
    expect(grid.text()).not.toContain('Players');
    expect(w.find('.trip-services').exists()).toBe(false);
    expect(w.find('.trip-players').exists()).toBe(false);
    selectedApplied.value = true;
    await nextTick();
    expect(w.get('.trip-services').text()).toBe('Vendor');
    expect(w.get('.trip-players').text()).toBe('None');
  });

  it('a heard-of place still says Unknown until you visit while loading', () => {
    const { w } = build({ selected: 20n, peopleApplied: false });
    expect(w.get('.trip-services').text()).toBe('Unknown until you visit');
    expect(w.find('.trip-players').exists()).toBe(false);
  });
});

describe('DetailPanel: blocked states', () => {
  it('a running region timer blocks Cross with the check row as the reason and the time hidden', async () => {
    const { w, cooldowns, moveCharacter } = build({ at: 11n, selected: 20n });
    cooldowns.value = [{ characterId: CHARACTER, readyAtMicros: BigInt(NOW + 192_000_000) }];
    await nextTick();
    const b = button(w);
    expect(b.attributes('aria-disabled')).toBe('true');
    expect(b.attributes('aria-label')).toBe('Region travel locked for about 4 minutes');
    expect(b.text()).toBe('Region travel in 3:12');
    expect(b.get('.travel-time').attributes('aria-hidden')).toBe('true');
    expect(b.findComponent(PhHourglassMedium).exists()).toBe(true);
    const row = w.get('[data-check="region"]');
    expect(b.attributes('aria-describedby')).toBe(row.attributes('id'));
    expect(row.findComponent(PhHourglassMedium).exists()).toBe(true);
    expect(row.get('[aria-hidden="true"]:not(svg)').text()).toBe('3:12');
    expect(row.get('.sr-only').text()).toBe('about 4 minutes');
    expect(w.find('.footer .note').exists()).toBe(false);
    const trip = w.get('.trip-region');
    expect(trip.text()).toContain('Blocked · 3:12 left');
    expect(trip.get('.sr-only').text()).toBe('Region travel ready in about 4 minutes');
    await b.trigger('click');
    expect(moveCharacter).not.toHaveBeenCalled();
  });

  it('the timer rows follow the server time each second', async () => {
    const { w, cooldowns, nowMicros } = build({ at: 11n, selected: 20n });
    cooldowns.value = [{ characterId: CHARACTER, readyAtMicros: BigInt(NOW + 192_000_000) }];
    await nextTick();
    expect(button(w).text()).toBe('Region travel in 3:12');
    nowMicros.value = NOW + 60_000_000;
    await nextTick();
    expect(button(w).text()).toBe('Region travel in 2:12');
    expect(w.get('[data-check="region"]').text()).toContain('2:12');
  });

  it('short stamina is a BAD row and the button reads Not enough stamina', () => {
    const { w } = build({ stamina: 2n, selected: 11n });
    const b = button(w);
    expect(b.text()).toBe('Not enough stamina');
    expect(b.attributes('aria-disabled')).toBe('true');
    const row = w.get('[data-check="stamina"]');
    expect(b.attributes('aria-describedby')).toBe(row.attributes('id'));
    expect(row.findComponent(PhXCircle).exists()).toBe(true);
    expect(row.get('.check-label').text()).toBe('You are short on stamina');
    expect(row.get('.check-detail').text()).toBe('Needs 5, you have 2.');
  });

  it('gathering is a BAD Activity row', async () => {
    const { w, gathers } = build({ selected: 11n });
    gathers.value = [{ id: 1n }];
    await nextTick();
    expect(button(w).text()).toBe('Finish gathering first');
    expect(w.get('[data-check="activity"]').get('.check-detail').text()).toBe('Finish gathering first.');
  });

  it('OK rows use the check icon', () => {
    const { w } = build({ selected: 11n });
    expect(w.get('[data-check="stamina"]').findComponent(PhCheckCircle).exists()).toBe(true);
  });

  it('offline keeps the label, is aria-disabled with no reason and sends nothing', async () => {
    const { w, connected, moveCharacter } = build({ stamina: 2n, selected: 11n });
    connected.value = false;
    await nextTick();
    const b = button(w);
    expect(b.text()).toBe('Not enough stamina');
    expect(b.attributes('aria-disabled')).toBe('true');
    expect(b.attributes('aria-describedby')).toBeUndefined();
    await b.trigger('click');
    expect(moveCharacter).not.toHaveBeenCalled();
  });
});

describe('DetailPanel: Travel', () => {
  it('calls the move reducer once with object arguments, stays inert while pending and emits travelled', async () => {
    const { w, moveCharacter, travelSpy, resolveMove } = build({ selected: 11n });
    await button(w).trigger('click');
    expect(moveCharacter).toHaveBeenCalledTimes(1);
    expect(moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 11n });
    expect(button(w).attributes('aria-busy')).toBe('true');
    await button(w).trigger('click');
    expect(moveCharacter).toHaveBeenCalledTimes(1);
    expect(w.emitted('travelled')).toBeUndefined();
    resolveMove();
    await vi.waitFor(() => expect(w.emitted('travelled')).toHaveLength(1));
    expect(button(w).attributes('aria-busy')).toBeUndefined();
    expect(travelSpy).not.toHaveBeenCalled();
  });

  it('Cross sends the same reducer for the other region place', async () => {
    const { w, moveCharacter } = build({ at: 11n, selected: 20n, moveImpl: () => Promise.resolve() });
    await button(w).trigger('click');
    expect(moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 20n });
  });

  it('a rejected call shows the send error in the notice line and does not emit travelled', async () => {
    const { w } = build({ selected: 11n, moveImpl: () => Promise.reject(new Error('socket')) });
    await button(w).trigger('click');
    await vi.waitFor(() => expect(w.find('.notice-line').exists()).toBe(true));
    expect(w.get('.notice-line').text()).toBe("Couldn't send that. Try again.");
    expect(w.emitted('travelled')).toBeUndefined();
  });

  it('a private system refusal that arrives after mount shows in the notice line', async () => {
    const { w, systemLine } = build({ selected: 11n });
    expect(w.find('.notice-line').exists()).toBe(false);
    systemLine('You are too tired to travel.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('You are too tired to travel.');
    expect(w.get('.footer').element.contains(w.get('.notice-line').element)).toBe(false);
  });

  it('Select first stop only selects the stop, then focuses the detail heading', async () => {
    const { w, select, moveCharacter, travelSpy } = build({ selected: 13n });
    await button(w).trigger('click');
    await nextTick();
    await nextTick();
    expect(select).toHaveBeenCalledWith(11n);
    expect(moveCharacter).not.toHaveBeenCalled();
    expect(travelSpy).not.toHaveBeenCalled();
    expect(w.get('h4').text()).toBe('Gloamwood');
    expect(document.activeElement).toBe(w.get('h4').element);
  });

  it('focusTitle is exposed', async () => {
    const { w } = build({ selected: 11n });
    (w.vm as unknown as { panel: { focusTitle(): void } }).panel.focusTitle();
    expect(document.activeElement).toBe(w.get('h4').element);
  });

  it('never uses the console travel path in any button state and never prints a party-travel label', async () => {
    const states: Options[] = [
      { selected: 11n },
      { at: 11n, selected: 20n },
      { selected: 13n },
      { selected: 10n },
      { selected: 11n, stamina: 1n },
    ];
    for (const state of states) {
      const rig = build(state);
      const buttons = rig.w.findAll('button');
      for (const b of buttons) await b.trigger('click');
      await nextTick();
      expect(rig.travelSpy).not.toHaveBeenCalled();
      expect(rig.w.text()).not.toMatch(/Travel with party|Travel alone/i);
      wrapper?.unmount();
      wrapper = null;
    }
  });
});

describe('DetailPanel: safety and source', () => {
  it('renders hostile place and description text as text', () => {
    const locations = [
      place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }),
      place(11n, XSS, 1n, { description: XSS }),
    ];
    const { w } = build({ selected: 11n, locations });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('h4').text()).toBe(XSS);
    expect(w.get('.description').text()).toBe(XSS);
    expect(button(w).attributes('aria-label')).toBe(`Travel to ${XSS}`);
  });

  it('has the column structure, the mobile dock rules and token-only colours', () => {
    expect(SOURCE).toContain('Can you go?');
    expect(SOURCE).toContain('Not directly connected · route');
    expect(SOURCE).toContain('NoticeLine');
    expect(SOURCE).toMatch(/min-height:\s*44px/);
    expect(SOURCE).toMatch(/min-height:\s*48px/);
    expect(SOURCE).toMatch(/overflow-y:\s*auto/);
    expect(SOURCE).toMatch(/\.footer\s*\{[^}]*flex:\s*none/);
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SOURCE).not.toMatch(/<svg/);
    expect(SOURCE).not.toMatch(/CONSOLE_KEY|consoleApi/);
  });

  it('mounts bare with an empty column', () => {
    const empty = mount(DetailPanel, {
      props: { destination: { checks: ref(null), detail: ref(null), runner: { pending: ref(new Set()), rejection: ref(0) }, travel: async () => false, selectFirstStop: () => null } as never },
    });
    expect(empty.text()).toBe('');
    empty.unmount();
  });
});
