/**
 * Real-handler parity (Phase 50, LDG-02 / LDG-08): the REAL equip_item handler captured from
 * index.ts refuses exactly when the shared canEquipItem says so, with the same message, and
 * leaves every item_instance untouched when it refuses. Written to hold before and after
 * equip_item was pointed at the shared function. The mock db is strict; one shared identity
 * object is used for seeding and as the sender (the mock compares with ===).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';
import { canEquipItem } from '../data/item_usability';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const T0 = 1_700_000_000_000_000n;
const alice = { toHexString: () => 'a'.repeat(64) };

let equipItem: (...args: any[]) => any;

function capture(name: string): (...args: any[]) => any {
  const h = capturedReducer(name);
  if (typeof h !== 'function') {
    throw new Error(
      `capturedReducer('${name}') is not a function: the schema recorder could not capture the ` +
        'reducer from index.ts. STOP and report; never edit production code to fix this.',
    );
  }
  return h as (...args: any[]) => any;
}

beforeAll(async () => {
  await import('../index');
  equipItem = capture('equip_item');
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];
const clone = <T>(v: T): T => structuredClone(v);
const messages = (ctx: any): string[] => rows(ctx, 'event_private').map((e) => e.message);

const baseTemplate = {
  slot: 'chest',
  stackable: false,
  armorType: 'cloth',
  weaponType: '',
  allowedClasses: '',
  rarity: 'common',
  strBonus: 0n,
  dexBonus: 0n,
  intBonus: 0n,
  wisBonus: 0n,
  chaBonus: 0n,
  hpBonus: 0n,
  manaBonus: 0n,
  armorClassBonus: 0n,
  magicResistanceBonus: 0n,
  weaponBaseDamage: 0n,
  weaponDps: 0n,
  requiredLevel: 1n,
  isJunk: false,
  vendorValue: 5n,
  tier: 1n,
};

const baseCharacter = {
  id: 1n,
  ownerUserId: 7n,
  name: 'Mirel',
  className: 'Ashwarden',
  level: 5n,
  gold: 100n,
  locationId: 10n,
  str: 10n,
  dex: 10n,
  cha: 10n,
  wis: 10n,
  int: 10n,
  hp: 50n,
  mana: 0n,
  stamina: 20n,
  maxStamina: 20n,
  weaponProficiencies: '',
  armorProficiencies: '',
};

function newCtx(opts: {
  templates: any[];
  instances: any[];
  character?: Record<string, unknown>;
}) {
  return createMockCtx({
    seed: {
      player: [{ id: alice, userId: 7n, activeCharacterId: 1n }],
      character: [{ ...baseCharacter, ...(opts.character ?? {}) }],
      item_template: opts.templates,
      item_instance: opts.instances,
      item_affix: [],
      ability_template: [],
      character_effect: [],
      combat_participant: [],
      combat_encounter: [],
    },
    sender: alice,
    timestampMicros: T0,
    strict: true,
  });
}

// ---------------------------------------------------------------------------
// equip_item
// ---------------------------------------------------------------------------

interface EquipFixture {
  label: string;
  template: Record<string, unknown>;
  character?: Record<string, unknown>;
}

const SWORD_AXE = 'sword,axe';
const CLOTH_LEATHER = 'cloth,leather';
const FIXTURES: EquipFixture[] = [
  { label: 'stackable', template: { slot: 'chest', stackable: true } },
  { label: 'weapon proficiency refused', template: { slot: 'mainHand', weaponType: 'dagger', armorType: 'none' }, character: { weaponProficiencies: SWORD_AXE } },
  { label: 'weapon proficiency allowed', template: { slot: 'mainHand', weaponType: 'sword', armorType: 'none' }, character: { weaponProficiencies: SWORD_AXE } },
  { label: 'off-hand weapon proficiency refused', template: { slot: 'offHand', weaponType: 'mace', armorType: 'none' }, character: { weaponProficiencies: SWORD_AXE } },
  { label: 'armor proficiency refused', template: { slot: 'chest', armorType: 'plate' }, character: { armorProficiencies: CLOTH_LEATHER } },
  { label: 'armor proficiency allowed', template: { slot: 'legs', armorType: 'leather' }, character: { armorProficiencies: CLOTH_LEATHER } },
  { label: 'neck is never armor-gated', template: { slot: 'neck', armorType: 'plate' }, character: { armorProficiencies: CLOTH_LEATHER } },
  { label: 'legacy weapon refused', template: { slot: 'mainHand', allowedClasses: 'warrior', armorType: 'none' } },
  { label: 'legacy class refused', template: { slot: 'chest', allowedClasses: 'warrior' } },
  { label: 'legacy class allowed', template: { slot: 'chest', allowedClasses: 'warrior, Ashwarden' } },
  { label: 'invalid slot', template: { slot: 'material' } },
  { label: 'level short is allowed', template: { slot: 'chest', requiredLevel: 20n } },
];

describe('equip_item parity with canEquipItem', () => {
  it.each(FIXTURES)('$label', (fixture) => {
    const template = { ...baseTemplate, id: 50n, name: 'Fixture Item', ...fixture.template };
    const instance = { id: 500n, templateId: 50n, ownerCharacterId: 1n, equippedSlot: undefined, quantity: 1n };
    const ctx = newCtx({ templates: [template], instances: [instance], character: fixture.character });
    const character = rows(ctx, 'character')[0];
    const expected = canEquipItem(template as any, character as any);
    const before = clone(rows(ctx, 'item_instance'));

    equipItem(ctx, { characterId: 1n, itemInstanceId: 500n });

    if (expected.ok) {
      expect(rows(ctx, 'item_instance')[0].equippedSlot).toBe(template.slot);
      expect(messages(ctx)).toEqual([]);
    } else {
      expect(messages(ctx)).toEqual([expected.message]);
      expect(rows(ctx, 'event_private')[0].kind).toBe('system');
      expect(rows(ctx, 'item_instance')).toEqual(before);
    }
  });

  it('covers both outcomes (the fixtures are not all refusals or all successes)', () => {
    const outcomes = FIXTURES.map((f) => {
      const template = { ...baseTemplate, id: 50n, name: 'x', ...f.template };
      return canEquipItem(template as any, { ...baseCharacter, ...(f.character ?? {}) } as any).ok;
    });
    expect(outcomes).toContain(true);
    expect(outcomes).toContain(false);
    expect(outcomes.filter((ok) => !ok).length).toBeGreaterThanOrEqual(6);
  });

  it('a level-short, class-allowed item equips and replaces the item in that slot', () => {
    const high = { ...baseTemplate, id: 51n, name: 'Grand Vest', slot: 'chest', requiredLevel: 30n };
    const old = { ...baseTemplate, id: 52n, name: 'Old Vest', slot: 'chest' };
    const worn = { id: 501n, templateId: 52n, ownerCharacterId: 1n, equippedSlot: 'chest', quantity: 1n };
    const fresh = { id: 502n, templateId: 51n, ownerCharacterId: 1n, equippedSlot: undefined, quantity: 1n };
    const ctx = newCtx({ templates: [high, old], instances: [worn, fresh] });
    equipItem(ctx, { characterId: 1n, itemInstanceId: 502n });
    const byId = (id: bigint) => rows(ctx, 'item_instance').find((i) => i.id === id);
    expect(byId(502n).equippedSlot).toBe('chest');
    expect(byId(501n).equippedSlot).toBeUndefined();
    expect(messages(ctx)).toEqual([]);
  });
});
