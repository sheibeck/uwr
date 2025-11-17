import { describe, it, expect } from 'vitest';
import { ActionRequest } from '../action.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

describe('zod-to-json-schema integration', () => {
    it('produces properties for ActionRequest', () => {
        const schema = zodToJsonSchema(ActionRequest, 'ActionRequest');
        const def = (schema as any).definitions?.ActionRequest;
        expect(def).toBeDefined();
        expect(def.properties.intent).toBeDefined();
        expect(def.properties.context).toBeDefined();
    });
});
