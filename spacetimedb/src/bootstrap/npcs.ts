import { tableHasRows } from './utils';

export const ensureNpcs = (ctx: any) => {
  if (tableHasRows(ctx.db.npc.iter())) return;
  const hollowmere = [...ctx.db.location.iter()].find((row) => row.name === 'Hollowmere');
  if (hollowmere) {
    ctx.db.npc.insert({
      id: 0n,
      name: 'Marla the Guide',
      npcType: 'quest',
      locationId: hollowmere.id,
      description: 'A veteran scout who knows every trail between the river and the emberlands.',
      greeting: 'Welcome, traveler. The road is cruel, but I can help you find your footing.',
    });
    ctx.db.npc.insert({
      id: 0n,
      name: 'Elder Soren',
      npcType: 'lore',
      locationId: hollowmere.id,
      description: 'A stoic town elder with a gaze that weighs every word.',
      greeting: 'Hollowmere watches over its own. Keep your blade sharp and your wits sharper.',
    });
    ctx.db.npc.insert({
      id: 0n,
      name: 'Quartermaster Jyn',
      npcType: 'vendor',
      locationId: hollowmere.id,
      description: 'A brisk quartermaster tallying supplies near the lantern-lit market.',
      greeting: 'Supplies are tight. If you can help keep the roads safe, the town will remember.',
    });
  }
};
