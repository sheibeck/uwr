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
            return res.value;
        }
    };
}
