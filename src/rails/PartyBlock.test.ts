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
import { SOCIAL_KEY, createInertSocial } from '../social/socialContext';
import type { SocialData } from '../social/socialContext';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const PAYLOAD = '<img src=x onerror=alert(1)>';

function member(id: bigint, characterId: bigint, joined: bigint) {
  return { id, groupId: 1n, characterId, joinedAt: { microsSinceUnixEpoch: joined } };
}

function character(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    // PlayerMenu's header reads race (51.1); the member cards mount a menu once your row exists.
    race: 'Human',
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
  /** Your own character row (game.character). */
  self?: unknown;
  social?: Partial<SocialData>;
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
    character: ref(setup.self ?? null),
    connected: ref(true),
  } as unknown as GameData;
  const consoleApi = { ...createInertConsole(), prefill } as unknown as ConsoleApi;
  const social = { ...createInertSocial(), ...(setup.social ?? {}) } as SocialData;
  wrapper = mount(PartyBlock, {
    attachTo: document.body,
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [CONSOLE_KEY as symbol]: consoleApi,
        [SOCIAL_KEY as symbol]: social,
      },
    },
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
    const cards = w.findAll('.member-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].get('.member-name').text()).toBe('Mara');
    expect(cards[1].get('.member-name').text()).toBe('Bo');
    expect(w.text()).not.toContain('Not in a party.');
  });

  it('shows name with title, class, level and the filled crown on the leader only', () => {
    const { w } = mountBlock(PARTY);
    const [mara, bo] = w.findAll('.member-card');
    expect(mara.get('.member-name').attributes('title')).toBe('Mara');
    expect(mara.get('.member-class').text()).toBe('Ranger');
    expect(mara.get('.member-level').text()).toBe('Lv 4 · 10 st');
    expect(mara.find('.crown').exists()).toBe(true);
    expect(bo.find('.crown').exists()).toBe(false);
    expect(mara.get('.member-name').element.nextElementSibling?.classList.contains('crown')).toBe(true);
  });

  it('labels the health bar and picks the mana or stamina resource bar', () => {
    const { w } = mountBlock(PARTY);
    const [mara, bo] = w.findAll('.member-card');
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
    const mara = w.findAll('.member-card')[0];
    expect((mara.get('.health-track .fill').element as HTMLElement).style.width).toBe('0%');
  });

  it('renders a member with no character row dimmed with empty tracks', () => {
    const { w } = mountBlock({ ...PARTY, knownCharacters: [character(3n, 'Bo')] });
    const [unknown] = w.findAll('.member-card');
    expect(unknown.classes()).toContain('unknown');
    expect((unknown.get('.health-track .fill').element as HTMLElement).style.width).toBe('0%');
    expect((unknown.get('.resource-track .fill').element as HTMLElement).style.width).toBe('0%');
    expect(unknown.find('.member-level').exists()).toBe(false);
  });

  it('reads Member for a member with no character row, never a blank name (WR-04)', () => {
    const { w } = mountBlock({ ...PARTY, knownCharacters: [character(3n, 'Bo')] });
    const [unknown, known] = w.findAll('.member-card');
    expect(unknown.get('.member-name').text()).toBe('Member');
    expect(unknown.get('.member-name').attributes('title')).toBe('Member');
    expect(known.get('.member-name').text()).toBe('Bo');
  });

  it('keeps the Invite button visible and working inside a party you lead', async () => {
    // 51.1: a member who is not the leader sees Invite disabled (see the out of combat block below).
    const { w, prefill } = mountBlock({ ...PARTY, group: { id: 1n, leaderCharacterId: 1n } });
    await w.get('button.invite').trigger('click');
    expect(prefill).toHaveBeenCalledWith('invite ');
  });

  it('does not render the player as a card', () => {
    const { w } = mountBlock({
      ...PARTY,
      knownCharacters: [...(PARTY.knownCharacters as unknown[]), character(1n, 'Me')],
    });
    expect(w.findAll('.member-card')).toHaveLength(2);
    expect(w.text()).not.toContain('Me');
  });

  it('cards are not targets: a div whose content holds no button', () => {
    const { w } = mountBlock(PARTY);
    for (const card of w.findAll('.member-card')) {
      expect(card.element.tagName).toBe('DIV');
      expect(card.get('.content').find('button').exists()).toBe(false);
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
    const cards = w.findAll('.member-card');
    expect(w.find('.member').exists()).toBe(false);
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.element.tagName).toBe('DIV');
      expect(card.attributes('aria-pressed')).toBeUndefined();
    }
    expect(w.find('.hint').exists()).toBe(false);
    // You are a member here, so 51.1 adds the reason after the visible label.
    expect(w.get('button.invite').text()).toBe('InviteOnly the leader can invite.');
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
    const [mara, bo] = w.findAll('.member-card');
    expect(mara.get('.member-level').text()).toBe('Lv 4 · 12 st');
    expect(mara.get('.member-level').attributes('title')).toBe('Stamina 12 of 40');
    expect(mara.get('.stamina-sr').text()).toBe('Stamina 12 of 40');
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
    const [mara, bo] = w.findAll('.member-card');
    expect(mara.get('.member-stamina').classes()).toContain('low');
    expect(mara.find('.low-icon').exists()).toBe(true);
    expect(mara.get('.member-level').text()).toBe('Lv 4 · 3 st');
    expect(mara.get('.stamina-sr').text()).toBe('Stamina 3 of 40, too low to travel');
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
    const [mara, bo] = w.findAll('.member-card');
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
    const [raceMara, raceBo] = racial.w.findAll('.member-card');
    expect(raceMara.find('.low-icon').exists()).toBe(false);
    expect(raceBo.find('.low-icon').exists()).toBe(true);
  });

  it('shows no stamina text for a member with no character row', () => {
    const { w } = mountBlock({ group, groupMembers, knownCharacters: [character(3n, 'Bo')] });
    const [unknown] = w.findAll('.member-card');
    expect(unknown.find('.member-stamina').exists()).toBe(false);
    expect(unknown.find('.stamina-sr').exists()).toBe(false);
  });

  it('uses the shared stamina rule and the con-red token in source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/rails/PartyBlock.vue'), 'utf8');
    // The member card markup (and its stamina text) moved into src/social/MemberCard.vue (51.1-13).
    const card = readFileSync(resolve(process.cwd(), 'src/social/MemberCard.vue'), 'utf8');
    expect(card).toContain('too low to travel');
    expect(source).toContain('MemberCard');
    expect(source).toContain('PhWarningCircle');
    expect(source).toContain('var(--color-con-red)');
    const party = readFileSync(resolve(process.cwd(), 'src/rails/party.ts'), 'utf8');
    expect(party).toContain('@game-data/travel_config');
    expect(party).not.toMatch(/5n|10n/);
  });
});

// 51.1-UI-SPEC "Vitals Rail Party Block (desktop)", out of combat, order 3-11: the gated Invite, the
// follow summary and stamina warning, member cards with their pets, Loot: personal, Invited · waiting
// and the incoming invite card.
describe('PartyBlock out of combat (51.1)', () => {
  const ME = 1n;
  const MARA = 2n;
  const BO = 3n;
  const CY = 4n;
  const DEE = 5n;

  function live(id: bigint, name: string, over: Record<string, unknown> = {}) {
    return character(id, name, { race: 'Human', online: true, locationId: 10n, groupId: 1n, ...over });
  }

  function followMember(id: bigint, characterId: bigint, joined: bigint, followLeader = true) {
    return { ...member(id, characterId, joined), followLeader };
  }

  function pet(characterId: bigint, name: string) {
    return { id: characterId + 100n, characterId, name, level: 2n, currentHp: 8n, maxHp: 10n, expiresAtMicros: null };
  }

  function invite(id: bigint, to: bigint) {
    return { id, groupId: 1n, fromCharacterId: ME, toCharacterId: to, createdAt: { microsSinceUnixEpoch: 0n } };
  }

  // You lead Bo and Mara (Bo joined first).
  function leading(over: Setup = {}): Setup {
    return {
      group: { id: 1n, leaderCharacterId: ME },
      groupMembers: [followMember(11n, ME, 100n), followMember(12n, BO, 200n), followMember(13n, MARA, 300n)],
      knownCharacters: [live(MARA, 'Mara'), live(BO, 'Bo', { maxMana: 0n, mana: 0n, className: 'Warrior' })],
      self: live(ME, 'Ann'),
      ...over,
    };
  }

  // Mara leads; you are a member.
  function following(over: Setup = {}): Setup {
    return {
      group: { id: 1n, leaderCharacterId: MARA },
      groupMembers: [followMember(11n, ME, 100n), followMember(12n, BO, 200n), followMember(13n, MARA, 300n)],
      knownCharacters: [live(MARA, 'Mara'), live(BO, 'Bo')],
      self: live(ME, 'Ann'),
      ...over,
    };
  }

  function childClasses(el: Element): string[] {
    return Array.from(el.children).map((child) => child.className.split(' ')[0]);
  }

  it('solo: Party, Invite enabled, Not in a party. and no summary, warning or Loot line', () => {
    const { w } = mountBlock({ self: live(ME, 'Ann', { groupId: undefined }) });
    expect(w.get('h6').text()).toBe('Party');
    const invite = w.get('button.invite');
    expect(invite.attributes('aria-disabled')).toBeUndefined();
    expect(invite.attributes('title')).toBeUndefined();
    expect(w.text()).toContain('Not in a party.');
    expect(w.find('.summary').exists()).toBe(false);
    expect(w.find('.warning').exists()).toBe(false);
    expect(w.find('.loot').exists()).toBe(false);
    expect(w.text()).not.toContain('Loot');
  });

  it('the Party heading is focusable by script only', () => {
    const { w } = mountBlock();
    expect(w.get('.party-head h6').attributes('tabindex')).toBe('-1');
  });

  it('leader of 3: Party · 3, Invite enabled, the summary, cards in order and Loot: personal', () => {
    const { w } = mountBlock(leading());
    expect(w.get('h6').text()).toBe('Party · 3');
    expect(w.get('button.invite').attributes('aria-disabled')).toBeUndefined();
    expect(w.get('.summary').text()).toBe('2 of 2 travel with you');
    expect(w.find('.summary svg').exists()).toBe(true);
    expect(w.findAll('.member-card').map((c) => c.get('.member-name').text())).toEqual(['Bo', 'Mara']);
    const loot = w.get('.loot');
    expect(loot.element.tagName).toBe('P');
    expect(loot.attributes('title')).toBe('Each fighter rolls their own loot.');
    expect(loot.get('.sr-only').text()).toBe('Each fighter rolls their own loot.');
    expect(loot.text()).toContain('Loot: personal');
    expect(loot.find('button').exists()).toBe(false);
    expect(w.text()).not.toContain('Not in a party.');
  });

  it('places the summary after the header and before the cards, Loot after the cards', () => {
    const { w } = mountBlock(leading());
    const kids = childClasses(w.get('section.party').element);
    expect(kids.indexOf('party-head')).toBeLessThan(kids.indexOf('summary'));
    expect(kids.indexOf('summary')).toBeLessThan(kids.indexOf('cards'));
    expect(kids.indexOf('cards')).toBeLessThan(kids.indexOf('loot'));
  });

  it('a summary names who stays behind', () => {
    const { w } = mountBlock(
      leading({
        groupMembers: [followMember(11n, ME, 100n), followMember(12n, BO, 200n, false), followMember(13n, MARA, 300n)],
      }),
    );
    expect(w.get('.summary').text()).toBe('1 of 2 travel with you · Bo stays behind');
  });

  it('a member reads the summary with the leader name and sees the follow icons', () => {
    const { w } = mountBlock(following());
    expect(w.get('.summary').text()).toBe('2 of 2 travel with Mara');
    const [mara, bo] = w.findAll('.member-card');
    expect(mara.get('.follow-icon').attributes('title')).toBe('Leader · others travel with them');
    expect(bo.get('.follow-icon').attributes('title')).toBe('Travels with the leader');
  });

  it('an offline member is muted, left behind and reads offline', () => {
    const { w } = mountBlock(
      leading({ knownCharacters: [live(MARA, 'Mara', { online: false }), live(BO, 'Bo')] }),
    );
    const mara = w.findAll('.member-card')[1];
    expect(mara.classes()).toContain('muted');
    expect(mara.get('.status-word').text()).toBe('offline');
    expect(mara.get('.follow-icon').attributes('title')).toBe("Follows the leader, but isn't with them");
    expect(w.get('.summary').text()).toBe('1 of 2 travel with you · Mara stays behind');
  });

  it('shows the stamina warning in con red when a traveller is short, and not otherwise', () => {
    const short = mountBlock(
      leading({ knownCharacters: [live(MARA, 'Mara', { stamina: 0n }), live(BO, 'Bo')] }),
    ).w;
    const warning = short.get('.warning');
    expect(warning.text()).toBe('Mara does not have enough stamina to travel.');
    expect(warning.find('svg').exists()).toBe(true);
    const kids = childClasses(short.get('section.party').element);
    expect(kids.indexOf('summary')).toBeLessThan(kids.indexOf('warning'));
    expect(kids.indexOf('warning')).toBeLessThan(kids.indexOf('cards'));
    wrapper?.unmount();
    const fine = mountBlock(leading()).w;
    expect(fine.find('.warning').exists()).toBe(false);
  });

  it('warns you about your own stamina', () => {
    const { w } = mountBlock(leading({ self: live(ME, 'Ann', { stamina: 0n }) }));
    expect(w.get('.warning').text()).toBe('You do not have enough stamina to travel.');
  });

  it('shows no summary or warning until your own row has applied', () => {
    const { w } = mountBlock(leading({ self: null }));
    expect(w.find('.summary').exists()).toBe(false);
    expect(w.find('.warning').exists()).toBe(false);
  });

  it('a member who is not the leader sees Invite aria-disabled with the reason', async () => {
    const { w, prefill } = mountBlock(following());
    const invite = w.get('button.invite');
    expect(invite.attributes('aria-disabled')).toBe('true');
    expect(invite.attributes('title')).toBe('Only the leader can invite.');
    expect(invite.get('.sr-only').text()).toBe('Only the leader can invite.');
    await invite.trigger('click');
    expect(prefill).not.toHaveBeenCalled();
  });

  it('a full party (members plus live invites) disables Invite with Your party is full.', async () => {
    const members = [
      followMember(11n, ME, 100n),
      followMember(12n, BO, 200n),
      followMember(13n, MARA, 300n),
      followMember(14n, CY, 400n),
    ];
    const known = [live(MARA, 'Mara'), live(BO, 'Bo'), live(CY, 'Cy'), live(DEE, 'Dee', { groupId: undefined })];
    const { w, prefill } = mountBlock(
      leading({
        groupMembers: members,
        knownCharacters: known,
        social: {
          outgoingInvites: ref([invite(30n, DEE)]) as never,
          inviteSecondsLeft: () => 120,
          characterById: (id: bigint) => (known.find((row) => row.id === id) ?? null) as never,
        },
      }),
    );
    const button = w.get('button.invite');
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('title')).toBe('Your party is full.');
    expect(button.get('.sr-only').text()).toBe('Your party is full.');
    await button.trigger('click');
    expect(prefill).not.toHaveBeenCalled();
  });

  it('an expired invite does not count toward the cap', async () => {
    const members = [
      followMember(11n, ME, 100n),
      followMember(12n, BO, 200n),
      followMember(13n, MARA, 300n),
      followMember(14n, CY, 400n),
    ];
    const { w, prefill } = mountBlock(
      leading({
        groupMembers: members,
        knownCharacters: [live(MARA, 'Mara'), live(BO, 'Bo'), live(CY, 'Cy')],
        social: { outgoingInvites: ref([invite(30n, DEE)]) as never, inviteSecondsLeft: () => 0 },
      }),
    );
    const button = w.get('button.invite');
    expect(button.attributes('aria-disabled')).toBeUndefined();
    await button.trigger('click');
    expect(prefill).toHaveBeenCalledWith('invite ');
  });

  it('puts each member pet row directly under that member card', () => {
    const boPet = pet(BO, 'Fang');
    const { w } = mountBlock(
      leading({ social: { petOf: (id: bigint) => (id === BO ? boPet : null) as never, petSecondsLeft: () => null } }),
    );
    const entries = w.findAll('.cards > .member-entry');
    expect(entries.map((entry) => childClasses(entry.element))).toEqual([['member-card', 'pet-row'], ['member-card']]);
    const row = w.get('.pet-row');
    expect(row.get('.sr-only').text()).toBe("Bo's pet");
    expect(row.get('.pet-name').text()).toBe('Fang');
  });

  it('shows Invited · waiting after the Loot line, and the invite card last', () => {
    const known = [live(MARA, 'Mara'), live(BO, 'Bo'), live(DEE, 'Dee', { groupId: undefined })];
    const { w } = mountBlock(
      leading({
        knownCharacters: known,
        social: {
          outgoingInvites: ref([invite(30n, DEE)]) as never,
          outgoingApplied: ref(true),
          inviteSecondsLeft: () => 120,
          characterById: (id: bigint) => (known.find((row) => row.id === id) ?? null) as never,
        },
      }),
    );
    const kids = childClasses(w.get('section.party').element);
    expect(kids.indexOf('loot')).toBeLessThan(kids.indexOf('outgoing'));
    expect(w.get('section.outgoing h6').text()).toBe('Invited · waiting');
    expect(kids[kids.length - 1]).toBe('invite-root');
  });

  it('shows the incoming invite card at the bottom while solo', () => {
    const mara = live(MARA, 'Mara');
    const { w } = mountBlock({
      self: live(ME, 'Ann', { groupId: undefined }),
      social: {
        incomingInvite: ref({
          id: 40n,
          groupId: 9n,
          fromCharacterId: MARA,
          toCharacterId: ME,
          createdAt: { microsSinceUnixEpoch: 0n },
        }) as never,
        inviteSecondsLeft: () => 200,
        characterById: (id: bigint) => (id === MARA ? mara : null) as never,
      },
    });
    const section = w.get('section.party').element;
    const last = section.lastElementChild as HTMLElement;
    expect(last.classList.contains('invite-root')).toBe(true);
    expect(last.querySelector('section.invite-card')).not.toBeNull();
    expect(section.textContent).toContain('Not in a party.');
  });

  it('every known member card has its ⋯ last, and no button holds a button', () => {
    const { w } = mountBlock(leading());
    for (const card of w.findAll('.member-card')) {
      const last = card.element.lastElementChild as HTMLElement;
      expect(last.classList.contains('player-menu')).toBe(true);
    }
    expect(w.findAll('.menu-opener').map((b) => b.attributes('aria-label'))).toEqual([
      'Actions for Bo',
      'Actions for Mara',
    ]);
    expect(w.findAll('button button')).toHaveLength(0);
  });

  it('an unknown member card has no ⋯', () => {
    const { w } = mountBlock(leading({ knownCharacters: [live(BO, 'Bo')] }));
    const [, unknown] = w.findAll('.member-card');
    expect(unknown.get('.member-name').text()).toBe('Member');
    expect(unknown.find('.player-menu').exists()).toBe(false);
  });

  it('after a member leaves, focus on their ⋯ moves to the next card ⋯, else the heading', async () => {
    const groupMembers = ref<unknown[]>([
      followMember(11n, ME, 100n),
      followMember(12n, BO, 200n),
      followMember(13n, MARA, 300n),
    ]);
    const { w } = mountBlock(leading({ groupMembers: groupMembers.value }));
    // Swap in a live ref after mount through the provided game object.
    const provided = (w.vm.$ as unknown as { provides: Record<symbol, GameData> }).provides[GAME_KEY as symbol];
    const members = provided.groupMembers as unknown as { value: unknown[] };
    const openers = w.findAll('.menu-opener');
    (openers[0].element as HTMLElement).focus();
    expect(document.activeElement).toBe(openers[0].element);
    members.value = [followMember(11n, ME, 100n), followMember(13n, MARA, 300n)];
    await nextTick();
    await nextTick();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Actions for Mara');
    members.value = [followMember(11n, ME, 100n)];
    await nextTick();
    await nextTick();
    expect(document.activeElement?.tagName).toBe('H6');
  });

  it('hides the summary, warning and Loot line in a fight', () => {
    const inert = createInertGame();
    const game = {
      ...inert,
      group: ref({ id: 1n, leaderCharacterId: ME }),
      groupMembers: ref([followMember(11n, ME, 100n), followMember(12n, BO, 200n)]),
      knownCharacters: ref([live(BO, 'Bo', { stamina: 0n })]),
      characterId: ref(ME),
      character: ref(live(ME, 'Ann')),
      combat: { ...inert.combat, active: ref(true) },
    } as unknown as GameData;
    wrapper = mount(PartyBlock, {
      global: { provide: { [GAME_KEY as symbol]: game, [SOCIAL_KEY as symbol]: createInertSocial() } },
    });
    expect(wrapper.find('.summary').exists()).toBe(false);
    expect(wrapper.find('.warning').exists()).toBe(false);
    expect(wrapper.find('.loot').exists()).toBe(false);
  });

  it('draws no loot-mode control, vote-to-kick control or Trade entry', () => {
    const { w } = mountBlock(leading());
    const text = w.text();
    for (const banned of ['Round robin', 'Free for all', 'Vote', 'vote', 'Trade', 'Withdraw']) {
      expect(text).not.toContain(banned);
    }
    const source = readFileSync(resolve(process.cwd(), 'src/rails/PartyBlock.vue'), 'utf8');
    expect(source).not.toMatch(/Round robin|Free for all|[Vv]ote to kick|Trade/);
  });

  it('wraps the summary and the warning inside the rail and reads the shared cap', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/rails/PartyBlock.vue'), 'utf8');
    expect(source).toContain('overflow-wrap: anywhere');
    expect(source).toContain('partyTravelView(');
    expect(source).toContain('MAX_GROUP_SIZE');
    expect(source).toContain('@game-data/group_config');
  });
});
