export const registerQuestReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    fail,
    ensureSpawnsForLocation,
    startCombatForSpawn,
    spawnEnemyWithTemplate,
    effectiveGroupId,
    isGroupLeaderOrSolo,
  } = deps;

  // loot_quest_item reducer
  // The cast timer is CLIENT-SIDE only. The client shows a timed progress bar (same pattern
  // as resource gathering) and calls this reducer only when the timer elapses.
  // This reducer simply validates and marks the item as looted when called.
  spacetimedb.reducer(
    'loot_quest_item',
    { characterId: t.u64(), questItemId: t.u64() },
    (ctx: any, args: any) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);

      // Find and validate the quest item
      const questItem = ctx.db.quest_item.id.find(args.questItemId);
      if (!questItem) throw new SenderError('Quest item not found');
      if (questItem.characterId !== character.id) throw new SenderError('That quest item does not belong to your character');
      if (!questItem.discovered) throw new SenderError('You have not yet discovered this item');
      if (questItem.looted) throw new SenderError('You have already looted this item');

      // Mark as looted
      ctx.db.quest_item.id.update({ ...questItem, looted: true });

      // Find matching quest instance (not completed, matching template)
      let questInstance: any = null;
      for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
        if (qi.completed) continue;
        if (qi.questTemplateId === questItem.questTemplateId) {
          questInstance = qi;
          break;
        }
      }

      // If found, advance explore quest progress (complete on single item loot)
      if (questInstance) {
        ctx.db.quest_instance.id.update({
          ...questInstance,
          progress: 1n,
          completed: true,
          completedAt: questInstance.completedAt,
        });

        const qt = ctx.db.quest_template.id.find(questInstance.questTemplateId);
        if (qt) {
          const npc = ctx.db.npc.id.find(qt.npcId);
          const giver = npc ? npc.name : 'the quest giver';
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
            `Quest complete: ${qt.name}. Return to ${giver}.`);
        }
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `You found ${questItem.name}!`);

      // 30% aggro chance (deterministic roll)
      const roll = (BigInt(character.id) ^ ctx.timestamp.microsSinceUnixEpoch) % 100n;
      if (roll < 30n) {
        try {
          ensureSpawnsForLocation(ctx, character.locationId);
          // Find an available spawn at the character's location
          let availableSpawn: any = null;
          for (const spawn of ctx.db.enemy_spawn.by_location.filter(character.locationId)) {
            if (spawn.state === 'available') {
              availableSpawn = spawn;
              break;
            }
          }
          if (availableSpawn) {
            const groupId = effectiveGroupId(character);
            const participants = groupId
              ? [...ctx.db.group_member.by_group.filter(groupId)]
                  .map((m: any) => ctx.db.character.id.find(m.characterId))
                  .filter(Boolean)
              : [character];
            startCombatForSpawn(ctx, character, availableSpawn, participants, groupId ?? null);
          }
        } catch (_e) {
          // If aggro fails (safe zone etc.), skip silently
        }
      }
    }
  );

  // pull_named_enemy reducer
  spacetimedb.reducer(
    'pull_named_enemy',
    { characterId: t.u64(), namedEnemyId: t.u64() },
    (ctx: any, args: any) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);

      // Find and validate the named enemy
      const namedEnemy = ctx.db.named_enemy.id.find(args.namedEnemyId);
      if (!namedEnemy) throw new SenderError('Named enemy not found');
      if (namedEnemy.characterId !== character.id) throw new SenderError('That named enemy does not belong to your character');
      if (!namedEnemy.isAlive) throw new SenderError('That enemy is not currently alive');

      // Find the enemy template
      const enemyTemplate = ctx.db.enemy_template.id.find(namedEnemy.enemyTemplateId);
      if (!enemyTemplate) throw new SenderError('Enemy template not found');

      // Mark the named enemy as not alive
      ctx.db.named_enemy.id.update({
        ...namedEnemy,
        isAlive: false,
        lastKilledAt: ctx.timestamp,
      });

      // Spawn the named enemy using spawnEnemyWithTemplate
      const spawn = spawnEnemyWithTemplate(ctx, character.locationId, namedEnemy.enemyTemplateId);

      // Start combat for the character's group
      const groupId = effectiveGroupId(character);
      const participants = groupId
        ? [...ctx.db.group_member.by_group.filter(groupId)]
            .map((m: any) => ctx.db.character.id.find(m.characterId))
            .filter(Boolean)
        : [character];
      startCombatForSpawn(ctx, character, spawn, participants, groupId ?? null);

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'combat',
        `You engage ${namedEnemy.name}!`);
    }
  );
};
