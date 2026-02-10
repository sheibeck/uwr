import type { ViewDeps } from './types';

export const registerEffectViews = ({ spacetimedb, t, CharacterEffect }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_character_effects', public: true },
    t.array(CharacterEffect.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || !player.activeCharacterId) return [];
      const character = ctx.db.character.id.find(player.activeCharacterId);
      if (!character) return [];

      const ids = new Set<bigint>();
      ids.add(character.id);
      if (character.groupId) {
        for (const member of ctx.db.groupMember.by_group.filter(character.groupId)) {
          ids.add(member.characterId);
        }
      }

      const effects: typeof CharacterEffect.rowType[] = [];
      for (const effect of ctx.db.characterEffect.iter()) {
        if (ids.has(effect.characterId)) effects.push(effect);
      }
      return effects;
    }
  );
};
