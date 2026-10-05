// Connection logging helpers used by src/net/connection.ts.
//
// SpacetimeDB 2.10.0 (PR #5707) delivers a websocket error on an ESTABLISHED
// connection to `onDisconnect(ctx, err)` instead of `onConnectError`. Errors
// that occur before the initial connection is established still go to
// `onConnectError`.
//
// These helpers deliberately take no generated-context argument: handlers
// annotated with the generated error-context type make TS 5.6 report TS2589
// (type instantiation excessively deep) against the 2.10.1 bindings.

export function logDisconnect(err?: Error): void {
  if (err) {
    console.warn('Disconnected from SpacetimeDB:', err);
  } else {
    console.log('Disconnected from SpacetimeDB');
  }
}

export function logConnectError(err: Error): void {
  console.log('Error connecting to SpacetimeDB:', err);
}
