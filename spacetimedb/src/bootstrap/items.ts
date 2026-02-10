import { tableHasRows } from './utils';

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

export const ensureStarterItemTemplates = (ctx: any) => {
  if (tableHasRows(ctx.db.itemTemplate.iter())) return;

  for (const [armorType, pieces] of Object.entries(STARTER_ARMOR)) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: pieces.chest.name,
      slot: 'chest',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.chest.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: pieces.legs.name,
      slot: 'legs',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.legs.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: pieces.boots.name,
      slot: 'boots',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.boots.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
  }

  const weaponTemplates: Record<string, { name: string; allowed: string }> = {
    'Training Sword': { name: 'Training Sword', allowed: 'warrior' },
    'Training Mace': { name: 'Training Mace', allowed: 'paladin,cleric' },
    'Training Staff': {
      name: 'Training Staff',
      allowed: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard',
    },
    'Training Bow': { name: 'Training Bow', allowed: 'ranger' },
    'Training Dagger': { name: 'Training Dagger', allowed: 'rogue' },
    'Training Axe': { name: 'Training Axe', allowed: 'beastmaster' },
    'Training Blade': { name: 'Training Blade', allowed: 'spellblade,reaver' },
    'Training Rapier': { name: 'Training Rapier', allowed: 'bard' },
  };

  for (const weapon of Object.values(weaponTemplates)) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: weapon.name,
      slot: 'mainHand',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
      requiredLevel: 1n,
      allowedClasses: weapon.allowed,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 4n,
      weaponDps: 6n,
    });
  }

  const accessoryTemplates = [
    { name: 'Rough Band', slot: 'earrings', rarity: 'common', stat: { dexBonus: 1n } },
    { name: 'Worn Cloak', slot: 'cloak', rarity: 'common', stat: { hpBonus: 3n } },
    { name: 'Traveler Necklace', slot: 'neck', rarity: 'common', stat: { wisBonus: 1n } },
    { name: 'Glimmer Ring', slot: 'earrings', rarity: 'uncommon', stat: { intBonus: 1n } },
    { name: 'Shaded Cloak', slot: 'cloak', rarity: 'uncommon', stat: { dexBonus: 1n } },
  ];

  for (const template of accessoryTemplates) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: template.name,
      slot: template.slot,
      armorType: 'none',
      rarity: template.rarity,
      tier: 1n,
      isJunk: false,
      vendorValue: template.rarity === 'uncommon' ? 8n : 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: template.stat.strBonus ?? 0n,
      dexBonus: template.stat.dexBonus ?? 0n,
      chaBonus: template.stat.chaBonus ?? 0n,
      wisBonus: template.stat.wisBonus ?? 0n,
      intBonus: template.stat.intBonus ?? 0n,
      hpBonus: template.stat.hpBonus ?? 0n,
      manaBonus: template.stat.manaBonus ?? 0n,
      armorClassBonus: template.stat.armorClassBonus ?? 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
  }

  const junkItems = [
    { name: 'Rat Tail', value: 1n },
    { name: 'Torn Pelt', value: 2n },
    { name: 'Cracked Fang', value: 1n },
    { name: 'Ashen Bone', value: 3n },
  ];
  for (const item of junkItems) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: item.name,
      slot: 'junk',
      armorType: 'junk',
      rarity: 'common',
      tier: 1n,
      isJunk: true,
      vendorValue: item.value,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
    });
  }
};
