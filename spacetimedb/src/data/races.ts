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
  abilityName: string;
  abilityDescription: string;
  abilityKind: string;
  abilityTargetRule: string;
  abilityCooldownSeconds: bigint;
  abilityValue: bigint;
  abilityKey: string;
  abilityEffectType?: string;
  abilityEffectMagnitude?: bigint;
  abilityEffectDuration?: bigint;
}> = [
    // Starter races (4, all unlocked)
    {
      name: 'Human',
      description: 'Adaptable and charismatic, humans build alliances wherever they roam.',
      availableClasses: '',
      bonus1Type: 'stat_cha', bonus1Value: 3n,
      bonus2Type: 'perception', bonus2Value: 25n,
      // levelBonusValue halved: 1n -> 1n (already minimum, keep at 1n)
      levelBonusType: 'faction_bonus', levelBonusValue: 1n,
      unlocked: true,
      abilityName: 'Diplomatic Poise',
      abilityDescription: 'Draw on your adaptable nature to bolster your resolve, briefly buffing your charisma and faction standing.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 5n,
      abilityKey: 'race_human_diplomatic_poise',
      abilityEffectType: 'faction_bonus',
      abilityEffectMagnitude: 5n,
      abilityEffectDuration: 30n,
    },
    {
      name: 'Eldrin',
      description: 'Ancient scholars attuned to arcane forces, powerful but physically fragile.',
      availableClasses: 'bard,enchanter,cleric,wizard,necromancer,spellblade,shaman,druid,reaver,summoner,paladin,ranger',
      bonus1Type: 'spell_damage', bonus1Value: 4n,
      bonus2Type: 'max_mana', bonus2Value: 15n,
      penaltyType: 'stat_str', penaltyValue: 1n,
      // levelBonusValue halved: 2n -> 1n (at level 20: 1*20=20, same as old 2*10=20)
      levelBonusType: 'max_mana', levelBonusValue: 1n,
      unlocked: true,
      abilityName: 'Arcane Attunement',
      abilityDescription: 'Channel your ancestral connection to magic, temporarily increasing spell damage output.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 10n,
      abilityKey: 'race_eldrin_arcane_attunement',
      abilityEffectType: 'damage_up',
      abilityEffectMagnitude: 10n,
      abilityEffectDuration: 30n,
    },
    {
      name: 'Ironclad',
      description: 'Forged in industry, masters of physical combat and defense.',
      availableClasses: 'warrior,paladin,monk,beastmaster,spellblade,ranger,shaman',
      bonus1Type: 'phys_damage', bonus1Value: 3n,
      bonus2Type: 'armor', bonus2Value: 2n,
      // levelBonusValue halved: 5n -> 3n (round up from 2.5)
      levelBonusType: 'parry', levelBonusValue: 3n,
      unlocked: true,
      abilityName: 'Iron Bulwark',
      abilityDescription: 'Fortify your stance with industrial discipline, granting a temporary armor and parry boost.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 8n,
      abilityKey: 'race_ironclad_iron_bulwark',
      abilityEffectType: 'armor_up',
      abilityEffectMagnitude: 8n,
      abilityEffectDuration: 30n,
    },
    {
      name: 'Wyldfang',
      description: 'Swift predators of the untamed wild, built for precision and speed.',
      availableClasses: 'rogue,ranger,monk,beastmaster,druid,shaman',
      bonus1Type: 'stat_dex', bonus1Value: 1n,
      bonus2Type: 'crit_chance', bonus2Value: 500n,
      // levelBonusValue halved: 50n -> 25n
      levelBonusType: 'crit_chance', levelBonusValue: 25n,
      unlocked: true,
      abilityName: 'Predator\'s Instinct',
      abilityDescription: 'Tap into primal hunting instincts, surging your critical strike chance for a short burst.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 200n,
      abilityKey: 'race_wyldfang_predators_instinct',
      abilityEffectType: 'crit_up',
      abilityEffectMagnitude: 200n,
      abilityEffectDuration: 20n,
    },
    // New unlocked races (7)
    {
      name: 'Goblin',
      description: 'Cunning and perceptive, goblins see through illusions and sense mana flows others miss.',
      availableClasses: 'rogue,necromancer,enchanter,wizard,summoner,shaman,bard',
      bonus1Type: 'mana_regen', bonus1Value: 2n,
      bonus2Type: 'perception', bonus2Value: 25n,
      penaltyType: 'stat_dex', penaltyValue: 1n,
      // levelBonusValue halved: 1n -> 1n (already minimum)
      levelBonusType: 'loot_bonus', levelBonusValue: 1n,
      unlocked: true,
      abilityName: 'Scavenger\'s Eye',
      abilityDescription: 'Your cunning eye spots hidden value, temporarily boosting loot quality from your next encounter.',
      abilityKind: 'utility',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 3n,
      abilityKey: 'race_goblin_scavengers_eye',
      abilityEffectType: 'loot_bonus',
      abilityEffectMagnitude: 3n,
      abilityEffectDuration: 60n,
    },
    {
      name: 'Troll',
      description: 'Hulking and regenerative, trolls endure punishment that would fell lesser beings.',
      availableClasses: 'warrior,beastmaster,monk,reaver,shaman',
      bonus1Type: 'max_hp', bonus1Value: 20n,
      bonus2Type: 'hp_regen', bonus2Value: 2n,
      penaltyType: 'stat_dex', penaltyValue: 2n,
      // levelBonusValue halved: 2n -> 1n
      levelBonusType: 'max_hp', levelBonusValue: 1n,
      unlocked: true,
      abilityName: 'Troll Regeneration',
      abilityDescription: 'Activate rapid tissue regrowth, applying a powerful heal-over-time effect.',
      abilityKind: 'hot',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 15n,
      abilityKey: 'race_troll_regeneration',
    },
    {
      name: 'Dwarf',
      description: 'Stout and unyielding, dwarves hit harder than their stature suggests — but their short legs make travel costly.',
      availableClasses: 'warrior,paladin,cleric,monk,ranger,shaman,beastmaster',
      bonus1Type: 'max_hp', bonus1Value: 12n,
      bonus2Type: 'max_stamina', bonus2Value: 5n,
      penaltyType: 'travel_cost_increase', penaltyValue: 1n,
      // levelBonusValue halved: 1n -> 1n (already minimum)
      levelBonusType: 'armor', levelBonusValue: 1n,
      unlocked: true,
      abilityName: 'Stonehide',
      abilityDescription: 'Call upon dwarven endurance to harden your skin, temporarily boosting armor significantly.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 6n,
      abilityKey: 'race_dwarf_stonehide',
      abilityEffectType: 'armor_up',
      abilityEffectMagnitude: 6n,
      abilityEffectDuration: 30n,
    },
    {
      name: 'Gnome',
      description: 'Inventive tinkerers with deep arcane reserves and exceptional mental recovery.',
      availableClasses: 'wizard,enchanter,summoner,bard,necromancer,spellblade,cleric',
      bonus1Type: 'mana_regen', bonus1Value: 1n,
      bonus2Type: 'max_mana', bonus2Value: 20n,
      penaltyType: 'stat_str', penaltyValue: 1n,
      // levelBonusValue halved: 2n -> 1n
      levelBonusType: 'max_mana', levelBonusValue: 1n,
      unlocked: true,
      abilityName: 'Mana Surge',
      abilityDescription: 'Overcharge your arcane circuits for a burst, temporarily restoring mana over time.',
      abilityKind: 'hot',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 20n,
      abilityKey: 'race_gnome_mana_surge',
    },
    {
      name: 'Halfling',
      description: 'Nimble and hard to hit, halflings slip through dangers that fell taller folk.',
      availableClasses: 'rogue,ranger,bard,druid,monk,enchanter',
      bonus1Type: 'stat_dex', bonus1Value: 1n,
      bonus2Type: 'dodge', bonus2Value: 10n,
      // levelBonusValue halved: 5n -> 3n (round up from 2.5)
      levelBonusType: 'dodge', levelBonusValue: 3n,
      unlocked: true,
      abilityName: 'Lucky Dodge',
      abilityDescription: 'Channel halfling luck to become briefly evasive, sharply boosting dodge chance.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 150n,
      abilityKey: 'race_halfling_lucky_dodge',
      abilityEffectType: 'dodge',
      abilityEffectMagnitude: 150n,
      abilityEffectDuration: 30n,
    },
    {
      name: 'Half-Elf',
      description: 'Bridging two worlds, half-elves develop exceptional accuracy through their versatile heritage.',
      availableClasses: '',
      bonus1Type: 'stat_str', bonus1Value: 1n,
      bonus2Type: 'stat_int', bonus2Value: 1n,
      // levelBonusValue halved: 50n -> 25n
      levelBonusType: 'hit_chance', levelBonusValue: 25n,
      unlocked: true,
      abilityName: 'Focused Aim',
      abilityDescription: 'Draw on both human adaptability and elven precision to temporarily boost hit chance.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 150n,
      abilityKey: 'race_half_elf_focused_aim',
      abilityEffectType: 'hit_up',
      abilityEffectMagnitude: 150n,
      abilityEffectDuration: 30n,
    },
    {
      name: 'Orc',
      description: 'Raw strength and resilience define the orc — they do not need finesse to win.',
      availableClasses: 'warrior,beastmaster,shaman,reaver,monk,ranger',
      bonus1Type: 'stat_str', bonus1Value: 1n,
      bonus2Type: 'max_hp', bonus2Value: 8n,
      penaltyType: 'stat_wis', penaltyValue: 1n,
      // levelBonusValue halved: 1n -> 1n (already minimum)
      levelBonusType: 'phys_damage', levelBonusValue: 1n,
      unlocked: true,
      abilityName: 'Blood Frenzy',
      abilityDescription: 'Enter a primal berserker state, temporarily boosting physical damage output.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 8n,
      abilityKey: 'race_orc_blood_frenzy',
      abilityEffectType: 'damage_up',
      abilityEffectMagnitude: 8n,
      abilityEffectDuration: 30n,
    },
    // New locked races (4)
    {
      name: 'Dark-Elf',
      description: 'Graceful and sinister, dark elves wield shadow-touched magic with lethal precision.',
      availableClasses: 'rogue,necromancer,wizard,enchanter,spellblade,reaver,bard,ranger',
      bonus1Type: 'spell_damage', bonus1Value: 4n,
      bonus2Type: 'dodge', bonus2Value: 10n,
      penaltyType: 'stat_str', penaltyValue: 1n,
      // levelBonusValue halved: 1n -> 1n (already minimum)
      levelBonusType: 'spell_damage', levelBonusValue: 1n,
      unlocked: false,
      abilityName: 'Shadow Veil',
      abilityDescription: 'Wrap yourself in shadow magic, temporarily boosting spell damage with dark energy.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 12n,
      abilityKey: 'race_dark_elf_shadow_veil',
      abilityEffectType: 'damage_up',
      abilityEffectMagnitude: 12n,
      abilityEffectDuration: 30n,
    },
    {
      name: 'Half-Giant',
      description: 'Towering and immovable, half-giants absorb punishment that shatters entire warbands.',
      availableClasses: 'warrior,beastmaster,monk,reaver,shaman',
      bonus1Type: 'max_hp', bonus1Value: 25n,
      bonus2Type: 'phys_damage', bonus2Value: 3n,
      penaltyType: 'stat_dex', penaltyValue: 3n,
      // levelBonusValue halved: 3n -> 2n (round up from 1.5)
      levelBonusType: 'max_hp', levelBonusValue: 2n,
      unlocked: false,
      abilityName: 'Giant\'s Wrath',
      abilityDescription: 'Channel titanic fury into a combat surge, temporarily boosting physical damage.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 15n,
      abilityKey: 'race_half_giant_giants_wrath',
      abilityEffectType: 'damage_up',
      abilityEffectMagnitude: 15n,
      abilityEffectDuration: 20n,
    },
    {
      name: 'Cyclops',
      description: 'Singular-minded and brutally accurate, cyclops warriors strike with devastating precision.',
      availableClasses: 'warrior,beastmaster,ranger,reaver,monk',
      bonus1Type: 'phys_damage', bonus1Value: 6n,
      bonus2Type: 'hit_chance', bonus2Value: 300n,
      penaltyType: 'stat_dex', penaltyValue: 2n,
      // levelBonusValue halved: 1n -> 1n (already minimum)
      levelBonusType: 'phys_damage', levelBonusValue: 1n,
      unlocked: false,
      abilityName: 'True Sight',
      abilityDescription: 'Focus your singular eye to achieve perfect aim, drastically boosting hit chance.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 300n,
      abilityKey: 'race_cyclops_true_sight',
      abilityEffectType: 'hit_up',
      abilityEffectMagnitude: 300n,
      abilityEffectDuration: 20n,
    },
    {
      name: 'Satyr',
      description: 'Wild and fleet-footed, satyrs channel primal magic and travel lighter than any other race.',
      availableClasses: 'bard,druid,shaman,enchanter,ranger,reaver',
      bonus1Type: 'spell_damage', bonus1Value: 3n,
      bonus2Type: 'stamina_regen', bonus2Value: 1n,
      penaltyType: 'travel_cost_discount', penaltyValue: 1n,
      // levelBonusValue halved: 50n -> 25n
      levelBonusType: 'magic_resist', levelBonusValue: 25n,
      unlocked: false,
      abilityName: 'Primal Ward',
      abilityDescription: 'Invoke wild magic protection, temporarily boosting magic resistance.',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 100n,
      abilityKey: 'race_satyr_primal_ward',
      abilityEffectType: 'magic_resist',
      abilityEffectMagnitude: 100n,
      abilityEffectDuration: 30n,
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
