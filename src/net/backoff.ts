// Reconnect schedule: 1 s, 2 s, 5 s, 10 s, 20 s, then every 30 s.
export const BACKOFF_MS: readonly number[] = [1000, 2000, 5000, 10000, 20000, 30000];

export function backoffDelayMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 0) return BACKOFF_MS[0];
  const index = Math.min(Math.floor(attempt), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}
