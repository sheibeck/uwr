import { describe, it, expect, vi } from 'vitest';

// Mock spacetimedb/server
vi.mock('spacetimedb/server', () => ({
  SenderError: class extends Error { constructor(msg: string) { super(msg); } },
  t: {},
}));

// Mock data deps
vi.mock('../data/renown_data', () => ({
  RENOWN_PERK_POOLS: {
    2: [
      { key: 'iron_will', name: 'Iron Will', type: 'passive', description: '+25 max HP', effect: { maxHp: 25n }, domain: 'combat' },
      { key: 'keen_eye', name: 'Keen Eye', type: 'passive', description: '10% double gather', effect: { gatherDoubleChance: 10 }, domain: 'crafting' },
      { key: 'smooth_talker', name: 'Smooth Talker', type: 'passive', description: '+15% affinity', effect: { npcAffinityGainBonus: 15 }, domain: 'social' },
    ],
  },
  RENOWN_RANKS: [
    { rank: 1, name: 'Unsung', threshold: 0n },
    { rank: 2, name: 'Whispered', threshold: 100n },
  ],
  calculateRankFromPoints: (points: bigint) => points >= 100n ? 2 : 1,
  ACHIEVEMENT_DEFINITIONS: {},
}));

vi.mock('../helpers/events', () => ({
  appendSystemMessage: vi.fn(),
  appendPrivateEvent: vi.fn(),
  appendWorldEvent: vi.fn(),
}));

vi.mock('../helpers/items', () => ({
  ensureDefaultHotbar: vi.fn(() => ({ id: 1n })),
}));

import { createMockCtx } from '../helpers/test-utils';
import {
  chooseRenownPerkLogic,
} from './renown_perk';

// ============================================================================
// choose_renown_perk logic tests
// ============================================================================

function makeCtx(opts?: any) {
  const sender = { toHexString: () => 'player-hex' };
  return createMockCtx({ sender, ...(opts ?? {}) });
}

describe('chooseRenownPerkLogic', () => {
  it('inserts ability_template with source=Renown for active perk (non-empty kind)', () => {
    const ctx = makeCtx({
      seed: {
        character: [{ id: 1n, ownerUserId: { toHexString: () => 'player-hex' }, name: 'Hero', level: 5n }],
        pending_renown_perk: [
          {
            id: 10n,
            characterId: 1n,
            rank: 2n,
            name: 'Void Strike',
            description: 'A strike from the void.',
            kind: 'damage',
            targetRule: 'single_enemy',
            resourceType: 'stamina',
            resourceCost: 5n,
            castSeconds: 0n,
            cooldownSeconds: 60n,
            scaling: 'str',
            value1: 20n,
            perkEffectJson: undefined,
            perkDomain: 'combat',
            createdAt: { microsSinceUnixEpoch: 1000n },
          },
          {
            id: 11n,
            characterId: 1n,
            rank: 2n,
            name: 'Iron Will',
            description: '+25 max HP',
            kind: '',
            targetRule: 'self',
            resourceType: 'none',
            resourceCost: 0n,
            castSeconds: 0n,
            cooldownSeconds: 0n,
            scaling: 'none',
            value1: 0n,
            perkEffectJson: '{"maxHp":25}',
            perkDomain: 'combat',
            createdAt: { microsSinceUnixEpoch: 1000n },
          },
        ],
      },
    });

    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: 10n });

    const abilityTemplates = ctx.db.ability_template._rows();
    expect(abilityTemplates).toHaveLength(1);
    expect(abilityTemplates[0].source).toBe('Renown');
    expect(abilityTemplates[0].name).toBe('Void Strike');
    expect(abilityTemplates[0].kind).toBe('damage');
  });

  it('deletes all pending_renown_perk rows for character after choice', () => {
    const ctx = makeCtx({
      seed: {
        character: [{ id: 1n, ownerUserId: { toHexString: () => 'player-hex' }, name: 'Hero', level: 5n }],
        pending_renown_perk: [
          {
            id: 10n, characterId: 1n, rank: 2n, name: 'Void Strike', description: 'A strike',
            kind: 'damage', targetRule: 'single_enemy', resourceType: 'stamina',
            resourceCost: 5n, castSeconds: 0n, cooldownSeconds: 60n, scaling: 'str',
            value1: 20n, perkEffectJson: undefined, perkDomain: 'combat',
            createdAt: { microsSinceUnixEpoch: 1000n },
          },
          {
            id: 11n, characterId: 1n, rank: 2n, name: 'Iron Will', description: '+25 HP',
            kind: '', targetRule: 'self', resourceType: 'none',
            resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n, scaling: 'none',
            value1: 0n, perkEffectJson: '{"maxHp":25}', perkDomain: 'combat',
            createdAt: { microsSinceUnixEpoch: 1000n },
          },
          {
            id: 12n, characterId: 1n, rank: 2n, name: 'Merchant Charm', description: '+10% sales',
            kind: '', targetRule: 'self', resourceType: 'none',
            resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n, scaling: 'none',
            value1: 0n, perkEffectJson: '{"vendorSellBonus":10}', perkDomain: 'social',
            createdAt: { microsSinceUnixEpoch: 1000n },
          },
        ],
      },
    });

    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: 10n });

    const remaining = ctx.db.pending_renown_perk._rows().filter((r: any) => r.characterId === 1n);
    expect(remaining).toHaveLength(0);
  });

  it('inserts renown_perk row for passive perk (perkEffectJson set, kind empty)', () => {
    const ctx = makeCtx({
      seed: {
        character: [{ id: 1n, ownerUserId: { toHexString: () => 'player-hex' }, name: 'Hero', level: 5n }],
        pending_renown_perk: [
          {
            id: 10n, characterId: 1n, rank: 2n, name: 'Iron Will', description: '+25 max HP',
            kind: '', targetRule: 'self', resourceType: 'none',
            resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n, scaling: 'none',
            value1: 0n, perkEffectJson: '{"maxHp":25}', perkDomain: 'combat',
            createdAt: { microsSinceUnixEpoch: 1000n },
          },
        ],
      },
    });

    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: 10n });

    const renownPerks = ctx.db.renown_perk._rows();
    expect(renownPerks).toHaveLength(1);
    expect(renownPerks[0].characterId).toBe(1n);
    expect(renownPerks[0].rank).toBe(2n);
    // ability_template should NOT be created for passive perks
    expect(ctx.db.ability_template._rows()).toHaveLength(0);
  });

  it('rejects if no pending_renown_perk rows exist for character', () => {
    const ctx = makeCtx({
      seed: {
        character: [{ id: 1n, ownerUserId: { toHexString: () => 'player-hex' }, name: 'Hero', level: 5n }],
      },
    });

    // Should not throw but should not insert anything
    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: 99n });

    expect(ctx.db.ability_template._rows()).toHaveLength(0);
    expect(ctx.db.renown_perk._rows()).toHaveLength(0);
  });

  it('rejects if perkId not found in pending rows for character', () => {
    const ctx = makeCtx({
      seed: {
        character: [{ id: 1n, ownerUserId: { toHexString: () => 'player-hex' }, name: 'Hero', level: 5n }],
        pending_renown_perk: [
          {
            id: 10n, characterId: 1n, rank: 2n, name: 'Iron Will', description: '+25 HP',
            kind: '', targetRule: 'self', resourceType: 'none',
            resourceCost: 0n, castSeconds: 0n, cooldownSeconds: 0n, scaling: 'none',
            value1: 0n, perkEffectJson: '{"maxHp":25}', perkDomain: 'combat',
            createdAt: { microsSinceUnixEpoch: 1000n },
          },
        ],
      },
    });

    // perkId 999 doesn't exist
    chooseRenownPerkLogic(ctx, { characterId: 1n, perkId: 999n });

    expect(ctx.db.ability_template._rows()).toHaveLength(0);
    expect(ctx.db.renown_perk._rows()).toHaveLength(0);
  });
});
