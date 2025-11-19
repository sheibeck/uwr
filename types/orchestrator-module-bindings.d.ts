// Ambient module stubs for generated Spacetime bindings and built ai-client
// These allow the workspace typecheck to proceed while the generated bindings
// may have ESM/value/type mismatches. Replace these with real generated
// artifacts (or remove) when ready for stricter typechecking.

declare module 'services/orchestrator/src/module_bindings/index.js' {
    export const DbConnection: any;
    export const RemoteTables: any;
    export const RemoteReducers: any;
    export type EventContext = any;
    export type Reducer = any;
    export default any;
}

declare module 'services/orchestrator/src/module_bindings/*' {
    const _any: any;
    export default _any;
}

// Provide a module name that matches the runtime import path used by orchestrator
declare module '../../../packages/ai-client/dist/index.js' {
    export * from '../../../packages/ai-client/dist/index';
}

export { };
