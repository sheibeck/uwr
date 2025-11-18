import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const HOLD_DIR = path.resolve(process.cwd(), 'data', 'orchestrator', 'hold');

describe('review-hold integration', () => {
    const id = 'test-hold-1';
    const filePath = path.join(HOLD_DIR, `${id}.json`);

    beforeEach(() => {
        if (!fs.existsSync(HOLD_DIR)) fs.mkdirSync(HOLD_DIR, { recursive: true });
        const payload = {
            id,
            createdAt: new Date().toISOString(),
            request: { intent: { action: 'test-action' } },
            response: { ok: true }
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    });

    afterEach(() => {
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { }
    });

    it('promote should revalidate and apply then remove held file', async () => {
        // stub registry and db before importing the script module so the module
        // receives the stubs when it imports them.
        const registryPath = path.resolve(process.cwd(), 'services', 'orchestrator', 'src', 'schemas', 'registry.js');
        const dbPath = path.resolve(process.cwd(), 'services', 'orchestrator', 'src', 'db', 'spacetime.js');

        // Dynamically import the modules and patch them
        const registry = await import(registryPath);
        // getValidator is a read-only exported binding; instead populate the
        // exported validators map so getValidator() will find our stub.
        if (registry.validators && typeof registry.validators.set === 'function') {
            registry.validators.set('NarrativeResponse', (_: any) => true);
            registry.validators.set('narrativeresponse', (_: any) => true);
        }

        // mock the DB module so the review-hold script will call our stub
        vi.doMock(dbPath, () => ({ applyNarrativeResponse: async (_: any) => ({ success: true }) }));

        // now import the review-hold script and call promote
        const reviewHold = await import(path.resolve(process.cwd(), 'services', 'orchestrator', 'scripts', 'review-hold.ts'));
        await reviewHold.promote(id);

        // file should be removed by promote
        expect(fs.existsSync(filePath)).toBe(false);
    });
});
