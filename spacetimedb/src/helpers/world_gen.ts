// World generation helpers: build region context and write generated content into game tables.
//
// World generation runs in two jobs (Phase 43, LAT-03). world_gen_state.step is a plain string:
//   PENDING     inserted by a trigger, not yet started
//   GENERATING  stage 1 (route world_gen_start) is running: region, start location, first NPC
//   FILLING     stage 1 landed and stage 2a (route world_gen) is running: the region's places
//   FILLING_FAMILIES  stage 2a landed and stage 2b (route world_gen_families) is running: its creature
//               families (Phase 51.3.1.2, D-01)
//   COMPLETE    the region is whole: the hold at the crossing ends and the region economy starts
//               (finishRegionFill, D-15, D-16)
//   FILL_ERROR  stage 2a failed or was refused; the stage-1 region stays playable (the start
//               location has its vendor and banker) and only the player's [explore] starts a
//               new fill job, so no automatic retry loop exists
//   FAMILIES_ERROR  stage 2b failed or was refused; the places stay as written and are never
//               written again (never FILL_ERROR, D-08, D-09)
//   ERROR       stage 1 failed or was refused; nothing was written
// world_gen_state is public: errorMessage only ever holds a fixed in-voice line.

import { connectLocations } from './location';
import {
  buildRegionFamilies,
  createFamily,
  createRelations,
  ensurePoolsForLocation,
  linkFamilyToPlaces,
  regionBaseLevel,
  seedRegionPools,
  storeFeud,
} from './families';
import {
  completeRegionFamilies,
  validateFamilies,
  validatePlaceWords,
  type FamilyPlace,
  type ValidatedFamily,
} from './family_validate';
import { nameKey } from '../data/economy_design_rules';
import type { FamilyRelation } from '../data/mechanical_vocabulary';
import { markLocationVisited } from './visited';
import type { WorldGenInput, WorldFillInput, WorldFamiliesInput } from '../data/llm_layers';
import { appendCreationEvent, appendPrivateEvent } from './events';
import { keeperFallback, keeperSegments, flattenSegments, parseReplyObject } from './segments';
import { buildDedupeKey, enqueueLlmJob, llmRefusalMessage, LLM_RESTING_LINE, SOURCE_KEYS } from './llm_queue';
import { isRestingErrorCode } from './llm_status';
import { archetypeForCharacter, archetypeForPlayer, encodeRouteInput } from './llm_inputs';
import { resolveNpcGender, npcGender, npcNoticeLine } from '../data/npc_gender';
import type { NpcGender } from '../data/npc_gender';
import { toBigIntSafe } from './safe_numbers';
import { enemyStatsForLevel } from '../data/enemy_rules';
import { REGION_HOLD_FAILED_LINE, regionHoldState, regionOpenedLine } from './region_hold';
import { startRegionEconomy } from './region_economy';
import {
  assignRegionFamilies,
  chooseHubs,
  familyCountFor,
  familySeed,
  feudCountFor,
  hubCountFor,
  hubHasStation,
  hubSeed,
  stationSeed,
} from '../data/density_rules';
import {
  acceptedNewPlaces,
  boundaryAnchorFor,
  hopsFrom,
  hostFloorFlips,
  levelOffsetForHops,
  placeCountFor,
  shapeRegionEdges,
  type ShapeNode,
} from '../data/region_shape';

/**
 * The /synccontent bootstrap: clears enemy spawns left at safe places, then seeds every place's
 * families and pools (ensurePoolsForLocation; ordinary creatures are pools since Phase 51.3.1.1,
 * D-01). Moved here from location.ts by Plan 08 because families.ts imports location.ts.
 */
export function ensureLocationRuntimeBootstrap(ctx: any) {
  for (const location of [...ctx.db.location.iter()]) {
    if (location.isSafe) {
      for (const spawn of [...ctx.db.enemy_spawn.by_location.filter(location.id)]) {
        for (const member of [...ctx.db.enemy_spawn_member.by_spawn.filter(spawn.id)]) {
          ctx.db.enemy_spawn_member.id.delete(member.id);
        }
        ctx.db.enemy_spawn.id.delete(spawn.id);
      }
    }
    ensurePoolsForLocation(ctx, location.id);
  }
}

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

export type WorldGenStartOutcome = 'reused' | 'held' | 'enqueued' | 'duplicate' | 'refused';

/** The in-voice reason stored on a refused state. world_gen_state is public: no budget or provider detail. */
const WORLD_GEN_REFUSED_MESSAGE = 'The Keeper strains but cannot shape this realm right now.';

/**
 * Start generation for a freshly inserted (PENDING) world_gen_state, in the caller's
 * transaction (Phase 41, plan 14, PIPE-01):
 *  - a starter state (sourceRegionId 0n) reuses an existing starter region for the character's
 *    race at no cost: placed at once when the region is whole ('reused'), or waiting in creation (HELD,
 *    the 7e line) while it is still being built or its build failed ('held'; Phase 51.3.1.2, D-15, D-17);
 *  - otherwise one world_gen_start job (stage 1) and its dispatch are enqueued and the state becomes
 *    GENERATING ('enqueued', or 'duplicate' when a job for this state is already active); the
 *    stage-1 apply enqueues the world_gen fill (stage 2);
 *  - a refused enqueue (budget or per-player cap) puts the state in ERROR with an in-voice
 *    message and tells the player to [explore] again later ('refused').
 * World generation never retries itself: only the player's explore starts a new job.
 */
export function startWorldGeneration(ctx: any, genState: any): WorldGenStartOutcome {
  const character = ctx.db.character.id.find(genState.characterId);

  if (genState.sourceRegionId === 0n && character) {
    const reuse = reuseStarterRegion(ctx, genState, character);
    if (reuse === 'placed') return 'reused';
    if (reuse === 'held') return 'held';
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
 *  - 'busy':         a starter state for the character is PENDING, GENERATING, FILLING or FILLING_FAMILIES
 *                    (nothing written);
 *  - 'none':         the character has no starter state, or its newest one is not failed (nothing written);
 *  - 'started':      stage 1 failed (ERROR): a fresh starter state was created and its world_gen_start job enqueued;
 *  - 'reused':       that fresh starter state reused an existing starter region (no call), or a HELD
 *                    character whose region is already whole was placed now;
 *  - 'held':         that fresh starter state waits on a starter region still being built (HELD, the 7e
 *                    line posted; no call);
 *  - 'fill_started': stage 2a (FILL_ERROR) or 2b (FAMILIES_ERROR) failed: only that stage was re-enqueued on
 *                    the same state (Phase 51.3.1.2, D-17, D-18);
 *  - 'refused':      the enqueue was refused; the state is back in its error step and the refusal line is posted.
 */
export type StarterRetryOutcome = 'busy' | 'none' | 'started' | 'reused' | 'held' | 'fill_started' | 'refused';

/** The starter steps with a call in flight: an [explore] then asks for patience and enqueues nothing. */
const STARTER_RUNNING_STEPS: readonly string[] = Object.freeze(['PENDING', 'GENERATING', 'FILLING', 'FILLING_FAMILIES']);

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
 * Phase 51.3.1.2 (D-17, D-18): a new character waits in creation until the first region is whole, so the
 * newest starter state decides: FILL_ERROR or FAMILIES_ERROR re-runs only that stage on the same state
 * (handed to the asker, the character kept; 'fill_started'), never the region from the start; ERROR
 * (stage 1 failed, every starter state ERROR) starts a fresh state as before. A HELD newest state (the
 * character waits on another character's starter region) is decided by that region's build states
 * (retryHeldStarter): busy, the failed stage re-enqueued on the generating state, or placed now.
 * Writes nothing for 'busy' and 'none'.
 */
export function retryStarterWorldGen(ctx: any, character: any, playerId: any): StarterRetryOutcome {
  // world_gen_state has no characterId index; the table is small and this path is rare.
  const starters = [...ctx.db.world_gen_state.iter()].filter(
    (s: any) => s.characterId === character.id && s.sourceRegionId === 0n,
  );
  if (starters.some((s: any) => STARTER_RUNNING_STEPS.includes(s.step))) return 'busy';
  const newest = [...starters].sort(newestFirst)[0];
  if (!newest) return 'none';
  if (newest.step === 'HELD') return retryHeldStarter(ctx, newest, character, playerId);
  if (newest.step === 'COMPLETE') return placeAfterFailedPlacement(ctx, newest);

  if (newest.step === 'FILL_ERROR' || newest.step === 'FAMILIES_ERROR') {
    const handed = { ...newest, playerId, characterId: character.id, updatedAt: ctx.timestamp };
    ctx.db.world_gen_state.id.update(handed);
    return restartFailedStage(ctx, handed) === 'refused' ? 'refused' : 'fill_started';
  }
  if (starters.some((s: any) => s.step !== 'ERROR')) return 'none';

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
 * The region of a COMPLETE starter state is whole, but its character still waits at location 0: his
 * placement at completion threw and was skipped so it could not roll back the paid families (review A
 * WR-02). His [explore] places him now at the arrival point (placeWaitingCharacter, no call): 'reused'.
 * 'none' when he is already placed, or the region or its arrival point is gone.
 */
function placeAfterFailedPlacement(ctx: any, state: any): StarterRetryOutcome {
  const regionId = state.generatedRegionId;
  const region = regionId !== undefined && regionId !== null ? ctx.db.region.id.find(regionId) : undefined;
  if (!region) return 'none';
  return placeWaitingCharacter(ctx, state, region) ? 'reused' : 'none';
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
 * The starter region of a race (starterForRace, compared lowercased), or null. The lowest region id wins,
 * so duplicates that already exist resolve the same way every time (review A WR-03).
 */
function starterRegionFor(ctx: any, race: unknown): any | null {
  const raceLower = String(race ?? '').toLowerCase();
  if (!raceLower) return null;
  let found: any | null = null;
  for (const region of ctx.db.region.iter()) {
    if (!region.starterForRace || region.starterForRace.toLowerCase() !== raceLower) continue;
    if (found === null || region.id < found.id) found = region;
  }
  return found;
}

/** The starter steps before stage 1 lands: the build has no region row yet (review A WR-03). */
const STARTER_STAGE1_STEPS: readonly string[] = Object.freeze(['PENDING', 'GENERATING']);

/**
 * Another character's starter build of this race that is still in stage 1 (PENDING or GENERATING, so
 * no region row exists yet), lowest state id first; null when there is none (review A WR-03). A new
 * character of the same race joins it (HELD) instead of paying for a duplicate starter region.
 * world_gen_state has no step index; the table is small and this path is rare (character creation).
 */
function starterBuildInStage1(ctx: any, race: unknown, exceptCharacterId: bigint): any | null {
  const raceLower = String(race ?? '').toLowerCase();
  if (!raceLower) return null;
  let found: any | null = null;
  for (const s of ctx.db.world_gen_state.iter()) {
    if (s.sourceRegionId !== 0n || !STARTER_STAGE1_STEPS.includes(s.step) || s.characterId === exceptCharacterId) continue;
    const builder = ctx.db.character.id.find(s.characterId);
    if (!builder || String(builder.race ?? '').toLowerCase() !== raceLower) continue;
    if (found === null || s.id < found.id) found = s;
  }
  return found;
}

/** The HELD states that joined a starter build of this race before its stage 1 landed (no region yet), by id. */
function heldOnStarterBuild(tx: any, raceLower: string): any[] {
  if (!raceLower) return [];
  return [...tx.db.world_gen_state.iter()]
    .filter((s: any) => {
      if (s.step !== 'HELD' || s.sourceRegionId !== 0n) return false;
      if (s.generatedRegionId !== undefined && s.generatedRegionId !== null) return false;
      const waiting = tx.db.character.id.find(s.characterId);
      return !!waiting && String(waiting.race ?? '').toLowerCase() === raceLower;
    })
    .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Stage 1 of a starter region landed (review A WR-03): every new character of its race who joined the
 * build while it had no region (a HELD state with no generatedRegionId) now waits on the region itself,
 * so finishRegionFill places him and the failure lines of stages 2a and 2b reach him. The stage-1 apply
 * calls it before the fill starts. No line is posted (each already has the 7e line).
 */
export function joinStarterHolds(tx: any, regionId: bigint, race: unknown): void {
  for (const held of heldOnStarterBuild(tx, String(race ?? '').toLowerCase())) {
    tx.db.world_gen_state.id.update({ ...held, generatedRegionId: regionId, updatedAt: tx.timestamp });
  }
}

/**
 * The new characters still waiting in creation on a starter build that failed at stage 1 (review A
 * WR-03): HELD states with no region whose character, still at location 0, has the build's race. Empty
 * for a state that is no starter, or while another starter build of that race is still in stage 1 (they
 * keep waiting on it). failWorldGen tells them the same failure line; their [explore] starts their own
 * region (retryHeldStarter).
 */
export function starterBuildWaiters(tx: any, buildState: any): any[] {
  if (!buildState || buildState.sourceRegionId !== 0n) return [];
  const builder = tx.db.character.id.find(buildState.characterId);
  const raceLower = String(builder?.race ?? '').toLowerCase();
  if (!raceLower) return [];
  const other = starterBuildInStage1(tx, raceLower, buildState.characterId);
  if (other && other.id !== buildState.id) return [];
  return heldOnStarterBuild(tx, raceLower).filter((s: any) => {
    const waiting = tx.db.character.id.find(s.characterId);
    return !!waiting && waiting.locationId === 0n && waiting.id !== buildState.characterId;
  });
}

/**
 * The home place of a region, where a reusing character is put: its charted hub (D-61; the lowest id),
 * else the first safe charted place, else any charted place; null when it has none.
 */
function regionHomePlace(ctx: any, regionId: bigint): any | null {
  let home: any = null;
  for (const loc of ctx.db.location.iter()) {
    if (loc.regionId !== regionId || loc.isHub !== true || loc.terrainType === 'uncharted') continue;
    if (!home || loc.id < home.id) home = loc;
  }
  if (home) return home;
  for (const loc of ctx.db.location.iter()) {
    if (loc.regionId === regionId && loc.isSafe && loc.terrainType !== 'uncharted') return loc;
  }
  for (const loc of ctx.db.location.iter()) {
    if (loc.regionId === regionId && loc.terrainType !== 'uncharted') return loc;
  }
  return null;
}

/**
 * Put a new character at the home place of an existing starter region and complete his state, with no
 * model call: location and bind point, a visited row with no origin, the place's pools, and the reuse
 * arrival message. Shared by the reuse at creation (an open region), the completion of a held region
 * (finishRegionFill places every HELD character) and the [explore] of a HELD character whose region is
 * already whole. A home place with no exits names the next step (wait, or [explore] to retry the fill)
 * instead of promising [travel] (review WR-B02). false when the region has no charted place.
 */
function placeAtHome(ctx: any, genState: any, character: any, region: any): boolean {
  const homeLocation = regionHomePlace(ctx, region.id);
  if (!homeLocation) return false;

  // The side rows first, the character and state rows last (review A WR-02): a throw part-way leaves him
  // waiting at location 0 with his state as it was, for a later [explore] to place, never half-placed.
  // Visited places: reusing a starter region puts the character at its home place (no origin).
  markLocationVisited(ctx, character.id, homeLocation.id);
  ensurePoolsForLocation(ctx, homeLocation.id);

  let arrivalMsg = `You open your eyes in ${homeLocation.name}, ${region.name}.`;
  const people = peopleAt(ctx, homeLocation.id);
  if (people.length > 0) {
    arrivalMsg += '\n\n' + npcNoticeLine(people);
  }
  const hasExits = [...ctx.db.location_connection.by_from.filter(homeLocation.id)].length > 0;
  if (hasExits) {
    arrivalMsg += `\n\nTry [look] to examine your surroundings, or [travel] to move.`;
  } else {
    const hint = regionFillHint(ctx, region.id);
    arrivalMsg += `\n\nTry [look] to examine your surroundings.` + (hint ? ` ${hint}` : '');
  }

  ctx.db.character.id.update({
    ...(ctx.db.character.id.find(character.id) ?? character),
    locationId: homeLocation.id,
    boundLocationId: homeLocation.id,
  });
  ctx.db.world_gen_state.id.update({
    ...(ctx.db.world_gen_state.id.find(genState.id) ?? genState),
    step: 'COMPLETE',
    generatedRegionId: region.id,
    updatedAt: ctx.timestamp,
  });
  appendPrivateEvent(ctx, character.id, character.ownerUserId, 'narrative', arrivalMsg);
  return true;
}

/** The creation-console line for a failed region-fill stage: the line failWorldFill / failWorldFamilies post. */
function failedStageCreationLine(step: string, message: string | undefined): string {
  if (message === LLM_RESTING_LINE) return `${LLM_RESTING_LINE}${EXPLORE_HINT}`;
  if (step === 'FAMILIES_ERROR') return `${WORLD_FAMILIES_FAILED_MESSAGE}${EXPLORE_HINT}`;
  return `${message || WORLD_FILL_FAILED_MESSAGE}${EXPLORE_HINT}`;
}

/** The states that build a region (every state naming it except HELD ones), newest first. */
function regionBuildStates(tx: any, regionId: bigint): any[] {
  // world_gen_state has no region index; the table is small and these paths are rare.
  return [...tx.db.world_gen_state.iter()]
    .filter((s: any) => s.generatedRegionId !== undefined && s.generatedRegionId !== null && s.generatedRegionId === regionId && s.step !== 'HELD')
    .sort(newestFirst);
}

/**
 * A new character whose race's starter region is still being built waits for it (Phase 51.3.1.2, D-15,
 * D-17): his state becomes HELD with the region and his creation console gets the owner's 7e line once.
 * When the region has already failed (FILL_ERROR or FAMILIES_ERROR), the failure line of that stage
 * follows, so he knows [explore] retries it (T-51.3.1.2-43). No model call.
 */
function holdNewCharacter(ctx: any, genState: any, region: any | null, hold: 'held' | 'held_failed'): void {
  ctx.db.world_gen_state.id.update({
    ...(ctx.db.world_gen_state.id.find(genState.id) ?? genState),
    step: 'HELD',
    // No region yet: he joined a same-race build still in stage 1; joinStarterHolds names it (review A WR-03).
    generatedRegionId: region ? region.id : undefined,
    errorMessage: undefined,
    updatedAt: ctx.timestamp,
  });
  const lines: [string, string][] = [['creation', WORLD_START_MILESTONE_LINE]];
  if (hold === 'held_failed' && region) {
    const failed = regionBuildStates(ctx, region.id).find((s: any) => s.step === 'FILL_ERROR' || s.step === 'FAMILIES_ERROR');
    if (failed) lines.push(['creation_error', failedStageCreationLine(failed.step, failed.errorMessage)]);
  }
  for (const [kind, line] of lines) {
    const segments = keeperFallback(line);
    appendCreationEvent(ctx, genState.playerId, kind, flattenSegments(segments), segments);
  }
}

/**
 * The starter-region reuse branch: when another character of the same race already generated a starter
 * region, this character uses it with no model call.
 *  - 'placed': the region is open (whole, Phase 51.3.1.2): he is put at its home place now (placeAtHome);
 *  - 'held':   the region is still being built or its build failed (regionHoldState not 'open'): he waits
 *              in creation (HELD, the 7e line) and finishRegionFill places him when it is whole (D-15, D-17);
 *  - 'held':   also when no region row exists yet but another character's starter build of his race is
 *              still in stage 1: he joins that build (HELD with no region; joinStarterHolds names the region
 *              when stage 1 lands) instead of paying for a duplicate starter region (review A WR-03);
 *  - false:    no starter region or build for his race, or the region has no charted place: a new region
 *              is generated.
 */
function reuseStarterRegion(ctx: any, genState: any, character: any): 'placed' | 'held' | false {
  const region = starterRegionFor(ctx, character.race);
  if (!region) {
    if (!starterBuildInStage1(ctx, character.race, character.id)) return false;
    holdNewCharacter(ctx, genState, null, 'held');
    return 'held';
  }
  const hold = regionHoldState(ctx, region.id);
  if (hold !== 'open') {
    holdNewCharacter(ctx, genState, region, hold);
    return 'held';
  }
  return placeAtHome(ctx, genState, character, region) ? 'placed' : false;
}

/**
 * The [explore] of a new character waiting on someone else's starter region (his newest starter state is
 * HELD; Phase 51.3.1.2, D-18): the region's build states decide.
 *  - one is still running: 'busy' (nothing written);
 *  - the newest failed one (FILL_ERROR or FAMILIES_ERROR) has only its failed stage re-enqueued, the job
 *    charged to the asker (the payer); the state stays the creator's (playerId and character), so his
 *    console, his failure lines and his stage-1 description lookup stay right (review A WR-05):
 *    'fill_started', or 'refused' when the enqueue was refused (the failure lines already went out);
 *  - otherwise the region is whole and he was missed: he is placed at its home place now ('reused').
 * 'none' when the region is gone or has no charted place.
 * A HELD state with no region joined a same-race build before its stage 1 landed (review A WR-03): 'busy'
 * while that build is still in stage 1; the region its race has now otherwise (named on the state, then
 * decided as above); and when that build failed at stage 1 (no region), his own region starts on his
 * state, charged to the asker ('started', or the startWorldGeneration outcome).
 */
function retryHeldStarter(ctx: any, held: any, character: any, playerId: any): StarterRetryOutcome {
  if (held.generatedRegionId === undefined || held.generatedRegionId === null) {
    if (starterBuildInStage1(ctx, character.race, character.id)) return 'busy';
    const landed = starterRegionFor(ctx, character.race);
    if (!landed) {
      const own = { ...held, playerId, step: 'PENDING', errorMessage: undefined, updatedAt: ctx.timestamp };
      ctx.db.world_gen_state.id.update(own);
      const started = startWorldGeneration(ctx, own);
      return started === 'enqueued' || started === 'duplicate' ? 'started' : started;
    }
    held = { ...held, generatedRegionId: landed.id, updatedAt: ctx.timestamp };
    ctx.db.world_gen_state.id.update(held);
  }
  const regionId = held.generatedRegionId;
  const region = regionId !== undefined && regionId !== null ? ctx.db.region.id.find(regionId) : undefined;
  if (!region) return 'none';
  const builds = regionBuildStates(ctx, region.id);
  if (builds.some((s: any) => STARTER_RUNNING_STEPS.includes(s.step))) return 'busy';
  const failed = builds.find((s: any) => s.step === 'FILL_ERROR' || s.step === 'FAMILIES_ERROR');
  if (failed) {
    // The state is not handed over (review A WR-05): only the job is charged to the asker.
    return restartFailedStage(ctx, failed, playerId) === 'refused' ? 'refused' : 'fill_started';
  }
  return placeAtHome(ctx, held, character, region) ? 'reused' : 'none';
}

// ---------------------------------------------------------------------------
// Staged world generation (Phase 43, LAT-03)
// ---------------------------------------------------------------------------

/**
 * Phase 51.3.1.2 (D-17): posted to a new character's creation console when stage 1 of the first region
 * lands (the character waits there until the families are in), and to the creation console of a new
 * character who waits on a starter region that is still being built (HELD). The owner's 7e line
 * (Recommended) of .planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md (Status: APPROVED
 * 2026-10-09), copied with `node scripts/llm/prompt_draft.mjs chosen <draft>`. No milestone line for
 * travellers (7a at the crossing already set the expectation). The Keeper is he.
 */
export const WORLD_START_MILESTONE_LINE =
  'The Keeper clears his throat. A region is taking shape around the place you will first stand; its roads and its creatures are still being remembered.';
/** Stored (public) and posted when the stage-2 reply is unusable. */
export const WORLD_FILL_FAILED_MESSAGE =
  'The Keeper loses the thread of the rest of the map. What he has already shown you will hold.';
/** Stored (public) and posted when the stage-2 enqueue is refused for a reason other than resting. */
export const WORLD_FILL_REFUSED_MESSAGE =
  'The Keeper cannot finish remembering this region right now. What he has shown you will hold.';
/**
 * Stored (public) when stage 2b fails or its input cannot be built (D-09, D-18): the owner's
 * Alternative for section 5 of .planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md
 * (Status: APPROVED 2026-10-09), the part before ' Type [explore] to try again.', copied with
 * `node scripts/llm/prompt_draft.mjs chosen <draft>`. The whole sentence is posted only on the creation
 * console; a character at the crossing gets the 7d line (REGION_HOLD_FAILED_LINE) instead.
 */
export const WORLD_FAMILIES_FAILED_MESSAGE = 'The land is remembered, but not yet what lives in it.';
/** Posted by the explore intent (Plan 43-11) when a fill retry starts. */
export const WORLD_FILL_RETRY_LINE = 'The Keeper squints at the half-remembered land and tries again...';

const lower = (v: unknown): string => String(v ?? '').trim().toLowerCase();

function isConnected(tx: any, fromId: bigint, toId: bigint): boolean {
  for (const conn of tx.db.location_connection.by_from.filter(fromId)) {
    if (conn.toLocationId === toId) return true;
  }
  return false;
}

/**
 * Stage 1: write the region, its one start location (the arrival point) and the first NPC (when the
 * reply has one) into the public tables. A non-starter region is connected both ways to the source
 * location. The caller records generatedRegionId and starts the fill.
 * Optional starterRace: marks the region as the starter for that race.
 *
 * The arrival point (Phase 51.3.1.1, D-59 to D-64):
 *   - starter region: safe, its one hub, with a crafting station and a bind stone (D-61, D-63);
 *   - any other region: the model's isSafe (the approved first-glimpse wording asks for it, Plan 23,
 *     D-61); a reply without a boolean isSafe (one written under the older wording, which asked for a
 *     safe place) reads as safe. Not a hub, no station and no bind stone: the fill decides the hubs
 *     (placeRegionHubs, which also makes a hub safe), and only a hub gets a station and a bind stone
 *     (D-63, D-64).
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
    isSafe: isStarter || start.isSafe !== false,
    terrainType: terrain,
    bindStone: isStarter,
    craftingAvailable: isStarter,
    shortName: '',
    placeNoun: '',
    isHub: isStarter,
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
 * The vendor and banker safety net of one hub (D-59, D-60): a hub always has both, whatever the model
 * wrote (or did not write). settleRegionServices runs it for each hub of a region. Safe to run more
 * than once.
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

// ---------------------------------------------------------------------------
// Hubs (Phase 51.3.1.1, D-59 to D-64): server logic, placed with the prompt of today (no hub marks yet)
// ---------------------------------------------------------------------------

/**
 * How many hubs a region gets (D-62): hubCountFor on the region danger and hubSeed(region.id). Plan
 * 23 uses it for the Hubs line of the fill request, so the request and the write always agree.
 */
export function regionHubCount(region: any, isStarter: boolean): number {
  return hubCountFor(region?.dangerMultiplier ?? 100n, isStarter, hubSeed(region.id));
}

/**
 * The hubs a fill reply marks, in order: the arrival point first when `fill.arrival.isHub` is true,
 * then each `fill.locations[i]` with `isHub` true, resolved by lowercase name in `rowsByLowerName`
 * (the rows the fill inserted; an unknown or skipped name is ignored). The reply of today carries
 * neither field, so the list is empty until Plan 23 ships the approved wording.
 */
export function readHubMarks(fill: any, arrival: any, rowsByLowerName: ReadonlyMap<string, any>): bigint[] {
  const marks: bigint[] = [];
  const add = (id: bigint | undefined): void => {
    if (typeof id === 'bigint' && !marks.includes(id)) marks.push(id);
  };
  const arrivalMark = fill && typeof fill === 'object' ? fill.arrival : undefined;
  if (arrival && arrivalMark && typeof arrivalMark === 'object' && arrivalMark.isHub === true) add(arrival.id);
  const items: any[] = fill && Array.isArray(fill.locations) ? fill.locations : [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || item.isHub !== true) continue;
    add(rowsByLowerName.get(lower(item.name))?.id);
  }
  return marks;
}

/**
 * Places the hubs of a region (D-60 to D-64). The candidates are its charted locations; chooseHubs
 * takes the server count (regionHubCount), the ids already marked isHub, the reply marks and the rule
 * order (safe, then town or city, then the arrival point). Each chosen place that is not yet a hub
 * becomes one: safe (D-61), a bind stone (D-64) and a crafting station when it already had one or the
 * station roll hits (hubHasStation on stationSeed, D-63; an existing station is kept). An existing
 * hub keeps its row as it is. An arrival point with a bind stone that is not a hub yet was written
 * before hubs existed (stage 1 gave every arrival point a bind stone, a vendor and a banker), so it
 * counts as an existing hub (D-61: existing start locations become hubs). Returns the hub rows as they
 * now stand, in the order chosen.
 */
export function placeRegionHubs(
  tx: any,
  opts: { region: any; arrival: any; isStarter: boolean; markedIds: readonly bigint[] },
): any[] {
  const region = tx.db.region.id.find(opts.region.id) ?? opts.region;
  const arrival = opts.arrival ? tx.db.location.id.find(opts.arrival.id) ?? opts.arrival : null;
  const places = [...tx.db.location.iter()]
    .filter((loc: any) => loc.regionId === region.id && loc.terrainType !== 'uncharted')
    .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const existingHubIds: bigint[] = places.filter((loc: any) => loc.isHub === true).map((loc: any) => loc.id);
  if (arrival && arrival.isHub !== true && arrival.bindStone === true && !existingHubIds.includes(arrival.id)) {
    existingHubIds.unshift(arrival.id);
  }
  const chosen = chooseHubs({
    places: places.map((loc: any) => ({ id: loc.id, isSafe: loc.isSafe === true, terrainType: String(loc.terrainType ?? '') })),
    arrivalId: arrival ? arrival.id : 0n,
    count: regionHubCount(region, opts.isStarter),
    isStarter: opts.isStarter,
    existingHubIds,
    markedIds: opts.markedIds,
  });

  const hubs: any[] = [];
  for (const id of chosen) {
    const row = tx.db.location.id.find(id);
    if (!row) continue;
    if (row.isHub === true) {
      hubs.push(row);
      continue;
    }
    const hub = {
      ...row,
      isHub: true,
      isSafe: true,
      bindStone: true,
      craftingAvailable:
        row.craftingAvailable === true ||
        hubHasStation(region.dangerMultiplier ?? 100n, opts.isStarter, stationSeed(region.id, row.id)),
    };
    tx.db.location.id.update(hub);
    hubs.push(hub);
  }
  return hubs;
}

/**
 * The services of a region (D-59): each hub gets its vendor and banker (ensureRegionServices), and
 * every vendor or banker standing at a place of this region that is not a hub becomes an ordinary
 * local (npcType lore; name, description and greeting kept), so a region with no hub has neither.
 * NPCs of other regions are never touched. Safe to run more than once.
 */
export function settleRegionServices(tx: any, regionId: bigint, hubs: readonly any[]): void {
  for (const hub of hubs) ensureRegionServices(tx, hub);
  const hubIds = new Set<bigint>(hubs.map((hub: any) => hub.id));
  for (const loc of [...tx.db.location.iter()]) {
    if (loc.regionId !== regionId || hubIds.has(loc.id) || loc.isHub === true) continue;
    for (const npc of [...tx.db.npc.by_location.filter(loc.id)]) {
      if (npc.npcType !== 'vendor' && npc.npcType !== 'banker') continue;
      tx.db.npc.id.update({ ...npc, npcType: 'lore' });
    }
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
    // The Hubs line (D-62): the same count placeRegionHubs enforces when the reply is written.
    hubCount: regionHubCount(region, genState.sourceRegionId === 0n),
    arrivalIsHub: start.isHub === true,
    // Phase 51.3.1.2 (D-03): the server's place count, the arrival point included (8-10, hubSeed only,
    // so this request and the 2a write agree). The family and feud counts moved to the 2b job (D-66),
    // which counts the real places after this reply is written (buildWorldFamiliesInput).
    placeCount: placeCountFor(region.id),
  };
}

/**
 * Stage 2 start, in the caller's transaction: enqueue the world_gen fill job for this state and
 * move it to FILLING. A refused enqueue (kill switch, ceiling, budget, cap) or an unreadable
 * stage 1 fails the fill instead (FILL_ERROR, stage-1 region stays playable). Nothing retries
 * itself: the only callers are the stage-1 apply and the player's explore. `payer` is the identity the
 * job is enqueued for (charged to), when it is not the state's own player: a HELD new character's
 * [explore] retries another character's build without taking the state over (review A WR-05).
 */
export function startWorldFill(tx: any, genState: any, payer?: any): 'enqueued' | 'duplicate' | 'refused' {
  let input: WorldFillInput;
  try {
    input = buildWorldFillInput(tx, genState);
  } catch {
    failWorldFill(tx, genState, WORLD_FILL_FAILED_MESSAGE);
    return 'refused';
  }

  const result = enqueueLlmJob(tx, {
    route: 'world_gen',
    playerId: payer ?? genState.playerId,
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
 * with the in-voice message, the hubs of the region are placed by rule with their vendor and banker
 * (placeRegionHubs with no marks, then settleRegionServices; D-59 to D-64), and the failure lines go
 * out (postFillFailure: today's line on the creation console, the 7d line at the crossing; D-18). No
 * stage-1 row is removed.
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

  const stored = current ?? genState;
  const regionId = stored.generatedRegionId;
  if (regionId !== undefined && regionId !== null) {
    const region = tx.db.region.id.find(regionId);
    const start = findRegionStart(tx, regionId);
    if (region && start) {
      const hubs = placeRegionHubs(tx, { region, arrival: start, isStarter: stored.sourceRegionId === 0n, markedIds: [] });
      settleRegionServices(tx, regionId, hubs);
    }
  }

  postFillFailure(tx, stored, message, `${message} Type [explore] to try again.`);
}

/** The [explore] hint every failure line ends with (D-18). */
const EXPLORE_HINT = ' Type [explore] to try again.';

/**
 * The lines of a stage-2a or stage-2b failure, by where the people are (D-15, D-18):
 *  - the triggering character still in creation (location 0, or gone): one creation_error Keeper segment
 *    with `creationLine`; the same line to the player of every HELD state of the region whose character
 *    still waits at location 0 (Phase 51.3.1.2, D-18), each player once;
 *  - otherwise the triggering character, wherever he is, and every character standing at the crossing
 *    (character.by_location of a non-zero sourceLocationId; location 0 is never a crossing) get the
 *    owner's 7d line (REGION_HOLD_FAILED_LINE), or the resting line with the [explore] hint when the
 *    kill switch or the ceiling refused (message === LLM_RESTING_LINE). Nobody gets a line twice and
 *    nobody elsewhere gets one.
 */
function postFillFailure(tx: any, genState: any, message: string, creationLine: string): void {
  const char = tx.db.character.id.find(genState.characterId);
  // Phase 46: the Keeper-voice line is one Keeper narration segment.
  const segments = keeperFallback(creationLine);
  const told = new Set<string>();
  const tellCreation = (playerId: any): void => {
    const key = typeof playerId?.toHexString === 'function' ? playerId.toHexString() : String(playerId);
    if (told.has(key)) return;
    told.add(key);
    appendCreationEvent(tx, playerId, 'creation_error', flattenSegments(segments), segments);
  };
  if (!char || char.locationId === 0n) tellCreation(genState.playerId);
  // Every other new character still waiting in creation on this region (HELD) gets the same line (D-18).
  const regionId = genState.generatedRegionId;
  if (regionId !== undefined && regionId !== null) {
    for (const held of heldStatesOf(tx, regionId)) {
      const waiting = tx.db.character.id.find(held.characterId);
      if (waiting && waiting.locationId === 0n) tellCreation(held.playerId);
    }
  }

  const holdLine = message === LLM_RESTING_LINE ? `${LLM_RESTING_LINE}${EXPLORE_HINT}` : REGION_HOLD_FAILED_LINE;
  for (const c of crossingAudience(tx, genState, char)) {
    appendPrivateEvent(tx, c.id, c.ownerUserId, 'system', holdLine);
  }
}

/**
 * Who hears about a region held at a crossing (D-15, D-18): the triggering character, wherever he is,
 * then everyone standing at the crossing (character.by_location of a non-zero sourceLocationId) by id.
 * Each once; a character at location 0 (still in creation) never, and location 0 is never a crossing.
 */
function crossingAudience(tx: any, genState: any, trigger: any): any[] {
  const out: any[] = [];
  const seen = new Set<bigint>();
  const add = (c: any): void => {
    if (!c || c.locationId === 0n || seen.has(c.id)) return;
    seen.add(c.id);
    out.push(c);
  };
  add(trigger);
  const crossing: bigint = genState.sourceLocationId ?? 0n;
  if (crossing !== 0n) {
    const here = [...tx.db.character.by_location.filter(crossing)].sort((a: any, b: any) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    for (const c of here) add(c);
  }
  return out;
}

/** A thrown value's name only (never its message), for a log line (T-51.3.1.2-28). */
function errorName(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/**
 * A region is whole (Phase 51.3.1.2): the state becomes COMPLETE and the hold at the crossing ends
 * (D-15). Only a FILLING_FAMILIES state (the 2b apply) or a FILLING state (the legacy one-reply apply)
 * finishes; any other step, COMPLETE included, is left as it is, so a second call adds nothing.
 *  - The owner's 7c line (regionOpenedLine with the stored region name) goes to the triggering character,
 *    wherever he is, and to everyone at the crossing, once each; the triggering character then gets the
 *    discovery line (pickDiscoveryMessage; the owner's choice moves it here from stage 1).
 *  - A starter state (sourceLocationId 0n) posts neither line: its new character, still waiting in
 *    creation at location 0, is placed at the arrival point now (placeWaitingCharacter, D-17) with the
 *    arrival message and then the discovery line. A starter character already placed (stage 1 placed it
 *    before the 51.3.1.2 publish) is left where he is, with no second arrival message.
 *  - Every other new character who waited on this region (a HELD state naming it) is placed at its home
 *    place with the reuse arrival message and his state completes (placeHeldCharacters, D-15, D-17).
 *  - The region economy starts after COMPLETE, never as part of the hold (D-16): startRegionEconomy
 *    (gated on the AI economy switch inside) in a try/catch that logs the error name only, so an economy
 *    bug never hides a completed region (T-51.3.1.2-28).
 * Plan 11 calls it from both applies.
 */
export function finishRegionFill(tx: any, genState: any): void {
  const current = tx.db.world_gen_state.id.find(genState.id);
  if (!current || (current.step !== 'FILLING_FAMILIES' && current.step !== 'FILLING')) return;

  tx.db.world_gen_state.id.update({
    ...current,
    step: 'COMPLETE',
    errorMessage: undefined,
    updatedAt: tx.timestamp,
  });

  const regionId = current.generatedRegionId;
  const region = regionId !== undefined && regionId !== null ? tx.db.region.id.find(regionId) : undefined;

  if (region && (current.sourceLocationId ?? 0n) !== 0n) {
    const regionName = String(region.name ?? '');
    const opened = regionOpenedLine(regionName);
    const trigger = tx.db.character.id.find(current.characterId);
    for (const c of crossingAudience(tx, current, trigger)) {
      appendPrivateEvent(tx, c.id, c.ownerUserId, 'system', opened);
    }
    if (trigger && trigger.locationId !== 0n) {
      appendPrivateEvent(tx, trigger.id, trigger.ownerUserId, 'system',
        pickDiscoveryMessage(regionName, tx.timestamp.microsSinceUnixEpoch));
    }
  }

  // Placement never rolls back the paid families (review A WR-02): each placement is guarded, and a
  // character it could not place stays at location 0 for a later [explore] (retryStarterWorldGen).
  if (region && (current.sourceLocationId ?? 0n) === 0n) {
    try {
      placeWaitingCharacter(tx, current, region);
    } catch (err) {
      console.error('Waiting character placement failed for state ' + String(current.id) + ': ' + errorName(err));
    }
  }
  if (region) placeHeldCharacters(tx, region);

  try {
    const filledRegion = region ? (tx.db.region.id.find(region.id) ?? region) : region;
    startRegionEconomy(tx, filledRegion, { playerId: current.playerId, characterId: current.characterId });
  } catch (err) {
    console.error('Region economy start failed for region ' + String(regionId) + ': ' + errorName(err));
  }
}

/**
 * The HELD states waiting on a region (Phase 51.3.1.2): new characters whose race's starter region was
 * still being built when they were created. By id, so the order is stable.
 */
function heldStatesOf(tx: any, regionId: bigint): any[] {
  // world_gen_state has no region index; the table is small and these paths are rare.
  return [...tx.db.world_gen_state.iter()]
    .filter((s: any) => s.step === 'HELD' && s.generatedRegionId !== undefined && s.generatedRegionId !== null && s.generatedRegionId === regionId)
    .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The region is whole: every new character waiting on it (HELD) is placed at its home place with the
 * reuse arrival message and his state becomes COMPLETE (placeAtHome). A HELD character who is no longer
 * at location 0, or is gone, is not placed; his state completes all the same. A region with no charted
 * place leaves the state HELD ([explore] then retries the placement).
 */
function placeHeldCharacters(tx: any, region: any): void {
  for (const held of heldStatesOf(tx, region.id)) {
    // One bad character never undoes the region or the others (review A WR-02): his state stays HELD and
    // his [explore] places him later (retryHeldStarter).
    try {
      const character = tx.db.character.id.find(held.characterId);
      if (character && character.locationId === 0n) {
        placeAtHome(tx, held, character, region);
      } else {
        tx.db.world_gen_state.id.update({ ...held, step: 'COMPLETE', updatedAt: tx.timestamp });
      }
    } catch (err) {
      console.error('Held placement failed for state ' + String(held.id) + ': ' + errorName(err));
    }
  }
}

/**
 * The stage-1 region description of a state, read back from its stored world_gen_start reply (Phase
 * 51.3.1.2, D-17): the description is on no row, and the arrival message that shows it moved from stage 1
 * to completion. The job is found by its dedupe key (the state's playerId, the route and
 * SOURCE_KEYS.worldGen(state.id)); the newest completed one is read with the tolerant reply parser. null
 * when there is no such job (a retry handed to another identity, a pruned row), the reply cannot be read
 * or it has no description. Never throws: a lookup problem must not stop a placement.
 */
function storedRegionDescription(tx: any, state: any): string | null {
  try {
    const key = buildDedupeKey(state.playerId, 'world_gen_start', SOURCE_KEYS.worldGen(state.id));
    const done = [...tx.db.llm_job.by_dedupe_key.filter(key)]
      .filter((j: any) => j.status === 'completed')
      .sort(newestFirst)[0];
    const reply = done ? parseReplyObject(done.resultText) : undefined;
    const description = reply?.regionDescription;
    return typeof description === 'string' && description.trim() !== '' ? description : null;
  } catch {
    return null;
  }
}

/** The people at a place, for the arrival notice (npcNoticeLine). */
function peopleAt(tx: any, locationId: bigint): { name: string; gender: NpcGender }[] {
  const out: { name: string; gender: NpcGender }[] = [];
  for (const npc of tx.db.npc.by_location.filter(locationId)) {
    out.push({ name: npc.name, gender: npcGender(npc) });
  }
  return out;
}

/**
 * Place the new character of a starter state who waited in creation (Phase 51.3.1.2, D-17), when the
 * region is whole (finishRegionFill). Only a character still at location 0 is placed, so a character the
 * old stage-1 code already placed is never placed twice (T-51.3.1.2-44). He stands at the arrival point
 * (findRegionStart) with his bind point there, a visited row with no origin (the first place he has stood
 * in) and the place's pools, as the stage-1 code did. Then the arrival message, moved from stage 1 with its
 * last sentence replaced by the approved ending (owner choices: "No new wording for placement"), and the
 * discovery line. Returns true when the character was placed.
 */
export function placeWaitingCharacter(tx: any, state: any, region: any): boolean {
  const character = tx.db.character.id.find(state.characterId);
  if (!character || character.locationId !== 0n) return false;
  const arrival = findRegionStart(tx, region.id);
  if (!arrival) return false;

  // The side rows first, the character row last (review A WR-02): a throw part-way leaves him at location 0.
  // Visited places: the first spawn is the first place the character has stood in (no origin).
  markLocationVisited(tx, character.id, arrival.id);
  ensurePoolsForLocation(tx, arrival.id);

  const regionDesc = storedRegionDescription(tx, state) ?? `A ${region.biome || 'mysterious'} region.`;
  let arrivalMsg = `You open your eyes in ${arrival.name}, ${region.name}.\n\n${regionDesc}`;
  const people = peopleAt(tx, arrival.id);
  if (people.length > 0) {
    arrivalMsg += '\n\n' + npcNoticeLine(people);
  }
  arrivalMsg += `\n\nTry [look] to examine your surroundings, or [travel] to move.`;
  const segments = keeperSegments(arrivalMsg);
  tx.db.character.id.update({ ...character, locationId: arrival.id, boundLocationId: arrival.id });
  appendPrivateEvent(tx, character.id, character.ownerUserId, 'narrative', flattenSegments(segments), segments);
  appendPrivateEvent(tx, character.id, character.ownerUserId, 'system',
    pickDiscoveryMessage(region.name, tx.timestamp.microsSinceUnixEpoch));
  return true;
}

/** Newest first: by createdAt, then by id within one transaction (auto-inc ids alone are not an order). */
function newestFirst(a: any, b: any): number {
  const at: bigint = a.createdAt?.microsSinceUnixEpoch ?? 0n;
  const bt: bigint = b.createdAt?.microsSinceUnixEpoch ?? 0n;
  if (at !== bt) return at < bt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Re-run the failed stage of a state that was just handed to its retrier (Phase 51.3.1.2, D-09, D-18):
 * FILL_ERROR re-enqueues the places call (startWorldFill), FAMILIES_ERROR the families call only
 * (startWorldFamilies), so a families failure never reopens the places call and the places are never
 * written twice (T-51.3.1.2-39). 'refused' when the enqueue was refused (the stage's fail function
 * already put the state back in its error step and posted the line). `payer` charges the job to another
 * identity without handing the state over (review A WR-05).
 */
function restartFailedStage(tx: any, handed: any, payer?: any): 'started' | 'refused' {
  const result =
    handed.step === 'FAMILIES_ERROR' ? startWorldFamilies(tx, handed, payer) : startWorldFill(tx, handed, payer);
  return result === 'refused' ? 'refused' : 'started';
}

/**
 * Stage 2 retry for the explore intent (Plan 43-11; Phase 51.3.1.2 D-09, D-18). A state matches the
 * character when its source location is the character's location (the crossing, which stays while the
 * region is held) or its generated region is the location's region.
 *  - 'busy':    a matching state is FILLING or FILLING_FAMILIES (nothing written);
 *  - 'started': the newest matching FILL_ERROR or FAMILIES_ERROR state was handed to the explorer and
 *               only its failed stage re-enqueued: world_gen for FILL_ERROR, world_gen_families for
 *               FAMILIES_ERROR (a families failure never reopens the places call);
 *  - 'refused': that enqueue was refused (the state is back in its error step, the refusal line posted);
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

  if (states.some((s: any) => s.step === 'FILLING' || s.step === 'FILLING_FAMILIES')) return 'busy';
  const failed = states
    .filter((s: any) => s.step === 'FILL_ERROR' || s.step === 'FAMILIES_ERROR')
    .sort(newestFirst)[0];
  if (!failed) return 'none';

  const handed = {
    ...failed,
    playerId,
    characterId: character.id,
    updatedAt: tx.timestamp,
  };
  tx.db.world_gen_state.id.update(handed);
  return restartFailedStage(tx, handed);
}

// ---------------------------------------------------------------------------
// Stage 2b: the creature families (Phase 51.3.1.2, D-01, D-08, D-09, D-66)
// ---------------------------------------------------------------------------

/** A stored JSON array of strings (the region's threats); anything unreadable reads as none. */
function storedStringList(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v: unknown): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** The 2b flag of a place as it stands (the shape rules already ran, D-05): hub beats safe, else ordinary. */
function familiesPlaceFlag(loc: any): 'hub' | 'safe' | 'ordinary' {
  if (loc?.isHub === true) return 'hub';
  if (loc?.isSafe === true) return 'safe';
  return 'ordinary';
}

/**
 * The stage-2b input, read back from the rows stage 2a stored (never from either reply, so 2b sees
 * exactly what the players see): the region's charted places (regionChartedPlaces: the arrival point
 * first, the Edge Beyond doorway never) with their hub, safe or ordinary flag after the server's shape
 * rules, the hub names, the dominant faction and threats, familyCount = familyCountFor(real places)
 * (D-66) and feudCount = feudCountFor(familyCount, familySeed(regionId)) (D-70, D-71): the same counts
 * writeRegionFamilies keeps. Strings go in raw; the route builder sanitizes them. Throws a plain Error
 * when the region or its arrival point is missing.
 */
export function buildWorldFamiliesInput(tx: any, genState: any): WorldFamiliesInput {
  const region =
    genState.generatedRegionId !== undefined && genState.generatedRegionId !== null
      ? tx.db.region.id.find(genState.generatedRegionId)
      : undefined;
  if (!region) throw new Error('World families: the generated region is missing');
  if (!findRegionStart(tx, region.id)) throw new Error('World families: the region has no start location');
  const places = regionChartedPlaces(tx, region.id);

  const familyCount = familyCountFor(places.length);
  return {
    regionName: String(region.name ?? ''),
    biome: region.biome ?? 'plains',
    dominantFaction: region.dominantFaction || undefined,
    threats: storedStringList(region.threats),
    places: places.map((loc: any) => ({
      name: String(loc.name ?? ''),
      terrainType: String(loc.terrainType ?? ''),
      flag: familiesPlaceFlag(loc),
    })),
    hubNames: places.filter((loc: any) => loc.isHub === true).map((loc: any) => String(loc.name ?? '')),
    familyCount,
    feudCount: feudCountFor(familyCount, familySeed(region.id)),
  };
}

/**
 * Stage 2b start, in the caller's transaction (D-01): enqueue the world_gen_families job for this state
 * and move it to FILLING_FAMILIES. One job per state (dedupe by route and sourceKey worldGen(genStateId):
 * a second call while it is active is 'duplicate'); the route is cap-exempt and never retries itself
 * (T-51.3.1.2-26). A refused enqueue (kill switch or ceiling: the resting line; anything else: the
 * refused line) or an input that cannot be built fails the families instead: FAMILIES_ERROR, never
 * FILL_ERROR, so the places are never written twice (D-08, T-51.3.1.2-25). Plan 11 calls it from the 2a
 * apply; the [explore] retries (retryWorldFill, retryStarterWorldGen) call it for a FAMILIES_ERROR state.
 * `payer` is the identity the job is charged to when it is not the state's own player (review A WR-05).
 */
export function startWorldFamilies(tx: any, genState: any, payer?: any): 'enqueued' | 'duplicate' | 'refused' {
  let input: WorldFamiliesInput;
  try {
    input = buildWorldFamiliesInput(tx, genState);
  } catch {
    failWorldFamilies(tx, genState, WORLD_FAMILIES_FAILED_MESSAGE);
    return 'refused';
  }

  const result = enqueueLlmJob(tx, {
    route: 'world_gen_families',
    playerId: payer ?? genState.playerId,
    characterId: genState.characterId,
    sourceKey: SOURCE_KEYS.worldGen(genState.id),
    request: { genStateId: genState.id.toString(), input: encodeRouteInput(input) },
  });

  if (result.refused) {
    failWorldFamilies(
      tx,
      genState,
      isRestingErrorCode(result.refused) ? LLM_RESTING_LINE : WORLD_FILL_REFUSED_MESSAGE,
    );
    return 'refused';
  }

  const current = tx.db.world_gen_state.id.find(genState.id) ?? genState;
  tx.db.world_gen_state.id.update({
    ...current,
    step: 'FILLING_FAMILIES',
    errorMessage: undefined,
    updatedAt: tx.timestamp,
  });
  return result.created ? 'enqueued' : 'duplicate';
}

/**
 * Stage 2b failed (call failure, malformed or empty reply, refused enqueue, unreadable input): the state
 * becomes FAMILIES_ERROR with the in-voice message as its public errorMessage (D-08, D-09). Never
 * FILL_ERROR, so the places stage 2a wrote are never written again; no hub is placed and no row is
 * changed or removed (T-51.3.1.2-25). The lines (postFillFailure, D-18): a new character still in
 * creation gets the owner's section 5 line (WORLD_FAMILIES_FAILED_MESSAGE with the [explore] hint), or the
 * resting line with it when the kill switch or ceiling refused; the triggering character and everyone at
 * the crossing get the 7d line (or that resting line).
 */
export function failWorldFamilies(tx: any, genState: any, message: string): void {
  const current = tx.db.world_gen_state.id.find(genState.id);
  if (current) {
    tx.db.world_gen_state.id.update({
      ...current,
      step: 'FAMILIES_ERROR',
      errorMessage: message,
      updatedAt: tx.timestamp,
    });
  }
  const creationLine =
    message === LLM_RESTING_LINE ? `${LLM_RESTING_LINE}${EXPLORE_HINT}` : `${WORLD_FAMILIES_FAILED_MESSAGE}${EXPLORE_HINT}`;
  postFillFailure(tx, current ?? genState, message, creationLine);
}

/**
 * The charted places of a region (Phase 51.3.1.2): the arrival point (findRegionStart) first, then
 * the region's other non-uncharted places by id. The Edge Beyond doorway is never one of them. The
 * families writer counts these (D-66) and Plan 08 builds the stage-2b input from them. Iterates
 * location (no region index); callers are rare, per-region paths.
 */
export function regionChartedPlaces(tx: any, regionId: bigint): any[] {
  const arrival = findRegionStart(tx, regionId);
  const others = [...tx.db.location.iter()]
    .filter((loc: any) => loc.regionId === regionId && loc.terrainType !== 'uncharted' && (!arrival || loc.id !== arrival.id))
    .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return arrival ? [arrival, ...others] : others;
}

/** What the stage-2a writer did: the places it wrote and the doorway, or a refusal before any write. */
export type RegionPlacesResult =
  | { ok: true; locations: any[]; boundary: any }
  | { ok: false; reason: 'too_few' };

/**
 * Stage 2a write (Phase 51.3.1.2): the region facts, the new places, their connections, the hubs and
 * their services, the place words, the NPCs and the Edge Beyond doorway around the arrival point stage 1
 * wrote. It never writes a creature family, a pool or an enemy template (stage 2b does,
 * writeRegionFamilies). Never renames or duplicates stage-1 content.
 *
 * `opts.placeCount` is the server's place count for the region (placeCountFor, 8-10, the arrival point
 * included): at most placeCount - 1 new places are kept, in reply order, and a reply that leaves fewer
 * than REGION_PLACES_FLOOR places in all writes nothing and returns too_few. null (a job asked without
 * a count, in flight at the publish) keeps at most REGION_PLACES_MAX - 1 and has no floor (D-03).
 *
 * The model's levelOffset is never read (D-04) and its connectsTo, isSafe and hub marks are only
 * inputs to the server rules (D-05, D-07; T-51.3.1.2-13, T-51.3.1.2-14).
 */
export function writeRegionPlaces(
  tx: any,
  fill: any,
  genState: any,
  region: any,
  startLocation: any,
  opts: { placeCount: number | null },
): RegionPlacesResult {
  const reply = fill && typeof fill === 'object' ? fill : {};

  // 1. Usable places (D-03): objects whose name is not taken yet, case-insensitively, the arrival
  //    point's name first. Collecting stops at the most the server could keep (T-51.3.1.2-13).
  const most = acceptedNewPlaces(Number.MAX_SAFE_INTEGER, opts.placeCount).keep;
  const taken = new Set<string>([lower(startLocation.name)]);
  const usable: { item: any; name: string }[] = [];
  const locationItems: any[] = Array.isArray(reply.locations) ? reply.locations : [];
  for (const item of locationItems) {
    if (usable.length >= most) break;
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || 'Unknown Location');
    if (taken.has(lower(name))) continue;
    taken.add(lower(name));
    usable.push({ item, name });
  }

  // 2-3. The place count and the floor (D-03): a short reply returns before any write (T-51.3.1.2-15).
  const accepted = acceptedNewPlaces(usable.length, opts.placeCount);
  if (!accepted.ok) return { ok: false, reason: 'too_few' };
  const kept = usable.slice(0, accepted.keep);

  // 4. Canonical facts the stage-1 reply did not carry.
  const current = tx.db.region.id.find(region.id) ?? region;
  tx.db.region.id.update({
    ...current,
    dominantFaction: reply.dominantFaction || current.dominantFaction || undefined,
    landmarks: reply.landmarks ? JSON.stringify(reply.landmarks) : current.landmarks,
    threats: reply.threats ? JSON.stringify(reply.threats) : current.threats,
  });

  // 5. The shape (D-05), on node indices: 0 is the arrival point, then the kept places in reply order.
  //    connectsTo names resolve against the arrival point and the kept names only (a trimmed or unknown
  //    name is dropped); shapeRegionEdges cleans, repairs reachability (an orphan joins the
  //    least-connected reached place) and trims above EXIT_DEGREE_CAP by non-bridge edges only. The
  //    arrival point's passage to the source region and the doorway are outside these edges.
  const indexByName = new Map<string, number>([[lower(startLocation.name), 0]]);
  kept.forEach(({ name }, i) => indexByName.set(lower(name), i + 1));
  const rawEdges: [number, number][] = [];
  kept.forEach(({ item }, i) => {
    if (!Array.isArray(item.connectsTo)) return;
    for (const target of item.connectsTo) {
      const j = indexByName.get(lower(target));
      if (j !== undefined) rawEdges.push([i + 1, j]);
    }
  });
  const count = kept.length + 1;
  const edges = shapeRegionEdges({ count, edges: rawEdges });
  const hops = hopsFrom(count, edges, 0);

  // 6. The kept places. Level offset by the hop gradient (D-04): the arrival point's offset plus one per
  //    LEVEL_HOPS_PER_STEP hops, at most LEVEL_OFFSET_MAX more; the reply's levelOffset is never read.
  //    Place words (D-46): cleaned by the validator, '' when unusable or absent.
  const arrivalNow = tx.db.location.id.find(startLocation.id) ?? startLocation;
  const arrivalOffset: bigint = typeof arrivalNow.levelOffset === 'bigint' ? arrivalNow.levelOffset : 0n;
  const newLocations: any[] = kept.map(({ item, name }, i) => {
    const words = validatePlaceWords(item);
    return tx.db.location.insert({
      id: 0n,
      name,
      description: item.description || `A ${current.biome || 'mysterious'} stretch of ${region.name}.`,
      zone: region.name,
      regionId: region.id,
      levelOffset: levelOffsetForHops(arrivalOffset, hops[i + 1] ?? 0),
      isSafe: item.isSafe === true,
      terrainType: item.terrainType && item.terrainType !== 'uncharted' ? item.terrainType : 'plains',
      bindStone: false,
      craftingAvailable: false,
      shortName: words.shortName,
      placeNoun: words.placeNoun,
      isHub: false,
    });
  });
  const ids: bigint[] = [startLocation.id, ...newLocations.map((row: any) => row.id)];

  // 7. Connections: exactly the shaped edge set (D-05), never one twice.
  for (const [a, b] of edges) {
    if (!isConnected(tx, ids[a]!, ids[b]!)) connectLocations(tx, ids[a]!, ids[b]!);
  }

  // 8. Hubs (D-07: D-60 to D-64 unchanged): the server count, the reply marks on kept places only, then
  //    the rule. A hub is safe.
  const isStarter = genState.sourceRegionId === 0n;
  const keptByName = new Map<string, any>(newLocations.map((row: any) => [lower(row.name), row] as [string, any]));
  const hubs = placeRegionHubs(tx, {
    region: current,
    arrival: startLocation,
    isStarter,
    markedIds: readHubMarks(reply, startLocation, keptByName),
  });

  // 9. The host floor (D-05, SC3): at least MIN_HOST_PLACES places that are neither safe nor a hub, by
  //    flipping the farthest non-hub safe places (after the hub step, so a hub is never flipped). The
  //    arrival point keeps the safety stage 1 gave it.
  const nodesNow = (): ShapeNode[] =>
    ids.map((id, index) => {
      const row = tx.db.location.id.find(id);
      return { index, isSafe: row?.isSafe === true, isHub: row?.isHub === true };
    });
  for (const index of hostFloorFlips({ nodes: nodesNow(), hops })) {
    if (index === 0) continue;
    const row = tx.db.location.id.find(ids[index]!);
    if (row && row.isSafe === true) tx.db.location.id.update({ ...row, isSafe: false });
  }

  // 10. The arrival point's place words from the reply (D-46), after the hub step rewrote its row.
  writeArrivalPlaceWords(tx, startLocation, reply);

  // 11. NPCs (D-06): by exact locationName among the arrival point and the kept places, else at the
  //     arrival point; never a repeat of a name already standing there.
  const byExactName = new Map<string, any>([[startLocation.name, startLocation]]);
  for (const row of newLocations) byExactName.set(row.name, row);
  const npcItems: any[] = Array.isArray(reply.npcs) ? reply.npcs : [];
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

  // 12. A vendor and a banker at each hub, and none anywhere else in the region (D-59).
  settleRegionServices(tx, region.id, hubs);

  // 13. The Edge Beyond doorway (D-05) off boundaryAnchorFor's place: the farthest from the arrival
  //     point by hops, preferring non-safe non-hub places, ties by lowest id (index order is id order).
  const anchor = ids[boundaryAnchorFor({ nodes: nodesNow(), hops })] ?? startLocation.id;
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
    shortName: '',
    placeNoun: '',
    isHub: false,
  });
  connectLocations(tx, anchor, boundary.id);

  return {
    ok: true,
    locations: newLocations.map((row: any) => tx.db.location.id.find(row.id) ?? row),
    boundary,
  };
}

/** What the stage-2b writer did: the family rows, or a refusal decided before any write. */
export type RegionFamiliesResult =
  | { ok: true; families: any[] }
  | { ok: false; reason: 'malformed' | 'empty' };

/**
 * Stage 2b write (Phase 51.3.1.2): the creature families of a region whose places stage 2a wrote.
 *  - The places are regionChartedPlaces as they stand now (the arrival point first, the doorway never),
 *    and the family count is familyCountFor of their number (D-66: 8, 9, 10 places give 12, 13, 15).
 *  - A reply with no families array is malformed; a families array with no usable family is empty
 *    unless `opts.ruleOnlyAllowed` (the legacy one-reply path) lets the rule fill the whole count. Both
 *    refusals return before any write (D-08, T-51.3.1.2-15).
 *  - Otherwise the AI's valid families come first and completeRegionFamilies fills the count by rule
 *    with the seeded feud (D-70, D-71) and a history for every family (D-68); buildAiFamilies places
 *    3-5 per host place (D-67), stores the relations and the feud, and seeds the pools.
 */
export function writeRegionFamilies(
  tx: any,
  reply: any,
  region: any,
  opts: { ruleOnlyAllowed: boolean },
): RegionFamiliesResult {
  if (!reply || typeof reply !== 'object' || !Array.isArray(reply.families)) return { ok: false, reason: 'malformed' };

  const current = tx.db.region.id.find(region.id) ?? region;
  const regionPlaces = regionChartedPlaces(tx, region.id);
  const places = regionPlaces.map(familyPlace);
  const isTaken = takenNameCheck(tx);
  const familyCount = familyCountFor(regionPlaces.length);
  const seed = familySeed(region.id);
  // validateFamilies answers null both for a missing array (ruled out above) and for an array with no
  // usable family: here null means empty.
  const validated = validateFamilies(reply, { regionId: region.id, places, isTaken, familyCount }).families ?? [];
  if (validated.length === 0 && !opts.ruleOnlyAllowed) return { ok: false, reason: 'empty' };

  const { families, feudKeys } = completeRegionFamilies(validated, {
    regionId: region.id,
    regionName: String(current.name ?? ''),
    places,
    isTaken,
    familyCount,
    feudCount: feudCountFor(familyCount, seed),
    seed,
  });
  const rows = buildAiFamilies(tx, region.id, families, feudKeys, regionPlaces, tx.timestamp.microsSinceUnixEpoch);
  return { ok: true, families: rows };
}

/**
 * The legacy one-reply region write, kept for in-flight compatibility: it serves a world_gen reply from
 * a job queued before the 51.3.1.2 publish (one reply carrying the places and the families together).
 *  1. writeRegionPlaces with no place count: no floor, at most REGION_PLACES_MAX - 1 new places, under
 *     the same shape, gradient, hub, host-floor and doorway rules (D-03 to D-07);
 *  2. a reply with a families array: writeRegionFamilies with rule completion allowed, so a reply whose
 *     families all fail still gets the whole count by rule (D-66);
 *  3. an older reply (enemies, no families): its enemy types grouped into families by rule (Plan 09,
 *     D-20, D-25, D-26), with rule histories and a feud by rule (Plan 29), over the charted places.
 */
export function writeRegionFill(
  tx: any,
  fill: any,
  genState: any,
  region: any,
  startLocation: any,
): { locations: any[]; boundary: any | null } {
  const reply = fill && typeof fill === 'object' ? fill : {};
  const placed = writeRegionPlaces(tx, reply, genState, region, startLocation, { placeCount: null });
  if (!placed.ok) return { locations: [], boundary: null };

  if (Array.isArray(reply.families)) {
    writeRegionFamilies(tx, reply, region, { ruleOnlyAllowed: true });
  } else {
    const current = tx.db.region.id.find(region.id) ?? region;
    const enemyTemplateRows = insertReplyEnemyTemplates(tx, reply, current.dangerMultiplier ?? 100n);
    buildRegionFamilies(tx, current, enemyTemplateRows, regionChartedPlaces(tx, region.id), tx.timestamp.microsSinceUnixEpoch);
  }
  return { locations: placed.locations, boundary: placed.boundary };
}

/** A region row as the family validator sees it (D-61). */
function familyPlace(loc: any): FamilyPlace {
  return {
    name: String(loc?.name ?? ''),
    isSafe: loc?.isSafe === true,
    isHub: loc?.isHub === true,
    terrainType: String(loc?.terrainType ?? ''),
  };
}

/**
 * The validator's isTaken: family and member names share one name book with every existing enemy
 * template and creature family (Plan 07). Read once per fill (a rare, per-region path).
 */
function takenNameCheck(tx: any): (name: string) => boolean {
  const names = new Set<string>();
  for (const template of tx.db.enemy_template.iter()) names.add(nameKey(String(template.name ?? '')));
  for (const family of tx.db.creature_family.iter()) names.add(nameKey(String(family.name ?? '')));
  return (name: string) => names.has(nameKey(name));
}

/** The relation the other family holds back (D-20): a rival is a rival; prey names its predator. */
const INVERSE_RELATION: Readonly<Record<FamilyRelation, FamilyRelation>> = Object.freeze({
  rival: 'rival',
  prey: 'predator',
  predator: 'prey',
});

/** A place that hosts creature families at the fill (D-18, D-61): charted, neither safe nor a hub. */
function hostsFamilies(place: any): boolean {
  return !!place && place.isSafe !== true && place.isHub !== true && String(place.terrainType ?? '') !== 'uncharted';
}

/**
 * The families of a new-shape region fill (Plan 23, Plan 29; D-25, D-46, D-66 to D-70), `families` being
 * completeRegionFamilies' list (the AI's first, then the rule-made ones):
 * a. each family is created at the region's base level (createFamily: new member templates with the
 *    given names, server stats and the rule abilities, and its history);
 * b. assignRegionFamilies places 3-5 families at each host place (the AI's fit names first, then
 *    terrain, then rule; D-67) and each is linked there, places in id order. Only this new-generation
 *    path places families this way: existing worlds are never re-linked;
 * c. the relations by key, stored both ways (the other family holds the inverse; the rule-made
 *    families are rivals of each other);
 * d. the feud families' mutual 'feud' rows (storeFeud, D-70);
 * e. the creature and resource pools with server home densities (seedRegionPools).
 * `places` are the region rows after the hub step. Returns the family rows.
 */
function buildAiFamilies(
  tx: any,
  regionId: bigint,
  families: readonly ValidatedFamily[],
  feudKeys: readonly string[],
  places: readonly any[],
  now: bigint,
): any[] {
  const baseLevel = regionBaseLevel(tx, regionId);
  const rowByKey = new Map<string, any>();
  for (const def of families) rowByKey.set(def.key, createFamily(tx, regionId, def, baseLevel));

  const hosts = places
    .filter(hostsFamilies)
    .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const assigned = assignRegionFamilies({
    regionId,
    places: hosts.map((place: any) => ({ id: place.id, name: String(place.name ?? ''), terrainType: String(place.terrainType ?? '') })),
    families: families.map((def) => ({ key: def.key, aiFitNames: def.aiFitNames, fitTerrains: def.fitTerrains })),
  });
  const familiesByPlace = new Map<bigint, bigint[]>();
  for (const place of hosts) {
    for (const key of assigned.get(place.id) ?? []) {
      const row = rowByKey.get(key);
      if (row) linkFamilyToPlaces(tx, row.id, [place], familiesByPlace);
    }
  }

  for (const def of families) {
    const row = rowByKey.get(def.key);
    for (const relation of def.relations) {
      const other = rowByKey.get(relation.otherKey);
      if (!row || !other || other.id === row.id) continue;
      createRelations(tx, row.id, [{ otherFamilyId: other.id, kind: relation.kind }]);
      createRelations(tx, other.id, [{ otherFamilyId: row.id, kind: INVERSE_RELATION[relation.kind] }]);
    }
  }
  const feudIds: bigint[] = [];
  for (const key of feudKeys) {
    const row = rowByKey.get(key);
    if (row) feudIds.push(row.id);
  }
  storeFeud(tx, feudIds);
  seedRegionPools(tx, places, familiesByPlace, now);
  return [...rowByKey.values()];
}

/**
 * The arrival point's place words from `fill.arrival` (D-46, validatePlaceWords): a usable word is
 * written over the row as it stands now (the hub step may have rewritten it); an unusable or missing
 * word leaves the stored one as it is.
 */
function writeArrivalPlaceWords(tx: any, startLocation: any, fill: any): void {
  const raw = fill && typeof fill === 'object' ? fill.arrival : undefined;
  if (!raw || typeof raw !== 'object') return;
  const words = validatePlaceWords(raw);
  const row = tx.db.location.id.find(startLocation.id);
  if (!row) return;
  const shortName = words.shortName || row.shortName || '';
  const placeNoun = words.placeNoun || row.placeNoun || '';
  if (shortName === row.shortName && placeNoun === row.placeNoun) return;
  tx.db.location.id.update({ ...row, shortName, placeNoun });
}

/**
 * The enemy types of an older fill reply (`fill.enemies`, the shape before Plan 23) as enemy templates
 * with role templates and abilities, levels clamped to the region's danger band. Only the rule path
 * (buildRegionFamilies) uses them.
 */
function insertReplyEnemyTemplates(tx: any, fill: any, dangerMultiplier: bigint): any[] {
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
  return enemyTemplateRows;
}
