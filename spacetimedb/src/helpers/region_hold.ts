// ============================================================================
// The region hold (Phase 51.3.1.2, D-15 to D-18)
// ============================================================================
//
// A new region is built in two calls: its places (world_gen, stage 2 FILLING) and then its
// families (FILLING_FAMILIES). Nobody enters it before its generation state is COMPLETE (D-15):
// everyone who reaches the crossing waits there, a party as one. A failure keeps the hold, and
// the failed line names [explore], which retries at the crossing (D-18). COMPLETE opens the way;
// the region economy is not part of the hold (D-16). D-17: the lines below are the owner's.
//
// The four player lines are the owner's approved 7a to 7d choices of
// .planning/phases/51.3.1.2-bigger-regions/51.3.1.2-PROMPT-DRAFT.md (Status: APPROVED 2026-10-09;
// 7a the owner's Alternative, 7b to 7d Recommended), copied with
// `node scripts/llm/prompt_draft.mjs chosen <draft>`. Never edit them without new approval;
// region_hold.test.ts compares them with the draft.
//
// This module imports nothing from helpers/world_gen.ts or helpers/passages.ts (both use it).
//
// Every read goes through world_gen_state.by_source_location, never a scan (code review B, WR-02):
// the table gains a row per character created and per crossing attempt, and the travel check runs
// on every cross-region trip. The states that generated a region are found by the place they
// started from: a region made beyond a crossing has its state at that crossing (the only place
// outside the region linked to its arrival point while it is held), and a starter region has its
// states at source 0 (STARTER_SOURCE_LOCATION_ID). So a trip into a held region always leaves from
// its crossing, and travelHoldRefusal reads only the states at the place being left. A starter
// region is never reachable by travel while held: nobody stands in it and no crossing leads in
// until it is whole, so the travel check never reads the starter states.
// ============================================================================

/** 7a: whoever arrives at a crossing while its region is being made. */
export const REGION_HOLD_ARRIVING_LINE =
  'You stand at the edge of the known world, preparing to travel into an unknown region. The sky beyond is darkening.';

/** 7b: travel into a region still being made is refused. */
export const REGION_HOLD_REFUSED_LINE =
  'A great storm brews on the horizon, and the way ahead vanishes into it. It should pass soon, and then the unknown land beyond will open to you. Try [travel] again in a moment.';

/** 7d: the region's making failed; the hold stays and [explore] retries. */
export const REGION_HOLD_FAILED_LINE =
  'The storm on the horizon does not pass. It hangs over the land ahead and shows no sign of moving. Type [explore] to try again.';

/** 7c, with its {region name} placeholder: the way in is open. */
const REGION_OPENED_TEMPLATE =
  'The storm on the horizon breaks and rolls away. Beyond it lies {region name}, and the way in is open. Try [travel] to cross.';

/**
 * A stored name made safe for a plain-text player line: angle brackets dropped, every run of
 * whitespace (line breaks included) one space, trimmed. The client renders event text as text, so
 * the prompt sanitizer's HTML escapes (`&lt;`) would show literally (code review B, IN-01);
 * sanitizeWorldData stays for prompt inputs only.
 */
export function plainOneLine(text: string): string {
  return String(text ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 7c filled with the stored region name, on one line with no angle bracket. */
export function regionOpenedLine(regionName: string): string {
  return REGION_OPENED_TEMPLATE.split('{region name}').join(plainOneLine(regionName));
}

/** Steps of a region still being made: travel into it is held (PENDING included, as at the crossing). */
export const REGION_HOLD_IN_PROGRESS_STEPS: readonly string[] = Object.freeze([
  'PENDING',
  'GENERATING',
  'FILLING',
  'FILLING_FAMILIES',
]);

/** Steps of a region whose making failed: still held until [explore] retries it (D-18). */
export const REGION_HOLD_FAILED_STEPS: readonly string[] = Object.freeze(['FILL_ERROR', 'FAMILIES_ERROR']);

export type RegionHold = 'held' | 'held_failed';

/** In progress wins over failed; any other step (COMPLETE, ERROR, HELD) never holds. */
function holdOf(steps: Iterable<string>): RegionHold | null {
  let failed = false;
  for (const step of steps) {
    if (REGION_HOLD_IN_PROGRESS_STEPS.includes(step)) return 'held';
    if (REGION_HOLD_FAILED_STEPS.includes(step)) failed = true;
  }
  return failed ? 'held_failed' : null;
}

/** The source location of every starter state (a first region has no crossing). */
export const STARTER_SOURCE_LOCATION_ID = 0n;

/**
 * Whether a region is open, held, or held after a failure, from the states that generated it and
 * started at one of `sources` (index lookups through by_source_location only). The default reads
 * the starter states, which is what the starter-region reuse in creation asks about; a region made
 * beyond a crossing is asked about with that crossing's id.
 */
export function regionHoldState(
  tx: any,
  regionId: bigint,
  sources: readonly bigint[] = [STARTER_SOURCE_LOCATION_ID],
): RegionHold | 'open' {
  const steps: string[] = [];
  for (const source of sources) {
    for (const s of tx.db.world_gen_state.by_source_location.filter(source)) {
      if (s.generatedRegionId === undefined || s.generatedRegionId === null || s.generatedRegionId !== regionId) continue;
      steps.push(s.step);
    }
  }
  return holdOf(steps) ?? 'open';
}

/** Whether a place is a held crossing: the source location of a state still in progress or failed. */
export function crossingHoldState(tx: any, locationId: bigint): RegionHold | null {
  const steps: string[] = [];
  for (const s of tx.db.world_gen_state.by_source_location.filter(locationId)) steps.push(s.step);
  return holdOf(steps);
}

/**
 * The refusal line for a trip into a held region, or null when the trip may go: inside one region
 * nothing is ever held, and travel back toward an older (open) region stays open. Only the states
 * at the place being left are read (its crossing states, one index lookup; see the header).
 */
export function travelHoldRefusal(tx: any, fromLocation: any, toLocation: any): string | null {
  if (!fromLocation || !toLocation) return null;
  if (fromLocation.regionId === toLocation.regionId) return null;
  const hold = regionHoldState(tx, toLocation.regionId, [fromLocation.id]);
  if (hold === 'held') return REGION_HOLD_REFUSED_LINE;
  if (hold === 'held_failed') return REGION_HOLD_FAILED_LINE;
  return null;
}
