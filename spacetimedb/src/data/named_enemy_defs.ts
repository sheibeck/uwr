// named_enemy_defs.ts
// Named enemy definitions with enhanced stats and class-specific loot tables.
// These are boss-tier enemies (isBoss=true) that spawn alone with significantly
// higher stats than normal enemies of the same level.

import { WorldDropItemDef } from './item_defs';

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
  regionName: string;
  roles: NamedEnemyRoleDef[];
  loot: NamedEnemyLootDef;
}

// ---------------------------------------------------------------------------
// BOSS-UNIQUE RARE DROP DEFINITIONS
// ---------------------------------------------------------------------------
// Each named boss drops 2-3 unique rare items themed to that boss.
// Stats are slightly above common tier equivalents (+1-2 AC, +1-2 damage, +stat bonuses).
// Tier 1 (Hollowmere, bosses 1-4): requiredLevel 1n, tier 1n, vendorValue 15n
// Tier 1 (Silverpine/Greyveil, bosses 5-9): requiredLevel 3n, tier 1n, vendorValue 20n
// Tier 2 (Ironhold, bosses 10-11): requiredLevel 5n, tier 2n, vendorValue 30n
// Tier 2 (Dreadspire, boss 12): requiredLevel 7n, tier 2n, vendorValue 30n

export const BOSS_DROP_DEFS: WorldDropItemDef[] = [
  // =========================================================================
  // 1. ROTFANG — rogue, druid, ranger (leather/dagger)
  // =========================================================================
  {
    name: "Rotfang's Venomtooth",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'rogue,druid,ranger,shaman,monk,enchanter,necromancer,summoner,wizard',
    weaponType: 'dagger',
    weaponBaseDamage: 5n,
    weaponDps: 7n,
    dexBonus: 1n,
    description: 'A curved fang dripping with residual venom. Strikes with preternatural speed.',
  },
  {
    name: "Rotfang's Swamphide Vest",
    slot: 'chest',
    armorType: 'leather',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    armorClassBonus: 5n,
    dexBonus: 1n,
    description: 'Cured swamp-beast hide shaped into a supple vest. Smells foul but deflects blows.',
  },
  {
    name: 'Fangscale Earring',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'any',
    dexBonus: 1n,
    hpBonus: 3n,
    description: 'A serpent scale threaded on a bone hook. Sharpens reflexes and hardens resolve.',
  },

  // =========================================================================
  // 2. MIREWALKER THANE — paladin, cleric, shaman (chain/mace)
  // =========================================================================
  {
    name: "Thane's Bogwater Mace",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'paladin,cleric,druid,shaman,rogue,ranger',
    weaponType: 'mace',
    weaponBaseDamage: 6n,
    weaponDps: 8n,
    wisBonus: 1n,
    description: 'A heavy mace encrusted with mineral deposits from the deep mire. Strikes ring like thunder.',
  },
  {
    name: "Mirewalker's Hauberk",
    slot: 'chest',
    armorType: 'chain',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    armorClassBonus: 6n,
    wisBonus: 1n,
    description: 'Moss-tinged chain mail worn by the Thane himself. The links hold fast against the worst.',
  },
  {
    name: "Thane's Oath Pendant",
    slot: 'neck',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'any',
    wisBonus: 1n,
    hpBonus: 3n,
    description: 'A tarnished medallion engraved with an ancient oath. Steadies the spirit.',
  },

  // =========================================================================
  // 3. THORNMOTHER — wizard, enchanter, necromancer, summoner (staff/cloth)
  // =========================================================================
  {
    name: "Thornmother's Briar Staff",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger',
    weaponType: 'staff',
    weaponBaseDamage: 10n,  // 2H boss: raw 5+1+10+6=22, DPS 4.4
    weaponDps: 12n,
    intBonus: 1n,
    description: 'A living staff of twisted briar wood. Thorns sprout from the grip when channeling magic.',
  },
  {
    name: 'Thornweave Robe',
    slot: 'chest',
    armorType: 'cloth',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'any',
    armorClassBonus: 4n,
    intBonus: 2n,
    description: 'Cloth woven with thorn fibers that flex like silk. Enhances arcane focus.',
  },
  {
    name: 'Briarwood Loop',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'any',
    intBonus: 1n,
    manaBonus: 3n,
    description: 'A ring carved from petrified briarwood. Faint green light pulses within.',
  },

  // =========================================================================
  // 4. ASHWRIGHT — universal (accessories)
  // =========================================================================
  {
    name: "Ashwright's Spirit Locket",
    slot: 'neck',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'any',
    chaBonus: 1n,
    manaBonus: 3n,
    description: 'A locket containing a wisp of captured spirit energy. Warms to the touch in danger.',
  },
  {
    name: 'Cinderwisp Band',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'any',
    chaBonus: 1n,
    hpBonus: 3n,
    description: 'A ring set with a tiny ember that never goes out. Bolsters the wearer against harm.',
  },
  {
    name: "Ashwright's Ember Cloak",
    slot: 'neck',
    armorType: 'cloth',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 1n,
    vendorValue: 15n,
    allowedClasses: 'any',
    armorClassBonus: 3n,
    strBonus: 1n,
    description: 'A cloak woven with threads of living ash. Smolders faintly at the hem.',
  },

  // =========================================================================
  // 5. CRAG TYRANT — warrior, paladin (plate/greatsword)
  // =========================================================================
  {
    name: "Crag Tyrant's Cleaver",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'warrior,paladin,reaver,spellblade,ranger',
    weaponType: 'greatsword',
    weaponBaseDamage: 11n,  // 2H boss: raw 5+3+11+6=25, DPS 5.0
    weaponDps: 12n,
    strBonus: 2n,
    description: 'A massive stone-edged blade torn from the Crag Tyrant. Craters the earth on impact.',
  },
  {
    name: "Tyrant's Stoneplate",
    slot: 'chest',
    armorType: 'plate',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'warrior,paladin,bard,cleric',
    armorClassBonus: 7n,
    strBonus: 1n,
    description: 'Plate armor forged from Crag Tyrant hide-stone. Nearly impervious to physical blows.',
  },
  {
    name: "Crag Tyrant's Gauntlets",
    slot: 'hands',
    armorType: 'plate',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'warrior,paladin,bard,cleric',
    armorClassBonus: 4n,
    strBonus: 2n,
    description: 'Massive gauntlets scaled with crag-beast stone. Grip strength is unmatched.',
  },

  // =========================================================================
  // 6. HEXWEAVER NYX — enchanter, necromancer, summoner, wizard (staff/cloth/dagger)
  // =========================================================================
  {
    name: "Nyx's Hexstaff",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger',
    weaponType: 'staff',
    weaponBaseDamage: 9n,  // 2H boss: raw 5+3+9+5=22, DPS 4.4
    weaponDps: 10n,
    intBonus: 2n,
    description: 'A staff carved from cursed ebony, still thrumming with hex magic. Dark sigils glow along its length.',
  },
  {
    name: "Hexweaver's Trousers",
    slot: 'legs',
    armorType: 'cloth',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'any',
    armorClassBonus: 3n,
    intBonus: 1n,
    description: 'Cloth trousers embroidered with protective hexes. The weave shimmers under moonlight.',
  },
  {
    name: "Nyx's Cursed Athame",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'rogue,enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger',
    weaponType: 'dagger',
    weaponBaseDamage: 4n,
    weaponDps: 5n,
    intBonus: 1n,
    manaBonus: 5n,
    description: 'A ritual dagger steeped in dark enchantments. Drains mana from wounds it inflicts.',
  },

  // =========================================================================
  // 7. SCORCHFANG — spellblade, reaver, rogue (leather/blade/sword)
  // =========================================================================
  {
    name: "Scorchfang's Emberblade",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'spellblade,reaver,ranger',
    weaponType: 'blade',
    weaponBaseDamage: 5n,
    weaponDps: 7n,
    dexBonus: 1n,
    strBonus: 1n,
    description: 'A blade forged in Scorchfang fire. The edge glows cherry-red and never cools.',
  },
  {
    name: 'Scorchscale Jerkin',
    slot: 'chest',
    armorType: 'leather',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    armorClassBonus: 5n,
    dexBonus: 1n,
    description: 'Scorchfang hide cured into supple armor. Heat-hardened scales turn aside blades.',
  },
  {
    name: "Scorchfang's Leggings",
    slot: 'legs',
    armorType: 'leather',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    armorClassBonus: 4n,
    dexBonus: 1n,
    description: 'Leather leggings reinforced with Scorchfang scales. Flexible yet resilient.',
  },

  // =========================================================================
  // 8. WARDEN OF ASH — warrior, reaver, beastmaster (chain/axe)
  // =========================================================================
  {
    name: "Ashen Warden's Axe",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'beastmaster,warrior,reaver,ranger',
    weaponType: 'axe',
    weaponBaseDamage: 7n,
    weaponDps: 9n,
    strBonus: 2n,
    description: 'An axe forged from the Warden of Ash itself. The blade smolders with eternal heat.',
  },
  {
    name: "Warden's Cindermail",
    slot: 'chest',
    armorType: 'chain',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    armorClassBonus: 6n,
    strBonus: 1n,
    description: 'Chain mail infused with volcanic cinder. The links glow faintly in darkness.',
  },
  {
    name: 'Ashbound Bracers',
    slot: 'wrists',
    armorType: 'chain',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    armorClassBonus: 3n,
    strBonus: 1n,
    hpBonus: 5n,
    description: 'Bracers forged from the Warden remnants. Ash coats them like a second skin.',
  },

  // =========================================================================
  // 9. SMOLDERVEIL BANSHEE — bard, druid, shaman (rapier/cloth/mace)
  // =========================================================================
  {
    name: "Banshee's Wail",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'bard,ranger',
    weaponType: 'rapier',
    weaponBaseDamage: 4n,
    weaponDps: 5n,
    chaBonus: 2n,
    description: 'A rapier that hums with a mournful note when drawn. Enemies falter at the sound.',
  },
  {
    name: 'Smolderveil Vestments',
    slot: 'chest',
    armorType: 'cloth',
    rarity: 'rare',
    tier: 1n,
    requiredLevel: 3n,
    vendorValue: 20n,
    allowedClasses: 'any',
    armorClassBonus: 4n,
    wisBonus: 1n,
    chaBonus: 1n,
    description: 'Spectral robes that shimmer between visible and translucent. Channels primal wisdom.',
  },

  // =========================================================================
  // 10. PYRELORD KAZRAK — warrior, paladin, spellblade (plate/greatsword)
  // =========================================================================
  {
    name: "Kazrak's Pyrecleft",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 5n,
    vendorValue: 30n,
    allowedClasses: 'warrior,paladin,reaver,spellblade,ranger',
    weaponType: 'greatsword',
    weaponBaseDamage: 15n,  // 2H boss: raw 5+5+15+8=33, DPS 6.6
    weaponDps: 16n,
    strBonus: 3n,
    description: 'The Pyrelord\'s own blade, wreathed in dying flame. Cleaves through armor like parchment.',
  },
  {
    name: "Pyrelord's Infernal Plate",
    slot: 'chest',
    armorType: 'plate',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 5n,
    vendorValue: 30n,
    allowedClasses: 'warrior,paladin,bard,cleric',
    armorClassBonus: 9n,
    strBonus: 2n,
    hpBonus: 5n,
    description: 'Plate armor still radiating infernal heat. The strongest armor in the Embermarch.',
  },
  {
    name: "Kazrak's Molten Crown",
    slot: 'head',
    armorType: 'plate',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 5n,
    vendorValue: 30n,
    allowedClasses: 'warrior,paladin,bard,cleric',
    armorClassBonus: 6n,
    strBonus: 2n,
    description: 'A crown of cooling magma forged in Kazrak\'s furnace. Commands respect on the battlefield.',
  },

  // =========================================================================
  // 11. SOOTVEIL ARCHON — wizard, necromancer, enchanter (staff/cloth/dagger)
  // =========================================================================
  {
    name: "Archon's Sootveil Staff",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 5n,
    vendorValue: 30n,
    allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard,ranger',
    weaponType: 'staff',
    weaponBaseDamage: 13n,  // 2H boss: raw 5+5+13+7=30, DPS 6.0
    weaponDps: 14n,
    intBonus: 3n,
    manaBonus: 5n,
    description: 'A staff of charred bone trailing wisps of dark soot. Amplifies necrotic energies.',
  },
  {
    name: 'Sootveil Sacrificial Blade',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 5n,
    vendorValue: 30n,
    allowedClasses: 'rogue,enchanter,necromancer,summoner,wizard,shaman,druid,monk,ranger',
    weaponType: 'dagger',
    weaponBaseDamage: 6n,
    weaponDps: 7n,
    intBonus: 2n,
    hpBonus: 5n,
    description: 'A ritual blade stained with ancient sacrificial marks. Draws power from blood.',
  },
  {
    name: "Archon's Dark Cowl",
    slot: 'head',
    armorType: 'cloth',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 5n,
    vendorValue: 30n,
    allowedClasses: 'any',
    armorClassBonus: 3n,
    intBonus: 3n,
    description: 'A cowl woven from shadow-dyed silk. The wearer\'s eyes glow faintly in darkness.',
  },

  // =========================================================================
  // 12. EMBERCLAW MATRIARCH — ranger, rogue, druid (bow/leather)
  // =========================================================================
  {
    name: "Matriarch's Emberclaw Bow",
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 7n,
    vendorValue: 30n,
    allowedClasses: 'ranger',
    weaponType: 'bow',
    weaponBaseDamage: 13n,  // 2H boss: raw 5+7+13+7=32, DPS 6.4
    weaponDps: 14n,
    dexBonus: 3n,
    description: 'A bow strung with sinew from the Emberclaw Matriarch. Arrows fly true and far.',
  },
  {
    name: 'Emberclaw Stalker Hide',
    slot: 'chest',
    armorType: 'leather',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 7n,
    vendorValue: 30n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    armorClassBonus: 6n,
    dexBonus: 2n,
    hpBonus: 5n,
    description: 'Supple hide torn from the Matriarch herself. Burns faintly to the touch.',
  },
  {
    name: "Matriarch's Trackless Boots",
    slot: 'boots',
    armorType: 'leather',
    rarity: 'rare',
    tier: 2n,
    requiredLevel: 7n,
    vendorValue: 30n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    armorClassBonus: 5n,
    dexBonus: 2n,
    description: 'Boots crafted from Matriarch paw-leather. Leave no tracks and muffle all sound.',
  },
];

// ---------------------------------------------------------------------------
// NAMED ENEMY DEFINITIONS
// ---------------------------------------------------------------------------
// Stats are enhanced vs normal enemies of same level: ~2-3x HP, ~1.5x damage, ~1.5x armor
// Each named enemy spawns alone (groupMin/Max = 1) and has isBoss = true
// Loot tables use tier=2n with terrainType="named_<snake_case_name>" for unique routing

export const NAMED_ENEMY_DEFS: NamedEnemyDef[] = [
  // =========================================================================
  // HOLLOWMERE VALE (Starter, levels 1-2, dangerMultiplier 100)
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
    armorClass: 14n,
    level: 2n,
    maxHp: 65n,
    baseDamage: 8n,
    xpReward: 40n,
    factionName: 'Verdant Circle',
    regionName: 'Hollowmere Vale',
    roles: [
      { roleKey: 'rotfang_alpha', displayName: 'Rotfang', role: 'dps', roleDetail: 'melee', abilityProfile: 'venomous bite, lunge' },
    ],
    loot: {
      junkChance: 15n,
      gearChance: 70n,
      goldMin: 5n,
      goldMax: 10n,
      entries: [
        { itemName: "Rotfang's Venomtooth", weight: 3n },
        { itemName: "Rotfang's Swamphide Vest", weight: 3n },
        { itemName: 'Fangscale Earring', weight: 3n },
        { itemName: 'Chipped Dagger', weight: 20n },
        { itemName: 'Scuffed Jerkin', weight: 20n },
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
    armorClass: 16n,
    level: 2n,
    maxHp: 75n,
    baseDamage: 7n,
    xpReward: 45n,
    factionName: 'Iron Compact',
    regionName: 'Hollowmere Vale',
    roles: [
      { roleKey: 'mirewalker_thane', displayName: 'Mirewalker Thane', role: 'tank', roleDetail: 'melee', abilityProfile: 'shield bash, war cry' },
    ],
    loot: {
      junkChance: 15n,
      gearChance: 70n,
      goldMin: 6n,
      goldMax: 12n,
      entries: [
        { itemName: "Thane's Bogwater Mace", weight: 3n },
        { itemName: "Mirewalker's Hauberk", weight: 3n },
        { itemName: "Thane's Oath Pendant", weight: 3n },
        { itemName: 'Worn Mace', weight: 20n },
        { itemName: 'Dented Hauberk', weight: 20n },
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
    armorClass: 12n,
    level: 2n,
    maxHp: 55n,
    baseDamage: 8n,
    xpReward: 35n,
    factionName: 'Verdant Circle',
    regionName: 'Hollowmere Vale',
    roles: [
      { roleKey: 'thornmother', displayName: 'Thornmother', role: 'dps', roleDetail: 'caster', abilityProfile: 'thorn volley, root grasp' },
    ],
    loot: {
      junkChance: 15n,
      gearChance: 70n,
      goldMin: 5n,
      goldMax: 10n,
      entries: [
        { itemName: "Thornmother's Briar Staff", weight: 3n },
        { itemName: 'Thornweave Robe', weight: 3n },
        { itemName: 'Briarwood Loop', weight: 3n },
        { itemName: 'Gnarled Staff', weight: 20n },
        { itemName: 'Worn Robe', weight: 20n },
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
    armorClass: 12n,
    level: 2n,
    maxHp: 60n,
    baseDamage: 9n,
    xpReward: 40n,
    factionName: 'Ashen Order',
    regionName: 'Hollowmere Vale',
    roles: [
      { roleKey: 'ashwright', displayName: 'Ashwright', role: 'dps', roleDetail: 'caster', abilityProfile: 'spirit blast, phase shift' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 75n,
      goldMin: 6n,
      goldMax: 12n,
      entries: [
        { itemName: "Ashwright's Spirit Locket", weight: 3n },
        { itemName: 'Cinderwisp Band', weight: 3n },
        { itemName: "Ashwright's Ember Cloak", weight: 3n },
        { itemName: 'Rough Band', weight: 20n },
        { itemName: 'Traveler Necklace', weight: 20n },
      ],
    },
  },

  // =========================================================================
  // SILVERPINE FOREST (Mid, levels 4-5, dangerMultiplier 400)
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
    armorClass: 18n,
    level: 4n,
    maxHp: 100n,
    baseDamage: 12n,
    xpReward: 80n,
    factionName: 'Verdant Circle',
    regionName: 'Silverpine Forest',
    roles: [
      { roleKey: 'crag_tyrant', displayName: 'Crag Tyrant', role: 'tank', roleDetail: 'melee', abilityProfile: 'crushing blow, boulder toss' },
    ],
    loot: {
      junkChance: 12n,
      gearChance: 70n,
      goldMin: 8n,
      goldMax: 15n,
      entries: [
        { itemName: "Crag Tyrant's Cleaver", weight: 3n },
        { itemName: "Tyrant's Stoneplate", weight: 3n },
        { itemName: "Crag Tyrant's Gauntlets", weight: 3n },
        { itemName: 'Crude Greatsword', weight: 20n },
        { itemName: 'Battered Cuirass', weight: 20n },
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
    armorClass: 15n,
    level: 4n,
    maxHp: 90n,
    baseDamage: 14n,
    xpReward: 80n,
    factionName: 'Ashen Order',
    regionName: 'Silverpine Forest',
    roles: [
      { roleKey: 'hexweaver_nyx', displayName: 'Hexweaver Nyx', role: 'dps', roleDetail: 'caster', abilityProfile: 'hex bolt, mana drain, dark ward' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 75n,
      goldMin: 8n,
      goldMax: 15n,
      entries: [
        { itemName: "Nyx's Hexstaff", weight: 3n },
        { itemName: "Hexweaver's Trousers", weight: 3n },
        { itemName: "Nyx's Cursed Athame", weight: 3n },
        { itemName: 'Gnarled Staff', weight: 20n },
        { itemName: 'Worn Robe', weight: 20n },
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
    armorClass: 17n,
    level: 5n,
    maxHp: 110n,
    baseDamage: 13n,
    xpReward: 90n,
    factionName: 'Verdant Circle',
    regionName: 'Silverpine Forest',
    roles: [
      { roleKey: 'scorchfang', displayName: 'Scorchfang', role: 'dps', roleDetail: 'melee', abilityProfile: 'flame strike, rending claws' },
    ],
    loot: {
      junkChance: 12n,
      gearChance: 70n,
      goldMin: 8n,
      goldMax: 14n,
      entries: [
        { itemName: "Scorchfang's Emberblade", weight: 3n },
        { itemName: 'Scorchscale Jerkin', weight: 3n },
        { itemName: "Scorchfang's Leggings", weight: 3n },
        { itemName: 'Cracked Blade', weight: 20n },
        { itemName: 'Scuffed Jerkin', weight: 20n },
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
    armorClass: 20n,
    level: 5n,
    maxHp: 120n,
    baseDamage: 11n,
    xpReward: 100n,
    factionName: 'Ashen Order',
    regionName: 'Silverpine Forest',
    roles: [
      { roleKey: 'warden_of_ash', displayName: 'Warden of Ash', role: 'tank', roleDetail: 'melee', abilityProfile: 'smash, flame aura, fortify' },
    ],
    loot: {
      junkChance: 12n,
      gearChance: 70n,
      goldMin: 10n,
      goldMax: 15n,
      entries: [
        { itemName: "Ashen Warden's Axe", weight: 3n },
        { itemName: "Warden's Cindermail", weight: 3n },
        { itemName: 'Ashbound Bracers', weight: 3n },
        { itemName: 'Rusty Axe', weight: 20n },
        { itemName: 'Dented Hauberk', weight: 20n },
      ],
    },
  },

  // =========================================================================
  // GREYVEIL MOORS (Mid, levels 3-4, dangerMultiplier 300)
  // =========================================================================

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
    armorClass: 14n,
    level: 4n,
    maxHp: 85n,
    baseDamage: 14n,
    xpReward: 80n,
    factionName: 'Ashen Order',
    regionName: 'Greyveil Moors',
    roles: [
      { roleKey: 'smolderveil_banshee', displayName: 'Smolderveil Banshee', role: 'dps', roleDetail: 'caster', abilityProfile: 'wail, spectral chill, life drain' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 75n,
      goldMin: 8n,
      goldMax: 14n,
      entries: [
        { itemName: "Banshee's Wail", weight: 5n },
        { itemName: 'Smolderveil Vestments', weight: 5n },
        { itemName: 'Worn Mace', weight: 15n },
        { itemName: 'Worn Robe', weight: 15n },
        { itemName: 'Notched Rapier', weight: 15n },
      ],
    },
  },

  // =========================================================================
  // IRONHOLD GARRISON (High, levels 6-7, dangerMultiplier 600)
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
    armorClass: 25n,
    level: 7n,
    maxHp: 200n,
    baseDamage: 20n,
    xpReward: 180n,
    factionName: 'Iron Compact',
    regionName: 'Ironhold Garrison',
    roles: [
      { roleKey: 'pyrelord_kazrak', displayName: 'Pyrelord Kazrak', role: 'tank', roleDetail: 'melee', abilityProfile: 'inferno slash, molten shield, earthquake' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 80n,
      goldMin: 12n,
      goldMax: 15n,
      entries: [
        { itemName: "Kazrak's Pyrecleft", weight: 3n },
        { itemName: "Pyrelord's Infernal Plate", weight: 3n },
        { itemName: "Kazrak's Molten Crown", weight: 3n },
        { itemName: 'Steel Greatsword', weight: 20n },
        { itemName: 'Forged Cuirass', weight: 20n },
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
    armorClass: 20n,
    level: 7n,
    maxHp: 170n,
    baseDamage: 22n,
    xpReward: 160n,
    factionName: 'Ashen Order',
    regionName: 'Ironhold Garrison',
    roles: [
      { roleKey: 'sootveil_archon', displayName: 'Sootveil Archon', role: 'dps', roleDetail: 'caster', abilityProfile: 'shadow bolt, necrotic wave, dark pact' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 80n,
      goldMin: 10n,
      goldMax: 15n,
      entries: [
        { itemName: "Archon's Sootveil Staff", weight: 3n },
        { itemName: 'Sootveil Sacrificial Blade', weight: 3n },
        { itemName: "Archon's Dark Cowl", weight: 3n },
        { itemName: 'Oak Staff', weight: 20n },
        { itemName: 'Stiletto', weight: 20n },
      ],
    },
  },

  // =========================================================================
  // DREADSPIRE RUINS (Dungeon, levels 8-9, dangerMultiplier 800)
  // =========================================================================

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
    armorClass: 22n,
    level: 9n,
    maxHp: 250n,
    baseDamage: 18n,
    xpReward: 250n,
    factionName: 'Verdant Circle',
    regionName: 'Dreadspire Ruins',
    roles: [
      { roleKey: 'emberclaw_matriarch', displayName: 'Emberclaw Matriarch', role: 'dps', roleDetail: 'melee', abilityProfile: 'savage rend, primal roar, flame breath' },
    ],
    loot: {
      junkChance: 10n,
      gearChance: 80n,
      goldMin: 12n,
      goldMax: 15n,
      entries: [
        { itemName: "Matriarch's Emberclaw Bow", weight: 3n },
        { itemName: 'Emberclaw Stalker Hide', weight: 3n },
        { itemName: "Matriarch's Trackless Boots", weight: 3n },
        { itemName: 'Yew Bow', weight: 20n },
        { itemName: 'Ranger Jerkin', weight: 20n },
      ],
    },
  },
];
