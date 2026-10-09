import { describe, expect, it } from 'vitest';
import { buildVocabulary } from './keywords';
import { formatLootLine, LOOT_DROPPED_LEAD } from '@game-data/loot_line';
import { DIALOGUE_SEGMENT_KIND, KEEPER_LABEL, buildFeedLines, classifyEntry } from './lines';
import type { FeedSourceName, LineSource, SegmentLike } from './lines';

const row = (
  kind: string,
  message: string,
  extra: { source?: FeedSourceName; segments?: readonly SegmentLike[] | null; queued?: boolean; key?: string } = {},
): LineSource => ({
  key: extra.key ?? `${extra.source ?? 'private'}:1`,
  source: extra.source ?? 'private',
  kind,
  message,
  segments: extra.segments ?? null,
  queued: extra.queued,
});

const classify = (entry: LineSource, partyNames: readonly string[] = []) => classifyEntry(entry, { partyNames });
const first = (entry: LineSource, partyNames: readonly string[] = []) => classify(entry, partyNames)[0];

describe('segments rows', () => {
  it('make one line per segment, dialogue as NPC speech and the rest as Keeper narration', () => {
    const lines = classify(
      row('narrative', '', {
        segments: [
          { kind: 'narration', speaker: 'The Keeper', text: 'You peer into the well.' },
          { kind: DIALOGUE_SEGMENT_KIND, speaker: 'The Ferryman', text: 'Mind the current.', speakerNpcId: 9n },
        ],
      }),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      kind: 'keeper',
      label: KEEPER_LABEL,
      text: 'You peer into the well.',
      keywordEligible: true,
      key: 'private:1:0',
    });
    expect(lines[1]).toMatchObject({
      kind: 'npc',
      speaker: 'The Ferryman',
      speakerNpcId: 9n,
      text: 'Mind the current.',
      label: null,
      keywordEligible: true,
      key: 'private:1:1',
    });
  });

  it('keeps segment text literal', () => {
    const lines = classify(
      row('narrative', 'ignored', {
        segments: [
          { kind: 'narration', speaker: 'The Keeper', text: '<b>x</b>' },
          { kind: 'dialogue', speaker: 'Bo', text: '{{color:#fff}}x{{/color}} [look]' },
        ],
      }),
    );
    expect(lines[0].text).toBe('<b>x</b>');
    expect(lines[1].text).toBe('{{color:#fff}}x{{/color}} [look]');
    expect(lines[1].speakerNpcId).toBeNull();
  });

  it('treats an empty segments array as no segments', () => {
    expect(classify(row('narrative', 'Fallback text', { segments: [] }))).toMatchObject([
      { kind: 'keeper', text: 'Fallback text' },
    ]);
    expect(classify(row('narrative', '', { segments: [] }))).toEqual([]);
    expect(classify(row('narrative', '   ', { segments: [] }))).toEqual([]);
  });

  it('does not merge rows with identical text', () => {
    const a = row('narrative', 'Same', { key: 'private:1' });
    const b = row('narrative', 'Same', { key: 'private:2' });
    const lines = buildFeedLines([a, b], { vocabulary: buildVocabulary({ npcs: [], places: [], nodes: [], players: [] }), partyNames: [], npcsHere: [] });
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.key)).toEqual(['private:1:0', 'private:2:0']);
  });
});

describe('rows without segments', () => {
  it.each(['narrative', 'llm', 'creation', 'combat_narration', 'class', 'character_created'])(
    '%s is Keeper narration',
    (kind) => {
      expect(first(row(kind, 'The light shifts.'))).toMatchObject({
        kind: 'keeper',
        label: KEEPER_LABEL,
        text: 'The light shifts.',
        keywordEligible: true,
      });
    },
  );

  it('npc rows parse the speaker', () => {
    expect(first(row('npc', 'The Ferryman says, "Mind the current."'))).toMatchObject({
      kind: 'npc',
      speaker: 'The Ferryman',
      text: 'Mind the current.',
      keywordEligible: true,
    });
    expect(first(row('npc', 'Ferryman: Hello there'))).toMatchObject({ speaker: 'Ferryman', text: 'Hello there' });
  });

  it('npc rows that do not parse keep the whole text with no speaker', () => {
    expect(first(row('npc', 'He nods slowly.'))).toMatchObject({ kind: 'npc', speaker: null, text: 'He nods slowly.' });
  });

  it('whisper rows parse direction and speaker and are not eligible', () => {
    expect(first(row('whisper', 'Mara whispers: "hi"'))).toMatchObject({
      kind: 'whisper',
      direction: 'received',
      speaker: 'Mara',
      text: 'hi',
      keywordEligible: false,
    });
    expect(first(row('whisper', 'You whisper to Mara: "yo"'))).toMatchObject({ direction: 'sent', speaker: 'Mara' });
    expect(first(row('whisper', 'No such character'))).toMatchObject({
      kind: 'whisper',
      speaker: null,
      direction: null,
      text: 'No such character',
      keywordEligible: false,
    });
  });

  it('group chat from a party member is a party line and never eligible', () => {
    expect(first(row('group', 'Mara: hello all', { source: 'group' }), ['Mara'])).toMatchObject({
      kind: 'party',
      speaker: 'Mara',
      text: 'hello all',
      keywordEligible: false,
    });
  });

  it('other group rows are System and not eligible', () => {
    expect(first(row('group', 'Bo joined the group.', { source: 'group' }), ['Mara'])).toMatchObject({
      kind: 'system',
      keywordEligible: false,
    });
    expect(first(row('group', 'Server: x', { source: 'group' }), ['Mara'])).toMatchObject({
      kind: 'system',
      keywordEligible: false,
    });
  });

  it('marks player text that fell back to a System line as playerAuthored', () => {
    // group chat whose sender is not in the party list (left the group, or not synced yet)
    const leftGroup = first(row('group', 'Bo: ok\nYou were removed.', { source: 'group' }), ['Mara']);
    expect(leftGroup).toMatchObject({ kind: 'system', playerAuthored: true });
    expect(first(row('command', '> /who'))).toMatchObject({ kind: 'system', playerAuthored: true });
  });

  it('does not mark parsed party chat, server system rows or local system entries', () => {
    expect(first(row('group', 'Mara: hello', { source: 'group' }), ['Mara'])).not.toHaveProperty('playerAuthored');
    expect(first(row('system', 'Commands:\n  look'))).not.toHaveProperty('playerAuthored');
    expect(first(row('system', 'Queue full', { source: 'local' }))).not.toHaveProperty('playerAuthored');
  });

  it('look with two or more lines is a scene with a title', () => {
    expect(first(row('look', 'Ember Gate\nA warm wind.'))).toMatchObject({
      kind: 'scene',
      title: 'Ember Gate',
      text: 'A warm wind.',
      keywordEligible: true,
    });
    expect(first(row('look', 'Ember Gate\nA warm wind.\nSmoke.')).text).toBe('A warm wind.\nSmoke.');
  });

  it('a single-line look has no title', () => {
    expect(first(row('look', 'A quiet road.'))).toMatchObject({ kind: 'scene', title: null, text: 'A quiet road.' });
  });

  it('quest, reward and faction are quest lines with labels', () => {
    expect(first(row('quest', 'Slay the rats.'))).toMatchObject({ kind: 'quest', label: 'Quest', keywordEligible: true });
    expect(first(row('reward', '5 gold.'))).toMatchObject({ kind: 'quest', label: 'Reward' });
    expect(first(row('faction', 'Standing rises.'))).toMatchObject({ kind: 'quest', label: 'Faction' });
  });

  it('world, renown and world_event lines all carry the World event label', () => {
    expect(first(row('world', 'A bell tolls.', { source: 'world' }))).toMatchObject({ kind: 'world', label: 'World event' });
    expect(first(row('renown', 'Rank up.', { source: 'world' }))).toMatchObject({ kind: 'world', label: 'World event' });
    expect(first(row('world_event', 'A siege begins.', { source: 'world' }))).toMatchObject({
      kind: 'worldEvent',
      label: 'World event',
    });
  });

  it('say and emote are player-authored: raw and not eligible', () => {
    expect(first(row('say', 'Mara says "go to {{color:x}}Gloam{{/color}}"', { source: 'location' }))).toMatchObject({
      kind: 'say',
      text: 'Mara says "go to {{color:x}}Gloam{{/color}}"',
      keywordEligible: false,
    });
    expect(first(row('emote', 'Mara [waves].', { source: 'location' }))).toMatchObject({
      kind: 'say',
      text: 'Mara [waves].',
      keywordEligible: false,
    });
  });

  it('command echo is System, raw and not eligible', () => {
    expect(first(row('command', '> /who [x]'))).toMatchObject({
      kind: 'system',
      text: '> /who [x]',
      keywordEligible: false,
    });
  });

  it('errors, warnings and combat kinds', () => {
    expect(first(row('creation_error', 'Nope.'))).toMatchObject({ kind: 'error' });
    expect(first(row('blocked', 'Blocked.'))).toMatchObject({ kind: 'error' });
    expect(first(row('warning', 'Careful.'))).toMatchObject({ kind: 'warning' });
    expect(first(row('damage', '5 damage.'))).toMatchObject({ kind: 'damage' });
    expect(first(row('heal', '5 healed.'))).toMatchObject({ kind: 'heal' });
    for (const kind of [
      'ability',
      'buff',
      'debuff',
      'combat',
      'combat_prompt',
      'combat_status',
    ]) {
      expect(first(row(kind, 'Text.'))).toMatchObject({ kind: 'combat', keywordEligible: false });
    }
  });

  it('renders nothing for combat_round_header and combat_resolving (the client draws the headers)', () => {
    expect(classify(row('combat_round_header', 'Round 2'))).toEqual([]);
    expect(classify(row('combat_resolving', 'Resolving...'))).toEqual([]);
  });

  it.each(['system', 'move', 'movement', 'presence', 'day_night', 'avoid', 'server_first', 'zzz'])(
    '%s is a System line',
    (kind) => {
      expect(first(row(kind, 'Something happened.'))).toMatchObject({
        kind: 'system',
        label: null,
        keywordEligible: true,
      });
    },
  );

  it('cleans server-authored rows but never player-authored kinds', () => {
    expect(first(row('look', '{{color:#ffd700}}Ember Gate{{/color}}\nType [look] again.'))).toMatchObject({
      title: 'Ember Gate',
      text: 'Type look again.',
    });
    expect(first(row('system', 'Type [accept Bob] to join'))?.text).toBe('Type accept Bob to join');
    expect(first(row('whisper', 'Mara whispers: "[x]"'))?.text).toBe('[x]');
    expect(first(row('group', 'Mara: [x]', { source: 'group' }), ['Mara'])?.text).toBe('[x]');
  });

  it('yields no lines for empty or whitespace-only messages', () => {
    expect(classify(row('narrative', ''))).toEqual([]);
    expect(classify(row('system', '   \n '))).toEqual([]);
    expect(classify(row('look', '{{color:x}}{{/color}}'))).toEqual([]);
  });
});

describe('local entries', () => {
  it('echo carries the queued flag and is not eligible', () => {
    expect(first(row('echo', '› look at well', { source: 'local', queued: true }))).toMatchObject({
      kind: 'echo',
      queued: true,
      keywordEligible: false,
    });
    expect(first(row('echo', '› go', { source: 'local' }))).toMatchObject({ queued: false });
  });

  it('system is not eligible and look is an eligible scene', () => {
    expect(first(row('system', 'You cannot do that.', { source: 'local' }))).toMatchObject({
      kind: 'system',
      keywordEligible: false,
    });
    expect(first(row('look', 'Gate\nBody', { source: 'local' }))).toMatchObject({
      kind: 'scene',
      title: 'Gate',
      text: 'Body',
      keywordEligible: true,
    });
  });
});

describe('buildFeedLines', () => {
  const vocabulary = buildVocabulary({
    npcs: [{ id: 9n, name: 'Ferryman' }],
    places: [{ id: 5n, name: 'Gloamwood' }],
    nodes: [],
    players: [{ id: 3n, name: 'Mara' }],
  });
  const options = { vocabulary, partyNames: ['Mara'], npcsHere: [{ id: 9n, name: 'The Ferryman' }] };

  it('fills parts only for eligible lines', () => {
    const lines = buildFeedLines(
      [
        row('narrative', 'The Ferryman points to Gloamwood.', { key: 'a' }),
        row('say', 'Go to Gloamwood, Mara', { key: 'b', source: 'location' }),
        row('whisper', 'Mara whispers: "Gloamwood"', { key: 'c' }),
        row('group', 'Mara: Gloamwood', { key: 'd', source: 'group' }),
        row('command', '> Gloamwood', { key: 'e' }),
        row('echo', '› go to Gloamwood', { key: 'f', source: 'local' }),
      ],
      options,
    );
    expect(lines.map((l) => l.key)).toEqual(['a:0', 'b:0', 'c:0', 'd:0', 'e:0', 'f:0']);
    expect(lines[0].parts?.filter((p) => p.entry).map((p) => p.text)).toEqual(['Ferryman', 'Gloamwood']);
    for (const line of lines.slice(1)) {
      expect(line.keywordEligible).toBe(false);
      expect(line.parts).toBeNull();
    }
  });

  it('fills titleParts for scenes', () => {
    const [scene] = buildFeedLines([row('look', 'Gloamwood\nA dim path.')], options);
    expect(scene.titleParts?.some((p) => p.entry?.kind === 'place')).toBe(true);
    expect(scene.parts).toEqual([{ text: 'A dim path.', entry: null }]);
  });

  it('sets speakerKeyword only for an NPC still here', () => {
    const segments: SegmentLike[] = [
      { kind: 'dialogue', speaker: 'The Ferryman', text: 'Hello.', speakerNpcId: 9n },
      { kind: 'dialogue', speaker: 'The Gone', text: 'Hello.', speakerNpcId: 77n },
      { kind: 'dialogue', speaker: 'Nobody', text: 'Hello.' },
    ];
    const lines = buildFeedLines([row('npc', '', { segments })], options);
    expect(lines[0].speakerKeyword).toEqual({ kind: 'npc', id: 9n, name: 'The Ferryman' });
    expect(lines[1].speakerKeyword).toBeNull();
    expect(lines[2].speakerKeyword).toBeNull();
  });

  it('keys every line by entry key and index', () => {
    const segments: SegmentLike[] = [
      { kind: 'narration', speaker: 'The Keeper', text: 'One.' },
      { kind: 'narration', speaker: 'The Keeper', text: 'Two.' },
    ];
    const lines = buildFeedLines([row('narrative', '', { segments, key: 'private:42' })], options);
    expect(lines.map((l) => l.key)).toEqual(['private:42:0', 'private:42:1']);
  });
});


describe('combat entries and the late-narration tag', () => {
  const roundEntry = (n: bigint, combatId = 10n): LineSource => ({
    key: `round:${combatId}:${n}`,
    source: 'combat',
    kind: 'round',
    message: `Round ${n}`,
    segments: null,
    combatId,
    roundNumber: n,
  });
  const windupEntry: LineSource = {
    key: 'windup:7',
    source: 'combat',
    kind: 'windup',
    message: 'Rotfang winds up Gore to you',
    segments: null,
    combatId: 10n,
    windup: { lead: 'Rotfang winds up ', ability: 'Gore', tail: ' to you' },
  };
  const narration = (narratedRound?: bigint): LineSource => ({
    key: 'private:5',
    source: 'private',
    kind: 'combat_narration',
    message: '',
    segments: [
      { kind: 'narration', speaker: 'The Keeper', text: 'The beast lunges.' },
      { kind: 'narration', speaker: 'The Keeper', text: 'You roll clear.' },
    ],
    narratedRound,
  });
  const build = (entries: readonly LineSource[]) =>
    buildFeedLines(entries, { vocabulary: buildVocabulary({ npcs: [], places: [], nodes: [], players: [] }), partyNames: [], npcsHere: [] });
  const tags = (entries: readonly LineSource[]) => build(entries).map((l) => l.roundTag ?? null);

  it('classifies a round entry to one header line', () => {
    expect(classify(roundEntry(3n))).toEqual([
      expect.objectContaining({
        kind: 'round',
        text: 'Round 3',
        roundNumber: 3n,
        roundKey: '10:3',
        keywordEligible: false,
        label: null,
      }),
    ]);
  });

  it('classifies a wind-up entry to one block line with its parts, never keyword-eligible', () => {
    const lines = classify(windupEntry);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      kind: 'windup',
      text: windupEntry.message,
      windup: { lead: 'Rotfang winds up ', ability: 'Gore', tail: ' to you' },
      keywordEligible: false,
    });
  });

  it('keeps markup in wind-up text literal', () => {
    const entry: LineSource = {
      ...windupEntry,
      message: '<img src=x onerror=alert(1)> winds up Gore',
      windup: { lead: '<img src=x onerror=alert(1)> winds up ', ability: 'Gore', tail: '' },
    };
    expect(classify(entry)[0].text).toBe('<img src=x onerror=alert(1)> winds up Gore');
  });

  it('draws nothing for a malformed combat entry', () => {
    expect(classify({ ...roundEntry(1n), roundNumber: undefined })).toEqual([]);
    expect(classify({ ...windupEntry, windup: undefined })).toEqual([]);
  });

  it('gives no tag when the narrated round matches the header above it', () => {
    expect(tags([roundEntry(1n), narration(1n)])).toEqual([null, null, null]);
  });

  it('tags only the first Keeper line when the narrated round differs', () => {
    expect(tags([roundEntry(1n), narration(2n)])).toEqual([null, 2n, null]);
  });

  it('tags narration with a round but no preceding header', () => {
    expect(tags([narration(2n)])).toEqual([2n, null]);
  });

  it('gives no tag when the round is unknown', () => {
    expect(tags([roundEntry(1n), narration()])).toEqual([null, null, null]);
    expect(tags([narration()])).toEqual([null, null]);
  });

  it('compares against the nearest preceding header', () => {
    expect(tags([roundEntry(1n), roundEntry(2n), narration(2n)])).toEqual([null, null, null, null]);
    expect(tags([roundEntry(1n), roundEntry(2n), narration(1n)])).toEqual([null, null, 1n, null]);
  });

  it('passes round and wind-up lines through buildFeedLines untouched', () => {
    const lines = build([roundEntry(1n), windupEntry]);
    expect(lines.map((l) => l.kind)).toEqual(['round', 'windup']);
    expect(lines.every((l) => l.parts === null)).toBe(true);
  });
});

describe('one label per run of segments from the same speaker (quick 261006-h5w)', () => {
  const keeperSeg = (text: string): SegmentLike => ({ kind: 'narration', speaker: 'The Keeper', text });
  const npcSeg = (text: string, speaker = 'The Ferryman', speakerNpcId: bigint | null = 9n): SegmentLike => ({
    kind: DIALOGUE_SEGMENT_KIND,
    speaker,
    text,
    speakerNpcId,
  });
  const labelled = (lines: readonly { continued?: boolean }[]) => lines.filter((l) => l.continued !== true).length;
  const build = (entries: readonly LineSource[]) =>
    buildFeedLines(entries, { vocabulary: buildVocabulary({ npcs: [], places: [], nodes: [], players: [] }), partyNames: [], npcsHere: [] });

  it('a 3-segment Keeper victory row gives one label and three paragraphs', () => {
    const lines = classify(
      row('combat_narration', '', {
        segments: [keeperSeg('You close in.'), keeperSeg('The Sentinel collapses.'), keeperSeg('Brine drips on the stones.')],
      }),
    );
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.text)).toEqual(['You close in.', 'The Sentinel collapses.', 'Brine drips on the stones.']);
    expect(lines.map((l) => l.continued === true)).toEqual([false, true, true]);
    expect(labelled(lines)).toBe(1);
    expect(lines.map((l) => l.key)).toEqual(['private:1:0', 'private:1:1', 'private:1:2']);
  });

  it('Keeper, then an NPC, then the Keeper again gives three labels', () => {
    const lines = classify(row('narrative', '', { segments: [keeperSeg('You peer in.'), npcSeg('Mind the current.'), keeperSeg('The water stirs.')] }));
    expect(lines.map((l) => l.kind)).toEqual(['keeper', 'npc', 'keeper']);
    expect(lines.map((l) => l.continued === true)).toEqual([false, false, false]);
    expect(labelled(lines)).toBe(3);
  });

  it('repeats the label only when the speaker changes inside the row', () => {
    const lines = classify(
      row('narrative', '', {
        segments: [keeperSeg('a'), keeperSeg('b'), npcSeg('c'), npcSeg('d'), keeperSeg('e'), keeperSeg('f')],
      }),
    );
    expect(lines.map((l) => l.continued === true)).toEqual([false, true, false, true, false, true]);
  });

  it('a different NPC, or the same name for another NPC id, starts a new label', () => {
    const lines = classify(
      row('narrative', '', {
        segments: [npcSeg('one', 'The Ferryman', 9n), npcSeg('two', 'The Ferryman', 10n), npcSeg('three', 'Marisol', 10n), npcSeg('four', 'Marisol', 10n)],
      }),
    );
    expect(lines.map((l) => l.continued === true)).toEqual([false, false, false, true]);
  });

  it('skips blank segments without breaking the run', () => {
    const lines = classify(row('narrative', '', { segments: [keeperSeg('a'), keeperSeg('   '), keeperSeg('b')] }));
    expect(lines.map((l) => l.text)).toEqual(['a', 'b']);
    expect(lines.map((l) => l.continued === true)).toEqual([false, true]);
  });

  it('never groups across rows: each row starts with its own label', () => {
    const lines = classify(row('narrative', '', { segments: [keeperSeg('a')], key: 'private:1' })).concat(
      classify(row('narrative', '', { segments: [keeperSeg('b')], key: 'private:2' })),
    );
    expect(labelled(lines)).toBe(2);
  });

  it('single-line and server-kind rows are never continued', () => {
    expect(first(row('narrative', 'Plain Keeper line.')).continued).toBeUndefined();
    expect(first(row('npc', 'The Ferryman says, "Hi."')).continued).toBeUndefined();
  });

  it('keeps the round tag on the grouped label (the first line of the run)', () => {
    const entry: LineSource = {
      ...row('combat_narration', '', { segments: [keeperSeg('a'), keeperSeg('b'), keeperSeg('c')], key: 'private:5' }),
      narratedRound: 2n,
    };
    const lines = build([
      { key: 'round:10:1', source: 'combat', kind: 'round', message: 'Round 1', segments: null, combatId: 10n, roundNumber: 1n },
      entry,
    ]);
    const keeper = lines.filter((l) => l.kind === 'keeper');
    expect(keeper.map((l) => l.roundTag ?? null)).toEqual([2n, null, null]);
    expect(keeper.map((l) => l.continued === true)).toEqual([false, true, true]);
  });

  it('keeps keywords on every paragraph of a run', () => {
    const vocabulary = buildVocabulary({ npcs: [], places: [{ id: 5n, name: 'Gloamwood' }], nodes: [], players: [] });
    const lines = buildFeedLines(
      [row('narrative', '', { segments: [keeperSeg('Gloamwood waits.'), keeperSeg('Walk to Gloamwood.')] })],
      { vocabulary, partyNames: [], npcsHere: [] },
    );
    expect(lines.map((l) => (l.parts ?? []).filter((p) => p.entry !== null).length)).toEqual([1, 1]);
  });
});

describe('loot lines (quick 261008-f3m)', () => {
  const TEMPLATES = new Map<bigint, { name: string; rarity: string }>([
    [7n, { name: 'Rusty Dagger', rarity: 'common' }],
    [8n, { name: 'Wolf Pelt', rarity: 'common' }],
    [9n, { name: 'Ferryman', rarity: 'rare' }],
  ]);
  const LOOT = formatLootLine(
    LOOT_DROPPED_LEAD,
    [
      { id: 41n, itemTemplateId: 7n },
      { id: 42n, itemTemplateId: 8n, qualityTier: 'uncommon' },
    ],
    (id) => TEMPLATES.get(id),
  )!;
  const vocabulary = buildVocabulary({
    npcs: [{ id: 9n, name: 'Ferryman' }],
    places: [],
    nodes: [],
    players: [],
  });
  const options = (available: bigint[] = []) => ({
    vocabulary,
    partyNames: [],
    npcsHere: [],
    availableLoot: new Set(available),
  });
  const lootEntries = (lines: readonly { parts: { entry: { kind: string } | null }[] | null }[]) =>
    lines.flatMap((l) => (l.parts ?? []).filter((p) => p.entry && (p.entry.kind === 'loot' || p.entry.kind === 'lootAll')));

  it('a private reward loot row is ONE Reward line with bracketed text and loot pieces', () => {
    const lines = classify(row('reward', LOOT));
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe('quest');
    expect(lines[0].label).toBe('Reward');
    expect(lines[0].text).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
    expect(lines[0].keywordEligible).toBe(false);
    expect(lines[0].loot?.filter((p) => p.kind === 'item')).toHaveLength(2);
  });

  it('buildFeedLines makes the parts from availableLoot', () => {
    const [line] = buildFeedLines([row('reward', LOOT)], options([41n]));
    const parts = line.parts!;
    expect(parts.map((p) => p.text).join('')).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
    expect(parts.find((p) => p.text === '[Rusty Dagger]')!.entry).toEqual({ kind: 'loot', id: 41n, name: 'Rusty Dagger' });
    expect(parts.find((p) => p.text === '[Wolf Pelt]')!.entry).toBeNull();
    expect(parts.find((p) => p.text === '[Take all]')!.entry?.kind).toBe('lootAll');
  });

  it('without the availableLoot option every loot entry is null', () => {
    const [line] = buildFeedLines([row('reward', LOOT)], { vocabulary, partyNames: [], npcsHere: [] });
    expect(line.parts!.every((p) => p.entry === null)).toBe(true);
    expect(line.parts!.map((p) => p.text).join('')).toBe('Loot dropped: [Rusty Dagger], [Wolf Pelt] [Take all]');
  });

  it('an item named like an NPC here is never an npc keyword inside a loot line', () => {
    const named = formatLootLine(LOOT_DROPPED_LEAD, [{ id: 50n, itemTemplateId: 9n }], (id) => TEMPLATES.get(id))!;
    const [line] = buildFeedLines([row('reward', named)], options([50n]));
    expect(line.parts!.some((p) => p.entry?.kind === 'npc')).toBe(false);
    expect(line.parts!.find((p) => p.text === '[Ferryman]')!.entry).toEqual({ kind: 'loot', id: 50n, name: 'Ferryman' });
  });

  it('the same token text in any other row never becomes a loot link', () => {
    const segments: SegmentLike[] = [
      { kind: 'dialogue', speaker: 'Ferryman', text: LOOT, speakerNpcId: 9n },
      { kind: 'narration', speaker: 'The Keeper', text: LOOT },
    ];
    const lines = buildFeedLines(
      [
        row('say', LOOT, { key: 'a', source: 'location' }),
        row('whisper', `Mara whispers: "${LOOT}"`, { key: 'b' }),
        row('group', `Mara: ${LOOT}`, { key: 'c', source: 'group' }),
        row('command', LOOT, { key: 'd' }),
        row('npc', LOOT, { key: 'e' }),
        row('reward', '', { key: 'f', segments }),
        row('echo', LOOT, { key: 'g', source: 'local' }),
        row('look', LOOT, { key: 'h' }),
        row('system', LOOT, { key: 'i' }),
        row('quest', LOOT, { key: 'j' }),
        row('reward', LOOT, { key: 'k', source: 'group' }),
        row('reward', LOOT, { key: 'l', source: 'location' }),
      ],
      options([41n, 42n]),
    );
    expect(lootEntries(lines)).toEqual([]);
    expect(lines.every((l) => l.loot === undefined)).toBe(true);
  });

  it('a reward row without tokens keeps its classification and keywords', () => {
    const [line] = buildFeedLines([row('reward', 'The Ferryman pays you 5 gold.')], options());
    expect(line.kind).toBe('quest');
    expect(line.label).toBe('Reward');
    expect(line.keywordEligible).toBe(true);
    expect(line.loot).toBeUndefined();
    expect(line.parts!.some((p) => p.entry?.kind === 'npc')).toBe(true);
  });
});

describe('density line kinds (51.3.1.1 Feed Contract, D-22, D-32)', () => {
  const vocabulary = buildVocabulary({
    npcs: [],
    places: [{ id: 2n, name: 'Gloamwood' }],
    enemies: [{ id: 7n, name: 'Goblins', target: 'family' }],
    items: [],
    players: [],
    nodes: [],
  });

  it('classifies the four server kinds, none keyword-eligible', () => {
    expect(first(row('ambush', 'Three goblins break from the brush as you reach Gloamwood!'))).toMatchObject({
      kind: 'ambush',
      text: 'Three goblins break from the brush as you reach Gloamwood!',
      keywordEligible: false,
    });
    expect(first(row('density_down', 'The goblins at Gloamwood thin out. Scarce now.'))).toMatchObject({
      kind: 'densityDown',
      keywordEligible: false,
    });
    expect(first(row('density_gone', 'No goblins are left at Gloamwood.'))).toMatchObject({
      kind: 'densityGone',
      keywordEligible: false,
    });
    expect(first(row('travel_quiet', 'You reach Gloamwood. Nothing stirs.'))).toMatchObject({
      kind: 'travelQuiet',
      keywordEligible: false,
    });
  });

  it('a family or place name inside a density line is never linked', () => {
    const lines = buildFeedLines(
      [
        row('ambush', 'Goblins rush you in Gloamwood!', { key: 'a' }),
        row('density_down', 'The Goblins at Gloamwood thin out.', { key: 'b' }),
        row('density_gone', 'No Goblins are left at Gloamwood.', { key: 'c' }),
        row('travel_quiet', 'You reach Gloamwood. Nothing stirs.', { key: 'd' }),
      ],
      { vocabulary, partyNames: [], npcsHere: [] },
    );
    expect(lines.map((l) => l.kind)).toEqual(['ambush', 'densityDown', 'densityGone', 'travelQuiet']);
    for (const line of lines) {
      expect(line.keywordEligible).toBe(false);
      expect(line.parts).toBeNull();
    }
  });

  it('draws whatever text arrives: the server builders own the number words, nouns and the area', () => {
    const text = 'Four skitterers drop on the party in the area!';
    expect(first(row('ambush', text)).text).toBe(text);
    expect(first(row('density_down', 'The Skitterers at the area thin out.')).text).toBe(
      'The Skitterers at the area thin out.',
    );
  });

  it('keeps markup in a density line as literal text after the old colour tokens go', () => {
    const payload = '<img src=x onerror=alert(1)>';
    expect(first(row('density_gone', `No ${payload} are left.`)).text).toBe(`No ${payload} are left.`);
  });

  it('no event, no line: a blank density row draws nothing', () => {
    expect(classify(row('density_down', '   '))).toEqual([]);
    expect(classify(row('travel_quiet', ''))).toEqual([]);
  });

  it('unknown kinds still fall back to the system line', () => {
    expect(first(row('density_sideways', 'Something odd.'))).toMatchObject({ kind: 'system', keywordEligible: true });
  });
});
