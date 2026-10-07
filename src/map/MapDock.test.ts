// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PhArrowBendUpRight, PhDoorOpen, PhSignpost, PhWarningCircle } from '@phosphor-icons/vue';
import { createFeedStore } from '../console/feedStore';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import type { Location } from '../module_bindings/types';
import MapDock from './MapDock.vue';
import { knownPlaces } from './knownPlaces';
import { MAP_KEY, createInertMap } from './mapContext';
import type { MapData } from './mapContext';
import { adjacencyOf } from './route';
import { useDestination } from './useDestination';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/map/MapDock.vue'), 'utf8');
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
    setup(_, { expose }) {
      const destination = useDestination();
      const dock = ref<InstanceType<typeof MapDock> | null>(null);
      expose({ focusName: () => dock.value?.focusName() });
      return () => h(MapDock, { ref: dock, destination });
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
const toggle = (w: VueWrapper) => w.get('button.details-toggle');

/** What a screen reader reads: the text with every aria-hidden subtree removed, spaces collapsed. */
function spokenText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const hidden of [...clone.querySelectorAll('[aria-hidden="true"]')]) hidden.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('MapDock: populated states', () => {
  it('shows a same-region neighbour in the UI-SPEC order', () => {
    const { w } = build({ selected: 11n });
    expect(w.get('.dock-name').text()).toBe('Gloamwood');
    expect(w.get('.dock-name').attributes('tabindex')).toBe('-1');
    expect(w.find('h4').exists()).toBe(false);
    expect(w.get('.dock-region').text()).toBe('Ashfall Wilds · Lv 3 · visited');
    expect(w.findAll('.tags li').map((t) => t.text())).toContain('Woods');
    expect(w.find('.crossing').exists()).toBe(false);
    expect(w.get('.trip-line').text()).toBe('5 stamina · None within a region');
    expect(w.find('.fail-line').exists()).toBe(false);
    expect(button(w).text()).toBe('Travel to Gloamwood');
    expect(button(w).classes()).toContain('btn-primary');
    expect(button(w).findComponent(PhSignpost).exists()).toBe(true);
    expect(w.get('.note').text()).toBe('Arrive instantly');
    const order = [
      w.get('.head').element,
      w.get('.tags').element,
      w.get('.trip-line').element,
      button(w).element,
      w.get('.note').element,
      toggle(w).element,
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('a crossing shows the Crossing into line with the door icon and the region level', () => {
    const { w } = build({ at: 11n, selected: 20n });
    const crossing = w.get('.crossing');
    expect(crossing.text()).toMatch(/^Crossing into Saltmarsh · (Lv \d+(–\d+)?|Safe)$/);
    expect(crossing.findComponent(PhDoorOpen).exists()).toBe(true);
    expect(crossing.get('.crossing-icon').attributes('aria-hidden')).toBe('true');
    expect(w.get('.trip-line').text()).toBe('10 stamina · Starts the region travel timer');
    expect(button(w).text()).toBe('Cross into Saltmarsh');
  });

  it('a far place shows the route note only and Select first stop', () => {
    const { w } = build({ selected: 13n });
    expect(w.get('.route-note').text()).toBe('3 stops · all within Ashfall Wilds');
    expect(w.find('.trip-line').exists()).toBe(false);
    expect(w.find('.fail-line').exists()).toBe(false);
    expect(button(w).text()).toBe('Select first stop: Gloamwood');
    expect(button(w).classes()).toContain('btn-secondary');
    expect(button(w).findComponent(PhArrowBendUpRight).exists()).toBe(true);
    expect(w.get('.note').text()).toBe('Not next to you. Walk there step by step, or use a teleport ability.');
  });

  it('your own place has no button, no trip line and no fail line', () => {
    const { w } = build({ selected: 10n });
    expect(w.get('.dock-name').text()).toBe('Ember Gate');
    expect(w.find('button.travel-button').exists()).toBe(false);
    expect(w.find('.trip-line').exists()).toBe(false);
    expect(w.find('.fail-line').exists()).toBe(false);
    expect(w.find('button.details-toggle').exists()).toBe(true);
  });

  it('a place with no known path shows its note and no button', () => {
    const lonely = [place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }), place(30n, 'Lost Shrine', 1n)];
    const { w } = build({ selected: 30n, locations: lonely, visited: [10n, 30n] });
    expect(w.find('button.travel-button').exists()).toBe(false);
    expect(w.get('.note').text()).toBe('No known path from here.');
  });
});

describe('MapDock: the fail line and blocked states', () => {
  it('a running region timer shows the WAIT fail line and the disabled timer button', async () => {
    const { w, cooldowns, moveCharacter } = build({ at: 11n, selected: 20n });
    cooldowns.value = [{ characterId: CHARACTER, readyAtMicros: BigInt(NOW + 192_000_000) }];
    await nextTick();
    const fail = w.get('.fail-line');
    expect(fail.text()).toBe('Region travel cooling down');
    expect(fail.classes()).toContain('wait');
    expect(fail.findComponent(PhWarningCircle).exists()).toBe(true);
    const b = button(w);
    expect(b.text()).toBe('Region travel in 3:12');
    expect(b.attributes('aria-disabled')).toBe('true');
    expect(b.attributes('aria-label')).toBe('Region travel locked for about 4 minutes');
    expect(b.get('.travel-time').attributes('aria-hidden')).toBe('true');
    expect(b.attributes('aria-describedby')).toBe(fail.attributes('id'));
    expect(w.get('.trip-line').text()).toContain('Blocked · 3:12 left');
    // review WR-04: the whole visible phrase is hidden, never 'Blocked ·  left'
    expect(spokenText(w.get('.trip-line').element)).toBe('10 stamina · Region travel ready in about 4 minutes');
    await b.trigger('click');
    expect(moveCharacter).not.toHaveBeenCalled();
  });

  it('short stamina is a BAD fail line', () => {
    const { w } = build({ stamina: 2n, selected: 11n });
    expect(w.get('.fail-line').text()).toBe('You are short on stamina');
    expect(w.get('.fail-line').classes()).toContain('bad');
    expect(button(w).text()).toBe('Not enough stamina');
  });

  it('two failing checks join with a middle dot', async () => {
    const { w, gathers } = build({ stamina: 2n, selected: 11n });
    gathers.value = [{ id: 1n }];
    await nextTick();
    expect(w.get('.fail-line').text()).toBe('You are short on stamina · Gathering');
  });

  it('offline keeps the label, disables the button and sends nothing', async () => {
    const { w, connected, moveCharacter } = build({ selected: 11n });
    connected.value = false;
    await nextTick();
    expect(button(w).text()).toBe('Travel to Gloamwood');
    expect(button(w).attributes('aria-disabled')).toBe('true');
    expect(w.find('.note').exists()).toBe(false);
    await button(w).trigger('click');
    expect(moveCharacter).not.toHaveBeenCalled();
  });
});

describe('MapDock: the Details disclosure', () => {
  it('leaves Services and Players out until the selected place has applied, never None (review WR-02)', async () => {
    const { w, selectedApplied } = build({ selected: 11n, peopleApplied: false, npcs: [{ npcType: 'vendor', locationId: 11n }] });
    await toggle(w).trigger('click');
    expect(w.find('.facts-services').exists()).toBe(false);
    expect(w.find('.facts-players').exists()).toBe(false);
    expect(w.get('.details').text()).not.toContain('None');
    selectedApplied.value = true;
    await nextTick();
    expect(w.get('.facts-services').text()).toBe('Vendor');
    expect(w.get('.facts-players').text()).toBe('None');
  });

  it('is closed to start and reveals the description, Services, Players and quests', async () => {
    const { w } = build({
      selected: 11n,
      quests: true,
      npcs: [{ npcType: 'vendor', locationId: 11n }],
    });
    expect(toggle(w).attributes('aria-expanded')).toBe('false');
    expect(toggle(w).text()).toBe('Details');
    expect(w.find('.details').exists()).toBe(false);
    await toggle(w).trigger('click');
    expect(toggle(w).attributes('aria-expanded')).toBe('true');
    expect(toggle(w).attributes('aria-controls')).toBe(w.get('.details').attributes('id'));
    expect(w.get('.description').text()).toBe('Pines lean over a narrow trail.');
    expect(w.get('.facts-services').text()).toBe('Vendor');
    expect(w.get('.facts-players').text()).toBe('None');
    const card = w.get('.quest');
    expect(card.get('.quest-name').text()).toBe(`${XSS} · 1/3`);
    expect(card.get('.quest-role').text()).toBe('Goal here');
    expect(w.find('img').exists()).toBe(false);
    await toggle(w).trigger('click');
    expect(w.find('.details').exists()).toBe(false);
  });

  it('shows only the parts that are present', async () => {
    const { w } = build({ selected: 12n });
    await toggle(w).trigger('click');
    expect(w.find('.description').exists()).toBe(false);
    expect(w.find('.quests').exists()).toBe(false);
    expect(w.find('.facts').exists()).toBe(true);
  });
});

describe('MapDock: Travel', () => {
  it('calls the move reducer once through the shared runner and stays inert while pending', async () => {
    const { w, moveCharacter, travelSpy, resolveMove } = build({ selected: 11n });
    await button(w).trigger('click');
    expect(moveCharacter).toHaveBeenCalledTimes(1);
    expect(moveCharacter).toHaveBeenCalledWith({ characterId: 1n, locationId: 11n });
    expect(button(w).attributes('aria-busy')).toBe('true');
    await button(w).trigger('click');
    expect(moveCharacter).toHaveBeenCalledTimes(1);
    resolveMove();
    await vi.waitFor(() => expect(button(w).attributes('aria-busy')).toBeUndefined());
    expect(travelSpy).not.toHaveBeenCalled();
  });

  it('Select first stop only selects the stop and focuses the place name', async () => {
    const { w, select, moveCharacter } = build({ selected: 13n });
    await button(w).trigger('click');
    await nextTick();
    await nextTick();
    expect(select).toHaveBeenCalledWith(11n);
    expect(moveCharacter).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(w.get('.dock-name').element);
  });

  it('focusName puts focus on the place name', () => {
    const { w } = build({ selected: 11n });
    (w.vm as unknown as { focusName(): void }).focusName();
    expect(document.activeElement).toBe(w.get('.dock-name').element);
  });
});

describe('MapDock: safety and layout', () => {
  it('renders a hostile place name as text', () => {
    const locations = [
      place(10n, 'Ember Gate', 1n, { terrainType: 'town', isSafe: true }),
      place(11n, XSS, 1n, { description: XSS }),
    ];
    const { w } = build({ selected: 11n, locations, visited: [10n, 11n] });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.dock-name').text()).toBe(XSS);
    expect(button(w).text()).toBe(`Travel to ${XSS}`);
  });

  it('source: the dock surface, the 48px button, the wrapping name and the shared destination', () => {
    expect(SOURCE).toMatch(/\.dock \{[^}]*background: var\(--color-surface\);/);
    expect(SOURCE).toMatch(/\.dock \{[^}]*box-shadow: var\(--shadow-md\);/);
    expect(SOURCE).toMatch(/\.dock \{[^}]*border-radius: var\(--radius-lg\);/);
    expect(SOURCE).toMatch(/\.dock \{[^}]*padding: 16px;/);
    expect(SOURCE).toMatch(/\.dock \{[^}]*gap: 8px;/);
    expect(SOURCE).toMatch(/\.travel-button \{[^}]*min-height: 48px;/);
    expect(SOURCE).toMatch(/\.details-toggle \{[^}]*min-height: 44px;/);
    expect(SOURCE).toMatch(/\.dock-name \{[^}]*overflow-wrap: anywhere;/);
    expect(SOURCE).toContain('destination');
    expect(SOURCE).not.toContain('moveCharacter');
    expect(SOURCE).not.toContain('v-html');
    expect(SOURCE).not.toMatch(/<h[1-6]/);
  });
});
