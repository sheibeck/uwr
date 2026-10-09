// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import FeedLine from './FeedLine.vue';
import { keywordActionLabel } from './keywordLabel';
import { classifyEntry, type FeedLineView, type LineSource } from './lines';
import { buildVocabulary, findKeywords, type KeywordEntry } from './keywords';
import { cleanServerText } from './cleanServerText';
import { formatLootLine, LOOT_DROPPED_LEAD, parseLootLine } from '@game-data/loot_line';
import { lootParts, lootPlainText } from './lootLine';

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
    expect(keywordActionLabel(FERRYMAN)).toBe('Talk to Ferryman');
    expect(keywordActionLabel(GLOAM)).toBe('Travel to Gloamwood');
    expect(keywordActionLabel(WELL)).toBe('Examine Old Well');
    expect(keywordActionLabel(MARISOL)).toBe('Whisper Marisol');
    expect(keywordActionLabel({ kind: 'enemy', id: 4n, name: 'Goblin Scout' })).toBe('Pull Goblin Scout');
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
    expect(button.attributes('aria-label')).toBe('Talk to The Ferryman');
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

  it('renders world and world event blocks with the World event label and their icons', () => {
    const world = render(makeLine({ kind: 'world', label: 'World event', text: 'The tide turns.' }));
    expect(world.get('.micro').text()).toBe('World event');
    expect(world.find('svg').exists()).toBe(true);
    world.unmount();
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
    for (const kind of ['keeper', 'npc', 'whisper', 'party', 'system', 'quest', 'world', 'scene', 'echo', 'error', 'say'] as const) {
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

describe('FeedLine round headers', () => {
  const round = (overrides: Partial<FeedLineView> = {}) =>
    makeLine({ kind: 'round', text: 'Round 3', roundNumber: 3n, roundKey: '10:3', ...overrides });

  it('renders a divider with two hidden rules and the label', () => {
    const w = render(round());
    const root = w.get('.line-round');
    expect(root.findAll('.rule')).toHaveLength(2);
    for (const rule of root.findAll('.rule')) expect(rule.attributes('aria-hidden')).toBe('true');
    expect(root.get('.round-label').text()).toBe('Round 3');
    expect(w.find('button').exists()).toBe(false);
    expect(root.classes()).not.toContain('current');
  });

  it('marks the open round with the current class', () => {
    wrapper = mount(FeedLine, { props: { line: round(), disabled: false, currentRound: true } });
    expect(wrapper.get('.line-round').classes()).toContain('current');
  });
});

describe('FeedLine wind-up block', () => {
  const windup = (lead: string, ability: string, tail: string) =>
    makeLine({ kind: 'windup', text: lead + ability + tail, windup: { lead, ability, tail } });

  it('renders the icon, the lead, the emphasised ability and the tail', () => {
    const w = render(windup('Rotfang winds up ', 'Bile Spray', ' → you · lands in 2 rounds'));
    const icon = w.get('svg.icon-windup');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(w.get('.ability').text()).toBe('Bile Spray');
    expect(w.text()).toBe('Rotfang winds up Bile Spray → you · lands in 2 rounds');
  });

  it('renders markup in names as text', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const w = render(windup(`${payload} winds up `, payload, ` → ${payload} · lands this round`));
    expect(w.find('img').exists()).toBe(false);
    expect(w.get('.ability').text()).toBe(payload);
    expect(w.text()).toContain(`${payload} winds up ${payload}`);
  });
});

describe('FeedLine late narration tag', () => {
  it('shows the round after the Keeper label and extends the aria-label', () => {
    const w = render(makeLine({ kind: 'keeper', label: 'The Keeper', text: 'Steel rings.', roundTag: 2n }));
    const label = w.get('.micro');
    expect(label.text()).toBe('The Keeper · Round 2');
    expect(label.attributes('aria-label')).toBe('The Keeper, about round 2');
    expect(label.get('.round-tag').text()).toBe('· Round 2');
  });

  it('leaves the label unchanged without a tag', () => {
    const w = render(makeLine({ kind: 'keeper', label: 'The Keeper', text: 'Steel rings.' }));
    const label = w.get('.micro');
    expect(label.text()).toBe('The Keeper');
    expect(label.attributes('aria-label')).toBeUndefined();
    expect(w.find('.round-tag').exists()).toBe(false);
  });
});

describe('FeedLine combat amounts', () => {
  it('wraps the last integer of a damage line and keeps the text whole', () => {
    const w = render(makeLine({ kind: 'damage', text: 'Rotfang hits you for 22 damage.' }));
    expect(w.get('.amount').text()).toBe('22');
    expect(w.text()).toBe('Rotfang hits you for 22 damage.');
  });

  it('wraps the last integer of a heal line', () => {
    const w = render(makeLine({ kind: 'heal', text: 'Mara mends you for 14.' }));
    expect(w.get('.amount').text()).toBe('14');
    expect(w.text()).toBe('Mara mends you for 14.');
  });

  it('adds no span to a line without an integer or to other combat kinds', () => {
    expect(render(makeLine({ kind: 'damage', text: 'A glancing blow.' })).find('.amount').exists()).toBe(false);
    wrapper?.unmount();
    expect(render(makeLine({ kind: 'combat', text: 'It hits for 5.' })).find('.amount').exists()).toBe(false);
  });

  it('renders markup in a damage line literally', () => {
    const w = render(makeLine({ kind: 'damage', text: 'It hits <b>7</b> hard.' }));
    expect(w.find('b').exists()).toBe(false);
    expect(w.text()).toBe('It hits <b>7</b> hard.');
    expect(w.findAll('.amount')).toHaveLength(1);
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

  it('carries the round, wind-up, tag and amount styling hooks', () => {
    for (const hook of ['line-round', 'line-windup', 'round-tag', 'splitLastInteger', 'PhWarning']) {
      expect(source).toContain(hook);
    }
    expect(source).toContain('var(--color-accent-700)');
    expect(source).toContain('var(--color-con-orange)');
  });
});

describe('FeedLine line breaks', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/console/FeedLine.vue'), 'utf8');

  it('keeps white-space on the base body and normal wrapping on player-authored kinds', () => {
    const base = source.match(/\n\.body \{([^}]*)\}/);
    expect(base).not.toBeNull();
    expect(base![1]).toContain('white-space: pre-wrap;');
    const playerRule = source.match(/((?:\.line-[a-z-]+ \.body,?\s*)+)\{\s*white-space: normal;\s*\}/);
    expect(playerRule).not.toBeNull();
    for (const kind of ['echo', 'say', 'whisper', 'party', 'player-text']) {
      expect(playerRule![1]).toContain(`.line-${kind} .body`);
    }
    const scene = source.match(/\.line-scene \.body \{([^}]*)\}/);
    expect(scene![1]).toContain('pre-wrap');
    const world = source.match(/\.line-world \.body \{([^}]*)\}/);
    expect(world).not.toBeNull();
    expect(world![1]).toContain('pre-wrap');
  });

  it('keeps newlines as text in a server line with no line break elements', () => {
    const text = 'Commands:\n  look (l) — Survey your surroundings.\n  time — Check the hour.';
    const w = render(makeLine({ kind: 'system', text }));
    expect(w.get('.body').element.textContent).toBe(text);
    expect(w.find('br').exists()).toBe(false);
  });

  it('keeps keywords clickable across line breaks', () => {
    const text = cleanServerText('Resources:\n  [Old Well]\nExits: [Gloamwood].');
    const vocabulary = buildVocabulary({
      npcs: [],
      places: [{ id: 2n, name: 'Gloamwood' }],
      nodes: [{ id: 4n, name: 'Old Well' }],
      players: [],
    });
    const parts = findKeywords(text, vocabulary);
    const w = render(makeLine({ kind: 'system', text, keywordEligible: true, parts }));
    const buttons = w.findAll('button.keyword');
    expect(buttons.map((b) => b.text())).toEqual(['Old Well', 'Gloamwood']);
    expect(w.get('.body').element.textContent).toBe(text);
    expect(text).toContain('\n');
  });

  describe('whitespace on server-kind bodies (pre-wrap)', () => {
    const OPEN = String.fromCharCode(0x201c);
    const CLOSE = String.fromCharCode(0x201d);
    const entry = (kind: string, message: string): LineSource => ({
      key: 'private:1',
      source: 'private',
      kind,
      message,
      segments: null,
    });
    const renderEntry = (kind: string, message: string): VueWrapper => {
      const [line] = classifyEntry(entry(kind, message), { partyNames: [] });
      return render(line);
    };

    it('a quoted NPC line with trailing newlines keeps its closing quote on the same row', () => {
      const w = renderEntry('npc', 'Mira says, "Mind the current."\n\n');
      expect(w.get('.body').element.textContent).toBe(`Mira says, ${OPEN}Mind the current.${CLOSE}`);
    });

    it('a quoted NPC line with a trailing newline inside the quotes is trimmed too', () => {
      const w = renderEntry('npc', 'Mira says, "Mind the current.\n"');
      expect(w.get('.body').element.textContent).toBe(`Mira says, ${OPEN}Mind the current.${CLOSE}`);
    });

    it('a Keeper line has no leading or trailing blank rows and keeps internal spacing', () => {
      const w = renderEntry('narrative', '\n\n  The well is dry.\n    A rope hangs in it.\n\n');
      expect(w.get('.body').element.textContent).toBe('The well is dry.\n    A rope hangs in it.');
    });

    it('a help-style system line keeps its indentation under the header', () => {
      const w = renderEntry('system', 'Commands:\n  look (l)\n  time\n');
      expect(w.get('.body').element.textContent).toBe('Commands:\n  look (l)\n  time');
    });
  });

  it('pins player-authored fallback lines to normal wrapping, but not real server system lines', () => {
    const typed = 'ok\nYou have been removed from the group.';
    const fallback = render(makeLine({ kind: 'system', text: typed, playerAuthored: true }));
    expect(fallback.classes()).toContain('line-player-text');
    expect(fallback.get('.body').element.textContent).toBe(typed);
    fallback.unmount();
    const server = render(makeLine({ kind: 'system', text: typed }));
    expect(server.classes()).not.toContain('line-player-text');
  });
});

describe('FeedLine continued segments (quick 261006-h5w)', () => {
  it('draws no Keeper header for a continued Keeper paragraph, still a text-node body with keywords', async () => {
    const w = render(
      makeLine({
        kind: 'keeper',
        label: 'The Keeper',
        text: 'Brine drips on the Old Well.',
        continued: true,
        keywordEligible: true,
        parts: [
          { text: 'Brine drips on the ', entry: null },
          { text: 'Old Well', entry: WELL },
          { text: '.', entry: null },
        ],
      }),
    );
    expect(w.find('.micro').exists()).toBe(false);
    expect(w.text()).toBe('Brine drips on the Old Well.');
    await w.get('button.keyword').trigger('click');
    expect(w.emitted('keyword')).toEqual([[WELL]]);
  });

  it('draws the header on the first paragraph and keeps the round tag there', () => {
    const w = render(makeLine({ kind: 'keeper', label: 'The Keeper', text: 'First.', roundTag: 3n }));
    expect(w.get('.micro').text()).toBe('The Keeper · Round 3');
  });

  it('shows a continued NPC paragraph as quoted speech without the speaker lead', () => {
    const w = render(makeLine({ kind: 'npc', speaker: 'The Ferryman', text: 'And mind the rope.', continued: true }));
    expect(w.text()).toBe('“And mind the rope.”');
    expect(w.find('.who').exists()).toBe(false);
    const lead = render(makeLine({ kind: 'npc', speaker: 'The Ferryman', text: 'Mind the current.' }));
    expect(lead.text()).toBe('The Ferryman says, “Mind the current.”');
  });

  it('keeps a continued paragraph literal', () => {
    const w = render(makeLine({ kind: 'keeper', label: 'The Keeper', text: '<img src=x onerror=alert(1)>', continued: true }));
    expect(w.find('img').exists()).toBe(false);
    expect(w.text()).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('FeedLine loot links (quick 261008-f3m)', () => {
  const TEMPLATES = new Map<bigint, { name: string; rarity: string }>([
    [7n, { name: 'Rusty Dagger', rarity: 'common' }],
    [8n, { name: 'Wolf Pelt', rarity: 'common' }],
  ]);
  const lootLine = (available: bigint[], names?: Map<bigint, { name: string; rarity: string }>): FeedLineView => {
    const raw = formatLootLine(
      LOOT_DROPPED_LEAD,
      [
        { id: 41n, itemTemplateId: 7n, qualityTier: 'uncommon' },
        { id: 42n, itemTemplateId: 8n },
      ],
      (id) => (names ?? TEMPLATES).get(id),
    )!;
    const pieces = parseLootLine(raw)!;
    return makeLine({
      kind: 'quest',
      label: 'Reward',
      text: lootPlainText(pieces),
      parts: lootParts(pieces, new Set(available)),
    });
  };

  it('an available item is a Take button in its rarity token color; a taken one is a colored span', () => {
    const w = render(lootLine([41n]));
    const take = w.get('button.keyword-take');
    expect(take.text()).toBe('[Rusty Dagger]');
    expect(take.attributes('aria-label')).toBe('Take Rusty Dagger');
    expect(take.attributes('title')).toBe('Take Rusty Dagger');
    expect(take.attributes('style')).toContain('var(--color-rarity-uncommon)');
    const taken = w.get('span.loot-name');
    expect(taken.text()).toBe('[Wolf Pelt]');
    expect(taken.attributes('style')).toContain('var(--color-rarity-common)');
    expect(w.get('.body').text()).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
  });

  it('[Take all] is a button named Take all loot with no rarity color', async () => {
    const w = render(lootLine([42n]));
    const all = w.findAll('button.keyword-take').find((b) => b.text() === '[Take all]')!;
    expect(all.attributes('aria-label')).toBe('Take all loot');
    expect(all.attributes('style') ?? '').not.toContain('--color-rarity');
    await all.trigger('click');
    expect(w.emitted('keyword')![0][0]).toEqual({ kind: 'lootAll', id: 0n, name: 'all loot' });
  });

  it('clicking an item emits its loot entry', async () => {
    const w = render(lootLine([41n]));
    await w.get('button.keyword-take').trigger('click');
    expect(w.emitted('keyword')![0][0]).toEqual({ kind: 'loot', id: 41n, name: 'Rusty Dagger' });
  });

  it('is aria-disabled and emits nothing while disabled', async () => {
    const w = render(lootLine([41n, 42n]), true);
    for (const button of w.findAll('button.keyword-take')) {
      expect(button.attributes('aria-disabled')).toBe('true');
      await button.trigger('click');
    }
    expect(w.emitted('keyword')).toBeUndefined();
  });

  it('nests no button and renders a hostile name as literal text', () => {
    const PAYLOAD = '<img src=x onerror=alert(1)>';
    const hostile = new Map([
      [7n, { name: PAYLOAD, rarity: 'common' }],
      [8n, { name: 'Wolf Pelt', rarity: 'common' }],
    ]);
    const w = render(lootLine([41n], hostile));
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('button button').exists()).toBe(false);
    expect(w.get('button.keyword-take').text()).toBe(`[${PAYLOAD}]`);
  });

  it('nothing available: no buttons, the bracketed text stays', () => {
    const w = render(lootLine([]));
    expect(w.find('button').exists()).toBe(false);
    expect(w.get('.body').text()).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
  });

  it('gives .keyword-take a touch hit area of at least 44px on coarse pointers', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/console/FeedLine.vue'), 'utf8');
    const coarse = source.match(/@media \(pointer: coarse\) \{([\s\S]*?)\n\}/);
    expect(coarse).not.toBeNull();
    expect(coarse![1]).toContain('.keyword-take::after');
    expect(coarse![1]).toMatch(/inset: -12px 0;/);
  });
});

describe('FeedLine density kinds (51.3.1.1 Feed Contract)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/console/FeedLine.vue'), 'utf8');
  const XSS = '<img src=x onerror=alert(1)>';
  const fromServer = (kind: string, message: string): FeedLineView =>
    classifyEntry({ key: 'p:1', source: 'private', kind, message, segments: null }, { partyNames: [] })[0];

  it('draws an ambush as the tinted band: PhWarning 16 then the text', () => {
    const w = render(fromServer('ambush', 'Three goblins break from the brush as you reach Gloamwood!'));
    const band = w.get('div.line.line-ambush');
    const icon = band.get('svg.icon-ambush');
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.attributes('width')).toBe('16');
    expect(band.get('.body').text()).toBe('Three goblins break from the brush as you reach Gloamwood!');
    expect(w.findAll('button')).toHaveLength(0);
  });

  it.each([
    ['density_down', 'densityDown', 'icon-density-down', 'The goblins at Gloamwood thin out.'],
    ['density_gone', 'densityGone', 'icon-density-gone', 'No goblins are left at Gloamwood.'],
    ['travel_quiet', 'travelQuiet', 'icon-travel-quiet', 'You reach Gloamwood. Nothing stirs.'],
  ])('draws %s as an icon line: a 12px icon then the Label 12 text', (kind, lineKind, iconClass, text) => {
    const w = render(fromServer(kind, text));
    const line = w.get(`div.line.line-${lineKind}`);
    const icon = line.get(`svg.${iconClass}`);
    expect(icon.attributes('aria-hidden')).toBe('true');
    expect(icon.attributes('width')).toBe('12');
    expect(line.get('.body').text()).toBe(text);
    expect(w.findAll('button')).toHaveLength(0);
  });

  it('renders an img onerror fixture in every density line literally', () => {
    for (const kind of ['ambush', 'density_down', 'density_gone', 'travel_quiet']) {
      const w = render(fromServer(kind, `Four ${XSS} rush you in ${XSS}!`));
      expect(w.find('img').exists()).toBe(false);
      expect(w.text()).toContain(`Four ${XSS} rush you in ${XSS}!`);
      w.unmount();
      wrapper = null;
    }
  });

  it('no event, no line: a blank density row gives no line to draw', () => {
    expect(classifyEntry({ key: 'p:1', source: 'private', kind: 'ambush', message: ' ', segments: null }, { partyNames: [] })).toEqual([]);
  });

  it('source: the ambush band recipe and the icon tones are tokens only', () => {
    expect(source).toMatch(
      /\.line-ambush \{[^}]*display: flex;[^}]*gap: 8px;[^}]*padding: 8px 16px;[^}]*border-radius: var\(--radius-md\);[^}]*background: color-mix\(in srgb, var\(--color-health\) 24%, var\(--color-surface\)\);[^}]*\}/,
    );
    expect(source).toMatch(/\.line-ambush \.body \{[^}]*font-weight: 500;[^}]*color: var\(--color-text\);/);
    expect(source).toMatch(/\.icon-ambush \{[^}]*color: var\(--color-con-orange\);/);
    expect(source).toMatch(/\.icon-density-down,\s*\.icon-travel-quiet \{[^}]*color: var\(--color-neutral-500\);/);
    expect(source).toMatch(/\.icon-density-gone \{[^}]*color: var\(--color-neutral-400\);/);
    expect(source).toMatch(/\.line-densityDown,\s*\.line-travelQuiet \{[^}]*color: var\(--color-neutral-400\);/);
    expect(source).toMatch(/\.line-densityGone \{[^}]*color: var\(--color-neutral-300\);/);
    expect(source).toMatch(/\.line-densityDown,\s*\.line-densityGone,\s*\.line-travelQuiet \{[^}]*font-size: 12px;/);
    for (const icon of ['PhWarning', 'PhTrendDown', 'PhSkull', 'PhFootprints']) expect(source).toContain(icon);
    expect(source).not.toMatch(/@keyframes|animation:|transition:/);
  });
});
