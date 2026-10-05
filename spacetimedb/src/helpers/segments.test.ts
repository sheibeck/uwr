/**
 * Phase 46 (SEG-01, SEG-04): the pure segment contract. No mocks: the module is pure.
 */
import { describe, it, expect } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
// @ts-ignore see above
import { fileURLToPath } from 'node:url';
// @ts-ignore see above
import { join } from 'node:path';
import {
  SEGMENT_KINDS,
  KEEPER_SPEAKER,
  MAX_SEGMENTS,
  MAX_SEGMENT_CHARS,
  TRUNCATION_MARK,
  speakerKey,
  cleanSegmentText,
  normalizeSegments,
  keeperSegments,
  keeperFallback,
  flattenSegments,
  parseReplyObject,
  isUsableProse,
  segmentsFromReply,
  type PresentSpeaker,
  type Segment,
  type ReplyLadderOptions,
} from './segments';

const cp = (s: string) => Array.from(s).length;
const FERRYMAN: PresentSpeaker = { name: 'The Ferryman', id: 7n };
const MARTA: PresentSpeaker = { name: 'Marta' };
const PRESENT = [FERRYMAN, MARTA];
const PLAYERS = ['Aldric'];
const OPTS: ReplyLadderOptions = { present: PRESENT, playerNames: PLAYERS, fallbackLine: 'The Keeper loses the thread.' };

function wellFormed(s: string): boolean {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);
}

describe('constants', () => {
  it('pins the contract values', () => {
    expect(SEGMENT_KINDS).toEqual(['narration', 'dialogue']);
    expect(KEEPER_SPEAKER).toBe('The Keeper');
    expect(MAX_SEGMENTS).toBe(6);
    expect(MAX_SEGMENT_CHARS).toBe(600);
    expect(TRUNCATION_MARK).toBe('…');
  });
});

describe('speakerKey', () => {
  it('folds case, width and whitespace', () => {
    expect(speakerKey('  THE  Ferryman ')).toBe(speakerKey('the ferryman'));
    expect(speakerKey('Ｔhe Ferryman')).toBe('the ferryman');
  });
  it('is total', () => {
    expect(speakerKey(undefined as any)).toBe('');
    expect(speakerKey(null as any)).toBe('');
  });
});

describe('cleanSegmentText', () => {
  it('returns empty for non-strings', () => {
    for (const v of [undefined, null, 5, {}, [], true]) expect(cleanSegmentText(v, 'narration')).toBe('');
  });
  it('normalizes line endings and tabs', () => {
    expect(cleanSegmentText('a\r\nb\rc\td', 'narration')).toBe('a\nb\nc d');
  });
  it('repairs lone surrogates', () => {
    const out = cleanSegmentText('x\uD800y\uDC00z', 'narration');
    expect(out).toBe('x�y�z');
    expect(wellFormed(out)).toBe(true);
  });
  it('strips controls, bidi marks, zero-width space and BOM', () => {
    const dirty = 'a\u0000b\u0007c\u007Fd\u0085e\u009Ff‪g‮h⁦i⁩j​k﻿l';
    expect(cleanSegmentText(dirty, 'narration')).toBe('abcdefghijkl');
  });
  it('strips every listed control, bidi, separator and invisible code point, each on its own (WR-04)', () => {
    const stripped = [
      0x0000, 0x0008, 0x000b, 0x001f, 0x007f, 0x0085, 0x009f, 0x00ad, 0x061c, 0x180e, 0x200b, 0x200e, 0x200f,
      0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2061, 0x2064, 0x2066, 0x2069, 0x206a,
      0x206f, 0xfeff,
    ];
    for (const code of stripped) {
      const ch = String.fromCharCode(code);
      expect(cleanSegmentText(`a${ch}b`, 'narration'), `U+${code.toString(16)}`).toBe('ab');
      expect(cleanSegmentText(`a${ch}b`, 'dialogue'), `U+${code.toString(16)} dialogue`).toBe('ab');
    }
  });
  it('keeps LF, ZWNJ and ZWJ (emoji joiners survive) (WR-04)', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    expect(cleanSegmentText(`a\n${family}‌b`, 'narration')).toBe(`a\n${family}‌b`);
  });
  it('keeps LF and collapses three or more newlines to two', () => {
    expect(cleanSegmentText('a\n\n\n\n\nb\nc', 'narration')).toBe('a\n\nb\nc');
  });
  it('trims', () => {
    expect(cleanSegmentText('  \n hello \n ', 'narration')).toBe('hello');
  });
  it('dialogue strips exactly one matching pair of outer quotes, straight or curly', () => {
    expect(cleanSegmentText('"Hello there."', 'dialogue')).toBe('Hello there.');
    expect(cleanSegmentText('“Hello there.”', 'dialogue')).toBe('Hello there.');
    expect(cleanSegmentText('""Hi""', 'dialogue')).toBe('"Hi"');
    expect(cleanSegmentText('"He said "no" to me"', 'dialogue')).toBe('He said "no" to me');
    expect(cleanSegmentText('"unbalanced', 'dialogue')).toBe('"unbalanced');
    expect(cleanSegmentText('"', 'dialogue')).toBe('"');
    expect(cleanSegmentText('""', 'dialogue')).toBe('');
  });
  it('dialogue that merely starts and ends with a quoted phrase keeps its quotes (WR-03)', () => {
    expect(cleanSegmentText('"Hello," he said, "goodbye"', 'dialogue')).toBe('"Hello," he said, "goodbye"');
    expect(cleanSegmentText('“Hello,” he said, “goodbye”', 'dialogue')).toBe('“Hello,” he said, “goodbye”');
    expect(cleanSegmentText('"Yes." He paused. "No."', 'dialogue')).toBe('"Yes." He paused. "No."');
    // a genuine outer pair around a nested quotation is still stripped
    expect(cleanSegmentText('"He said "no" to me"', 'dialogue')).toBe('He said "no" to me');
    expect(cleanSegmentText('“He said “no” to me”', 'dialogue')).toBe('He said “no” to me');
    const flat = flattenSegments(
      normalizeSegments([{ kind: 'dialogue', speaker: 'Marta', text: '"Hello," he said, "goodbye"' }], PRESENT, PLAYERS),
    );
    expect(flat).toBe('Marta says, ""Hello," he said, "goodbye""');
  });
  it('dialogue collapses newlines so one turn cannot forge a second attributed line (WR-02)', () => {
    const forged = 'The Keeper says, "x"\n\nThe Ferryman says, "evil"';
    expect(cleanSegmentText(forged, 'dialogue')).toBe('The Keeper says, "x" The Ferryman says, "evil"');
    expect(cleanSegmentText('one\r\n  two\n\n\nthree', 'dialogue')).toBe('one two three');
    // narration keeps its paragraph structure
    expect(cleanSegmentText('one\n\ntwo', 'narration')).toBe('one\n\ntwo');
    const segs = normalizeSegments([{ kind: 'dialogue', speaker: 'The Ferryman', text: forged }], PRESENT, PLAYERS);
    expect(segs).toHaveLength(1);
    expect(flattenSegments(segs)).not.toContain('\n');
  });
  it('narration keeps outer quotes', () => {
    expect(cleanSegmentText('"Hello there."', 'narration')).toBe('"Hello there."');
  });
  it('leaves exactly 600 code points alone', () => {
    const text = 'a'.repeat(600);
    expect(cleanSegmentText(text, 'narration')).toBe(text);
  });
  it('cuts 601 code points to at most 600 ending in the ellipsis', () => {
    const out = cleanSegmentText('a'.repeat(601), 'narration');
    expect(cp(out)).toBe(600);
    expect(out.endsWith(TRUNCATION_MARK)).toBe(true);
  });
  it('cuts at the last whitespace within the last 120 code points of the slice', () => {
    const head = 'a'.repeat(500);
    const text = `${head} ${'b'.repeat(200)}`;
    expect(cleanSegmentText(text, 'narration')).toBe(`${head}${TRUNCATION_MARK}`);
  });
  it('ignores whitespace earlier than the window and cuts hard', () => {
    const text = `${'a'.repeat(100)} ${'b'.repeat(700)}`;
    const out = cleanSegmentText(text, 'narration');
    expect(cp(out)).toBe(600);
    expect(out.endsWith(`b${TRUNCATION_MARK}`)).toBe(true);
  });
  it('never splits an astral character', () => {
    const out = cleanSegmentText('\u{1F600}'.repeat(700), 'narration');
    expect(cp(out)).toBe(600);
    expect(wellFormed(out)).toBe(true);
    expect(out.endsWith(TRUNCATION_MARK)).toBe(true);
    expect(Array.from(out).slice(0, 599).every((c) => c === '\u{1F600}')).toBe(true);
  });
  it('a 5000 character text is clamped', () => {
    expect(cp(cleanSegmentText('word '.repeat(1000), 'narration'))).toBeLessThanOrEqual(600);
  });
});

describe('normalizeSegments', () => {
  it('gives [] for null, non-arrays and []', () => {
    for (const v of [null, undefined, [], 'text', 5, {}, { segments: [] }]) {
      expect(normalizeSegments(v, PRESENT, PLAYERS)).toEqual([]);
    }
  });
  it('a single valid element returns exactly that one segment', () => {
    expect(normalizeSegments([{ kind: 'narration', speaker: 'x', text: 'Rain falls.' }], PRESENT)).toEqual([
      { kind: 'narration', speaker: 'The Keeper', text: 'Rain falls.' },
    ]);
  });
  it('skips non-object items', () => {
    const out = normalizeSegments([null, 5, 'x', [], { kind: 'narration', text: 'ok' }], PRESENT);
    expect(out).toHaveLength(1);
  });
  it('unknown kinds become narration', () => {
    const out = normalizeSegments([{ kind: 'song', speaker: 'The Ferryman', text: 'La la.' }], PRESENT);
    expect(out).toEqual([{ kind: 'narration', speaker: 'The Keeper', text: 'La la.' }]);
  });
  it('narration speaker is always The Keeper', () => {
    const out = normalizeSegments([{ kind: 'narration', speaker: 'Marta', text: 'Mist.' }], PRESENT);
    expect(out[0].speaker).toBe('The Keeper');
  });
  it('drops empty and whitespace-only texts', () => {
    const out = normalizeSegments(
      [{ kind: 'narration', text: '' }, { kind: 'narration', text: ' \n\t ' }, { kind: 'narration', text: 5 }, { kind: 'narration' }],
      PRESENT,
    );
    expect(out).toEqual([]);
  });
  it('dialogue by a present speaker takes the canonical name and id', () => {
    const out = normalizeSegments([{ kind: 'dialogue', speaker: '  the FERRYMAN ', text: '"Cross?"' }], PRESENT);
    expect(out).toEqual([{ kind: 'dialogue', speaker: 'The Ferryman', text: 'Cross?', speakerNpcId: 7n }]);
  });
  it('omits speakerNpcId when the present speaker has no id', () => {
    const out = normalizeSegments([{ kind: 'dialogue', speaker: 'marta', text: 'Hm.' }], PRESENT);
    expect(out).toEqual([{ kind: 'dialogue', speaker: 'Marta', text: 'Hm.' }]);
    expect('speakerNpcId' in out[0]).toBe(false);
  });
  it('drops dialogue attributed to the player', () => {
    for (const who of ['Aldric', 'aldric', 'you', 'You', 'yourself', 'player', 'The Player']) {
      expect(normalizeSegments([{ kind: 'dialogue', speaker: who, text: 'I draw my sword.' }], PRESENT, PLAYERS)).toEqual([]);
    }
  });
  it('dialogue attributed to the Keeper becomes unquoted Keeper narration', () => {
    for (const who of ['The Keeper', 'Keeper', 'Keeper of Knowledge', 'The Keeper of Knowledge', ' the  keeper ']) {
      expect(normalizeSegments([{ kind: 'dialogue', speaker: who, text: '"Dusk settles."' }], PRESENT)).toEqual([
        { kind: 'narration', speaker: 'The Keeper', text: 'Dusk settles.' },
      ]);
    }
  });
  it('unmatched or missing speaker becomes quoted Keeper narration', () => {
    const out = normalizeSegments(
      [{ kind: 'dialogue', speaker: 'The Mayor', text: 'Welcome.' }, { kind: 'dialogue', text: 'Hello.' }, { kind: 'dialogue', speaker: 5, text: 'Yo.' }],
      PRESENT,
    );
    expect(out.map((s) => s.text)).toEqual(['"Welcome."', '"Hello."', '"Yo."']);
    expect(out.every((s) => s.kind === 'narration' && s.speaker === 'The Keeper')).toBe(true);
  });
  it('the quote wrapping stays within 600 code points', () => {
    const out = normalizeSegments([{ kind: 'dialogue', speaker: 'Nobody', text: 'a'.repeat(900) }], PRESENT);
    expect(cp(out[0].text)).toBeLessThanOrEqual(600);
    expect(out[0].text.startsWith('"')).toBe(true);
    expect(out[0].text.endsWith('"')).toBe(true);
    const exact = normalizeSegments([{ kind: 'dialogue', speaker: 'Nobody', text: 'b'.repeat(600) }], PRESENT);
    expect(cp(exact[0].text)).toBeLessThanOrEqual(600);
    expect(exact[0].text.endsWith('"')).toBe(true);
  });
  it('keeps at most 6 and examines at most 12', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ kind: 'narration', text: `n${i}` }));
    expect(normalizeSegments(seven, PRESENT).map((s) => s.text)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4', 'n5']);
    // items beyond the 12th are never examined: 12 empties then valid ones give nothing
    const late = [...Array.from({ length: 12 }, () => ({ kind: 'narration', text: '' })), { kind: 'narration', text: 'late' }];
    expect(normalizeSegments(late, PRESENT)).toEqual([]);
    const twenty = Array.from({ length: 20 }, (_, i) => ({ kind: 'narration', text: `n${i}` }));
    expect(normalizeSegments(twenty, PRESENT)).toHaveLength(6);
  });
  it('keeps adjacent same-speaker segments and identical consecutive segments separate, in order', () => {
    const items = [
      { kind: 'dialogue', speaker: 'Marta', text: 'One.' },
      { kind: 'dialogue', speaker: 'Marta', text: 'One.' },
      { kind: 'narration', text: 'Two.' },
      { kind: 'narration', text: 'Two.' },
    ];
    const out = normalizeSegments(items, PRESENT);
    expect(out.map((s) => `${s.kind}:${s.speaker}:${s.text}`)).toEqual([
      'dialogue:Marta:One.',
      'dialogue:Marta:One.',
      'narration:The Keeper:Two.',
      'narration:The Keeper:Two.',
    ]);
  });
  it('preserves input order end to end through flatten', () => {
    const out = normalizeSegments(
      [{ kind: 'narration', text: 'First.' }, { kind: 'dialogue', speaker: 'Marta', text: 'Second.' }, { kind: 'narration', text: 'Third.' }],
      PRESENT,
    );
    expect(flattenSegments(out)).toBe('First.\n\nMarta says, "Second."\n\nThird.');
  });
});

describe('keeperSegments', () => {
  it('splits on blank lines and drops empties', () => {
    const out = keeperSegments('One.\n\n\n\nTwo.\n  \nThree.');
    expect(out.map((s) => s.text)).toEqual(['One.', 'Two.', 'Three.']);
    expect(out.every((s) => s.kind === 'narration' && s.speaker === 'The Keeper')).toBe(true);
  });
  it('gives [] for blank and non-string input', () => {
    expect(keeperSegments('')).toEqual([]);
    expect(keeperSegments(' \n\n ')).toEqual([]);
    expect(keeperSegments(undefined as any)).toEqual([]);
  });
  it('clamps each paragraph', () => {
    const out = keeperSegments(`${'a'.repeat(800)}\n\nshort`);
    expect(out).toHaveLength(2);
    expect(cp(out[0].text)).toBe(600);
  });
  it('packs more than 6 paragraphs by merging the smallest adjacent pair, leftmost on ties', () => {
    const out = keeperSegments('a\n\nb\n\nc\n\nd\n\ne\n\nf\n\ng');
    expect(out).toHaveLength(6);
    expect(out[0].text).toBe('a\n\nb');
    expect(out.slice(1).map((s) => s.text)).toEqual(['c', 'd', 'e', 'f', 'g']);
  });
  it('packs by combined length, not position', () => {
    const out = keeperSegments('long paragraph one\n\nlong paragraph two\n\nx\n\ny\n\nlong paragraph three\n\nlong paragraph four\n\nlong paragraph five');
    expect(out).toHaveLength(6);
    expect(out.map((s) => s.text)).toContain('x\n\ny');
  });
  it('never merges past the cap: seven 300-character paragraphs lose no text (WR-05)', () => {
    const paragraphs = Array.from({ length: 7 }, (_, i) => String(i).repeat(300));
    const out = keeperSegments(paragraphs.join('\n\n'));
    expect(out.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    for (const s of out) expect(cp(s.text)).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
    const kept = out.map((s) => s.text).join('');
    expect(kept.includes(TRUNCATION_MARK)).toBe(false);
    expect(kept.replace(/\s/g, '')).toBe(paragraphs.join(''));
  });
  it('re-chunks at sentence boundaries when pair merging cannot fit (WR-05)', () => {
    const sentence = (n: number) => `Sentence ${n} of the mechanics text runs on for a good while here and there.`;
    const paragraph = (p: number) => [0, 1, 2, 3, 4].map((k) => sentence(p * 10 + k)).join(' ');
    const paragraphs = Array.from({ length: 7 }, (_, i) => paragraph(i));
    expect(paragraphs.every((p) => cp(p) > 350 && cp(p) < 420)).toBe(true);
    const out = keeperSegments(paragraphs.join('\n\n'));
    expect(out.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    for (const s of out) {
      expect(cp(s.text)).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
      expect(s.text.endsWith('.')).toBe(true); // cut on a sentence end, never mid-sentence
    }
    expect(flattenSegments(out).replace(/\s+/g, ' ')).toBe(paragraphs.join(' '));
  });
  it('keeps a short instruction paragraph intact next to long ones (WR-05)', () => {
    const long = (c: string) => `${c.repeat(280)}`;
    const text = [long('a'), long('b'), long('c'), long('d'), long('e'), long('f'), 'Choose one. Type the name of the ability.'].join('\n\n');
    const out = keeperSegments(text);
    expect(out.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    expect(out.map((s) => s.text).join('\n\n')).toContain('Choose one. Type the name of the ability.');
  });
  it('text that cannot fit in six segments is still clamped, never over the cap (WR-05)', () => {
    const out = keeperSegments(Array.from({ length: 7 }, () => 'x'.repeat(599)).join('\n\n'));
    expect(out).toHaveLength(MAX_SEGMENTS);
    for (const s of out) expect(cp(s.text)).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
    const huge = keeperSegments(Array.from({ length: 2000 }, () => 'word word word').join('\n\n'));
    expect(huge.length).toBeLessThanOrEqual(MAX_SEGMENTS);
  });
  it('round-trips through flatten for up to 6 paragraphs and for 7 and 8', () => {
    for (const n of [1, 2, 6, 7, 8]) {
      const text = Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} of the tale.`).join('\n\n');
      expect(flattenSegments(keeperSegments(text))).toBe(text);
    }
  });
});

describe('keeperFallback', () => {
  it('is always exactly one Keeper narration segment', () => {
    expect(keeperFallback('The Keeper loses the thread.')).toEqual([
      { kind: 'narration', speaker: 'The Keeper', text: 'The Keeper loses the thread.' },
    ]);
  });
  it('does not split paragraphs', () => {
    expect(keeperFallback('One.\n\nTwo.')).toHaveLength(1);
  });
  it('a blank line gives ...', () => {
    expect(keeperFallback('   ')[0].text).toBe('...');
    expect(keeperFallback(undefined as any)[0].text).toBe('...');
  });
});

describe('flattenSegments', () => {
  it('renders narration as text and dialogue as speaker says, "text"', () => {
    const segs: Segment[] = [
      { kind: 'narration', speaker: 'The Keeper', text: 'The ferry waits.' },
      { kind: 'dialogue', speaker: 'The Ferryman', text: 'Cross?' },
    ];
    expect(flattenSegments(segs)).toBe('The ferry waits.\n\nThe Ferryman says, "Cross?"');
  });
  it('gives "" for []', () => {
    expect(flattenSegments([])).toBe('');
  });
});

describe('parseReplyObject', () => {
  it('parses plain, fenced and surrounded objects', () => {
    expect(parseReplyObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseReplyObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseReplyObject('Here you go: {"a":1} done')).toEqual({ a: 1 });
  });
  it('returns undefined for invalid JSON, arrays, null, numbers and non-strings', () => {
    for (const v of ['{bad', '[1,2]', 'null', '5', '"s"', '', undefined, null, 5, {}, []]) {
      expect(parseReplyObject(v as any)).toBeUndefined();
    }
  });
});

describe('isUsableProse', () => {
  it('accepts ordinary narration', () => {
    expect(isUsableProse('A quiet round.')).toBe(true);
    expect(isUsableProse('The ferry creaks against its rope while mist gathers.')).toBe(true);
  });
  it('rejects empty, JSON-shaped and fenced text', () => {
    for (const v of ['', '   ', '{"a":"hello world"}', '[ "hello world" ]', '```\nhello world there\n```']) {
      expect(isUsableProse(v)).toBe(false);
    }
  });
  it('rejects fewer than 8 letters', () => {
    expect(isUsableProse('Hi there!')).toBe(false); // 7 letters
  });
  it('counts Unicode letters, not characters', () => {
    expect(isUsableProse('1234 5678 90 !!')).toBe(false);
    expect(isUsableProse('abcdefg')).toBe(false);
    expect(isUsableProse('abcdefgh')).toBe(true);
    expect(isUsableProse('éééé éééé')).toBe(true);
  });
  it('rejects model self-talk and refusals', () => {
    for (const v of [
      'As an AI, I describe the scene in detail.',
      'I am a Language Model and cannot do this.',
      "Well, I'm sorry, but that is not possible today.",
      "I can't help with that request right now.",
      'I cannot continue this scene for you.',
      "I won't write that scene.",
      'I am unable to narrate this part.',
      "I'm unable to narrate this part.",
      'Sorry, the scene is lost to me.',
    ]) {
      expect(isUsableProse(v)).toBe(false);
    }
  });
  it('is total', () => {
    expect(isUsableProse(undefined as any)).toBe(false);
    expect(isUsableProse(5 as any)).toBe(false);
  });
});

describe('segmentsFromReply ladder', () => {
  it('1: a segments array gives source segments', () => {
    const reply = JSON.stringify({ segments: [{ kind: 'dialogue', speaker: 'The Ferryman', text: 'Cross?' }] });
    const r = segmentsFromReply(reply, OPTS);
    expect(r.source).toBe('segments');
    expect(r.segments).toEqual([{ kind: 'dialogue', speaker: 'The Ferryman', text: 'Cross?', speakerNpcId: 7n }]);
    expect(r.parsed).toBeDefined();
  });
  it('1: fenced JSON works', () => {
    const r = segmentsFromReply('```json\n{"segments":[{"kind":"narration","speaker":"x","text":"Mist."}]}\n```', OPTS);
    expect(r.source).toBe('segments');
  });
  it('2: legacy dialogue becomes one dialogue segment from the known speaker', () => {
    const r = segmentsFromReply('{"dialogue":"\\"Aye.\\"","effects":[]}', { ...OPTS, legacyDialogueSpeaker: FERRYMAN });
    expect(r.source).toBe('legacy_dialogue');
    expect(r.segments).toEqual([{ kind: 'dialogue', speaker: 'The Ferryman', text: 'Aye.', speakerNpcId: 7n }]);
  });
  it('2: segments that all fail still fall to legacy dialogue', () => {
    const r = segmentsFromReply('{"segments":[{"kind":"dialogue","speaker":"Aldric","text":"Mine."}],"dialogue":"Aye."}', {
      ...OPTS,
      legacyDialogueSpeaker: FERRYMAN,
    });
    expect(r.source).toBe('legacy_dialogue');
  });
  it('2: ignored without legacyDialogueSpeaker, blank dialogue ignored', () => {
    expect(segmentsFromReply('{"dialogue":"Aye."}', OPTS).source).toBe('fallback');
    expect(segmentsFromReply('{"dialogue":"  "}', { ...OPTS, legacyDialogueSpeaker: FERRYMAN }).source).toBe('fallback');
  });
  it('3: legacy narrative goes through cleanProse and keeperSegments', () => {
    const r = segmentsFromReply('{"narrative":"DRAFT: Smoke.\\n\\nSteel rings."}', {
      ...OPTS,
      legacyNarrativeField: true,
      cleanProse: (t) => t.replace('DRAFT: ', ''),
    });
    expect(r.source).toBe('legacy_narrative');
    expect(r.segments.map((s) => s.text)).toEqual(['Smoke.', 'Steel rings.']);
  });
  it('4: usable prose is salvaged only when asked and only without a parsed object', () => {
    const prose = 'The blade bites deep and the beast staggers back, breathing hard.';
    const r = segmentsFromReply(prose, { ...OPTS, salvageProse: true });
    expect(r.source).toBe('prose');
    expect(r.parsed).toBeUndefined();
    expect(r.segments[0].text).toBe(prose);
    expect(segmentsFromReply(prose, OPTS).source).toBe('fallback');
    expect(segmentsFromReply('{"other":1}', { ...OPTS, salvageProse: true }).source).toBe('fallback');
  });
  it('4: cleanProse runs before the usability check', () => {
    const r = segmentsFromReply('Draft one. Final: The beast falls with a heavy thud.', {
      ...OPTS,
      salvageProse: true,
      cleanProse: (t) => t.replace(/^.*Final: /, ''),
    });
    expect(r.segments[0].text).toBe('The beast falls with a heavy thud.');
  });
  it('5: the in-voice line when nothing is usable', () => {
    const r = segmentsFromReply('{bad json', OPTS);
    expect(r.source).toBe('fallback');
    expect(r.segments).toEqual([{ kind: 'narration', speaker: 'The Keeper', text: 'The Keeper loses the thread.' }]);
  });
  it('parsed is returned in every case', () => {
    expect(segmentsFromReply('{"x":1}', OPTS).parsed).toEqual({ x: 1 });
    expect(segmentsFromReply('nope', OPTS).parsed).toBeUndefined();
  });
  it('never throws and never returns nothing, whatever the input', () => {
    const hostile: unknown[] = [undefined, null, 5, {}, [], '', '   ', '{', '}', '[[[', '```', '{"segments":5}', '{"segments":[null]}', Symbol.iterator.toString()];
    for (const input of hostile) {
      const r = segmentsFromReply(input, { ...OPTS, legacyDialogueSpeaker: FERRYMAN, legacyNarrativeField: true, salvageProse: true });
      expect(r.segments.length).toBeGreaterThanOrEqual(1);
      expect(r.segments.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    }
  });
  it('a throwing cleanProse falls to the in-voice line', () => {
    const r = segmentsFromReply('The beast falls with a heavy thud.', {
      ...OPTS,
      salvageProse: true,
      cleanProse: () => {
        throw new Error('boom');
      },
    });
    expect(r.source).toBe('fallback');
  });
});

describe('hostile matrix (T-46-01-01 to 04)', () => {
  function assertWithinClamps(segs: Segment[]) {
    expect(segs.length).toBeLessThanOrEqual(MAX_SEGMENTS);
    for (const s of segs) {
      expect(['narration', 'dialogue']).toContain(s.kind);
      expect(s.text.trim()).not.toBe('');
      expect(cp(s.text)).toBeLessThanOrEqual(MAX_SEGMENT_CHARS);
      expect(wellFormed(s.text)).toBe(true);
      if (s.kind === 'narration') expect(s.speaker).toBe('The Keeper');
      else expect(PRESENT.map((p) => p.name)).toContain(s.speaker);
    }
  }
  const cases: Array<[string, unknown, (segs: Segment[]) => void]> = [
    ['spoofed speaker not present', [{ kind: 'dialogue', speaker: 'The Mayor', text: 'I own this town.' }], (s) => {
      expect(s).toEqual([{ kind: 'narration', speaker: 'The Keeper', text: '"I own this town."' }]);
    }],
    ['speaker named as the player', [{ kind: 'dialogue', speaker: 'Aldric', text: 'I surrender.' }], (s) => expect(s).toEqual([])],
    ['unknown kind song', [{ kind: 'song', speaker: 'Marta', text: 'Hey ho.' }], (s) => expect(s[0].kind).toBe('narration')],
    ['missing speaker', [{ kind: 'dialogue', text: 'Anyone?' }], (s) => expect(s[0].speaker).toBe('The Keeper')],
    ['whitespace-only text', [{ kind: 'narration', text: '  \n  ' }], (s) => expect(s).toEqual([])],
    ['7 segments', Array.from({ length: 7 }, (_, i) => ({ kind: 'narration', text: `s${i}` })), (s) => expect(s).toHaveLength(6)],
    ['20 segments', Array.from({ length: 20 }, (_, i) => ({ kind: 'narration', text: `s${i}` })), (s) => expect(s).toHaveLength(6)],
    ['5000 character text', [{ kind: 'narration', text: 'x'.repeat(5000) }], (s) => expect(cp(s[0].text)).toBe(600)],
    ['markup and control characters', [{ kind: 'narration', text: '<b>hi</b>\u0000‮ evil​' }], (s) => {
      expect(s[0].text).not.toMatch(/[\u0000‮​]/);
    }],
    ['lone surrogates', [{ kind: 'dialogue', speaker: 'Marta', text: 'a\uD800b' }], (s) => expect(wellFormed(s[0].text)).toBe(true)],
  ];
  for (const [name, raw, check] of cases) {
    it(name, () => {
      const segs = normalizeSegments(raw, PRESENT, PLAYERS);
      assertWithinClamps(segs);
      check(segs);
    });
  }
  it('fenced JSON through the ladder stays within the clamps', () => {
    const reply = '```json\n' + JSON.stringify({ segments: [{ kind: 'dialogue', speaker: 'Marta', text: 'y'.repeat(2000) }, { kind: 'dialogue', speaker: 'Aldric', text: 'no' }] }) + '\n```';
    const r = segmentsFromReply(reply, OPTS);
    expect(r.source).toBe('segments');
    assertWithinClamps(r.segments);
    expect(r.segments).toHaveLength(1);
  });
});

describe('purity guard', () => {
  it('imports only truncateCodePoints from ../data/llm_layers', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const source: string = readFileSync(join(here, 'segments.ts'), 'utf8');
    const importLines = source.split('\n').filter((l: string) => /^\s*import\b/.test(l));
    expect(importLines).toEqual(["import { truncateCodePoints } from '../data/llm_layers';"]);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
  });
});
