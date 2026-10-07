import { describe, expect, it, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMockDb } from '../helpers/test-utils';
import {
  MAX_INVENTORY_SLOTS,
  backpackSlotCount,
  craftBatchFits,
  craftSlotsAfter,
  hasBackpackSpace,
  rowsSurelyEmptied,
} from './inventory_rules';
import { EQUIPMENT_SLOTS as VOCAB_SLOTS } from './mechanical_vocabulary';
import {
  EQUIPMENT_SLOTS as ITEMS_SLOTS,
  MAX_INVENTORY_SLOTS as ITEMS_MAX,
  getInventorySlotCount,
  hasInventorySpace,
} from '../helpers/items';

// Records the real table definitions; strict mode derives its accessor allowlist from them.
vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

beforeAll(async () => {
  await import('../schema/tables');
});

function importSpecifiers(fileName: string): string[] {
  const path = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
  const source = readFileSync(path, 'utf8');
  const out: string[] = [];
  const re = /from\s+'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

const fullBag = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: BigInt(100 + i),
    ownerCharacterId: 10n,
    templateId: BigInt(i + 1),
    quantity: 1n,
    ...over,
  }));

describe('MAX_INVENTORY_SLOTS', () => {
  it('is 50, and helpers/items re-exports the same constant', () => {
    expect(MAX_INVENTORY_SLOTS).toBe(50);
    expect(ITEMS_MAX).toBe(MAX_INVENTORY_SLOTS);
  });
});

describe('backpackSlotCount', () => {
  it('counts only rows without a non-empty equippedSlot', () => {
    expect(
      backpackSlotCount([
        { equippedSlot: 'chest' },
        { equippedSlot: undefined },
        { equippedSlot: null },
        { equippedSlot: '' },
      ]),
    ).toBe(3);
  });

  it('counts a stack row once whatever its quantity', () => {
    expect(backpackSlotCount([{ templateId: 1n, equippedSlot: null }])).toBe(1);
    expect(backpackSlotCount([])).toBe(0);
  });
});

describe('hasBackpackSpace', () => {
  const full = Array.from({ length: 50 }, (_, i) => ({ templateId: BigInt(i + 1), equippedSlot: null as string | null }));

  it('a stackable template with an existing non-equipped row fits at 50 used', () => {
    expect(hasBackpackSpace(full, 1n, true)).toBe(true);
  });

  it('an equipped row of that template is not a stack', () => {
    // 50 bag rows of templates 2..51 plus an equipped row of template 1: the bag is full and
    // the equipped row is not a stack to add to.
    const crowded = [
      ...Array.from({ length: 50 }, (_, i) => ({ templateId: BigInt(i + 2), equippedSlot: null as string | null })),
      { templateId: 1n, equippedSlot: 'mainHand' as string | null },
    ];
    expect(backpackSlotCount(crowded)).toBe(50);
    expect(hasBackpackSpace(crowded, 1n, true)).toBe(false);
  });

  it('a non-stackable template fits only below the capacity', () => {
    expect(hasBackpackSpace(full, 1n, false)).toBe(false);
    expect(hasBackpackSpace(full.slice(1), 1n, false)).toBe(true);
    expect(hasBackpackSpace([], 5n, false)).toBe(true);
  });

  it('a stackable template with no stack needs a free slot', () => {
    expect(hasBackpackSpace(full, 999n, true)).toBe(false);
    expect(hasBackpackSpace(full.slice(1), 999n, true)).toBe(true);
  });
});

// Review WR-01: the capacity gate craft_recipe and craft_recipe_count run before any write.
describe('craft room (craftSlotsAfter, craftBatchFits)', () => {
  const row = (templateId: bigint, quantity: bigint, equippedSlot?: string) => ({ templateId, quantity, equippedSlot });
  const filler = (n: number) => Array.from({ length: n }, (_, i) => row(BigInt(1000 + i), 1n));
  const ORE = 1n;
  const CLOTH = 2n;
  const SWORD = { templateId: 10n, stackable: false };
  const POTION = { templateId: 11n, stackable: true };

  it('rowsSurelyEmptied takes the biggest stacks first, so the bound holds for any row order', () => {
    expect(rowsSurelyEmptied([row(ORE, 3n), row(ORE, 5n)], ORE, 3n)).toBe(0);
    expect(rowsSurelyEmptied([row(ORE, 5n), row(ORE, 3n)], ORE, 3n)).toBe(0);
    expect(rowsSurelyEmptied([row(ORE, 3n), row(ORE, 5n)], ORE, 5n)).toBe(1);
    expect(rowsSurelyEmptied([row(ORE, 3n), row(ORE, 5n)], ORE, 8n)).toBe(2);
    expect(rowsSurelyEmptied([row(ORE, 3n, 'mainHand'), row(ORE, 3n)], ORE, 3n)).toBe(1);
    expect(rowsSurelyEmptied([row(CLOTH, 3n)], ORE, 3n)).toBe(0);
  });

  it('a non-stackable output needs one row per craft', () => {
    const rows = [row(ORE, 60n), row(CLOTH, 20n), ...filler(47)];
    const consumes = (n: bigint) => [{ templateId: ORE, count: 3n * n }, { templateId: CLOTH, count: n }];
    expect(craftSlotsAfter(rows, consumes(1n), SWORD, 1n)).toBe(50);
    expect(craftBatchFits(rows, consumes(1n), SWORD, 1n)).toBe(true);
    // 20 crafts empty both the ore (60) and the cloth (20) rows: 49 - 2 + 20.
    expect(craftSlotsAfter(rows, consumes(20n), SWORD, 20n)).toBe(67);
    expect(craftBatchFits(rows, consumes(2n), SWORD, 2n)).toBe(false);
  });

  it('counts the rows the consumed inputs empty', () => {
    // 50 used: the ore and cloth stacks are both emptied by one craft, so two rows are freed.
    const rows = [row(ORE, 3n), row(CLOTH, 1n), ...filler(48)];
    const consumes = [{ templateId: ORE, count: 3n }, { templateId: CLOTH, count: 1n }];
    expect(craftSlotsAfter(rows, consumes, SWORD, 1n)).toBe(49);
    expect(craftBatchFits(rows, consumes, SWORD, 1n)).toBe(true);
  });

  it('a stackable output merges into a surviving stack for free, else takes one row for the batch', () => {
    const full = [row(ORE, 60n), row(POTION.templateId, 2n), ...filler(48)];
    const consumes = [{ templateId: ORE, count: 30n }];
    expect(craftSlotsAfter(full, consumes, POTION, 30n)).toBe(50);
    expect(craftBatchFits(full, consumes, POTION, 30n)).toBe(true);
    const noStack = [row(ORE, 60n), ...filler(49)];
    expect(craftSlotsAfter(noStack, consumes, POTION, 30n)).toBe(51);
    expect(craftBatchFits(noStack, consumes, POTION, 30n)).toBe(false);
    // An equipped row of the output is not a stack.
    const equipped = [row(ORE, 60n), row(POTION.templateId, 1n, 'mainHand'), ...filler(49)];
    expect(craftBatchFits(equipped, consumes, POTION, 30n)).toBe(false);
  });

  it('a stack of the output the inputs consume whole does not count as a merge target', () => {
    const rows = [row(POTION.templateId, 2n), ...filler(49)];
    const consumes = [{ templateId: POTION.templateId, count: 2n }];
    // The stack is emptied (one row freed) and the output makes one new row: 50.
    expect(craftSlotsAfter(rows, consumes, POTION, 1n)).toBe(50);
  });

  it('never grows an over-full bag, but allows a batch that does not grow it', () => {
    const over = [row(ORE, 3n), row(CLOTH, 5n), ...filler(53)];
    expect(craftBatchFits(over, [{ templateId: ORE, count: 3n }, { templateId: CLOTH, count: 1n }], SWORD, 1n)).toBe(true);
    expect(craftBatchFits(over, [{ templateId: ORE, count: 2n }, { templateId: CLOTH, count: 1n }], SWORD, 1n)).toBe(false);
  });
});

describe('EQUIPMENT_SLOTS parity', () => {
  it('mechanical_vocabulary and helpers/items hold the same 12 slots', () => {
    expect(VOCAB_SLOTS).toHaveLength(12);
    expect([...ITEMS_SLOTS].sort()).toEqual([...VOCAB_SLOTS].sort());
  });
});

describe('helpers/items delegation (strict mock db)', () => {
  const template = (id: bigint, over: Record<string, unknown> = {}) => ({
    id,
    name: `Item ${id}`,
    stackable: false,
    ...over,
  });
  const ctxWith = (seed: Record<string, any[]>) => ({ db: createMockDb(seed, { strict: true }) });

  it('a full bag of 50 rows has no space for a non-stackable item', () => {
    const templates = Array.from({ length: 51 }, (_, i) => template(BigInt(i + 1)));
    const ctx = ctxWith({ item_template: templates, item_instance: fullBag(50) });
    expect(getInventorySlotCount(ctx, 10n)).toBe(50);
    expect(hasInventorySpace(ctx, 10n, 51n)).toBe(false);
  });

  it('a stack at 50 still fits more of the same stackable template', () => {
    const templates = Array.from({ length: 50 }, (_, i) => template(BigInt(i + 1), { stackable: i === 0 }));
    const ctx = ctxWith({ item_template: templates, item_instance: fullBag(50) });
    expect(hasInventorySpace(ctx, 10n, 1n)).toBe(true);
  });

  it('an equipped item does not count toward the slot count', () => {
    const rows = [...fullBag(2), { id: 500n, ownerCharacterId: 10n, templateId: 7n, equippedSlot: 'chest', quantity: 1n }];
    const ctx = ctxWith({ item_template: [template(1n)], item_instance: rows });
    expect(getInventorySlotCount(ctx, 10n)).toBe(2);
  });

  it('a missing template returns false', () => {
    const ctx = ctxWith({ item_template: [], item_instance: [] });
    expect(hasInventorySpace(ctx, 10n, 999n)).toBe(false);
  });
});

describe('import pin', () => {
  it('inventory_rules.ts has no import specifier at all', () => {
    expect(importSpecifiers('inventory_rules.ts')).toEqual([]);
  });
});
