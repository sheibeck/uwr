// World generation helpers: build region context and write generated content into game tables

import { connectLocations } from './location';
import { computeRegionDanger } from '../data/world_gen';

/**
 * Build neighbor region context for LLM prompt injection.
 * Finds regions connected to sourceRegionId by traversing location connections.
 */
export function buildRegionContext(
  ctx: any,
  sourceRegionId: bigint
): { name: string; biome: string; threats: string }[] {
  const neighborRegionIds = new Set<bigint>();
  const results: { name: string; biome: string; threats: string }[] = [];

  // Find all locations in the source region
  for (const loc of ctx.db.location.iter()) {
    if (loc.regionId !== sourceRegionId) continue;

    // Find connections FROM this location
    for (const conn of ctx.db.location_connection.by_from.filter(loc.id)) {
      const targetLoc = ctx.db.location.id.find(conn.toLocationId);
      if (targetLoc && targetLoc.regionId !== sourceRegionId) {
        neighborRegionIds.add(targetLoc.regionId);
      }
    }

    // Find connections TO this location (reverse)
    for (const conn of ctx.db.location_connection.by_to.filter(loc.id)) {
      const fromLoc = ctx.db.location.id.find(conn.fromLocationId);
      if (fromLoc && fromLoc.regionId !== sourceRegionId) {
        neighborRegionIds.add(fromLoc.regionId);
      }
    }
  }

  // Build result array from discovered neighbor regions
  for (const regionId of neighborRegionIds) {
    const region = ctx.db.region.id.find(regionId);
    if (!region) continue;
    results.push({
      name: region.name,
      biome: region.biome ?? 'unknown',
      threats: region.threats ?? 'various',
    });
  }

  return results;
}

/**
 * Find the "home" location for a generated region — the first safe, non-uncharted location.
 * This is the location that gets bindStone, crafting, and required NPCs.
 * Falls back to first non-uncharted location if no safe locations exist.
 */
export function findHomeLocation(locationsByName: Record<string, any>): any | null {
  const locationNames = Object.keys(locationsByName);
  // First pass: safe + non-uncharted
  for (const name of locationNames) {
    const loc = locationsByName[name];
    if (loc.isSafe && loc.terrainType !== 'uncharted') return loc;
  }
  // Fallback: any non-uncharted
  for (const name of locationNames) {
    const loc = locationsByName[name];
    if (loc.terrainType !== 'uncharted') return loc;
  }
  return null;
}

/**
 * Write all generated region content into game tables.
 * Takes parsed LLM JSON and the WorldGenState row, returns the inserted Region row.
 */
export function writeGeneratedRegion(tx: any, parsed: any, genState: any): any {
  // 1. Compute danger multiplier from source region
  const sourceRegion = tx.db.region.id.find(genState.sourceRegionId);
  const sourceRegionDanger = sourceRegion?.dangerMultiplier ?? 100n;
  const dangerMultiplier = computeRegionDanger(
    sourceRegionDanger,
    tx.timestamp.microsSinceUnixEpoch
  );

  // 2. Insert Region with canonical facts
  const region = tx.db.region.insert({
    id: 0n,
    name: parsed.regionName || 'Unknown Region',
    dangerMultiplier,
    regionType: 'generated',
    biome: parsed.biome || 'plains',
    dominantFaction: parsed.dominantFaction || undefined,
    landmarks: parsed.landmarks ? JSON.stringify(parsed.landmarks) : undefined,
    threats: parsed.threats ? JSON.stringify(parsed.threats) : undefined,
    generatedByCharacterId: genState.characterId,
    isGenerated: true,
  });

  // 3. Insert Locations (3-5), each with its own unique description
  const locationsByName: Record<string, any> = {};
  const locations = parsed.locations || [];
  const regionDescription = parsed.regionDescription || `A ${parsed.biome || 'mysterious'} region.`;

  let firstSafeSet = false;
  for (const loc of locations) {
    const isSafe = loc.isSafe === true;
    const locationDescription = loc.description || regionDescription;
    const inserted = tx.db.location.insert({
      id: 0n,
      name: loc.name || 'Unknown Location',
      description: locationDescription,
      zone: parsed.regionName || 'Generated',
      regionId: region.id,
      levelOffset: BigInt(loc.levelOffset || 0),
      isSafe,
      terrainType: loc.terrainType || 'plains',
      bindStone: isSafe && !firstSafeSet,    // First safe location gets a bind stone
      craftingAvailable: isSafe && !firstSafeSet, // and crafting
    });
    if (isSafe && !firstSafeSet) firstSafeSet = true;
    locationsByName[loc.name] = inserted;
  }

  // 4. Connect locations within region per connectsTo arrays
  for (const loc of locations) {
    const fromLocation = locationsByName[loc.name];
    if (!fromLocation || !loc.connectsTo) continue;
    for (const targetName of loc.connectsTo) {
      const toLocation = locationsByName[targetName];
      if (toLocation && fromLocation.id !== toLocation.id) {
        // Only connect if not already connected (connectLocations creates bidirectional)
        let alreadyConnected = false;
        for (const conn of tx.db.location_connection.by_from.filter(fromLocation.id)) {
          if (conn.toLocationId === toLocation.id) {
            alreadyConnected = true;
            break;
          }
        }
        if (!alreadyConnected) {
          connectLocations(tx, fromLocation.id, toLocation.id);
        }
      }
    }
  }

  // 5. Connect the new region's first location to the source location (if not first region)
  const locationNames = Object.keys(locationsByName);
  if (locationNames.length > 0 && genState.sourceLocationId !== 0n) {
    const firstLocation = locationsByName[locationNames[0]];
    connectLocations(tx, firstLocation.id, genState.sourceLocationId);
  }

  // 6. Insert EnemyTemplates with role templates and abilities
  const enemies = parsed.enemies || [];
  const enemyTemplateRows: any[] = [];
  for (const enemy of enemies) {
    // Clamp enemy level to region danger range: baseLevel ± 1
    const baseLevel = dangerMultiplier / 100n;
    const minLevel = baseLevel > 1n ? baseLevel - 1n : 1n;
    const maxLevel = baseLevel + 1n > 1n ? baseLevel + 1n : 2n;
    let level = BigInt(enemy.level || 1);
    if (level < minLevel) level = minLevel;
    if (level > maxLevel) level = maxLevel;
    const maxHp = level * 25n + 50n;
    const baseDamage = level * 3n + 5n;
    const xpReward = level * 15n + 10n;
    const role = enemy.role || 'melee';

    const enemyRow = tx.db.enemy_template.insert({
      id: 0n,
      name: enemy.name || 'Unknown Creature',
      role,
      roleDetail: role,
      abilityProfile: role,
      terrainTypes: enemy.terrainTypes || 'plains',
      creatureType: enemy.creatureType || 'beast',
      timeOfDay: 'any',
      socialGroup: enemy.name || 'generated',
      socialRadius: 0n,
      awareness: 'normal',
      groupMin: BigInt(enemy.groupMin || 1),
      groupMax: BigInt(enemy.groupMax || 3),
      armorClass: level * 2n + 5n,
      level,
      maxHp,
      baseDamage,
      xpReward,
    });
    enemyTemplateRows.push(enemyRow);

    // Insert EnemyRoleTemplate (required for spawn system)
    tx.db.enemy_role_template.insert({
      id: 0n,
      enemyTemplateId: enemyRow.id,
      roleKey: role,
      displayName: enemy.name || 'Unknown',
      role,
      roleDetail: role,
      abilityProfile: role,
    });

    // Insert EnemyAbility (basic attack matching role)
    const abilityMap: Record<string, { key: string; name: string; kind: string }> = {
      melee: { key: 'slash', name: 'Slash', kind: 'damage' },
      ranged: { key: 'shoot', name: 'Shoot', kind: 'damage' },
      caster: { key: 'bolt', name: 'Bolt', kind: 'damage' },
    };
    const ability = abilityMap[role] || abilityMap['melee'];
    tx.db.enemy_ability.insert({
      id: 0n,
      enemyTemplateId: enemyRow.id,
      abilityKey: ability.key,
      name: ability.name,
      kind: ability.kind,
      castSeconds: role === 'caster' ? 2n : 0n,
      cooldownSeconds: 6n,
      targetRule: 'single_enemy',
    });
  }

  // 7. Insert LocationEnemyTemplate rows linking enemies to non-safe locations
  const nonSafeLocations = locationNames
    .map(n => locationsByName[n])
    .filter(loc => !loc.isSafe);

  for (const enemyRow of enemyTemplateRows) {
    for (const loc of nonSafeLocations) {
      tx.db.location_enemy_template.insert({
        id: 0n,
        locationId: loc.id,
        enemyTemplateId: enemyRow.id,
      });
    }
  }

  // 8. Insert NPCs at safe locations (or first location if none are safe)
  const npcs = parsed.npcs || [];
  for (const npc of npcs) {
    let npcLocation = locationsByName[npc.locationName];
    if (!npcLocation) {
      // Fall back to first safe location, or first location overall
      const safeLocations = locationNames.map(n => locationsByName[n]).filter(l => l.isSafe);
      npcLocation = safeLocations[0] || (locationNames.length > 0 ? locationsByName[locationNames[0]] : null);
    }
    if (!npcLocation) continue;

    tx.db.npc.insert({
      id: 0n,
      name: npc.name || 'Unknown NPC',
      npcType: npc.npcType || 'lore',
      locationId: npcLocation.id,
      description: npc.description || 'A mysterious figure.',
      greeting: npc.greeting || 'Greetings, traveler.',
      personalityJson: npc.personality ? JSON.stringify(npc.personality) : JSON.stringify({
        traits: ['reserved'],
        speechPattern: 'speaks plainly',
        knowledgeDomains: ['local area'],
        secrets: [],
        affinityMultiplier: 1.0,
      }),
    });
  }

  // 8b. Ensure home location has vendor + banker NPCs (safety net for LLM omissions)
  const homeLocation = findHomeLocation(locationsByName);
  if (homeLocation) {
    const npcsAtHome = [...tx.db.npc.by_location.filter(homeLocation.id)];
    const hasVendor = npcsAtHome.some((n: any) => n.npcType === 'vendor');
    const hasBanker = npcsAtHome.some((n: any) => n.npcType === 'banker');

    if (!hasVendor) {
      tx.db.npc.insert({
        id: 0n,
        name: 'The Reluctant Merchant',
        npcType: 'vendor',
        locationId: homeLocation.id,
        description: 'A merchant who seems mildly annoyed by the concept of commerce.',
        greeting: 'Fine. I suppose you want to buy something. Let us get this over with.',
        personalityJson: JSON.stringify({ traits: ['reluctant', 'sardonic'], speechPattern: 'speaks with weary resignation', knowledgeDomains: ['trade goods'], secrets: [], affinityMultiplier: 1.0 }),
      });
    }

    if (!hasBanker) {
      tx.db.npc.insert({
        id: 0n,
        name: 'The Ledger Keeper',
        npcType: 'banker',
        locationId: homeLocation.id,
        description: 'A meticulous figure who guards your valuables with obsessive precision.',
        greeting: 'Your assets are safe. They are always safe. I do not make mistakes.',
        personalityJson: JSON.stringify({ traits: ['meticulous', 'protective'], speechPattern: 'speaks in clipped precise sentences', knowledgeDomains: ['banking', 'valuables'], secrets: [], affinityMultiplier: 1.0 }),
      });
    }
  }

  // 9. Seed 1 uncharted boundary location at the edge of the new region
  const lastNonSafe = nonSafeLocations[nonSafeLocations.length - 1];
  const boundaryAnchor = lastNonSafe || (locationNames.length > 0 ? locationsByName[locationNames[locationNames.length - 1]] : null);
  if (boundaryAnchor) {
    const boundary = tx.db.location.insert({
      id: 0n,
      name: `The Edge Beyond ${parsed.regionName || 'the Region'}`,
      description: 'The mists thicken here. Reality seems uncertain, as though the world has not yet decided what lies beyond.',
      zone: 'Uncharted',
      regionId: region.id,
      levelOffset: 0n,
      isSafe: true,
      terrainType: 'uncharted',
      bindStone: false,
      craftingAvailable: false,
    });
    connectLocations(tx, boundaryAnchor.id, boundary.id);
  }

  return region;
}
