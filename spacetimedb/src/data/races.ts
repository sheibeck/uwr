export const RACE_DATA: Array<{
  name: string;
  description: string;
  availableClasses: string;
  strBonus: bigint;
  dexBonus: bigint;
  chaBonus: bigint;
  wisBonus: bigint;
  intBonus: bigint;
  unlocked: boolean;
}> = [
  {
    name: 'Human',
    description: 'Adaptable and resourceful, humans can pursue any path.',
    availableClasses: '',
    strBonus: 0n, dexBonus: 0n, chaBonus: 1n, wisBonus: 0n, intBonus: 0n,
    unlocked: true,
  },
  {
    name: 'Eldrin',
    description: 'Ancient scholars attuned to arcane and divine forces.',
    availableClasses: 'bard,enchanter,cleric,wizard,necromancer,spellblade,shaman,druid,reaver,summoner,paladin,ranger',
    strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 1n, intBonus: 2n,
    unlocked: true,
  },
  {
    name: 'Ironclad',
    description: 'Forged in industry, masters of strength and craft.',
    availableClasses: 'warrior,paladin,monk,beastmaster,spellblade,ranger,shaman',
    strBonus: 2n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n,
    unlocked: true,
  },
  {
    name: 'Wyldfang',
    description: 'Swift hunters bonded with the untamed wild.',
    availableClasses: 'rogue,ranger,monk,beastmaster,druid,shaman',
    strBonus: 0n, dexBonus: 2n, chaBonus: 0n, wisBonus: 1n, intBonus: 0n,
    unlocked: true,
  },
];

export function ensureRaces(ctx: any) {
  for (const data of RACE_DATA) {
    const existing = [...ctx.db.race.iter()].find((row: any) => row.name === data.name);
    if (existing) {
      ctx.db.race.id.update({ ...existing, ...data });
    } else {
      ctx.db.race.insert({ id: 0n, ...data });
    }
  }
}
