// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhDoorOpen, PhLockSimple } from '@phosphor-icons/vue';
import ExitChips from './ExitChips.vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { ConsoleApi, GameData } from '../game/context';
import { MAP_KEY, createInertMap } from '../map/mapContext';
import type { MapData } from '../map/mapContext';

// The mobile exit chip strip and its open card (51-UI-SPEC "Mobile (Story screen, 12a A.6)").

const SOURCE = readFileSync(resolve(process.cwd(), 'src/rails/ExitChips.vue'), 'utf8');

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
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
  cooldownSeconds?: number;
  noExits?: boolean;
  ready?: boolean;
  gathering?: boolean;
  followers?: boolean;
  longName?: string;
  /** Mira's (a follower's) region timer, in seconds from the clock's zero. */
  followerCooldownSeconds?: number;
}

function build(options: Options = {}) {
  const base = createInertGame();
  const character = ref({ id: 1n, name: 'Hero', level: 4n, stamina: 50n, locationId: 10n });
  const mira = { id: 2n, name: 'Mira', locationId: 10n, stamina: 50n, online: true };
  const jory = { id: 3n, name: 'Jory', locationId: 10n, stamina: 50n, online: true };
  const game = {
    ...base,
    connected: ref(options.connected ?? true),
    character,
    characterId: ref(1n),
    locations: ref([
      place({ id: 10n, name: 'The Crossing', terrainType: 'town', levelOffset: 1n }),
      place({ id: 11n, name: options.longName ?? 'Gloamwood', levelOffset: 1n }),
      place({ id: 12n, name: 'Brackwater', regionId: 2n, terrainType: 'swamp' }),
      place({ id: 13n, name: 'Harbour', terrainType: 'town', isSafe: true }),
    ]),
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 600n },
    ]),
    connections: ref(
      options.noExits
        ? []
        : [
            { id: 1n, fromLocationId: 10n, toLocationId: 11n },
            { id: 2n, fromLocationId: 10n, toLocationId: 12n },
            { id: 3n, fromLocationId: 10n, toLocationId: 13n },
          ],
    ),
    gathers: ref(options.gathering ? [{ id: 1n }] : []),
    group: ref(options.followers ? { id: 1n, leaderCharacterId: 1n } : null),
    groupMembers: ref(
      options.followers
        ? [
            { characterId: 1n, followLeader: true },
            { characterId: 2n, followLeader: true },
            { characterId: 3n, followLeader: true },
          ]
        : [],
    ),
    knownCharacters: ref(options.followers ? [mira, jory] : []),
  } as unknown as GameData;

  const cooldowns = [
    ...(options.cooldownSeconds !== undefined
      ? [{ characterId: 1n, readyAtMicros: BigInt(options.cooldownSeconds) * 1_000_000n }]
      : []),
    ...(options.followerCooldownSeconds !== undefined
      ? [{ characterId: 2n, readyAtMicros: BigInt(options.followerCooldownSeconds) * 1_000_000n }]
      : []),
  ];
  const map = {
    ...createInertMap(),
    ready: ref(options.ready ?? true),
    cooldowns: ref(cooldowns),
    nowMicros: ref(0),
  } as unknown as MapData;
  const consoleApi = {
    ...createInertConsole(),
    travel: vi.fn(),
  } as unknown as ConsoleApi;

  wrapper = mount(ExitChips, {
    attachTo: document.body,
    global: { provide: { [GAME_KEY as symbol]: game, [MAP_KEY as symbol]: map, [CONSOLE_KEY as symbol]: consoleApi } },
  });
  return { w: wrapper, game, consoleApi, character };
}

const chip = (w: VueWrapper, name: string) =>
  w.findAll('button.chip').find((b) => b.text().includes(name)) ?? w.get('button.no-such-chip');

describe('ExitChips strip', () => {
  it('renders one chip per exit, ordered by name, each with aria-expanded and a ring', () => {
    const { w } = build();
    const chips = w.findAll('ul.strip > li > button.chip');
    expect(chips).toHaveLength(3);
    expect(chips.map((c) => c.get('.chip-name-text').text())).toEqual(['Brackwater', 'Gloamwood', 'Harbour']);
    for (const c of chips) {
      expect(c.attributes('aria-expanded')).toBe('false');
      expect(c.find('.ring svg').exists()).toBe(true);
    }
  });

  it('line 2 is the level and band, Safe, or the lock and clock on a crossing while the timer runs', () => {
    const idle = build();
    expect(chip(idle.w, 'Gloamwood').get('.chip-line').text()).toBe('Lv 3–5 · tough');
    expect(chip(idle.w, 'Harbour').get('.chip-line').text()).toBe('Safe');
    expect(chip(idle.w, 'Gloamwood').get('.chip-line').classes()).toContain('lv-tough');
    wrapper?.unmount();

    const { w } = build({ cooldownSeconds: 192 });
    const marsh = chip(w, 'Brackwater');
    expect(marsh.findComponent(PhLockSimple).exists()).toBe(true);
    expect(marsh.get('.chip-line').text()).toBe('3:12');
    expect(chip(w, 'Gloamwood').get('.chip-line').text()).toBe('Lv 3–5 · tough');
  });

  it('a crossing chip shows the door mark; the others do not', () => {
    const { w } = build();
    expect(chip(w, 'Brackwater').findComponent(PhDoorOpen).exists()).toBe(true);
    expect(chip(w, 'Gloamwood').findComponent(PhDoorOpen).exists()).toBe(false);
  });

  it('the chip aria-label carries the full name', () => {
    const long = 'The Very Long Road Of A Thousand Winding Switchbacks';
    const { w } = build({ longName: long });
    expect(chip(w, long).attributes('aria-label')).toContain(long);
  });

  it('no exits renders nothing; nothing renders before the map data applied', () => {
    const none = build({ noExits: true });
    expect(none.w.find('.strip').exists()).toBe(false);
    expect(none.w.text()).toBe('');
    wrapper?.unmount();
    const loading = build({ ready: false });
    expect(loading.w.find('.strip').exists()).toBe(false);
  });
});

describe('ExitChips card', () => {
  it('opens one card at a time and closes it on a second tap', async () => {
    const { w } = build();
    const gloam = chip(w, 'Gloamwood');
    await gloam.trigger('click');
    expect(gloam.attributes('aria-expanded')).toBe('true');
    expect(w.findAll('.exit-card')).toHaveLength(1);
    expect(gloam.attributes('aria-controls')).toBe(w.get('.exit-card').attributes('id'));

    await chip(w, 'Harbour').trigger('click');
    expect(gloam.attributes('aria-expanded')).toBe('false');
    expect(w.findAll('.exit-card')).toHaveLength(1);
    expect(w.get('.card-name').text()).toBe('Harbour');

    await chip(w, 'Harbour').trigger('click');
    expect(w.find('.exit-card').exists()).toBe(false);
  });

  it('a same-region card: name, terrain line and a Travel to button that travels', async () => {
    const { w, consoleApi } = build();
    await chip(w, 'Gloamwood').trigger('click');
    expect(w.get('.card-name').text()).toBe('Gloamwood');
    expect(w.get('.card-terrain').text()).toBe('Woods · Lv 3–5 · tough');
    expect(w.get('.card-status').text()).toBe('5 stamina');
    const button = w.get('.exit-card button.btn-primary');
    expect(button.text()).toBe('Travel to Gloamwood');
    await button.trigger('click');
    await button.trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledTimes(1);
    expect(consoleApi.travel).toHaveBeenCalledWith({ id: 11n, name: 'Gloamwood' });
  });

  it('a crossing card says where it crosses and starts the timer', async () => {
    const { w, consoleApi } = build();
    await chip(w, 'Brackwater').trigger('click');
    expect(w.get('.card-status').text()).toBe('Crosses into Saltmarsh · starts the region travel timer');
    const button = w.get('.exit-card button.btn-primary');
    expect(button.text()).toBe('Cross into Saltmarsh');
    await button.trigger('click');
    expect(consoleApi.travel).toHaveBeenCalledWith({ id: 12n, name: 'Brackwater' });
  });

  it('while blocked by the timer the card explains and the button is disabled with the clock', async () => {
    const { w, consoleApi } = build({ cooldownSeconds: 192 });
    await chip(w, 'Brackwater').trigger('click');
    const status = w.get('.card-status');
    const button = w.get('.exit-card button.btn-primary');
    expect(status.get('[aria-hidden="true"]').text()).toBe(
      'Region travel ready in 3:12. Moving within Ashfall Wilds is fine.',
    );
    expect(status.get('.sr-only').text()).toBe(
      'Region travel ready in about 4 minutes. Moving within Ashfall Wilds is fine.',
    );
    expect(button.attributes('aria-label')).toBe('Region travel locked for about 4 minutes');
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.text()).toBe('Region travel in 3:12');
    expect(button.attributes('aria-describedby')).toBe(status.attributes('id'));
    await button.trigger('click');
    expect(consoleApi.travel).not.toHaveBeenCalled();
  });

  it("a follower's timer names who waits on the card (review IN-03)", async () => {
    const { w } = build({ followers: true, followerCooldownSeconds: 75 });
    await chip(w, 'Brackwater').trigger('click');
    const status = w.get('.card-status');
    expect(status.get('[aria-hidden="true"]').text()).toBe(
      "Mira can't cross yet. Region travel ready in 1:15. Moving within Ashfall Wilds is fine.",
    );
    expect(status.get('.sr-only').text()).toBe(
      "Mira can't cross yet. Region travel ready in about 2 minutes. Moving within Ashfall Wilds is fine.",
    );
  });

  it('leading with followers appends the count', async () => {
    const { w } = build({ followers: true });
    await chip(w, 'Gloamwood').trigger('click');
    expect(w.get('.card-status').text()).toBe('5 stamina each · 2 following');
    await chip(w, 'Brackwater').trigger('click');
    expect(w.get('.card-status').text()).toBe(
      'Crosses into Saltmarsh · starts the region travel timer · 2 following',
    );
  });

  it('gathering blocks with its reason', async () => {
    const { w } = build({ gathering: true });
    await chip(w, 'Gloamwood').trigger('click');
    expect(w.get('.card-status').text()).toBe('Finish gathering first.');
    expect(w.get('.exit-card button.btn-primary').attributes('aria-disabled')).toBe('true');
  });

  it('offline: the Travel button is disabled and sends nothing', async () => {
    const { w, consoleApi } = build({ connected: false });
    await chip(w, 'Gloamwood').trigger('click');
    const button = w.get('.exit-card button.btn-primary');
    expect(button.attributes('aria-disabled')).toBe('true');
    await button.trigger('click');
    expect(consoleApi.travel).not.toHaveBeenCalled();
  });

  it('closes the card after the character moves', async () => {
    const { w, character } = build();
    await chip(w, 'Gloamwood').trigger('click');
    character.value = { ...character.value, locationId: 11n };
    await nextTick();
    await nextTick();
    expect(w.find('.exit-card').exists()).toBe(false);
  });

  it('focus on the Travel button moves to the first chip of the new place after the trip (review WR-03)', async () => {
    const { w, character } = build();
    await chip(w, 'Gloamwood').trigger('click');
    const travel = w.get('.exit-card button.card-button');
    (travel.element as HTMLElement).focus();
    expect(document.activeElement).toBe(travel.element);
    character.value = { ...character.value, locationId: 11n };
    await nextTick();
    await nextTick();
    await nextTick();
    expect(w.find('.exit-card').exists()).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(w.findAll('button.chip')[0]?.element ?? w.get('.exit-chips').element);
  });

  it('with no exits at the new place focus moves to the strip, never the body', async () => {
    const { w, character, game } = build();
    await chip(w, 'Gloamwood').trigger('click');
    (w.get('.exit-card button.card-button').element as HTMLElement).focus();
    (game.connections as unknown as { value: unknown[] }).value = [];
    character.value = { ...character.value, locationId: 11n };
    await nextTick();
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('.exit-chips').element);
  });

  it('focus outside the strip stays where it was after a move', async () => {
    const { character } = build();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    character.value = { ...character.value, locationId: 11n };
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(outside);
  });

  it('server text stays text', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { w } = build({ longName: payload });
    await chip(w, payload).trigger('click');
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.card-name').text()).toBe(payload);
  });
});

describe('ExitChips source', () => {
  it('sets 44px targets, scrolls sideways and keeps the focus ring', () => {
    expect(SOURCE).toMatch(/overflow-x: auto/);
    expect(SOURCE.match(/min-height: 44px/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(SOURCE).not.toMatch(/all:\s*unset/);
    expect(SOURCE).toMatch(/outline-offset: -2px/);
    expect(SOURCE).not.toMatch(/v-html|COOLDOWN|game\.feed|Date\.now/);
  });
});
