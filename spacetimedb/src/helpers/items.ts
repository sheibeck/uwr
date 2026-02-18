import { SenderError } from 'spacetimedb/server';
import { Character } from '../schema/tables';
import { CLASS_ARMOR, normalizeClassName } from '../data/class_stats';
import { PREFIXES, SUFFIXES, AFFIX_COUNT_BY_QUALITY } from '../data/affix_catalog';

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
    chest: { name: 'Apprentice Robe', ac: 2n },
    legs: { name: 'Apprentice Trousers', ac: 1n },
    boots: { name: 'Apprentice Boots', ac: 1n },
  },
  leather: {
    chest: { name: 'Scout Jerkin', ac: 3n },
    legs: { name: 'Scout Pants', ac: 2n },
    boots: { name: 'Scout Boots', ac: 2n },
  },
  chain: {
    chest: { name: 'Warden Hauberk', ac: 4n },
    legs: { name: 'Warden Greaves', ac: 3n },
    boots: { name: 'Warden Boots', ac: 2n },
  },
  plate: {
    chest: { name: 'Vanguard Cuirass', ac: 5n },
    legs: { name: 'Vanguard Greaves', ac: 4n },
    boots: { name: 'Vanguard Boots', ac: 3n },
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

export function getMaxTierForLevel(level: bigint): number {
  if (level <= 10n) return 1;
  if (level <= 20n) return 2;
  if (level <= 30n) return 3;
  return 4;
}

export function rollQualityTier(creatureLevel: bigint, seedBase: bigint, dangerMultiplier?: bigint): string {
  const maxTier = getMaxTierForLevel(creatureLevel);

  if (dangerMultiplier !== undefined) {
    // Danger-based tier selection
    const danger = Number(dangerMultiplier);
    let baseTierNum: number;
    if (danger <= 120) baseTierNum = 1;        // common
    else if (danger <= 170) baseTierNum = 2;   // uncommon
    else if (danger <= 250) baseTierNum = 3;   // rare
    else if (danger <= 400) baseTierNum = 4;   // epic
    else baseTierNum = 4;                       // cap at epic (legendaries are named only)

    // 12% tier-up chance, capped at epic
    const tierUpRoll = Number((seedBase + 47n) % 100n);
    if (tierUpRoll < 12 && baseTierNum < 4) baseTierNum += 1;

    // Respect creature level cap
    if (baseTierNum > maxTier) baseTierNum = maxTier;

    const tierNames = ['common', 'uncommon', 'rare', 'epic'];
    return tierNames[baseTierNum - 1] ?? 'common';
  }

  // Fallback: level-based logic (backward compatible for create_test_item)
  const roll = Number((seedBase + 31n) % 100n);
  if (maxTier === 1) {
    const uncommonThreshold = Math.min(25, Number(creatureLevel) * 2);
    return roll < uncommonThreshold ? 'uncommon' : 'common';
  }
  if (maxTier === 2) {
    if (roll < 10) return 'rare';
    if (roll < 40) return 'uncommon';
    return 'common';
  }
  if (maxTier === 3) {
    if (roll < 5) return 'epic';
    if (roll < 20) return 'rare';
    if (roll < 50) return 'uncommon';
    return 'common';
  }
  // maxTier >= 4
  if (roll < 3) return 'epic';
  if (roll < 15) return 'rare';
  if (roll < 45) return 'uncommon';
  return 'common';
}

export function generateAffixData(
  slot: string,
  qualityTier: string,
  seedBase: bigint
): { affixKey: string; affixType: string; magnitude: bigint; statKey: string; affixName: string }[] {
  const tierMap: Record<string, number> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  };
  const tierNum = tierMap[qualityTier] ?? 0;
  const affixCount = AFFIX_COUNT_BY_QUALITY[qualityTier] ?? 0;
  if (affixCount === 0) return [];

  const eligiblePrefixes = PREFIXES.filter(
    (a) => a.slots.includes(slot) && a.minTier <= tierNum
  );
  const eligibleSuffixes = SUFFIXES.filter(
    (a) => a.slots.includes(slot) && a.minTier <= tierNum
  );

  const makeAffix = (def: typeof PREFIXES[number]) => ({
    affixKey: def.key,
    affixType: def.type,
    magnitude: def.magnitudeByTier[tierNum - 1] ?? 0n,
    statKey: def.statKey,
    affixName: def.name,
  });

  const result: ReturnType<typeof makeAffix>[] = [];

  if (affixCount >= 1) {
    // Pick one prefix
    if (eligiblePrefixes.length > 0) {
      const idx = Number((seedBase + 37n) % BigInt(eligiblePrefixes.length));
      result.push(makeAffix(eligiblePrefixes[idx]!));
    }
  }

  if (affixCount >= 2) {
    // Pick one suffix
    if (eligibleSuffixes.length > 0) {
      const idx = Number((seedBase + 41n) % BigInt(eligibleSuffixes.length));
      result.push(makeAffix(eligibleSuffixes[idx]!));
    }
  }

  if (affixCount >= 3) {
    // Pick a second prefix or suffix (excluding already-chosen keys)
    const usedKeys = new Set(result.map((r) => r.affixKey));
    const remainingPrefixes = eligiblePrefixes.filter((a) => !usedKeys.has(a.key));
    const remainingSuffixes = eligibleSuffixes.filter((a) => !usedKeys.has(a.key));
    const combinedPool = [...remainingPrefixes, ...remainingSuffixes];
    if (combinedPool.length > 0) {
      const idx = Number((seedBase + 43n) % BigInt(combinedPool.length));
      result.push(makeAffix(combinedPool[idx]!));
    }
  }

  // Rare items: cap total affix magnitude at 4 (matches crafted reinforced: 2 slots × 2n each = 4n total)
  if (qualityTier === 'rare') {
    let remaining = 4n;
    const capped: typeof result = [];
    for (const affix of result) {
      if (remaining <= 0n) break;
      const cappedMagnitude = affix.magnitude < remaining ? affix.magnitude : remaining;
      if (cappedMagnitude > 0n) {
        capped.push({ ...affix, magnitude: cappedMagnitude });
        remaining -= cappedMagnitude;
      }
    }
    return capped;
  }

  return result;
}

export function buildDisplayName(
  baseItemName: string,
  affixes: { affixType: string; affixName: string }[]
): string {
  const prefix = affixes.find((a) => a.affixType === 'prefix')?.affixName;
  const suffix = affixes.find((a) => a.affixType === 'suffix')?.affixName;
  return [prefix, baseItemName, suffix].filter(Boolean).join(' ');
}

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
    magicResistanceBonus: 0n,
    lifeOnHit: 0n,
    cooldownReduction: 0n,
    manaRegen: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
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
    bonuses.magicResistanceBonus += template.magicResistanceBonus;

    // Sum affix bonuses for this equipped item
    for (const affix of ctx.db.itemAffix.by_instance.filter(instance.id)) {
      const key = affix.statKey;
      if (key === 'strBonus') bonuses.str += affix.magnitude;
      else if (key === 'dexBonus') bonuses.dex += affix.magnitude;
      else if (key === 'intBonus') bonuses.int += affix.magnitude;
      else if (key === 'wisBonus') bonuses.wis += affix.magnitude;
      else if (key === 'chaBonus') bonuses.cha += affix.magnitude;
      else if (key === 'hpBonus') bonuses.hpBonus += affix.magnitude;
      else if (key === 'manaBonus') bonuses.manaBonus += affix.magnitude;
      else if (key === 'armorClassBonus') bonuses.armorClassBonus += affix.magnitude;
      else if (key === 'magicResistanceBonus') bonuses.magicResistanceBonus += affix.magnitude;
      else if (key === 'lifeOnHit') bonuses.lifeOnHit += affix.magnitude;
      else if (key === 'cooldownReduction') bonuses.cooldownReduction += affix.magnitude;
      else if (key === 'manaRegen') bonuses.manaRegen += affix.magnitude;
      else if (key === 'weaponBaseDamage') bonuses.weaponBaseDamage += affix.magnitude;
      else if (key === 'weaponDps') bonuses.weaponDps += affix.magnitude;
    }
  }
  return bonuses;
}

export function getEquippedWeaponStats(ctx: any, characterId: bigint) {
  for (const instance of ctx.db.itemInstance.by_owner.filter(characterId)) {
    if (instance.equippedSlot !== 'mainHand') continue;
    const template = ctx.db.itemTemplate.id.find(instance.templateId);
    if (!template) continue;
    // Sum weapon affix bonuses (includes craft quality implicit affixes)
    let bonusDamage = 0n;
    let bonusDps = 0n;
    for (const affix of ctx.db.itemAffix.by_instance.filter(instance.id)) {
      if (affix.statKey === 'weaponBaseDamage') bonusDamage += affix.magnitude;
      else if (affix.statKey === 'weaponDps') bonusDps += affix.magnitude;
    }
    return {
      baseDamage: template.weaponBaseDamage + bonusDamage,
      dps: template.weaponDps + bonusDps,
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

export const MAX_INVENTORY_SLOTS = 50;

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
