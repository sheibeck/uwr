// Equip rule: one function for equip_item, the inventory inspector's Equip reason and the
// vendor's "Usable by you" filter, so the screen and the server can never disagree about who
// may wear or wield an item. Level is information, not a rule (world-tier design: gear
// availability is world-driven, so the server does not gate equipping on level); canEquipItem
// reports a shortfall as `levelShort` only so a screen can show it.
// Imports only ./class_stats and ./mechanical_vocabulary so the client can reach it through
// @game-data. Browser-safe, ES2020 only, never throws.
import { normalizeClassName } from './class_stats';
import { EQUIPMENT_SLOTS } from './mechanical_vocabulary';

/** Class gate: empty or 'any' allows everyone, otherwise the normalized class must be listed. */
export function isClassAllowed(allowedClasses: string, className: string) {
  if (!allowedClasses || allowedClasses.trim().length === 0) return true;
  const normalized = normalizeClassName(className);
  const allowed = allowedClasses
    .split(',')
    .map((entry) => normalizeClassName(entry))
    .filter((entry) => entry.length > 0);
  if (allowed.includes('any')) return true;
  return allowed.includes(normalized);
}

export interface EquipTemplateLike {
  slot: string;
  stackable?: boolean | null;
  weaponType?: string | null;
  armorType?: string | null;
  allowedClasses?: string | null;
  requiredLevel?: bigint | null;
}

export interface EquipCharacterLike {
  className: string;
  level: bigint;
  weaponProficiencies?: string | null;
  armorProficiencies?: string | null;
}

export type EquipCheck =
  | { ok: true; levelShort: boolean; requiredLevel: bigint }
  | {
      ok: false;
      reason: 'stackable' | 'weapon' | 'armor' | 'legacyWeapon' | 'legacyClass' | 'slot';
      message: string;
      levelShort: boolean;
      requiredLevel: bigint;
    };

const WEAPON_SLOTS: readonly string[] = ['mainHand', 'offHand'];
const ARMOR_SLOTS: readonly string[] = ['head', 'chest', 'legs', 'boots', 'hands', 'wrists', 'belt'];

/**
 * The equip_item checks in the server's order: stackable, weapon proficiency, armor proficiency
 * (characters with a dynamic proficiency list), or the legacy class list (characters with
 * neither), then the slot. The proficiency lists are comma-separated and compared without
 * trimming, exactly as the server always has.
 */
export function canEquipItem(template: EquipTemplateLike, character: EquipCharacterLike): EquipCheck {
  const slot = typeof template.slot === 'string' ? template.slot : '';
  const requiredLevel = typeof template.requiredLevel === 'bigint' ? template.requiredLevel : 0n;
  const levelShort = typeof character.level === 'bigint' && requiredLevel > character.level;

  const refuse = (
    reason: 'stackable' | 'weapon' | 'armor' | 'legacyWeapon' | 'legacyClass' | 'slot',
    message: string,
  ): EquipCheck => ({ ok: false, reason, message, levelShort, requiredLevel });

  if (template.stackable) return refuse('stackable', 'Cannot equip this item');

  const weaponProf = typeof character.weaponProficiencies === 'string' ? character.weaponProficiencies : '';
  const armorProf = typeof character.armorProficiencies === 'string' ? character.armorProficiencies : '';
  const weaponType = typeof template.weaponType === 'string' ? template.weaponType : '';
  const armorType = typeof template.armorType === 'string' ? template.armorType : '';
  const isWeaponSlot = WEAPON_SLOTS.indexOf(slot) !== -1;

  if (weaponProf || armorProf) {
    if (isWeaponSlot && weaponProf && weaponType) {
      if (weaponProf.split(',').indexOf(weaponType) === -1) {
        return refuse('weapon', 'Your class cannot wield this weapon type');
      }
    }
    const isArmorSlot = ARMOR_SLOTS.indexOf(slot) !== -1;
    if (isArmorSlot && armorProf && armorType) {
      if (armorProf.split(',').indexOf(armorType) === -1) {
        return refuse('armor', 'Your class cannot wear this armor type');
      }
    }
  } else {
    const allowedClasses = typeof template.allowedClasses === 'string' ? template.allowedClasses : '';
    const className = typeof character.className === 'string' ? character.className : '';
    if (!isClassAllowed(allowedClasses, className)) {
      return isWeaponSlot
        ? refuse('legacyWeapon', 'Weapon type not allowed for this class')
        : refuse('legacyClass', 'Class cannot use this item');
    }
  }

  if ((EQUIPMENT_SLOTS as readonly string[]).indexOf(slot) === -1) return refuse('slot', 'Invalid slot');

  return { ok: true, levelShort, requiredLevel };
}
