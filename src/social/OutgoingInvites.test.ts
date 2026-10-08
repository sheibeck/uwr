// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import OutgoingInvites from './OutgoingInvites.vue';
import { SOCIAL_KEY, createInertSocial } from './socialContext';
import type { SocialData } from './socialContext';
import { CONSOLE_KEY, GAME_KEY, createInertConsole, createInertGame } from '../game/context';
import type { GameData, GameReducers } from '../game/context';

// Invited · waiting (51.1-UI-SPEC "Outgoing Invites"): the leader sees every pending invite of the
// group, an inviter who is not the leader sees only their own, out of combat. The countdown is
// display only; a row leaves when the server row does.

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

const ME = 1n;
const ANN = 2n;
const BRAM = 10n;
const CY = 11n;

interface InviteRow {
  id: bigint;
  groupId: bigint;
  fromCharacterId: bigint;
  toCharacterId: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
}

const invite = (id: bigint, from: bigint, to: bigint): InviteRow => ({
  id,
  groupId: 5n,
  fromCharacterId: from,
  toCharacterId: to,
  createdAt: { microsSinceUnixEpoch: 0n },
});

interface Options {
  leader?: bigint;
  rows?: InviteRow[];
  combat?: boolean;
  connected?: boolean;
  hold?: boolean;
  unresolved?: bigint[];
}

function setup(options: Options = {}) {
  const gates: Array<() => void> = [];
  const cancelGroupInvite = vi.fn((_args: { characterId: bigint; targetName: string }) =>
    options.hold ? new Promise<void>((open) => gates.push(open)) : Promise.resolve(),
  );
  const reducers = { cancelGroupInvite } as unknown as GameReducers;
  const base = createInertGame();
  const game = {
    ...base,
    connected: ref(options.connected ?? true),
    characterId: ref<bigint | null>(ME),
    group: ref({ id: 5n, leaderCharacterId: options.leader ?? ME }),
    combat: { ...base.combat, active: ref(options.combat ?? false) },
    reducers: ref(reducers),
  } as unknown as GameData;
  const rows = ref<InviteRow[]>(options.rows ?? [invite(21n, ME, CY), invite(20n, ME, BRAM)]);
  const seconds = ref<Record<string, number>>({ '20': 200, '21': 10 });
  const names = new Map<bigint, { id: bigint; name: string }>([
    [BRAM, { id: BRAM, name: 'Bram' }],
    [CY, { id: CY, name: 'Cy' }],
  ]);
  for (const id of options.unresolved ?? []) names.delete(id);
  const social = {
    ...createInertSocial(),
    outgoingInvites: rows,
    outgoingApplied: ref(true),
    characterById: (id: bigint) => names.get(id) ?? null,
    inviteSecondsLeft: (row: { id?: bigint }) => seconds.value[String(row.id)] ?? 100,
  } as unknown as SocialData;
  return {
    game,
    social,
    rows,
    seconds,
    names,
    cancelGroupInvite,
    release: () => gates.splice(0).forEach((open) => open()),
  };
}

function mountList(s: ReturnType<typeof setup>, props: Record<string, unknown> = {}, attach = true): VueWrapper {
  wrapper = mount(OutgoingInvites, {
    props: props as never,
    attachTo: attach ? document.body : undefined,
    global: {
      provide: {
        [GAME_KEY as symbol]: s.game,
        [SOCIAL_KEY as symbol]: s.social,
        [CONSOLE_KEY as symbol]: createInertConsole(),
      },
    },
  });
  return wrapper;
}

const cancelButtons = (w: VueWrapper) => w.findAll('button.cancel');

describe('OutgoingInvites rows', () => {
  it('the leader sees every pending invite in invite id order', () => {
    const w = mountList(setup());
    expect(w.get('h6').text()).toBe('Invited · waiting');
    const items = w.findAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].get('.character-name').text()).toBe('Bram');
    expect(items[1].get('.character-name').text()).toBe('Cy');
    expect(items[0].find('svg').exists()).toBe(true);
    const timers = items.map((item) => item.get('.timer'));
    expect(timers.map((t) => t.text())).toEqual(['3:20', '0:10']);
    expect(timers[0].attributes('aria-hidden')).toBe('true');
    expect(items[0].get('.sr-only').text()).toBe('Expires in about 4 minutes');
    expect(items[1].get('.sr-only').text()).toBe('Expires in about 1 minute');
    const buttons = cancelButtons(w);
    expect(buttons.map((b) => b.text())).toEqual(['Cancel invite', 'Cancel invite']);
    expect(buttons.map((b) => b.attributes('aria-label'))).toEqual(['Cancel invite to Bram', 'Cancel invite to Cy']);
    expect(buttons[0].classes()).toEqual(expect.arrayContaining(['btn', 'btn-ghost']));
  });

  it('a member who sent the invite to Bram sees only that row', () => {
    const w = mountList(setup({ leader: ANN, rows: [invite(20n, ME, BRAM), invite(21n, ANN, CY)] }));
    const items = w.findAll('li');
    expect(items).toHaveLength(1);
    expect(items[0].text()).toContain('Bram');
  });

  it('a member who sent none sees nothing', () => {
    const w = mountList(setup({ leader: ANN, rows: [invite(21n, ANN, CY)] }));
    expect(w.find('h6').exists()).toBe(false);
    expect(w.find('li').exists()).toBe(false);
  });

  it('renders nothing with no invites and with the inert hub', () => {
    const w = mountList(setup({ rows: [] }));
    expect(w.find('h6').exists()).toBe(false);
    wrapper?.unmount();
    wrapper = mount(OutgoingInvites);
    expect(wrapper.find('h6').exists()).toBe(false);
  });

  it('renders nothing in combat', () => {
    const w = mountList(setup({ combat: true }));
    expect(w.find('h6').exists()).toBe(false);
    expect(w.find('li').exists()).toBe(false);
  });

  it('at 0 seconds the row reads Expired and its Cancel invite is aria-disabled', async () => {
    const s = setup();
    s.seconds.value = { '20': 200, '21': 0 };
    const w = mountList(s);
    const items = w.findAll('li');
    expect(items[1].get('.timer').text()).toBe('Expired');
    expect(items[1].find('.sr-only').exists()).toBe(false);
    expect(cancelButtons(w)[1].attributes('aria-disabled')).toBe('true');
    expect(cancelButtons(w)[0].attributes('aria-disabled')).toBeUndefined();
    await cancelButtons(w)[1].trigger('click');
    expect(s.cancelGroupInvite).not.toHaveBeenCalled();
  });

  it('an unresolved target reads Player and its Cancel invite is aria-disabled', async () => {
    const s = setup({ unresolved: [BRAM] });
    const w = mountList(s);
    const first = w.findAll('li')[0];
    expect(first.get('.character-name').text()).toBe('Player');
    expect(cancelButtons(w)[0].attributes('aria-disabled')).toBe('true');
    await cancelButtons(w)[0].trigger('click');
    expect(s.cancelGroupInvite).not.toHaveBeenCalled();
  });

  it('renders names as text, never markup', () => {
    const s = setup();
    s.names.set(BRAM, { id: BRAM, name: '<img src=x onerror=alert(1)>' });
    const w = mountList(s);
    expect(w.find('img').exists()).toBe(false);
    expect(w.findAll('li')[0].text()).toContain('<img src=x onerror=alert(1)>');
  });

  it('the sheet variant adds the sheet class; the rail does not', () => {
    const rail = mountList(setup());
    expect(rail.get('ul').classes()).not.toContain('sheet');
    wrapper?.unmount();
    const sheet = mountList(setup(), { variant: 'sheet' });
    expect(sheet.get('ul').classes()).toContain('sheet');
  });
});

describe('OutgoingInvites cancel', () => {
  it('Cancel sends cancelGroupInvite once and the row stays until the server row goes', async () => {
    const s = setup({ hold: true });
    const w = mountList(s);
    await cancelButtons(w)[0].trigger('click');
    await cancelButtons(w)[0].trigger('click');
    expect(s.cancelGroupInvite).toHaveBeenCalledTimes(1);
    expect(s.cancelGroupInvite).toHaveBeenCalledWith({ characterId: ME, targetName: 'Bram' });
    expect(cancelButtons(w)[0].attributes('aria-disabled')).toBe('true');
    s.release();
    await flushPromises();
    expect(w.findAll('li')).toHaveLength(2);
    expect(cancelButtons(w)[0].attributes('aria-disabled')).toBeUndefined();
  });

  it("offline: aria-disabled and a click sends nothing", async () => {
    const s = setup({ connected: false });
    const w = mountList(s);
    expect(cancelButtons(w)[0].attributes('aria-disabled')).toBe('true');
    await cancelButtons(w)[0].trigger('click');
    expect(s.cancelGroupInvite).not.toHaveBeenCalled();
  });

  it("after Bram's row goes, focus moves to Cy's Cancel invite", async () => {
    const s = setup();
    const w = mountList(s);
    (cancelButtons(w)[0].element as HTMLElement).focus();
    await cancelButtons(w)[0].trigger('click');
    await flushPromises();
    s.rows.value = s.rows.value.filter((row) => row.id !== 20n);
    await nextTick();
    await nextTick();
    expect(w.findAll('li')).toHaveLength(1);
    expect(document.activeElement).toBe(cancelButtons(w)[0].element);
    expect(w.emitted('focusHeading')).toBeUndefined();
  });

  it('when the last row goes after a cancel, focusHeading is emitted', async () => {
    const s = setup({ rows: [invite(20n, ME, BRAM)] });
    const w = mountList(s);
    (cancelButtons(w)[0].element as HTMLElement).focus();
    await cancelButtons(w)[0].trigger('click');
    await flushPromises();
    s.rows.value = [];
    await nextTick();
    await nextTick();
    expect(w.find('li').exists()).toBe(false);
    expect(w.emitted('focusHeading')).toHaveLength(1);
  });

  it('cancelling the last of several rows with none after it emits focusHeading', async () => {
    const s = setup();
    const w = mountList(s);
    (cancelButtons(w)[1].element as HTMLElement).focus();
    await cancelButtons(w)[1].trigger('click');
    await flushPromises();
    s.rows.value = s.rows.value.filter((row) => row.id !== 21n);
    await nextTick();
    await nextTick();
    expect(w.emitted('focusHeading')).toHaveLength(1);
  });

  it('a row that goes without a cancel from here does not move focus or emit', async () => {
    const s = setup();
    const w = mountList(s);
    s.rows.value = s.rows.value.filter((row) => row.id !== 20n);
    await nextTick();
    await nextTick();
    expect(w.emitted('focusHeading')).toBeUndefined();
    expect(document.activeElement).not.toBe(cancelButtons(w)[0].element);
  });

  it('a rejected cancel forgets the remembered row', async () => {
    const s = setup({ rows: [invite(20n, ME, BRAM)] });
    s.cancelGroupInvite.mockImplementationOnce(() => Promise.reject(new Error('refused')));
    const w = mountList(s);
    await cancelButtons(w)[0].trigger('click');
    await flushPromises();
    // The row later goes for another reason (expiry): no focus move.
    s.rows.value = [];
    await nextTick();
    await nextTick();
    expect(w.emitted('focusHeading')).toBeUndefined();
  });
});

describe('OutgoingInvites source', () => {
  const text = readFileSync(resolve(process.cwd(), 'src/social/OutgoingInvites.vue'), 'utf8');

  it('goes through the party actions layer', () => {
    expect((text.match(/cancelInvite\(/g) ?? []).length).toBe(1);
    expect(text).not.toContain('cancelGroupInvite(');
  });

  it('does not count down or decide expiry on the client', () => {
    expect(text).not.toMatch(/setInterval|setTimeout|Date\.now|isInviteExpired|performance\.now/);
    expect(text).toContain('inviteSecondsLeft(');
  });

  it('uses the spec strings and sizes', () => {
    expect((text.match(/Invited · waiting/g) ?? []).length).toBe(1);
    expect(text).toContain('focusHeading');
    expect(text).toContain('min-height: 28px');
    expect(text).toContain('min-height: 44px');
    expect(text).toContain('padding: 4px 8px');
    expect(text).toContain('padding: 8px 16px');
    expect(text).toContain('inset 0 0 0 1px var(--color-neutral-800)');
    expect(text).not.toMatch(/outline:\s*(none|0)/);
  });
});
