import { tableHasRows } from './utils';

export const ensureLootTables = (ctx: any) => {
  if (tableHasRows(ctx.db.lootTable.iter())) return;

  const junkTemplates = [...ctx.db.itemTemplate.iter()].filter((row) => row.isJunk);
  const gearTemplates = [...ctx.db.itemTemplate.iter()].filter((row) => !row.isJunk);

  const table = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'plains',
    creatureType: 'animal',
    tier: 1n,
    junkChance: 70n,
    gearChance: 25n,
    goldMin: 1n,
    goldMax: 3n,
  });
  const swamp = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'swamp',
    creatureType: 'animal',
    tier: 1n,
    junkChance: 75n,
    gearChance: 20n,
    goldMin: 1n,
    goldMax: 3n,
  });
  const woods = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'woods',
    creatureType: 'animal',
    tier: 1n,
    junkChance: 70n,
    gearChance: 22n,
    goldMin: 1n,
    goldMax: 3n,
  });
  const humanoid = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'plains',
    creatureType: 'humanoid',
    tier: 1n,
    junkChance: 55n,
    gearChance: 35n,
    goldMin: 2n,
    goldMax: 6n,
  });
  const undead = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'town',
    creatureType: 'undead',
    tier: 1n,
    junkChance: 60n,
    gearChance: 30n,
    goldMin: 2n,
    goldMax: 5n,
  });
  const dungeon = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'dungeon',
    creatureType: 'humanoid',
    tier: 1n,
    junkChance: 50n,
    gearChance: 40n,
    goldMin: 4n,
    goldMax: 10n,
  });
  const spirit = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'plains',
    creatureType: 'spirit',
    tier: 1n,
    junkChance: 60n,
    gearChance: 30n,
    goldMin: 2n,
    goldMax: 6n,
  });
  const construct = ctx.db.lootTable.insert({
    id: 0n,
    terrainType: 'mountains',
    creatureType: 'construct',
    tier: 1n,
    junkChance: 55n,
    gearChance: 35n,
    goldMin: 3n,
    goldMax: 8n,
  });

  const addEntries = (lootTableId: bigint, templates: typeof gearTemplates) => {
    for (const template of templates) {
      ctx.db.lootTableEntry.insert({
        id: 0n,
        lootTableId,
        itemTemplateId: template.id,
        weight: template.isJunk ? 3n : 1n,
      });
    }
    for (const template of junkTemplates) {
      ctx.db.lootTableEntry.insert({
        id: 0n,
        lootTableId,
        itemTemplateId: template.id,
        weight: 4n,
      });
    }
  };

  addEntries(table.id, gearTemplates);
  addEntries(swamp.id, gearTemplates);
  addEntries(woods.id, gearTemplates);
  addEntries(humanoid.id, gearTemplates);
  addEntries(undead.id, gearTemplates);
  addEntries(dungeon.id, gearTemplates);
  addEntries(spirit.id, gearTemplates);
  addEntries(construct.id, gearTemplates);
};
