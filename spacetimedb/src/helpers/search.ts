export function performPassiveSearch(
  ctx: any,
  character: any,
  locationId: bigint,
  appendPrivateEvent: any,
) {
  // Delete any previous SearchResult for this character
  for (const sr of ctx.db.searchResult.by_character.filter(character.id)) {
    ctx.db.searchResult.id.delete(sr.id);
  }

  // Deterministic pseudo-random seed
  const charId = BigInt(character.id as bigint);
  const nowMicros = BigInt(ctx.timestamp.microsSinceUnixEpoch as bigint);
  const seed: bigint = charId ^ nowMicros;

  let foundResources = false;
  let foundQuestItem = false;
  let questItemId: bigint | undefined = undefined;
  let foundNamedEnemy = false;
  let namedEnemyId: bigint | undefined = undefined;

  // Roll 1: Hidden resources (65% chance)
  const resourceRoll: bigint = seed % 100n;
  if (resourceRoll < 65n) {
    foundResources = true;
  }

  // Roll 2: Quest items (40% chance) — only if character has active explore quest targeting this location
  // Use a different bit mix for independent roll
  const questRollRaw: bigint = ((seed >> 8n) ^ (seed * 7n)) % 100n;
  const questRoll: bigint = questRollRaw < 0n ? questRollRaw + 100n : questRollRaw;

  for (const qi of ctx.db.questInstance.by_character.filter(character.id)) {
    if (qi.completed) continue;
    const qt = ctx.db.questTemplate.id.find(qi.questTemplateId);
    if (!qt) continue;
    if ((qt.questType ?? 'kill') !== 'explore') continue;
    if (qt.targetLocationId !== locationId) continue;

    // Check if character already has a discovered (but not looted) quest item for this quest here
    let alreadyHasItem = false;
    for (const existingItem of ctx.db.questItem.by_character.filter(character.id)) {
      if (existingItem.questTemplateId === qt.id && existingItem.locationId === locationId && !existingItem.looted) {
        alreadyHasItem = true;
        break;
      }
    }
    if (alreadyHasItem) continue;

    if (questRoll < 40n) {
      // Create a quest item node at this location
      const newItem = ctx.db.questItem.insert({
        id: 0n,
        characterId: character.id,
        questTemplateId: qt.id,
        locationId,
        name: qt.targetItemName ?? 'Hidden Object',
        discovered: true,
        looted: false,
      });
      foundQuestItem = true;
      questItemId = newItem.id;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `Your search reveals something: ${qt.targetItemName ?? 'a hidden object'}!`);
    }
    break; // Only one explore quest roll per location entry
  }

  // Roll 3: Named enemy (20% chance) — only if a named enemy is configured for this location
  // Use yet another bit mix for independent roll
  const enemyRollRaw: bigint = ((seed >> 16n) ^ (seed * 13n)) % 100n;
  const enemyRoll: bigint = enemyRollRaw < 0n ? enemyRollRaw + 100n : enemyRollRaw;

  // Check if there's a boss_kill quest active for this location
  for (const qi of ctx.db.questInstance.by_character.filter(character.id)) {
    if (qi.completed) continue;
    const qt = ctx.db.questTemplate.id.find(qi.questTemplateId);
    if (!qt) continue;
    if ((qt.questType ?? 'kill') !== 'boss_kill') continue;
    if (qt.targetLocationId !== locationId) continue;

    // Check if named enemy already exists (alive) at this location for this character
    let existingEnemy: any = null;
    for (const ne of ctx.db.namedEnemy.by_character.filter(character.id)) {
      if (ne.locationId === locationId && ne.enemyTemplateId === qt.targetEnemyTemplateId) {
        existingEnemy = ne;
        break;
      }
    }

    // If exists and alive, just reveal it
    if (existingEnemy && existingEnemy.isAlive) {
      foundNamedEnemy = true;
      namedEnemyId = existingEnemy.id;
      break;
    }

    // If exists but dead, check respawn timer
    if (existingEnemy && !existingEnemy.isAlive && existingEnemy.lastKilledAt) {
      const respawnMicros = existingEnemy.respawnMinutes * 60n * 1_000_000n;
      const killedAtMicros = existingEnemy.lastKilledAt.microsSinceUnixEpoch;
      if (ctx.timestamp.microsSinceUnixEpoch < killedAtMicros + respawnMicros) {
        break; // Still on respawn cooldown
      }
      // Respawned — revive it
      ctx.db.namedEnemy.id.update({ ...existingEnemy, isAlive: true, lastKilledAt: undefined });
      foundNamedEnemy = true;
      namedEnemyId = existingEnemy.id;
      break;
    }

    // No existing enemy — roll to discover
    if (enemyRoll < 20n) {
      const newEnemy = ctx.db.namedEnemy.insert({
        id: 0n,
        characterId: character.id,
        name: qt.targetItemName ?? 'Named Enemy',
        enemyTemplateId: qt.targetEnemyTemplateId,
        locationId,
        isAlive: true,
        lastKilledAt: undefined,
        respawnMinutes: 30n, // 30 minute respawn
      });
      foundNamedEnemy = true;
      namedEnemyId = newEnemy.id;
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'quest',
        `You sense a powerful presence nearby...`);
    }
    break; // Only one boss check per location entry
  }

  // Always create a SearchResult row
  ctx.db.searchResult.insert({
    id: 0n,
    characterId: character.id,
    locationId,
    foundResources,
    foundQuestItem,
    questItemId,
    foundNamedEnemy,
    namedEnemyId,
    searchedAt: ctx.timestamp,
  });

  // Log resource discovery
  if (foundResources) {
    appendPrivateEvent(ctx, character.id, character.ownerUserId, 'move',
      'You notice some hidden resources in the area.');
  }
}
