// Import built ai-client JS (types are provided by packages/ai-client/dist/index.d.ts)
import { createAdapter } from '@ai/index';

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
