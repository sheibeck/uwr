// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import ContextRail from './ContextRail.vue';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import type { MapData } from '../map/mapContext';

let wrapper: VueWrapper | null = null;

// The map hub has applied: the rail's exit rows render only then (51-10).
const readyMap = { ...createInertMap(), ready: ref(true) } as unknown as MapData;
const provide = (game: GameData) => ({ global: { provide: { [GAME_KEY as symbol]: game, [MAP_KEY as symbol]: readyMap } } });

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('ContextRail with game data', () => {
  it('renders the Here card, Nearby rows, tracked quests and the event card in the rail', () => {
    const game = {
      ...createInertGame(),
      connected: ref(true),
      character: ref({ id: 1n, name: 'Hero', locationId: 10n, level: 6n }),
      characterId: ref(1n),
      locations: ref([
        { id: 10n, name: 'Ember Gate', regionId: 1n, isSafe: false, levelOffset: 0n },
        { id: 11n, name: 'Cinder Road', regionId: 1n, isSafe: false, levelOffset: 0n },
      ]),
      regions: ref([{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 600n }]),
      connections: ref([{ fromLocationId: 10n, toLocationId: 11n }]),
      npcsHere: ref([{ id: 2n, name: 'Marta', npcType: 'vendor' }]),
      quests: ref([
        {
          id: 1n,
          characterId: 1n,
          questTemplateId: 100n,
          progress: 2n,
          completed: false,
          acceptedAt: { microsSinceUnixEpoch: 1n },
        },
      ]),
      questTemplates: ref([{ id: 100n, name: 'Wolf pelts', requiredCount: 5n, description: '' }]),
      worldEvents: ref([
        {
          id: 1n,
          name: 'The Hollowmere Siege',
          regionId: 1n,
          status: 'active',
          deadlineAtMicros: 0n,
          successCounter: 0n,
          failureCounter: 0n,
        },
      ]),
    } as unknown as GameData;
    wrapper = mount(ContextRail, provide(game));

    const rail = wrapper.get('aside.context-rail');
    expect(rail.attributes('aria-label')).toBe('Context');
    expect(rail.get('.card-kicker').text()).toBe('Here · Ashfall Wilds');
    expect(rail.get('button.exit-row').text()).toContain('Cinder Road');
    expect(rail.get('button.exit-row').attributes('aria-expanded')).toBe('false');
    expect(rail.get('.nearby-row .row-name').text()).toBe('Marta');
    expect(rail.get('.quest-count').text()).toBe('2/5');
    expect(rail.get('.event-card .card-title').text()).toBe('The Hollowmere Siege');
  });
});

describe('ContextRail in combat', () => {
  function combatGame(active: ReturnType<typeof ref<boolean>>): GameData {
    const base = createInertGame();
    return {
      ...base,
      connected: ref(true),
      character: ref({ id: 1n, name: 'Hero', locationId: 10n, level: 1n }),
      characterId: ref(1n),
      locations: ref([{ id: 10n, name: 'Ember Gate', regionId: 1n, isSafe: false, levelOffset: 0n }]),
      regions: ref([{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 600n }]),
      combat: { ...base.combat, active },
    } as unknown as GameData;
  }

  it('renders the context content while not in combat', () => {
    const game = combatGame(ref(false));
    wrapper = mount(ContextRail, provide(game));
    expect(wrapper.find('section.encounter-panel').exists()).toBe(false);
    expect(wrapper.get('.card-kicker').text()).toBe('Here · Ashfall Wilds');
  });

  it('swaps to the Encounter panel while in combat and back when the fight ends', async () => {
    const active = ref(true);
    const game = combatGame(active);
    wrapper = mount(ContextRail, provide(game));
    const rail = wrapper.get('aside.context-rail');
    expect(rail.find('section.encounter-panel').exists()).toBe(true);
    expect(rail.find('.card-kicker').exists()).toBe(false);
    expect(rail.text()).not.toContain('Nearby');
    expect(rail.text()).not.toContain('Tracking');

    active.value = false;
    await wrapper.vm.$nextTick();
    expect(rail.find('section.encounter-panel').exists()).toBe(false);
    expect(rail.get('.card-kicker').text()).toBe('Here · Ashfall Wilds');
  });
});
