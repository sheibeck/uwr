// Threat block for the current target (48-UI-SPEC "Encounter panel" item 4, CMB-02, CONTEXT A8).
//
// Rows come from the per-sender my_combat_aggro view (48-01), which holds every enemy of the
// sender's fights, so the entries are filtered to the target here. Percent is relative to the
// top row (top = 100%); only this module changes if the owner picks another basis at UAT.

export interface ThreatEntryInput {
  enemyId: bigint;
  characterId: bigint;
  value: bigint;
}

export interface ThreatRowView {
  characterId: bigint;
  name: string;
  isSelf: boolean;
  percent: number;
  /** '75%'. */
  percentText: string;
  /** Bar width, '75%'. */
  widthPercent: string;
}

export interface ThreatView {
  /** False when there is no target or the view has not applied yet: the block is hidden. */
  visible: boolean;
  /** 'Threat on {name}', '' while hidden. */
  heading: string;
  rows: ThreatRowView[];
  /** 'No threat yet.' when visible with no rows, else null. */
  emptyText: string | null;
}

export interface ThreatViewInput {
  entries: readonly ThreatEntryInput[];
  target: { id: bigint; name: string } | null;
  selfId: bigint | null;
  characterNames: ReadonlyMap<bigint, string>;
  /** True once the my_combat_aggro subscription has applied. */
  applied: boolean;
}

/** Round-half-up percent of value against top, in bigint math. */
function percentOf(value: bigint, top: bigint): number {
  if (top <= 0n || value <= 0n) return 0;
  return Number((value * 200n + top) / (2n * top));
}

export function threatView(input: ThreatViewInput): ThreatView {
  if (input.target === null || !input.applied) {
    return { visible: false, heading: '', rows: [], emptyText: null };
  }
  const targetId = input.target.id;
  const entries = input.entries
    .filter((entry) => entry.enemyId === targetId)
    .sort((a, b) => {
      if (a.value !== b.value) return a.value > b.value ? -1 : 1;
      return a.characterId < b.characterId ? -1 : a.characterId > b.characterId ? 1 : 0;
    });
  const top = entries.length > 0 ? entries[0].value : 0n;

  const rows = entries.map((entry): ThreatRowView => {
    const isSelf = input.selfId !== null && entry.characterId === input.selfId;
    const known = input.characterNames.get(entry.characterId);
    const name = isSelf ? 'You' : known !== undefined && known !== '' ? known : 'Member';
    const percent = percentOf(entry.value, top);
    return {
      characterId: entry.characterId,
      name,
      isSelf,
      percent,
      percentText: `${percent}%`,
      widthPercent: `${percent}%`,
    };
  });

  return {
    visible: true,
    heading: `Threat on ${input.target.name}`,
    rows,
    emptyText: rows.length === 0 ? 'No threat yet.' : null,
  };
}
