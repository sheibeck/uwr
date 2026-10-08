// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import MemberCard from './MemberCard.vue';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { FrameControls, GameData } from '../game/context';
import type { PartyMemberView } from '../rails/party';
import type { FollowState } from './follow';

// The out-of-combat member card (51.1-UI-SPEC "Vitals Rail Party Block", out of combat item 6):
// [content][⋯], the status dot, name, crown, class, follow icon and 51 stamina text, the bars, the
// status word for screen readers, the ⋯ as the last child, right-click opening the same menu, and
// the muted offline and unknown cards.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const ME = 1n;
const BO = 3n;
const PAYLOAD = '<img src=x onerror=alert(1)>';

function view(over: Partial<PartyMemberView> = {}): PartyMemberView {
  return {
    id: BO,
    name: 'Bo',
    className: 'Warrior',
    level: 6n,
    hp: 50n,
    maxHp: 100n,
    resource: 30n,
    maxResource: 40n,
    resourceKind: 'mana',
    stamina: 12n,
    maxStamina: 40n,
    lowStamina: false,
    isLeader: false,
    known: true,
    healthPercent: 50,
    online: true,
    followLeader: true,
    locationId: 10n,
    ...over,
  };
}

function row(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    level: 6n,
    race: 'Human',
    className: 'Warrior',
    locationId: 10n,
    online: true,
    groupId: 7n,
    ...over,
  };
}

// You lead a party of you and Bo, so Bo's menu has entries (the ⋯ renders).
function gameFor(): GameData {
  return {
    ...createInertGame(),
    connected: ref(true),
    character: ref(row(ME, 'Ann')),
    characterId: ref<bigint | null>(ME),
    group: ref({ id: 7n, leaderCharacterId: ME }),
    groupMembers: ref([
      { id: 11n, groupId: 7n, characterId: ME, followLeader: true, joinedAt: { microsSinceUnixEpoch: 1n } },
      { id: 12n, groupId: 7n, characterId: BO, followLeader: true, joinedAt: { microsSinceUnixEpoch: 2n } },
    ]),
    knownCharacters: ref([row(BO, 'Bo')]),
  } as unknown as GameData;
}

function mountCard(
  props: { member?: PartyMemberView; state?: FollowState | null; variant?: 'rail' | 'sheet' } = {},
  options: { desktop?: boolean } = {},
): VueWrapper {
  const frame = { ...createInertFrame(), isDesktop: ref(options.desktop ?? true) } as unknown as FrameControls;
  wrapper = mount(MemberCard, {
    attachTo: document.body,
    props: {
      member: props.member ?? view(),
      state: props.state === undefined ? 'comes_along' : props.state,
      ...(props.variant ? { variant: props.variant } : {}),
    },
    global: {
      provide: {
        [GAME_KEY as symbol]: gameFor(),
        [SOCIAL_KEY as symbol]: createInertSocial(),
        [CONSOLE_KEY as symbol]: createInertConsole(),
        [FRAME_KEY as symbol]: frame,
      },
    },
  });
  return wrapper;
}

describe('MemberCard online member', () => {
  it('reads [dot][name][class][follow icon][Lv · st] with both bars', () => {
    const w = mountCard();
    const card = w.get('.member-card');
    expect(card.element.tagName).toBe('DIV');
    const nameRow = w.get('.member-row');
    const kids = Array.from(nameRow.element.children).map((el) => el.className);
    expect(kids[0]).toContain('status-dot');
    expect(kids[1]).toContain('character-name');
    expect(w.get('.status-dot').classes()).toContain('online');
    expect(w.get('.member-name').text()).toBe('Bo');
    expect(w.get('.member-name').attributes('title')).toBe('Bo');
    expect(w.get('.member-class').text()).toBe('Warrior');
    expect(w.find('.crown').exists()).toBe(false);
    expect(w.get('.right .follow-icon').attributes('title')).toBe('Travels with the leader');
    expect(w.get('.member-level').text()).toBe('Lv 6 · 12 st');
    expect(w.get('.member-level').attributes('title')).toBe('Stamina 12 of 40');
    expect(w.get('.health-track').attributes('aria-label')).toBe('Bo health 50 of 100');
    expect(w.find('.resource-track .fill-mana').exists()).toBe(true);
    expect((w.get('.resource-track .fill').element as HTMLElement).style.width).toBe('75%');
  });

  it('carries the status word and the stamina text for screen readers', () => {
    const w = mountCard();
    expect(w.get('.status-word').classes()).toContain('sr-only');
    expect(w.get('.status-word').text()).toBe('online');
    expect(w.get('.stamina-sr').text()).toBe('Stamina 12 of 40');
    expect(w.get('.member-stamina').attributes('aria-hidden')).toBe('true');
  });

  it('shows the crown after the name for the leader, and the flag state', () => {
    const w = mountCard({ member: view({ isLeader: true }), state: 'leader' });
    const crown = w.get('.crown');
    expect(w.get('.member-name').element.nextElementSibling).toBe(crown.element);
    expect(w.get('.follow-icon').attributes('title')).toBe('Leader · others travel with them');
  });

  it('marks low stamina with the warning icon and the too-low text', () => {
    const w = mountCard({ member: view({ stamina: 3n, lowStamina: true }) });
    expect(w.get('.member-stamina').classes()).toContain('low');
    expect(w.find('.low-icon').exists()).toBe(true);
    expect(w.get('.stamina-sr').text()).toBe('Stamina 3 of 40, too low to travel');
  });

  it('uses the stamina resource bar for a member without mana', () => {
    const w = mountCard({ member: view({ resourceKind: 'stamina', resource: 12n, maxResource: 40n }) });
    expect(w.find('.resource-track .fill-stamina').exists()).toBe(true);
  });

  it('shows no follow icon when no state is given', () => {
    const w = mountCard({ state: null });
    expect(w.find('.follow-icon').exists()).toBe(false);
  });

  it('puts the ⋯ "Actions for Bo" last, as a sibling of the content', () => {
    const w = mountCard();
    const card = w.get('.member-card').element;
    const last = card.lastElementChild as HTMLElement;
    expect(last.classList.contains('player-menu')).toBe(true);
    expect(last.querySelector('button.menu-opener')?.getAttribute('aria-label')).toBe('Actions for Bo');
    expect(w.findAll('button button')).toHaveLength(0);
    expect(w.get('.content').find('button').exists()).toBe(false);
  });

  it('right-click on the card opens the same menu and prevents the browser menu', async () => {
    const w = mountCard();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    w.get('.member-row').element.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(w.get('button.menu-opener').attributes('aria-expanded')).toBe('true');
  });

  it('the sheet variant opens on right-click only on desktop', async () => {
    const w = mountCard({ variant: 'sheet' }, { desktop: false });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    w.get('.member-card').element.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(w.get('button.menu-opener').classes()).toContain('sheet');
  });

  it('renders names and classes as text, not markup', () => {
    const w = mountCard({ member: view({ name: PAYLOAD, className: PAYLOAD }) });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.member-name').text()).toBe(PAYLOAD);
    expect(w.get('.member-class').text()).toBe(PAYLOAD);
  });
});

describe('MemberCard offline member', () => {
  it('is muted with the hollow dot and the offline status word', () => {
    const w = mountCard({ member: view({ online: false }), state: 'following_elsewhere' });
    const card = w.get('.member-card');
    expect(card.classes()).toContain('muted');
    expect(card.classes()).toContain('offline');
    expect(w.get('.status-dot').classes()).toContain('offline');
    expect(w.get('.status-word').text()).toBe('offline');
    expect(w.get('.follow-icon').attributes('title')).toBe("Follows the leader, but isn't with them");
  });

  it('an online member is not muted', () => {
    expect(mountCard().get('.member-card').classes()).not.toContain('muted');
  });
});

describe('MemberCard unknown member', () => {
  const unknown = view({
    name: '',
    className: '',
    known: false,
    online: false,
    hp: 0n,
    maxHp: 0n,
    resource: 0n,
    maxResource: 0n,
  });

  it('reads Member, muted, with no dot, follow icon, stamina or ⋯', async () => {
    const w = mountCard({ member: unknown, state: 'following_elsewhere' });
    const card = w.get('.member-card');
    expect(card.classes()).toContain('muted');
    expect(card.classes()).toContain('unknown');
    expect(w.get('.member-name').text()).toBe('Member');
    expect(w.find('.status-dot').exists()).toBe(false);
    expect(w.find('.status-word').exists()).toBe(false);
    expect(w.find('.follow-icon').exists()).toBe(false);
    expect(w.find('.member-level').exists()).toBe(false);
    expect(w.find('.player-menu').exists()).toBe(false);
    expect(w.find('button').exists()).toBe(false);
    expect((w.get('.health-track .fill').element as HTMLElement).style.width).toBe('0%');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.element.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('MemberCard source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/social/MemberCard.vue'), 'utf8');

  it('mounts PlayerMenu as a sibling and carries the 51 stamina copy and tokens', () => {
    expect(source).toContain('<PlayerMenu');
    expect(source).toContain('too low to travel');
    expect(source).toContain('PhWarningCircle');
    expect(source).toContain('var(--color-con-red)');
    expect(source).toContain('margin: 4px 4px 0 0');
    expect(source).toContain('opacity: 0.45');
    expect(source).not.toContain('v-html');
  });
});
