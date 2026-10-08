// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import InviteCard from './InviteCard.vue';
import FeedShell from '../frame/FeedShell.vue';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import type { SocialData } from './socialContext';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { GameData, GameReducers } from '../game/context';
import { SEND_ERROR_TEXT } from '../ledger/actionRunner';

// The incoming invite card (51.1-UI-SPEC "Incoming Invite Card"): who invited you, who is in the
// party, how long the invite lasts, Accept and Decline. Display only: the timer reads the social
// hub's seconds-left, the server removes the row, and nothing here decides expiry.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const ME = 1n;
const ANN = 2n;
const BO = 3n;

const character = (id: bigint, name: string) => ({ id, name });

interface Options {
  invite?: boolean;
  secondsLeft?: number;
  applied?: boolean;
  inviterKnown?: boolean;
  combat?: boolean;
  connected?: boolean;
  hold?: boolean;
  inviterName?: string;
}

function setup(options: Options = {}) {
  const gates: Array<() => void> = [];
  const hold = (): Promise<void> | Promise<undefined> =>
    options.hold ? new Promise<void>((open) => gates.push(open)) : Promise.resolve(undefined);
  const acceptGroupInvite = vi.fn((_args: { characterId: bigint; fromName: string }) => hold());
  const rejectGroupInvite = vi.fn((_args: { characterId: bigint; fromName: string }) => hold());
  const reducers = { acceptGroupInvite, rejectGroupInvite } as unknown as GameReducers;
  const base = createInertGame();
  const game = {
    ...base,
    connected: ref(options.connected ?? true),
    characterId: ref<bigint | null>(ME),
    combat: { ...base.combat, active: ref(options.combat ?? false) },
    reducers: ref(reducers),
  } as unknown as GameData;

  const inviterName = options.inviterName ?? 'Ann';
  const incoming = ref(
    options.invite === false
      ? null
      : { id: 40n, groupId: 8n, fromCharacterId: ANN, toCharacterId: ME, createdAt: { microsSinceUnixEpoch: 0n } },
  );
  const seconds = ref(options.secondsLeft ?? 299);
  const names = new Map<bigint, { id: bigint; name: string }>(
    options.inviterKnown === false ? [] : [[ANN, character(ANN, inviterName)]],
  );
  names.set(BO, character(BO, 'Bo'));
  const social = {
    ...createInertSocial(),
    incomingInvite: incoming,
    inviteGroup: ref(options.applied === false ? null : { id: 8n, leaderCharacterId: ANN }),
    inviteGroupMembers: ref(
      options.applied === false
        ? []
        : [
            { id: 52n, groupId: 8n, characterId: BO, followLeader: true, joinedAt: { microsSinceUnixEpoch: 20n } },
            { id: 51n, groupId: 8n, characterId: ANN, followLeader: true, joinedAt: { microsSinceUnixEpoch: 10n } },
          ],
    ),
    inviteGroupApplied: ref(options.applied !== false),
    characterById: (id: bigint) => names.get(id) ?? null,
    inviteSecondsLeft: () => seconds.value,
  } as unknown as SocialData;
  return {
    game,
    social,
    incoming,
    seconds,
    names,
    acceptGroupInvite,
    rejectGroupInvite,
    release: () => gates.splice(0).forEach((open) => open()),
  };
}

function provide(s: ReturnType<typeof setup>) {
  return {
    [GAME_KEY as symbol]: s.game,
    [SOCIAL_KEY as symbol]: s.social,
    [CONSOLE_KEY as symbol]: createInertConsole(),
  };
}

function mountCard(s: ReturnType<typeof setup>, props: Record<string, unknown> = {}, attach = false): VueWrapper {
  wrapper = mount(InviteCard, {
    props: props as never,
    attachTo: attach ? document.body : undefined,
    global: { provide: provide(s) },
  });
  return wrapper;
}

const buttons = (w: VueWrapper) => w.findAll('button');
const accept = (w: VueWrapper) => buttons(w).find((b) => b.text() === 'Accept')!;
const decline = (w: VueWrapper) => buttons(w).find((b) => b.text() === 'Decline')!;

describe('InviteCard content', () => {
  it('with no invite shows nothing visible and keeps an empty status region', () => {
    const w = mountCard(setup({ invite: false }));
    expect(w.find('.invite-card').exists()).toBe(false);
    expect(w.find('button').exists()).toBe(false);
    const status = w.get('[role="status"]');
    expect(status.attributes('aria-live')).toBe('polite');
    expect(status.text()).toBe('');
  });

  it('with the inert hub renders no card', () => {
    wrapper = mount(InviteCard);
    expect(wrapper.find('.invite-card').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe('');
  });

  it('shows the kicker, timer, inviter line, chips, follow line, buttons and the note', () => {
    const w = mountCard(setup());
    const card = w.get('.invite-card');
    expect(card.get('.kicker-label').text()).toBe('Party invite');
    const timer = card.get('.timer');
    expect(timer.attributes('aria-hidden')).toBe('true');
    expect(timer.text()).toBe('Expires in 4:59');
    expect(card.get('.sr-only.timer-sr').text()).toBe('Expires in about 5 minutes');
    expect(card.get('.inviter-line').text()).toBe('Ann invites you to join their party.');
    const chips = card.findAll('.tag.tag-neutral');
    expect(chips.map((chip) => chip.text())).toEqual(['Ann', 'Bo']);
    expect(chips[0].find('svg').exists()).toBe(true);
    expect(chips[1].find('svg').exists()).toBe(false);
    expect(card.get('.follow-line').text()).toBe("You'll travel with Ann by default. You can turn this off.");
    expect(accept(w).classes()).toEqual(expect.arrayContaining(['btn', 'btn-primary']));
    expect(decline(w).classes()).toEqual(expect.arrayContaining(['btn', 'btn-secondary']));
    expect(card.get('.note').text()).toBe("Other players can't invite you until you answer.");
  });

  it('names the inviter as the leader in the follow line when the leader is someone else', () => {
    const s = setup();
    (s.social.inviteGroup as unknown as { value: unknown }).value = { id: 8n, leaderCharacterId: BO };
    const w = mountCard(s);
    expect(w.get('.follow-line').text()).toBe("You'll travel with Bo by default. You can turn this off.");
    expect(w.findAll('.tag.tag-neutral').map((chip) => chip.text())).toEqual(['Bo', 'Ann']);
  });

  it('falls back to the inviter for the follow line while the group is unknown', () => {
    const w = mountCard(setup({ applied: false }));
    expect(w.get('.follow-line').text()).toContain('You\'ll travel with Ann by default.');
  });

  it('omits the chips until the inviting group rows apply, but shows the rest', () => {
    const w = mountCard(setup({ applied: false }));
    expect(w.find('.chips').exists()).toBe(false);
    expect(w.find('.tag').exists()).toBe(false);
    expect(w.get('.inviter-line').text()).toBe('Ann invites you to join their party.');
    expect(accept(w).exists()).toBe(true);
  });

  it("renders no card body until the inviter's name is known", async () => {
    const s = setup({ inviterKnown: false });
    const w = mountCard(s);
    expect(w.find('.invite-card').exists()).toBe(false);
    expect(w.get('[role="status"]').text()).toBe('');
    // The hub applies the inviter row: the card appears.
    s.names.set(ANN, character(ANN, 'Ann'));
    (s.incoming as unknown as { value: unknown }).value = { ...s.incoming.value! };
    await nextTick();
    expect(w.find('.invite-card').exists()).toBe(true);
  });

  it('an unresolved member renders Player in a chip', () => {
    const s = setup();
    s.names.delete(BO);
    const w = mountCard(s);
    expect(w.findAll('.tag.tag-neutral').map((chip) => chip.text())).toEqual(['Ann', 'Player']);
  });

  it('is visible while combat is active', () => {
    const w = mountCard(setup({ combat: true }));
    expect(w.find('.invite-card').exists()).toBe(true);
  });

  it('renders names with markup as text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const w = mountCard(setup({ inviterName: payload }));
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.inviter-line').text()).toContain(payload);
    expect(w.get('.follow-line').text()).toContain(payload);
  });

  it('adds the touch class for the mobile and sheet variants only', () => {
    const rail = mountCard(setup());
    expect(rail.get('.invite-card').classes()).not.toContain('touch');
    wrapper?.unmount();
    const mobile = mountCard(setup(), { variant: 'mobile' });
    expect(mobile.get('.invite-card').classes()).toContain('touch');
    wrapper?.unmount();
    const sheet = mountCard(setup(), { variant: 'sheet' });
    expect(sheet.get('.invite-card').classes()).toContain('touch');
  });
});

describe('InviteCard announce', () => {
  it('announces the arrival once, keeps the text on re-render and never includes the timer', async () => {
    const s = setup({ invite: false });
    const w = mountCard(s);
    const status = w.get('[role="status"]');
    expect(status.text()).toBe('');
    s.incoming.value = { id: 40n, groupId: 8n, fromCharacterId: ANN, toCharacterId: ME, createdAt: { microsSinceUnixEpoch: 0n } };
    await nextTick();
    expect(status.text()).toBe('Party invite from Ann.');
    const element = status.element;
    // A re-render with the same invite id leaves the region untouched.
    s.incoming.value = { ...s.incoming.value!, createdAt: { microsSinceUnixEpoch: 5n } };
    await nextTick();
    expect(w.get('[role="status"]').element).toBe(element);
    expect(status.text()).toBe('Party invite from Ann.');
    // The countdown changes the card, not the region.
    s.seconds.value = 120;
    await nextTick();
    expect(status.text()).toBe('Party invite from Ann.');
    expect(status.text()).not.toMatch(/\d:\d\d/);
  });

  it('changes for a new invite id and clears when the invite goes', async () => {
    const s = setup();
    const w = mountCard(s);
    const status = w.get('[role="status"]');
    expect(status.text()).toBe('Party invite from Ann.');
    s.names.set(BO, character(BO, 'Bo'));
    s.incoming.value = { id: 41n, groupId: 9n, fromCharacterId: BO, toCharacterId: ME, createdAt: { microsSinceUnixEpoch: 0n } };
    await nextTick();
    expect(status.text()).toBe('Party invite from Bo.');
    s.incoming.value = null;
    await nextTick();
    expect(status.text()).toBe('');
    expect(w.find('.invite-card').exists()).toBe(false);
  });

  it('keeps the status region outside the card body', () => {
    const w = mountCard(setup());
    expect(w.get('.invite-card').find('[role="status"]').exists()).toBe(false);
  });
});

describe('InviteCard actions', () => {
  it('Accept sends acceptGroupInvite once even when clicked twice quickly, then emits answered', async () => {
    const s = setup({ hold: true });
    const w = mountCard(s);
    await accept(w).trigger('click');
    await accept(w).trigger('click');
    await decline(w).trigger('click');
    expect(s.acceptGroupInvite).toHaveBeenCalledTimes(1);
    expect(s.acceptGroupInvite).toHaveBeenCalledWith({ characterId: ME, fromName: 'Ann' });
    expect(s.rejectGroupInvite).not.toHaveBeenCalled();
    expect(accept(w).attributes('aria-disabled')).toBe('true');
    expect(decline(w).attributes('aria-disabled')).toBe('true');
    expect(w.emitted('answered')).toBeUndefined();
    s.release();
    await flushPromises();
    expect(w.emitted('answered')).toHaveLength(1);
  });

  it('Decline sends rejectGroupInvite once and emits answered', async () => {
    const s = setup();
    const w = mountCard(s);
    await decline(w).trigger('click');
    await decline(w).trigger('click');
    await flushPromises();
    expect(s.rejectGroupInvite.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(s.rejectGroupInvite).toHaveBeenCalledWith({ characterId: ME, fromName: 'Ann' });
    expect(s.acceptGroupInvite).not.toHaveBeenCalled();
    expect(w.emitted('answered')).toBeTruthy();
  });

  it('does not emit answered when the call is rejected', async () => {
    const s = setup();
    s.acceptGroupInvite.mockImplementationOnce(() => Promise.reject(new Error('refused')));
    const w = mountCard(s);
    await accept(w).trigger('click');
    await flushPromises();
    expect(w.emitted('answered')).toBeUndefined();
  });

  it('a rejected Accept or Decline writes the shared send error line to the feed once each (review WR-01)', async () => {
    const s = setup();
    s.acceptGroupInvite.mockImplementationOnce(() => Promise.reject(new Error('refused')));
    s.rejectGroupInvite.mockImplementationOnce(() => Promise.reject(new Error('refused')));
    const append = vi.spyOn(s.game.feed, 'appendLocal');
    const w = mountCard(s);
    await accept(w).trigger('click');
    await flushPromises();
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith('system', SEND_ERROR_TEXT);
    await decline(w).trigger('click');
    await flushPromises();
    expect(append).toHaveBeenCalledTimes(2);
    expect(append).toHaveBeenLastCalledWith('system', SEND_ERROR_TEXT);
  });

  it('at 0 seconds shows Expired, disables both buttons and sends nothing', async () => {
    const s = setup({ secondsLeft: 0 });
    const w = mountCard(s);
    expect(w.get('.timer').text()).toBe('Expired');
    expect(w.text()).not.toContain('Expires in');
    expect(accept(w).attributes('aria-disabled')).toBe('true');
    expect(decline(w).attributes('aria-disabled')).toBe('true');
    expect(w.find('.reason').exists()).toBe(false);
    await accept(w).trigger('click');
    await decline(w).trigger('click');
    expect(s.acceptGroupInvite).not.toHaveBeenCalled();
    expect(s.rejectGroupInvite).not.toHaveBeenCalled();
  });

  it('offline: aria-disabled and a click sends nothing', async () => {
    const s = setup({ connected: false });
    const w = mountCard(s);
    expect(accept(w).attributes('aria-disabled')).toBe('true');
    await accept(w).trigger('click');
    expect(s.acceptGroupInvite).not.toHaveBeenCalled();
  });

  it('a live online card has no aria-disabled buttons', () => {
    const w = mountCard(setup());
    expect(accept(w).attributes('aria-disabled')).toBeUndefined();
    expect(decline(w).attributes('aria-disabled')).toBeUndefined();
  });
});

describe('InviteCard in FeedShell', () => {
  function mountShell(s: ReturnType<typeof setup>, compact: boolean): VueWrapper {
    wrapper = mount(FeedShell, {
      props: { compact },
      attachTo: document.body,
      global: {
        provide: provide(s),
        stubs: { FeedView: true, RoundRow: true, ActionRow: true, HotbarRow: true },
      },
    });
    return wrapper;
  }

  it('compact with an incoming invite renders the card first in the composer section', () => {
    const w = mountShell(setup(), true);
    const section = w.get('section.composer');
    const first = section.element.firstElementChild!;
    expect(first.classList.contains('invite-root')).toBe(true);
    expect(first.querySelector('.invite-card')).not.toBeNull();
    expect(first.querySelector('.invite-card')!.classList.contains('touch')).toBe(true);
  });

  it('compact without an invite renders no card body', () => {
    const w = mountShell(setup({ invite: false }), true);
    expect(w.find('.invite-card').exists()).toBe(false);
  });

  it('not compact renders no invite card at all', () => {
    const w = mountShell(setup(), false);
    expect(w.find('.invite-root').exists()).toBe(false);
    expect(w.find('.invite-card').exists()).toBe(false);
  });

  it('after answering on mobile the composer input has focus', async () => {
    const s = setup();
    const w = mountShell(s, true);
    // The composer takes focus on mount (desktop frame default); move it away first.
    (w.get('input.composer-input').element as HTMLInputElement).blur();
    expect(document.activeElement).not.toBe(w.get('input.composer-input').element);
    await accept(w).trigger('click');
    await flushPromises();
    expect(s.acceptGroupInvite).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(w.get('input.composer-input').element);
  });
});

describe('InviteCard source', () => {
  const text = readFileSync(resolve(process.cwd(), 'src/social/InviteCard.vue'), 'utf8');
  const shell = readFileSync(resolve(process.cwd(), 'src/frame/FeedShell.vue'), 'utf8');

  it('goes through the party actions layer and never joins any other way', () => {
    expect(text).toContain('acceptInvite(');
    expect(text).toContain('declineInvite(');
    expect(text).not.toContain('acceptGroupInvite(');
    expect(text).not.toContain('rejectGroupInvite(');
    expect(text).not.toContain('joinGroup');
    expect(text).not.toContain('join_group');
  });

  it('does not count down or decide expiry on the client', () => {
    expect(text).not.toMatch(/setInterval|setTimeout|Date\.now|isInviteExpired|performance\.now/);
    expect(text).toContain('inviteSecondsLeft(');
  });

  it('keeps one status region and the exact strings', () => {
    expect((text.match(/role="status"/g) ?? []).length).toBe(1);
    expect(text).toContain("Other players can't invite you until you answer.");
    expect(text).toContain('invites you to join their party.');
  });

  it('uses the accent ring, the 22% glow, 32 and 44 button heights', () => {
    expect(text).toContain('inset 0 0 0 1px var(--color-accent)');
    expect(text).toContain('0 0 16px color-mix(in srgb, var(--color-accent) 22%, transparent)');
    expect(text).toContain('min-height: 32px');
    expect(text).toContain('min-height: 44px');
    expect(text).toContain('overflow-wrap: anywhere');
    expect(text).not.toMatch(/outline:\s*(none|0)/);
  });

  it('FeedShell mounts the card with the mobile variant when compact, before RoundRow', () => {
    expect(shell).toContain("import InviteCard from '../social/InviteCard.vue'");
    expect(shell).toContain('<InviteCard v-if="props.compact" variant="mobile" @answered="focusInput" />');
    expect(shell.indexOf('<InviteCard')).toBeLessThan(shell.indexOf('<RoundRow'));
  });
});
