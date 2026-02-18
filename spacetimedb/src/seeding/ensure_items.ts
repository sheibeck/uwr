import { SenderError } from 'spacetimedb/server';
import { findItemTemplateByName, STARTER_ARMOR, STARTER_WEAPONS } from '../helpers/items';
import { ItemTemplate } from '../schema/tables';
import { MATERIAL_DEFS, CONSUMABLE_RECIPES, GEAR_RECIPES, GEAR_RECIPE_NAMES, CRAFTING_MODIFIER_DEFS } from '../data/crafting_materials';
import { ABILITY_STAT_SCALING } from '../data/combat_scaling';
import { CLERIC_ABILITIES } from '../data/abilities/cleric_abilities';
import { WARRIOR_ABILITIES } from '../data/abilities/warrior_abilities';
import { WIZARD_ABILITIES } from '../data/abilities/wizard_abilities';
import { ROGUE_ABILITIES } from '../data/abilities/rogue_abilities';
import { RANGER_ABILITIES } from '../data/abilities/ranger_abilities';
import { SHAMAN_ABILITIES } from '../data/abilities/shaman_abilities';
import { ENCHANTER_ABILITIES } from '../data/abilities/enchanter_abilities';
import { SUMMONER_ABILITIES } from '../data/abilities/summoner_abilities';
import { NECROMANCER_ABILITIES } from '../data/abilities/necromancer_abilities';
import { BARD_ABILITIES } from '../data/abilities/bard_abilities';
import { BEASTMASTER_ABILITIES } from '../data/abilities/beastmaster_abilities';
import { DRUID_ABILITIES } from '../data/abilities/druid_abilities';
import { PALADIN_ABILITIES } from '../data/abilities/paladin_abilities';
import { MONK_ABILITIES } from '../data/abilities/monk_abilities';
import { SPELLBLADE_ABILITIES } from '../data/abilities/spellblade_abilities';
import { REAVER_ABILITIES } from '../data/abilities/reaver_abilities';

/** Unified recipe template upsert helper — replaces addRecipe and addGearRecipe */
function addRecipeTemplate(ctx: any, args: {
  key: string;
  name: string;
  output: any;
  outputCount: bigint;
  req1: any;
  req1Count: bigint;
  req2: any;
  req2Count: bigint;
  req3?: any;
  req3Count?: bigint;
  recipeType?: string;
  materialType?: string;
}) {
  if (!args.output || !args.req1 || !args.req2) return;
  const existing = [...ctx.db.recipeTemplate.iter()].find((row: any) => row.key === args.key);
  if (existing) {
    ctx.db.recipeTemplate.id.update({
      ...existing,
      key: args.key,
      name: args.name,
      outputTemplateId: args.output.id,
      outputCount: args.outputCount,
      req1TemplateId: args.req1.id,
      req1Count: args.req1Count,
      req2TemplateId: args.req2.id,
      req2Count: args.req2Count,
      req3TemplateId: args.req3?.id,
      req3Count: args.req3Count,
      recipeType: args.recipeType ?? existing.recipeType ?? 'consumable',
      materialType: args.materialType ?? existing.materialType,
    });
    return;
  }
  ctx.db.recipeTemplate.insert({
    id: 0n,
    key: args.key,
    name: args.name,
    outputTemplateId: args.output.id,
    outputCount: args.outputCount,
    req1TemplateId: args.req1.id,
    req1Count: args.req1Count,
    req2TemplateId: args.req2.id,
    req2Count: args.req2Count,
    req3TemplateId: args.req3?.id,
    req3Count: args.req3Count,
    recipeType: args.recipeType ?? 'consumable',
    materialType: args.materialType,
  });
}

export function ensureStarterItemTemplates(ctx: any) {
  const upsertItemTemplateByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({
        ...existing,
        ...fullRow,
        id: existing.id,
      });
      return existing;
    }
    return ctx.db.itemTemplate.insert({
      id: 0n,
      ...fullRow,
    });
  };

  const ARMOR_ALLOWED_CLASSES: Record<string, string> = {
    plate: 'warrior,paladin,bard,cleric',
    chain: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    leather: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    cloth: 'any',
  };

  for (const [armorType, pieces] of Object.entries(STARTER_ARMOR)) {
    upsertItemTemplateByName({
      name: pieces.chest.name,
      slot: 'chest',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.chest.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
    upsertItemTemplateByName({
      name: pieces.legs.name,
      slot: 'legs',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.legs.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
    upsertItemTemplateByName({
      name: pieces.boots.name,
      slot: 'boots',
      armorType,
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: ARMOR_ALLOWED_CLASSES[armorType] ?? 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: pieces.boots.ac,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
  }

  const weaponTemplates: Record<string, { name: string; allowed: string; weaponType: string }> = {
    'Training Sword': { name: 'Training Sword', allowed: 'warrior', weaponType: 'sword' },
    'Training Mace': { name: 'Training Mace', allowed: 'paladin,cleric', weaponType: 'mace' },
    'Training Staff': {
      name: 'Training Staff',
      allowed: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard',
      weaponType: 'staff',
    },
    'Training Bow': { name: 'Training Bow', allowed: 'ranger', weaponType: 'bow' },
    'Training Dagger': { name: 'Training Dagger', allowed: 'rogue', weaponType: 'dagger' },
    'Training Axe': { name: 'Training Axe', allowed: 'beastmaster', weaponType: 'axe' },
    'Training Blade': { name: 'Training Blade', allowed: 'spellblade,reaver', weaponType: 'blade' },
    'Training Rapier': { name: 'Training Rapier', allowed: 'bard', weaponType: 'rapier' },
  };

  for (const weapon of Object.values(weaponTemplates)) {
    upsertItemTemplateByName({
      name: weapon.name,
      slot: 'mainHand',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
      requiredLevel: 1n,
      allowedClasses: weapon.allowed,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 3n,
      weaponDps: 5n,
      weaponType: weapon.weaponType,
      stackable: false,
    });
  }

  const accessoryTemplates = [
    { name: 'Rough Band', slot: 'earrings', rarity: 'common', stat: { dexBonus: 1n } },
    { name: 'Worn Cloak', slot: 'cloak', rarity: 'common', stat: { hpBonus: 3n } },
    { name: 'Traveler Necklace', slot: 'neck', rarity: 'common', stat: { wisBonus: 1n } },
    { name: 'Glimmer Ring', slot: 'earrings', rarity: 'uncommon', stat: { intBonus: 1n } },
    { name: 'Shaded Cloak', slot: 'cloak', rarity: 'uncommon', stat: { dexBonus: 1n } },
  ];

  for (const template of accessoryTemplates) {
    upsertItemTemplateByName({
      name: template.name,
      slot: template.slot,
      armorType: 'none',
      rarity: template.rarity,
      tier: 1n,
      isJunk: false,
      vendorValue: template.rarity === 'uncommon' ? 8n : 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: template.stat.strBonus ?? 0n,
      dexBonus: template.stat.dexBonus ?? 0n,
      chaBonus: template.stat.chaBonus ?? 0n,
      wisBonus: template.stat.wisBonus ?? 0n,
      intBonus: template.stat.intBonus ?? 0n,
      hpBonus: template.stat.hpBonus ?? 0n,
      manaBonus: template.stat.manaBonus ?? 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
    });
  }

  const junkTemplates = [
    { name: 'Rat Tail', vendorValue: 1n },
    { name: 'Torn Pelt', vendorValue: 2n },
    { name: 'Cracked Fang', vendorValue: 1n },
    { name: 'Ashen Bone', vendorValue: 2n },
  ];

  for (const junk of junkTemplates) {
    upsertItemTemplateByName({
      name: junk.name,
      slot: 'junk',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: true,
      vendorValue: junk.vendorValue,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: true,
    });
  }
}

export function ensureWorldDropGearTemplates(ctx: any) {
  const upsertByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
  };

  // Tier 1 weapons (requiredLevel: 1n)
  upsertByName({
    name: 'Iron Shortsword',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,bard,spellblade,reaver',
    weaponType: 'sword',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Hunting Bow',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'ranger',
    weaponType: 'bow',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Gnarled Staff',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard',
    weaponType: 'staff',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Worn Mace',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'paladin,cleric',
    weaponType: 'mace',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Rusty Axe',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'beastmaster',
    weaponType: 'axe',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Notched Rapier',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'bard',
    weaponType: 'rapier',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Chipped Dagger',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 4n,
    requiredLevel: 1n,
    allowedClasses: 'rogue',
    weaponType: 'dagger',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Cracked Blade',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 4n,
    requiredLevel: 1n,
    allowedClasses: 'spellblade,reaver',
    weaponType: 'blade',
    weaponBaseDamage: 4n,
    weaponDps: 6n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });

  // Tier 2 weapons (requiredLevel: 11n)
  upsertByName({
    name: 'Steel Longsword',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 2n,
    isJunk: false,
    vendorValue: 12n,
    requiredLevel: 11n,
    allowedClasses: 'warrior,paladin,bard,spellblade,reaver',
    weaponType: 'sword',
    weaponBaseDamage: 5n,
    weaponDps: 7n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Yew Bow',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 2n,
    isJunk: false,
    vendorValue: 12n,
    requiredLevel: 11n,
    allowedClasses: 'ranger',
    weaponType: 'bow',
    weaponBaseDamage: 5n,
    weaponDps: 7n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Oak Staff',
    slot: 'mainHand',
    armorType: 'none',
    rarity: 'common',
    tier: 2n,
    isJunk: false,
    vendorValue: 12n,
    requiredLevel: 11n,
    allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard',
    weaponType: 'staff',
    weaponBaseDamage: 5n,
    weaponDps: 7n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    stackable: false,
  });

  // Tier 1 armor — cloth
  upsertByName({
    name: 'Worn Robe',
    slot: 'chest',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 4n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 3n,
    stackable: false,
  });
  upsertByName({
    name: 'Worn Trousers',
    slot: 'legs',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 3n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 2n,
    stackable: false,
  });
  upsertByName({
    name: 'Worn Slippers',
    slot: 'boots',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 2n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 2n,
    stackable: false,
  });

  // Tier 1 armor — leather
  upsertByName({
    name: 'Scuffed Jerkin',
    slot: 'chest',
    armorType: 'leather',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 4n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 4n,
    stackable: false,
  });
  upsertByName({
    name: 'Scuffed Leggings',
    slot: 'legs',
    armorType: 'leather',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 3n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 3n,
    stackable: false,
  });
  upsertByName({
    name: 'Scuffed Boots',
    slot: 'boots',
    armorType: 'leather',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 2n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 3n,
    stackable: false,
  });

  // Tier 1 armor — chain
  upsertByName({
    name: 'Dented Hauberk',
    slot: 'chest',
    armorType: 'chain',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 5n,
    stackable: false,
  });
  upsertByName({
    name: 'Dented Greaves',
    slot: 'legs',
    armorType: 'chain',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 4n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 4n,
    stackable: false,
  });
  upsertByName({
    name: 'Dented Sabatons',
    slot: 'boots',
    armorType: 'chain',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 3n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 3n,
    stackable: false,
  });

  // Tier 1 armor — plate
  upsertByName({
    name: 'Battered Cuirass',
    slot: 'chest',
    armorType: 'plate',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 6n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,bard,cleric',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 6n,
    stackable: false,
  });
  upsertByName({
    name: 'Battered Greaves',
    slot: 'legs',
    armorType: 'plate',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 5n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,bard,cleric',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 5n,
    stackable: false,
  });
  upsertByName({
    name: 'Battered Boots',
    slot: 'boots',
    armorType: 'plate',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 4n,
    requiredLevel: 1n,
    allowedClasses: 'warrior,paladin,bard,cleric',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 4n,
    stackable: false,
  });

  // Tier 2 armor (requiredLevel: 11n)
  upsertByName({
    name: 'Silken Robe',
    slot: 'chest',
    armorType: 'cloth',
    rarity: 'common',
    tier: 2n,
    isJunk: false,
    vendorValue: 14n,
    requiredLevel: 11n,
    allowedClasses: 'any',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 4n,
    stackable: false,
  });
  upsertByName({
    name: 'Ranger Jerkin',
    slot: 'chest',
    armorType: 'leather',
    rarity: 'common',
    tier: 2n,
    isJunk: false,
    vendorValue: 14n,
    requiredLevel: 11n,
    allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid',
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 5n,
    stackable: false,
  });

  // Tier 2 armor — cloth legs/boots
  upsertByName({ name: 'Silken Trousers', slot: 'legs', armorType: 'cloth', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false });
  upsertByName({ name: 'Silken Slippers', slot: 'boots', armorType: 'cloth', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 10n, requiredLevel: 11n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false });

  // Tier 2 armor — leather legs/boots
  upsertByName({ name: 'Ranger Leggings', slot: 'legs', armorType: 'leather', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false });
  upsertByName({ name: 'Ranger Boots', slot: 'boots', armorType: 'leather', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 10n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false });

  // Tier 2 armor — chain chest/legs/boots
  upsertByName({ name: 'Riveted Hauberk', slot: 'chest', armorType: 'chain', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 6n, stackable: false });
  upsertByName({ name: 'Riveted Greaves', slot: 'legs', armorType: 'chain', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 5n, stackable: false });
  upsertByName({ name: 'Riveted Sabatons', slot: 'boots', armorType: 'chain', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false });

  // Tier 2 armor — plate chest/legs/boots
  upsertByName({ name: 'Forged Cuirass', slot: 'chest', armorType: 'plate', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 18n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 7n, stackable: false });
  upsertByName({ name: 'Forged Greaves', slot: 'legs', armorType: 'plate', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 6n, stackable: false });
  upsertByName({ name: 'Forged Boots', slot: 'boots', armorType: 'plate', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 5n, stackable: false });

  // Tier 2 weapons — remaining types
  upsertByName({ name: 'Flanged Mace', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'paladin,cleric', weaponType: 'mace', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false });
  upsertByName({ name: 'Hardened Axe', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'beastmaster', weaponType: 'axe', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false });
  upsertByName({ name: 'Stiletto', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'rogue', weaponType: 'dagger', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false });
  upsertByName({ name: 'Dueling Rapier', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'bard', weaponType: 'rapier', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false });
  upsertByName({ name: 'Tempered Blade', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'spellblade,reaver', weaponType: 'blade', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false });
}

export function ensureWorldDropJewelryTemplates(ctx: any) {
  const upsertByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
  };

  // Tier 1 jewelry (requiredLevel: 1n, tier: 1n)
  upsertByName({
    name: 'Copper Band',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 1n,
    isJunk: false,
    vendorValue: 6n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 1n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Iron Signet',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 1n,
    isJunk: false,
    vendorValue: 6n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 1n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Tarnished Loop',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 1n,
    isJunk: false,
    vendorValue: 6n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 1n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Stone Pendant',
    slot: 'neck',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 1n,
    isJunk: false,
    vendorValue: 6n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 1n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Bone Charm',
    slot: 'neck',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 1n,
    isJunk: false,
    vendorValue: 6n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 3n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Frayed Cord',
    slot: 'neck',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 1n,
    isJunk: false,
    vendorValue: 6n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 3n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });

  // Tier 2 jewelry (requiredLevel: 11n, tier: 2n)
  upsertByName({
    name: 'Silver Band',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 2n,
    isJunk: false,
    vendorValue: 16n,
    requiredLevel: 11n,
    allowedClasses: 'any',
    strBonus: 2n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Arcane Loop',
    slot: 'earrings',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 2n,
    isJunk: false,
    vendorValue: 16n,
    requiredLevel: 11n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 2n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Ember Pendant',
    slot: 'neck',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 2n,
    isJunk: false,
    vendorValue: 16n,
    requiredLevel: 11n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 2n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Vitality Cord',
    slot: 'neck',
    armorType: 'none',
    rarity: 'uncommon',
    tier: 2n,
    isJunk: false,
    vendorValue: 16n,
    requiredLevel: 11n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 6n,
    manaBonus: 0n,
    armorClassBonus: 0n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });

  // Tier 1 cloaks (slot: 'neck', armorType: 'cloth', rarity: 'common', armorClassBonus: 1n)
  upsertByName({
    name: 'Rough Cloak',
    slot: 'neck',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 8n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 2n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Wool Cloak',
    slot: 'neck',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 8n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 2n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Drifter Cloak',
    slot: 'neck',
    armorType: 'cloth',
    rarity: 'common',
    tier: 1n,
    isJunk: false,
    vendorValue: 8n,
    requiredLevel: 1n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 2n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });

  // Tier 2 cloaks (slot: 'neck', armorType: 'cloth', rarity: 'common', armorClassBonus: 2n)
  upsertByName({
    name: 'Reinforced Cloak',
    slot: 'neck',
    armorType: 'cloth',
    rarity: 'common',
    tier: 2n,
    isJunk: false,
    vendorValue: 18n,
    requiredLevel: 11n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 2n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
  upsertByName({
    name: 'Stalker Cloak',
    slot: 'neck',
    armorType: 'cloth',
    rarity: 'common',
    tier: 2n,
    isJunk: false,
    vendorValue: 18n,
    requiredLevel: 11n,
    allowedClasses: 'any',
    strBonus: 0n,
    dexBonus: 0n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 2n,
    weaponBaseDamage: 0n,
    weaponDps: 0n,
    stackable: false,
  });
}

export function ensureResourceItemTemplates(ctx: any) {
  const resources = [
    { name: 'Flax', slot: 'resource', vendorValue: 1n },
    { name: 'Herbs', slot: 'resource', vendorValue: 1n },
    { name: 'Wood', slot: 'resource', vendorValue: 1n },
    { name: 'Resin', slot: 'resource', vendorValue: 1n },
    { name: 'Stone', slot: 'resource', vendorValue: 1n },
    { name: 'Raw Meat', slot: 'resource', vendorValue: 1n },
    { name: 'Salt', slot: 'resource', vendorValue: 1n },
    { name: 'Clear Water', slot: 'resource', vendorValue: 1n },
    { name: 'Sand', slot: 'resource', vendorValue: 1n },
    { name: 'Dry Grass', slot: 'resource', vendorValue: 1n },
    { name: 'Bitter Herbs', slot: 'resource', vendorValue: 1n },
    { name: 'Peat', slot: 'resource', vendorValue: 1n },
    { name: 'Mushrooms', slot: 'resource', vendorValue: 1n },
    { name: 'Murky Water', slot: 'resource', vendorValue: 1n },
    { name: 'Iron Shard', slot: 'resource', vendorValue: 2n },
    { name: 'Ancient Dust', slot: 'resource', vendorValue: 2n },
    { name: 'Scrap Cloth', slot: 'resource', vendorValue: 1n },
    { name: 'Lamp Oil', slot: 'resource', vendorValue: 1n },
    { name: 'Wild Berries', slot: 'resource', vendorValue: 1n },
    { name: 'Root Vegetable', slot: 'resource', vendorValue: 1n },
  ];
  for (const resource of resources) {
    if (findItemTemplateByName(ctx, resource.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: resource.name,
      slot: resource.slot,
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: resource.vendorValue,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
  if (!findItemTemplateByName(ctx, 'Bandage')) {
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: 'Bandage',
      slot: 'consumable',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 2n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
  const craftItems = [
    { name: 'Simple Rations', slot: 'consumable', vendorValue: 2n },
    { name: 'Torch', slot: 'utility', vendorValue: 2n },
    { name: 'Basic Poultice', slot: 'consumable', vendorValue: 2n },
    { name: 'Travelers Tea', slot: 'consumable', vendorValue: 2n },
    { name: 'Whetstone', slot: 'utility', vendorValue: 2n },
    { name: 'Kindling Bundle', slot: 'utility', vendorValue: 1n },
    { name: 'Rough Rope', slot: 'utility', vendorValue: 2n },
    { name: 'Charcoal', slot: 'resource', vendorValue: 1n },
    { name: 'Crude Poison', slot: 'consumable', vendorValue: 3n },
  ];
  for (const item of craftItems) {
    if (findItemTemplateByName(ctx, item.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: item.name,
      slot: item.slot,
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: item.vendorValue,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
}

export function ensureFoodItemTemplates(ctx: any) {
  const foodItems = [
    {
      name: 'Herb Broth',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'mana_regen',
      wellFedBuffMagnitude: 1n,
    },
    {
      name: 'Roasted Roots',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'str',
      wellFedBuffMagnitude: 1n,
    },
    {
      name: "Traveler's Stew",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'stamina_regen',
      wellFedBuffMagnitude: 1n,
    },
    {
      name: "Forager's Salad",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'dex',
      wellFedBuffMagnitude: 1n,
    },
    {
      name: "Healer's Porridge",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'health_regen',
      wellFedBuffMagnitude: 1n,
    },
  ];

  for (const food of foodItems) {
    const existing = findItemTemplateByName(ctx, food.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({
        ...existing,
        wellFedDurationMicros: food.wellFedDurationMicros,
        wellFedBuffType: food.wellFedBuffType,
        wellFedBuffMagnitude: food.wellFedBuffMagnitude,
      });
      continue;
    }
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: food.name,
      slot: 'food',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 3n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: food.wellFedDurationMicros,
      wellFedBuffType: food.wellFedBuffType,
      wellFedBuffMagnitude: food.wellFedBuffMagnitude,
    });
  }
}

export function ensureRecipeTemplates(ctx: any) {
  for (const recipe of CONSUMABLE_RECIPES) {
    const output = findItemTemplateByName(ctx, recipe.outputName);
    const req1 = findItemTemplateByName(ctx, recipe.req1Name);
    const req2 = findItemTemplateByName(ctx, recipe.req2Name);
    const req3 = recipe.req3Name ? findItemTemplateByName(ctx, recipe.req3Name) : undefined;
    addRecipeTemplate(ctx, {
      key: recipe.key,
      name: recipe.name,
      output,
      outputCount: recipe.outputCount,
      req1,
      req1Count: recipe.req1Count,
      req2,
      req2Count: recipe.req2Count,
      req3,
      req3Count: recipe.req3Count,
    });
  }
}

export function ensureAbilityTemplates(ctx: any) {
  // Merge all class abilities into one object
  const ABILITIES = {
    ...CLERIC_ABILITIES,
    ...WARRIOR_ABILITIES,
    ...WIZARD_ABILITIES,
    ...ROGUE_ABILITIES,
    ...RANGER_ABILITIES,
    ...SHAMAN_ABILITIES,
    ...ENCHANTER_ABILITIES,
    ...SUMMONER_ABILITIES,
    ...NECROMANCER_ABILITIES,
    ...BARD_ABILITIES,
    ...BEASTMASTER_ABILITIES,
    ...DRUID_ABILITIES,
    ...PALADIN_ABILITIES,
    ...MONK_ABILITIES,
    ...SPELLBLADE_ABILITIES,
    ...REAVER_ABILITIES,
  };

  // Descriptions are now stored in the database (seeded from ABILITIES entries)
  const resolveDescription = (entry: { name: string; description?: string }) =>
    entry.description ?? entry.name;

  // Keep one canonical row per ability key so client-side lookups do not
  // pick stale duplicates with old cast/cooldown values.
  const seenByKey = new Map<string, any>();
  for (const row of ctx.db.abilityTemplate.iter()) {
    const existing = seenByKey.get(row.key);
    if (!existing) {
      seenByKey.set(row.key, row);
      continue;
    }
    const keep = existing.id <= row.id ? existing : row;
    const drop = keep === existing ? row : existing;
    ctx.db.abilityTemplate.id.delete(drop.id);
    seenByKey.set(row.key, keep);
  }

  const utilityKeys = new Set([
    'ranger_track',
    'druid_natures_mark',
    'cleric_sanctify',
    'wizard_arcane_reservoir',
    'paladin_lay_on_hands',
    'enchanter_veil_of_calm',
    'bard_ballad_of_resolve',
  ]);
  const combatOnlyKeys = new Set([
    'shaman_spirit_wolf',
    'necromancer_bone_servant',
    'beastmaster_call_beast',
    'summoner_earth_familiar',
  ]);
  const outOfCombatOnlyKeys = new Set([
    'druid_natures_mark',
  ]);
  const combatStateFor = (key: string, entry: any) => {
    // Use explicit combatState from ability if provided
    if (entry.combatState) return entry.combatState;
    // Fall back to hardcoded sets
    return combatOnlyKeys.has(key) ? 'combat_only' :
      outOfCombatOnlyKeys.has(key) ? 'out_of_combat_only' :
        'any';
  };
  for (const [key, ability] of Object.entries(ABILITIES)) {
    const entry = ability as {
      name: string;
      className: string;
      resource: string;
      level: bigint;
      castSeconds: bigint;
      cooldownSeconds: bigint;
      description?: string;
      power: bigint;
      damageType: string;
      dotPowerSplit?: number;
      dotDuration?: bigint;
      hotPowerSplit?: number;
      hotDuration?: bigint;
      debuffType?: string;
      debuffMagnitude?: bigint;
      debuffDuration?: bigint;
      aoeTargets?: string;
      combatState?: string;
    };
    const existing = seenByKey.get(key);
    if (existing) {
      ctx.db.abilityTemplate.id.update({
        ...existing,
        key,
        name: entry.name,
        className: entry.className,
        level: entry.level,
        resource: entry.resource,
        castSeconds: entry.castSeconds,
        cooldownSeconds: entry.cooldownSeconds,
        kind: utilityKeys.has(key) ? 'utility' : 'combat',
        combatState: combatStateFor(key, entry),
        description: resolveDescription(entry),
        power: entry.power ?? undefined,
        damageType: entry.damageType ?? undefined,
        statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
        dotPowerSplit: entry.dotPowerSplit ?? undefined,
        dotDuration: entry.dotDuration ?? undefined,
        hotPowerSplit: entry.hotPowerSplit ?? undefined,
        hotDuration: entry.hotDuration ?? undefined,
        debuffType: entry.debuffType ?? undefined,
        debuffMagnitude: entry.debuffMagnitude ?? undefined,
        debuffDuration: entry.debuffDuration ?? undefined,
        aoeTargets: entry.aoeTargets ?? undefined,
      });
      seenByKey.set(key, {
        ...existing,
        key,
        name: entry.name,
        className: entry.className,
        level: entry.level,
        resource: entry.resource,
        castSeconds: entry.castSeconds,
        cooldownSeconds: entry.cooldownSeconds,
        kind: utilityKeys.has(key) ? 'utility' : 'combat',
        combatState: combatStateFor(key, entry),
        description: resolveDescription(entry),
        power: entry.power ?? undefined,
        damageType: entry.damageType ?? undefined,
        statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
        dotPowerSplit: entry.dotPowerSplit ?? undefined,
        dotDuration: entry.dotDuration ?? undefined,
        hotPowerSplit: entry.hotPowerSplit ?? undefined,
        hotDuration: entry.hotDuration ?? undefined,
        debuffType: entry.debuffType ?? undefined,
        debuffMagnitude: entry.debuffMagnitude ?? undefined,
        debuffDuration: entry.debuffDuration ?? undefined,
        aoeTargets: entry.aoeTargets ?? undefined,
      });
      continue;
    }
    const inserted = ctx.db.abilityTemplate.insert({
      id: 0n,
      key,
      name: entry.name,
      className: entry.className,
      level: entry.level,
      resource: entry.resource,
      castSeconds: entry.castSeconds,
      cooldownSeconds: entry.cooldownSeconds,
      kind: utilityKeys.has(key) ? 'utility' : 'combat',
      combatState: combatStateFor(key, entry),
      description: resolveDescription(entry),
      power: entry.power ?? undefined,
      damageType: entry.damageType ?? undefined,
      statScaling: ABILITY_STAT_SCALING[key] ?? undefined,
      dotPowerSplit: entry.dotPowerSplit ?? undefined,
      dotDuration: entry.dotDuration ?? undefined,
      hotPowerSplit: entry.hotPowerSplit ?? undefined,
      hotDuration: entry.hotDuration ?? undefined,
      debuffType: entry.debuffType ?? undefined,
      debuffMagnitude: entry.debuffMagnitude ?? undefined,
      debuffDuration: entry.debuffDuration ?? undefined,
      aoeTargets: entry.aoeTargets ?? undefined,
    });
    seenByKey.set(key, inserted);
  }
}

// ---------------------------------------------------------------------------
// GEAR MATERIAL ITEM TEMPLATES
// Seeds one ItemTemplate per crafting material (slot='resource', stackable=true).
// All 14 materials seeded here: 10 original (Tier 1-3) + 4 Essence variants.
// Iron Ore/Iron Shard: Iron Shard already exists. Iron Ore is a NEW separate template
// with consistent naming for the crafting system.
// ---------------------------------------------------------------------------

export function ensureGearMaterialItemTemplates(ctx: any) {
  for (const mat of MATERIAL_DEFS) {
    if (findItemTemplateByName(ctx, mat.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: mat.name,
      slot: 'resource',
      armorType: 'none',
      rarity: 'common',
      tier: mat.tier,
      isJunk: false,
      vendorValue: mat.vendorValue ?? 1n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
}

// ---------------------------------------------------------------------------
// BASE GEAR TEMPLATES FOR CRAFTING OUTPUT
// Seeds ItemTemplates for gear slots not covered by ensureWorldDropGearTemplates:
// head, wrists, hands, belt, offHand (shield), cloak (via neck slot).
// These are "crafting base" items — common quality, no stats, used as recipe output.
// ---------------------------------------------------------------------------

export function ensureCraftingBaseGearTemplates(ctx: any) {
  const upsertByName = (row: any) => {
    const fullRow = {
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
      weaponType: '',
      magicResistanceBonus: 0n,
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      stackable: false,
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
  };

  // Head slot
  upsertByName({ name: 'Iron Helm', slot: 'head', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n });
  // Wrists slot
  upsertByName({ name: 'Leather Bracers', slot: 'wrists', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n });
  // Hands slot
  upsertByName({ name: 'Iron Gauntlets', slot: 'hands', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n });
  // Belt slot
  upsertByName({ name: 'Rough Girdle', slot: 'belt', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n });
  // OffHand shield
  upsertByName({ name: 'Wooden Shield', slot: 'offHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n });
  // Cloak (neck slot with armorType cloth for identity, armorClassBonus distinguishes from jewelry)
  upsertByName({ name: 'Simple Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n });

  // Cloth other-slot items (AC=2)
  upsertByName({ name: 'Cloth Hood', slot: 'head', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n });
  upsertByName({ name: 'Cloth Wraps', slot: 'wrists', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n });
  upsertByName({ name: 'Cloth Gloves', slot: 'hands', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n });
  upsertByName({ name: 'Cloth Sash', slot: 'belt', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n });

  // Leather other-slot items (AC=3) — head and hands (wrists=Leather Bracers, belt=Rough Girdle already above)
  upsertByName({ name: 'Leather Cap', slot: 'head', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n });
  upsertByName({ name: 'Leather Gloves', slot: 'hands', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n });

  // Chain other-slot items (AC=3)
  upsertByName({ name: 'Chain Coif', slot: 'head', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n });
  upsertByName({ name: 'Chain Bracers', slot: 'wrists', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n });
  upsertByName({ name: 'Chain Gauntlets', slot: 'hands', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n });
  upsertByName({ name: 'Chain Girdle', slot: 'belt', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n });

  // Plate other-slot items (AC=4) — wrists and belt (head=Iron Helm, hands=Iron Gauntlets already above)
  upsertByName({ name: 'Plate Vambraces', slot: 'wrists', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n });
  upsertByName({ name: 'Plate Girdle', slot: 'belt', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n });
}

// ---------------------------------------------------------------------------
// GEAR RECIPE TEMPLATES
// Seeds one RecipeTemplate per gear type (weapon/armor/accessory).
// Material TYPE is chosen by the player at craft time — Plan 02 reducer handles this.
// For seeding, req1 = copper_ore (T1 metallic) with count 4n as base cost.
// req2 = rough_hide (T1 hide) as a secondary material requirement.
// ---------------------------------------------------------------------------

export function ensureGearRecipeTemplates(ctx: any) {
  for (const recipe of GEAR_RECIPES) {
    const output = findItemTemplateByName(ctx, recipe.outputName);
    const req1 = findItemTemplateByName(ctx, recipe.req1Name);
    const req2 = findItemTemplateByName(ctx, recipe.req2Name);
    const req3 = recipe.req3Name ? findItemTemplateByName(ctx, recipe.req3Name) : undefined;
    if (!req1 || !req2) continue;
    addRecipeTemplate(ctx, {
      key: recipe.key,
      name: recipe.name,
      output,
      outputCount: 1n,
      req1,
      req1Count: recipe.req1Count,
      req2,
      req2Count: recipe.req2Count,
      req3,
      req3Count: recipe.req3Count,
      recipeType: recipe.recipeType,
    });
  }
}

// ---------------------------------------------------------------------------
// CRAFTING MODIFIER ITEM TEMPLATES
// Seeds one ItemTemplate per crafting modifier (slot='material', stackable=true).
// These are consumed in the crafting dialog to add stat affixes to crafted gear.
// ---------------------------------------------------------------------------

export function ensureCraftingModifierItemTemplates(ctx: any) {
  for (const mod of CRAFTING_MODIFIER_DEFS) {
    if (findItemTemplateByName(ctx, mod.name)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: mod.name,
      slot: 'material',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
}

// ---------------------------------------------------------------------------
// RECIPE SCROLL ITEM TEMPLATES
// One scroll per gear recipe, used as a "recipe discovery" item.
// Slots: resource, stackable=true, rarity=uncommon, tier=1.
// ---------------------------------------------------------------------------

export function ensureRecipeScrollItemTemplates(ctx: any) {
  for (const recipeName of GEAR_RECIPE_NAMES) {
    const scrollName = `Scroll: ${recipeName}`;
    if (findItemTemplateByName(ctx, scrollName)) continue;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: scrollName,
      slot: 'resource',
      armorType: 'none',
      rarity: 'uncommon',
      tier: 1n,
      isJunk: false,
      vendorValue: 10n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      strBonus: 0n,
      dexBonus: 0n,
      chaBonus: 0n,
      wisBonus: 0n,
      intBonus: 0n,
      hpBonus: 0n,
      manaBonus: 0n,
      armorClassBonus: 0n,
      magicResistanceBonus: 0n,
      weaponBaseDamage: 0n,
      weaponDps: 0n,
      weaponType: '',
      stackable: true,
      wellFedDurationMicros: 0n,
      wellFedBuffType: '',
      wellFedBuffMagnitude: 0n,
    });
  }
}
