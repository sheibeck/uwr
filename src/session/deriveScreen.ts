import type { ConnectionStatus } from '../net/connection';

// Same union as the connection controller's status (type-only import: no runtime
// dependency on the auth module). Drift is caught by the compiler where the two meet.
export type LinkStatus = ConnectionStatus;

export type SplashState =
  | 'idle'
  | 'redirecting'
  | 'connecting'
  | 'signingIn'
  | 'sessionExpired'
  | 'signInFailed'
  | 'unreachable';

export type AppScreen =
  | { kind: 'splash'; state: SplashState }
  | { kind: 'picker' }
  | { kind: 'creation' }
  | { kind: 'frame' };

export interface ScreenInput {
  redirecting: boolean;
  authFailed: boolean;
  hasToken: boolean;
  status: LinkStatus;
  /** my_player applied and a row exists. */
  playerLoaded: boolean;
  userId: bigint | null;
  activeCharacterId: bigint | null;
  charactersApplied: boolean;
  characterCount: number;
  activeCharacterLoaded: boolean;
  /** The active character is loaded and placed (its locationId is not 0). */
  activeCharacterPlaced: boolean;
  /** The my_player or characters subscription reported an error. */
  bindingFailed: boolean;
  /** Connected but the session data has not arrived within the signing-in watchdog. */
  signInTimedOut: boolean;
}

const splash = (state: SplashState): AppScreen => ({ kind: 'splash', state });

/**
 * Pure screen choice. First match wins. While 'reconnecting' the data rules still
 * apply to the stale rows, so a loaded frame stays mounted under the reconnect bar.
 */
export function deriveScreen(input: ScreenInput): AppScreen {
  if (input.redirecting) return splash('redirecting');
  if (input.authFailed) return splash('signInFailed');
  if (input.status === 'rejected' || input.status === 'expired') return splash('sessionExpired');
  if (!input.hasToken) return splash('idle');
  if (input.status === 'idle' || input.status === 'connecting') return splash('connecting');
  if (input.status === 'unreachable') return splash('unreachable');

  // 'connected' or 'reconnecting': decide from the session data. Every "still waiting"
  // outcome gives way to the sign-in failure splash when a subscription errored or the
  // watchdog expired, so the splash never spins forever. Loaded data is never torn down.
  const waiting = input.bindingFailed || input.signInTimedOut ? splash('signInFailed') : splash('signingIn');
  if (!input.playerLoaded || input.userId === null) return waiting;
  // The creation screen must never flash before the rows arrive.
  if (!input.charactersApplied) return waiting;
  if (input.activeCharacterId !== null) {
    if (!input.activeCharacterLoaded) return waiting;
    // A character that exists but is not placed yet keeps the player in creation until the
    // first region places it.
    return input.activeCharacterPlaced ? { kind: 'frame' } : { kind: 'creation' };
  }
  if (input.characterCount === 0) return { kind: 'creation' };
  return { kind: 'picker' };
}
