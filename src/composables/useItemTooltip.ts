import type { ItemTemplate, ItemAffix } from '../module_bindings/types';

// Weapon speed lookup (mirrors spacetimedb/src/data/combat_constants.ts)
const WEAPON_SPEED_MICROS: Record<string, bigint> = {
  dagger:     3_000_000n,
  rapier:     3_000_000n,
  sword:      3_500_000n,
  blade:      3_500_000n,
  mace:       3_500_000n,
  axe:        4_000_000n,
  staff:      5_000_000n,
  bow:        5_000_000n,
  greatsword: 5_000_000n,
};
const DEFAULT_WEAPON_SPEED_MICROS = 4_000_000n;

export type TooltipStatLine = { label: string; value: string };
export type TooltipAffixLine = { label: string; value: string; affixName: string };

export type ItemTooltipData = {
  name: string;
  description: string;
  slot: string;
  armorType: string;
  rarity: string;
  qualityTier: string;
  craftQuality?: string;
  tier: bigint;
  allowedClasses: string;
  stats: TooltipStatLine[];
  affixStats: TooltipAffixLine[];
  isNamed: boolean;
};

type BuildTooltipArgs = {
  template: ItemTemplate | null | undefined;
  instance?: {
    id?: bigint;
    qualityTier?: string | null;
    craftQuality?: string | null;
    displayName?: string | null;
    isNamed?: boolean | null;
    quantity?: bigint | null;
  };
  affixes?: ItemAffix[];
  affixDataJson?: string | null;
  priceOrValue?: TooltipStatLine;
  /** Character level for combat-accurate weapon damage. Defaults to 1n. */
  characterLevel?: bigint;
};

export const formatAffixStatKey = (key: string): string => {
  const map: Record<string, string> = {
    strBonus: 'STR',
    dexBonus: 'DEX',
    intBonus: 'INT',
    wisBonus: 'WIS',
    chaBonus: 'CHA',
    hpBonus: 'Max HP',
    armorClassBonus: 'Armor',
    magicResistanceBonus: 'Magic Resist',
    lifeOnHit: 'Life on Hit',
    cooldownReduction: 'Cooldown Reduction %',
    manaRegen: 'Mana Regen',
    weaponBaseDamage: 'Damage',
  };
  return map[key] ?? key;
};

/**
 * Builds tooltip display data from an ItemTemplate row and optional instance/affix data.
 * This is the single source of truth for all item tooltip construction.
 *
 * Description comes exclusively from template.description — no client-side fallbacks.
 * If the server description is blank, the tooltip description is blank.
 */
export const buildItemTooltipData = ({
  template,
  instance,
  affixes,
  affixDataJson,
  priceOrValue,
  characterLevel,
}: BuildTooltipArgs): ItemTooltipData => {
  // --- Name ---
  let name = instance?.displayName ?? template?.name ?? 'Unknown';

  // For loot with affix JSON data, build the affixed name
  if (!instance?.isNamed && affixDataJson) {
    let parsedAffixes: any[] = [];
    try {
      parsedAffixes = JSON.parse(affixDataJson);
    } catch {
      // ignore parse errors
    }
    if (parsedAffixes.length > 0) {
      const prefix = parsedAffixes.find((a: any) => a.affixType === 'prefix');
      const suffix = parsedAffixes.find((a: any) => a.affixType === 'suffix');
      const baseName = template?.name ?? 'Unknown';
      let affixedName = baseName;
      if (prefix) affixedName = `${prefix.affixName} ${affixedName}`;
      if (suffix) affixedName = `${affixedName} of ${suffix.affixName}`;
      name = affixedName;
    }
  }

  // --- Description ---
  // Exclusively from server — no client-side fallbacks
  const description = template?.description ?? '';

  // --- Quality / rarity ---
  const qualityTier = instance?.qualityTier ?? template?.rarity ?? 'common';
  const craftQuality = instance?.craftQuality ?? undefined;

  // --- Implicit affix bonuses (applied to base stat display) ---
  let implicitAcBonus = 0n;
  let implicitDmgBonus = 0n;
  let implicitDpsBonus = 0n;

  if (affixes && affixes.length > 0) {
    for (const a of affixes) {
      if (a.affixType === 'implicit') {
        if (a.statKey === 'armorClassBonus') implicitAcBonus += a.magnitude;
        else if (a.statKey === 'weaponBaseDamage') implicitDmgBonus += a.magnitude;
        else if (a.statKey === 'weaponDps') implicitDpsBonus += a.magnitude;
      }
    }
  }

  const effectiveAc = (template?.armorClassBonus ?? 0n) + implicitAcBonus;
  const effectiveDmg = (template?.weaponBaseDamage ?? 0n) + implicitDmgBonus;
  const effectiveDps = (template?.weaponDps ?? 0n) + implicitDpsBonus;

  // --- Weapon combat stats (matches combat.ts: rawWeaponDamage = 5n + level + baseDamage + dps/2n) ---
  let weaponDamageLines: TooltipStatLine[] = [];
  if (effectiveDmg > 0n || effectiveDps > 0n) {
    const level = characterLevel ?? 1n;
    const rawWeaponDamage = 5n + level + effectiveDmg + (effectiveDps / 2n);
    const speedMicros = WEAPON_SPEED_MICROS[template?.weaponType ?? ''] ?? DEFAULT_WEAPON_SPEED_MICROS;
    const actualDps = Number(rawWeaponDamage) / (Number(speedMicros) / 1_000_000);
    weaponDamageLines = [
      { label: 'Damage', value: String(rawWeaponDamage) },
      { label: 'DPS', value: actualDps.toFixed(1) },
    ];
  }

  // --- Stats ---
  const stats: TooltipStatLine[] = [
    effectiveAc ? { label: 'Armor Class', value: `+${effectiveAc}` } : null,
    ...weaponDamageLines,
    template?.strBonus ? { label: 'STR', value: `+${template.strBonus}` } : null,
    template?.dexBonus ? { label: 'DEX', value: `+${template.dexBonus}` } : null,
    template?.chaBonus ? { label: 'CHA', value: `+${template.chaBonus}` } : null,
    template?.wisBonus ? { label: 'WIS', value: `+${template.wisBonus}` } : null,
    template?.intBonus ? { label: 'INT', value: `+${template.intBonus}` } : null,
    template?.hpBonus ? { label: 'HP', value: `+${template.hpBonus}` } : null,
    template?.manaBonus ? { label: 'Mana', value: `+${template.manaBonus}` } : null,
    priceOrValue ?? null,
  ].filter(Boolean) as TooltipStatLine[];

  // --- Affix stats ---
  let affixStats: TooltipAffixLine[] = [];

  if (affixes && affixes.length > 0) {
    // Filter out implicit affixes (already reflected in base stats)
    affixStats = affixes
      .filter((a) => a.affixType !== 'implicit')
      .map((a) => ({
        label: formatAffixStatKey(a.statKey),
        value: `+${a.magnitude}`,
        affixName: a.affixName,
      }));
  } else if (affixDataJson) {
    let parsedAffixes: any[] = [];
    try {
      parsedAffixes = JSON.parse(affixDataJson);
    } catch {
      // ignore parse errors
    }
    affixStats = parsedAffixes.map((a: any) => ({
      label: formatAffixStatKey(a.statKey),
      value: `+${a.magnitude}`,
      affixName: a.affixName,
    }));
  }

  return {
    name,
    description,
    slot: template?.slot ?? 'unknown',
    armorType: template?.armorType ?? 'none',
    rarity: template?.rarity ?? 'common',
    qualityTier,
    craftQuality: craftQuality ?? undefined,
    tier: template?.tier ?? 1n,
    allowedClasses: template?.allowedClasses ?? 'any',
    stats,
    affixStats,
    isNamed: instance?.isNamed ?? false,
  };
};
