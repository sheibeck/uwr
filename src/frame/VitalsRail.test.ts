// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { MAX_LEVEL } from '@game-data/xp';
import { barFraction, vitalText } from './vitals';
import VitalsRail from './VitalsRail.vue';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';

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
