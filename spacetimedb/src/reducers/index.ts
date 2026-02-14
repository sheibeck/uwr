import { registerAuthReducers } from './auth';
import { registerCharacterReducers } from './characters';
import { registerCommandReducers } from './commands';
import { registerCombatReducers } from './combat';
import { registerCorpseReducers } from './corpse';
import { registerGroupReducers } from './groups';
import { registerFoodReducers } from './hunger';
import { registerItemReducers } from './items';
import { registerMovementReducers } from './movement';
import { registerSocialReducers } from './social';
import { registerUiReducers } from './ui';

export const registerReducers = (deps: any) => {
  registerSocialReducers(deps);
  registerAuthReducers(deps);
  registerCharacterReducers(deps);
  registerItemReducers(deps);
  registerMovementReducers(deps);
  registerCommandReducers(deps);
  registerGroupReducers(deps);
  registerCombatReducers(deps);
  registerCorpseReducers(deps);
  registerFoodReducers(deps);
  registerUiReducers(deps);
};
