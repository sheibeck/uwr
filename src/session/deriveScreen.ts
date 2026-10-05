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
  | { kind: 'noCharacters' }
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

  // 'connected' or 'reconnecting': decide from the session data.
  if (!input.playerLoaded || input.userId === null) return splash('signingIn');
  // The "no characters" note must never flash before the rows arrive.
  if (!input.charactersApplied) return splash('signingIn');
  if (input.activeCharacterId !== null) {
    return input.activeCharacterLoaded ? { kind: 'frame' } : splash('signingIn');
  }
  if (input.characterCount === 0) return { kind: 'noCharacters' };
  return { kind: 'picker' };
}
