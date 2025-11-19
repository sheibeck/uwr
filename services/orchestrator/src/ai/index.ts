// Dynamically import the built ai-client JS so the orchestrator can handle different
// compiled shapes (named exports, default exports, or nested re-exports). This makes
// runtime resolution resilient during local development and CI.
export type ModelAdapter = {
    sendPrompt: (prompt: string) => Promise<any>;
    generateStructured?: (prompt: string, schema: any, opts?: any) => Promise<any>;
};

function resolveCreateAdapter(mod: any): ((which?: string) => any) {
    if (!mod) throw new Error('ai-client module not found');
    if (typeof mod.createAdapter === 'function') return mod.createAdapter;
    if (mod.default && typeof mod.default.createAdapter === 'function') return mod.default.createAdapter;
    // If module re-exports another ESM file as a namespace, try to find createAdapter there
    for (const k of Object.keys(mod)) {
        const v = (mod as any)[k];
        if (v && typeof v.createAdapter === 'function') return v.createAdapter;
    }
    throw new Error('createAdapter export not found in ai-client module');
}

export async function createModelAdapter(): Promise<ModelAdapter> {
    const mod = await import('../../../../packages/ai-client/dist/index.js');
    const createAdapter = resolveCreateAdapter(mod as any);
    const adapter = createAdapter(process.env.ORCHESTRATOR_MODEL);
    return {
        sendPrompt: async (prompt: string) => {
            const res = await adapter.generate(prompt);
            if (!res.ok) throw new Error(res.error.message);
            return res.value;
        },
        generateStructured: async (prompt: string, schema: any, opts?: any) => {
            if ((adapter as any).generateStructured) {
                return await (adapter as any).generateStructured(prompt, schema, opts);
            }
            return { ok: false, error: { kind: 'parse', message: 'Structured generation not supported by adapter' } };
        }
    };
}
