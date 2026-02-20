export const RACE_DATA: Array<{
  name: string;
  description: string;
  availableClasses: string;
  bonus1Type: string;
  bonus1Value: bigint;
  bonus2Type: string;
  bonus2Value: bigint;
  penaltyType?: string;
  penaltyValue?: bigint;
  levelBonusType: string;
  levelBonusValue: bigint;
  unlocked: boolean;
}> = [
  // Starter races (4, all unlocked)
  {
    name: 'Human',
    description: 'Adaptable and charismatic, humans build alliances wherever they roam.',
    availableClasses: '',
    bonus1Type: 'stat_cha', bonus1Value: 3n,
    bonus2Type: 'perception', bonus2Value: 25n,
    levelBonusType: 'faction_bonus', levelBonusValue: 1n,
    unlocked: true,
  },
  {
    name: 'Eldrin',
    description: 'Ancient scholars attuned to arcane forces, powerful but physically fragile.',
    availableClasses: 'bard,enchanter,cleric,wizard,necromancer,spellblade,shaman,druid,reaver,summoner,paladin,ranger',
    bonus1Type: 'spell_damage', bonus1Value: 4n,
    bonus2Type: 'max_mana', bonus2Value: 15n,
    penaltyType: 'stat_str', penaltyValue: 1n,
    levelBonusType: 'max_mana', levelBonusValue: 2n,
    unlocked: true,
  },
  {
    name: 'Ironclad',
    description: 'Forged in industry, masters of physical combat and defense.',
    availableClasses: 'warrior,paladin,monk,beastmaster,spellblade,ranger,shaman',
    bonus1Type: 'phys_damage', bonus1Value: 3n,
    bonus2Type: 'armor', bonus2Value: 2n,
    levelBonusType: 'parry', levelBonusValue: 50n,
    unlocked: true,
  },
  {
    name: 'Wyldfang',
    description: 'Swift predators of the untamed wild, built for precision and speed.',
    availableClasses: 'rogue,ranger,monk,beastmaster,druid,shaman',
    bonus1Type: 'stat_dex', bonus1Value: 1n,
    bonus2Type: 'crit_chance', bonus2Value: 500n,
    levelBonusType: 'crit_chance', levelBonusValue: 50n,
    unlocked: true,
  },
  // New unlocked races (7)
  {
    name: 'Goblin',
    description: 'Cunning and perceptive, goblins see through illusions and sense mana flows others miss.',
    availableClasses: 'rogue,necromancer,enchanter,wizard,summoner,shaman,bard',
    bonus1Type: 'mana_regen', bonus1Value: 2n,
    bonus2Type: 'perception', bonus2Value: 25n,
    penaltyType: 'stat_dex', penaltyValue: 1n,
    levelBonusType: 'loot_bonus', levelBonusValue: 1n,
    unlocked: true,
  },
  {
    name: 'Troll',
    description: 'Hulking and regenerative, trolls endure punishment that would fell lesser beings.',
    availableClasses: 'warrior,beastmaster,monk,reaver,shaman',
    bonus1Type: 'max_hp', bonus1Value: 20n,
    bonus2Type: 'hp_regen', bonus2Value: 2n,
    penaltyType: 'stat_dex', penaltyValue: 2n,
    levelBonusType: 'max_hp', levelBonusValue: 2n,
    unlocked: true,
  },
  {
    name: 'Dwarf',
    description: 'Stout and unyielding, dwarves hit harder than their stature suggests — but their short legs make travel costly.',
    availableClasses: 'warrior,paladin,cleric,monk,ranger,shaman,beastmaster',
    bonus1Type: 'max_hp', bonus1Value: 12n,
    bonus2Type: 'max_stamina', bonus2Value: 5n,
    penaltyType: 'travel_cost_increase', penaltyValue: 1n,
    levelBonusType: 'armor', levelBonusValue: 1n,
    unlocked: true,
  },
  {
    name: 'Gnome',
    description: 'Inventive tinkerers with deep arcane reserves and exceptional mental recovery.',
    availableClasses: 'wizard,enchanter,summoner,bard,necromancer,spellblade,cleric',
    bonus1Type: 'mana_regen', bonus1Value: 3n,
    bonus2Type: 'max_mana', bonus2Value: 20n,
    penaltyType: 'stat_str', penaltyValue: 1n,
    levelBonusType: 'max_mana', levelBonusValue: 2n,
    unlocked: true,
  },
  {
    name: 'Halfling',
    description: 'Nimble and hard to hit, halflings slip through dangers that fell taller folk.',
    availableClasses: 'rogue,ranger,bard,druid,monk,enchanter',
    bonus1Type: 'stat_dex', bonus1Value: 1n,
    bonus2Type: 'dodge', bonus2Value: 400n,
    levelBonusType: 'dodge', levelBonusValue: 50n,
    unlocked: true,
  },
  {
    name: 'Half-Elf',
    description: 'Bridging two worlds, half-elves develop exceptional accuracy through their versatile heritage.',
    availableClasses: '',
    bonus1Type: 'stat_str', bonus1Value: 1n,
    bonus2Type: 'stat_int', bonus2Value: 1n,
    levelBonusType: 'hit_chance', levelBonusValue: 50n,
    unlocked: true,
  },
  {
    name: 'Orc',
    description: 'Raw strength and resilience define the orc — they do not need finesse to win.',
    availableClasses: 'warrior,beastmaster,shaman,reaver,monk,ranger',
    bonus1Type: 'stat_str', bonus1Value: 1n,
    bonus2Type: 'max_hp', bonus2Value: 8n,
    penaltyType: 'stat_wis', penaltyValue: 1n,
    levelBonusType: 'phys_damage', levelBonusValue: 1n,
    unlocked: true,
  },
  // New locked races (4)
  {
    name: 'Dark-Elf',
    description: 'Graceful and sinister, dark elves wield shadow-touched magic with lethal precision.',
    availableClasses: 'rogue,necromancer,wizard,enchanter,spellblade,reaver,bard,ranger',
    bonus1Type: 'spell_damage', bonus1Value: 4n,
    bonus2Type: 'dodge', bonus2Value: 300n,
    penaltyType: 'stat_str', penaltyValue: 1n,
    levelBonusType: 'spell_damage', levelBonusValue: 1n,
    unlocked: false,
  },
  {
    name: 'Half-Giant',
    description: 'Towering and immovable, half-giants absorb punishment that shatters entire warbands.',
    availableClasses: 'warrior,beastmaster,monk,reaver,shaman',
    bonus1Type: 'max_hp', bonus1Value: 25n,
    bonus2Type: 'phys_damage', bonus2Value: 3n,
    penaltyType: 'stat_dex', penaltyValue: 3n,
    levelBonusType: 'max_hp', levelBonusValue: 3n,
    unlocked: false,
  },
  {
    name: 'Cyclops',
    description: 'Singular-minded and brutally accurate, cyclops warriors strike with devastating precision.',
    availableClasses: 'warrior,beastmaster,ranger,reaver,monk',
    bonus1Type: 'phys_damage', bonus1Value: 6n,
    bonus2Type: 'hit_chance', bonus2Value: 300n,
    penaltyType: 'stat_dex', penaltyValue: 2n,
    levelBonusType: 'phys_damage', levelBonusValue: 1n,
    unlocked: false,
  },
  {
    name: 'Satyr',
    description: 'Wild and fleet-footed, satyrs channel primal magic and travel lighter than any other race.',
    availableClasses: 'bard,druid,shaman,enchanter,ranger,reaver',
    bonus1Type: 'spell_damage', bonus1Value: 3n,
    bonus2Type: 'stamina_regen', bonus2Value: 1n,
    penaltyType: 'travel_cost_discount', penaltyValue: 1n,
    levelBonusType: 'magic_resist', levelBonusValue: 50n,
    unlocked: false,
  },
];

export function ensureRaces(ctx: any) {
  for (const data of RACE_DATA) {
    const existing = [...ctx.db.race.iter()].find((row: any) => row.name === data.name);
    if (existing) {
      ctx.db.race.id.update({ ...existing, ...data });
    } else {
      ctx.db.race.insert({ id: 0n, ...data });
    }
  }
}
