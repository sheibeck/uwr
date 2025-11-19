import { createSpaceTimeAdapter } from '../db/spacetime.js';

const adapterPromise = createSpaceTimeAdapter();

export async function createCharacter(name: string, opts: { description?: string; race?: string; archetype?: string; profession?: string; starting_region?: string; ownerId?: string } = {}) {
    const adapter = await adapterPromise;
    if (!adapter) {
        return { ok: true, character: { id: `local-${Date.now()}`, owner_id: opts.ownerId ?? null, name, description: opts.description, race: opts.race, archetype: opts.archetype, profession: opts.profession, starting_region: opts.starting_region } };
    }
    if (typeof adapter.createCharacter === 'function') {
        const c = await adapter.createCharacter(name, opts.description ?? null, opts.race ?? null, opts.archetype ?? null, opts.profession ?? null, opts.starting_region ?? null, opts.ownerId ?? null);
        return { ok: true, character: c };
    }
    return { ok: true, character: { id: `local-${Date.now()}`, owner_id: opts.ownerId ?? null, name, description: opts.description, race: opts.race, archetype: opts.archetype, profession: opts.profession, starting_region: opts.starting_region } };
}

export async function listCharacters(ownerId?: string) {
    const adapter = await adapterPromise;
    if (!adapter) return [];
    if (typeof adapter.findCharactersByOwner === 'function') return adapter.findCharactersByOwner(ownerId);
    return [];
}

export async function activateCharacter(id: string) {
    const adapter = await adapterPromise;
    if (!adapter) return { ok: false, error: 'no adapter' };
    if (typeof adapter.setActiveCharacter === 'function') {
        await adapter.setActiveCharacter(id);
        return { ok: true };
    }
    return { ok: false, error: 'no remote reducer' };
}

export async function removeCharacter(id: string) {
    const adapter = await adapterPromise;
    if (!adapter) return { ok: false, error: 'no adapter' };
    if (typeof adapter.deleteCharacter === 'function') {
        await adapter.deleteCharacter(id);
        return { ok: true };
    }
    return { ok: false, error: 'no remote reducer' };
}

export default { createCharacter, listCharacters, activateCharacter, removeCharacter };
