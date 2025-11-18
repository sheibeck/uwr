import fs from 'fs';
import path from 'path';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const SCHEMA_DIR = path.resolve(process.cwd(), 'generated', 'schemas');

export const validators: Map<string, ValidateFunction> = new Map();

export function loadGeneratedSchemas() {
    if (!fs.existsSync(SCHEMA_DIR)) return;
    const files = fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
        const name = path.basename(f, '.json');
        try {
            const raw = fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8');
            const parsed = JSON.parse(raw);
            const validate = ajv.compile(parsed as any);
            validators.set(name, validate);
            // also add by lower-case name
            validators.set(name.toLowerCase(), validate);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('failed to load schema', f, err);
        }
    }
}

export function getValidator(name: string): ValidateFunction | undefined {
    return validators.get(name) ?? validators.get(name.toLowerCase());
}
