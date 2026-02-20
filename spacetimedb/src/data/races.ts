export const RACE_DATA: Array<{
  name: string;
  description: string;
  availableClasses: string;
  bonus1Type: string;
  bonus1Value: bigint;
  bonus2Type: string;
  bonus2Value: bigint;
  unlocked: boolean;
}> = [
  // Starter races (4, all unlocked)
  {
    name: 'Human',
    description: 'Adaptable and resourceful, humans can pursue any path.',
    availableClasses: '',
    bonus1Type: 'stat_cha', bonus1Value: 1n,
    bonus2Type: 'stamina_regen', bonus2Value: 1n,
    unlocked: true,
  },
  {
    name: 'Eldrin',
    description: 'Ancient scholars attuned to arcane and divine forces.',
    availableClasses: 'bard,enchanter,cleric,wizard,necromancer,spellblade,shaman,druid,reaver,summoner,paladin,ranger',
    bonus1Type: 'spell_damage', bonus1Value: 2n,
    bonus2Type: 'max_mana', bonus2Value: 10n,
    unlocked: true,
  },
  {
    name: 'Ironclad',
    description: 'Forged in industry, masters of strength and craft.',
    availableClasses: 'warrior,paladin,monk,beastmaster,spellblade,ranger,shaman',
    bonus1Type: 'phys_damage', bonus1Value: 2n,
    bonus2Type: 'armor', bonus2Value: 1n,
    unlocked: true,
  },
  {
    name: 'Wyldfang',
    description: 'Swift hunters bonded with the untamed wild.',
    availableClasses: 'rogue,ranger,monk,beastmaster,druid,shaman',
    bonus1Type: 'crit_chance', bonus1Value: 5n,
    bonus2Type: 'stat_dex', bonus2Value: 1n,
    unlocked: true,
  },
  // New unlocked races (7)
  {
    name: 'Goblin',
    description: 'Cunning and quick-witted, goblins have a natural affinity for mana manipulation.',
    availableClasses: '',
    bonus1Type: 'spell_damage', bonus1Value: 1n,
    bonus2Type: 'mana_regen', bonus2Value: 1n,
    unlocked: true,
  },
  {
    name: 'Troll',
    description: 'Hulking and resilient, trolls endure punishment that would fell lesser beings.',
    availableClasses: '',
    bonus1Type: 'max_hp', bonus1Value: 15n,
    bonus2Type: 'phys_damage', bonus2Value: 1n,
    unlocked: true,
  },
  {
    name: 'Dwarf',
    description: 'Stout and unyielding, dwarves hit harder than their stature suggests.',
    availableClasses: '',
    bonus1Type: 'max_hp', bonus1Value: 10n,
    bonus2Type: 'phys_damage', bonus2Value: 2n,
    unlocked: true,
  },
  {
    name: 'Gnome',
    description: 'Inventive tinkerers with deep reserves of arcane energy and quick mental recovery.',
    availableClasses: '',
    bonus1Type: 'mana_regen', bonus1Value: 2n,
    bonus2Type: 'max_mana', bonus2Value: 15n,
    unlocked: true,
  },
  {
    name: 'Halfling',
    description: 'Nimble and surprisingly lucky, halflings dodge blows others never see coming.',
    availableClasses: '',
    bonus1Type: 'crit_chance', bonus1Value: 8n,
    bonus2Type: 'dodge', bonus2Value: 8n,
    unlocked: true,
  },
  {
    name: 'Half-Elf',
    description: 'Bridging two worlds, half-elves excel through sheer versatility.',
    availableClasses: '',
    bonus1Type: 'stat_str', bonus1Value: 1n,
    bonus2Type: 'stat_int', bonus2Value: 1n,
    unlocked: true,
  },
  {
    name: 'Orc',
    description: 'Savage and strong, orcs deliver punishing blows while shrugging off wounds.',
    availableClasses: '',
    bonus1Type: 'phys_damage', bonus1Value: 3n,
    bonus2Type: 'max_hp', bonus2Value: 8n,
    unlocked: true,
  },
  // New locked races (4)
  {
    name: 'Dark-Elf',
    description: 'Graceful and sinister, dark elves wield shadow-touched magic with lethal precision.',
    availableClasses: '',
    bonus1Type: 'spell_damage', bonus1Value: 3n,
    bonus2Type: 'mana_regen', bonus2Value: 1n,
    unlocked: false,
  },
  {
    name: 'Half-Giant',
    description: 'Towering and immovable, half-giants absorb punishment that shatters entire warbands.',
    availableClasses: '',
    bonus1Type: 'max_hp', bonus1Value: 20n,
    bonus2Type: 'phys_damage', bonus2Value: 2n,
    unlocked: false,
  },
  {
    name: 'Cyclops',
    description: 'Singular-minded and brutally strong, cyclops warriors are living siege weapons.',
    availableClasses: '',
    bonus1Type: 'phys_damage', bonus1Value: 4n,
    bonus2Type: 'armor', bonus2Value: 2n,
    unlocked: false,
  },
  {
    name: 'Satyr',
    description: 'Wild and mercurial, satyrs channel primal magic through relentless motion.',
    availableClasses: '',
    bonus1Type: 'spell_damage', bonus1Value: 2n,
    bonus2Type: 'stamina_regen', bonus2Value: 2n,
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
