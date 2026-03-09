// equipment_rules.ts
// Mechanical rules extracted from legacy item_defs.ts.
// Contains armor class restrictions and starter weapon definitions only.
// All specific gear definitions (world drops, boss drops, crafting bases) are discarded.

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
