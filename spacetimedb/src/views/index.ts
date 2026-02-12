import type { ViewDeps } from './types';
import { registerCombatViews } from './combat';
import { registerEffectViews } from './effects';
import { registerEventViews } from './events';
import { registerFactionViews } from './faction';
import { registerFriendViews } from './friends';
import { registerGroupViews } from './groups';
import { registerHungerViews } from './hunger';
import { registerNpcViews } from './npc';
import { registerPlayerViews } from './player';
import { registerQuestViews } from './quests';
import { registerUiViews } from './ui';

export const registerViews = (deps: ViewDeps) => {
  registerPlayerViews(deps);
  registerEventViews(deps);
  registerFriendViews(deps);
  registerGroupViews(deps);
  registerEffectViews(deps);
  registerCombatViews(deps);
  registerNpcViews(deps);
  registerQuestViews(deps);
  registerHungerViews(deps);
  registerFactionViews(deps);
  registerUiViews(deps);
};
