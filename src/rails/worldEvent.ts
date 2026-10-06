// World event card for the context rail (47-UI-SPEC "World event card", CON-04).
// The card leads with real objective progress ('Defeat the Invaders 12/20'). The For/Against
// bar appears only when the success or failure counter has moved, so it never implies progress
// that has not happened (owner decision after research; research Q4, S7).
// Number() is used for percentages and fractions only; time math runs on a client clock value.
import { barFraction } from '../frame/vitals';

export interface EventObjectiveView {
  id: bigint;
  name: string;
  current: bigint;
  target: bigint;
  fraction: number;
  text: string;
}

export interface EventSplitView {
  forPct: number;
  againstPct: number;
  forFraction: number;
}

export interface EventCardView {
  id: bigint;
  name: string;
  timeLeft: string | null;
  objectives: EventObjectiveView[];
  split: EventSplitView | null;
  contribution: bigint | null;
  /** Other active events in the region beyond the one shown. */
  more: number;
}

const MICROS_PER_MINUTE = 60_000_000;

/**
 * Two largest units: '3d 4h', '2h 14m', '14m'. null when there is no deadline (0),
 * 'Ending' at or past the deadline, 'Under 1m' below a minute.
 */
export function formatTimeLeft(deadlineAtMicros: bigint, nowMicros: number): string | null {
  if (deadlineAtMicros <= 0n) return null;
  const remaining = Number(deadlineAtMicros) - nowMicros;
  if (!(remaining > 0)) return 'Ending';
  const totalMinutes = Math.floor(remaining / MICROS_PER_MINUTE);
  if (totalMinutes < 1) return 'Under 1m';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Percent split of the two counters; null while both are 0. The second side is 100 minus the first. */
export function eventSplit(successCounter: bigint, failureCounter: bigint): EventSplitView | null {
  const success = successCounter > 0n ? successCounter : 0n;
  const failure = failureCounter > 0n ? failureCounter : 0n;
  const total = success + failure;
  if (total === 0n) return null;
  const forFraction = barFraction(success, total);
  const forPct = Math.round(forFraction * 100);
  return { forPct, againstPct: 100 - forPct, forFraction };
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function eventCard(input: {
  events: readonly {
    id: bigint;
    name: string;
    regionId: bigint;
    status: string;
    deadlineAtMicros: bigint;
    successCounter: bigint;
    failureCounter: bigint;
  }[];
  regionId: bigint | null;
  objectives: readonly {
    id: bigint;
    eventId: bigint;
    name: string;
    currentCount: bigint;
    targetCount: bigint;
  }[];
  contributions: readonly { eventId: bigint; characterId: bigint; count: bigint }[];
  characterId: bigint | null;
  nowMicros: number;
}): EventCardView | null {
  const { regionId } = input;
  if (regionId === null) return null;
  const matching = input.events.filter((e) => e.status === 'active' && e.regionId === regionId);
  if (matching.length === 0) return null;

  // Soonest deadline first; a deadline of 0 (none) sorts last; ties by id.
  matching.sort((a, b) => {
    const aNone = a.deadlineAtMicros <= 0n;
    const bNone = b.deadlineAtMicros <= 0n;
    if (aNone !== bNone) return aNone ? 1 : -1;
    if (!aNone) {
      const byDeadline = compareBigint(a.deadlineAtMicros, b.deadlineAtMicros);
      if (byDeadline !== 0) return byDeadline;
    }
    return compareBigint(a.id, b.id);
  });
  const event = matching[0];

  const objectives = input.objectives
    .filter((o) => o.eventId === event.id)
    .sort((a, b) => compareBigint(a.id, b.id))
    .map(
      (o): EventObjectiveView => ({
        id: o.id,
        name: o.name,
        current: o.currentCount,
        target: o.targetCount,
        fraction: barFraction(o.currentCount, o.targetCount),
        text: `${o.name} ${o.currentCount}/${o.targetCount}`,
      }),
    );

  let contribution: bigint | null = null;
  if (input.characterId !== null) {
    const mine = input.contributions.find(
      (c) => c.eventId === event.id && c.characterId === input.characterId,
    );
    if (mine && mine.count > 0n) contribution = mine.count;
  }

  return {
    id: event.id,
    name: event.name,
    timeLeft: formatTimeLeft(event.deadlineAtMicros, input.nowMicros),
    objectives,
    split: eventSplit(event.successCounter, event.failureCounter),
    contribution,
    more: matching.length - 1,
  };
}
