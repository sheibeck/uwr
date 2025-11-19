declare module 'spacetimedb' {
    // Comprehensive permissive ambient declarations used only for local development
    // Generated bindings expect many symbols to be available as both types and runtime values.

    // Basic primitives and helpers
    export type Timestamp = any;
    export const Timestamp: any;
    export type TimeDuration = any;
    export const TimeDuration: any;
    export const deepEqual: any;

    // Binary reader/writer (used as both types and values in generated code)
    export type BinaryReader = any;
    export const BinaryReader: any;
    export type BinaryWriter = any;
    export const BinaryWriter: any;

    // Algebraic type helpers
    export type AlgebraicType = any;
    export const AlgebraicType: any;

    // Provide a permissive namespace-like declaration for AlgebraicTypeVariants so
    // generated code that treats it like a namespace (e.g., __AlgebraicTypeVariants.Product)
    // will type-check during local development.
    export namespace AlgebraicTypeVariants {
        export type Product = any;
        export type Sum = any;
        export const Product: any;
        export const Sum: any;
    }

    // Table and cache types (often used generically in generated code)
    export type TableHandle<Row = any> = any;
    export const TableHandle: any;
    export type TableCache<Row = any> = any;
    export const TableCache: any;
    // Client cache with typed generic getOrCreateTable
    export interface ClientCache<Schema = any> {
        getOrCreateTable<T = any>(name: string | { tableName: string; rowType?: any; primaryKey?: string; primaryKeyInfo?: any }): TableCache<T>;
    }
    export const ClientCache: ClientCache;

    // Connection and builder types
    export type DbConnectionImpl<Schema = any> = any;
    export const DbConnectionImpl: any;
    // DbConnectionBuilder is used as a constructor with generics in generated code
    export class DbConnectionBuilder<DbView = any, ErrorCtx = any, SubEventCtx = any> {
        constructor(...args: any[]);
        withUri(uri: string): this;
        withModuleName(nameOrIdentity: string): this;
        withToken(token?: string): this;
        onConnect(callback: (ctx: any, identity: any, token: string) => void): this;
        onConnectError(callback: (ctx: any, error: Error) => void): this;
        onDisconnect(callback: (ctx: any, error?: Error | null) => void): this;
        build(): DbView;
    }
    export const DbConnectionBuilder: typeof DbConnectionBuilder;
    // Internal builder implementation used by generated bindings
    export class __DbConnectionBuilder<DbConn = any, ErrorCtx = any, SubEventCtx = any> {
        constructor(moduleInfo?: any, conv?: (imp: any) => any);
        withUri(uri: string): this;
        withModuleName(name: string): this;
        withToken(token?: string): this;
        onConnect(callback: (ctx: any, identity: any, token: string) => void): this;
        onConnectError(callback: (ctx: any, error: Error) => void): this;
        onDisconnect(callback: (ctx: any, error?: Error | null) => void): this;
        build(): DbConn;
    }
    // SubscriptionBuilder implementation shape used by generated bindings
    export class SubscriptionBuilderImpl<DbTables = any, DbReducers = any, SetReducerFlags = any> {
        constructor(connection?: any);
        onApplied(callback: (ctx: any) => void): this;
        onError(callback: (ctx: any, error: Error) => void): this;
        subscribe(queries: string | string[]): any;
        subscribeToAllTables(): void;
    }
    export const SubscriptionBuilderImpl: typeof SubscriptionBuilderImpl;

    // Identity and connection identifiers
    export type Identity = any;
    export const Identity: any;
    export type ConnectionId = any;
    export const ConnectionId: any;

    // Reducer and event context types
    export type Event<T = any> = any;
    export const Event: any;
    // Generic context interfaces used by generated bindings
    export type EventContextInterface<TTables = any, TReducers = any, TSetReducerFlags = any, TReducer = any> = any;
    export const EventContextInterface: EventContextInterface;
    export type ReducerEventContextInterface<TTables = any, TReducers = any, TSetReducerFlags = any, TReducer = any> = any;
    export const ReducerEventContextInterface: ReducerEventContextInterface;
    export type SubscriptionEventContextInterface<TTables = any, TReducers = any, TSetReducerFlags = any> = any;
    export const SubscriptionEventContextInterface: SubscriptionEventContextInterface;
    export type ErrorContextInterface<TTables = any, TReducers = any, TSetReducerFlags = any> = any;
    export const ErrorContextInterface: ErrorContextInterface;

    export type RemoteReducers = any;
    export const RemoteReducers: any;
    export type RemoteTables = any;
    export const RemoteTables: any;

    export type SetReducerFlags = any;
    export const SetReducerFlags: any;
    export type CallReducerFlags = any;
    export const CallReducerFlags: any;

    // Generic catch-all so `import * as spacetime from 'spacetimedb'` still works.
    const _default: any;
    export default _default;
}

export { };
declare module 'spacetimedb' {
    // Minimal any-typed declarations to satisfy generated bindings during local development.
    // Export named symbols as both value and type (any) so the generated bindings can use them
    // as types and as runtime values.
    export type Event<T = any> = any;
    export const Event: any;

    export type EventContextInterface = any;
    export const EventContextInterface: any;

    export type ReducerEventContextInterface = any;
    export const ReducerEventContextInterface: any;

    export type SubscriptionEventContextInterface = any;
    export const SubscriptionEventContextInterface: any;

    export type TableHandle = any;
    export const TableHandle: any;

    export type AlgebraicType = any;
    export const AlgebraicType: any;

    // Binary reader/writer are used as both value and type in generated bindings
    export type BinaryReader = any;
    export const BinaryReader: any;
    export type BinaryWriter = any;
    export const BinaryWriter: any;

    export type ClientCache = any;
    export const ClientCache: any;
    export type TableCache = any;
    export const TableCache: any;
    export type ConnectionId = any;
    export const ConnectionId: any;

    export type DbConnectionBuilder = any;
    export const DbConnectionBuilder: any;
    export type DbConnectionImpl = any;
    export const DbConnectionImpl: any;
    export type Identity = any;
    export const Identity: any;

    export type SubscriptionBuilderImpl = any;
    export const SubscriptionBuilderImpl: any;
    export type TimeDuration = any;
    export const TimeDuration: any;
    export type Timestamp = any;
    export const Timestamp: any;

    export const deepEqual: any;

    export type AlgebraicTypeVariants = any;
    export const AlgebraicTypeVariants: any;

    export type CallReducerFlags = any;
    export const CallReducerFlags: any;

    export type ErrorContextInterface = any;
    export const ErrorContextInterface: any;

    export type RemoteReducers = any;
    export const RemoteReducers: any;
    export type RemoteTables = any;
    export const RemoteTables: any;

    export type SetReducerFlags = any;
    export const SetReducerFlags: any;

    // Generic catch-all so `import * as spacetime from 'spacetimedb'` still works.
    const _default: any;
    export default _default;
}
