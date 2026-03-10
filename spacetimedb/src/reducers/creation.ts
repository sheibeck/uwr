import { ensureDefaultHotbar } from '../helpers/items';

// Character creation state machine — narrative flow from greeting to character finalization

const GREETING_MESSAGE =
  `Ah. Another one. The void spits you out and here you are, formless and fumbling, expecting me to care. I am The Keeper of Knowledge. I have watched civilizations rise and crumble while you were busy not existing. But fine. Let's make something of you.\n\nDescribe what manner of creature you are -- your race, your people, whatever you imagine yourself to be. Be creative or be boring. I'll work with either.\n\nNeed inspiration? Others before you have walked in as an [Elf], [Dwarf], [Goblin], [Dragonborn], [Shadeling], [Myconid], [Crystalborn], [Cyclops], [Troll], [Dark-Elf], [Halfling] -- or invented something entirely their own. Describe what you are, ask about a race, or simply make something up. I've seen it all.`;

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
    case 'CONFIRMING': return 'AWAITING_NAME';
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
  } else if (targetStep === 'AWAITING_NAME') {
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

function buildConfirmationSummary(state: any): string {
  let abilityName = 'Unknown';
  if (state.abilities && state.chosenAbilityIndex != null) {
    try {
      const abilities = JSON.parse(state.abilities);
      const chosen = abilities[Number(state.chosenAbilityIndex)];
      if (chosen) abilityName = chosen.name || chosen.abilityName || 'Unknown';
    } catch { /* ignore */ }
  }
  return `The Keeper reviews the chronicle of your becoming:\n\nRace: ${state.raceName || 'Unknown'}\nClass: ${state.className || 'Unknown'}\nAbility: ${abilityName}\nName: ${state.characterName}\n\nIs this the soul you wish to carry into the world? Type [Confirm] to seal your fate, or [Start Over] to begin anew.`;
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
    appendPrivateEvent,
  } = deps;

  function finalizeCharacter(ctx: any, state: any, player: any) {
    const userId = requirePlayerUserId(ctx);
    const characterName = state.characterName;

    // Parse classStats from creation state
    let primaryStat: string = 'str';
    let secondaryStat: string | undefined;
    let weaponProficiencies: string | undefined;
    let armorProficiencies: string | undefined;
    if (state.classStats) {
      try {
        const cs = JSON.parse(state.classStats);
        primaryStat = cs.primaryStat || 'str';
        secondaryStat = cs.secondaryStat || undefined;
        if (Array.isArray(cs.weaponProficiencies) && cs.weaponProficiencies.length > 0) {
          weaponProficiencies = cs.weaponProficiencies.join(',');
        }
        if (Array.isArray(cs.armorProficiencies) && cs.armorProficiencies.length > 0) {
          armorProficiencies = cs.armorProficiencies.join(',');
        }
      } catch {
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
    if (!weaponProficiencies) {
      weaponProficiencies = state.archetype === 'mystic'
        ? 'staff,wand,dagger'
        : 'sword,axe,mace,greatsword,dagger';
    }
    if (!armorProficiencies) {
      armorProficiencies = state.archetype === 'mystic'
        ? 'cloth,leather'
        : 'cloth,leather,chain,plate';
    }
    if (!armorProficiencies.split(',').includes('cloth')) {
      armorProficiencies = 'cloth,' + armorProficiencies;
    }

    const classStats = computeBaseStatsForGenerated(primaryStat, secondaryStat, 1n);

    const character = ctx.db.character.insert({
      id: 0n,
      ownerUserId: userId,
      name: characterName,
      race: state.raceName || 'Unknown',
      className: state.className || (state.archetype === 'mystic' ? 'Mystic' : 'Warrior'),
      level: 1n,
      xp: 0n,
      gold: 0n,
      locationId: 0n,
      boundLocationId: 0n,
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
      weaponProficiencies,
      armorProficiencies,
      pendingLevels: 0n,
    });

    recomputeCharacterDerived(ctx, character);

    const recomputed = ctx.db.character.id.find(character.id);
    if (recomputed) {
      ctx.db.character.id.update({
        ...recomputed,
        hp: recomputed.maxHp,
        mana: recomputed.maxMana,
        stamina: recomputed.maxStamina,
      });
    }

    grantStarterItems(ctx, character, ensureStarterItemTemplates);

    for (const faction of ctx.db.faction.iter()) {
      ctx.db.faction_standing.insert({
        id: 0n,
        characterId: character.id,
        factionId: faction.id,
        standing: 0n,
      });
    }

    if (state.abilities && state.chosenAbilityIndex != null) {
      try {
        const abilities = JSON.parse(state.abilities);
        const chosen = abilities[Number(state.chosenAbilityIndex)];
        if (chosen) {
          const abilityRow = ctx.db.ability_template.insert({
            id: 0n,
            name: chosen.name || chosen.abilityName || 'Unknown Ability',
            description: chosen.description || '',
            characterId: character.id,
            kind: chosen.kind || chosen.effect || chosen.type || 'damage',
            targetRule: chosen.targetRule || 'single_enemy',
            resourceType: chosen.resourceType || (state.archetype === 'mystic' ? 'mana' : 'stamina'),
            resourceCost: BigInt(chosen.resourceCost || chosen.manaCost || 10),
            castSeconds: (() => { const cs = BigInt(chosen.castSeconds || 0); const rt = chosen.resourceType || (state.archetype === 'mystic' ? 'mana' : 'stamina'); return rt === 'mana' && cs < 1n ? 1n : cs; })(),
            cooldownSeconds: BigInt(chosen.cooldownSeconds || 6),
            value1: BigInt(chosen.value1 || chosen.baseDamage || chosen.damage || chosen.healAmount || 15),
            value2: chosen.value2 != null ? BigInt(chosen.value2) : undefined,
            scaling: chosen.scaling || primaryStat,
            damageType: chosen.damageType || 'physical',
            effectType: chosen.effectType || undefined,
            effectMagnitude: chosen.effectMagnitude != null ? BigInt(chosen.effectMagnitude) : undefined,
            effectDuration: chosen.effectDuration != null ? BigInt(chosen.effectDuration) : undefined,
            levelRequired: 1n,
            isGenerated: true,
          });

          const hotbar = ensureDefaultHotbar(ctx, character.id);
          ctx.db.hotbar_slot.insert({
            id: 0n,
            characterId: character.id,
            hotbarId: hotbar.id,
            slot: 0n,
            abilityTemplateId: abilityRow.id,
            assignedAt: ctx.timestamp,
          });
        }
      } catch {
        // Ability creation failed — not blocking
      }
    }

    ctx.db.player.id.update({ ...player, activeCharacterId: character.id });

    ctx.db.character_creation_state.id.update({
      ...state,
      step: 'COMPLETE',
      updatedAt: ctx.timestamp,
    });

    appendCreationEvent(ctx, ctx.sender, 'creation', `Go on then, ${characterName}. The void grows bored of you standing here.`);
    appendPrivateEvent(ctx, character.id, userId, 'system',
      `A few things you should probably know before you get yourself killed:\n\nType [bag] to open your pack -- you have starter gear in there. Equip it, or don't; the enemies won't wait for you to feel ready. Your hotbar already holds your starting ability -- click it in combat, or just type its name. To see who else exists in this forsaken place, type [look]; to bother one of them, type [hail <name>]. NPCs have opinions about you that improve the longer you don't annoy them -- they may eventually share quests, training, or items. Type [look] again when you want to move somewhere, then click a path or type the direction. And when combat inevitably goes sideways, [flee] exists for a reason. No shame in it. You can always come back and die more slowly.`
    );

    ctx.db.world_gen_state.insert({
      id: 0n,
      playerId: ctx.sender,
      characterId: character.id,
      sourceLocationId: 0n,
      sourceRegionId: 0n,
      step: 'PENDING',
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }

  // start_creation — called when client detects no character and no creation state
  spacetimedb.reducer('start_creation', {}, (ctx: any, _: any) => {
    const player = ctx.db.player.id.find(ctx.sender);
    if (!player) throw new SenderError('Player not found');

    // Check if already has a creation state — resume narratively
    for (const existing of ctx.db.character_creation_state.by_player.filter(ctx.sender)) {
      const step = existing.step;
      if (step === 'AWAITING_RACE') {
        appendCreationEvent(ctx, ctx.sender, 'creation', 'Ah, you again. The void keeps spitting you back. We were discussing what manner of creature you are. Describe your race -- your people, your heritage. I\'m still waiting.\n\nNeed inspiration? Others before you have walked in as an [Elf], [Dwarf], [Goblin], [Dragonborn], [Shadeling], [Myconid], [Crystalborn], [Cyclops], [Troll], [Dark-Elf], [Halfling] -- or invented something entirely their own.');
      } else if (step === 'GENERATING_RACE' || step === 'GENERATING_CLASS') {
        appendCreationEvent(ctx, ctx.sender, 'creation', 'The Keeper is still working. Patience is a virtue you clearly lack, but try anyway.');
      } else if (step === 'AWAITING_ARCHETYPE') {
        appendCreationEvent(ctx, ctx.sender, 'creation', `Welcome back. You are ${existing.raceName || 'whatever you described'}. Now -- do you walk the path of the [Warrior] or the [Mystic]? Choose.\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`);
      } else if (step === 'CLASS_REVEALED') {
        appendCreationEvent(ctx, ctx.sender, 'creation', `Still here? Good. You were choosing an ability for your ${existing.className || 'class'}. Pick one from the options above.\n\n(If you're already regretting your choices, type "go back." The Keeper does not judge... much.)`);
      } else if (step === 'AWAITING_NAME') {
        appendCreationEvent(ctx, ctx.sender, 'creation', `Back again. You still need a name. Four characters minimum. Make it count -- you\'ll be stuck with it.`);
      } else if (step === 'CONFIRMING') {
        appendCreationEvent(ctx, ctx.sender, 'creation', buildConfirmationSummary(existing));
      } else if (step === 'COMPLETE') {
        appendCreationEvent(ctx, ctx.sender, 'creation', 'Your character has already been created. Go forth and do something interesting.');
      } else {
        appendCreationEvent(ctx, ctx.sender, 'creation', 'The Keeper remembers you. Continue where you left off.');
      }
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
    if (state.step !== 'AWAITING_NAME' && state.step !== 'CONFIRMING' && state.step !== 'COMPLETE' && state.step !== 'GENERATING_RACE' && state.step !== 'GENERATING_CLASS' && isGoBackIntent(trimmed)) {
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
        appendCreationEvent(ctx, ctx.sender, 'creation', 'The Keeper is considering your... unique... heritage.');
        break;
      }

      case 'GENERATING_RACE': {
        // Waiting for LLM — player shouldn't be submitting input here.
        // Client flow: client observes step='GENERATING_RACE' via subscription,
        // then calls generateCreationContent procedure with generationType='race'.
        // The procedure handles the LLM call and advances state to AWAITING_ARCHETYPE.
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
        appendCreationEvent(ctx, ctx.sender, 'creation', `${archetypeLabel}. Interesting. The Keeper is forging something... unique for you. Stand by.`);
        break;
      }

      case 'GENERATING_CLASS': {
        // Waiting for LLM — player shouldn't be submitting input here.
        // Client flow: client observes step='GENERATING_CLASS' via subscription,
        // then calls generateCreationContent procedure with generationType='class'.
        // The procedure handles the LLM call and advances state to CLASS_REVEALED.
        appendCreationEvent(ctx, ctx.sender, 'creation', 'I am crafting something that has never existed before. These things take time. Unlike you, I do not rush.');
        break;
      }

      case 'CLASS_REVEALED': {
        // Player is choosing an ability from the 3 presented
        if (!state.abilities) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'Something went wrong -- no abilities are available. The Keeper is displeased.');
          return;
        }
        let abilities: any[];
        try {
          abilities = JSON.parse(state.abilities);
        } catch {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'The Keeper encountered a disturbance parsing your abilities. Try again.');
          return;
        }

        // Match by case-insensitive substring of ability name
        const lowerInput = trimmed.toLowerCase().replace(/\s+/g, ' ');
        let matchIndex = -1;
        for (let i = 0; i < abilities.length; i++) {
          const abilityName = (abilities[i].name || abilities[i].abilityName || '').trim().toLowerCase().replace(/\s+/g, ' ');
          if (!abilityName) continue;
          // Exact match first
          if (lowerInput === abilityName) {
            matchIndex = i;
            break;
          }
          // Substring match in either direction
          if (lowerInput.includes(abilityName) || abilityName.includes(lowerInput)) {
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
        if (candidateName.length < 3 || candidateName.length > 20) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'Names must be between 3 and 20 characters. Choose something... pronounceable.');
          return;
        }
        if (/\s/.test(candidateName)) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'One word only. No spaces. The Keeper does not have time for your elaborate titles.');
          return;
        }
        if (!/^[a-zA-Z]+$/.test(candidateName)) {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'Letters only. No numbers, no symbols, no hieroglyphics. Just a name.');
          return;
        }

        // Check for duplicates
        for (const char of ctx.db.character.iter()) {
          if (char.name.toLowerCase() === candidateName.toLowerCase()) {
            appendCreationEvent(ctx, ctx.sender, 'creation_error', `The name "${candidateName}" is already taken. The world has no room for two of you. Try another.`);
            return;
          }
        }

        // Store validated name and advance to confirmation step
        const updatedState = {
          ...state,
          characterName: candidateName,
          step: 'CONFIRMING',
          updatedAt: ctx.timestamp,
        };
        ctx.db.character_creation_state.id.update(updatedState);

        appendCreationEvent(ctx, ctx.sender, 'creation', buildConfirmationSummary(updatedState));
        break;
      }

      case 'CONFIRMING': {
        const lowerInput = trimmed.toLowerCase();
        if (lowerInput === 'confirm') {
          // Re-check name uniqueness at confirmation time (in case someone took it)
          for (const char of ctx.db.character.iter()) {
            if (char.name.toLowerCase() === (state.characterName || '').toLowerCase()) {
              appendCreationEvent(ctx, ctx.sender, 'creation_error', `The name "${state.characterName}" was taken while you were deliberating. The Keeper is unsurprised. Go back and choose another.`);
              // Reset to AWAITING_NAME so they can pick a new name
              ctx.db.character_creation_state.id.update({
                ...state,
                characterName: undefined,
                step: 'AWAITING_NAME',
                updatedAt: ctx.timestamp,
              });
              return;
            }
          }
          finalizeCharacter(ctx, state, player);
        } else if (lowerInput === 'start over' || GO_BACK_PATTERNS.some(p => lowerInput.includes(p))) {
          const cleaned = clearDataFromStep(state, 'AWAITING_RACE');
          ctx.db.character_creation_state.id.update({
            ...cleaned,
            characterName: undefined,
            step: 'AWAITING_RACE',
            updatedAt: ctx.timestamp,
          });
          appendCreationEvent(ctx, ctx.sender, 'creation', 'Very well. The slate is wiped clean. Let us begin again. Describe your race -- what manner of creature are you?');
        } else {
          appendCreationEvent(ctx, ctx.sender, 'creation_error', 'I asked a simple question. [Confirm] to proceed, or [Start Over] to begin anew. This is not the time for creativity.');
        }
        break;
      }

      case 'COMPLETE': {
        appendCreationEvent(ctx, ctx.sender, 'creation', 'Your character has already been created. Go forth and do something interesting.');
        break;
      }

      default: {
        appendCreationEvent(ctx, ctx.sender, 'creation_error', `The Keeper is confused. Unknown creation step: ${state.step}. This shouldn't happen.`);
        break;
      }
    }
  });
};
