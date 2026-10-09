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

// The mobile exit chip strip and its open card (51-UI-SPEC "Mobile (Story screen, 12a A.6)"; 51.3.1.1
// UI-SPEC "Rating Marks" and "Exits, Here card and mobile chips": short name over rating and range).

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
    shortName: '',
    ...over,
  };
}

// Gloamwood: Stable at Lv 3-5 (gap 1 for the level-4 hero): Risky. Brackwater: Overrun at Lv 6: Deadly.
function pools(longRange: boolean) {
  return [
    { id: 1n, regionId: 1n, locationId: 11n, kind: 'creature', level: longRange ? 3n : 2n, lvLo: longRange ? 12n : 3n, lvHi: longRange ? 14n : 5n },
    { id: 2n, regionId: 2n, locationId: 12n, kind: 'creature', level: 3n, lvLo: 6n, lvHi: 6n },
  ];
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
  shortName?: string;
  /** Places whose pool rows have applied (default: every place). */
  applied?: Set<bigint>;
  /** Gloamwood's family at Lv 12-14, Overrun (Deadly). */
  longRange?: boolean;
  /** Exits to build instead of the three default ones (all same-region woods). */
  exitCount?: number;
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
      place({ id: 11n, name: options.longName ?? 'Gloamwood', levelOffset: 1n, shortName: options.shortName ?? '' }),
      place({ id: 12n, name: 'Brackwater', regionId: 2n, terrainType: 'swamp' }),
      place({ id: 13n, name: 'Harbour', terrainType: 'town', isSafe: true }),
      ...Array.from({ length: options.exitCount ?? 0 }, (_, i) =>
        place({ id: BigInt(20 + i), name: `Wayside Hollow Number ${i + 1}` }),
      ),
    ]),
    regions: ref([
      { id: 1n, name: 'Ashfall Wilds', dangerMultiplier: 300n },
      { id: 2n, name: 'Saltmarsh', dangerMultiplier: 600n },
    ]),
    connections: ref(
      options.noExits
        ? []
        : options.exitCount !== undefined
          ? Array.from({ length: options.exitCount }, (_, i) => ({
              id: BigInt(100 + i),
              fromLocationId: 10n,
              toLocationId: BigInt(20 + i),
            }))
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
    poolLevels: ref(pools(options.longRange ?? false)),
    poolsAppliedFor: (id: bigint) => (options.applied ? options.applied.has(id) : true),
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

  it('line 2 is the rating and range, Safe, or the lock and clock on a crossing while the timer runs', () => {
    const idle = build();
    const gloam = chip(idle.w, 'Gloamwood');
    expect(gloam.get('.chip-line').text()).toBe('Risky · Lv 3–5');
    expect(gloam.get('.chip-line .rating-mark').text()).toBe('Risky');
    expect(gloam.get('.chip-line .rating-mark').classes()).toContain('rate-risky');
    expect(gloam.get('.chip-line .chip-range').text()).toBe('Lv 3–5');
    expect(gloam.get('.ring').classes()).toContain('rate-risky');
    expect(chip(idle.w, 'Harbour').get('.chip-line').text()).toBe('Safe');
    expect(chip(idle.w, 'Harbour').get('.ring').classes()).toContain('rate-safe');
    expect(chip(idle.w, 'Brackwater').get('.chip-line').text()).toBe('Deadly · Lv 6');
    wrapper?.unmount();

    const { w } = build({ cooldownSeconds: 192 });
    const marsh = chip(w, 'Brackwater');
    expect(marsh.findComponent(PhLockSimple).exists()).toBe(true);
    expect(marsh.get('.chip-line').text()).toBe('3:12');
    expect(chip(w, 'Gloamwood').get('.chip-line').text()).toBe('Risky · Lv 3–5');
  });

  it('a chip whose pool rows have not applied is Unknown: no word, the range stays, never Safe', () => {
    const { w } = build({ applied: new Set([12n]) });
    const gloam = chip(w, 'Gloamwood');
    expect(gloam.get('.chip-line').text()).toBe('Lv 3–5');
    expect(gloam.get('.ring').classes()).toContain('rate-unknown');
    expect(gloam.text()).not.toContain('Safe');
  });

  it('line 1 is the short name when the place has one; the full name stays in the label and the card', async () => {
    const { w } = build({ shortName: 'Gloam' });
    const gloam = w.findAll('button.chip').find((b) => b.get('.chip-name-text').text() === 'Gloam');
    expect(gloam).toBeTruthy();
    expect(gloam!.attributes('aria-label')).toBe('Gloamwood, Risky, Lv 3–5');
    await gloam!.trigger('click');
    expect(w.get('.card-name').text()).toBe('Gloamwood');
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
    expect(w.get('.card-terrain').text()).toBe('Woods · Risky · Lv 3–5');
    expect(w.get('.card-terrain .rating-mark').classes()).toContain('rate-risky');
    expect(w.get('.card-rating-line').text()).toBe('Watch the edges. Things here will come for you.');
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

  it('a short name with markup stays text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { w } = build({ shortName: payload });
    expect(w.find('img').exists()).toBe(false);
    expect(w.findAll('.chip-name-text').map((n) => n.text())).toContain(payload);
  });
});

// UI Q5 backstops at the 390 x 844 phone frame. happy-dom has no layout, so the sizes come from the
// component's own rules (judged at 390px: no desktop-only query may supply them) and the line-2 width
// is estimated at Inter's widest average glyph (0.62em) for the 10px Micro size.
describe('ExitChips measured at 390x844', () => {
  const MOBILE_WIDTH = 390;
  const style = SOURCE.slice(SOURCE.indexOf('<style'));

  /** The value of `prop` in the top-level rule (or a rule whose @media holds at 390px) for exactly `selector`. */
  function mobileValue(selector: string, prop: string): string | null {
    let value: string | null = null;
    const mediaBlocks = [...style.matchAll(/@media([^{]*)\{([\s\S]*?\})\s*\}/g)];
    const topLevel = style.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
    const scan = (css: string): void => {
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = match[1].split(',').map((x) => x.trim());
        if (!selectors.includes(selector)) continue;
        const found = match[2].match(new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+);`));
        if (found) value = found[1].trim();
      }
    };
    scan(topLevel);
    for (const block of mediaBlocks) {
      const max = block[1].match(/max-width:\s*(\d+)px/);
      const min = block[1].match(/min-width:\s*(\d+)px/);
      if (max && MOBILE_WIDTH > Number(max[1])) continue;
      if (min && MOBILE_WIDTH < Number(min[1])) continue;
      scan(block[2]);
    }
    return value;
  }

  const estimate = (text: string, px: number): number => text.length * px * 0.62;

  it("a long place name and 'Deadly · Lv 12–14' fit the 144px text column; the row scrolls sideways", () => {
    const long = 'The Very Long Road Of A Thousand Winding Switchbacks';
    const { w } = build({ longName: long, longRange: true });
    const c = chip(w, long);
    expect(c.get('.chip-line').text()).toBe('Deadly · Lv 12–14');
    expect(c.attributes('aria-label')).toBe(`${long}, Deadly, Lv 12–14`);
    // the column is capped at 144px and line 1 ellipsizes inside it
    expect(mobileValue('.chip-text', 'max-width')).toBe('144px');
    expect(mobileValue('.chip-text', 'min-width')).toBe('0');
    expect(mobileValue('.chip-name-text', 'text-overflow')).toBe('ellipsis');
    expect(mobileValue('.chip-name-text', 'white-space')).toBe('nowrap');
    expect(mobileValue('.chip-name-text', 'overflow')).toBe('hidden');
    // line 2 is Micro 10 on one line and fits the column without clipping
    expect(mobileValue('.chip-line', 'font-size')).toBe('10px');
    expect(mobileValue('.chip-line', 'white-space')).toBe('nowrap');
    expect(estimate('Deadly · Lv 12–14', 10)).toBeLessThanOrEqual(144);
    expect(estimate(long, 12)).toBeGreaterThan(144);
    // the strip scrolls sideways and its chips never shrink
    expect(mobileValue('.strip', 'overflow-x')).toBe('auto');
    expect(mobileValue('.strip > li', 'flex')).toBe('none');
    expect(mobileValue('.chip', 'flex')).toBe('none');
  });

  for (const count of [1, 8]) {
    it(`with ${count} exit${count === 1 ? '' : 's'} every chip renders at 44px and stays usable`, async () => {
      const { w, consoleApi } = build({ exitCount: count });
      const chips = w.findAll('ul.strip > li > button.chip');
      expect(chips).toHaveLength(count);
      expect(mobileValue('.chip', 'min-height')).toBe('44px');
      for (const c of chips) expect(c.attributes('aria-expanded')).toBe('false');
      const last = chips[chips.length - 1];
      await last.trigger('click');
      expect(last.attributes('aria-expanded')).toBe('true');
      await w.get('.exit-card button.card-button').trigger('click');
      expect(consoleApi.travel).toHaveBeenCalledTimes(1);
    });
  }
});

describe('ExitChips source', () => {
  it('sets 44px targets, scrolls sideways and keeps the focus ring', () => {
    expect(SOURCE).toMatch(/overflow-x: auto/);
    expect(SOURCE.match(/min-height: 44px/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(SOURCE).not.toMatch(/all:\s*unset/);
    expect(SOURCE).toMatch(/outline-offset: -2px/);
    expect(SOURCE).not.toMatch(/v-html|COOLDOWN|game\.feed|Date\.now/);
    expect(SOURCE).not.toMatch(/margin:\s*0\s*-|margin-[a-z]+:\s*-/);
    expect(SOURCE).not.toMatch(/min-height: 40px/);
    expect(SOURCE).toMatch(/RatingMark/);
  });
});
