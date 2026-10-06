import { describe, expect, it } from 'vitest';
import { ABILITY_KINDS, ABILITY_KIND_LABELS, CC_TYPES } from '@game-data/mechanical_vocabulary';
import { enemyEffectKind, kindLabel } from './kindLabel';

describe('kindLabel', () => {
  it('reads the label of every kind from the server vocabulary', () => {
    for (const kind of ABILITY_KINDS) {
      expect(kindLabel(kind), kind).toBe(ABILITY_KIND_LABELS[kind]);
    }
  });

  it('the server label map covers every kind with a non-empty, distinct label and nothing else', () => {
    const labels = ABILITY_KINDS.map((kind) => ABILITY_KIND_LABELS[kind]);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
    expect(new Set(labels).size).toBe(ABILITY_KINDS.length);
    expect(Object.keys(ABILITY_KIND_LABELS).sort()).toEqual([...ABILITY_KINDS].sort());
  });

  it('uses the words the owner asked for', () => {
    expect(kindLabel('damage')).toBe('Damage');
    expect(kindLabel('dot')).toBe('Damage over time');
    expect(kindLabel('heal')).toBe('Heal');
    expect(kindLabel('hot')).toBe('Heal over time');
    expect(kindLabel('buff')).toBe('Buff');
    expect(kindLabel('debuff')).toBe('Debuff');
    expect(kindLabel('cc')).toBe('Crowd control');
  });

  it('falls back to words for an unknown kind, never to a prototype member', () => {
    expect(kindLabel('')).toBe('');
    expect(kindLabel('track_prey')).toBe('Track prey');
    expect(kindLabel('toString')).toBe('ToString');
    expect(kindLabel('__proto__')).toBe('Proto');
  });
});

describe('enemyEffectKind', () => {
  it('classifies damage over time and regeneration', () => {
    expect(enemyEffectKind('dot', 5n)).toBe('dot');
    expect(enemyEffectKind('dot', -5n)).toBe('dot');
    expect(enemyEffectKind('regen', 3n)).toBe('hot');
    expect(enemyEffectKind('health_regen', 3n)).toBe('hot');
  });

  it('classifies every crowd control type as cc and fear as fear', () => {
    for (const type of CC_TYPES) expect(enemyEffectKind(type, 1n), type).toBe('cc');
    expect(enemyEffectKind('fear', 1n)).toBe('fear');
  });

  it('falls back to debuff or buff by polarity', () => {
    expect(enemyEffectKind('armor_down', 2n)).toBe('debuff');
    expect(enemyEffectKind('damage_taken', 2n)).toBe('debuff');
    expect(enemyEffectKind('str_bonus', -2n)).toBe('debuff');
    expect(enemyEffectKind('damage_up', 2n)).toBe('buff');
    expect(enemyEffectKind('damage_shield', 2n)).toBe('buff');
  });

  it('only ever returns a kind that has a label', () => {
    const samples = ['dot', 'regen', 'stun', 'fear', 'armor_down', 'damage_up', 'unknown_thing'];
    for (const type of samples) {
      const kind = enemyEffectKind(type, 1n);
      expect((ABILITY_KINDS as readonly string[]).indexOf(kind), type).toBeGreaterThanOrEqual(0);
      expect(kindLabel(kind).length).toBeGreaterThan(0);
    }
  });
});
