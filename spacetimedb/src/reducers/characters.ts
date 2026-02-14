export const registerCharacterReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    GroupMember,
    CombatParticipant,
    requirePlayerUserId,
    requireCharacterOwnedBy,
    friendUserIds,
    appendPrivateEvent,
    appendGroupEvent,
    appendLocationEvent,
    ensureSpawnsForLocation,
    computeBaseStats,
    manaStatForClass,
    usesMana,
    baseArmorForClass,
    BASE_HP,
    HP_STR_MULTIPLIER,
    BASE_MANA,
    ScheduleAt,
    CharacterLogoutTick,
    grantStarterItems,
    ensureStarterItemTemplates,
    activeCombatIdForCharacter,
    isClassAllowed,
  } = deps;
  const CHARACTER_SWITCH_LOGOUT_DELAY = 30_000_000n;

  spacetimedb.reducer('set_active_character', { characterId: t.u64() }, (ctx, { characterId }) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');
    const character = requireCharacterOwnedBy(ctx, characterId);
    const previousActiveId = player.activeCharacterId;
    if (previousActiveId) {
      const activeCombat = activeCombatIdForCharacter(ctx, previousActiveId);
      if (activeCombat) {
        const activeCharacter = ctx.db.character.id.find(previousActiveId);
        if (activeCharacter) {
          appendPrivateEvent(
            ctx,
            activeCharacter.id,
            activeCharacter.ownerUserId,
            'system',
            'You cannot switch characters during combat.'
          );
        }
        return;
      }
    }
    if (activeCombatIdForCharacter(ctx, character.id)) {
      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'system',
        'You cannot switch into a character that is currently in combat.'
      );
      return;
    }
    if (previousActiveId && previousActiveId !== character.id) {
      const previous = ctx.db.character.id.find(previousActiveId);
        if (previous) {
        const logoutAtMicros = ctx.timestamp.microsSinceUnixEpoch + CHARACTER_SWITCH_LOGOUT_DELAY;
        ctx.db.characterLogoutTick.insert({
          scheduledId: 0n,
          scheduledAt: ScheduleAt.time(logoutAtMicros),
          characterId: previous.id,
          ownerUserId: previous.ownerUserId,
          logoutAtMicros,
        });
        }
    }

    ctx.db.player.id.update({ ...player, activeCharacterId: character.id });

    const userId = requirePlayerUserId(ctx);
    appendPrivateEvent(ctx, character.id, userId, 'presence', 'You are online.');
    const friends = friendUserIds(ctx, userId);
    for (const friendId of friends) {
      appendPrivateEvent(
        ctx,
        character.id,
        friendId,
        'presence',
        `${character.name} is online.`
      );
    }

    appendLocationEvent(
      ctx,
      character.locationId,
      'system',
      `${character.name} steps into the area.`,
      character.id
    );
    ensureSpawnsForLocation(ctx, character.locationId);
  });

  spacetimedb.reducer(
    'create_character',
    { name: t.string(), raceId: t.u64(), className: t.string() },
    (ctx, { name, raceId, className }) => {
      const trimmed = name.trim();
      if (trimmed.length < 2) throw new SenderError('Name too short');
      const userId = requirePlayerUserId(ctx);
      for (const row of ctx.db.character.iter()) {
        if (row.name.toLowerCase() === trimmed.toLowerCase()) {
          throw new SenderError('Character name already exists');
        }
      }

      // Race validation
      const raceRow = ctx.db.race.id.find(raceId);
      if (!raceRow) throw new SenderError('Invalid race');
      if (!raceRow.unlocked) throw new SenderError('Race not yet unlocked');

      // Class restriction check — reuses isClassAllowed from index.ts
      if (!isClassAllowed(raceRow.availableClasses, className)) {
        throw new SenderError(`${className} is not available for ${raceRow.name}`);
      }

      const world = ctx.db.worldState.id.find(1n);
      if (!world) throw new SenderError('World not initialized');
      const bindLocation =
        [...ctx.db.location.iter()].find((location) => location.bindStone) ??
        ctx.db.location.id.find(world.startingLocationId);
      if (!bindLocation) throw new SenderError('Bind location not initialized');

      const classStats = computeBaseStats(className, 1n);
      const baseStats = {
        str: classStats.str + raceRow.strBonus,
        dex: classStats.dex + raceRow.dexBonus,
        cha: classStats.cha + raceRow.chaBonus,
        wis: classStats.wis + raceRow.wisBonus,
        int: classStats.int + raceRow.intBonus,
      };
      const manaStat = manaStatForClass(className, baseStats);
      const maxHp = BASE_HP + baseStats.str * HP_STR_MULTIPLIER;
      const maxMana = usesMana(className) ? BASE_MANA + manaStat * 6n : 0n;
      const armorClass = baseArmorForClass(className);
      const character = ctx.db.character.insert({
        id: 0n,
        ownerUserId: userId,
        name: trimmed,
        race: raceRow.name,
        className: className.trim(),
        level: 1n,
        xp: 0n,
        gold: 0n,
        locationId: bindLocation.id,
        boundLocationId: bindLocation.id,
        hp: maxHp,
        maxHp,
        mana: maxMana,
        maxMana,
        str: baseStats.str,
        dex: baseStats.dex,
        cha: baseStats.cha,
        wis: baseStats.wis,
        int: baseStats.int,
        hitChance: baseStats.dex * 15n,
        dodgeChance: baseStats.dex * 12n,
        parryChance: baseStats.dex * 10n,
        critMelee: baseStats.dex * 12n,
        critRanged: baseStats.dex * 12n,
        critDivine: baseStats.wis * 12n,
        critArcane: baseStats.int * 12n,
        armorClass,
        perception: baseStats.wis * 25n,
        search: baseStats.int * 25n,
        ccPower: baseStats.cha * 15n,
        vendorBuyMod: baseStats.cha * 10n,
        vendorSellMod: baseStats.cha * 8n,
        stamina: 20n,
        maxStamina: 20n,
        createdAt: ctx.timestamp,
      });

      grantStarterItems(ctx, character, ensureStarterItemTemplates);

      // Initialize FactionStanding for all factions at 0
      for (const faction of ctx.db.faction.iter()) {
        ctx.db.factionStanding.insert({
          id: 0n,
          characterId: character.id,
          factionId: faction.id,
          standing: 0n,
        });
      }

      appendPrivateEvent(ctx, character.id, userId, 'system', `${character.name} enters the world.`);
    }
  );

  spacetimedb.reducer('bind_location', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const location = ctx.db.location.id.find(character.locationId);
    if (!location || !location.bindStone) {
      throw new SenderError('No bindstone here');
    }
    ctx.db.character.id.update({ ...character, boundLocationId: location.id });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `You are now bound to ${location.name}.`
    );
  });

  spacetimedb.reducer('delete_character', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const characterId = character.id;

    for (const player of ctx.db.player.iter()) {
      if (player.activeCharacterId === characterId) {
        ctx.db.player.id.update({ ...player, activeCharacterId: undefined });
      }
    }

    if (character.groupId) {
      const groupId = character.groupId;
      const group = ctx.db.group.id.find(groupId);
      const wasLeader = group?.leaderCharacterId === characterId;

      for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
        if (member.characterId === characterId) {
          ctx.db.groupMember.id.delete(member.id);
          break;
        }
      }

      appendGroupEvent(
        ctx,
        groupId,
        characterId,
        'group',
        `${character.name} was removed from the group.`
      );

      let newLeaderMember: typeof GroupMember.rowType | null = null;
      for (const member of ctx.db.groupMember.by_group.filter(groupId)) {
        if (!newLeaderMember) newLeaderMember = member;
      }

      if (!newLeaderMember) {
        for (const invite of ctx.db.groupInvite.by_group.filter(groupId)) {
          ctx.db.groupInvite.id.delete(invite.id);
        }
        ctx.db.group.id.delete(groupId);
      } else if (group && wasLeader) {
        const newLeaderCharacter = ctx.db.character.id.find(newLeaderMember.characterId);
        if (newLeaderCharacter) {
          ctx.db.group.id.update({ ...group, leaderCharacterId: newLeaderCharacter.id });
          ctx.db.groupMember.id.update({ ...newLeaderMember, role: 'leader' });
          appendGroupEvent(
            ctx,
            groupId,
            newLeaderCharacter.id,
            'group',
            `${newLeaderCharacter.name} is now the group leader.`
          );
        }
      }
    }

    for (const invite of ctx.db.groupInvite.iter()) {
      if (invite.fromCharacterId === characterId || invite.toCharacterId === characterId) {
        ctx.db.groupInvite.id.delete(invite.id);
      }
    }

    for (const row of ctx.db.eventGroup.by_character.filter(characterId)) {
      ctx.db.eventGroup.id.delete(row.id);
    }
    for (const row of ctx.db.eventPrivate.by_character.filter(characterId)) {
      ctx.db.eventPrivate.id.delete(row.id);
    }
    for (const row of ctx.db.command.by_character.filter(characterId)) {
      ctx.db.command.id.delete(row.id);
    }
    for (const row of ctx.db.npcDialog.by_character.filter(characterId)) {
      ctx.db.npcDialog.id.delete(row.id);
    }
    for (const row of ctx.db.questInstance.by_character.filter(characterId)) {
      ctx.db.questInstance.id.delete(row.id);
    }
    for (const row of ctx.db.hotbarSlot.by_character.filter(characterId)) {
      ctx.db.hotbarSlot.id.delete(row.id);
    }
    for (const row of ctx.db.characterEffect.by_character.filter(characterId)) {
      ctx.db.characterEffect.id.delete(row.id);
    }
    for (const row of ctx.db.factionStanding.by_character.filter(characterId)) {
      ctx.db.factionStanding.id.delete(row.id);
    }
    for (const row of ctx.db.itemInstance.by_owner.filter(characterId)) {
      ctx.db.itemInstance.id.delete(row.id);
    }

    const combatIds = new Set<bigint>();
    for (const participant of ctx.db.combatParticipant.by_character.filter(characterId)) {
      combatIds.add(participant.combatId);
      ctx.db.combatParticipant.id.delete(participant.id);
    }

    for (const combatId of combatIds) {
      for (const entry of ctx.db.aggroEntry.by_combat.filter(combatId)) {
        if (entry.characterId === characterId) {
          ctx.db.aggroEntry.id.delete(entry.id);
        }
      }
      const combat = ctx.db.combatEncounter.id.find(combatId);
      if (combat && combat.leaderCharacterId === characterId) {
        let replacement: typeof CombatParticipant.rowType | null = null;
        for (const participant of ctx.db.combatParticipant.by_combat.filter(combatId)) {
          if (!replacement) replacement = participant;
        }
        ctx.db.combatEncounter.id.update({
          ...combat,
          leaderCharacterId: replacement ? replacement.characterId : undefined,
        });
      }
    }

    for (const row of ctx.db.combatResult.by_owner_user.filter(character.ownerUserId)) {
      if (row.characterId === characterId) {
        ctx.db.combatResult.id.delete(row.id);
      }
    }

    ctx.db.character.id.delete(characterId);
  });

  spacetimedb.reducer('respawn_character', { characterId: t.u64() }, (ctx, args) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    if (character.hp > 0n) return;
    if (activeCombatIdForCharacter(ctx, character.id)) {
      throw new SenderError('Cannot respawn during combat');
    }
    for (const effect of ctx.db.characterEffect.by_character.filter(character.id)) {
      ctx.db.characterEffect.id.delete(effect.id);
    }
    const nextLocationId = character.boundLocationId ?? character.locationId;
    const respawnLocation = ctx.db.location.id.find(nextLocationId)?.name ?? 'your bind point';
    ctx.db.character.id.update({
      ...character,
      locationId: nextLocationId,
      hp: 1n,
      mana: character.maxMana > 0n ? 1n : 0n,
      stamina: character.maxStamina > 0n ? 1n : 0n,
    });
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'combat',
      `You awaken at ${respawnLocation}, shaken but alive.`
    );
    if (character.groupId) {
      appendGroupEvent(
        ctx,
        character.groupId,
        character.id,
        'combat',
        `You awaken at ${respawnLocation}, shaken but alive.`
      );
    }
  });

  spacetimedb.reducer(
    'character_logout',
    { arg: CharacterLogoutTick.rowType },
    (ctx, { arg }) => {
      const character = ctx.db.character.id.find(arg.characterId);
      if (!character) return;
      for (const player of ctx.db.player.iter()) {
        if (player.activeCharacterId === character.id) {
          return;
        }
      }
      const friends = friendUserIds(ctx, arg.ownerUserId);
      for (const friendId of friends) {
        appendPrivateEvent(
          ctx,
          character.id,
          friendId,
          'presence',
          `${character.name} went offline.`
        );
      }
    }
  );
};
