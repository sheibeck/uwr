// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhHourglassMedium, PhMapPin } from '@phosphor-icons/vue';
import LocationRow from './LocationRow.vue';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import type { MapData } from '../map/mapContext';
import type { TravelTimer } from '../map/travelTimer';

// The mobile location line (51-UI-SPEC "Mobile (Story screen, 12a A.6)"): pin, place, terrain and
// level in its band colour, and the region travel timer while it runs. No time of day (the desktop
// header keeps it).

const SOURCE = readFileSync(resolve(process.cwd(), 'src/frame/LocationRow.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

interface Options {
  terrainType?: string;
  isSafe?: boolean;
  levelOffset?: bigint;
  timer?: TravelTimer;
  withPlace?: boolean;
  name?: string;
}

function build(options: Options = {}) {
  const game = {
    ...createInertGame(),
    character: ref(options.withPlace === false ? null : { id: 1n, name: 'Hero', level: 4n, locationId: 10n }),
    locations: ref([
      {
        id: 10n,
        name: 'The Crossing',
        description: '',
        regionId: 1n,
        isSafe: options.isSafe ?? false,
        levelOffset: options.levelOffset ?? 1n,
        terrainType: options.terrainType ?? 'woods',
        bindStone: false,
        craftingAvailable: false,
      },
    ]),
    regions: ref([{ id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 200n }]),
  } as unknown as GameData;
  const map = {
    ...createInertMap(),
    selfTimer: ref(options.timer ?? { running: false, secondsLeft: 0 }),
  } as unknown as MapData;
  wrapper = mount(LocationRow, {
    props: { locationName: options.name ?? 'The Crossing' },
    global: { provide: { [GAME_KEY as symbol]: game, [MAP_KEY as symbol]: map } },
  });
  return wrapper;
}

describe('LocationRow', () => {
  it('shows the pin, the place with its full name in title, the terrain and the level in its band colour', () => {
    const w = build();
    expect(w.findComponent(PhMapPin).exists()).toBe(true);
    expect(w.get('.name').text()).toBe('The Crossing');
    expect(w.get('.name').attributes('title')).toBe('The Crossing');
    expect(w.get('.terrain').text()).toBe('· Woods ·');
    const level = w.get('.level');
    expect(level.text()).toBe('Lv 2–4');
    expect(level.classes()).toContain('lv-even');
  });

  it('shows Safe for a safe place and Danger unknown for an uncharted one', () => {
    const safe = build({ isSafe: true, terrainType: 'town' });
    expect(safe.get('.level').text()).toBe('Safe');
    expect(safe.get('.level').classes()).toContain('lv-safe');
    wrapper?.unmount();
    const unknown = build({ terrainType: 'uncharted' });
    expect(unknown.get('.terrain').text()).toBe('· Uncharted ·');
    expect(unknown.get('.level').text()).toBe('Danger unknown');
    expect(unknown.get('.level').classes()).toContain('lv-unknown');
  });

  it('an unknown terrain keeps the pin icon and its own word', () => {
    const w = build({ terrainType: 'glacier' });
    expect(w.get('.terrain').text()).toBe('· Glacier ·');
  });

  it('shows the timer right-aligned only while it runs, with a screen reader twin', () => {
    const idle = build();
    expect(idle.find('.timer').exists()).toBe(false);
    expect(idle.find('.sr-only').exists()).toBe(false);
    wrapper?.unmount();

    const w = build({ timer: { running: true, secondsLeft: 192 } });
    const timer = w.get('.timer');
    expect(timer.findComponent(PhHourglassMedium).exists()).toBe(true);
    expect(timer.get('[aria-hidden="true"]:not(svg)').text()).toBe('3:12');
    expect(w.get('.sr-only').text()).toBe('Region travel ready in about 4 minutes');
  });

  it('with no place data only the pin and the name render', () => {
    const w = build({ withPlace: false, name: 'Ember Gate' });
    expect(w.get('.name').text()).toBe('Ember Gate');
    expect(w.find('.terrain').exists()).toBe(false);
    expect(w.find('.level').exists()).toBe(false);
  });

  it('renders no time of day and declares only the locationName prop', () => {
    const w = build();
    expect(w.text()).not.toContain('Day');
    expect(w.text()).not.toContain('Night');
    expect(Object.keys((LocationRow as unknown as { props: Record<string, unknown> }).props)).toEqual(['locationName']);
  });

  it('puts server text in text nodes only', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const w = build({ name: payload });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.name').text()).toBe(payload);
  });

  it('has the spec padding, ellipsizes the name first and never uses v-html', () => {
    expect(SOURCE).toMatch(/padding: 8px 16px 4px/);
    expect(SOURCE).toMatch(/text-overflow: ellipsis/);
    expect(SOURCE).not.toMatch(/v-html/);
  });
});
