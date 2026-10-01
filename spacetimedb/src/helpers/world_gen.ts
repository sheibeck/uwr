// World generation helpers: build region context and write generated content into game tables

import { connectLocations, ensureSpawnsForLocation } from './location';
import type { WorldGenInput } from '../data/llm_layers';
import { appendCreationEvent, appendPrivateEvent } from './events';
import { enqueueLlmJob, llmRefusalMessage, LLM_RESTING_LINE, SOURCE_KEYS } from './llm_queue';
import { isRestingErrorCode } from './llm_status';
import { archetypeForCharacter, archetypeForPlayer, encodeRouteInput } from './llm_inputs';
import { resolveNpcGender, npcGender, npcNoticeLine } from '../data/npc_gender';
import type { NpcGender } from '../data/npc_gender';

// ---------------------------------------------------------------------------
// Relocated from data/world_gen.ts -- these are active generation functions
// ---------------------------------------------------------------------------

export const RIPPLE_TEMPLATES = [
  'A new land has been remembered beyond {sourceRegion}... the air carries hints of {biomeHint}.',
  'The edges of reality ripple. Something ancient stirs beyond {sourceRegion}.',
  'The world grows. A {biomeHint} presence makes itself known past {sourceRegion}.',
  'Reality exhales. Beyond {sourceRegion}, {biomeHint} terrain has always been there. You simply failed to notice.',
  'The map trembles at its borders. {sourceRegion} is no longer the edge of things.',
];

export const DISCOVERY_TEMPLATES = [
  'You have wandered beyond the edge of the known world. The Keeper of Knowledge pauses, then remembers... {regionName}.',
  'The mists part. You are the first to remember {regionName}. The Keeper notes this with something almost like interest.',
  'You step into {regionName}. It has always been here. You were simply the first to notice.',
];

export const BIOME_HINTS: Record<string, string[]> = {
  volcanic: ['scorched', 'ember-touched', 'ashen'],
  forest: ['verdant', 'ancient woodland', 'deep-rooted'],
  tundra: ['frost-bitten', 'ice-shrouded', 'crystalline'],
  desert: ['sun-scorched', 'sand-swept', 'arid'],
  swamp: ['mire-cloaked', 'fetid', 'bog-born'],
  mountains: ['stone-crowned', 'peaks of', 'windswept heights'],
  plains: ['wind-swept', 'open expanse', 'grassland'],
  coastal: ['salt-touched', 'tide-worn', 'sea-bitten'],
  cavern: ['subterranean', 'deep-dwelling', 'darkness-steeped'],
  ruins: ['crumbling', 'time-ravaged', 'forgotten'],
};

/**
 * Pick a ripple announcement message using deterministic timestamp-based selection.
 * Called from reducers -- no Math.random allowed.
 */
export function pickRippleMessage(
  sourceRegionName: string,
  biome: string,
  timestampMicros: bigint
): string {
  const template = RIPPLE_TEMPLATES[Number(timestampMicros % BigInt(RIPPLE_TEMPLATES.length))];
  const hints = BIOME_HINTS[biome] ?? BIOME_HINTS['plains'];
  const hint = hints[Number(timestampMicros % BigInt(hints.length))];
  return template
    .replace('{sourceRegion}', sourceRegionName)
    .replace('{biomeHint}', hint);
}

/**
 * Pick a personal discovery narrative using deterministic timestamp-based selection.
 * Called from reducers -- no Math.random allowed.
 */
export function pickDiscoveryMessage(
  regionName: string,
  timestampMicros: bigint
): string {
  const template = DISCOVERY_TEMPLATES[Number(timestampMicros % BigInt(DISCOVERY_TEMPLATES.length))];
  return template.replace('{regionName}', regionName);
}

/**
 * Compute danger multiplier for a newly generated region.
 * Increases by 50-100 from source region's danger, caps at 800.
 * Uses timestamp-derived pseudorandom for determinism in reducers.
 * When isStarter=true, returns exactly 100n to ensure level 1 enemies.
 */
export function computeRegionDanger(
  sourceRegionDanger: bigint,
  timestampMicros: bigint,
  isStarter: boolean = false
): bigint {
  if (isStarter) return 100n;
  const increase = Number(timestampMicros % 51n) + 50;
  const newDanger = Number(sourceRegionDanger) + increase;
  return BigInt(Math.min(newDanger, 800));
}

// ---------------------------------------------------------------------------
// End relocated functions
// ---------------------------------------------------------------------------

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

export type WorldGenStartOutcome = 'reused' | 'enqueued' | 'duplicate' | 'refused';

/** The in-voice reason stored on a refused state. world_gen_state is public: no budget or provider detail. */
const WORLD_GEN_REFUSED_MESSAGE = 'The Keeper strains but cannot shape this realm right now.';

/**
 * Start generation for a freshly inserted (PENDING) world_gen_state, in the caller's
 * transaction (Phase 41, plan 14, PIPE-01):
 *  - a starter state (sourceRegionId 0n) reuses an existing starter region for the character's
 *    race at no cost ('reused');
 *  - otherwise one world_gen job and its dispatch are enqueued and the state becomes GENERATING
 *    ('enqueued', or 'duplicate' when a job for this state is already active);
 *  - a refused enqueue (budget or per-player cap) puts the state in ERROR with an in-voice
 *    message and tells the player to [explore] again later ('refused').
 * World generation never retries itself: only the player's explore starts a new job.
 */
export function startWorldGeneration(ctx: any, genState: any): WorldGenStartOutcome {
  const character = ctx.db.character.id.find(genState.characterId);

  if (genState.sourceRegionId === 0n && character && reuseStarterRegion(ctx, genState, character)) {
    return 'reused';
  }

  const sourceRegion = ctx.db.region.id.find(genState.sourceRegionId);
  const input: WorldGenInput = {
    worldContext: '',
    characterRace: character?.race ?? 'Unknown',
    characterClass: character?.className ?? 'Unknown',
    characterArchetype: character
      ? archetypeForCharacter(ctx, character, genState.playerId)
      : archetypeForPlayer(ctx, genState.playerId),
    sourceRegionName: sourceRegion?.name ?? 'the known world',
    neighborRegions: buildRegionContext(ctx, genState.sourceRegionId),
  };

  const result = enqueueLlmJob(ctx, {
    route: 'world_gen',
    playerId: genState.playerId,
    characterId: genState.characterId,
    sourceKey: SOURCE_KEYS.worldGen(genState.id),
    request: { genStateId: genState.id.toString(), input: encodeRouteInput(input) },
  });

  const current = ctx.db.world_gen_state.id.find(genState.id) ?? genState;

  if (result.refused) {
    // The kill switch or the global ceiling: the one shared resting line. Any other refusal keeps the old message.
    const resting = isRestingErrorCode(result.refused);
    const message = resting ? LLM_RESTING_LINE : WORLD_GEN_REFUSED_MESSAGE;
    ctx.db.world_gen_state.id.update({
      ...current,
      step: 'ERROR',
      errorMessage: message,
      updatedAt: ctx.timestamp,
    });
    const line = resting ? `${message} Type [explore] to try again.` : `${message} Type [explore] to try again later.`;
    if (character && character.locationId !== 0n) {
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', line);
    } else {
      appendCreationEvent(ctx, genState.playerId, 'creation_error', line);
    }
    return 'refused';
  }

  ctx.db.world_gen_state.id.update({ ...current, step: 'GENERATING', updatedAt: ctx.timestamp });
  return result.created ? 'enqueued' : 'duplicate';
}

/**
 * What a first-region retry did:
 *  - 'busy':    a starter state for the character is still PENDING or GENERATING (nothing written);
 *  - 'none':    the character has no starter state, or one that is not ERROR (nothing written);
 *  - 'started': a fresh starter state was created and its world_gen job enqueued;
 *  - 'reused':  a fresh starter state reused an existing starter region (no call);
 *  - 'refused': the enqueue was refused; the fresh state is ERROR and the refusal line is posted.
 */
export type StarterRetryOutcome = 'busy' | 'none' | 'started' | 'reused' | 'refused';

/** The in-voice lines for a first-region retry (shared by the explore intent and the creation console). */
export const STARTER_RETRY_MESSAGES = Object.freeze({
  busy: 'The world is already taking shape around you. Patience.',
  none: 'There is nothing uncharted to explore here.',
  started: 'The edges of reality ripple around you. The world pauses, as if remembering something it had forgotten...',
});

/**
 * The first-region retry for a character still at location 0 (its starter world gen failed).
 * Starter states are found by CHARACTER, not by the connecting identity, so a player on a
 * second device (another identity of the same user) can retry too. The fresh state belongs to
 * `playerId`, the identity asking, so the job's messages reach the device that asked.
 * Writes nothing for 'busy' and 'none'.
 */
export function retryStarterWorldGen(ctx: any, character: any, playerId: any): StarterRetryOutcome {
  // world_gen_state has no characterId index; the table is small and this path is rare.
  const starters = [...ctx.db.world_gen_state.iter()].filter(
    (s: any) => s.characterId === character.id && s.sourceRegionId === 0n,
  );
  if (starters.some((s: any) => s.step === 'PENDING' || s.step === 'GENERATING')) return 'busy';
  if (starters.length === 0 || starters.some((s: any) => s.step !== 'ERROR')) return 'none';

  const fresh = ctx.db.world_gen_state.insert({
    id: 0n,
    playerId,
    characterId: character.id,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'PENDING',
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  const started = startWorldGeneration(ctx, fresh);
  return started === 'enqueued' || started === 'duplicate' ? 'started' : started;
}

/**
 * The starter-region reuse branch: when another character of the same race already generated a
 * starter region, place this character in its home location and complete the state with no
 * model call. Returns true when the character was placed.
 */
function reuseStarterRegion(ctx: any, genState: any, character: any): boolean {
  const raceLower = (character.race || '').toLowerCase();
  if (!raceLower) return false;

  let existingStarterRegion: any = null;
  for (const region of ctx.db.region.iter()) {
    if (region.starterForRace && region.starterForRace.toLowerCase() === raceLower) {
      existingStarterRegion = region;
      break;
    }
  }
  if (!existingStarterRegion) return false;

  // Home location: first safe, charted location; else any charted location.
  let homeLocation: any = null;
  for (const loc of ctx.db.location.iter()) {
    if (loc.regionId === existingStarterRegion.id && loc.isSafe && loc.terrainType !== 'uncharted') {
      homeLocation = loc;
      break;
    }
  }
  if (!homeLocation) {
    for (const loc of ctx.db.location.iter()) {
      if (loc.regionId === existingStarterRegion.id && loc.terrainType !== 'uncharted') {
        homeLocation = loc;
        break;
      }
    }
  }
  if (!homeLocation) return false;

  ctx.db.character.id.update({
    ...ctx.db.character.id.find(character.id),
    locationId: homeLocation.id,
    boundLocationId: homeLocation.id,
  });
  ensureSpawnsForLocation(ctx, homeLocation.id);

  ctx.db.world_gen_state.id.update({
    ...genState,
    step: 'COMPLETE',
    generatedRegionId: existingStarterRegion.id,
    updatedAt: ctx.timestamp,
  });

  const locationNpcs: { name: string; gender: NpcGender }[] = [];
  for (const npc of ctx.db.npc.by_location.filter(homeLocation.id)) {
    locationNpcs.push({ name: npc.name, gender: npcGender(npc) });
  }
  let arrivalMsg = `You open your eyes in ${homeLocation.name}, ${existingStarterRegion.name}.`;
  if (locationNpcs.length > 0) {
    arrivalMsg += '\n\n' + npcNoticeLine(locationNpcs);
  }
  arrivalMsg += `\n\nTry [look] to examine your surroundings, or [travel] to move.`;
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'narrative', arrivalMsg);
  return true;
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
 * Optional starterRace: when provided, marks the region as the starter for that race.
 */
export function writeGeneratedRegion(tx: any, parsed: any, genState: any, starterRace?: string): any {
  // 1. Compute danger multiplier from source region
  const isStarter = genState.sourceRegionId === 0n;
  const sourceRegion = tx.db.region.id.find(genState.sourceRegionId);
  const sourceRegionDanger = sourceRegion?.dangerMultiplier ?? 100n;
  const dangerMultiplier = computeRegionDanger(
    sourceRegionDanger,
    tx.timestamp.microsSinceUnixEpoch,
    isStarter
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
    starterForRace: starterRace ?? undefined,
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
    // In starter regions (baseLevel=1), force all enemies to exactly level 1
    const baseLevel = dangerMultiplier / 100n;
    const minLevel = baseLevel <= 1n ? 1n : baseLevel - 1n;
    const maxLevel = baseLevel <= 1n ? 1n : baseLevel + 1n;
    let level = BigInt(enemy.level || 1);
    if (level < minLevel) level = minLevel;
    if (level > maxLevel) level = maxLevel;
    const maxHp = level * 12n + 20n;
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
      armorClass: level * 2n + 2n,
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

    const storedName = npc.name || 'Unknown NPC';
    const storedDescription = npc.description || 'A mysterious figure.';
    const storedGreeting = npc.greeting || 'Greetings, traveler.';
    tx.db.npc.insert({
      id: 0n,
      name: storedName,
      npcType: npc.npcType || 'lore',
      locationId: npcLocation.id,
      description: storedDescription,
      greeting: storedGreeting,
      gender: resolveNpcGender(npc.gender, storedName, storedDescription + ' ' + storedGreeting),
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
        gender: resolveNpcGender(undefined, 'The Reluctant Merchant'),
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
        gender: resolveNpcGender(undefined, 'The Ledger Keeper'),
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
