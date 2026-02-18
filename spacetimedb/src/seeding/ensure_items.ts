import { SenderError } from 'spacetimedb/server';
import { findItemTemplateByName, STARTER_ARMOR, STARTER_WEAPONS } from '../helpers/items';
import { ItemTemplate } from '../schema/tables';
import { MATERIAL_DEFS } from '../data/crafting_materials';
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
    weaponBaseDamage: 9n,
    weaponDps: 13n,
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
    weaponBaseDamage: 8n,
    weaponDps: 12n,
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
    weaponBaseDamage: 7n,
    weaponDps: 11n,
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
    intBonus: 1n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 5n,
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
    dexBonus: 1n,
    chaBonus: 0n,
    wisBonus: 0n,
    intBonus: 0n,
    hpBonus: 0n,
    manaBonus: 0n,
    armorClassBonus: 6n,
    stackable: false,
  });
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
  const flax = findItemTemplateByName(ctx, 'Flax');
  const herbs = findItemTemplateByName(ctx, 'Herbs');
  const bandage = findItemTemplateByName(ctx, 'Bandage');
  const rawMeat = findItemTemplateByName(ctx, 'Raw Meat');
  const salt = findItemTemplateByName(ctx, 'Salt');
  const simpleRations = findItemTemplateByName(ctx, 'Simple Rations');
  const wood = findItemTemplateByName(ctx, 'Wood');
  const resin = findItemTemplateByName(ctx, 'Resin');
  const torch = findItemTemplateByName(ctx, 'Torch');
  const clearWater = findItemTemplateByName(ctx, 'Clear Water');
  const basicPoultice = findItemTemplateByName(ctx, 'Basic Poultice');
  const travelersTea = findItemTemplateByName(ctx, 'Travelers Tea');
  const stone = findItemTemplateByName(ctx, 'Stone');
  const sand = findItemTemplateByName(ctx, 'Sand');
  const whetstone = findItemTemplateByName(ctx, 'Whetstone');
  const dryGrass = findItemTemplateByName(ctx, 'Dry Grass');
  const kindling = findItemTemplateByName(ctx, 'Kindling Bundle');
  const roughRope = findItemTemplateByName(ctx, 'Rough Rope');
  const charcoal = findItemTemplateByName(ctx, 'Charcoal');
  const bitterHerbs = findItemTemplateByName(ctx, 'Bitter Herbs');
  const crudePoison = findItemTemplateByName(ctx, 'Crude Poison');

  addRecipeTemplate(ctx, {
    key: 'bandage',
    name: 'Bandages',
    output: bandage,
    outputCount: 1n,
    req1: flax,
    req1Count: 1n,
    req2: herbs,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'simple_rations',
    name: 'Simple Rations',
    output: simpleRations,
    outputCount: 1n,
    req1: rawMeat,
    req1Count: 1n,
    req2: salt,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'torch',
    name: 'Torch',
    output: torch,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'basic_poultice',
    name: 'Basic Poultice',
    output: basicPoultice,
    outputCount: 1n,
    req1: herbs,
    req1Count: 1n,
    req2: flax,
    req2Count: 1n,
    req3: clearWater,
    req3Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'travelers_tea',
    name: 'Travelers Tea',
    output: travelersTea,
    outputCount: 1n,
    req1: herbs,
    req1Count: 1n,
    req2: clearWater,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'whetstone',
    name: 'Whetstone',
    output: whetstone,
    outputCount: 1n,
    req1: stone,
    req1Count: 1n,
    req2: sand,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'kindling_bundle',
    name: 'Kindling Bundle',
    output: kindling,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: dryGrass,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'rough_rope',
    name: 'Rough Rope',
    output: roughRope,
    outputCount: 1n,
    req1: flax,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'charcoal',
    name: 'Charcoal',
    output: charcoal,
    outputCount: 1n,
    req1: wood,
    req1Count: 1n,
    req2: stone,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'crude_poison',
    name: 'Crude Poison',
    output: crudePoison,
    outputCount: 1n,
    req1: bitterHerbs,
    req1Count: 1n,
    req2: resin,
    req2Count: 1n,
  });

  const wildBerries = findItemTemplateByName(ctx, 'Wild Berries');
  const rootVegetable = findItemTemplateByName(ctx, 'Root Vegetable');
  const herbBroth = findItemTemplateByName(ctx, 'Herb Broth');
  const roastedRoots = findItemTemplateByName(ctx, 'Roasted Roots');
  const travelerStew = findItemTemplateByName(ctx, "Traveler's Stew");
  const foragerSalad = findItemTemplateByName(ctx, "Forager's Salad");

  addRecipeTemplate(ctx, {
    key: 'herb_broth',
    name: 'Herb Broth',
    output: herbBroth,
    outputCount: 1n,
    req1: wildBerries,
    req1Count: 2n,
    req2: clearWater,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'roasted_roots',
    name: 'Roasted Roots',
    output: roastedRoots,
    outputCount: 1n,
    req1: rootVegetable,
    req1Count: 2n,
    req2: salt,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'travelers_stew',
    name: "Traveler's Stew",
    output: travelerStew,
    outputCount: 1n,
    req1: rootVegetable,
    req1Count: 1n,
    req2: rawMeat,
    req2Count: 1n,
  });
  addRecipeTemplate(ctx, {
    key: 'foragers_salad',
    name: "Forager's Salad",
    output: foragerSalad,
    outputCount: 1n,
    req1: wildBerries,
    req1Count: 1n,
    req2: herbs,
    req2Count: 1n,
  });
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
// All 13 materials seeded here: 10 original (Tier 1-3) + 3 Essence variants.
// Iron Ore/Iron Shard: Iron Shard already exists. Iron Ore is a NEW separate template
// with consistent naming for the crafting system.
// ---------------------------------------------------------------------------

export function ensureGearMaterialItemTemplates(ctx: any) {
  const upsertMaterial = (args: {
    name: string;
    tier: bigint;
    vendorValue: bigint;
  }) => {
    if (findItemTemplateByName(ctx, args.name)) return;
    ctx.db.itemTemplate.insert({
      id: 0n,
      name: args.name,
      slot: 'resource',
      armorType: 'none',
      rarity: 'common',
      tier: args.tier,
      isJunk: false,
      vendorValue: args.vendorValue,
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
  };

  // Tier 1 (all T1 materials including Copper Ore)
  upsertMaterial({ name: 'Copper Ore', tier: 1n, vendorValue: 2n });
  upsertMaterial({ name: 'Rough Hide', tier: 1n, vendorValue: 2n });
  upsertMaterial({ name: 'Bone Shard', tier: 1n, vendorValue: 2n });

  // Tier 2 (Iron Ore is new — Iron Shard already exists but is a different item)
  upsertMaterial({ name: 'Iron Ore', tier: 2n, vendorValue: 4n });
  upsertMaterial({ name: 'Tanned Leather', tier: 2n, vendorValue: 4n });
  upsertMaterial({ name: 'Spirit Essence', tier: 2n, vendorValue: 5n });

  // Tier 3
  upsertMaterial({ name: 'Darksteel Ore', tier: 3n, vendorValue: 8n });
  upsertMaterial({ name: 'Moonweave Cloth', tier: 3n, vendorValue: 8n });
  upsertMaterial({ name: 'Shadowhide', tier: 3n, vendorValue: 8n });
  upsertMaterial({ name: 'Void Crystal', tier: 3n, vendorValue: 10n });

  // Essence (required for gear crafting, drop-only)
  upsertMaterial({ name: 'Essence I', tier: 1n, vendorValue: 3n });
  upsertMaterial({ name: 'Essence II', tier: 2n, vendorValue: 6n });
  upsertMaterial({ name: 'Essence III', tier: 3n, vendorValue: 12n });
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
  upsertByName({ name: 'Leather Bracers', slot: 'wrists', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 3n });
  // Hands slot
  upsertByName({ name: 'Iron Gauntlets', slot: 'hands', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n });
  // Belt slot
  upsertByName({ name: 'Rough Girdle', slot: 'belt', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 3n });
  // OffHand shield
  upsertByName({ name: 'Wooden Shield', slot: 'offHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n });
  // Cloak (neck slot with armorType cloth for identity, armorClassBonus distinguishes from jewelry)
  upsertByName({ name: 'Simple Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n });
}

// ---------------------------------------------------------------------------
// GEAR RECIPE TEMPLATES
// Seeds one RecipeTemplate per gear type (weapon/armor/accessory).
// Material TYPE is chosen by the player at craft time — Plan 02 reducer handles this.
// For seeding, req1 = copper_ore (T1 metallic) with count 4n as base cost.
// req2 = rough_hide (T1 hide) as a secondary material requirement.
// ---------------------------------------------------------------------------

export function ensureGearRecipeTemplates(ctx: any) {
  const copperOre = findItemTemplateByName(ctx, 'Copper Ore');
  const roughHide = findItemTemplateByName(ctx, 'Rough Hide');
  const essenceI = findItemTemplateByName(ctx, 'Essence I');
  if (!copperOre || !roughHide) return; // materials must be seeded first

  // Weapons (mainHand)
  addRecipeTemplate(ctx, { key: 'craft_longsword', name: 'Longsword', output: findItemTemplateByName(ctx, 'Iron Shortsword'), outputCount: 1n, req1: copperOre, req1Count: 4n, req2: roughHide, req2Count: 1n, req3: essenceI, req3Count: 1n, recipeType: 'weapon' });
  addRecipeTemplate(ctx, { key: 'craft_dagger', name: 'Dagger', output: findItemTemplateByName(ctx, 'Chipped Dagger'), outputCount: 1n, req1: copperOre, req1Count: 3n, req2: roughHide, req2Count: 1n, req3: essenceI, req3Count: 1n, recipeType: 'weapon' });
  addRecipeTemplate(ctx, { key: 'craft_staff', name: 'Staff', output: findItemTemplateByName(ctx, 'Gnarled Staff'), outputCount: 1n, req1: copperOre, req1Count: 2n, req2: roughHide, req2Count: 2n, req3: essenceI, req3Count: 1n, recipeType: 'weapon' });
  addRecipeTemplate(ctx, { key: 'craft_mace', name: 'Mace', output: findItemTemplateByName(ctx, 'Worn Mace'), outputCount: 1n, req1: copperOre, req1Count: 4n, req2: roughHide, req2Count: 1n, req3: essenceI, req3Count: 1n, recipeType: 'weapon' });
  // OffHand
  addRecipeTemplate(ctx, { key: 'craft_shield', name: 'Shield', output: findItemTemplateByName(ctx, 'Wooden Shield'), outputCount: 1n, req1: copperOre, req1Count: 3n, req2: roughHide, req2Count: 2n, req3: essenceI, req3Count: 1n, recipeType: 'weapon' });

  // Armor
  addRecipeTemplate(ctx, { key: 'craft_helm', name: 'Helm', output: findItemTemplateByName(ctx, 'Iron Helm'), outputCount: 1n, req1: copperOre, req1Count: 3n, req2: roughHide, req2Count: 1n, req3: essenceI, req3Count: 1n, recipeType: 'armor' });
  addRecipeTemplate(ctx, { key: 'craft_breastplate', name: 'Breastplate', output: findItemTemplateByName(ctx, 'Battered Cuirass'), outputCount: 1n, req1: copperOre, req1Count: 4n, req2: roughHide, req2Count: 2n, req3: essenceI, req3Count: 1n, recipeType: 'armor' });
  addRecipeTemplate(ctx, { key: 'craft_bracers', name: 'Bracers', output: findItemTemplateByName(ctx, 'Leather Bracers'), outputCount: 1n, req1: copperOre, req1Count: 2n, req2: roughHide, req2Count: 2n, req3: essenceI, req3Count: 1n, recipeType: 'armor' });
  addRecipeTemplate(ctx, { key: 'craft_gauntlets', name: 'Gauntlets', output: findItemTemplateByName(ctx, 'Iron Gauntlets'), outputCount: 1n, req1: copperOre, req1Count: 3n, req2: roughHide, req2Count: 1n, req3: essenceI, req3Count: 1n, recipeType: 'armor' });
  addRecipeTemplate(ctx, { key: 'craft_girdle', name: 'Girdle', output: findItemTemplateByName(ctx, 'Rough Girdle'), outputCount: 1n, req1: copperOre, req1Count: 2n, req2: roughHide, req2Count: 2n, req3: essenceI, req3Count: 1n, recipeType: 'armor' });
  addRecipeTemplate(ctx, { key: 'craft_greaves', name: 'Greaves', output: findItemTemplateByName(ctx, 'Dented Greaves'), outputCount: 1n, req1: copperOre, req1Count: 4n, req2: roughHide, req2Count: 2n, req3: essenceI, req3Count: 1n, recipeType: 'armor' });
  addRecipeTemplate(ctx, { key: 'craft_sabatons', name: 'Sabatons', output: findItemTemplateByName(ctx, 'Dented Sabatons'), outputCount: 1n, req1: copperOre, req1Count: 3n, req2: roughHide, req2Count: 2n, req3: essenceI, req3Count: 1n, recipeType: 'armor' });

  // Accessories
  addRecipeTemplate(ctx, { key: 'craft_ring', name: 'Ring', output: findItemTemplateByName(ctx, 'Copper Band'), outputCount: 1n, req1: copperOre, req1Count: 2n, req2: roughHide, req2Count: 1n, req3: essenceI, req3Count: 1n, recipeType: 'accessory' });
  addRecipeTemplate(ctx, { key: 'craft_amulet', name: 'Amulet', output: findItemTemplateByName(ctx, 'Stone Pendant'), outputCount: 1n, req1: copperOre, req1Count: 2n, req2: roughHide, req2Count: 1n, req3: essenceI, req3Count: 1n, recipeType: 'accessory' });
  addRecipeTemplate(ctx, { key: 'craft_cloak', name: 'Cloak', output: findItemTemplateByName(ctx, 'Simple Cloak'), outputCount: 1n, req1: copperOre, req1Count: 1n, req2: roughHide, req2Count: 3n, req3: essenceI, req3Count: 1n, recipeType: 'accessory' });
}

// ---------------------------------------------------------------------------
// RECIPE SCROLL ITEM TEMPLATES
// One scroll per gear recipe, used as a "recipe discovery" item.
// Slots: resource, stackable=true, rarity=uncommon, tier=1.
// ---------------------------------------------------------------------------

// List of gear recipe names — must match recipe names in ensureGearRecipeTemplates
const GEAR_RECIPE_NAMES = [
  'Longsword', 'Dagger', 'Staff', 'Mace', 'Shield',
  'Helm', 'Breastplate', 'Bracers', 'Gauntlets', 'Girdle', 'Greaves', 'Sabatons',
  'Ring', 'Amulet', 'Cloak',
];

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
