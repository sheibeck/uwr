import { describe, expect, it } from 'vitest';
import { allyResetNeeded, allyTargetFor, peaceAllyResetNeeded, peaceAllyTargetFor } from './ally';

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

  it('out of combat it never resets: that case belongs to peaceAllyResetNeeded (owner 2026-10-08)', () => {
    expect(allyResetNeeded({ ...base, active: false })).toBe(false);
    expect(allyResetNeeded({ ...base, active: false, selectedId: null })).toBe(false);
    expect(allyResetNeeded({ ...base, active: false, participants: [], partyIds: new Set() })).toBe(false);
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

// Owner 2026-10-08: tap a party member to target them, everywhere. Out of combat the selection
// follows the shared rule (@game-data/ally_target_rules): same party, online, here, standing.
const self = { id: 1n, groupId: 5n as bigint | null | undefined, locationId: 10n };
const bo = (over: Record<string, unknown> = {}) => ({
  id: 8n,
  name: 'Bo',
  groupId: 5n as bigint | null | undefined,
  locationId: 10n,
  online: true,
  hp: 30n,
  ...over,
});

describe('peaceAllyResetNeeded', () => {
  const base = { selectedId: 8n as bigint | null, self, target: bo() };

  it('keeps an ally who is in the party, online and here', () => {
    expect(peaceAllyResetNeeded(base)).toBe(false);
  });

  it('keeps nothing selected, you selected, and a missing self', () => {
    expect(peaceAllyResetNeeded({ ...base, selectedId: null })).toBe(false);
    expect(peaceAllyResetNeeded({ ...base, selectedId: 1n, target: undefined })).toBe(false);
    expect(peaceAllyResetNeeded({ ...base, self: null })).toBe(false);
  });

  it('keeps a fallen ally selected, as in a fight', () => {
    expect(peaceAllyResetNeeded({ ...base, target: bo({ hp: 0n }) })).toBe(false);
  });

  it('resets when the row is missing, or the ally is not in your party', () => {
    expect(peaceAllyResetNeeded({ ...base, target: undefined })).toBe(true);
    expect(peaceAllyResetNeeded({ ...base, target: null })).toBe(true);
    expect(peaceAllyResetNeeded({ ...base, target: bo({ groupId: 6n }) })).toBe(true);
    expect(peaceAllyResetNeeded({ ...base, self: { ...self, groupId: undefined } })).toBe(true);
  });

  it('resets when the ally is offline or elsewhere', () => {
    expect(peaceAllyResetNeeded({ ...base, target: bo({ online: false }) })).toBe(true);
    expect(peaceAllyResetNeeded({ ...base, target: bo({ locationId: 11n }) })).toBe(true);
  });
});

describe('peaceAllyTargetFor', () => {
  const base = { targetRule: 'single_ally', selectedId: 8n as bigint | null, self, target: bo() };

  it('sends a selected ally who is ok for single_ally', () => {
    expect(peaceAllyTargetFor(base)).toBe(8n);
  });

  it('omits the id for every other rule', () => {
    for (const targetRule of ['single_enemy', 'self', 'all_allies', 'all_party', 'lowest_hp_ally', 'corpse', '']) {
      expect(peaceAllyTargetFor({ ...base, targetRule })).toBeUndefined();
    }
  });

  it('omits the id with nothing selected or you selected', () => {
    expect(peaceAllyTargetFor({ ...base, selectedId: null })).toBeUndefined();
    expect(peaceAllyTargetFor({ ...base, selectedId: 1n })).toBeUndefined();
    expect(peaceAllyTargetFor({ ...base, self: null })).toBeUndefined();
  });

  it('omits the id for a fallen ally and for every reset reason', () => {
    expect(peaceAllyTargetFor({ ...base, target: bo({ hp: 0n }) })).toBeUndefined();
    expect(peaceAllyTargetFor({ ...base, target: undefined })).toBeUndefined();
    expect(peaceAllyTargetFor({ ...base, target: bo({ groupId: 6n }) })).toBeUndefined();
    expect(peaceAllyTargetFor({ ...base, target: bo({ online: false }) })).toBeUndefined();
    expect(peaceAllyTargetFor({ ...base, target: bo({ locationId: 11n }) })).toBeUndefined();
  });
});
