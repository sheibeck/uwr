export const FACTION_DATA: Array<{
  name: string;
  description: string;
  rivalName: string;
}> = [
  {
    name: 'Iron Compact',
    description: 'A militaristic union of smiths, soldiers, and engineers who maintain order through strength.',
    rivalName: 'Verdant Circle',
  },
  {
    name: 'Verdant Circle',
    description: 'Druids, herbalists, and wildlands defenders who oppose industrialization and expansion.',
    rivalName: 'Iron Compact',
  },
  {
    name: 'Ashen Order',
    description: 'A secretive brotherhood of scholars devoted to ancient rituals and forbidden knowledge.',
    rivalName: 'Free Blades',
  },
  {
    name: 'Free Blades',
    description: 'An unaligned guild of mercenaries, rogues, and adventurers who answer to no authority.',
    rivalName: 'Ashen Order',
  },
];

export function ensureFactions(ctx: any) {
  // Phase 1: Insert or update each faction (without rivalFactionId yet)
  for (const data of FACTION_DATA) {
    const existing = [...ctx.db.faction.iter()].find((row: any) => row.name === data.name);
    if (existing) {
      ctx.db.faction.id.update({ ...existing, description: data.description });
    } else {
      ctx.db.faction.insert({ id: 0n, name: data.name, description: data.description, rivalFactionId: undefined });
    }
  }

  // Phase 2: Wire up rivalFactionId
  for (const data of FACTION_DATA) {
    if (!data.rivalName) continue;
    const factionRow = [...ctx.db.faction.iter()].find((row: any) => row.name === data.name);
    const rivalRow = [...ctx.db.faction.iter()].find((row: any) => row.name === data.rivalName);
    if (!factionRow || !rivalRow) continue;
    if (factionRow.rivalFactionId !== rivalRow.id) {
      ctx.db.faction.id.update({ ...factionRow, rivalFactionId: rivalRow.id });
    }
  }
}
