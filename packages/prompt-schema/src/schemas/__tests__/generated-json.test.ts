import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('generated json schemas', () => {
    it('PromptTemplate.json has template property', () => {
        const file = path.resolve(process.cwd(), 'generated', 'schemas', 'PromptTemplate.json');
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        // zod-to-json-schema nests properties under definitions or $defs depending on version;
        // look for 'template' string anywhere in the schema
        const hasTemplate = JSON.stringify(parsed).includes('"template"');
        expect(hasTemplate).toBe(true);
    });
});
