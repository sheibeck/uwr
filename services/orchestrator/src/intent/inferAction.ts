// Shared types imported from ./types.ts

// Synonym lists for POC. Keep these conservative but include common verb forms
// and some noun cues (sword, spear) that indicate attack intent.
import { Action, InferenceResult } from './types.js';

const verbMap: Record<string, Action> = {
    look: Action.LOOK,
    inspect: Action.LOOK,
    examine: Action.LOOK,
    scan: Action.LOOK,
    view: Action.LOOK,
    see: Action.LOOK,
    observe: Action.LOOK,
    watch: Action.LOOK,

    talk: Action.TALK,
    speak: Action.TALK,
    ask: Action.TALK,
    converse: Action.TALK,
    say: Action.TALK,
    tell: Action.TALK,

    go: Action.MOVE,
    move: Action.MOVE,
    walk: Action.MOVE,
    run: Action.MOVE,
    head: Action.MOVE,
    travel: Action.MOVE,
    approach: Action.MOVE,

    use: Action.USE,
    activate: Action.USE,
    pull: Action.USE,
    push: Action.USE,
    operate: Action.USE,

    accept: Action.ACCEPT_QUEST,
    accepted: Action.ACCEPT_QUEST,
    decline: Action.DECLINE_QUEST,
    declined: Action.DECLINE_QUEST,
    drop: Action.DROP_ITEM,
    discard: Action.DROP_ITEM,
    equip: Action.EQUIP,
    unequip: Action.UNEQUIP,
    wear: Action.EQUIP,
    remove: Action.UNEQUIP,
    trade: Action.TRADE,
    barter: Action.TRADE,
    open: Action.OPEN,
    close: Action.CLOSE,
    inventory: Action.INVENTORY,
    inv: Action.INVENTORY,
    craft: Action.CRAFT,
    craftable: Action.CRAFT,
    craftings: Action.CRAFT,
    gather: Action.GATHER,
    gatherer: Action.GATHER,
    mine: Action.MINE,
    mining: Action.MINE,
    fish: Action.FISH,
    forage: Action.FORAGE,
    collect: Action.COLLECT,
    interact: Action.INTERACT,

    pick: Action.PICK_UP,
    take: Action.PICK_UP,
    grab: Action.PICK_UP,

    attack: Action.ATTACK,
    hit: Action.ATTACK,
    strike: Action.ATTACK,
    slash: Action.ATTACK,
    stab: Action.ATTACK,
    thrust: Action.ATTACK,
    charge: Action.ATTACK,
    lunge: Action.ATTACK,
    raise: Action.ATTACK
};

const nounMap: Record<string, Action> = {
    sword: Action.ATTACK,
    blade: Action.ATTACK,
    spear: Action.ATTACK,
    dagger: Action.ATTACK,
    axe: Action.ATTACK,
    bow: Action.ATTACK,
    enemy: Action.ATTACK,
    battle: Action.ATTACK
};

const resourceNouns: Record<string, Action> = {
    wood: Action.GATHER,
    logs: Action.GATHER,
    ore: Action.MINE,
    iron: Action.MINE,
    coal: Action.MINE,
    fish: Action.FISH,
    berries: Action.FORAGE,
    herbs: Action.FORAGE,
    stone: Action.GATHER,
    rock: Action.GATHER
};

const mmoNouns: Record<string, Action> = {
    quest: Action.ACCEPT_QUEST,
    mission: Action.ACCEPT_QUEST,
    task: Action.ACCEPT_QUEST,
    chest: Action.OPEN,
    door: Action.OPEN,
    shop: Action.TRADE,
    merchant: Action.TRADE,
    vendor: Action.TRADE,
    inventory: Action.INVENTORY,
    bag: Action.INVENTORY,
    backpack: Action.INVENTORY
};

// Simple tokenization: split on non-word chars, lowercase.
function tokenize(s: string): string[] {
    return (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Very small stemmer: remove common verb suffixes to match base forms
function stem(token: string): string {
    if (token.endsWith('ing') && token.length > 4) return token.slice(0, -3);
    if (token.endsWith('ed') && token.length > 3) return token.slice(0, -2);
    if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
    return token;
}

import phraseBoosts from './phraseBoosts.js';
import { Action, InferenceResult } from './types.js';

export function inferAction(narrativeGoal: string): InferenceResult {
    if (!narrativeGoal || typeof narrativeGoal !== 'string') return { confidence: 0, method: 'rule' };
    const tokens = tokenize(narrativeGoal);
    if (tokens.length === 0) return { confidence: 0, method: 'rule' };

    const lower = narrativeGoal.toLowerCase();

    // Accumulate scores per action from verbs and noun cues. Earlier tokens are weighted higher.
    const actionTypes: Action[] = [
        Action.LOOK, Action.TALK, Action.MOVE, Action.USE, Action.ATTACK, Action.PICK_UP, Action.UNKNOWN,
        Action.ACCEPT_QUEST, Action.DECLINE_QUEST, Action.DROP_ITEM, Action.EQUIP, Action.UNEQUIP, Action.TRADE, Action.OPEN, Action.CLOSE, Action.INVENTORY, Action.INSPECT
    ];

    const scores: Record<Action, number> = {} as Record<Action, number>;
    for (const a of actionTypes) scores[a] = 0;

    for (let i = 0; i < tokens.length; i++) {
        const raw = tokens[i] as string;
        const t = stem(raw);
        const positionWeight = 1 / (1 + i * 0.12); // earlier tokens slightly stronger

        // verb matches
        if (Object.prototype.hasOwnProperty.call(verbMap, t)) {
            const a = verbMap[t as keyof typeof verbMap] as Action | undefined;
            if (a) {
                const key = a as Action;
                scores[key] = (scores[key] ?? 0) + positionWeight * 1.0;
            }
        }

        // noun cues (weaker weight)
        if (Object.prototype.hasOwnProperty.call(nounMap, t)) {
            const a = nounMap[t as keyof typeof nounMap] as Action | undefined;
            if (a) {
                const key = a as Action;
                scores[key] = (scores[key] ?? 0) + positionWeight * 0.6;
            }
        }

        // MMO-specific noun cues (stronger weight)
        if (Object.prototype.hasOwnProperty.call(mmoNouns, t)) {
            const a = mmoNouns[t as keyof typeof mmoNouns] as Action | undefined;
            if (a) {
                const key = a as Action;
                scores[key] = (scores[key] ?? 0) + positionWeight * 0.9;
            }
        }

        // resource nouns (gathering/crafting cues)
        if (Object.prototype.hasOwnProperty.call(resourceNouns, t)) {
            const a = resourceNouns[t as keyof typeof resourceNouns] as Action | undefined;
            if (a) {
                const key = a as Action;
                scores[key] = (scores[key] ?? 0) + positionWeight * 0.85;
            }
        }
    }

    // Apply data-driven phrase boosts after token scoring
    for (const b of phraseBoosts) {
        try {
            const re = new RegExp(b.pattern, 'i');
            if (re.test(narrativeGoal)) {
                const key = b.action as Action;
                scores[key] = (scores[key] ?? 0) + b.weight;
            }
        } catch (e) {
            // ignore invalid patterns
        }
    }

    // Find best scoring action
    let bestAction: Action | undefined = undefined;
    let bestScore = 0;
    for (const k of Object.keys(scores) as Action[]) {
        const s = scores[k] || 0;
        if (s > bestScore) {
            bestScore = s;
            bestAction = k;
        }
    }

    if (!bestAction || bestScore <= 0) return { confidence: 0, method: 'rule' };

    // Map raw score to a 0..1 confidence. Heuristic: saturate around 1.5
    const confidence = Math.min(1, bestScore / 1.5);
    return { action: bestAction, confidence, method: 'rule' };
}

export default inferAction;
