// Nearby rows for the context rail (47-UI-SPEC "Nearby", CON-04).
// Order: NPCs, objects, resource nodes, players; alphabetical inside a group, ties by id.
// Objects have no subscribed source today (research Q3, A7), so the list defaults to [].
// Node state vocabulary (spacetimedb items_gathering.ts): 'available' can be gathered,
// 'harvesting' is in use while lockedByCharacterId is set, any other state is depleted.

export type NearbyKind = 'npc' | 'object' | 'node' | 'player';
export type NodeStatus = 'gather' | 'depleted' | 'inUse';

export interface NearbyRow {
  kind: NearbyKind;
  id: bigint;
  name: string;
  hint: string;
  /** True for vendor NPCs: the row gets a Trade action. */
  vendor: boolean;
  nodeStatus: NodeStatus | null;
  /** Player level for player rows. */
  level: bigint | null;
}

const NODE_HINTS: Record<NodeStatus, string> = {
  gather: 'Gather',
  depleted: 'Depleted',
  inUse: 'In use',
};

/** Nodes with no owner, or owned by the player (per-character nodes). */
export function visibleNodes<T extends { characterId?: bigint | null }>(
  nodes: readonly T[],
  selfId: bigint | null,
): T[] {
  return nodes.filter((node) => {
    const owner = node.characterId;
    return owner === undefined || owner === null || (selfId !== null && owner === selfId);
  });
}

export function nodeStatus(node: { state: string; lockedByCharacterId?: bigint | null }): NodeStatus {
  const locked = node.lockedByCharacterId !== undefined && node.lockedByCharacterId !== null;
  if (locked || node.state === 'harvesting') return 'inUse';
  if (node.state === 'available') return 'gather';
  return 'depleted';
}

const KIND_ORDER: Record<NearbyKind, number> = { npc: 0, object: 1, node: 2, player: 3 };

export function nearbyRows(input: {
  npcs: readonly { id: bigint; name: string; npcType: string }[];
  nodes: readonly {
    id: bigint;
    name: string;
    state: string;
    lockedByCharacterId?: bigint | null;
    characterId?: bigint | null;
  }[];
  players: readonly { id: bigint; name: string; level: bigint }[];
  objects?: readonly { id: bigint; name: string }[];
  selfId: bigint | null;
}): NearbyRow[] {
  const { npcs, nodes, players, selfId } = input;
  const objects = input.objects ?? [];
  const rows: NearbyRow[] = [];

  for (const npc of npcs) {
    rows.push({
      kind: 'npc',
      id: npc.id,
      name: npc.name,
      hint: 'NPC · hail',
      vendor: npc.npcType === 'vendor',
      nodeStatus: null,
      level: null,
    });
  }
  for (const object of objects) {
    rows.push({
      kind: 'object',
      id: object.id,
      name: object.name,
      hint: 'Examine',
      vendor: false,
      nodeStatus: null,
      level: null,
    });
  }
  for (const node of visibleNodes(nodes, selfId)) {
    const status = nodeStatus(node);
    rows.push({
      kind: 'node',
      id: node.id,
      name: node.name,
      hint: NODE_HINTS[status],
      vendor: false,
      nodeStatus: status,
      level: null,
    });
  }
  for (const player of players) {
    if (selfId !== null && player.id === selfId) continue;
    rows.push({
      kind: 'player',
      id: player.id,
      name: player.name,
      hint: `Lv ${player.level}`,
      vendor: false,
      nodeStatus: null,
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
