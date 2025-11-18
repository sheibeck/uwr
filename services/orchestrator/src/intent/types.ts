// Shared intent types to avoid circular imports
// Convenient enum for developer ergonomics. Use `Action.X` in code to get autocompletion and safer refactors.
export enum Action {
    LOOK = 'LOOK',
    TALK = 'TALK',
    MOVE = 'MOVE',
    USE = 'USE',
    ATTACK = 'ATTACK',
    PICK_UP = 'PICK_UP',
    UNKNOWN = 'UNKNOWN',
    ACCEPT_QUEST = 'ACCEPT_QUEST',
    DECLINE_QUEST = 'DECLINE_QUEST',
    DROP_ITEM = 'DROP_ITEM',
    EQUIP = 'EQUIP',
    UNEQUIP = 'UNEQUIP',
    TRADE = 'TRADE',
    OPEN = 'OPEN',
    CLOSE = 'CLOSE',
    INVENTORY = 'INVENTORY',
    INSPECT = 'INSPECT',
    CRAFT = 'CRAFT',
    GATHER = 'GATHER',
    MINE = 'MINE',
    FISH = 'FISH',
    FORAGE = 'FORAGE',
    USE_WORKBENCH = 'USE_WORKBENCH',
    COLLECT = 'COLLECT',
    INTERACT = 'INTERACT',
}

export type InferenceResult = {
    action?: Action;
    confidence: number; // 0..1
    method: 'rule';
};
