import { describe, expect, it } from 'vitest';
import { allyResetNeeded, allyTargetFor } from './ally';

const hp = (map: Record<string, bigint>) => (id: bigint): bigint | null => map[String(id)] ?? null;

describe('allyTargetFor', () => {
  const participants = [
    { characterId: 1n, status: 'active' },
    { characterId: 8n, status: 'active' },
    { characterId: 9n, status: 'dead' },
  ];
  const base = { targetRule: 'single_ally', selectedId: 8n, participants, hpOf: hp({ '1': 40n, '8': 30n, '9': 0n }) };

  it('sends an active ally with HP above 0', () => {
    expect(allyTargetFor(base)).toBe(8n);
  });

  it('omits a dead ally', () => {
    expect(allyTargetFor({ ...base, selectedId: 9n })).toBeUndefined();
    expect(
      allyTargetFor({ ...base, participants: [{ characterId: 8n, status: 'dead' }] }),
    ).toBeUndefined();
  });

  it('omits an ally at 0 HP or with unknown HP', () => {
    expect(allyTargetFor({ ...base, hpOf: hp({ '8': 0n }) })).toBeUndefined();
    expect(allyTargetFor({ ...base, hpOf: hp({}) })).toBeUndefined();
  });

  it('omits an ally with no participant row', () => {
    expect(allyTargetFor({ ...base, selectedId: 77n, hpOf: hp({ '77': 10n }) })).toBeUndefined();
  });

  it('omits the id for every rule other than single_ally', () => {
    for (const targetRule of ['single_enemy', 'self', 'all_allies', 'all_party', 'lowest_hp_ally', 'corpse', '']) {
      expect(allyTargetFor({ ...base, targetRule })).toBeUndefined();
    }
  });

  it('omits the id when nothing is selected', () => {
    expect(allyTargetFor({ ...base, selectedId: null })).toBeUndefined();
  });

  it("sends the player's own id when the player is selected and alive", () => {
    expect(allyTargetFor({ ...base, selectedId: 1n })).toBe(1n);
    expect(allyTargetFor({ ...base, selectedId: 1n, hpOf: hp({ '1': 0n }) })).toBeUndefined();
  });
});

describe('allyResetNeeded', () => {
  const base = {
    selectedId: 8n as bigint | null,
    selfId: 1n as bigint | null,
    active: true,
    participants: [{ characterId: 1n }, { characterId: 8n }],
    partyIds: new Set<bigint>([1n, 8n]),
  };

  it('resets when the fight is over', () => {
    expect(allyResetNeeded({ ...base, active: false })).toBe(true);
    expect(allyResetNeeded({ ...base, active: false, selectedId: null })).toBe(true);
  });

  it('does not reset when nothing or the player is selected', () => {
    expect(allyResetNeeded({ ...base, selectedId: null })).toBe(false);
    expect(allyResetNeeded({ ...base, selectedId: 1n })).toBe(false);
    expect(allyResetNeeded({ ...base, selectedId: 1n, participants: [], partyIds: new Set() })).toBe(false);
  });

  it('resets when the selected ally has no participant row', () => {
    expect(allyResetNeeded({ ...base, participants: [{ characterId: 1n }] })).toBe(true);
  });

  it('resets when the selected ally is no longer in the party', () => {
    expect(allyResetNeeded({ ...base, partyIds: new Set<bigint>([1n]) })).toBe(true);
  });

  it('keeps a dead ally selected while the row and party membership remain', () => {
    expect(allyResetNeeded(base)).toBe(false);
  });
});
