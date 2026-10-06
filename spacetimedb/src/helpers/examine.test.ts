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

describe('describeLookTarget: resource nodes', () => {
  it('describes an available node with its yield and description', () => {
    const ctx = ctxWith({ resource_node: [node()], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBe(
      [
        'Iron Shard',
        'Ready to gather.',
        'Gathering yields Iron Shard (common material).',
        'A jagged shard of iron scavenged from ruins.',
      ].join('\n'),
    );
  });

  it('matches case-insensitively', () => {
    const ctx = ctxWith({ resource_node: [node()], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'iRoN sHaRd')).toContain('Ready to gather.');
  });

  it('matches a partial name when no exact match exists', () => {
    const ctx = ctxWith({ resource_node: [node()], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'shard')).toContain('Gathering yields');
  });

  it('says someone is gathering when locked by another character', () => {
    const ctx = ctxWith({
      resource_node: [node({ state: 'harvesting', lockedByCharacterId: 11n })],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n')[1]).toBe('Someone is gathering it.');
  });

  it('says someone is gathering when harvesting without a lock', () => {
    const ctx = ctxWith({ resource_node: [node({ state: 'harvesting' })], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n')[1]).toBe('Someone is gathering it.');
  });

  it('says you are gathering when locked by this character', () => {
    const ctx = ctxWith({
      resource_node: [node({ state: 'harvesting', lockedByCharacterId: 10n })],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n')[1]).toBe('You are gathering it now.');
  });

  it('says depleted for any other state', () => {
    const ctx = ctxWith({ resource_node: [node({ state: 'depleted' })], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n')[1]).toBe('Depleted.');
  });

  it('describes an available unlocked node first when several share the name', () => {
    const ctx = ctxWith({
      resource_node: [
        node({ id: 101n, state: 'depleted' }),
        node({ id: 102n, state: 'harvesting', lockedByCharacterId: 11n }),
        node({ id: 103n, state: 'available' }),
      ],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')!.split('\n')[1]).toBe('Ready to gather.');
  });

  it('still describes a node whose template is missing', () => {
    const ctx = ctxWith({ resource_node: [node()] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBe(
      ['Iron Shard', 'Ready to gather.', 'Gathering yields Iron Shard.'].join('\n'),
    );
  });

  it('does not describe a node at another location', () => {
    const ctx = ctxWith({ resource_node: [node({ locationId: 2n })], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBeNull();
  });

  it('does not describe another character\'s personal node', () => {
    const ctx = ctxWith({ resource_node: [node({ characterId: 99n })], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toBeNull();
  });

  it('describes the character\'s own personal node', () => {
    const ctx = ctxWith({ resource_node: [node({ characterId: 10n })], item_template: [ironTemplate] });
    expect(describeLookTarget(ctx, ME, 'Iron Shard')).toContain('Ready to gather.');
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
  it('an exact node match beats a partial NPC match', () => {
    const ctx = ctxWith({
      npc: [{ id: 1n, locationId: 1n, name: 'Iron Shard Trader', description: 'A hard-eyed dealer.' }],
      resource_node: [node()],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'iron shard')).toContain('Gathering yields');
  });

  it('an exact NPC match still wins over an exact node match', () => {
    const ctx = ctxWith({
      npc: [{ id: 1n, locationId: 1n, name: 'Iron Shard', description: 'A talking shard.' }],
      resource_node: [node()],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'iron shard')).toBe('[Iron Shard]: A talking shard.');
  });

  it('a partial NPC match still wins over a partial node match (category order inside a pass)', () => {
    const ctx = ctxWith({
      npc: [{ id: 1n, locationId: 1n, name: 'Iron Shard Trader', description: 'A hard-eyed dealer.' }],
      resource_node: [node()],
      item_template: [ironTemplate],
    });
    expect(describeLookTarget(ctx, ME, 'shard')).toBe('[Iron Shard Trader]: A hard-eyed dealer.');
  });

  it('a Stone node click is not captured by a Stone Golem enemy at the same location', () => {
    const ctx = ctxWith({
      enemy_spawn: [{ id: 1n, locationId: 1n, name: 'Stone Golem', enemyTemplateId: 5n }],
      enemy_template: [{ id: 5n, level: 3n, role: 'Brute', creatureType: 'Construct', isBoss: false }],
      resource_node: [node({ name: 'Stone', itemTemplateId: 8n })],
      item_template: [{ ...ironTemplate, id: 8n, name: 'Stone' }],
    });
    const out = describeLookTarget(ctx, ME, 'Stone')!;
    expect(out).toContain('Gathering yields');
    expect(out).not.toContain('You study');
    // the partial pass still reaches the enemy when no exact match exists
    expect(describeLookTarget(ctx, ME, 'golem')).toContain('You study Stone Golem');
  });

  it('a node named Wood is not captured by a player named Woodrow', () => {
    const ctx = ctxWith({
      character: [ME, { id: 11n, locationId: 1n, level: 3n, name: 'Woodrow', race: 'Human', className: 'Ranger' }],
      resource_node: [node({ name: 'Wood', itemTemplateId: 9n })],
      item_template: [{ ...ironTemplate, id: 9n, name: 'Wood' }],
    });
    expect(describeLookTarget(ctx, ME, 'wood')).toContain('Gathering yields');
  });

  it('an exact carried item beats a partial node match', () => {
    const ctx = ctxWith({
      resource_node: [node({ name: 'Iron Shard Vein', itemTemplateId: 7n })],
      item_instance: [instance({ templateId: 7n, qualityTier: undefined })],
      item_template: [ironTemplate],
    });
    const out = describeLookTarget(ctx, ME, 'Iron Shard')!;
    expect(out.split('\n')[0]).toBe('Iron Shard');
    expect(out).toContain('You carry one.');
  });

  it('a node wins over an inventory item with the same name', () => {
    const ctx = ctxWith({
      resource_node: [node()],
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
        { id: 11n, locationId: 1n, level: 4n, name: 'Mira', race: 'Elf', className: 'Mage' },
      ],
    });
    expect(describeLookTarget(ctx, ME, 'mira')).toBe('Mira, Level 4 Elf Mage.');
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
