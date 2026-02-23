// item_defs.ts
// All item data constants extracted from ensure_items.ts.
// Adding a new item requires editing only this file (or crafting_materials.ts for consumables).
// ensure_items.ts imports from here and loops — no inline data there.

// ---------------------------------------------------------------------------
// ARMOR CLASS RESTRICTIONS
// ---------------------------------------------------------------------------

export const ARMOR_ALLOWED_CLASSES: Record<string, string> = {
  plate: 'warrior,paladin,bard,cleric',
  chain: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
  leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
  cloth: 'any',
};

// ---------------------------------------------------------------------------
// STARTER ARMOR DESCRIPTIONS
// ---------------------------------------------------------------------------

export const STARTER_ARMOR_DESCS: Record<string, string> = {
  cloth: 'Threadbare cloth garments offering minimal protection. Standard issue for new adventurers.',
  leather: 'Scuffed leather armor worn thin by previous owners. Better than nothing.',
  chain: 'Dented chain mail that still turns a blade. Issued to melee recruits.',
  plate: 'Battered plate armor, dented but functional. Heavy protection for frontline fighters.',
};

// ---------------------------------------------------------------------------
// STARTER WEAPONS
// ---------------------------------------------------------------------------

export interface StarterWeaponDef {
  name: string;
  allowed: string;
  weaponType: string;
  description: string;
}

export const STARTER_WEAPON_DEFS: StarterWeaponDef[] = [
  { name: 'Training Sword', allowed: 'warrior', weaponType: 'sword', description: 'A blunt practice sword. Barely adequate for real combat.' },
  { name: 'Training Mace', allowed: 'paladin,cleric', weaponType: 'mace', description: 'A weighted training mace. Clumsy but functional.' },
  { name: 'Training Staff', allowed: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard', weaponType: 'staff', description: 'A worn wooden staff. Channels magic adequately for beginners.' },
  { name: 'Training Bow', allowed: 'ranger', weaponType: 'bow', description: 'A simple shortbow with fraying string. Accurate enough at short range.' },
  { name: 'Training Dagger', allowed: 'rogue', weaponType: 'dagger', description: 'A dull practice dagger. Quick in the right hands.' },
  { name: 'Training Axe', allowed: 'beastmaster', weaponType: 'axe', description: 'A notched training axe. Heavy enough to do damage.' },
  { name: 'Training Blade', allowed: 'spellblade,reaver', weaponType: 'blade', description: 'A thin practice blade balanced for dual-discipline fighting.' },
  { name: 'Training Rapier', allowed: 'bard', weaponType: 'rapier', description: 'A flexible practice rapier. Light and swift.' },
];

// ---------------------------------------------------------------------------
// STARTER ACCESSORIES
// ---------------------------------------------------------------------------

type StatKey = 'strBonus' | 'dexBonus' | 'chaBonus' | 'wisBonus' | 'intBonus' | 'hpBonus' | 'manaBonus';

export interface StarterAccessoryDef {
  name: string;
  slot: string;
  rarity: string;
  stat: Partial<Record<StatKey, bigint>>;
  description: string;
}

export const STARTER_ACCESSORY_DEFS: StarterAccessoryDef[] = [
  { name: 'Rough Band', slot: 'earrings', rarity: 'common', stat: { dexBonus: 1n }, description: 'A crude copper ring. Mildly enhances agility.' },
  { name: 'Worn Cloak', slot: 'cloak', rarity: 'common', stat: { hpBonus: 3n }, description: 'A tattered traveling cloak. Provides slight warmth and protection.' },
  { name: 'Traveler Necklace', slot: 'neck', rarity: 'common', stat: { wisBonus: 1n }, description: 'A simple cord with a polished stone. Said to bring wisdom.' },
  { name: 'Glimmer Ring', slot: 'earrings', rarity: 'uncommon', stat: { intBonus: 1n }, description: 'A ring set with a tiny glowing crystal. Faintly enhances focus.' },
  { name: 'Shaded Cloak', slot: 'cloak', rarity: 'uncommon', stat: { dexBonus: 1n }, description: 'A dark hooded cloak favored by scouts. Improves nimbleness.' },
];

// ---------------------------------------------------------------------------
// JUNK ITEMS
// ---------------------------------------------------------------------------

export interface JunkDef {
  name: string;
  vendorValue: bigint;
  description: string;
}

export const JUNK_DEFS: JunkDef[] = [
  { name: 'Rat Tail', vendorValue: 1n, description: 'A scaly rat tail. Worthless except to a vendor.' },
  { name: 'Torn Pelt', vendorValue: 2n, description: 'A ragged piece of animal skin. Too damaged for leatherworking.' },
  { name: 'Cracked Fang', vendorValue: 1n, description: 'A broken tooth from some creature. Might fetch a coin or two.' },
  { name: 'Ashen Bone', vendorValue: 2n, description: 'A charred bone fragment. Only a vendor would want this.' },
];

// ---------------------------------------------------------------------------
// RESOURCE ITEMS
// ---------------------------------------------------------------------------

export interface ResourceDef {
  name: string;
  slot: string;
  vendorValue: bigint;
  description: string;
}

export const RESOURCE_DEFS: ResourceDef[] = [
  { name: 'Flax', slot: 'resource', vendorValue: 1n, description: 'Long fibrous stalks used to weave cloth and rope.' },
  { name: 'Herbs', slot: 'resource', vendorValue: 1n, description: 'Common medicinal plants gathered from wild growth.' },
  { name: 'Wood', slot: 'resource', vendorValue: 1n, description: 'Rough-cut timber suitable for torches and simple tools.' },
  { name: 'Resin', slot: 'resource', vendorValue: 1n, description: 'Sticky tree sap that serves as a natural adhesive and fuel.' },
  { name: 'Stone', slot: 'resource', vendorValue: 1n, description: 'A chunk of sturdy rock used for grinding and sharpening.' },
  { name: 'Raw Meat', slot: 'resource', vendorValue: 1n, description: 'Uncooked animal flesh. Cook it before eating or it may cause illness.' },
  { name: 'Salt', slot: 'resource', vendorValue: 1n, description: 'Coarse mineral salt used to preserve food and season rations.' },
  { name: 'Clear Water', slot: 'resource', vendorValue: 1n, description: 'Fresh water drawn from a clean spring.' },
  { name: 'Sand', slot: 'resource', vendorValue: 1n, description: 'Fine-grained sand useful for polishing and abrasion.' },
  { name: 'Dry Grass', slot: 'resource', vendorValue: 1n, description: 'Brittle dried grass that catches fire easily.' },
  { name: 'Bitter Herbs', slot: 'resource', vendorValue: 1n, description: 'Pungent wild herbs with toxic properties. Handle with care.' },
  { name: 'Peat', slot: 'resource', vendorValue: 1n, description: 'Dense organic soil that burns slowly. Used in crude fire-starting.' },
  { name: 'Mushrooms', slot: 'resource', vendorValue: 1n, description: 'Earthy fungi foraged from damp places.' },
  { name: 'Murky Water', slot: 'resource', vendorValue: 1n, description: 'Brackish water from a stagnant source. Not fit for drinking as-is.' },
  { name: 'Iron Shard', slot: 'resource', vendorValue: 2n, description: 'A small fragment of rusted iron. Retains enough metal for minor crafting.' },
  { name: 'Ancient Dust', slot: 'resource', vendorValue: 2n, description: 'Fine powder sifted from old ruins. Carries faint traces of enchantment.' },
  { name: 'Scrap Cloth', slot: 'resource', vendorValue: 1n, description: 'Torn fabric scraps salvaged from the wilds.' },
  { name: 'Lamp Oil', slot: 'resource', vendorValue: 1n, description: 'Rendered animal fat that burns cleanly in lanterns.' },
  { name: 'Wild Berries', slot: 'resource', vendorValue: 1n, description: 'Tart wild berries picked from roadside bushes. Edible raw or cooked.' },
  { name: 'Root Vegetable', slot: 'resource', vendorValue: 1n, description: 'A starchy tuber dug from soft earth. Filling when roasted.' },
];

// ---------------------------------------------------------------------------
// WORLD DROP GEAR AND JEWELRY
// ---------------------------------------------------------------------------

export interface WorldDropItemDef {
  name: string;
  slot: string;
  armorType: string;
  rarity: string;
  tier: bigint;
  requiredLevel: bigint;
  vendorValue: bigint;
  allowedClasses: string;
  armorClassBonus?: bigint;
  weaponType?: string;
  weaponBaseDamage?: bigint;
  weaponDps?: bigint;
  strBonus?: bigint;
  dexBonus?: bigint;
  chaBonus?: bigint;
  wisBonus?: bigint;
  intBonus?: bigint;
  hpBonus?: bigint;
  manaBonus?: bigint;
  description: string;
}

export const WORLD_DROP_GEAR_DEFS: WorldDropItemDef[] = [
  // Tier 1 weapons (requiredLevel: 1n) — damage scaled inversely with weapon speed
  { name: 'Iron Shortsword', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,spellblade,reaver', weaponType: 'sword', weaponBaseDamage: 4n, weaponDps: 6n, description: 'A serviceable iron blade. Reliable in close quarters.' },
  { name: 'Hunting Bow', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'ranger', weaponType: 'bow', weaponBaseDamage: 4n, weaponDps: 5n, description: 'A sturdy bow designed for woodland game. Pulls smoothly.' },
  { name: 'Gnarled Staff', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard', weaponType: 'staff', weaponBaseDamage: 4n, weaponDps: 5n, description: 'A twisted wooden staff thrumming with latent energy.' },
  { name: 'Worn Mace', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'paladin,cleric', weaponType: 'mace', weaponBaseDamage: 4n, weaponDps: 6n, description: 'A heavy flanged mace showing signs of hard use.' },
  { name: 'Rusty Axe', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'beastmaster', weaponType: 'axe', weaponBaseDamage: 5n, weaponDps: 8n, description: 'A broad axe dulled by rust but still fearsome.' },
  { name: 'Notched Rapier', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'bard', weaponType: 'rapier', weaponBaseDamage: 3n, weaponDps: 5n, description: 'A slender rapier with a chipped edge. Fast and precise.' },
  { name: 'Chipped Dagger', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'rogue', weaponType: 'dagger', weaponBaseDamage: 3n, weaponDps: 5n, description: 'A small blade with a nicked edge. Quick draw, quick strike.' },
  { name: 'Cracked Blade', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'spellblade,reaver', weaponType: 'blade', weaponBaseDamage: 4n, weaponDps: 6n, description: 'A fractured sword that channels both steel and sorcery.' },

  // Tier 2 weapons (requiredLevel: 11n) — damage scaled inversely with weapon speed
  { name: 'Steel Longsword', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,spellblade,reaver', weaponType: 'sword', weaponBaseDamage: 5n, weaponDps: 7n, description: 'Forged steel with a keen edge. A significant upgrade over iron.' },
  { name: 'Yew Bow', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'ranger', weaponType: 'bow', weaponBaseDamage: 5n, weaponDps: 6n, description: 'A flexible yew bow with superior range and draw weight.' },
  { name: 'Oak Staff', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard', weaponType: 'staff', weaponBaseDamage: 5n, weaponDps: 6n, description: 'A dense oak staff carved with faint runes.' },

  // Tier 1 armor — cloth
  { name: 'Worn Robe', slot: 'chest', armorType: 'cloth', rarity: 'common', tier: 1n, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 3n, description: 'A faded cloth robe. Offers little physical protection.' },
  { name: 'Worn Trousers', slot: 'legs', armorType: 'cloth', rarity: 'common', tier: 1n, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'Patched cloth leggings. Light and breathable.' },
  { name: 'Worn Slippers', slot: 'boots', armorType: 'cloth', rarity: 'common', tier: 1n, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'Thin-soled cloth shoes. Quiet on stone floors.' },

  // Tier 1 armor — leather
  { name: 'Scuffed Jerkin', slot: 'chest', armorType: 'leather', rarity: 'common', tier: 1n, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 4n, description: 'A leather vest scarred by use. Decent protection for light fighters.' },
  { name: 'Scuffed Leggings', slot: 'legs', armorType: 'leather', rarity: 'common', tier: 1n, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'Leather leggings with reinforced knees.' },
  { name: 'Scuffed Boots', slot: 'boots', armorType: 'leather', rarity: 'common', tier: 1n, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'Sturdy leather boots built for rough terrain.' },

  // Tier 1 armor — chain
  { name: 'Dented Hauberk', slot: 'chest', armorType: 'chain', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 5n, description: 'Chain mail with bent links. Still deflects slashing blows.' },
  { name: 'Dented Greaves', slot: 'legs', armorType: 'chain', rarity: 'common', tier: 1n, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 4n, description: 'Chain leggings with dented rings. Functional leg protection.' },
  { name: 'Dented Sabatons', slot: 'boots', armorType: 'chain', rarity: 'common', tier: 1n, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'Chain boots that clank with every step.' },

  // Tier 1 armor — plate
  { name: 'Battered Cuirass', slot: 'chest', armorType: 'plate', rarity: 'common', tier: 1n, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 6n, description: 'Heavy plate chest armor, dented but intact.' },
  { name: 'Battered Greaves', slot: 'legs', armorType: 'plate', rarity: 'common', tier: 1n, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 5n, description: 'Plate leg guards battered from many battles.' },
  { name: 'Battered Boots', slot: 'boots', armorType: 'plate', rarity: 'common', tier: 1n, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'Thick plate boots that absorb heavy impacts.' },

  // Tier 2 armor — cloth chest/legs/boots
  { name: 'Silken Robe', slot: 'chest', armorType: 'cloth', rarity: 'common', tier: 2n, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'any', armorClassBonus: 4n, description: 'Fine silk woven for comfort and moderate protection.' },
  { name: 'Silken Trousers', slot: 'legs', armorType: 'cloth', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'any', armorClassBonus: 3n, description: 'Light silk leggings tailored for mobility.' },
  { name: 'Silken Slippers', slot: 'boots', armorType: 'cloth', rarity: 'common', tier: 2n, vendorValue: 10n, requiredLevel: 11n, allowedClasses: 'any', armorClassBonus: 3n, description: 'Soft silk shoes that barely make a sound.' },

  // Tier 2 armor — leather chest/legs/boots
  { name: 'Ranger Jerkin', slot: 'chest', armorType: 'leather', rarity: 'common', tier: 2n, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 5n, description: 'Supple leather armor favored by woodsmen.' },
  { name: 'Ranger Leggings', slot: 'legs', armorType: 'leather', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 4n, description: 'Reinforced leather leggings for wilderness travel.' },
  { name: 'Ranger Boots', slot: 'boots', armorType: 'leather', rarity: 'common', tier: 2n, vendorValue: 10n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 4n, description: 'Leather boots with thick soles for rough trails.' },

  // Tier 2 armor — chain chest/legs/boots
  { name: 'Riveted Hauberk', slot: 'chest', armorType: 'chain', rarity: 'common', tier: 2n, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 6n, description: 'Chain mail reinforced with riveted links. Sturdy protection.' },
  { name: 'Riveted Greaves', slot: 'legs', armorType: 'chain', rarity: 'common', tier: 2n, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 5n, description: 'Riveted chain leggings that resist cutting blows.' },
  { name: 'Riveted Sabatons', slot: 'boots', armorType: 'chain', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 4n, description: 'Heavy chain boots with reinforced toe caps.' },

  // Tier 2 armor — plate chest/legs/boots
  { name: 'Forged Cuirass', slot: 'chest', armorType: 'plate', rarity: 'common', tier: 2n, vendorValue: 18n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 7n, description: 'Expertly forged plate armor. Superior physical defense.' },
  { name: 'Forged Greaves', slot: 'legs', armorType: 'plate', rarity: 'common', tier: 2n, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 6n, description: 'Thick forged plate leggings. Absorbs punishing blows.' },
  { name: 'Forged Boots', slot: 'boots', armorType: 'plate', rarity: 'common', tier: 2n, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 5n, description: 'Plate boots forged from high-quality steel.' },

  // Tier 2 weapons — remaining types (damage scaled inversely with weapon speed)
  { name: 'Flanged Mace', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'paladin,cleric', weaponType: 'mace', weaponBaseDamage: 5n, weaponDps: 7n, description: 'A reinforced mace with protruding flanges for armor-piercing strikes.' },
  { name: 'Hardened Axe', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'beastmaster', weaponType: 'axe', weaponBaseDamage: 7n, weaponDps: 9n, description: 'A tempered axe head on an ironwood haft. Cleaves deep.' },
  { name: 'Stiletto', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'rogue', weaponType: 'dagger', weaponBaseDamage: 4n, weaponDps: 5n, description: 'A needle-thin blade designed for finding gaps in armor.' },
  { name: 'Dueling Rapier', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'bard', weaponType: 'rapier', weaponBaseDamage: 4n, weaponDps: 5n, description: 'An elegant thrusting sword favored by duelists.' },
  { name: 'Tempered Blade', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'spellblade,reaver', weaponType: 'blade', weaponBaseDamage: 5n, weaponDps: 7n, description: 'A balanced blade forged for hybrid combat styles.' },
];

export const WORLD_DROP_JEWELRY_DEFS: WorldDropItemDef[] = [
  // Tier 1 earrings (requiredLevel: 1n, tier: 1n)
  { name: 'Copper Band', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 1n, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 1n, description: 'A simple copper ring. Lends a touch of might.' },
  { name: 'Iron Signet', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 1n, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', dexBonus: 1n, description: 'A plain iron ring stamped with an unknown crest. Sharpens reflexes.' },
  { name: 'Tarnished Loop', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 1n, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', intBonus: 1n, description: 'A tarnished silver loop. Hums faintly with arcane resonance.' },

  // Tier 1 necks (requiredLevel: 1n, tier: 1n)
  { name: 'Stone Pendant', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 1n, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', wisBonus: 1n, description: 'A smooth river stone on a leather cord. Calms the mind.' },
  { name: 'Bone Charm', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 1n, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', hpBonus: 3n, description: 'A carved bone talisman said to fortify the body.' },
  { name: 'Frayed Cord', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 1n, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', manaBonus: 3n, description: 'A braided cord set with a pale bead. Draws mana to the wearer.' },

  // Tier 2 earrings (requiredLevel: 11n, tier: 2n)
  { name: 'Silver Band', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 2n, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', strBonus: 2n, description: 'A polished silver ring. Channels physical power.' },
  { name: 'Arcane Loop', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 2n, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', intBonus: 2n, description: 'A ring inscribed with glowing sigils. Amplifies magical focus.' },

  // Tier 2 necks (requiredLevel: 11n, tier: 2n)
  { name: 'Ember Pendant', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 2n, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', wisBonus: 2n, description: 'A pendant holding a warm ember crystal. Sharpens intuition.' },
  { name: 'Vitality Cord', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 2n, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', hpBonus: 6n, description: 'A thick cord woven with life-thread. Bolsters constitution.' },

  // Tier 1 cloaks (slot: 'neck', armorType: 'cloth')
  { name: 'Rough Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, vendorValue: 8n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A coarse woolen cloak. Keeps the chill off.' },
  { name: 'Wool Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, vendorValue: 8n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A thick wool cloak. Warmth and slight protection.' },
  { name: 'Drifter Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, vendorValue: 8n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A road-worn cloak patched many times over.' },

  // Tier 2 cloaks (slot: 'neck', armorType: 'cloth')
  { name: 'Reinforced Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 2n, vendorValue: 18n, requiredLevel: 11n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A cloak with leather panels sewn into the lining.' },
  { name: 'Stalker Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 2n, vendorValue: 18n, requiredLevel: 11n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A dark cloak designed to blend into shadows.' },
];

// ---------------------------------------------------------------------------
// CRAFTING BASE GEAR TEMPLATES
// ---------------------------------------------------------------------------

export interface CraftingBaseGearDef {
  name: string;
  slot: string;
  armorType: string;
  rarity: string;
  tier: bigint;
  isJunk: boolean;
  vendorValue: bigint;
  requiredLevel: bigint;
  allowedClasses: string;
  armorClassBonus: bigint;
  description: string;
}

export const CRAFTING_BASE_GEAR_DEFS: CraftingBaseGearDef[] = [
  // Head slot — plate
  { name: 'Iron Helm', slot: 'head', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'A basic iron helm. Protects the skull from overhead blows.' },
  // Wrists slot — leather
  { name: 'Leather Bracers', slot: 'wrists', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'Simple leather wrist guards. Deflect glancing strikes.' },
  // Hands slot — plate
  { name: 'Iron Gauntlets', slot: 'hands', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'Heavy iron hand protection. Adds weight behind punches.' },
  // Belt slot — leather
  { name: 'Rough Girdle', slot: 'belt', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'A leather belt reinforced with metal studs.' },
  // OffHand shield
  { name: 'Wooden Shield', slot: 'offHand', armorType: 'shield', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,cleric,spellblade,shaman', armorClassBonus: 4n, description: 'A round wooden shield banded with iron.' },
  // Cloak (neck slot, armorType cloth)
  { name: 'Simple Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A plain travelling cloak offering minimal coverage.' },
  // Cloth other-slot items (AC=2)
  { name: 'Cloth Hood', slot: 'head', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A simple cloth hood. Keeps sun and rain at bay.' },
  { name: 'Cloth Wraps', slot: 'wrists', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'Strips of cloth wound around the wrists. Barely protective.' },
  { name: 'Cloth Gloves', slot: 'hands', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'Thin cloth gloves. Dexterous but fragile.' },
  { name: 'Cloth Sash', slot: 'belt', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A cloth belt tied at the waist. Decorative more than defensive.' },
  // Leather other-slot items (AC=3)
  { name: 'Leather Cap', slot: 'head', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'A molded leather cap. Lightweight head protection.' },
  { name: 'Leather Gloves', slot: 'hands', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'Fitted leather gloves for grip and protection.' },
  // Chain other-slot items (AC=3)
  { name: 'Chain Coif', slot: 'head', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'A chain mail hood covering head and neck.' },
  { name: 'Chain Bracers', slot: 'wrists', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'Chain mail wrist guards. Sturdy against slashing attacks.' },
  { name: 'Chain Gauntlets', slot: 'hands', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'Chain mail gloves offering good hand protection.' },
  { name: 'Chain Girdle', slot: 'belt', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'A chain mail belt reinforcing the midsection.' },
  // Plate other-slot items (AC=4)
  { name: 'Plate Vambraces', slot: 'wrists', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'Plate wrist guards. Heavy but nearly impenetrable.' },
  { name: 'Plate Girdle', slot: 'belt', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'A broad plate belt protecting the midsection.' },
];
