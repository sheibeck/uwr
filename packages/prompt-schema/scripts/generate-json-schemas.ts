import fs from 'fs';
import path from 'path';
import { zodToJsonSchema } from 'zod-to-json-schema';

const outDir = path.resolve(process.cwd(), 'generated', 'schemas');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function write(name: string, schema: any) {
    const json = zodToJsonSchema(schema, name);
    const filePath = path.join(outDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
    console.log('wrote', filePath);
}

(async () => {
    // dynamically import the package entry (resolve to .js when running compiled or tsx)
    const schemas = await import('../src/index.js');

    // Export a curated set of top-level schemas
    const mapping: Record<string, any> = {
        ActionRequest: (schemas as any).ActionRequest,
        NarrativeResponse: (schemas as any).NarrativeResponse,
        LoreShard: (schemas as any).LoreShard,
        PromptTemplate: (schemas as any).PromptTemplate
    };

    for (const [name, schema] of Object.entries(mapping)) {
        if (!schema) {
            console.warn('schema not found for', name);
            continue;
        }
        write(name, schema);
    }
})();
