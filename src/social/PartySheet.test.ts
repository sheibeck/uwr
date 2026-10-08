// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import SocialScreen from '../screens/SocialScreen.vue';
import {
  CONSOLE_KEY,
  FRAME_KEY,
  GAME_KEY,
  createInertConsole,
  createInertFrame,
  createInertGame,
} from '../game/context';
import type { ConsoleApi, FrameControls, GameData, GameReducers } from '../game/context';
import { createFeedStore } from '../console/feedStore';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import type { SocialData } from './socialContext';
import { SEND_ERROR_TEXT } from '../ledger/actionRunner';

// The mobile Party sheet (51.1-UI-SPEC "Mobile Party Sheet", ROADMAP 51.1 criterion 6): the Social
// sheet's body on a phone is PartyBlock variant="sheet" plus a NoticeLine for party refusals. These
// tests mount SocialScreen with isDesktop false and check the order, the solo and loading states,
// the refusal line, every party action and that no email reaches the DOM.

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = '';
});

const ME = 1n;
const MARA = 2n;
const BO = 3n;
const CY = 4n;
const DEE = 5n;
const GROUP = 7n;
const HERE = 10n;
const ELSEWHERE = 20n;

function character(id: bigint, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    race: 'Human',
    className: 'Ranger',
    level: 4n,
    hp: 95n,
    maxHp: 100n,
    mana: 20n,
    maxMana: 40n,
    stamina: 30n,
    maxStamina: 40n,
    locationId: HERE,
    online: true,
    groupId: GROUP,
    ...over,
  };
}

function member(id: bigint, characterId: bigint, joined: bigint, followLeader = true) {
  return { id, groupId: GROUP, characterId, followLeader, joinedAt: { microsSinceUnixEpoch: joined } };
}

function pet(characterId: bigint, name: string) {
  return { id: characterId + 100n, characterId, name, level: 2n, currentHp: 8n, maxHp: 10n, expiresAtMicros: null };
}

interface Options {
  /** 'lead': you lead Bo and Mara; 'member': Mara leads; null: solo. */
  party?: 'lead' | 'member' | null;
  desktop?: boolean;
  /** Extra fields put on every character row (for the no-email check). */
  extra?: Record<string, unknown>;
  members?: unknown[];
  known?: unknown[];
  pets?: Record<string, unknown>;
  outgoing?: unknown[];
  incoming?: { fromId: bigint } | null;
  stamina?: bigint;
  /** The group rows are applied but the characters of the others are not. */
  unknownOthers?: boolean;
}

function setup(options: Options = {}) {
  const party = options.party === undefined ? 'lead' : options.party;
  const extra = options.extra ?? {};
  const call = vi.fn((_args: unknown) => Promise.resolve());
  const reducers = {
    inviteToGroup: vi.fn((a: unknown) => call(a)),
    kickGroupMember: vi.fn((a: unknown) => call(a)),
    leaveGroup: vi.fn((a: unknown) => call(a)),
    promoteGroupLeader: vi.fn((a: unknown) => call(a)),
    sendFriendRequestToCharacter: vi.fn((a: unknown) => call(a)),
    cancelGroupInvite: vi.fn((a: unknown) => call(a)),
    setFollowLeader: vi.fn((a: unknown) => call(a)),
    acceptGroupInvite: vi.fn((a: unknown) => call(a)),
    rejectGroupInvite: vi.fn((a: unknown) => call(a)),
  };
  const inGroup = party !== null;
  const self = character(ME, 'Ann', {
    groupId: inGroup ? GROUP : undefined,
    stamina: options.stamina ?? 30n,
    ...extra,
  });
  const leaderId = party === 'lead' ? ME : MARA;
  const feed = createFeedStore();
  feed.setCharacter(ME);
  const base = createInertGame();
  const known =
    options.known ??
    (inGroup && !options.unknownOthers
      ? [
          character(MARA, 'Mara', { ...extra }),
          character(BO, 'Bo', { className: 'Warrior', locationId: ELSEWHERE, ...extra }),
        ]
      : []);
  const game = {
    ...base,
    connected: ref(true),
    character: ref(self),
    characterId: ref<bigint | null>(ME),
    group: ref(inGroup ? { id: GROUP, leaderCharacterId: leaderId } : null),
    groupMembers: ref(
      options.members ??
        (inGroup ? [member(11n, ME, 100n), member(12n, BO, 200n), member(13n, MARA, 300n)] : []),
    ),
    knownCharacters: ref(known),
    locations: ref([
      { id: HERE, name: 'Ember Gate' },
      { id: ELSEWHERE, name: 'Saltmarsh Gate' },
    ]),
    reducers: ref(reducers as unknown as GameReducers),
    feed,
  } as unknown as GameData;
  const prefill = vi.fn();
  const whisperTo = vi.fn();
  const examine = vi.fn();
  const consoleApi = { ...createInertConsole(), prefill, whisperTo, examine } as unknown as ConsoleApi;
  const frame = { ...createInertFrame(), isDesktop: ref(options.desktop ?? false) } as unknown as FrameControls;
  const pets = options.pets ?? {};
  const inviter = character(DEE, 'Dee', { groupId: undefined, ...extra });
  const social = {
    ...createInertSocial(),
    petOf: (id: bigint) => (pets[String(id)] as never) ?? null,
    outgoingInvites: ref(options.outgoing ?? []),
    incomingInvite: ref(
      options.incoming
        ? { id: 1n, groupId: 9n, fromCharacterId: options.incoming.fromId, toCharacterId: ME, createdAt: { microsSinceUnixEpoch: 0n } }
        : null,
    ),
    characterById: (id: bigint) => {
      if (id === DEE) return inviter as never;
      const all = [self, ...known] as Array<{ id: bigint }>;
      return (all.find((row) => row.id === id) as never) ?? null;
    },
    inviteSecondsLeft: () => 120,
    petSecondsLeft: () => null,
  } as unknown as SocialData;
  const w = mount(SocialScreen, {
    attachTo: document.body,
    global: {
      provide: {
        [GAME_KEY as symbol]: game,
        [CONSOLE_KEY as symbol]: consoleApi,
        [FRAME_KEY as symbol]: frame,
        [SOCIAL_KEY as symbol]: social,
      },
    },
  });
  mounted.push(w);
  return { w, game, feed, reducers, prefill, whisperTo, examine, social };
}

function outgoingTo(id: bigint, to: bigint, from = ME) {
  return { id, groupId: GROUP, fromCharacterId: from, toCharacterId: to, createdAt: { microsSinceUnixEpoch: 0n } };
}

let nextLine = 1n;
function send(feed: ReturnType<typeof createFeedStore>, kind: string, message: string): void {
  const id = nextLine;
  nextLine += 1n;
  feed.ingest('private', { id, kind, message, createdAt: { microsSinceUnixEpoch: id * 10n }, characterId: ME } as never);
  feed.flush();
}

function inOrder(w: VueWrapper, selectors: string[]): void {
  const found = selectors.map((selector) => {
    const el = w.find(selector);
    expect(el.exists(), `${selector} exists`).toBe(true);
    return el.element;
  });
  for (let i = 1; i < found.length; i += 1) {
    const follows = found[i - 1].compareDocumentPosition(found[i]) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows, `${selectors[i - 1]} comes before ${selectors[i]}`).toBeTruthy();
  }
}

function items(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function itemLabels(): string[] {
  return items().map((el) => (el.querySelector('.item-label')?.textContent ?? '').trim());
}

function item(label: string): HTMLElement {
  const found = items().find((el) => (el.querySelector('.item-label')?.textContent ?? '').trim() === label);
  if (!found) throw new Error(`no menu item ${label}; have ${itemLabels().join(', ')}`);
  return found;
}

function button(text: string): HTMLElement {
  const found = Array.from(document.querySelectorAll<HTMLElement>('button')).find(
    (el) => (el.textContent ?? '').trim() === text,
  );
  if (!found) throw new Error(`no button ${text}`);
  return found;
}

async function settle(): Promise<void> {
  await flushPromises();
  await nextTick();
}

describe('mobile Party sheet populated (Q5)', () => {
  it('in a party as a member: invite card, header, summary, warning, switch, self, members, Loot, Invited, notice', async () => {
    // Mara leads. You sent the invite to Cy, so the Invited list shows for you too.
    const { w, feed } = setup({
      party: 'member',
      stamina: 2n,
      incoming: { fromId: DEE },
      outgoing: [outgoingTo(31n, CY, ME)],
      pets: { [String(ME)]: pet(ME, 'Rex'), [String(BO)]: pet(BO, 'Ash') },
    });
    send(feed, 'group', 'Only the leader can invite.');
    await nextTick();
    inOrder(w, [
      '.invite-card',
      '.party-head',
      '.summary',
      '.warning',
      '.travel-switch',
      '.self-entry .member-card',
      '.self-entry .pet-row',
      'ul.cards',
      '.outgoing',
      '.notice-line',
    ]);
    expect(w.get('.party-head h6').text()).toBe('Party · 3');
    expect(w.get('.warning').text()).toBe('You do not have enough stamina to travel.');
  });

  it('Invite is a 44px sheet button, pre-fills "invite " and is gated like the rail', async () => {
    const lead = setup();
    const invite = lead.w.get('button.invite');
    expect(invite.classes()).toContain('sheet');
    expect(invite.attributes('aria-disabled')).toBeUndefined();
    await invite.trigger('click');
    expect(lead.prefill).toHaveBeenCalledWith('invite ');

    const member = setup({ party: 'member' });
    const gated = member.w.get('button.invite');
    expect(gated.attributes('aria-disabled')).toBe('true');
    expect(gated.text()).toContain('Only the leader can invite.');
    await gated.trigger('click');
    expect(member.prefill).not.toHaveBeenCalled();
  });

  it('the self card reads your name with (you), Lv 4 · 30 st and no bars; members have the place line and the health, mana and stamina bars', () => {
    const { w } = setup();
    const self = w.get('.self-entry .member-card');
    expect(self.get('.character-name').text()).toBe('Ann (you)');
    expect(self.get('.member-line').text()).toBe('Lv 4 · 30 st');
    expect(self.find('[role="progressbar"]').exists()).toBe(false);
    expect(self.find('.crown').exists()).toBe(true);
    expect(self.get('button.menu-opener').attributes('aria-label')).toBe('Actions for yourself');
    const cards = w.findAll('ul.cards .member-card');
    expect(cards.map((c) => c.get('.member-name').text())).toEqual(['Bo', 'Mara']);
    expect(cards[0].get('.member-line').text()).toBe('Lv 4 · Saltmarsh Gate · 30 st');
    expect(cards[1].get('.member-line').text()).toBe('Lv 4 · Here · 30 st');
    for (const card of cards) {
      const bars = card.findAll('[role="progressbar"]');
      expect(bars).toHaveLength(3);
      const name = card.get('.member-name').text();
      expect(bars.map((b) => b.attributes('aria-label')?.split(' ').slice(0, 2).join(' '))).toEqual([
        `${name} health`,
        `${name} mana`,
        `${name} stamina`,
      ]);
      expect(card.get('button.menu-opener').classes()).toContain('sheet');
    }
  });

  it('shows the summary, no Loot line and no desktop empty state', () => {
    const { w } = setup();
    expect(w.find('.loot').exists()).toBe(false);
    expect(w.text()).not.toContain('Loot');
    expect(w.get('.summary').text()).toBe('1 of 2 travel with you · Bo stays behind');
    expect(w.text()).not.toContain('No friends or party yet.');
    expect(w.text()).not.toContain("You're travelling alone.");
    expect(w.find('.empty-state').exists()).toBe(false);
  });

  it('puts each pet row under its owner and nowhere else', () => {
    const { w } = setup({ pets: { [String(ME)]: pet(ME, 'Rex'), [String(MARA)]: pet(MARA, 'Ash') } });
    expect(w.findAll('.pet-row')).toHaveLength(2);
    expect(w.get('.self-entry .pet-row').text()).toContain('Rex');
    const entries = w.findAll('ul.cards > li');
    expect(entries).toHaveLength(2);
    expect(entries[0].find('.pet-row').exists()).toBe(false);
    expect(entries[1].get('.pet-row').text()).toContain('Ash');
  });

  it('shows Invited · waiting with a 44px Cancel invite for the leader', () => {
    const { w } = setup({ outgoing: [outgoingTo(31n, CY)] });
    expect(w.get('.outgoing h6').text()).toBe('Invited · waiting');
    expect(w.get('.outgoing button.cancel').text()).toContain('Cancel invite');
  });

  it('zero to four others, with zero or one pet each: renders every card (overflow scrolls in the sheet)', () => {
    const members = [
      member(11n, ME, 100n),
      member(12n, MARA, 200n),
      member(13n, BO, 300n),
      member(14n, CY, 400n),
      member(15n, DEE, 500n),
    ];
    const known = [
      character(MARA, 'Mara'),
      character(BO, 'Bo'),
      character(CY, 'Cy'),
      character(DEE, 'Dee'),
    ];
    const four = setup({
      members,
      known,
      pets: { [String(MARA)]: pet(MARA, 'A'), [String(CY)]: pet(CY, 'B') },
    });
    expect(four.w.findAll('ul.cards > li')).toHaveLength(4);
    expect(four.w.findAll('.pet-row')).toHaveLength(2);
    expect(four.w.get('.party-head h6').text()).toBe('Party · 5');
    const one = setup({ members: [member(11n, ME, 100n), member(12n, MARA, 200n)], known: [character(MARA, 'Mara')] });
    expect(one.w.findAll('ul.cards > li')).toHaveLength(1);
    const none = setup({ members: [member(11n, ME, 100n)], known: [] });
    expect(none.w.find('ul.cards').exists()).toBe(false);
    expect(none.w.get('.party-head h6').text()).toBe('Party · 1');
    expect(none.w.find('.self-entry').exists()).toBe(true);
    expect(none.w.find('.empty-state').exists()).toBe(false);
  });
});

describe('mobile Party sheet solo (Q5 empty)', () => {
  it('shows the header, your pet row, then the empty state with the body copy', () => {
    const { w } = setup({ party: null, pets: { [String(ME)]: pet(ME, 'Rex') } });
    expect(w.get('.party-head h6').text()).toBe('Party');
    expect(w.get('button.invite').classes()).toContain('sheet');
    expect(w.get('.empty-state-title').text()).toBe("You're travelling alone.");
    expect(w.get('.empty-state-body').text()).toBe(
      'Invite someone by name, or use the menu on a player in Nearby.',
    );
    inOrder(w, ['.party-head', '.solo-pet .pet-row', '.empty-state']);
    expect(w.get('.solo-pet .pet-row').text()).toContain('Rex');
  });

  it('has no summary, warning, switch, self card, ⋯ or Loot line', () => {
    const { w } = setup({ party: null });
    expect(w.find('.summary').exists()).toBe(false);
    expect(w.find('.warning').exists()).toBe(false);
    expect(w.find('.travel-switch').exists()).toBe(false);
    expect(w.find('.self-entry').exists()).toBe(false);
    expect(w.find('.menu-opener').exists()).toBe(false);
    expect(w.find('.loot').exists()).toBe(false);
    expect(w.text()).not.toContain('Loot');
    expect(w.text()).not.toContain('No friends or party yet.');
    expect(w.text()).not.toContain('Not in a party.');
  });

  it('still shows the incoming invite card at the top', () => {
    const { w } = setup({ party: null, incoming: { fromId: DEE } });
    inOrder(w, ['.invite-card', '.party-head', '.empty-state']);
    expect(w.get('.invite-card').text()).toContain('Dee');
  });
});

describe('mobile Party sheet loading (Q5)', () => {
  it('an unknown member shows the unknown card until its row applies', async () => {
    const { w, game } = setup({ unknownOthers: true });
    const cards = w.findAll('ul.cards .member-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.classes()).toContain('unknown');
      expect(card.get('.member-name').text()).toBe('Member');
      expect(card.find('.menu-opener').exists()).toBe(false);
    }
    expect(w.find('.summary').exists()).toBe(false);
    (game.knownCharacters as unknown as { value: unknown[] }).value = [
      character(MARA, 'Mara'),
      character(BO, 'Bo'),
    ];
    await nextTick();
    expect(w.findAll('ul.cards .member-card').map((c) => c.get('.member-name').text())).toEqual(['Bo', 'Mara']);
    expect(w.find('.unknown').exists()).toBe(false);
  });
});

describe('mobile Party sheet notice line', () => {
  it('a refusal written as a private group line after the sheet opened shows at the foot', async () => {
    const { w, feed } = setup();
    expect(w.find('.notice-line').exists()).toBe(false);
    send(feed, 'group', 'Your group is full.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Your group is full.');
    const sheet = w.get('.social-sheet').element;
    expect(sheet.lastElementChild).toBe(w.get('.notice-line').element);
  });

  it('shows system lines too, but not friend or reward lines', async () => {
    const { w, feed } = setup();
    send(feed, 'friend', 'A friend request.');
    send(feed, 'reward', 'You sell the blade.');
    await nextTick();
    expect(w.find('.notice-line').exists()).toBe(false);
    send(feed, 'system', 'Bo is offline.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Bo is offline.');
  });

  it('a group line that was already in the feed when the sheet opened is not shown', async () => {
    const lead = setup();
    send(lead.feed, 'group', 'Old refusal.');
    await nextTick();
    expect(lead.w.get('.notice-line').text()).toBe('Old refusal.');
    // A sheet opened now (new mount over the same feed) starts empty.
    const again = mount(SocialScreen, {
      attachTo: document.body,
      global: {
        provide: {
          [GAME_KEY as symbol]: lead.game,
          [FRAME_KEY as symbol]: { ...createInertFrame(), isDesktop: ref(false) },
        },
      },
    });
    mounted.push(again);
    expect(again.find('.notice-line').exists()).toBe(false);
  });
});

describe('mobile Party sheet reaches every party action (criterion 6)', () => {
  it('Accept and Decline on the invite card', async () => {
    const accept = setup({ party: null, incoming: { fromId: DEE } });
    await accept.w.get('.invite-card .answer.btn-primary').trigger('click');
    await settle();
    expect(accept.reducers.acceptGroupInvite).toHaveBeenCalledWith({ characterId: ME, fromName: 'Dee' });
    const decline = setup({ party: null, incoming: { fromId: DEE } });
    await decline.w.get('.invite-card .answer.btn-secondary').trigger('click');
    await settle();
    expect(decline.reducers.rejectGroupInvite).toHaveBeenCalledWith({ characterId: ME, fromName: 'Dee' });
  });

  it('the self menu as a member: Travel with leader (or Stop), Leave party', async () => {
    const { w, reducers } = setup({ party: 'member' });
    await w.get('.self-entry button.menu-opener').trigger('click');
    await nextTick();
    expect(document.querySelector('section[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(itemLabels()).toEqual(['Stop travelling with leader', 'Leave party']);
    item('Stop travelling with leader').click();
    await settle();
    expect(reducers.setFollowLeader).toHaveBeenCalledWith({ characterId: ME, follow: false });
  });

  it('the self menu: Leave party asks first, then leaves', async () => {
    const { w, reducers } = setup({ party: 'member' });
    await w.get('.self-entry button.menu-opener').trigger('click');
    await nextTick();
    item('Leave party').click();
    await nextTick();
    button('Leave').click();
    await settle();
    expect(reducers.leaveGroup).toHaveBeenCalledWith({ characterId: ME });
  });

  it('a member menu as leader: Whisper, Examine, Add friend, Make party leader, Remove from party', async () => {
    const { w, reducers, whisperTo, examine } = setup();
    const opener = w.findAll('ul.cards button.menu-opener')[0];
    expect(opener.attributes('aria-label')).toBe('Actions for Bo');
    await opener.trigger('click');
    await nextTick();
    const labels = itemLabels();
    for (const label of ['Whisper', 'Examine', 'Add friend', 'Make party leader', 'Remove from party']) {
      expect(labels, label).toContain(label);
    }
    item('Add friend').click();
    await settle();
    expect(reducers.sendFriendRequestToCharacter).toHaveBeenCalledWith({ characterId: ME, targetName: 'Bo' });

    await opener.trigger('click');
    await nextTick();
    item('Make party leader').click();
    await settle();
    expect(reducers.promoteGroupLeader).toHaveBeenCalledWith({ characterId: ME, targetName: 'Bo' });

    await opener.trigger('click');
    await nextTick();
    item('Remove from party').click();
    await nextTick();
    button('Remove').click();
    await settle();
    expect(reducers.kickGroupMember).toHaveBeenCalledWith({ characterId: ME, targetName: 'Bo' });

    await opener.trigger('click');
    await nextTick();
    item('Whisper').click();
    await settle();
    expect(whisperTo).toHaveBeenCalledWith('Bo');
    // Bo is at another place (Examine reads "Not here"); Mara stands with you.
    await w.findAll('ul.cards button.menu-opener')[1].trigger('click');
    await nextTick();
    item('Examine').click();
    await settle();
    expect(examine).toHaveBeenCalledWith('Mara');
  });

  it('a member menu as a member has no leader entries', async () => {
    const { w } = setup({ party: 'member' });
    await w.findAll('ul.cards button.menu-opener')[1].trigger('click');
    await nextTick();
    const labels = itemLabels();
    expect(labels).toContain('Whisper');
    expect(labels).not.toContain('Make party leader');
    expect(labels).not.toContain('Remove from party');
  });

  it('the Travel with leader switch flips the flag', async () => {
    const { w, reducers } = setup({ party: 'member' });
    const toggle = w.get('button.travel-switch');
    expect(toggle.classes()).toContain('sheet');
    expect(toggle.attributes('aria-checked')).toBe('true');
    await toggle.trigger('click');
    await settle();
    expect(reducers.setFollowLeader).toHaveBeenCalledWith({ characterId: ME, follow: false });
  });

  it('Cancel invite cancels the invite', async () => {
    const { w, reducers } = setup({ outgoing: [outgoingTo(31n, CY)], known: [character(MARA, 'Mara'), character(BO, 'Bo'), character(CY, 'Cy')] });
    await w.get('.outgoing button.cancel').trigger('click');
    await settle();
    expect(reducers.cancelGroupInvite).toHaveBeenCalledWith({ characterId: ME, targetName: 'Cy' });
  });
});

// Client rejections (51.1 review client-social WR-01, client-rest WR-01): every party control in the
// sheet reports a rejected call with the one shared send error line, and the sheet's NoticeLine shows
// it while the sheet covers the feed. Server refusals stay the server's own lines.
describe('mobile Party sheet client rejections', () => {
  const refused = () => Promise.reject(new Error('transport dropped'));

  it('a rejected Accept on the invite card shows the send error at the foot', async () => {
    const { w, reducers } = setup({ party: null, incoming: { fromId: DEE } });
    reducers.acceptGroupInvite.mockImplementationOnce(refused);
    await w.get('.invite-card .answer.btn-primary').trigger('click');
    await settle();
    expect(w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
    const sheet = w.get('.social-sheet').element;
    expect(sheet.lastElementChild).toBe(w.get('.notice-line').element);
  });

  it('then a rejected menu action shows it again after a server line replaced it', async () => {
    const { w, feed, reducers } = setup({ party: null, incoming: { fromId: DEE } });
    reducers.acceptGroupInvite.mockImplementationOnce(refused);
    await w.get('.invite-card .answer.btn-primary').trigger('click');
    await settle();
    expect(w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
    send(feed, 'group', 'Dee cancelled the invite.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Dee cancelled the invite.');

    const lead = setup();
    lead.reducers.sendFriendRequestToCharacter.mockImplementationOnce(refused);
    await lead.w.findAll('ul.cards button.menu-opener')[0].trigger('click');
    await nextTick();
    item('Add friend').click();
    await settle();
    expect(lead.w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
  });

  it('a rejected Travel with leader switch and a rejected Cancel invite show it too', async () => {
    const member = setup({ party: 'member' });
    member.reducers.setFollowLeader.mockImplementationOnce(refused);
    await member.w.get('button.travel-switch').trigger('click');
    await settle();
    expect(member.w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);

    const lead = setup({
      outgoing: [outgoingTo(31n, CY)],
      known: [character(MARA, 'Mara'), character(BO, 'Bo'), character(CY, 'Cy')],
    });
    lead.reducers.cancelGroupInvite.mockImplementationOnce(refused);
    await lead.w.get('.outgoing button.cancel').trigger('click');
    await settle();
    expect(lead.w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
  });

  it('writes the line once per rejection, into the feed as the one local system line', async () => {
    const { w, feed, reducers } = setup({ party: 'member' });
    reducers.setFollowLeader.mockImplementationOnce(refused);
    await w.get('button.travel-switch').trigger('click');
    await settle();
    const local = feed.entries.value.filter((entry) => entry.source === 'local');
    expect(local.map((entry) => [entry.kind, entry.message])).toEqual([['system', SEND_ERROR_TEXT]]);
  });
});

describe('no email on the Party sheet (T-51.1-52, X6)', () => {
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;

  it('fixtures with an email field on every row leave no address in the DOM', async () => {
    const { w } = setup({
      extra: { email: 'ann@example.com', userEmail: 'bo@example.org' },
      incoming: { fromId: DEE },
      outgoing: [outgoingTo(31n, CY)],
      pets: { [String(ME)]: pet(ME, 'Rex') },
    });
    await w.get('.self-entry button.menu-opener').trigger('click');
    await nextTick();
    expect(document.body.innerHTML).not.toMatch(EMAIL);
    expect(document.body.textContent ?? '').not.toContain('@');
    expect(w.html()).not.toMatch(EMAIL);
  });

  it('the party sources never name the email or the user table', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    for (const file of [
      'src/screens/SocialScreen.vue',
      'src/rails/PartyBlock.vue',
      'src/social/MemberCard.vue',
      'src/social/InviteCard.vue',
      'src/social/OutgoingInvites.vue',
    ]) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(source, file).not.toMatch(/\bemail\b/i);
      expect(source, file).not.toMatch(/FROM\s+user\b/i);
    }
  });
});

describe('desktop Social screen (UI-SPEC B18)', () => {
  it('keeps the Phase 45 placeholder and renders no Party sheet', () => {
    const { w } = setup({ desktop: true });
    expect(w.text()).toContain('No friends or party yet.');
    expect(w.text()).toContain('This screen is still being built.');
    expect(w.find('.party').exists()).toBe(false);
    expect(w.find('.notice-line').exists()).toBe(false);
  });
});
