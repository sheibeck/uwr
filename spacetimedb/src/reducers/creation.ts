// Character creation state machine — narrative flow from greeting to character finalization

const GREETING_MESSAGE =
  `Ah. Another one. The void spits you out and here you are, formless and fumbling, expecting me to care. I am The System. I have watched civilizations rise and crumble while you were busy not existing. But fine. Let's make something of you.\n\nDescribe what manner of creature you are -- your race, your people, whatever you imagine yourself to be. Be creative or be boring. I'll work with either.`;

const GO_BACK_PATTERNS = [
  'go back', 'start over', 'redo', 'changed my mind', 'try again',
  'wait no', 'undo', 'i want to change', 'let me change',
  'different race', 'different archetype',
];

function isGoBackIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return GO_BACK_PATTERNS.some(p => lower.includes(p));
}

function determineGoBackTarget(currentStep: string): string | null {
  switch (currentStep) {
    case 'AWAITING_ARCHETYPE': return 'AWAITING_RACE';
    case 'GENERATING_CLASS': return 'AWAITING_ARCHETYPE';
    case 'CLASS_REVEALED': return 'AWAITING_ARCHETYPE';
    default: return null;
  }
}

function clearDataFromStep(state: any, targetStep: string): any {
  const updated = { ...state };
  // Clear fields in reverse order based on target step
  if (targetStep === 'AWAITING_RACE') {
    updated.raceDescription = undefined;
    updated.raceName = undefined;
    updated.raceNarrative = undefined;
    updated.raceBonuses = undefined;
    updated.archetype = undefined;
    updated.className = undefined;
    updated.classDescription = undefined;
    updated.classStats = undefined;
    updated.abilities = undefined;
    updated.chosenAbilityIndex = undefined;
    updated.characterName = undefined;
  } else if (targetStep === 'AWAITING_ARCHETYPE') {
    updated.archetype = undefined;
    updated.className = undefined;
    updated.classDescription = undefined;
    updated.classStats = undefined;
    updated.abilities = undefined;
    updated.chosenAbilityIndex = undefined;
    updated.characterName = undefined;
  }
  return updated;
}

function parseArchetype(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('warrior')) return 'warrior';
  if (lower.includes('mystic')) return 'mystic';
  return null;
}

export const registerCreationReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    SenderError,
    requirePlayerUserId,
    appendCreationEvent,
    computeBaseStatsForGenerated,
    recomputeCharacterDerived,
    grantStarterItems,
    ensureStarterItemTemplates,
    ensureSpawnsForLocation,
    appendPrivateEvent,
    appendLocationEvent,
  } = deps;

  // start_creation — called when client detects no character and no creation state
  spacetimedb.reducer('start_creation', {}, (ctx: any, _: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');

    // Check if already has a creation state
    for (const existing of ctx.db.character_creation_state.by_player.filter(ctx.sender)) {
      // Already has creation state, emit current step info
      appendCreationEvent(ctx, ctx.sender, 'creation', `You are already in the creation flow at step: ${existing.step}. Continue where you left off.`);
      return;
    }

    // Check if already has a character
    if (player.userId != null) {
      for (const char of ctx.db.character.by_owner_user.filter(player.userId)) {
        appendCreationEvent(ctx, ctx.sender, 'creation_error', 'You already have a character. Delete it first if you wish to create a new one.');
        return;
      }
    }

    // Create initial creation state
    ctx.db.character_creation_state.insert({
      id: 0n,
      playerId: ctx.sender,
      step: 'AWAITING_RACE',
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });

    appendCreationEvent(ctx, ctx.sender, 'creation', GREETING_MESSAGE);
  });

  // submit_creation_input — main state machine reducer
  spacetimedb.reducer('submit_creation_input', { text: t.string() }, (ctx: any, { text }: { text: string }) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');

    // Find creation state
    let state: any = null;
    for (const row of ctx.db.character_creation_state.by_player.filter(ctx.sender)) {
      state = row;
      break;
    }

    if (!state) {
      // No creation state — auto-start
      ctx.db.character_creation_state.insert({
        id: 0n,
        playerId: ctx.sender,
        step: 'AWAITING_RACE',
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      appendCreationEvent(ctx, ctx.sender, 'creation', GREETING_MESSAGE);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      appendCreationEvent(ctx, ctx.sender, 'creation_error', 'Silence speaks volumes, but I need actual words. Try again.');
      return;
    }

    // Handle CONFIRMING_GO_BACK state first
    if (state.step === 'CONFIRMING_GO_BACK') {
      if (trimmed.toLowerCase() === 'yes') {
        const target = state.goBackTarget;
        const cleaned = clearDataFromStep(state, target);
        ctx.db.character_creation_state.id.update({
          ...cleaned,
          step: target,
          goBackTarget: undefined,
          previousStep: undefined,
          updatedAt: ctx.timestamp,
        });
        if (target === 'AWAITING_RACE') {
          appendCreationEvent(ctx, ctx.sender, 'creation', 'So be it. The slate is wiped clean. Describe your race anew -- what manner of creature are you?');
        } else if (target === 'AWAITING_ARCHETYPE') {
          appendCreationEvent(ctx, ctx.sender, 'creation', `Very well. Your heritage as ${state.raceName || 'your chosen race'} endures, but the path forward is unmade. Choose your archetype: [Warrior] or [Mystic]?`);
        }
      } else {
        // Declined go-back, restore previous step
        ctx.db.character_creation_state.id.update({
          ...state,
          step: state.previousStep || 'AWAITING_RACE',
          goBackTarget: undefined,
          previousStep: undefined,
          updatedAt: ctx.timestamp,
        });
        appendCreationEvent(ctx, ctx.sender, 'creation', 'Crisis of conviction averted. Carry on.');
      }
      return;
    }

    // Go-back detection (not allowed during AWAITING_NAME or COMPLETE)
    if (state.step !== 'AWAITING_NAME' && state.step !== 'COMPLETE' && state.step !== 'GENERATING_RACE' && state.step !== 'GENERATING_CLASS' && isGoBackIntent(trimmed)) {
      const goBackTarget = determineGoBackTarget(state.step);
      if (goBackTarget) {
        const thingBeingLost = state.className
          ? `the ${state.className}`
          : state.raceName
            ? `the ${state.raceName}`
            : 'what was made';

        ctx.db.character_creation_state.id.update({
          ...state,
          step: 'CONFIRMING_GO_BACK',
          goBackTarget,
          previousStep: state.step,
          updatedAt: ctx.timestamp,
        });
        appendCreationEvent(
          ctx, ctx.sender, 'creation_warning',
          `You wish to unmake what was made? ${thingBeingLost} -- a thing that has never existed before and may never exist again -- you would cast it aside? Type [Yes] to abandon this path, or simply continue as you were.`
        );
        return;
      }
    }

    // Main state machine
    switch (state.step) {
      case 'AWAITING_RACE': {
        // Store freeform race description, advance to GENERATING_RACE
        ctx.db.character_creation_state.id.update({
          ...state,
          raceDescription: trimmed,
          step: 'GENERATING_RACE',
          updatedAt: ctx.timestamp,
        });
        appendCreationEvent(ctx, ctx.sender, 'creation', 'The System is considering your... unique... heritage.');
        break;
      }

      case 'GENERATING_RACE': {
        // Waiting for LLM — player shouldn't be submitting input here
        appendCreationEvent(ctx, ctx.sender, 'creation', 'Patience. I am still contemplating the bizarre thing you described. This takes a moment.');
        break;
      }

      case 'AWAITING_ARCHETYPE': {
        const archetype = parseArchetype(trimmed);
        if (!archetype) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', `I offered you two choices. [Warrior] or [Mystic]. This isn't a creative writing exercise... yet.`);
          return;
        }
        ctx.db.character_creation_state.id.update({
          ...state,
          archetype,
          step: 'GENERATING_CLASS',
          updatedAt: ctx.timestamp,
        });
        const archetypeLabel = archetype === 'warrior' ? 'Warrior' : 'Mystic';
        appendCreationEvent(ctx, ctx.sender, 'creation', `${archetypeLabel}. Interesting. The System is forging something... unique for you. Stand by.`);
        break;
      }

      case 'GENERATING_CLASS': {
        // Waiting for LLM — player shouldn't be submitting input here
        appendCreationEvent(ctx, ctx.sender, 'creation', 'I am crafting something that has never existed before. These things take time. Unlike you, I do not rush.');
        break;
      }

      case 'CLASS_REVEALED': {
        // Player is choosing an ability from the 3 presented
        if (!state.abilities) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'Something went wrong -- no abilities are available. The System is displeased.');
          return;
        }
        let abilities: any[];
        try {
          abilities = JSON.parse(state.abilities);
        } catch {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'The System encountered a disturbance parsing your abilities. Try again.');
          return;
        }

        // Match by case-insensitive substring of ability name
        const lowerInput = trimmed.toLowerCase();
        let matchIndex = -1;
        for (let i = 0; i < abilities.length; i++) {
          const abilityName = (abilities[i].name || abilities[i].abilityName || '').toLowerCase();
          if (abilityName && lowerInput.includes(abilityName)) {
            matchIndex = i;
            break;
          }
          // Also check if the player typed the ability name directly
          if (abilityName && abilityName.includes(lowerInput)) {
            matchIndex = i;
            break;
          }
        }

        if (matchIndex === -1) {
          const abilityNames = abilities.map((a: any) => `[${a.name || a.abilityName}]`).join(', ');
          appendCreationEvent(ctx, ctx.sender, 'creation_error', `I presented three abilities: ${abilityNames}. Pick one by name. This isn't that complicated.`);
          return;
        }

        ctx.db.character_creation_state.id.update({
          ...state,
          chosenAbilityIndex: BigInt(matchIndex),
          step: 'AWAITING_NAME',
          updatedAt: ctx.timestamp,
        });
        const chosenName = abilities[matchIndex].name || abilities[matchIndex].abilityName;
        appendCreationEvent(ctx, ctx.sender, 'creation', `${chosenName}. A fine choice. Or a terrible one. Time will tell.\n\nNow -- what shall I call you? Choose your name wisely. Or don't. I won't judge. (That's a lie.)`);
        break;
      }

      case 'AWAITING_NAME': {
        // Validate name
        const candidateName = trimmed;
        if (candidateName.length < 4) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'Four characters minimum. Even the shortest-lived creatures deserve a proper name.');
          return;
        }

        // Check for duplicates
        for (const char of ctx.db.character.iter()) {
          if (char.name.toLowerCase() === candidateName.toLowerCase()) {
            appendCreationEvent(ctx, ctx.sender, 'creation_error', `The name "${candidateName}" is already taken. The world has no room for two of you. Try another.`);
            return;
          }
        }

        // Finalize character creation
        const userId = requirePlayerUserId(ctx);
        const world = ctx.db.world_state.id.find(1n);
        if (!world) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'The world has not yet been initialized. The System is... embarrassed.');
          return;
        }
        const startingLocation = ctx.db.location.id.find(world.startingLocationId);
        if (!startingLocation) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'No starting location found. The void has no doors.');
          return;
        }

        // Parse classStats from creation state
        let primaryStat: string = 'str';
        let secondaryStat: string | undefined;
        if (state.classStats) {
          try {
            const cs = JSON.parse(state.classStats);
            primaryStat = cs.primaryStat || 'str';
            secondaryStat = cs.secondaryStat || undefined;
          } catch {
            // Fall back to archetype defaults
            if (state.archetype === 'mystic') {
              primaryStat = 'int';
              secondaryStat = 'wis';
            } else {
              primaryStat = 'str';
              secondaryStat = 'dex';
            }
          }
        } else if (state.archetype) {
          if (state.archetype === 'mystic') {
            primaryStat = 'int';
            secondaryStat = 'wis';
          } else {
            primaryStat = 'str';
            secondaryStat = 'dex';
          }
        }

        const classStats = computeBaseStatsForGenerated(primaryStat, secondaryStat, 1n);

        // Build character row
        const character = ctx.db.character.insert({
          id: 0n,
          ownerUserId: userId,
          name: candidateName,
          race: state.raceName || 'Unknown',
          className: state.className || (state.archetype === 'mystic' ? 'Mystic' : 'Warrior'),
          level: 1n,
          xp: 0n,
          gold: 0n,
          locationId: startingLocation.id,
          boundLocationId: startingLocation.id,
          str: classStats.str,
          dex: classStats.dex,
          cha: classStats.cha,
          wis: classStats.wis,
          int: classStats.int,
          hp: 0n,
          maxHp: 0n,
          mana: 0n,
          maxMana: 0n,
          stamina: 0n,
          maxStamina: 0n,
          hitChance: 0n,
          dodgeChance: 0n,
          parryChance: 0n,
          critMelee: 0n,
          critRanged: 0n,
          critDivine: 0n,
          critArcane: 0n,
          armorClass: 0n,
          perception: 0n,
          search: 0n,
          ccPower: 0n,
          vendorBuyMod: 0n,
          vendorSellMod: 0n,
          createdAt: ctx.timestamp,
        });

        // Compute derived stats
        recomputeCharacterDerived(ctx, character);

        // Set to full hp/mana/stamina
        const recomputed = ctx.db.character.id.find(character.id);
        if (recomputed) {
          ctx.db.character.id.update({
            ...recomputed,
            hp: recomputed.maxHp,
            mana: recomputed.maxMana,
            stamina: recomputed.maxStamina,
          });
        }

        // Grant starter items
        grantStarterItems(ctx, character, ensureStarterItemTemplates);

        // Initialize faction standings
        for (const faction of ctx.db.faction.iter()) {
          ctx.db.faction_standing.insert({
            id: 0n,
            characterId: character.id,
            factionId: faction.id,
            standing: 0n,
          });
        }

        // Create chosen ability if abilities data exists
        if (state.abilities && state.chosenAbilityIndex != null) {
          try {
            const abilities = JSON.parse(state.abilities);
            const chosen = abilities[Number(state.chosenAbilityIndex)];
            if (chosen) {
              // Insert ability template for this character's unique ability
              const abilityRow = ctx.db.ability_template.insert({
                id: 0n,
                name: chosen.name || chosen.abilityName || 'Unknown Ability',
                description: chosen.description || '',
                characterId: character.id,
                kind: chosen.kind || chosen.type || 'damage',
                targetRule: chosen.targetRule || 'single_enemy',
                resourceType: chosen.resourceType || (state.archetype === 'mystic' ? 'mana' : 'stamina'),
                resourceCost: BigInt(chosen.resourceCost || 10),
                castSeconds: BigInt(chosen.castSeconds || 0),
                cooldownSeconds: BigInt(chosen.cooldownSeconds || 6),
                value1: BigInt(chosen.value1 || chosen.damage || chosen.healAmount || 15),
                value2: chosen.value2 != null ? BigInt(chosen.value2) : undefined,
                scaling: chosen.scaling || primaryStat,
                effectType: chosen.effectType || undefined,
                effectMagnitude: chosen.effectMagnitude != null ? BigInt(chosen.effectMagnitude) : undefined,
                effectDuration: chosen.effectDuration != null ? BigInt(chosen.effectDuration) : undefined,
                levelRequired: 1n,
                isGenerated: true,
              });

              // Add to hotbar slot 1
              ctx.db.hotbar_slot.insert({
                id: 0n,
                characterId: character.id,
                slot: 0n,
                abilityTemplateId: abilityRow.id,
              });
            }
          } catch {
            // Ability creation failed — not blocking, character is still created
          }
        }

        // Set active character on player
        ctx.db.player.id.update({ ...player, activeCharacterId: character.id });

        // Mark creation state as complete
        ctx.db.character_creation_state.id.update({
          ...state,
          characterName: candidateName,
          step: 'COMPLETE',
          updatedAt: ctx.timestamp,
        });

        // Emit creation complete events
        appendCreationEvent(ctx, ctx.sender, 'creation', `Welcome to the world, ${candidateName}. Try not to die immediately. It's tedious to watch.`);
        appendPrivateEvent(ctx, character.id, userId, 'system', `${candidateName} enters the world.`);
        appendLocationEvent(
          ctx,
          startingLocation.id,
          'system',
          `${candidateName} steps into the area.`,
          character.id
        );

        ensureSpawnsForLocation(ctx, startingLocation.id);
        break;
      }

      case 'COMPLETE': {
        appendCreationEvent(ctx, ctx.sender, 'creation', 'Your character has already been created. Go forth and do something interesting.');
        break;
      }

      default: {
        appendCreationEvent(ctx, ctx.sender, 'creation_error', `The System is confused. Unknown creation step: ${state.step}. This shouldn't happen.`);
        break;
      }
    }
  });
};
