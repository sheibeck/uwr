import { SenderError } from 'spacetimedb/server';
import { getGatherableResourceTemplates, findEnemyTemplateByName } from '../helpers/location';
import { findItemTemplateByName } from '../helpers/items';
import { EnemyTemplate } from '../schema/tables';
import { STARTER_ITEM_NAMES } from '../data/combat_constants';
import { CRAFTING_MODIFIER_DEFS } from '../data/crafting_materials';
import { NAMED_ENEMY_DEFS } from '../data/named_enemy_defs';

export function ensureLootTables(ctx: any) {
  const junkTemplates = [...ctx.db.itemTemplate.iter()].filter((row) => row.isJunk);
  const gearTemplates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier <= 1n && row.requiredLevel <= 9n && !STARTER_ITEM_NAMES.has(row.name)
  );
  // T2 gear templates for mid/high-tier loot tables (mountains, town, city, dungeon)
  const t2GearTemplates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier === 2n && row.requiredLevel <= 20n && !STARTER_ITEM_NAMES.has(row.name)
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
    const JEWELRY_SLOTS = new Set(['earrings']);
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

  // --- T2 gear entries for mid/high-tier loot tables ---
  // T2 gear (requiredLevel 11+) added to mountains/town/city/dungeon tables only.
  // Weight 3n (less common than T1 gear at 6n). Jewelry slots at 1n (rare).
  const JEWELRY_SLOTS_T2 = new Set(['earrings']);
  const MID_HIGH_TERRAINS = ['mountains', 'town', 'city', 'dungeon'];
  const creatureTypes = ['animal', 'beast', 'humanoid', 'undead', 'spirit', 'construct'];
  for (const terrain of MID_HIGH_TERRAINS) {
    for (const creature of creatureTypes) {
      const table = findLootTable(terrain, creature, 1n);
      if (!table) continue;
      for (const item of t2GearTemplates) {
        const weight = JEWELRY_SLOTS_T2.has(item.slot) ? 1n : 3n;
        upsertLootEntry(table.id, item.id, weight);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// MATERIAL AND SCROLL LOOT TABLE ENTRIES
// Adds crafting material drops and recipe scroll drops to enemy loot tables.
// Must be called AFTER ensureLootTables (tables must exist) and AFTER
// ensureGearMaterialItemTemplates + ensureRecipeScrollItemTemplates (templates must exist).
//
// Material tier mapping:
//   T1 zones (dangerMultiplier ~100): T1 materials (rough_hide, bone_shard, copper_ore)
//   T2 zones (dangerMultiplier ~160): T2 materials (tanned_leather, spirit_essence)
//   T3 zones (dungeon/high danger):   T3 materials (shadowhide, void_crystal, darksteel_ore)
//
// Scroll drops: mid-tier enemies (T2) weight 3-5, high-tier (T3) weight 5-8. Low-tier: none.
//
// NOTE: Lesser/Standard/Greater Essence drops are NO LONGER seeded here. They are now handled
// at runtime in combat.ts based on enemy level (25% chance per kill, tier by level).
// ---------------------------------------------------------------------------

export function ensureMaterialLootEntries(ctx: any) {
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
    ctx.db.lootTableEntry.insert({ id: 0n, lootTableId, itemTemplateId, weight });
  };

  const findTable = (terrainType: string, creatureType: string, tier: bigint) =>
    [...ctx.db.lootTable.iter()].find(
      (row) =>
        row.terrainType === terrainType &&
        row.creatureType === creatureType &&
        row.tier === tier
    );

  // Look up material templates
  const roughHide = findItemTemplateByName(ctx, 'Rough Hide');
  const boneShard = findItemTemplateByName(ctx, 'Bone Shard');
  const copperOre = findItemTemplateByName(ctx, 'Copper Ore');
  const tannedLeather = findItemTemplateByName(ctx, 'Tanned Leather');
  const spiritEssence = findItemTemplateByName(ctx, 'Spirit Essence');
  const shadowhide = findItemTemplateByName(ctx, 'Shadowhide');
  const voidCrystal = findItemTemplateByName(ctx, 'Void Crystal');

  // Look up modifier reagent templates (for mid/high-tier loot table seeding)
  const modifierReagentTemplates: Map<string, any> = new Map();
  for (const def of CRAFTING_MODIFIER_DEFS) {
    const tmpl = findItemTemplateByName(ctx, def.name);
    if (tmpl) modifierReagentTemplates.set(def.name, tmpl);
  }

  // Look up scroll templates
  const scrollLongsword = findItemTemplateByName(ctx, 'Scroll: Longsword');
  const scrollDagger = findItemTemplateByName(ctx, 'Scroll: Dagger');
  const scrollStaff = findItemTemplateByName(ctx, 'Scroll: Staff');
  const scrollHelm = findItemTemplateByName(ctx, 'Scroll: Helm');
  const scrollBreastplate = findItemTemplateByName(ctx, 'Scroll: Breastplate');
  const scrollRing = findItemTemplateByName(ctx, 'Scroll: Ring');
  const scrollCloak = findItemTemplateByName(ctx, 'Scroll: Cloak');

  const terrains = ['plains', 'woods', 'swamp', 'mountains', 'town', 'city', 'dungeon'];

  for (const terrain of terrains) {
    // Determine tier zone: dungeon = high tier, town/city = mid tier, others = low/mid tier
    // Using terrain type as proxy: dungeon = T3, mountains = T2/T3, others = T1/T2
    const isHighTier = terrain === 'dungeon';
    const isMidTier = terrain === 'mountains' || terrain === 'town' || terrain === 'city';

    // --- ANIMAL loot tables: rough_hide (T1), tanned_leather (T2 mid/high) ---
    const animalTable = findTable(terrain, 'animal', 1n);
    if (animalTable) {
      if (roughHide) upsertLootEntry(animalTable.id, roughHide.id, 20n);
      if (isMidTier || isHighTier) {
        if (tannedLeather) upsertLootEntry(animalTable.id, tannedLeather.id, 15n);
        // Mid/high-tier modifier reagents: physical stat reagents from natural creatures
        const glowingStone = modifierReagentTemplates.get('Glowing Stone');
        const clearCrystal = modifierReagentTemplates.get('Clear Crystal');
        const lifeStone = modifierReagentTemplates.get('Life Stone');
        if (glowingStone) upsertLootEntry(animalTable.id, glowingStone.id, 8n);
        if (clearCrystal) upsertLootEntry(animalTable.id, clearCrystal.id, 8n);
        if (lifeStone) upsertLootEntry(animalTable.id, lifeStone.id, 6n);
      }
      if (isHighTier) {
        if (shadowhide) upsertLootEntry(animalTable.id, shadowhide.id, 10n);
        // High-tier scroll drops: armor scrolls from animals
        if (scrollHelm) upsertLootEntry(animalTable.id, scrollHelm.id, 5n);
        if (scrollBreastplate) upsertLootEntry(animalTable.id, scrollBreastplate.id, 5n);
      } else if (isMidTier) {
        // Mid-tier: armor scroll drops (rare)
        if (scrollHelm) upsertLootEntry(animalTable.id, scrollHelm.id, 3n);
      }
    }

    // --- BEAST loot tables: rough_hide (T1), tanned_leather (T2), shadowhide (T3) ---
    const beastTable = findTable(terrain, 'beast', 1n);
    if (beastTable) {
      if (roughHide) upsertLootEntry(beastTable.id, roughHide.id, 20n);
      if (isMidTier || isHighTier) {
        if (tannedLeather) upsertLootEntry(beastTable.id, tannedLeather.id, 15n);
        // Mid/high-tier modifier reagents: physical stat reagents from natural creatures
        const glowingStone = modifierReagentTemplates.get('Glowing Stone');
        const clearCrystal = modifierReagentTemplates.get('Clear Crystal');
        const lifeStone = modifierReagentTemplates.get('Life Stone');
        if (glowingStone) upsertLootEntry(beastTable.id, glowingStone.id, 8n);
        if (clearCrystal) upsertLootEntry(beastTable.id, clearCrystal.id, 8n);
        if (lifeStone) upsertLootEntry(beastTable.id, lifeStone.id, 6n);
      }
      if (isHighTier) {
        if (shadowhide) upsertLootEntry(beastTable.id, shadowhide.id, 12n);
        // High-tier scroll drops: armor from beasts
        if (scrollBreastplate) upsertLootEntry(beastTable.id, scrollBreastplate.id, 6n);
        if (scrollHelm) upsertLootEntry(beastTable.id, scrollHelm.id, 5n);
        if (scrollCloak) upsertLootEntry(beastTable.id, scrollCloak.id, 5n);
      } else if (isMidTier) {
        if (scrollBreastplate) upsertLootEntry(beastTable.id, scrollBreastplate.id, 3n);
      }
    }

    // --- UNDEAD loot tables: bone_shard (T1), spirit_essence (T2) ---
    const undeadTable = findTable(terrain, 'undead', 1n);
    if (undeadTable) {
      if (boneShard) upsertLootEntry(undeadTable.id, boneShard.id, 18n);
      if (isMidTier || isHighTier) {
        if (spiritEssence) upsertLootEntry(undeadTable.id, spiritEssence.id, 15n);
        // Mid/high-tier modifier reagents: magical/defensive from undead
        const ancientRune = modifierReagentTemplates.get('Ancient Rune');
        const lifeStone = modifierReagentTemplates.get('Life Stone');
        const spiritWard = modifierReagentTemplates.get('Spirit Ward');
        if (ancientRune) upsertLootEntry(undeadTable.id, ancientRune.id, 8n);
        if (lifeStone) upsertLootEntry(undeadTable.id, lifeStone.id, 6n);
        if (spiritWard) upsertLootEntry(undeadTable.id, spiritWard.id, 6n);
      }
      if (isHighTier) {
        // High-tier: weapon scrolls from undead
        if (scrollLongsword) upsertLootEntry(undeadTable.id, scrollLongsword.id, 6n);
        if (scrollStaff) upsertLootEntry(undeadTable.id, scrollStaff.id, 5n);
      } else if (isMidTier) {
        if (scrollLongsword) upsertLootEntry(undeadTable.id, scrollLongsword.id, 4n);
      }
    }

    // --- SPIRIT loot tables: spirit_essence (T2), void_crystal (T3) ---
    const spiritTable = findTable(terrain, 'spirit', 1n);
    if (spiritTable) {
      if (isMidTier || isHighTier) {
        if (spiritEssence) upsertLootEntry(spiritTable.id, spiritEssence.id, 18n);
        // Mid/high-tier modifier reagents: caster reagents from spirits
        const wisdomHerb = modifierReagentTemplates.get('Wisdom Herb');
        const manaPearl = modifierReagentTemplates.get('Mana Pearl');
        const spiritWard = modifierReagentTemplates.get('Spirit Ward');
        if (wisdomHerb) upsertLootEntry(spiritTable.id, wisdomHerb.id, 8n);
        if (manaPearl) upsertLootEntry(spiritTable.id, manaPearl.id, 8n);
        if (spiritWard) upsertLootEntry(spiritTable.id, spiritWard.id, 6n);
      } else {
        // Low-tier spirits only have T1 bone_shard
        if (boneShard) upsertLootEntry(spiritTable.id, boneShard.id, 10n);
      }
      if (isHighTier) {
        if (voidCrystal) upsertLootEntry(spiritTable.id, voidCrystal.id, 12n);
        // High-tier: accessory + staff scrolls from spirits
        if (scrollRing) upsertLootEntry(spiritTable.id, scrollRing.id, 7n);
        if (scrollStaff) upsertLootEntry(spiritTable.id, scrollStaff.id, 6n);
        if (scrollCloak) upsertLootEntry(spiritTable.id, scrollCloak.id, 6n);
      } else if (isMidTier) {
        if (scrollStaff) upsertLootEntry(spiritTable.id, scrollStaff.id, 4n);
      }
    }

    // --- CONSTRUCT loot tables: shadowhide (T3), void_crystal (T3) ---
    const constructTable = findTable(terrain, 'construct', 1n);
    if (constructTable) {
      if (isMidTier || isHighTier) {
        if (shadowhide) upsertLootEntry(constructTable.id, shadowhide.id, 15n);
        // Mid/high-tier modifier reagents: defensive/arcane from constructs
        const ironWard = modifierReagentTemplates.get('Iron Ward');
        const glowingStone = modifierReagentTemplates.get('Glowing Stone');
        const manaPearl = modifierReagentTemplates.get('Mana Pearl');
        if (ironWard) upsertLootEntry(constructTable.id, ironWard.id, 8n);
        if (glowingStone) upsertLootEntry(constructTable.id, glowingStone.id, 6n);
        if (manaPearl) upsertLootEntry(constructTable.id, manaPearl.id, 6n);
      }
      if (isHighTier) {
        if (voidCrystal) upsertLootEntry(constructTable.id, voidCrystal.id, 12n);
        // High-tier: weapon and armor scrolls from constructs
        if (scrollLongsword) upsertLootEntry(constructTable.id, scrollLongsword.id, 8n);
        if (scrollBreastplate) upsertLootEntry(constructTable.id, scrollBreastplate.id, 7n);
        if (scrollHelm) upsertLootEntry(constructTable.id, scrollHelm.id, 6n);
      } else if (isMidTier) {
        if (scrollLongsword) upsertLootEntry(constructTable.id, scrollLongsword.id, 5n);
        if (scrollDagger) upsertLootEntry(constructTable.id, scrollDagger.id, 3n);
      }
    }

    // --- HUMANOID loot tables: bone_shard (T1), spirit_essence (T2) ---
    const humanoidTable = findTable(terrain, 'humanoid', 1n);
    if (humanoidTable) {
      if (boneShard) upsertLootEntry(humanoidTable.id, boneShard.id, 15n);
      if (isMidTier || isHighTier) {
        if (spiritEssence) upsertLootEntry(humanoidTable.id, spiritEssence.id, 12n);
        // Mid/high-tier modifier reagents: social/diverse from humanoids
        const silverToken = modifierReagentTemplates.get('Silver Token');
        const clearCrystal = modifierReagentTemplates.get('Clear Crystal');
        const wisdomHerb = modifierReagentTemplates.get('Wisdom Herb');
        if (silverToken) upsertLootEntry(humanoidTable.id, silverToken.id, 8n);
        if (clearCrystal) upsertLootEntry(humanoidTable.id, clearCrystal.id, 6n);
        if (wisdomHerb) upsertLootEntry(humanoidTable.id, wisdomHerb.id, 6n);
      }
      if (isHighTier) {
        // High-tier: weapon scrolls from humanoids
        if (scrollLongsword) upsertLootEntry(humanoidTable.id, scrollLongsword.id, 7n);
        if (scrollDagger) upsertLootEntry(humanoidTable.id, scrollDagger.id, 6n);
        if (scrollStaff) upsertLootEntry(humanoidTable.id, scrollStaff.id, 5n);
      } else if (isMidTier) {
        if (scrollLongsword) upsertLootEntry(humanoidTable.id, scrollLongsword.id, 4n);
        if (scrollDagger) upsertLootEntry(humanoidTable.id, scrollDagger.id, 3n);
      }
    }
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
      item.slot === 'earrings' || item.slot === 'neck'
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
      // Region-lock boss templates to their designated region
      if (template.isBoss && template.bossRegionName) {
        const region = ctx.db.region.id.find(location.regionId);
        if (!region || region.name !== template.bossRegionName) {
          continue;
        }
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
    isSocial: false,
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
    isSocial: false,
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
    isSocial: true,
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
    isSocial: false,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: false,
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
    isSocial: false,
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
    isSocial: true,
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
    isSocial: false,
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
    isSocial: false,
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
    isSocial: false,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: false,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: false,
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
    isSocial: true,
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
    isSocial: false,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: true,
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
    isSocial: true,
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

  // ---------------------------------------------------------------------------
  // NIGHT ENEMY COVERAGE — fills gaps identified in quick-170 audit
  // ---------------------------------------------------------------------------

  // 1. Dusk Moth — Level 1, plains, night, spirit
  // Fills: Ashen Road (plains L1) and Ironbell Farmstead (plains L1)
  const duskMoth = addEnemyTemplate({
    id: 0n,
    name: 'Dusk Moth',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains',
    creatureType: 'spirit',
    timeOfDay: 'night',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 1n,
    maxHp: 16n,
    baseDamage: 3n,
    xpReward: 10n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(duskMoth, 'dusk_moth', 'Dusk Moth', 'dps', 'magic', 'flutter, dust');
  addRoleTemplate(duskMoth, 'dusk_moth_glimmer', 'Dusk Moth Glimmer', 'support', 'magic', 'shimmer, blind');

  // 2. Night Rat — Level 1, plains, night, animal
  // Fills: Ashen Road (plains L1) and Ironbell Farmstead (plains L1)
  const nightRat = addEnemyTemplate({
    id: 0n,
    name: 'Night Rat',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains',
    creatureType: 'animal',
    timeOfDay: 'night',
    socialGroup: 'animal',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 1n,
    maxHp: 18n,
    baseDamage: 3n,
    xpReward: 10n,
    factionId: fVerdantCircle,
    isSocial: true,
  });
  addRoleTemplate(nightRat, 'night_rat', 'Night Rat', 'dps', 'melee', 'gnaw, dart');
  addRoleTemplate(nightRat, 'night_rat_scrapper', 'Night Rat Scrapper', 'tank', 'melee', 'gnaw, brace');

  // 3. Cinder Wraith — Level 3, plains+mountains, night, undead
  // Fills: Cinderwatch (plains L3), Scoria Flats (plains L3), Ironvein Pass (mountains L5 via +/-1)
  const cinderWraith = addEnemyTemplate({
    id: 0n,
    name: 'Cinder Wraith',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,mountains',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 3n,
    maxHp: 28n,
    baseDamage: 6n,
    xpReward: 22n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(cinderWraith, 'cinder_wraith', 'Cinder Wraith', 'dps', 'magic', 'spectral flame, wail');
  addRoleTemplate(cinderWraith, 'cinder_wraith_howler', 'Cinder Wraith Howler', 'support', 'magic', 'howl, chill');

  // 4. Shadow Prowler — Level 4, woods, night, beast
  // Fills: Charwood Copse (woods L4)
  const shadowProwler = addEnemyTemplate({
    id: 0n,
    name: 'Shadow Prowler',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods',
    creatureType: 'beast',
    timeOfDay: 'night',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 4n,
    maxHp: 32n,
    baseDamage: 8n,
    xpReward: 30n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(shadowProwler, 'shadow_prowler', 'Shadow Prowler', 'dps', 'melee', 'pounce, rend');
  addRoleTemplate(shadowProwler, 'shadow_prowler_stalker', 'Shadow Prowler Stalker', 'dps', 'melee', 'ambush, rake');

  // 5. Bog Specter — Level 4, swamp, night, spirit
  // Fills: Smolder Marsh (swamp L4)
  const bogSpecter = addEnemyTemplate({
    id: 0n,
    name: 'Bog Specter',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'spirit',
    timeOfDay: 'night',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 4n,
    maxHp: 26n,
    baseDamage: 7n,
    xpReward: 28n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(bogSpecter, 'bog_specter', 'Bog Specter', 'dps', 'magic', 'drowning grasp, lure');
  addRoleTemplate(bogSpecter, 'bog_specter_lantern', 'Bog Specter Lantern', 'support', 'magic', 'wisp light, veil');

  // 6. Ashveil Phantom — Level 5, mountains, night, undead
  // Fills: Ironvein Pass (mountains L5) and Pyre Overlook (mountains L5)
  const ashveilPhantom = addEnemyTemplate({
    id: 0n,
    name: 'Ashveil Phantom',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 5n,
    maxHp: 34n,
    baseDamage: 8n,
    xpReward: 36n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(ashveilPhantom, 'ashveil_phantom', 'Ashveil Phantom', 'dps', 'magic', 'soul rend, phase');
  addRoleTemplate(ashveilPhantom, 'ashveil_phantom_warden', 'Ashveil Phantom Warden', 'tank', 'melee', 'spectral guard, slam');

  // 7. Nightfang Viper — Level 1, swamp, night, beast
  // Fills: swamp L1 night coverage (Fogroot Crossing, Willowfen, Duskwater Shallows)
  const nightfangViper = addEnemyTemplate({
    id: 0n,
    name: 'Nightfang Viper',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp',
    creatureType: 'beast',
    timeOfDay: 'night',
    socialGroup: 'beast',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 1n,
    maxHp: 16n,
    baseDamage: 4n,
    xpReward: 12n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(nightfangViper, 'nightfang_viper', 'Nightfang Viper', 'dps', 'melee', 'venom strike, coil');
  addRoleTemplate(nightfangViper, 'nightfang_viper_spitter', 'Nightfang Viper Spitter', 'dps', 'ranged', 'venom spit, dart');

  // 8. Gloomwing Bat — Level 1, woods+mountains, night, beast
  // Fills: woods/mountains L1 night coverage (Bramble Hollow, Thornveil Thicket, Lichen Ridge)
  const gloomwingBat = addEnemyTemplate({
    id: 0n,
    name: 'Gloomwing Bat',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,mountains',
    creatureType: 'beast',
    timeOfDay: 'night',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 0n,
    level: 1n,
    maxHp: 14n,
    baseDamage: 3n,
    xpReward: 10n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(gloomwingBat, 'gloomwing_bat', 'Gloomwing Bat', 'dps', 'melee', 'screech, swoop');
  addRoleTemplate(gloomwingBat, 'gloomwing_bat_elder', 'Gloomwing Bat Elder', 'support', 'melee', 'sonic pulse, swoop');

  // ---------------------------------------------------------------------------
  // NEW REGION ENEMIES — Greyveil Moors, Silverpine Forest, Ironhold Garrison,
  // Dreadspire Ruins (levels 3-12)
  // ---------------------------------------------------------------------------

  // === Greyveil Moors enemies (levels 3-5) ===

  // 1. Moorland Harrier — Level 3, beast, plains+swamp, day
  const moorlandHarrier = addEnemyTemplate({
    name: 'Moorland Harrier',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,swamp',
    creatureType: 'beast',
    timeOfDay: 'day',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 8n,
    level: 3n,
    maxHp: 28n,
    baseDamage: 7n,
    xpReward: 22n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(moorlandHarrier, 'moorland_harrier', 'Moorland Harrier', 'dps', 'ranged', 'diving strike, screech');
  addRoleTemplate(moorlandHarrier, 'moorland_harrier_swooper', 'Moorland Harrier Swooper', 'dps', 'melee', 'swoop, rake');

  // 2. Barrow Wight — Level 4, undead, plains, night
  const barrowWight = addEnemyTemplate({
    name: 'Barrow Wight',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains',
    creatureType: 'undead',
    timeOfDay: 'night',
    socialGroup: 'undead',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 11n,
    level: 4n,
    maxHp: 34n,
    baseDamage: 8n,
    xpReward: 30n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(barrowWight, 'barrow_wight', 'Barrow Wight', 'tank', 'melee', 'death grip, wail');
  addRoleTemplate(barrowWight, 'barrow_wight_shade', 'Barrow Wight Shade', 'dps', 'magic', 'shadow bolt, drain');
  addRoleTemplate(barrowWight, 'barrow_wight_guardian', 'Barrow Wight Guardian', 'tank', 'melee', 'shield wall, slam');

  // 3. Moor Hag — Level 5, humanoid, swamp+woods, night
  const moorHag = addEnemyTemplate({
    name: 'Moor Hag',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'swamp,woods',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 5n,
    maxHp: 32n,
    baseDamage: 7n,
    xpReward: 36n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(moorHag, 'moor_hag', 'Moor Hag', 'support', 'magic', 'curse, hex ward');
  addRoleTemplate(moorHag, 'moor_hag_cackler', 'Moor Hag Cackler', 'dps', 'magic', 'cackle, blight bolt');

  // === Silverpine Forest enemies (levels 4-6) ===

  // 4. Webspinner — Level 4, beast, woods, any
  const webspinner = addEnemyTemplate({
    name: 'Webspinner',
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
    armorClass: 10n,
    level: 4n,
    maxHp: 30n,
    baseDamage: 7n,
    xpReward: 28n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(webspinner, 'webspinner', 'Webspinner', 'dps', 'melee', 'venomous bite, web');
  addRoleTemplate(webspinner, 'webspinner_lurker', 'Webspinner Lurker', 'support', 'melee', 'web trap, ambush');
  addRoleTemplate(webspinner, 'webspinner_matriarch', 'Webspinner Matriarch', 'tank', 'melee', 'shield cocoon, bite');

  // 5. Silverpine Sentinel — Level 5, spirit, woods, day
  const silverSentinel = addEnemyTemplate({
    name: 'Silverpine Sentinel',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods',
    creatureType: 'spirit',
    timeOfDay: 'day',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 14n,
    level: 5n,
    maxHp: 44n,
    baseDamage: 6n,
    xpReward: 38n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(silverSentinel, 'silverpine_sentinel', 'Silverpine Sentinel', 'tank', 'melee', 'root slam, bark shield');
  addRoleTemplate(silverSentinel, 'silverpine_sentinel_warden', 'Silverpine Sentinel Warden', 'support', 'magic', 'entangle, thorns');

  // 6. Moss Troll — Level 6, beast, woods+swamp, any
  const mossTroll = addEnemyTemplate({
    name: 'Moss Troll',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,swamp',
    creatureType: 'beast',
    timeOfDay: 'any',
    socialGroup: 'beast',
    socialRadius: 2n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 12n,
    level: 6n,
    maxHp: 52n,
    baseDamage: 9n,
    xpReward: 44n,
    factionId: fVerdantCircle,
    isSocial: false,
  });
  addRoleTemplate(mossTroll, 'moss_troll', 'Moss Troll', 'tank', 'melee', 'crush, regenerate');
  addRoleTemplate(mossTroll, 'moss_troll_hurler', 'Moss Troll Hurler', 'dps', 'ranged', 'boulder throw, smash');

  // 7. Feral Druid — Level 5, humanoid, woods+plains, day
  const feralDruid = addEnemyTemplate({
    name: 'Feral Druid',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'woods,plains',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 10n,
    level: 5n,
    maxHp: 34n,
    baseDamage: 8n,
    xpReward: 36n,
    factionId: fVerdantCircle,
    isSocial: true,
  });
  addRoleTemplate(feralDruid, 'feral_druid', 'Feral Druid', 'healer', 'support', 'wild mend, entangle');
  addRoleTemplate(feralDruid, 'feral_druid_shapeshifter', 'Feral Druid Shapeshifter', 'dps', 'melee', 'claw swipe, frenzy');
  addRoleTemplate(feralDruid, 'feral_druid_caller', 'Feral Druid Caller', 'support', 'magic', 'beast call, thorns');

  // === Ironhold Garrison enemies (levels 6-8) ===

  // 8. Iron Golem — Level 7, construct, plains+dungeon, any
  const ironGolem = addEnemyTemplate({
    name: 'Iron Golem',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,dungeon',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 16n,
    level: 7n,
    maxHp: 62n,
    baseDamage: 10n,
    xpReward: 52n,
    factionId: fIronCompact,
    isSocial: true,
  });
  addRoleTemplate(ironGolem, 'iron_golem', 'Iron Golem', 'tank', 'melee', 'iron fist, bulwark');
  addRoleTemplate(ironGolem, 'iron_golem_siege', 'Iron Golem Siege', 'dps', 'melee', 'siege slam, cleave');

  // 9. Renegade Knight — Level 7, humanoid, plains+mountains, day
  const renegadeKnight = addEnemyTemplate({
    name: 'Renegade Knight',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'plains,mountains',
    creatureType: 'humanoid',
    timeOfDay: 'day',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 14n,
    level: 7n,
    maxHp: 48n,
    baseDamage: 11n,
    xpReward: 50n,
    factionId: fFreeBlades,
    isSocial: true,
  });
  addRoleTemplate(renegadeKnight, 'renegade_knight', 'Renegade Knight', 'tank', 'melee', 'shield charge, riposte');
  addRoleTemplate(renegadeKnight, 'renegade_knight_berserker', 'Renegade Knight Berserker', 'dps', 'melee', 'wild swing, frenzy');
  addRoleTemplate(renegadeKnight, 'renegade_knight_captain', 'Renegade Knight Captain', 'support', 'melee', 'rally, command');

  // 10. Plague Cultist — Level 6, humanoid, town+plains, night
  const plagueCultist = addEnemyTemplate({
    name: 'Plague Cultist',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'town,plains',
    creatureType: 'humanoid',
    timeOfDay: 'night',
    socialGroup: 'humanoid',
    socialRadius: 3n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 9n,
    level: 6n,
    maxHp: 36n,
    baseDamage: 8n,
    xpReward: 42n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(plagueCultist, 'plague_cultist', 'Plague Cultist', 'dps', 'magic', 'plague bolt, miasma');
  addRoleTemplate(plagueCultist, 'plague_cultist_preacher', 'Plague Cultist Preacher', 'support', 'magic', 'dark prayer, ward');
  addRoleTemplate(plagueCultist, 'plague_cultist_fanatic', 'Plague Cultist Fanatic', 'dps', 'melee', 'infected blade, frenzy');

  // 11. Warforged Hulk — Level 8, construct, mountains+dungeon, any
  const warforgedHulk = addEnemyTemplate({
    name: 'Warforged Hulk',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'mountains,dungeon',
    creatureType: 'construct',
    timeOfDay: 'any',
    socialGroup: 'construct',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 2n,
    armorClass: 17n,
    level: 8n,
    maxHp: 70n,
    baseDamage: 11n,
    xpReward: 58n,
    factionId: fIronCompact,
    isSocial: true,
  });
  addRoleTemplate(warforgedHulk, 'warforged_hulk', 'Warforged Hulk', 'tank', 'melee', 'iron crush, brace');
  addRoleTemplate(warforgedHulk, 'warforged_hulk_devastator', 'Warforged Hulk Devastator', 'dps', 'melee', 'devastate, cleave');

  // === Dreadspire Ruins enemies (levels 8-12) ===

  // 12. Dreadspire Wraith — Level 9, undead, dungeon, any
  const dreadspireWraith = addEnemyTemplate({
    name: 'Dreadspire Wraith',
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
    level: 9n,
    maxHp: 56n,
    baseDamage: 12n,
    xpReward: 62n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(dreadspireWraith, 'dreadspire_wraith', 'Dreadspire Wraith', 'dps', 'magic', 'soul rend, phase shift');
  addRoleTemplate(dreadspireWraith, 'dreadspire_wraith_anchor', 'Dreadspire Wraith Anchor', 'tank', 'melee', 'spectral chain, drain');
  addRoleTemplate(dreadspireWraith, 'dreadspire_wraith_howler', 'Dreadspire Wraith Howler', 'support', 'magic', 'terrifying howl, chill');

  // 13. Runebound Golem — Level 10, construct, dungeon, any
  const runeboundGolem = addEnemyTemplate({
    name: 'Runebound Golem',
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
    armorClass: 18n,
    level: 10n,
    maxHp: 78n,
    baseDamage: 13n,
    xpReward: 70n,
    factionId: fIronCompact,
    isSocial: true,
  });
  addRoleTemplate(runeboundGolem, 'runebound_golem', 'Runebound Golem', 'tank', 'melee', 'rune slam, arcane shield');
  addRoleTemplate(runeboundGolem, 'runebound_golem_shatterer', 'Runebound Golem Shatterer', 'dps', 'melee', 'shatter, rune pulse');

  // 14. Shadow Necromancer — Level 10, humanoid, dungeon, any
  const shadowNecromancer = addEnemyTemplate({
    name: 'Shadow Necromancer',
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
    level: 10n,
    maxHp: 44n,
    baseDamage: 14n,
    xpReward: 68n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(shadowNecromancer, 'shadow_necromancer', 'Shadow Necromancer', 'dps', 'magic', 'death bolt, shadow blast');
  addRoleTemplate(shadowNecromancer, 'shadow_necromancer_summoner', 'Shadow Necromancer Summoner', 'support', 'magic', 'raise dead, dark ward');
  addRoleTemplate(shadowNecromancer, 'shadow_necromancer_lich', 'Shadow Necromancer Lich', 'healer', 'support', 'soul siphon, dark mend');

  // 15. Abyssal Fiend — Level 11, spirit, dungeon, any
  const abyssalFiend = addEnemyTemplate({
    name: 'Abyssal Fiend',
    role: 'base',
    roleDetail: 'base',
    abilityProfile: '',
    terrainTypes: 'dungeon',
    creatureType: 'spirit',
    timeOfDay: 'any',
    socialGroup: 'spirit',
    socialRadius: 1n,
    awareness: 'idle',
    groupMin: 1n,
    groupMax: 3n,
    armorClass: 14n,
    level: 11n,
    maxHp: 66n,
    baseDamage: 15n,
    xpReward: 76n,
    factionId: fAshenOrder,
    isSocial: false,
  });
  addRoleTemplate(abyssalFiend, 'abyssal_fiend', 'Abyssal Fiend', 'dps', 'magic', 'hellfire, corruption');
  addRoleTemplate(abyssalFiend, 'abyssal_fiend_tormentor', 'Abyssal Fiend Tormentor', 'dps', 'melee', 'rend, agony');
  addRoleTemplate(abyssalFiend, 'abyssal_fiend_guardian', 'Abyssal Fiend Guardian', 'tank', 'melee', 'abyssal ward, crush');

  // 16. Dread Knight — Level 12, undead, dungeon, any
  const dreadKnight = addEnemyTemplate({
    name: 'Dread Knight',
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
    armorClass: 16n,
    level: 12n,
    maxHp: 82n,
    baseDamage: 16n,
    xpReward: 84n,
    factionId: fAshenOrder,
    isSocial: true,
  });
  addRoleTemplate(dreadKnight, 'dread_knight', 'Dread Knight', 'tank', 'melee', 'unholy shield, death strike');
  addRoleTemplate(dreadKnight, 'dread_knight_executioner', 'Dread Knight Executioner', 'dps', 'melee', 'execute, cleave');
  addRoleTemplate(dreadKnight, 'dread_knight_commander', 'Dread Knight Commander', 'support', 'melee', 'dark rally, command');
}

// ---------------------------------------------------------------------------
// NAMED ENEMIES (Boss-tier with unique loot tables)
// ---------------------------------------------------------------------------

export function ensureNamedEnemies(ctx: any) {
  const factionIdByName = (name: string): bigint | undefined =>
    ([...ctx.db.faction.iter()] as any[]).find((r: any) => r.name === name)?.id;

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
    template: any,
    roleKey: string,
    displayName: string,
    role: string,
    roleDetail: string,
    abilityProfile: string
  ) => {
    const existing = [...ctx.db.enemyRoleTemplate.by_template.filter(template.id)].find(
      (row: any) => row.roleKey === roleKey
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

  for (const def of NAMED_ENEMY_DEFS) {
    const factionId = factionIdByName(def.factionName);

    // Seed the enemy template with isBoss=true
    const template = addEnemyTemplate({
      name: def.name,
      role: def.role,
      roleDetail: def.roleDetail,
      abilityProfile: def.abilityProfile,
      terrainTypes: def.terrainTypes,
      creatureType: def.creatureType,
      timeOfDay: def.timeOfDay,
      socialGroup: def.socialGroup,
      socialRadius: def.socialRadius,
      awareness: def.awareness,
      groupMin: def.groupMin,
      groupMax: def.groupMax,
      armorClass: def.armorClass,
      level: def.level,
      maxHp: def.maxHp,
      baseDamage: def.baseDamage,
      xpReward: def.xpReward,
      factionId,
      isBoss: true,
      isSocial: false,
      bossRegionName: def.regionName,
    });

    // Add role templates
    for (const roleDef of def.roles) {
      addRoleTemplate(template, roleDef.roleKey, roleDef.displayName, roleDef.role, roleDef.roleDetail, roleDef.abilityProfile);
    }

    // Create dedicated named loot table (tier=2n, unique terrainType key)
    const namedKey = 'named_' + def.name.toLowerCase().replace(/\s+/g, '_');
    const existingTable = [...ctx.db.lootTable.iter()].find(
      (row: any) => row.terrainType === namedKey && row.creatureType === def.creatureType && row.tier === 2n
    );
    let tableId: bigint;
    if (existingTable) {
      ctx.db.lootTable.id.update({
        ...existingTable,
        junkChance: def.loot.junkChance,
        gearChance: def.loot.gearChance,
        goldMin: def.loot.goldMin,
        goldMax: def.loot.goldMax,
      });
      tableId = existingTable.id;
    } else {
      const inserted = ctx.db.lootTable.insert({
        id: 0n,
        terrainType: namedKey,
        creatureType: def.creatureType,
        tier: 2n,
        junkChance: def.loot.junkChance,
        gearChance: def.loot.gearChance,
        goldMin: def.loot.goldMin,
        goldMax: def.loot.goldMax,
      });
      tableId = inserted.id;
    }

    // Upsert loot entries
    for (const entry of def.loot.entries) {
      const itemTemplate = findItemTemplateByName(ctx, entry.itemName);
      if (!itemTemplate) continue;
      const existingEntry = [...ctx.db.lootTableEntry.by_table.filter(tableId)].find(
        (row: any) => row.itemTemplateId === itemTemplate.id
      );
      if (existingEntry) {
        if (existingEntry.weight !== entry.weight) {
          ctx.db.lootTableEntry.id.update({ ...existingEntry, weight: entry.weight });
        }
      } else {
        ctx.db.lootTableEntry.insert({
          id: 0n,
          lootTableId: tableId,
          itemTemplateId: itemTemplate.id,
          weight: entry.weight,
        });
      }
    }
  }
}
