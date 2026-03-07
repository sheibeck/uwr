export const registerIntentReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    requireCharacterOwnedBy,
    requirePlayerUserId,
    appendPrivateEvent,
    appendLocationEvent,
    activeCombatIdForCharacter,
    areLocationsConnected,
    fail,
  } = deps;

  spacetimedb.reducer('submit_intent', { characterId: t.u64(), text: t.string() }, (ctx: any, args: any) => {
    const character = requireCharacterOwnedBy(ctx, args.characterId);
    const _player = ctx.db.player.id.find(ctx.sender);
    if (_player) {
      ctx.db.player.id.update({ ..._player, lastActivityAt: ctx.timestamp });
    }

    const raw = args.text.trim();
    if (!raw) return fail(ctx, character, 'You stare into the void. It stares back.');

    // Slash commands: delegate to existing submit_command pipeline
    if (raw.startsWith('/')) {
      ctx.db.command.insert({
        id: 0n,
        ownerUserId: requirePlayerUserId(ctx),
        characterId: character.id,
        text: raw,
        status: 'pending',
        createdAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'command', `> ${raw}`);
      return;
    }

    const lower = raw.toLowerCase();

    // --- LOOK ---
    if (lower === 'look' || lower === 'l') {
      const location = ctx.db.location.id.find(character.locationId);
      if (location) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'look',
          `${location.name}: ${location.description}`);
      }
      return;
    }

    // --- INVENTORY ---
    if (lower === 'inventory' || lower === 'inv' || lower === 'i') {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'You rummage through your pack.');
      return;
    }

    // --- STATS ---
    if (lower === 'stats') {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'You reflect on your capabilities.');
      return;
    }

    // --- CAMP / REST ---
    if (lower === 'camp' || lower === 'rest') {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You cannot rest while in combat.');
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'You make camp and rest briefly. The world continues without you.');
      return;
    }

    // --- EXPLORE: retry world gen at current uncharted location (only useful after errors) ---
    if (lower === 'explore') {
      const currentLoc = ctx.db.location.id.find(character.locationId);
      if (!currentLoc || currentLoc.terrainType !== 'uncharted') {
        return fail(ctx, character, 'There is nothing uncharted to explore here.');
      }
      const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(character.locationId)]
        .find((s: any) => s.step !== 'ERROR');
      if (existingGen) {
        if (existingGen.step === 'PENDING' || existingGen.step === 'GENERATING') {
          return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            'The world is already taking shape around you. Patience.');
        }
        return appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'This region has already been explored.');
      }
      // Only reaches here if all existing states are ERROR — retry
      ctx.db.world_gen_state.insert({
        id: 0n,
        playerId: ctx.sender,
        characterId: args.characterId,
        sourceLocationId: character.locationId,
        sourceRegionId: currentLoc.regionId,
        step: 'PENDING',
        createdAt: ctx.timestamp,
        updatedAt: ctx.timestamp,
      });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'The edges of reality ripple around you. The System pauses, as if remembering something it had forgotten...');
      return;
    }

    // --- TRAVEL: "go <place>", "travel [to] <place>", or single-word location match ---
    const goMatch = lower.match(/^go\s+(.+)$/);
    const travelMatch = lower.match(/^travel\s+(?:to\s+)?(.+)$/);
    const travelTarget = goMatch?.[1] || travelMatch?.[1];

    // Bare "travel" or "go" without target — show available destinations
    if (lower === 'travel' || lower === 'go') {
      const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
      const names = connections
        .map((c: any) => ctx.db.location.id.find(c.toLocationId))
        .filter(Boolean)
        .map((l: any) => `[${l.name}]`);
      if (names.length > 0) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          `You can travel to: ${names.join(', ')}.`);
      } else {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
          'There is nowhere to go from here.');
      }
      return;
    }

    if (travelTarget) {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'Cannot travel while in combat.');
      }
      const activeGather = [...ctx.db.resource_gather.by_character.filter(character.id)][0];
      if (activeGather) {
        return fail(ctx, character, 'Cannot travel while gathering.');
      }

      // Resolve location name from adjacent locations
      const connections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
      let matchedLocation: any = null;

      for (const conn of connections) {
        const loc = ctx.db.location.id.find(conn.toLocationId);
        if (!loc) continue;
        const locName = loc.name.toLowerCase();
        if (locName === travelTarget) {
          matchedLocation = loc;
          break;
        }
        if (locName.includes(travelTarget) && !matchedLocation) {
          matchedLocation = loc;
        }
      }

      if (!matchedLocation) {
        // List available destinations
        const names = connections
          .map((c: any) => ctx.db.location.id.find(c.toLocationId))
          .filter(Boolean)
          .map((l: any) => l.name);
        const hint = names.length > 0
          ? `Nearby: ${names.join(', ')}.`
          : 'There is nowhere to go from here.';
        return fail(ctx, character, `No path leads to "${travelTarget}". ${hint}`);
      }

      // Minimal inline move
      const originId = character.locationId;
      ctx.db.character.id.update({ ...character, locationId: matchedLocation.id });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'move',
        `You travel to ${matchedLocation.name}. ${matchedLocation.description}`);
      appendLocationEvent(ctx, originId, 'move', `${character.name} departs.`, character.id);
      appendLocationEvent(ctx, matchedLocation.id, 'move', `${character.name} arrives.`, character.id);

      // Trigger world generation if destination is uncharted
      if (matchedLocation.terrainType === 'uncharted') {
        const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(matchedLocation.id)]
          .find((s: any) => s.step !== 'ERROR');
        if (!existingGen) {
          ctx.db.world_gen_state.insert({
            id: 0n,
            playerId: ctx.sender,
            characterId: args.characterId,
            sourceLocationId: matchedLocation.id,
            sourceRegionId: matchedLocation.regionId,
            step: 'PENDING',
            createdAt: ctx.timestamp,
            updatedAt: ctx.timestamp,
          });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            'The edges of reality ripple around you. The System pauses, as if remembering something it had forgotten...');
        }
      }
      return;
    }

    // --- SAY ---
    const sayMatch = raw.match(/^say\s+(.+)$/i);
    if (sayMatch) {
      const message = sayMatch[1].trim();
      if (!message) return fail(ctx, character, 'Say what?');
      appendLocationEvent(ctx, character.locationId, 'say', `${character.name} says, "${message}"`);
      return;
    }

    // --- WHISPER / TELL ---
    const whisperMatch = raw.match(/^(?:whisper|tell|w)\s+(\S+)\s+(.+)$/i);
    if (whisperMatch) {
      const targetName = whisperMatch[1].trim();
      const message = whisperMatch[2].trim();
      if (!message) return fail(ctx, character, 'Whisper what?');

      let target: any = null;
      for (const row of ctx.db.character.iter()) {
        if (row.name.toLowerCase() === targetName.toLowerCase()) {
          target = row;
          break;
        }
      }
      if (!target) return fail(ctx, character, `No one named "${targetName}" can be found.`);

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'whisper',
        `You whisper to ${target.name}: "${message}"`);
      appendPrivateEvent(ctx, target.id, target.ownerUserId, 'whisper',
        `${character.name} whispers: "${message}"`);
      return;
    }

    // --- HAIL / TALK / SPEAK ---
    const hailMatch = raw.match(/^(?:talk|hail|speak)\s+(?:to\s+)?(.+)$/i);
    if (hailMatch) {
      const npcName = hailMatch[1].trim();
      if (!npcName) return fail(ctx, character, 'Talk to whom?');

      let npc: any = null;
      for (const row of ctx.db.npc.by_location.filter(character.locationId)) {
        if (row.name.toLowerCase() === npcName.toLowerCase()) {
          npc = row;
          break;
        }
      }
      if (!npc) return fail(ctx, character, `No one named "${npcName}" is here.`);

      // Get root dialogue option (empty playerText)
      let rootOption: any = null;
      for (const opt of ctx.db.npc_dialogue_option.by_npc.filter(npc.id)) {
        if (opt.playerText === '' && (opt.parentOptionId === undefined || opt.parentOptionId === null)) {
          rootOption = opt;
          break;
        }
      }

      if (!rootOption) {
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc',
          `${npc.name} nods but has nothing to say.`);
        return;
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc',
        `${npc.name}: ${rootOption.npcResponse}`);
      return;
    }

    // --- ATTACK / FIGHT / KILL ---
    const attackMatch = lower.match(/^(?:attack|fight|kill)\s*(.*)$/);
    if (attackMatch) {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You are already in combat. Use your abilities.');
      }

      // Check for enemies at this location via enemy_spawn
      const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
      const activeSpawn = spawns.find((s: any) => s.currentCount > 0n);
      if (!activeSpawn) {
        return fail(ctx, character, 'There is nothing to fight here.');
      }

      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'You see enemies nearby. Click an enemy spawn or use the action bar to engage.');
      return;
    }

    // --- FLEE ---
    if (lower === 'flee' || lower === 'run') {
      if (!activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'You are not in combat. There is nothing to flee from.');
      }
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'Use the Flee button in combat to attempt an escape.');
      return;
    }

    // --- USE / CAST (ability hint) ---
    const useMatch = lower.match(/^(?:use|cast)\s+(.+)$/);
    if (useMatch) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
        'Use the ability bar to activate your abilities during combat.');
      return;
    }

    // --- IMPLICIT TRAVEL: bare location name match ---
    const allConnections = [...ctx.db.location_connection.by_from.filter(character.locationId)];
    let implicitDest: any = null;
    for (const conn of allConnections) {
      const loc = ctx.db.location.id.find(conn.toLocationId);
      if (!loc) continue;
      if (loc.name.toLowerCase() === lower) { implicitDest = loc; break; }
      if (loc.name.toLowerCase().includes(lower) && !implicitDest) { implicitDest = loc; }
    }
    if (implicitDest) {
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return fail(ctx, character, 'Cannot travel while in combat.');
      }
      const originId = character.locationId;
      ctx.db.character.id.update({ ...character, locationId: implicitDest.id });
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'move',
        `You travel to ${implicitDest.name}. ${implicitDest.description}`);
      appendLocationEvent(ctx, originId, 'move', `${character.name} departs.`, character.id);
      appendLocationEvent(ctx, implicitDest.id, 'move', `${character.name} arrives.`, character.id);
      if (implicitDest.terrainType === 'uncharted') {
        const existingGen = [...ctx.db.world_gen_state.by_source_location.filter(implicitDest.id)]
          .find((s: any) => s.step !== 'ERROR');
        if (!existingGen) {
          ctx.db.world_gen_state.insert({
            id: 0n, playerId: ctx.sender, characterId: args.characterId,
            sourceLocationId: implicitDest.id, sourceRegionId: implicitDest.regionId,
            step: 'PENDING', createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
          });
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
            'The edges of reality ripple around you. The System pauses, as if remembering something it had forgotten...');
        }
      }
      return;
    }

    // --- SARDONIC FALLBACK ---
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system',
      `The System regards you with mild contempt. "${raw}" means nothing here. Perhaps try [look], [travel], [attack], or [hail].`);
  });
};
