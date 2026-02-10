import type { ViewDeps } from './types';

export const registerCombatViews = ({ spacetimedb, t, CombatResult, CombatLoot }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_combat_results', public: true },
    t.array(CombatResult.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return [];
      return [...ctx.db.combatResult.by_owner_user.filter(player.userId)];
    }
  );

  spacetimedb.view(
    { name: 'my_combat_loot', public: true },
    t.array(CombatLoot.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null || !player.activeCharacterId) return [];
      return [...ctx.db.combatLoot.by_character.filter(player.activeCharacterId)];
    }
  );
};
