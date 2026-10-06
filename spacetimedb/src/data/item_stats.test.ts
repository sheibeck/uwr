import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ITEM_STAT_KEYS, addItemStats, emptyItemStats, sumItemStats } from './item_stats';

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

describe('ITEM_STAT_KEYS', () => {
  it('lists the 14 stat keys in order', () => {
    expect([...ITEM_STAT_KEYS]).toEqual([
      'strBonus',
      'dexBonus',
      'intBonus',
      'wisBonus',
      'chaBonus',
      'hpBonus',
      'manaBonus',
      'armorClassBonus',
      'magicResistanceBonus',
      'lifeOnHit',
      'cooldownReduction',
      'manaRegen',
      'weaponBaseDamage',
      'weaponDps',
    ]);
  });
});

describe('sumItemStats', () => {
  it('reads template fields; missing and non-bigint fields count as 0n', () => {
    const totals = sumItemStats(
      { strBonus: 2n, armorClassBonus: 3n, weaponBaseDamage: 0n, hpBonus: 'many', dexBonus: 5 },
      [],
    );
    expect(totals.strBonus).toBe(2n);
    expect(totals.armorClassBonus).toBe(3n);
    expect(totals.weaponBaseDamage).toBe(0n);
    for (const key of ITEM_STAT_KEYS) {
      if (key !== 'strBonus' && key !== 'armorClassBonus') expect(totals[key]).toBe(0n);
    }
  });

  it('adds affix magnitudes by statKey, including implicit Quality affixes', () => {
    const totals = sumItemStats({ strBonus: 2n, armorClassBonus: 3n }, [
      { statKey: 'strBonus', magnitude: 1n },
      { statKey: 'armorClassBonus', magnitude: 2n },
    ]);
    expect(totals.strBonus).toBe(3n);
    expect(totals.armorClassBonus).toBe(5n);
  });

  it('ignores an unknown statKey and lets a negative magnitude subtract', () => {
    const totals = sumItemStats({ strBonus: 4n }, [
      { statKey: 'luck', magnitude: 9n },
      { statKey: 'strBonus', magnitude: -3n },
    ]);
    expect(totals.strBonus).toBe(1n);
    expect((totals as Record<string, bigint>).luck).toBeUndefined();
  });

  it('never throws on odd input', () => {
    expect(() => sumItemStats({}, [])).not.toThrow();
    expect(() => sumItemStats(null as any, null as any)).not.toThrow();
    expect(sumItemStats({}, []).weaponDps).toBe(0n);
  });

  it('does not read inherited keys such as constructor as affix stat keys', () => {
    const totals = sumItemStats({}, [{ statKey: 'constructor', magnitude: 5n }]);
    expect(totals).toEqual(emptyItemStats());
  });
});

describe('emptyItemStats and addItemStats', () => {
  it('emptyItemStats has all 14 keys at 0n', () => {
    const e = emptyItemStats();
    expect(Object.keys(e)).toHaveLength(14);
    for (const key of ITEM_STAT_KEYS) expect(e[key]).toBe(0n);
  });

  it('addItemStats returns a new object and does not mutate its inputs', () => {
    const a = { ...emptyItemStats(), strBonus: 2n, weaponDps: 1n };
    const b = { ...emptyItemStats(), strBonus: 3n, hpBonus: 7n };
    const sum = addItemStats(a, b);
    expect(sum.strBonus).toBe(5n);
    expect(sum.hpBonus).toBe(7n);
    expect(sum.weaponDps).toBe(1n);
    expect(sum).not.toBe(a);
    expect(sum).not.toBe(b);
    expect(a.strBonus).toBe(2n);
    expect(b.strBonus).toBe(3n);
  });
});

describe('import pin', () => {
  it('item_stats.ts has no import specifier at all', () => {
    expect(importSpecifiers('item_stats.ts')).toEqual([]);
  });
});
