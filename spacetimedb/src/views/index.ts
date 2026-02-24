import type { ViewDeps } from './types';
import { registerCombatViews } from './combat';
import { registerEffectViews } from './effects';
import { registerFactionViews } from './faction';
import { registerFriendViews } from './friends';
import { registerGroupViews } from './groups';
// Hunger views removed - no longer needed
// Event views removed - event tables (event: true) cannot be accessed in views
import { registerNpcViews } from './npc';
import { registerPlayerViews } from './player';
import { registerQuestViews } from './quests';
import { registerUiViews } from './ui';

export const registerViews = (deps: ViewDeps) => {
  registerPlayerViews(deps);
  registerFriendViews(deps);
  registerGroupViews(deps);
  registerEffectViews(deps);
  registerCombatViews(deps);
  registerNpcViews(deps);
  registerQuestViews(deps);
  registerFactionViews(deps);
  registerUiViews(deps);
};
