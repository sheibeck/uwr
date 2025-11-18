import * as mock from './mock.js';

export type ModelAdapter = {
    sendPrompt: (prompt: string) => Promise<any>;
};

export function createModelAdapter(): ModelAdapter {
    const which = process.env.ORCHESTRATOR_MODEL || 'mock';
    if (which === 'mock') return { sendPrompt: mock.sendPrompt };
    throw new Error(`Unknown ORCHESTRATOR_MODEL: ${which}`);
}
