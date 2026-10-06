import { describe, expect, it } from 'vitest';
import { autoAttackTarget, choiceChip, livingTargetId, roundControls } from './choice';

const enemies = [
  { id: 9n, displayName: 'Cinderling', currentHp: 30n },
  { id: 5n, displayName: 'Rotfang', currentHp: 40n },
  { id: 7n, displayName: 'Husk', currentHp: 0n },
];

const abilities = [
  { id: 1n, name: 'Firebolt', kind: 'damage', targetRule: 'single_enemy' },
  { id: 2n, name: 'Mend', kind: 'heal', targetRule: 'single_ally' },
  { id: 3n, name: 'Ward', kind: 'buff', targetRule: 'self' },
  { id: 4n, name: 'Blaze', kind: 'damage', targetRule: 'all_enemies' },
];

const names = new Map<bigint, string>([[8n, 'Mara']]);

function chip(over: Partial<Parameters<typeof choiceChip>[0]> = {}) {
  return choiceChip({
    action: null,
    abilities,
    enemies,
    currentTargetId: 5n,
    selfId: 1n,
    characterNames: names,
    down: false,
    ...over,
  });
}

describe('livingTargetId', () => {
  it('returns the living current target', () => {
    expect(livingTargetId(enemies, 5n)).toBe(5n);
  });
  it('returns undefined for a dead, missing or absent target', () => {
    expect(livingTargetId(enemies, 7n)).toBeUndefined();
    expect(livingTargetId(enemies, 99n)).toBeUndefined();
    expect(livingTargetId(enemies, null)).toBeUndefined();
  });
});

describe('autoAttackTarget', () => {
  it('prefers the living current target', () => {
    expect(autoAttackTarget(enemies, 9n)).toEqual({ id: 9n, name: 'Cinderling' });
  });
  it('falls back to the lowest-id living enemy', () => {
    expect(autoAttackTarget(enemies, 7n)).toEqual({ id: 5n, name: 'Rotfang' });
    expect(autoAttackTarget(enemies, null)).toEqual({ id: 5n, name: 'Rotfang' });
  });
  it('returns null with no living enemy', () => {
    expect(autoAttackTarget([{ id: 7n, displayName: 'Husk', currentHp: 0n }], null)).toBeNull();
    expect(autoAttackTarget([], null)).toBeNull();
  });
});

describe('choiceChip', () => {
  it('no row: auto-attack at the current target, neutral, sword', () => {
    expect(chip()).toEqual({ text: 'Auto-attack → Rotfang', tone: 'neutral', icon: 'sword', abilityKind: null });
  });

  it('no row: a dead current target falls to the lowest-id living enemy', () => {
    expect(chip({ currentTargetId: 7n }).text).toBe('Auto-attack → Rotfang');
  });

  it('no row: no living enemy is plain Auto-attack', () => {
    expect(chip({ enemies: [{ id: 7n, displayName: 'Husk', currentHp: 0n }] }).text).toBe('Auto-attack');
  });

  it('auto_attack row: same text, accent, check', () => {
    expect(chip({ action: { actionType: 'auto_attack' } })).toEqual({
      text: 'Auto-attack → Rotfang',
      tone: 'accent',
      icon: 'check',
      abilityKind: null,
    });
  });

  it('auto_attack row: the stored target wins over the current one', () => {
    expect(chip({ action: { actionType: 'auto_attack', targetEnemyId: 9n } }).text).toBe('Auto-attack → Cinderling');
  });

  it('auto_attack row: a stored dead target falls back to the current living one', () => {
    expect(chip({ action: { actionType: 'auto_attack', targetEnemyId: 7n } }).text).toBe('Auto-attack → Rotfang');
  });

  it('ability row single_enemy without a stored target uses the current target', () => {
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 1n } })).toEqual({
      text: 'Firebolt → Rotfang',
      tone: 'accent',
      icon: 'ability',
      abilityKind: 'damage',
    });
  });

  it('ability row single_enemy with a stored target names that enemy', () => {
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 1n, targetEnemyId: 9n } }).text).toBe(
      'Firebolt → Cinderling',
    );
  });

  it('ability row single_enemy with no living current target names no one', () => {
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 1n }, currentTargetId: 7n }).text).toBe('Firebolt');
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 1n }, currentTargetId: null }).text).toBe('Firebolt');
  });

  it('ability row single_ally names the ally, or you', () => {
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 2n, targetCharacterId: 8n } })).toMatchObject({
      text: 'Mend → Mara',
      abilityKind: 'heal',
    });
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 2n, targetCharacterId: 1n } }).text).toBe('Mend → you');
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 2n } }).text).toBe('Mend → you');
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 2n, targetCharacterId: 42n } }).text).toBe(
      'Mend → Member',
    );
  });

  it('other rules name no target', () => {
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 3n } }).text).toBe('Ward');
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 4n } }).text).toBe('Blaze');
  });

  it('an ability id missing from the list reads Ability', () => {
    expect(chip({ action: { actionType: 'ability', abilityTemplateId: 99n } })).toEqual({
      text: 'Ability',
      tone: 'accent',
      icon: 'ability',
      abilityKind: null,
    });
  });

  it('flee row: Fleeing, danger, run', () => {
    expect(chip({ action: { actionType: 'flee' } })).toEqual({
      text: 'Fleeing',
      tone: 'danger',
      icon: 'run',
      abilityKind: null,
    });
  });

  it('down wins over every row', () => {
    const down = { text: 'You are down', tone: 'neutral', icon: 'none', abilityKind: null };
    expect(chip({ down: true })).toEqual(down);
    expect(chip({ down: true, action: { actionType: 'flee' } })).toEqual(down);
    expect(chip({ down: true, action: { actionType: 'ability', abilityTemplateId: 1n } })).toEqual(down);
  });

  it('keeps hostile text as plain strings (img-onerror names)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const out = chip({
      enemies: [{ id: 5n, displayName: evil, currentHp: 10n }],
      action: { actionType: 'ability', abilityTemplateId: 1n },
    });
    expect(out.text).toBe(`Firebolt → ${evil}`);
    const ally = chip({
      characterNames: new Map([[8n, evil]]),
      action: { actionType: 'ability', abilityTemplateId: 2n, targetCharacterId: 8n },
    });
    expect(ally.text).toBe(`Mend → ${evil}`);
  });
});

describe('roundControls', () => {
  const open = { actionType: null, resolving: false, down: false, connected: true };

  it('disables nothing with no row, an open round, alive and connected', () => {
    expect(roundControls(open)).toEqual({ inert: false, readyDisabled: false, fleeDisabled: false, fleeChosen: false });
  });

  it('disables Ready once any choice row exists', () => {
    expect(roundControls({ ...open, actionType: 'auto_attack' })).toMatchObject({ readyDisabled: true, fleeDisabled: false, fleeChosen: false });
    expect(roundControls({ ...open, actionType: 'ability' })).toMatchObject({ readyDisabled: true, fleeChosen: false, inert: false });
  });

  it('reads Flee chosen on a flee row', () => {
    expect(roundControls({ ...open, actionType: 'flee' })).toEqual({
      inert: false,
      readyDisabled: true,
      fleeDisabled: false,
      fleeChosen: true,
    });
  });

  it.each([
    ['resolving', { resolving: true }],
    ['down', { down: true }],
    ['disconnected', { connected: false }],
  ])('is inert while %s', (_name, over) => {
    expect(roundControls({ ...open, ...over })).toMatchObject({ inert: true, readyDisabled: true, fleeDisabled: true });
  });
});
