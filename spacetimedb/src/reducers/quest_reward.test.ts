/**
 * Quest item rewards (quick 261006-g12). turn_in_quest builds an item reward for a quest with
 * rewardType 'item' and a rewardItemName (LLM quest offers, helpers/llm_apply.ts). Runs the REAL
 * turn_in_quest and equip_item handlers captured from index.ts on the strict mock db and checks:
 *   - the item_template / item_instance rows carry only real schema columns, with every required
 *     column present (the old insert used damage/armor/str/maxHp... and missed requiredLevel,
 *     allowedClasses, weaponType and more, so the real serializer threw and the turn-in rolled back);
 *   - the slot is an EQUIPMENT_SLOTS slot and the armor type is valid, at every level of the slot cycle;
 *   - the rewarded character can equip the item (dynamic proficiencies and legacy class check);
 *   - an xp/gold-only quest creates no item.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer, rowColumnProblems } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { EQUIPMENT_SLOTS } from '../helpers/items';
import { ARMOR_TYPES_WITH_NONE, normalizeArmorType } from '../data/class_stats';
import { WEAPON_TYPES } from '../data/mechanical_vocabulary';
import { computeQuestRewardStats, QUEST_REWARD_SLOTS } from './quests';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

const handlers: Record<string, (...args: any[]) => any> = {};

beforeAll(async () => {
  await import('../index');
  for (const name of ['turn_in_quest', 'equip_item']) {
    const h = capturedReducer(name);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${name}') is not a function: STOP and report; never edit production code to fix this.`);
    }
    handlers[name] = h;
  }
}, 120_000);

type CharVariant = { label: string; className: string; weaponProficiencies?: string; armorProficiencies?: string };

const VARIANTS: CharVariant[] = [
  { label: 'martial (plate, sword)', className: 'Ashwarden', weaponProficiencies: 'sword,axe,mace,greatsword,dagger', armorProficiencies: 'cloth,leather,chain,plate' },
  { label: 'mystic (leather, staff)', className: 'Veilcaller', weaponProficiencies: 'staff,wand,dagger', armorProficiencies: 'cloth,leather' },
  { label: 'cloth only, wand', className: 'Glimmerkin', weaponProficiencies: 'wand', armorProficiencies: 'cloth' },
  { label: 'legacy (no proficiencies)', className: 'Saltwright' },
];

const MARTIAL = VARIANTS[0];

function character(level: bigint, v: CharVariant = MARTIAL) {
  return {
    id: 1n,
    ownerUserId: 7n,
    name: 'Mirel',
    className: v.className,
    weaponProficiencies: v.weaponProficiencies,
    armorProficiencies: v.armorProficiencies,
    level,
    xp: 0n,
    gold: 10n,
    locationId: 10n,
    str: 10n, dex: 10n, cha: 10n, wis: 10n, int: 10n,
    hp: 100n, mana: 0n, stamina: 20n, maxStamina: 20n,
  };
}

function questTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 50n,
    name: 'The Drowned Bell',
    npcId: 0n,
    targetEnemyTemplateId: 0n,
    requiredCount: 1n,
    minLevel: 1n,
    maxLevel: 10n,
    rewardXp: 40n,
    questType: 'kill',
    rewardType: 'item',
    rewardItemName: 'Bellwright Token',
    rewardItemDesc: 'Salt-crusted and humming.',
    characterId: 1n,
    ...overrides,
  };
}

function newCtx(level: bigint, opts: { variant?: CharVariant; qt?: Record<string, any> } = {}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [character(level, opts.variant)],
      quest_template: [questTemplate(opts.qt)],
      quest_instance: [{ id: 60n, characterId: 1n, questTemplateId: 50n, progress: 1n, completed: true }],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const failures = (ctx: any) => rows(ctx, 'event_private').filter((e) => e.kind === 'system');

function turnIn(ctx: any) {
  handlers.turn_in_quest(ctx, { characterId: 1n, questInstanceId: 60n });
}

// Levels 1..6 cover one full turn of the slot cycle (level % 6); 12 and 30 repeat it at higher budgets.
const LEVELS = [1n, 2n, 3n, 4n, 5n, 6n, 12n, 30n];

describe('computeQuestRewardStats', () => {
  it('only picks EQUIPMENT_SLOTS slots, for every level of the cycle', () => {
    for (const slot of QUEST_REWARD_SLOTS) expect(EQUIPMENT_SLOTS.has(slot)).toBe(true);
    for (let lvl = 1; lvl <= 60; lvl++) {
      const stats = computeQuestRewardStats(BigInt(lvl), 'kill');
      expect(EQUIPMENT_SLOTS.has(stats.slot)).toBe(true);
      expect(stats.isWeapon).toBe(stats.slot === 'mainHand');
    }
  });

  it('cycles through all six reward slots over six consecutive levels', () => {
    const seen = new Set([1n, 2n, 3n, 4n, 5n, 6n].map((l) => computeQuestRewardStats(l, 'kill').slot));
    expect([...seen].sort()).toEqual([...QUEST_REWARD_SLOTS].sort());
  });
});

describe('turn_in_quest item reward (real handler)', () => {
  it.each(LEVELS)('level %s: creates a schema-valid item_template and item_instance', (level) => {
    const ctx = newCtx(level);
    expect(() => turnIn(ctx)).not.toThrow();

    const templates = rows(ctx, 'item_template');
    expect(templates).toHaveLength(1);
    const tpl = templates[0];
    expect(rowColumnProblems('item_template', tpl)).toEqual([]);
    expect(tpl.name).toBe('Bellwright Token');
    expect(tpl.description).toBe('Salt-crusted and humming.');

    const instances = rows(ctx, 'item_instance');
    expect(instances).toHaveLength(1);
    const inst = instances[0];
    expect(rowColumnProblems('item_instance', inst)).toEqual([]);
    expect(inst.templateId).toBe(tpl.id);
    expect(inst.ownerCharacterId).toBe(1n);
    expect(inst.quantity).toBe(1n);
    expect(inst.equippedSlot).toBeUndefined();
    expect(inst.qualityTier).toBe(tpl.rarity);

    // The rest of the turn-in still happens.
    expect(rows(ctx, 'quest_instance')).toHaveLength(0);
    expect(rows(ctx, 'character')[0].xp).toBe(40n);
    expect(rows(ctx, 'event_private').some((e) => e.message === 'Received: Bellwright Token!')).toBe(true);
  });

  it.each(LEVELS)('level %s: slot, armor type and weapon fields are valid', (level) => {
    const ctx = newCtx(level);
    turnIn(ctx);
    const tpl = rows(ctx, 'item_template')[0];

    expect(EQUIPMENT_SLOTS.has(tpl.slot)).toBe(true);
    expect((ARMOR_TYPES_WITH_NONE as readonly string[]).includes(tpl.armorType)).toBe(true);
    expect(normalizeArmorType(tpl.armorType)).toBe(tpl.armorType);
    expect(tpl.requiredLevel).toBeLessThanOrEqual(level);
    expect(tpl.allowedClasses).toBe('any');
    expect(tpl.stackable).toBe(false);
    expect(tpl.isJunk).toBe(false);

    if (tpl.slot === 'mainHand') {
      expect(tpl.armorType).toBe('none');
      expect((WEAPON_TYPES as readonly string[]).includes(tpl.weaponType)).toBe(true);
      expect(tpl.weaponBaseDamage).toBeGreaterThan(0n);
      expect(tpl.weaponDps).toBe(tpl.weaponBaseDamage + 1n);
      expect(tpl.armorClassBonus).toBe(0n);
    } else {
      expect(tpl.armorType).not.toBe('none');
      expect(tpl.weaponType).toBe('');
      expect(tpl.weaponBaseDamage).toBe(0n);
      expect(tpl.weaponDps).toBe(0n);
      expect(tpl.armorClassBonus).toBeGreaterThan(0n);
    }
  });

  for (const variant of VARIANTS) {
    it.each(LEVELS)(`${variant.label}, level %s: the rewarded character can equip the item`, (level) => {
      const ctx = newCtx(level, { variant });
      turnIn(ctx);
      const tpl = rows(ctx, 'item_template')[0];
      const inst = rows(ctx, 'item_instance')[0];
      if (variant.armorProficiencies && tpl.slot !== 'mainHand') {
        expect(variant.armorProficiencies.split(',')).toContain(tpl.armorType);
      }
      if (variant.weaponProficiencies && tpl.slot === 'mainHand') {
        expect(variant.weaponProficiencies.split(',')).toContain(tpl.weaponType);
      }

      handlers.equip_item(ctx, { characterId: 1n, itemInstanceId: inst.id });

      expect(failures(ctx)).toEqual([]);
      expect(rows(ctx, 'item_instance').find((r) => r.id === inst.id)?.equippedSlot).toBe(tpl.slot);
    });
  }

  it('picks the heaviest proficient armor (plate for a martial class, leather for a mystic)', () => {
    const martial = newCtx(2n, { variant: VARIANTS[0] }); // level 2 -> chest
    turnIn(martial);
    expect(rows(martial, 'item_template')[0].armorType).toBe('plate');
    const mystic = newCtx(2n, { variant: VARIANTS[1] });
    turnIn(mystic);
    expect(rows(mystic, 'item_template')[0].armorType).toBe('leather');
  });
});

describe('turn_in_quest without an item reward', () => {
  it('an xp/gold quest awards xp and gold and creates no item', () => {
    const ctx = newCtx(3n, { qt: { rewardType: 'gold', rewardItemName: undefined, rewardItemDesc: undefined, rewardGold: 25n } });
    turnIn(ctx);
    expect(rows(ctx, 'item_template')).toHaveLength(0);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    const ch = rows(ctx, 'character')[0];
    expect(ch.xp).toBe(40n);
    expect(ch.gold).toBe(35n);
    expect(rows(ctx, 'quest_instance')).toHaveLength(0);
  });

  it('an xp quest with no reward type creates no item', () => {
    const ctx = newCtx(3n, { qt: { rewardType: undefined, rewardItemName: undefined, rewardItemDesc: undefined } });
    turnIn(ctx);
    expect(rows(ctx, 'item_template')).toHaveLength(0);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(rows(ctx, 'character')[0].xp).toBe(40n);
  });

  it("an 'item' quest without an item name creates no item", () => {
    const ctx = newCtx(3n, { qt: { rewardItemName: undefined } });
    turnIn(ctx);
    expect(rows(ctx, 'item_template')).toHaveLength(0);
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
  });
});
