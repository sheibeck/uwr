export type ActionType = 'LOOK' | 'TALK' | 'MOVE' | 'USE' | 'ATTACK' | 'PICK_UP' | 'UNKNOWN'
    | 'ACCEPT_QUEST' | 'DECLINE_QUEST' | 'DROP_ITEM' | 'EQUIP' | 'UNEQUIP' | 'TRADE' | 'OPEN' | 'CLOSE' | 'INVENTORY' | 'INSPECT'
    | 'CRAFT' | 'GATHER' | 'MINE' | 'FISH' | 'FORAGE' | 'USE_WORKBENCH' | 'COLLECT' | 'INTERACT';


export interface InferenceResult {
    action?: ActionType;
    confidence: number; // 0..1
    method: 'rule';
}

// Synonym lists for POC. Keep these conservative but include common verb forms
// and some noun cues (sword, spear) that indicate attack intent.
const verbMap: Record<string, ActionType> = {
    look: 'LOOK',
    inspect: 'LOOK',
    examine: 'LOOK',
    scan: 'LOOK',
    view: 'LOOK',
    see: 'LOOK',
    observe: 'LOOK',
    watch: 'LOOK',

    talk: 'TALK',
    speak: 'TALK',
    ask: 'TALK',
    converse: 'TALK',
    say: 'TALK',
    tell: 'TALK',

    go: 'MOVE',
    move: 'MOVE',
    walk: 'MOVE',
    run: 'MOVE',
    head: 'MOVE',
    travel: 'MOVE',
    approach: 'MOVE',

    use: 'USE',
    activate: 'USE',
    pull: 'USE',
    push: 'USE',
    operate: 'USE',

    accept: 'ACCEPT_QUEST',
    accepted: 'ACCEPT_QUEST',
    decline: 'DECLINE_QUEST',
    declined: 'DECLINE_QUEST',
    drop: 'DROP_ITEM',
    discard: 'DROP_ITEM',
    equip: 'EQUIP',
    unequip: 'UNEQUIP',
    wear: 'EQUIP',
    remove: 'UNEQUIP',
    trade: 'TRADE',
    barter: 'TRADE',
    open: 'OPEN',
    close: 'CLOSE',
    inventory: 'INVENTORY',
    inv: 'INVENTORY',
    craft: 'CRAFT',
    craftable: 'CRAFT',
    craftings: 'CRAFT',
    gather: 'GATHER',
    gatherer: 'GATHER',
    mine: 'MINE',
    mining: 'MINE',
    fish: 'FISH',
    forage: 'FORAGE',
    collect: 'COLLECT',
    interact: 'INTERACT',

    pick: 'PICK_UP',
    take: 'PICK_UP',
    grab: 'PICK_UP',

    attack: 'ATTACK',
    hit: 'ATTACK',
    strike: 'ATTACK',
    slash: 'ATTACK',
    stab: 'ATTACK',
    thrust: 'ATTACK',
    charge: 'ATTACK',
    lunge: 'ATTACK',
    raise: 'ATTACK'
};

const nounMap: Record<string, ActionType> = {
    sword: 'ATTACK',
    blade: 'ATTACK',
    spear: 'ATTACK',
    dagger: 'ATTACK',
    axe: 'ATTACK',
    bow: 'ATTACK',
    enemy: 'ATTACK',
    battle: 'ATTACK'
};

const resourceNouns: Record<string, ActionType> = {
    wood: 'GATHER',
    logs: 'GATHER',
    ore: 'MINE',
    iron: 'MINE',
    coal: 'MINE',
    fish: 'FISH',
    berries: 'FORAGE',
    herbs: 'FORAGE',
    stone: 'GATHER',
    rock: 'GATHER'
};

const mmoNouns: Record<string, ActionType> = {
    quest: 'ACCEPT_QUEST',
    mission: 'ACCEPT_QUEST',
    task: 'ACCEPT_QUEST',
    chest: 'OPEN',
    door: 'OPEN',
    shop: 'TRADE',
    merchant: 'TRADE',
    vendor: 'TRADE',
    inventory: 'INVENTORY',
    bag: 'INVENTORY',
    backpack: 'INVENTORY'
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

export function inferAction(narrativeGoal: string): InferenceResult {
    if (!narrativeGoal || typeof narrativeGoal !== 'string') return { confidence: 0, method: 'rule' };
    const tokens = tokenize(narrativeGoal);
    if (tokens.length === 0) return { confidence: 0, method: 'rule' };

    // Accumulate scores per action from verbs and noun cues. Earlier tokens are weighted higher.
    const actionTypes: ActionType[] = [
        'LOOK', 'TALK', 'MOVE', 'USE', 'ATTACK', 'PICK_UP', 'UNKNOWN',
        'ACCEPT_QUEST', 'DECLINE_QUEST', 'DROP_ITEM', 'EQUIP', 'UNEQUIP', 'TRADE', 'OPEN', 'CLOSE', 'INVENTORY', 'INSPECT'
    ];

    const scores: Record<ActionType, number> = {} as Record<ActionType, number>;
    for (const a of actionTypes) scores[a] = 0;

    for (let i = 0; i < tokens.length; i++) {
        const raw = tokens[i] as string;
        const t = stem(raw);
        const positionWeight = 1 / (1 + i * 0.12); // earlier tokens slightly stronger

        // verb matches
        if (Object.prototype.hasOwnProperty.call(verbMap, t)) {
            const a = verbMap[t as keyof typeof verbMap] as ActionType | undefined;
            if (a) {
                const key = a as ActionType;
                scores[key] = (scores[key] ?? 0) + positionWeight * 1.0;
            }
        }

        // noun cues (weaker weight)
        if (Object.prototype.hasOwnProperty.call(nounMap, t)) {
            const a = nounMap[t as keyof typeof nounMap] as ActionType | undefined;
            if (a) {
                const key = a as ActionType;
                scores[key] = (scores[key] ?? 0) + positionWeight * 0.6;
            }
        }

        // MMO-specific noun cues (stronger weight)
        if (Object.prototype.hasOwnProperty.call(mmoNouns, t)) {
            const a = mmoNouns[t as keyof typeof mmoNouns] as ActionType | undefined;
            if (a) {
                const key = a as ActionType;
                scores[key] = (scores[key] ?? 0) + positionWeight * 0.9;
            }
        }

        // resource nouns (gathering/crafting cues)
        if (Object.prototype.hasOwnProperty.call(resourceNouns, t)) {
            const a = resourceNouns[t as keyof typeof resourceNouns] as ActionType | undefined;
            if (a) {
                const key = a as ActionType;
                scores[key] = (scores[key] ?? 0) + positionWeight * 0.85;
            }
        }
    }

    // Find best scoring action
    let bestAction: ActionType | undefined = undefined;
    let bestScore = 0;
    for (const k of Object.keys(scores) as ActionType[]) {
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
