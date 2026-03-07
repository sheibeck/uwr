import { getAffinityForNpc } from '../helpers/npc_affinity';

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

      // Display NPC greeting — further conversation goes through talk_to_npc reducer
      const greeting = npc.greeting || `${npc.name} regards you silently.`;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'npc',
        `${npc.name} says, "${greeting}"`);
      return;
    }

    // --- CONSIDER / CON ---
    const conMatch = raw.match(/^(?:consider|con)\s+(.+)$/i);
    if (conMatch) {
      const targetName = conMatch[1].trim().toLowerCase();
      if (!targetName) return fail(ctx, character, 'Consider whom?');

      // Check NPCs at this location
      let npc: any = null;
      for (const row of ctx.db.npc.by_location.filter(character.locationId)) {
        if (row.name.toLowerCase() === targetName) { npc = row; break; }
      }
      if (npc) {
        const affinity = Number(getAffinityForNpc(ctx, character.id, npc.id));
        let regard: string;
        if (affinity >= 100) regard = `${npc.name} is devoted to you. A rare and unshakeable bond.`;
        else if (affinity >= 75) regard = `${npc.name} considers you a close friend. Trust runs deep here.`;
        else if (affinity >= 50) regard = `${npc.name} regards you warmly. You have earned their respect.`;
        else if (affinity >= 25) regard = `${npc.name} recognizes you as a passing acquaintance. There is room to grow.`;
        else if (affinity >= 0) regard = `${npc.name} regards you with polite indifference. You are a stranger to them.`;
        else if (affinity >= -25) regard = `${npc.name} eyes you warily. Something about you puts them on edge.`;
        else if (affinity >= -50) regard = `${npc.name} makes no effort to hide their dislike. Tread carefully.`;
        else regard = `${npc.name} despises you. Every word you speak deepens their contempt.`;
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', regard);
        return;
      }

      // Check enemy spawns at this location
      const spawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
      for (const spawn of spawns) {
        if (spawn.name.toLowerCase().includes(targetName)) {
          const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
          if (!template) continue;
          const levelDiff = Number(template.level) - Number(character.level);
          let threat: string;
          if (levelDiff <= -10) threat = `${spawn.name} would be trivial prey. Hardly worth the effort.`;
          else if (levelDiff <= -5) threat = `${spawn.name} poses little threat. You could handle this in your sleep.`;
          else if (levelDiff <= -2) threat = `${spawn.name} is beneath you, but not entirely without teeth.`;
          else if (levelDiff <= 1) threat = `${spawn.name} appears to be an even match. A fair fight awaits.`;
          else if (levelDiff <= 4) threat = `${spawn.name} looks dangerous. Proceed with caution.`;
          else if (levelDiff <= 8) threat = `${spawn.name} radiates menace. This would be a brutal fight — you may not survive.`;
          else threat = `${spawn.name} would wipe the floor with you. Turn back unless you have a death wish.`;

          if (template.isBoss) threat += ' This creature carries the weight of something ancient and terrible.';
          appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', threat);
          return;
        }
      }

      return fail(ctx, character, `You see no one named "${conMatch[1].trim()}" here to consider.`);
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
