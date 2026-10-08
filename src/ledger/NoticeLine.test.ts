// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { PhCheckCircle, PhInfo, PhWarningCircle } from '@phosphor-icons/vue';
import NoticeLine, { MIRRORED_KINDS } from './NoticeLine.vue';
import { GAME_KEY, createInertGame } from '../game/context';
import type { GameData } from '../game/context';
import { createFeedStore } from '../console/feedStore';
import type { ServerFeedSource } from '../console/feedStore';
import { SEND_ERROR_TEXT } from './actionRunner';

const XSS = '<img src=x onerror=alert(1)>';
const CHARACTER = 1n;

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

let nextId = 1n;
function row(kind: string, message: string, extra: Record<string, unknown> = {}) {
  const id = nextId;
  nextId += 1n;
  return {
    id,
    kind,
    message,
    createdAt: { microsSinceUnixEpoch: id * 10n },
    characterId: CHARACTER,
    ...extra,
  };
}

function setup() {
  const feed = createFeedStore();
  feed.setCharacter(CHARACTER);
  const game = { ...createInertGame(), feed } as unknown as GameData;
  function send(source: ServerFeedSource, kind: string, message: string, extra: Record<string, unknown> = {}) {
    feed.ingest(source, row(kind, message, extra));
    feed.flush();
  }
  function mountLine(rejection = 0, extra: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(NoticeLine, {
      props: { rejection, ...extra },
      global: { provide: { [GAME_KEY as symbol]: game } },
    });
    return wrapper;
  }
  return { feed, send, mountLine };
}

describe('NoticeLine', () => {
  it('pins the mirrored kinds to system, reward and heal', () => {
    expect([...MIRRORED_KINDS].sort()).toEqual(['heal', 'reward', 'system']);
  });

  it('never shows entries present at mount, and renders nothing until a line arrives', async () => {
    const { send, mountLine } = setup();
    send('private', 'system', 'Already here.');
    const w = mountLine();
    expect(w.find('.notice-line').exists()).toBe(false);
    expect(w.html()).not.toContain('Already here.');
    send('private', 'system', 'Fresh line.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Fresh line.');
  });

  it('shows a reward with the check icon and a heal with the check icon', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    send('private', 'reward', 'You sell the blade for 12 gold.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('You sell the blade for 12 gold.');
    expect(w.findComponent(PhCheckCircle).exists()).toBe(true);
    send('private', 'heal', 'You recover.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('You recover.');
    expect(w.findComponent(PhCheckCircle).exists()).toBe(true);
    expect(w.findComponent(PhInfo).exists()).toBe(false);
  });

  it('shows a loot line as plain names with no token text (quick 261008-f3m)', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    send(
      'private',
      'reward',
      'Loot dropped: {{loot:41:common}}Rusty Dagger{{/loot}}, {{loot:42:uncommon}}Wolf Pelt{{/loot}} {{lootall}}Take all{{/lootall}}',
    );
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Loot dropped: Rusty Dagger, Wolf Pelt');
    expect(w.get('.notice-line').text()).not.toMatch(/[{}]/);
  });

  it('shows a system line with the info icon', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    send('private', 'system', 'Your backpack is full.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Your backpack is full.');
    expect(w.findComponent(PhInfo).exists()).toBe(true);
    expect(w.findComponent(PhCheckCircle).exists()).toBe(false);
    expect(w.findComponent(PhWarningCircle).exists()).toBe(false);
  });

  it('ignores other kinds and other sources', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    for (const kind of ['narrative', 'combat', 'quest', 'faction', 'chat', 'whisper', 'group', 'say', 'presence']) {
      send('private', kind, `private ${kind}`);
    }
    send('location', 'system', 'location system');
    send('group', 'system', 'group system', { characterId: 99n });
    send('world', 'reward', 'world reward');
    await nextTick();
    expect(w.find('.notice-line').exists()).toBe(false);
  });

  it('replaces the shown line with a newer mirrored one', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    send('private', 'system', 'First.');
    await nextTick();
    send('private', 'reward', 'Second.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Second.');
    send('private', 'narrative', 'Not mirrored.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Second.');
  });

  it('shows the send error on a rejection and a later server line replaces it', async () => {
    const { send, mountLine } = setup();
    const w = mountLine(0);
    await w.setProps({ rejection: 1 });
    expect(w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
    expect(w.findComponent(PhWarningCircle).exists()).toBe(true);
    send('private', 'system', 'Back to normal.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Back to normal.');
    expect(w.findComponent(PhWarningCircle).exists()).toBe(false);
  });

  it('does not bring an older server line back after a rejection', async () => {
    const { send, mountLine } = setup();
    const w = mountLine(0);
    send('private', 'reward', 'Sold.');
    await nextTick();
    await w.setProps({ rejection: 1 });
    expect(w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
    send('private', 'narrative', 'Unrelated line.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
  });

  it('is a polite status region', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    send('private', 'system', 'Hello.');
    await nextTick();
    const line = w.get('.notice-line');
    expect(line.attributes('role')).toBe('status');
    expect(line.attributes('aria-live')).toBe('polite');
  });

  it('renders markup literally and removes color tokens and bracket words', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    send('private', 'system', XSS);
    await nextTick();
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.notice-text').text()).toBe(XSS);
    send('private', 'system', '{{color:red}}Sold [Ashen Blade].{{/color}}');
    await nextTick();
    expect(w.get('.notice-text').text()).toBe('Sold Ashen Blade.');
  });

  it('starts empty again on a remount', async () => {
    const { send, mountLine } = setup();
    const first = mountLine();
    send('private', 'system', 'Seen once.');
    await nextTick();
    expect(first.get('.notice-line').text()).toBe('Seen once.');
    first.unmount();
    wrapper = null;
    const second = mountLine();
    expect(second.find('.notice-line').exists()).toBe(false);
  });
});

// The kinds prop (51.1 Plan 16, research Pitfall 4): the Party sheet mirrors system and group lines;
// every other use keeps the default set.
describe('NoticeLine kinds', () => {
  const SHEET = new Set(['system', 'group']);

  it('with no kinds prop a private group line does not show (default unchanged)', async () => {
    const { send, mountLine } = setup();
    const w = mountLine();
    send('private', 'group', 'You invited Bo.');
    await nextTick();
    expect(w.find('.notice-line').exists()).toBe(false);
  });

  it('with kinds system and group a group line arriving after mount shows, with the info icon', async () => {
    const { send, mountLine } = setup();
    const w = mountLine(0, { kinds: SHEET });
    send('private', 'group', 'Only the leader can invite.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('Only the leader can invite.');
    expect(w.findComponent(PhInfo).exists()).toBe(true);
    expect(w.findComponent(PhCheckCircle).exists()).toBe(false);
  });

  it('still shows system lines, and never shows friend, reward, chat or other-source lines', async () => {
    const { send, mountLine } = setup();
    const w = mountLine(0, { kinds: SHEET });
    send('private', 'friend', 'A friend line.');
    send('private', 'reward', 'A reward line.');
    send('private', 'chat', 'A chat line.');
    send('group', 'group', 'Someone else', { characterId: 99n });
    send('location', 'system', 'location system');
    await nextTick();
    expect(w.find('.notice-line').exists()).toBe(false);
    send('private', 'system', 'A system line.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('A system line.');
  });

  it('a group line present at mount is never shown', async () => {
    const { send, mountLine } = setup();
    send('private', 'group', 'Old refusal.');
    const w = mountLine(0, { kinds: SHEET });
    expect(w.find('.notice-line').exists()).toBe(false);
  });

  it('with sendErrors the shared send error line written to the feed shows as the rejection', async () => {
    const { feed, mountLine } = setup();
    const w = mountLine(0, { kinds: SHEET, sendErrors: true });
    feed.appendLocal('system', SEND_ERROR_TEXT);
    await nextTick();
    expect(w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
    expect(w.findComponent(PhWarningCircle).exists()).toBe(true);
    expect(w.findComponent(PhInfo).exists()).toBe(false);
  });

  it('without sendErrors (every other screen) a local send error line does not show', async () => {
    const { feed, mountLine } = setup();
    const w = mountLine(0, { kinds: SHEET });
    feed.appendLocal('system', SEND_ERROR_TEXT);
    await nextTick();
    expect(w.find('.notice-line').exists()).toBe(false);
  });

  it('with sendErrors no other local line shows, and one present at mount never does', async () => {
    const { feed, send, mountLine } = setup();
    feed.appendLocal('system', SEND_ERROR_TEXT);
    const w = mountLine(0, { kinds: SHEET, sendErrors: true });
    feed.appendLocal('system', 'Queue full.');
    feed.appendLocal('echo', SEND_ERROR_TEXT);
    await nextTick();
    expect(w.find('.notice-line').exists()).toBe(false);
    send('private', 'group', 'You invited Bo.');
    await nextTick();
    expect(w.get('.notice-line').text()).toBe('You invited Bo.');
    feed.appendLocal('system', SEND_ERROR_TEXT);
    await nextTick();
    expect(w.get('.notice-line').text()).toBe(SEND_ERROR_TEXT);
  });

  it('keeps the default set pinned in the source and reads props.kinds in the filter', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/ledger/NoticeLine.vue'), 'utf8');
    expect(source).toContain('kinds?: ReadonlySet<string>');
    expect(source).toContain('kinds: () => MIRRORED_KINDS');
    expect(source).toContain('props.kinds.has(entry.kind)');
  });
});
