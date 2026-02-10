import type { ViewDeps } from './types';

export const registerQuestViews = ({ spacetimedb, t, QuestInstance }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_quests', public: true },
    t.array(QuestInstance.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player?.activeCharacterId) return [];
      return [...ctx.db.questInstance.by_character.filter(player.activeCharacterId)];
    }
  );
};
