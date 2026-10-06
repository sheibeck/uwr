// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
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
  function mountLine(rejection = 0): VueWrapper {
    wrapper = mount(NoticeLine, {
      props: { rejection },
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
