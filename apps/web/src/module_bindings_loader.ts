// Try to dynamically import generated bindings. Returns a builder or null.
export async function createDbConnectionBuilder(moduleName: string, uri?: string, token?: string) {
    // Probe candidate locations for generated bindings. Vite serves `src/` files
    // at `/src/...` during dev, so check multiple possible URLs.
    const candidates = [
        './module_bindings/index.js',
        './module_bindings/index.ts',
        '/src/module_bindings/index.js',
        '/src/module_bindings/index.ts',
        '/services/orchestrator/src/module_bindings/index.js',
        '/services/orchestrator/src/module_bindings/index.ts',
        '../../services/orchestrator/src/module_bindings/index.js',
        '../../services/orchestrator/src/module_bindings/index.ts'
    ];

    let selected: string | null = null;
    for (const p of candidates) {
        try {
            const url = new URL(p, window.location.href).href;
            const head = await fetch(url, { method: 'HEAD' });
            if (head.ok) {
                selected = p;
                break;
            }
        } catch { /* ignore */ }
    }
    if (!selected) {
        // Helpful debug when bindings are not present in dev.
        // eslint-disable-next-line no-console
        console.debug('module_bindings loader: no candidate passed HEAD probe', { candidates });
        return null;
    }

    try {
        // Runtime import via Function prevents TypeScript from trying to statically
        // resolve the path at build time and gives us a stable runtime import.
        const resolved = new URL(selected, window.location.href).href;
        // eslint-disable-next-line no-console
        console.debug('module_bindings loader: importing', { selected, resolved });
        const mod: any = await (new Function('p', 'return import(p)'))(resolved);
        const DbConnection = mod?.DbConnection || mod?.default?.DbConnection;
        if (!DbConnection) return null;
        const builder = DbConnection.builder()
            .withUri(uri || (window as any).__SPACETIME_URI__ || 'ws://localhost:3000')
            .withModuleName(moduleName || (window as any).__SPACETIME_DBNAME__ || 'unwritten-realms');
        if (token) builder.withToken(token);
        return builder;
    } catch (e) {
        return null;
    }
}
