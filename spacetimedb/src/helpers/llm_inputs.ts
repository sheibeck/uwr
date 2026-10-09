// ============================================================================
// LLM route-input snapshots (Phase 41, pure module)
// ============================================================================
//
// The route input is snapshotted into llm_job.requestJson at enqueue, so a
// retry sees exactly what the player saw, and combat narration (whose round
// summary cannot be rebuilt later) needs no reads at all. The snapshot is JSON,
// so bigint fields travel as decimal strings; decode revives ONLY the bigint
// fields declared per route. A generic in-band tag is deliberately not used:
// NPC memory holds arbitrary model-written objects that must never be
// reinterpreted.
//
// No runtime import from the server entry point, schema/tables, events or
// location, so this module loads in plain Node vitest.
// ============================================================================

import type { LlmRoute } from '../data/llm_routes';
import type { RouteInputMap } from '../data/llm_layers';
import { REGION_ECONOMY_BIGINT_PATHS } from '../data/economy_design_rules';

type Json = unknown;

const isPlainObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A deep copy in which every bigint becomes its decimal string (JSON-safe).
 * Objects are rebuilt with own-property definitions, so a model-written
 * "__proto__" key stays an ordinary key.
 */
export function encodeRouteInput<T>(input: T): Json {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(input);
}

/**
 * The bigint fields each route input declares (llm_layers.ts input types).
 * `a[].b` means field `b` of every element of array `a`.
 */
export const ROUTE_BIGINT_PATHS: Readonly<Record<LlmRoute, readonly string[]>> = Object.freeze({
  creation_race: Object.freeze([]),
  creation_class_reveal: Object.freeze([]),
  creation_class: Object.freeze([]),
  world_gen_start: Object.freeze([]),
  world_gen: Object.freeze([]),
  world_gen_families: Object.freeze([]), // Phase 51.3.1.2: no bigint field
  skill_gen: Object.freeze(['level']),
  renown_perk_gen: Object.freeze([]),
  npc_conversation: Object.freeze([]),
  combat_narration: Object.freeze([
    'combatId',
    'roundNumber',
    'playerActions[].damageDealt',
    'playerActions[].healingDone',
    'enemyActions[].damageDealt',
    'enemyActions[].healingDone',
    'participantHpSummary[].hp',
    'participantHpSummary[].maxHp',
  ]),
  region_economy: Object.freeze([...REGION_ECONOMY_BIGINT_PATHS]),
  smoke_test: Object.freeze([]),
} as Record<LlmRoute, readonly string[]>);

const DECIMAL_INT = /^-?\d+$/;

function cloneJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(cloneJson);
  if (isPlainObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneJson(x)]));
  return v;
}

/** Convert the value at `segments` under `node` to bigint, in place, where it is a decimal-integer string. */
function reviveAt(node: unknown, segments: string[]): void {
  if (segments.length === 0 || node === null || typeof node !== 'object') return;
  const [head, ...rest] = segments;
  const isEach = head.endsWith('[]');
  const key = isEach ? head.slice(0, -2) : head;
  if (Array.isArray(node) || !Object.prototype.hasOwnProperty.call(node, key)) return;
  const holder = node as Record<string, unknown>;
  const child = holder[key];
  if (isEach) {
    if (!Array.isArray(child)) return;
    if (rest.length === 0) return;
    for (const el of child) reviveAt(el, rest);
    return;
  }
  if (rest.length === 0) {
    if (typeof child === 'string' && DECIMAL_INT.test(child)) holder[key] = BigInt(child);
    return;
  }
  reviveAt(child, rest);
}

/**
 * A deep copy of a stored snapshot in which only the route's declared bigint
 * fields are converted back to bigint. Every other string, including one that
 * merely looks numeric, is untouched.
 */
export function decodeRouteInput<R extends LlmRoute>(route: R, value: unknown): RouteInputMap[R] {
  const copy = cloneJson(value);
  for (const path of ROUTE_BIGINT_PATHS[route] ?? []) reviveAt(copy, path.split('.'));
  return copy as RouteInputMap[R];
}

/**
 * Fixed minimal inputs for the connectivity and grammar-warming smoke jobs.
 * These are test-call inputs, not game content, and carry no player data.
 */
export function smokeInputFor<R extends LlmRoute>(route: R): RouteInputMap[R] {
  const inputs: { [K in LlmRoute]: RouteInputMap[K] } = {
    creation_race: { raceDescription: 'A small, quiet folk of the hills.' },
    creation_class_reveal: { raceName: 'Hillfolk', raceNarrative: 'A quiet people of the hills.', archetype: 'warrior' },
    creation_class: {
      raceName: 'Hillfolk',
      raceNarrative: 'A quiet people of the hills.',
      archetype: 'warrior',
      className: 'Wanderer',
      classDescription: 'A traveler who walks the old roads.',
      firstAbility: {
        name: 'Stone Jab',
        description: 'A short, hard strike.',
        kind: 'damage',
        damageType: 'physical',
        resourceType: 'stamina',
      },
    },
    world_gen_start: {
      worldContext: 'A newly opened region at the edge of the map.',
      characterRace: 'Hillfolk',
      characterClass: 'Wanderer',
      characterArchetype: 'warrior',
      sourceRegionName: 'The Threshold',
      neighborRegions: [],
    },
    world_gen: {
      regionName: 'The Threshold',
      biome: 'plains',
      startLocation: { name: 'The Crossing', description: 'A quiet crossroads.', terrainType: 'plains' },
      npcsPresent: [{ name: 'Tester', npcType: 'vendor', gender: 'male' }],
      characterRace: 'Hillfolk',
      characterClass: 'Wanderer',
      characterArchetype: 'warrior',
      sourceRegionName: 'The Threshold',
      neighborRegions: [],
    },
    // Phase 51.3.1.2 (D-01): stage 2b, a fixed small region with one hub and no feud.
    world_gen_families: {
      regionName: 'The Threshold',
      biome: 'plains',
      dominantFaction: 'The Wardens',
      threats: ['Wolves at night'],
      places: [
        { name: 'The Crossing', terrainType: 'town', flag: 'hub' },
        { name: 'The Old Road', terrainType: 'plains', flag: 'ordinary' },
        { name: 'The Low Wood', terrainType: 'woods', flag: 'ordinary' },
      ],
      hubNames: ['The Crossing'],
      familyCount: 3,
      feudCount: 0,
    },
    skill_gen: {
      characterName: 'Tester',
      race: 'Hillfolk',
      className: 'Wanderer',
      archetype: 'warrior',
      level: 2n,
      existingAbilities: [],
    },
    renown_perk_gen: {
      characterName: 'Tester',
      className: 'Wanderer',
      raceName: 'Hillfolk',
      rank: 2,
      existingPerks: [],
    },
    npc_conversation: {
      npc: { name: 'Tester', npcType: 'villager', gender: 'male' },
      region: { name: 'The Threshold' },
      location: { name: 'The Crossing' },
      personality: {},
      affinityTier: 'neutral',
      playerMessage: 'Hello.',
      activeQuestCount: 0,
      maxQuests: 3,
    },
    combat_narration: {
      combatId: 1n,
      roundNumber: 1n,
      narrativeType: 'round',
      playerActions: [],
      enemyActions: [],
      effectsApplied: [],
      effectsExpired: [],
      deaths: [],
      nearDeathNames: [],
      hasCrit: false,
      hasKill: false,
      hasNearDeath: false,
      participantHpSummary: [],
    },
    // Typed-map entry only: region_economy is never smoked (not in LLM_SMOKE_ROUTES). A small region
    // with one family (Phase 51.3.1.1, D-47).
    region_economy: {
      mode: 'region',
      regionId: 1n,
      regionName: 'The Threshold',
      biome: 'plains',
      areaLevel: 1,
      dominantFaction: 'unknown',
      landmarks: [],
      threats: [],
      terrains: ['plains'],
      enemies: [],
      families: [
        {
          ref: 'E1',
          familyId: 1n,
          name: 'Field Rats',
          creatureType: 'beast',
          level: 1,
          members: [
            { ref: 'E1.tank', templateId: 1n, role: 'tank', name: 'Field Rat Brute' },
            { ref: 'E1.damage', templateId: 2n, role: 'damage', name: 'Field Rat' },
          ],
        },
      ],
      gatherSlots: ['common', 'uncommon', 'rare'],
      recipeSlots: [
        { tier: 'common', foreignRegionIndexes: [] },
        { tier: 'common', foreignRegionIndexes: [] },
        { tier: 'uncommon', foreignRegionIndexes: [] },
      ],
      foreignRegions: [],
      foreign: [],
      existingMaterials: [],
    },
    smoke_test: {},
  };
  return inputs[route];
}

/**
 * The archetype the player chose at creation (Character has no archetype
 * column; the creation-state row is the source). 'warrior' when absent.
 */
export function archetypeForPlayer(ctx: any, playerId: any): string {
  for (const row of ctx.db.character_creation_state.by_player.filter(playerId)) {
    return typeof row?.archetype === 'string' && row.archetype ? row.archetype : 'warrior';
  }
  return 'warrior';
}

const ARCHETYPES = new Set(['warrior', 'mystic']);
const archetypeOf = (row: any): string | null =>
  typeof row?.archetype === 'string' && ARCHETYPES.has(row.archetype) ? row.archetype : null;

/**
 * The archetype a CHARACTER was created with. Character has no archetype column, and the
 * creation state belongs to the identity that created the character, which is often not the
 * identity asking now (a second device or a new token has its own identity and no creation
 * state). So the lookup goes by the character, in this order:
 *   1. the creation state, of any identity of the character's user, that finalized this
 *      character (its characterName is the character's name; names are unique);
 *   2. any creation state of the user's identities that holds an archetype, `preferPlayerId`'s
 *      own first (when it is one of the user's identities);
 *   3. the class resource: a character with mana is a mystic;
 *   4. 'warrior'.
 * The player table has no userId index, so it is iterated (small; only on an enqueue).
 */
export function archetypeForCharacter(ctx: any, character: any, preferPlayerId?: any): string {
  const identities: any[] = [];
  for (const p of ctx.db.player.iter()) {
    if (p.userId != null && p.userId === character.ownerUserId) identities.push(p.id);
  }
  // The asking identity's state is preferred, but only when it is one of the user's identities.
  const preferHex = typeof preferPlayerId?.toHexString === 'function' ? preferPlayerId.toHexString() : null;
  identities.sort((a: any, b: any) => Number(b.toHexString() === preferHex) - Number(a.toHexString() === preferHex));

  const states: any[] = [];
  for (const id of identities) {
    for (const row of ctx.db.character_creation_state.by_player.filter(id)) states.push(row);
  }
  const named = states.find((s: any) => s.characterName === character.name && archetypeOf(s));
  if (named) return archetypeOf(named)!;
  const any = states.find((s: any) => archetypeOf(s));
  if (any) return archetypeOf(any)!;
  if (typeof character.maxMana === 'bigint' && character.maxMana > 0n) return 'mystic';
  return 'warrior';
}

/**
 * The route input for a job: the stored snapshot, the fixed smoke input, or
 * (for a Phase 40 renown job) the input rebuilt from its legacy keys plus the
 * character name. A job with no usable input throws a plain Error, which the
 * executor turns into a non-retryable failure.
 */
export function resolveRouteInput(tx: any, job: any): RouteInputMap[LlmRoute] {
  const noInput = () => new Error('llm job ' + String(job?.id) + ' has no route input');
  let req: unknown;
  try {
    req = JSON.parse(String(job?.requestJson ?? ''));
  } catch {
    throw noInput();
  }
  if (!isPlainObj(req)) throw noInput();

  if (req.smoke === true) return smokeInputFor(job.route);
  if (isPlainObj(req.input)) return decodeRouteInput(job.route, req.input);

  if (job.route === 'renown_perk_gen' && typeof req.className === 'string' && typeof req.raceName === 'string') {
    const character = job.characterId !== undefined ? tx.db.character.id.find(job.characterId) : undefined;
    return {
      characterName: character?.name ?? '',
      className: req.className,
      raceName: req.raceName,
      rank: Number(req.rank),
      existingPerks: Array.isArray(req.existingPerks) ? req.existingPerks : [],
    } as RouteInputMap['renown_perk_gen'];
  }
  throw noInput();
}
