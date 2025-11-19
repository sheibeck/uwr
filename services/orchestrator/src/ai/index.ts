// Import built ai-client JS directly so Vite/Vitest can resolve it at runtime
import { createAdapter } from '../../../../packages/ai-client/dist/index.js';

// Re-export a thin shim expected by dispatch.ts
export type ModelAdapter = {
    sendPrompt: (prompt: string) => Promise<any>;
};

export function createModelAdapter(): ModelAdapter {
    const adapter = createAdapter(process.env.ORCHESTRATOR_MODEL);
    return {
        sendPrompt: async (prompt: string) => {
            const res = await adapter.generate(prompt);
            if (!res.ok) throw new Error(res.error.message);
            // If the adapter returned a raw string (e.g. the mock adapter),
            // coerce it into a minimal NarrativeResponse so dispatch and callers
            // that expect an object shape work during tests and local dev.
            const val = res.value;
            if (typeof val === 'string') {
                return {
                    narration: String(val),
                    diegeticMessages: [],
                    resolution: { success: true },
                    loreRefsUsed: [],
                    safetyFlags: []
                } as any;
            }
            return val;
        }
    };
}
