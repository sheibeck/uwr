/**
 * Phase 51.3.1.1 Plan 06: the onPoolShift seam (helpers/pool_events.ts): World event lines and the
 * rumour store, on the shared pool world and a strict mock db.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { rowColumnProblems } from './schema_recorder';
import { DENSITY_RULES } from '../data/density_rules';
import { worldEventName, rumorItem } from '../data/density_lines';
import { T0, REGION_ID, ORCHARD_ID, FLATS_ID, GOBLINS_ID, SKITTERERS_ID, poolWorld, poolCtx } from './pool_fixture';
import { onPoolShift, recentRumors } from './pool_events';
import type { PoolShift } from './pool_events';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const SEC = 1_000_000n;
const MIN = 60n * SEC;

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

const wiped: PoolShift = { kind: 'family_wiped', regionId: REGION_ID, locationId: ORCHARD_ID, familyId: GOBLINS_ID };

describe('onPoolShift: World event lines', () => {
  it('a family wipe writes one world_event line with the rule-based name and one rumour row', () => {
    const ctx = poolCtx(poolWorld());
    onPoolShift(ctx, wiped, T0);
    const events = rows(ctx, 'event_world');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('world_event');
    expect(events[0].message).toBe(
      worldEventName({ kind: 'family_wiped', plural: 'goblins', familyName: 'Goblins', placeName: 'Glass Orchard' }),
    );
    expect(events[0].message).toBe('The Goblins are gone from Glass Orchard');
    expect(rowColumnProblems('event_world', events[0])).toEqual([]);

    const rumors = rows(ctx, 'pool_rumor');
    expect(rumors).toHaveLength(1);
    expect(rumors[0]).toMatchObject({
      regionId: REGION_ID,
      locationId: ORCHARD_ID,
      kind: 'family_wiped',
      familyId: GOBLINS_ID,
      otherFamilyId: 0n,
      atMicros: T0,
    });
    expect(rowColumnProblems('pool_rumor', rumors[0])).toEqual([]);
  });

  it('overrun_surge, vacuum_takeover and region_trend each write their World event name', () => {
    const ctx = poolCtx(poolWorld());
    onPoolShift(ctx, { kind: 'overrun_surge', regionId: REGION_ID, locationId: ORCHARD_ID, familyId: SKITTERERS_ID }, T0);
    onPoolShift(
      ctx,
      { kind: 'vacuum_takeover', regionId: REGION_ID, locationId: ORCHARD_ID, familyId: GOBLINS_ID, takeoverFamilyId: SKITTERERS_ID },
      T0 + SEC,
    );
    onPoolShift(ctx, { kind: 'region_trend', regionId: REGION_ID, trend: 'wilder' }, T0 + 2n * SEC);
    onPoolShift(ctx, { kind: 'region_trend', regionId: REGION_ID, trend: 'quieter' }, T0 + 3n * SEC);
    expect(rows(ctx, 'event_world').map((e: any) => [e.kind, e.message])).toEqual([
      ['world_event', 'Skitterers swarm Glass Orchard'],
      ['world_event', 'With the goblins gone, skitterers move into Glass Orchard'],
      ['world_event', 'Ashen Reach grows wilder'],
      ['world_event', 'Ashen Reach grows quieter'],
    ]);
    const rumors = rows(ctx, 'pool_rumor');
    expect(rumors.map((r: any) => r.kind)).toEqual(['overrun_surge', 'vacuum_takeover', 'region_trend:wilder', 'region_trend:quieter']);
    expect(rumors[1]).toMatchObject({ familyId: GOBLINS_ID, otherFamilyId: SKITTERERS_ID });
    expect(rumors[2]).toMatchObject({ locationId: 0n, familyId: 0n, otherFamilyId: 0n });
  });

  it('keeps at most RUMOR_KEEP_PER_REGION rumours per region, dropping the oldest', () => {
    const ctx = poolCtx(poolWorld());
    const keep = DENSITY_RULES.RUMOR_KEEP_PER_REGION;
    for (let i = 0; i <= keep; i += 1) onPoolShift(ctx, wiped, T0 + BigInt(i) * SEC);
    const rumors = rows(ctx, 'pool_rumor');
    expect(rumors).toHaveLength(keep);
    expect(rumors.map((r: any) => r.atMicros)).not.toContain(T0);
    expect(rows(ctx, 'event_world')).toHaveLength(keep + 1);
  });

  it('drops rumours older than RUMOR_TTL_MICROS on the next write', () => {
    const ctx = poolCtx(poolWorld());
    onPoolShift(ctx, wiped, T0);
    onPoolShift(ctx, wiped, T0 + DENSITY_RULES.RUMOR_TTL_MICROS + SEC);
    expect(rows(ctx, 'pool_rumor').map((r: any) => r.atMicros)).toEqual([T0 + DENSITY_RULES.RUMOR_TTL_MICROS + SEC]);
  });

  it('another region keeps its own rumours', () => {
    const ctx = poolCtx(
      poolWorld({
        extra: {
          region: [{ id: 2n, name: 'Salt Wastes', dangerMultiplier: 400n, regionType: 'wild', biome: 'desert', landmarks: '[]', threats: '[]' }],
        },
      }),
    );
    onPoolShift(ctx, { kind: 'region_trend', regionId: 2n, trend: 'wilder' }, T0);
    for (let i = 1; i <= 6; i += 1) onPoolShift(ctx, wiped, T0 + BigInt(i) * SEC);
    expect(rows(ctx, 'pool_rumor').filter((r: any) => r.regionId === 2n)).toHaveLength(1);
  });

  it('unknown families, a deleted location or an unknown region write nothing and do not throw', () => {
    const ctx = poolCtx(poolWorld());
    expect(() => onPoolShift(ctx, { ...wiped, familyId: 99n }, T0)).not.toThrow();
    expect(() => onPoolShift(ctx, { ...wiped, familyId: undefined }, T0)).not.toThrow();
    expect(() =>
      onPoolShift(ctx, { kind: 'vacuum_takeover', regionId: REGION_ID, locationId: ORCHARD_ID, familyId: GOBLINS_ID, takeoverFamilyId: 98n }, T0),
    ).not.toThrow();
    expect(() => onPoolShift(ctx, { kind: 'region_trend', regionId: 77n, trend: 'wilder' }, T0)).not.toThrow();
    ctx.db.location.id.delete(ORCHARD_ID);
    expect(() => onPoolShift(ctx, wiped, T0)).not.toThrow();
    expect(rows(ctx, 'event_world')).toHaveLength(0);
    expect(rows(ctx, 'pool_rumor')).toHaveLength(0);
  });
});

describe('recentRumors', () => {
  it('returns at most RUMOR_PROMPT_MAX rumour items, newest first, within the TTL', () => {
    const ctx = poolCtx(poolWorld());
    onPoolShift(ctx, { kind: 'region_trend', regionId: REGION_ID, trend: 'quieter' }, T0);
    onPoolShift(ctx, wiped, T0 + MIN);
    onPoolShift(ctx, { kind: 'overrun_surge', regionId: REGION_ID, locationId: FLATS_ID, familyId: SKITTERERS_ID }, T0 + 2n * MIN);
    onPoolShift(
      ctx,
      { kind: 'vacuum_takeover', regionId: REGION_ID, locationId: ORCHARD_ID, familyId: GOBLINS_ID, takeoverFamilyId: SKITTERERS_ID },
      T0 + 3n * MIN,
    );
    const items = recentRumors(ctx, REGION_ID, T0 + 4n * MIN);
    expect(items).toHaveLength(DENSITY_RULES.RUMOR_PROMPT_MAX);
    expect(items).toEqual([
      rumorItem({ kind: 'vacuum_takeover', oldPlural: 'goblins', newPlural: 'skitterers', placeName: 'Glass Orchard' }),
      rumorItem({ kind: 'overrun_surge', plural: 'skitterers', placeName: 'Mother Pan Flats' }),
      rumorItem({ kind: 'family_wiped', plural: 'goblins', placeName: 'Glass Orchard' }),
    ]);
    expect(items[0]).toBe('with the goblins gone, skitterers have moved into Glass Orchard');
  });

  it('reads a region trend rumour and excludes rumours past the TTL without writing', () => {
    const ctx = poolCtx(poolWorld());
    onPoolShift(ctx, { kind: 'region_trend', regionId: REGION_ID, trend: 'quieter' }, T0);
    onPoolShift(ctx, wiped, T0 + MIN);
    expect(recentRumors(ctx, REGION_ID, T0 + 2n * MIN)).toEqual([
      'the goblins are gone from Glass Orchard',
      'Ashen Reach grows quieter',
    ]);
    // Exactly at the TTL a rumour still counts; past it, it is left out.
    expect(recentRumors(ctx, REGION_ID, T0 + DENSITY_RULES.RUMOR_TTL_MICROS)).toHaveLength(2);
    const late = T0 + DENSITY_RULES.RUMOR_TTL_MICROS + 30n * SEC;
    expect(recentRumors(ctx, REGION_ID, late)).toEqual(['the goblins are gone from Glass Orchard']);
    expect(rows(ctx, 'pool_rumor')).toHaveLength(2);
  });

  it('skips a rumour whose family or place is gone, and an empty region gives []', () => {
    const ctx = poolCtx(poolWorld());
    onPoolShift(ctx, wiped, T0);
    ctx.db.creature_family.id.delete(GOBLINS_ID);
    expect(recentRumors(ctx, REGION_ID, T0 + MIN)).toEqual([]);
    expect(recentRumors(ctx, 42n, T0)).toEqual([]);
  });
});
