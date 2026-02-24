// named_enemy_defs.ts
// Named enemy definitions with enhanced stats and class-specific loot tables.
// These are boss-tier enemies (isBoss=true) that spawn alone with significantly
// higher stats than normal enemies of the same level.

export interface NamedEnemyLootDef {
  junkChance: bigint;
  gearChance: bigint;
  goldMin: bigint;
  goldMax: bigint;
  entries: { itemName: string; weight: bigint }[];
}

export interface NamedEnemyRoleDef {
  roleKey: string;
  displayName: string;
  role: string;
  roleDetail: string;
  abilityProfile: string;
}

export interface NamedEnemyDef {
  name: string;
  role: string;
  roleDetail: string;
  abilityProfile: string;
  terrainTypes: string;
  creatureType: string;
  timeOfDay: string;
  socialGroup: string;
  socialRadius: bigint;
  awareness: string;
  groupMin: bigint;
  groupMax: bigint;
  armorClass: bigint;
  level: bigint;
  maxHp: bigint;
  baseDamage: bigint;
  xpReward: bigint;
  factionName: string;
  roles: NamedEnemyRoleDef[];
  loot: NamedEnemyLootDef;
}

// ---------------------------------------------------------------------------
// NAMED ENEMY DEFINITIONS
// ---------------------------------------------------------------------------
// Stats are enhanced vs normal enemies of same level: ~2-3x HP, ~1.5x damage, ~1.5x armor
// Each named enemy spawns alone (groupMin/Max = 1) and has isBoss = true
// Loot tables use tier=2n with terrainType="named_<snake_case_name>" for unique routing

export const NAMED_ENEMY_DEFS: NamedEnemyDef[] = [
  // =========================================================================
  // HOLLOWMERE VALE (Starter, levels 3-5, dangerMultiplier 100)
  // Normal enemies at this tier: HP ~30-50, damage ~5-8, armor ~8-14
  // Named enemies: HP 80-150, damage 12-18, armor 15-20
  // =========================================================================

  // 1. Rotfang — rogue, druid, ranger loot (leather/dagger gear)
  {
    name: 'Rotfang',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'venomous bite, lunge',
    terrainTypes: 'swamp',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 16n,
    level: 5n,
    maxHp: 120n,
    baseDamage: 15n,
    xpReward: 100n,
    factionName: 'Verdant Circle',
    roles: [
      { roleKey: 'rotfang_alpha', displayName: 'Rotfang', role: 'dps', roleDetail: 'melee', abilityProfile: 'venomous bite, lunge' },
    ],
    loot: {
      junkChance: 15n,
      gearChance: 70n,
      goldMin: 5n,
      goldMax: 10n,
      entries: [
        { itemName: 'Chipped Dagger', weight: 18n },
        { itemName: 'Scuffed Jerkin', weight: 18n },
        { itemName: 'Scuffed Leggings', weight: 15n },
        { itemName: 'Leather Bracers', weight: 10n },
        { itemName: 'Rough Band', weight: 8n },
      ],
    },
  },

  // 2. Mirewalker Thane — paladin, cleric, shaman loot (chain/mace gear)
  {
    name: 'Mirewalker Thane',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'shield bash, war cry',
    terrainTypes: 'swamp',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 20n,
    level: 5n,
    maxHp: 150n,
    baseDamage: 12n,
    xpReward: 110n,
    factionName: 'Iron Compact',
    roles: [
      { roleKey: 'mirewalker_thane', displayName: 'Mirewalker Thane', role: 'tank', roleDetail: 'melee', abilityProfile: 'shield bash, war cry' },
    ],
    loot: {
      junkChance: 15n,
      gearChance: 70n,
      goldMin: 6n,
      goldMax: 12n,
      entries: [
        { itemName: 'Worn Mace', weight: 18n },
        { itemName: 'Dented Hauberk', weight: 18n },
        { itemName: 'Dented Greaves', weight: 15n },
        { itemName: 'Chain Coif', weight: 10n },
        { itemName: 'Traveler Necklace', weight: 8n },
      ],
    },
  },

  // 3. Thornmother — wizard, enchanter, necromancer, summoner loot (staff/cloth gear)
  {
    name: 'Thornmother',
    role: 'dps',
    roleDetail: 'caster',
    abilityProfile: 'thorn volley, root grasp',
    terrainTypes: 'woods',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 15n,
    level: 4n,
    maxHp: 90n,
    baseDamage: 14n,
    xpReward: 90n,
    factionName: 'Verdant Circle',
    roles: [
      { roleKey: 'thornmother', displayName: 'Thornmother', role: 'dps', roleDetail: 'caster', abilityProfile: 'thorn volley, root grasp' },
    ],
    loot: {
      junkChance: 15n,
      gearChance: 70n,
      goldMin: 5n,
      goldMax: 10n,
      entries: [
        { itemName: 'Gnarled Staff', weight: 18n },
        { itemName: 'Worn Robe', weight: 18n },
        { itemName: 'Worn Trousers', weight: 15n },
        { itemName: 'Cloth Hood', weight: 10n },
        { itemName: 'Glimmer Ring', weight: 8n },
      ],
    },
  },

  // 4. Ashwright — universal loot (accessories: earrings, cloak, neck)
  {
    name: 'Ashwright',
    role: 'dps',
    roleDetail: 'caster',
    abilityProfile: 'spirit blast, phase shift',
    terrainTypes: 'plains',
    creatureType: 'spirit',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 15n,
    level: 5n,
    maxHp: 100n,
    baseDamage: 16n,
    xpReward: 100n,
    factionName: 'Ashen Order',
    roles: [
      { roleKey: 'ashwright', displayName: 'Ashwright', role: 'dps', roleDetail: 'caster', abilityProfile: 'spirit blast, phase shift' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 75n,
      goldMin: 6n,
      goldMax: 12n,
      entries: [
        { itemName: 'Rough Band', weight: 18n },
        { itemName: 'Worn Cloak', weight: 18n },
        { itemName: 'Traveler Necklace', weight: 18n },
        { itemName: 'Glimmer Ring', weight: 15n },
        { itemName: 'Shaded Cloak', weight: 12n },
      ],
    },
  },

  // =========================================================================
  // EMBERMARCH FRINGE (Border, levels 8-12, dangerMultiplier 160)
  // Normal enemies at this tier: HP ~60-120, damage ~10-18, armor ~14-20
  // Named enemies: HP 200-400, damage 20-35, armor 22-30
  // =========================================================================

  // 5. Crag Tyrant — warrior, paladin loot (plate/greatsword gear)
  {
    name: 'Crag Tyrant',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'crushing blow, boulder toss',
    terrainTypes: 'mountains',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 28n,
    level: 10n,
    maxHp: 300n,
    baseDamage: 25n,
    xpReward: 200n,
    factionName: 'Verdant Circle',
    roles: [
      { roleKey: 'crag_tyrant', displayName: 'Crag Tyrant', role: 'tank', roleDetail: 'melee', abilityProfile: 'crushing blow, boulder toss' },
    ],
    loot: {
      junkChance: 12n,
      gearChance: 70n,
      goldMin: 8n,
      goldMax: 15n,
      entries: [
        { itemName: 'Steel Greatsword', weight: 18n },
        { itemName: 'Forged Cuirass', weight: 18n },
        { itemName: 'Forged Greaves', weight: 15n },
        { itemName: 'Iron Gauntlets', weight: 10n },
        { itemName: 'Silver Band', weight: 8n },
      ],
    },
  },

  // 6. Hexweaver Nyx — enchanter, necromancer, summoner, wizard loot (staff/cloth gear)
  {
    name: 'Hexweaver Nyx',
    role: 'dps',
    roleDetail: 'caster',
    abilityProfile: 'hex bolt, mana drain, dark ward',
    terrainTypes: 'woods',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 22n,
    level: 10n,
    maxHp: 250n,
    baseDamage: 30n,
    xpReward: 200n,
    factionName: 'Ashen Order',
    roles: [
      { roleKey: 'hexweaver_nyx', displayName: 'Hexweaver Nyx', role: 'dps', roleDetail: 'caster', abilityProfile: 'hex bolt, mana drain, dark ward' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 75n,
      goldMin: 8n,
      goldMax: 15n,
      entries: [
        { itemName: 'Oak Staff', weight: 18n },
        { itemName: 'Silken Robe', weight: 18n },
        { itemName: 'Silken Trousers', weight: 15n },
        { itemName: 'Stiletto', weight: 12n },
        { itemName: 'Arcane Loop', weight: 8n },
      ],
    },
  },

  // 7. Scorchfang — spellblade, reaver, rogue loot (leather/blade/sword gear)
  {
    name: 'Scorchfang',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'flame strike, rending claws',
    terrainTypes: 'plains',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 25n,
    level: 11n,
    maxHp: 320n,
    baseDamage: 28n,
    xpReward: 220n,
    factionName: 'Verdant Circle',
    roles: [
      { roleKey: 'scorchfang', displayName: 'Scorchfang', role: 'dps', roleDetail: 'melee', abilityProfile: 'flame strike, rending claws' },
    ],
    loot: {
      junkChance: 12n,
      gearChance: 70n,
      goldMin: 8n,
      goldMax: 14n,
      entries: [
        { itemName: 'Tempered Blade', weight: 18n },
        { itemName: 'Steel Longsword', weight: 15n },
        { itemName: 'Ranger Jerkin', weight: 18n },
        { itemName: 'Ranger Leggings', weight: 12n },
        { itemName: 'Stiletto', weight: 10n },
      ],
    },
  },

  // 8. Warden of Ash — warrior, reaver, beastmaster loot (chain/axe gear)
  {
    name: 'Warden of Ash',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'smash, flame aura, fortify',
    terrainTypes: 'mountains',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 30n,
    level: 12n,
    maxHp: 400n,
    baseDamage: 22n,
    xpReward: 250n,
    factionName: 'Ashen Order',
    roles: [
      { roleKey: 'warden_of_ash', displayName: 'Warden of Ash', role: 'tank', roleDetail: 'melee', abilityProfile: 'smash, flame aura, fortify' },
    ],
    loot: {
      junkChance: 12n,
      gearChance: 70n,
      goldMin: 10n,
      goldMax: 15n,
      entries: [
        { itemName: 'Hardened Axe', weight: 18n },
        { itemName: 'Riveted Hauberk', weight: 18n },
        { itemName: 'Riveted Greaves', weight: 15n },
        { itemName: 'Chain Bracers', weight: 10n },
        { itemName: 'Ember Pendant', weight: 8n },
      ],
    },
  },

  // 9. Smolderveil Banshee — bard, druid, shaman loot (rapier/cloth/mace gear)
  {
    name: 'Smolderveil Banshee',
    role: 'dps',
    roleDetail: 'caster',
    abilityProfile: 'wail, spectral chill, life drain',
    terrainTypes: 'swamp',
    creatureType: 'spirit',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 23n,
    level: 11n,
    maxHp: 280n,
    baseDamage: 32n,
    xpReward: 220n,
    factionName: 'Ashen Order',
    roles: [
      { roleKey: 'smolderveil_banshee', displayName: 'Smolderveil Banshee', role: 'dps', roleDetail: 'caster', abilityProfile: 'wail, spectral chill, life drain' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 75n,
      goldMin: 8n,
      goldMax: 14n,
      entries: [
        { itemName: 'Dueling Rapier', weight: 18n },
        { itemName: 'Flanged Mace', weight: 15n },
        { itemName: 'Silken Robe', weight: 15n },
        { itemName: 'Silken Slippers', weight: 10n },
        { itemName: 'Shaded Cloak', weight: 8n },
      ],
    },
  },

  // =========================================================================
  // EMBERMARCH DEPTHS (Dungeon, levels 13-16, dangerMultiplier 200)
  // Normal enemies at this tier: HP ~120-250, damage ~18-30, armor ~20-28
  // Named enemies: HP 400-700, damage 35-50, armor 28-38
  // =========================================================================

  // 10. Pyrelord Kazrak — warrior, paladin, spellblade loot (plate/greatsword gear)
  {
    name: 'Pyrelord Kazrak',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'inferno slash, molten shield, earthquake',
    terrainTypes: 'dungeon',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 35n,
    level: 15n,
    maxHp: 600n,
    baseDamage: 42n,
    xpReward: 400n,
    factionName: 'Iron Compact',
    roles: [
      { roleKey: 'pyrelord_kazrak', displayName: 'Pyrelord Kazrak', role: 'tank', roleDetail: 'melee', abilityProfile: 'inferno slash, molten shield, earthquake' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 80n,
      goldMin: 12n,
      goldMax: 15n,
      entries: [
        { itemName: 'Steel Greatsword', weight: 18n },
        { itemName: 'Forged Cuirass', weight: 18n },
        { itemName: 'Forged Greaves', weight: 15n },
        { itemName: 'Forged Boots', weight: 12n },
        { itemName: 'Vitality Cord', weight: 8n },
      ],
    },
  },

  // 11. Sootveil Archon — wizard, necromancer, enchanter loot (staff/cloth/dagger gear)
  {
    name: 'Sootveil Archon',
    role: 'dps',
    roleDetail: 'caster',
    abilityProfile: 'shadow bolt, necrotic wave, dark pact',
    terrainTypes: 'dungeon',
    creatureType: 'undead',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 28n,
    level: 14n,
    maxHp: 450n,
    baseDamage: 45n,
    xpReward: 350n,
    factionName: 'Ashen Order',
    roles: [
      { roleKey: 'sootveil_archon', displayName: 'Sootveil Archon', role: 'dps', roleDetail: 'caster', abilityProfile: 'shadow bolt, necrotic wave, dark pact' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 80n,
      goldMin: 10n,
      goldMax: 15n,
      entries: [
        { itemName: 'Oak Staff', weight: 18n },
        { itemName: 'Stiletto', weight: 15n },
        { itemName: 'Silken Robe', weight: 18n },
        { itemName: 'Silken Trousers', weight: 12n },
        { itemName: 'Arcane Loop', weight: 8n },
      ],
    },
  },

  // 12. Emberclaw Matriarch — ranger, rogue, druid loot (bow/leather gear)
  {
    name: 'Emberclaw Matriarch',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'savage rend, primal roar, flame breath',
    terrainTypes: 'dungeon',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: '',
    socialRadius: 0n,
    awareness: 'alert',
    groupMin: 1n,
    groupMax: 1n,
    armorClass: 32n,
    level: 16n,
    maxHp: 700n,
    baseDamage: 38n,
    xpReward: 500n,
    factionName: 'Verdant Circle',
    roles: [
      { roleKey: 'emberclaw_matriarch', displayName: 'Emberclaw Matriarch', role: 'dps', roleDetail: 'melee', abilityProfile: 'savage rend, primal roar, flame breath' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 80n,
      goldMin: 12n,
      goldMax: 15n,
      entries: [
        { itemName: 'Yew Bow', weight: 18n },
        { itemName: 'Ranger Jerkin', weight: 18n },
        { itemName: 'Ranger Leggings', weight: 15n },
        { itemName: 'Ranger Boots', weight: 12n },
        { itemName: 'Leather Gloves', weight: 10n },
      ],
    },
  },
];
