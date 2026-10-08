// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { MAX_LEVEL } from '@game-data/xp';
import { barFraction, vitalText } from './vitals';
import VitalsRail from './VitalsRail.vue';
import {
  COMBAT_KEY,
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertCombat,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { CombatController, GameData } from '../game/context';
import { SOCIAL_KEY, createInertSocial } from '../social/socialContext';
import type { SocialData } from '../social/socialContext';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountRail(
  overrides: Record<string, unknown> = {},
  game?: Record<string, unknown>,
): VueWrapper {
  const provide = game
    ? { [GAME_KEY as symbol]: { ...createInertGame(), ...game } as unknown as GameData }
    : undefined;
  wrapper = mount(VitalsRail, {
    global: provide ? { provide } : undefined,
    props: {
      name: 'Brannoch the Wanderer',
      avatarInitial: 'B',
      classLine: 'Lv 6 · Ranger',
      hp: 130n,
      maxHp: 260n,
      mana: 300n,
      maxMana: 260n,
      stamina: 5n,
      maxStamina: 0n,
      ...overrides,
    },
  });
  return wrapper;
}

describe('barFraction', () => {
  it('returns the ratio for bigints and numbers', () => {
    expect(barFraction(130n, 260n)).toBe(0.5);
    expect(barFraction(130, 260)).toBe(0.5);
  });

  it('clamps above one and below zero', () => {
    expect(barFraction(300n, 260n)).toBe(1);
    expect(barFraction(-5n, 260n)).toBe(0);
  });

  it('is 0 when max is 0 or negative', () => {
    expect(barFraction(5n, 0n)).toBe(0);
    expect(barFraction(5, -3)).toBe(0);
  });
});

describe('vitalText', () => {
  it('formats value / max', () => {
    expect(vitalText(212n, 260n)).toBe('212 / 260');
    expect(vitalText(212, 260)).toBe('212 / 260');
  });

  it('is 0 / 0 when max is 0 or negative', () => {
    expect(vitalText(5n, 0n)).toBe('0 / 0');
    expect(vitalText(5n, -1n)).toBe('0 / 0');
  });
});

describe('VitalsRail', () => {
  it('renders the avatar initial, the name with a full-name title and the class line', () => {
    const w = mountRail();
    expect(w.get('.avatar').text()).toBe('B');
    const name = w.get('.name');
    expect(name.text()).toBe('Brannoch the Wanderer');
    expect(name.attributes('title')).toBe('Brannoch the Wanderer');
    expect(w.get('.class-line').text()).toBe('Lv 6 · Ranger');
  });

  it('renders four labelled progress bars in order: Health, Mana, Stamina, Experience', () => {
    const w = mountRail();
    const bars = w.findAll('[role="progressbar"]');
    // Phase 45 asserted 3 bars; the XP bar (47-08) is the fourth. The party block adds none here.
    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.attributes('aria-label'))).toEqual(['Health', 'Mana', 'Stamina', 'Experience']);
    expect(bars[0].attributes('aria-valuenow')).toBe('130');
    expect(bars[0].attributes('aria-valuemax')).toBe('260');
    expect(bars[1].attributes('aria-valuenow')).toBe('300');
    expect(bars[1].attributes('aria-valuemax')).toBe('260');
  });

  it('sets fill widths: 50%, clamped 100% and 0% for max 0, with readouts', () => {
    const w = mountRail();
    const fills = w.findAll('.fill');
    expect((fills[0].element as HTMLElement).style.width).toBe('50%');
    expect((fills[1].element as HTMLElement).style.width).toBe('100%');
    expect((fills[2].element as HTMLElement).style.width).toBe('0%');
    const values = w.findAll('.value').map((v) => v.text());
    expect(values).toEqual(['130 / 260', '300 / 260', '0 / 0']);
  });

  it('shows the Party heading and its empty line', () => {
    const w = mountRail();
    expect(w.get('h6').text()).toBe('Party');
    expect(w.text()).toContain('Not in a party.');
  });

  it('escapes the character name as text (no markup injection)', () => {
    const w = mountRail({ name: '<img src=x onerror=alert(1)>' });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.name').text()).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('VitalsRail source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsRail.vue'), 'utf8');

  it('carries the spec width, resource tokens and tabular figures', () => {
    expect(source).toContain('width: 252px');
    expect(source).toContain('var(--color-health)');
    expect(source).toContain('var(--color-mana)');
    expect(source).toContain('var(--color-stamina)');
    expect(source).toContain('tabular-nums');
    expect(source).toContain('aria-label="Experience"');
    expect(source).toContain('EffectChips');
    expect(source).toContain('PartyBlock');
  });

  it('reads the Not in a party line from the shared PartyBlock', () => {
    // Phase 45 asserted this copy in VitalsRail.vue itself; it now lives in the shared component.
    const partySource = readFileSync(resolve(process.cwd(), 'src/rails/PartyBlock.vue'), 'utf8');
    expect(partySource).toContain('Not in a party.');
  });
});

function fx(id: bigint, characterId: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    characterId,
    effectType: 'armor_up',
    magnitude: 2n,
    roundsRemaining: 3n,
    sourceAbility: 'Bless',
    ...over,
  };
}

describe('VitalsRail experience', () => {
  it('with no character shows XP, 0 / 0 and an empty track', () => {
    const w = mountRail();
    expect(w.get('.xp-row .xp-label').text()).toBe('XP');
    expect(w.get('.xp-value').text()).toBe('0 / 0');
    expect((w.get('.xp-fill').element as HTMLElement).style.width).toBe('0%');
  });

  it('shows progress into the level and the matching fill width', () => {
    const w = mountRail({}, { character: ref({ id: 1n, level: 3n, xp: 318n }) });
    expect(w.get('.xp-value').text()).toBe('58 / 220');
    expect((w.get('.xp-fill').element as HTMLElement).style.width).toBe(`${(58 / 220) * 100}%`);
    const bar = w.get('[aria-label="Experience"]');
    expect(bar.attributes('aria-valuenow')).toBe('58');
    expect(bar.attributes('aria-valuemax')).toBe('220');
  });

  it('reads Max level with a full track at the maximum level', () => {
    const w = mountRail({}, { character: ref({ id: 1n, level: MAX_LEVEL, xp: 99999n }) });
    expect(w.get('.xp-value').text()).toBe('Max level');
    expect((w.get('.xp-fill').element as HTMLElement).style.width).toBe('100%');
  });

  it('keeps the HP, MP and SP rows on the Phase 45 classes', () => {
    const w = mountRail();
    expect(w.findAll('.fill')).toHaveLength(3);
    expect(w.findAll('.value')).toHaveLength(3);
  });
});

describe('VitalsRail effects', () => {
  it('renders nothing when there are no effects', () => {
    const w = mountRail();
    expect(w.find('.effect-chips').exists()).toBe(false);
  });

  it('shows only the active character chips, with rounds left in combat', () => {
    const w = mountRail(
      {},
      {
        characterId: ref(1n),
        inCombat: ref(true),
        effects: ref([fx(1n, 1n), fx(2n, 9n, { sourceAbility: 'Party Aura' })]),
      },
    );
    const chips = w.findAll('.effect-chips .tag');
    expect(chips).toHaveLength(1);
    expect(chips[0].text()).toBe('Bless · 3 rounds');
    expect(w.text()).not.toContain('Party Aura');
  });

  it('hides the rounds left out of combat', () => {
    const w = mountRail({}, { characterId: ref(1n), inCombat: ref(false), effects: ref([fx(1n, 1n)]) });
    expect(w.get('.effect-chips .tag').text()).toBe('Bless');
  });

  it('puts the chips after the XP row and before the party block', () => {
    const w = mountRail({}, { characterId: ref(1n), effects: ref([fx(1n, 1n)]) });
    const html = w.html();
    expect(html.indexOf('Experience')).toBeLessThan(html.indexOf('effect-chips'));
    expect(html.indexOf('effect-chips')).toBeLessThan(html.indexOf('Party'));
  });
});

describe('VitalsRail party', () => {
  it('shows the Party heading, Invite and the empty line when not in a party', () => {
    const w = mountRail();
    expect(w.get('h6').text()).toBe('Party');
    expect(w.get('button.invite').text()).toBe('Invite');
    expect(w.text()).toContain('Not in a party.');
  });

  it('shows the filled crown after the name only for the party leader', () => {
    const asLeader = mountRail(
      {},
      { characterId: ref(1n), group: ref({ id: 5n, leaderCharacterId: 1n }) },
    );
    expect(asLeader.find('.name-row .crown').exists()).toBe(true);
    expect(asLeader.get('.name-row').element.firstElementChild?.classList.contains('name')).toBe(true);
    asLeader.unmount();
    const notLeader = mountRail(
      {},
      { characterId: ref(1n), group: ref({ id: 5n, leaderCharacterId: 2n }) },
    );
    expect(notLeader.find('.name-row .crown').exists()).toBe(false);
  });

  it('shows no crown without a party', () => {
    expect(mountRail().find('.name-row .crown').exists()).toBe(false);
  });
});

describe('VitalsRail damage flash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mountFlash(hp = 200n, characterId = ref<bigint | null>(1n)): { w: VueWrapper; characterId: typeof characterId } {
    const w = mountRail({ hp, maxHp: 260n }, { characterId });
    return { w, characterId };
  }

  const healthBar = (w: VueWrapper) => w.findAll('.bar')[0];

  it('shows no flash class, ghost or delta on mount', () => {
    const { w } = mountFlash();
    const bar = healthBar(w);
    expect(bar.classes()).not.toContain('flash-motion');
    expect(bar.classes()).not.toContain('flash-reduced');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('flashes on a drop: class, ghost over the lost portion and the delta, then clears on time', async () => {
    const { w } = mountFlash();
    await w.setProps({ hp: 178n });
    const bar = healthBar(w);
    expect(bar.classes()).toContain('flash-motion');
    const ghost = w.get('.ghost');
    expect(ghost.attributes('aria-hidden')).toBe('true');
    expect(ghost.element.parentElement?.classList.contains('track')).toBe(true);
    const style = (ghost.element as HTMLElement).style;
    expect(style.left).toBe(`${Math.round((178 / 260) * 10000) / 100}%`);
    expect(style.width).toBe(`${Math.round((22 / 260) * 10000) / 100}%`);
    const delta = w.get('.delta');
    expect(delta.text()).toBe('−22');
    expect(delta.attributes('aria-hidden')).toBe('true');
    // after the value text
    expect(w.get('.readout').element.lastElementChild).toBe(delta.element);
    expect(w.findAll('.value')[0].text()).toBe('178 / 260');

    vi.advanceTimersByTime(599);
    await nextTick();
    expect(healthBar(w).classes()).toContain('flash-motion');
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(healthBar(w).classes()).not.toContain('flash-motion');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(true);

    vi.advanceTimersByTime(899);
    await nextTick();
    expect(w.find('.delta').exists()).toBe(true);
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('sums drops inside the window and restarts the timers', async () => {
    const { w } = mountFlash();
    await w.setProps({ hp: 190n });
    vi.advanceTimersByTime(1000);
    await w.setProps({ hp: 170n });
    expect(w.get('.delta').text()).toBe('−30');
    vi.advanceTimersByTime(1499);
    await nextTick();
    expect(w.find('.delta').exists()).toBe(true);
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('uses the static flash-reduced class under reduced motion and still shows the delta', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    const { w } = mountFlash();
    await w.setProps({ hp: 178n });
    const bar = healthBar(w);
    expect(bar.classes()).toContain('flash-reduced');
    expect(bar.classes()).not.toContain('flash-motion');
    expect(w.find('.ghost').exists()).toBe(true);
    expect(w.get('.delta').text()).toBe('−22');
    vi.advanceTimersByTime(600);
    await nextTick();
    expect(healthBar(w).classes()).not.toContain('flash-reduced');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(true);
    vi.advanceTimersByTime(900);
    await nextTick();
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('never flashes on healing', async () => {
    const { w } = mountFlash(100n);
    await w.setProps({ hp: 150n });
    expect(healthBar(w).classes()).not.toContain('flash-motion');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('never flashes on a character switch, with a lower hp arriving together with the new id', async () => {
    const { w, characterId } = mountFlash();
    characterId.value = 2n;
    await w.setProps({ hp: 100n });
    expect(healthBar(w).classes()).not.toContain('flash-motion');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(false);
    // the new character's own drop flashes afterwards
    await w.setProps({ hp: 90n });
    expect(w.get('.delta').text()).toBe('−10');
  });

  it('a switch alone does not make the next drop of the new character vanish', async () => {
    const { w, characterId } = mountFlash();
    characterId.value = 2n;
    await nextTick();
    expect(w.find('.delta').exists()).toBe(false);
    await w.setProps({ hp: 190n });
    expect(w.get('.delta').text()).toBe('−10');
  });

  it('never flashes the mana or stamina bars', async () => {
    const { w } = mountFlash();
    await w.setProps({ hp: 178n, mana: 10n, stamina: 1n });
    const [, mana, stamina] = w.findAll('.bar');
    for (const bar of [mana, stamina]) {
      expect(bar.classes()).not.toContain('flash-motion');
      expect(bar.classes()).not.toContain('flash-reduced');
      expect(bar.find('.ghost').exists()).toBe(false);
      expect(bar.find('.delta').exists()).toBe(false);
    }
    expect(w.findAll('.ghost')).toHaveLength(1);
    expect(w.findAll('.delta')).toHaveLength(1);
  });

  it('keeps the value rows and the party cards out of the flash', async () => {
    const { w } = mountFlash();
    await w.setProps({ hp: 178n });
    expect(w.findAll('.value').map((v) => v.text())).toEqual(['178 / 260', '300 / 260', '0 / 0']);
    expect(w.findAll('.fill')).toHaveLength(3);
  });

  describe('source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsRail.vue'), 'utf8');

    function rules(): Array<{ selector: string; body: string }> {
      const out: Array<{ selector: string; body: string }> = [];
      const re = /([^{}@]+)\{([^{}]*)\}/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(source.slice(source.indexOf('<style')))) !== null) {
        out.push({ selector: match[1].trim(), body: match[2] });
      }
      return out;
    }

    it('carries the composable call, both state classes and the reduced-motion block', () => {
      expect(source).toContain('useDamageFlash(');
      expect(source).toContain('flash-motion');
      expect(source).toContain('flash-reduced');
      expect(source).toContain('prefers-reduced-motion');
    });

    it('declares no animation or transition in the flash-reduced rules', () => {
      const reduced = rules().filter((r) => r.selector.includes('flash-reduced'));
      expect(reduced.length).toBeGreaterThan(0);
      for (const rule of reduced) {
        expect(rule.body).not.toContain('animation');
        expect(rule.body).not.toContain('transition');
      }
    });

    it('removes every flash-motion animation inside the prefers-reduced-motion block', () => {
      const start = source.indexOf('@media (prefers-reduced-motion: reduce)');
      expect(start).toBeGreaterThan(-1);
      const block = source.slice(start, source.indexOf('</style>'));
      for (const part of ['.flash-motion .ghost', '.flash-motion .fill-health', '.flash-motion .value']) {
        expect(block).toContain(part);
      }
      expect(block).toContain('animation: none');
    });

    it('has no transition anywhere in the flash styles', () => {
      expect(source).not.toContain('transition');
    });

    it('uses the con red token for the delta and the colour state, with no literal colour', () => {
      expect(source).toContain('var(--color-con-red)');
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });
  });
});

// 51.1-UI-SPEC "Vitals Rail Self Block (desktop)", out of combat: the self block wraps your identity,
// bars, XP and chips; your pet row follows inside it; in a party a ⋯ 'Actions for yourself' sits at
// its top right (the identity row reserves 32px) and right-click on the identity row opens it; the
// Travel with leader switch sits after the block and before the rule (members only).
describe('VitalsRail self block (51.1)', () => {
  const ME = 1n;
  const MARA = 2n;

  function row(id: bigint, name: string, over: Record<string, unknown> = {}) {
    return {
      id,
      name,
      level: 6n,
      xp: 0n,
      race: 'Human',
      className: 'Ranger',
      locationId: 10n,
      online: true,
      groupId: 7n,
      hp: 50n,
      maxHp: 100n,
      mana: 10n,
      maxMana: 20n,
      stamina: 30n,
      maxStamina: 40n,
      ...over,
    };
  }

  function memberRow(id: bigint, characterId: bigint, joined: bigint) {
    return { id, groupId: 7n, characterId, followLeader: true, joinedAt: { microsSinceUnixEpoch: joined } };
  }

  const myPet = {
    id: 90n,
    characterId: ME,
    name: 'Fang',
    level: 2n,
    currentHp: 8n,
    maxHp: 10n,
    expiresAtMicros: null,
  };

  // The ally target as useCombatController keeps it: client state, your own id by default.
  let ally = ref<bigint | null>(ME);
  let selectAlly = vi.fn();
  let combatActive = ref(false);
  let lastGame: GameData | null = null;

  function mountSelf(
    options: { party?: 'lead' | 'member' | null; pet?: boolean; combat?: boolean; noRow?: boolean } = {},
  ) {
    const party = options.party ?? null;
    const inert = createInertGame();
    ally = ref<bigint | null>(ME);
    selectAlly = vi.fn((id: bigint) => {
      ally.value = id;
    });
    combatActive = ref(options.combat ?? false);
    const game = {
      ...inert,
      connected: ref(true),
      characterId: ref<bigint | null>(ME),
      character: ref(options.noRow ? null : row(ME, 'Ann', { groupId: party === null ? undefined : 7n })),
      group: ref(party === null ? null : { id: 7n, leaderCharacterId: party === 'lead' ? ME : MARA }),
      groupMembers: ref(party === null ? [] : [memberRow(11n, ME, 1n), memberRow(12n, MARA, 2n)]),
      knownCharacters: ref(party === null ? [] : [row(MARA, 'Mara')]),
      effects: ref([fx(1n, ME)]),
      combat: { ...inert.combat, active: combatActive },
    } as unknown as GameData;
    lastGame = game;
    const controller = { ...createInertCombat(), allyTargetId: ally, selectAlly } as unknown as CombatController;
    const social = {
      ...createInertSocial(),
      petOf: (id: bigint) => (options.pet && id === ME ? myPet : null),
      petSecondsLeft: () => null,
    } as unknown as SocialData;
    wrapper = mount(VitalsRail, {
      attachTo: document.body,
      props: {
        name: 'Ann',
        avatarInitial: 'A',
        classLine: 'Lv 6 · Ranger',
        hp: 50n,
        maxHp: 100n,
        mana: 10n,
        maxMana: 20n,
        stamina: 30n,
        maxStamina: 40n,
      },
      global: {
        provide: {
          [GAME_KEY as symbol]: game,
          [SOCIAL_KEY as symbol]: social,
          [CONSOLE_KEY as symbol]: createInertConsole(),
          [FRAME_KEY as symbol]: createInertFrame(),
          [COMBAT_KEY as symbol]: controller,
        },
      },
    });
    return wrapper;
  }

  function childClasses(el: Element): string[] {
    return Array.from(el.children).map((child) => child.className.split(' ')[0]);
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('solo: the self block holds identity, bars, XP and chips, then your pet row, with no ⋯ or switch', () => {
    const w = mountSelf({ pet: true });
    const block = w.get('.self-block');
    expect(block.element.tagName).toBe('DIV');
    expect(childClasses(block.element)).toEqual(['identity', 'bars', 'pet-row']);
    expect(block.find('.xp-row').exists()).toBe(true);
    expect(block.find('.effect-chips').exists()).toBe(true);
    expect(block.get('.pet-row .sr-only').text()).toBe('Your pet');
    expect(w.find('.menu-opener').exists()).toBe(false);
    expect(w.get('.identity').classes()).not.toContain('reserve');
    expect(w.find('.travel-switch').exists()).toBe(false);
  });

  it('solo with no pet: no pet row', () => {
    const w = mountSelf();
    expect(w.find('.self-block .pet-row').exists()).toBe(false);
  });

  it('as a member: the ⋯ Actions for yourself, the 32px reserve and the switch before the rule', () => {
    const w = mountSelf({ party: 'member', pet: true });
    const block = w.get('.self-block');
    const opener = block.get('.self-menu .menu-opener');
    expect(opener.attributes('aria-label')).toBe('Actions for yourself');
    expect(opener.attributes('aria-haspopup')).toBe('menu');
    expect(w.get('.identity').classes()).toContain('reserve');
    expect(w.findAll('button button')).toHaveLength(0);
    expect(childClasses(block.element)).toEqual(['identity', 'bars', 'player-menu', 'pet-row']);
    expect(block.get('.player-menu').classes()).toContain('self-menu');
    const rail = childClasses(w.get('aside.vitals-rail').element);
    expect(rail.slice(0, 3)).toEqual(['self-block', 'travel-switch', 'hr']);
    expect(w.get('.travel-switch').attributes('role')).toBe('switch');
  });

  it('as the leader: the ⋯ is there and there is no switch', () => {
    const w = mountSelf({ party: 'lead' });
    expect(w.get('.self-block .menu-opener').attributes('aria-label')).toBe('Actions for yourself');
    expect(w.find('.travel-switch').exists()).toBe(false);
    expect(childClasses(w.get('aside.vitals-rail').element).slice(0, 2)).toEqual(['self-block', 'hr']);
  });

  it('right-click on the identity row opens the self menu and prevents the browser menu', async () => {
    const w = mountSelf({ party: 'member' });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    w.get('.identity').element.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(w.get('.self-block .menu-opener').attributes('aria-expanded')).toBe('true');
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('solo right-click on the identity row is left to the browser', async () => {
    const w = mountSelf();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    w.get('.identity').element.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps the XP line out of combat', () => {
    const w = mountSelf({ party: 'member' });
    expect(w.get('.self-block .xp-row .xp-label').text()).toBe('XP');
  });

  it('in a fight the self block holds the target button, then the ⋯ and your pet, and the switch hides', () => {
    const w = mountSelf({ party: 'member', pet: true, combat: true });
    const block = w.get('.self-block');
    expect(block.element.tagName).toBe('DIV');
    expect(childClasses(block.element)).toEqual(['self-target', 'player-menu', 'pet-row']);
    expect(block.find('.self-target .menu-opener').exists()).toBe(false);
    expect(block.find('.self-target .pet-row').exists()).toBe(false);
    expect(w.find('.travel-switch').exists()).toBe(false);
  });

  // Review client-rest WR-02: leaving (or being removed) in a fight drops the self ⋯ while it holds
  // focus; the in-combat .sr-only Party heading is always rendered, so focus lands there, not on body.
  it('leaving the party in a fight moves focus from the self ⋯ to the .sr-only Party heading', async () => {
    const w = mountSelf({ party: 'member', combat: true });
    (w.get('.self-block .menu-opener').element as HTMLElement).focus();
    const game = lastGame as unknown as { group: { value: unknown }; groupMembers: { value: unknown[] }; character: { value: Record<string, unknown> } };
    game.group.value = null;
    game.groupMembers.value = [];
    await nextTick();
    await nextTick();
    expect(w.find('.self-block .menu-opener').exists()).toBe(false);
    const heading = w.get('.party h6').element;
    expect(heading.classList.contains('sr-only')).toBe(true);
    expect(document.activeElement).toBe(heading);
  });

  // Review client-rest IN-01: your name renders through the shared CharacterName in both modes.
  it('renders your name through CharacterName out of combat and inside the self target', async () => {
    const w = mountSelf({ party: 'member' });
    const name = w.get('.identity .name');
    expect(name.classes()).toContain('character-name');
    expect(name.attributes('title')).toBe('Ann');
    expect(name.element.tagName).toBe('SPAN');
    combatActive.value = true;
    await nextTick();
    expect(w.get('button.self-target .name').classes()).toContain('character-name');
    expect(w.findAll('button.self-target div')).toHaveLength(0);
  });

  // Review client-rest IN-02: the pet row's elbow reaches the block, as under a member card.
  it('keeps the 16px only between identity and bars, so the pet row sits 4px under the block', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsRail.vue'), 'utf8').replace(/\r\n/g, '\n');
    expect(source).toMatch(/\.self-block \{[^}]*gap: 0;/);
    expect(source).toMatch(/\.self-block > \.bars \{\s*margin-top: 16px;/);
    expect(source).toMatch(/\.self-target \{[^}]*gap: 16px;/);
  });

  // Review client-rest WR-03: the self target button goes when the fight ends.
  it('the fight ending while the self target has focus moves focus to the self menu opener in a party', async () => {
    const w = mountSelf({ party: 'member', combat: true });
    (w.get('button.self-target').element as HTMLElement).focus();
    combatActive.value = false;
    await nextTick();
    await nextTick();
    expect(w.find('button.self-target').exists()).toBe(false);
    expect(document.activeElement).toBe(w.get('.self-block .menu-opener').element);
  });

  it('solo, the fight ending while the self target has focus moves focus to the Party heading', async () => {
    const w = mountSelf({ combat: true });
    (w.get('button.self-target').element as HTMLElement).focus();
    combatActive.value = false;
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('.party h6').element);
  });

  // 51.1-UI-SPEC "Vitals Rail Self Block", in combat. These replace the Phase 48 'You' card cases
  // that lived in PartyBlock.test.ts (UI-SPEC Supersedes): the self block is the self target, solo or
  // in a party, pressed by default; not a button out of combat or before your row exists.
  describe('self target in combat', () => {
    it('out of combat the self block is not a button and the XP line shows', () => {
      const w = mountSelf({ party: 'member' });
      expect(w.find('button.self-target').exists()).toBe(false);
      expect(w.find('.self-block .xp-row').exists()).toBe(true);
      expect(w.find('.self-marker').exists()).toBe(false);
    });

    it('solo: one button with the title, pressed by default, the label, the crosshair and the ring', () => {
      const w = mountSelf({ combat: true });
      const target = w.get('.self-block > button.self-target');
      expect(target.attributes('type')).toBe('button');
      expect(target.attributes('title')).toBe('Click to target yourself');
      expect(target.attributes('aria-pressed')).toBe('true');
      expect(target.attributes('aria-label')).toBe(
        'Target yourself with your next ability. Health 50 of 100, mana 10 of 20, stamina 30 of 40.',
      );
      expect(w.get('.self-block').classes()).toContain('selected');
      const marker = target.get('.identity .self-marker');
      expect(marker.attributes('aria-hidden')).toBe('true');
      expect(target.get('.identity').element.lastElementChild).toBe(marker.element);
    });

    it('holds the identity, the three bars and your chips (inline) inside the button, with no XP line', () => {
      const w = mountSelf({ combat: true });
      const target = w.get('button.self-target');
      expect(target.find('.identity .name').text()).toBe('Ann');
      expect(target.findAll('.bar').map((bar) => bar.get('.label').text())).toEqual(['Health', 'Mana', 'Stamina']);
      const chips = target.get('.effect-chips');
      expect(chips.element.tagName).toBe('SPAN');
      expect(chips.get('.tag').text()).toBe('Bless');
      expect(w.find('.xp-row').exists()).toBe(false);
      expect(w.find('[aria-label="Experience"]').exists()).toBe(false);
      expect(target.find('div').exists()).toBe(false);
    });

    it('solo: your pet row follows the button inside the self block, outside it', () => {
      const w = mountSelf({ combat: true, pet: true });
      const block = w.get('.self-block');
      expect(childClasses(block.element)).toEqual(['self-target', 'pet-row']);
      expect(w.get('.pet-row').element.closest('button')).toBeNull();
      expect(w.find('.menu-opener').exists()).toBe(false);
    });

    it('clicking the self block selects you through the controller', async () => {
      const w = mountSelf({ combat: true });
      await w.get('button.self-target').trigger('click');
      expect(selectAlly).toHaveBeenCalledWith(ME);
    });

    it('in a party: the ⋯ is the next sibling of the button and no button holds a button anywhere', () => {
      const w = mountSelf({ party: 'member', combat: true, pet: true });
      const target = w.get('button.self-target');
      const next = target.element.nextElementSibling as HTMLElement;
      expect(next.classList.contains('player-menu')).toBe(true);
      expect(next.querySelector('.menu-opener')?.getAttribute('aria-label')).toBe('Actions for yourself');
      expect(w.get('.identity').classes()).toContain('reserve');
      expect(w.findAll('.member-card .member-target')).toHaveLength(1);
      expect(w.findAll('button button')).toHaveLength(0);
      expect(document.querySelectorAll('aside.vitals-rail button button')).toHaveLength(0);
    });

    it('clicking a member card moves the ring there, and clicking the self block moves it back', async () => {
      const w = mountSelf({ party: 'member', combat: true });
      const self = () => w.get('button.self-target');
      const mara = () => w.get('.member-card .member-target');
      await mara().trigger('click');
      expect(selectAlly).toHaveBeenLastCalledWith(MARA);
      expect(mara().attributes('aria-pressed')).toBe('true');
      expect(self().attributes('aria-pressed')).toBe('false');
      expect(w.get('.self-block').classes()).not.toContain('selected');
      expect(w.find('.self-marker').exists()).toBe(false);
      await self().trigger('click');
      expect(selectAlly).toHaveBeenLastCalledWith(ME);
      expect(self().attributes('aria-pressed')).toBe('true');
      expect(mara().attributes('aria-pressed')).toBe('false');
      expect(w.find('.self-marker').exists()).toBe(true);
    });

    it('right-click on the self block opens the self menu and leaves the target alone', async () => {
      const w = mountSelf({ party: 'member', combat: true });
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      w.get('button.self-target .bars').element.dispatchEvent(event);
      await nextTick();
      expect(event.defaultPrevented).toBe(true);
      expect(w.get('.self-menu .menu-opener').attributes('aria-expanded')).toBe('true');
      expect(selectAlly).not.toHaveBeenCalled();
      expect(w.get('button.self-target').attributes('aria-pressed')).toBe('true');
    });

    it('solo right-click on the self block is left to the browser', async () => {
      const w = mountSelf({ combat: true });
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      w.get('button.self-target').element.dispatchEvent(event);
      await nextTick();
      expect(event.defaultPrevented).toBe(false);
    });

    it('is not a button before your character row exists', () => {
      const w = mountSelf({ combat: true, noRow: true });
      expect(w.find('button.self-target').exists()).toBe(false);
      expect(w.get('.self-block').classes()).not.toContain('selected');
    });

    it('brings the XP line back and drops the button when the fight ends', async () => {
      const w = mountSelf({ party: 'member', combat: true });
      expect(w.find('.xp-row').exists()).toBe(false);
      combatActive.value = false;
      await nextTick();
      expect(w.find('button.self-target').exists()).toBe(false);
      expect(w.get('.self-block .xp-row .xp-label').text()).toBe('XP');
      expect(childClasses(w.get('.self-block').element)).toEqual(['identity', 'bars', 'player-menu']);
    });

    it('keeps the damage flash on the Health bar inside the button', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
      try {
        const w = mountSelf({ combat: true });
        await w.setProps({ hp: 40n });
        const health = w.findAll('button.self-target .bar')[0];
        expect(health.classes()).toContain('flash-motion');
        expect(health.get('.delta').text()).toBe('−10');
        expect(health.find('.ghost').exists()).toBe(true);
        expect(w.get('button.self-target').attributes('aria-label')).toContain('Health 40 of 100');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('renders your name as text inside the button, not markup', () => {
      const w = mountSelf({ combat: true });
      expect(w.find('img').exists()).toBe(false);
      expect(w.get('button.self-target .name').text()).toBe('Ann');
    });

    it('carries the ring, the hover and pressed tints on the block pseudo-element in source', () => {
      const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsRail.vue'), 'utf8');
      const style = source.slice(source.indexOf('<style'));
      expect(source).toContain('Click to target yourself');
      expect(source).toContain('Target yourself with your next ability.');
      expect(source).toContain('selectAlly(');
      const ring = style.slice(style.indexOf('.self-block.selected::before'));
      expect(ring.slice(0, ring.indexOf('}'))).toContain(
        '0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent)',
      );
      expect(style).toContain('color-mix(in srgb, var(--color-text) 7%, transparent)');
      expect(style).toContain('color-mix(in srgb, var(--color-text) 14%, transparent)');
      expect(style).not.toMatch(/(?:margin|padding)[a-z-]*\s*:[^;]*-\d/);
    });
  });

  it('draws the 8px outset with a pseudo-element, never a negative margin', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsRail.vue'), 'utf8');
    const style = source.slice(source.indexOf('<style'));
    expect(style).not.toMatch(/(?:margin|padding)[a-z-]*\s*:[^;]*-\d/);
    const before = style.slice(style.indexOf('.self-block::before'));
    const body = before.slice(0, before.indexOf('}'));
    expect(body).toContain('inset: -8px');
    expect(body).toContain('pointer-events: none');
    expect(body).toContain('border-radius: var(--radius-md)');
    expect(source).toContain('<TravelSwitch variant="rail"');
  });
});
