import { describe, it, expect } from 'vitest';
import { ActionRequest } from '../action.js';
import { NarrativeResponse } from '../response.js';
import { LoreShard } from '../lore.js';

describe('prompt schemas basic validation', () => {
    it('validates a sample ActionRequest', () => {
        const sample = {
            intent: {
                actorId: '11111111-1111-4111-8111-111111111111',
                action: 'LOOK',
                target: null,
                narrativeGoal: 'Survey the clearing for threats',
                clientTs: Date.now()
            },
            context: {
                region: { id: '22222222-2222-4222-8222-222222222222', name: 'Ashen Vale', dangerLevel: 3, factionControl: null },
                timeOfDay: 'DAY',
                weather: { condition: 'CLEAR', intensity: 0 },
                activeEvents: [],
                playerStatuses: []
            },
            nearbyNPCs: [],
            recentActions: [],
            loreShards: []
        };
        const parsed = ActionRequest.parse(sample);
        // parsed has correct inferred type
        expect((parsed as any).intent.action).toBe('LOOK');
    });

    it('validates a sample NarrativeResponse', () => {
        const sample = {
            narration: 'You peer across the scorched clearing; embers pulse like dying fireflies.',
            diegeticMessages: [],
            resolution: { action: 'LOOK', success: true, summary: 'Area surveyed', effects: [] },
            loreRefsUsed: [],
            safetyFlags: []
        };
        const parsed = NarrativeResponse.parse(sample);
        expect(parsed.resolution.success).toBe(true);
    });

    it('validates lore shard', () => {
        const shard = {
            id: 'world_origin',
            category: 'WORLD',
            canonical: true,
            title: 'Origin of the Vale',
            body: 'In the first surge, spirit-tech fused with root systems beneath Ashen Vale... ',
            lastUpdatedBy: null,
            version: 1
        };
        expect(() => LoreShard.parse(shard)).not.toThrow();
    });
});
