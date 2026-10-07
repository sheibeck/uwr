// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhHourglassMedium } from '@phosphor-icons/vue';
import HereCard from './HereCard.vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { ConsoleApi, GameData } from '../game/context';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import type { MapData } from '../map/mapContext';
import type { TravelTimer } from '../map/travelTimer';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/rails/HereCard.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function place(over: Record<string, unknown>) {
  return {
    description: '',
    zone: '',
    regionId: 1n,
    levelOffset: 0n,
    isSafe: false,
    terrainType: 'woods',
    bindStone: false,
    craftingAvailable: false,
    ...over,
  };
}

interface Options {
  connected?: boolean;
  timer?: TravelTimer;
  cooldownSeconds?: number;
  characterLocation?: bigint;
  description?: string;
  withCharacter?: boolean;
  noExits?: boolean;
  ready?: boolean;
  gathering?: boolean;
  heardOf?: Set<bigint>;
}

function build(options: Options = {}) {
  const base = createInertGame();
  const character = ref({ id: 1n, name: 'Hero', level: 4n, stamina: 50n, locationId: options.characterLocation ?? 10n });
  const game = {
    ...base,
    connected: ref(options.connected ?? true),
    character: options.withCharacter === false ? ref(null) : character,
    characterId: ref(1n),
    locations: ref([
      place({ id: 10n, name: 'The Crossing', terrainType: 'town', levelOffset: 1n }),
      place({ id: 11n, name: 'Gloamwood', description: options.description ?? '', bindStone: true }),
      place({ id: 12n, name: 'Brackwater', regionId: 2n, terrainType: 'swamp', levelOffset: 1n }),
      place({ id: 13n, name: 'Harbour', regionId: 1n, terrainType: 'town', isSafe: true }),
    ]),
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 200n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 600n },
    ]),
    connections: ref(
      options.noExits
        ? []
        : [
            { id: 1n, fromLocationId: 10n, toLocationId: 11n },
            { id: 2n, fromLocationId: 10n, toLocationId: 12n },
            { id: 3n, fromLocationId: 11n, toLocationId: 13n },
          ],
    ),
    gathers: ref(options.gathering ? [{ id: 1n }] : []),
  } as unknown as GameData;

  const timer = options.timer ?? { running: false, secondsLeft: 0 };
  const cooldowns =
    options.cooldownSeconds !== undefined
      ? [{ characterId: 1n, readyAtMicros: BigInt(options.cooldownSeconds) * 1_000_000n }]
      : [];
  const map = {
    ...createInertMap(),
    ready: ref(options.ready ?? true),
    selfTimer: ref(timer),
    cooldowns: ref(cooldowns),
    nowMicros: ref(0),
    known: ref({ visited: new Set(), heardOf: options.heardOf ?? new Set(), drawn: [], knownRegionIds: [], edges: [] }),
  } as unknown as MapData;

  const consoleApi = {
    ...createInertConsole(),
    travel: vi.fn(),
    examine: vi.fn(),
    look: vi.fn(),
  } as unknown as ConsoleApi;

  wrapper = mount(HereCard, {
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: game, [MAP_KEY as symbol]: map, [CONSOLE_KEY as symbol]: consoleApi } },
  });
  return { w: wrapper, game, map, consoleApi, character };
}

const rowButton = (w: VueWrapper, name: string) =>
  w.findAll('button.exit-row').find((b) => b.text().includes(name)) ?? w.get('button.no-such-row');

describe('HereCard header', () => {
  it('kicker, title with the Examine eye, and the sub-line in its band colour', async () => {
    const { w, consoleApi } = build();
    expect(w.get('.card-kicker').text()).toBe('Here · Ashfall Wilds');
    expect(w.get('.card-title').text()).toBe('The Crossing');
    expect(w.get('.card-title').attributes('title')).toBe('The Crossing');
    expect(w.get('.card-title').attributes('tabindex')).toBe('-1');
    const eye = w.get('.title-row [aria-label="Examine The Crossing"]');
    await eye.trigger('click');
    expect(consoleApi.look).toHaveBeenCalledTimes(1);
    expect(consoleApi.examine).not.toHaveBeenCalled();

    const sub = w.get('.sub-line');
    expect(sub.text()).toBe('Town · Lv 2–4 · even');
    expect(sub.get('.sub-danger').classes()).toContain('lv-even');
  });

  it('shows the timer chip only while the timer runs', () => {
    const idle = build();
    expect(idle.w.find('.timer-chip').exists()).toBe(false);
    wrapper?.unmount();

    const { w } = build({ timer: { running: true, secondsLeft: 192 } });
    const chip = w.get('.timer-chip');
    expect(chip.attributes('title')).toBe('Region travel timer');
    expect(chip.findComponent(PhHourglassMedium).exists()).toBe(true);
    expect(chip.get('[aria-hidden="true"]:not(svg)').text()).toBe('3:12');
    expect(chip.get('.sr-only').text()).toBe('Region travel ready in about 4 minutes');
  });

  it('safe places read Safe and uncharted places Danger unknown', async () => {
    const { w, game } = build();
    const places = game.locations as unknown as Ref<Array<Record<string, unknown>>>;
    places.value[0].isSafe = true;
    places.value = [...places.value];
    await nextTick();
    expect(w.get('.sub-line').text()).toBe('Town · Safe');
    places.value[0].terrainType = 'uncharted';
    places.value = [...places.value];
    await nextTick();
    expect(w.get('.sub-line').text()).toBe('Uncharted · Danger unknown');
  });

  it('an uncharted exit fills its right-hand column with Danger unknown (review IN-08)', async () => {
    const { w, game } = build();
    const places = game.locations as unknown as Ref<Array<Record<string, unknown>>>;
    places.value[1].terrainType = 'uncharted';
    places.value = [...places.value];
    await nextTick();
    const right = rowButton(w, 'Gloamwood').get('.exit-right');
    expect(right.text()).toBe('Danger unknown');
    expect(right.classes()).toContain('lv-unknown');
  });
});

describe('HereCard exits', () => {
  it('lists every exit ordered by name with a closed row and its own Examine eye', () => {
    const { w } = build();
    const items = w.findAll('li.exit');
    expect(items.map((li) => li.get('.exit-name').text())).toEqual(['Brackwater', 'Gloamwood']);
    for (const li of items) {
      expect(li.get('button.exit-row').attributes('aria-expanded')).toBe('false');
      const eye = li.get('button.btn-eye');
      expect(eye.element.closest('button.exit-row')).toBeNull();
    }
    expect(items[0].get('button.btn-eye').attributes('aria-label')).toBe('Examine Brackwater');
    expect(items[0].get('.exit-suffix').text()).toBe('· Saltmarsh');
    expect(items[0].get('.exit-right').text()).toBe('Lv 6–8');
    expect(items[1].find('.exit-suffix').exists()).toBe(false);
    expect(items[1].get('.exit-right').text()).toBe('Lv 2');
  });

  it('an exit eye examines the neighbour by name', async () => {
    const { w, consoleApi } = build();
    await w.get('[aria-label="Examine Gloamwood"]').trigger('click');
    expect(consoleApi.examine).toHaveBeenCalledWith('Gloamwood');
  });

  it('a row click expands it, closes the previous one and never travels', async () => {
    const { w, consoleApi } = build();
    const gloam = rowButton(w, 'Gloamwood');
    await gloam.trigger('click');
    expect(gloam.attributes('aria-expanded')).toBe('true');
    const panelId = gloam.attributes('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = w.get(`#${panelId}`);
    expect(panel.text()).toContain('Woods · 5 stamina · Bind stone');
    expect(panel.get('button.btn-primary').text()).toBe('Travel');

    const marsh = rowButton(w, 'Brackwater');
    await marsh.trigger('click');
    expect(marsh.attributes('aria-expanded')).toBe('true');
    expect(gloam.attributes('aria-expanded')).toBe('false');
    expect(w.findAll('[aria-expanded="true"]')).toHaveLength(1);

    await marsh.trigger('click');
    expect(marsh.attributes('aria-expanded')).toBe('false');
    expect(w.find('.exit-panel').exists()).toBe(false);
    expect(consoleApi.travel).not.toHaveBeenCalled();
  });

  it('the open Travel button travels through the console once', async () => {
    const { w, consoleApi } = build();
    await rowButton(w, 'Gloamwood').trigger('click');
    const button = w.get('.exit-panel button.btn-primary');
    expect(button.attributes('aria-label')).toBe('Travel to Gloamwood');
    expect(button.attributes('aria-busy')).toBeUndefined();
    await button.trigger('click');
    expect(button.attributes('aria-busy')).toBe('true');
    await button.trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledTimes(1);
    expect(consoleApi.travel).toHaveBeenCalledWith({ id: 11n, name: 'Gloamwood' });
  });

  it('a crossing shows Cross with the region in its label and the accent note', async () => {
    const { w, consoleApi } = build();
    await rowButton(w, 'Brackwater').trigger('click');
    const panel = w.get('.exit-panel');
    expect(panel.get('.note').text()).toBe('New region · 10 stamina · starts the region travel timer');
    const button = panel.get('button.btn-primary');
    expect(button.text()).toBe('Cross');
    expect(button.attributes('aria-label')).toBe('Cross into Saltmarsh');
    await button.trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledWith({ id: 12n, name: 'Brackwater' });
  });

  it('while the timer runs the crossing is locked, disabled, shows the clock and is described by the note', async () => {
    const { w, consoleApi } = build({ timer: { running: true, secondsLeft: 192 }, cooldownSeconds: 192 });
    const marsh = rowButton(w, 'Brackwater');
    expect(marsh.get('.exit-right').text()).toBe('3:12');
    await marsh.trigger('click');
    const panel = w.get('.exit-panel');
    expect(panel.get('.note').text()).toContain('Region travel in');
    expect(panel.get('.note').text()).toContain('3:12');
    expect(panel.get('.note .sr-only').text()).toBe('Region travel ready in about 4 minutes');
    // the visible phrase is hidden as a whole, so the sentence is not read after 'Region travel in'
    const spoken = panel.get('.note').element.cloneNode(true) as Element;
    for (const hidden of [...spoken.querySelectorAll('[aria-hidden="true"]')]) hidden.remove();
    expect((spoken.textContent ?? '').trim()).toBe('Region travel ready in about 4 minutes');
    const button = panel.get('button.btn-primary');
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.text()).toContain('3:12');
    expect(button.attributes('aria-describedby')).toBe(panel.get('.note').attributes('id'));
    await button.trigger('click');
    expect(consoleApi.travel).not.toHaveBeenCalled();
  });

  it('gathering blocks travel and says why', async () => {
    const { w, consoleApi } = build({ gathering: true });
    await rowButton(w, 'Gloamwood').trigger('click');
    const panel = w.get('.exit-panel');
    expect(panel.get('.note').text()).toBe('Finish gathering first.');
    expect(panel.get('button.btn-primary').attributes('aria-disabled')).toBe('true');
    await panel.get('button.btn-primary').trigger('click');
    expect(consoleApi.travel).not.toHaveBeenCalled();
  });

  it('offline: every button is aria-disabled and sends nothing', async () => {
    const { w, consoleApi } = build({ connected: false });
    await rowButton(w, 'Gloamwood').trigger('click');
    const button = w.get('.exit-panel button.btn-primary');
    expect(button.attributes('aria-disabled')).toBe('true');
    await button.trigger('click');
    await w.get('[aria-label="Examine Gloamwood"]').trigger('click');
    await w.get('[aria-label="Examine The Crossing"]').trigger('click');
    expect(consoleApi.travel).not.toHaveBeenCalled();
    expect(consoleApi.examine).not.toHaveBeenCalled();
    expect(consoleApi.look).not.toHaveBeenCalled();
    expect(w.get('[aria-label="Examine Gloamwood"]').attributes('aria-disabled')).toBe('true');
  });

  it('a heard-of exit looks like a visited one and says so in its note', async () => {
    const { w } = build({ heardOf: new Set([11n]) });
    await rowButton(w, 'Gloamwood').trigger('click');
    expect(w.get('.exit-panel .note').text()).toContain('Woods · heard of · 5 stamina');
  });

  it('after the character moves every row is closed and focus inside the card moves to the title', async () => {
    const { w, character } = build();
    const gloam = rowButton(w, 'Gloamwood');
    await gloam.trigger('click');
    (gloam.element as HTMLElement).focus();
    expect(document.activeElement).toBe(gloam.element);

    character.value = { ...character.value, locationId: 11n };
    await nextTick();
    await nextTick();
    await nextTick();
    expect(w.get('.card-title').text()).toBe('Gloamwood');
    expect(w.findAll('[aria-expanded="true"]')).toHaveLength(0);
    expect(document.activeElement).toBe(w.get('.card-title').element);
  });

  it('focus outside the card stays where it was after a move', async () => {
    const { w, character } = build();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    character.value = { ...character.value, locationId: 11n };
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(outside);
    expect(w.get('.card-title').text()).toBe('Gloamwood');
  });
});

describe('HereCard empty and loading states', () => {
  it('no exits: No known routes.', () => {
    const { w } = build({ noExits: true });
    expect(w.get('.empty').text()).toBe('No known routes.');
    expect(w.find('ul.exits').exists()).toBe(false);
  });

  it('no character: Your location appears here.', () => {
    const { w } = build({ withCharacter: false });
    expect(w.text()).toContain('Your location appears here.');
    expect(w.find('.card-kicker').exists()).toBe(false);
  });

  it('nothing renders under the title before the map data has applied', () => {
    const { w } = build({ ready: false });
    expect(w.get('.card-kicker').text()).toBe('Here · Ashfall Wilds');
    expect(w.find('ul.exits').exists()).toBe(false);
    expect(w.text()).not.toContain('No known routes.');
  });
});

describe('HereCard text safety', () => {
  it('a description with an img onerror payload stays text in the row title', () => {
    const payload = '<img src=x onerror="alert(1)">';
    const { w } = build({ description: payload });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.exit-row[title]').attributes('title')).toBe(payload);
  });
});

describe('HereCard source', () => {
  it('keeps the focus ring wherever a control is reset and sets the row sizes', () => {
    expect(SOURCE).not.toMatch(/all:\s*unset/);
    expect(SOURCE).toMatch(/min-height: 32px/);
    expect(SOURCE).toMatch(/min-height: 44px/);
    expect(SOURCE).toMatch(/padding: 0 8px 8px 32px/);
    expect(SOURCE).toMatch(/outline-offset: -2px/);
    expect(SOURCE).not.toMatch(/v-html/);
  });

  it('never makes its own feed lines or a fixed timer duration', () => {
    expect(SOURCE).not.toMatch(/COOLDOWN|game\.feed|Date\.now/);
  });
});
