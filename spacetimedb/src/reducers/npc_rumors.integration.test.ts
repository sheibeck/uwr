/**
 * 51.3.1.1-26 (D-22, SC5): talk_to_npc feeds the region's recent pool rumours into the stored
 * npc_conversation input (regionRumors), so the approved "Recent word in ..." line reaches the
 * prompt. The real handler is captured from index.ts under the recording mock; rumour rows are
 * written through the real onPoolShift. Nothing calls the model: the job is only enqueued.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { poolWorld, poolCtx, T0, ALICE, REGION_ID, ORCHARD_ID, FLATS_ID, GOBLINS_ID, SKITTERERS_ID } from '../helpers/pool_fixture';
import { onPoolShift } from '../helpers/pool_events';
import { resolveRouteInput } from '../helpers/llm_inputs';
import { buildRouteLayers } from '../data/llm_layers';
import { DENSITY_RULES } from '../data/density_rules';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let talkToNpc: (ctx: any, args: any) => unknown;

beforeAll(async () => {
  await import('../index');
  const h = capturedReducer('talk_to_npc');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('talk_to_npc') is not a function: STOP and report; never edit production code to fix this.");
  }
  talkToNpc = h;
}, 120_000);

const NPC_ID = 50n;
const OTHER_REGION_ID = 2n;
const OTHER_PLACE_ID = 20n;

/** The pool world plus an NPC at the orchard (region 1) and a second region with one place. */
function world() {
  const seed = poolWorld({
    extra: {
      npc: [
        {
          id: NPC_ID,
          name: 'Marta Vell',
          npcType: 'vendor',
          locationId: ORCHARD_ID,
          description: 'A salt trader with sharp eyes.',
          greeting: 'Well met.',
          gender: 'female',
        },
      ],
      region: [
        {
          id: OTHER_REGION_ID,
          name: 'Glass Wastes',
          dangerMultiplier: 300n,
          regionType: 'wild',
          biome: 'desert',
          landmarks: '[]',
          threats: '[]',
        },
      ],
      location: [{ id: OTHER_PLACE_ID, name: 'Shard Hollow', description: 'Glass dunes.', zone: 'z', regionId: OTHER_REGION_ID }],
    },
  });
  return poolCtx(seed, ALICE, T0);
}

function talk(ctx: any): any {
  talkToNpc(ctx, { characterId: 1n, npcId: NPC_ID, message: 'Any news?' });
  const jobs = (ctx.db._tables.llm_job ?? []).filter((j: any) => j.route === 'npc_conversation');
  expect(jobs).toHaveLength(1);
  return resolveRouteInput(ctx, jobs[0]) as any;
}

const RUMOUR_TAIL = 'Marta Vell may pass this on as rumour when it fits the conversation.';

describe('talk_to_npc: recent word in the region (51.3.1.1-26)', () => {
  it('a recent wipe-out in the region reaches the stored input and the prompt line', () => {
    const ctx = world();
    onPoolShift(ctx, { kind: 'family_wiped', regionId: REGION_ID, locationId: FLATS_ID, familyId: SKITTERERS_ID }, T0 - 1_000_000n);

    const input = talk(ctx);
    expect(input.regionRumors).toEqual(['the skitterers are gone from Mother Pan Flats']);

    const { volatile } = buildRouteLayers('npc_conversation', input);
    expect(volatile).toContain(`\nRecent word in Ashen Reach: the skitterers are gone from Mother Pan Flats. ${RUMOUR_TAIL}`);
  });

  it('lists the newest first, at most RUMOR_PROMPT_MAX', () => {
    const ctx = world();
    onPoolShift(ctx, { kind: 'family_wiped', regionId: REGION_ID, locationId: FLATS_ID, familyId: SKITTERERS_ID }, T0 - 4_000_000n);
    onPoolShift(ctx, { kind: 'overrun_surge', regionId: REGION_ID, locationId: ORCHARD_ID, familyId: GOBLINS_ID }, T0 - 3_000_000n);
    onPoolShift(
      ctx,
      { kind: 'vacuum_takeover', regionId: REGION_ID, locationId: FLATS_ID, familyId: SKITTERERS_ID, takeoverFamilyId: GOBLINS_ID },
      T0 - 2_000_000n,
    );
    onPoolShift(ctx, { kind: 'region_trend', regionId: REGION_ID, trend: 'wilder' }, T0 - 1_000_000n);

    const input = talk(ctx);
    expect(input.regionRumors).toHaveLength(DENSITY_RULES.RUMOR_PROMPT_MAX);
    expect(input.regionRumors).toEqual([
      'Ashen Reach grows wilder',
      'with the skitterers gone, goblins have moved into Mother Pan Flats',
      'goblins swarm Glass Orchard',
    ]);
  });

  it('with no rumour rows regionRumors is empty and the prompt has no rumour line', () => {
    const ctx = world();
    const input = talk(ctx);
    expect(input.regionRumors).toEqual([]);
    expect(buildRouteLayers('npc_conversation', input).volatile).not.toContain('Recent word in');
  });

  it('a rumour older than RUMOR_TTL_MICROS is left out; one exactly at the cutoff is kept', () => {
    const stale = world();
    onPoolShift(
      stale,
      { kind: 'family_wiped', regionId: REGION_ID, locationId: FLATS_ID, familyId: SKITTERERS_ID },
      T0 - DENSITY_RULES.RUMOR_TTL_MICROS - 1n,
    );
    expect(talk(stale).regionRumors).toEqual([]);

    const edge = world();
    onPoolShift(
      edge,
      { kind: 'family_wiped', regionId: REGION_ID, locationId: FLATS_ID, familyId: SKITTERERS_ID },
      T0 - DENSITY_RULES.RUMOR_TTL_MICROS,
    );
    expect(talk(edge).regionRumors).toEqual(['the skitterers are gone from Mother Pan Flats']);
  });

  it('a rumour from another region never appears', () => {
    const ctx = world();
    onPoolShift(ctx, { kind: 'region_trend', regionId: OTHER_REGION_ID, trend: 'quieter' }, T0 - 1_000_000n);
    onPoolShift(ctx, { kind: 'family_wiped', regionId: OTHER_REGION_ID, locationId: OTHER_PLACE_ID, familyId: GOBLINS_ID }, T0 - 1_000_000n);
    expect((ctx.db._tables.pool_rumor ?? []).length).toBe(2);

    const input = talk(ctx);
    expect(input.regionRumors).toEqual([]);
    const { volatile } = buildRouteLayers('npc_conversation', input);
    expect(volatile).not.toContain('Glass Wastes grows quieter');
    expect(volatile).not.toContain('Shard Hollow');
  });

  it('reading the rumours writes nothing to pool_rumor', () => {
    const ctx = world();
    onPoolShift(ctx, { kind: 'family_wiped', regionId: REGION_ID, locationId: FLATS_ID, familyId: SKITTERERS_ID }, T0 - 1_000_000n);
    const snapshot = () => (ctx.db._tables.pool_rumor ?? []).map((r: any) => `${r.id}:${r.kind}:${r.atMicros}`);
    const before = snapshot();
    talk(ctx);
    expect(snapshot()).toEqual(before);
  });
});
