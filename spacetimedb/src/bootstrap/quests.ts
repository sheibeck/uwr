import { tableHasRows, findEnemyTemplateByName } from './utils';

export const ensureQuestTemplates = (ctx: any) => {
  if (tableHasRows(ctx.db.questTemplate.iter())) return;
  const marla = [...ctx.db.npc.iter()].find((row) => row.name === 'Marla the Guide');
  const bogRat = findEnemyTemplateByName(ctx, 'Bog Rat');
  const thicketWolf = findEnemyTemplateByName(ctx, 'Thicket Wolf');
  if (marla && bogRat) {
    ctx.db.questTemplate.insert({
      id: 0n,
      npcId: marla.id,
      name: 'Clear the Bog Rats',
      description: 'Thin the rats near Fogroot Crossing.',
      targetEnemyTemplateId: bogRat.id,
      requiredCount: 4n,
      minLevel: 1n,
      maxLevel: 4n,
      rewardXp: 24n,
    });
  }
  if (marla && thicketWolf) {
    ctx.db.questTemplate.insert({
      id: 0n,
      npcId: marla.id,
      name: 'Thicket Wolf Pelts',
      description: 'Hunt wolves in Bramble Hollow for usable pelts.',
      targetEnemyTemplateId: thicketWolf.id,
      requiredCount: 3n,
      minLevel: 2n,
      maxLevel: 5n,
      rewardXp: 30n,
    });
  }
};
