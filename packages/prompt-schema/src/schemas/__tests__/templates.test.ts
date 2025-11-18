import { describe, it, expect } from 'vitest';
import { PromptTemplate, extractPlaceholders, validateTemplatePlaceholders } from '../templates.js';

describe('PromptTemplate schema and helpers', () => {
    it('parses a valid prompt template', () => {
        const sample = {
            id: 'greet_npc_v1',
            version: '0.1.0',
            name: 'Greet NPC',
            description: 'Template for greeting an NPC',
            template: 'You approach {{npcName}} and say "Hello, {{playerName}}."',
            temperature: 0.7,
            maxTokens: 300,
            safetyProfile: 'DEFAULT',
            outputSchemaRef: 'narrative:v1'
        };
        const parsed = PromptTemplate.parse(sample);
        expect(parsed.name).toBe('Greet NPC');
    });

    it('extracts placeholders', () => {
        const t = 'Look at {{ target }} then tell {{playerName}}';
        const placeholders = extractPlaceholders(t);
        expect(placeholders.sort()).toEqual(['playerName', 'target'].sort());
    });

    it('validateTemplatePlaceholders throws on no placeholders', () => {
        const bad = {
            id: 'bad',
            version: '0.0.1',
            name: 'Bad',
            template: 'No placeholders here'
        } as any;
        expect(() => validateTemplatePlaceholders(bad)).toThrow();
    });
});
