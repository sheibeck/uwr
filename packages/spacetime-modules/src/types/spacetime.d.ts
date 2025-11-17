// Temporary type declarations for spacetimedb/server until dependency is installed.
declare module 'spacetimedb/server' {
    // Builders are loosely typed as any to avoid compile errors pre-install.
    export const t: any;
    export function table(opts: any, columns: any): any;
    export function schema(...tables: any[]): any;
    export class SenderError extends Error { }
}