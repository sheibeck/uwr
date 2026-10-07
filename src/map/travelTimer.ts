// The region travel timer: the server's ready time minus the server clock, nothing else.
//
// There is no reduction math here (perks and effects change the server's ready time, never this
// helper) and no fixed duration. A past ready time, or no row at all, is Ready: the local database
// can hold a stale, expired travel_cooldown row (CONTEXT "Regions lock only by travel restriction").
// The caller passes game.clock.nowMicros().

export interface TravelTimer {
  running: boolean;
  secondsLeft: number;
}

export function travelTimer(rows: readonly { readyAtMicros: bigint }[], nowMicros: number): TravelTimer {
  let latest: bigint | null = null;
  for (const row of rows) {
    if (latest === null || row.readyAtMicros > latest) latest = row.readyAtMicros;
  }
  if (latest === null) return { running: false, secondsLeft: 0 };
  const remainingMicros = Number(latest) - nowMicros;
  if (!(remainingMicros > 0)) return { running: false, secondsLeft: 0 };
  return { running: true, secondsLeft: Math.ceil(remainingMicros / 1_000_000) };
}

/** 'm:ss', for example 61 reads '1:01'. */
export function formatClock(secondsLeft: number): string {
  const total = Math.max(0, Math.floor(secondsLeft));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/** 'about 1 minute' or 'about {n} minutes': whole minutes rounded up, at least 1. */
export function aboutMinutes(secondsLeft: number): string {
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  return minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`;
}
