import type { ConsoleApi, GameData } from '../game/context';
import { createActionRunner, reportRejections } from '../ledger/actionRunner';
import type { ActionRunner } from '../ledger/actionRunner';
import { createPartyActions } from './partyActions';
import type { PartyActions } from './partyActions';

// The setup every party control shares (the player menu, the invite card, Invited · waiting and the
// Travel with leader switch): an offline-aware action runner, the party action layer on it, and the
// one client-rejection report (51.1 review WR-01). A rejected call writes the shared send error
// line to the feed (reportRejections), which the mobile Party sheet's NoticeLine also shows, so no
// control needs a copy of its own. Server refusals arrive as the server's own lines. Call it from a
// component's setup; the runner is per component (pending and dedupe are per surface).

export interface PartyActionsSetup {
  runner: ActionRunner;
  actions: PartyActions;
}

export function usePartyActions(
  game: Pick<GameData, 'connected' | 'characterId' | 'reducers' | 'feed'>,
  consoleApi: Pick<ConsoleApi, 'whisperTo' | 'examine' | 'prefill'>,
): PartyActionsSetup {
  const runner = createActionRunner({ online: game.connected });
  reportRejections(runner, game.feed);
  return { runner, actions: createPartyActions({ game, consoleApi, runner }) };
}
