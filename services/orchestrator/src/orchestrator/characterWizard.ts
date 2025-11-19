import fs from 'fs/promises';
import path from 'path';
import { CharacterDraftSchema, ProfessionSchema } from '../../../../packages/prompt-schema/src/wizard/characterDraftSchema';
import { DbConnection } from '../module_bindings/index.js';
import { createModelAdapter, ModelAdapter } from '../ai/index.js';

export class CharacterWizard {
    private promptsDir: string;
    private ai: Promise<ModelAdapter>;
    private conn: any;

    constructor(modelName: string | undefined, dbUri: string, moduleName: string) {
        this.ai = createModelAdapter();
        this.promptsDir = path.resolve(process.cwd(), 'packages/prompt-schema/src/wizard/prompts');
        this.conn = DbConnection.builder().withUri(dbUri).withModuleName(moduleName).build();
    }

    private async loadPrompt(name: string) {
        const p = path.join(this.promptsDir, `${name}.txt`);
        return (await fs.readFile(p, 'utf8')) as string;
    }

    async suggestRace() {
        const prompt = await this.loadPrompt('racePrompt');
        const ai = await this.ai;
        const out = await ai.sendPrompt(prompt);
        return out;
    }

    async suggestArchetype() {
        const prompt = await this.loadPrompt('archetypePrompt');
        const ai2 = await this.ai;
        return ai2.sendPrompt(prompt);
    }

    async suggestProfession(race: string, archetype: string) {
        let prompt = await this.loadPrompt('professionPrompt');
        prompt = prompt.replace('{{race}}', race).replace('{{archetype}}', archetype);
        // Prefer structured generation if the model adapter supports it
        const ai3 = await this.ai;
        if ((ai3 as any).generateStructured) {
            try {
                const gen = await (ai3 as any).generateStructured(prompt, ProfessionSchema);
                if (gen.ok) return { ok: true, value: gen.value };
                return { ok: false, error: gen.error };
            } catch (e) {
                // fallback to plain text
                console.warn('Structured generation failed, falling back to text:', e);
            }
        }
        const ai4 = await this.ai;
        const text = await ai4.sendPrompt(prompt);
        return { ok: true, text };
    }

    async suggestRegions(race: string, professionName: string) {
        let prompt = await this.loadPrompt('regionPrompt');
        prompt = prompt.replace('{{race}}', race).replace('{{professionName}}', professionName);
        const ai5 = await this.ai;
        return ai5.sendPrompt(prompt);
    }

    async suggestDescription(inputs: string | null) {
        let prompt = await this.loadPrompt('descriptionPrompt');
        if (inputs) prompt = `${prompt}\nUser: ${inputs}`;
        const ai6 = await this.ai;
        return ai6.sendPrompt(prompt);
    }

    async suggestNames(race: string, professionName: string) {
        let prompt = await this.loadPrompt('namePrompt');
        prompt = prompt.replace('{{race}}', race).replace('{{professionName}}', professionName);
        const ai7 = await this.ai;
        return ai7.sendPrompt(prompt);
    }

    // Save a draft via generated bindings
    async saveDraft(draftJson: string, draftId?: string) {
        this.conn.reducers.saveCharacterDraft(draftId, draftJson);
    }

    // Finalize: validate draft using Zod, enrich via AI if needed, then call finalize reducer
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

        let result = CharacterDraftSchema.safeParse(parsed);
        if (!result.success) {
            // Attempt to enrich using the AI structured generator if available
            if ((this.ai as any).generateStructured) {
                const prompt = await this.loadPrompt('finalizePrompt').catch(() => undefined);
                const genPrompt = prompt ? `${prompt}\n
Please fill in any missing fields of the following draft and return JSON matching the schema.` : `Please produce a complete character draft JSON matching the expected schema.`;
                const gs = await (this.ai as any).generateStructured(genPrompt + '\n\nDraft:\n' + JSON.stringify(parsed), CharacterDraftSchema);
                if (gs.ok) {
                    // Merge generated fields into parsed
                    parsed = { ...parsed, ...gs.value };
                    result = CharacterDraftSchema.safeParse(parsed);
                } else {
                    throw new Error('AI structured generation failed: ' + JSON.stringify(gs.error));
                }
            } else {
                throw new Error('Draft validation failed: ' + JSON.stringify(result.error.format()));
            }
        }

        // At this point validation succeeded (either originally or after AI enrichment).
        this.conn.reducers.finalizeCharacterDraft(draftId);
    }
}

export default CharacterWizard;
