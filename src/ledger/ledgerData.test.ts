import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { ConnectionStatus } from '../net/connection';
import type { BindTableOptions } from '../net/bindTable';
import { createLedgerData } from './ledgerData';
import type { LedgerConn, LedgerDeps, LedgerInput } from './ledgerData';
import type { LedgerQueries } from './queries';

const REDUCER_NAMES = [
  'equipItem',
  'unequipItem',
  'useItem',
  'salvageItem',
  'learnRecipeScroll',
  'sellItem',
  'sellAllJunk',
  'buyItem',
  'buybackLastSale',
  'researchRecipes',
  'craftRecipe',
  'chooseRenownPerk',
] as const;

interface FakeConn {
  id: number;
  reducers: Record<(typeof REDUCER_NAMES)[number], ReturnType<typeof vi.fn>>;
}

interface FakeBinding {
  sql: string[];
  filter: ((row: any) => boolean) | undefined;
  rows: ShallowRef<readonly any[]>;
  applied: Ref<boolean>;
  failed: Ref<boolean>;
  attach: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  disposed: boolean;
}

const ids = (list: readonly bigint[]) => list.join(',');
const queries: LedgerQueries = {
  myVendorBuyback: 'Q_BUYBACK',
  itemInstances: (c) => `Q_ITEMS_${c}`,
  vendorStock: (n) => `Q_STOCK_${n}`,
  recipesKnown: (c) => `Q_KNOWN_${c}`,
  pendingPerks: (c) => `Q_PERKS_${c}`,
  itemAffixes: (list) => `Q_AFFIX_${ids(list)}`,
  itemTemplates: (list) => `Q_TPL_${ids(list)}`,
  recipeTemplates: (list) => `Q_RECIPES_${ids(list)}`,
};

let connCounter = 0;
function makeConn(): FakeConn {
  connCounter += 1;
  const reducers = {} as FakeConn['reducers'];
  for (const name of REDUCER_NAMES) reducers[name] = vi.fn(() => Promise.resolve());
  return { id: connCounter, reducers };
}

function harness() {
  const conn = shallowRef<FakeConn | null>(null);
  const status = ref<ConnectionStatus>('idle');
  const activeCharacterId = ref<bigint | null>(null);
  const bindings: FakeBinding[] = [];

  const deps = {
    bind: (options: BindTableOptions<FakeConn, any>) => {
      const binding: FakeBinding = {
        sql: options.sql,
        filter: options.filter,
        rows: shallowRef<readonly any[]>([]),
        applied: ref(false),
        failed: ref(false),
        attach: vi.fn(),
        dispose: vi.fn(),
        disposed: false,
      };
      binding.dispose = vi.fn(() => {
        binding.disposed = true;
        binding.rows.value = [];
        binding.applied.value = false;
      });
      bindings.push(binding);
      return binding;
    },
    queries,
  } as unknown as LedgerDeps<FakeConn & LedgerConn>;

  const input = { conn, status, activeCharacterId } as unknown as LedgerInput<FakeConn & LedgerConn>;
  const scope = effectScope();
  const hub = scope.run(() => createLedgerData(deps, input))!;

  const live = (sql: string): FakeBinding[] => bindings.filter((b) => b.sql[0] === sql && !b.disposed);
  const find = (sql: string): FakeBinding => {
    const found = live(sql);
    if (found.length === 0) throw new Error(`no live binding for ${sql}`);
    return found[found.length - 1];
  };
  const liveSql = (): string[] => bindings.filter((b) => !b.disposed).map((b) => b.sql[0]);

  return {
    hub,
    scope,
    conn,
    status,
    activeCharacterId,
    bindings,
    live,
    find,
    liveSql,
    connect(): FakeConn {
      const c = makeConn();
      conn.value = c;
      status.value = 'connected';
      return c;
    },
  };
}

type Harness = ReturnType<typeof harness>;
const made: Harness[] = [];
function make(): Harness {
  const h = harness();
  made.push(h);
  return h;
}
afterEach(() => {
  for (const h of made.splice(0)) h.scope.stop();
});

function item(id: bigint, templateId: bigint, extra: Record<string, unknown> = {}) {
  return {
    id,
    templateId,
    ownerCharacterId: 7n,
    equippedSlot: undefined,
    quantity: 1n,
    qualityTier: undefined,
    craftQuality: undefined,
    ...extra,
  };
}

describe('createLedgerData: character keyed bindings', () => {
  it('binds nothing without an active character', () => {
    const h = make();
    h.connect();
    expect(h.bindings).toHaveLength(0);
  });

  it('binds items, known recipes, pending perks and the last sale for the character', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    expect(h.liveSql().sort()).toEqual(['Q_BUYBACK', 'Q_ITEMS_7', 'Q_KNOWN_7', 'Q_PERKS_7']);
    const items = h.find('Q_ITEMS_7');
    expect(items.filter!({ ownerCharacterId: 7n })).toBe(true);
    expect(items.filter!({ ownerCharacterId: 8n })).toBe(false);
    expect(h.find('Q_KNOWN_7').filter!({ characterId: 7n })).toBe(true);
    expect(h.find('Q_KNOWN_7').filter!({ characterId: 8n })).toBe(false);
    expect(h.find('Q_PERKS_7').filter!({ characterId: 7n })).toBe(true);
    expect(h.find('Q_PERKS_7').filter!({ characterId: 8n })).toBe(false);
    expect(h.find('Q_BUYBACK').filter!({ characterId: 8n })).toBe(false);
  });

  it('re-keys when the active character changes', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    h.find('Q_ITEMS_7').applied.value = true;
    h.activeCharacterId.value = 8n;
    expect(h.live('Q_ITEMS_8')).toHaveLength(1);
    h.find('Q_ITEMS_8').applied.value = true;
    expect(h.live('Q_ITEMS_7')).toHaveLength(0);
    expect(h.find('Q_ITEMS_8').filter!({ ownerCharacterId: 8n })).toBe(true);
  });

  it('exposes applied flags and rows', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    expect(h.hub.itemsApplied.value).toBe(false);
    const items = h.find('Q_ITEMS_7');
    items.rows.value = [item(1n, 5n)];
    items.applied.value = true;
    expect(h.hub.itemsApplied.value).toBe(true);
    expect(h.hub.items.value).toHaveLength(1);
    const known = h.find('Q_KNOWN_7');
    known.applied.value = true;
    expect(h.hub.recipesApplied.value).toBe(true);
  });
});

describe('createLedgerData: affixes, templates and recipes', () => {
  it('keys affixes by rolled, crafted and equipped instances only', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    expect(h.liveSql().some((s) => s.indexOf('Q_AFFIX') === 0)).toBe(false);
    const items = h.find('Q_ITEMS_7');
    items.rows.value = [
      item(9n, 5n, { qualityTier: 'Rare' }),
      item(2n, 5n, { craftQuality: 'Fine' }),
      item(4n, 6n, { equippedSlot: 'head' }),
      item(3n, 6n),
    ];
    items.applied.value = true;
    expect(h.live('Q_AFFIX_2,4,9')).toHaveLength(1);
    const affix = h.find('Q_AFFIX_2,4,9');
    expect(affix.filter!({ itemInstanceId: 4n })).toBe(true);
    expect(affix.filter!({ itemInstanceId: 3n })).toBe(false);
  });

  it('keys no affix binding when no instance qualifies', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    const items = h.find('Q_ITEMS_7');
    items.rows.value = [item(3n, 6n)];
    items.applied.value = true;
    expect(h.liveSql().some((s) => s.indexOf('Q_AFFIX') === 0)).toBe(false);
  });

  it('unions owned, vendor, recipe and last-sale template ids and exposes a map', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    h.find('Q_ITEMS_7').rows.value = [item(1n, 20n)];
    h.find('Q_KNOWN_7').rows.value = [{ characterId: 7n, recipeTemplateId: 40n }];
    h.find('Q_KNOWN_7').applied.value = true;
    h.find('Q_ITEMS_7').applied.value = true;
    expect(h.live('Q_RECIPES_40')).toHaveLength(1);
    h.find('Q_RECIPES_40').rows.value = [
      {
        id: 40n,
        outputTemplateId: 21n,
        req1TemplateId: 22n,
        req2TemplateId: 23n,
        req3TemplateId: 24n,
      },
    ];
    h.find('Q_RECIPES_40').applied.value = true;
    h.hub.setVendor({ npcId: 9n, npcName: 'Sabeth' });
    h.find('Q_STOCK_9').rows.value = [{ id: 1n, npcId: 9n, itemTemplateId: 30n, price: 5n }];
    h.find('Q_BUYBACK').rows.value = [{ characterId: 7n, templateId: 31n }];
    const sql = h.liveSql().filter((s) => s.indexOf('Q_TPL') === 0);
    expect(sql.length).toBeGreaterThan(0);
    const key = sql[sql.length - 1];
    expect(key).toBe('Q_TPL_20,21,22,23,24,30,31');
    h.find(key).rows.value = [
      { id: 20n, name: 'Sword' },
      { id: 30n, name: 'Bread' },
    ];
    h.find(key).applied.value = true;
    expect(h.hub.templates.value.get(20n)?.name).toBe('Sword');
    expect(h.hub.templates.value.get(30n)?.name).toBe('Bread');
    expect(h.hub.templates.value.size).toBe(2);
    expect(h.hub.recipes.value.get(40n)?.id).toBe(40n);
  });

  it('keys recipe templates by the discovered ids', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    h.find('Q_KNOWN_7').rows.value = [
      { characterId: 7n, recipeTemplateId: 5n },
      { characterId: 7n, recipeTemplateId: 3n },
    ];
    const recipes = h.find('Q_RECIPES_3,5');
    expect(recipes.filter!({ id: 5n })).toBe(true);
    expect(recipes.filter!({ id: 6n })).toBe(false);
  });
});

describe('createLedgerData: vendor and last sale', () => {
  it('binds the vendor stock only for an open vendor and clears it', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    expect(h.liveSql().some((s) => s.indexOf('Q_STOCK') === 0)).toBe(false);
    expect(h.hub.vendorTarget.value).toBeNull();
    h.hub.setVendor({ npcId: 9n, npcName: 'Sabeth' });
    expect(h.hub.vendorTarget.value).toEqual({ npcId: 9n, npcName: 'Sabeth' });
    const stock = h.find('Q_STOCK_9');
    expect(stock.filter!({ npcId: 9n })).toBe(true);
    expect(stock.filter!({ npcId: 8n })).toBe(false);
    stock.rows.value = [{ id: 1n, npcId: 9n, itemTemplateId: 30n, price: 5n }];
    stock.applied.value = true;
    expect(h.hub.vendorStock.value).toHaveLength(1);
    expect(h.hub.vendorStockApplied.value).toBe(true);
    h.hub.setVendor(null);
    expect(h.hub.vendorTarget.value).toBeNull();
    expect(h.live('Q_STOCK_9')).toHaveLength(0);
    expect(h.hub.vendorStock.value).toEqual([]);
  });

  it('swaps to a new vendor at once', () => {
    const h = make();
    h.connect();
    h.hub.setVendor({ npcId: 9n, npcName: 'Sabeth' });
    h.find('Q_STOCK_9').applied.value = true;
    h.hub.setVendor({ npcId: 4n, npcName: 'Marta' });
    expect(h.live('Q_STOCK_9')).toHaveLength(0);
    expect(h.live('Q_STOCK_4')).toHaveLength(1);
  });

  it('reads the last sale as the single row or null', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    expect(h.hub.lastSale.value).toBeNull();
    h.find('Q_BUYBACK').rows.value = [{ characterId: 7n, templateId: 31n, price: 12n }];
    expect(h.hub.lastSale.value?.price).toBe(12n);
    h.find('Q_BUYBACK').rows.value = [];
    expect(h.hub.lastSale.value).toBeNull();
  });
});

describe('createLedgerData: reducers', () => {
  it('is null unless connected', () => {
    const h = make();
    expect(h.hub.reducers.value).toBeNull();
    h.connect();
    expect(h.hub.reducers.value).not.toBeNull();
    h.status.value = 'reconnecting' as ConnectionStatus;
    expect(h.hub.reducers.value).toBeNull();
    expect(h.hub.connected.value).toBe(false);
  });

  it('forwards each object argument unchanged', async () => {
    const h = make();
    const conn = h.connect();
    const r = h.hub.reducers.value!;
    const craft = {
      characterId: 7n,
      recipeTemplateId: 40n,
      catalystTemplateId: 3n,
      modifier1TemplateId: undefined,
    };
    await r.craftRecipe(craft);
    expect(conn.reducers.craftRecipe).toHaveBeenCalledWith(craft);
    await r.buybackLastSale({ characterId: 7n });
    expect(conn.reducers.buybackLastSale).toHaveBeenCalledWith({ characterId: 7n });
    await r.sellItem({ characterId: 7n, itemInstanceId: 2n, npcId: 9n });
    expect(conn.reducers.sellItem).toHaveBeenCalledWith({
      characterId: 7n,
      itemInstanceId: 2n,
      npcId: 9n,
    });
    await r.unequipItem({ characterId: 7n, slot: 'head' });
    expect(conn.reducers.unequipItem).toHaveBeenCalledWith({ characterId: 7n, slot: 'head' });
    expect(Object.keys(r).sort()).toEqual([...REDUCER_NAMES].sort());
  });
});

describe('createLedgerData: reset and dispose', () => {
  it('reset clears the vendor target', () => {
    const h = make();
    h.connect();
    h.hub.setVendor({ npcId: 9n, npcName: 'Sabeth' });
    h.hub.reset();
    expect(h.hub.vendorTarget.value).toBeNull();
    expect(h.live('Q_STOCK_9')).toHaveLength(0);
  });

  it('dispose stops every binding', () => {
    const h = make();
    h.connect();
    h.activeCharacterId.value = 7n;
    h.hub.setVendor({ npcId: 9n, npcName: 'Sabeth' });
    h.find('Q_ITEMS_7').rows.value = [item(1n, 20n, { equippedSlot: 'head' })];
    expect(h.liveSql().length).toBeGreaterThan(4);
    h.hub.dispose();
    expect(h.liveSql()).toEqual([]);
    h.activeCharacterId.value = 8n;
    expect(h.liveSql()).toEqual([]);
  });
});
