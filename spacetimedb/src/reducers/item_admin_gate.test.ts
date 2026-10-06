/**
 * CR-02 (iteration 2 review): grant_item and create_item_template are admin tools. No client calls
 * them, and without a gate any connected identity could mint items or invent item templates with
 * any vendorValue (which the vendor base stock and the recipe generation both read). Real handlers
 * captured from index.ts on the strict mock db: a non-admin is refused with 'Admin only' and nothing
 * is written; an admin still works.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { capturedReducer } from '../helpers/schema_recorder';
import { createMockCtx } from '../helpers/test-utils';

vi.mock('spacetimedb/server', async () =>
  (await import('../helpers/schema_recorder')).createRecordingServerMock(),
);

const stranger = { toHexString: () => 'a'.repeat(64) };
// The database-owner identity in ADMIN_IDENTITIES (data/admin.ts).
const admin = { toHexString: () => 'c200252497b98fff5aab75f8fbc675956b5a12a5b85042ab355d3a05c6ab7d6e' };

let grantItem: (...args: any[]) => any;
let createItemTemplate: (...args: any[]) => any;

beforeAll(async () => {
  await import('../index');
  const handlers = ['grant_item', 'create_item_template'].map((n) => {
    const h = capturedReducer(n);
    if (typeof h !== 'function') {
      throw new Error(`capturedReducer('${n}') is not a function. STOP and report; never edit production code to fix this.`);
    }
    return h as (...args: any[]) => any;
  });
  [grantItem, createItemTemplate] = handlers;
}, 120_000);

const rows = (ctx: any, table: string): any[] => ctx.db._tables[table] ?? [];

function newCtx(sender: any) {
  return createMockCtx({
    seed: {
      player: [{ id: sender, userId: 7n, activeCharacterId: 1n }],
      character: [{ id: 1n, ownerUserId: 7n, name: 'Elfansworth', level: 3n, gold: 10n, locationId: 10n }],
      item_template: [
        { id: 5n, name: 'Iron Shard', slot: 'material', stackable: true, vendorValue: 2n, tier: 1n, isJunk: false },
      ],
      item_instance: [],
      item_affix: [],
      event_private: [],
    },
    sender,
    timestampMicros: 1_700_000_000_000_000n,
    strict: true,
  });
}

const templateArgs = (over: Record<string, unknown> = {}) => ({
  name: 'Forged Gold Bar',
  slot: 'resource',
  armorType: 'none',
  rarity: 'common',
  tier: 1n,
  isJunk: false,
  vendorValue: 18_446_744_073_709_551_615n,
  requiredLevel: 1n,
  allowedClasses: 'any',
  strBonus: 0n,
  dexBonus: 0n,
  chaBonus: 0n,
  wisBonus: 0n,
  intBonus: 0n,
  hpBonus: 0n,
  manaBonus: 0n,
  armorClassBonus: 0n,
  weaponBaseDamage: 0n,
  weaponDps: 0n,
  stackable: true,
  ...over,
});

describe('grant_item is admin only', () => {
  it('refuses a non-admin owner of the character and writes nothing', () => {
    const ctx = newCtx(stranger);
    expect(() => grantItem(ctx, { characterId: 1n, templateId: 5n })).toThrow('Admin only');
    expect(rows(ctx, 'item_instance')).toHaveLength(0);
    expect(rows(ctx, 'event_private')).toHaveLength(0);
  });

  it('still grants one unit to an admin', () => {
    const ctx = newCtx(admin);
    grantItem(ctx, { characterId: 1n, templateId: 5n });
    const owned = rows(ctx, 'item_instance').filter((i) => i.ownerCharacterId === 1n && i.templateId === 5n);
    expect(owned).toHaveLength(1);
    expect(owned[0].quantity).toBe(1n);
  });
});

describe('create_item_template is admin only', () => {
  it('refuses a non-admin and inserts no template', () => {
    const ctx = newCtx(stranger);
    expect(() => createItemTemplate(ctx, templateArgs())).toThrow('Admin only');
    expect(rows(ctx, 'item_template')).toHaveLength(1);
  });

  it('is refused before the slot check, so a bad slot from a non-admin also reads Admin only', () => {
    const ctx = newCtx(stranger);
    expect(() => createItemTemplate(ctx, templateArgs({ slot: 'nonsense' }))).toThrow('Admin only');
    expect(rows(ctx, 'item_template')).toHaveLength(1);
  });

  it('still creates a template for an admin', () => {
    const ctx = newCtx(admin);
    createItemTemplate(ctx, templateArgs({ vendorValue: 7n }));
    const made = rows(ctx, 'item_template').find((t) => t.name === 'Forged Gold Bar');
    expect(made).toBeDefined();
    expect(made.vendorValue).toBe(7n);
    expect(rows(ctx, 'item_template')).toHaveLength(2);
  });
});
