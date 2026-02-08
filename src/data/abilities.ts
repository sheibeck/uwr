export type Ability = {
  key: string;
  name: string;
  className: string;
  level: number;
  kind: 'combat' | 'utility';
  resource: 'mana' | 'stamina';
};

export const abilities: Ability[] = [
  { key: 'bard_discordant_note', name: 'Discordant Note', className: 'Bard', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'bard_song_of_ease', name: 'Song of Ease', className: 'Bard', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'bard_echoed_chord', name: 'Echoed Chord', className: 'Bard', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'bard_harmony', name: 'Harmony', className: 'Bard', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'bard_crushing_crescendo', name: 'Crushing Crescendo', className: 'Bard', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'enchanter_mind_lash', name: 'Mind Lash', className: 'Enchanter', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'enchanter_clarity', name: 'Clarity', className: 'Enchanter', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'enchanter_slow', name: 'Slow', className: 'Enchanter', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'enchanter_clarity_ii', name: 'Clarity II', className: 'Enchanter', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'enchanter_charm_fray', name: 'Charm Fray', className: 'Enchanter', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'cleric_minor_heal', name: 'Minor Heal', className: 'Cleric', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'cleric_blessing', name: 'Blessing', className: 'Cleric', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'cleric_smite', name: 'Smite', className: 'Cleric', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'cleric_sanctuary', name: 'Sanctuary', className: 'Cleric', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'cleric_heal', name: 'Heal', className: 'Cleric', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'warrior_slam', name: 'Slam', className: 'Warrior', level: 1, kind: 'combat', resource: 'stamina' },
  { key: 'warrior_shout', name: 'Shout', className: 'Warrior', level: 2, kind: 'utility', resource: 'stamina' },
  { key: 'warrior_cleave', name: 'Cleave', className: 'Warrior', level: 3, kind: 'combat', resource: 'stamina' },
  { key: 'warrior_rally', name: 'Rally', className: 'Warrior', level: 4, kind: 'utility', resource: 'stamina' },
  { key: 'warrior_crushing_blow', name: 'Crushing Blow', className: 'Warrior', level: 5, kind: 'combat', resource: 'stamina' },

  { key: 'rogue_backstab', name: 'Backstab', className: 'Rogue', level: 1, kind: 'combat', resource: 'stamina' },
  { key: 'rogue_smoke_step', name: 'Smoke Step', className: 'Rogue', level: 2, kind: 'utility', resource: 'stamina' },
  { key: 'rogue_bleed', name: 'Bleed', className: 'Rogue', level: 3, kind: 'combat', resource: 'stamina' },
  { key: 'rogue_evasion', name: 'Evasion', className: 'Rogue', level: 4, kind: 'utility', resource: 'stamina' },
  { key: 'rogue_shadow_strike', name: 'Shadow Strike', className: 'Rogue', level: 5, kind: 'combat', resource: 'stamina' },

  { key: 'paladin_holy_strike', name: 'Holy Strike', className: 'Paladin', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'paladin_prayer', name: 'Prayer', className: 'Paladin', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'paladin_shield_of_faith', name: 'Shield of Faith', className: 'Paladin', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'paladin_devotion', name: 'Devotion', className: 'Paladin', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'paladin_radiant_smite', name: 'Radiant Smite', className: 'Paladin', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'ranger_aimed_shot', name: 'Aimed Shot', className: 'Ranger', level: 1, kind: 'combat', resource: 'stamina' },
  { key: 'ranger_track', name: 'Track', className: 'Ranger', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'ranger_rapid_shot', name: 'Rapid Shot', className: 'Ranger', level: 3, kind: 'combat', resource: 'stamina' },
  { key: 'ranger_natures_balm', name: "Nature's Balm", className: 'Ranger', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'ranger_piercing_arrow', name: 'Piercing Arrow', className: 'Ranger', level: 5, kind: 'combat', resource: 'stamina' },

  { key: 'necromancer_shadow_bolt', name: 'Shadow Bolt', className: 'Necromancer', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'necromancer_siphon_vitality', name: 'Siphon Vitality', className: 'Necromancer', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'necromancer_wither', name: 'Wither', className: 'Necromancer', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'necromancer_bone_ward', name: 'Bone Ward', className: 'Necromancer', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'necromancer_grave_surge', name: 'Grave Surge', className: 'Necromancer', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'spellblade_arcane_slash', name: 'Arcane Slash', className: 'Spellblade', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'spellblade_focus', name: 'Focus', className: 'Spellblade', level: 2, kind: 'utility', resource: 'stamina' },
  { key: 'spellblade_runic_strike', name: 'Runic Strike', className: 'Spellblade', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'spellblade_ward', name: 'Ward', className: 'Spellblade', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'spellblade_spellstorm', name: 'Spellstorm', className: 'Spellblade', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'shaman_spirit_bolt', name: 'Spirit Bolt', className: 'Shaman', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'shaman_totem_of_vigor', name: 'Totem of Vigor', className: 'Shaman', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'shaman_hex', name: 'Hex', className: 'Shaman', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'shaman_ancestral_ward', name: 'Ancestral Ward', className: 'Shaman', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'shaman_stormcall', name: 'Stormcall', className: 'Shaman', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'beastmaster_call_companion', name: 'Call Companion', className: 'Beastmaster', level: 1, kind: 'combat', resource: 'stamina' },
  { key: 'beastmaster_pack_bond', name: 'Pack Bond', className: 'Beastmaster', level: 2, kind: 'utility', resource: 'stamina' },
  { key: 'beastmaster_beast_fang', name: 'Beast Fang', className: 'Beastmaster', level: 3, kind: 'combat', resource: 'stamina' },
  { key: 'beastmaster_wild_howl', name: 'Wild Howl', className: 'Beastmaster', level: 4, kind: 'utility', resource: 'stamina' },
  { key: 'beastmaster_alpha_assault', name: 'Alpha Assault', className: 'Beastmaster', level: 5, kind: 'combat', resource: 'stamina' },

  { key: 'monk_kick', name: 'Kick', className: 'Monk', level: 1, kind: 'combat', resource: 'stamina' },
  { key: 'monk_meditation', name: 'Meditation', className: 'Monk', level: 2, kind: 'utility', resource: 'stamina' },
  { key: 'monk_palm_strike', name: 'Palm Strike', className: 'Monk', level: 3, kind: 'combat', resource: 'stamina' },
  { key: 'monk_inner_focus', name: 'Inner Focus', className: 'Monk', level: 4, kind: 'utility', resource: 'stamina' },
  { key: 'monk_tiger_flurry', name: 'Tiger Flurry', className: 'Monk', level: 5, kind: 'combat', resource: 'stamina' },

  { key: 'druid_thorn_lash', name: 'Thorn Lash', className: 'Druid', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'druid_regrowth', name: 'Regrowth', className: 'Druid', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'druid_bramble', name: 'Bramble', className: 'Druid', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'druid_natures_gift', name: "Nature's Gift", className: 'Druid', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'druid_wild_surge', name: 'Wild Surge', className: 'Druid', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'reaver_dark_cut', name: 'Dark Cut', className: 'Reaver', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'reaver_blood_pact', name: 'Blood Pact', className: 'Reaver', level: 2, kind: 'utility', resource: 'stamina' },
  { key: 'reaver_soul_rend', name: 'Soul Rend', className: 'Reaver', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'reaver_dread_aura', name: 'Dread Aura', className: 'Reaver', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'reaver_oblivion', name: 'Oblivion', className: 'Reaver', level: 5, kind: 'combat', resource: 'mana' },

  { key: 'summoner_arcane_bolt', name: 'Arcane Bolt', className: 'Summoner', level: 1, kind: 'combat', resource: 'mana' },
  { key: 'summoner_familiar', name: 'Familiar', className: 'Summoner', level: 2, kind: 'utility', resource: 'mana' },
  { key: 'summoner_conjured_spike', name: 'Conjured Spike', className: 'Summoner', level: 3, kind: 'combat', resource: 'mana' },
  { key: 'summoner_empower', name: 'Empower', className: 'Summoner', level: 4, kind: 'utility', resource: 'mana' },
  { key: 'summoner_spectral_lance', name: 'Spectral Lance', className: 'Summoner', level: 5, kind: 'combat', resource: 'mana' },
];

export const abilitiesByClass = (className: string, level: number) =>
  abilities.filter(
    (ability) =>
      ability.className.toLowerCase() === className.toLowerCase() && ability.level <= level
  );
