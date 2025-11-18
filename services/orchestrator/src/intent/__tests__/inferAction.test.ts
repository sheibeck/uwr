import { describe, it, expect } from 'vitest';
import inferAction from '../inferAction.js';
import { Action } from '../types.js';

describe('inferAction - combined tests', () => {
    // Original POC tests
    it('infers LOOK for inspect-like goals', () => {
        const r = inferAction('Inspect the clearing for clues');
        expect(r.action).toBe(Action.LOOK);
        expect(r.confidence).toBeGreaterThan(0);
    });

    it('infers MOVE for go/walk', () => {
        const r = inferAction('Go to the old bridge');
        expect(r.action).toBe(Action.MOVE);
    });

    it('returns low confidence for unknown', () => {
        const r = inferAction('I want to win a prize by daybreak');
        expect(r.confidence).toBe(0);
        expect(r.action).toBeUndefined();
    });

    // MMO examples
    it('infers ACCEPT_QUEST from accepting a quest', () => {
        const r = inferAction('I accept the quest to rescue the villagers');
        expect(r.action).toBe(Action.ACCEPT_QUEST);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers DROP_ITEM from dropping an item', () => {
        const r = inferAction('I drop the rusty sword');
        expect(r.action).toBe(Action.DROP_ITEM);
        expect(r.confidence).toBeGreaterThan(0.4);
    });

    it('infers EQUIP from equipping', () => {
        const r = inferAction('Equip the steel helmet on my head');
        expect(r.action).toBe(Action.EQUIP);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers OPEN for chests', () => {
        const r = inferAction('Open the treasure chest');
        expect(r.action).toBe(Action.OPEN);
        expect(r.confidence).toBeGreaterThan(0.6);
    });

    it('infers TRADE for merchant interactions', () => {
        const r = inferAction('Trade with the merchant at the market');
        expect(r.action).toBe(Action.TRADE);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers INVENTORY for checking inventory', () => {
        const r = inferAction('I check my inventory to see what I have');
        expect(r.action).toBe(Action.INVENTORY);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers ATTACK from charging with sword raised', () => {
        const r = inferAction('I charge into battle, my sword raised!');
        expect(r.action).toBe(Action.ATTACK);
        expect(r.confidence).toBeGreaterThan(0.6);
    });

    // Crafting/gathering examples
    it('infers GATHER for collecting wood', () => {
        const r = inferAction('Gather some wood from the nearby trees');
        expect(r.action).toBe(Action.GATHER);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers MINE for mining ore', () => {
        const r = inferAction('Mine the iron vein');
        expect(r.action).toBe(Action.MINE);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers FISH when fishing', () => {
        const r = inferAction('I fish at the riverbank for dinner');
        expect(r.action).toBe(Action.FISH);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers FORAGE for berries/herbs', () => {
        const r = inferAction('Forage for berries in the bushes');
        expect(r.action).toBe(Action.FORAGE);
        expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('infers USE_WORKBENCH or CRAFT when crafting at a workbench', () => {
        const r = inferAction('Craft a healing potion at the alchemy workbench');
        // either CRAFT or USE_WORKBENCH is acceptable; prefer CRAFT
        expect([Action.CRAFT, Action.USE_WORKBENCH]).toContain(r.action);
        expect(r.confidence).toBeGreaterThan(0.5);
    });
});
