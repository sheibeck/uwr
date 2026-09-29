// Phase 39 spike harness constants. Throwaway: deleted in the phase cleanup plan.
// Erasable syntax only and no imports, so plain Node .mjs files can import it.
//
// Targets: the harness talks to the local uwr-spike database by default. Maincloud is
// reachable only with the explicit opt-in SPIKE_TARGET=maincloud, and then only the one
// database uwr-spike-925iv (the user's REVISED 2026-09-29 decision in 39-CONTEXT.md:
// maincloud decides the gate; the user created that database and granted a publish
// permission for it). The production database `uwr` is never a target on any server.

export const MAINCLOUD_DB = 'uwr-spike-925iv';

export const PHASE_DIR = '.planning/phases/39-procedure-to-claude-spike';
export const LOCAL_RESULTS_PATH = PHASE_DIR + '/39-spike-results.json';
export const MAINCLOUD_RESULTS_PATH = PHASE_DIR + '/39-maincloud-results.json';
export const RECORD_PATH = PHASE_DIR + '/39-SPIKE-RECORD.md';

export interface SpikeTarget {
  name: 'local' | 'maincloud';
  db: string;
  server: string;
  wsUri: string;
  pingUrl: string | null;
  resultsPath: string;
  /** Harness-side spend ceiling in micro-USD. */
  budget: number;
}

export const TARGETS: { local: SpikeTarget; maincloud: SpikeTarget } = {
  local: {
    name: 'local',
    db: 'uwr-spike',
    server: 'local',
    wsUri: 'ws://127.0.0.1:3000',
    pingUrl: 'http://127.0.0.1:3000/v1/ping',
    resultsPath: LOCAL_RESULTS_PATH,
    budget: 2_400_000,
  },
  maincloud: {
    name: 'maincloud',
    db: MAINCLOUD_DB,
    server: 'maincloud',
    wsUri: 'wss://maincloud.spacetimedb.com',
    pingUrl: null,
    resultsPath: MAINCLOUD_RESULTS_PATH,
    budget: 1_800_000,
  },
};

/** Unset, empty and 'local' are the local target; 'maincloud' is the opt-in; anything else throws. */
export function resolveTarget(value: string | undefined): SpikeTarget {
  if (value === undefined || value === '' || value === 'local') return TARGETS.local;
  if (value === 'maincloud') return TARGETS.maincloud;
  throw new Error('spike guard: SPIKE_TARGET must be unset, local or maincloud');
}

export const TARGET: SpikeTarget = resolveTarget(process.env.SPIKE_TARGET);

// Existing exports, derived from the selected target so every importer is target-aware.
export const SPIKE_DB = TARGET.db;
export const SPIKE_SERVER = TARGET.server;
export const SPIKE_WS_URI = TARGET.wsUri;
export const SPIKE_PING_URL = TARGET.pingUrl;
export const RESULTS_PATH = TARGET.resultsPath;
export const BUDGET_MICRO_USD = TARGET.budget;

export const BINDINGS_DIR = 'scripts/spike/bindings';
export const OUT_DIR = 'scripts/spike/out';
export const ENV_LOCAL = 'spacetimedb/.env.local';

/** Operator CLI identity; must equal the constant in spacetimedb/src/spike/llm_spike.ts. */
export const CLI_IDENTITY = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';

/** Throws unless (db, server) is exactly the given target's database and server. */
export function assertSpikeTarget(db: string, server: string, target: SpikeTarget = TARGET): void {
  if (db !== target.db) {
    throw new Error('spike guard: database must be ' + target.db + ', got ' + JSON.stringify(db));
  }
  if (server !== target.server) {
    throw new Error('spike guard: server must be ' + target.server + ', got ' + JSON.stringify(server));
  }
}
