import fs from 'fs';
import path from 'path';

type ValidateFunction = any;

// We'll create the AJV instance lazily inside loadGeneratedSchemas using dynamic import()
let ajv: any | null = null;

const SCHEMA_DIR = path.resolve(process.cwd(), 'generated', 'schemas');

export const validators: Map<string, ValidateFunction> = new Map();

export async function loadGeneratedSchemas() {
    if (!fs.existsSync(SCHEMA_DIR)) return;

    if (!ajv) {
        try {
            // Avoid bundler static analysis by doing the dynamic import through
            // a Function constructor at runtime. This prevents Vite from
            // attempting to resolve 'ajv' at build/test time while preserving
            // the lazy runtime import behavior.
            // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
            const dynamicImport = (m: string) => new Function('m', 'return import(m)')(m);

            // load ajv and ajv-formats at runtime
            // @ts-ignore - runtime-only import
            const AjvMod: any = await dynamicImport('ajv');
            const AjvPkg = (AjvMod && AjvMod.default) ? AjvMod.default : AjvMod;
            // @ts-ignore - runtime-only import
            const addFormatsMod: any = await dynamicImport('ajv-formats');
            const addFormatsPkg = (addFormatsMod && addFormatsMod.default) ? addFormatsMod.default : addFormatsMod;
            ajv = new AjvPkg({ allErrors: true, strict: false });
            addFormatsPkg(ajv);
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.warn('Could not load ajv or ajv-formats for schema validation:', e?.message ?? e);
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
