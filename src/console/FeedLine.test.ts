// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import FeedLine from './FeedLine.vue';
import { keywordActionLabel } from './keywordLabel';
import type { FeedLineView } from './lines';
import type { KeywordEntry } from './keywords';

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function makeLine(overrides: Partial<FeedLineView>): FeedLineView {
  return {
    key: 'k:0',
    kind: 'system',
    label: null,
    speaker: null,
    speakerNpcId: null,
    direction: null,
    title: null,
    text: '',
    queued: false,
    keywordEligible: false,
    parts: null,
    titleParts: null,
    speakerKeyword: null,
    ...overrides,
  };
}

function render(line: FeedLineView, disabled = false): VueWrapper {
  wrapper = mount(FeedLine, { props: { line, disabled } });
  return wrapper;
}

const WELL: KeywordEntry = { kind: 'node', id: 4n, name: 'Old Well' };
const FERRYMAN: KeywordEntry = { kind: 'npc', id: 1n, name: 'Ferryman' };
const GLOAM: KeywordEntry = { kind: 'place', id: 2n, name: 'Gloamwood' };
const MARISOL: KeywordEntry = { kind: 'player', id: 3n, name: 'Marisol' };

describe('keywordActionLabel', () => {
  it('names the action for each keyword kind', () => {
    expect(keywordActionLabel(FERRYMAN)).toBe('Hail Ferryman');
    expect(keywordActionLabel(GLOAM)).toBe('Travel to Gloamwood');
    expect(keywordActionLabel(WELL)).toBe('Examine Old Well');
    expect(keywordActionLabel(MARISOL)).toBe('Whisper Marisol');
  });
});

describe('FeedLine kinds', () => {
  it('renders Keeper narration with the Keeper label and keyword buttons', () => {
    const w = render(
      makeLine({
        kind: 'keeper',
        label: 'The Keeper',
        text: 'You see the Old Well.',
        keywordEligible: true,
        parts: [
          { text: 'You see the ', entry: null },
          { text: 'Old Well', entry: WELL },
          { text: '.', entry: null },
        ],
      }),
    );
    expect(w.get('.micro').text()).toBe('The Keeper');
    expect(w.get('.body').text()).toBe('You see the Old Well.');
    const button = w.get('button.keyword');
    expect(button.attributes('type')).toBe('button');
    expect(button.attributes('title')).toBe('Examine Old Well');
    expect(button.attributes('aria-label')).toBe('Examine Old Well');
    expect(button.text()).toBe('Old Well');
  });

  it('emits keyword with the entry on click', async () => {
    const w = render(
      makeLine({
        kind: 'keeper',
        label: 'The Keeper',
        text: 'Old Well',
        keywordEligible: true,
        parts: [{ text: 'Old Well', entry: WELL }],
      }),
    );
    await w.get('button.keyword').trigger('click');
    expect(w.emitted('keyword')).toEqual([[WELL]]);
  });

  it('renders NPC speech with the speaker, says and typographic quotes', () => {
    const w = render(makeLine({ kind: 'npc', speaker: 'The Ferryman', text: 'Mind the current.' }));
    expect(w.text()).toBe('The Ferryman says, “Mind the current.”');
    expect(w.find('button').exists()).toBe(false);
    expect(w.get('.who').text()).toBe('The Ferryman');
  });

  it('makes the NPC speaker a hail keyword when the NPC is still here', async () => {
    const w = render(
      makeLine({
        kind: 'npc',
        speaker: 'The Ferryman',
        speakerNpcId: 1n,
        text: 'Mind the current.',
        keywordEligible: true,
        speakerKeyword: { kind: 'npc', id: 1n, name: 'The Ferryman' },
        parts: [{ text: 'Mind the current.', entry: null }],
      }),
    );
    const button = w.get('button.keyword');
    expect(button.attributes('aria-label')).toBe('Hail The Ferryman');
    expect(w.text()).toBe('The Ferryman says, “Mind the current.”');
    await button.trigger('click');
    expect(w.emitted('keyword')).toEqual([[{ kind: 'npc', id: 1n, name: 'The Ferryman' }]]);
  });

  it('renders the whole text when an NPC line has no speaker', () => {
    const w = render(makeLine({ kind: 'npc', speaker: null, text: 'A voice drifts over the water.' }));
    expect(w.text()).toBe('A voice drifts over the water.');
    expect(w.text()).not.toContain('says');
  });

  it('renders received, sent and unparsed whispers', () => {
    expect(render(makeLine({ kind: 'whisper', speaker: 'Mara', direction: 'received', text: 'hi' })).text()).toBe(
      'Mara whispers, “hi”',
    );
    wrapper?.unmount();
    expect(render(makeLine({ kind: 'whisper', speaker: 'Mara', direction: 'sent', text: 'hi' })).text()).toBe(
      'You whisper to Mara, “hi”',
    );
    wrapper?.unmount();
    expect(render(makeLine({ kind: 'whisper', text: 'something odd' })).text()).toBe('something odd');
  });

  it('renders party chat with the party icon and a hidden Party label', () => {
    const w = render(makeLine({ kind: 'party', speaker: 'Mara', text: 'hello' }));
    expect(w.find('svg').exists()).toBe(true);
    expect(w.get('.sr-only').text()).toBe('Party');
    expect(w.get('.body').text()).toBe('Mara says, “hello”');
  });

  it('renders quest, reward and faction lines with their inline label', () => {
    for (const label of ['Quest', 'Reward', 'Faction']) {
      const w = render(makeLine({ kind: 'quest', label, text: 'Done.' }));
      expect(w.get('.micro').text()).toBe(label);
      expect(w.get('.body').text()).toBe('Done.');
      w.unmount();
      wrapper = null;
    }
  });

  it('renders ripple and world event blocks with their labels and icons', () => {
    const ripple = render(makeLine({ kind: 'ripple', label: 'Ripple', text: 'The tide turns.' }));
    expect(ripple.get('.micro').text()).toBe('Ripple');
    expect(ripple.find('svg').exists()).toBe(true);
    ripple.unmount();
    wrapper = null;
    const event = render(makeLine({ kind: 'worldEvent', label: 'World event', text: 'A storm.' }));
    expect(event.get('.micro').text()).toBe('World event');
    expect(event.find('svg').exists()).toBe(true);
  });

  it('renders a scene title above the text, and no title for a single line', () => {
    const w = render(makeLine({ kind: 'scene', title: 'The Docks', text: 'Gulls wheel overhead.' }));
    expect(w.get('.title').text()).toBe('The Docks');
    expect(w.get('.body').text()).toBe('Gulls wheel overhead.');
    w.unmount();
    wrapper = null;
    const bare = render(makeLine({ kind: 'scene', title: null, text: 'Gulls wheel overhead.' }));
    expect(bare.find('.title').exists()).toBe(false);
  });

  it('renders an echo with a leading ›, and a queued echo with the Queued tag', () => {
    const w = render(makeLine({ kind: 'echo', text: 'look at well' }));
    expect(w.text()).toBe('› look at well');
    expect(w.find('.queued').exists()).toBe(false);
    w.unmount();
    wrapper = null;
    const q = render(makeLine({ kind: 'echo', text: 'look at well', queued: true }));
    expect(q.get('.queued').text()).toBe('Queued');
    expect(q.find('.queued svg').exists()).toBe(true);
  });

  it('renders warning and error lines with the warning icon', () => {
    for (const kind of ['warning', 'error'] as const) {
      const w = render(makeLine({ kind, text: 'Careful.' }));
      expect(w.find('svg').exists()).toBe(true);
      expect(w.text()).toBe('Careful.');
      w.unmount();
      wrapper = null;
    }
  });

  it('renders system, say and combat lines as plain text', () => {
    for (const kind of ['system', 'say', 'combat', 'damage', 'heal'] as const) {
      const w = render(makeLine({ kind, text: 'Plain.' }));
      expect(w.text()).toBe('Plain.');
      expect(w.find('button').exists()).toBe(false);
      w.unmount();
      wrapper = null;
    }
  });

  it('renders keywords in the scene title', () => {
    const w = render(
      makeLine({
        kind: 'scene',
        title: 'Gloamwood',
        text: 'Trees.',
        keywordEligible: true,
        titleParts: [{ text: 'Gloamwood', entry: GLOAM }],
        parts: [{ text: 'Trees.', entry: null }],
      }),
    );
    expect(w.get('.title button').attributes('aria-label')).toBe('Travel to Gloamwood');
  });
});

describe('FeedLine disabled', () => {
  it('marks keywords aria-disabled and emits nothing on click', async () => {
    const w = render(
      makeLine({
        kind: 'keeper',
        label: 'The Keeper',
        text: 'Old Well',
        keywordEligible: true,
        parts: [{ text: 'Old Well', entry: WELL }],
      }),
      true,
    );
    const button = w.get('button.keyword');
    expect(button.attributes('aria-disabled')).toBe('true');
    await button.trigger('click');
    expect(w.emitted('keyword')).toBeUndefined();
  });

  it('leaves aria-disabled off while connected', () => {
    const w = render(
      makeLine({ kind: 'keeper', text: 'x', keywordEligible: true, parts: [{ text: 'x', entry: WELL }] }),
    );
    expect(w.get('button.keyword').attributes('aria-disabled')).toBeUndefined();
  });
});

describe('FeedLine hostile text (T-47-01, T-47-06)', () => {
  const PAYLOAD = '<img src=x onerror=alert(1)>';

  it('renders markup as literal text for every text-bearing kind', () => {
    for (const kind of ['keeper', 'npc', 'whisper', 'party', 'system', 'quest', 'ripple', 'scene', 'echo', 'error', 'say'] as const) {
      const w = render(makeLine({ kind, speaker: kind === 'npc' || kind === 'whisper' || kind === 'party' ? 'Mara' : null, direction: 'received', text: PAYLOAD }));
      expect(w.find('img').exists(), kind).toBe(false);
      expect(w.text(), kind).toContain(PAYLOAD);
      w.unmount();
      wrapper = null;
    }
  });

  it('renders the payload in a speaker name and a scene title as text', () => {
    const w = render(makeLine({ kind: 'npc', speaker: PAYLOAD, text: 'hi' }));
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.who').text()).toBe(PAYLOAD);
    w.unmount();
    wrapper = null;
    const scene = render(makeLine({ kind: 'scene', title: PAYLOAD, text: 'body' }));
    expect(scene.find('img').exists()).toBe(false);
    expect(scene.get('.title').text()).toBe(PAYLOAD);
  });

  it('renders a color token inside a segment literally', () => {
    const token = '{{color:#fff}}bright{{/color}}';
    const w = render(makeLine({ kind: 'keeper', label: 'The Keeper', text: token }));
    expect(w.get('.body').text()).toBe(token);
  });

  it('renders no button for a say, whisper or party line that names a place', () => {
    for (const kind of ['say', 'whisper', 'party'] as const) {
      const w = render(makeLine({ kind, speaker: kind === 'say' ? null : 'Mara', direction: 'received', text: 'meet at Gloamwood', parts: null }));
      expect(w.find('button').exists(), kind).toBe(false);
      w.unmount();
      wrapper = null;
    }
  });
});

describe('FeedLine source', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/console/FeedLine.vue'), 'utf8');

  it('carries the keyword underline offset and the three line hues', () => {
    expect(source).toContain('text-underline-offset: 4px');
    expect(source).toContain('var(--color-line-npc)');
    expect(source).toContain('var(--color-line-whisper)');
    expect(source).toContain('var(--color-line-quest)');
  });

  it('wraps long text and has no raw HTML sink', () => {
    expect(source).toContain('overflow-wrap: anywhere');
    expect(source).not.toMatch(/v-html|innerHTML/);
  });
});
