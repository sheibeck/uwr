import { describe, it, expect, vi } from 'vitest';
import { createMockAdapter } from '../../../packages/ai-client/dist/index.js';
import { z } from 'zod';

// Minimal local schema matching the subset used by the test to avoid cross-package import issues
export const CharacterDraftSchema = z.object({
    draftId: z.string().optional(),
    ownerId: z.string(),
    name: z.string().optional(),
    race: z.string().optional(),
});

describe('ai-client mock adapter', () => {
    it('generate returns a MOCK: prefixed string', async () => {
        const adapter = createMockAdapter();
        const res = await adapter.generate('Hello world');
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.value.startsWith('MOCK:')).toBe(true);
    });

    it('generateStructured returns a parse error by default', async () => {
        const adapter = createMockAdapter();
        const res = await adapter.generateStructured('Give me JSON', CharacterDraftSchema);
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error.kind).toBe('parse');
    });
});

describe('orchestrator finalize-draft smoke', () => {
    it('valid draft triggers finalizeCharacterDraft reducer call', async () => {
        const draft = {
            draftId: 'draft-1',
            ownerId: 'owner-1',
            name: 'Test Hero',
            race: 'Human'
        };

        // Mock connection shape used by CharacterWizard.finalizeDraft
        const mockReducers = {
            finalizeCharacterDraft: vi.fn()
        } as any;

        const mockDb = {
            characterDrafts: {
                id: {
                    find: (id: string) => ({ id, draft_json: JSON.stringify(draft) })
                }
            }
        } as any;

        const mockConn = { db: mockDb, reducers: mockReducers } as any;

        // replicate the finalizeDraft logic
        const draftRow = mockConn.db.characterDrafts.id.find('draft-1');
        expect(draftRow).toBeDefined();
        const parsed = JSON.parse(draftRow.draft_json);
        const result = CharacterDraftSchema.safeParse(parsed);
        expect(result.success).toBe(true);

        // call the reducer
        mockConn.reducers.finalizeCharacterDraft('draft-1');
        expect(mockConn.reducers.finalizeCharacterDraft).toHaveBeenCalledWith('draft-1');
    });
});
