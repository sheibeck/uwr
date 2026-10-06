import { describe, expect, it } from 'vitest';
import { healthPercent, isPartyLeader, partyMembers, partySize } from './party';

const at = (n: number) => ({ microsSinceUnixEpoch: BigInt(n) });

function character(id: bigint, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Hero${id}`,
    className: 'Warrior',
    level: 4n,
    hp: 80n,
    maxHp: 100n,
    mana: 0n,
    maxMana: 0n,
    stamina: 30n,
    maxStamina: 60n,
    ...over,
  };
}

describe('healthPercent', () => {
  it('rounds to a whole percent', () => {
    expect(healthPercent(95n, 100n)).toBe(95);
    expect(healthPercent(1n, 3n)).toBe(33);
  });

  it('is 0 when max is not positive', () => {
    expect(healthPercent(5n, 0n)).toBe(0);
    expect(healthPercent(5n, -3n)).toBe(0);
  });

  it('clamps to 0..100', () => {
    expect(healthPercent(500n, 100n)).toBe(100);
    expect(healthPercent(-5n, 100n)).toBe(0);
  });
});

describe('partySize and isPartyLeader', () => {
  it('counts member rows including the player', () => {
    expect(partySize([{ characterId: 1n }, { characterId: 2n }])).toBe(2);
    expect(partySize([])).toBe(0);
  });

  it('is leader only when the ids match', () => {
    expect(isPartyLeader({ leaderCharacterId: 1n }, 1n)).toBe(true);
    expect(isPartyLeader({ leaderCharacterId: 1n }, 2n)).toBe(false);
    expect(isPartyLeader({ leaderCharacterId: 1n }, null)).toBe(false);
    expect(isPartyLeader(null, 1n)).toBe(false);
  });
});

describe('partyMembers', () => {
  const characters = [
    character(1n, { name: 'Self' }),
    character(2n, { name: 'Bryn', maxMana: 50n, mana: 40n }),
    character(3n, { name: 'Cole' }),
    character(4n, { name: 'Dara' }),
  ];

  it('excludes the player, leader first then join order', () => {
    const members = [
      { id: 10n, characterId: 1n, joinedAt: at(1) },
      { id: 11n, characterId: 4n, joinedAt: at(2) },
      { id: 12n, characterId: 3n, joinedAt: at(3) },
      { id: 13n, characterId: 2n, joinedAt: at(4) },
    ];
    const out = partyMembers({ group: { leaderCharacterId: 2n }, members, characters, selfId: 1n });
    expect(out.map((m) => m.name)).toEqual(['Bryn', 'Dara', 'Cole']);
    expect(out[0].isLeader).toBe(true);
    expect(out[1].isLeader).toBe(false);
  });

  it('lists a leader who is the player nowhere and keeps join order', () => {
    const members = [
      { id: 10n, characterId: 1n, joinedAt: at(1) },
      { id: 12n, characterId: 3n, joinedAt: at(3) },
      { id: 11n, characterId: 4n, joinedAt: at(2) },
    ];
    const out = partyMembers({ group: { leaderCharacterId: 1n }, members, characters, selfId: 1n });
    expect(out.map((m) => m.name)).toEqual(['Dara', 'Cole']);
    expect(out.every((m) => !m.isLeader)).toBe(true);
  });

  it('breaks join-time ties by member id', () => {
    const members = [
      { id: 21n, characterId: 3n, joinedAt: at(5) },
      { id: 20n, characterId: 4n, joinedAt: at(5) },
    ];
    const out = partyMembers({ group: null, members, characters, selfId: 1n });
    expect(out.map((m) => m.name)).toEqual(['Dara', 'Cole']);
  });

  it('picks mana for mana users and stamina otherwise, with health percent', () => {
    const members = [
      { id: 1n, characterId: 2n, joinedAt: at(1) },
      { id: 2n, characterId: 3n, joinedAt: at(2) },
    ];
    const [bryn, cole] = partyMembers({ group: null, members, characters, selfId: null });
    expect(bryn).toMatchObject({ resourceKind: 'mana', resource: 40n, maxResource: 50n, healthPercent: 80, known: true });
    expect(cole).toMatchObject({ resourceKind: 'stamina', resource: 30n, maxResource: 60n });
  });

  it('keeps a member without a character row as unknown with zero vitals', () => {
    const members = [{ id: 1n, characterId: 99n, joinedAt: at(1) }];
    const [m] = partyMembers({ group: { leaderCharacterId: 99n }, members, characters, selfId: 1n });
    expect(m).toMatchObject({ known: false, name: '', hp: 0n, maxHp: 0n, healthPercent: 0, isLeader: true });
  });

  it('returns [] for empty input and a solo player', () => {
    expect(partyMembers({ group: null, members: [], characters, selfId: 1n })).toEqual([]);
    const solo = [{ id: 1n, characterId: 1n, joinedAt: at(1) }];
    expect(partyMembers({ group: { leaderCharacterId: 1n }, members: solo, characters, selfId: 1n })).toEqual([]);
  });

  it('survives a zero max health', () => {
    const members = [{ id: 1n, characterId: 3n, joinedAt: at(1) }];
    const chars = [character(3n, { hp: 0n, maxHp: 0n })];
    expect(partyMembers({ group: null, members, characters: chars, selfId: null })[0].healthPercent).toBe(0);
  });
});
