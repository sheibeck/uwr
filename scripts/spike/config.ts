// Phase 39 spike harness constants. Throwaway: deleted in the phase cleanup plan.
// Erasable syntax only and no imports, so plain Node .mjs files can import it.

export const SPIKE_DB = 'uwr-spike';
export const SPIKE_SERVER = 'local';
export const SPIKE_WS_URI = 'ws://127.0.0.1:3000';
export const SPIKE_PING_URL = 'http://127.0.0.1:3000/v1/ping';

export const PHASE_DIR = '.planning/phases/39-procedure-to-claude-spike';
export const RESULTS_PATH = PHASE_DIR + '/39-spike-results.json';
export const RECORD_PATH = PHASE_DIR + '/39-SPIKE-RECORD.md';

export const BINDINGS_DIR = 'scripts/spike/bindings';
export const OUT_DIR = 'scripts/spike/out';
export const ENV_LOCAL = 'spacetimedb/.env.local';

/** Harness-side spend ceiling in micro-USD ($2.40); the module enforces the same figure. */
export const BUDGET_MICRO_USD = 2_400_000;

/** Operator CLI identity; must equal the constant in spacetimedb/src/spike/llm_spike.ts. */
export const CLI_IDENTITY = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';

/** Throws unless the target is exactly the local uwr-spike database. */
export function assertSpikeTarget(db: string, server: string): void {
  if (db !== SPIKE_DB) {
    throw new Error('spike guard: database must be ' + SPIKE_DB + ', got ' + JSON.stringify(db));
  }
  if (server !== SPIKE_SERVER) {
    throw new Error('spike guard: server must be ' + SPIKE_SERVER + ', got ' + JSON.stringify(server));
  }
}
