import { SenderError } from 'spacetimedb/server';
import { getGatherableResourceTemplates, findEnemyTemplateByName } from '../helpers/location';
import { findItemTemplateByName } from '../helpers/items';
import { EnemyTemplate } from '../schema/tables';
import { STARTER_ITEM_NAMES } from '../data/combat_constants';

export function ensureLootTables(ctx: any) {
  const junkTemplates = [...ctx.db.itemTemplate.iter()].filter((row) => row.isJunk);
  const gearTemplates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier <= 1n && row.requiredLevel <= 9n && !STARTER_ITEM_NAMES.has(row.name)
  );
  const findLootTable = (terrainType: string, creatureType: string, tier: bigint) =>
    [...ctx.db.lootTable.iter()].find(
      (row) =>
        row.terrainType === terrainType &&
        row.creatureType === creatureType &&
        row.tier === tier
    );
  const upsertLootEntry = (lootTableId: bigint, itemTemplateId: bigint, weight: bigint) => {
    const existing = [...ctx.db.lootTableEntry.by_table.filter(lootTableId)].find(
      (row) => row.itemTemplateId === itemTemplateId
    );
    if (existing) {
      if (existing.weight !== weight) {
        ctx.db.lootTableEntry.id.update({ ...existing, weight });
      }
      return;
    }
    ctx.db.lootTableEntry.insert({
      id: 0n,
      lootTableId,
      itemTemplateId,
      weight,
    });
  };
  const addOrSyncTable = (
    terrainType: string,
    creatureType: string,
    junkChance: bigint,
    gearChance: bigint,
    goldMin: bigint,
    goldMax: bigint
  ) => {
    const existing = findLootTable(terrainType, creatureType, 1n);
    let tableId: bigint;
    if (existing) {
      ctx.db.lootTable.id.update({
        ...existing,
        junkChance,
        gearChance,
        goldMin,
        goldMax,
      });
      tableId = existing.id;
    } else {
      const inserted = ctx.db.lootTable.insert({
        id: 0n,
        terrainType,
        creatureType,
        tier: 1n,
        junkChance,
        gearChance,
        goldMin,
        goldMax,
      });
      tableId = inserted.id;
    }
    for (const item of junkTemplates) {
      upsertLootEntry(tableId, item.id, 10n);
    }
    const resourceTemplates = getGatherableResourceTemplates(ctx, terrainType);
    for (const entry of resourceTemplates) {
      upsertLootEntry(tableId, entry.template.id, 6n);
    }
    if (creatureType === 'animal' || creatureType === 'beast') {
      const rawMeat = findItemTemplateByName(ctx, 'Raw Meat');
      if (rawMeat) {
        upsertLootEntry(tableId, rawMeat.id, 20n);
      }
    }
    const JEWELRY_SLOTS = new Set(['earrings', 'neck']);
    for (const item of gearTemplates) {
      const weight = JEWELRY_SLOTS.has(item.slot) ? 1n : (item.rarity === 'uncommon' ? 3n : 6n);
      upsertLootEntry(tableId, item.id, weight);
    }
  };
  const terrains = ['plains', 'woods', 'swamp', 'mountains', 'town', 'city', 'dungeon'];
  for (const terrain of terrains) {
    addOrSyncTable(terrain, 'animal', 75n, 10n, 0n, 2n);
    addOrSyncTable(terrain, 'beast', 65n, 15n, 0n, 3n);
    addOrSyncTable(terrain, 'humanoid', 40n, 25n, 2n, 6n);
    addOrSyncTable(terrain, 'undead', 55n, 20n, 1n, 4n);
    addOrSyncTable(terrain, 'spirit', 50n, 20n, 1n, 4n);
    addOrSyncTable(terrain, 'construct', 60n, 20n, 1n, 4n);
  }
}

export function ensureVendorInventory(ctx: any) {
  // Helper function for deterministic random selection
  function pickN(items: any[], n: number, seed: bigint): any[] {
    const selected: any[] = [];
    const pool = [...items];
    for (let i = 0; i < Math.min(n, pool.length); i++) {
      const idx = Number((seed + BigInt(i * 7)) % BigInt(pool.length));
      selected.push(pool.splice(idx, 1)[0]);
    }
    return selected;
  }

  // Iterate ALL vendor NPCs
  const vendors = [...ctx.db.npc.iter()].filter((row) => row.npcType === 'vendor');

  for (const vendor of vendors) {
    // Determine vendor tier from its region
    const location = ctx.db.location.id.find(vendor.locationId);
    if (!location) continue;

    const region = ctx.db.region.id.find(location.regionId);
    if (!region) continue;

    const tierRaw = Math.floor(Number(region.dangerMultiplier) / 100);
    const vendorTier = Math.max(1, tierRaw);

    // Filter eligible items: not junk, not resources, tier <= vendor tier, not starter gear, common rarity only
    const allEligible = [...ctx.db.itemTemplate.iter()].filter(
      (row) => !row.isJunk && row.slot !== 'resource' && row.tier <= BigInt(vendorTier) && !STARTER_ITEM_NAMES.has(row.name) && row.rarity === 'common'
    );

    // Group items by category
    const armor = allEligible.filter((item) =>
      item.slot === 'chest' || item.slot === 'legs' || item.slot === 'boots'
    );
    const weapons = allEligible.filter((item) =>
      item.slot === 'mainHand' || item.slot === 'offHand'
    );
    const accessories = allEligible.filter((item) =>
      item.slot === 'earrings' || item.slot === 'cloak' || item.slot === 'neck'
    );
    const consumables = allEligible.filter((item) =>
      item.slot === 'consumable' || item.slot === 'food' || item.slot === 'utility'
    );

    // Select random subset from each category using vendor.id as seed
    // Total cap: 3 armor + 3 weapons + 2 accessories + 2 consumables = 10 max items
    const selectedArmor = pickN(armor, 3, vendor.id);
    const selectedWeapons = pickN(weapons, 3, vendor.id);
    const selectedAccessories = pickN(accessories, 2, vendor.id);
    const selectedConsumables = pickN(consumables, 2, vendor.id + 11n);

    // Combine all selected items
    const selectedItems = [
      ...selectedArmor,
      ...selectedWeapons,
      ...selectedAccessories,
      ...selectedConsumables
    ];

    // Upsert selected items
    const upsertVendorItem = (itemTemplateId: bigint, price: bigint) => {
      const existing = [...ctx.db.vendorInventory.by_vendor.filter(vendor.id)].find(
        (row) => row.itemTemplateId === itemTemplateId
      );
      if (existing) {
        if (existing.price !== price) {
          ctx.db.vendorInventory.id.update({ ...existing, price });
        }
        return;
      }
      ctx.db.vendorInventory.insert({
        id: 0n,
        npcId: vendor.id,
        itemTemplateId,
        price,
      });
    };

    // Track selected item IDs
    const selectedItemIds = new Set<bigint>();
    for (const template of selectedItems) {
      const price = template.vendorValue > 0n ? template.vendorValue * 6n : 10n;
      upsertVendorItem(template.id, price);
      selectedItemIds.add(template.id);
    }

    // Note: stale removal intentionally omitted — player-sold items accumulate in vendor inventory
    // and must not be purged on sync. Seed items are upserted idempotently.
    void selectedItemIds; // suppress unused-variable warning
  }
}



export function ensureLocationEnemyTemplates(ctx: any) {
  for (const location of ctx.db.location.iter()) {
    const existing = new Set<string>();
    for (const row of ctx.db.locationEnemyTemplate.by_location.filter(location.id)) {
      existing.add(row.enemyTemplateId.toString());
    }
    const locationTerrain = (location.terrainType ?? '').trim().toLowerCase();
    for (const template of ctx.db.enemyTemplate.iter()) {
      const allowed = (template.terrainTypes ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
      if (allowed.length > 0 && locationTerrain && !allowed.includes(locationTerrain)) {
        continue;
      }
      if (existing.has(template.id.toString())) continue;
      ctx.db.locationEnemyTemplate.insert({
        id: 0n,
        locationId: location.id,
        enemyTemplateId: template.id,
      });
    }
  }
}

export function ensureEnemyTemplatesAndRoles(ctx: any) {
  const addEnemyTemplate = (row: any) => {
    const existing = findEnemyTemplateByName(ctx, row.name);
    if (existing) {
      ctx.db.enemyTemplate.id.update({
        ...existing,
        ...row,
        id: existing.id,
      });
      return ctx.db.enemyTemplate.id.find(existing.id) ?? { ...existing, ...row, id: existing.id };
    }
    return ctx.db.enemyTemplate.insert({
      id: 0n,
      ...row,
    });
  };
  const addRoleTemplate = (
    template: typeof EnemyTemplate.rowType,
    roleKey: string,
    displayName: string,
    role: string,
    roleDetail: string,
    abilityProfile: string
  ) => {
    const existing = [...ctx.db.enemyRoleTemplate.by_template.filter(template.id)].find(
      (row) => row.roleKey === roleKey
    );
    if (existing) {
      ctx.db.enemyRoleTemplate.id.update({
        ...existing,
        enemyTemplateId: template.id,
        roleKey,
        displayName,
        role,
        roleDetail,
        abilityProfile,
      });
      return;
    }
    ctx.db.enemyRoleTemplate.insert({
      id: 0n,
      enemyTemplateId: template.id,
      roleKey,
      displayName,
      role,
      roleDetail,
      abilityProfile,
    });
  };

  const factionIdByName = (name: string): bigint | undefined =>
    ([...ctx.db.faction.iter()] as any[]).find((r: any) => r.name === name)?.id;

  const fIronCompact = factionIdByName('Iron Compact');
  const fVerdantCircle = factionIdByName('Verdant Circle');
  const fAshenOrder = factionIdByName('Ashen Order');
  const fFreeBlades = factionIdByName('Free Blades');

  const bogRat = addEnemyTemplate({
    name: 'Bog Rat',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'animal',
    timeOfDay: 'any',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 2n,
    maxHp: 32n,
    baseDamage: 5n,
    xpReward: 18n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(bogRat, 'bog_rat', 'Bog Rat', 'tank', 'melee', 'thick hide, taunt');
  addRoleTemplate(bogRat, 'bog_rat_brute', 'Bog Rat Brute', 'tank', 'melee', 'thick hide, taunt');
  addRoleTemplate(bogRat, 'bog_rat_scavenger', 'Bog Rat Scavenger', 'dps', 'melee', 'gnaw, dart');

  const emberWisp = addEnemyTemplate({
    name: 'Ember Wisp',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,mountains',
    creatureType: 'spirit',
    timeOfDay: 'night',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 2n,
    maxHp: 28n,
    baseDamage: 6n,
    xpReward: 20n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(emberWisp, 'ember_wisp', 'Ember Wisp', 'dps', 'magic', 'fire bolts, ignite');
  addRoleTemplate(emberWisp, 'ember_wisp_flare', 'Ember Wisp Flare', 'dps', 'magic', 'flare, ignite');
  addRoleTemplate(emberWisp, 'ember_wisp_spark', 'Ember Wisp Spark', 'support', 'magic', 'spark, veil');

  const bandit = addEnemyTemplate({
    name: 'Bandit',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,woods',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 7n,
    xpReward: 18n,
    factionId: fFreeBlades,
  });
  addRoleTemplate(bandit, 'bandit_archer', 'Bandit Archer', 'dps', 'ranged', 'rapid shot, bleed');
  addRoleTemplate(bandit, 'bandit_ruffian', 'Bandit Ruffian', 'tank', 'melee', 'shield bash, taunt');
  addRoleTemplate(bandit, 'bandit_cutthroat', 'Bandit Cutthroat', 'dps', 'melee', 'quick slash, feint');

  const blightStalker = addEnemyTemplate({
    name: 'Blight Stalker',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,swamp',
    creatureType: 'beast',
    timeOfDay: 'night',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 9n,
    level: 3n,
    maxHp: 30n,
    baseDamage: 8n,
    xpReward: 24n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(blightStalker, 'blight_stalker', 'Blight Stalker', 'dps', 'melee', 'pounce, shred');
  addRoleTemplate(blightStalker, 'blight_stalker_brute', 'Blight Stalker Brute', 'tank', 'melee', 'maul, snarl');
  addRoleTemplate(blightStalker, 'blight_stalker_prowler', 'Blight Stalker Prowler', 'dps', 'melee', 'ambush, shred');

  const graveAcolyte = addEnemyTemplate({
    id: 0n,
    name: 'Grave Acolyte',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 2n,
    maxHp: 22n,
    baseDamage: 4n,
    xpReward: 18n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(graveAcolyte, 'grave_acolyte', 'Grave Acolyte', 'healer', 'support', 'mend, cleanse');
  addRoleTemplate(graveAcolyte, 'grave_ritualist', 'Grave Ritualist', 'support', 'control', 'curse, drain');
  addRoleTemplate(graveAcolyte, 'grave_zealot', 'Grave Zealot', 'dps', 'melee', 'slash, frenzy');

  const hexbinder = addEnemyTemplate({
    id: 0n,
    name: 'Hexbinder',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,swamp',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 3n,
    maxHp: 26n,
    baseDamage: 5n,
    xpReward: 22n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(hexbinder, 'hexbinder', 'Hexbinder', 'support', 'control', 'weaken, slow, snare');
  addRoleTemplate(hexbinder, 'hexbinder_stalker', 'Hexbinder Stalker', 'dps', 'melee', 'hex strike, feint');
  addRoleTemplate(hexbinder, 'hexbinder_warder', 'Hexbinder Warder', 'tank', 'melee', 'ward, taunt');

  const thicketWolf = addEnemyTemplate({
    id: 0n,
    name: 'Thicket Wolf',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,plains',
    creatureType: 'animal',
    timeOfDay: 'day',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 1n,
    maxHp: 22n,
    baseDamage: 4n,
    xpReward: 12n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(thicketWolf, 'thicket_wolf', 'Thicket Wolf', 'dps', 'melee', 'pack bite, lunge');
  addRoleTemplate(thicketWolf, 'thicket_wolf_alpha', 'Thicket Wolf Alpha', 'tank', 'melee', 'alpha bite, howl');
  addRoleTemplate(thicketWolf, 'thicket_wolf_prowler', 'Thicket Wolf Prowler', 'dps', 'melee', 'lunge, rake');

  const marshCroaker = addEnemyTemplate({
    id: 0n,
    name: 'Marsh Croaker',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'animal',
    timeOfDay: 'day',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 1n,
    maxHp: 20n,
    baseDamage: 3n,
    xpReward: 10n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(marshCroaker, 'marsh_croaker', 'Marsh Croaker', 'dps', 'melee', 'tongue lash, croak');
  addRoleTemplate(marshCroaker, 'marsh_croaker_bully', 'Marsh Croaker Bully', 'tank', 'melee', 'slam, croak');

  const dustHare = addEnemyTemplate({
    id: 0n,
    name: 'Dust Hare',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains',
    creatureType: 'animal',
    timeOfDay: 'day',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 7n,
    level: 1n,
    maxHp: 18n,
    baseDamage: 3n,
    xpReward: 10n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(dustHare, 'dust_hare', 'Dust Hare', 'dps', 'melee', 'dart, nip');
  addRoleTemplate(dustHare, 'dust_hare_skitter', 'Dust Hare Skitter', 'dps', 'melee', 'skitter, nip');
  addRoleTemplate(dustHare, 'dust_hare_scout', 'Dust Hare Scout', 'support', 'melee', 'distract, dart');

  const ashJackal = addEnemyTemplate({
    id: 0n,
    name: 'Ash Jackal',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 2n,
    maxHp: 24n,
    baseDamage: 6n,
    xpReward: 18n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(ashJackal, 'ash_jackal', 'Ash Jackal', 'dps', 'melee', 'snap, pack feint');
  addRoleTemplate(ashJackal, 'ash_jackal_alpha', 'Ash Jackal Alpha', 'tank', 'melee', 'alpha snap, snarl');

  const thornSprite = addEnemyTemplate({
    id: 0n,
    name: 'Thorn Sprite',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods',
    creatureType: 'spirit',
    timeOfDay: 'night',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 2n,
    maxHp: 20n,
    baseDamage: 4n,
    xpReward: 16n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(thornSprite, 'thorn_sprite', 'Thorn Sprite', 'support', 'magic', 'sting, wither pollen');
  addRoleTemplate(thornSprite, 'thorn_sprite_stinger', 'Thorn Sprite Stinger', 'dps', 'magic', 'sting, dart');

  const gloomStag = addEnemyTemplate({
    id: 0n,
    name: 'Gloom Stag',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 3n,
    maxHp: 34n,
    baseDamage: 7n,
    xpReward: 24n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(gloomStag, 'gloom_stag', 'Gloom Stag', 'tank', 'melee', 'gore, bulwark');
  addRoleTemplate(gloomStag, 'gloom_stag_charger', 'Gloom Stag Charger', 'dps', 'melee', 'charge, gore');

  const mireLeech = addEnemyTemplate({
    id: 0n,
    name: 'Mire Leech',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 2n,
    maxHp: 26n,
    baseDamage: 6n,
    xpReward: 18n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(mireLeech, 'mire_leech', 'Mire Leech', 'dps', 'melee', 'drain, latch');
  addRoleTemplate(mireLeech, 'mire_leech_bulwark', 'Mire Leech Bulwark', 'tank', 'melee', 'latch, bulwark');

  const fenWitch = addEnemyTemplate({
    id: 0n,
    name: 'Fen Witch',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 3n,
    maxHp: 28n,
    baseDamage: 6n,
    xpReward: 22n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(fenWitch, 'fen_witch', 'Fen Witch', 'support', 'magic', 'curse, mire ward');
  addRoleTemplate(fenWitch, 'fen_witch_hexer', 'Fen Witch Hexer', 'dps', 'magic', 'hex, sting');

  const graveSkirmisher = addEnemyTemplate({
    id: 0n,
    name: 'Grave Skirmisher',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'day',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 2n,
    maxHp: 26n,
    baseDamage: 6n,
    xpReward: 18n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(graveSkirmisher, 'grave_skirmisher', 'Grave Skirmisher', 'dps', 'melee', 'rusty slash, feint');
  addRoleTemplate(graveSkirmisher, 'grave_skirmisher_guard', 'Grave Skirmisher Guard', 'tank', 'melee', 'guard, slam');

  const cinderSentinel = addEnemyTemplate({
    id: 0n,
    name: 'Cinder Sentinel',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,plains',
    creatureType: 'construct',
    timeOfDay: 'day',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 13n,
    level: 3n,
    maxHp: 36n,
    baseDamage: 6n,
    xpReward: 26n,
    factionId: fIronCompact,
  });
  addRoleTemplate(cinderSentinel, 'cinder_sentinel', 'Cinder Sentinel', 'tank', 'melee', 'stone wall, slam');
  addRoleTemplate(cinderSentinel, 'cinder_sentinel_breaker', 'Cinder Sentinel Breaker', 'dps', 'melee', 'breaker slam, cleave');

  const emberling = addEnemyTemplate({
    id: 0n,
    name: 'Emberling',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,plains',
    creatureType: 'spirit',
    timeOfDay: 'day',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 7n,
    level: 1n,
    maxHp: 18n,
    baseDamage: 4n,
    xpReward: 12n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(emberling, 'emberling', 'Emberling', 'support', 'magic', 'ember spark, kindle');
  addRoleTemplate(emberling, 'emberling_spark', 'Emberling Spark', 'dps', 'magic', 'spark, ignite');

  const frostboneAcolyte = addEnemyTemplate({
    id: 0n,
    name: 'Frostbone Acolyte',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 4n,
    maxHp: 30n,
    baseDamage: 6n,
    xpReward: 30n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(
    frostboneAcolyte,
    'frostbone_acolyte',
    'Frostbone Acolyte',
    'healer',
    'support',
    'ice mend, ward'
  );
  addRoleTemplate(
    frostboneAcolyte,
    'frostbone_binder',
    'Frostbone Binder',
    'support',
    'control',
    'chill bind, ward'
  );
  addRoleTemplate(
    frostboneAcolyte,
    'frostbone_zealot',
    'Frostbone Zealot',
    'dps',
    'melee',
    'ice strike, frenzy'
  );

  const ridgeSkirmisher = addEnemyTemplate({
    id: 0n,
    name: 'Ridge Skirmisher',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 10n,
    level: 3n,
    maxHp: 28n,
    baseDamage: 7n,
    xpReward: 24n,
    factionId: fFreeBlades,
  });
  addRoleTemplate(ridgeSkirmisher, 'ridge_skirmisher', 'Ridge Skirmisher', 'dps', 'melee', 'rock slash, feint');
  addRoleTemplate(
    ridgeSkirmisher,
    'ridge_skirmisher_guard',
    'Ridge Skirmisher Guard',
    'tank',
    'melee',
    'guard, slam'
  );

  const emberhawk = addEnemyTemplate({
    id: 0n,
    name: 'Emberhawk',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,plains',
    creatureType: 'beast',
    timeOfDay: 'day',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 4n,
    maxHp: 26n,
    baseDamage: 8n,
    xpReward: 30n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(emberhawk, 'emberhawk', 'Emberhawk', 'dps', 'ranged', 'burning dive');
  addRoleTemplate(emberhawk, 'emberhawk_screecher', 'Emberhawk Screecher', 'support', 'ranged', 'screech, dive');

  const basaltBrute = addEnemyTemplate({
    id: 0n,
    name: 'Basalt Brute',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 14n,
    level: 4n,
    maxHp: 40n,
    baseDamage: 7n,
    xpReward: 32n,
    factionId: fIronCompact,
  });
  addRoleTemplate(basaltBrute, 'basalt_brute', 'Basalt Brute', 'tank', 'melee', 'stone slam, brace');

  const ashenRam = addEnemyTemplate({
    id: 0n,
    name: 'Ashen Ram',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'beast',
    timeOfDay: 'day',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 4n,
    maxHp: 34n,
    baseDamage: 8n,
    xpReward: 32n,
    factionId: fVerdantCircle,
  });
  addRoleTemplate(ashenRam, 'ashen_ram', 'Ashen Ram', 'tank', 'melee', 'ram charge, shove');
  addRoleTemplate(ashenRam, 'ashen_ram_runner', 'Ashen Ram Runner', 'dps', 'melee', 'charging gore');

  const sootboundSentry = addEnemyTemplate({
    id: 0n,
    name: 'Sootbound Sentry',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 14n,
    level: 5n,
    maxHp: 42n,
    baseDamage: 9n,
    xpReward: 38n,
    factionId: fIronCompact,
  });
  addRoleTemplate(sootboundSentry, 'sootbound_sentry', 'Sootbound Sentry', 'tank', 'melee', 'iron guard');
  addRoleTemplate(
    sootboundSentry,
    'sootbound_sentry_watcher',
    'Sootbound Watcher',
    'support',
    'magic',
    'alarm pulse'
  );
  addRoleTemplate(basaltBrute, 'basalt_brute_crusher', 'Basalt Brute Crusher', 'dps', 'melee', 'crusher slam, cleave');

  const graveServant = addEnemyTemplate({
    id: 0n,
    name: 'Grave Servant',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 3n,
    maxHp: 34n,
    baseDamage: 6n,
    xpReward: 24n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(graveServant, 'grave_servant', 'Grave Servant', 'tank', 'melee', 'shield crush, watchful');
  addRoleTemplate(graveServant, 'grave_servant_reaver', 'Grave Servant Reaver', 'dps', 'melee', 'reaver slash, feint');

  const alleyShade = addEnemyTemplate({
    id: 0n,
    name: 'Alley Shade',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,city',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 10n,
    level: 4n,
    maxHp: 28n,
    baseDamage: 9n,
    xpReward: 30n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(alleyShade, 'alley_shade', 'Alley Shade', 'dps', 'melee', 'shadow cut, vanish');
  addRoleTemplate(alleyShade, 'alley_shade_stalker', 'Alley Shade Stalker', 'dps', 'melee', 'stalk, strike');
  addRoleTemplate(alleyShade, 'alley_shade_warden', 'Alley Shade Warden', 'tank', 'melee', 'ward, counter');

  const vaultSentinel = addEnemyTemplate({
    id: 0n,
    name: 'Vault Sentinel',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 14n,
    level: 4n,
    maxHp: 42n,
    baseDamage: 7n,
    xpReward: 34n,
    factionId: fIronCompact,
  });
  addRoleTemplate(vaultSentinel, 'vault_sentinel', 'Vault Sentinel', 'tank', 'melee', 'iron guard, shield bash');
  addRoleTemplate(vaultSentinel, 'vault_sentinel_crusher', 'Vault Sentinel Crusher', 'dps', 'melee', 'crusher bash, cleave');

  const sootboundMystic = addEnemyTemplate({
    id: 0n,
    name: 'Sootbound Mystic',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 10n,
    level: 5n,
    maxHp: 36n,
    baseDamage: 8n,
    xpReward: 38n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(
    sootboundMystic,
    'sootbound_mystic',
    'Sootbound Mystic',
    'support',
    'magic',
    'cinder hex, ember veil'
  );
  addRoleTemplate(
    sootboundMystic,
    'sootbound_seer',
    'Sootbound Seer',
    'support',
    'magic',
    'seer veil, ward'
  );
  addRoleTemplate(
    sootboundMystic,
    'sootbound_flayer',
    'Sootbound Flayer',
    'dps',
    'magic',
    'flay, hex'
  );

  const emberPriest = addEnemyTemplate({
    id: 0n,
    name: 'Ember Priest',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'humanoid',
    timeOfDay: 'any',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 11n,
    level: 5n,
    maxHp: 38n,
    baseDamage: 6n,
    xpReward: 36n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(emberPriest, 'ember_priest', 'Ember Priest', 'healer', 'support', 'ashen mend, warding flame');
  addRoleTemplate(emberPriest, 'ember_priest_zealot', 'Ember Priest Zealot', 'dps', 'magic', 'zeal, flame');

  const ashforgedRevenant = addEnemyTemplate({
    id: 0n,
    name: 'Ashforged Revenant',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'undead',
    timeOfDay: 'any',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 12n,
    level: 6n,
    maxHp: 48n,
    baseDamage: 10n,
    xpReward: 44n,
    factionId: fAshenOrder,
  });
  addRoleTemplate(
    ashforgedRevenant,
    'ashforged_revenant',
    'Ashforged Revenant',
    'dps',
    'melee',
    'searing cleave, molten strike'
  );
  addRoleTemplate(
    ashforgedRevenant,
    'ashforged_bulwark',
    'Ashforged Bulwark',
    'tank',
    'melee',
    'bulwark, cleave'
  );
}
