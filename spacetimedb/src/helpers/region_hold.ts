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
// world_gen_state has no region index; the table is small and the region read runs only on
// cross-region travel.
// ============================================================================

import { sanitizeWorldData } from '../data/llm_layers';

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

/** 7c filled with the stored region name, sanitized to one line (no raw angle bracket). */
export function regionOpenedLine(regionName: string): string {
  const name = sanitizeWorldData(regionName, { singleLine: true });
  return REGION_OPENED_TEMPLATE.split('{region name}').join(name);
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

/** Whether a region is open, held, or held after a failure, from every state that generated it. */
export function regionHoldState(tx: any, regionId: bigint): RegionHold | 'open' {
  const steps: string[] = [];
  for (const s of tx.db.world_gen_state.iter()) {
    if (s.generatedRegionId === undefined || s.generatedRegionId === null || s.generatedRegionId !== regionId) continue;
    steps.push(s.step);
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
 * nothing is ever held, and travel back toward an older (open) region stays open.
 */
export function travelHoldRefusal(tx: any, fromLocation: any, toLocation: any): string | null {
  if (!fromLocation || !toLocation) return null;
  if (fromLocation.regionId === toLocation.regionId) return null;
  const hold = regionHoldState(tx, toLocation.regionId);
  if (hold === 'held') return REGION_HOLD_REFUSED_LINE;
  if (hold === 'held_failed') return REGION_HOLD_FAILED_LINE;
  return null;
}
