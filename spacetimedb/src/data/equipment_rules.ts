// equipment_rules.ts
// Mechanical rules extracted from legacy item_defs.ts.
// Contains armor class restrictions, starter weapon/armor/accessory definitions, and junk items.

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
// STARTER WEAPONS
// ---------------------------------------------------------------------------

export interface StarterWeaponDef {
  name: string;
  allowed: string;
  weaponType: string;
  description: string;
}

export const STARTER_WEAPON_DEFS: StarterWeaponDef[] = [
  { name: 'Training Sword', allowed: 'warrior,paladin,bard,spellblade,reaver,rogue,ranger', weaponType: 'sword', description: 'A blunt practice sword. Barely adequate for real combat.' },
  { name: 'Training Mace', allowed: 'paladin,cleric,druid,shaman,rogue,ranger', weaponType: 'mace', description: 'A weighted training mace. Clumsy but functional.' },
  { name: 'Training Staff', allowed: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger', weaponType: 'staff', description: 'A worn wooden staff. Channels magic adequately for beginners.' },
  { name: 'Training Bow', allowed: 'ranger', weaponType: 'bow', description: 'A simple shortbow with fraying string. Accurate enough at short range.' },
  { name: 'Training Dagger', allowed: 'rogue,enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger', weaponType: 'dagger', description: 'A dull practice dagger. Quick in the right hands.' },
  { name: 'Training Axe', allowed: 'beastmaster,warrior,reaver,ranger', weaponType: 'axe', description: 'A notched training axe. Heavy enough to do damage.' },
  { name: 'Training Blade', allowed: 'spellblade,reaver,ranger', weaponType: 'blade', description: 'A thin practice blade balanced for dual-discipline fighting.' },
  { name: 'Training Rapier', allowed: 'bard,ranger', weaponType: 'rapier', description: 'A flexible practice rapier. Light and swift.' },
  { name: 'Training Greatsword', allowed: 'warrior,paladin,reaver,spellblade,ranger', weaponType: 'greatsword', description: 'A heavy two-handed practice sword. Slow but devastating.' },
];

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
