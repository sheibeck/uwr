import { z } from 'zod';

export const PromptTemplate = z.object({
    id: z.string(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/).describe('semver-like version'),
    name: z.string().min(3),
    description: z.string().optional(),
    template: z.string().min(1).describe('Template string with placeholders like {{playerName}}'),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    safetyProfile: z.enum(['STRICT', 'DEFAULT', 'LENIENT']).optional(),
    outputSchemaRef: z.string().optional(),
});

export type PromptTemplate = z.infer<typeof PromptTemplate>;

// Helper: find placeholder tokens in template string
export function extractPlaceholders(t: string): string[] {
    const re = /{{\s*([a-zA-Z0-9_\.\-]+)\s*}}/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
        out.push(m[1]!);
    }
    return Array.from(new Set(out));
}

export function validateTemplatePlaceholders(template: PromptTemplate) {
    const placeholders = extractPlaceholders(template.template);
    // Basic rule: template must include at least one placeholder
    if (placeholders.length === 0) {
        throw new Error('template must contain at least one placeholder token like {{playerName}}');
    }
    return placeholders;
}
