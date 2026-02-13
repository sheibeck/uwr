import { SenderError } from 'spacetimedb/server';
import { Character } from '../schema/tables';
import { CLASS_ARMOR, normalizeClassName } from '../data/class_stats';

export const EQUIPMENT_SLOTS = new Set([
  'head',
  'chest',
  'wrists',
  'hands',
  'belt',
  'legs',
  'boots',
  'earrings',
  'neck',
  'cloak',
  'mainHand',
  'offHand',
]);

export const STARTER_ARMOR: Record<
  string,
  { chest: { name: string; ac: bigint }; legs: { name: string; ac: bigint }; boots: { name: string; ac: bigint } }
> = {
  cloth: {
    chest: { name: 'Apprentice Robe', ac: 3n },
    legs: { name: 'Apprentice Trousers', ac: 2n },
    boots: { name: 'Apprentice Boots', ac: 1n },
  },
  leather: {
    chest: { name: 'Scout Jerkin', ac: 4n },
    legs: { name: 'Scout Pants', ac: 3n },
    boots: { name: 'Scout Boots', ac: 2n },
  },
  chain: {
    chest: { name: 'Warden Hauberk', ac: 5n },
    legs: { name: 'Warden Greaves', ac: 4n },
    boots: { name: 'Warden Boots', ac: 3n },
  },
  plate: {
    chest: { name: 'Vanguard Cuirass', ac: 6n },
    legs: { name: 'Vanguard Greaves', ac: 5n },
    boots: { name: 'Vanguard Boots', ac: 4n },
  },
};

export const STARTER_WEAPONS: Record<string, { name: string; slot: string }> = {
  warrior: { name: 'Training Sword', slot: 'mainHand' },
  paladin: { name: 'Training Mace', slot: 'mainHand' },
  cleric: { name: 'Training Mace', slot: 'mainHand' },
  shaman: { name: 'Training Staff', slot: 'mainHand' },
  druid: { name: 'Training Staff', slot: 'mainHand' },
  ranger: { name: 'Training Bow', slot: 'mainHand' },
  rogue: { name: 'Training Dagger', slot: 'mainHand' },
  monk: { name: 'Training Staff', slot: 'mainHand' },
  beastmaster: { name: 'Training Axe', slot: 'mainHand' },
  spellblade: { name: 'Training Blade', slot: 'mainHand' },
  reaver: { name: 'Training Blade', slot: 'mainHand' },
  bard: { name: 'Training Rapier', slot: 'mainHand' },
  enchanter: { name: 'Training Staff', slot: 'mainHand' },
  necromancer: { name: 'Training Staff', slot: 'mainHand' },
  summoner: { name: 'Training Staff', slot: 'mainHand' },
  wizard: { name: 'Training Staff', slot: 'mainHand' },
};

export function getEquippedBonuses(ctx: any, characterId: bigint) {
  const bonuses = {
    str: 0n,
    dex: 0n,
    cha: 0n,
    wis: 0n,
    int: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
  };
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (!instance.equippedSlot) continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    bonuses.str += template.strBonus;
    bonuses.dex += template.dexBonus;
    bonuses.cha += template.chaBonus;
    bonuses.wis += template.wisBonus;
    bonuses.int += template.intBonus;
    bonuses.hpBonus += template.hpBonus;
    bonuses.manaBonus += template.manaBonus;
    bonuses.armorClassBonus += template.armorClassBonus;
  }
  return bonuses;
}

export function getEquippedWeaponStats(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'mainHand') continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    return {
      baseDamage: template.weaponBaseDamage,
      dps: template.weaponDps,
      name: template.name,
      weaponType: template.weaponType,
    };
  }
  return { baseDamage: 0n, dps: 0n, name: '', weaponType: '' };
}

export function findItemTemplateByName(ctx: any, name: string) {
  for (const row of ctx.db.itemTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
}

export function getItemCount(ctx: any, characterId: bigint, templateId: bigint): bigint {
  let count = 0n;
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.templateId !== templateId || instance.equippedSlot) continue;
    count += instance.quantity ?? 1n;
  }
  return count;
}

export function addItemToInventory(
  ctx: any,
  characterId: bigint,
  templateId: bigint,
  quantity: bigint
): void {
  const template = ctx.db.itemTemplate.id.find(templateId);
  if (!template) throw new SenderError('Item template missing');
  const stackable = template.stackable ?? false;
  if (stackable) {
    const existing = [...ctx.db.itemInstance.by_owner.filter(characterId)].find(
      (row) => row.templateId === templateId && !row.equippedSlot
    );
    if (existing) {
      ctx.db.itemInstance.id.update({
        ...existing,
        quantity: (existing.quantity ?? 1n) + quantity,
      });
      return;
    }
  }
  ctx.db.itemInstance.insert({
    id: 0n,
    templateId,
    ownerCharacterId: characterId,
    equippedSlot: undefined,
    quantity,
  });
}

export const MAX_INVENTORY_SLOTS = 20;

export function getInventorySlotCount(ctx: any, characterId: bigint) {
  return [...ctx.db.itemInstance.by_owner.filter(characterId)].filter((row) => !row.equippedSlot)
    .length;
}

export function hasInventorySpace(ctx: any, characterId: bigint, templateId: bigint) {
  const template = ctx.db.itemTemplate.id.find(templateId);
  if (!template) return false;
  if (template.stackable) {
    const existing = [...ctx.db.itemInstance.by_owner.filter(characterId)].find(
      (row) => row.templateId === templateId && !row.equippedSlot
    );
    if (existing) return true;
  }
  return getInventorySlotCount(ctx, characterId) < MAX_INVENTORY_SLOTS;
}

export function removeItemFromInventory(
  ctx: any,
  characterId: bigint,
  templateId: bigint,
  quantity: bigint
): void {
  let remaining = quantity;
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.templateId !== templateId || instance.equippedSlot) continue;
    const current = instance.quantity ?? 1n;
    if (current > remaining) {
      ctx.db.itemInstance.id.update({ ...instance, quantity: current - remaining });
      return;
    }
    remaining -= current;
    ctx.db.itemInstance.id.delete(instance.id);
    if (remaining === 0n) return;
  }
  if (remaining > 0n) throw new SenderError('Not enough materials');
}

export function grantStarterItems(ctx: any, character: any, ensureStarterItemTemplates: (ctx: any) => void) {
  ensureStarterItemTemplates(ctx);
  const armorType = CLASS_ARMOR[normalizeClassName(character.className)]?.[0] ?? 'cloth';
  const armorSet = STARTER_ARMOR[armorType] ?? STARTER_ARMOR.cloth;
  const weapon = STARTER_WEAPONS[normalizeClassName(character.className)] ?? {
    name: 'Training Staff',
    slot: 'mainHand',
  };

  const armorNames = [armorSet.chest.name, armorSet.legs.name, armorSet.boots.name];
  for (const name of armorNames) {
    const template = findItemTemplateByName(ctx, name);
    if (!template) continue;
    addItemToInventory(ctx, character.id, template.id, 1n);
  }

  const weaponTemplate = findItemTemplateByName(ctx, weapon.name);
  if (weaponTemplate) {
    addItemToInventory(ctx, character.id, weaponTemplate.id, 1n);
  }
}
