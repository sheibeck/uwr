import { describe, expect, it } from 'vitest';
import { deriveScreen } from './deriveScreen';
import type { AppScreen, ScreenInput } from './deriveScreen';

const base: ScreenInput = {
  redirecting: false,
  authFailed: false,
  hasToken: true,
  status: 'connected',
  playerLoaded: true,
  userId: 1n,
  activeCharacterId: null,
  charactersApplied: true,
  characterCount: 2,
  activeCharacterLoaded: false,
};

const cases: Array<[string, Partial<ScreenInput>, AppScreen]> = [
  ['idle: no token, nothing happening', { hasToken: false, status: 'idle' }, { kind: 'splash', state: 'idle' }],
  ['redirecting', { redirecting: true, hasToken: false, status: 'idle' }, { kind: 'splash', state: 'redirecting' }],
  ['connecting (status connecting)', { status: 'connecting' }, { kind: 'splash', state: 'connecting' }],
  ['reload with stored token derives connecting, never idle', { status: 'idle', hasToken: true }, { kind: 'splash', state: 'connecting' }],
  ['signingIn: player row missing', { playerLoaded: false }, { kind: 'splash', state: 'signingIn' }],
  ['signingIn: userId null', { userId: null }, { kind: 'splash', state: 'signingIn' }],
  ['signingIn: characters not applied', { charactersApplied: false }, { kind: 'splash', state: 'signingIn' }],
  ['signingIn: active character row has not arrived yet', { activeCharacterId: 5n, activeCharacterLoaded: false }, { kind: 'splash', state: 'signingIn' }],
  ['sessionExpired: rejected', { status: 'rejected' }, { kind: 'splash', state: 'sessionExpired' }],
  ['sessionExpired: expired', { status: 'expired' }, { kind: 'splash', state: 'sessionExpired' }],
  ['signInFailed', { authFailed: true, hasToken: false, status: 'idle' }, { kind: 'splash', state: 'signInFailed' }],
  ['unreachable', { status: 'unreachable' }, { kind: 'splash', state: 'unreachable' }],
  ['picker', {}, { kind: 'picker' }],
  ['noCharacters only after characters applied', { characterCount: 0 }, { kind: 'noCharacters' }],
  ['no flash of noCharacters before rows apply', { characterCount: 0, charactersApplied: false }, { kind: 'splash', state: 'signingIn' }],
  ['frame', { activeCharacterId: 5n, activeCharacterLoaded: true }, { kind: 'frame' }],
  ['reconnecting keeps the frame (stale rows)', { status: 'reconnecting', activeCharacterId: 5n, activeCharacterLoaded: true }, { kind: 'frame' }],
  ['reconnecting without a loaded character does not claim the frame', { status: 'reconnecting', userId: null, playerLoaded: false }, { kind: 'splash', state: 'signingIn' }],
  ['after a long outage userId null shows signingIn, not the frame', { status: 'connected', userId: null, activeCharacterId: null, activeCharacterLoaded: false }, { kind: 'splash', state: 'signingIn' }],
  ['redirecting beats authFailed', { redirecting: true, authFailed: true }, { kind: 'splash', state: 'redirecting' }],
  ['authFailed beats rejected', { authFailed: true, status: 'rejected' }, { kind: 'splash', state: 'signInFailed' }],
  ['rejected beats missing token', { status: 'rejected', hasToken: false }, { kind: 'splash', state: 'sessionExpired' }],
  ['missing token beats unreachable', { hasToken: false, status: 'unreachable' }, { kind: 'splash', state: 'idle' }],
];

describe('deriveScreen', () => {
  it.each(cases)('%s', (_name, overrides, expected) => {
    expect(deriveScreen({ ...base, ...overrides })).toEqual(expected);
  });
});
