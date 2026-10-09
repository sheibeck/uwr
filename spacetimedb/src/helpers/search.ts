/**
 * The passive search on arrival. Phase 51.3.1.1 Plan 12 (D-26): resources are found only as shared
 * pools now, so the search no longer rolls for or spawns personal resource nodes (foundResources is
 * always false); it still cleans up the character's old nodes at the place, discovers quest items
 * and named enemies, and writes the search_result row.
 */
export function performPassiveSearch(
  ctx: any,
  character: any,
  locationId: bigint,
  appendPrivateEvent: any,
) {
  // Delete any previous SearchResult for this character
  for (const sr of ctx.db.search_result.by_character.filter(character.id)) {
    ctx.db.search_result.id.delete(sr.id);
  }

  // Deterministic pseudo-random seed
  const charId = BigInt(character.id as bigint);
  const nowMicros = BigInt(ctx.timestamp.microsSinceUnixEpoch as bigint);
  const seed: bigint = charId ^ nowMicros;

  const foundResources = false;
  let foundQuestItem = false;
  let questItemId: bigint | undefined = undefined;
  let foundNamedEnemy = false;
  let namedEnemyId: bigint | undefined = undefined;

  // Quest items: always spawn for delivery/explore quests at target location
  for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
    if (qi.completed) continue;
    const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
    if (!qt) continue;
    const qtype = qt.questType ?? 'kill';
    if (qtype !== 'explore' && qtype !== 'delivery') continue;
    // Delivery quests: item spawns at sourceLocationId (pickup location)
    // Explore quests: item spawns at targetLocationId (destination)
    const spawnLocationId = qtype === 'delivery'
      ? (qt.sourceLocationId ?? qt.targetLocationId)
      : qt.targetLocationId;
    if (spawnLocationId !== locationId) continue;

    // Check if character already has a discovered (but not looted) quest item for this quest here
    let alreadyHasItem = false;
    for (const existingItem of ctx.db.quest_item.by_character.filter(character.id)) {
      if (existingItem.questTemplateId === qt.id && existingItem.locationId === locationId && !existingItem.looted) {
        alreadyHasItem = true;
        break;
      }
    }
    if (alreadyHasItem) continue;

    // Create a quest item node at this location (deterministic — no RNG)
    const newItem = ctx.db.quest_item.insert({
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

  // Roll 3: Named enemy (20% chance) — only if a named enemy is configured for this location
  // Use yet another bit mix for independent roll
  const enemyRollRaw: bigint = ((seed >> 16n) ^ (seed * 13n)) % 100n;
  const enemyRoll: bigint = enemyRollRaw < 0n ? enemyRollRaw + 100n : enemyRollRaw;

  // Check if there's a boss_kill quest active for this location
  for (const qi of ctx.db.quest_instance.by_character.filter(character.id)) {
    if (qi.completed) continue;
    const qt = ctx.db.quest_template.id.find(qi.questTemplateId);
    if (!qt) continue;
    if ((qt.questType ?? 'kill') !== 'boss_kill') continue;
    if (qt.targetLocationId !== locationId) continue;

    // Check if named enemy already exists (alive) at this location for this character
    let existingEnemy: any = null;
    for (const ne of ctx.db.named_enemy.by_character.filter(character.id)) {
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
      ctx.db.named_enemy.id.update({ ...existingEnemy, isAlive: true, lastKilledAt: undefined });
      foundNamedEnemy = true;
      namedEnemyId = existingEnemy.id;
      break;
    }

    // No existing enemy — roll to discover
    if (enemyRoll < 20n) {
      const newEnemy = ctx.db.named_enemy.insert({
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
  ctx.db.search_result.insert({
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

  // Clean up old personal resource nodes for this character at this location
  for (const node of ctx.db.resource_node.by_character.filter(character.id)) {
    if (node.locationId === locationId) {
      ctx.db.resource_node.id.delete(node.id);
    }
  }
}
