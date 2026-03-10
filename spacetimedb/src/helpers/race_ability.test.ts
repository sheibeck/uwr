import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SpacetimeDB server module
vi.mock('spacetimedb/server', () => ({
  SenderError: class SenderError extends Error {
    constructor(msg: string) { super(msg); }
  },
}));

// Mock spacetimedb (Timestamp, ScheduleAt may be used transitively)
vi.mock('spacetimedb', () => ({
  Timestamp: { fromMicros: (m: bigint) => ({ microsSinceUnixEpoch: m }) },
  ScheduleAt: { time: (m: bigint) => ({ tag: 'Time', value: { microsSinceUnixEpoch: m } }) },
}));

// Mock events used transitively
vi.mock('./events', () => ({
  appendPrivateEvent: vi.fn(),
  appendGroupEvent: vi.fn(),
  logPrivateAndGroup: vi.fn(),
  fail: vi.fn(),
}));

import { grantRaceAbility } from './character';
import { RACE_DATA } from '../data/races';
import { createMockCtx } from './test-utils';

// ============================================================================
// grantRaceAbility tests
// ============================================================================

describe('grantRaceAbility', () => {
  const humanRaceData = RACE_DATA.find(r => r.name === 'Human')!;
  const trollRaceData = RACE_DATA.find(r => r.name === 'Troll')!;

  function makeCtx(existingAbilities: any[] = []) {
    return createMockCtx({
      seed: {
        character: [{ id: 1n, ownerUserId: 10n, hp: 100n, maxHp: 100n, name: 'TestChar', race: 'Human' }],
        ability_template: existingAbilities,
      },
    });
  }

  const character = { id: 1n, ownerUserId: 10n, name: 'TestChar', race: 'Human' };

  it('inserts ability_template with source=Race and correct abilityKey for Human', () => {
    const ctx = makeCtx();
    grantRaceAbility(ctx, character, humanRaceData);

    const abilities = ctx.db.ability_template._rows();
    expect(abilities).toHaveLength(1);

    const ability = abilities[0];
    expect(ability.source).toBe('Race');
    expect(ability.abilityKey).toBe('race_human_diplomatic_poise');
    expect(ability.characterId).toBe(1n);
    expect(ability.name).toBe('Diplomatic Poise');
    expect(ability.kind).toBe('buff');
    expect(ability.isGenerated).toBe(false);
    expect(ability.levelRequired).toBe(1n);
  });

  it('inserts ability_template with source=Race and correct abilityKey for Troll (hot kind)', () => {
    const ctx = makeCtx();
    const trollChar = { id: 1n, ownerUserId: 10n, name: 'TrollChar', race: 'Troll' };
    grantRaceAbility(ctx, trollChar, trollRaceData);

    const abilities = ctx.db.ability_template._rows();
    expect(abilities).toHaveLength(1);
    expect(abilities[0].source).toBe('Race');
    expect(abilities[0].abilityKey).toBe('race_troll_regeneration');
    expect(abilities[0].kind).toBe('hot');
  });

  it('is idempotent — does not insert duplicate if ability with same abilityKey exists', () => {
    const existingAbility = {
      id: 5n,
      characterId: 1n,
      abilityKey: 'race_human_diplomatic_poise',
      source: 'Race',
      name: 'Diplomatic Poise',
      kind: 'buff',
    };
    const ctx = makeCtx([existingAbility]);
    grantRaceAbility(ctx, character, humanRaceData);

    // Should still only have 1 ability (not duplicate)
    const abilities = ctx.db.ability_template._rows();
    expect(abilities).toHaveLength(1);
  });

  it('skips characters whose race is not in RACE_DATA (LLM-generated custom races)', () => {
    const customRaceData = {
      name: 'CustomRace',
      abilityName: 'Unknown Power',
      abilityDescription: 'Some custom ability',
      abilityKind: 'buff',
      abilityTargetRule: 'self',
      abilityCooldownSeconds: 300n,
      abilityValue: 5n,
      abilityKey: 'race_custom_unknown_power',
    };
    const ctx = makeCtx();
    const customChar = { id: 1n, ownerUserId: 10n, name: 'CustomChar', race: 'CustomRace' };

    // grantRaceAbility should skip since 'CustomRace' is not in RACE_DATA
    grantRaceAbility(ctx, customChar, customRaceData as any);

    // No ability inserted (custom race, not in RACE_DATA)
    const abilities = ctx.db.ability_template._rows();
    expect(abilities).toHaveLength(0);
  });

  it('inserts with correct resource type and cost (none, 0n)', () => {
    const ctx = makeCtx();
    grantRaceAbility(ctx, character, humanRaceData);

    const ability = ctx.db.ability_template._rows()[0];
    expect(ability.resourceType).toBe('none');
    expect(ability.resourceCost).toBe(0n);
  });

  it('inserts with cooldown from race data', () => {
    const ctx = makeCtx();
    grantRaceAbility(ctx, character, humanRaceData);

    const ability = ctx.db.ability_template._rows()[0];
    expect(ability.cooldownSeconds).toBe(300n);
  });
});
