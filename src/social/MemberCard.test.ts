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
  it('reads [dot][name][class][follow icon][Lv · st] with the health, mana and stamina bars', () => {
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
    const tracks = w.findAll('.content > .track');
    expect(tracks.map((t) => t.classes().filter((c) => c.endsWith('-track'))[0])).toEqual([
      'health-track',
      'mana-track',
      'stamina-track',
    ]);
    expect(tracks.map((t) => t.attributes('role'))).toEqual(['progressbar', 'progressbar', 'progressbar']);
    expect(tracks.map((t) => t.attributes('aria-label'))).toEqual([
      'Bo health 50 of 100',
      'Bo mana 30 of 40',
      'Bo stamina 12 of 40',
    ]);
    expect(tracks.map((t) => t.attributes('title'))).toEqual(['Health 50/100', 'Mana 30/40', 'Stamina 12/40']);
    expect(tracks.map((t) => (t.get('.fill').element as HTMLElement).style.width)).toEqual(['50%', '75%', '30%']);
    expect(tracks.map((t) => t.get('.fill').classes()[1])).toEqual(['fill-health', 'fill-mana', 'fill-stamina']);
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

  it('draws no mana bar for a member without mana: health then stamina', () => {
    const w = mountCard({ member: view({ resourceKind: 'stamina', resource: 12n, maxResource: 40n }) });
    expect(w.find('.mana-track').exists()).toBe(false);
    expect(w.findAll('.content > .track').map((t) => t.classes().filter((c) => c.endsWith('-track'))[0])).toEqual([
      'health-track',
      'stamina-track',
    ]);
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
    resourceKind: 'stamina',
    stamina: 0n,
    maxStamina: 0n,
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
    // Review IN-07: no progressbar with a 0 maximum; the empty tracks are decorative.
    expect(w.find('[role="progressbar"]').exists()).toBe(false);
    expect(w.get('.health-track').attributes('aria-hidden')).toBe('true');
    expect(w.get('.stamina-track').attributes('aria-hidden')).toBe('true');
    expect((w.get('.stamina-track .fill').element as HTMLElement).style.width).toBe('0%');
    expect(w.get('.health-track').attributes('aria-valuemax')).toBeUndefined();
    expect(w.find('.mana-track').exists()).toBe(false);
    for (const track of w.findAll('.track')) {
      expect(track.attributes('title')).toBeUndefined();
      expect(track.attributes('role')).toBeUndefined();
    }
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
    expect(source).toContain('memberBars(');
    expect(source).toContain('too low to travel');
    expect(source).toContain('PhWarningCircle');
    expect(source).toContain('var(--color-con-red)');
    expect(source).toContain('margin: 4px 4px 0 0');
    expect(source).toContain('opacity: 0.45');
    expect(source).not.toContain('v-html');
  });
});

// The mobile Party sheet recipe (51.1-UI-SPEC "Mobile Party Sheet" items 5 and 6): the sheet card has
// the place line 'Lv {n} · {Here | place | Offline} · {s} st', the health, mana (if any) and stamina bars
// (owner 2026-10-08), the 44px ⋯; the self card (you) reads your name with ' (you)', your follow icon,
// 'Lv {n} · {s} st', no bars.
describe('MemberCard sheet variant', () => {
  const SALTMARSH = 20n;

  function mountSheet(
    props: { member?: PartyMemberView; state?: FollowState | null; self?: boolean } = {},
    options: { characterLocation?: bigint } = {},
  ): VueWrapper {
    const base = gameFor();
    const game = {
      ...base,
      character: ref(row(ME, 'Ann', { locationId: options.characterLocation ?? 10n })),
      locations: ref([
        { id: 10n, name: 'Ember Gate' },
        { id: SALTMARSH, name: 'Saltmarsh Gate' },
      ]),
    } as unknown as GameData;
    const frame = { ...createInertFrame(), isDesktop: ref(false) } as unknown as FrameControls;
    wrapper = mount(MemberCard, {
      attachTo: document.body,
      props: {
        member: props.member ?? view(),
        state: props.state === undefined ? 'comes_along' : props.state,
        variant: 'sheet',
        ...(props.self ? { self: true } : {}),
      },
      global: {
        provide: {
          [GAME_KEY as symbol]: game,
          [SOCIAL_KEY as symbol]: createInertSocial(),
          [CONSOLE_KEY as symbol]: createInertConsole(),
          [FRAME_KEY as symbol]: frame,
        },
      },
    });
    return wrapper;
  }

  it('a member at your place reads Lv 6 · Here · 12 st', () => {
    const w = mountSheet();
    expect(w.get('.member-line').text()).toBe('Lv 6 · Here · 12 st');
    expect(w.get('.member-place').text()).toBe('Here');
  });

  it('a member elsewhere reads the place name', () => {
    const w = mountSheet({ member: view({ locationId: SALTMARSH }) });
    expect(w.get('.member-line').text()).toBe('Lv 6 · Saltmarsh Gate · 12 st');
    expect(w.get('.member-place').attributes('title')).toBe('Saltmarsh Gate');
  });

  it('an offline member reads Offline', () => {
    const w = mountSheet({ member: view({ online: false, locationId: SALTMARSH }) });
    expect(w.get('.member-line').text()).toBe('Lv 6 · Offline · 12 st');
    expect(w.get('.member-card').classes()).toContain('muted');
  });

  it('a member whose place is not known yet reads no place text instead of a wrong one', () => {
    const w = mountSheet({ member: view({ locationId: 99n }) });
    expect(w.get('.member-line').text()).toBe('Lv 6 · 12 st');
  });

  it('the place is the one part that ellipsizes: the Lv and stamina parts do not shrink', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/social/MemberCard.vue'), 'utf8');
    expect(source).toMatch(/.member-place {[^}]*text-overflow: ellipsis/);
    expect(source).toMatch(/.line-fixed {[^}]*flex: none/);
  });

  it('shows the health, mana and stamina bars and no class text', () => {
    const w = mountSheet();
    expect(w.find('.member-class').exists()).toBe(false);
    expect(w.findAll('[role="progressbar"]').map((t) => t.attributes('aria-label'))).toEqual([
      'Bo health 50 of 100',
      'Bo mana 30 of 40',
      'Bo stamina 12 of 40',
    ]);
    expect(w.findAll('.content > .track').map((t) => t.classes().filter((c) => c.endsWith('-track'))[0])).toEqual([
      'health-track',
      'mana-track',
      'stamina-track',
    ]);
    const line = w.get('.member-line').element;
    expect(line.nextElementSibling).toBe(w.get('.health-track').element);
  });

  it('shows health then stamina for a sheet member without mana', () => {
    const w = mountSheet({ member: view({ resourceKind: 'stamina', resource: 12n, maxResource: 40n }) });
    expect(w.find('.mana-track').exists()).toBe(false);
    expect(w.findAll('[role="progressbar"]').map((t) => t.attributes('aria-label'))).toEqual([
      'Bo health 50 of 100',
      'Bo stamina 12 of 40',
    ]);
  });

  it('carries the status word, the follow icon, the crown and the low mark', () => {
    const w = mountSheet({ member: view({ isLeader: true, stamina: 3n, lowStamina: true }), state: 'leader' });
    expect(w.get('.status-word').text()).toBe('online');
    expect(w.get('.follow-icon').attributes('title')).toBe('Leader · others travel with them');
    expect(w.find('.crown').exists()).toBe(true);
    expect(w.get('.member-stamina').classes()).toContain('low');
    expect(w.find('.low-icon').exists()).toBe(true);
    expect(w.get('.stamina-sr').text()).toBe('Stamina 3 of 40, too low to travel');
  });

  it('its ⋯ is the 44px sheet size and the last child', () => {
    const w = mountSheet();
    const opener = w.get('button.menu-opener');
    expect(opener.classes()).toContain('sheet');
    expect(opener.attributes('aria-label')).toBe('Actions for Bo');
    expect((w.get('.member-card').element.lastElementChild as HTMLElement).classList.contains('player-menu')).toBe(true);
  });

  it('the unknown card reads Member, muted, with no ⋯, bar or place line', () => {
    const w = mountSheet({
      member: view({ name: '', className: '', known: false, online: false, hp: 0n, maxHp: 0n }),
      state: null,
    });
    expect(w.get('.member-name').text()).toBe('Member');
    expect(w.get('.member-card').classes()).toContain('unknown');
    expect(w.find('.player-menu').exists()).toBe(false);
    expect(w.find('.member-line').exists()).toBe(false);
    expect(w.find('.track').exists()).toBe(false);
    expect(w.find('button').exists()).toBe(false);
  });

  it('the self card reads your name with (you), your follow icon, Lv 4 · 30 st and no bars', () => {
    const w = mountSheet({
      self: true,
      member: view({ id: ME, name: 'Ann', level: 4n, stamina: 30n, isLeader: true }),
      state: 'leader',
    });
    expect(w.get('.member-card').classes()).toContain('self');
    expect(w.get('.character-name').text()).toBe('Ann (you)');
    expect(w.find('.crown').exists()).toBe(true);
    expect(w.get('.follow-icon').attributes('title')).toBe('Leader · others travel with them');
    expect(w.get('.member-line').text()).toBe('Lv 4 · 30 st');
    expect(w.find('.member-place').exists()).toBe(false);
    expect(w.find('.track').exists()).toBe(false);
    expect(w.findAll('[role="progressbar"]')).toHaveLength(0);
  });

  it('the self card ⋯ is "Actions for yourself", 44px', () => {
    const w = mountSheet({ self: true, member: view({ id: ME, name: 'Ann', isLeader: true }), state: 'leader' });
    const opener = w.get('button.menu-opener');
    expect(opener.attributes('aria-label')).toBe('Actions for yourself');
    expect(opener.classes()).toContain('sheet');
  });

  it('renders names as text, not markup', () => {
    const w = mountSheet({ member: view({ name: PAYLOAD, locationId: SALTMARSH }) });
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.member-name').text()).toBe(PAYLOAD);
  });
});
