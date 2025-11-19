import { DbConnection } from '../module_bindings/index.js';

// Example helper: build a connection to the local spacetime host and
// demonstrate calling createCharacter and subscribing to the characters table.
export async function demoCharacters(uri: string, moduleName: string, accountIdentity: string) {
    const builder = DbConnection.builder()
        .withUri(uri)
        .withModuleName(moduleName)
        .onConnect(((ctx: any, identity: any, token: any) => {
            console.log('Connected to spacetime as', identity);
        }) as any)
        .onConnectError(((ctx: any, err: any) => {
            console.error('Failed to connect', err);
        }) as any);

    const conn = builder.build();

    // Subscribe to characters owned by this account
    const sub = conn.subscriptionBuilder()
        .subscribe([`SELECT * FROM characters WHERE owner_id = '${accountIdentity}'`]);

    // Register a simple handler to log inserts
    conn.db.characters.onInsert(((ctx: any, row: any) => {
        console.log('Character inserted', row);
    }) as any);

    // Create a character via reducer
    conn.reducers.createCharacter('DemoHero', 'A test character', 'Human', 'Warrior', 'Soldier', 'starting_village');

    return { conn, sub };
}

export default demoCharacters;
