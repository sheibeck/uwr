import fetch from 'node-fetch';
import { ZodSchema } from 'zod';
import { NarrativeResponse } from '@shared/narrative';
import { NarrativeResponse as NarrativeSchema } from '@shared/narrative';
import OpenAI from 'openai';

export type AIError = {
    kind: 'network' | 'validation' | 'provider' | 'rate_limited' | 'parse' | 'policy';
    message: string;
    details?: any;
};

export type AIResponse<T> = { ok: true; value: T } | { ok: false; error: AIError };

export type GenerateOpts = {
    provider?: string;
    temperature?: number;
    systemPrompt?: string;
    maxTokens?: number;
    useFunctionCall?: boolean;
    maxRetries?: number;
};

export type ModelAdapter = {
    // generate may return free-text or a structured object depending on adapter implementation
    generate: (prompt: string, opts?: GenerateOpts) => Promise<AIResponse<NarrativeResponse | string | any>>;
    generateStructured: <T>(prompt: string, schema: ZodSchema<T>, opts?: GenerateOpts) => Promise<AIResponse<T>>;
};

// Basic JSON extraction helper: find first {...} block or ```json ... ``` fenced block
function extractJson(text: string): string | null {
    const fenced = /```json\s*([\s\S]*?)```/i.exec(text);
    if (fenced && fenced[1]) return fenced[1].trim();
    // Find first brace and try to parse until matching brace
    const first = text.indexOf('{');
    if (first === -1) return null;
    // naive bracket match
    let depth = 0;
    for (let i = first; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        if (depth === 0) return text.slice(first, i + 1);
    }
    return null;
}

export function createMockAdapter(): ModelAdapter {
    return {
        async generate(prompt: string) {
            // Return a structured NarrativeResponse-like object so callers have a stable contract
            const narration = `MOCK: ${prompt.slice(0, 400)}`;
            // Lightweight heuristic to infer the resolved action from prompt text when possible
            const p = prompt.toLowerCase();
            let inferredAction: any = 'LOOK';
            if (p.includes('talk') || p.includes('speak') || p.includes('converse')) inferredAction = 'TALK';
            else if (p.includes('attack') || p.includes('hit') || p.includes('strike')) inferredAction = 'ATTACK';
            else if (p.includes('move') || p.includes('go') || p.includes('walk')) inferredAction = 'MOVE';
            else if (p.includes('loot') || p.includes('steal')) inferredAction = 'LOOT';

            const resp: NarrativeResponse = {
                narration,
                diegeticMessages: [],
                resolution: {
                    action: inferredAction,
                    success: true,
                    summary: `Mocked resolution for action ${inferredAction}`,
                    effects: []
                } as any,
                loreRefsUsed: [],
                safetyFlags: []
            };
            return { ok: true, value: resp as any };
        },
        async generateStructured(prompt, schema) {
            // return a parse error; caller can provide a mock via tests
            return { ok: false, error: { kind: 'parse', message: 'Mock adapter has no structured generator', details: null } };
        }
    };
}

export function createOpenAIAdapter(apiKey?: string): ModelAdapter {
    const key = apiKey || process.env.ORCH_OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API key not configured (ORCH_OPENAI_API_KEY)');
    const client = new OpenAI({ apiKey: key });

    async function callOpenAI(prompt: string, opts?: GenerateOpts) {
        const messages = [
            { role: 'system', content: opts?.systemPrompt ?? 'You are an assistant that outputs JSON when requested.' },
            { role: 'user', content: prompt }
        ];
        try {
            const res = await client.chat.completions.create({
                model: 'gpt-4o-mini',
                // cast to any to avoid strict SDK message typing for now
                messages: messages as any,
                temperature: opts?.temperature ?? 0.0,
                max_tokens: opts?.maxTokens ?? 800
            });
            const msg = res.choices?.[0]?.message?.content ?? '';
            return { ok: true as const, value: String(msg) };
        } catch (e: any) {
            return { ok: false as const, error: { kind: 'provider' as const, message: String(e?.message ?? e) } };
        }
    }

    return {
        async generate(prompt: string, opts?: GenerateOpts) {
            try {
                const res = await callOpenAI(prompt, opts);
                if (!res.ok) return res as any;
                const text = res.value;
                // If the model returned a JSON object, prefer using it as the response value.
                const js = extractJson(String(text));
                if (js) {
                    try {
                        const parsed = JSON.parse(js);
                        // Validate against the NarrativeResponse schema and return if valid
                        const v = NarrativeSchema.safeParse(parsed as any);
                        if (v.success) return { ok: true as const, value: v.data };
                        // If it didn't validate, fall through and attempt structured fallback
                    } catch (e) {
                        // fall through to wrapping as narration
                    }
                }
                // Fallback: wrap plain text into a structured NarrativeResponse
                const narration = String(text);
                const resp = {
                    narration,
                    diegeticMessages: [],
                    resolution: { success: true },
                    loreRefsUsed: [],
                    safetyFlags: []
                };
                return { ok: true as const, value: resp } as AIResponse<any>;
            } catch (e: any) {
                return { ok: false, error: { kind: 'network', message: String(e?.message ?? e) } };
            }
        },
        async generateStructured<T>(prompt: string, schema: ZodSchema<T>, opts?: GenerateOpts) {
            const maxRetries = opts?.maxRetries ?? 2;
            let lastErr: AIError | null = null;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                // Use callOpenAI directly to avoid double-wrapping of generate()
                const res = await callOpenAI(prompt, { ...opts, temperature: attempt === 0 ? (opts?.temperature ?? 0.0) : 0.0 });
                if (!res.ok) {
                    lastErr = res.error;
                    await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
                    continue;
                }
                const text = res.value;
                const js = extractJson(text);
                if (!js) {
                    lastErr = { kind: 'parse', message: 'Could not extract JSON from model output', details: { text } };
                    prompt = `${prompt}\n\nPlease extract and return only valid JSON matching the requested structure.`;
                    continue;
                }
                try {
                    const parsed = JSON.parse(js);
                    const parsedOk = schema.safeParse(parsed);
                    if (parsedOk.success) return { ok: true as const, value: parsedOk.data };
                    lastErr = { kind: 'validation', message: 'Zod validation failed', details: parsedOk.error.format() };
                    prompt = `${prompt}\n\nThe previous output failed validation. Please return JSON that matches the schema exactly.`;
                    continue;
                } catch (e: any) {
                    lastErr = { kind: 'parse', message: 'JSON.parse failed', details: String(e?.message ?? e) };
                    prompt = `${prompt}\n\nPlease extract and return only valid JSON.`;
                    continue;
                }
            }
            return { ok: false, error: lastErr ?? { kind: 'parse', message: 'Unknown parse/validation failure' } };
        }
    };
}

export function createAdapter(which?: string): ModelAdapter {
    const w = which ?? process.env.ORCHESTRATOR_MODEL ?? 'mock';
    if (w === 'mock') return createMockAdapter();
    if (w === 'openai') return createOpenAIAdapter();
    throw new Error(`Unknown adapter: ${w}`);
}
