// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { MAX_LEVEL } from '@game-data/xp';
import VitalsStrip from './VitalsStrip.vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { FrameControls, GameData } from '../game/context';

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
