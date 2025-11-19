import { ref, onBeforeUnmount } from 'vue';
import { createDbConnectionBuilder } from '../module_bindings_loader';

export function useSpacetimeSubscription(sql: string, token?: string, sessionToken?: string) {
    const rows = ref<any[]>([]);
    const status = ref<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    let conn: any = null;
    let handle: any = null;

    async function connect() {
        status.value = 'connecting';
        try {
            const builder = await createDbConnectionBuilder(undefined as any, undefined as any, token ?? sessionToken);
            if (!builder) {
                status.value = 'error';
                return;
            }

            builder.onConnect((ctx: any) => {
                try {
                    conn = ctx;
                    // populate initial rows
                    const out: any[] = [];
                    for (const r of ctx.db.characters.iter()) {
                        out.push(r);
                    }
                    rows.value = out;
                    status.value = 'connected';
                } catch (e) {
                    status.value = 'error';
                }
            });

            // attach generic error handlers by building the connection
            try {
                builder.build();
            } catch (e) {
                // build may throw; mark error
                status.value = 'error';
            }

            // create subscription after build/onConnect
            // We'll attach subscription in onConnect above by reading ctx.subscriptionBuilder in that callback
        } catch (e) {
            status.value = 'error';
        }
    }

    async function disconnect() {
        try {
            if (handle) { handle.unsubscribe?.(); handle = null; }
            if (conn) { conn.disconnect?.(); conn = null; }
            status.value = 'idle';
        } catch { }
    }

    onBeforeUnmount(() => { disconnect(); });

    connect();

    return { rows, status, connect, disconnect };
}
