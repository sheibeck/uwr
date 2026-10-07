import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CRAFT_QUALITIES, QUALITY_TIERS } from '@game-data/mechanical_vocabulary';
import {
  CRAFT_QUALITIES as RELATIVE_CRAFT_QUALITIES,
  QUALITY_TIERS as RELATIVE_QUALITY_TIERS,
} from '../spacetimedb/src/data/mechanical_vocabulary';
import { computeCreationStats } from '@game-data/race_bonuses';
import { computeCreationStats as relativeComputeCreationStats } from '../spacetimedb/src/data/race_bonuses';
import { addItemStats, emptyItemStats, sumItemStats } from '@game-data/item_stats';
import * as relativeItemStats from '../spacetimedb/src/data/item_stats';
import { MAX_INVENTORY_SLOTS, backpackSlotCount } from '@game-data/inventory_rules';
import * as relativeInventoryRules from '../spacetimedb/src/data/inventory_rules';
import { isQuestItemTemplate, isRecipeScrollName, isSalvageableTemplate } from '@game-data/item_rules';
import * as relativeItemRules from '../spacetimedb/src/data/item_rules';
import { canEquipItem } from '@game-data/item_usability';
import * as relativeItemUsability from '../spacetimedb/src/data/item_usability';
import { buyPrice, sellPayout } from '@game-data/vendor_pricing';
import * as relativeVendorPricing from '../spacetimedb/src/data/vendor_pricing';
import { perkBonusByField, perkDisplayName } from '@game-data/perk_rules';
import * as relativePerkRules from '../spacetimedb/src/data/perk_rules';
import { factionTier } from '@game-data/faction_rules';
import * as relativeFactionRules from '../spacetimedb/src/data/faction_rules';
import {
  MATERIAL_DEFS,
  craftQualityForMaterialName,
  materialTierToCraftQuality,
} from '@game-data/crafting_rules';
import * as relativeCraftingRules from '../spacetimedb/src/data/crafting_rules';
import { RESULT_KINDS, decodeResultLines, encodeResultLines } from '@game-data/action_result';
import * as relativeActionResult from '../spacetimedb/src/data/action_result';

// The server owns game data; client code reaches it only through the @game-data alias
// (CONTEXT: server is source of truth, imported through a path alias).

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');

const SKIPPED_DIRS = new Set(['module_bindings', 'node_modules']);

// The import specifiers of one shared server data module (browser-safety pins).
function specifiers(file: string): string[] {
  const source = readFileSync(`${ROOT}spacetimedb/src/data/${file}`, 'utf8');
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

function walkProduction(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walkProduction(`${dir}/${entry.name}`, out);
      continue;
    }
    const name = entry.name;
    if (name.endsWith('.test.ts')) continue;
    if (!name.endsWith('.ts') && !name.endsWith('.vue')) continue;
    out.push(`${dir}/${name}`);
  }
  return out;
}

describe('@game-data alias', () => {
  it('resolves to the same module as the relative server path', () => {
    expect(QUALITY_TIERS).toEqual(RELATIVE_QUALITY_TIERS);
    expect(CRAFT_QUALITIES).toEqual(RELATIVE_CRAFT_QUALITIES);
    expect(QUALITY_TIERS.length).toBeGreaterThan(0);
    expect(CRAFT_QUALITIES.length).toBeGreaterThan(0);
    expect(QUALITY_TIERS).toContain('common');
    expect(QUALITY_TIERS).toContain('legendary');
  });

  it('is declared in vite.config.ts', () => {
    const vite = readFileSync(`${ROOT}vite.config.ts`, 'utf8');
    expect(vite).toContain("'@game-data'");
  });

  it('is declared in tsconfig.json paths', () => {
    const tsconfig = JSON.parse(readFileSync(`${ROOT}tsconfig.json`, 'utf8'));
    expect(tsconfig.compilerOptions.paths['@game-data/*']).toEqual(['./spacetimedb/src/data/*']);
  });

  it('no client source reaches spacetimedb/src/data through a relative path', () => {
    const offenders: string[] = [];
    const relative = /from\s+'(?:\.\.\/)+spacetimedb\/src\/data/;
    for (const file of walkProduction(`${ROOT}src`)) {
      if (relative.test(readFileSync(file, 'utf8'))) offenders.push(file.slice(ROOT.length));
    }
    expect(offenders).toEqual([]);
  });
});

describe('@game-data race_bonuses', () => {
  const DARK_ELF =
    '{"primary":{"stat":"dex","value":2},"secondary":{"stat":"int","value":1},"flavor":"Underlight Eyes"}';

  it('resolves to the same helper as the relative server path', () => {
    const viaAlias = computeCreationStats('int', 'wis', DARK_ELF);
    const viaRelative = relativeComputeCreationStats('int', 'wis', DARK_ELF);
    expect(viaAlias).toEqual(viaRelative);
    expect(viaAlias.stats).toEqual({ str: 8n, dex: 10n, cha: 8n, wis: 10n, int: 13n });
  });

  it('stays browser-safe: only ./class_stats, and class_stats imports nothing', () => {
    expect(new Set(specifiers('race_bonuses.ts'))).toEqual(new Set(['./class_stats']));
    expect(specifiers('class_stats.ts')).toEqual([]);
  });
});

describe('@game-data item_stats', () => {
  const TEMPLATE = { strBonus: 2n, armorClassBonus: 10n };
  const AFFIXES = [{ statKey: 'strBonus', magnitude: 3n }];

  it('resolves to the same helper as the relative server path', () => {
    const viaAlias = sumItemStats(TEMPLATE, AFFIXES);
    expect(viaAlias).toEqual(relativeItemStats.sumItemStats(TEMPLATE, AFFIXES));
    expect(viaAlias.strBonus).toBe(5n);
    expect(addItemStats(viaAlias, emptyItemStats()).armorClassBonus).toBe(10n);
  });

  it('imports nothing', () => {
    expect(specifiers('item_stats.ts')).toEqual([]);
  });
});

describe('@game-data inventory_rules', () => {
  const ROWS = [{ equippedSlot: null }, { equippedSlot: 'head' }, { equippedSlot: undefined }];

  it('resolves to the same rule as the relative server path', () => {
    expect(backpackSlotCount(ROWS)).toBe(relativeInventoryRules.backpackSlotCount(ROWS));
    expect(backpackSlotCount(ROWS)).toBe(2);
    expect(MAX_INVENTORY_SLOTS).toBe(relativeInventoryRules.MAX_INVENTORY_SLOTS);
  });

  it('imports nothing', () => {
    expect(specifiers('inventory_rules.ts')).toEqual([]);
  });
});

describe('@game-data item_rules', () => {
  it('resolves to the same helpers as the relative server path', () => {
    expect(isQuestItemTemplate({ slot: 'quest' })).toBe(relativeItemRules.isQuestItemTemplate({ slot: 'quest' }));
    expect(isQuestItemTemplate({ slot: 'quest' })).toBe(true);
    expect(isSalvageableTemplate({ slot: 'head', isJunk: false })).toBe(
      relativeItemRules.isSalvageableTemplate({ slot: 'head', isJunk: false }),
    );
    expect(isRecipeScrollName('Scroll: Bandage')).toBe(relativeItemRules.isRecipeScrollName('Scroll: Bandage'));
    expect(isRecipeScrollName('Bandage')).toBe(false);
  });

  it('imports exactly ./crafting_rules and ./mechanical_vocabulary', () => {
    expect(new Set(specifiers('item_rules.ts'))).toEqual(
      new Set(['./crafting_rules', './mechanical_vocabulary']),
    );
  });
});

describe('@game-data item_usability', () => {
  const STACK = { slot: 'material', stackable: true };
  const WHO = { className: 'warrior', level: 3n };

  it('resolves to the same rule as the relative server path', () => {
    const viaAlias = canEquipItem(STACK, WHO);
    expect(viaAlias).toEqual(relativeItemUsability.canEquipItem(STACK, WHO));
    expect(viaAlias.ok).toBe(false);
  });

  it('imports exactly ./class_stats and ./mechanical_vocabulary', () => {
    expect(new Set(specifiers('item_usability.ts'))).toEqual(
      new Set(['./class_stats', './mechanical_vocabulary']),
    );
  });
});

describe('@game-data vendor_pricing', () => {
  it('resolves to the same math as the relative server path', () => {
    expect(sellPayout(7n, 3n, 0, 0n)).toBe(relativeVendorPricing.sellPayout(7n, 3n, 0, 0n));
    expect(sellPayout(7n, 3n, 0, 0n)).toBe(21n);
    expect(buyPrice(10n, 0, 0n)).toBe(relativeVendorPricing.buyPrice(10n, 0, 0n));
  });

  it('imports nothing', () => {
    expect(specifiers('vendor_pricing.ts')).toEqual([]);
  });
});

describe('@game-data perk_rules', () => {
  it('resolves to the same lookup as the relative server path', () => {
    expect(perkDisplayName('iron_will')).toBe(relativePerkRules.perkDisplayName('iron_will'));
    expect(perkDisplayName('iron_will').length).toBeGreaterThan(0);
    expect(perkBonusByField(['iron_will'], 'vendorSellBonus', 5n)).toBe(
      relativePerkRules.perkBonusByField(['iron_will'], 'vendorSellBonus', 5n),
    );
  });

  it('imports exactly ./renown_data', () => {
    expect(new Set(specifiers('perk_rules.ts'))).toEqual(new Set(['./renown_data']));
  });
});

describe('@game-data faction_rules', () => {
  it('resolves to the same tiers as the relative server path', () => {
    expect(factionTier(-30n)).toEqual(relativeFactionRules.factionTier(-30n));
    expect(factionTier(0n).label).toBe('Neutral');
  });

  it('imports exactly ./mechanical_vocabulary', () => {
    expect(new Set(specifiers('faction_rules.ts'))).toEqual(new Set(['./mechanical_vocabulary']));
  });
});

describe('@game-data crafting_rules', () => {
  it('resolves to the same rules as the relative server path', () => {
    const name = MATERIAL_DEFS[0].name;
    expect(craftQualityForMaterialName(name)).toBe(relativeCraftingRules.craftQualityForMaterialName(name));
    expect(craftQualityForMaterialName(name)).toBe(materialTierToCraftQuality(MATERIAL_DEFS[0].tier));
    expect(MATERIAL_DEFS).toBe(relativeCraftingRules.MATERIAL_DEFS);
  });

  it('imports nothing', () => {
    expect(specifiers('crafting_rules.ts')).toEqual([]);
  });
});

describe('@game-data action_result', () => {
  it('resolves to the same module as the relative server path', () => {
    expect(RESULT_KINDS).toBe(relativeActionResult.RESULT_KINDS);
    expect(decodeResultLines).toBe(relativeActionResult.decodeResultLines);
    const lines = [{ kind: 'used' as const, templateId: 7n, name: 'Copper Ore', quantity: 3n, total: 12n, instanceId: null }];
    expect(decodeResultLines(encodeResultLines(lines))).toEqual(lines);
    expect(encodeResultLines(lines)).toBe(relativeActionResult.encodeResultLines(lines));
  });

  it('imports nothing', () => {
    expect(specifiers('action_result.ts')).toEqual([]);
  });
});

describe('@game-data sibling modules stay import-free', () => {
  it('mechanical_vocabulary, class_stats and renown_data import nothing', () => {
    for (const file of ['mechanical_vocabulary.ts', 'class_stats.ts', 'renown_data.ts', 'crafting_rules.ts', 'action_result.ts']) {
      expect(specifiers(file)).toEqual([]);
    }
  });
});
