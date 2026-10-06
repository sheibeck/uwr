import { describe, expect, it } from 'vitest';
import { computed } from 'vue';
import { ledgerQueries } from './queries';
import { createInertLedger } from './ledgerContext';

const q = ledgerQueries();

describe('ledgerQueries: per-character tables', () => {
  it('filters item_instance by owner_character_id', () => {
    const sql = q.itemInstances(7n);
    expect(sql).toContain('"item_instance"');
    expect(sql).toContain('WHERE');
    expect(sql).toContain('"owner_character_id" = 7');
  });

  it('filters recipe_discovered and pending_renown_perk by character_id', () => {
    const known = q.recipesKnown(7n);
    expect(known).toContain('"recipe_discovered"');
    expect(known).toContain('"character_id" = 7');
    const perks = q.pendingPerks(7n);
    expect(perks).toContain('"pending_renown_perk"');
    expect(perks).toContain('"character_id" = 7');
  });

  it('filters vendor_inventory by npc_id', () => {
    const sql = q.vendorStock(9n);
    expect(sql).toContain('"vendor_inventory"');
    expect(sql).toContain('"npc_id" = 9');
  });
});

describe('ledgerQueries: id-list OR chains', () => {
  it('chains item_affix on item_instance_id', () => {
    const sql = q.itemAffixes([1n, 2n]);
    expect(sql).toContain('"item_affix"');
    expect(sql).toContain('"item_instance_id" = 1');
    expect(sql).toContain('"item_instance_id" = 2');
    expect(sql).toContain('OR');
  });

  it('chains item_template and recipe_template on id', () => {
    const templates = q.itemTemplates([3n]);
    expect(templates).toContain('"item_template"');
    expect(templates).toContain('"id" = 3');
    const recipes = q.recipeTemplates([4n, 5n]);
    expect(recipes).toContain('"recipe_template"');
    expect(recipes).toContain('"id" = 4');
    expect(recipes).toContain('"id" = 5');
    expect(recipes).toContain('OR');
  });

  it('refuses an empty id list', () => {
    expect(() => q.itemAffixes([])).toThrow();
    expect(() => q.itemTemplates([])).toThrow();
    expect(() => q.recipeTemplates([])).toThrow();
  });
});

describe('ledgerQueries: the last sale view', () => {
  it('is the unfiltered per-sender view', () => {
    expect(q.myVendorBuyback).toContain('"my_vendor_buyback"');
    expect(q.myVendorBuyback).not.toContain('WHERE');
  });

  it('puts a WHERE on every public table query', () => {
    for (const sql of [
      q.itemInstances(1n),
      q.itemAffixes([1n]),
      q.itemTemplates([1n]),
      q.vendorStock(1n),
      q.recipesKnown(1n),
      q.recipeTemplates([1n]),
      q.pendingPerks(1n),
    ]) {
      expect(sql).toContain('WHERE');
    }
  });
});

describe('createInertLedger', () => {
  it('is empty, unapplied and disconnected', () => {
    const inert = createInertLedger();
    expect(inert.connected.value).toBe(false);
    expect(inert.items.value).toEqual([]);
    expect(inert.itemsApplied.value).toBe(false);
    expect(inert.affixes.value).toEqual([]);
    expect(inert.templates.value.size).toBe(0);
    expect(inert.vendorTarget.value).toBeNull();
    expect(inert.vendorStock.value).toEqual([]);
    expect(inert.vendorStockApplied.value).toBe(false);
    expect(inert.recipesKnown.value).toEqual([]);
    expect(inert.recipesApplied.value).toBe(false);
    expect(inert.recipes.value.size).toBe(0);
    expect(inert.pendingPerks.value).toEqual([]);
    expect(inert.lastSale.value).toBeNull();
    expect(inert.reducers.value).toBeNull();
  });

  it('has no-op methods', () => {
    const inert = createInertLedger();
    expect(() => {
      inert.setVendor({ npcId: 1n, npcName: 'Sabeth' });
      inert.reset();
      inert.dispose();
    }).not.toThrow();
    expect(inert.vendorTarget.value).toBeNull();
    expect(computed(() => inert.items.value.length).value).toBe(0);
  });
});
