import { getAffinityForNpc, canConverseWithNpc, awardNpcAffinity } from '../helpers/npc_affinity';
import { appendSystemMessage } from '../helpers/events';

export const registerCommandReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireCharacterOwnedBy,
    requirePlayerUserId,
    appendPrivateEvent,
    appendNpcDialog,
    appendLocationEvent,
    appendGroupEvent,
    fail,
    computeBaseStats,
    recomputeCharacterDerived,
    xpRequiredForLevel,
    MAX_LEVEL,
    ensureWorldLayout,
    ensureStarterItemTemplates,
    ensureResourceItemTemplates,
    ensureAbilityTemplates,
    ensureRecipeTemplates,
    ensureNpcs,
    ensureQuestTemplates,
    ensureEnemyTemplatesAndRoles,
    ensureEnemyAbilities,
    ensureLocationEnemyTemplates,
    ensureLocationRuntimeBootstrap,
    ensureLootTables,
    ensureVendorInventory,
    syncAllContent,
  } = deps;

  const hailNpc = (ctx: any, character: any, npcName: string) => {
    const targetName = npcName.trim();
    if (!targetName) return fail(ctx, character, 'NPC name required');
    let npc: any | null = null;
    for (const row of ctx.db.npc.by_location.filter(character.locationId)) {
      if (row.name.toLowerCase() === targetName.toLowerCase()) {
        npc = row;
        break;
      }
    }
    if (!npc) return fail(ctx, character, 'No such NPC here');

    // Get affinity for dynamic greeting
    const affinity = Number(getAffinityForNpc(ctx, character.id, npc.id));

    // Get faction standing if NPC has faction
    let factionStanding = 0;
    if (npc.factionId) {
      for (const fs of ctx.db.factionStanding.by_character.filter(character.id)) {
        if (fs.factionId === npc.factionId) {
          factionStanding = Number(fs.standing);
          break;
        }
      }
    }

    // Get renown rank
    let renownRank = 0;
    for (const r of ctx.db.renown.by_character.filter(character.id)) {
      renownRank = Number(r.currentRank);
      break;
    }

    // Generate dynamic greeting
    let greeting: string;
    if (factionStanding < -50 || affinity < -50) {
      greeting = `${npc.name} glares at you with open hostility. "Leave. Now."`;
    } else if (affinity >= 75) {
      greeting = `${npc.name} greets you warmly. "Ah, my friend! It is good to see you again."`;
    } else if (affinity >= 50) {
      greeting = `${npc.name} nods in recognition. "Welcome back. What can I do for you?"`;
    } else if (affinity >= 25) {
      greeting = `${npc.name} regards you with growing familiarity. "You again. What brings you?"`;
    } else if (renownRank >= 5 && affinity < 25) {
      greeting = `${npc.name} eyes you with a mix of respect and wariness. "Your reputation precedes you."`;
    } else {
      greeting = `${npc.name} says, "${npc.greeting}"`;
    }

    // IMPORTANT: Log "You begin to talk with X" to Log panel, actual greeting goes to Journal
    appendSystemMessage(ctx, character, `You begin to talk with ${npc.name}.`);

    // Greeting goes to Journal (NPC Dialog panel) AND Log (private NPC message)
    appendNpcDialog(ctx, character.id, npc.id, greeting);
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', greeting);

    // Award small affinity for greeting (if cooldown allows)
    if (canConverseWithNpc(ctx, character.id, npc.id)) {
      awardNpcAffinity(ctx, character, npc.id, 1n);
    }

    const quests = [...ctx.db.questTemplate.by_npc.filter(npc.id)].filter(
      (quest) => character.level >= quest.minLevel && character.level <= quest.maxLevel
    );
    if (quests.length === 0) return;

    const existing = [...ctx.db.questInstance.by_character.filter(character.id)];
    for (const quest of quests) {
      const active = existing.find((row) => row.questTemplateId === quest.id);
      if (active) {
        if (!active.completed) {
          const progress = `${active.progress}/${quest.requiredCount}`;
          const reminder = `${npc.name} says, "You are still working on ${quest.name} (${progress})."`;
          appendNpcDialog(ctx, character.id, npc.id, reminder);
        }
        continue;
      }
      const enemy = ctx.db.enemyTemplate.id.find(quest.targetEnemyTemplateId);
      const targetNameText = enemy ? enemy.name : 'creatures';
      const terrainHint = enemy?.terrainTypes
        ? enemy.terrainTypes.split(',')[0]?.trim()
        : '';
      const habitat = terrainHint
        ? ` You can usually find them in ${terrainHint} areas.`
        : '';
      ctx.db.questInstance.insert({
        id: 0n,
        characterId: character.id,
        questTemplateId: quest.id,
        progress: 0n,
        completed: false,
        acceptedAt: ctx.timestamp,
        completedAt: undefined,
      });
      const offer = `${npc.name} offers you "${quest.name}". Objective: Slay ${quest.requiredCount} ${targetNameText}(s).${habitat}`;
      appendNpcDialog(ctx, character.id, npc.id, offer);
      return;
    }
  };

  spacetimedb.reducer('submit_command', { characterId: t.u64(), text: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trimmed = args.text.trim();
    if (!trimmed) return fail(ctx, character, 'Command is empty');

    if (trimmed.toLowerCase() === '/look' || trimmed.toLowerCase() === 'look') {
      const location = ctx.db.location.id.find(character.locationId);
      if (location) {
        appendPrivateEvent(
          ctx,
          character.id,
          requirePlayerUserId(ctx),
          'look',
          `${location.name}: ${location.description}`
        );
      }
      return;
    }

    if (trimmed.toLowerCase() === '/synccontent') {
      const userId = requirePlayerUserId(ctx);
      syncAllContent(ctx);
      appendPrivateEvent(
        ctx,
        character.id,
        userId,
        'system',
        'Content sync completed.'
      );
      return;
    }

    const hailMatch = trimmed.match(/^hail[,\s]+(.+)$/i);
    if (hailMatch) {
      hailNpc(ctx, character, hailMatch[1]);
      return;
    }

    ctx.db.command.insert({
      id: 0n,
      ownerUserId: requirePlayerUserId(ctx),
      characterId: character.id,
      text: trimmed,
      status: 'pending',
      createdAt: ctx.timestamp,
    });

    appendPrivateEvent(ctx, character.id, requirePlayerUserId(ctx), 'command', `> ${trimmed}`);
  });

  spacetimedb.reducer('say', { characterId: t.u64(), message: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trimmed = args.message.trim();
    if (!trimmed) return fail(ctx, character, 'Message is empty');

    appendLocationEvent(ctx, character.locationId, 'say', `${character.name} says, "${trimmed}"`);
  });

  spacetimedb.reducer('hail_npc', { characterId: t.u64(), npcName: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    hailNpc(ctx, character, args.npcName);
  });

  spacetimedb.reducer('group_message', { characterId: t.u64(), message: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trimmed = args.message.trim();
    if (!trimmed) return fail(ctx, character, 'Message is empty', 'group');
    if (!character.groupId) return fail(ctx, character, 'You are not in a group', 'group');
    appendGroupEvent(ctx, character.groupId, character.id, 'group', `${character.name}: ${trimmed}`);
  });

  spacetimedb.reducer('level_character', { characterId: t.u64(), level: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const target = args.level;
    if (target < 1n || target > MAX_LEVEL) {
      return fail(ctx, character, `Level must be between 1 and ${MAX_LEVEL.toString()}`);
    }
    if (target < character.level) {
      return fail(ctx, character, 'Leveling down is not supported');
    }
    if (target === character.level) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You are already level ${target}.`
      );
      return;
    }

    for (let lvl = character.level + 1n; lvl <= target; lvl += 1n) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You reached level ${lvl}.`
      );
    }

    const newBase = computeBaseStats(character.className, target);
    const updated = {
      ...character,
      level: target,
      xp: xpRequiredForLevel(target),
      str: newBase.str,
      dex: newBase.dex,
      cha: newBase.cha,
      wis: newBase.wis,
      int: newBase.int,
    };
    ctx.db.character.id.update(updated);
    recomputeCharacterDerived(ctx, updated);
  });

  spacetimedb.reducer(
    'whisper',
    { characterId: t.u64(), targetName: t.string(), message: t.string() },
    (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const targetName = args.targetName.trim();
    const message = args.message.trim();
    if (!targetName) return fail(ctx, character, 'Target required', 'whisper');
    if (!message) return fail(ctx, character, 'Message is empty', 'whisper');

      let target: typeof deps.Character.rowType | null = null;
      for (const row of ctx.db.character.iter()) {
        if (row.name.toLowerCase() === targetName.toLowerCase()) {
          if (target) return fail(ctx, character, 'Multiple characters share that name', 'whisper');
          target = row;
        }
      }
      if (!target) return fail(ctx, character, 'Target not found', 'whisper');

      const senderUserId = requirePlayerUserId(ctx);
      appendPrivateEvent(
        ctx,
        character.id,
        senderUserId,
        'whisper',
        `You whisper to ${target.name}: "${message}"`
      );
      appendPrivateEvent(
        ctx,
        target.id,
        target.ownerUserId,
        'whisper',
        `${character.name} whispers: "${message}"`
      );
    }
  );
};
