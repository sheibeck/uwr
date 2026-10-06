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
  opts: { active?: boolean; roundNumber?: bigint | null; allyTargetId?: bigint | null; props?: Record<string, unknown> } = {},
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
    global: {
      provide: {
        [GAME_KEY as symbol]: {
          ...createInertGame(),
          ...combatGame(game, { active: opts.active, roundNumber: opts.roundNumber }),
        } as unknown as GameData,
        [FRAME_KEY as symbol]: { ...createInertFrame(), openScreen } as FrameControls,
        [COMBAT_KEY as symbol]: controller,
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

describe('VitalsStrip ally chips', () => {
  it('shows Party n as plain text, then You, then one button per member, then the effects', () => {
    const { w } = mountCombat(partyGame({ effects: ref([fx(1n, 1n)]) }));
    const row = w.get('.chip-row');
    const party = row.get('.party-chip');
    expect(party.element.tagName).toBe('SPAN');
    expect(party.text()).toBe('Party 3');
    const chips = row.findAll('.ally-chip');
    expect(chips.map((c) => c.text())).toEqual(['You', 'Mara 95%', 'Bo 50%']);
    for (const chip of chips) {
      expect(chip.element.tagName).toBe('BUTTON');
      expect(chip.classes()).toContain('tag-neutral');
    }
    expect(chips.map((c) => c.attributes('aria-label'))).toEqual([
      'Target You with your next ability',
      'Target Mara with your next ability',
      'Target Bo with your next ability',
    ]);
    const kids = Array.from(row.element.children).map((e) => e.className);
    expect(kids[0]).toContain('party-count');
    expect(kids[1]).toContain('ally-chip');
    expect(kids[3]).toContain('ally-chip');
    expect(kids[4]).toContain('effect-chips');
    expect(row.get('.effect-chips .tag').text()).toBe('Bless');
  });

  it('presses the You chip by default and marks it selected', () => {
    const { w } = mountCombat(partyGame());
    const [you, mara, bo] = w.findAll('.ally-chip');
    expect(you.attributes('aria-pressed')).toBe('true');
    expect(you.classes()).toContain('selected');
    expect(mara.attributes('aria-pressed')).toBe('false');
    expect(bo.attributes('aria-pressed')).toBe('false');
    expect(mara.classes()).not.toContain('selected');
  });

  it('calls selectAlly with the tapped chip id and follows allyTargetId', async () => {
    const { w, selectAlly, allyTargetId } = mountCombat(partyGame());
    const [you, mara] = w.findAll('.ally-chip');
    await mara.trigger('click');
    expect(selectAlly).toHaveBeenCalledTimes(1);
    expect(selectAlly).toHaveBeenCalledWith(2n);
    await you.trigger('click');
    expect(selectAlly).toHaveBeenLastCalledWith(1n);
    allyTargetId.value = 2n;
    await nextTick();
    const chips = w.findAll('.ally-chip');
    expect(chips[1].attributes('aria-pressed')).toBe('true');
    expect(chips[1].classes()).toContain('selected');
    expect(chips[0].attributes('aria-pressed')).toBe('false');
  });

  it('never opens the Social sheet from a chip in combat', async () => {
    const { w, openScreen } = mountCombat(partyGame());
    await w.get('.party-chip').trigger('click');
    await w.findAll('.ally-chip')[1].trigger('click');
    expect(openScreen).not.toHaveBeenCalled();
  });

  it('has no You chip and no targeting when solo with effects', () => {
    const { w } = mountCombat({ characterId: ref(1n), effects: ref([fx(1n, 1n)]) });
    expect(w.find('.ally-chip').exists()).toBe(false);
    expect(w.find('.party-chip').exists()).toBe(false);
    expect(w.findAll('.effect-chips .tag')).toHaveLength(1);
    expect(w.get('.chip-row').classes()).not.toContain('ally-row');
  });

  it('renders an unknown member as a non-interactive Member chip', async () => {
    const { w, selectAlly } = mountCombat(partyGame({ knownCharacters: ref([ch(3n, 'Bo')]) }));
    const unknown = w.get('.member-chip');
    expect(unknown.element.tagName).toBe('SPAN');
    expect(unknown.text()).toBe('Member');
    expect(unknown.attributes('aria-pressed')).toBeUndefined();
    await unknown.trigger('click');
    expect(selectAlly).not.toHaveBeenCalled();
    expect(w.findAll('.ally-chip').map((c) => c.text())).toEqual(['You', 'Bo 95%']);
  });

  it('keeps the Phase 47 strip when combat.active is false, with a combat controller provided', async () => {
    const { w, selectAlly, openScreen } = mountCombat(partyGame({ inCombat: ref(true) }), { active: false });
    const party = w.get('.party-chip');
    expect(party.element.tagName).toBe('BUTTON');
    expect(party.text()).toBe('Party 3');
    expect(w.find('.ally-chip').exists()).toBe(false);
    expect(w.findAll('.member-chip').map((c) => c.text())).toEqual(['Mara 95%', 'Bo 50%']);
    expect(w.get('.chip-row').classes()).not.toContain('ally-row');
    await w.get('.member-chip').trigger('click');
    expect(selectAlly).not.toHaveBeenCalled();
    expect(openScreen).toHaveBeenCalledWith('social');
  });

  it('renders names as text, not markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { w } = mountCombat(partyGame({ knownCharacters: ref([ch(2n, payload), ch(3n, 'Bo')]) }));
    expect(w.find('img').exists()).toBe(false);
    const chip = w.findAll('.ally-chip')[1];
    expect(chip.text()).toBe(`${payload} 95%`);
    expect(chip.attributes('aria-label')).toBe(`Target ${payload} with your next ability`);
  });

  it('keeps the long row in one sideways-scrolling line (5 allies, 6 effects, the tag)', () => {
    const ids = [2n, 3n, 4n, 5n, 6n];
    const { w } = mountCombat(
      partyGame({
        groupMembers: ref([gm(1n, 1n, 1n), ...ids.map((id) => gm(id, id, id))]),
        knownCharacters: ref(ids.map((id) => ch(id, `Member ${id}`))),
        effects: ref([1n, 2n, 3n, 4n, 5n, 6n].map((id) => fx(id, 1n))),
      }),
      { props: { levelUp: true, newSkill: true } },
    );
    expect(w.findAll('.ally-chip')).toHaveLength(6);
    expect(w.findAll('.effect-chips .tag')).toHaveLength(6);
    expect(w.get('.tags').element.children[0].classList.contains('in-combat-tag')).toBe(true);
    expect(w.get('.effect-chips').classes()).toContain('nowrap');
  });

  it('stays out of the compact variant', () => {
    const { w } = mountCombat(partyGame(), { props: { compact: true } });
    expect(w.find('.chip-row').exists()).toBe(false);
    expect(w.find('.ally-chip').exists()).toBe(false);
  });

  describe('source', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/frame/VitalsStrip.vue'), 'utf8');

    it('wires the controller, the tag and the 44px hit slop', () => {
      expect(source).toContain('InCombatTag');
      expect(source).toContain('selectAlly');
      expect(source).toContain('ally-chip');
      expect(source).toContain('with your next ability');
      expect(source).toContain('height: 44px');
      expect(source).toContain('translateY(-50%)');
      expect(source).toContain('inset 0 0 0 1px var(--color-accent)');
    });

    it('gates combat on combat.active and reads inCombat only for the effect chips', () => {
      expect(source).toContain('game.combat.active.value');
      expect(source.match(/game\.inCombat\.value/g)).toHaveLength(1);
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
