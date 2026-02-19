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

  const STARTER_ARMOR_DESC: Record<string, string> = {
    cloth: 'Threadbare cloth garments offering minimal protection. Standard issue for new adventurers.',
    leather: 'Scuffed leather armor worn thin by previous owners. Better than nothing.',
    chain: 'Dented chain mail that still turns a blade. Issued to melee recruits.',
    plate: 'Battered plate armor, dented but functional. Heavy protection for frontline fighters.',
  };

  for (const [armorType, pieces] of Object.entries(STARTER_ARMOR)) {
    const armorDesc = STARTER_ARMOR_DESC[armorType] ?? '';
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
      description: armorDesc,
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
      description: armorDesc,
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
      description: armorDesc,
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

  const weaponTemplates: Record<string, { name: string; allowed: string; weaponType: string; description: string }> = {
    'Training Sword': { name: 'Training Sword', allowed: 'warrior', weaponType: 'sword', description: 'A blunt practice sword. Barely adequate for real combat.' },
    'Training Mace': { name: 'Training Mace', allowed: 'paladin,cleric', weaponType: 'mace', description: 'A weighted training mace. Clumsy but functional.' },
    'Training Staff': {
      name: 'Training Staff',
      allowed: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard',
      weaponType: 'staff',
      description: 'A worn wooden staff. Channels magic adequately for beginners.',
    },
    'Training Bow': { name: 'Training Bow', allowed: 'ranger', weaponType: 'bow', description: 'A simple shortbow with fraying string. Accurate enough at short range.' },
    'Training Dagger': { name: 'Training Dagger', allowed: 'rogue', weaponType: 'dagger', description: 'A dull practice dagger. Quick in the right hands.' },
    'Training Axe': { name: 'Training Axe', allowed: 'beastmaster', weaponType: 'axe', description: 'A notched training axe. Heavy enough to do damage.' },
    'Training Blade': { name: 'Training Blade', allowed: 'spellblade,reaver', weaponType: 'blade', description: 'A thin practice blade balanced for dual-discipline fighting.' },
    'Training Rapier': { name: 'Training Rapier', allowed: 'bard', weaponType: 'rapier', description: 'A flexible practice rapier. Light and swift.' },
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
      description: weapon.description,
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
    { name: 'Rough Band', slot: 'earrings', rarity: 'common', stat: { dexBonus: 1n }, description: 'A crude copper ring. Mildly enhances agility.' },
    { name: 'Worn Cloak', slot: 'cloak', rarity: 'common', stat: { hpBonus: 3n }, description: 'A tattered traveling cloak. Provides slight warmth and protection.' },
    { name: 'Traveler Necklace', slot: 'neck', rarity: 'common', stat: { wisBonus: 1n }, description: 'A simple cord with a polished stone. Said to bring wisdom.' },
    { name: 'Glimmer Ring', slot: 'earrings', rarity: 'uncommon', stat: { intBonus: 1n }, description: 'A ring set with a tiny glowing crystal. Faintly enhances focus.' },
    { name: 'Shaded Cloak', slot: 'cloak', rarity: 'uncommon', stat: { dexBonus: 1n }, description: 'A dark hooded cloak favored by scouts. Improves nimbleness.' },
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
      description: template.description,
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
    { name: 'Rat Tail', vendorValue: 1n, description: 'A scaly rat tail. Worthless except to a vendor.' },
    { name: 'Torn Pelt', vendorValue: 2n, description: 'A ragged piece of animal skin. Too damaged for leatherworking.' },
    { name: 'Cracked Fang', vendorValue: 1n, description: 'A broken tooth from some creature. Might fetch a coin or two.' },
    { name: 'Ashen Bone', vendorValue: 2n, description: 'A charred bone fragment. Only a vendor would want this.' },
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
      description: junk.description,
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
  upsertByName({ name: 'Iron Shortsword', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,spellblade,reaver', weaponType: 'sword', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A serviceable iron blade. Reliable in close quarters.' });
  upsertByName({ name: 'Hunting Bow', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'ranger', weaponType: 'bow', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A sturdy bow designed for woodland game. Pulls smoothly.' });
  upsertByName({ name: 'Gnarled Staff', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard', weaponType: 'staff', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A twisted wooden staff thrumming with latent energy.' });
  upsertByName({ name: 'Worn Mace', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'paladin,cleric', weaponType: 'mace', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A heavy flanged mace showing signs of hard use.' });
  upsertByName({ name: 'Rusty Axe', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'beastmaster', weaponType: 'axe', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A broad axe dulled by rust but still fearsome.' });
  upsertByName({ name: 'Notched Rapier', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'bard', weaponType: 'rapier', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A slender rapier with a chipped edge. Fast and precise.' });
  upsertByName({ name: 'Chipped Dagger', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'rogue', weaponType: 'dagger', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A small blade with a nicked edge. Quick draw, quick strike.' });
  upsertByName({ name: 'Cracked Blade', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'spellblade,reaver', weaponType: 'blade', weaponBaseDamage: 4n, weaponDps: 6n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A fractured sword that channels both steel and sorcery.' });

  // Tier 2 weapons (requiredLevel: 11n)
  upsertByName({ name: 'Steel Longsword', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,spellblade,reaver', weaponType: 'sword', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'Forged steel with a keen edge. A significant upgrade over iron.' });
  upsertByName({ name: 'Yew Bow', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'ranger', weaponType: 'bow', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A flexible yew bow with superior range and draw weight.' });
  upsertByName({ name: 'Oak Staff', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'enchanter,necromancer,summoner,druid,shaman,monk,wizard', weaponType: 'staff', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A dense oak staff carved with faint runes.' });

  // Tier 1 armor — cloth
  upsertByName({ name: 'Worn Robe', slot: 'chest', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false, description: 'A faded cloth robe. Offers little physical protection.' });
  upsertByName({ name: 'Worn Trousers', slot: 'legs', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 2n, stackable: false, description: 'Patched cloth leggings. Light and breathable.' });
  upsertByName({ name: 'Worn Slippers', slot: 'boots', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 2n, stackable: false, description: 'Thin-soled cloth shoes. Quiet on stone floors.' });

  // Tier 1 armor — leather
  upsertByName({ name: 'Scuffed Jerkin', slot: 'chest', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false, description: 'A leather vest scarred by use. Decent protection for light fighters.' });
  upsertByName({ name: 'Scuffed Leggings', slot: 'legs', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false, description: 'Leather leggings with reinforced knees.' });
  upsertByName({ name: 'Scuffed Boots', slot: 'boots', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false, description: 'Sturdy leather boots built for rough terrain.' });

  // Tier 1 armor — chain
  upsertByName({ name: 'Dented Hauberk', slot: 'chest', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 5n, stackable: false, description: 'Chain mail with bent links. Still deflects slashing blows.' });
  upsertByName({ name: 'Dented Greaves', slot: 'legs', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false, description: 'Chain leggings with dented rings. Functional leg protection.' });
  upsertByName({ name: 'Dented Sabatons', slot: 'boots', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false, description: 'Chain boots that clank with every step.' });

  // Tier 1 armor — plate
  upsertByName({ name: 'Battered Cuirass', slot: 'chest', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 6n, stackable: false, description: 'Heavy plate chest armor, dented but intact.' });
  upsertByName({ name: 'Battered Greaves', slot: 'legs', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 5n, stackable: false, description: 'Plate leg guards battered from many battles.' });
  upsertByName({ name: 'Battered Boots', slot: 'boots', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false, description: 'Thick plate boots that absorb heavy impacts.' });

  // Tier 2 armor (requiredLevel: 11n)
  upsertByName({ name: 'Silken Robe', slot: 'chest', armorType: 'cloth', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false, description: 'Fine silk woven for comfort and moderate protection.' });
  upsertByName({ name: 'Ranger Jerkin', slot: 'chest', armorType: 'leather', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 5n, stackable: false, description: 'Supple leather armor favored by woodsmen.' });

  // Tier 2 armor — cloth legs/boots
  upsertByName({ name: 'Silken Trousers', slot: 'legs', armorType: 'cloth', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false, description: 'Light silk leggings tailored for mobility.' });
  upsertByName({ name: 'Silken Slippers', slot: 'boots', armorType: 'cloth', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 10n, requiredLevel: 11n, allowedClasses: 'any', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 3n, stackable: false, description: 'Soft silk shoes that barely make a sound.' });

  // Tier 2 armor — leather legs/boots
  upsertByName({ name: 'Ranger Leggings', slot: 'legs', armorType: 'leather', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false, description: 'Reinforced leather leggings for wilderness travel.' });
  upsertByName({ name: 'Ranger Boots', slot: 'boots', armorType: 'leather', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 10n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false, description: 'Leather boots with thick soles for rough trails.' });

  // Tier 2 armor — chain chest/legs/boots
  upsertByName({ name: 'Riveted Hauberk', slot: 'chest', armorType: 'chain', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 6n, stackable: false, description: 'Chain mail reinforced with riveted links. Sturdy protection.' });
  upsertByName({ name: 'Riveted Greaves', slot: 'legs', armorType: 'chain', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 5n, stackable: false, description: 'Riveted chain leggings that resist cutting blows.' });
  upsertByName({ name: 'Riveted Sabatons', slot: 'boots', armorType: 'chain', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 4n, stackable: false, description: 'Heavy chain boots with reinforced toe caps.' });

  // Tier 2 armor — plate chest/legs/boots
  upsertByName({ name: 'Forged Cuirass', slot: 'chest', armorType: 'plate', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 18n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 7n, stackable: false, description: 'Expertly forged plate armor. Superior physical defense.' });
  upsertByName({ name: 'Forged Greaves', slot: 'legs', armorType: 'plate', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 6n, stackable: false, description: 'Thick forged plate leggings. Absorbs punishing blows.' });
  upsertByName({ name: 'Forged Boots', slot: 'boots', armorType: 'plate', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 14n, requiredLevel: 11n, allowedClasses: 'warrior,paladin,bard,cleric', weaponBaseDamage: 0n, weaponDps: 0n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 5n, stackable: false, description: 'Plate boots forged from high-quality steel.' });

  // Tier 2 weapons — remaining types
  upsertByName({ name: 'Flanged Mace', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'paladin,cleric', weaponType: 'mace', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A reinforced mace with protruding flanges for armor-piercing strikes.' });
  upsertByName({ name: 'Hardened Axe', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'beastmaster', weaponType: 'axe', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A tempered axe head on an ironwood haft. Cleaves deep.' });
  upsertByName({ name: 'Stiletto', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'rogue', weaponType: 'dagger', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A needle-thin blade designed for finding gaps in armor.' });
  upsertByName({ name: 'Dueling Rapier', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'bard', weaponType: 'rapier', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'An elegant thrusting sword favored by duelists.' });
  upsertByName({ name: 'Tempered Blade', slot: 'mainHand', armorType: 'none', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 12n, requiredLevel: 11n, allowedClasses: 'spellblade,reaver', weaponType: 'blade', weaponBaseDamage: 5n, weaponDps: 7n, strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, stackable: false, description: 'A balanced blade forged for hybrid combat styles.' });
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
  upsertByName({ name: 'Copper Band', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 1n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A simple copper ring. Lends a touch of might.' });
  upsertByName({ name: 'Iron Signet', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 1n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A plain iron ring stamped with an unknown crest. Sharpens reflexes.' });
  upsertByName({ name: 'Tarnished Loop', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 1n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A tarnished silver loop. Hums faintly with arcane resonance.' });
  upsertByName({ name: 'Stone Pendant', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 1n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A smooth river stone on a leather cord. Calms the mind.' });
  upsertByName({ name: 'Bone Charm', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 3n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A carved bone talisman said to fortify the body.' });
  upsertByName({ name: 'Frayed Cord', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 3n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A braided cord set with a pale bead. Draws mana to the wearer.' });

  // Tier 2 jewelry (requiredLevel: 11n, tier: 2n)
  upsertByName({ name: 'Silver Band', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', strBonus: 2n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A polished silver ring. Channels physical power.' });
  upsertByName({ name: 'Arcane Loop', slot: 'earrings', armorType: 'none', rarity: 'uncommon', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 2n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A ring inscribed with glowing sigils. Amplifies magical focus.' });
  upsertByName({ name: 'Ember Pendant', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 2n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A pendant holding a warm ember crystal. Sharpens intuition.' });
  upsertByName({ name: 'Vitality Cord', slot: 'neck', armorType: 'none', rarity: 'uncommon', tier: 2n, isJunk: false, vendorValue: 16n, requiredLevel: 11n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 6n, manaBonus: 0n, armorClassBonus: 0n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A thick cord woven with life-thread. Bolsters constitution.' });

  // Tier 1 cloaks
  upsertByName({ name: 'Rough Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 8n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 2n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A coarse woolen cloak. Keeps the chill off.' });
  upsertByName({ name: 'Wool Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 8n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 2n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A thick wool cloak. Warmth and slight protection.' });
  upsertByName({ name: 'Drifter Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 8n, requiredLevel: 1n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 2n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A road-worn cloak patched many times over.' });

  // Tier 2 cloaks
  upsertByName({ name: 'Reinforced Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 18n, requiredLevel: 11n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 2n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A cloak with leather panels sewn into the lining.' });
  upsertByName({ name: 'Stalker Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 2n, isJunk: false, vendorValue: 18n, requiredLevel: 11n, allowedClasses: 'any', strBonus: 0n, dexBonus: 0n, chaBonus: 0n, wisBonus: 0n, intBonus: 0n, hpBonus: 0n, manaBonus: 0n, armorClassBonus: 2n, weaponBaseDamage: 0n, weaponDps: 0n, stackable: false, description: 'A dark cloak designed to blend into shadows.' });
}

export function ensureResourceItemTemplates(ctx: any) {
  const upsertResourceByName = (row: any) => {
    const fullRow = {
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
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
      ...row,
    };
    const existing = findItemTemplateByName(ctx, fullRow.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
      return existing;
    }
    return ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
  };

  const resources = [
    { name: 'Flax', slot: 'resource', vendorValue: 1n, description: 'Long fibrous stalks used to weave cloth and rope.' },
    { name: 'Herbs', slot: 'resource', vendorValue: 1n, description: 'Common medicinal plants gathered from wild growth.' },
    { name: 'Wood', slot: 'resource', vendorValue: 1n, description: 'Rough-cut timber suitable for torches and simple tools.' },
    { name: 'Resin', slot: 'resource', vendorValue: 1n, description: 'Sticky tree sap that serves as a natural adhesive and fuel.' },
    { name: 'Stone', slot: 'resource', vendorValue: 1n, description: 'A chunk of sturdy rock used for grinding and sharpening.' },
    { name: 'Raw Meat', slot: 'resource', vendorValue: 1n, description: 'Uncooked animal flesh. Cook it before eating or it may cause illness.' },
    { name: 'Salt', slot: 'resource', vendorValue: 1n, description: 'Coarse mineral salt used to preserve food and season rations.' },
    { name: 'Clear Water', slot: 'resource', vendorValue: 1n, description: 'Fresh water drawn from a clean spring.' },
    { name: 'Sand', slot: 'resource', vendorValue: 1n, description: 'Fine-grained sand useful for polishing and abrasion.' },
    { name: 'Dry Grass', slot: 'resource', vendorValue: 1n, description: 'Brittle dried grass that catches fire easily.' },
    { name: 'Bitter Herbs', slot: 'resource', vendorValue: 1n, description: 'Pungent wild herbs with toxic properties. Handle with care.' },
    { name: 'Peat', slot: 'resource', vendorValue: 1n, description: 'Dense organic soil that burns slowly. Used in crude fire-starting.' },
    { name: 'Mushrooms', slot: 'resource', vendorValue: 1n, description: 'Earthy fungi foraged from damp places.' },
    { name: 'Murky Water', slot: 'resource', vendorValue: 1n, description: 'Brackish water from a stagnant source. Not fit for drinking as-is.' },
    { name: 'Iron Shard', slot: 'resource', vendorValue: 2n, description: 'A small fragment of rusted iron. Retains enough metal for minor crafting.' },
    { name: 'Ancient Dust', slot: 'resource', vendorValue: 2n, description: 'Fine powder sifted from old ruins. Carries faint traces of enchantment.' },
    { name: 'Scrap Cloth', slot: 'resource', vendorValue: 1n, description: 'Torn fabric scraps salvaged from the wilds.' },
    { name: 'Lamp Oil', slot: 'resource', vendorValue: 1n, description: 'Rendered animal fat that burns cleanly in lanterns.' },
    { name: 'Wild Berries', slot: 'resource', vendorValue: 1n, description: 'Tart wild berries picked from roadside bushes. Edible raw or cooked.' },
    { name: 'Root Vegetable', slot: 'resource', vendorValue: 1n, description: 'A starchy tuber dug from soft earth. Filling when roasted.' },
  ];
  for (const resource of resources) {
    upsertResourceByName({ name: resource.name, slot: resource.slot, vendorValue: resource.vendorValue, description: resource.description });
  }

  upsertResourceByName({ name: 'Bandage', slot: 'consumable', vendorValue: 2n, description: 'Strips of clean cloth used to bind wounds. Restores a small amount of health.' });

  const craftItems = [
    { name: 'Simple Rations', slot: 'consumable', vendorValue: 2n, description: 'Basic preserved food. Staves off hunger but grants no special effects.' },
    { name: 'Torch', slot: 'utility', vendorValue: 2n, description: 'A wooden shaft wrapped in oil-soaked cloth. Provides light in dark places.' },
    { name: 'Basic Poultice', slot: 'consumable', vendorValue: 2n, description: 'A moist herbal compress that speeds natural healing.' },
    { name: 'Travelers Tea', slot: 'consumable', vendorValue: 2n, description: 'A warm herbal infusion that restores stamina on the road.' },
    { name: 'Whetstone', slot: 'utility', vendorValue: 2n, description: 'A coarse grinding stone used to sharpen blades before battle.' },
    { name: 'Kindling Bundle', slot: 'utility', vendorValue: 1n, description: 'A bundle of dry twigs and bark. Starts campfires quickly.' },
    { name: 'Rough Rope', slot: 'utility', vendorValue: 2n, description: 'Braided plant fibers twisted into a sturdy rope.' },
    { name: 'Charcoal', slot: 'resource', vendorValue: 1n, description: 'Blackened wood remnants. Burns hotter than raw timber.' },
    { name: 'Crude Poison', slot: 'consumable', vendorValue: 3n, description: 'A noxious paste distilled from bitter herbs. Applied to weapon edges.' },
  ];
  for (const item of craftItems) {
    upsertResourceByName({ name: item.name, slot: item.slot, vendorValue: item.vendorValue, description: item.description });
  }
}

export function ensureFoodItemTemplates(ctx: any) {
  const foodItems = [
    {
      name: 'Herb Broth',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'mana_regen',
      wellFedBuffMagnitude: 1n,
      description: 'A fragrant broth steeped with wild herbs. Boosts mana regeneration while Well Fed.',
    },
    {
      name: 'Roasted Roots',
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'str',
      wellFedBuffMagnitude: 1n,
      description: 'Hearty roasted tubers seasoned with salt. Boosts strength while Well Fed.',
    },
    {
      name: "Traveler's Stew",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'stamina_regen',
      wellFedBuffMagnitude: 1n,
      description: 'A thick stew of meat and vegetables. Boosts stamina regeneration while Well Fed.',
    },
    {
      name: "Forager's Salad",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'dex',
      wellFedBuffMagnitude: 1n,
      description: 'A crisp mix of berries and greens. Boosts dexterity while Well Fed.',
    },
    {
      name: "Healer's Porridge",
      wellFedDurationMicros: 2_700_000_000n,
      wellFedBuffType: 'health_regen',
      wellFedBuffMagnitude: 1n,
      description: 'A soothing oat porridge infused with restorative herbs. Boosts health regeneration while Well Fed.',
    },
  ];

  for (const food of foodItems) {
    const existing = findItemTemplateByName(ctx, food.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({
        ...existing,
        description: food.description,
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
      description: food.description,
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
    const fullRow = {
      name: mat.name,
      slot: 'resource',
      armorType: 'none',
      rarity: 'common',
      tier: mat.tier,
      isJunk: false,
      vendorValue: mat.vendorValue ?? 1n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: mat.description,
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
    };
    const existing = findItemTemplateByName(ctx, mat.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
      continue;
    }
    ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
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
  upsertByName({ name: 'Iron Helm', slot: 'head', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'A basic iron helm. Protects the skull from overhead blows.' });
  // Wrists slot
  upsertByName({ name: 'Leather Bracers', slot: 'wrists', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'Simple leather wrist guards. Deflect glancing strikes.' });
  // Hands slot
  upsertByName({ name: 'Iron Gauntlets', slot: 'hands', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'Heavy iron hand protection. Adds weight behind punches.' });
  // Belt slot
  upsertByName({ name: 'Rough Girdle', slot: 'belt', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'A leather belt reinforced with metal studs.' });
  // OffHand shield
  upsertByName({ name: 'Wooden Shield', slot: 'offHand', armorType: 'none', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 5n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'A round wooden shield banded with iron.' });
  // Cloak (neck slot with armorType cloth for identity, armorClassBonus distinguishes from jewelry)
  upsertByName({ name: 'Simple Cloak', slot: 'neck', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 6n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A plain travelling cloak offering minimal coverage.' });

  // Cloth other-slot items (AC=2)
  upsertByName({ name: 'Cloth Hood', slot: 'head', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A simple cloth hood. Keeps sun and rain at bay.' });
  upsertByName({ name: 'Cloth Wraps', slot: 'wrists', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'Strips of cloth wound around the wrists. Barely protective.' });
  upsertByName({ name: 'Cloth Gloves', slot: 'hands', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'Thin cloth gloves. Dexterous but fragile.' });
  upsertByName({ name: 'Cloth Sash', slot: 'belt', armorType: 'cloth', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 2n, requiredLevel: 1n, allowedClasses: 'any', armorClassBonus: 2n, description: 'A cloth belt tied at the waist. Decorative more than defensive.' });

  // Leather other-slot items (AC=3)
  upsertByName({ name: 'Leather Cap', slot: 'head', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'A molded leather cap. Lightweight head protection.' });
  upsertByName({ name: 'Leather Gloves', slot: 'hands', armorType: 'leather', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,rogue,monk,spellblade,reaver,beastmaster,druid', armorClassBonus: 3n, description: 'Fitted leather gloves for grip and protection.' });

  // Chain other-slot items (AC=3)
  upsertByName({ name: 'Chain Coif', slot: 'head', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'A chain mail hood covering head and neck.' });
  upsertByName({ name: 'Chain Bracers', slot: 'wrists', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'Chain mail wrist guards. Sturdy against slashing attacks.' });
  upsertByName({ name: 'Chain Gauntlets', slot: 'hands', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'Chain mail gloves offering good hand protection.' });
  upsertByName({ name: 'Chain Girdle', slot: 'belt', armorType: 'chain', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 3n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,ranger,shaman,bard,cleric,spellblade,reaver', armorClassBonus: 3n, description: 'A chain mail belt reinforcing the midsection.' });

  // Plate other-slot items (AC=4)
  upsertByName({ name: 'Plate Vambraces', slot: 'wrists', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'Plate wrist guards. Heavy but nearly impenetrable.' });
  upsertByName({ name: 'Plate Girdle', slot: 'belt', armorType: 'plate', rarity: 'common', tier: 1n, isJunk: false, vendorValue: 4n, requiredLevel: 1n, allowedClasses: 'warrior,paladin,bard,cleric', armorClassBonus: 4n, description: 'A broad plate belt protecting the midsection.' });
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
    const fullRow = {
      name: mod.name,
      slot: 'material',
      armorType: 'none',
      rarity: 'common',
      tier: 1n,
      isJunk: false,
      vendorValue: 5n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: mod.description,
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
    };
    const existing = findItemTemplateByName(ctx, mod.name);
    if (existing) {
      ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
      continue;
    }
    ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
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
    const fullRow = {
      name: scrollName,
      slot: 'resource',
      armorType: 'none',
      rarity: 'uncommon',
      tier: 1n,
      isJunk: false,
      vendorValue: 10n,
      requiredLevel: 1n,
      allowedClasses: 'any',
      description: `Teaches the ${recipeName} crafting recipe when used.`,
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
    };
    const existing = findItemTemplateByName(ctx, scrollName);
    if (existing) {
      ctx.db.itemTemplate.id.update({ ...existing, ...fullRow, id: existing.id });
      continue;
    }
    ctx.db.itemTemplate.insert({ id: 0n, ...fullRow });
  }
}
