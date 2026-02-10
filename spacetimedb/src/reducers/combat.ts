import { ENEMY_ABILITIES } from '../data/ability_catalog';

export const registerCombatReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    ScheduleAt,
    CombatLoopTick,
    HealthRegenTick,
    EffectTick,
    HotTick,
    CastTick,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    activeCombatIdForCharacter,
    ensureAvailableSpawn,
    computeEnemyStats,
    scheduleCombatTick,
    sumCharacterEffect,
    sumEnemyEffect,
    applyArmorMitigation,
    abilityCooldownMicros,
    executeAbility,
    executeEnemyAbility,
    rollAttackOutcome,
    EnemyAbility,
    CombatEnemyCast,
    CombatEnemyCooldown,
    CombatPendingAdd,
    hasShieldEquipped,
    canParry,
    enemyAbilityCastMicros,
    enemyAbilityCooldownMicros,
    PullState,
    PullTick,
  } = deps;

  const AUTO_ATTACK_INTERVAL = 5_000_000n;
  const RETRY_ATTACK_INTERVAL = 1_000_000n;
  const DEFAULT_AI_CHANCE = 50;
  const DEFAULT_AI_WEIGHT = 50;
  const DEFAULT_AI_RANDOMNESS = 15;
  const PULL_DELAY_CAREFUL = 2_000_000n;
  const PULL_DELAY_BODY = 1_000_000n;
  const PULL_ADD_DELAY_ROUNDS = 2n;

  const clearCharacterEffectsOnDeath = (ctx: any, character: any) => {
    for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
      if (effect.effectType === 'hp_bonus') {
        const nextMax = character.maxHp > effect.magnitude ? character.maxHp - effect.magnitude : 0n;
        const nextHp = character.hp > nextMax ? nextMax : character.hp;
        ctx.db.character.id.update({ ...character, maxHp: nextMax, hp: nextHp });
      }
      ctx.db.characterEffect.id.delete(effect.id);
    }
  };

  const markParticipantDead = (
    ctx: any,
    participant: any,
    character: any,
    enemyName: string
  ) => {
    ctx.db.combatParticipant.id.update({ ...participant, status: 'dead' });
    clearCharacterEffectsOnDeath(ctx, character);
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'combat',
      `You have died. Killed by ${enemyName}.`
    );
  };

  const clearCombatArtifacts = (ctx: any, combatId: bigint) => {
    const loopTable = ctx.db.combatLoopTick;
    if (loopTable && loopTable.iter && loopTable.id && loopTable.id.delete) {
      for (const row of loopTable.iter()) {
        if (row.combatId !== combatId) continue;
        loopTable.id.delete(row.scheduledId);
      }
    }
    const participantIds: bigint[] = [];
    for (const row of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      participantIds.push(row.characterId);
      ctx.db.combatParticipant.id.delete(row.id);
    }
    for (const characterId of participantIds) {
      const character = ctx.db.character.id.find(characterId);
      if (character && character.combatTargetEnemyId) {
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: undefined });
      }
      for (const cast of ctx.db.characterCast.by_character.filter(characterId)) {
        ctx.db.characterCast.id.delete(cast.id);
      }
    }
    for (const row of ctx.db.aggroEntry.by_combat.filter(combatId)) {
      ctx.db.aggroEntry.id.delete(row.id);
    }
    for (const row of ctx.db.combatEnemy.by_combat.filter(combatId)) {
      ctx.db.combatEnemy.id.delete(row.id);
    }
    for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combatId)) {
      ctx.db.combatEnemyEffect.id.delete(row.id);
    }
    if (ctx.db.combatPendingAdd) {
      for (const row of ctx.db.combatPendingAdd.by_combat.filter(combatId)) {
        ctx.db.combatPendingAdd.id.delete(row.id);
      }
    }
    for (const row of ctx.db.combatEnemyCast.by_combat.filter(combatId)) {
      ctx.db.combatEnemyCast.id.delete(row.id);
    }
    if (ctx.db.combatEnemyCooldown) {
      for (const row of ctx.db.combatEnemyCooldown.by_combat.filter(combatId)) {
        ctx.db.combatEnemyCooldown.id.delete(row.id);
      }
    }
  };

  const schedulePullResolve = (ctx: any, pullId: bigint, resolveAtMicros: bigint) => {
    ctx.db.pullTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(resolveAtMicros),
      pullId,
    });
  };

  const refreshSpawnGroupCount = (ctx: any, spawnId: bigint) => {
    let count = 0n;
    for (const _row of ctx.db.enemySpawnMember.by_spawn.filter(spawnId)) {
      count += 1n;
    }
    const spawn = ctx.db.enemySpawn.id.find(spawnId);
    if (spawn) {
      ctx.db.enemySpawn.id.update({ ...spawn, groupCount: count });
    }
    return count;
  };

  const pickRoleTemplate = (ctx: any, templateId: bigint, seed: bigint) => {
    const roles = [...ctx.db.enemyRoleTemplate.by_template.filter(templateId)];
    if (roles.length === 0) return null;
    const index = Number(seed % BigInt(roles.length));
    return roles[index];
  };

  const takeSpawnMember = (ctx: any, spawnId: bigint) => {
    const members = [...ctx.db.enemySpawnMember.by_spawn.filter(spawnId)];
    if (members.length === 0) return null;
    const index = Number(
      (ctx.timestamp.microsSinceUnixEpoch + spawnId) % BigInt(members.length)
    );
    const member = members[index];
    if (!member) return null;
    ctx.db.enemySpawnMember.id.delete(member.id);
    refreshSpawnGroupCount(ctx, spawnId);
    return member;
  };

  const addEnemyToCombat = (
    ctx: any,
    combat: any,
    spawnToUse: any,
    participants: any[],
    consumeSpawnCount: boolean = true,
    roleTemplateId?: bigint
  ) => {
    const template = ctx.db.enemyTemplate.id.find(spawnToUse.enemyTemplateId);
    if (!template) throw new SenderError('Enemy template missing');

    let roleTemplate = roleTemplateId
      ? ctx.db.enemyRoleTemplate.id.find(roleTemplateId)
      : null;
    if (!roleTemplate && consumeSpawnCount) {
      const member = takeSpawnMember(ctx, spawnToUse.id);
      if (member) {
        roleTemplate = ctx.db.enemyRoleTemplate.id.find(member.roleTemplateId);
      }
    }
    if (!roleTemplate) {
      roleTemplate = pickRoleTemplate(
        ctx,
        template.id,
        ctx.timestamp.microsSinceUnixEpoch + spawnToUse.id
      );
    }

    const { maxHp, attackDamage, armorClass } = computeEnemyStats(template, roleTemplate, participants);
    const displayName = roleTemplate?.displayName ?? template.name;
    const combatEnemy = ctx.db.combatEnemy.insert({
      id: 0n,
      combatId: combat.id,
      spawnId: spawnToUse.id,
      enemyTemplateId: template.id,
      enemyRoleTemplateId: roleTemplate?.id,
      displayName,
      currentHp: maxHp,
      maxHp,
      attackDamage,
      armorClass,
      aggroTargetCharacterId: undefined,
      nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
    });

    for (const p of participants) {
      ctx.db.aggroEntry.insert({
        id: 0n,
        combatId: combat.id,
        enemyId: combatEnemy.id,
        characterId: p.id,
        value: 0n,
      });
      const current = ctx.db.character.id.find(p.id);
      if (current && !current.combatTargetEnemyId) {
        ctx.db.character.id.update({ ...current, combatTargetEnemyId: combatEnemy.id });
      }
    }

    if (consumeSpawnCount) {
      const refreshed = ctx.db.enemySpawn.id.find(spawnToUse.id);
      if (refreshed) {
        ctx.db.enemySpawn.id.update({
          ...refreshed,
          state: 'engaged',
          lockedCombatId: combat.id,
        });
      }
    } else {
      ctx.db.enemySpawn.id.update({
        ...spawnToUse,
        state: 'engaged',
        lockedCombatId: combat.id,
      });
    }

    return combatEnemy;
  };

  const createCombatForSpawn = (
    ctx: any,
    leader: any,
    spawnToUse: any,
    participants: any[],
    groupId: bigint | null
  ) => {
    const combat = ctx.db.combatEncounter.insert({
      id: 0n,
      locationId: leader.locationId,
      groupId: groupId ?? undefined,
      leaderCharacterId: groupId ? leader.id : undefined,
      state: 'active',
      addCount: 0n,
      pendingAddCount: 0n,
      pendingAddAtMicros: undefined,
      createdAt: ctx.timestamp,
    });

    addEnemyToCombat(ctx, combat, spawnToUse, participants);

    for (const p of participants) {
      ctx.db.combatParticipant.insert({
        id: 0n,
        combatId: combat.id,
        characterId: p.id,
        status: 'active',
        nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
      });
    }

    for (const p of participants) {
      appendPrivateEvent(
        ctx,
        p.id,
        p.ownerUserId,
        'combat',
        `Combat begins against ${spawnToUse.name}.`
      );
    }

    scheduleCombatTick(ctx, combat.id);
    return combat;
  };

  const updateQuestProgressForKill = (
    ctx: any,
    character: any,
    enemyTemplateId: bigint
  ) => {
    for (const quest of ctx.db.questInstance.by_character.filter(character.id)) {
      if (quest.completed) continue;
      const template = ctx.db.questTemplate.id.find(quest.questTemplateId);
      if (!template) continue;
      if (template.targetEnemyTemplateId !== enemyTemplateId) continue;
      const nextProgress =
        quest.progress + 1n > template.requiredCount
          ? template.requiredCount
          : quest.progress + 1n;
      const isComplete = nextProgress >= template.requiredCount;
      ctx.db.questInstance.id.update({
        ...quest,
        progress: nextProgress,
        completed: isComplete,
        completedAt: isComplete ? ctx.timestamp : quest.completedAt,
      });
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'quest',
        `Quest progress: ${template.name} (${nextProgress}/${template.requiredCount}).`
      );
      if (isComplete) {
        const npc = ctx.db.npc.id.find(template.npcId);
        const giver = npc ? npc.name : 'the quest giver';
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'quest',
          `Quest complete: ${template.name}. Return to ${giver}.`
        );
      }
    }
  };

  const resolveAttack = (
    ctx: any,
    {
      seed,
      baseDamage,
      targetArmor,
      canBlock,
      canParry,
      canDodge,
      currentHp,
      logTargetId,
      logOwnerId,
      messages,
      applyHp,
    }: {
      seed: bigint;
      baseDamage: bigint;
      targetArmor: bigint;
      canBlock: boolean;
      canParry: boolean;
      canDodge: boolean;
      currentHp: bigint;
      logTargetId: bigint;
      logOwnerId: bigint;
      messages: {
        dodge: string | ((damage: bigint) => string);
        miss: string | ((damage: bigint) => string);
        parry: string | ((damage: bigint) => string);
        block: string | ((damage: bigint) => string);
        hit: string | ((damage: bigint) => string);
      };
      applyHp: (nextHp: bigint) => void;
    }
  ) => {
    const reducedDamage = applyArmorMitigation(baseDamage, targetArmor);
    const outcome = rollAttackOutcome(seed, { canBlock, canParry, canDodge });
    let finalDamage = (reducedDamage * outcome.multiplier) / 100n;
    if (finalDamage < 0n) finalDamage = 0n;
    const nextHp = currentHp > finalDamage ? currentHp - finalDamage : 0n;
    applyHp(nextHp);

    const template =
      outcome.outcome === 'dodge'
        ? messages.dodge
        : outcome.outcome === 'miss'
          ? messages.miss
          : outcome.outcome === 'parry'
            ? messages.parry
            : outcome.outcome === 'block'
              ? messages.block
              : messages.hit;
    const message = typeof template === 'function' ? template(finalDamage) : template;
    const type = outcome.outcome === 'hit' ? 'damage' : 'avoid';
    appendPrivateEvent(ctx, logTargetId, logOwnerId, type, message);
    return { outcome: outcome.outcome, finalDamage, nextHp };
  };

  const pickTemplate = (templates: any[], seed: bigint) => {
    if (templates.length === 0) return null;
    const index = Number(seed % BigInt(templates.length));
    return templates[index] ?? null;
  };

  const findLootTable = (ctx: any, enemyTemplate: any) => {
    const terrain = enemyTemplate.terrainTypes?.split(',')[0]?.trim() ?? 'plains';
    const creatureType = enemyTemplate.creatureType ?? 'beast';
    let best: any | null = null;
    for (const row of ctx.db.lootTable.iter()) {
      if (row.tier !== 1n) continue;
      if (row.terrainType !== terrain) continue;
      if (row.creatureType !== creatureType) continue;
      best = row;
      break;
    }
    if (best) return best;
    for (const row of ctx.db.lootTable.iter()) {
      if (row.tier !== 1n) continue;
      if (row.terrainType !== 'plains') continue;
      if (row.creatureType !== creatureType) continue;
      return row;
    }
    return null;
  };

  const rollPercent = (seed: bigint) => Number(seed % 100n);

  const pickWeightedEntry = (entries: any[], seed: bigint) => {
    if (entries.length === 0) return null;
    let total = 0n;
    for (const entry of entries) total += entry.weight;
    if (total <= 0n) return null;
    let roll = seed % total;
    for (const entry of entries) {
      if (roll < entry.weight) return entry;
      roll -= entry.weight;
    }
    return entries[0];
  };

  const generateLootTemplates = (ctx: any, enemyTemplate: any, seedBase: bigint) => {
    const lootTable = findLootTable(ctx, enemyTemplate);
    if (!lootTable) return [];
    const entries = [...ctx.db.lootTableEntry.by_table.filter(lootTable.id)];
    const junkEntries = entries.filter((entry) => {
      const template = ctx.db.itemTemplate.id.find(entry.itemTemplateId);
      return template?.isJunk;
    });
    const gearEntries = entries.filter((entry) => {
      const template = ctx.db.itemTemplate.id.find(entry.itemTemplateId);
      return template && !template.isJunk && template.requiredLevel <= (enemyTemplate.level ?? 1n) + 1n;
    });

    const level = enemyTemplate.level ?? 1n;
    const gearBoost = BigInt(Math.min(25, Number(level) * 2));
    const gearChance = lootTable.gearChance + gearBoost;

    const lootTemplates: any[] = [];
    const pick = pickWeightedEntry(junkEntries, seedBase + 11n);
    if (pick) {
      const template = ctx.db.itemTemplate.id.find(pick.itemTemplateId);
      if (template) lootTemplates.push(template);
    }

    const rollGear = rollPercent(seedBase + 19n);
    if (rollGear < Number(gearChance)) {
      const pick = pickWeightedEntry(gearEntries, seedBase + 23n);
      if (pick) {
        const template = ctx.db.itemTemplate.id.find(pick.itemTemplateId);
        if (template) lootTemplates.push(template);
      }
    }

    return lootTemplates;
  };

  const rollGold = (seed: bigint, min: bigint, max: bigint) => {
    if (max <= min) return min;
    const range = max - min + 1n;
    return min + (seed % range);
  };

  const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  };

  const pickEnemyTarget = (
    rule: string | undefined,
    activeParticipants: typeof deps.CombatParticipant.rowType[],
    ctx: any,
    combatId: bigint,
    enemyId: bigint
  ) => {
    if (activeParticipants.length === 0) return undefined;
    const normalized = (rule ?? 'aggro').toLowerCase();
    if (normalized === 'lowest_hp') {
      const lowest = activeParticipants
        .map((p) => ctx.db.character.id.find(p.characterId))
        .filter((c) => Boolean(c))
        .sort((a, b) => (a.hp > b.hp ? 1 : a.hp < b.hp ? -1 : 0))[0];
      return lowest?.id;
    }
    if (normalized === 'random') {
      const idx = Number((ctx.timestamp.microsSinceUnixEpoch % BigInt(activeParticipants.length)));
      return activeParticipants[idx]?.characterId;
    }
    if (normalized === 'self') return undefined;
    const targetEntry = [...ctx.db.aggroEntry.by_combat.filter(combatId)]
      .filter((entry) => entry.enemyId === enemyId)
      .filter((entry) => activeParticipants.some((p) => p.characterId === entry.characterId))
      .sort((a, b) => (a.value > b.value ? -1 : a.value < b.value ? 1 : 0))[0];
    return targetEntry?.characterId ?? activeParticipants[0]?.characterId;
  };

  spacetimedb.reducer('start_combat', { characterId: t.u64(), enemySpawnId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const locationId = character.locationId;

    // Must be leader if in group
    let groupId: bigint | null = character.groupId ?? null;
    if (groupId) {
      const group = ctx.db.group.id.find(groupId);
      if (!group) throw new SenderError('Group not found');
      if (group.leaderCharacterId !== character.id) {
        throw new SenderError('Only the group leader can start combat');
      }
    }

    // Determine participants
    const participants: typeof deps.Character.rowType[] = [];
    const participantIds = new Set<string>();
    if (groupId) {
      for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
        const memberChar = ctx.db.character.id.find(member.characterId);
        if (memberChar && memberChar.locationId === locationId) {
          const key = memberChar.id.toString();
          if (!participantIds.has(key)) {
            participants.push(memberChar);
            participantIds.add(key);
          }
        }
      }
    } else {
      const key = character.id.toString();
      if (!participantIds.has(key)) {
        participants.push(character);
        participantIds.add(key);
      }
    }
    if (participants.length === 0) throw new SenderError('No participants available');
    for (const p of participants) {
      if (activeCombatIdForCharacter(ctx, p.id)) {
        throw new SenderError(`${p.name} is already in combat`);
      }
    }

    const spawn = ctx.db.enemySpawn.id.find(args.enemySpawnId);
    let desiredLevel = 1n;
    const spawnToUse =
      spawn && spawn.locationId === locationId && spawn.state === 'available'
        ? spawn
        : ensureAvailableSpawn(ctx, locationId, desiredLevel);

    createCombatForSpawn(ctx, character, spawnToUse, participants, groupId);
  });

  spacetimedb.reducer(
    'start_pull',
    { characterId: t.u64(), enemySpawnId: t.u64(), pullType: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (activeCombatIdForCharacter(ctx, character.id)) {
        throw new SenderError('Already in combat');
      }
      const locationId = character.locationId;
      const pullType = args.pullType.trim().toLowerCase();
      if (pullType !== 'careful' && pullType !== 'body') {
        throw new SenderError('Invalid pull type');
      }

      let groupId: bigint | null = character.groupId ?? null;
      if (groupId) {
        const group = ctx.db.group.id.find(groupId);
        if (!group) throw new SenderError('Group not found');
        if (group.leaderCharacterId !== character.id) {
          throw new SenderError('Only the group leader can pull');
        }
      }

      for (const pull of ctx.db.pullState.by_character.filter(character.id)) {
        if (pull.state === 'pending') {
          throw new SenderError('Pull already in progress');
        }
      }

      const spawn = ctx.db.enemySpawn.id.find(args.enemySpawnId);
      if (!spawn || spawn.locationId !== locationId || spawn.state !== 'available') {
        throw new SenderError('Enemy is not available to pull');
      }

      ctx.db.enemySpawn.id.update({ ...spawn, state: 'pulling' });

      const delayMicros = pullType === 'careful' ? PULL_DELAY_CAREFUL : PULL_DELAY_BODY;
      const resolveAt = ctx.timestamp.microsSinceUnixEpoch + delayMicros;
      const pull = ctx.db.pullState.insert({
        id: 0n,
        characterId: character.id,
        groupId: groupId ?? undefined,
        locationId,
        enemySpawnId: spawn.id,
        pullType,
        state: 'pending',
        outcome: undefined,
        delayedAdds: undefined,
        delayedAddsAtMicros: undefined,
        createdAt: ctx.timestamp,
      });
      schedulePullResolve(ctx, pull.id, resolveAt);

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        `You begin a ${pullType === 'careful' ? 'Careful Pull' : 'Body Pull'} on ${spawn.name} (group size ${spawn.groupCount}).`
      );
    }
  );

  spacetimedb.reducer(
    'set_combat_target',
    { characterId: t.u64(), enemyId: t.u64().optional() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const combatId = activeCombatIdForCharacter(ctx, character.id);
      if (!combatId) throw new SenderError('Not in combat');
      if (args.enemyId) {
        const enemy = ctx.db.combatEnemy.id.find(args.enemyId);
        if (!enemy || enemy.combatId !== combatId) {
          throw new SenderError('Enemy not in combat');
        }
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: enemy.id });
      } else {
        ctx.db.character.id.update({ ...character, combatTargetEnemyId: undefined });
      }
    }
  );

  spacetimedb.reducer('resolve_pull', { arg: PullTick.rowType }, (ctx, { arg }) => {
    const pull = ctx.db.pullState.id.find(arg.pullId);
    if (!pull || pull.state !== 'pending') return;

    const character = ctx.db.character.id.find(pull.characterId);
    const spawn = ctx.db.enemySpawn.id.find(pull.enemySpawnId);
    if (!character || !spawn || spawn.locationId !== pull.locationId) {
      if (spawn && spawn.state === 'pulling') {
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      }
      ctx.db.pullState.id.delete(pull.id);
      return;
    }
    if (activeCombatIdForCharacter(ctx, character.id)) {
      if (spawn.state === 'pulling') {
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      }
      ctx.db.pullState.id.delete(pull.id);
      return;
    }

    const template = ctx.db.enemyTemplate.id.find(spawn.enemyTemplateId);
    if (!template) {
      ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      ctx.db.pullState.id.delete(pull.id);
      return;
    }

    const targetGroup = (template.socialGroup || template.creatureType || '').trim().toLowerCase();
    const candidates = [...ctx.db.enemySpawn.by_location.filter(pull.locationId)]
      .filter((row) => row.id !== spawn.id && row.state === 'available')
      .map((row) => ({
        spawn: row,
        template: ctx.db.enemyTemplate.id.find(row.enemyTemplateId),
      }))
      .filter(
        (row) =>
          row.template &&
          (row.template.socialGroup || row.template.creatureType || '').trim().toLowerCase() ===
            targetGroup
      );

    const targetRadius = Number(template.socialRadius ?? 0n);
    const overlapPressure = targetRadius + candidates.length;
    let success = pull.pullType === 'careful' ? 80 : 40;
    let partial = pull.pullType === 'careful' ? 15 : 30;
    let fail = 100 - success - partial;
    const pressurePenalty = Math.min(30, overlapPressure * 5);
    success -= pressurePenalty;
    fail += pressurePenalty;
    const awarenessAlert =
      template.awareness?.toLowerCase() === 'alert' ||
      candidates.some((row) => row.template?.awareness?.toLowerCase() === 'alert');
    if (awarenessAlert) {
      success = Math.max(5, success - 10);
      fail = Math.min(95, fail + 10);
    }
    partial = Math.max(5, 100 - success - fail);

    const roll =
      Number(
        (ctx.timestamp.microsSinceUnixEpoch + spawn.id + character.id) % 100n
      );
    let outcome: 'success' | 'partial' | 'failure' = 'success';
    if (roll < success) {
      outcome = 'success';
    } else if (roll < success + partial) {
      outcome = 'partial';
    } else {
      outcome = 'failure';
    }

    const initialGroupCount = spawn.groupCount > 0n ? Number(spawn.groupCount) : 1;
    const groupAddsAvailable = Math.max(0, initialGroupCount - 1);
    const maxAdds = groupAddsAvailable + candidates.length;
    const addCount = maxAdds > 0 ? Math.min(maxAdds, Math.max(1, targetRadius || 1)) : 0;

    const participants: typeof deps.Character.rowType[] = [];
    const participantIds = new Set<string>();
    if (pull.groupId) {
      for (const member of ctx.db.groupMember.by_group.filter(pull.groupId)) {
        const memberChar = ctx.db.character.id.find(member.characterId);
        if (memberChar && memberChar.locationId === pull.locationId) {
          const key = memberChar.id.toString();
          if (!participantIds.has(key)) {
            participants.push(memberChar);
            participantIds.add(key);
          }
        }
      }
    } else {
      participants.push(character);
    }
    if (participants.length === 0) {
      ctx.db.enemySpawn.id.update({ ...spawn, state: 'available' });
      ctx.db.pullState.id.delete(pull.id);
      return;
    }

    const combat = createCombatForSpawn(ctx, character, spawn, participants, pull.groupId ?? null);

    let reason = 'No nearby allies responded.';
    if (overlapPressure > 0) {
      reason = 'Social allies were within overlapping radius.';
    }
    if (awarenessAlert) {
      reason = 'The area is on alert.';
    }

    const reserveAdds = (count: number) => {
      if (count <= 0) return [] as { spawn: any; roleTemplateId?: bigint }[];
      const reserved: { spawn: any; roleTemplateId?: bigint }[] = [];
      const updatedPullSpawn = ctx.db.enemySpawn.id.find(spawn.id);
      const availableFromGroup = updatedPullSpawn ? Number(updatedPullSpawn.groupCount) : 0;
      const groupTake = Math.min(count, availableFromGroup);
      if (groupTake > 0 && updatedPullSpawn) {
        for (let i = 0; i < groupTake; i += 1) {
          const member = takeSpawnMember(ctx, updatedPullSpawn.id);
          if (!member) break;
          reserved.push({ spawn: updatedPullSpawn, roleTemplateId: member.roleTemplateId });
        }
      }
      let remaining = count - groupTake;
      for (const candidate of candidates) {
        if (remaining <= 0) break;
        if (!candidate.spawn) continue;
        const candidateSpawn = ctx.db.enemySpawn.id.find(candidate.spawn.id);
        if (!candidateSpawn || candidateSpawn.groupCount === 0n) continue;
        const member = takeSpawnMember(ctx, candidateSpawn.id);
        if (!member) continue;
        ctx.db.enemySpawn.id.update({
          ...candidateSpawn,
          state: 'engaged',
          lockedCombatId: combat.id,
        });
        reserved.push({ spawn: candidateSpawn, roleTemplateId: member.roleTemplateId });
        remaining -= 1;
      }
      return reserved;
    };

    if (outcome === 'partial' && addCount > 0) {
      const delayMicros = AUTO_ATTACK_INTERVAL * PULL_ADD_DELAY_ROUNDS;
      const reserved = reserveAdds(addCount);
      const remainingGroup = ctx.db.enemySpawn.id.find(spawn.id)?.groupCount ?? 0n;
      for (const add of reserved) {
        ctx.db.combatPendingAdd.insert({
          id: 0n,
          combatId: combat.id,
          enemyTemplateId: add.spawn.enemyTemplateId,
          enemyRoleTemplateId: add.roleTemplateId,
          spawnId: add.spawn.id,
          arriveAtMicros: ctx.timestamp.microsSinceUnixEpoch + delayMicros,
        });
      }
      for (const p of participants) {
        appendPrivateEvent(
          ctx,
          p.id,
          p.ownerUserId,
          'system',
          `Your ${pull.pullType} pull succeeds. Pulled 1 of ${initialGroupCount} ${spawn.name}. ${reserved.length} add(s) arrive in ${Number(
            delayMicros / 1_000_000n
          )}s. Remaining in group: ${remainingGroup}. ${reason}`
        );
      }
    } else if (outcome === 'failure' && addCount > 0) {
      const reserved = reserveAdds(addCount);
      const remainingGroup = ctx.db.enemySpawn.id.find(spawn.id)?.groupCount ?? 0n;
      for (const add of reserved) {
        addEnemyToCombat(ctx, combat, add.spawn, participants, false, add.roleTemplateId);
      }
      for (const p of participants) {
        appendPrivateEvent(
          ctx,
          p.id,
          p.ownerUserId,
          'system',
          `Pull failed. Pulled 1 of ${initialGroupCount} ${spawn.name} and ${reserved.length} add(s) immediately aggro! Remaining in group: ${remainingGroup}. ${reason}`
        );
      }
    } else {
      const remainingGroup = ctx.db.enemySpawn.id.find(spawn.id)?.groupCount ?? 0n;
      for (const p of participants) {
        appendPrivateEvent(
          ctx,
          p.id,
          p.ownerUserId,
          'system',
          `Pull succeeded. Pulled 1 of ${initialGroupCount} ${spawn.name}. Remaining in group: ${remainingGroup}. ${reason}`
        );
      }
    }

    ctx.db.pullState.id.delete(pull.id);
  });

  spacetimedb.reducer('flee_combat', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) throw new SenderError('Combat not active');
    const combat = ctx.db.combatEncounter.id.find(combatId);
    if (!combat || combat.state !== 'active') throw new SenderError('Combat not active');

    for (const participant of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
      if (participant.characterId !== character.id) continue;
      if (participant.status !== 'active') return;
      ctx.db.combatParticipant.id.update({
        ...participant,
        status: 'fled',
      });
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'combat',
        'You are attempting to flee.'
      );
      return;
    }
  });

  spacetimedb.reducer('dismiss_combat_results', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const groupId = character.groupId;
    if (groupId) {
      const group = ctx.db.group.id.find(groupId);
      if (!group) throw new SenderError('Group not found');
      if (group.leaderCharacterId !== character.id) {
        throw new SenderError('Only the leader can dismiss results');
      }
      for (const row of ctx.db.combatResult.by_group.filter(groupId)) {
        ctx.db.combatResult.id.delete(row.id);
      }
      return;
    }
    for (const row of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
      ctx.db.combatResult.id.delete(row.id);
    }
  });

  spacetimedb.reducer('end_combat', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    let combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) {
      const fallback = [...ctx.db.combatParticipant.by_character.filter(character.id)][0];
      combatId = fallback?.combatId ?? null;
    }
    if (!combatId) throw new SenderError('No active combat');
    const combat = ctx.db.combatEncounter.id.find(combatId);
    if (!combat) throw new SenderError('Combat not active');

    if (combat.groupId && combat.state === 'active') {
      const group = ctx.db.group.id.find(combat.groupId);
      if (!group) throw new SenderError('Group not found');
      if (group.leaderCharacterId !== character.id) {
        throw new SenderError('Only the group leader can end combat');
      }
    }

    const participants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
    for (const p of participants) {
      const participantChar = ctx.db.character.id.find(p.characterId);
      if (!participantChar) continue;
      appendPrivateEvent(
        ctx,
        participantChar.id,
        participantChar.ownerUserId,
        'combat',
        'Combat was ended by the leader.'
      );
      ctx.db.combatResult.insert({
        id: 0n,
        ownerUserId: participantChar.ownerUserId,
        characterId: participantChar.id,
        groupId: combat.groupId,
        combatId: combat.id,
        summary: 'Combat ended by leader.',
        createdAt: ctx.timestamp,
      });
    }

    const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
      (s) => s.lockedCombatId === combat.id
    );
    if (spawn) {
      ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
    }

    clearCombatArtifacts(ctx, combat.id);
    ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
  });

  const HP_REGEN_OUT = 3n;
  const MANA_REGEN_OUT = 3n;
  const STAMINA_REGEN_OUT = 3n;
  const HP_REGEN_IN = 1n;
  const MANA_REGEN_IN = 1n;
  const STAMINA_REGEN_IN = 1n;
  const REGEN_TICK_MICROS = 8_000_000n;
  const EFFECT_TICK_MICROS = 10_000_000n;
  const HOT_TICK_MICROS = 3_000_000n;

  spacetimedb.reducer('regen_health', { arg: HealthRegenTick.rowType }, (ctx) => {
    const tickIndex = ctx.timestamp.microsSinceUnixEpoch / REGEN_TICK_MICROS;
    const halfTick = tickIndex % 2n === 0n;

    for (const character of ctx.db.character.iter()) {
      if (character.hp === 0n) continue;

    const inCombat = !!activeCombatIdForCharacter(ctx, character.id);
      if (inCombat && !halfTick) continue;

      const hpRegen = inCombat ? HP_REGEN_IN : HP_REGEN_OUT;
      const manaRegen = inCombat ? MANA_REGEN_IN : MANA_REGEN_OUT;
      const staminaRegen = inCombat ? STAMINA_REGEN_IN : STAMINA_REGEN_OUT;

      const nextHp =
        character.hp >= character.maxHp ? character.hp : character.hp + hpRegen;
      const nextMana =
        character.mana >= character.maxMana ? character.mana : character.mana + manaRegen;
      const nextStamina =
        character.stamina >= character.maxStamina
          ? character.stamina
          : character.stamina + staminaRegen;

      ctx.db.character.id.update({
        ...character,
        hp: nextHp > character.maxHp ? character.maxHp : nextHp,
        mana: nextMana > character.maxMana ? character.maxMana : nextMana,
        stamina: nextStamina > character.maxStamina ? character.maxStamina : nextStamina,
      });
    }

    // Watchdog: ensure active combats always have a scheduled tick.
    for (const combat of ctx.db.combatEncounter.iter()) {
      if (combat.state !== 'active') continue;
      let hasTick = false;
      for (const tick of ctx.db.combatLoopTick.iter()) {
        if (tick.combatId === combat.id) {
          hasTick = true;
          break;
        }
      }
      if (!hasTick) {
        scheduleCombatTick(ctx, combat.id);
      }
    }

    ctx.db.healthRegenTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + REGEN_TICK_MICROS),
    });
  });

  spacetimedb.reducer('tick_effects', { arg: deps.EffectTick.rowType }, (ctx) => {
    for (const effect of ctx.db.characterEffect.iter()) {
      const owner = ctx.db.character.id.find(effect.characterId);
      if (!owner) {
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      if (effect.effectType === 'regen' || effect.effectType === 'dot') {
        continue;
      }
      if (effect.roundsRemaining === 0n) {
        if (effect.effectType === 'hp_bonus') {
          const nextMax = owner.maxHp > effect.magnitude ? owner.maxHp - effect.magnitude : 0n;
          const nextHp = owner.hp > nextMax ? nextMax : owner.hp;
          ctx.db.character.id.update({ ...owner, maxHp: nextMax, hp: nextHp });
        }
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      const source = effect.sourceAbility ?? 'a lingering effect';
      if (effect.effectType === 'mana_regen') {
        const nextMana =
          owner.mana + effect.magnitude > owner.maxMana ? owner.maxMana : owner.mana + effect.magnitude;
        ctx.db.character.id.update({ ...owner, mana: nextMana });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'ability',
          `You recover ${effect.magnitude} mana from ${source}.`
        );
      } else if (effect.effectType === 'stamina_regen') {
        const nextStamina =
          owner.stamina + effect.magnitude > owner.maxStamina
            ? owner.maxStamina
            : owner.stamina + effect.magnitude;
        ctx.db.character.id.update({ ...owner, stamina: nextStamina });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'ability',
          `You recover ${effect.magnitude} stamina from ${source}.`
        );
      }
      const remaining = effect.roundsRemaining - 1n;
      if (remaining === 0n) {
        if (effect.effectType === 'hp_bonus') {
          const nextMax = owner.maxHp > effect.magnitude ? owner.maxHp - effect.magnitude : 0n;
          const nextHp = owner.hp > nextMax ? nextMax : owner.hp;
          ctx.db.character.id.update({ ...owner, maxHp: nextMax, hp: nextHp });
        }
        ctx.db.characterEffect.id.delete(effect.id);
      } else {
        ctx.db.characterEffect.id.update({ ...effect, roundsRemaining: remaining });
      }
    }

    for (const effect of ctx.db.combatEnemyEffect.iter()) {
      if (effect.effectType === 'dot') continue;
      const enemy = ctx.db.combatEnemy.id.find(effect.enemyId);
      if (!enemy) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      if (effect.roundsRemaining === 0n) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      ctx.db.combatEnemyEffect.id.update({
        ...effect,
        roundsRemaining: effect.roundsRemaining - 1n,
      });
    }

    ctx.db.effectTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + EFFECT_TICK_MICROS),
    });
  });

  spacetimedb.reducer('tick_hot', { arg: deps.HotTick.rowType }, (ctx) => {
    for (const effect of ctx.db.characterEffect.iter()) {
      const owner = ctx.db.character.id.find(effect.characterId);
      if (!owner) {
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      if (owner.hp === 0n) continue;
      if (effect.effectType !== 'regen' && effect.effectType !== 'dot')
        continue;
      if (effect.roundsRemaining === 0n) {
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      const source = effect.sourceAbility ?? 'a lingering effect';
      if (effect.effectType === 'regen') {
        const nextHp = owner.hp + effect.magnitude > owner.maxHp ? owner.maxHp : owner.hp + effect.magnitude;
        ctx.db.character.id.update({ ...owner, hp: nextHp });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'heal',
          `You are healed for ${effect.magnitude} by ${source}.`
        );
      } else if (effect.effectType === 'dot') {
        const nextHp = owner.hp > effect.magnitude ? owner.hp - effect.magnitude : 0n;
        ctx.db.character.id.update({ ...owner, hp: nextHp });
        appendPrivateEvent(
          ctx,
          owner.id,
          owner.ownerUserId,
          'damage',
          `You take ${effect.magnitude} damage from ${source}.`
        );
      }
      const remaining = effect.roundsRemaining - 1n;
      if (remaining === 0n) {
        ctx.db.characterEffect.id.delete(effect.id);
      } else {
        ctx.db.characterEffect.id.update({ ...effect, roundsRemaining: remaining });
      }
    }

    for (const effect of ctx.db.combatEnemyEffect.iter()) {
      if (effect.effectType !== 'dot') continue;
      if (effect.roundsRemaining === 0n) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      const combat = ctx.db.combatEncounter.id.find(effect.combatId);
      if (!combat || combat.state !== 'active') continue;
      const enemy = ctx.db.combatEnemy.id.find(effect.enemyId);
      if (!enemy) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
        continue;
      }
      const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
      const enemyName = enemy.displayName ?? enemyTemplate?.name ?? 'enemy';
      const bonus = sumEnemyEffect(ctx, effect.combatId, 'damage_taken', enemy.id);
      const total = effect.magnitude + bonus;
      const nextHp = enemy.currentHp > total ? enemy.currentHp - total : 0n;
      ctx.db.combatEnemy.id.update({ ...enemy, currentHp: nextHp });
      const source = effect.sourceAbility ?? 'a lingering effect';
      for (const participant of ctx.db.combatParticipant.by_combat.filter(effect.combatId)) {
        const character = ctx.db.character.id.find(participant.characterId);
        if (!character) continue;
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'damage',
          `${source} deals ${total} damage to ${enemyName}.`
        );
      }
      const remaining = effect.roundsRemaining - 1n;
      if (remaining === 0n) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
      } else {
        ctx.db.combatEnemyEffect.id.update({ ...effect, roundsRemaining: remaining });
      }
    }

    ctx.db.hotTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + HOT_TICK_MICROS),
    });
  });

  spacetimedb.reducer('tick_casts', { arg: deps.CastTick.rowType }, (ctx) => {
    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    for (const cast of ctx.db.characterCast.iter()) {
      if (cast.endsAtMicros > nowMicros) continue;
      const character = ctx.db.character.id.find(cast.characterId);
      if (!character) {
        ctx.db.characterCast.id.delete(cast.id);
        continue;
      }
      try {
        deps.executeAbility(ctx, character, cast.abilityKey, cast.targetCharacterId);
        const cooldown = abilityCooldownMicros(cast.abilityKey);
        const existingCooldown = [...ctx.db.abilityCooldown.by_character.filter(character.id)].find(
          (row) => row.abilityKey === cast.abilityKey
        );
        if (cooldown > 0n) {
          if (existingCooldown) {
            ctx.db.abilityCooldown.id.update({
              ...existingCooldown,
              readyAtMicros: nowMicros + cooldown,
            });
          } else {
            ctx.db.abilityCooldown.insert({
              id: 0n,
              characterId: character.id,
              abilityKey: cast.abilityKey,
              readyAtMicros: nowMicros + cooldown,
            });
          }
        }
      } catch (error) {
        const message = String(error).replace(/^SenderError:\s*/i, '');
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Ability failed: ${message}`
        );
      }
      ctx.db.characterCast.id.delete(cast.id);
    }

    ctx.db.castTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 200_000n),
    });
  });

  spacetimedb.reducer('combat_loop', { arg: CombatLoopTick.rowType }, (ctx, { arg }) => {
    const combat = ctx.db.combatEncounter.id.find(arg.combatId);
    if (!combat || combat.state !== 'active') return;

    const enemies = [...ctx.db.combatEnemy.by_combat.filter(combat.id)];
    if (enemies.length === 0) {
      const survivorsBySpawn = new Map<bigint, number>();
      for (const enemyRow of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
        if (enemyRow.currentHp === 0n) continue;
        const count = survivorsBySpawn.get(enemyRow.spawnId) ?? 0;
        survivorsBySpawn.set(enemyRow.spawnId, count + 1);
      }
      for (const [spawnId, count] of survivorsBySpawn.entries()) {
        const spawn = ctx.db.enemySpawn.id.find(spawnId);
        if (!spawn) continue;
        ctx.db.enemySpawn.id.update({
          ...spawn,
          state: 'available',
          lockedCombatId: undefined,
          groupCount: spawn.groupCount + BigInt(count),
        });
      }
      clearCombatArtifacts(ctx, combat.id);
      ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
      return;
    }

    const participants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
    for (const p of participants) {
      if (p.status !== 'active') continue;
      const character = ctx.db.character.id.find(p.characterId);
      if (character && character.hp === 0n) {
        ctx.db.combatParticipant.id.update({ ...p, status: 'dead' });
        clearCharacterEffectsOnDeath(ctx, character);
      }
    }
    const refreshedParticipants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
    const activeParticipants = refreshedParticipants.filter((p) => p.status === 'active');

    const nowMicros = ctx.timestamp.microsSinceUnixEpoch;
    const spawnName =
      [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      )?.name ?? 'enemy';
    const enemyTemplate = enemies[0]
      ? ctx.db.enemyTemplate.id.find(enemies[0].enemyTemplateId)
      : null;
    const enemyName = enemies[0]?.displayName ?? enemyTemplate?.name ?? spawnName;

    for (const pending of ctx.db.combatPendingAdd.by_combat.filter(combat.id)) {
      if (pending.arriveAtMicros > nowMicros) continue;
      const spawnRow = pending.spawnId ? ctx.db.enemySpawn.id.find(pending.spawnId) : null;
      if (spawnRow) {
        addEnemyToCombat(
          ctx,
          combat,
          spawnRow,
          participants,
          false,
          pending.enemyRoleTemplateId ?? undefined
        );
      }
      ctx.db.combatPendingAdd.id.delete(pending.id);
      for (const p of activeParticipants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'combat',
          `A social add arrives to assist ${enemyName}.`
        );
      }
    }

    // Enemy special abilities (future-facing). No abilities are defined yet.
    for (const enemy of enemies) {
      if (enemy.currentHp === 0n) continue;
      if (enemy.currentHp === 0n) continue;
      const template = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
      const enemyAbilities = template
        ? [...ctx.db.enemyAbility.by_template.filter(template.id)]
        : [];
      const existingCast = [...ctx.db.combatEnemyCast.by_combat.filter(combat.id)].find(
        (row) => row.enemyId === enemy.id
      );
      if (existingCast && existingCast.endsAtMicros <= nowMicros) {
        executeEnemyAbility(
          ctx,
          combat.id,
          enemy.id,
          existingCast.abilityKey,
          existingCast.targetCharacterId
        );
        const cooldownTable = ctx.db.combatEnemyCooldown;
        if (cooldownTable) {
          const abilityRow = enemyAbilities.find(
            (row) => row.abilityKey === existingCast.abilityKey
          );
          const cooldownMicros =
            enemyAbilityCooldownMicros(existingCast.abilityKey) ||
            (abilityRow?.cooldownSeconds ?? 0n) * 1_000_000n;
          if (cooldownMicros > 0n) {
            for (const row of cooldownTable.by_enemy.filter(enemy.id)) {
              if (row.abilityKey === existingCast.abilityKey) {
                cooldownTable.id.delete(row.id);
              }
            }
            cooldownTable.insert({
              id: 0n,
              combatId: combat.id,
              enemyId: enemy.id,
              abilityKey: existingCast.abilityKey,
              readyAtMicros: nowMicros + cooldownMicros,
            });
          }
        }
        ctx.db.combatEnemyCast.id.delete(existingCast.id);
      }
      if (enemyAbilities.length > 0 && !existingCast) {
        const cooldownTable = ctx.db.combatEnemyCooldown;
        if (!cooldownTable) {
          // cooldown table missing; skip casting to avoid spam
        } else {
          type Candidate = {
            ability: typeof deps.EnemyAbility.rowType;
            targetId: bigint;
            score: number;
            castMicros: bigint;
            cooldownMicros: bigint;
            chance: number;
          };
          const candidates: Candidate[] = [];

          for (const ability of enemyAbilities) {
            const cooldown = [...cooldownTable.by_enemy.filter(enemy.id)].find(
              (row) => row.abilityKey === ability.abilityKey
            );
            if (cooldown && cooldown.readyAtMicros > nowMicros) continue;
            if (cooldown && cooldown.readyAtMicros <= nowMicros) {
              for (const row of cooldownTable.by_enemy.filter(enemy.id)) {
                if (row.abilityKey === ability.abilityKey) {
                  cooldownTable.id.delete(row.id);
                }
              }
            }

            const targetId = pickEnemyTarget(
              ability.targetRule,
              activeParticipants,
              ctx,
              combat.id,
              enemy.id
            );
            if (!targetId) continue;

            const meta = ENEMY_ABILITIES[ability.abilityKey as keyof typeof ENEMY_ABILITIES];
            const castMicros =
              enemyAbilityCastMicros(ability.abilityKey) ||
              (ability.castSeconds ?? 0n) * 1_000_000n;
            const cooldownMicros =
              enemyAbilityCooldownMicros(ability.abilityKey) ||
              (ability.cooldownSeconds ?? 0n) * 1_000_000n;

            if (ability.kind === 'dot') {
              const alreadyApplied = [...ctx.db.characterEffect.by_character.filter(targetId)].some(
                (effect) => effect.effectType === 'dot' && effect.sourceAbility === ability.name
              );
              if (alreadyApplied) continue;
            } else if (ability.kind === 'debuff') {
              const alreadyApplied = [...ctx.db.characterEffect.by_character.filter(targetId)].some(
                (effect) => effect.sourceAbility === ability.name
              );
              if (alreadyApplied) continue;
            }

            const baseWeight = meta?.aiWeight ?? DEFAULT_AI_WEIGHT;
            const baseChance = meta?.aiChance ?? DEFAULT_AI_CHANCE;
            const randomness = meta?.aiRandomness ?? DEFAULT_AI_RANDOMNESS;
            let score = baseWeight;
            if (ability.kind === 'dot') score += 30;
            if (ability.targetRule === 'lowest_hp') score += 20;
            if (ability.targetRule === 'aggro') score += 10;

            const hash = hashString(`${ability.abilityKey}:${combat.id}:${enemy.id}`);
            const jitter = (hash % (randomness * 2)) - randomness;
            score += jitter;
            candidates.push({
              ability,
              targetId,
              score,
              castMicros,
              cooldownMicros,
              chance: baseChance,
            });
          }

          if (candidates.length > 0) {
            const chosen = candidates.sort((a, b) => b.score - a.score)[0];
            const roll = Number(
              (nowMicros +
                enemy.id +
                combat.id +
                BigInt(hashString(chosen.ability.abilityKey))) %
                100n
            );
            if (roll < chosen.chance) {
              ctx.db.combatEnemyCast.insert({
                id: 0n,
                combatId: combat.id,
                enemyId: enemy.id,
                abilityKey: chosen.ability.abilityKey,
                endsAtMicros: nowMicros + chosen.castMicros,
                targetCharacterId: chosen.targetId,
              });
              ctx.db.combatEnemy.id.update({
                ...enemy,
                nextAutoAttackAt: nowMicros + chosen.castMicros,
                aggroTargetCharacterId: chosen.targetId,
              });
            }
          }
        }
      }
    }

    for (const participant of activeParticipants) {
      const character = ctx.db.character.id.find(participant.characterId);
      if (!character) continue;
      const activeCast = [...ctx.db.characterCast.by_character.filter(character.id)].find(
        (row) => row.endsAtMicros > nowMicros
      );
      if (activeCast) continue;
      if (participant.nextAutoAttackAt > nowMicros) continue;

      const preferredEnemy = character.combatTargetEnemyId
        ? enemies.find((row) => row.id === character.combatTargetEnemyId)
        : null;
      const currentEnemy =
        preferredEnemy ??
        enemies.find((row) => row.currentHp > 0n) ??
        enemies[0] ??
        null;
      if (!currentEnemy || currentEnemy.currentHp === 0n) continue;
      const enemyTemplate = ctx.db.enemyTemplate.id.find(currentEnemy.enemyTemplateId);
      const targetName = currentEnemy.displayName ?? enemyTemplate?.name ?? 'enemy';
      const weapon = deps.getEquippedWeaponStats(ctx, character.id);
      const damage =
        5n +
        character.level +
        weapon.baseDamage +
        (weapon.dps / 2n) +
        sumEnemyEffect(ctx, combat.id, 'damage_taken', currentEnemy.id);
      const outcomeSeed = nowMicros + character.id + currentEnemy.id;
      const { finalDamage, nextHp } = resolveAttack(ctx, {
        seed: outcomeSeed,
        baseDamage: damage,
        targetArmor: currentEnemy.armorClass + sumEnemyEffect(ctx, combat.id, 'armor_down', currentEnemy.id),
        canBlock: hasShieldEquipped(ctx, character.id),
        canParry: canParry(character.className),
        canDodge: true,
        currentHp: currentEnemy.currentHp,
        logTargetId: character.id,
        logOwnerId: character.ownerUserId,
        messages: {
          dodge: `${targetName} dodges your auto-attack.`,
          miss: `You miss ${targetName} with auto-attack.`,
          parry: `${targetName} parries your auto-attack.`,
          block: (damage) => `${targetName} blocks your auto-attack for ${damage}.`,
          hit: (damage) => `You hit ${targetName} with auto-attack for ${damage}.`,
        },
        applyHp: (updatedHp) => {
          ctx.db.combatEnemy.id.update({ ...currentEnemy, currentHp: updatedHp });
        },
      });

      if (finalDamage > 0n) {
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
          if (entry.characterId === character.id && entry.enemyId === currentEnemy.id) {
            ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + finalDamage });
            break;
          }
        }
      }

      ctx.db.combatParticipant.id.update({
        ...participant,
        nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
      });
    }

    const livingEnemies = enemies
      .map((row) => ctx.db.combatEnemy.id.find(row.id))
      .filter((row): row is typeof deps.CombatEnemy.rowType => Boolean(row) && row.currentHp > 0n);
    const aliveEnemyIds = new Set(livingEnemies.map((row) => row.id));
    for (const p of participants) {
      const character = ctx.db.character.id.find(p.characterId);
      if (!character) continue;
      if (character.combatTargetEnemyId && !aliveEnemyIds.has(character.combatTargetEnemyId)) {
        const nextTarget = livingEnemies[0]?.id;
        ctx.db.character.id.update({
          ...character,
          combatTargetEnemyId: nextTarget ?? undefined,
        });
      }
    }

    if (livingEnemies.length === 0) {
      const enemyTemplates = enemies
        .map((row) => ctx.db.enemyTemplate.id.find(row.enemyTemplateId))
        .filter((row): row is typeof deps.EnemyTemplate.rowType => Boolean(row));
      const totalBaseXp = enemyTemplates.reduce((sum, template) => {
        const base =
          template.xpReward && template.xpReward > 0n ? template.xpReward : template.level * 20n;
        return sum + base;
      }, 0n);
      const avgLevel =
        enemyTemplates.length > 0
          ? enemyTemplates.reduce((sum, template) => sum + template.level, 0n) /
            BigInt(enemyTemplates.length)
          : 1n;
      const primaryName = enemies[0]?.displayName ?? enemyTemplates[0]?.name ?? enemyName;

      for (const enemyRow of enemies) {
        const spawn = ctx.db.enemySpawn.id.find(enemyRow.spawnId);
        if (!spawn) continue;
        if (spawn.groupCount > 0n) {
          ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
        } else {
          for (const member of ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)) {
            ctx.db.enemySpawnMember.id.delete(member.id);
          }
          ctx.db.enemySpawn.id.delete(spawn.id);
          deps.spawnEnemy(ctx, spawn.locationId, 1n);
        }
      }
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        for (const template of enemyTemplates) {
          updateQuestProgressForKill(ctx, character, template.id);
        }
      }
      const eligible = participants.filter((p) => p.status !== 'dead');
      const splitCount = eligible.length > 0 ? BigInt(eligible.length) : 1n;
      const groupBonus = BigInt(Math.min(20, Math.max(0, (participants.length - 1) * 5)));
      const bonusMultiplier = 100n + groupBonus;
      const adjustedBase = (totalBaseXp * bonusMultiplier) / 100n;
      const fallenNames = participants
        .filter((p) => p.status === 'dead')
        .map((p) => ctx.db.character.id.find(p.characterId)?.name)
        .filter((name): name is string => Boolean(name));
      const fallenSuffix = fallenNames.length > 0 ? ` Fallen: ${fallenNames.join(', ')}.` : '';
      const summaryName =
        enemies.length > 1 ? `${primaryName} and allies` : primaryName;
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        for (const template of enemyTemplates) {
          const lootTemplates = template
            ? generateLootTemplates(ctx, template, ctx.timestamp.microsSinceUnixEpoch + character.id)
            : [];
          for (const lootTemplate of lootTemplates) {
            ctx.db.combatLoot.insert({
              id: 0n,
              combatId: combat.id,
              ownerUserId: character.ownerUserId,
              characterId: character.id,
              itemTemplateId: lootTemplate.id,
              createdAt: ctx.timestamp,
            });
          }
          const lootTable = template ? findLootTable(ctx, template) : null;
          const goldReward = lootTable
            ? rollGold(
                ctx.timestamp.microsSinceUnixEpoch + character.id * 3n + template.id,
                lootTable.goldMin,
                lootTable.goldMax
              ) + template.level
            : template.level;
          if (goldReward > 0n) {
            ctx.db.character.id.update({
              ...character,
              gold: (character.gold ?? 0n) + goldReward,
            });
            appendPrivateEvent(
              ctx,
              character.id,
              character.ownerUserId,
              'reward',
              `You gain ${goldReward} gold.`
            );
          }
        }
        ctx.db.combatResult.insert({
          id: 0n,
          ownerUserId: character.ownerUserId,
          characterId: character.id,
          groupId: combat.groupId,
          combatId: combat.id,
          summary: `Victory against ${summaryName}.${fallenSuffix}`,
          createdAt: ctx.timestamp,
        });
      }
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (character && character.hp === 0n) {
          const loss = deps.applyDeathXpPenalty(ctx, character);
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'reward',
            `You lose ${loss} XP from the defeat.`
          );
          const nextLocationId = character.boundLocationId ?? character.locationId;
          ctx.db.character.id.update({
            ...character,
            locationId: nextLocationId,
            hp: 1n,
            mana: character.maxMana > 0n ? 1n : 0n,
            stamina: character.maxStamina > 0n ? 1n : 0n,
          });
        }
      }
      clearCombatArtifacts(ctx, combat.id);
      ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });

      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        if (p.status === 'dead') {
          const reward = deps.awardCombatXp(
            ctx,
            character,
            avgLevel,
            (adjustedBase / splitCount) / 2n
          );
          if (reward.xpGained > 0n) {
            appendPrivateEvent(
              ctx,
              character.id,
              character.ownerUserId,
              'reward',
              `You gain ${reward.xpGained} XP (reduced for defeat).`
            );
          }
          if (reward.leveledUp) {
            appendPrivateEvent(
              ctx,
              character.id,
              character.ownerUserId,
              'system',
              `You reached level ${reward.newLevel}.`
            );
          }
          continue;
        }
        const reward = deps.awardCombatXp(ctx, character, avgLevel, adjustedBase / splitCount);
        if (reward.xpGained > 0n) {
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'reward',
            `You gain ${reward.xpGained} XP.`
          );
        }
        if (reward.leveledUp) {
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'system',
            `You reached level ${reward.newLevel}.`
          );
        }
      }
      return;
    }

    // Enemy attacks highest aggro
    const activeIds = new Set(activeParticipants.map((p) => p.characterId));
    for (const enemy of enemies) {
      let topAggro: typeof deps.AggroEntry.rowType | null = null;
      for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
        if (entry.enemyId !== enemy.id) continue;
        if (!activeIds.has(entry.characterId)) continue;
        if (!topAggro || entry.value > topAggro.value) topAggro = entry;
      }
      const enemySnapshot = ctx.db.combatEnemy.id.find(enemy.id);
      const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
      const name = enemySnapshot?.displayName ?? enemyTemplate?.name ?? enemyName;
      if (topAggro && enemySnapshot && enemySnapshot.nextAutoAttackAt <= nowMicros) {
        const skipEffect = [...ctx.db.combatEnemyEffect.by_enemy.filter(enemy.id)].find(
          (effect) => effect.effectType === 'skip'
        );
        if (skipEffect) {
          ctx.db.combatEnemyEffect.id.delete(skipEffect.id);
          ctx.db.combatEnemy.id.update({
            ...enemySnapshot,
            nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
          });
          for (const participant of activeParticipants) {
            const character = ctx.db.character.id.find(participant.characterId);
            if (!character) continue;
            appendPrivateEvent(
              ctx,
              character.id,
              character.ownerUserId,
              'combat',
              `${name} is staggered and misses a turn.`
            );
          }
        } else {
          const targetCharacter = ctx.db.character.id.find(topAggro.characterId);
          if (targetCharacter && targetCharacter.hp > 0n) {
            const enemyLevel = enemyTemplate?.level ?? 1n;
            const levelDiff =
              enemyLevel > targetCharacter.level ? enemyLevel - targetCharacter.level : 0n;
            const damageMultiplier = 100n + levelDiff * 20n;
            const debuff = sumEnemyEffect(ctx, combat.id, 'damage_down', enemy.id);
            const baseDamage = enemySnapshot.attackDamage + debuff;
            const scaledDamage = (baseDamage * damageMultiplier) / 100n;
            const effectiveArmor =
              targetCharacter.armorClass + sumCharacterEffect(ctx, targetCharacter.id, 'ac_bonus');
            const outcomeSeed = nowMicros + enemySnapshot.id + targetCharacter.id;
            const { nextHp } = resolveAttack(ctx, {
              seed: outcomeSeed,
              baseDamage: scaledDamage,
              targetArmor: effectiveArmor,
              canBlock: hasShieldEquipped(ctx, targetCharacter.id),
              canParry: canParry(targetCharacter.className),
              canDodge: true,
              currentHp: targetCharacter.hp,
              logTargetId: targetCharacter.id,
              logOwnerId: targetCharacter.ownerUserId,
              messages: {
                dodge: `You dodge ${name}'s auto-attack.`,
                miss: `${name} misses you with auto-attack.`,
                parry: `You parry ${name}'s auto-attack.`,
                block: (damage) => `You block ${name}'s auto-attack for ${damage}.`,
                hit: (damage) => `${name} hits you with auto-attack for ${damage}.`,
              },
              applyHp: (updatedHp) => {
                ctx.db.character.id.update({ ...targetCharacter, hp: updatedHp });
              },
            });
            if (nextHp === 0n) {
              for (const p of participants) {
                if (p.characterId === targetCharacter.id) {
                  markParticipantDead(ctx, p, targetCharacter, name);
                  break;
                }
              }
            }
            ctx.db.combatEnemy.id.update({
              ...enemySnapshot,
              nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
              aggroTargetCharacterId: targetCharacter.id,
            });
          } else {
            ctx.db.combatEnemy.id.update({
              ...enemySnapshot,
              nextAutoAttackAt: nowMicros + RETRY_ATTACK_INTERVAL,
              aggroTargetCharacterId: undefined,
            });
          }
        }
      }
    }

    let stillActive = false;
    for (const p of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
      if (p.status !== 'active') continue;
      const character = ctx.db.character.id.find(p.characterId);
      if (character && character.hp > 0n) {
        stillActive = true;
        break;
      }
    }
    if (!stillActive) {
      const enemyName =
        enemies[0]?.displayName ??
        [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
          (s) => s.lockedCombatId === combat.id
        )?.name ??
        'enemy';
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (character && character.hp === 0n && p.status !== 'dead') {
          markParticipantDead(ctx, p, character, enemyName);
        }
      }
      const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      );
      if (spawn) {
        for (const member of ctx.db.enemySpawnMember.by_spawn.filter(spawn.id)) {
          ctx.db.enemySpawnMember.id.delete(member.id);
        }
        let count = 0n;
        for (const enemyRow of enemies) {
          if (enemyRow.spawnId !== spawn.id) continue;
          if (enemyRow.currentHp === 0n) continue;
          if (enemyRow.enemyRoleTemplateId) {
            ctx.db.enemySpawnMember.insert({
              id: 0n,
              spawnId: spawn.id,
              enemyTemplateId: enemyRow.enemyTemplateId,
              roleTemplateId: enemyRow.enemyRoleTemplateId,
            });
            count += 1n;
          }
        }
        ctx.db.enemySpawn.id.update({
          ...spawn,
          state: 'available',
          lockedCombatId: undefined,
          groupCount: count,
        });
      }
      const fallenNames = participants
        .filter((p) => {
          const character = ctx.db.character.id.find(p.characterId);
          return character ? character.hp === 0n : false;
        })
        .map((p) => ctx.db.character.id.find(p.characterId)?.name)
        .filter((name): name is string => Boolean(name));
      const fallenSuffix = fallenNames.length > 0 ? ` Fallen: ${fallenNames.join(', ')}.` : '';
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        ctx.db.combatResult.insert({
          id: 0n,
          ownerUserId: character.ownerUserId,
          characterId: character.id,
          groupId: combat.groupId,
          combatId: combat.id,
          summary: `Defeat against ${enemyName}.${fallenSuffix}`,
          createdAt: ctx.timestamp,
        });
      }
      clearCombatArtifacts(ctx, combat.id);
      ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (character && character.hp === 0n) {
          const loss = deps.applyDeathXpPenalty(ctx, character);
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'reward',
            `You lose ${loss} XP from the defeat.`
          );
          const nextLocationId = character.boundLocationId ?? character.locationId;
          ctx.db.character.id.update({
            ...character,
            locationId: nextLocationId,
            hp: 1n,
            mana: character.maxMana > 0n ? 1n : 0n,
            stamina: character.maxStamina > 0n ? 1n : 0n,
          });
        }
      }
      return;
    }

    scheduleCombatTick(ctx, combat.id);
  });
};
