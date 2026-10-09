// Nearby rows for the context rail (47-UI-SPEC "Nearby", CON-04; 'Also here' since 51.3.1.1-19).
// Order: NPCs, bind stone, objects, players; alphabetical inside a group, ties by id.
// Objects have no subscribed source today (research Q3, A7), so the list defaults to [].
// Resources are density pools now (51.3.1.1-19 resource cards, pools.ts): the node kind is gone.
// Offline characters drop out of Nearby (51.1 CONTEXT Area 2): a player is listed only when the
// character row says online (exactly true), so presence here is shown by inclusion, with no dot
// (UI-SPEC B16). A listed party member gets a party hint instead of the level.

export type NearbyKind = 'npc' | 'bindStone' | 'object' | 'player';

export interface NearbyRow {
  kind: NearbyKind;
  id: bigint;
  name: string;
  hint: string;
  /** True for vendor NPCs: the row gets a Trade action. */
  vendor: boolean;
  /** True for the bind stone row of a place the character is bound to. */
  bound: boolean;
  /** Player level for player rows. */
  level: bigint | null;
}

const KIND_ORDER: Record<NearbyKind, number> = { npc: 0, bindStone: 1, object: 2, player: 3 };

export function nearbyRows(input: {
  npcs: readonly { id: bigint; name: string; npcType: string }[];
  players: readonly { id: bigint; name: string; level: bigint; online?: boolean | null }[];
  /** Character ids of your party members: their hint marks the party. */
  partyIds?: ReadonlySet<bigint>;
  objects?: readonly { id: bigint; name: string }[];
  /** The current place has a bind stone: the row and whether the character is bound here. */
  bindStone?: { placeName: string; bound: boolean } | null;
  selfId: bigint | null;
}): NearbyRow[] {
  const { npcs, players, selfId } = input;
  const objects = input.objects ?? [];
  const rows: NearbyRow[] = [];

  for (const npc of npcs) {
    rows.push({
      kind: 'npc',
      id: npc.id,
      name: npc.name,
      hint: 'NPC',
      vendor: npc.npcType === 'vendor',
      bound: false,
      level: null,
    });
  }
  if (input.bindStone) {
    rows.push({
      kind: 'bindStone',
      id: 0n,
      name: 'Bind stone',
      hint: input.bindStone.bound ? 'Bound here' : '',
      vendor: false,
      bound: input.bindStone.bound,
      level: null,
    });
  }
  for (const object of objects) {
    rows.push({
      kind: 'object',
      id: object.id,
      name: object.name,
      hint: '',
      vendor: false,
      bound: false,
      level: null,
    });
  }
  for (const player of players) {
    if (selfId !== null && player.id === selfId) continue;
    if (player.online !== true) continue;
    rows.push({
      kind: 'player',
      id: player.id,
      name: player.name,
      hint: input.partyIds?.has(player.id) ? 'In your party' : `Lv ${player.level}`,
      vendor: false,
      bound: false,
      level: player.level,
    });
  }

  rows.sort((a, b) => {
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    if (byName !== 0) return byName;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows;
}
