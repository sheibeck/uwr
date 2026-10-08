// World generation helpers: build region context and write generated content into game tables.
//
// World generation runs in two jobs (Phase 43, LAT-03). world_gen_state.step is a plain string:
//   PENDING     inserted by a trigger, not yet started
//   GENERATING  stage 1 (route world_gen_start) is running: region, start location, first NPC
//   FILLING     stage 1 landed and stage 2 (route world_gen) is running: the rest of the region
//   COMPLETE    stage 2 landed
//   FILL_ERROR  stage 2 failed or was refused; the stage-1 region stays playable (the start
//               location has its vendor and banker) and only the player's [explore] starts a
//               new fill job, so no automatic retry loop exists
//   ERROR       stage 1 failed or was refused; nothing was written
// world_gen_state is public: errorMessage only ever holds a fixed in-voice line.

import { connectLocations, ensureSpawnsForLocation } from './location';
import { markLocationVisited } from './visited';
import type { WorldGenInput, WorldFillInput } from '../data/llm_layers';
import { appendCreationEvent, appendPrivateEvent } from './events';
import { keeperFallback, flattenSegments } from './segments';
import { enqueueLlmJob, llmRefusalMessage, LLM_RESTING_LINE, SOURCE_KEYS } from './llm_queue';
import { isRestingErrorCode } from './llm_status';
import { archetypeForCharacter, archetypeForPlayer, encodeRouteInput } from './llm_inputs';
import { resolveNpcGender, npcGender, npcNoticeLine } from '../data/npc_gender';
import type { NpcGender } from '../data/npc_gender';
import { toBigIntSafe } from './safe_numbers';
import { enemyStatsForLevel } from '../data/enemy_rules';

// ---------------------------------------------------------------------------
// Relocated from data/world_gen.ts -- these are active generation functions
// ---------------------------------------------------------------------------

export const WORLD_EVENT_TEMPLATES = [
  'A new land has been remembered beyond {sourceRegion}... the air carries hints of {biomeHint}.',
  'The edges of reality waver. Something ancient stirs beyond {sourceRegion}.',
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
 * Pick a World event announcement message using deterministic timestamp-based selection.
 * Called from reducers -- no Math.random allowed.
 */
export function pickWorldEventMessage(
  sourceRegionName: string,
  biome: string,
  timestampMicros: bigint
): string {
  const template = WORLD_EVENT_TEMPLATES[Number(timestampMicros % BigInt(WORLD_EVENT_TEMPLATES.length))];
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
 *  - otherwise one world_gen_start job (stage 1) and its dispatch are enqueued and the state becomes
 *    GENERATING ('enqueued', or 'duplicate' when a job for this state is already active); the
 *    stage-1 apply enqueues the world_gen fill (stage 2);
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
    route: 'world_gen_start',
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
      const lineSegments = keeperFallback(line);
      appendCreationEvent(ctx, genState.playerId, 'creation_error', flattenSegments(lineSegments), lineSegments);
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
  started: 'The edges of reality shimmer around you. The world pauses, as if remembering something it had forgotten...',
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

/** Next step for someone standing in a region whose second half is still being generated (review WR-B02). */
export const REGION_FILL_PENDING_HINT =
  'The Keeper is still remembering the roads out of here. Try [travel] again in a moment.';
/** Next step for someone standing in a region whose second half failed (review WR-B02). The Keeper is he. */
export const REGION_FILL_FAILED_HINT =
  'The Keeper never finished remembering the roads out of here. Type [explore] and he will try again.';

/**
 * The next step for a character in a region whose stage-2 fill has not landed (review WR-B02): a FILLING
 * state asks for a moment, a FILL_ERROR state names [explore] (retryWorldFill matches it by region).
 * null when no state for the region is FILLING or FILL_ERROR. world_gen_state has no region index; the
 * table is small and the callers (arrival in a reused starter region, travel with no exits) are rare.
 */
export function regionFillHint(tx: any, regionId: bigint): string | null {
  let filling = false;
  let failed = false;
  for (const s of tx.db.world_gen_state.iter()) {
    if (s.generatedRegionId === undefined || s.generatedRegionId === null || s.generatedRegionId !== regionId) continue;
    if (s.step === 'FILLING') filling = true;
    else if (s.step === 'FILL_ERROR') failed = true;
  }
  if (filling) return REGION_FILL_PENDING_HINT;
  if (failed) return REGION_FILL_FAILED_HINT;
  return null;
}

/**
 * The line for a location with no way out (travel with no exits): "nowhere to go", plus the region-fill
 * next step when the region's second half is missing, so the player is never left without one.
 */
export function nowhereToGoLine(tx: any, locationId: bigint): string {
  const here = tx.db.location.id.find(locationId);
  const hint = here ? regionFillHint(tx, here.regionId) : null;
  return hint ? `There is nowhere to go from here yet. ${hint}` : 'There is nowhere to go from here.';
}

/**
 * The starter-region reuse branch: when another character of the same race already generated a
 * starter region, place this character in its home location and complete the state with no
 * model call. Returns true when the character was placed. A starter region whose fill is still
 * running or failed has a home location with no exits: the arrival then names the next step
 * (wait, or [explore] to retry the fill) instead of promising [travel] (review WR-B02).
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
  // Visited places: reusing a starter region puts the character at its home place (no origin).
  markLocationVisited(ctx, character.id, homeLocation.id);
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
  const hasExits = [...ctx.db.location_connection.by_from.filter(homeLocation.id)].length > 0;
  if (hasExits) {
    arrivalMsg += `\n\nTry [look] to examine your surroundings, or [travel] to move.`;
  } else {
    const hint = regionFillHint(ctx, existingStarterRegion.id);
    arrivalMsg += `\n\nTry [look] to examine your surroundings.` + (hint ? ` ${hint}` : '');
  }
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'narrative', arrivalMsg);
  return true;
}

// ---------------------------------------------------------------------------
// Staged world generation (Phase 43, LAT-03)
// ---------------------------------------------------------------------------

/** Posted to the triggering player when stage 1 lands. The Keeper is he. */
export const WORLD_START_MILESTONE_LINE =
  'The Keeper clears his throat. This ground will do; the rest of the region is still being remembered.';
/** Stored (public) and posted when the stage-2 reply is unusable. */
export const WORLD_FILL_FAILED_MESSAGE =
  'The Keeper loses the thread of the rest of the map. What he has already shown you will hold.';
/** Stored (public) and posted when the stage-2 enqueue is refused for a reason other than resting. */
export const WORLD_FILL_REFUSED_MESSAGE =
  'The Keeper cannot finish remembering this region right now. What he has shown you will hold.';
/** Posted by the explore intent (Plan 43-11) when a fill retry starts. */
export const WORLD_FILL_RETRY_LINE = 'The Keeper squints at the half-remembered land and tries again...';

/** Posted to the triggering player when stage 2 lands. */
export function worldFillCompleteLine(regionName: string): string {
  return `The rest of ${regionName} settles into place. Try [travel] to see where the roads lead.`;
}

const lower = (v: unknown): string => String(v ?? '').trim().toLowerCase();

function isConnected(tx: any, fromId: bigint, toId: bigint): boolean {
  for (const conn of tx.db.location_connection.by_from.filter(fromId)) {
    if (conn.toLocationId === toId) return true;
  }
  return false;
}

/** Locations reachable from `startId` through connections that stay inside `allowed`. */
function reachableWithin(tx: any, startId: bigint, allowed: Set<bigint>): Set<bigint> {
  const seen = new Set<bigint>([startId]);
  const queue: bigint[] = [startId];
  while (queue.length > 0) {
    const id = queue.shift() as bigint;
    for (const conn of tx.db.location_connection.by_from.filter(id)) {
      if (allowed.has(conn.toLocationId) && !seen.has(conn.toLocationId)) {
        seen.add(conn.toLocationId);
        queue.push(conn.toLocationId);
      }
    }
  }
  return seen;
}

/**
 * Stage 1: write the region, its one safe start location (bind stone and crafting) and the first
 * NPC (when the reply has one) into the public tables. A non-starter region is connected both
 * ways to the source location. The caller records generatedRegionId and starts the fill.
 * Optional starterRace: marks the region as the starter for that race.
 */
export function writeRegionStart(
  tx: any,
  reply: any,
  genState: any,
  starterRace?: string,
): { region: any; startLocation: any; firstNpc: any | null } {
  const isStarter = genState.sourceRegionId === 0n;
  const sourceRegion = tx.db.region.id.find(genState.sourceRegionId);
  const dangerMultiplier = computeRegionDanger(
    sourceRegion?.dangerMultiplier ?? 100n,
    tx.timestamp.microsSinceUnixEpoch,
    isStarter,
  );

  const regionName = reply.regionName || 'Unknown Region';
  const region = tx.db.region.insert({
    id: 0n,
    name: regionName,
    dangerMultiplier,
    regionType: 'generated',
    biome: reply.biome || 'plains',
    generatedByCharacterId: genState.characterId,
    isGenerated: true,
    starterForRace: starterRace ?? undefined,
  });

  const regionDescription = reply.regionDescription || `A ${reply.biome || 'mysterious'} region.`;
  const start = reply.startLocation ?? {};
  const terrain = start.terrainType && start.terrainType !== 'uncharted' ? start.terrainType : 'plains';
  const startLocation = tx.db.location.insert({
    id: 0n,
    name: start.name || 'Unknown Location',
    description: start.description || regionDescription,
    zone: regionName,
    regionId: region.id,
    levelOffset: toBigIntSafe(start.levelOffset, { min: -10n, max: 10n, fallback: 0n }),
    isSafe: true,
    terrainType: terrain,
    bindStone: true,
    craftingAvailable: true,
  });

  if (genState.sourceLocationId !== 0n) {
    connectLocations(tx, startLocation.id, genState.sourceLocationId);
  }

  let firstNpc: any | null = null;
  const npc = reply.firstNpc;
  if (npc && typeof npc === 'object') {
    firstNpc = insertRegionNpc(tx, npc, startLocation.id);
  }
  return { region, startLocation, firstNpc };
}

/** One model NPC at one location. Gender always goes through resolveNpcGender. */
function insertRegionNpc(tx: any, npc: any, locationId: bigint): any {
  const storedName = npc.name || 'Unknown NPC';
  const storedDescription = npc.description || 'A mysterious figure.';
  const storedGreeting = npc.greeting || 'Greetings, traveler.';
  return tx.db.npc.insert({
    id: 0n,
    name: storedName,
    npcType: npc.npcType || 'lore',
    locationId,
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

/**
 * The vendor and banker safety net: the start location always has both, whatever the model
 * wrote (or did not write). Safe to run more than once.
 */
export function ensureRegionServices(tx: any, startLocation: any): void {
  const npcsAtHome = [...tx.db.npc.by_location.filter(startLocation.id)];
  const hasVendor = npcsAtHome.some((n: any) => n.npcType === 'vendor');
  const hasBanker = npcsAtHome.some((n: any) => n.npcType === 'banker');

  if (!hasVendor) {
    tx.db.npc.insert({
      id: 0n,
      name: 'The Reluctant Merchant',
      gender: resolveNpcGender(undefined, 'The Reluctant Merchant'),
      npcType: 'vendor',
      locationId: startLocation.id,
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
      locationId: startLocation.id,
      description: 'A meticulous figure who guards your valuables with obsessive precision.',
      greeting: 'Your assets are safe. They are always safe. I do not make mistakes.',
      personalityJson: JSON.stringify({ traits: ['meticulous', 'protective'], speechPattern: 'speaks in clipped precise sentences', knowledgeDomains: ['banking', 'valuables'], secrets: [], affinityMultiplier: 1.0 }),
    });
  }
}

/**
 * The start location of a region: its lowest-id non-uncharted location (stage 1 writes it first).
 * Iterates location (no region index); callers are rare, per-region paths.
 */
export function findRegionStart(tx: any, regionId: bigint): any | null {
  let found: any | null = null;
  for (const loc of tx.db.location.iter()) {
    if (loc.regionId !== regionId || loc.terrainType === 'uncharted') continue;
    if (found === null || loc.id < found.id) found = loc;
  }
  return found;
}

/**
 * The stage-2 input, read back from the rows stage 1 stored (never from the model reply, so
 * stage 2 sees exactly what the players see). Throws a plain Error when the region or its start
 * location is missing.
 */
export function buildWorldFillInput(tx: any, genState: any): WorldFillInput {
  const region =
    genState.generatedRegionId !== undefined && genState.generatedRegionId !== null
      ? tx.db.region.id.find(genState.generatedRegionId)
      : undefined;
  if (!region) throw new Error('World fill: the generated region is missing');
  const start = findRegionStart(tx, region.id);
  if (!start) throw new Error('World fill: the region has no start location');

  const character = tx.db.character.id.find(genState.characterId);
  const sourceRegion = tx.db.region.id.find(genState.sourceRegionId);
  const npcsPresent = [...tx.db.npc.by_location.filter(start.id)].map((n: any) => ({
    name: n.name,
    npcType: n.npcType,
    gender: npcGender(n),
  }));

  return {
    regionName: region.name,
    biome: region.biome ?? 'plains',
    startLocation: { name: start.name, description: start.description, terrainType: start.terrainType },
    npcsPresent,
    characterRace: character?.race ?? 'Unknown',
    characterClass: character?.className ?? 'Unknown',
    characterArchetype: character
      ? archetypeForCharacter(tx, character, genState.playerId)
      : archetypeForPlayer(tx, genState.playerId),
    sourceRegionName: sourceRegion?.name ?? 'the known world',
    // The start location is now connected to the source region, so the new region would otherwise list itself.
    neighborRegions: buildRegionContext(tx, genState.sourceRegionId).filter((r) => r.name !== region.name),
  };
}

/**
 * Stage 2 start, in the caller's transaction: enqueue the world_gen fill job for this state and
 * move it to FILLING. A refused enqueue (kill switch, ceiling, budget, cap) or an unreadable
 * stage 1 fails the fill instead (FILL_ERROR, stage-1 region stays playable). Nothing retries
 * itself: the only callers are the stage-1 apply and the player's explore.
 */
export function startWorldFill(tx: any, genState: any): 'enqueued' | 'duplicate' | 'refused' {
  let input: WorldFillInput;
  try {
    input = buildWorldFillInput(tx, genState);
  } catch {
    failWorldFill(tx, genState, WORLD_FILL_FAILED_MESSAGE);
    return 'refused';
  }

  const result = enqueueLlmJob(tx, {
    route: 'world_gen',
    playerId: genState.playerId,
    characterId: genState.characterId,
    sourceKey: SOURCE_KEYS.worldGen(genState.id),
    request: { genStateId: genState.id.toString(), input: encodeRouteInput(input) },
  });

  if (result.refused) {
    failWorldFill(
      tx,
      genState,
      isRestingErrorCode(result.refused) ? LLM_RESTING_LINE : WORLD_FILL_REFUSED_MESSAGE,
    );
    return 'refused';
  }

  const current = tx.db.world_gen_state.id.find(genState.id) ?? genState;
  tx.db.world_gen_state.id.update({
    ...current,
    step: 'FILLING',
    errorMessage: undefined,
    updatedAt: tx.timestamp,
  });
  return result.created ? 'enqueued' : 'duplicate';
}

/**
 * Stage 2 failed (call failure, malformed reply, refused enqueue): the state becomes FILL_ERROR
 * with the in-voice message, the start location keeps its vendor and banker, and the player gets
 * one line that names [explore]. The stage-1 rows are never touched.
 */
export function failWorldFill(tx: any, genState: any, message: string): void {
  const current = tx.db.world_gen_state.id.find(genState.id);
  if (current) {
    tx.db.world_gen_state.id.update({
      ...current,
      step: 'FILL_ERROR',
      errorMessage: message,
      updatedAt: tx.timestamp,
    });
  }

  const regionId = (current ?? genState).generatedRegionId;
  if (regionId !== undefined && regionId !== null) {
    const start = findRegionStart(tx, regionId);
    if (start) ensureRegionServices(tx, start);
  }

  const char = tx.db.character.id.find(genState.characterId);
  const line = `${message} Type [explore] to try again.`;
  if (char && char.locationId !== 0n) {
    appendPrivateEvent(tx, genState.characterId, char.ownerUserId, 'system', line);
  } else {
    // Phase 46: the Keeper-voice line is one Keeper narration segment (wording unchanged).
    const segments = keeperFallback(line);
    appendCreationEvent(tx, genState.playerId, 'creation_error', flattenSegments(segments), segments);
  }
}

/**
 * Stage 2 retry for the explore intent (Plan 43-11). A state matches the character when its
 * source location is the character's location or its generated region is the location's region.
 *  - 'busy':    a matching state is FILLING (nothing written);
 *  - 'started': a matching FILL_ERROR state was handed to the explorer and its fill re-enqueued;
 *  - 'refused': that enqueue was refused (the state is FILL_ERROR again, the refusal line posted);
 *  - 'none':    nothing matches.
 */
export function retryWorldFill(
  tx: any,
  character: any,
  playerId: any,
): 'none' | 'busy' | 'started' | 'refused' {
  if (character.locationId === 0n) return 'none';
  const here = tx.db.location.id.find(character.locationId);

  const matching = new Map<bigint, any>();
  for (const s of tx.db.world_gen_state.by_source_location.filter(character.locationId)) {
    matching.set(s.id, s);
  }
  if (here) {
    // world_gen_state has no region index; the table is small and this path is rare.
    for (const s of tx.db.world_gen_state.iter()) {
      if (s.generatedRegionId !== undefined && s.generatedRegionId === here.regionId) matching.set(s.id, s);
    }
  }
  const states = [...matching.values()];

  if (states.some((s: any) => s.step === 'FILLING')) return 'busy';
  const failed = states
    .filter((s: any) => s.step === 'FILL_ERROR')
    .sort((a: any, b: any) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))[0];
  if (!failed) return 'none';

  const handed = {
    ...failed,
    playerId,
    characterId: character.id,
    updatedAt: tx.timestamp,
  };
  tx.db.world_gen_state.id.update(handed);
  return startWorldFill(tx, handed) === 'refused' ? 'refused' : 'started';
}

/**
 * Stage 2 write: the rest of the region around the start location stage 1 wrote. Never renames or
 * duplicates stage-1 content (a location with the start location's name, or an earlier one, is
 * skipped; an NPC whose name already stands at its location is skipped). Every new location ends up
 * connected to the region, the start location keeps its vendor and banker, and an uncharted
 * boundary closes the region.
 */
export function writeRegionFill(
  tx: any,
  fill: any,
  genState: any,
  region: any,
  startLocation: any,
): { locations: any[]; boundary: any | null } {
  // 1. Canonical facts the stage-1 reply did not carry
  const current = tx.db.region.id.find(region.id) ?? region;
  tx.db.region.id.update({
    ...current,
    dominantFaction: fill.dominantFaction || current.dominantFaction || undefined,
    landmarks: fill.landmarks ? JSON.stringify(fill.landmarks) : current.landmarks,
    threats: fill.threats ? JSON.stringify(fill.threats) : current.threats,
  });
  const dangerMultiplier: bigint = current.dangerMultiplier;

  // 2. New locations: skip a name already taken, case-insensitively, by the start location or an earlier one
  const taken = new Set<string>([lower(startLocation.name)]);
  const byExactName = new Map<string, any>([[startLocation.name, startLocation]]);
  const byLowerName = new Map<string, any>([[lower(startLocation.name), startLocation]]);
  const newLocations: any[] = [];
  const planned: { item: any; row: any }[] = [];
  const locationItems: any[] = Array.isArray(fill.locations) ? fill.locations : [];
  for (const loc of locationItems) {
    if (!loc || typeof loc !== 'object') continue;
    const name = String(loc.name || 'Unknown Location');
    if (taken.has(lower(name))) continue;
    taken.add(lower(name));
    const isSafe = loc.isSafe === true;
    const row = tx.db.location.insert({
      id: 0n,
      name,
      description: loc.description || `A ${current.biome || 'mysterious'} stretch of ${region.name}.`,
      zone: region.name,
      regionId: region.id,
      levelOffset: toBigIntSafe(loc.levelOffset, { min: -10n, max: 10n, fallback: 0n }),
      isSafe,
      terrainType: loc.terrainType && loc.terrainType !== 'uncharted' ? loc.terrainType : 'plains',
      bindStone: false,
      craftingAvailable: false,
    });
    newLocations.push(row);
    planned.push({ item: loc, row });
    byExactName.set(name, row);
    byLowerName.set(lower(name), row);
  }

  // 3. connectsTo against the start location plus the new names
  for (const { item, row } of planned) {
    if (!Array.isArray(item.connectsTo)) continue;
    for (const targetName of item.connectsTo) {
      const target = byLowerName.get(lower(targetName));
      if (target && target.id !== row.id && !isConnected(tx, row.id, target.id)) {
        connectLocations(tx, row.id, target.id);
      }
    }
  }

  // 4. Every new location is reachable from the start location: connect any that are not
  //    (the first new location to the start location when no new location reached it)
  const inRegion = new Set<bigint>([startLocation.id, ...newLocations.map((l: any) => l.id)]);
  let reached = reachableWithin(tx, startLocation.id, inRegion);
  for (const loc of newLocations) {
    if (reached.has(loc.id)) continue;
    connectLocations(tx, startLocation.id, loc.id);
    reached = reachableWithin(tx, startLocation.id, inRegion);
  }

  // 5. Enemy templates with role templates and abilities
  const enemyTemplateRows: any[] = [];
  const enemyItems: any[] = Array.isArray(fill.enemies) ? fill.enemies : [];
  for (const enemy of enemyItems) {
    if (!enemy || typeof enemy !== 'object') continue;
    // Clamp enemy level to region danger range: baseLevel +- 1
    // In starter regions (baseLevel=1), force all enemies to exactly level 1
    const baseLevel = dangerMultiplier / 100n;
    const minLevel = baseLevel <= 1n ? 1n : baseLevel - 1n;
    const maxLevel = baseLevel <= 1n ? 1n : baseLevel + 1n;
    let level = toBigIntSafe(enemy.level, { min: -1_000_000n, max: 1_000_000n, fallback: 1n });
    if (level < minLevel) level = minLevel;
    if (level > maxLevel) level = maxLevel;
    const { maxHp, baseDamage, xpReward, armorClass } = enemyStatsForLevel(level);
    const role = enemy.role || 'melee';
    const groupMin = toBigIntSafe(enemy.groupMin, { min: 1n, max: 20n, fallback: 1n });
    let groupMax = toBigIntSafe(enemy.groupMax, { min: 1n, max: 20n, fallback: 3n });
    if (groupMax < groupMin) groupMax = groupMin;

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
      groupMin,
      groupMax,
      armorClass,
      level,
      maxHp,
      baseDamage,
      xpReward,
    });
    enemyTemplateRows.push(enemyRow);

    // EnemyRoleTemplate (required for spawn system)
    tx.db.enemy_role_template.insert({
      id: 0n,
      enemyTemplateId: enemyRow.id,
      roleKey: role,
      displayName: enemy.name || 'Unknown',
      role,
      roleDetail: role,
      abilityProfile: role,
    });

    // EnemyAbility (basic attack matching role)
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

  // 6. Link enemies to the new non-safe locations
  const nonSafeLocations = newLocations.filter((loc: any) => !loc.isSafe);
  for (const enemyRow of enemyTemplateRows) {
    for (const loc of nonSafeLocations) {
      tx.db.location_enemy_template.insert({
        id: 0n,
        locationId: loc.id,
        enemyTemplateId: enemyRow.id,
      });
    }
  }

  // 7. NPCs: by exact locationName, else at the start location; never a repeat of a name already there
  const npcItems: any[] = Array.isArray(fill.npcs) ? fill.npcs : [];
  for (const npc of npcItems) {
    if (!npc || typeof npc !== 'object') continue;
    const npcLocation = byExactName.get(npc.locationName) ?? startLocation;
    const storedName = npc.name || 'Unknown NPC';
    const alreadyThere = [...tx.db.npc.by_location.filter(npcLocation.id)].some(
      (n: any) => lower(n.name) === lower(storedName),
    );
    if (alreadyThere) continue;
    insertRegionNpc(tx, npc, npcLocation.id);
  }

  // 8. Vendor and banker at the start location
  ensureRegionServices(tx, startLocation);

  // 9. The uncharted boundary at the edge of the region
  const lastNonSafe = nonSafeLocations[nonSafeLocations.length - 1];
  const boundaryAnchor = lastNonSafe ?? newLocations[newLocations.length - 1] ?? startLocation;
  const boundary = tx.db.location.insert({
    id: 0n,
    name: `The Edge Beyond ${region.name || 'the Region'}`,
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

  return { locations: newLocations, boundary };
}
