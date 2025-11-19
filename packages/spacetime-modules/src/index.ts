// SpacetimeDB module schema & reducers (initial draft)
// Publish with: spacetime publish --server local --project-path packages/spacetime-modules unwritten-realms
// After publishing, generate client bindings: spacetime generate --lang typescript --out-dir services/orchestrator/src/module_bindings --project-path packages/spacetime-modules
// IMPORTANT: This file must remain the entrypoint for publishing.

import { schema, table, t, SenderError } from 'spacetimedb/server';

// Lightweight UUIDv4 generator to avoid depending on Node's `crypto` in the
// module runtime environment. Not cryptographically strong, but sufficient
// for development/local ids. Replace with a secure RNG if required.
function uuidv4() {
    // From https://stackoverflow.com/a/2117523
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// Accounts table: represents external auth provider linkage.
const Accounts = table(
    { name: 'accounts', public: true },
    {
        // Use string UUID primary keys instead of auto-incrementing u64
        id: t.string().primaryKey(),
        provider: t.string().index('btree'),
        provider_user_id: t.string().unique(),
        display_name: t.string().optional(),
        // Track the user's currently selected character (optional)
        // Use string GUIDs for character ids
        active_character_id: t.string().optional(),
        created_at: t.timestamp(),
        updated_at: t.timestamp()
    }
);

// Sessions table: ephemeral login sessions (could be scheduled for cleanup later)
const Sessions = table(
    { name: 'sessions', public: true },
    {
        // Use string UUID primary keys and reference account ids as strings
        id: t.string().primaryKey(),
        account_id: t.string(),
        session_token: t.string().unique(),
        created_at: t.timestamp(),
        last_seen_at: t.timestamp(),
        expires_at: t.timestamp(),
        ip_hash: t.string().optional()
    }
);

// Characters table: player-owned avatars
const Characters = table(
    { name: 'characters', public: true },
    {
        // Use string GUID primary keys for portability and to avoid coupling to numeric auto-inc
        id: t.string().primaryKey(),
        // Reference to Accounts.id
        owner_id: t.string().index('btree'),
        // Unique display name across characters
        name: t.string().unique(),
        description: t.string().optional(),
        race: t.string().optional(),
        archetype: t.string().optional(),
        profession: t.string().optional(),
        starting_region: t.string().optional(),
        created_at: t.timestamp(),
        current_location: t.string().optional(),

        // Attributes
        strength: t.option(t.i32()),
        dexterity: t.option(t.i32()),
        intelligence: t.option(t.i32()),
        constitution: t.option(t.i32()),
        wisdom: t.option(t.i32()),
        charisma: t.option(t.i32()),

        // Health / mana
        max_health: t.option(t.i32()),
        current_health: t.option(t.i32()),
        max_mana: t.option(t.i32()),
        current_mana: t.option(t.i32()),

        // Abilities / equipment
        race_abilities: t.option(t.string()),
        profession_abilities: t.option(t.string()),
        armor_type: t.option(t.string()),
        level: t.option(t.i32()),
        xp: t.option(t.i32()),
        inventory_items: t.option(t.string()),

        // Freeform backpack/gear storage (stringified JSON for MVP)
        backpack: t.option(t.string()),

        // Equipped slots (simple string refs for MVP)
        head: t.option(t.string()),
        shoulders: t.option(t.string()),
        back: t.option(t.string()),
        chest: t.option(t.string()),
        arms: t.option(t.string()),
        hands: t.option(t.string()),
        legs: t.option(t.string()),
        feet: t.option(t.string()),
        rings: t.option(t.string()),
        necklace: t.option(t.string()),
        earrings: t.option(t.string()),
        relic: t.option(t.string()),
        primary_weapon: t.option(t.string()),
        secondary_weapon: t.option(t.string()),

        // Simple quest tracker -- stringified for MVP
        quests: t.option(t.string())
    }
);

// Character drafts: persist player in-progress wizard state as JSON
const CharacterDrafts = table(
    { name: 'character_drafts', public: false },
    {
        id: t.string().primaryKey(),
        owner_id: t.string().index('btree'),
        // store draft as stringified JSON for flexibility
        draft_json: t.string(),
        last_updated: t.timestamp(),
    }
);

// Compose schema (include Characters and CharacterDrafts)
const spacetimedb = schema(Accounts, Sessions, Characters, CharacterDrafts);

spacetimedb.reducer(
    'create_account',
    { provider: t.string(), provider_user_id: t.string(), display_name: t.string().optional() },
    (ctx: any, { provider, provider_user_id, display_name }: any) => {
        // Enforce uniqueness via provider_user_id unique index.
        const existing = ctx.db.accounts.provider_user_id.find(provider_user_id);
        if (existing) {
            throw new SenderError('Account already exists');
        }
        // Generate a UUID for `id`.
        const newAccount = {
            id: uuidv4(),
            provider,
            provider_user_id,
            display_name,
            created_at: ctx.timestamp,
            updated_at: ctx.timestamp
        };
        // insert account; keep id placeholder so auto-increment assigns value
        ctx.db.accounts.insert(newAccount);
    }
);

spacetimedb.reducer(
    'upsert_account',
    { provider: t.string(), provider_user_id: t.string(), display_name: t.string().optional() },
    (ctx: any, { provider, provider_user_id, display_name }: any) => {
        const row = ctx.db.accounts.provider_user_id.find(provider_user_id);
        if (row) {
            // Update display name & timestamp
            row.display_name = display_name;
            row.updated_at = ctx.timestamp;
            ctx.db.accounts.provider_user_id.update(row);
        } else {
            // Let auto-increment assign id on insert.
            const newAccount2 = {
                id: uuidv4(),
                provider,
                provider_user_id,
                display_name,
                created_at: ctx.timestamp,
                updated_at: ctx.timestamp
            };
            // insert account on upsert path; use id placeholder for auto-inc
            ctx.db.accounts.insert(newAccount2);
        }
    }
);

spacetimedb.reducer(
    'create_or_update_session',
    { provider_user_id: t.string(), session_token: t.string(), ttl_minutes: t.u32() },
    (ctx: any, { provider_user_id, session_token, ttl_minutes }: any) => {
        const account = ctx.db.accounts.provider_user_id.find(provider_user_id);
        if (!account) {
            throw new SenderError('Unknown account');
        }
        const existing = ctx.db.sessions.session_token.find(session_token);
        // Calculate expires_at by adding ttl (in minutes) to ctx.timestamp.
        let expires_at = ctx.timestamp;
        try {
            const addMicros = BigInt(ttl_minutes) * BigInt(60 * 1_000_000);
            const base = (ctx.timestamp as any).__timestamp_micros_since_unix_epoch__;
            if (typeof base === 'bigint') {
                expires_at = { __timestamp_micros_since_unix_epoch__: base + addMicros };
            }
        } catch (e) {
            // fallback: leave expires_at as ctx.timestamp
        }
        if (existing) {
            existing.last_seen_at = ctx.timestamp;
            existing.expires_at = expires_at;
            ctx.db.sessions.session_token.update(existing);
        } else {
            // Generate a UUID for sessions id on insert.
            const newSession = {
                id: uuidv4(),
                account_id: account.id,
                session_token,
                created_at: ctx.timestamp,
                last_seen_at: ctx.timestamp,
                expires_at,
                ip_hash: null
            };
            // insert session; id placeholder provided for auto-increment
            ctx.db.sessions.insert(newSession);
        }
    }
);

spacetimedb.reducer(
    'touch_session',
    { session_token: t.string() },
    (ctx: any, { session_token }: any) => {
        const existing = ctx.db.sessions.session_token.find(session_token);
        if (!existing) {
            throw new SenderError('Session not found');
        }
        existing.last_seen_at = ctx.timestamp;
        ctx.db.sessions.session_token.update(existing);
    }
);

// Character reducers
spacetimedb.reducer(
    'create_character',
    {
        name: t.string(),
        description: t.string().optional(),
        race: t.string().optional(),
        archetype: t.string().optional(),
        profession: t.string().optional(),
        starting_region: t.string().optional()
    },
    (ctx: any, { name, description, race, archetype, profession, starting_region }: any) => {
        // Ensure caller is authenticated
        const sender = ctx.sender;
        if (!sender) throw new SenderError('Unauthenticated');

        // Ensure unique name
        const existing = ctx.db.characters.name.find(name);
        if (existing) {
            throw new SenderError('Character name already taken');
        }

        const newChar = {
            id: uuidv4(),
            owner_id: sender,
            name,
            description: description ?? null,
            race: race ?? null,
            archetype: archetype ?? null,
            profession: profession ?? null,
            starting_region: starting_region ?? null,
            created_at: ctx.timestamp,
            current_location: starting_region ?? null,

            strength: null,
            dexterity: null,
            intelligence: null,
            constitution: null,
            wisdom: null,
            charisma: null,

            max_health: null,
            current_health: null,
            max_mana: null,
            current_mana: null,

            race_abilities: null,
            profession_abilities: null,
            armor_type: null,
            level: null,
            xp: null,
            inventory_items: null,

            head: null,
            shoulders: null,
            back: null,
            chest: null,
            arms: null,
            hands: null,
            legs: null,
            feet: null,
            rings: null,
            necklace: null,
            earrings: null,
            relic: null,
            primary_weapon: null,
            secondary_weapon: null,

            quests: null
        };

        ctx.db.characters.insert(newChar);

        // Optionally set as active character for account if none present
        const account = ctx.db.accounts.provider_user_id.find(ctx.sender);
        if (account && !account.active_character_id) {
            // Find the inserted character by unique name (should be present)
            const inserted = ctx.db.characters.name.find(name);
            if (inserted) {
                account.active_character_id = inserted.id;
                ctx.db.accounts.provider_user_id.update(account);
            }
        }
    }
);

spacetimedb.reducer(
    'update_character',
    {
        id: t.string(), patch: t.object('UpdatePatch', {
            description: t.option(t.string()),
            current_location: t.option(t.string()),
            // extend as needed
        })
    },
    (ctx: any, { id, patch }: any) => {
        const sender = ctx.sender;
        if (!sender) throw new SenderError('Unauthenticated');

        const row = ctx.db.characters.id.find(id);
        if (!row) throw new SenderError('Character not found');
        if (row.owner_id !== sender) throw new SenderError('Not character owner');

        if (patch.description !== undefined) row.description = patch.description ?? null;
        if (patch.current_location !== undefined) row.current_location = patch.current_location ?? null;

        ctx.db.characters.id.update(row);
    }
);

spacetimedb.reducer(
    'delete_character',
    { id: t.string() },
    (ctx: any, { id }: any) => {
        const sender = ctx.sender;
        if (!sender) throw new SenderError('Unauthenticated');

        const row = ctx.db.characters.id.find(id);
        if (!row) throw new SenderError('Character not found');
        if (row.owner_id !== sender) throw new SenderError('Not character owner');

        // If account had this active, clear it
        const account = ctx.db.accounts.provider_user_id.find(ctx.sender);
        if (account && account.active_character_id === id) {
            account.active_character_id = null;
            ctx.db.accounts.provider_user_id.update(account);
        }

        // Delete the character by primary key
        ctx.db.characters.id.delete(id);
    }
);

spacetimedb.reducer(
    'set_active_character',
    { id: t.string() },
    (ctx: any, { id }: any) => {
        const sender = ctx.sender;
        if (!sender) throw new SenderError('Unauthenticated');
        const row = ctx.db.characters.id.find(id);
        if (!row) throw new SenderError('Character not found');
        if (row.owner_id !== sender) throw new SenderError('Not character owner');

        const account = ctx.db.accounts.provider_user_id.find(ctx.sender);
        if (!account) throw new SenderError('Account not found');
        account.active_character_id = id;
        ctx.db.accounts.provider_user_id.update(account);
    }
);

// Persist an in-progress character draft. Accepts draftId (optional) and a JSON payload.
spacetimedb.reducer(
    'save_character_draft',
    { id: t.string().optional(), draft_json: t.string() },
    (ctx: any, { id, draft_json }: any) => {
        const sender = ctx.sender;
        if (!sender) throw new SenderError('Unauthenticated');

        const draftId = id ?? uuidv4();
        const existing = ctx.db.character_drafts.id.find(draftId);
        if (existing) {
            if (existing.owner_id !== sender) throw new SenderError('Not draft owner');
            existing.draft_json = draft_json;
            existing.last_updated = ctx.timestamp;
            ctx.db.character_drafts.id.update(existing);
        } else {
            ctx.db.character_drafts.insert({ id: draftId, owner_id: sender, draft_json, last_updated: ctx.timestamp });
        }
    }
);

spacetimedb.reducer(
    'delete_character_draft',
    { id: t.string() },
    (ctx: any, { id }: any) => {
        const sender = ctx.sender;
        if (!sender) throw new SenderError('Unauthenticated');
        const existing = ctx.db.character_drafts.id.find(id);
        if (!existing) throw new SenderError('Draft not found');
        if (existing.owner_id !== sender) throw new SenderError('Not draft owner');
        ctx.db.character_drafts.id.delete(id);
    }
);

// Finalize a draft: validate and create a final character row (simple naive implementation)
spacetimedb.reducer(
    'finalize_character_draft',
    { id: t.string() },
    (ctx: any, { id }: any) => {
        const sender = ctx.sender;
        if (!sender) throw new SenderError('Unauthenticated');
        const draftRow = ctx.db.character_drafts.id.find(id);
        if (!draftRow) throw new SenderError('Draft not found');
        if (draftRow.owner_id !== sender) throw new SenderError('Not draft owner');

        // Parse draft JSON; validation occurs in orchestrator in practice, but we do a few server-side checks
        let draft: any = null;
        try {
            draft = JSON.parse(draftRow.draft_json);
        } catch (e) {
            throw new SenderError('Malformed draft JSON');
        }

        // Minimal required fields
        if (!draft.name) throw new SenderError('Name required');
        if (!draft.race) throw new SenderError('Race required');
        if (!draft.archetype) throw new SenderError('Archetype required');

        // Ensure name uniqueness
        const existingName = ctx.db.characters.name.find(draft.name);
        if (existingName) throw new SenderError('Character name already taken');

        // Compose a final character with defaults
        const finalChar: any = {
            id: uuidv4(),
            owner_id: sender,
            name: draft.name,
            description: draft.description ?? null,
            race: draft.race,
            archetype: draft.archetype,
            profession: draft.professionName ?? null,
            starting_region: draft.startingRegion ?? null,
            created_at: ctx.timestamp,
            current_location: draft.startingRegion ?? null,

            // attributes: use baseline 20 then apply modifiers (or keep null for now)
            strength: draft.strength ?? 20,
            dexterity: draft.dexterity ?? 20,
            intelligence: draft.intelligence ?? 20,
            constitution: draft.constitution ?? 20,
            wisdom: draft.wisdom ?? 20,
            charisma: draft.charisma ?? 20,

            max_health: draft.maxHealth ?? (draft.archetype === 'Fighter' ? 100 : 50),
            current_health: draft.currentHealth ?? (draft.archetype === 'Fighter' ? 100 : 50),
            max_mana: draft.maxMana ?? (draft.archetype === 'Mystic' ? 100 : 50),
            current_mana: draft.currentMana ?? (draft.archetype === 'Mystic' ? 100 : 50),

            race_abilities: draft.raceAbilities ?? null,
            profession_abilities: draft.professionAbilities ?? null,
            armor_type: draft.armorType ?? null,
            level: 1,
            xp: 1,
            inventory_items: draft.inventoryItems ?? null,
            backpack: draft.backpack ?? null,

            head: draft.head ?? null,
            shoulders: draft.shoulders ?? null,
            back: draft.back ?? null,
            chest: draft.chest ?? null,
            arms: draft.arms ?? null,
            hands: draft.hands ?? null,
            legs: draft.legs ?? null,
            feet: draft.feet ?? null,
            rings: draft.rings ?? null,
            necklace: draft.necklace ?? null,
            earrings: draft.earrings ?? null,
            relic: draft.relic ?? null,
            primary_weapon: draft.primaryWeapon ?? null,
            secondary_weapon: draft.secondaryWeapon ?? null,

            quests: draft.quests ?? null,
        };

        // Insert character
        ctx.db.characters.insert(finalChar);

        // Remove draft
        ctx.db.character_drafts.id.delete(id);
    }
);

// Lifecycle hooks: mark sessions stale or perform cleanup (placeholder)
spacetimedb.init((_ctx: any) => {
    console.info('Module initialized');
});

export { };// Placeholder for SpaceTimeDB table & procedure bindings (TypeScript).
// TODO: Define modules once initial auth/session tables are finalized.
export const placeholder = true;
