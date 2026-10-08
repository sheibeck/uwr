// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { MAX_LEVEL } from '@game-data/xp';
import VitalsStrip from './VitalsStrip.vue';
import {
  COMBAT_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertCombat,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { CombatController, FrameControls, GameData } from '../game/context';
import { SOCIAL_KEY, createInertSocial } from '../social/socialContext';
import type { SocialData } from '../social/socialContext';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function mountStrip(
  overrides: Record<string, unknown> = {},
  game?: Record<string, unknown>,
  openScreen: FrameControls['openScreen'] = () => {},
): VueWrapper {
  const provide = game
    ? {
        [GAME_KEY as symbol]: { ...createInertGame(), ...game } as unknown as GameData,
        [FRAME_KEY as symbol]: { ...createInertFrame(), openScreen } as FrameControls,
      }
    : undefined;
  wrapper = mount(VitalsStrip, {
    global: provide ? { provide } : undefined,
    props: {
      name: 'Brannoch the Wanderer',
      avatarInitial: 'B',
      classLine: 'Lv 6 · Ranger',
      hp: 212n,
      maxHp: 260n,
      mana: 140n,
      maxMana: 280n,
      stamina: 60n,
      maxStamina: 0n,
      levelUp: false,
      newSkill: false,
      ...overrides,
    },
  });
  return wrapper;
}

describe('VitalsStrip normal variant', () => {
  it('shows the avatar, the name with a full-name title and the class line', () => {
    const w = mountStrip();
    expect(w.get('.avatar').text()).toBe('B');
    expect(w.get('.name').text()).toBe('Brannoch the Wanderer');
    expect(w.get('.name').attributes('title')).toBe('Brannoch the Wanderer');
    expect(w.get('.class-line').text()).toBe('Lv 6 · Ranger');
  });

  it('shows HP, MP and SP micro labels over three bars plus the XP line', () => {
    const w = mountStrip();
    expect(w.findAll('.micro-label').map((l) => l.text())).toEqual(['HP 212', 'MP 140', 'SP 60']);
    const bars = w.findAll('[role="progressbar"]');
    // Phase 45 asserted 3 bars; the 2px XP line (47-08) is the fourth.
    expect(bars).toHaveLength(4);
    expect(bars.map((b) => b.attributes('aria-label'))).toEqual(['Health', 'Mana', 'Stamina', 'Experience']);
  });

  it('sets fill widths from barFraction (max 0 gives 0%)', () => {
    const w = mountStrip();
    const fills = w.findAll('.fill');
    expect((fills[0].element as HTMLElement).style.width).toBe(`${(212 / 260) * 100}%`);
    expect((fills[1].element as HTMLElement).style.width).toBe('50%');
    expect((fills[2].element as HTMLElement).style.width).toBe('0%');
  });

  it('hides both tags by default', () => {
    const w = mountStrip();
    expect(w.find('.tag').exists()).toBe(false);
  });

  it('shows the Level up outline tag when levelUp is true', () => {
    const w = mountStrip({ levelUp: true });
    const tag = w.get('.tag.tag-outline');
    expect(tag.text()).toBe('Level up');
    expect(w.find('.tag.tag-accent').exists()).toBe(false);
  });

  it('shows the New skill accent tag when newSkill is true, after Level up', () => {
    const w = mountStrip({ levelUp: true, newSkill: true });
    const tags = w.findAll('.tag');
    expect(tags.map((t) => t.text())).toEqual(['Level up', 'New skill']);
    expect(tags[1].classes()).toContain('tag-accent');
  });

  it('renders the tags as non-interactive spans', () => {
    const w = mountStrip({ levelUp: true, newSkill: true });
    for (const tag of w.findAll('.tag')) {
      expect(tag.element.tagName).toBe('SPAN');
      expect(tag.attributes('tabindex')).toBeUndefined();
    }
  });

  it('escapes the character name as text', () => {
    const w = mountStrip({ name: '<b>x</b>' });
    expect(w.find('.name b').exists()).toBe(false);
    expect(w.get('.name').text()).toBe('<b>x</b>');
  });
});

describe('VitalsStrip compact variant', () => {
  it('shows the name and exactly two progress bars (HP and MP)', () => {
    const w = mountStrip({ compact: true, levelUp: true, newSkill: true });
    expect(w.get('.name').text()).toBe('Brannoch the Wanderer');
    const bars = w.findAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.attributes('aria-label'))).toEqual(['Health', 'Mana']);
  });

  it('has no tags, no SP and no avatar', () => {
    const w = mountStrip({ compact: true, levelUp: true, newSkill: true });
    expect(w.find('.tag').exists()).toBe(false);
    expect(w.find('.avatar').exists()).toBe(false);
    expect(w.text()).not.toContain('SP');
  });

  it('keeps fill widths following barFraction', () => {
    const w = mountStrip({ compact: true, hp: 300n, maxHp: 260n, mana: 5n, maxMana: 0n });
    const fills = w.findAll('.fill');
    expect((fills[0].element as HTMLElement).style.width).toBe('100%');
    expect((fills[1].element as HTMLElement).style.width).toBe('0%');
  });
});

describe('VitalsStrip source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsStrip.vue'), 'utf8');

  it('carries the spec layout values and tag classes', () => {
    expect(source).toContain('tag-outline');
    expect(source).toContain('tag-accent');
    expect(source).toContain('repeat(3, 1fr)');
    expect(source).toContain('padding: 16px 16px 8px');
    expect(source).toContain('tabular-nums');
  });

  it('opens the Social sheet from the chips and scrolls the chip row sideways', () => {
    expect(source).toContain("openScreen('social')");
    expect(source).toContain('scrollbar-width: none');
    expect(source).toContain('overflow-x: auto');
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

function ch(id: bigint, name: string, over: Record<string, unknown> = {}) {
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

function gm(id: bigint, characterId: bigint, joined: bigint) {
  return { id, groupId: 1n, characterId, joinedAt: { microsSinceUnixEpoch: joined } };
}

function partyGame(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    characterId: ref(1n),
    group: ref({ id: 1n, leaderCharacterId: 2n }),
    groupMembers: ref([gm(1n, 1n, 1n), gm(2n, 2n, 2n), gm(3n, 3n, 3n)]),
    knownCharacters: ref([ch(2n, 'Mara'), ch(3n, 'Bo', { hp: 50n })]),
    ...over,
  };
}

describe('VitalsStrip experience line', () => {
  it('is a labelled progressbar with a title and no text', () => {
    const w = mountStrip({}, { character: ref({ id: 1n, level: 3n, xp: 318n }) });
    const line = w.get('.xp-line');
    expect(line.attributes('role')).toBe('progressbar');
    expect(line.attributes('aria-label')).toBe('Experience');
    expect(line.attributes('title')).toBe('XP 58 / 220');
    expect(line.text()).toBe('');
    expect((w.get('.xp-fill').element as HTMLElement).style.width).toBe(`${(58 / 220) * 100}%`);
  });

  it('is full with an XP Max level title at the maximum level', () => {
    const w = mountStrip({}, { character: ref({ id: 1n, level: MAX_LEVEL, xp: 5000n }) });
    expect(w.get('.xp-line').attributes('title')).toBe('XP Max level');
    expect((w.get('.xp-fill').element as HTMLElement).style.width).toBe('100%');
  });

  it('is empty with no character', () => {
    const w = mountStrip();
    expect(w.get('.xp-line').attributes('title')).toBe('XP 0 / 0');
    expect((w.get('.xp-fill').element as HTMLElement).style.width).toBe('0%');
  });
});

describe('VitalsStrip crown', () => {
  it('shows the filled crown after the name for the leader only', () => {
    const lead = mountStrip({}, { characterId: ref(1n), group: ref({ id: 1n, leaderCharacterId: 1n }) });
    expect(lead.find('.name-row .crown').exists()).toBe(true);
    lead.unmount();
    const other = mountStrip({}, partyGame());
    expect(other.find('.name-row .crown').exists()).toBe(false);
  });
});

describe('VitalsStrip chip row', () => {
  it('is absent with no party and no effects', () => {
    const w = mountStrip({}, { characterId: ref(1n) });
    expect(w.find('.chip-row').exists()).toBe(false);
  });

  it('shows Party n, a Name pct chip per member, then the effect chips', () => {
    const w = mountStrip({}, partyGame({ effects: ref([fx(1n, 1n)]), inCombat: ref(true) }));
    const row = w.get('.chip-row');
    const party = row.get('.party-chip');
    expect(party.element.tagName).toBe('BUTTON');
    expect(party.text()).toBe('Party 3');
    expect(row.findAll('.member-chip').map((c) => c.text())).toEqual(['Mara 95%', 'Bo 50%']);
    const effect = row.get('.effect-chips .tag');
    expect(effect.element.tagName).toBe('SPAN');
    expect(effect.text()).toBe('Bless · 3 rounds');
    const kids = Array.from(row.element.children).map((e) => e.className);
    expect(kids[0]).toContain('party-chip');
    expect(kids[1]).toContain('member-chip');
    expect(kids[3]).toContain('effect-chips');
  });

  it('shows the leader crown before Party n when the player leads', () => {
    const w = mountStrip({}, partyGame({ group: ref({ id: 1n, leaderCharacterId: 1n }) }));
    expect(w.find('.party-chip .crown').exists()).toBe(true);
  });

  it('renders for effects alone, without the party chips', () => {
    const w = mountStrip(
      {},
      {
        characterId: ref(1n),
        effects: ref([fx(1n, 1n), fx(2n, 1n, { effectType: 'stun', magnitude: 1n })]),
      },
    );
    expect(w.find('.chip-row').exists()).toBe(true);
    expect(w.find('.party-chip').exists()).toBe(false);
    expect(w.findAll('.effect-chips .tag')).toHaveLength(2);
  });

  it('opens the Social sheet from the party chip and member chips only', async () => {
    const openScreen = vi.fn();
    const w = mountStrip({}, partyGame({ effects: ref([fx(1n, 1n)]) }), openScreen);
    await w.get('.party-chip').trigger('click');
    await w.findAll('.member-chip')[1].trigger('click');
    expect(openScreen).toHaveBeenCalledTimes(2);
    expect(openScreen).toHaveBeenNthCalledWith(1, 'social');
    expect(openScreen).toHaveBeenNthCalledWith(2, 'social');
    await w.get('.effect-chips .tag').trigger('click');
    expect(openScreen).toHaveBeenCalledTimes(2);
  });

  it('keeps a long chip list in one non-wrapping row (6 effects, 4 members)', () => {
    const members = [gm(1n, 1n, 1n), ...[2n, 3n, 4n, 5n].map((id) => gm(id, id, id))];
    const w = mountStrip(
      {},
      partyGame({
        groupMembers: ref(members),
        knownCharacters: ref([2n, 3n, 4n, 5n].map((id) => ch(id, `Member ${id}`))),
        effects: ref([1n, 2n, 3n, 4n, 5n, 6n].map((id) => fx(id, 1n))),
      }),
    );
    expect(w.findAll('.member-chip')).toHaveLength(4);
    expect(w.findAll('.effect-chips .tag')).toHaveLength(6);
    expect(w.get('.effect-chips').classes()).toContain('nowrap');
  });

  it('renders a member without a character row as a plain Member chip', () => {
    const w = mountStrip({}, partyGame({ knownCharacters: ref([ch(3n, 'Bo')]) }));
    expect(w.findAll('.member-chip').map((c) => c.text())).toEqual(['Member', 'Bo 95%']);
  });

  it('renders member and effect names as text, not markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const w = mountStrip(
      {},
      partyGame({
        knownCharacters: ref([ch(2n, payload), ch(3n, 'Bo')]),
        effects: ref([fx(1n, 1n, { sourceAbility: payload })]),
      }),
    );
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.member-chip').text()).toBe(`${payload} 95%`);
    expect(w.get('.effect-chips .tag').text()).toContain(payload);
  });
});

describe('VitalsStrip compact variant with party data', () => {
  it('stays HP and MP only: no XP line, no chip row', () => {
    const w = mountStrip({ compact: true }, partyGame({ effects: ref([fx(1n, 1n)]) }));
    expect(w.findAll('[role="progressbar"]')).toHaveLength(2);
    expect(w.find('.xp-line').exists()).toBe(false);
    expect(w.find('.chip-row').exists()).toBe(false);
  });
});

function combatGame(
  game: Record<string, unknown>,
  combat: { active?: boolean; roundNumber?: bigint | null } = {},
): Record<string, unknown> {
  const inert = createInertGame();
  return {
    ...game,
    combat: {
      ...inert.combat,
      active: ref(combat.active ?? true),
      roundNumber: ref(combat.roundNumber === undefined ? 3n : combat.roundNumber),
    },
  };
}

function mountCombat(
  game: Record<string, unknown>,
  opts: {
    active?: boolean;
    roundNumber?: bigint | null;
    allyTargetId?: bigint | null;
    props?: Record<string, unknown>;
    social?: Partial<SocialData>;
    attach?: boolean;
  } = {},
): {
  w: VueWrapper;
  selectAlly: ReturnType<typeof vi.fn>;
  openScreen: ReturnType<typeof vi.fn>;
  allyTargetId: ReturnType<typeof ref<bigint | null>>;
} {
  const selectAlly = vi.fn();
  const allyTargetId = ref<bigint | null>(opts.allyTargetId === undefined ? 1n : opts.allyTargetId);
  const controller = { ...createInertCombat(), allyTargetId, selectAlly } as unknown as CombatController;
  const openScreen = vi.fn();
  wrapper = mount(VitalsStrip, {
    attachTo: opts.attach ? document.body : undefined,
    global: {
      provide: {
        [GAME_KEY as symbol]: {
          ...createInertGame(),
          ...combatGame(game, { active: opts.active, roundNumber: opts.roundNumber }),
        } as unknown as GameData,
        [FRAME_KEY as symbol]: { ...createInertFrame(), openScreen } as FrameControls,
        [COMBAT_KEY as symbol]: controller,
        [SOCIAL_KEY as symbol]: { ...createInertSocial(), ...opts.social } as SocialData,
      },
    },
    props: {
      name: 'Brannoch the Wanderer',
      avatarInitial: 'B',
      classLine: 'Lv 6 · Ranger',
      hp: 212n,
      maxHp: 260n,
      mana: 140n,
      maxMana: 280n,
      stamina: 60n,
      maxStamina: 0n,
      levelUp: false,
      newSkill: false,
      ...opts.props,
    },
  });
  return { w: wrapper, selectAlly, allyTargetId, openScreen };
}

// Review client-rest WR-03: the self target and the grid cards exist only in a fight; focus held on
// one that goes moves to the next card, the self target, the Party chip or the strip, never body.
describe('VitalsStrip focus across the fight boundary', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  function provided(w: VueWrapper): { combat: { active: { value: boolean } }; groupMembers: { value: unknown[] } } {
    return (w.vm.$ as unknown as { provides: Record<symbol, unknown> }).provides[GAME_KEY as symbol] as never;
  }

  it('solo: the fight ending while the self target has focus moves focus to the strip', async () => {
    const { w } = mountCombat({ characterId: ref(1n), character: ref(ch(1n, 'Brannoch')) }, { attach: true });
    (w.get('button.self-target').element as HTMLElement).focus();
    provided(w).combat.active.value = false;
    await nextTick();
    await nextTick();
    expect(w.find('button.self-target').exists()).toBe(false);
    expect(document.activeElement).toBe(w.get('section.vitals-strip').element);
    expect(w.get('section.vitals-strip').attributes('tabindex')).toBe('-1');
  });

  it('in a party: the fight ending while the self target has focus moves focus to the Party chip', async () => {
    const { w } = mountCombat(partyGame({ character: ref(ch(1n, 'Brannoch')) }), { attach: true });
    (w.get('button.self-target').element as HTMLElement).focus();
    provided(w).combat.active.value = false;
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('button.party-chip').element);
  });

  it('a member leaving mid-fight while his card has focus moves focus to the next card, else the self target', async () => {
    const { w } = mountCombat(partyGame({ character: ref(ch(1n, 'Brannoch')) }), { attach: true });
    const cards = w.findAll('button.ally-card');
    expect(cards).toHaveLength(2);
    (cards[0].element as HTMLElement).focus();
    const members = provided(w).groupMembers;
    members.value = [gm(1n, 1n, 1n), gm(3n, 3n, 3n)];
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('button.ally-card').element);
    members.value = [gm(1n, 1n, 1n)];
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.get('button.self-target').element);
  });

  it('the fight ending while a grid card has focus moves focus to that member chip', async () => {
    const { w } = mountCombat(partyGame({ character: ref(ch(1n, 'Brannoch')) }), { attach: true });
    (w.findAll('button.ally-card')[1].element as HTMLElement).focus();
    provided(w).combat.active.value = false;
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(w.findAll('button.member-chip')[1].element);
  });
});

describe('VitalsStrip In combat tag', () => {
  it('shows the tag first in the tags container, before Level up and New skill', () => {
    const { w } = mountCombat(partyGame(), { props: { levelUp: true, newSkill: true } });
    const tags = w.get('.tags');
    const first = tags.element.children[0] as HTMLElement;
    expect(first.classList.contains('in-combat-tag')).toBe(true);
    expect(first.getAttribute('aria-label')).toBe('In combat, round 3');
    expect(Array.from(tags.element.children).map((e) => e.textContent?.trim())).toEqual([
      'In combat · Round 3',
      'Level up',
      'New skill',
    ]);
  });

  it('is absent while combat.active is false, even with inCombat true', () => {
    const { w } = mountCombat(partyGame({ inCombat: ref(true) }), { active: false, props: { levelUp: true } });
    expect(w.find('.in-combat-tag').exists()).toBe(false);
    expect(w.get('.tags').text()).toBe('Level up');
  });

  it('shows the plain tag when the round is not known yet', () => {
    const { w } = mountCombat(partyGame(), { roundNumber: null });
    expect(w.get('.in-combat-tag').text()).toBe('In combat');
  });

  it('is absent from the compact variant', () => {
    const { w } = mountCombat(partyGame(), { props: { compact: true } });
    expect(w.find('.in-combat-tag').exists()).toBe(false);
  });
});

// Phase 48 had a 'VitalsStrip ally chips' block here (Party n, You and Name % chips in combat). 51.1-15
// replaces the combat chip row with the self row target, row 3 (your chips and pet tag) and the party
// grid (UI-SPEC Supersedes). Each old case is rewritten below; the 'Was:' comments name it.
const SELF = { id: 1n, level: 3n, xp: 318n };
const SELF_LABEL =
  'Target yourself with your next ability. Health 212 of 260, mana 140 of 280, stamina 60 of 0.';

function myPet(over: Record<string, unknown> = {}) {
  return {
    id: 101n,
    characterId: 1n,
    combatId: 1n,
    name: 'Ember',
    level: 2n,
    currentHp: 30n,
    maxHp: 40n,
    attackDamage: 4n,
    expiresAtMicros: null,
    ...over,
  };
}

// A combat game where the active character row exists (the self row needs it).
function selfGame(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { characterId: ref(1n), character: ref(SELF), ...over };
}

describe('VitalsStrip self row in combat (51.1-15)', () => {
  // Was: 'presses the You chip by default and marks it selected'.
  it('makes the self row one pressed button with the three vitals in its label and the crosshair', () => {
    const { w } = mountCombat(selfGame());
    const self = w.get('button.self-target');
    expect(self.attributes('type')).toBe('button');
    expect(self.attributes('aria-pressed')).toBe('true');
    expect(self.attributes('aria-label')).toBe(SELF_LABEL);
    expect(self.find('.self-marker').exists()).toBe(true);
    expect(self.classes()).toContain('selected');
    // avatar, name through CharacterName, class line: all in the button
    expect(self.get('.avatar').text()).toBe('B');
    expect(self.get('.character-name').text()).toBe('Brannoch the Wanderer');
    expect(self.get('.character-name').attributes('title')).toBe('Brannoch the Wanderer');
    expect(self.get('.class-line').text()).toBe('Lv 6 · Ranger');
  });

  it('puts the crown inside the button for the leader', () => {
    const { w } = mountCombat(selfGame({ group: ref({ id: 1n, leaderCharacterId: 1n }) }));
    expect(w.find('button.self-target .crown').exists()).toBe(true);
  });

  it('keeps the tags as siblings after the button on the same row, never inside it', () => {
    const { w } = mountCombat(selfGame(), { props: { levelUp: true, newSkill: true } });
    const row = w.get('.identity-row');
    const kids = Array.from(row.element.children).map((el) => el.className);
    expect(kids).toHaveLength(2);
    expect(kids[0]).toContain('self-target');
    expect(kids[1]).toContain('tags');
    expect(w.find('button.self-target .in-combat-tag').exists()).toBe(false);
    expect(w.get('.tags').element.children[0].classList.contains('in-combat-tag')).toBe(true);
    expect(w.get('.tags').text()).toContain('Level up');
    expect(w.get('.tags').text()).toContain('New skill');
  });

  it('hides the XP line in combat, with or without the character row', () => {
    expect(mountCombat(selfGame()).w.find('.xp-line').exists()).toBe(false);
    wrapper?.unmount();
    expect(mountCombat({ characterId: ref(1n) }).w.find('.xp-line').exists()).toBe(false);
  });

  // Was: 'calls selectAlly with the tapped chip id' (the You chip half).
  it('calls selectAlly with your id and follows allyTargetId', async () => {
    const { w, selectAlly, allyTargetId } = mountCombat(selfGame(), { allyTargetId: 2n });
    const self = () => w.get('button.self-target');
    expect(self().attributes('aria-pressed')).toBe('false');
    expect(self().classes()).not.toContain('selected');
    expect(self().find('.self-marker').exists()).toBe(false);
    await self().trigger('click');
    expect(selectAlly).toHaveBeenCalledTimes(1);
    expect(selectAlly).toHaveBeenCalledWith(1n);
    allyTargetId.value = 1n;
    await nextTick();
    expect(self().attributes('aria-pressed')).toBe('true');
    expect(self().find('.self-marker').exists()).toBe(true);
  });

  it('is not a button out of combat or before the character row exists', () => {
    expect(mountCombat(selfGame(), { active: false }).w.find('button.self-target').exists()).toBe(false);
    wrapper?.unmount();
    const { w } = mountCombat({ characterId: ref(1n) });
    expect(w.find('button.self-target').exists()).toBe(false);
    // the identity row is still there, as plain markup, with the tag
    expect(w.get('.identity-row .avatar').text()).toBe('B');
    expect(w.find('.in-combat-tag').exists()).toBe(true);
  });

  it('keeps the out-of-combat identity row as plain markup (no wrapper) with the XP line', () => {
    const { w } = mountCombat(selfGame(), { active: false });
    const kids = Array.from(w.get('.identity-row').element.children).map((el) => el.className);
    expect(kids[0]).toContain('avatar');
    expect(kids[2]).toContain('tags');
    expect(w.find('.xp-line').exists()).toBe(true);
    expect(w.get('.name').element.tagName).toBe('DIV');
  });

  it('is unchanged in the compact variant', () => {
    const { w } = mountCombat(selfGame({ effects: ref([fx(1n, 1n)]) }), { props: { compact: true } });
    expect(w.find('button').exists()).toBe(false);
    expect(w.find('.self-target').exists()).toBe(false);
    expect(w.find('.row3').exists()).toBe(false);
    expect(w.findAll('[role="progressbar"]')).toHaveLength(2);
  });

  it('renders the name as text, not markup', () => {
    const { w } = mountCombat(selfGame(), { props: { name: '<img src=x onerror=alert(1)>' } });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('button.self-target .character-name').text()).toBe('<img src=x onerror=alert(1)>');
  });

  it('holds no nested button', () => {
    const { w } = mountCombat(selfGame({ effects: ref([fx(1n, 1n)]) }), { props: { levelUp: true } });
    expect(w.findAll('button button')).toHaveLength(0);
  });
});

describe('VitalsStrip row 3 in combat (51.1-15)', () => {
  // Was: 'has no You chip and no targeting when solo with effects'.
  it('solo with effects and a timed pet: chips on the left, a non-button pet tag on the right, no grid', () => {
    const timed = myPet({ expiresAtMicros: 9_000_000n });
    const { w } = mountCombat(
      selfGame({ effects: ref([fx(1n, 1n), fx(2n, 1n, { effectType: 'stun', magnitude: 1n })]) }),
      { social: { petOf: (id: bigint) => (id === 1n ? (timed as never) : null), petSecondsLeft: () => 125 } },
    );
    const row = w.get('.row3');
    expect(w.findAll('.row3')).toHaveLength(1);
    const kids = Array.from(row.element.children);
    expect(kids[0].querySelector('.effect-chips')).not.toBeNull();
    expect(row.findAll('.effect-chips .tag')).toHaveLength(2);
    const tag = row.get('.pet-tag');
    expect(tag.element.tagName).toBe('SPAN');
    expect(tag.element.parentElement).toBe(row.element);
    expect(row.element.lastElementChild).toBe(tag.element);
    expect(tag.attributes('tabindex')).toBeUndefined();
    expect(tag.get('.sr-only').text()).toContain('Your pet Ember, health 75 percent');
    expect(row.find('button').exists()).toBe(false);
    expect(w.find('.party-grid').exists()).toBe(false);
    expect(w.find('.ally-card').exists()).toBe(false);
    expect(w.find('.ally-chip').exists()).toBe(false);
    expect(w.find('.party-chip').exists()).toBe(false);
    expect(w.text()).not.toMatch(/\bYou\b/);
  });

  it('shows the pet tag alone, pushed right, when you have a pet and no effects', () => {
    const { w } = mountCombat(selfGame(), {
      social: { petOf: (id: bigint) => (id === 1n ? (myPet() as never) : null), petSecondsLeft: () => null },
    });
    const row = w.get('.row3');
    expect(row.find('.effect-chips').exists()).toBe(false);
    expect(row.find('.pet-tag').exists()).toBe(true);
  });

  it('shows the effect chips alone when you have effects and no pet', () => {
    const { w } = mountCombat(selfGame({ effects: ref([fx(1n, 1n)]) }));
    const row = w.get('.row3');
    expect(row.findAll('.effect-chips .tag')).toHaveLength(1);
    expect(row.find('.pet-tag').exists()).toBe(false);
    expect(row.get('.effect-chips').classes()).toContain('nowrap');
  });

  it('has no row 3 with no effects and no pet', () => {
    const { w } = mountCombat(selfGame());
    expect(w.find('.row3').exists()).toBe(false);
    expect(w.find('.chip-row').exists()).toBe(false);
  });

  it('keeps the Phase 47 chip row out of combat and shows no pet tag there', async () => {
    const { w, selectAlly, openScreen } = mountCombat(
      partyGame(selfGame({ inCombat: ref(true) })),
      {
        active: false,
        social: { petOf: () => myPet() as never, petSecondsLeft: () => null },
      },
    );
    const party = w.get('.party-chip');
    expect(party.element.tagName).toBe('BUTTON');
    expect(party.text()).toBe('Party 3');
    expect(w.findAll('.member-chip').map((c) => c.text())).toEqual(['Mara 95%', 'Bo 50%']);
    expect(w.find('.row3').exists()).toBe(false);
    expect(w.find('.pet-tag').exists()).toBe(false);
    expect(w.find('.ally-card').exists()).toBe(false);
    await w.get('.member-chip').trigger('click');
    expect(selectAlly).not.toHaveBeenCalled();
    expect(openScreen).toHaveBeenCalledWith('social');
  });

  it('has no chip row, no Party n text and no You chip in combat in a party', () => {
    const { w } = mountCombat(partyGame(selfGame({ effects: ref([fx(1n, 1n)]) })));
    expect(w.find('.chip-row').exists()).toBe(false);
    expect(w.find('.party-chip').exists()).toBe(false);
    expect(w.find('.ally-chip').exists()).toBe(false);
    expect(w.text()).not.toContain('Party 3');
  });

  it('is out of the compact variant', () => {
    const { w } = mountCombat(partyGame(selfGame()), { props: { compact: true } });
    expect(w.find('.chip-row').exists()).toBe(false);
    expect(w.find('.row3').exists()).toBe(false);
    expect(w.find('.ally-card').exists()).toBe(false);
  });

  describe('source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsStrip.vue'), 'utf8');

    it('wires the controller, the tags, the pet tag and the self row 44px rules without negative margins', () => {
      expect(source).toContain('InCombatTag');
      expect(source).toContain('PetTag');
      expect(source).toContain('selectAlly');
      expect(source).toContain('self-target');
      expect(source).toContain('with your next ability');
      expect(source).toContain('PhCrosshairSimple');
      expect(source).toContain('min-height: 44px');
      expect(source).toContain('padding: 4px 0');
      expect(source).toContain('inset: 0 -4px');
      expect(source).toContain('min-height: 28px');
      expect(source).toContain('inset 0 0 0 1px var(--color-accent)');
      expect(source).not.toMatch(/margin:[^;]*-\d/);
      expect(source).not.toContain('calc(-1');
    });

    it('gates combat on combat.active and reads inCombat only for the effect chips', () => {
      expect(source).toContain('game.combat.active.value');
      expect(source.match(/game\.inCombat\.value/g)).toHaveLength(1);
    });
  });
});

// The party grid (51.1-15, task 2). Each Phase 48 chip case is rewritten here:
//   'shows Party n as plain text, then You, then one button per member, then the effects'
//        -> 'lists one 44px card per other member, in partyMembers order'
//   'calls selectAlly with the tapped chip id and follows allyTargetId' -> 'selects the tapped card'
//   'never opens the Social sheet from a chip in combat' -> same, on the cards
//   'renders an unknown member as a non-interactive Member chip' -> the unknown div card
//   'renders names as text, not markup' -> the grid cards
//   'keeps the long row in one sideways-scrolling line' -> the four-member wrap and one chip plus +N
//   'stays out of the compact variant' -> the Task 1 compact case
function online(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return ch(id, name, { online: true, ...over });
}

function wolf(characterId: bigint, over: Record<string, unknown> = {}) {
  return myPet({ id: 200n + characterId, characterId, name: 'Wolf', currentHp: 18n, maxHp: 40n, ...over });
}

// Self (1), Mara the leader (2), Bo (3, with a pet and a buff), Cy (4, offline), Di (5, no character row).
function gridGame(over: Record<string, unknown> = {}): Record<string, unknown> {
  return selfGame({
    group: ref({ id: 1n, leaderCharacterId: 2n }),
    groupMembers: ref([gm(1n, 1n, 1n), gm(2n, 2n, 2n), gm(3n, 3n, 3n), gm(4n, 4n, 4n), gm(5n, 5n, 5n)]),
    knownCharacters: ref([
      online(2n, 'Mara'),
      online(3n, 'Bo', { hp: 50n }),
      ch(4n, 'Cy', { online: false }),
    ]),
    effects: ref([fx(1n, 3n)]),
    ...over,
  });
}

const BO_PET = { petOf: (id: bigint) => (id === 3n ? (wolf(3n) as never) : null), petSecondsLeft: () => null };

describe('VitalsStrip party grid in combat (51.1-15)', () => {
  it('lists one li per other member, in partyMembers order, under a Party label', () => {
    const { w } = mountCombat(gridGame(), { social: BO_PET });
    const grid = w.get('ul.party-grid');
    expect(grid.attributes('aria-label')).toBe('Party');
    const items = grid.findAll('li');
    expect(items).toHaveLength(4);
    expect(items.map((li) => li.get('.character-name').text())).toEqual(['Mara', 'Bo', 'Cy', 'Member']);
  });

  it('draws a known member as a button.ally-card with name, paw, percent, a 3px bar and one chip', () => {
    const { w } = mountCombat(gridGame(), { social: BO_PET });
    const bo = w.findAll('li')[1].get('button.ally-card');
    expect(bo.attributes('type')).toBe('button');
    expect(bo.attributes('aria-pressed')).toBe('false');
    expect(bo.get('.character-name').text()).toBe('Bo');
    const paw = bo.get('.paw');
    expect(paw.attributes('title')).toBe('Wolf 18/40');
    expect(paw.attributes('aria-hidden')).toBe('true');
    // Review IN-04: the title is on an element that shows a tooltip (a span), not on the svg.
    expect(paw.element.tagName).toBe('SPAN');
    expect(paw.find('svg').exists()).toBe(true);
    expect(paw.get('svg').attributes('title')).toBeUndefined();
    expect(bo.get('.pct').text()).toBe('50%');
    expect((bo.get('.fill-health').element as HTMLElement).style.width).toBe('50%');
    expect(bo.get('.track').attributes('aria-hidden')).toBe('true');
    expect(bo.findAll('.effect-chips .tag')).toHaveLength(1);
    expect(bo.get('.effect-chips').classes()).toEqual(expect.arrayContaining(['compact', 'nowrap']));
    expect(bo.attributes('aria-label')).toBe(
      'Target Bo with your next ability. Health 50 percent, pet Wolf health 18 of 40. Effects: Bless · 3 rounds.',
    );
    // name, then the paw, then the percent
    const top = bo.get('.card-top').element;
    expect(top.firstElementChild?.querySelector('.paw')).not.toBeNull();
    expect(top.lastElementChild?.classList.contains('pct')).toBe(true);
  });

  it('shows no paw for a member without a pet and no chip row when there are no effects', () => {
    const { w } = mountCombat(gridGame(), { social: BO_PET });
    const mara = w.findAll('li')[0].get('button.ally-card');
    expect(mara.find('.paw').exists()).toBe(false);
    expect(mara.find('.effect-chips').exists()).toBe(false);
    expect(mara.attributes('aria-label')).toBe('Target Mara with your next ability. Health 95 percent.');
  });

  it('mutes an offline member and keeps it a target, with ", offline" in its label', async () => {
    const { w, selectAlly } = mountCombat(gridGame(), { social: BO_PET });
    const cy = w.findAll('li')[2].get('button.ally-card');
    expect(cy.classes()).toContain('muted');
    expect(cy.attributes('aria-label')).toBe('Target Cy with your next ability. Health 95 percent, offline.');
    await cy.trigger('click');
    expect(selectAlly).toHaveBeenCalledWith(4n);
  });

  // Was: 'renders an unknown member as a non-interactive Member chip'.
  it('renders a member without a character row as a non-button Member card', async () => {
    const { w, selectAlly } = mountCombat(gridGame(), { social: BO_PET });
    const di = w.findAll('li')[3].get('.ally-card');
    expect(di.element.tagName).toBe('DIV');
    expect(di.text()).toBe('Member');
    expect(di.classes()).toContain('unknown');
    expect(di.attributes('aria-pressed')).toBeUndefined();
    expect(di.find('button').exists()).toBe(false);
    await di.trigger('click');
    expect(selectAlly).not.toHaveBeenCalled();
  });

  // Was: 'presses the You chip by default' (the other half): no grid card is pressed by default.
  it('presses the self row by default and no card', () => {
    const { w } = mountCombat(gridGame(), { social: BO_PET });
    expect(w.get('button.self-target').attributes('aria-pressed')).toBe('true');
    for (const card of w.findAll('button.ally-card')) {
      expect(card.attributes('aria-pressed')).toBe('false');
      expect(card.classes()).not.toContain('selected');
    }
  });

  // Was: 'calls selectAlly with the tapped chip id and follows allyTargetId'.
  it('calls selectAlly with the card id, moves the ring with allyTargetId and never opens the Social sheet', async () => {
    const { w, selectAlly, allyTargetId, openScreen } = mountCombat(gridGame(), { social: BO_PET });
    const card = (index: number) => w.findAll('li')[index].get('button.ally-card');
    await card(1).trigger('click');
    expect(selectAlly).toHaveBeenCalledTimes(1);
    expect(selectAlly).toHaveBeenCalledWith(3n);
    allyTargetId.value = 3n;
    await nextTick();
    expect(card(1).attributes('aria-pressed')).toBe('true');
    expect(card(1).classes()).toContain('selected');
    expect(card(0).attributes('aria-pressed')).toBe('false');
    expect(w.get('button.self-target').attributes('aria-pressed')).toBe('false');
    // no crosshair inside a card; the ring and aria-pressed carry the selection
    expect(card(1).find('svg.self-marker, .self-marker, .marker').exists()).toBe(false);
    await w.get('button.self-target').trigger('click');
    expect(selectAlly).toHaveBeenLastCalledWith(1n);
    expect(openScreen).not.toHaveBeenCalled();
  });

  it('has no Party n text, no You chip, no chip row, no menu and no nested button in combat', () => {
    const { w } = mountCombat(gridGame(), { social: BO_PET, props: { levelUp: true } });
    expect(w.find('.party-chip').exists()).toBe(false);
    expect(w.find('.ally-chip').exists()).toBe(false);
    expect(w.find('.chip-row').exists()).toBe(false);
    expect(w.text()).not.toContain('Party 5');
    expect(w.find('.menu-opener').exists()).toBe(false);
    expect(w.find('.player-menu').exists()).toBe(false);
    expect(w.findAll('button button')).toHaveLength(0);
    expect(w.find('.ally-card .pet-tag').exists()).toBe(false);
  });

  it('keeps your pet a span tag, never a button, with the grid shown', () => {
    const mine = { petOf: (id: bigint) => (id === 1n ? (myPet() as never) : null), petSecondsLeft: () => null };
    const { w } = mountCombat(gridGame(), { social: mine });
    expect(w.get('.row3 .pet-tag').element.tagName).toBe('SPAN');
    expect(w.find('.party-grid .pet-tag').exists()).toBe(false);
    expect(w.find('.party-grid .paw').exists()).toBe(false);
  });

  // Was: 'keeps the long row in one sideways-scrolling line (5 allies, 6 effects, the tag)'.
  it('wraps four members into the grid and shows one chip plus +N per card', () => {
    const ids = [2n, 3n, 4n, 5n];
    const { w } = mountCombat(
      selfGame({
        group: ref({ id: 1n, leaderCharacterId: 2n }),
        groupMembers: ref([gm(1n, 1n, 1n), ...ids.map((id) => gm(id, id, id))]),
        knownCharacters: ref(ids.map((id) => online(id, `A very long member name ${id}`))),
        effects: ref([1n, 2n, 3n].map((id) => fx(id, 3n, { sourceAbility: `Buff ${id}` }))),
      }),
      { social: BO_PET },
    );
    expect(w.findAll('.party-grid > li')).toHaveLength(4);
    const bo = w.findAll('.ally-card')[1];
    expect(bo.findAll('.effect-chips .tag')).toHaveLength(2);
    expect(bo.findAll('.effect-chips .tag')[1].text()).toBe('+2');
    expect(w.findAll('.ally-card')[0].find('.effect-chips').exists()).toBe(false);
  });

  // Was: 'renders names as text, not markup'.
  it('renders member, pet and effect text as text, not markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { w } = mountCombat(
      gridGame({
        knownCharacters: ref([online(2n, payload), online(3n, 'Bo')]),
        effects: ref([fx(1n, 3n, { sourceAbility: payload })]),
      }),
      { social: { petOf: (id: bigint) => (id === 3n ? (wolf(3n, { name: payload }) as never) : null), petSecondsLeft: () => null } },
    );
    expect(w.find('img').exists()).toBe(false);
    const cards = w.findAll('button.ally-card');
    expect(cards[0].get('.character-name').text()).toBe(payload);
    expect(cards[0].attributes('aria-label')).toContain(`Target ${payload} with your next ability`);
    expect(cards[1].get('.paw').attributes('title')).toBe(`${payload} 18/40`);
    expect(cards[1].attributes('aria-label')).toContain(`pet ${payload} health 18 of 40`);
    expect(cards[1].get('.effect-chips .tag').text()).toContain(payload);
  });

  describe('source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsStrip.vue'), 'utf8');

    it('carries the grid, the 44px card rules and the one-chip limit', () => {
      expect(source).toContain('repeat(3, minmax(0, 1fr))');
      expect(source).toContain('ally-card');
      expect(source).toContain('STRIP_EFFECT_LIMIT');
      expect(source).toContain('PhPawPrint');
      expect(source).toContain('padding: 4px 8px');
      expect(source).toContain('with your next ability');
      expect(source).toContain('var(--color-accent-300)');
      expect(source).toContain('height: 3px');
      expect(source).not.toMatch(/margin:[^;]*-\d/);
    });

    it('drops the Phase 48 chip row markup', () => {
      expect(source).not.toContain('ally-chip');
      expect(source).not.toContain('allyMode');
      expect(source).not.toContain('ally-row');
    });
  });
});

describe('VitalsStrip damage flash', () => {
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

  function mountFlash(
    over: Record<string, unknown> = {},
    characterId = ref<bigint | null>(1n),
  ): { w: VueWrapper; characterId: typeof characterId } {
    const w = mountStrip({ hp: 200n, maxHp: 260n, ...over }, { characterId });
    return { w, characterId };
  }

  const hpCell = (w: VueWrapper) => w.findAll('.cell')[0];

  it('shows no flash class, ghost or delta on mount', () => {
    const { w } = mountFlash();
    expect(hpCell(w).classes()).not.toContain('flash-motion');
    expect(hpCell(w).classes()).not.toContain('flash-reduced');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('flashes on a drop: class, ghost, label then delta, cleared on time', async () => {
    const { w } = mountFlash();
    await w.setProps({ hp: 178n });
    expect(hpCell(w).classes()).toContain('flash-motion');
    const ghost = w.get('.ghost');
    expect(ghost.attributes('aria-hidden')).toBe('true');
    expect(ghost.element.parentElement?.classList.contains('track')).toBe(true);
    const style = (ghost.element as HTMLElement).style;
    expect(style.left).toBe(`${Math.round((178 / 260) * 10000) / 100}%`);
    expect(style.width).toBe(`${Math.round((22 / 260) * 10000) / 100}%`);
    expect(w.findAll('.micro-label')[0].text()).toBe('HP 178');
    const delta = w.get('.delta');
    expect(delta.text()).toBe('−22');
    expect(delta.attributes('aria-hidden')).toBe('true');
    expect(w.get('.readout').element.lastElementChild).toBe(delta.element);

    vi.advanceTimersByTime(599);
    await nextTick();
    expect(hpCell(w).classes()).toContain('flash-motion');
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(hpCell(w).classes()).not.toContain('flash-motion');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(true);
    vi.advanceTimersByTime(899);
    await nextTick();
    expect(w.find('.delta').exists()).toBe(true);
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('sums drops inside the window', async () => {
    const { w } = mountFlash();
    await w.setProps({ hp: 190n });
    vi.advanceTimersByTime(1000);
    await w.setProps({ hp: 170n });
    expect(w.get('.delta').text()).toBe('−30');
  });

  it('uses the static flash-reduced class under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    const { w } = mountFlash();
    await w.setProps({ hp: 178n });
    expect(hpCell(w).classes()).toContain('flash-reduced');
    expect(hpCell(w).classes()).not.toContain('flash-motion');
    expect(w.get('.delta').text()).toBe('−22');
    vi.advanceTimersByTime(600);
    await nextTick();
    expect(hpCell(w).classes()).not.toContain('flash-reduced');
    expect(w.find('.ghost').exists()).toBe(false);
  });

  it('flashes the compact HP bar without delta text', async () => {
    const { w } = mountFlash({ compact: true });
    await w.setProps({ hp: 178n });
    const bars = w.findAll('.compact-bar');
    expect(bars[0].classes()).toContain('flash-motion');
    expect(bars[1].classes()).not.toContain('flash-motion');
    expect(bars[0].find('.ghost').exists()).toBe(true);
    expect(w.find('.delta').exists()).toBe(false);
    vi.advanceTimersByTime(600);
    await nextTick();
    expect(w.findAll('.compact-bar')[0].classes()).not.toContain('flash-motion');
    expect(w.find('.ghost').exists()).toBe(false);
  });

  it('never flashes on healing', async () => {
    const { w } = mountFlash({ hp: 100n });
    await w.setProps({ hp: 150n });
    expect(hpCell(w).classes()).not.toContain('flash-motion');
    expect(w.find('.ghost').exists()).toBe(false);
    expect(w.find('.delta').exists()).toBe(false);
  });

  it('never flashes on a character switch, with a lower hp arriving together with the new id', async () => {
    const { w, characterId } = mountFlash();
    characterId.value = 2n;
    await w.setProps({ hp: 100n });
    expect(hpCell(w).classes()).not.toContain('flash-motion');
    expect(w.find('.delta').exists()).toBe(false);
    await w.setProps({ hp: 90n });
    expect(w.get('.delta').text()).toBe('−10');
  });

  it('never flashes the mana or stamina cells', async () => {
    const { w } = mountFlash();
    await w.setProps({ hp: 178n, mana: 10n, stamina: 1n });
    const [, mana, stamina] = w.findAll('.cell');
    for (const cell of [mana, stamina]) {
      expect(cell.classes()).not.toContain('flash-motion');
      expect(cell.find('.ghost').exists()).toBe(false);
      expect(cell.find('.delta').exists()).toBe(false);
    }
    expect(w.findAll('.micro-label').map((l) => l.text())).toEqual(['HP 178', 'MP 10', 'SP 1']);
  });

  describe('source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsStrip.vue'), 'utf8');

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
      for (const part of ['.flash-motion .ghost', '.flash-motion .fill-health', '.flash-motion .micro-label']) {
        expect(block).toContain(part);
      }
      expect(block).toContain('animation: none');
    });

    it('has no transition and uses the con red token with the Micro 10 delta', () => {
      expect(source).not.toContain('transition');
      expect(source).toContain('var(--color-con-red)');
      const delta = rules().find((r) => r.selector === '.delta');
      expect(delta?.body).toContain('font-size: 10px');
    });
  });
});
