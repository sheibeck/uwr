import { effectScope, toRef } from 'vue';
import type { GameData } from '../game/context';
import type { LedgerData } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import type { ActionRunner } from '../ledger/actionRunner';

// The Inventory screen and its header actions (Organize) are sibling components (the frame renders
// the header slots beside the body), so they share one action runner per ledger hub. A header
// action's pending state and rejection behave like any bag action, and the screen's notice line
// shows the rejection. The runner is created in a detached effect scope, so no component scope owns
// it and it keeps working after the component that asked first unmounts. Entries go away with the
// hub (WeakMap).
const RUNNERS = new WeakMap<LedgerData, ActionRunner>();

export function bagRunner(ledger: LedgerData, game: GameData): ActionRunner {
  const known = RUNNERS.get(ledger);
  if (known) return known;
  const runner = effectScope(true).run(() =>
    createActionRunner({
      online: toRef(() => game.connected.value && ledger.reducers.value !== null),
    }),
  )!;
  RUNNERS.set(ledger, runner);
  return runner;
}
