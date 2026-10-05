import type { Character, Location, PendingSkill, Region, WorldState } from '../module_bindings/types';

export type TimeOfDay = 'day' | 'night';

export const UNKNOWN_PLACE = 'Unknown place';

// Space, U+00B7 MIDDLE DOT, space.
const SEP = ' · ';

export interface FrameView {
  characterName: string;
  avatarInitial: string;
  /** 'Lv 6 · Wizard' */
  classLine: string;
  /** 'Lv 6 · Elf Wizard' */
  accountLine: string;
  hp: bigint;
  maxHp: bigint;
  mana: bigint;
  maxMana: bigint;
  stamina: bigint;
  maxStamina: bigint;
  /** 'Region · Location' or UNKNOWN_PLACE */
  placeLabel: string;
  /** 'Location' or UNKNOWN_PLACE */
  locationName: string;
  timeOfDay: TimeOfDay | null;
  levelUp: boolean;
  newSkill: boolean;
}

export function describePlace(
  locationId: bigint | null | undefined,
  locations: readonly Location[],
  regions: readonly Region[],
): { placeLabel: string; locationName: string } {
  const unknown = { placeLabel: UNKNOWN_PLACE, locationName: UNKNOWN_PLACE };
  if (locationId === null || locationId === undefined) return unknown;
  const location = locations.find((l) => l.id === locationId);
  if (!location) return unknown;
  const region = regions.find((r) => r.id === location.regionId);
  if (!region) return unknown;
  return { placeLabel: `${region.name}${SEP}${location.name}`, locationName: location.name };
}

export function timeOfDay(rows: readonly WorldState[]): TimeOfDay | null {
  const row = rows[0];
  if (!row) return null;
  return row.isNight ? 'night' : 'day';
}

export function classLine(c: Pick<Character, 'level' | 'className'>): string {
  return `Lv ${c.level}${SEP}${c.className}`;
}

export function accountLine(c: Pick<Character, 'level' | 'race' | 'className'>): string {
  return `Lv ${c.level}${SEP}${c.race} ${c.className}`;
}

export function avatarInitial(name: string): string {
  const first = Array.from(name)[0];
  return first ? first.toUpperCase() : '?';
}

export function sortCharacters(chars: readonly Character[]): Character[] {
  return [...chars].sort((a, b) => {
    const at = a.createdAt.microsSinceUnixEpoch;
    const bt = b.createdAt.microsSinceUnixEpoch;
    if (at !== bt) return at < bt ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}

export function buildFrameView(input: {
  character: Character;
  locations: readonly Location[];
  regions: readonly Region[];
  worldState: readonly WorldState[];
  pendingSkills: readonly PendingSkill[];
}): FrameView {
  const { character } = input;
  const place = describePlace(character.locationId, input.locations, input.regions);
  return {
    characterName: character.name,
    avatarInitial: avatarInitial(character.name),
    classLine: classLine(character),
    accountLine: accountLine(character),
    hp: character.hp,
    maxHp: character.maxHp,
    mana: character.mana,
    maxMana: character.maxMana,
    stamina: character.stamina,
    maxStamina: character.maxStamina,
    placeLabel: place.placeLabel,
    locationName: place.locationName,
    timeOfDay: timeOfDay(input.worldState),
    levelUp: character.pendingLevels > 0n,
    newSkill: input.pendingSkills.some((s) => s.characterId === character.id),
  };
}
