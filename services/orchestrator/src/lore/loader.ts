import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import YAML from 'yaml';
import { LoreShard } from '@prompt/schemas/lore';

export interface LoreStore {
    shards: Map<string, LoreShard>;
}

export function loadLore(dir = resolve(process.cwd(), 'docs', 'lore')): LoreStore {
    const files = readdirSync(dir).filter(f => f.endsWith('.yaml'));
    const shards: Map<string, LoreShard> = new Map();
    for (const f of files) {
        const raw = readFileSync(resolve(dir, f), 'utf8');
        const parsed = YAML.parse(raw);
        if (parsed && Array.isArray(parsed.shards)) {
            for (const s of parsed.shards) {
                // Minimal shape trust; real implementation would validate with LoreShard schema
                if (s.id) shards.set(s.id, s as LoreShard);
            }
        }
    }
    return { shards };
}

export function getLoreShards(ids: string[], store: LoreStore): LoreShard[] {
    return ids.map(id => store.shards.get(id)).filter(Boolean) as LoreShard[];
}
