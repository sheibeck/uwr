/**
 * 51.3.1.1-30 (D-68, SC5): talk_to_npc feeds the histories of the NPC's region's creature families
 * into the stored npc_conversation input (familyHistories, from regionFamilyHistories), so the
 * owner-approved "Creature families of ..." line (PROMPT-DRAFT R2-C) reaches the prompt. The real
 * handler is captured from index.ts under the recording mock, on the strict pool fixture. Nothing
 * calls the model: the job is only enqueued, and fetch is stubbed to fail loudly if anything tried.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { poolWorld, poolCtx, seedPools, T0, ALICE, REGION_ID, ORCHARD_ID, GOBLINS_ID, SKITTERERS_ID } from '../helpers/pool_fixture';
import { resolveRouteInput } from '../helpers/llm_inputs';
import { buildRouteLayers } from '../data/llm_layers';
import { DENSITY_RULES } from '../data/density_rules';
import { FAMILY_FEUD_KIND } from '../data/mechanical_vocabulary';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

let talkToNpc: (ctx: any, args: any) => unknown;
const fetchSpy = vi.fn(() => {
  throw new Error('no network in tests: a paid call was attempted');
});

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchSpy);
  await import('../index');
  const h = capturedReducer('talk_to_npc');
  if (typeof h !== 'function') {
    throw new Error("capturedReducer('talk_to_npc') is not a function: STOP and report; never edit production code to fix this.");
  }
  talkToNpc = h;
}, 120_000);

afterAll(() => {
  vi.unstubAllGlobals();
});

const NPC_ID = 50n;
const OTHER_REGION_ID = 2n;
const OTHER_PLACE_ID = 20n;
const SENTINELS_ID = 3n;
const OLD_ONES_ID = 4n;
const QUEST_FAMILY_ID = 5n;
const OTHER_REGION_FAMILY_ID = 6n;
const CRAWLERS_ID = 7n;

const GOBLINS_HISTORY = 'The goblins came down from the ridge when the mines closed, and the orchard keepers still curse them.';
const SKITTERERS_HISTORY = 'The skitterers boiled up out of the deep pans when the old salt works flooded.';
const SENTINELS_HISTORY = 'Built to guard the tide gates, the sentinels hate the skitterers that foul the old stones.';
const OLD_ONES_HISTORY = 'The old ones were here before the reach had a name.';

function familyRow(id: bigint, regionId: bigint, key: string, name: string, history: string) {
  return {
    id,
    regionId,
    key,
    name,
    singularNoun: 'beast',
    pluralNoun: 'beasts',
    temperament: 'wary',
    iconKey: 'beast',
    creatureType: 'beast',
    ambushVerb: 'burst',
    ambushRest: 'out of the dark',
    fitTerrains: 'woods',
    history,
  };
}

const NPC_ROW = {
  id: NPC_ID,
  name: 'Marta Vell',
  npcType: 'vendor',
  locationId: ORCHARD_ID,
  description: 'A salt trader with sharp eyes.',
  greeting: 'Well met.',
  gender: 'female',
};

const OTHER_REGION = {
  id: OTHER_REGION_ID,
  name: 'Glass Wastes',
  dangerMultiplier: 300n,
  regionType: 'wild',
  biome: 'desert',
  landmarks: '[]',
  threats: '[]',
};

/**
 * The pool world with an NPC at the orchard (region 1). With histories: the two fixture families get
 * one, plus a feud family, an older family, a later family, a quest family of one and a family of
 * another region, all with histories. Goblins hold a pool at the orchard; the Skitterers (at the flats)
 * and the Sentinels are the region's feud.
 */
function world(withHistories: boolean) {
  const seed = poolWorld({
    extra: {
      npc: [NPC_ROW],
      region: [OTHER_REGION],
      location: [{ id: OTHER_PLACE_ID, name: 'Shard Hollow', description: 'Glass dunes.', zone: 'z', regionId: OTHER_REGION_ID }],
    },
  });
  if (withHistories) {
    seed.creature_family = seed.creature_family.map((f: any) => ({
      ...f,
      history: f.id === GOBLINS_ID ? GOBLINS_HISTORY : f.id === SKITTERERS_ID ? SKITTERERS_HISTORY : '',
    }));
    seed.creature_family.push(
      familyRow(SENTINELS_ID, REGION_ID, 'ai:1:brine sentinels', 'Brine Sentinels', SENTINELS_HISTORY),
      familyRow(OLD_ONES_ID, REGION_ID, 'rule:1:old ones', 'Old Ones', OLD_ONES_HISTORY),
      familyRow(QUEST_FAMILY_ID, REGION_ID, 'quest:99', 'Quest Beasts', 'A quest beast with a past of its own.'),
      familyRow(OTHER_REGION_FAMILY_ID, OTHER_REGION_ID, 'ai:2:glass striders', 'Glass Striders', 'The striders walk the dunes at noon.'),
      familyRow(CRAWLERS_ID, REGION_ID, 'rule:1:dune crawlers', 'Dune Crawlers', 'The crawlers came last of all.'),
    );
    seed.family_relation.push(
      { id: 2n, familyId: SKITTERERS_ID, otherFamilyId: SENTINELS_ID, kind: FAMILY_FEUD_KIND },
      { id: 3n, familyId: SENTINELS_ID, otherFamilyId: SKITTERERS_ID, kind: FAMILY_FEUD_KIND },
    );
  }
  const ctx = poolCtx(seed, ALICE, T0);
  seedPools(ctx);
  return ctx;
}

function talk(ctx: any): any {
  talkToNpc(ctx, { characterId: 1n, npcId: NPC_ID, message: 'Any news?' });
  const jobs = (ctx.db._tables.llm_job ?? []).filter((j: any) => j.route === 'npc_conversation');
  expect(jobs).toHaveLength(1);
  return resolveRouteInput(ctx, jobs[0]) as any;
}

const FAMILIES_TAIL = 'Marta Vell may draw on these histories when it fits the conversation.';

describe('talk_to_npc: the creature families of the region (51.3.1.1-30, R2-C)', () => {
  it('stores the region family histories in regionFamilyHistories order: the place first, then the feud, then by id; at most NPC_FAMILY_HISTORIES_MAX', () => {
    const ctx = world(true);
    const input = talk(ctx);
    expect(DENSITY_RULES.NPC_FAMILY_HISTORIES_MAX).toBe(4);
    expect(input.familyHistories).toEqual([
      { name: 'Goblins', history: GOBLINS_HISTORY },
      { name: 'Salt-Crust Skitterers', history: SKITTERERS_HISTORY },
      { name: 'Brine Sentinels', history: SENTINELS_HISTORY },
      { name: 'Old Ones', history: OLD_ONES_HISTORY },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the stored input renders the approved line in the prompt', () => {
    const ctx = world(true);
    const { volatile } = buildRouteLayers('npc_conversation', talk(ctx));
    const strip = (s: string) => s.slice(0, -1);
    expect(volatile).toContain(
      `\nCreature families of Ashen Reach: Goblins: ${strip(GOBLINS_HISTORY)}; Salt-Crust Skitterers: ${strip(SKITTERERS_HISTORY)}; ` +
        `Brine Sentinels: ${strip(SENTINELS_HISTORY)}; Old Ones: ${strip(OLD_ONES_HISTORY)}. ${FAMILIES_TAIL}\n`,
    );
  });

  it('a quest family of one, a family of another region and a fifth family never appear', () => {
    const ctx = world(true);
    const input = talk(ctx);
    const names = input.familyHistories.map((f: any) => f.name);
    expect(names).not.toContain('Quest Beasts');
    expect(names).not.toContain('Glass Striders');
    expect(names).not.toContain('Dune Crawlers');
    const { volatile } = buildRouteLayers('npc_conversation', input);
    expect(volatile).not.toContain('Glass Striders');
    expect(volatile).not.toContain('Quest Beasts');
  });

  it('a region whose families have no history stores [] and the prompt has no family line', () => {
    const ctx = world(false);
    const input = talk(ctx);
    expect(input.familyHistories).toEqual([]);
    expect(buildRouteLayers('npc_conversation', input).volatile).not.toContain('Creature families of');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reading the histories writes nothing to creature_family or family_relation', () => {
    const ctx = world(true);
    const snapshot = () =>
      JSON.stringify(
        [...(ctx.db._tables.creature_family ?? []), ...(ctx.db._tables.family_relation ?? [])],
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      );
    const before = snapshot();
    talk(ctx);
    expect(snapshot()).toBe(before);
  });
});
