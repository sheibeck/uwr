import { PromptTemplate } from '../schemas/templates.js';

export const GreetNpcTemplate = {
    id: 'greet_npc_v1',
    version: '0.1.0',
    name: 'Greet NPC (v1)',
    description: 'Ask the model to narrate greeting an NPC and return a NarrativeResponse with effects as JSON details',
    template: 'You approach {{npcName}} and say "Hello, {{playerName}}."\nProvide a narrative and structured resolution.',
    temperature: 0.7,
    maxTokens: 400,
    safetyProfile: 'DEFAULT',
    outputSchemaRef: 'narrative:v1'
} as const;

export type GreetNpcTemplateType = typeof GreetNpcTemplate;
