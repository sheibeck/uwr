import { describe, expect, it, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMockDb } from '../helpers/test-utils';
import {
  MAX_INVENTORY_SLOTS,
  backpackSlotCount,
  hasBackpackSpace,
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
