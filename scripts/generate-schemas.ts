import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { ActionRequest } from '@prompt/schemas/action.js';
import { NarrativeResponse } from '@prompt/schemas/response.js';
import { LoreShard } from '@prompt/schemas/lore.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const outDir = resolve(process.cwd(), 'generated', 'schemas');
mkdirSync(outDir, { recursive: true });

const schemas = {
    ActionRequest: zodToJsonSchema(ActionRequest, 'ActionRequest'),
    NarrativeResponse: zodToJsonSchema(NarrativeResponse, 'NarrativeResponse'),
    LoreShard: zodToJsonSchema(LoreShard, 'LoreShard')
};

for (const [name, schema] of Object.entries(schemas)) {
    writeFileSync(resolve(outDir, `${name}.json`), JSON.stringify(schema, null, 2));
}

console.log('Generated JSON Schemas:', Object.keys(schemas));
