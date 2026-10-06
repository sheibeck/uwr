import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createMockDb } from './test-utils';
import { getEquippedBonuses } from './items';
import { addItemStats, emptyItemStats, sumItemStats } from '../data/item_stats';

// Records the real table definitions; strict mode derives its accessor allowlist from them.
vi.mock('spacetimedb/server', async () =>
  (await import('./schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

const ctxWith = (seed: Record<string, any[]>) => ({
  db: createMockDb(seed, { strict: true }),
  timestamp: { microsSinceUnixEpoch: 0n },
});

const baseTemplate = {
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
};

describe('sumItemStats equals getEquippedBonuses over equipped gear', () => {
  const seed = {
    item_template: [
      { ...baseTemplate, id: 1n, name: 'Leather Chest', slot: 'chest', armorClassBonus: 3n, strBonus: 1n },
      { ...baseTemplate, id: 2n, name: 'Dagger', slot: 'mainHand', weaponBaseDamage: 4n, weaponDps: 3n, dexBonus: 1n },
      { ...baseTemplate, id: 3n, name: 'Sage Ring', slot: 'earrings', intBonus: 5n },
    ],
    item_instance: [
      { id: 100n, ownerCharacterId: 10n, templateId: 1n, equippedSlot: 'chest', quantity: 1n },
      { id: 101n, ownerCharacterId: 10n, templateId: 2n, equippedSlot: 'mainHand', quantity: 1n },
      { id: 102n, ownerCharacterId: 10n, templateId: 3n, quantity: 1n },
    ],
    item_affix: [
      { id: 1n, itemInstanceId: 101n, affixType: 'suffix', affixKey: 'of_nimbleness', affixName: 'of Nimbleness', statKey: 'dexBonus', magnitude: 2n },
      { id: 2n, itemInstanceId: 100n, affixType: 'suffix', affixKey: 'quality_armorClassBonus', affixName: 'Quality', statKey: 'armorClassBonus', magnitude: 1n },
    ],
  };

  const sumEquipped = (ctx: any) => {
    let total = emptyItemStats();
    for (const inst of ctx.db.item_instance.by_owner.filter(10n)) {
      if (!inst.equippedSlot) continue;
      const template = ctx.db.item_template.id.find(inst.templateId);
      const affixes = [...ctx.db.item_affix.by_instance.filter(inst.id)];
      total = addItemStats(total, sumItemStats(template, affixes));
    }
    return total;
  };

  it('gives str 1, dex 3 and armorClassBonus 4, and never counts the unequipped item', () => {
    const total = sumEquipped(ctxWith(seed));
    expect(total.strBonus).toBe(1n);
    expect(total.dexBonus).toBe(3n);
    expect(total.armorClassBonus).toBe(4n);
    expect(total.intBonus).toBe(0n);
  });

  it('matches getEquippedBonuses for every stat it sums', () => {
    const ctx = ctxWith(seed);
    const total = sumEquipped(ctx);
    const bonuses = getEquippedBonuses(ctx, 10n);
    expect(total.strBonus).toBe(bonuses.str);
    expect(total.dexBonus).toBe(bonuses.dex);
    expect(total.chaBonus).toBe(bonuses.cha);
    expect(total.wisBonus).toBe(bonuses.wis);
    expect(total.intBonus).toBe(bonuses.int);
    expect(total.hpBonus).toBe(bonuses.hpBonus);
    expect(total.manaBonus).toBe(bonuses.manaBonus);
    expect(total.armorClassBonus).toBe(bonuses.armorClassBonus);
    expect(total.magicResistanceBonus).toBe(bonuses.magicResistanceBonus);
    expect(total.lifeOnHit).toBe(bonuses.lifeOnHit);
    expect(total.cooldownReduction).toBe(bonuses.cooldownReduction);
    expect(total.manaRegen).toBe(bonuses.manaRegen);
  });
});
