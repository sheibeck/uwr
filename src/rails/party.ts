// Party cards for the vitals rail and the mobile strip (47-UI-SPEC "Party block", CON-03).
// Inputs are structural subsets of the generated GroupMember, Group and Character rows.
import { barFraction } from '../frame/vitals';
import { travelEffectDiscount, travelStaminaCost } from '@game-data/travel_config';

export interface PartyMemberView {
  id: bigint;
  name: string;
  className: string;
  level: bigint;
  hp: bigint;
  maxHp: bigint;
  resource: bigint;
  maxResource: bigint;
  resourceKind: 'mana' | 'stamina';
  /** The member's own stamina (separate from the resource bar, which shows mana for casters). */
  stamina: bigint;
  maxStamina: bigint;
  /** Stamina is below the member's within-region travel cost: they cannot travel at all. */
  lowStamina: boolean;
  isLeader: boolean;
  /** False when the member has no readable character row (unknown or offline vitals). */
  known: boolean;
  healthPercent: number;
  /** The character row's online flag; anything but a literal true (missing, unknown row) is false. */
  online: boolean;
  /** The member row's "Travel with leader" setting (true when the row does not carry it). */
  followLeader: boolean;
  /** Where the member stands; null when their character row is unknown. */
  locationId: bigint | null;
}

/** Whole-number health percent, clamped 0 to 100; 0 when max is not positive. */
export function healthPercent(hp: bigint, maxHp: bigint): number {
  return Math.round(barFraction(hp, maxHp) * 100);
}

/** Member rows including the player. */
export function partySize(members: readonly { characterId: bigint }[]): number {
  return members.length;
}

export function isPartyLeader(
  group: { leaderCharacterId: bigint } | null,
  selfId: bigint | null,
): boolean {
  if (group === null || selfId === null) return false;
  return group.leaderCharacterId === selfId;
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The member's within-region travel cost from the shared stamina rule (never re-derived here).
function withinRegionCost(
  member: {
    id: bigint;
    racialTravelCostIncrease?: bigint | null;
    racialTravelCostDiscount?: bigint | null;
  },
  effects: readonly {
    characterId: bigint;
    effectType: string;
    roundsRemaining: bigint;
    magnitude: bigint | number;
  }[],
): bigint {
  return travelStaminaCost({
    crossRegion: false,
    racialIncrease: member.racialTravelCostIncrease,
    racialDiscount: member.racialTravelCostDiscount,
    effectDiscount: travelEffectDiscount(effects.filter((effect) => effect.characterId === member.id)),
  });
}

type EffectRow = {
  characterId: bigint;
  effectType: string;
  roundsRemaining: bigint;
  magnitude: bigint | number;
};

/** Stamina below the character's own within-region travel cost (their own travel_discount effects only). */
export function lowStaminaFor(
  character: {
    id: bigint;
    stamina: bigint;
    racialTravelCostIncrease?: bigint | null;
    racialTravelCostDiscount?: bigint | null;
  },
  effects: readonly EffectRow[],
): boolean {
  return character.stamina < withinRegionCost(character, effects);
}

/** Every member except the player: leader first, then by join order, ties by member id. */
export function partyMembers(input: {
  group: { leaderCharacterId: bigint } | null;
  members: readonly {
    id: bigint;
    characterId: bigint;
    joinedAt: { microsSinceUnixEpoch: bigint };
    followLeader?: boolean;
  }[];
  characters: readonly {
    id: bigint;
    name: string;
    className: string;
    level: bigint;
    hp: bigint;
    maxHp: bigint;
    mana: bigint;
    maxMana: bigint;
    stamina: bigint;
    maxStamina: bigint;
    racialTravelCostIncrease?: bigint | null;
    racialTravelCostDiscount?: bigint | null;
    online?: boolean | null;
    locationId?: bigint | null;
  }[];
  selfId: bigint | null;
  /** The party's active effect rows (game.effects); only a member's own rows lower that member's cost. */
  effects?: readonly {
    characterId: bigint;
    effectType: string;
    roundsRemaining: bigint;
    magnitude: bigint | number;
  }[];
}): PartyMemberView[] {
  const { group, members, characters, selfId } = input;
  const effects = input.effects ?? [];
  const leaderId = group === null ? null : group.leaderCharacterId;
  const byId = new Map<bigint, (typeof characters)[number]>();
  for (const character of characters) byId.set(character.id, character);

  const others = members.filter((member) => selfId === null || member.characterId !== selfId);
  others.sort((a, b) => {
    const aLeader = leaderId !== null && a.characterId === leaderId;
    const bLeader = leaderId !== null && b.characterId === leaderId;
    if (aLeader !== bLeader) return aLeader ? -1 : 1;
    const joined = compareBigint(a.joinedAt.microsSinceUnixEpoch, b.joinedAt.microsSinceUnixEpoch);
    if (joined !== 0) return joined;
    return compareBigint(a.id, b.id);
  });

  return others.map((member): PartyMemberView => {
    const isLeader = leaderId !== null && member.characterId === leaderId;
    const c = byId.get(member.characterId);
    if (!c) {
      return {
        id: member.characterId,
        name: '',
        className: '',
        level: 0n,
        hp: 0n,
        maxHp: 0n,
        resource: 0n,
        maxResource: 0n,
        resourceKind: 'stamina',
        stamina: 0n,
        maxStamina: 0n,
        lowStamina: false,
        isLeader,
        known: false,
        healthPercent: 0,
        online: false,
        followLeader: member.followLeader ?? true,
        locationId: null,
      };
    }
    const usesMana = c.maxMana > 0n;
    return {
      id: c.id,
      name: c.name,
      className: c.className,
      level: c.level,
      hp: c.hp,
      maxHp: c.maxHp,
      resource: usesMana ? c.mana : c.stamina,
      maxResource: usesMana ? c.maxMana : c.maxStamina,
      resourceKind: usesMana ? 'mana' : 'stamina',
      stamina: c.stamina,
      maxStamina: c.maxStamina,
      lowStamina: lowStaminaFor(c, effects),
      isLeader,
      known: true,
      healthPercent: healthPercent(c.hp, c.maxHp),
      online: c.online === true,
      followLeader: member.followLeader ?? true,
      locationId: c.locationId ?? null,
    };
  });
}
