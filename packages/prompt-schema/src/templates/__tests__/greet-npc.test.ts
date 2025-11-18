import { describe, it, expect } from 'vitest';
import { GreetNpcTemplate } from '../greet-npc.js';
import { PromptTemplate, extractPlaceholders } from '../../schemas/templates.js';

describe('GreetNpcTemplate', () => {
    it('parses with PromptTemplate and has placeholders', () => {
        const parsed = PromptTemplate.parse(GreetNpcTemplate as any);
        expect(parsed.id).toBe('greet_npc_v1');
        const placeholders = extractPlaceholders(parsed.template);
        expect(placeholders.length).toBeGreaterThan(0);
    });
});
