import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

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

            // Helper to try multiple possible module specifiers for packages that
            // may expose different entry points in different versions/environments.
            const tryImport = async (candidates: string[]) => {
                let lastErr: any = null;
                for (const c of candidates) {
                    try {
                        // @ts-ignore - runtime-only dynamic import
                        const mod = await dynamicImport(c);
                        return (mod && mod.default) ? mod.default : mod;
                    } catch (err) {
                        lastErr = err;
                        // try next candidate
                    }
                }
                throw lastErr;
            };

            // Try several variants to handle different packaging/exports setups
            const AjvPkg = await tryImport(['ajv', 'ajv/dist/ajv.js', 'ajv/lib/ajv.js']);
            const addFormatsPkg = await tryImport(['ajv-formats', 'ajv-formats/dist/ajv-formats.js', 'ajv-formats/dist/ajv-formats.cjs']);

            ajv = new AjvPkg({ allErrors: true, strict: false });
            // addFormatsPkg may be a function that takes Ajv instance
            if (typeof addFormatsPkg === 'function') addFormatsPkg(ajv);
            else if (addFormatsPkg && typeof addFormatsPkg.default === 'function') addFormatsPkg.default(ajv);
        } catch (e: any) {
            // If the above dynamic import attempts failed, try a Node resolver
            // fallback: use createRequire + require.resolve to find the actual
            // installed file path and import it via a file:// URL. This helps in
            // environments where package exports or resolver behavior differs.
            try {
                // Lazy require to avoid bundler/static analysis
                // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
                const { createRequire } = await import('module');
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const requireFn = createRequire(import.meta.url);

                const resolveOrNull = (pkgNames: string[]) => {
                    for (const p of pkgNames) {
                        try {
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                            return requireFn.resolve(p);
                        } catch {
                            // continue
                        }
                    }
                    return null as string | null;
                };

                const ajvPath = resolveOrNull(['ajv', 'ajv/dist/ajv.js', 'ajv/lib/ajv.js']);
                const formatsPath = resolveOrNull(['ajv-formats', 'ajv-formats/dist/ajv-formats.js', 'ajv-formats/dist/ajv-formats.cjs']);

                if (ajvPath && formatsPath) {
                    // import via file:// URL
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const AjvPkg = await import(pathToFileURL(ajvPath).href);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    const addFormatsPkg = await import(pathToFileURL(formatsPath).href);

                    const AjvCtor = (AjvPkg && (AjvPkg as any).default) ? (AjvPkg as any).default : AjvPkg;
                    const addFormatsFn = (addFormatsPkg && (addFormatsPkg as any).default) ? (addFormatsPkg as any).default : addFormatsPkg;

                    ajv = new AjvCtor({ allErrors: true, strict: false });
                    if (typeof addFormatsFn === 'function') addFormatsFn(ajv);
                    else if (addFormatsFn && typeof addFormatsFn.default === 'function') addFormatsFn.default(ajv);
                } else {
                    // eslint-disable-next-line no-console
                    console.warn('Could not load ajv or ajv-formats for schema validation:', e?.message ?? e);
                    ajv = null;
                    return;
                }
            } catch (e2: any) {
                // eslint-disable-next-line no-console
                console.warn('Could not load ajv or ajv-formats for schema validation:', e2?.message ?? e2);
                ajv = null;
                return;
            }
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
