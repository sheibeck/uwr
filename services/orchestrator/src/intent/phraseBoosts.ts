// Phrase boosts data: simple pattern strings (JS regex) mapped to action keys
// and a weight to add to the scoring heuristic. Kept data-driven for easier
// tuning and possible localization.

import { Action } from './types.js';

export type PhraseBoostEntry = {
    // JS regex pattern string, no flags (we'll use case-insensitive matching)
    pattern: string;
    action: Action;
    weight: number;
};

const phraseBoosts: PhraseBoostEntry[] = [
    // Combat idioms
    { pattern: 'charge into battle', action: Action.ATTACK, weight: 1.6 },
    { pattern: 'sword raised', action: Action.ATTACK, weight: 1.4 },
    { pattern: 'raise my sword', action: Action.ATTACK, weight: 1.4 },
    { pattern: 'ready my (sword|blade|spear|dagger)', action: Action.ATTACK, weight: 1.3 },
    { pattern: 'draw my sword', action: Action.ATTACK, weight: 1.5 },
    { pattern: 'loose an arrow', action: Action.ATTACK, weight: 1.4 },
    { pattern: 'fire (an )?arrow', action: Action.ATTACK, weight: 1.4 },
    { pattern: '\bslash\b', action: Action.ATTACK, weight: 1.0 },
    { pattern: '\bstab\b', action: Action.ATTACK, weight: 1.0 },
    { pattern: '\blunge\b', action: Action.ATTACK, weight: 1.0 },
    { pattern: '\bdefend\b', action: Action.USE, weight: 0.9 },

    // Ranged and tactical
    { pattern: 'shoot the', action: Action.ATTACK, weight: 1.2 },
    { pattern: 'aim at the', action: Action.ATTACK, weight: 1.1 },

    // Crafting / workbench idioms
    { pattern: 'workbench', action: Action.USE_WORKBENCH, weight: 1.5 },
    { pattern: 'alchemy workbench', action: Action.USE_WORKBENCH, weight: 1.6 },
    { pattern: '\bcraft (a|an|the)?', action: Action.CRAFT, weight: 1.6 },
    { pattern: 'make (a|an|the)? potion', action: Action.CRAFT, weight: 1.4 },
    { pattern: 'brew a potion', action: Action.CRAFT, weight: 1.4 },
    { pattern: 'combine the ingredients', action: Action.CRAFT, weight: 1.2 },

    // Gathering idioms
    { pattern: '\bgather (some )?', action: Action.GATHER, weight: 1.2 },
    { pattern: 'collect (some )?', action: Action.GATHER, weight: 1.0 },
    { pattern: 'mine the', action: Action.MINE, weight: 1.4 },
    { pattern: 'fish at', action: Action.FISH, weight: 1.3 },
    { pattern: 'forage for', action: Action.FORAGE, weight: 1.3 },

    // MMO / quest idioms
    { pattern: '\baccept the quest\b', action: Action.ACCEPT_QUEST, weight: 1.6 },
    { pattern: '\baccept the mission\b', action: Action.ACCEPT_QUEST, weight: 1.5 },
    { pattern: '\bopen the chest\b', action: Action.OPEN, weight: 1.4 }
];

export default phraseBoosts;
