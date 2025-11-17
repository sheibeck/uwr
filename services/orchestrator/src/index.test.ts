import { describe, it, expect } from 'vitest';
import { createOrchestrator } from './index.js';

describe('Orchestrator skeleton', () => {
    it('processes a minimal ActionRequest', () => {
        const orch = createOrchestrator();
        const req = {
            intent: {
                actorId: '11111111-1111-4111-8111-111111111111',
                action: 'LOOK',
                target: null,
                narrativeGoal: 'Inspect clearing',
                clientTs: Date.now()
            },
            context: {
                region: { id: '22222222-2222-4222-8222-222222222222', name: 'Ashen Vale', dangerLevel: 2, factionControl: null },
                timeOfDay: 'DAY',
                weather: { condition: 'CLEAR', intensity: 0 },
                activeEvents: [],
                playerStatuses: []
            },
            nearbyNPCs: [],
            recentActions: [],
            loreShards: ['world_origin']
        };
        const { prompt, response } = orch.processActionRequest(req);
        expect(prompt).toMatch(/PLAYER INTENT/);
        expect(response.resolution.success).toBe(true);
    });
});
