import { describe, expect, it } from 'vitest';
import { createInputHistory, HISTORY_LIMIT } from './history';

describe('createInputHistory', () => {
  it('limit is 50', () => {
    expect(HISTORY_LIMIT).toBe(50);
  });

  it('empty history: up and down return null', () => {
    const h = createInputHistory();
    expect(h.up('draft')).toBeNull();
    expect(h.down()).toBeNull();
  });

  it('recalls newest first, stays on the oldest, then restores the draft', () => {
    const h = createInputHistory();
    h.record('a');
    h.record('b');
    expect(h.up('typing')).toBe('b');
    expect(h.up('typing')).toBe('a');
    expect(h.up('typing')).toBeNull();
    expect(h.down()).toBe('b');
    expect(h.down()).toBe('typing');
    expect(h.down()).toBeNull();
  });

  it('keeps the draft from the first Up only', () => {
    const h = createInputHistory();
    h.record('a');
    h.record('b');
    h.up('first draft');
    h.up('ignored');
    h.down();
    expect(h.down()).toBe('first draft');
  });

  it('does not store empty or whitespace-only lines', () => {
    const h = createInputHistory();
    h.record('');
    h.record('   ');
    expect(h.entries()).toEqual([]);
  });

  it('collapses consecutive duplicates only', () => {
    const h = createInputHistory();
    h.record('a');
    h.record('a');
    expect(h.entries()).toEqual(['a']);
    const g = createInputHistory();
    g.record('a');
    g.record('b');
    g.record('a');
    expect(g.entries()).toEqual(['a', 'b', 'a']);
  });

  it('keeps the newest 50 of 55 records', () => {
    const h = createInputHistory();
    for (let i = 0; i < 55; i += 1) h.record(`line ${i}`);
    expect(h.entries().length).toBe(50);
    expect(h.entries()[0]).toBe('line 54');
    expect(h.entries()[49]).toBe('line 5');
  });

  it('record during a recall resets the cursor', () => {
    const h = createInputHistory();
    h.record('a');
    h.record('b');
    h.up('');
    h.up('');
    h.record('c');
    expect(h.up('x')).toBe('c');
  });

  it('stores text as typed and compares the trimmed text for duplicates', () => {
    const h = createInputHistory();
    h.record('  look  ');
    expect(h.entries()).toEqual(['  look  ']);
    h.record('look');
    expect(h.entries()).toEqual(['  look  ']);
  });

  it('resetCursor starts the next Up from the newest', () => {
    const h = createInputHistory();
    h.record('a');
    h.record('b');
    h.up('');
    h.up('');
    h.resetCursor();
    expect(h.up('')).toBe('b');
  });

  it('honours a custom limit', () => {
    const h = createInputHistory(2);
    h.record('a');
    h.record('b');
    h.record('c');
    expect(h.entries()).toEqual(['c', 'b']);
  });
});
