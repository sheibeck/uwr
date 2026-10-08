/**
 * The admin-only economy reducers (Phase 51.3, Plan 08). The registrar runs against the recording mock;
 * the db is strict, like the real one.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createMockCtx as createLenientMockCtx } from '../helpers/test-utils';
import { capturedReducer, createRecordingServerMock } from '../helpers/schema_recorder';
import { ADMIN_IDENTITIES, requireAdmin } from '../data/admin';
import { DEFAULT_DIALS } from '../data/economy_rules';
import { registerEconomyReducers } from './economy';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
  const { t, schema, SenderError } = createRecordingServerMock();
  const spacetimedb = schema({});
  registerEconomyReducers({ spacetimedb, t, SenderError, requireAdmin });
});

const createMockCtx = (o: Parameters<typeof createLenientMockCtx>[0] = {}) =>
  createLenientMockCtx({ ...o, strict: true });

const ident = (hex: string) => ({ toHexString: () => hex });
const CLI_HEX = 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e';
const admin = ident(CLI_HEX);
const stranger = ident('not-an-admin');

const rows = (ctx: any, table: string): any[] => ctx.db[table]._rows();
const reducer = (name: string) => {
  const fn = capturedReducer(name);
  expect(fn, `reducer ${name} registered`).toBeTypeOf('function');
  return fn as (...args: any[]) => any;
};

const ECONOMY_TABLES = ['economy_dials', 'economy_region_dial', 'economy_item_dial'];
const snapshot = (ctx: any) =>
  JSON.stringify(
    ECONOMY_TABLES.map((n) => rows(ctx, n)),
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
  );

const seeded = (extra: Record<string, any[]> = {}) => ({
  region: [{ id: 7n, name: 'Ashfall' }],
  item_template: [{ id: 40n, name: 'Ember Moss' }],
  ...extra,
});

const infoLines: string[] = [];
let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  infoLines.length = 0;
  spy = vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    infoLines.push(args.map(String).join(' '));
  });
});
afterEach(() => spy.mockRestore());

describe('the admin identity used here', () => {
  it('is pinned in data/admin.ts, the stranger is not', () => {
    expect(ADMIN_IDENTITIES.has(CLI_HEX)).toBe(true);
    expect(ADMIN_IDENTITIES.has(stranger.toHexString())).toBe(false);
  });
});

describe('economy_set_dial', () => {
  it('stores a global dial for the admin', () => {
    const ctx = createMockCtx({ sender: admin, seed: seeded() } as any);
    reducer('economy_set_dial')(ctx, { scope: 'global', scopeId: 0n, dial: 'gold', value: 250n });
    expect(rows(ctx, 'economy_dials')).toHaveLength(1);
    expect(rows(ctx, 'economy_dials')[0].goldPct).toBe(250n);
    expect(infoLines.join('\n')).toContain('scope=global');
    expect(infoLines.join('\n')).toContain('value=250');
  });

  it('refuses a stranger with "Admin only" and writes nothing', () => {
    const ctx = createMockCtx({ sender: stranger, seed: seeded() } as any);
    const before = snapshot(ctx);
    expect(() => reducer('economy_set_dial')(ctx, { scope: 'global', scopeId: 0n, dial: 'gold', value: 250n })).toThrow(
      'Admin only',
    );
    expect(snapshot(ctx)).toBe(before);
    expect(rows(ctx, 'economy_dials')).toHaveLength(0);
  });

  it('stores the clamped value for a value over the range, the same as the console', () => {
    const ctx = createMockCtx({ sender: admin, seed: seeded() } as any);
    reducer('economy_set_dial')(ctx, { scope: 'global', scopeId: 0n, dial: 'gold', value: 9000n });
    reducer('economy_set_dial')(ctx, { scope: 'global', scopeId: 0n, dial: 'gather', value: 1n });
    expect(rows(ctx, 'economy_dials')[0]).toMatchObject({ goldPct: 300n, gatherRatePct: 50n });
  });

  it('sets a region, a tier and an item pin', () => {
    const ctx = createMockCtx({ sender: admin, seed: seeded() } as any);
    reducer('economy_set_dial')(ctx, { scope: 'region', scopeId: 7n, dial: 'drop', value: 40n });
    reducer('economy_set_dial')(ctx, { scope: 'tier', scopeId: 0n, dial: 'epic', value: 25n });
    reducer('economy_set_dial')(ctx, { scope: 'item', scopeId: 40n, dial: 'drop', value: 0n });
    expect(rows(ctx, 'economy_region_dial')[0]).toMatchObject({ regionId: 7n, dropRatePct: 40n });
    expect(rows(ctx, 'economy_dials')[0].tierEpicPct).toBe(25n);
    expect(rows(ctx, 'economy_item_dial')).toEqual([{ itemTemplateId: 40n, dropRatePct: 0n }]);
  });

  it.each([
    ['unknown dial', { scope: 'global', scopeId: 0n, dial: 'luck', value: 5n }, 'unknown_dial'],
    ['unknown region', { scope: 'region', scopeId: 99n, dial: 'drop', value: 5n }, 'unknown_region'],
    ['unknown item', { scope: 'item', scopeId: 99n, dial: 'drop', value: 5n }, 'unknown_item'],
    ['unknown scope', { scope: 'galaxy', scopeId: 0n, dial: 'drop', value: 5n }, 'bad_scope'],
  ])('%s throws a SenderError naming the reason and writes nothing', (_label, args, reason) => {
    const ctx = createMockCtx({ sender: admin, seed: seeded() } as any);
    const before = snapshot(ctx);
    expect(() => reducer('economy_set_dial')(ctx, args)).toThrow(`Economy dial refused: ${reason}`);
    expect(snapshot(ctx)).toBe(before);
    expect(rows(ctx, 'economy_dials')).toHaveLength(0);
  });

  it('logs no identity', () => {
    const ctx = createMockCtx({ sender: admin, seed: seeded() } as any);
    reducer('economy_set_dial')(ctx, { scope: 'global', scopeId: 0n, dial: 'gold', value: 250n });
    expect(infoLines.join('\n')).not.toContain(CLI_HEX);
  });
});

describe('economy_reset', () => {
  const dirty = () =>
    seeded({
      economy_dials: [{ id: 1n, ...DEFAULT_DIALS, goldPct: 250n, aiEnabled: true }],
      economy_region_dial: [{ regionId: 7n, dropRatePct: 40n }],
      economy_item_dial: [{ itemTemplateId: 40n, dropRatePct: 0n }],
    });

  it('restores the defaults for the admin and keeps aiEnabled', () => {
    const ctx = createMockCtx({ sender: admin, seed: dirty() } as any);
    reducer('economy_reset')(ctx, { scope: 'global', scopeId: 0n });
    expect(rows(ctx, 'economy_dials')[0]).toMatchObject({ ...DEFAULT_DIALS, aiEnabled: true });
    expect(rows(ctx, 'economy_region_dial')).toHaveLength(0);
    expect(rows(ctx, 'economy_item_dial')).toHaveLength(0);
  });

  it('resets one region and one item', () => {
    const ctx = createMockCtx({ sender: admin, seed: dirty() } as any);
    reducer('economy_reset')(ctx, { scope: 'region', scopeId: 7n });
    expect(rows(ctx, 'economy_region_dial')).toHaveLength(0);
    expect(rows(ctx, 'economy_item_dial')).toHaveLength(1);
    reducer('economy_reset')(ctx, { scope: 'item', scopeId: 40n });
    expect(rows(ctx, 'economy_item_dial')).toHaveLength(0);
    expect(rows(ctx, 'economy_dials')[0].goldPct).toBe(250n);
  });

  it('throws for a stranger and writes nothing', () => {
    const ctx = createMockCtx({ sender: stranger, seed: dirty() } as any);
    const before = snapshot(ctx);
    expect(() => reducer('economy_reset')(ctx, { scope: 'global', scopeId: 0n })).toThrow('Admin only');
    expect(snapshot(ctx)).toBe(before);
  });

  it('refuses an unknown scope', () => {
    const ctx = createMockCtx({ sender: admin, seed: dirty() } as any);
    const before = snapshot(ctx);
    expect(() => reducer('economy_reset')(ctx, { scope: 'tier', scopeId: 0n })).toThrow('bad_scope');
    expect(snapshot(ctx)).toBe(before);
  });
});

describe('economy_set_ai_enabled', () => {
  it('sets aiEnabled for the admin', () => {
    const ctx = createMockCtx({ sender: admin, seed: seeded() } as any);
    reducer('economy_set_ai_enabled')(ctx, { enabled: true });
    expect(rows(ctx, 'economy_dials')[0].aiEnabled).toBe(true);
    reducer('economy_set_ai_enabled')(ctx, { enabled: false });
    expect(rows(ctx, 'economy_dials')[0].aiEnabled).toBe(false);
  });

  it('throws for a stranger and aiEnabled stays false', () => {
    const ctx = createMockCtx({
      sender: stranger,
      seed: seeded({ economy_dials: [{ id: 1n, ...DEFAULT_DIALS }] }),
    } as any);
    expect(() => reducer('economy_set_ai_enabled')(ctx, { enabled: true })).toThrow('Admin only');
    expect(rows(ctx, 'economy_dials')[0].aiEnabled).toBe(false);
  });
});

describe('economy_repair_region (review B WR-01 / WR-02)', () => {
  it('throws for a stranger before any read', () => {
    const ctx = createMockCtx({ sender: stranger, seed: seeded() } as any);
    expect(() => reducer('economy_repair_region')(ctx, { regionId: 7n })).toThrow('Admin only');
  });

  it('refuses an unknown region and a region with no economy, writing nothing', () => {
    const ctx = createMockCtx({ sender: admin, seed: seeded() } as any);
    expect(() => reducer('economy_repair_region')(ctx, { regionId: 99n })).toThrow('unknown_region');
    expect(() => reducer('economy_repair_region')(ctx, { regionId: 7n })).toThrow('no_economy');
    expect(rows(ctx, 'region_economy')).toHaveLength(0);
  });
});
