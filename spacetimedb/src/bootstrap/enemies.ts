import { tableHasRows } from './utils';

export const ensureEnemyTemplates = (ctx: any) => {
  if (tableHasRows(ctx.db.enemyTemplate.iter())) return;
  const bogRat = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Bog Rat',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'thick hide, taunt',
    terrainTypes: 'swamp',
    creatureType: 'animal',
    timeOfDay: 'any',
    armorClass: 12n,
    level: 1n,
    maxHp: 26n,
    baseDamage: 4n,
    xpReward: 12n,
  });
  const emberWisp = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Ember Wisp',
    role: 'dps',
    roleDetail: 'magic',
    abilityProfile: 'fire bolts, ignite',
    terrainTypes: 'plains,mountains',
    creatureType: 'spirit',
    timeOfDay: 'night',
    armorClass: 8n,
    level: 2n,
    maxHp: 28n,
    baseDamage: 6n,
    xpReward: 20n,
  });
  const banditArcher = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Bandit Archer',
    role: 'dps',
    roleDetail: 'ranged',
    abilityProfile: 'rapid shot, bleed',
    terrainTypes: 'plains,woods',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    armorClass: 8n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 7n,
    xpReward: 18n,
  });
  const blightStalker = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Blight Stalker',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'pounce, shred',
    terrainTypes: 'woods,swamp',
    creatureType: 'beast',
    timeOfDay: 'night',
    armorClass: 9n,
    level: 3n,
    maxHp: 30n,
    baseDamage: 8n,
    xpReward: 24n,
  });
  const graveAcolyte = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Grave Acolyte',
    role: 'healer',
    roleDetail: 'support',
    abilityProfile: 'mend, cleanse',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    armorClass: 9n,
    level: 2n,
    maxHp: 22n,
    baseDamage: 4n,
    xpReward: 18n,
  });
  const hexbinder = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Hexbinder',
    role: 'support',
    roleDetail: 'control',
    abilityProfile: 'weaken, slow, snare',
    terrainTypes: 'woods,swamp',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    armorClass: 9n,
    level: 3n,
    maxHp: 26n,
    baseDamage: 5n,
    xpReward: 22n,
  });
  const thicketWolf = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Thicket Wolf',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'pack bite, lunge',
    terrainTypes: 'woods,plains',
    creatureType: 'animal',
    timeOfDay: 'day',
    armorClass: 9n,
    level: 1n,
    maxHp: 22n,
    baseDamage: 4n,
    xpReward: 12n,
  });
  const marshCroaker = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Marsh Croaker',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'tongue lash, croak',
    terrainTypes: 'swamp',
    creatureType: 'animal',
    timeOfDay: 'day',
    armorClass: 8n,
    level: 1n,
    maxHp: 20n,
    baseDamage: 3n,
    xpReward: 10n,
  });
  const dustHare = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Dust Hare',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'dart, nip',
    terrainTypes: 'plains',
    creatureType: 'animal',
    timeOfDay: 'day',
    armorClass: 7n,
    level: 1n,
    maxHp: 18n,
    baseDamage: 3n,
    xpReward: 10n,
  });
  const ashJackal = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Ash Jackal',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'snap, scorch',
    terrainTypes: 'plains,mountains',
    creatureType: 'beast',
    timeOfDay: 'day',
    armorClass: 9n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 6n,
    xpReward: 16n,
  });
  const thornSprite = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Thorn Sprite',
    role: 'support',
    roleDetail: 'magic',
    abilityProfile: 'thorn sting, sap',
    terrainTypes: 'woods',
    creatureType: 'spirit',
    timeOfDay: 'night',
    armorClass: 8n,
    level: 2n,
    maxHp: 22n,
    baseDamage: 5n,
    xpReward: 16n,
  });
  const gloomStag = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Gloom Stag',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'gore, trample',
    terrainTypes: 'woods',
    creatureType: 'beast',
    timeOfDay: 'night',
    armorClass: 11n,
    level: 3n,
    maxHp: 32n,
    baseDamage: 6n,
    xpReward: 22n,
  });
  const mireLeech = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Mire Leech',
    role: 'support',
    roleDetail: 'melee',
    abilityProfile: 'drain, latch',
    terrainTypes: 'swamp',
    creatureType: 'animal',
    timeOfDay: 'any',
    armorClass: 8n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 5n,
    xpReward: 16n,
  });
  const fenWitch = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Fen Witch',
    role: 'support',
    roleDetail: 'magic',
    abilityProfile: 'curse, mire',
    terrainTypes: 'swamp',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    armorClass: 9n,
    level: 3n,
    maxHp: 26n,
    baseDamage: 6n,
    xpReward: 22n,
  });
  const graveSkirmisher = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Grave Skirmisher',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'blade sweep, bleed',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    armorClass: 10n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 6n,
    xpReward: 18n,
  });
  const cinderSentinel = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Cinder Sentinel',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'stone wall, slam',
    terrainTypes: 'mountains,plains',
    creatureType: 'construct',
    timeOfDay: 'day',
    armorClass: 13n,
    level: 3n,
    maxHp: 36n,
    baseDamage: 6n,
    xpReward: 26n,
  });
  const emberling = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Emberling',
    role: 'support',
    roleDetail: 'magic',
    abilityProfile: 'ember spark, kindle',
    terrainTypes: 'mountains,plains',
    creatureType: 'spirit',
    timeOfDay: 'day',
    armorClass: 7n,
    level: 1n,
    maxHp: 18n,
    baseDamage: 4n,
    xpReward: 12n,
  });
  const frostboneAcolyte = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Frostbone Acolyte',
    role: 'healer',
    roleDetail: 'support',
    abilityProfile: 'ice mend, ward',
    terrainTypes: 'mountains,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    armorClass: 9n,
    level: 4n,
    maxHp: 30n,
    baseDamage: 6n,
    xpReward: 30n,
  });
  const ridgeSkirmisher = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Ridge Skirmisher',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'rock slash, feint',
    terrainTypes: 'mountains',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    armorClass: 10n,
    level: 3n,
    maxHp: 28n,
    baseDamage: 7n,
    xpReward: 24n,
  });
  const emberhawk = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Emberhawk',
    role: 'dps',
    roleDetail: 'ranged',
    abilityProfile: 'burning dive',
    terrainTypes: 'mountains,plains',
    creatureType: 'beast',
    timeOfDay: 'day',
    armorClass: 9n,
    level: 4n,
    maxHp: 26n,
    baseDamage: 8n,
    xpReward: 30n,
  });
  const basaltBrute = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Basalt Brute',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'stone slam, brace',
    terrainTypes: 'mountains',
    creatureType: 'construct',
    timeOfDay: 'any',
    armorClass: 14n,
    level: 4n,
    maxHp: 40n,
    baseDamage: 7n,
    xpReward: 32n,
  });
  const graveServant = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Grave Servant',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'shield crush, watchful',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    armorClass: 12n,
    level: 3n,
    maxHp: 34n,
    baseDamage: 6n,
    xpReward: 24n,
  });
  const alleyShade = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Alley Shade',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'shadow cut, vanish',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    armorClass: 10n,
    level: 4n,
    maxHp: 28n,
    baseDamage: 9n,
    xpReward: 30n,
  });
  const vaultSentinel = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Vault Sentinel',
    role: 'tank',
    roleDetail: 'melee',
    abilityProfile: 'iron guard, shield bash',
    terrainTypes: 'dungeon',
    creatureType: 'construct',
    timeOfDay: 'any',
    armorClass: 14n,
    level: 4n,
    maxHp: 42n,
    baseDamage: 7n,
    xpReward: 34n,
  });
  const sootboundMystic = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Sootbound Mystic',
    role: 'support',
    roleDetail: 'magic',
    abilityProfile: 'cinder hex, ember veil',
    terrainTypes: 'dungeon',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    armorClass: 10n,
    level: 5n,
    maxHp: 36n,
    baseDamage: 8n,
    xpReward: 38n,
  });
  const emberPriest = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Ember Priest',
    role: 'healer',
    roleDetail: 'support',
    abilityProfile: 'ashen mend, warding flame',
    terrainTypes: 'dungeon',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    armorClass: 11n,
    level: 5n,
    maxHp: 38n,
    baseDamage: 6n,
    xpReward: 36n,
  });
  const ashforgedRevenant = ctx.db.enemyTemplate.insert({
    id: 0n,
    name: 'Ashforged Revenant',
    role: 'dps',
    roleDetail: 'melee',
    abilityProfile: 'searing cleave, molten strike',
    terrainTypes: 'dungeon',
    creatureType: 'undead',
    timeOfDay: 'any',
    armorClass: 12n,
    level: 6n,
    maxHp: 48n,
    baseDamage: 10n,
    xpReward: 44n,
  });

  void bogRat;
  void emberWisp;
  void banditArcher;
  void blightStalker;
  void graveAcolyte;
  void hexbinder;
  void thicketWolf;
  void marshCroaker;
  void dustHare;
  void ashJackal;
  void thornSprite;
  void gloomStag;
  void mireLeech;
  void fenWitch;
  void graveSkirmisher;
  void cinderSentinel;
  void emberling;
  void frostboneAcolyte;
  void ridgeSkirmisher;
  void emberhawk;
  void basaltBrute;
  void graveServant;
  void alleyShade;
  void vaultSentinel;
  void sootboundMystic;
  void emberPriest;
  void ashforgedRevenant;
};

export const ensureEnemyAbilities = (ctx: any) => {
  if (tableHasRows(ctx.db.enemyAbility.iter())) return;
  const byName = new Map<string, bigint>();
  for (const row of ctx.db.enemyTemplate.iter()) {
    byName.set(row.name, row.id);
  }
  const addEnemyAbility = (
    name: string,
    abilityKey: string,
    label: string,
    kind: string,
    castSeconds: bigint,
    cooldownSeconds: bigint,
    targetRule: string
  ) => {
    const templateId = byName.get(name);
    if (!templateId) return;
    ctx.db.enemyAbility.insert({
      id: 0n,
      enemyTemplateId: templateId,
      abilityKey,
      name: label,
      kind,
      castSeconds,
      cooldownSeconds,
      targetRule,
    });
  };
  addEnemyAbility('Bog Rat', 'poison_bite', 'Poison Bite', 'dot', 3n, 20n, 'aggro');
  addEnemyAbility('Ember Wisp', 'ember_burn', 'Ember Burn', 'dot', 2n, 18n, 'aggro');
  addEnemyAbility('Bandit Archer', 'bleeding_shot', 'Bleeding Shot', 'dot', 1n, 15n, 'aggro');
  addEnemyAbility('Blight Stalker', 'shadow_rend', 'Shadow Rend', 'dot', 2n, 18n, 'aggro');
  addEnemyAbility('Grave Acolyte', 'sapping_chant', 'Sapping Chant', 'debuff', 2n, 20n, 'aggro');
  addEnemyAbility('Hexbinder', 'withering_hex', 'Withering Hex', 'debuff', 2n, 20n, 'aggro');
  addEnemyAbility('Thicket Wolf', 'rending_bite', 'Rending Bite', 'dot', 1n, 12n, 'aggro');
  addEnemyAbility('Marsh Croaker', 'bog_slime', 'Bog Slime', 'dot', 1n, 12n, 'aggro');
  addEnemyAbility('Dust Hare', 'quick_nip', 'Quick Nip', 'dot', 1n, 10n, 'aggro');
  addEnemyAbility('Ash Jackal', 'scorching_snap', 'Scorching Snap', 'dot', 1n, 14n, 'aggro');
  addEnemyAbility('Thorn Sprite', 'thorn_venom', 'Thorn Venom', 'dot', 2n, 16n, 'aggro');
  addEnemyAbility('Gloom Stag', 'crushing_gore', 'Crushing Gore', 'debuff', 2n, 18n, 'aggro');
  addEnemyAbility('Mire Leech', 'blood_drain', 'Blood Drain', 'dot', 2n, 18n, 'aggro');
  addEnemyAbility('Fen Witch', 'mire_curse', 'Mire Curse', 'debuff', 2n, 20n, 'aggro');
  addEnemyAbility('Grave Skirmisher', 'rusty_bleed', 'Rusty Bleed', 'dot', 1n, 12n, 'aggro');
  addEnemyAbility('Cinder Sentinel', 'ember_slam', 'Ember Slam', 'debuff', 2n, 20n, 'aggro');
  addEnemyAbility('Emberling', 'ember_spark', 'Ember Spark', 'dot', 1n, 12n, 'aggro');
  addEnemyAbility('Frostbone Acolyte', 'ice_mend', 'Ice Mend', 'heal', 2n, 20n, 'ally');
  addEnemyAbility('Ridge Skirmisher', 'rock_slash', 'Rock Slash', 'dot', 1n, 14n, 'aggro');
  addEnemyAbility('Emberhawk', 'burning_dive', 'Burning Dive', 'dot', 2n, 16n, 'aggro');
  addEnemyAbility('Basalt Brute', 'stone_slam', 'Stone Slam', 'debuff', 2n, 18n, 'aggro');
  addEnemyAbility('Grave Servant', 'shield_crush', 'Shield Crush', 'debuff', 2n, 18n, 'aggro');
  addEnemyAbility('Alley Shade', 'shadow_cut', 'Shadow Cut', 'dot', 1n, 12n, 'aggro');
  addEnemyAbility('Vault Sentinel', 'shield_bash', 'Shield Bash', 'debuff', 2n, 18n, 'aggro');
  addEnemyAbility('Sootbound Mystic', 'cinder_hex', 'Cinder Hex', 'debuff', 2n, 20n, 'aggro');
  addEnemyAbility('Ember Priest', 'ashen_mend', 'Ashen Mend', 'heal', 2n, 20n, 'ally');
  addEnemyAbility('Ashforged Revenant', 'searing_cleave', 'Searing Cleave', 'dot', 2n, 18n, 'aggro');
};
