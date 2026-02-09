export type Ability = {
  key: string;
  name: string;
  className: string;
  level: number;
  kind: 'combat' | 'utility';
  resource: 'mana' | 'stamina';
  description: string;
};

export const abilities: Ability[] = [
  { key: 'bard_discordant_note', name: 'Discordant Note', className: 'Bard', level: 1, kind: 'combat', resource: 'mana', description: 'Strike with a dissonant note to weaken the target.' },
  { key: 'bard_song_of_ease', name: 'Song of Ease', className: 'Bard', level: 2, kind: 'utility', resource: 'mana', description: 'A soothing song that restores party endurance over time.' },
  { key: 'bard_echoed_chord', name: 'Echoed Chord', className: 'Bard', level: 3, kind: 'combat', resource: 'mana', description: 'A resonant strike that grows stronger with allies nearby.' },
  { key: 'bard_harmony', name: 'Harmony', className: 'Bard', level: 4, kind: 'utility', resource: 'mana', description: 'Bolster the party with a brief surge of coordination.' },
  { key: 'bard_crushing_crescendo', name: 'Crushing Crescendo', className: 'Bard', level: 5, kind: 'combat', resource: 'mana', description: 'A powerful crescendo that punishes weakened foes.' },

  { key: 'enchanter_mind_lash', name: 'Mind Lash', className: 'Enchanter', level: 1, kind: 'combat', resource: 'mana', description: 'Psychic lash that deals damage over time.' },
  { key: 'enchanter_clarity', name: 'Clarity', className: 'Enchanter', level: 2, kind: 'utility', resource: 'mana', description: 'Restore mana to a party member.' },
  { key: 'enchanter_slow', name: 'Slow', className: 'Enchanter', level: 3, kind: 'combat', resource: 'mana', description: 'Reduce the enemy’s attack power for a short duration.' },
  { key: 'enchanter_clarity_ii', name: 'Clarity II', className: 'Enchanter', level: 4, kind: 'utility', resource: 'mana', description: 'Restore more mana to a party member.' },
  { key: 'enchanter_charm_fray', name: 'Charm Fray', className: 'Enchanter', level: 5, kind: 'combat', resource: 'mana', description: 'Damage and weaken the enemy’s offense.' },

  { key: 'cleric_minor_heal', name: 'Minor Heal', className: 'Cleric', level: 1, kind: 'combat', resource: 'mana', description: 'Restore health to a single ally.' },
  { key: 'cleric_blessing', name: 'Blessing', className: 'Cleric', level: 2, kind: 'utility', resource: 'mana', description: 'Increase an ally’s maximum health.' },
  { key: 'cleric_smite', name: 'Smite', className: 'Cleric', level: 3, kind: 'combat', resource: 'mana', description: 'Holy strike that damages an enemy.' },
  { key: 'cleric_sanctuary', name: 'Sanctuary', className: 'Cleric', level: 4, kind: 'utility', resource: 'mana', description: 'Briefly fortify the party’s defenses.' },
  { key: 'cleric_heal', name: 'Heal', className: 'Cleric', level: 5, kind: 'combat', resource: 'mana', description: 'A strong single-target heal.' },

  { key: 'warrior_slam', name: 'Slam', className: 'Warrior', level: 1, kind: 'combat', resource: 'stamina', description: 'A heavy strike that draws attention.' },
  { key: 'warrior_shout', name: 'Shout', className: 'Warrior', level: 2, kind: 'utility', resource: 'stamina', description: 'Rally the party with a battle shout.' },
  { key: 'warrior_cleave', name: 'Cleave', className: 'Warrior', level: 3, kind: 'combat', resource: 'stamina', description: 'A powerful cleaving blow.' },
  { key: 'warrior_rally', name: 'Rally', className: 'Warrior', level: 4, kind: 'utility', resource: 'stamina', description: 'Bolster party defenses for a few rounds.' },
  { key: 'warrior_crushing_blow', name: 'Crushing Blow', className: 'Warrior', level: 5, kind: 'combat', resource: 'stamina', description: 'A brutal finishing strike.' },

  { key: 'rogue_backstab', name: 'Backstab', className: 'Rogue', level: 1, kind: 'combat', resource: 'stamina', description: 'Strike from the shadows for extra damage.' },
  { key: 'rogue_smoke_step', name: 'Smoke Step', className: 'Rogue', level: 2, kind: 'utility', resource: 'stamina', description: 'Slip away to reduce your threat.' },
  { key: 'rogue_bleed', name: 'Bleed', className: 'Rogue', level: 3, kind: 'combat', resource: 'stamina', description: 'Wound the enemy to cause lingering pain.' },
  { key: 'rogue_evasion', name: 'Evasion', className: 'Rogue', level: 4, kind: 'utility', resource: 'stamina', description: 'Briefly increase your chance to avoid attacks.' },
  { key: 'rogue_shadow_strike', name: 'Shadow Strike', className: 'Rogue', level: 5, kind: 'combat', resource: 'stamina', description: 'A deadly strike empowered by debuffs.' },

  { key: 'paladin_holy_strike', name: 'Holy Strike', className: 'Paladin', level: 1, kind: 'combat', resource: 'mana', description: 'Smite the enemy with holy power.' },
  { key: 'paladin_prayer', name: 'Prayer', className: 'Paladin', level: 2, kind: 'utility', resource: 'mana', description: 'Bless the party with greater vitality.' },
  { key: 'paladin_shield_of_faith', name: 'Shield of Faith', className: 'Paladin', level: 3, kind: 'combat', resource: 'mana', description: 'Raise a protective ward of faith.' },
  { key: 'paladin_devotion', name: 'Devotion', className: 'Paladin', level: 4, kind: 'utility', resource: 'mana', description: 'Inspire allies to strike harder.' },
  { key: 'paladin_radiant_smite', name: 'Radiant Smite', className: 'Paladin', level: 5, kind: 'combat', resource: 'mana', description: 'A radiant strike that burns the target.' },

  { key: 'ranger_aimed_shot', name: 'Aimed Shot', className: 'Ranger', level: 1, kind: 'combat', resource: 'stamina', description: 'A precise shot for solid damage.' },
  { key: 'ranger_track', name: 'Track', className: 'Ranger', level: 2, kind: 'utility', resource: 'mana', description: 'Sense stronger foes in the area.' },
  { key: 'ranger_rapid_shot', name: 'Rapid Shot', className: 'Ranger', level: 3, kind: 'combat', resource: 'stamina', description: 'Fire a quick volley of arrows.' },
  { key: 'ranger_natures_balm', name: "Nature's Balm", className: 'Ranger', level: 4, kind: 'utility', resource: 'mana', description: 'Draw on nature to mend your wounds.' },
  { key: 'ranger_piercing_arrow', name: 'Piercing Arrow', className: 'Ranger', level: 5, kind: 'combat', resource: 'stamina', description: 'An arrow that punches through armor.' },

  { key: 'necromancer_shadow_bolt', name: 'Shadow Bolt', className: 'Necromancer', level: 1, kind: 'combat', resource: 'mana', description: 'Hurl a bolt of shadow energy.' },
  { key: 'necromancer_siphon_vitality', name: 'Siphon Vitality', className: 'Necromancer', level: 2, kind: 'utility', resource: 'mana', description: 'Leech vitality to sustain yourself.' },
  { key: 'necromancer_wither', name: 'Wither', className: 'Necromancer', level: 3, kind: 'combat', resource: 'mana', description: 'Blight the enemy with a withering curse.' },
  { key: 'necromancer_bone_ward', name: 'Bone Ward', className: 'Necromancer', level: 4, kind: 'utility', resource: 'mana', description: 'A protective ward of bone and shadow.' },
  { key: 'necromancer_grave_surge', name: 'Grave Surge', className: 'Necromancer', level: 5, kind: 'combat', resource: 'mana', description: 'Unleash grave energy against the foe.' },

  { key: 'spellblade_arcane_slash', name: 'Arcane Slash', className: 'Spellblade', level: 1, kind: 'combat', resource: 'mana', description: 'A blade strike infused with arcane power.' },
  { key: 'spellblade_focus', name: 'Focus', className: 'Spellblade', level: 2, kind: 'utility', resource: 'stamina', description: 'Focus to improve your offense briefly.' },
  { key: 'spellblade_runic_strike', name: 'Runic Strike', className: 'Spellblade', level: 3, kind: 'combat', resource: 'mana', description: 'A runic strike that punishes weakened foes.' },
  { key: 'spellblade_ward', name: 'Ward', className: 'Spellblade', level: 4, kind: 'utility', resource: 'mana', description: 'Conjure a ward to increase defenses.' },
  { key: 'spellblade_spellstorm', name: 'Spellstorm', className: 'Spellblade', level: 5, kind: 'combat', resource: 'mana', description: 'Unleash a storm of arcane strikes.' },

  { key: 'shaman_spirit_bolt', name: 'Spirit Bolt', className: 'Shaman', level: 1, kind: 'combat', resource: 'mana', description: 'Hurl a bolt of spirit energy at the enemy.' },
  { key: 'shaman_totem_of_vigor', name: 'Totem of Vigor', className: 'Shaman', level: 2, kind: 'utility', resource: 'mana', description: 'Empower a party member with rapid healing.' },
  { key: 'shaman_hex', name: 'Hex', className: 'Shaman', level: 3, kind: 'combat', resource: 'mana', description: 'Hex the enemy to reduce their damage.' },
  { key: 'shaman_ancestral_ward', name: 'Ancestral Ward', className: 'Shaman', level: 4, kind: 'utility', resource: 'mana', description: 'Ward an ally with ancestral protection.' },
  { key: 'shaman_stormcall', name: 'Stormcall', className: 'Shaman', level: 5, kind: 'combat', resource: 'mana', description: 'Call down a storm to strike the target.' },

  { key: 'beastmaster_call_companion', name: 'Call Companion', className: 'Beastmaster', level: 1, kind: 'combat', resource: 'stamina', description: 'Command a companion beast to strike.' },
  { key: 'beastmaster_pack_bond', name: 'Pack Bond', className: 'Beastmaster', level: 2, kind: 'utility', resource: 'stamina', description: 'Strengthen allies with the pack’s ferocity.' },
  { key: 'beastmaster_beast_fang', name: 'Beast Fang', className: 'Beastmaster', level: 3, kind: 'combat', resource: 'stamina', description: 'Your beast rends the target viciously.' },
  { key: 'beastmaster_wild_howl', name: 'Wild Howl', className: 'Beastmaster', level: 4, kind: 'utility', resource: 'stamina', description: 'A primal howl that emboldens the party.' },
  { key: 'beastmaster_alpha_assault', name: 'Alpha Assault', className: 'Beastmaster', level: 5, kind: 'combat', resource: 'stamina', description: 'Command an alpha strike from your beast.' },

  { key: 'monk_kick', name: 'Kick', className: 'Monk', level: 1, kind: 'combat', resource: 'stamina', description: 'A swift kick to disrupt the enemy.' },
  { key: 'monk_meditation', name: 'Meditation', className: 'Monk', level: 2, kind: 'utility', resource: 'stamina', description: 'Calm yourself to recover more quickly.' },
  { key: 'monk_palm_strike', name: 'Palm Strike', className: 'Monk', level: 3, kind: 'combat', resource: 'stamina', description: 'A focused palm strike.' },
  { key: 'monk_inner_focus', name: 'Inner Focus', className: 'Monk', level: 4, kind: 'utility', resource: 'stamina', description: 'Heighten your defenses for a short time.' },
  { key: 'monk_tiger_flurry', name: 'Tiger Flurry', className: 'Monk', level: 5, kind: 'combat', resource: 'stamina', description: 'A flurry of rapid strikes.' },

  { key: 'druid_thorn_lash', name: 'Thorn Lash', className: 'Druid', level: 1, kind: 'combat', resource: 'mana', description: 'Whip the enemy with thorned vines.' },
  { key: 'druid_regrowth', name: 'Regrowth', className: 'Druid', level: 2, kind: 'utility', resource: 'mana', description: 'Restore health to an ally.' },
  { key: 'druid_bramble', name: 'Bramble', className: 'Druid', level: 3, kind: 'combat', resource: 'mana', description: 'Entangling brambles damage over time.' },
  { key: 'druid_natures_gift', name: "Nature's Gift", className: 'Druid', level: 4, kind: 'utility', resource: 'mana', description: 'Bless the party with a natural boon.' },
  { key: 'druid_wild_surge', name: 'Wild Surge', className: 'Druid', level: 5, kind: 'combat', resource: 'mana', description: 'Unleash a burst of wild energy.' },

  { key: 'reaver_dark_cut', name: 'Dark Cut', className: 'Reaver', level: 1, kind: 'combat', resource: 'mana', description: 'A darkly empowered melee strike.' },
  { key: 'reaver_blood_pact', name: 'Blood Pact', className: 'Reaver', level: 2, kind: 'utility', resource: 'stamina', description: 'Sacrificial pact to bolster endurance.' },
  { key: 'reaver_soul_rend', name: 'Soul Rend', className: 'Reaver', level: 3, kind: 'combat', resource: 'mana', description: 'Rend the soul of your enemy.' },
  { key: 'reaver_dread_aura', name: 'Dread Aura', className: 'Reaver', level: 4, kind: 'utility', resource: 'mana', description: 'An aura that weakens enemy offense.' },
  { key: 'reaver_oblivion', name: 'Oblivion', className: 'Reaver', level: 5, kind: 'combat', resource: 'mana', description: 'Annihilating strike from the void.' },

  { key: 'summoner_arcane_bolt', name: 'Arcane Bolt', className: 'Summoner', level: 1, kind: 'combat', resource: 'mana', description: 'Arcane bolt of summoned power.' },
  { key: 'summoner_familiar', name: 'Familiar', className: 'Summoner', level: 2, kind: 'utility', resource: 'mana', description: 'A familiar that feeds your mana.' },
  { key: 'summoner_conjured_spike', name: 'Conjured Spike', className: 'Summoner', level: 3, kind: 'combat', resource: 'mana', description: 'A conjured spike that impales the foe.' },
  { key: 'summoner_empower', name: 'Empower', className: 'Summoner', level: 4, kind: 'utility', resource: 'mana', description: 'Empower the party’s attacks briefly.' },
  { key: 'summoner_spectral_lance', name: 'Spectral Lance', className: 'Summoner', level: 5, kind: 'combat', resource: 'mana', description: 'A spectral lance of raw magic.' },
];

export const abilitiesByClass = (className: string, level: number) =>
  abilities.filter(
    (ability) =>
      ability.className.toLowerCase() === className.toLowerCase() && ability.level <= level
  );
