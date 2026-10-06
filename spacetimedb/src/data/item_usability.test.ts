import { describe, expect, it, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canEquipItem, isClassAllowed } from './item_usability';
import type { EquipCharacterLike, EquipTemplateLike } from './item_usability';

// helpers/character.ts imports server modules; record the real table definitions first.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let characterHelpers: typeof import('../helpers/character');
beforeAll(async () => {
  await import('../schema/tables');
  characterHelpers = await import('../helpers/character');
});

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

const tpl = (over: Partial<EquipTemplateLike> = {}): EquipTemplateLike => ({
  slot: 'chest',
  stackable: false,
  weaponType: '',
  armorType: 'cloth',
  allowedClasses: '',
  requiredLevel: 1n,
  ...over,
});

const chr = (over: Partial<EquipCharacterLike> = {}): EquipCharacterLike => ({
  className: 'Ashwarden',
  level: 5n,
  weaponProficiencies: '',
  armorProficiencies: '',
  ...over,
});

describe('canEquipItem: stackable first', () => {
  it('refuses a stackable template before any other check', () => {
    const r = canEquipItem(tpl({ stackable: true, slot: 'material' }), chr({ weaponProficiencies: 'sword' }));
    expect(r).toMatchObject({ ok: false, reason: 'stackable', message: 'Cannot equip this item' });
  });
});

describe('canEquipItem: dynamic proficiencies', () => {
  const prof = chr({ weaponProficiencies: 'sword,axe', armorProficiencies: 'cloth,leather' });

  it('refuses a weapon type outside the weapon list', () => {
    const r = canEquipItem(tpl({ slot: 'mainHand', weaponType: 'dagger', armorType: 'none' }), prof);
    expect(r).toMatchObject({ ok: false, reason: 'weapon', message: 'Your class cannot wield this weapon type' });
  });

  it('allows a weapon type on the list', () => {
    expect(canEquipItem(tpl({ slot: 'mainHand', weaponType: 'sword', armorType: 'none' }), prof).ok).toBe(true);
    expect(canEquipItem(tpl({ slot: 'offHand', weaponType: 'axe', armorType: 'none' }), prof).ok).toBe(true);
  });

  it('refuses an armor type outside the armor list', () => {
    const r = canEquipItem(tpl({ slot: 'chest', armorType: 'plate' }), prof);
    expect(r).toMatchObject({ ok: false, reason: 'armor', message: 'Your class cannot wear this armor type' });
  });

  it('never checks armor on neck, earrings or cloak', () => {
    for (const slot of ['neck', 'earrings', 'cloak']) {
      expect(canEquipItem(tpl({ slot, armorType: 'plate' }), prof).ok).toBe(true);
    }
  });

  it('does not trim the comma lists (as the server never did)', () => {
    const spaced = chr({ weaponProficiencies: 'sword, axe' });
    const r = canEquipItem(tpl({ slot: 'mainHand', weaponType: 'axe', armorType: 'none' }), spaced);
    expect(r).toMatchObject({ ok: false, reason: 'weapon' });
  });

  it('a template with no weapon type or armor type is not proficiency-gated', () => {
    expect(canEquipItem(tpl({ slot: 'mainHand', weaponType: '', armorType: '' }), prof).ok).toBe(true);
    expect(canEquipItem(tpl({ slot: 'chest', armorType: null }), prof).ok).toBe(true);
  });

  it('a character with only one list checks only that list', () => {
    const armorOnly = chr({ armorProficiencies: 'cloth' });
    expect(canEquipItem(tpl({ slot: 'mainHand', weaponType: 'dagger', armorType: 'none' }), armorOnly).ok).toBe(true);
    expect(canEquipItem(tpl({ slot: 'chest', armorType: 'plate' }), armorOnly)).toMatchObject({ reason: 'armor' });
  });
});

describe('canEquipItem: legacy class list', () => {
  it('uses allowedClasses when the character has neither proficiency list', () => {
    const weapon = canEquipItem(tpl({ slot: 'mainHand', allowedClasses: 'warrior' }), chr());
    expect(weapon).toMatchObject({ ok: false, reason: 'legacyWeapon', message: 'Weapon type not allowed for this class' });
    const other = canEquipItem(tpl({ slot: 'chest', allowedClasses: 'warrior' }), chr());
    expect(other).toMatchObject({ ok: false, reason: 'legacyClass', message: 'Class cannot use this item' });
  });

  it('allows an empty list, any, or a listed class (case and spacing insensitive)', () => {
    expect(canEquipItem(tpl({ allowedClasses: '' }), chr()).ok).toBe(true);
    expect(canEquipItem(tpl({ allowedClasses: 'warrior, ANY' }), chr()).ok).toBe(true);
    expect(canEquipItem(tpl({ allowedClasses: 'Warrior, ashwarden' }), chr()).ok).toBe(true);
  });
});

describe('canEquipItem: slot', () => {
  it('a non-equipment slot passes the class checks and gives Invalid slot', () => {
    const r = canEquipItem(tpl({ slot: 'material', stackable: false }), chr());
    expect(r).toMatchObject({ ok: false, reason: 'slot', message: 'Invalid slot' });
  });

  it('the class checks come before the slot check', () => {
    const r = canEquipItem(tpl({ slot: 'material', allowedClasses: 'warrior' }), chr());
    expect(r).toMatchObject({ reason: 'legacyClass' });
  });
});

describe('canEquipItem: level is information only', () => {
  it('levelShort is true and ok stays true when the item needs a higher level', () => {
    const r = canEquipItem(tpl({ requiredLevel: 9n }), chr({ level: 5n }));
    expect(r).toEqual({ ok: true, levelShort: true, requiredLevel: 9n });
  });

  it('levelShort is false at or above the required level, and for a missing level', () => {
    expect(canEquipItem(tpl({ requiredLevel: 5n }), chr({ level: 5n })).levelShort).toBe(false);
    expect(canEquipItem(tpl({ requiredLevel: null }), chr()).levelShort).toBe(false);
  });

  it('a refusal still reports the level information', () => {
    const r = canEquipItem(tpl({ stackable: true, requiredLevel: 9n }), chr({ level: 5n }));
    expect(r).toMatchObject({ ok: false, levelShort: true, requiredLevel: 9n });
  });
});

describe('canEquipItem: never throws', () => {
  it('survives missing optional fields', () => {
    expect(() => canEquipItem({ slot: 'chest' }, { className: 'x', level: 1n })).not.toThrow();
    expect(() => canEquipItem({ slot: undefined as any }, { className: undefined as any, level: 1n })).not.toThrow();
  });
});

describe('isClassAllowed', () => {
  it('keeps its old behavior', () => {
    expect(isClassAllowed('', 'Warrior')).toBe(true);
    expect(isClassAllowed('   ', 'Warrior')).toBe(true);
    expect(isClassAllowed('warrior,mage', ' Mage ')).toBe(true);
    expect(isClassAllowed('warrior,mage', 'rogue')).toBe(false);
    expect(isClassAllowed('any', 'rogue')).toBe(true);
    expect(isClassAllowed(',,', 'rogue')).toBe(false);
  });

  it('helpers/character re-exports the same function', () => {
    expect(characterHelpers.isClassAllowed).toBe(isClassAllowed);
  });
});

describe('import pin', () => {
  it('item_usability imports only ./class_stats and ./mechanical_vocabulary', () => {
    expect(new Set(importSpecifiers('item_usability.ts'))).toEqual(
      new Set(['./class_stats', './mechanical_vocabulary']),
    );
  });
});
