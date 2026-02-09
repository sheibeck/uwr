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
    hasShieldEquipped,
    canParry,
    enemyAbilityCastMicros,
    enemyAbilityCooldownMicros,
  } = deps;

  const AUTO_ATTACK_INTERVAL = 5_000_000n;
  const RETRY_ATTACK_INTERVAL = 1_000_000n;
  const DEFAULT_AI_CHANCE = 50;
  const DEFAULT_AI_WEIGHT = 50;
  const DEFAULT_AI_RANDOMNESS = 15;

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
    for (const row of ctx.db.combatParticipant.by_combat.filter(combatId)) {
      ctx.db.combatParticipant.id.delete(row.id);
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
    for (const row of ctx.db.combatEnemyCast.by_combat.filter(combatId)) {
      ctx.db.combatEnemyCast.id.delete(row.id);
    }
    if (ctx.db.combatEnemyCooldown) {
      for (const row of ctx.db.combatEnemyCooldown.by_combat.filter(combatId)) {
        ctx.db.combatEnemyCooldown.id.delete(row.id);
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
    combatId: bigint
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

    const template = ctx.db.enemyTemplate.id.find(spawnToUse.enemyTemplateId);
    if (!template) throw new SenderError('Enemy template missing');

    // Scale enemy
    const { maxHp, attackDamage, armorClass } = computeEnemyStats(template, participants);

    const combat = ctx.db.combatEncounter.insert({
      id: 0n,
      locationId,
      groupId: groupId ?? undefined,
      leaderCharacterId: groupId ? character.id : undefined,
      state: 'active',
      createdAt: ctx.timestamp,
    });

    ctx.db.enemySpawn.id.update({
      ...spawnToUse,
      state: 'engaged',
      lockedCombatId: combat.id,
    });

    ctx.db.combatEnemy.insert({
      id: 0n,
      combatId: combat.id,
      enemyTemplateId: template.id,
      currentHp: maxHp,
      maxHp,
      attackDamage,
      armorClass,
      aggroTargetCharacterId: undefined,
      nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
    });

    for (const p of participants) {
      ctx.db.combatParticipant.insert({
        id: 0n,
        combatId: combat.id,
        characterId: p.id,
        status: 'active',
        nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + AUTO_ATTACK_INTERVAL,
      });
      ctx.db.aggroEntry.insert({
        id: 0n,
        combatId: combat.id,
        characterId: p.id,
        value: 0n,
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
      const enemy = [...ctx.db.combatEnemy.by_combat.filter(effect.combatId)][0];
      if (!enemy) continue;
      const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
      const enemyName = enemyTemplate?.name ?? 'enemy';
      const nextHp = enemy.currentHp > effect.magnitude ? enemy.currentHp - effect.magnitude : 0n;
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
          `${source} deals ${effect.magnitude} damage to ${enemyName}.`
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

    const enemy = [...ctx.db.combatEnemy.by_combat.filter(combat.id)][0];
    if (!enemy) {
      const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      );
      if (spawn) {
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
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
    const enemyTemplate = ctx.db.enemyTemplate.id.find(enemy.enemyTemplateId);
    const enemyName = enemyTemplate?.name ?? spawnName;

    // Enemy special abilities (future-facing). No abilities are defined yet.
    const enemyAbilities = enemyTemplate
      ? [...ctx.db.enemyAbility.by_template.filter(enemyTemplate.id)]
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
          for (const row of cooldownTable.by_combat.filter(combat.id)) {
            if (row.abilityKey === existingCast.abilityKey) {
              cooldownTable.id.delete(row.id);
            }
          }
          cooldownTable.insert({
            id: 0n,
            combatId: combat.id,
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
          const cooldown = [...cooldownTable.by_combat.filter(combat.id)].find(
            (row) => row.abilityKey === ability.abilityKey
          );
          if (cooldown && cooldown.readyAtMicros > nowMicros) continue;
          if (cooldown && cooldown.readyAtMicros <= nowMicros) {
            for (const row of cooldownTable.by_combat.filter(combat.id)) {
              if (row.abilityKey === ability.abilityKey) {
                cooldownTable.id.delete(row.id);
              }
            }
          }

          const targetId = pickEnemyTarget(ability.targetRule, activeParticipants, ctx, combat.id);
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
          const roll =
            Number((nowMicros + enemy.id + combat.id + BigInt(hashString(chosen.ability.abilityKey))) % 100n);
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
            });
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

      const currentEnemy = ctx.db.combatEnemy.id.find(enemy.id);
      if (!currentEnemy || currentEnemy.currentHp === 0n) continue;
      const weapon = deps.getEquippedWeaponStats(ctx, character.id);
      const damage = 5n + character.level + weapon.baseDamage + (weapon.dps / 2n);
      const outcomeSeed = nowMicros + character.id + currentEnemy.id;
      const { finalDamage, nextHp } = resolveAttack(ctx, {
        seed: outcomeSeed,
        baseDamage: damage,
        targetArmor:
          currentEnemy.armorClass + sumEnemyEffect(ctx, combat.id, 'armor_down'),
        canBlock: hasShieldEquipped(ctx, character.id),
        canParry: canParry(character.className),
        canDodge: true,
        currentHp: currentEnemy.currentHp,
        logTargetId: character.id,
        logOwnerId: character.ownerUserId,
        messages: {
          dodge: `${enemyName} dodges your auto-attack.`,
          miss: `You miss ${enemyName} with auto-attack.`,
          parry: `${enemyName} parries your auto-attack.`,
          block: (damage) => `${enemyName} blocks your auto-attack for ${damage}.`,
          hit: (damage) => `You hit ${enemyName} with auto-attack for ${damage}.`,
        },
        applyHp: (updatedHp) => {
          ctx.db.combatEnemy.id.update({ ...currentEnemy, currentHp: updatedHp });
        },
      });

      if (finalDamage > 0n) {
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
          if (entry.characterId === character.id) {
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

    const updatedEnemy = ctx.db.combatEnemy.id.find(enemy.id)!;
    const enemyLevel = enemyTemplate?.level ?? 1n;
    const baseXp =
      enemyTemplate?.xpReward && enemyTemplate.xpReward > 0n
        ? enemyTemplate.xpReward
        : enemyLevel * 20n;
    if (updatedEnemy.currentHp === 0n) {
      const enemyName =
        [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
          (s) => s.lockedCombatId === combat.id
        )?.name ?? 'enemy';
      const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      );
      if (spawn) {
        ctx.db.enemySpawn.id.delete(spawn.id);
        deps.spawnEnemy(ctx, spawn.locationId, 1n);
      }
      const eligible = participants.filter((p) => p.status !== 'dead');
      const splitCount = eligible.length > 0 ? BigInt(eligible.length) : 1n;
      const groupBonus = BigInt(Math.min(20, Math.max(0, (participants.length - 1) * 5)));
      const bonusMultiplier = 100n + groupBonus;
      const adjustedBase = (baseXp * bonusMultiplier) / 100n;
      const fallenNames = participants
        .filter((p) => p.status === 'dead')
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
          summary: `Victory against ${enemyName}.${fallenSuffix}`,
          createdAt: ctx.timestamp,
        });

        if (p.status === 'dead') {
          const reward = deps.awardCombatXp(
            ctx,
            character,
            enemyLevel,
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
        const reward = deps.awardCombatXp(ctx, character, enemyLevel, adjustedBase / splitCount);
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
          const quarterHp = character.maxHp / 4n;
          const quarterMana = character.maxMana / 4n;
          const quarterStamina = character.maxStamina / 4n;
          ctx.db.character.id.update({
            ...character,
            hp: quarterHp > 0n ? quarterHp : 1n,
            mana: quarterMana > 0n ? quarterMana : 1n,
            stamina: quarterStamina > 0n ? quarterStamina : 1n,
          });
        }
      }
      clearCombatArtifacts(ctx, combat.id);
      ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
      return;
    }

    // Enemy attacks highest aggro
    const activeIds = new Set(activeParticipants.map((p) => p.characterId));
    let topAggro: typeof deps.AggroEntry.rowType | null = null;
    for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
      if (!activeIds.has(entry.characterId)) continue;
      if (!topAggro || entry.value > topAggro.value) topAggro = entry;
    }
    const enemySnapshot = ctx.db.combatEnemy.id.find(enemy.id);
    if (topAggro && enemySnapshot && enemySnapshot.nextAutoAttackAt <= nowMicros) {
      const skipEffect = [...ctx.db.combatEnemyEffect.by_combat.filter(combat.id)].find(
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
            `${enemyName} is staggered and misses a turn.`
          );
        }
      } else {
        const targetCharacter = ctx.db.character.id.find(topAggro.characterId);
        if (targetCharacter && targetCharacter.hp > 0n) {
          const enemyLevel = enemyTemplate?.level ?? 1n;
          const levelDiff =
            enemyLevel > targetCharacter.level ? enemyLevel - targetCharacter.level : 0n;
          const damageMultiplier = 100n + levelDiff * 20n;
          const debuff = sumEnemyEffect(ctx, combat.id, 'damage_down');
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
              dodge: `You dodge ${enemyName}'s auto-attack.`,
              miss: `${enemyName} misses you with auto-attack.`,
              parry: `You parry ${enemyName}'s auto-attack.`,
              block: (damage) => `You block ${enemyName}'s auto-attack for ${damage}.`,
              hit: (damage) => `${enemyName} hits you with auto-attack for ${damage}.`,
            },
            applyHp: (updatedHp) => {
              ctx.db.character.id.update({ ...targetCharacter, hp: updatedHp });
            },
          });
          if (nextHp === 0n) {
            for (const p of participants) {
              if (p.characterId === targetCharacter.id) {
                markParticipantDead(ctx, p, targetCharacter, enemyName);
                break;
              }
            }
          }
          ctx.db.combatEnemy.id.update({
            ...enemySnapshot,
            nextAutoAttackAt: nowMicros + AUTO_ATTACK_INTERVAL,
          });
        } else {
          ctx.db.combatEnemy.id.update({
            ...enemySnapshot,
            nextAutoAttackAt: nowMicros + RETRY_ATTACK_INTERVAL,
          });
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
        [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
          (s) => s.lockedCombatId === combat.id
        )?.name ?? 'enemy';
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
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
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
          const quarterHp = character.maxHp / 4n;
          const quarterMana = character.maxMana / 4n;
          const quarterStamina = character.maxStamina / 4n;
          ctx.db.character.id.update({
            ...character,
            hp: quarterHp > 0n ? quarterHp : 1n,
            mana: quarterMana > 0n ? quarterMana : 1n,
            stamina: quarterStamina > 0n ? quarterStamina : 1n,
          });
        }
      }
      clearCombatArtifacts(ctx, combat.id);
      ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
      return;
    }

    scheduleCombatTick(ctx, combat.id);
  });
};
