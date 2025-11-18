import fs from 'fs';
import path from 'path';
// We'll dynamically import ajv and ajv-formats at runtime to avoid type/interop issues

type ValidateFunction = any;

// We'll create the AJV instance lazily inside loadGeneratedSchemas using dynamic import()
let ajv: any | null = null;

const SCHEMA_DIR = path.resolve(process.cwd(), 'generated', 'schemas');

export const validators: Map<string, ValidateFunction> = new Map();

export async function loadGeneratedSchemas() {
    if (!fs.existsSync(SCHEMA_DIR)) return;

    if (!ajv) {
        // Dynamically import Ajv and formats to avoid static constructor/type issues.
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const AjvModule = await import('ajv');
            const AjvCtor = (AjvModule && (AjvModule.default ?? AjvModule)) as any;
            ajv = new AjvCtor({ allErrors: true, strict: false });
            try {
                const formats = await import('ajv-formats');
                const addFormatsFn = (formats && (formats.default ?? formats)) as any;
                addFormatsFn(ajv);
            } catch (e) {
                // If addFormats fails for some reason, still continue without formats
                // eslint-disable-next-line no-console
                console.warn('ajv-formats failed to initialize:', (e as any)?.message ?? e);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('ajv failed to initialize:', (e as any)?.message ?? e);
            ajv = null;
            return;
        }
    }

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
