export const registerCombatReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    ScheduleAt,
    Timestamp,
    CombatRoundTick,
    HealthRegenTick,
    EffectTick,
    HotTick,
    CastTick,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    activeCombatIdForCharacter,
    ensureAvailableSpawn,
    computeEnemyStats,
    scheduleRound,
    sumCharacterEffect,
    sumEnemyEffect,
    applyArmorMitigation,
    abilityCooldownMicros,
    executeAbility,
    rollAttackOutcome,
    EnemyAbility,
    CombatEnemyCast,
    hasShieldEquipped,
    canParry,
  } = deps;

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
      roundNumber: 1n,
      roundEndsAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch + 10_000_000n),
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
      nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + 3_000_000n,
    });

    for (const p of participants) {
      ctx.db.combatParticipant.insert({
        id: 0n,
        combatId: combat.id,
        characterId: p.id,
        status: 'active',
        selectedAction: undefined,
        nextAutoAttackAt: ctx.timestamp.microsSinceUnixEpoch + 3_000_000n,
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

    scheduleRound(ctx, combat.id, 1n);
  });

  spacetimedb.reducer(
    'choose_action',
    { characterId: t.u64(), combatId: t.u64(), action: t.string() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      const combat = ctx.db.combatEncounter.id.find(args.combatId);
      if (!combat || combat.state !== 'active') throw new SenderError('Combat not active');

      for (const participant of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
        if (participant.characterId !== character.id) continue;
        if (participant.status !== 'active') return;
        const action = args.action.toLowerCase();
        if (action === 'flee') {
          ctx.db.combatParticipant.id.update({
            ...participant,
            status: 'fled',
            selectedAction: 'flee',
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
        if (action === 'attack' || action === 'skip' || action.startsWith('ability:')) {
          ctx.db.combatParticipant.id.update({
            ...participant,
            selectedAction: action,
          });
          return;
        }
      }
    }
  );

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
    const combatId = activeCombatIdForCharacter(ctx, character.id);
    if (!combatId) throw new SenderError('No active combat');
    const combat = ctx.db.combatEncounter.id.find(combatId);
    if (!combat || combat.state !== 'active') throw new SenderError('Combat not active');

    if (combat.groupId) {
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

    for (const row of ctx.db.combatRoundTick.by_combat.filter(combat.id)) {
      ctx.db.combatRoundTick.id.delete(row.scheduledId);
    }
    for (const row of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
      ctx.db.combatParticipant.id.delete(row.id);
    }
    for (const row of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
      ctx.db.aggroEntry.id.delete(row.id);
    }
    for (const row of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
      ctx.db.combatEnemy.id.delete(row.id);
    }
    for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
      ctx.db.combatEnemyEffect.id.delete(row.id);
    }

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
      if (effect.roundsRemaining === 0n) {
        ctx.db.characterEffect.id.delete(effect.id);
        continue;
      }
      ctx.db.characterEffect.id.update({
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
        continue;
      }
      if (effect.effectType === 'dot') {
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
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'ability',
          `Ability failed: ${error}`
        );
      }
      ctx.db.characterCast.id.delete(cast.id);
    }

    ctx.db.castTick.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 200_000n),
    });
  });

  spacetimedb.reducer('resolve_round', { arg: CombatRoundTick.rowType }, (ctx, { arg }) => {
    const combat = ctx.db.combatEncounter.id.find(arg.combatId);
    if (!combat || combat.state !== 'active') return;
    if (combat.roundNumber !== arg.roundNumber) return;

    const enemy = [...ctx.db.combatEnemy.by_combat.filter(combat.id)][0];
    if (!enemy) return;

    const participants = [...ctx.db.combatParticipant.by_combat.filter(combat.id)];
    for (const p of participants) {
      if (p.status !== 'active') continue;
      const character = ctx.db.character.id.find(p.characterId);
      if (character && character.hp === 0n) {
        ctx.db.combatParticipant.id.update({ ...p, status: 'dead' });
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
    if (enemyAbilities.length > 0) {
      const existingCast = [...ctx.db.combatEnemyCast.by_combat.filter(combat.id)].find(
        (row) => row.enemyId === enemy.id
      );
      if (!existingCast) {
        // Deterministic target: highest aggro if available, otherwise first active.
        const targetEntry = [...ctx.db.aggroEntry.by_combat.filter(combat.id)]
          .filter((entry) => activeParticipants.some((p) => p.characterId === entry.characterId))
          .sort((a, b) => (a.value > b.value ? -1 : a.value < b.value ? 1 : 0))[0];
        const targetId = targetEntry?.characterId ?? activeParticipants[0]?.characterId;
        const chosen = enemyAbilities[0];
        ctx.db.combatEnemyCast.insert({
          id: 0n,
          combatId: combat.id,
          enemyId: enemy.id,
          abilityKey: chosen.abilityKey,
          endsAtMicros: nowMicros + chosen.castSeconds * 1_000_000n,
          targetCharacterId: targetId,
        });
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
      const reducedDamage = applyArmorMitigation(damage, currentEnemy.armorClass);
      const outcomeSeed = nowMicros + character.id + currentEnemy.id;
      const outcome = rollAttackOutcome(outcomeSeed, {
        canBlock: hasShieldEquipped(ctx, character.id),
        canParry: canParry(character.className),
        canDodge: true,
      });
      let finalDamage = (reducedDamage * outcome.multiplier) / 100n;
      if (finalDamage < 0n) finalDamage = 0n;
      const nextHp =
        currentEnemy.currentHp > finalDamage ? currentEnemy.currentHp - finalDamage : 0n;
      ctx.db.combatEnemy.id.update({ ...currentEnemy, currentHp: nextHp });

      if (finalDamage > 0n) {
        for (const entry of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
          if (entry.characterId === character.id) {
            ctx.db.aggroEntry.id.update({ ...entry, value: entry.value + finalDamage });
            break;
          }
        }
      }

      if (outcome.outcome === 'dodge') {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'avoid',
          `${enemyName} dodges your auto-attack.`
        );
      } else if (outcome.outcome === 'miss') {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'avoid',
          `You miss ${enemyName} with auto-attack.`
        );
      } else if (outcome.outcome === 'parry') {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'avoid',
          `${enemyName} parries your auto-attack.`
        );
      } else if (outcome.outcome === 'block') {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'avoid',
          `${enemyName} blocks your auto-attack for ${finalDamage}.`
        );
      } else {
        appendPrivateEvent(
          ctx,
          character.id,
          character.ownerUserId,
          'damage',
          `You hit ${enemyName} with auto-attack for ${finalDamage}.`
        );
      }

      ctx.db.combatParticipant.id.update({
        ...participant,
        nextAutoAttackAt: nowMicros + 3_000_000n,
      });
    }

    const participantIds = new Set(activeParticipants.map((p) => p.characterId));
    for (const effect of ctx.db.characterEffect.iter()) {
      if (!participantIds.has(effect.characterId)) continue;
      if (effect.roundsRemaining === 0n) {
        ctx.db.characterEffect.id.delete(effect.id);
      } else {
        ctx.db.characterEffect.id.update({
          ...effect,
          roundsRemaining: effect.roundsRemaining - 1n,
        });
      }
    }
    for (const effect of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
      if (effect.roundsRemaining === 0n) {
        ctx.db.combatEnemyEffect.id.delete(effect.id);
      } else {
        ctx.db.combatEnemyEffect.id.update({
          ...effect,
          roundsRemaining: effect.roundsRemaining - 1n,
        });
      }
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
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        ctx.db.combatResult.insert({
          id: 0n,
          ownerUserId: character.ownerUserId,
          characterId: character.id,
          groupId: combat.groupId,
          combatId: combat.id,
          summary: `Victory against ${enemyName} in ${combat.roundNumber} rounds.`,
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
          if (loss > 0n) {
          appendPrivateEvent(
            ctx,
            character.id,
            character.ownerUserId,
            'reward',
            `You lose ${loss} XP from the defeat.`
          );
          }
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
      for (const row of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
        ctx.db.combatParticipant.id.delete(row.id);
      }
      for (const row of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
        ctx.db.aggroEntry.id.delete(row.id);
      }
      for (const row of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
        ctx.db.combatEnemy.id.delete(row.id);
      }
      for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
        ctx.db.combatEnemyEffect.id.delete(row.id);
      }
      for (const row of ctx.db.combatEnemyCast.by_combat.filter(combat.id)) {
        ctx.db.combatEnemyCast.id.delete(row.id);
      }
      for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
        ctx.db.combatEnemyEffect.id.delete(row.id);
      }
      for (const row of ctx.db.combatEnemyCast.by_combat.filter(combat.id)) {
        ctx.db.combatEnemyCast.id.delete(row.id);
      }
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
        const reducedDamage = applyArmorMitigation(scaledDamage, effectiveArmor);
        const outcomeSeed = nowMicros + enemySnapshot.id + targetCharacter.id;
        const outcome = rollAttackOutcome(outcomeSeed, {
          canBlock: hasShieldEquipped(ctx, targetCharacter.id),
          canParry: canParry(targetCharacter.className),
          canDodge: true,
        });
        let finalDamage = (reducedDamage * outcome.multiplier) / 100n;
        if (finalDamage < 0n) finalDamage = 0n;
        const nextHp =
          targetCharacter.hp > finalDamage ? targetCharacter.hp - finalDamage : 0n;
        ctx.db.character.id.update({ ...targetCharacter, hp: nextHp });
        if (outcome.outcome === 'dodge') {
          appendPrivateEvent(
            ctx,
            targetCharacter.id,
            targetCharacter.ownerUserId,
            'avoid',
            `You dodge ${enemyName}'s auto-attack.`
          );
        } else if (outcome.outcome === 'miss') {
          appendPrivateEvent(
            ctx,
            targetCharacter.id,
            targetCharacter.ownerUserId,
            'avoid',
            `${enemyName} misses you with auto-attack.`
          );
        } else if (outcome.outcome === 'parry') {
          appendPrivateEvent(
            ctx,
            targetCharacter.id,
            targetCharacter.ownerUserId,
            'avoid',
            `You parry ${enemyName}'s auto-attack.`
          );
        } else if (outcome.outcome === 'block') {
          appendPrivateEvent(
            ctx,
            targetCharacter.id,
            targetCharacter.ownerUserId,
            'avoid',
            `You block ${enemyName}'s auto-attack for ${finalDamage}.`
          );
        } else {
          appendPrivateEvent(
            ctx,
            targetCharacter.id,
            targetCharacter.ownerUserId,
            'damage',
            `${enemyName} hits you with auto-attack for ${finalDamage}.`
          );
        }
        if (nextHp === 0n) {
          for (const p of participants) {
            if (p.characterId === targetCharacter.id) {
              ctx.db.combatParticipant.id.update({ ...p, status: 'dead' });
              break;
            }
          }
        }
      }
      ctx.db.combatEnemy.id.update({
        ...enemySnapshot,
        nextAutoAttackAt: nowMicros + 3_000_000n,
      });
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
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (character && character.hp === 0n && p.status !== 'dead') {
          ctx.db.combatParticipant.id.update({ ...p, status: 'dead' });
        }
      }
      const enemyName =
        [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
          (s) => s.lockedCombatId === combat.id
        )?.name ?? 'enemy';
      const spawn = [...ctx.db.enemySpawn.by_location.filter(combat.locationId)].find(
        (s) => s.lockedCombatId === combat.id
      );
      if (spawn) {
        ctx.db.enemySpawn.id.update({ ...spawn, state: 'available', lockedCombatId: undefined });
      }
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (!character) continue;
        ctx.db.combatResult.insert({
          id: 0n,
          ownerUserId: character.ownerUserId,
          characterId: character.id,
          groupId: combat.groupId,
          combatId: combat.id,
          summary: `Defeat against ${enemyName} after ${combat.roundNumber} rounds.`,
          createdAt: ctx.timestamp,
        });
      }
      for (const p of participants) {
        const character = ctx.db.character.id.find(p.characterId);
        if (character && character.hp === 0n) {
          const loss = deps.applyDeathXpPenalty(ctx, character);
          if (loss > 0n) {
            appendPrivateEvent(
              ctx,
              character.id,
              character.ownerUserId,
              'combat',
              `You lose ${loss} XP from the defeat.`
            );
          }
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
      for (const row of ctx.db.combatParticipant.by_combat.filter(combat.id)) {
        ctx.db.combatParticipant.id.delete(row.id);
      }
      for (const row of ctx.db.aggroEntry.by_combat.filter(combat.id)) {
        ctx.db.aggroEntry.id.delete(row.id);
      }
      for (const row of ctx.db.combatEnemy.by_combat.filter(combat.id)) {
        ctx.db.combatEnemy.id.delete(row.id);
      }
      for (const row of ctx.db.combatEnemyEffect.by_combat.filter(combat.id)) {
        ctx.db.combatEnemyEffect.id.delete(row.id);
      }
      ctx.db.combatEncounter.id.update({ ...combat, state: 'resolved' });
      return;
    }

    const nextRound = combat.roundNumber + 1n;
    ctx.db.combatEncounter.id.update({
      ...combat,
      roundNumber: nextRound,
    });
    scheduleRound(ctx, combat.id, nextRound);
  });
};
