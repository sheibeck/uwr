// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import PartyBlock from './PartyBlock.vue';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { ConsoleApi, GameData } from '../game/context';

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
}

function mountBlock(setup: Setup = {}): { w: VueWrapper; prefill: ReturnType<typeof vi.fn> } {
  const prefill = vi.fn();
  const game = {
    ...createInertGame(),
    group: ref(setup.group ?? null),
    groupMembers: ref(setup.groupMembers ?? []),
    knownCharacters: ref(setup.knownCharacters ?? []),
    characterId: ref(setup.characterId === undefined ? 1n : setup.characterId),
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
    expect(mara.get('.member-level').text()).toBe('Lv 4');
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

describe('PartyBlock source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/rails/PartyBlock.vue'), 'utf8');

  it('carries the copy and the wiring', () => {
    expect(source).toContain('Not in a party.');
    expect(source).toContain("prefill('invite ')");
    expect(source).toContain('PhCrownSimple');
    expect(source).toContain('weight="fill"');
  });
});
