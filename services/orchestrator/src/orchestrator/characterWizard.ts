import fs from 'fs/promises';
import path from 'path';
import { CharacterDraftSchema } from '../../../packages/prompt-schema/src/wizard/characterDraftSchema.js';
import { DbConnection } from '../module_bindings/index.js';

// aiClient should implement a simple interface: `generate(prompt: string): Promise<{ text: string, json?: any }>`
export type AIClient = {
    generate(prompt: string): Promise<{ text: string; json?: any }>;
};

export class CharacterWizard {
    private promptsDir: string;
    private ai: AIClient;
    private conn: any;

    constructor(aiClient: AIClient, dbUri: string, moduleName: string) {
        this.ai = aiClient;
        this.promptsDir = path.resolve(process.cwd(), 'packages/prompt-schema/src/wizard/prompts');
        this.conn = DbConnection.builder().withUri(dbUri).withModuleName(moduleName).build();
    }

    private async loadPrompt(name: string) {
        const p = path.join(this.promptsDir, `${name}.txt`);
        return (await fs.readFile(p, 'utf8')) as string;
    }

    async suggestRace() {
        const prompt = await this.loadPrompt('racePrompt');
        const out = await this.ai.generate(prompt);
        return out;
    }

    async suggestArchetype() {
        const prompt = await this.loadPrompt('archetypePrompt');
        return this.ai.generate(prompt);
    }

    async suggestProfession(race: string, archetype: string) {
        let prompt = await this.loadPrompt('professionPrompt');
        prompt = prompt.replace('{{race}}', race).replace('{{archetype}}', archetype);
        return this.ai.generate(prompt);
    }

    async suggestRegions(race: string, professionName: string) {
        let prompt = await this.loadPrompt('regionPrompt');
        prompt = prompt.replace('{{race}}', race).replace('{{professionName}}', professionName);
        return this.ai.generate(prompt);
    }

    async suggestDescription(inputs: string | null) {
        let prompt = await this.loadPrompt('descriptionPrompt');
        if (inputs) prompt = `${prompt}\nUser: ${inputs}`;
        return this.ai.generate(prompt);
    }

    async suggestNames(race: string, professionName: string) {
        let prompt = await this.loadPrompt('namePrompt');
        prompt = prompt.replace('{{race}}', race).replace('{{professionName}}', professionName);
        return this.ai.generate(prompt);
    }

    // Save a draft via generated bindings
    async saveDraft(draftJson: string, draftId?: string) {
        this.conn.reducers.saveCharacterDraft(draftId, draftJson);
    }

    // Finalize: validate draft using Zod, then call finalize reducer
    async finalizeDraft(draftId: string) {
        // Fetch draft from remote table via subscription/query: simple approach - read client cache via connection
        // Note: In a server environment this may require calling a view or direct DB access. We'll attempt to read via client cache.
        const table = this.conn.db.characterDrafts;
        const row = table.id.find(draftId);
        if (!row) throw new Error('Draft not found');
        const draftJson = row.draft_json;
        let parsed: any;
        try {
            parsed = JSON.parse(draftJson);
        } catch (e) {
            throw new Error('Malformed draft JSON');
        }

        const result = CharacterDraftSchema.safeParse(parsed);
        if (!result.success) {
            throw new Error('Draft validation failed: ' + JSON.stringify(result.error.format()));
        }

        // At this point, call the finalize reducer which will perform final insertion
        this.conn.reducers.finalizeCharacterDraft(draftId);
    }
}

export default CharacterWizard;
