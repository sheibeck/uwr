import { Corpse, CorpseItem, Location } from '../schema/tables';
import { appendPrivateEvent } from './events';

const CORPSE_DECAY_MICROS = 30n * 24n * 60n * 60n * 1_000_000n; // 30 days

/**
 * Create a corpse for a dead character (level 5+).
 * Only inventory items (not equipped) are transferred to the corpse.
 * If a corpse already exists at the same location, reuse it and update timestamp.
 */
export function createCorpse(ctx: any, character: any): typeof Corpse.rowType | null {
  // Level gating: only level 5+ characters create corpses
  if (character.level < 5n) return null;

  // Check for existing corpse at the same location
  const existingCorpses = [...ctx.db.corpse.by_character.filter(character.id)];
  const existingAtLocation = existingCorpses.find(c => c.locationId === character.locationId);

  let corpse: typeof Corpse.rowType;

  if (existingAtLocation) {
    // Reuse existing corpse at this location, update timestamp
    corpse = ctx.db.corpse.id.update({
      ...existingAtLocation,
      createdAt: ctx.timestamp,
    });
  } else {
    // Create new corpse at death location
    corpse = ctx.db.corpse.insert({
      id: 0n,
      characterId: character.id,
      locationId: character.locationId,
      createdAt: ctx.timestamp,
    });
  }

  // Transfer inventory items (not equipped) to corpse
  const inventoryItems = [...ctx.db.itemInstance.by_owner.filter(character.id)]
    .filter(item => !item.equippedSlot);

  // Get existing items in this corpse to avoid duplicates
  const existingCorpseItems = new Set(
    [...ctx.db.corpseItem.by_corpse.filter(corpse.id)]
      .map(ci => ci.itemInstanceId)
  );

  let transferredCount = 0;
  for (const item of inventoryItems) {
    // Skip if already in this corpse
    if (existingCorpseItems.has(item.id)) continue;

    ctx.db.corpseItem.insert({
      id: 0n,
      corpseId: corpse.id,
      itemInstanceId: item.id,
    });

    // Transfer ownership away from character (0n sentinel = on corpse, no owner)
    ctx.db.itemInstance.id.update({ ...item, ownerCharacterId: 0n });
    transferredCount++;
  }

  // Log a narrative message about the corpse and belongings
  const location = ctx.db.location.id.find(character.locationId);
  const locationName = location?.name ?? 'an unknown place';

  if (transferredCount > 0) {
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `Your body crumbles to the ground at ${locationName}. Your belongings remain with your corpse — return to claim them before thirty days pass, or they will be lost to decay.`
    );
  } else {
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `Your body falls at ${locationName}, but you carried nothing of value.`
    );
  }

  return corpse;
}

/**
 * Clean up corpses older than 30 days.
 * Items in decayed corpses are permanently lost.
 */
export function cleanupDecayedCorpses(ctx: any) {
  const nowMicros = ctx.timestamp.microsSinceUnixEpoch;

  for (const corpse of ctx.db.corpse.iter()) {
    const age = nowMicros - corpse.createdAt.microsSinceUnixEpoch;

    if (age > CORPSE_DECAY_MICROS) {
      // Decay this corpse
      decayCorpse(ctx, corpse);
    }
  }
}

/**
 * Decay a single corpse: delete all items and the corpse itself.
 * Used for 30-day decay (items are permanently lost).
 */
export function decayCorpse(ctx: any, corpse: typeof Corpse.rowType) {
  const character = ctx.db.character.id.find(corpse.characterId);
  const location = ctx.db.location.id.find(corpse.locationId);
  const locationName = location?.name ?? 'unknown';

  // Delete all CorpseItem rows and their ItemInstance rows
  for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(corpse.id)) {
    // Delete the ItemInstance (permanent loss)
    ctx.db.itemInstance.id.delete(corpseItem.itemInstanceId);
    // Delete the CorpseItem row
    ctx.db.corpseItem.id.delete(corpseItem.id);
  }

  // Delete the Corpse row
  ctx.db.corpse.id.delete(corpse.id);

  // Log decay message to corpse owner if they exist
  if (character) {
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'system',
      `Your corpse at ${locationName} has decayed. Items lost.`
    );
  }
}

/**
 * Remove a corpse if it's empty (no items remaining).
 * Returns true if corpse was deleted, false if items remain.
 */
export function removeCorpseIfEmpty(ctx: any, corpseId: bigint): boolean {
  const corpseItems = [...ctx.db.corpseItem.by_corpse.filter(corpseId)];

  if (corpseItems.length === 0) {
    ctx.db.corpse.id.delete(corpseId);
    return true;
  }

  return false;
}

/**
 * Execute resurrection: teleport target to corpse location and restore 50% HP/mana.
 * Corpse remains (player must loot it separately).
 */
export function executeResurrect(ctx: any, caster: any, target: any, corpse: any) {
  const location = ctx.db.location.id.find(corpse.locationId);
  const locationName = location?.name ?? 'unknown';

  // Teleport target to corpse location
  const updatedTarget = ctx.db.character.id.update({
    ...target,
    locationId: corpse.locationId,
    hp: target.maxHp / 2n,
    mana: target.maxMana / 2n,
  });

  appendPrivateEvent(
    ctx,
    target.id,
    target.ownerUserId,
    'system',
    `${caster.name} has resurrected you at ${locationName}!`
  );

  appendPrivateEvent(
    ctx,
    caster.id,
    caster.ownerUserId,
    'system',
    `You have resurrected ${target.name}.`
  );

  // Location event at corpse location
  const targetLocation = ctx.db.location.id.find(corpse.locationId);
  if (targetLocation) {
    // appendLocationEvent helper - need to import this
    // For now, skip location event or add inline
    // appendLocationEvent(ctx, corpse.locationId, 'system', `${target.name} has been resurrected.`);
  }
}

/**
 * Execute corpse summon: merge all target corpses into one at caster's location.
 */
export function executeCorpseSummon(ctx: any, caster: any, target: any) {
  // Find ALL corpses belonging to target
  const allCorpses = [...ctx.db.corpse.by_character.filter(target.id)];

  if (allCorpses.length === 0) {
    // Safety check - shouldn't happen due to validation
    return;
  }

  // Use the first corpse as the surviving corpse
  const survivingCorpse = allCorpses[0];

  // Update the surviving corpse to caster's location and refresh timestamp
  ctx.db.corpse.id.update({
    ...survivingCorpse,
    locationId: caster.locationId,
    createdAt: ctx.timestamp,
  });

  // Transfer items from all other corpses to the surviving corpse
  for (let i = 1; i < allCorpses.length; i++) {
    const oldCorpse = allCorpses[i];

    // Transfer all CorpseItem rows to surviving corpse
    for (const corpseItem of ctx.db.corpseItem.by_corpse.filter(oldCorpse.id)) {
      ctx.db.corpseItem.id.update({
        ...corpseItem,
        corpseId: survivingCorpse.id,
      });
    }

    // Delete the old corpse
    ctx.db.corpse.id.delete(oldCorpse.id);
  }

  const location = ctx.db.location.id.find(caster.locationId);
  const locationName = location?.name ?? 'unknown';

  appendPrivateEvent(
    ctx,
    target.id,
    target.ownerUserId,
    'system',
    `Your corpses have been summoned to ${locationName}.`
  );

  appendPrivateEvent(
    ctx,
    caster.id,
    caster.ownerUserId,
    'system',
    `You have summoned ${target.name}'s corpses.`
  );
}
