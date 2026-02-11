export type Ability = {
  key: string;
  name: string;
  className: string;
  level: number;
  kind: 'combat' | 'utility';
  resource: 'mana' | 'stamina';
  description: string;
  castSeconds: number;
  cooldownSeconds?: number;
};

export const abilities: Ability[] = [
  { key: 'bard_discordant_note', name: 'Discordant Note', className: 'Bard', level: 1, kind: 'combat', resource: 'mana', description: 'A quick note that sharpens the partyâ€™s edge.', castSeconds: 0, cooldownSeconds: 6 },
  { key: 'bard_ballad_of_resolve', name: 'Ballad of Resolve', className: 'Bard', level: 2, kind: 'utility', resource: 'mana', description: 'A long-form ballad that bolsters party strength.', castSeconds: 0, cooldownSeconds: 600 },
  { key: 'bard_echoed_chord', name: 'Echoed Chord', className: 'Bard', level: 3, kind: 'combat', resource: 'mana', description: 'A resonant strike that grows stronger with allies nearby.', castSeconds: 0 },
  { key: 'bard_harmony', name: 'Harmony', className: 'Bard', level: 4, kind: 'utility', resource: 'mana', description: 'Bolster the party with a brief surge of coordination.', castSeconds: 0 },
  { key: 'bard_crushing_crescendo', name: 'Crushing Crescendo', className: 'Bard', level: 5, kind: 'combat', resource: 'mana', description: 'A powerful crescendo that punishes weakened foes.', castSeconds: 0 },

  { key: 'enchanter_mind_fray', name: 'Mind Fray', className: 'Enchanter', level: 1, kind: 'combat', resource: 'mana', description: 'Mind‑rending magic that weakens and lingers.', castSeconds: 1, cooldownSeconds: 6 },
  { key: 'enchanter_veil_of_calm', name: 'Veil of Calm', className: 'Enchanter', level: 2, kind: 'utility', resource: 'mana', description: 'Soften your next pull to reduce the chance of adds.', castSeconds: 0, cooldownSeconds: 90 },
  { key: 'enchanter_slow', name: 'Slow', className: 'Enchanter', level: 3, kind: 'combat', resource: 'mana', description: 'Reduce the enemy’s attack power for a short duration.', castSeconds: 1 },
  { key: 'enchanter_clarity_ii', name: 'Clarity II', className: 'Enchanter', level: 4, kind: 'utility', resource: 'mana', description: 'Restore more mana to a party member.', castSeconds: 0 },
  { key: 'enchanter_charm_fray', name: 'Charm Fray', className: 'Enchanter', level: 5, kind: 'combat', resource: 'mana', description: 'Damage and weaken the enemy’s offense.', castSeconds: 1 },

  { key: 'cleric_mend', name: 'Mend', className: 'Cleric', level: 1, kind: 'utility', resource: 'mana', description: 'Restore health to a single ally.', castSeconds: 1 },
  { key: 'cleric_sanctify', name: 'Sanctify', className: 'Cleric', level: 2, kind: 'utility', resource: 'mana', description: 'Cleanse one harmful effect from an ally.', castSeconds: 0, cooldownSeconds: 30 },
  { key: 'cleric_smite', name: 'Smite', className: 'Cleric', level: 3, kind: 'combat', resource: 'mana', description: 'Holy strike that damages an enemy.', castSeconds: 1 },
  { key: 'cleric_sanctuary', name: 'Sanctuary', className: 'Cleric', level: 4, kind: 'utility', resource: 'mana', description: 'Briefly fortify the party’s defenses.', castSeconds: 0 },
  { key: 'cleric_heal', name: 'Heal', className: 'Cleric', level: 5, kind: 'utility', resource: 'mana', description: 'A strong single-target heal.', castSeconds: 2 },

  { key: 'wizard_magic_missile', name: 'Magic Missile', className: 'Wizard', level: 1, kind: 'combat', resource: 'mana', description: 'A focused bolt of arcane force.', castSeconds: 1 },
  { key: 'wizard_arcane_reservoir', name: 'Arcane Reservoir', className: 'Wizard', level: 2, kind: 'utility', resource: 'mana', description: 'Tap a personal reservoir to restore mana.', castSeconds: 0, cooldownSeconds: 300 },
  { key: 'wizard_frost_shard', name: 'Frost Shard', className: 'Wizard', level: 3, kind: 'combat', resource: 'mana', description: 'Chilled magic that weakens enemy offense.', castSeconds: 1 },
  { key: 'wizard_mana_shield', name: 'Mana Shield', className: 'Wizard', level: 4, kind: 'utility', resource: 'mana', description: 'A protective arcane barrier for an ally.', castSeconds: 0 },
  { key: 'wizard_lightning_surge', name: 'Lightning Surge', className: 'Wizard', level: 5, kind: 'combat', resource: 'mana', description: 'A violent surge of lightning.', castSeconds: 2 },

  { key: 'warrior_slam', name: 'Slam', className: 'Warrior', level: 1, kind: 'combat', resource: 'stamina', description: 'A crushing blow that staggers the enemy.', castSeconds: 0, cooldownSeconds: 6 },
  { key: 'warrior_intimidating_presence', name: 'Intimidating Presence', className: 'Warrior', level: 2, kind: 'utility', resource: 'stamina', description: 'Intimidate the foe, reducing its damage.', castSeconds: 0, cooldownSeconds: 20 },
  { key: 'warrior_cleave', name: 'Cleave', className: 'Warrior', level: 3, kind: 'combat', resource: 'stamina', description: 'A powerful cleaving blow.', castSeconds: 0 },
  { key: 'warrior_rally', name: 'Rally', className: 'Warrior', level: 4, kind: 'utility', resource: 'stamina', description: 'Bolster party defenses for a few rounds.', castSeconds: 0 },
  { key: 'warrior_crushing_blow', name: 'Crushing Blow', className: 'Warrior', level: 5, kind: 'combat', resource: 'stamina', description: 'A brutal finishing strike.', castSeconds: 0 },

  { key: 'rogue_shadow_cut', name: 'Shadow Cut', className: 'Rogue', level: 1, kind: 'combat', resource: 'stamina', description: 'A precise strike that leaves a bleeding wound.', castSeconds: 0, cooldownSeconds: 4 },
  { key: 'rogue_pickpocket', name: 'Pickpocket', className: 'Rogue', level: 2, kind: 'utility', resource: 'stamina', description: 'Steal a small prize during combat.', castSeconds: 0, cooldownSeconds: 120 },
  { key: 'rogue_bleed', name: 'Bleed', className: 'Rogue', level: 3, kind: 'combat', resource: 'stamina', description: 'Wound the enemy to cause lingering pain.', castSeconds: 0 },
  { key: 'rogue_evasion', name: 'Evasion', className: 'Rogue', level: 4, kind: 'utility', resource: 'stamina', description: 'Briefly increase your chance to avoid attacks.', castSeconds: 0 },
  { key: 'rogue_shadow_strike', name: 'Shadow Strike', className: 'Rogue', level: 5, kind: 'combat', resource: 'stamina', description: 'A deadly strike empowered by debuffs.', castSeconds: 0 },

  { key: 'paladin_holy_strike', name: 'Holy Strike', className: 'Paladin', level: 1, kind: 'combat', resource: 'mana', description: 'Smite the enemy and steady your guard.', castSeconds: 0, cooldownSeconds: 4 },
  { key: 'paladin_lay_on_hands', name: 'Lay on Hands', className: 'Paladin', level: 2, kind: 'utility', resource: 'mana', description: 'A massive heal with a long cooldown.', castSeconds: 0, cooldownSeconds: 600 },
  { key: 'paladin_shield_of_faith', name: 'Shield of Faith', className: 'Paladin', level: 3, kind: 'combat', resource: 'mana', description: 'Raise a protective ward of faith.', castSeconds: 1 },
  { key: 'paladin_devotion', name: 'Devotion', className: 'Paladin', level: 4, kind: 'utility', resource: 'mana', description: 'Inspire allies to strike harder.', castSeconds: 0 },
  { key: 'paladin_radiant_smite', name: 'Radiant Smite', className: 'Paladin', level: 5, kind: 'combat', resource: 'mana', description: 'A radiant strike that burns the target.', castSeconds: 1 },

  { key: 'ranger_marked_shot', name: 'Marked Shot', className: 'Ranger', level: 1, kind: 'combat', resource: 'stamina', description: 'Tag the foe to take extra damage briefly.', castSeconds: 0, cooldownSeconds: 6 },
  { key: 'ranger_track', name: 'Track', className: 'Ranger', level: 2, kind: 'utility', resource: 'mana', description: 'Reveal local creatures and choose one to engage.', castSeconds: 0, cooldownSeconds: 600 },
  { key: 'ranger_rapid_shot', name: 'Rapid Shot', className: 'Ranger', level: 3, kind: 'combat', resource: 'stamina', description: 'Fire a quick volley of arrows.', castSeconds: 0 },
  { key: 'ranger_natures_balm', name: "Nature's Balm", className: 'Ranger', level: 4, kind: 'utility', resource: 'mana', description: 'Draw on nature to mend your wounds.', castSeconds: 0 },
  { key: 'ranger_piercing_arrow', name: 'Piercing Arrow', className: 'Ranger', level: 5, kind: 'combat', resource: 'stamina', description: 'An arrow that punches through armor.', castSeconds: 1 },

  { key: 'necromancer_plague_spark', name: 'Plague Spark', className: 'Necromancer', level: 1, kind: 'combat', resource: 'mana', description: 'Blight the target with a lingering plague and siphon a spark of life.', castSeconds: 1 },
  { key: 'necromancer_bone_servant', name: 'Bone Servant', className: 'Necromancer', level: 2, kind: 'utility', resource: 'mana', description: 'Summon a bone servant (pet system pending).', castSeconds: 0, cooldownSeconds: 60 },
  { key: 'necromancer_wither', name: 'Wither', className: 'Necromancer', level: 3, kind: 'combat', resource: 'mana', description: 'Blight the enemy with a withering curse.', castSeconds: 1 },
  { key: 'necromancer_bone_ward', name: 'Bone Ward', className: 'Necromancer', level: 4, kind: 'utility', resource: 'mana', description: 'A protective ward of bone and shadow.', castSeconds: 0 },
  { key: 'necromancer_grave_surge', name: 'Grave Surge', className: 'Necromancer', level: 5, kind: 'combat', resource: 'mana', description: 'Unleash grave energy against the foe.', castSeconds: 2 },

  { key: 'spellblade_arcane_slash', name: 'Arcane Slash', className: 'Spellblade', level: 1, kind: 'combat', resource: 'mana', description: 'An arcane strike that shreds enemy armor briefly.', castSeconds: 0, cooldownSeconds: 3 },
  { key: 'spellblade_rune_ward', name: 'Rune Ward', className: 'Spellblade', level: 2, kind: 'utility', resource: 'mana', description: 'A runic shield that absorbs the next hit.', castSeconds: 0, cooldownSeconds: 60 },
  { key: 'spellblade_runic_strike', name: 'Runic Strike', className: 'Spellblade', level: 3, kind: 'combat', resource: 'mana', description: 'A runic strike that punishes weakened foes.', castSeconds: 1 },
  { key: 'spellblade_ward', name: 'Ward', className: 'Spellblade', level: 4, kind: 'utility', resource: 'mana', description: 'Conjure a ward to increase defenses.', castSeconds: 0 },
  { key: 'spellblade_spellstorm', name: 'Spellstorm', className: 'Spellblade', level: 5, kind: 'combat', resource: 'mana', description: 'Unleash a storm of arcane strikes.', castSeconds: 2 },

  { key: 'shaman_spirit_mender', name: 'Spirit Mender', className: 'Shaman', level: 1, kind: 'utility', resource: 'mana', description: 'Heal an ally and grant a brief regeneration.', castSeconds: 1, cooldownSeconds: 6 },
  { key: 'shaman_spirit_wolf', name: 'Spirit Wolf', className: 'Shaman', level: 2, kind: 'utility', resource: 'mana', description: 'Summon a spirit wolf (pet system pending).', castSeconds: 0, cooldownSeconds: 60 },
  { key: 'shaman_hex', name: 'Hex', className: 'Shaman', level: 3, kind: 'combat', resource: 'mana', description: 'Hex the enemy to reduce their damage.', castSeconds: 1, cooldownSeconds: 0 },
  { key: 'shaman_ancestral_ward', name: 'Ancestral Ward', className: 'Shaman', level: 4, kind: 'utility', resource: 'mana', description: 'Ward an ally with ancestral protection.', castSeconds: 0, cooldownSeconds: 0 },
  { key: 'shaman_stormcall', name: 'Stormcall', className: 'Shaman', level: 5, kind: 'combat', resource: 'mana', description: 'Call down a storm to strike the target.', castSeconds: 2, cooldownSeconds: 0 },

  { key: 'beastmaster_pack_rush', name: 'Pack Rush', className: 'Beastmaster', level: 1, kind: 'combat', resource: 'stamina', description: 'Your pack surges in with a flurry of strikes.', castSeconds: 0, cooldownSeconds: 8 },
  { key: 'beastmaster_call_beast', name: 'Call Beast', className: 'Beastmaster', level: 2, kind: 'utility', resource: 'stamina', description: 'Call a beast ally (pet system pending).', castSeconds: 0, cooldownSeconds: 60 },
  { key: 'beastmaster_beast_fang', name: 'Beast Fang', className: 'Beastmaster', level: 3, kind: 'combat', resource: 'stamina', description: 'Your beast rends the target viciously.', castSeconds: 0 },
  { key: 'beastmaster_wild_howl', name: 'Wild Howl', className: 'Beastmaster', level: 4, kind: 'utility', resource: 'stamina', description: 'A primal howl that emboldens the party.', castSeconds: 0 },
  { key: 'beastmaster_alpha_assault', name: 'Alpha Assault', className: 'Beastmaster', level: 5, kind: 'combat', resource: 'stamina', description: 'Command an alpha strike from your beast.', castSeconds: 0 },

  { key: 'monk_crippling_kick', name: 'Crippling Kick', className: 'Monk', level: 1, kind: 'combat', resource: 'stamina', description: 'A sharp kick that weakens enemy offense.', castSeconds: 0, cooldownSeconds: 5 },
  { key: 'monk_centering', name: 'Centering', className: 'Monk', level: 2, kind: 'utility', resource: 'stamina', description: 'Your next ability costs no stamina.', castSeconds: 0, cooldownSeconds: 60 },
  { key: 'monk_palm_strike', name: 'Palm Strike', className: 'Monk', level: 3, kind: 'combat', resource: 'stamina', description: 'A focused palm strike.', castSeconds: 0 },
  { key: 'monk_inner_focus', name: 'Inner Focus', className: 'Monk', level: 4, kind: 'utility', resource: 'stamina', description: 'Heighten your defenses for a short time.', castSeconds: 0 },
  { key: 'monk_tiger_flurry', name: 'Tiger Flurry', className: 'Monk', level: 5, kind: 'combat', resource: 'stamina', description: 'A flurry of rapid strikes.', castSeconds: 0 },

  { key: 'druid_thorn_lash', name: 'Thorn Lash', className: 'Druid', level: 1, kind: 'combat', resource: 'mana', description: 'Vines lash the enemy and soothe you slightly.', castSeconds: 1, cooldownSeconds: 6 },
  { key: 'druid_natures_mark', name: "Nature's Mark", className: 'Druid', level: 2, kind: 'utility', resource: 'mana', description: 'Instantly gather nearby resources.', castSeconds: 0, cooldownSeconds: 120 },
  { key: 'druid_bramble', name: 'Bramble', className: 'Druid', level: 3, kind: 'combat', resource: 'mana', description: 'Entangling brambles damage over time.', castSeconds: 1 },
  { key: 'druid_natures_gift', name: "Nature's Gift", className: 'Druid', level: 4, kind: 'utility', resource: 'mana', description: 'Bless the party with a natural boon.', castSeconds: 0 },
  { key: 'druid_wild_surge', name: 'Wild Surge', className: 'Druid', level: 5, kind: 'combat', resource: 'mana', description: 'Unleash a burst of wild energy.', castSeconds: 2 },

  { key: 'reaver_blood_rend', name: 'Blood Rend', className: 'Reaver', level: 1, kind: 'combat', resource: 'mana', description: 'A brutal strike that siphons vitality.', castSeconds: 0, cooldownSeconds: 6 },
  { key: 'reaver_blood_pact', name: 'Blood Pact', className: 'Reaver', level: 2, kind: 'utility', resource: 'stamina', description: 'Sacrificial pact to bolster endurance.', castSeconds: 0 },
  { key: 'reaver_soul_rend', name: 'Soul Rend', className: 'Reaver', level: 3, kind: 'combat', resource: 'mana', description: 'Rend the soul of your enemy.', castSeconds: 1 },
  { key: 'reaver_dread_aura', name: 'Dread Aura', className: 'Reaver', level: 4, kind: 'utility', resource: 'mana', description: 'An aura that weakens enemy offense.', castSeconds: 0 },
  { key: 'reaver_oblivion', name: 'Oblivion', className: 'Reaver', level: 5, kind: 'combat', resource: 'mana', description: 'Annihilating strike from the void.', castSeconds: 2 },

  { key: 'summoner_familiar_strike', name: 'Familiar Strike', className: 'Summoner', level: 1, kind: 'combat', resource: 'mana', description: 'Your familiar lashes out and steadies your focus.', castSeconds: 0, cooldownSeconds: 6 },
  { key: 'summoner_arcane_familiar', name: 'Arcane Familiar', className: 'Summoner', level: 2, kind: 'utility', resource: 'mana', description: 'Summon an arcane familiar (pet system pending).', castSeconds: 0, cooldownSeconds: 60 },
  { key: 'summoner_conjured_spike', name: 'Conjured Spike', className: 'Summoner', level: 3, kind: 'combat', resource: 'mana', description: 'A conjured spike that impales the foe.', castSeconds: 1 },
  { key: 'summoner_empower', name: 'Empower', className: 'Summoner', level: 4, kind: 'utility', resource: 'mana', description: 'Empower the party’s attacks briefly.', castSeconds: 0 },
  { key: 'summoner_spectral_lance', name: 'Spectral Lance', className: 'Summoner', level: 5, kind: 'combat', resource: 'mana', description: 'A spectral lance of raw magic.', castSeconds: 2 },
];

export const abilitiesByClass = (className: string, level: number) =>
  abilities.filter(
    (ability) =>
      ability.className.toLowerCase() === className.toLowerCase() && ability.level <= level
  );


