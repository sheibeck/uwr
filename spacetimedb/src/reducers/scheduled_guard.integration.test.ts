/**
 * Phase 46.1 review fix CR-01: every scheduled reducer is callable by any client with a forged
 * arg, so each one must start with the module-identity guard (the `llm_run` pattern). The
 * self-rescheduling ones (regen_health, tick_casts, tick_day_night, sweep_inactivity) would
 * otherwise let a client fork one more perpetual chain per call.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
// @ts-ignore node types are not part of this module's tsconfig (same as other source-reading tests)
import { readFileSync } from 'node:fs';
import { capturedReducer } from '../helpers/schema_recorder';
import { MODULE, ALICE, T0, startSeed, fightCtx, rows } from '../helpers/combat_fight_fixture';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const GUARD = 'if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;';

/** Every scheduled reducer in the module: name, source file, and a representative scheduled-row arg. */
const SCHEDULED: Array<{ name: string; file: string; arg: any; touchesDb: boolean }> = [
  { name: 'regen_health', file: './combat.ts', arg: { scheduledId: 1n }, touchesDb: true },
  { name: 'tick_casts', file: './combat.ts', arg: { scheduledId: 1n }, touchesDb: true },
  { name: 'respawn_enemy', file: './combat.ts', arg: { scheduledId: 1n, locationId: 10n }, touchesDb: true },
  { name: 'tick_bard_songs', file: './combat.ts', arg: { scheduledId: 1n, bardCharacterId: 1n }, touchesDb: true },
  { name: 'tick_effects', file: './combat.ts', arg: { scheduledId: 1n }, touchesDb: false },
  { name: 'tick_hot', file: './combat.ts', arg: { scheduledId: 1n }, touchesDb: false },
  { name: 'tick_day_night', file: '../index.ts', arg: { scheduledId: 1n }, touchesDb: true },
  { name: 'sweep_inactivity', file: '../index.ts', arg: { scheduledId: 1n }, touchesDb: true },
  { name: 'disconnect_logout', file: './auth.ts', arg: { scheduledId: 1n, playerId: ALICE, disconnectAtMicros: 0n }, touchesDb: true },
  { name: 'character_logout', file: './characters.ts', arg: { scheduledId: 1n, characterId: 1n, ownerUserId: 7n }, touchesDb: true },
  { name: 'finish_gather', file: './items_gathering.ts', arg: { scheduledId: 1n, gatherId: 1n }, touchesDb: true },
  { name: 'despawn_event_content', file: './world_events.ts', arg: { scheduledId: 1n, eventId: 1n }, touchesDb: true },
];

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const { name } of SCHEDULED) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: the schema recorder could not capture it.`);
    }
    handlers[name] = h;
  }
}, 120_000);

/** A ctx whose db throws on ANY access, so returning cleanly proves the guard ran before the first read. */
function trapCtx(sender: any) {
  return {
    db: new Proxy({}, { get: (_t, prop) => { throw new Error(`db touched: ${String(prop)}`); } }),
    timestamp: { microsSinceUnixEpoch: T0 },
    sender,
    databaseIdentity: MODULE,
  };
}

describe('every scheduled reducer rejects a client caller before touching the db (CR-01)', () => {
  for (const { name, arg } of SCHEDULED) {
    it(`${name}: a forged client call returns without reading or writing anything`, () => {
      expect(() => handlers[name](trapCtx(ALICE), { arg })).not.toThrow();
    });
  }

  for (const { name, arg, touchesDb } of SCHEDULED.filter((s) => s.touchesDb)) {
    it(`${name}: control, the module identity gets past the guard (it reaches the db)`, () => {
      expect(() => handlers[name](trapCtx(MODULE), { arg })).toThrow(/db touched/);
    });
  }
});

describe('a forged call cannot fork a second self-rescheduling chain (CR-01)', () => {
  const cases: Array<{ name: string; table: string; seed: () => Record<string, any[]> }> = [
    { name: 'regen_health', table: 'health_regen_tick', seed: () => startSeed() },
    { name: 'tick_casts', table: 'cast_tick', seed: () => startSeed() },
    { name: 'sweep_inactivity', table: 'inactivity_tick', seed: () => startSeed() },
    {
      name: 'tick_day_night',
      table: 'day_night_tick',
      seed: () => ({
        ...startSeed(),
        world_state: [{ id: 1n, isNight: false, nextTransitionAtMicros: T0 + 1_000_000n }],
      }),
    },
  ];

  for (const { name, table, seed } of cases) {
    it(`${name}: the module reschedules exactly one tick, a client call schedules none`, () => {
      const forged = fightCtx(seed(), ALICE);
      handlers[name](forged, { arg: { scheduledId: 1n } });
      expect(rows(forged, table)).toHaveLength(0);

      const real = fightCtx(seed(), MODULE);
      handlers[name](real, { arg: { scheduledId: 1n } });
      expect(rows(real, table)).toHaveLength(1);
    });
  }
});

describe('source pin: the guard is the first statement of each scheduled reducer (CR-01)', () => {
  for (const { name, file } of SCHEDULED) {
    it(`${name}`, () => {
      const source = readFileSync(new URL(file, import.meta.url), 'utf-8');
      const start = source.indexOf(`scheduledReducers['${name}']`);
      expect(start).toBeGreaterThan(-1);
      const body = source.slice(start, start + 700);
      const guardAt = body.indexOf(GUARD);
      expect(guardAt).toBeGreaterThan(0);
      expect(body.slice(0, guardAt)).not.toMatch(/ctx\.db/);
    });
  }
});

describe('no scheduled table escapes the guard list (CR-01)', () => {
  it('every scheduled table in tables.ts is covered here or guarded by the round engine tests', () => {
    const tables = readFileSync(new URL('../schema/tables.ts', import.meta.url), 'utf-8');
    const declared = [...tables.matchAll(/scheduled: \(\) => scheduledReducers\['([a-z_]+)'\]/g)].map((m) => m[1]).sort();
    const coveredElsewhere = ['resolve_round_timer', 'combat_loop', 'resolve_pull']; // combat_rounds.integration.test.ts
    const covered = [...SCHEDULED.map((s) => s.name), ...coveredElsewhere].sort();
    expect(declared).toEqual(covered);
  });
});
