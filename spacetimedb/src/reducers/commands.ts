import { getAffinityForNpc, canConverseWithNpc, awardNpcAffinity, getAvailableDialogueOptions } from '../helpers/npc_affinity';
import { appendSystemMessage, appendWorldEvent } from '../helpers/events';
import { generateAffixData, buildDisplayName } from '../helpers/items';
import { STARTER_ITEM_NAMES } from '../data/combat_constants';

// Compute all racial contributions at a target level (same logic as awardXp / computeRacialAtLevel).
function computeRacialAtLevelForAdmin(raceRow: any, level: bigint) {
  const evenLevels = level / 2n;
  const r = {
    str: 0n, dex: 0n, int: 0n, wis: 0n, cha: 0n,
    racialSpellDamage: 0n, racialPhysDamage: 0n,
    racialMaxHp: 0n, racialMaxMana: 0n,
    racialManaRegen: 0n, racialStaminaRegen: 0n,
    racialCritBonus: 0n, racialArmorBonus: 0n, racialDodgeBonus: 0n,
    racialHpRegen: 0n, racialMaxStamina: 0n,
    racialTravelCostIncrease: 0n, racialTravelCostDiscount: 0n,
    racialHitBonus: 0n, racialParryBonus: 0n,
    racialFactionBonus: 0n, racialMagicResist: 0n, racialPerceptionBonus: 0n,
    racialLootBonus: 0n,
  };
  function applyType(t: string, v: bigint) {
    switch (t) {
      case 'stat_str': r.str += v; break;
      case 'stat_dex': r.dex += v; break;
      case 'stat_int': r.int += v; break;
      case 'stat_wis': r.wis += v; break;
      case 'stat_cha': r.cha += v; break;
      case 'spell_damage': r.racialSpellDamage += v; break;
      case 'phys_damage': r.racialPhysDamage += v; break;
      case 'max_hp': r.racialMaxHp += v; break;
      case 'max_mana': r.racialMaxMana += v; break;
      case 'mana_regen': r.racialManaRegen += v; break;
      case 'stamina_regen': r.racialStaminaRegen += v; break;
      case 'crit_chance': r.racialCritBonus += v; break;
      case 'armor': r.racialArmorBonus += v; break;
      case 'dodge': r.racialDodgeBonus += v; break;
      case 'hp_regen': r.racialHpRegen += v; break;
      case 'max_stamina': r.racialMaxStamina += v; break;
      case 'hit_chance': r.racialHitBonus += v; break;
      case 'parry': r.racialParryBonus += v; break;
      case 'faction_bonus': r.racialFactionBonus += v; break;
      case 'magic_resist': r.racialMagicResist += v; break;
      case 'perception': r.racialPerceptionBonus += v; break;
      case 'travel_cost_increase': r.racialTravelCostIncrease += v; break;
      case 'travel_cost_discount': r.racialTravelCostDiscount += v; break;
      case 'loot_bonus': r.racialLootBonus += v; break;
    }
  }
  applyType(raceRow.bonus1Type, raceRow.bonus1Value);
  applyType(raceRow.bonus2Type, raceRow.bonus2Value);
  if (raceRow.penaltyType && raceRow.penaltyValue) {
    const pt = raceRow.penaltyType as string;
    const pv = raceRow.penaltyValue as bigint;
    if (pt === 'travel_cost_increase' || pt === 'travel_cost_discount') {
      applyType(pt, pv);
    } else {
      applyType(pt, -pv);
    }
  }
  if (evenLevels > 0n) {
    applyType(raceRow.levelBonusType, raceRow.levelBonusValue * evenLevels);
  }
  return r;
}

export const registerCommandReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireAdmin,
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
    awardXp,
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
    addItemToInventory,
    MAX_INVENTORY_SLOTS,
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

    // Check for completed quests and auto-turn them in
    const quests = [...ctx.db.questTemplate.by_npc.filter(npc.id)];
    const questInstances = [...ctx.db.questInstance.by_character.filter(character.id)];

    for (const quest of quests) {
      const active = questInstances.find((row) => row.questTemplateId === quest.id);
      if (active && active.completed && !active.completedAt) {
        // Quest is ready to turn in!
        const enemy = ctx.db.enemyTemplate.id.find(quest.targetEnemyTemplateId);
        const targetNameText = enemy ? enemy.name : 'creatures';

        // Mark quest as turned in
        ctx.db.questInstance.id.update({
          ...active,
          completedAt: ctx.timestamp,
        });

        // NPC dialogue for quest completion
        const turnInMsg = `${npc.name} says, "Well done! You have slain ${quest.requiredCount} ${targetNameText}(s)."`;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', turnInMsg);
        appendNpcDialog(ctx, character.id, npc.id, turnInMsg);

        // Award XP — use awardXp so level-up check runs
        // Pass character.level as enemyLevel: diff=0 → 100% modifier, no scaling penalty on quest XP
        const xpResult = awardXp(ctx, character, character.level, quest.rewardXp);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', `You gain ${xpResult.xpGained} XP.`);
        if (xpResult.leveledUp) {
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            `You reached level ${xpResult.newLevel}!`);
          appendLocationEvent(ctx, character.locationId, 'system',
            `${character.name} reached level ${xpResult.newLevel}.`);
        }

        // Award affinity (show in faction/gold color)
        const affinityGained = 10n;
        awardNpcAffinity(ctx, character, npc.id, affinityGained);
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'faction', `You gain ${affinityGained} affinity with ${npc.name}.`);

        return; // Stop here, quest turn-in takes priority
      }
    }

    // Check for delivery quest completion (new quest types)
    const deliveryInstances = [...ctx.db.questInstance.by_character.filter(character.id)];
    for (const qi of deliveryInstances) {
      if (qi.completed || qi.completedAt) continue;
      const qt = ctx.db.questTemplate.id.find(qi.questTemplateId);
      if (!qt) continue;
      if ((qt.questType ?? 'kill') !== 'delivery') continue;
      if (qt.targetNpcId !== npc.id) continue;

      // Delivery quest complete!
      ctx.db.questInstance.id.update({
        ...qi,
        progress: 1n,
        completed: true,
        completedAt: ctx.timestamp,
      });

      // Award XP — use awardXp so level-up check runs
      const deliveryXpResult = awardXp(ctx, character, character.level, qt.rewardXp);

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `Delivery complete: ${qt.name}. ${npc.name} accepts your delivery.`);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward',
        `You gain ${deliveryXpResult.xpGained} XP.`);
      if (deliveryXpResult.leveledUp) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `You reached level ${deliveryXpResult.newLevel}!`);
        appendLocationEvent(ctx, character.locationId, 'system',
          `${character.name} reached level ${deliveryXpResult.newLevel}.`);
      }
      appendNpcDialog(ctx, character.id, npc.id,
        `${npc.name} says, "Ah, you've brought it. Thank you."`);

      // Award affinity
      awardNpcAffinity(ctx, character, npc.id, 15n);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'faction',
        `You gain 15 affinity with ${npc.name}.`);

      // DON'T return — continue to normal hail so follow-up dialogue branches appear
    }

    // Get the root dialogue option (empty playerText)
    let rootOption: any | null = null;
    for (const opt of ctx.db.npcDialogueOption.by_npc.filter(npc.id)) {
      if (opt.playerText === '' && (opt.parentOptionId === undefined || opt.parentOptionId === null)) {
        rootOption = opt;
        break;
      }
    }

    if (!rootOption) {
      // Fallback if no root option defined
      const fallback = `${npc.name} nods but has nothing to say.`;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', fallback);
      return;
    }

    // Check if already visited
    let alreadyVisited = false;
    for (const visited of ctx.db.npcDialogueVisited.by_character.filter(character.id)) {
      if (visited.npcId === npc.id && visited.dialogueOptionId === rootOption.id) {
        alreadyVisited = true;
        break;
      }
    }

    // Display greeting with [keywords] to Log (always)
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', `${npc.name}: ${rootOption.npcResponse}`);

    // Only log to Journal if first time
    if (!alreadyVisited) {
      appendNpcDialog(ctx, character.id, npc.id, `${npc.name}: ${rootOption.npcResponse}`);

      // Mark as visited
      ctx.db.npcDialogueVisited.insert({
        id: 0n,
        characterId: character.id,
        npcId: npc.id,
        dialogueOptionId: rootOption.id,
        visitedAt: ctx.timestamp,
      });
    }

    // Award small affinity for greeting (if cooldown allows)
    if (canConverseWithNpc(ctx, character.id, npc.id)) {
      awardNpcAffinity(ctx, character, npc.id, 1n);
    }
  };

  spacetimedb.reducer('submit_command', { characterId: t.u64(), text: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }
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
      requireAdmin(ctx);
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

    const unlockRaceMatch = trimmed.match(/^\/unlockrace\s+(.+)$/i);
    if (unlockRaceMatch) {
      requireAdmin(ctx);
      const raceName = unlockRaceMatch[1].trim();
      let found = false;
      for (const race of ctx.db.race.iter()) {
        if (race.name.toLowerCase() === raceName.toLowerCase()) {
          if (race.unlocked) {
            appendPrivateEvent(
              ctx, character.id, requirePlayerUserId(ctx), 'system',
              `${race.name} is already unlocked.`
            );
            return;
          }
          ctx.db.race.id.update({ ...race, unlocked: true });
          appendWorldEvent(ctx, 'world_event', `A world-shaking event has occurred — the ${race.name} have emerged from hiding and may now walk among us!`);
          appendPrivateEvent(
            ctx, character.id, requirePlayerUserId(ctx), 'system',
            `Unlocked race: ${race.name}.`
          );
          found = true;
          break;
        }
      }
      if (!found) {
        appendPrivateEvent(
          ctx, character.id, requirePlayerUserId(ctx), 'system',
          `Race not found: "${raceName}". Check spelling (case-insensitive).`
        );
      }
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
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }
    const trimmed = args.message.trim();
    if (!trimmed) return fail(ctx, character, 'Message is empty');

    // Check if this is a dialogue keyword for an NPC at this location
    const npcsHere = [...ctx.db.npc.by_location.filter(character.locationId)];
    for (const npc of npcsHere) {
      // Get all dialogue options for this NPC
      const dialogueOptions = [...ctx.db.npcDialogueOption.by_npc.filter(npc.id)];
      for (const option of dialogueOptions) {
        // Match keyword (case-insensitive)
        if (option.playerText.toLowerCase() === trimmed.toLowerCase()) {
          // Found a matching dialogue option!
          const affinity = getAffinityForNpc(ctx, character.id, npc.id);

          // Check affinity requirement
          if (affinity < option.requiredAffinity) {
            // Affinity locked
            if (option.isAffinityLocked && option.affinityHint) {
              const lockedMsg = `${npc.name} says, "Maybe we can talk about that later. ${option.affinityHint}"`;
              appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', lockedMsg);
            } else {
              const genericLocked = `${npc.name} says, "I'm not ready to discuss that with you yet."`;
              appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', genericLocked);
            }
            return; // Stop here
          }

          // Check if already visited
          let alreadyVisited = false;
          for (const visited of ctx.db.npcDialogueVisited.by_character.filter(character.id)) {
            if (visited.npcId === npc.id && visited.dialogueOptionId === option.id) {
              alreadyVisited = true;
              break;
            }
          }

          // If already visited and no new children, show "nothing new"
          if (alreadyVisited) {
            const childOptions = getAvailableDialogueOptions(ctx, character.id, npc.id, option.id);
            if (childOptions.length === 0) {
              const nothingNew = `${npc.name} says, "I have nothing new to add about that."`;
              appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', nothingNew);
              return;
            }
          }

          // Display NPC response with embedded [keywords] to Log
          const response = `${npc.name}: ${option.npcResponse}`;
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', response);

          // Only log to Journal if first time
          if (!alreadyVisited) {
            appendNpcDialog(ctx, character.id, npc.id, response);

            // Mark as visited
            ctx.db.npcDialogueVisited.insert({
              id: 0n,
              characterId: character.id,
              npcId: npc.id,
              dialogueOptionId: option.id,
              visitedAt: ctx.timestamp,
            });
          }

          // Award affinity change
          if (option.affinityChange > 0n) {
            awardNpcAffinity(ctx, character, npc.id, option.affinityChange);
          }

          // Auto-accept quest if offered
          if (option.questTemplateName) {
            // Look up quest by name (search all quests, not just for this NPC)
            let questTemplate: any = null;
            for (const qt of ctx.db.questTemplate.iter()) {
              if (qt.name === option.questTemplateName) {
                questTemplate = qt;
                break;
              }
            }

            if (questTemplate) {
              // Check if already has this quest
              let hasQuest = false;
              for (const qi of ctx.db.questInstance.by_character.filter(character.id)) {
                if (qi.questTemplateId === questTemplate.id) {
                  hasQuest = true;
                  break;
                }
              }

              if (!hasQuest) {
                // Auto-accept quest
                ctx.db.questInstance.insert({
                  id: 0n,
                  characterId: character.id,
                  questTemplateId: questTemplate.id,
                  progress: 0n,
                  completed: false,
                  acceptedAt: ctx.timestamp,
                  completedAt: undefined,
                });

                const enemy = ctx.db.enemyTemplate.id.find(questTemplate.targetEnemyTemplateId);
                const targetNameText = enemy ? enemy.name : 'creatures';
                const questAccept = `${npc.name} offers you "${questTemplate.name}". Objective: Slay ${questTemplate.requiredCount} ${targetNameText}(s). Quest accepted.`;
                appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', questAccept);
                appendNpcDialog(ctx, character.id, npc.id, questAccept);
              } else {
                // Already has quest - show progress
                const qi = [...ctx.db.questInstance.by_character.filter(character.id)].find(q => q.questTemplateId === questTemplate.id);
                if (qi && !qi.completed) {
                  const reminder = `${npc.name} says, "You are still working on ${questTemplate.name} (${qi.progress}/${questTemplate.requiredCount})."`;
                  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc', reminder);
                }
              }
            }
          }

          return; // Handled as dialogue, don't broadcast as chat
        }
      }
    }

    // No dialogue match - broadcast as normal chat
    appendLocationEvent(ctx, character.locationId, 'say', `${character.name} says, "${trimmed}"`);
  });

  spacetimedb.reducer('hail_npc', { characterId: t.u64(), npcName: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    hailNpc(ctx, character, args.npcName);
  });

  spacetimedb.reducer(
    'create_test_item',
    { characterId: t.u64(), qualityTier: t.string() },
    (ctx, { characterId, qualityTier }) => {
      requireAdmin(ctx);
      const character = requireCharacterOwnedBy(ctx, characterId);

      const validTiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      if (!validTiers.includes(qualityTier)) {
        return fail(ctx, character, `Invalid quality tier. Use: ${validTiers.join(', ')}`);
      }

      // Pick a random gear slot from those supported by affix catalog
      const gearSlots = ['chest', 'legs', 'boots', 'head', 'hands', 'wrists', 'belt', 'mainHand'];
      const slotIdx = Number(ctx.timestamp.microsSinceUnixEpoch % BigInt(gearSlots.length));
      const slot = gearSlots[slotIdx]!;

      // Find any item template for this slot (exclude starter items)
      let template: any = null;
      for (const tmpl of ctx.db.itemTemplate.iter()) {
        if (tmpl.slot === slot && !tmpl.isJunk && !STARTER_ITEM_NAMES.has(tmpl.name)) {
          template = tmpl;
          break;
        }
      }
      // Fallback: if no template found for the slot, pick any non-junk non-starter gear template
      if (!template) {
        for (const tmpl of ctx.db.itemTemplate.iter()) {
          if (['chest', 'legs', 'boots', 'mainHand', 'head', 'hands', 'wrists', 'belt'].includes(tmpl.slot) && !tmpl.isJunk && !STARTER_ITEM_NAMES.has(tmpl.name)) {
            template = tmpl;
            break;
          }
        }
      }
      if (!template) return fail(ctx, character, 'No item templates found to create test item');

      // Check inventory space (max non-equipped items)
      const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].filter((r) => !r.equippedSlot).length;
      if (itemCount >= MAX_INVENTORY_SLOTS) return fail(ctx, character, 'Backpack is full');

      // Add base item to inventory
      addItemToInventory(ctx, character.id, template.id, 1n);

      // For non-common, apply affixes
      let displayName = template.name;
      if (qualityTier !== 'common') {
        // Find the newly created instance (no qualityTier set yet, not equipped)
        const instances = [...ctx.db.itemInstance.by_owner.filter(character.id)];
        const newInstance = instances.find(
          (i) => i.templateId === template.id && !i.equippedSlot && !i.qualityTier
        );
        if (newInstance) {
          const seedBase = ctx.timestamp.microsSinceUnixEpoch + character.id;
          const affixes = generateAffixData(template.slot, qualityTier, seedBase);
          for (const affix of affixes) {
            ctx.db.itemAffix.insert({
              id: 0n,
              itemInstanceId: newInstance.id,
              affixType: affix.affixType,
              affixKey: affix.affixKey,
              affixName: affix.affixName,
              statKey: affix.statKey,
              magnitude: affix.magnitude,
            });
          }
          displayName = buildDisplayName(template.name, affixes);
          ctx.db.itemInstance.id.update({
            ...newInstance,
            qualityTier,
            displayName,
          });
        }
      }

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'reward',
        `[Test] Created ${qualityTier} item: ${displayName}.`
      );
    }
  );

  spacetimedb.reducer(
    'create_recipe_scroll',
    { characterId: t.u64(), recipeName: t.string() },
    (ctx, { characterId, recipeName }) => {
      requireAdmin(ctx);
      const character = requireCharacterOwnedBy(ctx, characterId);

      const itemCount = [...ctx.db.itemInstance.by_owner.filter(character.id)].filter((r: any) => !r.equippedSlot).length;
      if (itemCount >= MAX_INVENTORY_SLOTS) return fail(ctx, character, 'Backpack is full');

      const scrollName = recipeName.trim()
        ? `Scroll: ${recipeName.trim()}`
        : (() => {
            // Pick a random scroll from all Scroll: templates
            const scrolls: any[] = [];
            for (const tmpl of ctx.db.itemTemplate.iter()) {
              if (tmpl.name.startsWith('Scroll:')) scrolls.push(tmpl);
            }
            if (!scrolls.length) return null;
            const idx = Number(ctx.timestamp.microsSinceUnixEpoch % BigInt(scrolls.length));
            return scrolls[idx]!.name;
          })();

      if (!scrollName) return fail(ctx, character, 'No recipe scrolls found in database.');

      let template: any = null;
      for (const tmpl of ctx.db.itemTemplate.iter()) {
        if (tmpl.name === scrollName) { template = tmpl; break; }
      }
      if (!template) return fail(ctx, character, `No scroll found: "${scrollName}". Valid names: Longsword, Dagger, Staff, Mace, Shield, Helm, Breastplate, Bracers, Gauntlets, Girdle, Greaves, Sabatons, Ring, Amulet, Cloak`);

      addItemToInventory(ctx, character.id, template.id, 1n);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'reward', `[Test] Added ${template.name} to inventory.`);
    }
  );

  spacetimedb.reducer('group_message', { characterId: t.u64(), message: t.string() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const trimmed = args.message.trim();
    if (!trimmed) return fail(ctx, character, 'Message is empty', 'group');
    if (!character.groupId) return fail(ctx, character, 'You are not in a group', 'group');
    appendGroupEvent(ctx, character.groupId, character.id, 'group', `${character.name}: ${trimmed}`);
  });

  spacetimedb.reducer('level_character', { characterId: t.u64(), level: t.u64() }, (ctx, args) => {
    requireAdmin(ctx);
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

    const raceRow = [...ctx.db.race.iter()].find((r: any) => r.name === character.race);

    for (let lvl = character.level + 1n; lvl <= target; lvl += 1n) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', `You reached level ${lvl}.`);
      if (lvl % 2n === 0n && raceRow) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `Your ${raceRow.name} heritage grows stronger at level ${lvl}.`);
      }
    }

    const newBase = computeBaseStats(character.className, target);

    // Compute racial at target level using the same formula as awardXp
    const racial = raceRow ? computeRacialAtLevelForAdmin(raceRow, target) : null;

    const updated = {
      ...character,
      level: target,
      xp: xpRequiredForLevel(target),
      str: newBase.str + (racial?.str ?? 0n),
      dex: newBase.dex + (racial?.dex ?? 0n),
      cha: newBase.cha + (racial?.cha ?? 0n),
      wis: newBase.wis + (racial?.wis ?? 0n),
      int: newBase.int + (racial?.int ?? 0n),
      racialSpellDamage: racial?.racialSpellDamage || undefined,
      racialPhysDamage: racial?.racialPhysDamage || undefined,
      racialMaxHp: racial?.racialMaxHp || undefined,
      racialMaxMana: racial?.racialMaxMana || undefined,
      racialManaRegen: racial?.racialManaRegen || undefined,
      racialStaminaRegen: racial?.racialStaminaRegen || undefined,
      racialCritBonus: racial?.racialCritBonus || undefined,
      racialArmorBonus: racial?.racialArmorBonus || undefined,
      racialDodgeBonus: racial?.racialDodgeBonus || undefined,
      racialHpRegen: racial?.racialHpRegen || undefined,
      racialMaxStamina: racial?.racialMaxStamina || undefined,
      racialTravelCostIncrease: racial?.racialTravelCostIncrease || undefined,
      racialTravelCostDiscount: racial?.racialTravelCostDiscount || undefined,
      racialHitBonus: racial?.racialHitBonus || undefined,
      racialParryBonus: racial?.racialParryBonus || undefined,
      racialFactionBonus: racial?.racialFactionBonus || undefined,
      racialMagicResist: racial?.racialMagicResist || undefined,
      racialPerceptionBonus: racial?.racialPerceptionBonus || undefined,
      racialLootBonus: racial?.racialLootBonus || undefined,
    };
    ctx.db.character.id.update(updated);
    recomputeCharacterDerived(ctx, updated);
  });

  spacetimedb.reducer('recompute_racial_all', {}, (ctx) => {
    requireAdmin(ctx);
    let count = 0;
    for (const character of ctx.db.character.iter()) {
      const raceRow = [...ctx.db.race.iter()].find((r: any) => r.name === character.race);
      if (!raceRow) continue;
      const racial = computeRacialAtLevelForAdmin(raceRow, character.level);
      const updated = {
        ...character,
        racialSpellDamage: racial.racialSpellDamage || undefined,
        racialPhysDamage: racial.racialPhysDamage || undefined,
        racialMaxHp: racial.racialMaxHp || undefined,
        racialMaxMana: racial.racialMaxMana || undefined,
        racialManaRegen: racial.racialManaRegen || undefined,
        racialStaminaRegen: racial.racialStaminaRegen || undefined,
        racialCritBonus: racial.racialCritBonus || undefined,
        racialArmorBonus: racial.racialArmorBonus || undefined,
        racialDodgeBonus: racial.racialDodgeBonus || undefined,
        racialHpRegen: racial.racialHpRegen || undefined,
        racialMaxStamina: racial.racialMaxStamina || undefined,
        racialTravelCostIncrease: racial.racialTravelCostIncrease || undefined,
        racialTravelCostDiscount: racial.racialTravelCostDiscount || undefined,
        racialHitBonus: racial.racialHitBonus || undefined,
        racialParryBonus: racial.racialParryBonus || undefined,
        racialFactionBonus: racial.racialFactionBonus || undefined,
        racialMagicResist: racial.racialMagicResist || undefined,
        racialPerceptionBonus: racial.racialPerceptionBonus || undefined,
        racialLootBonus: racial.racialLootBonus || undefined,
      };
      ctx.db.character.id.update(updated);
      recomputeCharacterDerived(ctx, updated);
      count += 1;
    }
    appendSystemMessage(ctx, `[Admin] Recomputed racial bonuses for ${count} character(s).`);
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
