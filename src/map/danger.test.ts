import { describe, expect, it } from 'vitest';
import { BAND_COLOR, BAND_WORD, dangerBand, placeDanger } from './danger';

describe('dangerBand (dd = hi - playerLevel)', () => {
  it('reads easy, even, tough and deadly at player level 5', () => {
    expect(dangerBand(3, 5)).toBe('easy');
    expect(dangerBand(4, 5)).toBe('even');
    expect(dangerBand(5, 5)).toBe('even');
    expect(dangerBand(6, 5)).toBe('tough');
    expect(dangerBand(7, 5)).toBe('tough');
    expect(dangerBand(8, 5)).toBe('deadly');
  });

  it('puts the edges in the documented band: -2 easy, 0 even, 2 tough', () => {
    expect(dangerBand(3, 5)).toBe('easy'); // dd -2
    expect(dangerBand(5, 5)).toBe('even'); // dd 0
    expect(dangerBand(7, 5)).toBe('tough'); // dd 2
    expect(dangerBand(2, 5)).toBe('easy');
    expect(dangerBand(20, 5)).toBe('deadly');
  });

  it('has the words and tokens of the UI-SPEC', () => {
    expect(BAND_WORD).toEqual({ easy: 'easy', even: 'even', tough: 'tough', deadly: 'deadly' });
    expect(BAND_COLOR).toEqual({
      easy: 'var(--color-con-light-green)',
      even: 'var(--color-con-blue)',
      tough: 'var(--color-con-yellow)',
      deadly: 'var(--color-con-red)',
    });
  });
});

const regions = [
  { id: 1n, dangerMultiplier: 300n },
  { id: 2n, dangerMultiplier: 800n },
];

describe('placeDanger', () => {
  it('reads an uncharted edge as unknown even though the server stores it as safe', () => {
    const d = placeDanger({ terrainType: 'uncharted', isSafe: true, regionId: 1n, levelOffset: 0n }, regions, 3);
    expect(d).toMatchObject({
      kind: 'unknown',
      band: null,
      word: 'Danger unknown',
      color: 'var(--color-neutral-500)',
      lo: null,
      hi: null,
      levelLabel: '',
    });
  });

  it('reads a safe place as Safe in light green', () => {
    const d = placeDanger({ terrainType: 'town', isSafe: true, regionId: 1n, levelOffset: 0n }, regions, 3);
    expect(d).toMatchObject({
      kind: 'safe',
      band: null,
      word: 'Safe',
      color: 'var(--color-con-light-green)',
      levelLabel: 'Safe',
    });
  });

  it('uses the top of the range for the band and spans the range in the label', () => {
    const d = placeDanger({ terrainType: 'woods', isSafe: false, regionId: 1n, levelOffset: 1n }, regions, 3);
    expect(d).toMatchObject({ kind: 'band', lo: 3, hi: 5, band: 'tough', word: 'tough', levelLabel: 'Lv 3–5' });
    expect(d.color).toBe('var(--color-con-yellow)');
  });

  it('labels a zero offset as a single level', () => {
    const d = placeDanger({ terrainType: 'woods', isSafe: false, regionId: 1n, levelOffset: 0n }, regions, 3);
    expect(d).toMatchObject({ lo: 3, hi: 3, band: 'even', levelLabel: 'Lv 3' });
  });

  it('reads a far-above place as deadly', () => {
    const d = placeDanger({ terrainType: 'dungeon', isSafe: false, regionId: 2n, levelOffset: 0n }, regions, 3);
    expect(d).toMatchObject({ lo: 8, hi: 8, band: 'deadly', word: 'deadly' });
  });
});
