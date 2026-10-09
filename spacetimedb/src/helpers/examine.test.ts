import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMockDb } from './test-utils';
import { parseLookCommand, describeLookTarget, lookMissLine } from './examine';

// Records the real table definitions; strict mode derives its accessor allowlist from them.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const ME = { id: 10n, locationId: 1n, level: 5n, name: 'Hero', race: 'Human', className: 'Warrior' };

const ctxWith = (seed: Record<string, any[]>) => ({
  db: createMockDb(seed, { strict: true }),
  timestamp: { microsSinceUnixEpoch: 0n },
});

const ironTemplate = {
  id: 7n,
  name: 'Iron Shard',
  rarity: 'common',
  slot: 'material',
  armorType: 'none',
  description: 'A jagged shard of iron scavenged from ruins.',
};

const node = (over: Record<string, unknown> = {}) => ({
  id: 100n,
  locationId: 1n,
  name: 'Iron Shard',
  state: 'available',
  itemTemplateId: 7n,
  ...over,
});

/** A resource pool row (Phase 51.3.1.1): Abundant (count 100, home 3) Iron Shard at location 1. */
const resourcePool = (over: Record<string, unknown> = {}) => ({
  id: 100n,
  regionId: 1n,
  locationId: 1n,
  kind: 'resource',
  refId: 7n,
  count: 100n,
  homeLevel: 3n,
  wipedAtMicros: 0n,
  lastSettledMicros: 0n,
  dirty: false,
  timeOfDay: 'any',
  ...over,
});

const bowTemplate = {
  id: 20n,
  name: 'Ashwood Bow',
  rarity: 'common',
  slot: 'mainHand',
  armorType: 'none',
  weaponType: 'bow',
  strBonus: 0n,
  dexBonus: 2n,
  intBonus: 0n,
  wisBonus: 0n,
  chaBonus: 0n,
  hpBonus: 0n,
  manaBonus: 0n,
  armorClassBonus: 0n,
  magicResistanceBonus: 0n,
  weaponBaseDamage: 7n,
  requiredLevel: 3n,
  description: 'A bow of pale ash.',
};

const instance = (over: Record<string, unknown> = {}) => ({
  id: 200n,
  ownerCharacterId: 10n,
  templateId: 20n,
  quantity: 1n,
  qualityTier: 'rare',
  ...over,
});

describe('parseLookCommand', () => {
  it.each([
    ['look', ''],
    ['l', ''],
    ['look at', ''],
    ['look at Iron Shard', 'Iron Shard'],
    ['LOOK AT iron shard', 'iron shard'],
    ['look Iron Shard', 'Iron Shard'],
    ['l at Old Well', 'Old Well'],
    ['look at the Old Well', 'Old Well'],
    ['look an Iron Shard', 'Iron Shard'],
    ['look attic', 'attic'],
    ['look the', ''],
    ['look a', ''],
    ['look an', ''],
    ['look at the', ''],
    ['look at a', ''],
    ['look at at', ''],
    ['l the', ''],
    ['look theron', 'theron'],
    ['look at the at', ''],
    ['lookout', null],
    ['say look', null],
  ])('%s -> %j', (raw, expected) => {
    expect(parseLookCommand(raw)).toBe(expected);
  });
});

describe('lookMissLine', () => {
  it('is the exact fallback text', () => {
    expect(lookMissLine('Iron Shard')).toBe('You don\'t see "Iron Shard" here.');
  });
});

describe('describeLookTarget: resource pools (Phase 51.3.1.1 D-26, D-55)', () => {
  const ABUNDANT = [
    'Iron Shard',
    'Abundant.',
    'Iron shard lies thick across the area.',
    'Gathering yields Iron Shard (common material).',
    'A jagged shard of iron scavenged from ruins.',
  ].join('\n');

  it('describes an Abundant pool with its word, line, yield and description', () => {
    const ctx = ctxWith({ place_pool: [resourcePool()], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBe(ABUNDANT);
  });

  it('uses the place noun of the place', () => {
    const ctx = ctxWith({
      location: [{ id: 1n, name: 'Glass Orchard', terrainType: 'woods', placeNoun: 'the orchard' }],
      place_pool: [resourcePool()],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n')[2]).toBe('Iron shard lies thick across the orchard.');
  });

  it('matches case-insensitively', () => {
    const ctx = ctxWith({ place_pool: [resourcePool()], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'iRoN sHaRd')).toBe(ABUNDANT);
  });

  it('matches a partial name when no exact match exists', () => {
    const ctx = ctxWith({ place_pool: [resourcePool()], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'shard')).toContain('Gathering yields');
  });

  it('an Exhausted pool says there is none left', () => {
    const ctx = ctxWith({ place_pool: [resourcePool({ count: 0n })], item_template: [ironTemplate] });
    const lines = describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n');
    expect(lines[1]).toBe('Exhausted.');
    expect(lines[2]).toBe('There is no iron shard left in the area, for now.');
  });

  it('a night-only pool is not there by day and is described at night', () => {
    const day = ctxWith({
      place_pool: [resourcePool({ timeOfDay: 'night' })],
      item_template: [ironTemplate],
      world_state: [{ id: 1n, isNight: false }],
    });
    expect(describeLookTarget(day, ME, 'Iron Shard')).toBeNull();
    const night = ctxWith({
      place_pool: [resourcePool({ timeOfDay: 'night' })],
      item_template: [ironTemplate],
      world_state: [{ id: 1n, isNight: true }],
    });
    expect(describeLookTarget(night, ME, 'Iron Shard')).toBe(ABUNDANT);
  });

  it('a pool whose template is missing is not described', () => {
    const ctx = ctxWith({ place_pool: [resourcePool()] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBeNull();
  });

  it('does not describe a pool at another location', () => {
    const ctx = ctxWith({ place_pool: [resourcePool({ locationId: 2n })], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBeNull();
  });

  it('never reads a resource node', () => {
    const ctx = ctxWith({ resource_node: [node()], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBeNull();
  });
});

describe('describeLookTarget: inventory items', () => {
  it('describes a carried item with rarity, type, stats and level', () => {
    const ctx = ctxWith({ item_instance: [instance()], item_template: [bowTemplate] });
    expect(describeLookTarget(ctx, ME, 'Ashwood Bow')).toBe(
      [
        'Ashwood Bow',
        'Rare main-hand weapon (bow).',
        'You carry one.',
        'A bow of pale ash.',
        'Stats: DEX +2, 7 damage.',
        'Requires level 3.',
      ].join('\n'),
    );
  });

  it('prefers the displayName over the template name', () => {
    const ctx = ctxWith({
      item_instance: [instance({ displayName: 'Whisperwood' })],
      item_template: [bowTemplate],
    });
    const out = describeLookTarget(ctx, ME, 'whisperwood')!;
    expect(out.split('\n')[0]).toBe('Whisperwood');
  });

  it('reports the quantity when carrying several', () => {
    const ctx = ctxWith({ item_instance: [instance({ quantity: 5n })], item_template: [bowTemplate] });
    expect(describeLookTarget(ctx, ME, 'Ashwood Bow')!.split('\n')[2]).toBe('You carry 5.');
  });

  it('reports an equipped item', () => {
    const ctx = ctxWith({
      item_instance: [instance({ equippedSlot: 'mainHand' })],
      item_template: [bowTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Ashwood Bow')!.split('\n')[2]).toBe('You have it equipped.');
  });

  it('describes a plain material with no stats or level line', () => {
    const ctx = ctxWith({
      item_instance: [instance({ templateId: 7n, qualityTier: undefined })],
      item_template: [{ ...ironTemplate, requiredLevel: 1n }],
    });
    const lines = describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n');
    expect(lines[1]).toBe('Common material.');
    expect(lines.some((l) => l.startsWith('Stats:') || l.startsWith('Requires'))).toBe(false);
  });

  it('counts duplicate unstacked copies', () => {
    const ctx = ctxWith({
      item_instance: [instance({ id: 201n }), instance({ id: 202n }), instance({ id: 203n })],
      item_template: [bowTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Ashwood Bow')!.split('\n')[2]).toBe('You carry 3.');
  });

  it('adds stacks and loose copies together', () => {
    const ctx = ctxWith({
      item_instance: [instance({ id: 201n, quantity: 2n }), instance({ id: 202n, quantity: 1n })],
      item_template: [bowTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Ashwood Bow')!.split('\n')[2]).toBe('You carry 3.');
  });

  it('is equipped when any copy is equipped, whatever the row order', () => {
    const equippedFirst = ctxWith({
      item_instance: [instance({ id: 201n, equippedSlot: 'mainHand' }), instance({ id: 202n }), instance({ id: 203n })],
      item_template: [bowTemplate],
    });
    const equippedLast = ctxWith({
      item_instance: [instance({ id: 203n }), instance({ id: 202n }), instance({ id: 201n, equippedSlot: 'mainHand' })],
      item_template: [bowTemplate],
    });
    const a = describeLookTarget(equippedFirst, ME, 'Ashwood Bow');
    expect(a!.split('\n')[2]).toBe('You carry 3 (one equipped).');
    expect(describeLookTarget(equippedLast, ME, 'Ashwood Bow')).toBe(a);
  });

  it('does not merge copies with different display names', () => {
    const ctx = ctxWith({
      item_instance: [
        instance({ id: 201n, displayName: 'Keen Ashwood Bow' }),
        instance({ id: 202n, displayName: 'Sturdy Ashwood Bow' }),
      ],
      item_template: [bowTemplate],
    });
    const out = describeLookTarget(ctx, ME, 'Ashwood Bow')!;
    expect(out.split('\n')[0]).toBe('Keen Ashwood Bow');
    expect(out.split('\n')[2]).toBe('You carry one.');
  });

  it('adds affix and craft-quality bonuses to the Stats line', () => {
    const ctx = ctxWith({
      item_instance: [instance({ displayName: 'Sturdy Ashwood Bow of Haste' })],
      item_template: [bowTemplate],
      item_affix: [
        { id: 1n, itemInstanceId: 200n, affixType: 'prefix', affixKey: 'keen', affixName: 'Keen', statKey: 'dexBonus', magnitude: 3n },
        { id: 2n, itemInstanceId: 200n, affixType: 'suffix', affixKey: 'of_haste', affixName: 'of Haste', statKey: 'cooldownReduction', magnitude: 10n },
        { id: 3n, itemInstanceId: 200n, affixType: 'prefix', affixKey: 'reinforced', affixName: 'Reinforced', statKey: 'weaponBaseDamage', magnitude: 2n },
        { id: 4n, itemInstanceId: 200n, affixType: 'prefix', affixKey: 'sturdy', affixName: 'Sturdy', statKey: 'armorClassBonus', magnitude: 4n },
        // another instance's affix is never counted
        { id: 5n, itemInstanceId: 999n, affixType: 'prefix', affixKey: 'keen', affixName: 'Keen', statKey: 'strBonus', magnitude: 50n },
      ],
    });
    const lines = describeLookTarget(ctx, ME, 'Ashwood Bow')!.split('\n');
    expect(lines).toContain('Stats: DEX +5, AC +4, Cooldown reduction +10, 9 damage.');
  });

  it('does not read the object prototype for an odd template slot', () => {
    const ctx = ctxWith({
      item_instance: [instance({ templateId: 7n, qualityTier: undefined })],
      item_template: [{ ...ironTemplate, slot: 'toString' }],
      place_pool: [resourcePool()],
    });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toContain('(common tostring)');
    const itemOnly = ctxWith({
      item_instance: [instance({ templateId: 7n, qualityTier: undefined })],
      item_template: [{ ...ironTemplate, slot: 'constructor' }],
    });
    expect(describeLookTarget(itemOnly, ME, 'Iron Shard')!.split('\n')[1]).toBe('Common constructor.');
  });

  it('never describes an item owned by another character', () => {
    const ctx = ctxWith({
      item_instance: [instance({ ownerCharacterId: 99n })],
      item_template: [bowTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Ashwood Bow')).toBeNull();
  });

  it('prefers an exact name match over a partial one', () => {
    const ctx = ctxWith({
      item_instance: [
        instance({ id: 201n, templateId: 31n, qualityTier: undefined }),
        instance({ id: 202n, templateId: 7n, qualityTier: undefined }),
      ],
      item_template: [
        { ...ironTemplate, id: 31n, name: 'Iron Shard Pendant' },
        ironTemplate,
      ],
    });
    expect(describeLookTarget(ctx, ME, 'iron shard')!.split('\n')[0]).toBe('Iron Shard');
  });
});

describe('describeLookTarget: check order and existing output', () => {
  it('an exact resource match beats a partial NPC match', () => {
    const ctx = ctxWith({
      npc: [{ id: 1n, locationId: 1n, name: 'Iron Shard Trader', description: 'A hard-eyed dealer.' }],
      place_pool: [resourcePool()],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'iron shard')).toContain('Gathering yields');
  });

  it('an exact NPC match still wins over an exact resource match', () => {
    const ctx = ctxWith({
      npc: [{ id: 1n, locationId: 1n, name: 'Iron Shard', description: 'A talking shard.' }],
      place_pool: [resourcePool()],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'iron shard')).toBe('[Iron Shard]: A talking shard.');
  });

  it('a partial NPC match still wins over a partial resource match (category order inside a pass)', () => {
    const ctx = ctxWith({
      npc: [{ id: 1n, locationId: 1n, name: 'Iron Shard Trader', description: 'A hard-eyed dealer.' }],
      place_pool: [resourcePool()],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'shard')).toBe('[Iron Shard Trader]: A hard-eyed dealer.');
  });

  it('a Stone resource click is not captured by a Stone Golem enemy at the same location', () => {
    const ctx = ctxWith({
      enemy_spawn: [{ id: 1n, locationId: 1n, name: 'Stone Golem', enemyTemplateId: 5n }],
      enemy_template: [{ id: 5n, level: 3n, role: 'Brute', creatureType: 'Construct', isBoss: false }],
      place_pool: [resourcePool({ refId: 8n })],
      item_template: [{ ...ironTemplate, id: 8n, name: 'Stone' }],
    });
    const out = describeLookTarget(ctx, ME, 'Stone')!;
    expect(out).toContain('Gathering yields');
    expect(out).not.toContain('You study');
    // the partial pass still reaches the enemy when no exact match exists
    expect(describeLookTarget(ctx, ME, 'golem')).toContain('You study Stone Golem');
  });

  it('a resource named Wood is not captured by a player named Woodrow', () => {
    const ctx = ctxWith({
      character: [ME, { id: 11n, locationId: 1n, level: 3n, name: 'Woodrow', race: 'Human', className: 'Ranger', online: true }],
      place_pool: [resourcePool({ refId: 9n })],
      item_template: [{ ...ironTemplate, id: 9n, name: 'Wood' }],
    });
    expect(describeLookTarget(ctx, ME, 'wood')).toContain('Gathering yields');
  });

  it('an exact carried item beats a partial resource match', () => {
    const ctx = ctxWith({
      place_pool: [resourcePool({ refId: 31n })],
      item_instance: [instance({ templateId: 7n, qualityTier: undefined })],
      item_template: [ironTemplate, { ...ironTemplate, id: 31n, name: 'Iron Shard Vein' }],
    });
    const out = describeLookTarget(ctx, ME, 'Iron Shard')!;
    expect(out.split('\n')[0]).toBe('Iron Shard');
    expect(out).toContain('You carry one.');
  });

  it('a resource wins over an inventory item with the same name', () => {
    const ctx = ctxWith({
      place_pool: [resourcePool()],
      item_instance: [instance({ templateId: 7n })],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toContain('Gathering yields');
  });

  it('keeps the enemy line byte-identical', () => {
    const ctx = ctxWith({
      enemy_spawn: [{ id: 1n, locationId: 1n, name: 'Ash Wolf', enemyTemplateId: 5n }],
      enemy_template: [{ id: 5n, level: 3n, role: 'Brute', creatureType: 'Beast', isBoss: true }],
    });
    expect(describeLookTarget(ctx, ME, 'wolf')).toBe(
      'You study Ash Wolf. Level 3. Brute Beast. This creature carries the weight of something ancient and terrible.',
    );
  });

  it('keeps the other-player line byte-identical', () => {
    const ctx = ctxWith({
      character: [
        ME,
        { id: 11n, locationId: 1n, level: 4n, name: 'Mira', race: 'Elf', className: 'Mage', online: true },
      ],
    });
    expect(describeLookTarget(ctx, ME, 'mira')).toBe('Mira, Level 4 Elf Mage.');
  });

  it('does not match an offline player, or a row without the online flag', () => {
    const ctx = ctxWith({
      character: [
        ME,
        { id: 11n, locationId: 1n, level: 4n, name: 'Mira', race: 'Elf', className: 'Mage', online: false },
        { id: 12n, locationId: 1n, level: 4n, name: 'Tamsin', race: 'Elf', className: 'Mage' },
      ],
    });
    expect(describeLookTarget(ctx, ME, 'mira')).toBeNull();
    expect(describeLookTarget(ctx, ME, 'tamsin')).toBeNull();
  });

  it('returns null for an unknown target', () => {
    const ctx = ctxWith({});
    expect(describeLookTarget(ctx, ME, 'nothing')).toBeNull();
  });
});

describe('intent.ts wiring', () => {
  const src = readFileSync(fileURLToPath(new URL('../reducers/intent.ts', import.meta.url)), 'utf8');
  it('delegates the LOOK block to the examine helper', () => {
    expect(src).toContain('parseLookCommand(');
    expect(src).toContain('describeLookTarget(');
    expect(src).toContain('lookMissLine(');
  });
});

// ---------------------------------------------------------------------------
// Plan 51-01: neighbouring places and the bind stone (the last two categories of each pass)
// ---------------------------------------------------------------------------

const HERE = { id: 10n, locationId: 10n, level: 5n, name: 'Hero', race: 'Human', className: 'Warrior', boundLocationId: 10n };
const placeRow = (over: Record<string, unknown>) => ({
  id: 11n,
  name: 'Gloamwood',
  description: 'Black pines lean over the road.',
  regionId: 1n,
  isSafe: false,
  bindStone: false,
  craftingAvailable: false,
  terrainType: 'woods',
  ...over,
});
const linkRows = (from: bigint, to: bigint) => [
  { id: from * 100n + to, fromLocationId: from, toLocationId: to },
  { id: to * 100n + from, fromLocationId: to, toLocationId: from },
];
const placesSeed = (extra: Record<string, any[]> = {}) => ({
  region: [
    { id: 1n, name: 'Ashfall Wilds' },
    { id: 2n, name: 'Saltmarsh' },
  ],
  location: [
    placeRow({ id: 10n, name: 'The Crossing', description: 'A crossroads.', bindStone: true, terrainType: 'town' }),
    placeRow({ id: 11n, name: 'Gloamwood' }),
    placeRow({ id: 12n, name: 'The Edge Beyond Ashfall', description: '', terrainType: 'uncharted' }),
    placeRow({ id: 13n, name: 'Saltmarsh Gate', description: 'A rusted gate.', regionId: 2n }),
    placeRow({ id: 14n, name: 'Far Off', description: 'Not connected.' }),
  ],
  location_connection: [...linkRows(10n, 11n), ...linkRows(10n, 12n), ...linkRows(10n, 13n)],
  ...extra,
});

describe('describeLookTarget: neighbouring places', () => {
  it('describes a connected place in the same region: name, next-to line, description', () => {
    const ctx = ctxWith(placesSeed());
    expect(describeLookTarget(ctx, HERE, 'gloamwood')).toBe(
      'Gloamwood\nNext to The Crossing.\nBlack pines lean over the road.',
    );
  });

  it('an uncharted edge with no description says nobody has been there', () => {
    const ctx = ctxWith(placesSeed());
    expect(describeLookTarget(ctx, HERE, 'the edge beyond ashfall')).toBe(
      'The Edge Beyond Ashfall\nNext to The Crossing.\nNobody has been here yet.',
    );
  });

  it('an uncharted place that has a description shows it', () => {
    const seed = placesSeed();
    seed.location[2] = placeRow({ id: 12n, name: 'The Edge Beyond Ashfall', description: 'Mist.', terrainType: 'uncharted' });
    expect(describeLookTarget(ctxWith(seed), HERE, 'edge beyond')).toBe(
      'The Edge Beyond Ashfall\nNext to The Crossing.\nMist.',
    );
  });

  it('a charted place with no description has no third line', () => {
    const seed = placesSeed();
    seed.location[1] = placeRow({ id: 11n, name: 'Gloamwood', description: '' });
    expect(describeLookTarget(ctxWith(seed), HERE, 'gloamwood')).toBe('Gloamwood\nNext to The Crossing.');
  });

  it('a place in another region names the region across the border', () => {
    const ctx = ctxWith(placesSeed());
    expect(describeLookTarget(ctx, HERE, 'saltmarsh gate')).toBe(
      'Saltmarsh Gate\nNext to The Crossing, across the border in Saltmarsh.\nA rusted gate.',
    );
  });

  it('falls back to another region when the region row is missing', () => {
    const seed = placesSeed();
    seed.region = [{ id: 1n, name: 'Ashfall Wilds' }];
    expect(describeLookTarget(ctxWith(seed), HERE, 'saltmarsh gate')).toBe(
      'Saltmarsh Gate\nNext to The Crossing, across the border in another region.\nA rusted gate.',
    );
  });

  it('a place that is not connected to the current one is a miss', () => {
    expect(describeLookTarget(ctxWith(placesSeed()), HERE, 'far off')).toBeNull();
  });

  it('with two connected places that match a partial name, the lowest id answers', () => {
    const seed = placesSeed();
    seed.location.push(placeRow({ id: 15n, name: 'Gloamwood Deep', description: 'Deeper.' }));
    seed.location_connection.push(...linkRows(10n, 15n));
    expect(describeLookTarget(ctxWith(seed), HERE, 'gloam')?.startsWith('Gloamwood\n')).toBe(true);
  });

  it('an exact name beats an earlier partial match', () => {
    const seed = placesSeed();
    seed.location.push(placeRow({ id: 9n, name: 'Gloamwood Deep', description: 'Deeper.' }));
    seed.location_connection.push(...linkRows(10n, 9n));
    expect(describeLookTarget(ctxWith(seed), HERE, 'gloamwood')?.startsWith('Gloamwood\nNext to')).toBe(true);
  });
});

describe('describeLookTarget: bind stone', () => {
  it('says the character is bound here', () => {
    expect(describeLookTarget(ctxWith(placesSeed()), HERE, 'bind stone')).toBe(
      'Bind stone\nYou are bound here. You return here after defeat.',
    );
  });

  it('says the character is not bound here when bound elsewhere or never bound', () => {
    const expected = 'Bind stone\nYou are not bound here. Bind here to return after defeat.';
    expect(describeLookTarget(ctxWith(placesSeed()), { ...HERE, boundLocationId: 99n }, 'bind stone')).toBe(expected);
    expect(describeLookTarget(ctxWith(placesSeed()), { ...HERE, boundLocationId: undefined }, 'bind stone')).toBe(expected);
  });

  it('is a miss at a place without a bind stone', () => {
    const seed = placesSeed();
    seed.location[0] = placeRow({ id: 10n, name: 'The Crossing', bindStone: false });
    expect(describeLookTarget(ctxWith(seed), HERE, 'bind stone')).toBeNull();
  });

  it('is a miss when the current place row is missing', () => {
    expect(describeLookTarget(ctxWith({}), HERE, 'bind stone')).toBeNull();
  });
});

describe('describeLookTarget: the new categories come last', () => {
  it('a Stone resource pool still wins look at stone over a neighbouring place named Stone', () => {
    const seed = placesSeed({
      place_pool: [resourcePool({ locationId: 10n })],
      item_template: [{ ...ironTemplate, name: 'Stone' }],
    });
    seed.location.push(placeRow({ id: 16n, name: 'Stone', description: 'A town of stone.' }));
    seed.location_connection.push(...linkRows(10n, 16n));
    expect(describeLookTarget(ctxWith(seed), HERE, 'stone')?.startsWith('Stone\nAbundant.')).toBe(true);
  });

  it('an NPC named like a neighbouring place answers before the place', () => {
    const seed = placesSeed({
      npc: [{ id: 50n, locationId: 10n, name: 'Gloamwood', description: 'A woman who smells of pine.' }],
    });
    expect(describeLookTarget(ctxWith(seed), HERE, 'gloamwood')).toBe('[Gloamwood]: A woman who smells of pine.');
  });

  it('an exact neighbouring place name beats a partial NPC or item match (client-rest review IN-09, kept order)', () => {
    const seed = placesSeed({
      npc: [{ id: 50n, locationId: 10n, name: 'Gloamwood Warden', description: 'A warden.' }],
      item_template: [{ ...ironTemplate, id: 30n, name: 'Gloamwood Bark' }],
      item_instance: [{ id: 300n, ownerCharacterId: 10n, templateId: 30n, quantity: 1n }],
    });
    expect(describeLookTarget(ctxWith(seed), HERE, 'gloamwood')).toBe(
      'Gloamwood\nNext to The Crossing.\nBlack pines lean over the road.',
    );
  });

  it('a carried item answers before the bind stone', () => {
    const seed = placesSeed({
      item_template: [{ ...ironTemplate, id: 30n, name: 'Bind Stone' }],
      item_instance: [{ id: 300n, ownerCharacterId: 10n, templateId: 30n, quantity: 1n }],
    });
    expect(describeLookTarget(ctxWith(seed), HERE, 'bind stone')?.startsWith('Bind Stone\nCommon material')).toBe(true);
  });
});
