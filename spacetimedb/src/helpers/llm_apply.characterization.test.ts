/**
 * CHARACTERIZATION TESTS for the LLM apply layer (Phase 40 plan 05, converted in Phase 42).
 *
 * These tests call `applyLlmResult` and `applyLlmFailure` from `./llm_apply` directly and pin
 * their CURRENT behavior with full-database snapshots, including quirks. They began as the
 * Phase 40 characterization of the removed client-trusted reducer; Phase 42 (planning note 1)
 * converted them to drive the apply layer itself so the coverage survives that removal.
 *
 * Rules for editing this file:
 *  - Pin what the code does, never what it should do. A quirk stays a quirk.
 *  - Do not touch production code to make a case easier to test.
 *  - Snapshots are deterministic: fixed timestamp, Math.random stubbed, one
 *    shared identity object for seeding and for `job.playerId` (the mock DB compares
 *    identities with ===).
 *
 * Phase 41 (plan 03) deliberately changed the pinned behavior in the cases whose title
 * starts with "Phase 41": creation replies are clamped, the renown static fallback no
 * longer throws for bigint effects, and a terminal renown failure inserts the static
 * options. Every other case still pins what the code does, unchanged.
 *
 * Phase 46 (plan 02) deliberately changed the pinned behavior in the cases whose title starts
 * with "Phase 46": every npc, narrative, creation and creation_error row a narrative route
 * writes now carries a `segments` array (Keeper narration, or NPC dialogue for an NPC reply)
 * and its message is derived from it. The wording of every line is unchanged, and the stored
 * snapshots show the added `segments` arrays. The NPC reply with no dialogue now stores the
 * mutter narration line instead of an NPC "..." line, and an NPC reply that is not JSON now
 * carries one Keeper narration segment. Every other case still pins what the code does.
 *
 * Phase 46 (plan 03) deliberately changed the combat_narration cases whose title starts with
 * "Phase 46": the stored text and the private event message are the flattened segments (no
 * "[Round N] " prefix any more), each private event carries its segments, JSON without a
 * narrative now stores the Keeper fallback line instead of the JSON text, and an empty
 * successful reply now stores that fallback line (one row per participant, one
 * combat_narrative row) instead of nothing. The world_gen (fill) failure line for a character
 * whose row is gone now carries one Keeper narration segment (same wording).
 *
 * Phase 46 (plan 09) applied the owner-approved voice wording (46-VOICE-CHANGES.md ids string-* and
 * fallback-*): the fixed Keeper lines these cases quote now read in the approved second-person
 * narrator voice (no third-person Keeper, no first person, quotation marks dropped from the
 * skill and renown presentations). The re-recorded snapshots differ from the Plan 02 and 03
 * snapshots only in those lines, and every message and its segments changed together. The
 * behavior pinned by each case is unchanged.
 *
 * Known limits of the mock DB that these tests inherit: the lenient default mock maps the `by_name`
 * index accessor to the column `name`, so the real `race_definition.by_name` (column `nameLower`)
 * is exercised through a row whose `name` equals the lowercase race name. The race_definition cases
 * that must tell `name` from `nameLower` use the strict mock (`newCtx(seed, sender, true)`).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { rowColumnProblems, snapshotDb } from './schema_recorder';
import { createMockCtx, defaultLlmAdminStateRow } from './test-utils';
import { applyLlmResult, applyLlmFailure, type ApplyJob } from './llm_apply';
import { serializePerkEffect } from './renown';
import { clampToBudget } from './skill_budget';
import { RENOWN_PERK_POOLS } from '../data/renown_data';

vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const T0 = 1_700_000_000_000_000n; // 2023-11-14T22:13:20Z
const T_OLD = 1_600_000_000_000_000n;

const alice = { toHexString: () => 'a'.repeat(64) };

const ts = (micros: bigint) => ({ microsSinceUnixEpoch: micros });

// Load the real module graph through the recording mock: the recorder then knows every table,
// which `insertProblems` needs to check inserted rows against the declared columns.
beforeAll(async () => {
  await import('../index');
}, 120_000);

let randomSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.42);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  randomSpy.mockRestore();
  errorSpy.mockRestore();
});

type Seed = Record<string, any[]>;

function mergeSeeds(...parts: Seed[]): Seed {
  const out: Seed = {};
  for (const part of parts) {
    for (const [table, rows] of Object.entries(part)) (out[table] ??= []).push(...rows);
  }
  return out;
}

// The shared mock seeds a default llm_admin_state row (Phase 43). These snapshots dump the whole
// database and the apply path never reads the gate, so the table is seeded empty (and dropped from
// the dump while empty) to keep every stored snapshot unchanged.
function newCtx(seed: Seed, sender: any = alice, strict = false) {
  return createMockCtx({ seed: { llm_admin_state: [], ...seed }, sender, timestampMicros: T0, strict });
}

function rows(ctx: any, table: string): any[] {
  return ctx.db._tables[table] ?? [];
}

/**
 * The levels of the enemy types a fill reply named: every template except the server-made filler
 * members of their families (Plan 09). Fill tests use the strict mock, whose family_member.by_template
 * reads the real column.
 */
function replyEnemyLevels(ctx: any): bigint[] {
  const fillers = new Set(rows(ctx, 'family_member').filter((m: any) => m.filler).map((m: any) => m.enemyTemplateId));
  return rows(ctx, 'enemy_template').filter((e: any) => !fillers.has(e.id)).map((e: any) => e.level);
}

/** Sorted names of tables that hold rows (the mock creates empty tables on read). */
function nonEmptyTables(ctx: any): string[] {
  return Object.entries<any[]>(ctx.db._tables)
    .filter(([, list]) => list.length > 0)
    .map(([name]) => name)
    .sort();
}

function tableLengths(ctx: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, list] of Object.entries<any[]>(ctx.db._tables)) out[name] = list.length;
  return out;
}

/** Rows appended (inserted) since `before` that do not match the recorded table columns. */
function insertProblems(ctx: any, before: Record<string, number>): string[] {
  const problems: string[] = [];
  for (const [name, list] of Object.entries<any[]>(ctx.db._tables)) {
    for (const row of list.slice(before[name] ?? 0)) {
      for (const p of rowColumnProblems(name, row)) problems.push(`${name}: ${p}`);
    }
  }
  return problems;
}

function dump(ctx: any): string {
  const all = JSON.parse(snapshotDb(ctx.db));
  // newCtx seeds llm_admin_state empty (see there); an empty table is left out so the stored snapshots
  // stay as they were, while any row the apply path wrote to it would still show up.
  if (Array.isArray(all.llm_admin_state) && all.llm_admin_state.length === 0) delete all.llm_admin_state;
  // Plan 51.3-12: the fill and late-enemy hooks read the AI economy switch (economy_dials). The lenient mock
  // creates an empty table on that read; with no row the switch is off and nothing is written, so the empty
  // table is left out like llm_admin_state above. Any row written to it would still show up.
  if (Array.isArray(all.economy_dials) && all.economy_dials.length === 0) delete all.economy_dials;
  // Plan 51-01: a first spawn also marks the start location visited; helpers/visited_arrivals.test.ts pins that row.
  delete all.visited_location;
  return JSON.stringify(all, null, 2);
}

/**
 * Apply a stored job: success calls `applyLlmResult`, failure calls `applyLlmFailure`. Assert
 * every inserted row matches the recorded schema (the PIPE-08 bug class), and snapshot the
 * whole database.
 */
function exec(
  ctx: any,
  job: ApplyJob,
  args: { resultText?: string; success?: boolean } = {},
  opts: { skipSchemaCheck?: boolean } = {},
) {
  const before = tableLengths(ctx);
  if (args.success === false) applyLlmFailure(ctx, job);
  else applyLlmResult(ctx, job, args.resultText ?? '');
  if (!opts.skipSchemaCheck) expect(insertProblems(ctx, before)).toEqual([]);
  expect(dump(ctx)).toMatchSnapshot();
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function applyJob(domain: string, contextJson?: string, over: { playerId?: any } = {}): ApplyJob {
  return { domain, playerId: over.playerId ?? alice, contextJson };
}

function characterRow(over: Record<string, any> = {}) {
  return {
    id: 10n,
    ownerUserId: 7n,
    name: 'Tester',
    race: 'Ashkin',
    className: 'Emberblade',
    level: 3n,
    xp: 0n,
    gold: 0n,
    locationId: 100n,
    boundLocationId: 100n,
    groupId: undefined,
    cha: 10n,
    ...over,
  };
}

function creationState(step: string, over: Record<string, any> = {}) {
  return {
    id: 2n,
    playerId: alice,
    step,
    raceName: undefined,
    createdAt: ts(T_OLD),
    updatedAt: ts(T_OLD),
    ...over,
  };
}

const CTX_CHAR = JSON.stringify({ characterId: '10' });

const RACE_JSON = {
  raceName: 'Ashkin',
  narrative: 'Born of cinders and spite.',
  bonuses: {
    primary: { stat: 'str', value: 2 },
    secondary: { stat: 'dex', value: 1 },
    flavor: 'Ember-warm.',
  },
};

// Phase 43 (plan 13): the class is two replies. Stage 1 (creation_class_reveal) carries the name, the
// description and the first ability; stage 2 (creation_class) carries the stats and two more abilities.
const CLASS_FIRST_ABILITY = {
  name: 'Ember Slash',
  description: 'A burning cut.',
  kind: 'damage',
  damageType: 'fire',
  value1: 12,
  castSeconds: 0,
  cooldownSeconds: 6,
  resourceCost: 5,
  resourceType: 'stamina',
  effectType: 'dot',
  effectDuration: 9,
};

const CLASS_REVEAL_JSON = {
  className: 'Emberblade',
  classDescription: 'A duelist who fights like a grudge.',
  firstAbility: CLASS_FIRST_ABILITY,
};

const CLASS_FILL_JSON = {
  stats: {
    primaryStat: 'str',
    secondaryStat: 'dex',
    bonusHp: 10,
    bonusMana: 0,
    armorProficiency: 'leather',
    armorProficiencies: ['leather', 'mail'],
    weaponProficiencies: ['sword', 'dagger'],
    usesMana: false,
  },
  abilities: [
    {
      name: 'Ash Veil',
      description: 'A curtain of soot.',
      kind: 'shield',
      value1: 10,
      castSeconds: 2,
      cooldownSeconds: 12,
      resourceCost: 8,
      resourceType: 'mana',
    },
    {
      // legacy field names: baseDamage, manaCost, effect
      name: 'Old Style',
      description: 'A legacy-shaped ability.',
      baseDamage: 7,
      manaCost: 4,
      effect: 'stun',
      castSeconds: 0,
      cooldownSeconds: 3,
    },
  ],
};

function skill(name: string, over: Record<string, any> = {}) {
  return {
    name,
    description: `${name} description.`,
    kind: 'damage',
    targetRule: 'single_enemy',
    resourceType: 'stamina',
    resourceCost: 5,
    castSeconds: 0,
    cooldownSeconds: 6,
    scaling: 'str',
    value1: 10,
    value2: null,
    damageType: 'physical',
    effectType: null,
    effectMagnitude: null,
    effectDuration: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Unrecognized domain
// ---------------------------------------------------------------------------

describe('llm apply: unrecognized domain', () => {
  it('an unrecognized domain does nothing on success', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('generic'), { resultText: '{"anything":true}' });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });

  it('an unrecognized domain does nothing on failure', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('generic'), { success: false });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Failure paths (success: false), Task 1 domains
// ---------------------------------------------------------------------------

describe('llm apply failure path: creation and skill_gen', () => {
  it('creation_race failure appends creation_error and reverts the step to AWAITING_RACE', () => {
    const ctx = newCtx({
      character_creation_state: [creationState('GENERATING_RACE')],
    });
    exec(ctx, applyJob('creation_race'), { success: false });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
  });

  // Deliberate change (review WR-B03): a creation failure only acts on a state still at its
  // GENERATING step. With no such state there is nothing to revert and nothing to say.
  it('creation_race failure without a creation state posts nothing', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('creation_race'), { success: false });
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
    expect(rows(ctx, 'character_creation_state')).toHaveLength(0);
  });

  it('creation_class_reveal failure appends creation_error and reverts the step to AWAITING_ARCHETYPE', () => {
    const ctx = newCtx({
      character_creation_state: [creationState('GENERATING_CLASS')],
    });
    exec(ctx, applyJob('creation_class_reveal'), { success: false });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
  });

  // Phase 43 (plan 13): a failed fill keeps the reveal and waits for the player's next input.
  it('creation_class (fill) failure sets CLASS_FILL_ERROR, keeps the class name and first ability and posts one in-voice line', () => {
    const ctx = newCtx({
      character_creation_state: [
        creationState('CLASS_FILLING', {
          className: 'Emberblade',
          classDescription: 'A duelist who fights like a grudge.',
          abilities: JSON.stringify([CLASS_FIRST_ABILITY]),
        }),
      ],
    });
    exec(ctx, applyJob('creation_class'), { success: false });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_FILL_ERROR');
    expect(state.className).toBe('Emberblade');
    expect(JSON.parse(state.abilities)).toHaveLength(1);
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('skill_gen failure writes an in-voice private narrative for the character owner', () => {
    const ctx = newCtx({
      character: [characterRow()],
    });
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { success: false });
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'narrative' });
    expect(ev[0].message).toContain('Your potential eludes crystallization');
  });

  it('skill_gen failure for a missing character writes nothing', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { success: false });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });

  // Phase 41 (plan 03): a terminal renown failure no longer does nothing. The static options
  // for the rank are inserted and the Keeper says so, so an earned offer is never lost.
  it('Phase 41: renown_perk_gen failure inserts the static options for the rank and one Keeper line', () => {
    const ctx = newCtx({
      character: [characterRow()],
    });
    exec(ctx, applyJob('renown_perk_gen', JSON.stringify({ characterId: '10', rank: '2' })), { success: false });
    expect(nonEmptyTables(ctx)).toEqual(['character', 'event_private', 'pending_renown_perk']);
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
    expect(rows(ctx, 'pending_renown_perk').every((p: any) => p.characterId === 10n && p.rank === 2n)).toBe(true);
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'narrative' });
    expect(ev[0].message).toContain('The cosmos shrugs and offers some... standard options');
  });
});

// ---------------------------------------------------------------------------
// creation_race success
// ---------------------------------------------------------------------------

describe('llm apply creation_race success', () => {
  const seed = () => ({
    character_creation_state: [creationState('GENERATING_RACE')],
  });

  it('applies a valid reply: state, creation event and race_definition', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_race'), { resultText: JSON.stringify(RACE_JSON) });

    const state = rows(ctx, 'character_creation_state')[0];
    expect(state).toMatchObject({
      step: 'AWAITING_ARCHETYPE',
      raceName: 'Ashkin',
      raceNarrative: 'Born of cinders and spite.',
    });
    expect(JSON.parse(state.raceBonuses).primary).toEqual({ stat: 'str', value: 2 });
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].message).toContain('+2 STR, +1 DEX. Ember-warm.');
    expect(rows(ctx, 'race_definition')).toHaveLength(1);
    expect(rows(ctx, 'race_definition')[0]).toMatchObject({ name: 'Ashkin', nameLower: 'ashkin' });
  });

  it('accepts a reply wrapped in a markdown code fence', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_race'), { resultText: '```json\n' + JSON.stringify(RACE_JSON) + '\n```' });
    expect(rows(ctx, 'character_creation_state')[0].raceName).toBe('Ashkin');
  });

  it('accepts a reply with prose around the JSON object (brace extraction)', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_race'), { resultText: 'Here you go: ' + JSON.stringify(RACE_JSON) + ' Enjoy.' });
    expect(rows(ctx, 'character_creation_state')[0].raceName).toBe('Ashkin');
  });

  it('does not add a second race_definition when one already exists for the race, and the state takes the stored name and bonuses (CR-01, IN-10)', () => {
    // Strict mock: by_name resolves to the declared index column nameLower, so the display name
    // (Ashkin) and the lookup key (ashkin) are different strings and the test can tell them apart.
    const stored = '{"primary":{"stat":"cha","value":3},"secondary":{"stat":"wis","value":2},"flavor":"Old ash."}';
    const ctx = newCtx({
      ...seed(),
      race_definition: [
        { id: 9n, name: 'Ashkin', nameLower: 'ashkin', narrative: 'old', bonusesJson: stored, createdAt: ts(T_OLD) },
      ],
    }, alice, true);
    exec(ctx, applyJob('creation_race'), { resultText: JSON.stringify(RACE_JSON) });
    expect(rows(ctx, 'race_definition')).toHaveLength(1);
    expect(rows(ctx, 'race_definition')[0].narrative).toBe('old');
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('AWAITING_ARCHETYPE');
    // The reply said str +2 / dex +1; the stored definition (cha +3 / wis +2) is the one source.
    expect(state.raceBonuses).toBe(stored);
    expect(state.raceName).toBe('Ashkin'); // the stored display name, never nameLower
    const msg = rows(ctx, 'event_creation')[0].message as string;
    expect(msg).toContain('+3 CHA, +2 WIS. Old ash.');
    expect(msg).not.toContain('+2 STR');
  });

  it('Phase 41 / CR-01: a reply without raceName stores "Unknown" with NO bonus, prints "**Unknown**" and saves no definition', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_race'), { resultText: JSON.stringify({ narrative: 'Nothing much.' }) });
    expect(rows(ctx, 'character_creation_state')[0].raceName).toBe('Unknown');
    // No definition exists for the placeholder, so finalize and level-up would find no bonus.
    expect(JSON.parse(rows(ctx, 'character_creation_state')[0].raceBonuses)).toEqual({});
    const msg = rows(ctx, 'event_creation')[0].message as string;
    expect(msg).toContain('**Unknown**');
    expect(msg).not.toMatch(/\+\d [A-Z]{3}/);
    expect(rows(ctx, 'race_definition')).toHaveLength(0);
  });

  it.each(['Unknown', 'unknown', ' UNKNOWN '])(
    'WR-06: a reply that names the reserved placeholder %j saves no race_definition and carries no bonus',
    (name) => {
      const ctx = newCtx(seed());
      applyLlmResult(ctx, applyJob('creation_race'), JSON.stringify({ ...RACE_JSON, raceName: name }));
      const state = rows(ctx, 'character_creation_state')[0];
      expect(state.step).toBe('AWAITING_ARCHETYPE');
      expect(state.raceName).toBe('Unknown');
      expect(JSON.parse(state.raceBonuses)).toEqual({});
      expect(rows(ctx, 'race_definition')).toHaveLength(0);
      const msg = rows(ctx, 'event_creation')[0].message as string;
      expect(msg).toContain('**Unknown**');
      expect(msg).not.toMatch(/\+\d [A-Z]{3}/);
    },
  );

  it("WR-06: a definition already stored under 'Unknown' is neither reused nor added to", () => {
    const stored = '{"primary":{"stat":"cha","value":3},"secondary":{"stat":"wis","value":2}}';
    const ctx = newCtx({
      ...seed(),
      race_definition: [
        { id: 9n, name: 'Unknown', nameLower: 'unknown', narrative: 'old', bonusesJson: stored, createdAt: ts(T_OLD) },
      ],
    }, alice, true);
    applyLlmResult(ctx, applyJob('creation_race'), JSON.stringify({ ...RACE_JSON, raceName: 'Unknown' }));
    expect(rows(ctx, 'race_definition')).toHaveLength(1);
    expect(JSON.parse(rows(ctx, 'character_creation_state')[0].raceBonuses)).toEqual({});
  });

  it('malformed JSON reverts the step and reports the error', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_race'), { resultText: 'the cosmos declined to answer' });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_RACE');
    expect(rows(ctx, 'event_creation')[0]).toMatchObject({ kind: 'creation_error' });
    expect(rows(ctx, 'event_creation')[0].message).toBe('The answer comes back garbled, as though the cosmic machinery had choked on it. Try again.');
    expect(rows(ctx, 'race_definition')).toHaveLength(0);
  });

  it('with no creation state returns silently: no event', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('creation_race'), { resultText: JSON.stringify(RACE_JSON) });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// creation_class_reveal and creation_class success (two stages, Phase 43)
// ---------------------------------------------------------------------------

describe('llm apply creation_class_reveal success (stage 1)', () => {
  const seed = () => ({
    character_creation_state: [
      creationState('GENERATING_CLASS', { raceName: 'Ashkin', raceNarrative: 'Born of cinders.' }),
    ],
  });

  it('applies a valid reply: CLASS_FILLING, the class identity, one ability, one pending fill job and the reveal event', () => {
    const ctx = openGateCtx(seed());
    exec(ctx, applyJob('creation_class_reveal'), { resultText: JSON.stringify(CLASS_REVEAL_JSON) });

    const state = rows(ctx, 'character_creation_state')[0];
    expect(state).toMatchObject({
      step: 'CLASS_FILLING',
      className: 'Emberblade',
      classDescription: 'A duelist who fights like a grudge.',
      raceName: 'Ashkin',
    });
    expect(state.classStats).toBeUndefined();
    expect(JSON.parse(state.abilities)).toHaveLength(1);
    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'creation_class', status: 'pending' });
    const msg = rows(ctx, 'event_creation')[0].message as string;
    expect(msg).toContain('**Emberblade**');
    expect(msg).toContain('Your first ability:');
    expect(msg).toContain('Ember Slash');
    expect(msg).not.toContain('[Ember Slash]');
    expect(msg).toContain('fire damage, 12 base, instant, 6s cooldown, 5 stamina, dot (9s)');
    expect(msg).toContain('That is the shape of you.');
  });

  it('Phase 41: legacy ability field names are not read (vocabulary defaults apply) on a mystic first ability', () => {
    const ctx = openGateCtx({
      character_creation_state: [
        creationState('GENERATING_CLASS', { raceName: 'Ashkin', raceNarrative: 'Born of cinders.', archetype: 'mystic' }),
      ],
    });
    const legacy = {
      className: 'Cinder Mystic',
      classDescription: 'Glows unpleasantly.',
      firstAbility: { name: 'Spark', description: 'A spark.', baseDamage: 6, manaCost: 3, effect: 'stun', castSeconds: 1, cooldownSeconds: 4 },
    };
    exec(ctx, applyJob('creation_class_reveal'), { resultText: JSON.stringify(legacy) });
    const msg = rows(ctx, 'event_creation')[0].message as string;
    // baseDamage, manaCost and effect are ignored: kind defaults to damage, value1 to 15, a mystic
    // ability costs mana (15 by default), and no effect line is printed.
    expect(msg).toContain('physical damage, 15 base, 1s cast, 4s cooldown, 15 mana');
    expect(msg).not.toContain('stun');
  });

  it('Phase 41: a reply with only firstAbility {} stores "Unknown Class" and "Unknown Ability" with defaults', () => {
    const ctx = openGateCtx(seed());
    exec(ctx, applyJob('creation_class_reveal'), { resultText: JSON.stringify({ firstAbility: {} }) });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_FILLING');
    expect(state.className).toBe('Unknown Class');
    expect(JSON.parse(state.abilities)).toHaveLength(1);
    expect(JSON.parse(state.abilities)[0].name).toBe('Unknown Ability');
    expect(rows(ctx, 'event_creation')[0].message).toContain('**Unknown Class**');
  });

  it('malformed JSON reverts to AWAITING_ARCHETYPE and enqueues nothing', () => {
    const ctx = openGateCtx(seed());
    exec(ctx, applyJob('creation_class_reveal'), { resultText: 'not json at all' });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });

  it('a reply without a usable firstAbility reverts to AWAITING_ARCHETYPE and enqueues nothing', () => {
    const ctx = openGateCtx(seed());
    exec(ctx, applyJob('creation_class_reveal'), { resultText: JSON.stringify({ className: 'Half Built', firstAbility: null }) });
    expect(rows(ctx, 'character_creation_state')[0].step).toBe('AWAITING_ARCHETYPE');
    expect(rows(ctx, 'character_creation_state')[0].className).toBeUndefined();
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
  });
});

describe('llm apply creation_class success (stage 2, the fill)', () => {
  const seed = () => ({
    character_creation_state: [
      creationState('CLASS_FILLING', {
        raceName: 'Ashkin',
        raceNarrative: 'Born of cinders.',
        className: 'Emberblade',
        classDescription: 'A duelist who fights like a grudge.',
        abilities: JSON.stringify([CLASS_FIRST_ABILITY]),
      }),
    ],
  });

  it('applies a valid reply: CLASS_REVEALED, stats, three abilities with the first kept first, presentation event', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_class'), { resultText: JSON.stringify(CLASS_FILL_JSON) });

    const state = rows(ctx, 'character_creation_state')[0];
    expect(state).toMatchObject({
      step: 'CLASS_REVEALED',
      className: 'Emberblade',
      classDescription: 'A duelist who fights like a grudge.',
      raceName: 'Ashkin',
    });
    expect(JSON.parse(state.classStats).primaryStat).toBe('str');
    const abilities = JSON.parse(state.abilities);
    expect(abilities).toHaveLength(3);
    expect(abilities[0].name).toBe('Ember Slash');
    const msg = rows(ctx, 'event_creation')[0].message as string;
    // Phase 41: 'mail' is not a vocabulary armor type, so the validator drops it.
    expect(msg).toContain('Primary: STR, Secondary: DEX | Armor: leather | Weapons: sword, dagger | Physical (+10 bonus HP)');
    expect(msg).toContain('[Ember Slash]');
    expect(msg).toContain('[Old Style]');
  });

  it('Phase 41: legacy ability field names are not read (vocabulary defaults apply) on a mana-user class line', () => {
    const ctx = newCtx({
      character_creation_state: [
        creationState('CLASS_FILLING', {
          raceName: 'Ashkin',
          raceNarrative: 'Born of cinders.',
          archetype: 'mystic',
          className: 'Cinder Mystic',
          classDescription: 'Glows unpleasantly.',
          abilities: JSON.stringify([{ ...CLASS_FIRST_ABILITY, name: 'Flare', resourceType: 'mana', resourceCost: 10, castSeconds: 1 }]),
        }),
      ],
    });
    const legacy = {
      stats: { primaryStat: 'int', secondaryStat: 'none', usesMana: true, bonusMana: 15, armorProficiency: 'cloth' },
      abilities: [
        { name: 'Spark', description: 'A spark.', baseDamage: 6, manaCost: 3, effect: 'stun', castSeconds: 1, cooldownSeconds: 4 },
      ],
    };
    exec(ctx, applyJob('creation_class'), { resultText: JSON.stringify(legacy) });
    const msg = rows(ctx, 'event_creation')[0].message as string;
    expect(msg).toContain('Primary: INT | Armor: cloth | Mana user (+15 bonus mana)');
    // baseDamage, manaCost and effect are ignored: kind defaults to damage, value1 to 15, the
    // mana cost to 15, and no effect line is printed for it.
    expect(msg).toContain('physical damage, 15 base, 1s cast, 4s cooldown, 15 mana');
    expect(msg).not.toContain('stun');
  });

  it('Phase 41: stats missing from the reply take the archetype defaults when the reply adds an ability', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_class'), { resultText: JSON.stringify({ abilities: [CLASS_FILL_JSON.abilities[0]] }) });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_REVEALED');
    expect(state.className).toBe('Emberblade');
    expect(JSON.parse(state.classStats)).toEqual({
      primaryStat: 'str',
      secondaryStat: 'dex',
      bonusHp: 0,
      bonusMana: 0,
      usesMana: false,
      weaponProficiencies: [],
      armorProficiencies: [],
    });
    expect(JSON.parse(state.abilities)).toHaveLength(2);
  });

  it('an empty object adds no ability: CLASS_FILL_ERROR, the reveal stays', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_class'), { resultText: '{}' });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_FILL_ERROR');
    expect(state.className).toBe('Emberblade');
    expect(JSON.parse(state.abilities)).toHaveLength(1);
    expect(state.classStats).toBeUndefined();
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
  });

  it('malformed JSON sets CLASS_FILL_ERROR and keeps the reveal (it does not revert to AWAITING_ARCHETYPE)', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_class'), { resultText: 'not json at all' });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_FILL_ERROR');
    expect(state.className).toBe('Emberblade');
    expect(JSON.parse(state.abilities)).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
  });

  it('Phase 41: a null ability entry is dropped, not fatal; with no usable extra ability the fill fails and the reveal stays', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('creation_class'), { resultText: JSON.stringify({ abilities: [null] }) });
    const state = rows(ctx, 'character_creation_state')[0];
    expect(state.step).toBe('CLASS_FILL_ERROR');
    expect(JSON.parse(state.abilities)).toHaveLength(1);
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].kind).toBe('creation_error');
  });
});

// ---------------------------------------------------------------------------
// skill_gen success
// ---------------------------------------------------------------------------

describe('llm apply skill_gen success', () => {
  const seed = () => ({
    character: [characterRow({ level: 3n })],
  });

  it('inserts three pending skills and presents them', () => {
    const ctx = newCtx(seed());
    const reply = { skills: [skill('Cinder Cut'), skill('Ash Ward', { kind: 'shield', resourceType: 'mana', castSeconds: 0 }), skill('Ember Pulse', { kind: 'heal', targetRule: 'self', scaling: 'wis' })] };
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify(reply) });

    const pending = rows(ctx, 'pending_skill');
    expect(pending).toHaveLength(3);
    expect(pending.map((p: any) => p.name)).toEqual(['Cinder Cut', 'Ash Ward', 'Ember Pulse']);
    expect(pending.every((p: any) => p.characterId === 10n && p.levelRequired === 3n)).toBe(true);
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'narrative' });
    expect(ev[0].message).toContain('Level 3. How quaint.');
    expect(ev[0].message).toContain('[Cinder Cut]');
  });

  it('applies the v2.0 validators on the way in (over-budget value, unknown kind, mana cast floor)', () => {
    const ctx = newCtx(seed());
    const reply = {
      skills: [
        skill('Overkill', { value1: 9999 }),
        skill('Mystery', { kind: 'nonsense' }),
        skill('Instant Mana', { resourceType: 'mana', castSeconds: 0 }),
      ],
    };
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify(reply) });
    const pending = rows(ctx, 'pending_skill');
    expect(pending[0].value1).toBeLessThan(9999n);
    expect(pending[1].kind).toBe('damage');
    expect(pending[2].castSeconds).toBe(1n);
  });

  it('accepts the Claude structured-output shape with explicit nulls', () => {
    const ctx = newCtx(seed());
    const reply = { skills: [skill('A'), skill('B'), skill('C')] };
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify(reply) });
    const pending = rows(ctx, 'pending_skill');
    expect(pending).toHaveLength(3);
    expect(pending[0].value2).toBeUndefined();
    expect(pending[0].effectType).toBeUndefined();
  });

  // Deliberate change (review CR-B02): a result never overwrites an offer the player may be
  // looking at. The old "retry safety" delete silently lost an earned offer.
  it('keeps an offer that is already pending for the character and inserts nothing', () => {
    const ctx = newCtx({
      ...seed(),
      pending_skill: [
        { id: 50n, characterId: 10n, name: 'Stale', description: 'old', kind: 'damage', targetRule: 'single_enemy', resourceType: 'mana', resourceCost: 1n, castSeconds: 1n, cooldownSeconds: 1n, scaling: 'none', value1: 1n, levelRequired: 3n, createdAt: ts(T_OLD) },
        { id: 51n, characterId: 99n, name: 'OtherChar', description: 'keep', kind: 'damage', targetRule: 'single_enemy', resourceType: 'mana', resourceCost: 1n, castSeconds: 1n, cooldownSeconds: 1n, scaling: 'none', value1: 1n, levelRequired: 3n, createdAt: ts(T_OLD) },
      ],
    });
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), skill('C')] }) }, { skipSchemaCheck: true });
    const names = rows(ctx, 'pending_skill').map((p: any) => p.name).sort();
    expect(names).toEqual(['OtherChar', 'Stale']);
  });

  it('QUIRK: fewer than three skills writes the grimace message and NO pending rows', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify({ skills: [skill('Only One'), skill('Only Two')] }) });
    expect(rows(ctx, 'pending_skill')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmic machinery sputtered');
  });

  it('QUIRK: a skill missing name or kind is skipped, dropping the batch under three (grimace)', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), { ...skill('C'), kind: '' }] }) });
    expect(rows(ctx, 'pending_skill')).toHaveLength(0);
    expect(rows(ctx, 'event_private')[0].message).toContain('sputtered');
  });

  it('QUIRK: only the first three skills are considered', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), skill('C'), skill('D')] }) });
    expect(rows(ctx, 'pending_skill').map((p: any) => p.name)).toEqual(['A', 'B', 'C']);
  });

  it('unparseable text writes the grimace message', () => {
    const ctx = newCtx(seed());
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: 'sorry, no skills today' });
    expect(rows(ctx, 'pending_skill')).toHaveLength(0);
    expect(rows(ctx, 'event_private')[0].message).toContain('sputtered');
  });

  it('a missing character returns silently', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('skill_gen', CTX_CHAR), { resultText: JSON.stringify({ skills: [skill('A'), skill('B'), skill('C')] }) });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Task 2 fixtures: world_gen_start, world_gen, npc_conversation, combat_narration, renown_perk_gen
// ---------------------------------------------------------------------------

const GEN_CTX = JSON.stringify({ genStateId: '5' });

function genState(over: Record<string, any> = {}) {
  return {
    id: 5n,
    playerId: alice,
    characterId: 10n,
    sourceLocationId: 0n,
    sourceRegionId: 0n,
    step: 'GENERATING',
    createdAt: ts(T_OLD),
    updatedAt: ts(T_OLD),
    ...over,
  };
}

// Phase 43 (plan 08) stages world generation: stage 1 (world_gen_start) reveals the region, its start
// location and its first NPC; stage 2 (world_gen) fills in the rest.
const WORLD_START_JSON = {
  regionName: 'Cinderfall',
  regionDescription: 'Ash drifts down like a slow, grey snowfall.',
  biome: 'volcanic',
  startLocation: { name: 'Ember Hollow', description: 'A sheltered town.', terrainType: 'town', levelOffset: 0 },
  firstNpc: { name: 'Vessa', gender: 'female', npcType: 'vendor', description: 'A soot-streaked trader.', greeting: 'Buy something.', personality: { traits: ['brisk'], speechPattern: 'clipped', knowledgeDomains: ['trade'], secrets: [], affinityMultiplier: 1.0 } },
};

const REGION_FILL_JSON = {
  dominantFaction: 'Ash Court',
  landmarks: ['The Slag Spire'],
  threats: ['ember wolves'],
  locations: [
    { name: 'Slag Road', description: 'A cracked road.', terrainType: 'plains', isSafe: false, levelOffset: 0, connectsTo: ['Ember Hollow', 'Ashen Pit'] },
    { name: 'Ashen Pit', description: 'A smoking crater.', terrainType: 'mountains', isSafe: false, levelOffset: 1, connectsTo: ['Slag Road'] },
  ],
  npcs: [
    { name: 'Old Brann', gender: 'male', npcType: 'lore', locationName: 'Nowhere In Particular', description: 'A hermit.', greeting: 'Hm.', personality: { traits: ['gruff'], speechPattern: 'slow', knowledgeDomains: ['ash'], secrets: [], affinityMultiplier: 1.0 } },
  ],
  enemies: [
    { name: 'Ember Wolf', creatureType: 'beast', role: 'melee', terrainTypes: 'plains', groupMin: 1, groupMax: 2, level: 1 },
    { name: 'Slag Caster', creatureType: 'humanoid', role: 'caster', terrainTypes: 'mountains', groupMin: 1, groupMax: 1, level: 1 },
  ],
};

/** Phase 51.3.1.2: the stage-2b (world_gen_families) reply, the families of the region. */
const WORLD_FAMILIES_JSON = {
  families: [
    {
      name: 'Ember Wolves',
      singularNoun: 'ember wolf',
      pluralNoun: 'ember wolves',
      creatureType: 'beast',
      iconKey: 'beast',
      temperament: 'aggressive',
      ambushVerb: 'lunge',
      ambushRest: 'out of the ash',
      members: [{ role: 'damage', name: 'Ember Wolf' }, { role: 'tank', name: 'Ember Packleader' }],
      fitLocations: ['Slag Road'],
      relations: [{ family: 'Slag Casters', kind: 'rival' }],
      history: 'The ash fell and the wolves came after it.',
      inFeud: false,
    },
    {
      name: 'Slag Casters',
      singularNoun: 'slag caster',
      pluralNoun: 'slag casters',
      creatureType: 'humanoid',
      iconKey: 'humanoid',
      temperament: 'wary',
      ambushVerb: 'rise',
      ambushRest: 'from the slag',
      members: [{ role: 'caster', name: 'Slag Caster' }],
      fitLocations: ['Ashen Pit'],
      relations: [],
      history: 'Old smiths who stayed too long by the fire.',
      inFeud: false,
    },
  ],
};

/** A character at location 0 waiting on stage 1 (the state is GENERATING). */
function worldSeed(over: { gen?: Record<string, any>; char?: Record<string, any> | null } = {}): Seed {
  return {
    world_gen_state: [genState(over.gen)],
    character: over.char === null ? [] : [characterRow({ locationId: 0n, boundLocationId: 0n, level: 1n, ...over.char })],
  };
}

/** Stage 1 has landed: its region, start location and first NPC are stored, the state is FILLING. */
function fillSeed(over: { gen?: Record<string, any>; char?: Record<string, any> | null; region?: Record<string, any> } = {}): Seed {
  return {
    world_gen_state: [genState({ step: 'FILLING', generatedRegionId: 1n, ...over.gen })],
    character: over.char === null ? [] : [characterRow({ locationId: 1n, boundLocationId: 1n, level: 1n, ...over.char })],
    region: [
      { id: 1n, name: 'Cinderfall', dangerMultiplier: 100n, regionType: 'generated', biome: 'volcanic', generatedByCharacterId: 10n, isGenerated: true, starterForRace: 'ashkin', ...over.region },
    ],
    location: [
      { id: 1n, name: 'Ember Hollow', description: 'A sheltered town.', zone: 'Cinderfall', regionId: 1n, levelOffset: 0n, isSafe: true, terrainType: 'town', bindStone: true, craftingAvailable: true },
    ],
    npc: [
      { id: 1n, name: 'Vessa', npcType: 'vendor', locationId: 1n, description: 'A soot-streaked trader.', greeting: 'Buy something.', gender: 'female', personalityJson: '{}' },
    ],
  };
}

const NPC_CTX = JSON.stringify({ characterId: '10', npcId: '20', memoryId: '30' });
const EMPTY_MEMORY = JSON.stringify({
  topics: [],
  questsCompleted: [],
  secretsShared: [],
  giftsGiven: [],
  lastConversationSummary: '',
});

function npcSeed(...extra: Seed[]): Seed {
  return mergeSeeds(
    {
      character: [characterRow()],
      npc: [
        { id: 20n, name: 'Marta', npcType: 'lore', locationId: 100n, description: 'A baker.', greeting: 'Hello.', personalityJson: JSON.stringify({ affinityMultiplier: 1.0 }) },
      ],
      npc_memory: [{ id: 30n, characterId: 10n, npcId: 20n, memoryJson: EMPTY_MEMORY, lastUpdated: ts(T_OLD) }],
      npc_affinity: [
        { id: 40n, characterId: 10n, npcId: 20n, affinity: 0n, lastInteraction: ts(T_OLD), giftsGiven: 0n, conversationCount: 0n },
      ],
    },
    ...extra,
  );
}

const WORLD_LOCS: Seed = {
  location: [
    { id: 100n, name: 'Market Square', regionId: 1n, isSafe: true, terrainType: 'town' },
    { id: 101n, name: 'Old Mill', regionId: 1n, isSafe: false, terrainType: 'plains' },
    { id: 102n, name: 'Far Field', regionId: 2n, isSafe: false, terrainType: 'plains' },
  ],
  location_connection: [
    { id: 1n, fromLocationId: 100n, toLocationId: 101n },
    { id: 2n, fromLocationId: 101n, toLocationId: 100n },
  ],
};

const WOLF_TEMPLATE: Seed = {
  enemy_template: [{ id: 60n, name: 'Wolf', level: 3n }],
  location_enemy_template: [{ id: 70n, locationId: 101n, enemyTemplateId: 60n }],
};

/** Plan 51.3.1.1-32 (D-74): the Wolf in a family pooled at the Old Mill (101), one hop from the market. */
const WOLF_POOLED: Seed = {
  ...WOLF_TEMPLATE,
  creature_family: [{
    id: 5n, regionId: 1n, key: '1:beast', name: 'Grey Wolves', singularNoun: 'grey wolf', pluralNoun: 'grey wolves', temperament: 'wary',
    iconKey: 'beast', creatureType: 'beast', ambushVerb: 'lunge', ambushRest: 'from the grass', fitTerrains: 'plains', history: '',
  }],
  family_member: [{ id: 1n, familyId: 5n, enemyTemplateId: 60n, role: 'damage', filler: false }],
  place_pool: [{
    id: 50n, regionId: 1n, locationId: 101n, kind: 'creature', refId: 5n, count: 50n, homeLevel: 2n,
    wipedAtMicros: 0n, lastSettledMicros: T_OLD, dirty: false, timeOfDay: 'any',
  }],
};

function npcReply(over: Record<string, any> = {}) {
  return JSON.stringify({
    dialogue: 'The bread is warm today.',
    effects: [],
    memoryUpdate: {},
    internalThought: '',
    ...over,
  });
}

function offer(over: Record<string, any> = {}) {
  return { type: 'offer_quest', questName: 'Rats in the Cellar', ...over };
}

// ---------------------------------------------------------------------------
// world_gen_start (stage 1) and world_gen (stage 2, the fill)
// ---------------------------------------------------------------------------

// Stage 1 enqueues the fill, which writes budget rows whose amounts follow the prompt sizes. Those rows
// are summarized (route and status per job) instead of dumped, so a prompt-size change does not rewrite
// the world snapshots; the job rows themselves are still checked against the recorded schema.
const LLM_PLUMBING_TABLES = ['llm_job', 'llm_dispatch', 'llm_player_budget', 'llm_spend', 'llm_sweep_tick', 'llm_admin_state'];

function worldDump(ctx: any): string {
  const all = JSON.parse(snapshotDb(ctx.db));
  for (const table of LLM_PLUMBING_TABLES) delete all[table];
  // Plan 51-01: the first spawn also marks the start location visited. That row is pinned by
  // helpers/visited_arrivals.test.ts, so the stored world snapshots stay as they were.
  delete all.visited_location;
  all._jobs = rows(ctx, 'llm_job').map((j: any) => `${j.route}:${j.status}`);
  return JSON.stringify(all, null, 2);
}

/** Like exec, for a stage-1 success: the calls gate is open and the plumbing tables are summarized. */
function execStageOne(
  ctx: any,
  args: { resultText?: string } = {},
) {
  const before = tableLengths(ctx);
  applyLlmResult(ctx, applyJob('world_gen_start', GEN_CTX), args.resultText ?? '');
  expect(insertProblems(ctx, before)).toEqual([]);
  expect(worldDump(ctx)).toMatchSnapshot();
}

/** A context whose LLM calls gate is open (newCtx seeds the gate row empty, which fails closed). */
function openGateCtx(seed: Seed) {
  return newCtx({ llm_admin_state: [defaultLlmAdminStateRow()], ...seed });
}

/**
 * Phase 51.3.1.2: a world_gen (stage 2a) success enqueues the families job (stage 2b) in the same
 * transaction, so the gate is open (strict mock) and the plumbing tables are summarized like stage 1.
 */
function openFillCtx(seed: Seed) {
  return newCtx({ llm_admin_state: [defaultLlmAdminStateRow()], ...seed }, alice, true);
}
function execStage(ctx: any, domain: string, resultText: string) {
  const before = tableLengths(ctx);
  applyLlmResult(ctx, applyJob(domain, GEN_CTX), resultText);
  expect(insertProblems(ctx, before)).toEqual([]);
  expect(worldDump(ctx)).toMatchSnapshot();
}

describe('llm apply world_gen_start failure path', () => {
  it('sets the state to ERROR and tells a placed character through a private system event', () => {
    const ctx = newCtx({
      world_gen_state: [genState({ step: 'GENERATING' })],
      character: [characterRow({ locationId: 100n })],
    });
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({
      step: 'ERROR',
      errorMessage: 'The map blurs and will not settle. The world refuses to be remembered right now.',
    });
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0]).toMatchObject({ kind: 'system', characterId: 10n, ownerUserId: 7n });
    expect(rows(ctx, 'event_private')[0].message).toContain(' Type [explore] to try again.');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('routes the message to the creation events when the character has no location yet', () => {
    const ctx = newCtx(worldSeed());
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0]).toMatchObject({ kind: 'creation_error', playerId: alice });
    expect(rows(ctx, 'event_creation')[0].message).toContain(' Type [explore] to try again.');
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('routes to the creation events when the character row is gone', () => {
    const ctx = newCtx(worldSeed({ char: null }));
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
  });

  it('a PENDING state is failed too', () => {
    const ctx = newCtx(worldSeed({ gen: { step: 'PENDING' } }));
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
  });

  it.each(['FILLING', 'FILL_ERROR', 'COMPLETE', 'ERROR'])(
    'a state already past stage 1 (%s) is left alone',
    (step) => {
      const ctx = newCtx(worldSeed({ gen: { step } }));
      exec(ctx, applyJob('world_gen_start', GEN_CTX), { success: false });
      expect(rows(ctx, 'world_gen_state')[0].step).toBe(step);
      expect(rows(ctx, 'event_creation')).toHaveLength(0);
      expect(rows(ctx, 'event_private')).toHaveLength(0);
    },
  );

  it('writes nothing when the generation state is gone', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { success: false });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });

  it('QUIRK: a context without genStateId throws (the whole call rolls back in production)', () => {
    const ctx = newCtx({});
    expect(() => applyLlmFailure(ctx, applyJob('world_gen_start', '{}'))).toThrow();
    const ctx2 = newCtx({});
    expect(() => applyLlmResult(ctx2, applyJob('world_gen_start', '{}'), '{}')).toThrow();
  });
});

describe('llm apply world_gen (fill) failure path', () => {
  it('sets the state to FILL_ERROR, adds the banker and tells a placed character through a private system event', () => {
    const ctx = newCtx(fillSeed());
    exec(ctx, applyJob('world_gen', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({
      step: 'FILL_ERROR',
      generatedRegionId: 1n,
      errorMessage: 'The Keeper loses the thread of the rest of the map. What he has already shown you will hold.',
    });
    expect(rows(ctx, 'npc').map((n: any) => n.name)).toEqual(['Vessa', 'The Ledger Keeper']);
    expect(rows(ctx, 'location')).toHaveLength(1);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0]).toMatchObject({ kind: 'system', characterId: 10n, ownerUserId: 7n });
    expect(rows(ctx, 'event_private')[0].message).toContain(' Type [explore] to try again.');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('Phase 46: routes the message to the creation events when the character row is gone (one Keeper narration segment)', () => {
    const ctx = newCtx(fillSeed({ char: null }));
    exec(ctx, applyJob('world_gen', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILL_ERROR');
    expect(rows(ctx, 'event_creation')[0].segments).toEqual([{ kind: 'narration', speaker: 'The Keeper', text: rows(ctx, 'event_creation')[0].message }]);
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
  });

  it.each(['GENERATING', 'PENDING', 'FILL_ERROR', 'COMPLETE', 'ERROR'])(
    'a state that is not FILLING (%s) is left alone',
    (step) => {
      const ctx = newCtx(fillSeed({ gen: { step } }));
      exec(ctx, applyJob('world_gen', GEN_CTX), { success: false });
      expect(rows(ctx, 'world_gen_state')[0].step).toBe(step);
      expect(rows(ctx, 'event_private')).toHaveLength(0);
      expect(rows(ctx, 'npc')).toHaveLength(1);
    },
  );

  it('writes nothing when the generation state is gone', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('world_gen', GEN_CTX), { success: false });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });

  it('QUIRK: a context without genStateId throws (the whole call rolls back in production)', () => {
    const ctx = newCtx({});
    expect(() => applyLlmFailure(ctx, applyJob('world_gen', '{}'))).toThrow();
    const ctx2 = newCtx({});
    expect(() => applyLlmResult(ctx2, applyJob('world_gen', '{}'), '{}')).toThrow();
  });
});

describe('llm apply world_gen_start success (stage 1)', () => {
  it('starter region: writes the region, start location and first NPC, keeps the new character in creation with the 7e line and starts the fill', () => {
    const ctx = openGateCtx(worldSeed());
    execStageOne(ctx, { resultText: JSON.stringify(WORLD_START_JSON) });

    const region = rows(ctx, 'region')[0];
    expect(region).toMatchObject({ name: 'Cinderfall', dangerMultiplier: 100n, isGenerated: true, starterForRace: 'ashkin', generatedByCharacterId: 10n });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FILLING', generatedRegionId: region.id });

    expect(rows(ctx, 'location').map((l: any) => l.name)).toEqual(['Ember Hollow']);
    expect(rows(ctx, 'location')[0]).toMatchObject({ isSafe: true, bindStone: true, craftingAvailable: true });
    expect(rows(ctx, 'npc').map((n: any) => n.name)).toEqual(['Vessa']);
    expect(rows(ctx, 'enemy_template')).toHaveLength(0);

    // Phase 51.3.1.2 (D-17): the new character waits in creation until the families land (finishRegionFill
    // places him); stage 1 posts no private line and the creation console gets the owner's 7e line once.
    expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: 0n, boundLocationId: 0n });
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'event_creation').map((e: any) => [e.kind, e.message])).toEqual([
      ['creation', 'The Keeper clears his throat. A region is taking shape around the place you will first stand; its roads and its creatures are still being remembered.'],
    ]);
    expect(rows(ctx, 'event_world')).toHaveLength(1);

    const jobs = rows(ctx, 'llm_job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ route: 'world_gen', status: 'pending', characterId: 10n });
    expect(JSON.parse(jobs[0].requestJson).genStateId).toBe('5');
    expect(JSON.parse(jobs[0].requestJson).input.startLocation.name).toBe('Ember Hollow');
  });

  it('non-starter region: raises danger from the source, turns the uncharted edge into a passage, connects the start location to it', () => {
    const ctx = openGateCtx({
      world_gen_state: [genState({ sourceRegionId: 100n, sourceLocationId: 50n })],
      character: [characterRow({ locationId: 50n })],
      region: [{ id: 100n, name: 'Old Reach', dangerMultiplier: 300n }],
      location: [{ id: 50n, name: 'The Edge Beyond Old Reach', regionId: 100n, isSafe: true, terrainType: 'uncharted' }],
    });
    execStageOne(ctx, { resultText: JSON.stringify(WORLD_START_JSON) });

    const region = rows(ctx, 'region').find((r: any) => r.name === 'Cinderfall');
    expect(region.dangerMultiplier).toBeGreaterThanOrEqual(350n);
    expect(region.dangerMultiplier).toBeLessThanOrEqual(400n);
    expect(region.starterForRace).toBeUndefined();
    expect(rows(ctx, 'location').find((l: any) => l.id === 50n)).toMatchObject({
      terrainType: 'passage',
      name: 'The Passage to Cinderfall',
    });
    const start = rows(ctx, 'location').find((l: any) => l.name === 'Ember Hollow');
    const links = rows(ctx, 'location_connection').map((c: any) => [c.fromLocationId, c.toLocationId]);
    expect(links).toContainEqual([start.id, 50n]);
    expect(links).toContainEqual([50n, start.id]);
    // The character already had a location: no placement, no arrival message. Phase 51.3.1.2 (owner choices):
    // a traveller gets no milestone line, and the discovery line waits for 7c at COMPLETE.
    expect(rows(ctx, 'character')[0].locationId).toBe(50n);
    expect(rows(ctx, 'event_private')).toEqual([]);
    expect(rows(ctx, 'event_world')[0].message).toContain('Old Reach');
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING');
  });

  it('QUIRK: a missing character still gets the region written and the fill started, but no private events and no starter mark', () => {
    const ctx = openGateCtx(worldSeed({ char: null }));
    execStageOne(ctx, { resultText: JSON.stringify(WORLD_START_JSON) });
    expect(rows(ctx, 'region')[0].starterForRace).toBeUndefined();
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING');
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'event_world')).toHaveLength(1);
  });

  it('a reply without a first NPC writes the region and start location and still starts the fill', () => {
    const ctx = openGateCtx(worldSeed());
    execStageOne(ctx, { resultText: JSON.stringify({ ...WORLD_START_JSON, firstNpc: undefined }) });
    expect(rows(ctx, 'npc')).toHaveLength(0);
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING');
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
  });

  it('accepts a code-fenced reply', () => {
    const ctx = openGateCtx(worldSeed());
    execStageOne(ctx, { resultText: '```json\n' + JSON.stringify(WORLD_START_JSON) + '\n```' });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING');
  });

  it('QUIRK: with the calls gate closed the stage-1 rows stay and the state ends FILL_ERROR with the resting line', () => {
    // newCtx seeds the gate row empty, which fails closed: the same refusal a kill switch gives.
    const ctx = newCtx(worldSeed());
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { resultText: JSON.stringify(WORLD_START_JSON) });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FILL_ERROR', errorMessage: 'The Keeper is resting. Return later.' });
    expect(rows(ctx, 'region')).toHaveLength(1);
    expect(rows(ctx, 'location').map((l: any) => l.name)).toEqual(['Ember Hollow']);
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    expect(rows(ctx, 'npc').map((n: any) => n.name)).toEqual(['Vessa', 'The Ledger Keeper']);
    // Phase 51.3.1.2 (D-17, D-18): the new character is still in creation, so the line goes to his console.
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    const last = rows(ctx, 'event_creation').slice(-1)[0];
    expect(last).toMatchObject({ kind: 'creation_error', message: 'The Keeper is resting. Return later. Type [explore] to try again.' });
  });

  it.each(['FILLING', 'FILL_ERROR', 'COMPLETE', 'PENDING', 'ERROR'])(
    'QUIRK: a state in step %s returns silently',
    (step) => {
      const ctx = newCtx(worldSeed({ gen: { step } }));
      exec(ctx, applyJob('world_gen_start', GEN_CTX), { resultText: JSON.stringify(WORLD_START_JSON) });
      expect(rows(ctx, 'world_gen_state')[0].step).toBe(step);
      expect(rows(ctx, 'region')).toHaveLength(0);
    },
  );

  it('returns silently when the generation state is gone', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { resultText: JSON.stringify(WORLD_START_JSON) });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });

  it('invalid JSON fails the generation: state ERROR, creation_error for a character without a location', () => {
    const ctx = newCtx(worldSeed());
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { resultText: 'the world did not say anything useful' });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')[0].message).toContain('came out wrong');
    expect(rows(ctx, 'event_creation')[0].message).toContain('Type [explore] to try again.');
    expect(rows(ctx, 'region')).toHaveLength(0);
  });

  it('invalid JSON fails through a private system event for a placed character', () => {
    const ctx = newCtx(worldSeed({ char: { locationId: 100n } }));
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { resultText: '{ not json' });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].kind).toBe('system');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it.each([
    ['a missing regionName', { ...WORLD_START_JSON, regionName: undefined }],
    ['an empty regionName', { ...WORLD_START_JSON, regionName: '' }],
    ['no startLocation', { ...WORLD_START_JSON, startLocation: undefined }],
    ['a startLocation without a name', { ...WORLD_START_JSON, startLocation: { description: 'Nameless.' } }],
  ])('%s ends in ERROR with the "incomplete" message', (_label, reply) => {
    const ctx = newCtx(worldSeed());
    exec(ctx, applyJob('world_gen_start', GEN_CTX), { resultText: JSON.stringify(reply) });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('ERROR');
    expect(rows(ctx, 'event_creation')[0].message).toContain('incomplete');
    expect(rows(ctx, 'region')).toHaveLength(0);
  });
});

describe('llm apply world_gen success (stage 2, the fill)', () => {
  it('Phase 51.3.1.2: stage 2a writes the places around the stage-1 start location, starts the families job and posts no line', () => {
    const ctx = openFillCtx(fillSeed());
    execStage(ctx, 'world_gen', JSON.stringify(REGION_FILL_JSON));

    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FILLING_FAMILIES', generatedRegionId: 1n });
    expect(rows(ctx, 'region')[0]).toMatchObject({ name: 'Cinderfall', dominantFaction: 'Ash Court', starterForRace: 'ashkin' });
    const names = rows(ctx, 'location').map((l: any) => l.name);
    expect(names).toEqual(['Ember Hollow', 'Slag Road', 'Ashen Pit', 'The Edge Beyond Cinderfall']);
    // A reply without a families array is stage 2a: its enemies are never read, stage 2b writes the families.
    expect(rows(ctx, 'enemy_template')).toHaveLength(0);
    expect(rows(ctx, 'creature_family')).toHaveLength(0);
    // Stage-1 Vessa stays, Old Brann falls back to the start location, the banker is the safety net
    expect(rows(ctx, 'npc').map((n: any) => n.name)).toEqual(['Vessa', 'Old Brann', 'The Ledger Keeper']);
    expect(rows(ctx, 'npc').every((n: any) => n.locationId === 1n)).toBe(true);
    // The character is not moved by stage 2
    expect(rows(ctx, 'character')[0].locationId).toBe(1n);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'event_world')).toHaveLength(0);
    const jobs = rows(ctx, 'llm_job');
    expect(jobs.map((j: any) => `${j.route}:${j.status}`)).toEqual(['world_gen_families:pending']);
    expect(JSON.parse(jobs[0].requestJson).genStateId).toBe('5');
  });

  it('Phase 51.3.1.2: a stage-2a reply\'s enemies are never written, whatever their levels', () => {
    const ctx = openFillCtx(fillSeed({ region: { dangerMultiplier: 400n, starterForRace: undefined } }));
    const reply = {
      ...REGION_FILL_JSON,
      enemies: [
        { name: 'Way Too Big', role: 'melee', level: 99 },
        { name: 'Way Too Small', role: 'ranged', level: 0 },
        { name: 'Just Right', role: 'melee', level: 4 },
      ],
    };
    execStage(ctx, 'world_gen', JSON.stringify(reply));
    expect(replyEnemyLevels(ctx)).toEqual([]);
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
  });

  it('never renames or duplicates stage-1 content', () => {
    const ctx = openFillCtx(fillSeed());
    const reply = {
      ...REGION_FILL_JSON,
      locations: [
        { name: 'EMBER HOLLOW', description: 'A rename attempt.', terrainType: 'town', isSafe: true, levelOffset: 0, connectsTo: [] },
        ...REGION_FILL_JSON.locations,
      ],
      npcs: [
        { name: 'vessa', npcType: 'vendor', locationName: 'Ember Hollow', description: 'Again.', greeting: 'Again.' },
        ...REGION_FILL_JSON.npcs,
      ],
    };
    execStage(ctx, 'world_gen', JSON.stringify(reply));
    expect(rows(ctx, 'location').filter((l: any) => l.name.toLowerCase() === 'ember hollow')).toHaveLength(1);
    expect(rows(ctx, 'location').find((l: any) => l.id === 1n)).toMatchObject({ name: 'Ember Hollow', description: 'A sheltered town.' });
    expect(rows(ctx, 'npc').filter((n: any) => n.name.toLowerCase() === 'vessa')).toHaveLength(1);
  });

  it('QUIRK: a missing character still gets the fill written, but no private events', () => {
    const ctx = openFillCtx(fillSeed({ char: null }));
    execStage(ctx, 'world_gen', JSON.stringify(REGION_FILL_JSON));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(rows(ctx, 'location')).toHaveLength(4);
  });

  it('accepts a code-fenced reply', () => {
    const ctx = openFillCtx(fillSeed());
    execStage(ctx, 'world_gen', '```json\n' + JSON.stringify(REGION_FILL_JSON) + '\n```');
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
  });

  it('an empty locations array is still a usable fill (services and boundary on the start location)', () => {
    // A job asked without a place count (this one has no stored input) has no floor (D-03).
    const ctx = openFillCtx(fillSeed());
    execStage(ctx, 'world_gen', JSON.stringify({ ...REGION_FILL_JSON, locations: [] }));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
    expect(rows(ctx, 'location').map((l: any) => l.name)).toEqual(['Ember Hollow', 'The Edge Beyond Cinderfall']);
    expect(rows(ctx, 'npc').map((n: any) => n.npcType).sort()).toEqual(['banker', 'lore', 'vendor']);
  });

  it.each(['GENERATING', 'PENDING', 'FILL_ERROR', 'COMPLETE', 'ERROR', 'FILLING_FAMILIES', 'FAMILIES_ERROR'])(
    'QUIRK: a state in step %s returns silently',
    (step) => {
      const ctx = newCtx(fillSeed({ gen: { step } }), alice, true);
      exec(ctx, applyJob('world_gen', GEN_CTX), { resultText: JSON.stringify(REGION_FILL_JSON) });
      expect(rows(ctx, 'world_gen_state')[0].step).toBe(step);
      expect(rows(ctx, 'location')).toHaveLength(1);
      expect(rows(ctx, 'enemy_template')).toHaveLength(0);
    },
  );

  it('returns silently when the generation state is gone', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('world_gen', GEN_CTX), { resultText: JSON.stringify(REGION_FILL_JSON) });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });

  it('invalid JSON fails the fill: state FILL_ERROR, every stage-1 row intact, one private line naming [explore]', () => {
    const ctx = newCtx(fillSeed(), alice, true);
    exec(ctx, applyJob('world_gen', GEN_CTX), { resultText: 'the world did not say anything useful' });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FILL_ERROR', generatedRegionId: 1n });
    expect(rows(ctx, 'location').map((l: any) => l.name)).toEqual(['Ember Hollow']);
    expect(rows(ctx, 'region')).toHaveLength(1);
    expect(rows(ctx, 'enemy_template')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].message).toContain('Type [explore] to try again.');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it.each([
    ['no locations key', { ...REGION_FILL_JSON, locations: undefined }],
    ['a locations value that is not an array', { ...REGION_FILL_JSON, locations: 'Slag Road' }],
  ])('%s fails the fill and keeps stage 1', (_label, reply) => {
    const ctx = newCtx(fillSeed(), alice, true);
    exec(ctx, applyJob('world_gen', GEN_CTX), { resultText: JSON.stringify(reply) });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILL_ERROR');
    expect(rows(ctx, 'location')).toHaveLength(1);
    expect(rows(ctx, 'enemy_template')).toHaveLength(0);
  });

  it('a FILLING state whose stored region is gone fails the fill instead of throwing', () => {
    const ctx = newCtx({ ...fillSeed(), region: [] });
    exec(ctx, applyJob('world_gen', GEN_CTX), { resultText: JSON.stringify(REGION_FILL_JSON) });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILL_ERROR');
    expect(rows(ctx, 'location')).toHaveLength(1);
  });

  it('Phase 51.3.1.2: a reply that still carries families (queued before the publish) completes the region in one apply', () => {
    const ctx = openFillCtx(fillSeed());
    execStage(ctx, 'world_gen', JSON.stringify({ ...REGION_FILL_JSON, families: WORLD_FAMILIES_JSON.families }));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
    expect(rows(ctx, 'creature_family').map((f: any) => f.name)).toEqual(expect.arrayContaining(['Ember Wolves', 'Slag Casters']));
    expect(rows(ctx, 'llm_job')).toHaveLength(0);
    // A starter state gets no line at COMPLETE (Plan 13 places the new character).
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// world_gen_families (stage 2b, Phase 51.3.1.2)
// ---------------------------------------------------------------------------

describe('llm apply world_gen_families success (stage 2b, the families)', () => {
  /** Stage 2a has landed on `seed`: the places are written and the state is FILLING_FAMILIES. */
  function familiesCtx(seed: Seed) {
    const ctx = openFillCtx(seed);
    applyLlmResult(ctx, applyJob('world_gen', GEN_CTX), JSON.stringify(REGION_FILL_JSON));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('FILLING_FAMILIES');
    return ctx;
  }

  // fillSeed's character already stands at the start location (stage 1 placed him before the 51.3.1.2
  // publish: an in-flight starter), so completion places nobody and posts no line (T-51.3.1.2-44).
  it('starter region: writes the families, completes the state and posts no line', () => {
    const ctx = familiesCtx(fillSeed());
    execStage(ctx, 'world_gen_families', JSON.stringify(WORLD_FAMILIES_JSON));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
    expect(rows(ctx, 'creature_family').map((f: any) => f.name)).toEqual(expect.arrayContaining(['Ember Wolves', 'Slag Casters']));
    expect(rows(ctx, 'location')).toHaveLength(4);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('Phase 51.3.1.2 (D-17): starter region with the new character waiting in creation: completes and places him with the arrival message, then the discovery line', () => {
    const ctx = familiesCtx(fillSeed({ char: { locationId: 0n, boundLocationId: 0n } }));
    execStage(ctx, 'world_gen_families', JSON.stringify(WORLD_FAMILIES_JSON));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
    expect(rows(ctx, 'character')[0]).toMatchObject({ locationId: 1n, boundLocationId: 1n });
    const priv = rows(ctx, 'event_private');
    expect(priv.map((e: any) => e.kind)).toEqual(['narrative', 'system']);
    expect(priv[0].message.startsWith('You open your eyes in Ember Hollow, Cinderfall.')).toBe(true);
    expect(priv[0].message.endsWith('Try [look] to examine your surroundings, or [travel] to move.')).toBe(true);
    expect(priv[1].message).toContain('Cinderfall');
    expect(rows(ctx, 'event_creation')).toHaveLength(0);
  });

  it('non-starter region: the triggering character gets the region-opened line, then the discovery line', () => {
    const ctx = familiesCtx(fillSeed({ gen: { sourceLocationId: 50n, sourceRegionId: 100n }, region: { starterForRace: undefined } }));
    execStage(ctx, 'world_gen_families', JSON.stringify(WORLD_FAMILIES_JSON));
    expect(rows(ctx, 'world_gen_state')[0].step).toBe('COMPLETE');
    const priv = rows(ctx, 'event_private');
    expect(priv.map((e: any) => e.kind)).toEqual(['system', 'system']);
    expect(priv[0].message).toContain('Cinderfall');
  });

  it.each([
    ['unparseable text', 'the ash keeps its secrets'],
    ['a reply without a families array', JSON.stringify({ creatures: [] })],
    ['a reply whose families all fail validation', JSON.stringify({ families: [null, 'x', 7] })],
  ])('%s: FAMILIES_ERROR, the places stay, no family', (_label, reply) => {
    const ctx = familiesCtx(fillSeed());
    execStage(ctx, 'world_gen_families', reply);
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({ step: 'FAMILIES_ERROR', errorMessage: 'The land is remembered, but not yet what lives in it.' });
    expect(rows(ctx, 'location')).toHaveLength(4);
    expect(rows(ctx, 'creature_family')).toHaveLength(0);
  });

  it.each(['FILLING', 'FILL_ERROR', 'FAMILIES_ERROR', 'COMPLETE', 'ERROR'])('QUIRK: a state in step %s returns silently', (step) => {
    const ctx = newCtx(fillSeed({ gen: { step } }), alice, true);
    exec(ctx, applyJob('world_gen_families', GEN_CTX), { resultText: JSON.stringify(WORLD_FAMILIES_JSON) });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe(step);
    expect(rows(ctx, 'creature_family')).toHaveLength(0);
  });
});

describe('llm apply world_gen_families failure path', () => {
  it('sets the state to FAMILIES_ERROR and tells a placed character the region is held', () => {
    const ctx = newCtx(fillSeed({ gen: { step: 'FILLING_FAMILIES' } }));
    exec(ctx, applyJob('world_gen_families', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0]).toMatchObject({
      step: 'FAMILIES_ERROR',
      generatedRegionId: 1n,
      errorMessage: 'The land is remembered, but not yet what lives in it.',
    });
    expect(rows(ctx, 'npc')).toHaveLength(1);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0]).toMatchObject({ kind: 'system', characterId: 10n, ownerUserId: 7n });
  });

  it('a character still in creation gets the families line with the [explore] hint on the creation console', () => {
    const ctx = newCtx(fillSeed({ gen: { step: 'FILLING_FAMILIES' }, char: { locationId: 0n } }));
    exec(ctx, applyJob('world_gen_families', GEN_CTX), { success: false });
    expect(rows(ctx, 'event_creation')).toHaveLength(1);
    expect(rows(ctx, 'event_creation')[0].message).toBe('The land is remembered, but not yet what lives in it. Type [explore] to try again.');
  });

  it.each(['FILLING', 'FILL_ERROR', 'COMPLETE', 'ERROR', 'GENERATING'])('a state that is not FILLING_FAMILIES (%s) is left alone', (step) => {
    const ctx = newCtx(fillSeed({ gen: { step } }));
    exec(ctx, applyJob('world_gen_families', GEN_CTX), { success: false });
    expect(rows(ctx, 'world_gen_state')[0].step).toBe(step);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// npc_conversation
// ---------------------------------------------------------------------------

describe('llm apply npc_conversation failure path', () => {
  it('logs "seems distracted" to the NPC dialog and the private events', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { success: false });
    expect(rows(ctx, 'npc_dialog')).toHaveLength(1);
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta seems distracted.');
    expect(rows(ctx, 'event_private')[0]).toMatchObject({ kind: 'npc', message: 'Marta seems distracted. Try again.' });
  });

  it('does not repeat an identical dialog line logged within the last minute (private event still written)', () => {
    const ctx = newCtx(
      npcSeed({
        npc_dialog: [{ id: 3n, characterId: 10n, npcId: 20n, text: 'Marta seems distracted.', createdAt: ts(T0 - 5_000_000n) }],
      }),
    );
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { success: false });
    expect(rows(ctx, 'npc_dialog')).toHaveLength(1);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
  });

  it('writes nothing when the NPC is gone', () => {
    const ctx = newCtx({ character: [characterRow()] });
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { success: false });
    expect(nonEmptyTables(ctx)).toEqual(['character']);
  });

  it('writes nothing when the character is gone', () => {
    const ctx = newCtx({ npc: npcSeed().npc });
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { success: false });
    expect(nonEmptyTables(ctx)).toEqual(['npc']);
  });
});

describe('llm apply npc_conversation success', () => {
  it('logs the dialogue, runs the narrative effects, updates memory and the cooldown', () => {
    const ctx = newCtx(npcSeed());
    const reply = npcReply({
      effects: [
        { type: 'affinity_change', amount: 3 },
        { type: 'reveal_location', locationName: 'The Old Cistern', locationDescription: 'It still holds water.' },
        { type: 'give_item' },
        { type: 'warn_danger' },
        { type: 'open_shop' },
        { type: 'none' },
        null,
        {},
        { amount: 4 },
      ],
      memoryUpdate: { addTopics: ['bread', 'the mill'], addSecret: 'the cellar is haunted' },
      internalThought: 'The traveler likes bread.',
    });
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: reply });

    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "The bread is warm today."');
    const msgs = rows(ctx, 'event_private').map((e: any) => e.message);
    expect(msgs[0]).toBe('Marta says, "The bread is warm today."');
    expect(msgs).toContain('Marta seems genuinely pleased by your words.');
    expect(msgs).toContain('Marta reveals: "The Old Cistern -- It still holds water."');
    expect(msgs).toContain('Marta offers you something... (Item generation deferred.)');
    const memory = JSON.parse(rows(ctx, 'npc_memory')[0].memoryJson);
    expect(memory).toMatchObject({ topics: ['bread', 'the mill'], secretsShared: ['the cellar is haunted'], lastConversationSummary: 'The traveler likes bread.' });
    expect(rows(ctx, 'npc_memory')[0].lastUpdated).toEqual(ts(T0));
    expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(3n);
    expect(rows(ctx, 'npc_affinity')[0].lastInteraction).toEqual(ts(T0));
  });

  it('does not duplicate a known memory topic and keeps the old summary when there is no new thought', () => {
    const seed = npcSeed();
    seed.npc_memory = [
      {
        id: 30n,
        characterId: 10n,
        npcId: 20n,
        memoryJson: JSON.stringify({ topics: ['bread'], questsCompleted: [], secretsShared: [], giftsGiven: [], lastConversationSummary: 'old' }),
        lastUpdated: ts(T_OLD),
      },
    ];
    const ctx = newCtx(seed);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ memoryUpdate: { addTopics: ['bread', 'rain'] } }) });
    const memory = JSON.parse(rows(ctx, 'npc_memory')[0].memoryJson);
    expect(memory.topics).toEqual(['bread', 'rain']);
    expect(memory.lastConversationSummary).toBe('old');
  });

  it.each([
    [50, 5n, 'seems genuinely pleased'],
    [3, 3n, 'seems genuinely pleased'],
    [1, 1n, 'hint of warmth'],
    [-1, -1n, 'eyes narrow slightly'],
    [-3, -3n, 'expression darkens'],
    [-50, -5n, 'expression darkens'],
  ])('affinity change %i lands as %s (clamped to +/-5) with the matching cue', (amount, expected, cue) => {
    const ctx = newCtx(npcSeed());
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [{ type: 'affinity_change', amount }] }) });
    expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(expected);
    expect(rows(ctx, 'event_private').some((e: any) => (e.message as string).includes(cue))).toBe(true);
  });

  it('QUIRK: a negative affinity change that crosses a tier still logs an "improved to" system message', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [{ type: 'affinity_change', amount: -4 }] }) });
    const sys = rows(ctx, 'event_private').filter((e: any) => e.kind === 'system');
    expect(sys).toHaveLength(1);
    expect(sys[0].message).toBe('Your relationship with Marta improved to Wary.');
  });

  it.each([['0', 0], ['not a number', 'abc'], ['missing amount', undefined]])(
    'an affinity_change with %s is skipped with no cue',
    (_label, amount) => {
      const ctx = newCtx(npcSeed());
      exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [{ type: 'affinity_change', amount }] }) });
      expect(rows(ctx, 'npc_affinity')[0].affinity).toBe(0n);
      expect(rows(ctx, 'event_private')).toHaveLength(1);
    },
  );

  it('creates the affinity row on first contact', () => {
    const seed = npcSeed();
    seed.npc_affinity = [];
    const ctx = newCtx(seed);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [{ type: 'affinity_change', amount: 2 }] }) });
    expect(rows(ctx, 'npc_affinity')).toHaveLength(1);
    expect(rows(ctx, 'npc_affinity')[0]).toMatchObject({ characterId: 10n, npcId: 20n, affinity: 2n, conversationCount: 1n });
  });

  it('Phase 46: falls back to "..." in the dialog log and one Keeper mutter line when the reply has no dialogue, and ignores a non-array effects field', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: JSON.stringify({ effects: 'lots', memoryUpdate: null }) });
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "..."');
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].message).toBe('Marta mutters something you cannot make out.');
    expect(rows(ctx, 'event_private')[0].segments).toEqual([
      { kind: 'narration', speaker: 'The Keeper', text: 'Marta mutters something you cannot make out.' },
    ]);
  });

  it('accepts a code-fenced reply', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: '```json\n' + npcReply() + '\n```' });
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta: "The bread is warm today."');
  });

  it('skips the memory update and cooldown when those rows are missing', () => {
    const seed = npcSeed();
    seed.npc_memory = [];
    seed.npc_affinity = [];
    const ctx = newCtx(seed);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ memoryUpdate: { addTopics: ['x'] } }) });
    expect(rows(ctx, 'npc_memory')).toHaveLength(0);
    expect(rows(ctx, 'npc_affinity')).toHaveLength(0);
  });

  it('Phase 46: QUIRK: invalid JSON writes the mutter messages (one Keeper narration segment) and no memory change', () => {
    const ctx = newCtx(npcSeed());
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: 'Marta hums a tune' });
    expect(rows(ctx, 'npc_dialog')[0].text).toBe('Marta mutters something unintelligible.');
    expect(rows(ctx, 'event_private')[0].message).toBe('Marta mutters something you cannot make out. (Try again.)');
    expect(rows(ctx, 'event_private')[0].segments).toEqual([
      { kind: 'narration', speaker: 'The Keeper', text: 'Marta mutters something you cannot make out. (Try again.)' },
    ]);
    expect(rows(ctx, 'npc_memory')[0].lastUpdated).toEqual(ts(T_OLD));
    expect(rows(ctx, 'npc_affinity')[0].lastInteraction).toEqual(ts(T_OLD));
  });

  it('returns silently when the character is gone', () => {
    const ctx = newCtx({ npc: npcSeed().npc });
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply() });
    expect(nonEmptyTables(ctx)).toEqual(['npc']);
  });

  it('returns silently when the NPC is gone', () => {
    const ctx = newCtx({ character: [characterRow()] });
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply() });
    expect(nonEmptyTables(ctx)).toEqual(['character']);
  });
});

describe('llm apply npc_conversation offer_quest effects', () => {
  it('kill quest for an unknown enemy creates the enemy template, links it at its pool and creates the instance', () => {
    // Strict: the family of one (Plan 09) reads family_member.by_template, which the lenient mock guesses wrong.
    const ctx = newCtx(npcSeed(WORLD_LOCS), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), {
      resultText: npcReply({
        effects: [offer({ targetEnemyName: 'Cellar Undead Rat', targetCount: 3, questDescription: 'Clear the cellar.', rewardXp: 80 })],
      }),
    });
    const qt = rows(ctx, 'quest_template');
    expect(qt).toHaveLength(1);
    expect(qt[0]).toMatchObject({ name: 'Rats in the Cellar', npcId: 20n, questType: 'kill', requiredCount: 3n, rewardXp: 80n, minLevel: 3n, maxLevel: 8n, characterId: 10n });
    const et = rows(ctx, 'enemy_template');
    expect(et).toHaveLength(1);
    expect(et[0]).toMatchObject({ name: 'Cellar Undead Rat', creatureType: 'undead', level: 3n, maxHp: 44n });
    expect(qt[0].targetEnemyTemplateId).toBe(et[0].id);
    // Plan 32 (D-74): the quest records the place of its pool.
    expect(qt[0].targetLocationId).toBe(101n);
    // Linked (Plan 09, D-54) only at the hostile neighbour that holds its family-of-one pool; no link at
    // the quest place (review A IN-09, B IN-01).
    expect(rows(ctx, 'location_enemy_template')).toEqual([
      { id: 1n, locationId: 101n, enemyTemplateId: et[0].id },
    ]);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
    expect(rows(ctx, 'quest_instance')[0]).toMatchObject({ characterId: 10n, questTemplateId: qt[0].id, progress: 0n, completed: false });
    expect(rows(ctx, 'event_private').map((e: any) => e.message)).toContain('New quest: Rats in the Cellar');
  });

  it('kill quest resolves an existing pooled enemy template by name (case-insensitive) at a connected location', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_POOLED), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questName: 'Wolf Trouble', targetEnemyName: 'WOLF' })] }) });
    expect(rows(ctx, 'enemy_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ targetEnemyTemplateId: 60n, targetLocationId: 101n });
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('kill quest naming an existing template with no pool in reach creates no quest (D-74)', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_TEMPLATE), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questName: 'Wolf Trouble', targetEnemyName: 'WOLF' })] }) });
    expect(rows(ctx, 'enemy_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_template')).toEqual([]);
    expect(rows(ctx, 'quest_instance')).toEqual([]);
    expect(rows(ctx, 'event_private').map((e: any) => e.message).some((m: string) => m.startsWith('New quest'))).toBe(false);
  });

  it('kill quest without a target name takes the front-liner of the nearest pooled family', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_POOLED), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ targetEnemyTemplateId: 60n, targetLocationId: 101n });
  });

  it('kill quest with no name and no pool in reach creates no quest (D-74)', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')).toEqual([]);
    expect(rows(ctx, 'quest_instance')).toEqual([]);
  });

  it('an invalid quest type falls back to kill', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_POOLED), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'dance', targetEnemyName: 'Wolf' })] }) });
    expect(rows(ctx, 'quest_template')[0].questType).toBe('kill');
    expect(rows(ctx, 'quest_template')[0].targetEnemyTemplateId).toBe(60n);
  });

  it('kill_loot quests resolve the enemy like kill quests', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_POOLED), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'kill_loot', targetEnemyName: 'wolf' })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ questType: 'kill_loot', targetEnemyTemplateId: 60n, targetLocationId: 101n });
  });

  it('boss_kill quests resolve the enemy by name at the current or a connected place, as before', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_TEMPLATE));
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'boss_kill', targetEnemyName: 'wolf' })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ questType: 'boss_kill', targetEnemyTemplateId: 60n });
  });

  it('delivery quest resolves the source location by name and the target NPC by name', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        npc: [{ id: 21n, name: 'Tobin', npcType: 'lore', locationId: 101n, description: '', greeting: '' }],
      }),
    );
    exec(ctx, applyJob('npc_conversation', NPC_CTX), {
      resultText: npcReply({
        effects: [offer({ questType: 'delivery', questName: 'Bread Run', sourceLocationName: 'old mill', targetNpcName: 'Tobin', targetItemName: 'Warm Bread', rewardType: 'gold', rewardGold: 12 })],
      }),
    });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({
      questType: 'delivery',
      sourceLocationId: 101n,
      targetItemName: 'Warm Bread',
      targetNpcId: 21n,
      targetLocationId: 101n,
      rewardType: 'gold',
      rewardGold: 12n,
    });
  });

  it('delivery quest without a usable source name picks a connected neighbor of the NPC', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'delivery', questName: 'Parcel' })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ sourceLocationId: 101n, targetItemName: 'Parcel' });
    expect(rows(ctx, 'quest_template')[0].targetNpcId).toBeUndefined();
  });

  it('delivery quest whose source name is the NPC own location still picks a neighbor', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'delivery', sourceLocationName: 'Market Square' })] }) });
    expect(rows(ctx, 'quest_template')[0].sourceLocationId).toBe(101n);
  });

  it('delivery quest with no neighbors falls back to the NPC own location', () => {
    const ctx = newCtx(npcSeed({ location: WORLD_LOCS.location }));
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'delivery' })] }) });
    expect(rows(ctx, 'quest_template')[0].sourceLocationId).toBe(100n);
  });

  it('explore quest targets the NPC location', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'explore', questName: 'Find the Well' })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ questType: 'explore', targetLocationId: 100n, targetItemName: 'Find the Well' });
  });

  it('a type without special handling (gather) only creates the template and instance, with default rewards', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS));
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questType: 'gather', questName: undefined })] }) });
    expect(rows(ctx, 'quest_template')[0]).toMatchObject({ name: 'Unknown Quest', questType: 'gather', requiredCount: 1n, rewardXp: 55n, rewardType: 'xp' });
    expect(rows(ctx, 'event_private').map((e: any) => e.message)).toContain('New quest: Unknown Quest');
  });

  it('QUIRK: two offers in one reply create only the first (the per-NPC cap of 1 counts the new quest)', () => {
    const ctx = newCtx(npcSeed(WORLD_LOCS, WOLF_POOLED), alice, true);
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questName: 'First' }), offer({ questName: 'Second' })] }) });
    expect(rows(ctx, 'quest_template').map((q: any) => q.name)).toEqual(['First']);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('skips an offer when the character already has the maximum active quests (4)', () => {
    const others = [1n, 2n, 3n, 4n].map((n) => ({ id: 200n + n, npcId: 99n, name: `Other ${n}`, characterId: 10n }));
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        quest_template: others,
        quest_instance: others.map((q, i) => ({ id: 300n + BigInt(i), characterId: 10n, questTemplateId: q.id, progress: 0n, completed: false, acceptedAt: ts(T_OLD) })),
      }),
    );
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')).toHaveLength(4);
    expect(rows(ctx, 'quest_instance')).toHaveLength(4);
    expect(rows(ctx, 'event_private').map((e: any) => e.message).some((m: string) => m.startsWith('New quest'))).toBe(false);
  });

  it('skips an offer when this NPC already has an active quest for the character (per-NPC cap)', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        quest_template: [{ id: 201n, npcId: 20n, name: 'Existing', characterId: 10n }],
        quest_instance: [{ id: 301n, characterId: 10n, questTemplateId: 201n, progress: 0n, completed: false, acceptedAt: ts(T_OLD) }],
      }),
    );
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('skips an offer that repeats a quest name this NPC already gave this character (completed)', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, {
        quest_template: [{ id: 201n, npcId: 20n, name: 'Rats in the Cellar', characterId: 10n }],
        quest_instance: [{ id: 301n, characterId: 10n, questTemplateId: 201n, progress: 3n, completed: true, acceptedAt: ts(T_OLD) }],
      }),
    );
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer()] }) });
    expect(rows(ctx, 'quest_template')).toHaveLength(1);
    expect(rows(ctx, 'quest_instance')).toHaveLength(1);
  });

  it('a completed quest does not count against the caps', () => {
    const ctx = newCtx(
      npcSeed(WORLD_LOCS, WOLF_POOLED, {
        quest_template: [{ id: 201n, npcId: 20n, name: 'Done', characterId: 10n }],
        quest_instance: [{ id: 301n, characterId: 10n, questTemplateId: 201n, progress: 3n, completed: true, acceptedAt: ts(T_OLD) }],
      }),
      alice,
      true,
    );
    exec(ctx, applyJob('npc_conversation', NPC_CTX), { resultText: npcReply({ effects: [offer({ questName: 'Fresh Work' })] }) });
    expect(rows(ctx, 'quest_template').map((q: any) => q.name)).toEqual(['Done', 'Fresh Work']);
  });
});

// ---------------------------------------------------------------------------
// combat_narration
// ---------------------------------------------------------------------------

describe('llm apply combat_narration', () => {
  const COMBAT_CTX = JSON.stringify({ combatId: '77', roundNumber: '2', narrativeType: 'round', participantCharacterIds: ['10', '11'] });
  const job = (ctxJson = COMBAT_CTX) => applyJob('combat_narration', ctxJson);
  const seed = (): Seed => ({
    character: [characterRow()],
  });

  it('failure changes nothing (silent)', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { success: false });
    expect(rows(ctx, 'combat_narrative')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
    expect(nonEmptyTables(ctx)).toEqual(['character']);
  });

  const FALLBACK = 'The skirmish carries on, and none of it is worth the ink.';
  const keeper = (text: string) => ({ kind: 'narration', speaker: 'The Keeper', text });

  it('Phase 46: success with a JSON narrative stores the row and broadcasts an unprefixed private event with one Keeper narration segment to known participants', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { resultText: JSON.stringify({ narrative: 'Steel meets bone.' }) });
    expect(rows(ctx, 'combat_narrative')).toEqual([
      { id: 1n, combatId: 77n, roundNumber: 2n, narrativeText: 'Steel meets bone.', narrativeType: 'round', createdAt: ts(T0) },
    ]);
    const ev = rows(ctx, 'event_private');
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ characterId: 10n, ownerUserId: 7n, kind: 'combat_narration', message: 'Steel meets bone.' });
    expect(ev[0].segments).toEqual([keeper('Steel meets bone.')]);
  });

  it('Phase 46: success accepts a code-fenced JSON narrative (one Keeper narration segment)', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { resultText: '```json\n{"narrative":"Sparks fly."}\n```' });
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe('Sparks fly.');
  });

  it('Phase 46: success with raw prose stores the trimmed text as one Keeper narration segment, unprefixed', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { resultText: '   The wolf lunges and misses badly.  \n' });
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe('The wolf lunges and misses badly.');
    expect(rows(ctx, 'event_private')[0].message).toBe('The wolf lunges and misses badly.');
    expect(rows(ctx, 'event_private')[0].segments).toEqual([keeper('The wolf lunges and misses badly.')]);
  });

  it('Phase 46: JSON without a segments or narrative field stores the Keeper fallback line, never the JSON text', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { resultText: '{"note":"no narrative here"}' });
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe(FALLBACK);
    expect(rows(ctx, 'event_private')[0]).toMatchObject({ kind: 'combat_narration', message: FALLBACK });
    expect(rows(ctx, 'event_private')[0].segments).toEqual([keeper(FALLBACK)]);
  });

  it('Phase 46: an empty reply stores one fallback combat_narrative row and one fallback line per known participant', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { resultText: '   ' });
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe(FALLBACK);
    expect(rows(ctx, 'event_private')).toHaveLength(1);
    expect(rows(ctx, 'event_private')[0].segments).toEqual([keeper(FALLBACK)]);
  });

  it('Phase 46: a segments reply stores the flattened text, with a snapshot enemy as a dialogue speaker', () => {
    const ctx = newCtx(seed());
    const ctxJson = JSON.stringify({
      combatId: '77', roundNumber: '0', narrativeType: 'victory', participantCharacterIds: ['10'],
      input: { enemyNames: ['Gravel Hound'], playerNames: ['Aldric'] },
    });
    const reply = JSON.stringify({ segments: [
      { kind: 'narration', speaker: 'The Keeper', text: 'The hound sags.' },
      { kind: 'dialogue', speaker: 'Gravel Hound', text: 'Grrk.' },
    ] });
    exec(ctx, job(ctxJson), { resultText: reply });
    expect(rows(ctx, 'combat_narrative')[0].narrativeText).toBe('The hound sags.\n\nGravel Hound says, "Grrk."');
    expect(rows(ctx, 'event_private')[0].segments).toEqual([
      keeper('The hound sags.'),
      { kind: 'dialogue', speaker: 'Gravel Hound', text: 'Grrk.' },
    ]);
  });

  it('Phase 46: a victory narration is one Keeper narration segment, not round-prefixed', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(JSON.stringify({ combatId: '77', roundNumber: '0', narrativeType: 'victory', participantCharacterIds: ['10'] })), { resultText: JSON.stringify({ narrative: 'The wolf falls.' }) });
    expect(rows(ctx, 'combat_narrative')[0]).toMatchObject({ narrativeType: 'victory', roundNumber: 0n });
    expect(rows(ctx, 'event_private')[0].message).toBe('The wolf falls.');
  });

  it('a context without participants stores the row and broadcasts nothing', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(JSON.stringify({ combatId: '77', roundNumber: '1' })), { resultText: 'A quiet round.' });
    expect(rows(ctx, 'combat_narrative')).toHaveLength(1);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// renown_perk_gen
// ---------------------------------------------------------------------------

describe('llm apply renown_perk_gen success', () => {
  const RENOWN_CTX = (rank: string | number = '2') => JSON.stringify({ characterId: '10', rank: String(rank) });
  const job = (ctxJson = RENOWN_CTX()) => applyJob('renown_perk_gen', ctxJson);
  const seed = (): Seed => ({
    character: [characterRow()],
  });

  const active = (name: string) => ({
    name,
    description: `${name} description.`,
    kind: 'heal',
    targetRule: 'self',
    resourceType: 'stamina',
    resourceCost: 10,
    castSeconds: 0,
    cooldownSeconds: 300,
    scaling: 'none',
    value1: 20,
    value2: null,
    damageType: null,
    effectType: null,
    effectMagnitude: null,
    effectDuration: null,
    perkEffectJson: null,
    perkDomain: 'combat',
  });
  const passive = (name: string, over: Record<string, any> = {}) => ({
    name,
    description: `${name} description.`,
    kind: '',
    perkEffectJson: '{"maxHp":10}',
    perkDomain: 'crafting',
    ...over,
  });

  it('inserts three valid perks for the rank and presents them', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { resultText: JSON.stringify({ perks: [active('Second Wind'), passive('Thick Skin'), passive('Deft Hands', { perkDomain: undefined })] }) });

    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Second Wind', 'Thick Skin', 'Deft Hands']);
    expect(perks.every((p: any) => p.characterId === 10n && p.rank === 2n)).toBe(true);
    expect(perks[0]).toMatchObject({ kind: 'heal', resourceCost: 10n, cooldownSeconds: 300n, value1: 20n });
    expect(perks[1]).toMatchObject({ kind: '', perkEffectJson: '{"maxHp":10}', perkDomain: 'crafting', targetRule: 'self', resourceType: 'none' });
    expect(perks[2].perkDomain).toBe('combat');
    const msg = rows(ctx, 'event_private')[0].message as string;
    expect(msg).toContain('Rank 2. The world owes you something. Choose your due:');
    expect(msg).toContain('Active ability | 10 stamina | 300s cooldown');
    expect(msg).toContain('Passive bonus');
  });

  it('only the first three valid perks are inserted', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(), { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C'), passive('D')] }) });
    expect(rows(ctx, 'pending_renown_perk').map((p: any) => p.name)).toEqual(['A', 'B', 'C']);
  });

  it('uses the rank from the job context', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(RENOWN_CTX('5')), { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C')] }) });
    expect(rows(ctx, 'pending_renown_perk').every((p: any) => p.rank === 5n)).toBe(true);
    expect(rows(ctx, 'event_private')[0].message).toContain('Rank 5.');
  });

  it.each([['missing', JSON.stringify({ characterId: '10' })], ['zero', RENOWN_CTX('0')]])(
    'QUIRK: a %s rank defaults to 2',
    (_label, ctxJson) => {
      const ctx = newCtx(seed());
      exec(ctx, job(ctxJson), { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C')] }) });
      expect(rows(ctx, 'pending_renown_perk')[0].rank).toBe(2n);
    },
  );

  it('QUIRK: fewer than three VALID perks (one lacks a description) falls back to the static pool for the rank', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(RENOWN_CTX('4')), {
      resultText: JSON.stringify({ perks: [passive('A'), passive('B'), { name: 'No description', kind: 'heal' }, { description: 'no name', kind: 'heal' }] }),
    });
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Bloodthirst', "Prospector's Luck", "Wanderer's Pace"]);
    expect(perks.every((p: any) => p.rank === 4n && p.kind === '')).toBe(true);
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmos shrugs and offers some... standard options');
  });

  it.each([
    ['unparseable text', 'no perks for you'],
    ['perks that is not an array', JSON.stringify({ perks: 'many' })],
    ['an empty perks array', JSON.stringify({ perks: [] })],
  ])('%s takes the static fallback (rank 4)', (_label, resultText) => {
    const ctx = newCtx(seed());
    exec(ctx, job(RENOWN_CTX('4')), { resultText });
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(3);
  });

  it('static fallback for an active-first pool (rank 6) inserts the active perk as a utility ability', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(RENOWN_CTX('6')), { resultText: 'nothing' });
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks[0]).toMatchObject({ kind: 'utility', resourceType: 'stamina', perkEffectJson: undefined });
    expect(perks[1].kind).toBe('');
  });

  it('Phase 41: the rank-2 static fallback inserts serialized options (bigint effects no longer throw)', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(RENOWN_CTX('2')), { resultText: 'nothing' });
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks.map((p: any) => p.name)).toEqual(['Iron Will', 'Keen Eye', 'Smooth Talker']);
    // maxHp: 25n serializes as the number 25 (the shape the perk prompt documents).
    expect(perks[0].perkEffectJson).toBe('{"maxHp":25,"str":1}');
    expect(perks.map((p: any) => p.perkEffectJson)).toEqual(
      RENOWN_PERK_POOLS[2].slice(0, 3).map((p) => serializePerkEffect(p.effect)),
    );
    expect(rows(ctx, 'event_private')[0].message).toContain('The cosmos shrugs and offers some... standard options');
  });

  it.each([3, 5, 9, 11])('Phase 41: the rank-%s static fallback inserts three options with serialized effects', (rank) => {
    const ctx = newCtx(seed());
    applyLlmResult(ctx, job(RENOWN_CTX(String(rank))), 'nothing');
    const perks = rows(ctx, 'pending_renown_perk');
    expect(perks).toHaveLength(3);
    expect(perks.every((p: any) => p.rank === BigInt(rank))).toBe(true);
    const pool = RENOWN_PERK_POOLS[rank].slice(0, 3);
    expect(perks.map((p: any) => p.perkEffectJson)).toEqual(
      pool.map((p) => (p.type === 'active' ? undefined : serializePerkEffect(p.effect))),
    );
    for (const p of perks) if (p.perkEffectJson !== undefined) expect(() => JSON.parse(p.perkEffectJson)).not.toThrow();
  });

  it('QUIRK: a rank without a static pool inserts nothing and writes no message', () => {
    const ctx = newCtx(seed());
    exec(ctx, job(RENOWN_CTX('99')), { resultText: 'nothing' });
    expect(rows(ctx, 'pending_renown_perk')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('returns silently when the character is gone', () => {
    const ctx = newCtx({});
    exec(ctx, applyJob('renown_perk_gen', RENOWN_CTX()), { resultText: JSON.stringify({ perks: [passive('A'), passive('B'), passive('C')] }) });
    expect(nonEmptyTables(ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 41: creation replies are clamped server-side (creation_validate)
// ---------------------------------------------------------------------------

describe('llm apply creation replies: Phase 41 clamped', () => {
  it('Phase 41: clamped - a race reply with out-of-range bonuses is stored and shown clamped', () => {
    const ctx = newCtx({
      character_creation_state: [creationState('GENERATING_RACE')],
    });
    const reply = { ...RACE_JSON, bonuses: { primary: { stat: 'str', value: 99 }, secondary: { stat: 'nonsense', value: -5 } } };
    exec(ctx, applyJob('creation_race'), { resultText: JSON.stringify(reply) });
    const stored = JSON.parse(rows(ctx, 'character_creation_state')[0].raceBonuses);
    expect(stored.primary).toEqual({ stat: 'str', value: 3 });
    // 'nonsense' is not a stat: the secondary defaults to 'dex'; -5 is raised to the minimum 1.
    expect(stored.secondary).toEqual({ stat: 'dex', value: 1 });
    expect(rows(ctx, 'race_definition')[0].bonusesJson).not.toContain('99');
    expect(JSON.parse(rows(ctx, 'race_definition')[0].bonusesJson).primary.value).toBe(3);
    expect(rows(ctx, 'event_creation')[0].message).toContain('+3 STR, +1 DEX');
  });

  it('Phase 41: clamped - a class reveal with over-budget ability values is stored clamped', () => {
    const ctx = openGateCtx({
      character_creation_state: [creationState('GENERATING_CLASS')],
    });
    const reply = {
      ...CLASS_REVEAL_JSON,
      firstAbility: { ...CLASS_FIRST_ABILITY, value1: 99999, kind: 'nonsense', resourceCost: 9999 },
    };
    exec(ctx, applyJob('creation_class_reveal'), { resultText: JSON.stringify(reply) });
    const state = rows(ctx, 'character_creation_state')[0];
    // kind 'nonsense' becomes 'damage'; value1 is capped at the level-1 damage budget maximum;
    // a stamina cost is capped at 15.
    const budgetMax = Number(clampToBudget('damage', 1, { value1: 99999 }).value1);
    expect(JSON.parse(state.abilities)[0]).toMatchObject({ value1: budgetMax, kind: 'damage', resourceCost: 15 });
    expect(budgetMax).toBeLessThan(99999);
  });

  it('Phase 41: clamped - a class fill with out-of-range stats and over-budget abilities is stored clamped, at most three abilities', () => {
    const ctx = newCtx({
      character_creation_state: [
        creationState('CLASS_FILLING', {
          className: 'Emberblade',
          classDescription: 'A duelist who fights like a grudge.',
          abilities: JSON.stringify([CLASS_FIRST_ABILITY]),
        }),
      ],
    });
    const reply = {
      stats: { ...CLASS_FILL_JSON.stats, bonusHp: 9999 },
      abilities: [
        { ...CLASS_FILL_JSON.abilities[0], value1: 99999, kind: 'nonsense', resourceCost: 9999, resourceType: 'stamina' },
        CLASS_FILL_JSON.abilities[1],
        { ...CLASS_FILL_JSON.abilities[1], name: 'One Too Many' },
      ],
    };
    exec(ctx, applyJob('creation_class'), { resultText: JSON.stringify(reply) });
    const state = rows(ctx, 'character_creation_state')[0];
    const budgetMax = Number(clampToBudget('damage', 1, { value1: 99999 }).value1);
    const abilities = JSON.parse(state.abilities);
    expect(state.step).toBe('CLASS_REVEALED');
    expect(abilities).toHaveLength(3);
    expect(abilities[0].name).toBe('Ember Slash');
    expect(abilities[1]).toMatchObject({ value1: budgetMax, kind: 'damage', resourceCost: 15 });
    expect(JSON.parse(state.classStats).bonusHp).toBe(20);
  });
});
