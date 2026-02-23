import { SenderError } from 'spacetimedb/server';
import { Character } from '../schema/tables';
import { CLASS_ARMOR, normalizeClassName } from '../data/class_stats';
import { PREFIXES, SUFFIXES, AFFIX_COUNT_BY_QUALITY } from '../data/affix_catalog';
import { getWeaponSpeed } from '../data/combat_scaling';
import { DEFAULT_WEAPON_SPEED_MICROS, TWO_HANDED_WEAPON_TYPES } from '../data/combat_constants';
import { STARTER_WEAPON_DEFS } from '../data/item_defs';

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

/** Returns true if the given weaponType is a two-handed weapon. */
export function isTwoHandedWeapon(weaponType: string): boolean {
  return TWO_HANDED_WEAPON_TYPES.has(weaponType);
}

export function getWorldTier(level: bigint): number {
  if (level <= 10n) return 1;
  if (level <= 20n) return 2;
  if (level <= 30n) return 3;
  if (level <= 40n) return 4;
  return 5; // T5: L41-50
}

/** Backward-compatible alias for callers that used getMaxTierForLevel */
export function getMaxTierForLevel(level: bigint): number {
  return getWorldTier(level);
}

/**
 * Per-tier rarity probability weights for world drops.
 * Array order: [common%, uncommon%, rare%, epic%]
 * These are percentage thresholds (cumulative roll out of 100).
 * Tune these values to adjust the drop economy.
 */
export const TIER_RARITY_WEIGHTS: Record<number, [number, number, number, number]> = {
  1: [95, 5,  0,  0 ],  // T1 (L1-10):  95% common, 5% uncommon, 0% rare, 0% epic
  2: [60, 30, 9,  1 ],  // T2 (L11-20): 60% common, 30% uncommon, 9% rare, 1% epic
  3: [35, 35, 25, 5 ],  // T3 (L21-30): 35% common, 35% uncommon, 25% rare, 5% epic
  4: [20, 35, 35, 10],  // T4 (L31-40): 20% common, 35% uncommon, 35% rare, 10% epic
  5: [10, 20, 40, 30],  // T5 (L41-50): 10% common, 20% uncommon, 40% rare, 30% epic
};

/**
 * Per-tier quality probability weights for world drops (independent from rarity).
 * Array order: [standard%, reinforced%, exquisite%]
 * These are percentage thresholds (cumulative roll out of 100).
 * Tune these values to adjust quality distribution.
 */
export const TIER_QUALITY_WEIGHTS: Record<number, [number, number, number]> = {
  1: [100, 0,  0 ],  // T1: Standard only
  2: [80,  20, 0 ],  // T2: Standard dominant, Reinforced rare
  3: [55,  35, 10],  // T3: Standard common, Reinforced moderate, Exquisite rare
  4: [30,  50, 20],  // T4: Reinforced dominant, Exquisite attainable
  5: [15,  45, 40],  // T5: Exquisite primary aspirational, Reinforced baseline
};

/**
 * Determines the quality tier of a dropped item.
 *
 * T1 creatures (level 1-10): Uses TIER_RARITY_WEIGHTS[1] with level-scaled uncommon chance.
 *   uncommonChance = min(35, level*5 + dangerBonus)
 *   dangerBonus = max(0, floor((danger - 120) / 10))
 *
 * T2+ creatures: Uses TIER_RARITY_WEIGHTS per tier with danger bonus shift.
 *   dangerBonus shifts thresholds toward higher rarity (max +10% shift).
 */
export function rollQualityTier(creatureLevel: bigint, seedBase: bigint, dangerMultiplier?: bigint): string {
  const tier = getWorldTier(creatureLevel);
  const weights = TIER_RARITY_WEIGHTS[tier] ?? TIER_RARITY_WEIGHTS[1]!;
  const [wCommon, wUncommon, wRare] = weights;

  // Apply danger bonus: shifts thresholds toward higher rarity (max +10% shift)
  const dangerBonus = dangerMultiplier !== undefined
    ? Math.min(10, Math.max(0, Math.floor((Number(dangerMultiplier) - 120) / 15)))
    : 0;

  // T1 creatures: level-scaled uncommon chance instead of hard common cap
  if (tier === 1 && dangerMultiplier !== undefined) {
    const level = Number(creatureLevel);
    const levelPct = Math.min(30, level * 5); // L1=5%, L2=10% ... L6=30%
    const db = Number(dangerMultiplier) > 120 ? Math.floor((Number(dangerMultiplier) - 120) / 10) : 0;
    const uncommonChance = Math.min(35, levelPct + db);
    const uncommonRoll = Number((seedBase + 53n) % 100n);
    return uncommonRoll < uncommonChance ? 'uncommon' : 'common';
  }

  const roll = Number((seedBase + 53n) % 100n);
  const uncommonThreshold = wCommon - dangerBonus;
  const rareThreshold = uncommonThreshold + wUncommon;
  const epicThreshold = rareThreshold + wRare;

  if (roll < uncommonThreshold) return 'common';
  if (roll < rareThreshold) return 'uncommon';
  if (roll < epicThreshold) return 'rare';
  return 'epic';
}

/**
 * Rolls the quality (craftsmanship) axis for a world drop.
 * Quality is independent from rarity — a common item can be Reinforced.
 * Uses TIER_QUALITY_WEIGHTS keyed by enemy level band.
 */
export function rollQualityForDrop(creatureLevel: bigint, seedBase: bigint): string {
  const tier = getWorldTier(creatureLevel);
  const weights = TIER_QUALITY_WEIGHTS[tier] ?? TIER_QUALITY_WEIGHTS[1]!;
  const [wStandard, wReinforced] = weights;

  const roll = Number((seedBase + 67n) % 100n); // offset 67n avoids collision with rarity roll (53n)
  const reinforcedThreshold = wStandard;
  const exquisiteThreshold = wStandard + wReinforced;

  if (roll < reinforcedThreshold) return 'standard';
  if (roll < exquisiteThreshold) return 'reinforced';
  return 'exquisite';
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
      speed: getWeaponSpeed(template.weaponType),
    };
  }
  return { baseDamage: 0n, dps: 0n, name: '', weaponType: '', speed: DEFAULT_WEAPON_SPEED_MICROS };
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

  const SHIELD_CLASSES = new Set(['warrior', 'paladin', 'cleric', 'shaman']);
  if (SHIELD_CLASSES.has(normalizeClassName(character.className))) {
    // Don't grant shield if the class starter weapon is two-handed
    const weaponEntry = STARTER_WEAPONS[normalizeClassName(character.className)];
    const starterWeaponDef = weaponEntry ? STARTER_WEAPON_DEFS.find(w => w.name === weaponEntry.name) : null;
    if (!starterWeaponDef || !isTwoHandedWeapon(starterWeaponDef.weaponType)) {
      const shieldTemplate = findItemTemplateByName(ctx, 'Wooden Shield');
      if (shieldTemplate) {
        addItemToInventory(ctx, character.id, shieldTemplate.id, 1n);
      }
    }
  }
}
