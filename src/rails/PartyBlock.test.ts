// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import PartyBlock from './PartyBlock.vue';
import {
  COMBAT_KEY,
  CONSOLE_KEY,
  GAME_KEY,
  createInertCombat,
  createInertConsole,
  createInertGame,
} from '../game/context';
import type { CombatController, ConsoleApi, GameData } from '../game/context';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

function member(id: bigint, characterId: bigint, joined: bigint) {
  return { id, groupId: 1n, characterId, joinedAt: { microsSinceUnixEpoch: joined } };
}

function character(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    className: 'Ranger',
    level: 4n,
    hp: 95n,
    maxHp: 100n,
    mana: 20n,
    maxMana: 40n,
    stamina: 10n,
    maxStamina: 10n,
    ...over,
  };
}

interface Setup {
  group?: unknown;
  groupMembers?: unknown[];
  knownCharacters?: unknown[];
  characterId?: bigint | null;
  effects?: unknown[];
}

function mountBlock(setup: Setup = {}): { w: VueWrapper; prefill: ReturnType<typeof vi.fn> } {
  const prefill = vi.fn();
  const game = {
    ...createInertGame(),
    group: ref(setup.group ?? null),
    groupMembers: ref(setup.groupMembers ?? []),
    knownCharacters: ref(setup.knownCharacters ?? []),
    characterId: ref(setup.characterId === undefined ? 1n : setup.characterId),
    effects: ref(setup.effects ?? []),
  } as unknown as GameData;
  const consoleApi = { ...createInertConsole(), prefill } as unknown as ConsoleApi;
  wrapper = mount(PartyBlock, {
    global: { provide: { [GAME_KEY as symbol]: game, [CONSOLE_KEY as symbol]: consoleApi } },
  });
  return { w: wrapper, prefill };
}

const PARTY: Setup = {
  group: { id: 1n, leaderCharacterId: 2n },
  groupMembers: [member(11n, 1n, 100n), member(12n, 3n, 200n), member(13n, 2n, 300n)],
  knownCharacters: [character(2n, 'Mara'), character(3n, 'Bo', { maxMana: 0n, mana: 0n, className: 'Warrior' })],
};

describe('PartyBlock not in a party', () => {
  it('shows Party, the Invite button and the empty line', () => {
    const { w } = mountBlock();
    expect(w.get('h6').text()).toBe('Party');
    const invite = w.get('button.btn.btn-ghost');
    expect(invite.text()).toBe('Invite');
    expect(invite.find('svg').exists()).toBe(true);
    expect(w.text()).toContain('Not in a party.');
    expect(w.findAll('[role="progressbar"]')).toHaveLength(0);
  });

  it('renders bare with no provider (inert defaults)', () => {
    wrapper = mount(PartyBlock);
    expect(wrapper.text()).toContain('Not in a party.');
  });

  it('Invite pre-fills "invite " in the input', async () => {
    const { w, prefill } = mountBlock();
    await w.get('button.invite').trigger('click');
    expect(prefill).toHaveBeenCalledWith('invite ');
  });
});

describe('PartyBlock in a party', () => {
  it('shows Party · 3 with one card per other member, leader first', () => {
    const { w } = mountBlock(PARTY);
    expect(w.get('h6').text()).toBe('Party · 3');
    const cards = w.findAll('.member');
    expect(cards).toHaveLength(2);
    expect(cards[0].get('.member-name').text()).toBe('Mara');
    expect(cards[1].get('.member-name').text()).toBe('Bo');
    expect(w.text()).not.toContain('Not in a party.');
  });

  it('shows name with title, class, level and the filled crown on the leader only', () => {
    const { w } = mountBlock(PARTY);
    const [mara, bo] = w.findAll('.member');
    expect(mara.get('.member-name').attributes('title')).toBe('Mara');
    expect(mara.get('.member-class').text()).toBe('Ranger');
    expect(mara.get('.member-level').text()).toBe('Lv 4 · 10 st');
    expect(mara.find('.crown').exists()).toBe(true);
    expect(bo.find('.crown').exists()).toBe(false);
    expect(mara.get('.member-name').element.nextElementSibling?.classList.contains('crown')).toBe(true);
  });

  it('labels the health bar and picks the mana or stamina resource bar', () => {
    const { w } = mountBlock(PARTY);
    const [mara, bo] = w.findAll('.member');
    const health = mara.get('.health-track');
    expect(health.attributes('role')).toBe('progressbar');
    expect(health.attributes('aria-label')).toBe('Mara health 95 of 100');
    expect((mara.get('.health-track .fill').element as HTMLElement).style.width).toBe('95%');
    expect(mara.find('.resource-track .fill-mana').exists()).toBe(true);
    expect((mara.get('.resource-track .fill').element as HTMLElement).style.width).toBe('50%');
    expect(bo.find('.resource-track .fill-stamina').exists()).toBe(true);
    expect((bo.get('.resource-track .fill').element as HTMLElement).style.width).toBe('100%');
  });

  it('shows empty tracks for max 0 vitals', () => {
    const { w } = mountBlock({
      ...PARTY,
      knownCharacters: [character(2n, 'Mara', { hp: 5n, maxHp: 0n }), character(3n, 'Bo')],
    });
    const mara = w.findAll('.member')[0];
    expect((mara.get('.health-track .fill').element as HTMLElement).style.width).toBe('0%');
  });

  it('renders a member with no character row dimmed with empty tracks', () => {
    const { w } = mountBlock({ ...PARTY, knownCharacters: [character(3n, 'Bo')] });
    const [unknown] = w.findAll('.member');
    expect(unknown.classes()).toContain('unknown');
    expect((unknown.get('.health-track .fill').element as HTMLElement).style.width).toBe('0%');
    expect((unknown.get('.resource-track .fill').element as HTMLElement).style.width).toBe('0%');
    expect(unknown.find('.member-level').exists()).toBe(false);
  });

  it('reads Member for a member with no character row, never a blank name (WR-04)', () => {
    const { w } = mountBlock({ ...PARTY, knownCharacters: [character(3n, 'Bo')] });
    const [unknown, known] = w.findAll('.member');
    expect(unknown.get('.member-name').text()).toBe('Member');
    expect(unknown.get('.member-name').attributes('title')).toBe('Member');
    expect(known.get('.member-name').text()).toBe('Bo');
  });

  it('keeps the Invite button visible and working inside a party', async () => {
    const { w, prefill } = mountBlock(PARTY);
    await w.get('button.invite').trigger('click');
    expect(prefill).toHaveBeenCalledWith('invite ');
  });

  it('does not render the player as a card', () => {
    const { w } = mountBlock({
      ...PARTY,
      knownCharacters: [...(PARTY.knownCharacters as unknown[]), character(1n, 'Me')],
    });
    expect(w.findAll('.member')).toHaveLength(2);
    expect(w.text()).not.toContain('Me');
  });

  it('cards are not interactive', () => {
    const { w } = mountBlock(PARTY);
    for (const card of w.findAll('.member')) {
      expect(card.element.tagName).toBe('DIV');
      expect(card.find('button').exists()).toBe(false);
    }
  });

  it('renders member names and classes as text, not markup', () => {
    const { w } = mountBlock({
      ...PARTY,
      knownCharacters: [character(2n, PAYLOAD, { className: PAYLOAD }), character(3n, 'Bo')],
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.findAll('.member-name')[0].text()).toBe(PAYLOAD);
    expect(w.findAll('.member-class')[0].text()).toBe(PAYLOAD);
  });
});

describe('PartyBlock in combat (ally targeting)', () => {
  function mountCombat(
    setup: Setup & { active?: boolean; allyTargetId?: bigint | null; self?: unknown } = {},
  ): { w: VueWrapper; selectAlly: ReturnType<typeof vi.fn>; allyTargetId: ReturnType<typeof ref<bigint | null>> } {
    const selectAlly = vi.fn();
    const allyTargetId = ref<bigint | null>(setup.allyTargetId === undefined ? 1n : setup.allyTargetId);
    const inert = createInertGame();
    const game = {
      ...inert,
      group: ref(setup.group ?? null),
      groupMembers: ref(setup.groupMembers ?? []),
      knownCharacters: ref(setup.knownCharacters ?? []),
      characterId: ref(setup.characterId === undefined ? 1n : setup.characterId),
      character: ref(setup.self === undefined ? character(1n, 'Me', { hp: 60n, maxHp: 120n }) : setup.self),
      combat: { ...inert.combat, active: ref(setup.active ?? true) },
    } as unknown as GameData;
    const controller = { ...createInertCombat(), allyTargetId, selectAlly } as unknown as CombatController;
    wrapper = mount(PartyBlock, {
      global: {
        provide: {
          [GAME_KEY as symbol]: game,
          [CONSOLE_KEY as symbol]: createInertConsole(),
          [COMBAT_KEY as symbol]: controller,
        },
      },
    });
    return { w: wrapper, selectAlly, allyTargetId };
  }

  it('shows the Party heading, the hint and no Invite button', () => {
    const { w } = mountCombat(PARTY);
    expect(w.get('h6').text()).toBe('Party · 3');
    expect(w.get('.hint').text()).toBe('Click to target');
    expect(w.find('button.invite').exists()).toBe(false);
    expect(w.text()).not.toContain('Invite');
  });

  it('lists You first, then the leader and the other members, all as buttons', () => {
    const { w } = mountCombat(PARTY);
    const cards = w.findAll('.member');
    expect(cards.map((c) => c.get('.member-name').text())).toEqual(['You', 'Mara', 'Bo']);
    for (const card of cards) {
      expect(card.element.tagName).toBe('BUTTON');
      expect(card.attributes('type')).toBe('button');
      expect(card.classes()).toContain('ally');
    }
  });

  it('marks the You card pressed by default and the others not', () => {
    const { w } = mountCombat(PARTY);
    const [you, mara, bo] = w.findAll('.member');
    expect(you.attributes('aria-pressed')).toBe('true');
    expect(you.classes()).toContain('selected');
    expect(mara.attributes('aria-pressed')).toBe('false');
    expect(mara.classes()).not.toContain('selected');
    expect(bo.attributes('aria-pressed')).toBe('false');
  });

  it('shows hp/max on the right instead of the level', () => {
    const { w } = mountCombat(PARTY);
    const [you, mara] = w.findAll('.member');
    expect(you.get('.member-hp').text()).toBe('60/120');
    expect(mara.get('.member-hp').text()).toBe('95/100');
    expect(w.find('.member-level').exists()).toBe(false);
    expect(w.find('.member-stamina').exists()).toBe(false);
    expect(w.find('.sr-only').exists()).toBe(false);
    expect(mara.get('.member-class').text()).toBe('Ranger');
    expect(mara.find('.crown').exists()).toBe(true);
  });

  it('labels each card Target {name} with your next ability', () => {
    const { w } = mountCombat(PARTY);
    const labels = w.findAll('.member').map((c) => c.attributes('aria-label'));
    expect(labels).toEqual([
      'Target You with your next ability',
      'Target Mara with your next ability',
      'Target Bo with your next ability',
    ]);
  });

  it('clicking a card selects that ally through the controller', async () => {
    const { w, selectAlly } = mountCombat(PARTY);
    await w.findAll('.member')[1].trigger('click');
    expect(selectAlly).toHaveBeenCalledTimes(1);
    expect(selectAlly).toHaveBeenCalledWith(2n);
    await w.findAll('.member')[0].trigger('click');
    expect(selectAlly).toHaveBeenLastCalledWith(1n);
  });

  it('moves the pressed state and the selected class with the controller selection', async () => {
    const { w, allyTargetId } = mountCombat(PARTY);
    allyTargetId.value = 2n;
    await nextTick();
    const [you, mara] = w.findAll('.member');
    expect(mara.attributes('aria-pressed')).toBe('true');
    expect(mara.classes()).toContain('selected');
    expect(you.attributes('aria-pressed')).toBe('false');
    expect(you.classes()).not.toContain('selected');
  });

  it('keeps a member with no character row as a dimmed non-interactive Member card', async () => {
    const { w, selectAlly } = mountCombat({ ...PARTY, knownCharacters: [character(3n, 'Bo')] });
    const cards = w.findAll('.member');
    expect(cards.map((c) => c.get('.member-name').text())).toEqual(['You', 'Member', 'Bo']);
    const unknown = cards[1];
    expect(unknown.element.tagName).toBe('DIV');
    expect(unknown.classes()).toContain('unknown');
    expect(unknown.attributes('aria-pressed')).toBeUndefined();
    expect(unknown.attributes('aria-label')).toBeUndefined();
    expect(unknown.find('.member-hp').exists()).toBe(false);
    await unknown.trigger('click');
    expect(selectAlly).not.toHaveBeenCalled();
  });

  it('keeps a selected ally at 0 HP selected', () => {
    const { w } = mountCombat({
      ...PARTY,
      knownCharacters: [character(2n, 'Mara', { hp: 0n }), character(3n, 'Bo')],
      allyTargetId: 2n,
    });
    const mara = w.findAll('.member')[1];
    expect(mara.attributes('aria-pressed')).toBe('true');
    expect(mara.get('.member-hp').text()).toBe('0/100');
  });

  it('reads Not in a party. with no You card when solo', () => {
    const { w } = mountCombat({});
    expect(w.text()).toContain('Not in a party.');
    expect(w.find('.member').exists()).toBe(false);
    expect(w.find('.hint').exists()).toBe(false);
  });

  it('shows no You card until a character row exists', () => {
    const { w } = mountCombat({ ...PARTY, self: null });
    expect(w.findAll('.member').map((c) => c.get('.member-name').text())).toEqual(['Mara', 'Bo']);
  });

  it('is exactly the Phase 47 block out of combat, even with a combat controller provided', () => {
    const { w } = mountCombat({ ...PARTY, active: false });
    const cards = w.findAll('.member');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.element.tagName).toBe('DIV');
      expect(card.attributes('aria-pressed')).toBeUndefined();
    }
    expect(w.find('.hint').exists()).toBe(false);
    expect(w.get('button.invite').text()).toBe('Invite');
    expect(w.find('.member-hp').exists()).toBe(false);
    expect(w.findAll('.member-level').map((l) => l.text())).toEqual(['Lv 4 · 10 st', 'Lv 4 · 10 st']);
  });

  it('renders ally names as text, not markup', () => {
    const { w } = mountCombat({
      ...PARTY,
      knownCharacters: [character(2n, PAYLOAD), character(3n, 'Bo')],
    });
    expect(w.find('img').exists()).toBe(false);
    expect(w.findAll('.member-name')[1].text()).toBe(PAYLOAD);
    expect(w.findAll('.member')[1].attributes('aria-label')).toBe(`Target ${PAYLOAD} with your next ability`);
  });
});

describe('PartyBlock source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/rails/PartyBlock.vue'), 'utf8');

  it('carries the copy and the wiring', () => {
    expect(source).toContain('Not in a party.');
    expect(source).toContain("prefill('invite ')");
    expect(source).toContain('PhCrownSimple');
    expect(source).toContain('weight="fill"');
    expect(source).toContain('Click to target');
    expect(source).toContain('selectAlly');
    expect(source).toContain('aria-pressed');
    expect(source).toContain('with your next ability');
  });
});

describe('PartyBlock stamina (51-UI-SPEC "Party Stamina in the Vitals Rail")', () => {
  const group = { id: 1n, leaderCharacterId: 2n };
  const groupMembers = [member(11n, 1n, 100n), member(12n, 3n, 200n), member(13n, 2n, 300n)];

  it('reads Lv n then the stamina with a title and screen-reader text', () => {
    const { w } = mountBlock({
      group,
      groupMembers,
      knownCharacters: [character(2n, 'Mara', { stamina: 12n, maxStamina: 40n }), character(3n, 'Bo')],
    });
    const [mara, bo] = w.findAll('.member');
    expect(mara.get('.member-level').text()).toBe('Lv 4 · 12 st');
    expect(mara.get('.member-level').attributes('title')).toBe('Stamina 12 of 40');
    expect(mara.get('.sr-only').text()).toBe('Stamina 12 of 40');
    expect(mara.get('.member-stamina').attributes('aria-hidden')).toBe('true');
    expect(mara.find('.member-stamina').classes()).not.toContain('low');
    expect(mara.find('.low-icon').exists()).toBe(false);
    expect(bo.get('.member-level').text()).toBe('Lv 4 · 10 st');
  });

  it('marks a member below the within-region cost with the warning icon and the too-low text', () => {
    const { w } = mountBlock({
      group,
      groupMembers,
      knownCharacters: [character(2n, 'Mara', { stamina: 3n, maxStamina: 40n }), character(3n, 'Bo')],
    });
    const [mara, bo] = w.findAll('.member');
    expect(mara.get('.member-stamina').classes()).toContain('low');
    expect(mara.find('.low-icon').exists()).toBe(true);
    expect(mara.get('.member-level').text()).toBe('Lv 4 · 3 st');
    expect(mara.get('.sr-only').text()).toBe('Stamina 3 of 40, too low to travel');
    expect(bo.find('.low-icon').exists()).toBe(false);
  });

  it('honours the racial discount and that member own travel_discount effect only', () => {
    const knownCharacters = [
      character(2n, 'Mara', { stamina: 3n, maxStamina: 40n }),
      character(3n, 'Bo', { stamina: 3n, maxStamina: 40n }),
    ];
    const discount = (characterId: bigint) => ({
      characterId,
      effectType: 'travel_discount',
      roundsRemaining: 5n,
      magnitude: 3n,
    });
    const { w } = mountBlock({ group, groupMembers, knownCharacters, effects: [discount(2n)] });
    const [mara, bo] = w.findAll('.member');
    expect(mara.find('.low-icon').exists()).toBe(false);
    expect(bo.find('.low-icon').exists()).toBe(true);
    wrapper?.unmount();
    const racial = mountBlock({
      group,
      groupMembers,
      knownCharacters: [
        character(2n, 'Mara', { stamina: 3n, maxStamina: 40n, racialTravelCostDiscount: 2n }),
        character(3n, 'Bo', { stamina: 3n, maxStamina: 40n }),
      ],
    });
    const [raceMara, raceBo] = racial.w.findAll('.member');
    expect(raceMara.find('.low-icon').exists()).toBe(false);
    expect(raceBo.find('.low-icon').exists()).toBe(true);
  });

  it('shows no stamina text for a member with no character row', () => {
    const { w } = mountBlock({ group, groupMembers, knownCharacters: [character(3n, 'Bo')] });
    const [unknown] = w.findAll('.member');
    expect(unknown.find('.member-stamina').exists()).toBe(false);
    expect(unknown.find('.sr-only').exists()).toBe(false);
  });

  it('uses the shared stamina rule and the con-red token in source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/rails/PartyBlock.vue'), 'utf8');
    expect(source).toContain('too low to travel');
    expect(source).toContain('PhWarningCircle');
    expect(source).toContain('var(--color-con-red)');
    const party = readFileSync(resolve(process.cwd(), 'src/rails/party.ts'), 'utf8');
    expect(party).toContain('@game-data/travel_config');
    expect(party).not.toMatch(/5n|10n/);
  });
});
