// ============================================================================
// Victory loot (Phase 51.3): what one kill drops for one character
// ============================================================================
//
// Replaces the deleted loot-table path of reducers/combat.ts (findLootTable / generateLootTemplates /
// rollGold). That path read `loot_table`, which has had zero rows since v2.0, so kills dropped nothing.
//
// Rules of this module:
//   - One seed per combat_enemy row: lootSeed(timestamp, characterId, combatEnemyId). Two enemies of one
//     template in one fight roll independently (the old seed was timestamp + character id for all).
//   - Each roll has its own ROLL_INDEX (data/economy_rules.ts): pick count, picks, gear chance, gear pick,
//     rarity, craft quality, affixes, gold, essence, modifier, scroll. No additive seed offsets, so a gear
//     drop's rarity no longer follows its gear roll.
//   - The dials (global, the fight region's override, per-item pins) are read once per victory, in
//     buildVictoryLootContext, and every roll reads them from there.
//   - An enemy with enemy_loot_entry rows (its AI loot table) picks its commons from those rows; one
//     without picks from the rule-based fallback pool (junk, matching drop materials, own-region
//     materials). Its gear draws from its AI gear entry plus the level-fit fallback gear pool.
//   - Legendary only from a boss or a fight-exact named foe. The named boost marks ONE combat_enemy row
//     per named_enemy row (fightNamedEnemyRowIds), never every enemy of the named template (review WR-01).
//   - Duck-typed `ctx: any` (a reducer ctx). Never throws on missing rows: handleVictory runs inside
//     isolateRoundStep, and a throw there closes the fight without rewards.
// ============================================================================

import {
  ROLL_INDEX,
  SCROLL_DROP_BASE_PCT,
  SCROLL_TIER_WEIGHTS,
  ESSENCE_CHANCE_PCT,
  MODIFIER_CHANCE_PCT,
  creatureProfile,
  economyRoll,
  fallbackCommonPool,
  gearChancePct,
  gearPoolWeight,
  goldReward,
  isQuestRewardName,
  jewelryFloor,
  lootSeed,
  pickCount,
  pickWeighted,
  pickWithoutReplacement,
  pinPct,
  pinnedChanceHit,
  pinWeights,
  rarityMix,
  rollBelow,
  rollRarity,
  scaleWeights,
  scaledChancePct,
  zoneTierOf,
  type EffectiveDials,
  type WeightedEntry,
} from '../data/economy_rules';
import { loadEffectiveDials, loadItemPins } from './economy_state';
import { generateAffixData, rollQualityForDrop } from './items';
import { JUNK_DEFS, STARTER_ACCESSORY_DEFS } from '../data/equipment_rules';
import {
  CRAFTING_MODIFIER_DEFS,
  ESSENCE_TIER_THRESHOLDS,
  MATERIAL_DEFS,
  MODIFIER_REAGENT_THRESHOLDS,
} from '../data/crafting_rules';
import { STARTER_ITEM_NAMES } from '../data/combat_constants';
import { isQuestItemTemplate, isRecipeScrollName } from '../data/item_rules';
import { levelBand } from '../data/vendor_stock';
import { EQUIPMENT_SLOTS, QUALITY_TIERS } from '../data/mechanical_vocabulary';
import { effectiveEnemyLevel } from '../data/enemy_rules';

/** One dropped item of one kill: a combat_loot row without its owner columns. */
export interface LootItem {
  itemTemplateId: bigint;
  /** Which roll produced it (tests and logs only; not stored). */
  kind: 'common' | 'gear' | 'essence' | 'modifier' | 'scroll';
  qualityTier?: string;
  affixDataJson?: string;
  craftQuality?: string;
  isNamed?: boolean;
}

/** A scroll-learned recipe of the fight's region, joined to its scroll template. */
export interface ScrollRecipe {
  recipeTemplateId: bigint;
  tier: string;
  scrollTemplateId: bigint;
}

/** Everything one victory's loot reads, computed once (buildVictoryLootContext). */
export interface VictoryLootContext {
  location: any | undefined;
  regionId: bigint | undefined;
  danger: bigint;
  zoneTier: bigint;
  dials: EffectiveDials;
  pins: Map<bigint, bigint>;
  /** combat_enemy row ids that are a fight-exact named foe (one row per named_enemy row). */
  namedEnemyRowIds: Set<bigint>;
  junk: { itemTemplateId: bigint }[];
  materials: { itemTemplateId: bigint; tier: bigint; sources: readonly string[]; dropCreatureTypes?: readonly string[] }[];
  regionMaterials: { itemTemplateId: bigint; role: string; rarity: string }[];
  gearTemplates: any[];
  essenceByName: Map<string, any>;
  modifierByName: Map<string, any>;
  scrollRecipes: ScrollRecipe[];
}

const EQUIPMENT_SLOT_SET: ReadonlySet<string> = new Set(EQUIPMENT_SLOTS);
/** The seeded non-starter gear names (lowercase): a quest that borrowed one of them never hides it. */
const SEEDED_GEAR_NAMES: ReadonlySet<string> = new Set(STARTER_ACCESSORY_DEFS.map((d) => d.name.toLowerCase()));

const micros = (ts: any): bigint | undefined =>
  ts && typeof ts.microsSinceUnixEpoch === 'bigint' ? ts.microsSinceUnixEpoch : undefined;

/**
 * The enemy templates of named foes killed in THIS fight (RESEARCH Pitfall 7). A named foe reuses its
 * regular template, so a per-character named set would boost every ordinary kill of that template. A
 * named_enemy row counts only when it belongs to a participant, is dead, is at the fight's location and
 * was killed at or after the encounter began (pull_named_enemy sets lastKilledAt in the transaction that
 * creates the encounter). A missing createdAt or lastKilledAt does not count.
 */
function fightNamedRows(ctx: any, combat: any, participants: readonly any[]): any[] {
  const out: any[] = [];
  const startedAt = micros(combat?.createdAt);
  if (startedAt === undefined) return out;
  const seenCharacters = new Set<bigint>();
  for (const p of participants ?? []) {
    const characterId = p?.characterId;
    if (typeof characterId !== 'bigint' || seenCharacters.has(characterId)) continue;
    seenCharacters.add(characterId);
    for (const row of ctx.db.named_enemy.by_character.filter(characterId)) {
      if (row.isAlive !== false) continue;
      if (row.locationId !== combat.locationId) continue;
      const killedAt = micros(row.lastKilledAt);
      if (killedAt === undefined || killedAt < startedAt) continue;
      out.push(row);
    }
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function fightNamedTemplateIds(ctx: any, combat: any, participants: readonly any[]): Set<bigint> {
  return new Set(fightNamedRows(ctx, combat, participants).map((row) => row.enemyTemplateId as bigint));
}

/**
 * The combat_enemy rows of this fight that ARE a named foe (review WR-01). pull_named_enemy spawns a
 * whole group of the named template (groupMin..groupMax copies), and adds can join mid-fight, so a
 * template set would give every copy the +1 rarity step, legendary eligibility and its own scroll roll.
 * Each fight-exact named_enemy row (fightNamedTemplateIds' rule, in named id order) claims the
 * lowest-id combat_enemy row of its template that no other named row has claimed. `enemies` defaults
 * to the fight's combat_enemy rows.
 */
export function fightNamedEnemyRowIds(
  ctx: any,
  combat: any,
  participants: readonly any[],
  enemies?: readonly any[],
): Set<bigint> {
  const claimed = new Set<bigint>();
  const named = fightNamedRows(ctx, combat, participants);
  if (named.length === 0) return claimed;
  const fightEnemies = enemies ?? (combat?.id !== undefined ? [...ctx.db.combat_enemy.by_combat.filter(combat.id)] : []);
  const rowsById = fightEnemies
    .filter((e: any) => typeof e?.id === 'bigint')
    .sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of named) {
    const match = rowsById.find((e: any) => e.enemyTemplateId === row.enemyTemplateId && !claimed.has(e.id));
    if (match) claimed.add(match.id);
  }
  return claimed;
}

/**
 * The single place loot reads an enemy's level. Quick task 261008-ag8 added the spawn level
 * (`combat_enemy.level`, 0 for rows from before the column), read through effectiveEnemyLevel: the row
 * level when set, else the template level, else 1.
 */
export function lootLevelOf(_ctx: any, enemyRow: any, template: any): bigint {
  const templateLevel: bigint = typeof template?.level === 'bigint' ? template.level : 1n;
  return effectiveEnemyLevel(enemyRow?.level, templateLevel);
}

/** The template with the lowest id per name, from one scan of item_template. */
function templatesByName(templates: readonly any[]): Map<string, any> {
  const byName = new Map<string, any>();
  for (const t of templates) {
    if (typeof t?.name !== 'string') continue;
    const prev = byName.get(t.name);
    if (!prev || t.id < prev.id) byName.set(t.name, t);
  }
  return byName;
}

/**
 * Everything one victory's loot reads, once: place, dials, pins, named rows, pools and recipe scrolls.
 * `enemies` is the fight's combat_enemy rows (read from the table when not given).
 */
export function buildVictoryLootContext(
  ctx: any,
  combat: any,
  participants: readonly any[],
  enemies?: readonly any[],
): VictoryLootContext {
  const location = combat?.locationId !== undefined ? ctx.db.location.id.find(combat.locationId) : undefined;
  const regionId: bigint | undefined = typeof location?.regionId === 'bigint' ? location.regionId : undefined;
  const region = regionId !== undefined ? ctx.db.region.id.find(regionId) : undefined;
  const danger: bigint = typeof region?.dangerMultiplier === 'bigint' ? region.dangerMultiplier : 100n;

  const allTemplates = [...ctx.db.item_template.iter()].sort((a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byName = templatesByName(allTemplates);

  const junk: { itemTemplateId: bigint }[] = [];
  for (const def of JUNK_DEFS) {
    const t = byName.get(def.name);
    if (t) junk.push({ itemTemplateId: t.id });
  }

  const materials: VictoryLootContext['materials'] = [];
  for (const def of MATERIAL_DEFS) {
    if (!def.sources.includes('drop')) continue;
    const t = byName.get(def.name);
    if (!t) continue;
    materials.push({ itemTemplateId: t.id, tier: def.tier, sources: def.sources, dropCreatureTypes: def.dropCreatureTypes });
  }

  const regionMaterials: VictoryLootContext['regionMaterials'] = [];
  if (regionId !== undefined) {
    for (const row of ctx.db.economy_item.by_region.filter(regionId)) {
      if (row.role !== 'gather' && row.role !== 'drop') continue;
      if (row.rarity !== 'common' && row.rarity !== 'uncommon') continue;
      regionMaterials.push({ itemTemplateId: row.itemTemplateId, role: row.role, rarity: row.rarity });
    }
  }

  const economyIds = new Set<bigint>();
  for (const row of ctx.db.economy_item.iter()) economyIds.add(row.itemTemplateId);
  // Review A WR-05: crafted gear (every recipe output: research-generated and regional) and quest
  // rewards are not free kill drops. Quest rewards carry no origin tag, so they are known by the
  // questRewardItemName forms of the quest templates' reward names.
  const recipeOutputIds = new Set<bigint>();
  for (const row of ctx.db.recipe_template.iter()) {
    if (typeof row.outputTemplateId === 'bigint') recipeOutputIds.add(row.outputTemplateId);
  }
  const questRewardBases = new Set<string>();
  for (const row of ctx.db.quest_template.iter()) {
    if (typeof row.rewardItemName === 'string' && row.rewardItemName.trim() !== '') {
      questRewardBases.add(row.rewardItemName.trim().replace(/\s+/g, ' ').toLowerCase());
    }
  }
  const gearTemplates = allTemplates.filter(
    (t: any) =>
      EQUIPMENT_SLOT_SET.has(t.slot) &&
      !t.isJunk &&
      !STARTER_ITEM_NAMES.has(t.name) &&
      !isQuestItemTemplate(t) &&
      !isRecipeScrollName(t.name) &&
      !economyIds.has(t.id) &&
      !recipeOutputIds.has(t.id) &&
      !isQuestRewardName(t.name, questRewardBases, SEEDED_GEAR_NAMES),
  );

  const essenceByName = new Map<string, any>();
  for (const threshold of ESSENCE_TIER_THRESHOLDS) {
    const t = byName.get(threshold.essenceName);
    if (t) essenceByName.set(threshold.essenceName, t);
  }
  const modifierByName = new Map<string, any>();
  for (const def of CRAFTING_MODIFIER_DEFS) {
    const t = byName.get(def.name);
    if (t) modifierByName.set(def.name, t);
  }

  const scrollRecipes: ScrollRecipe[] = [];
  if (regionId !== undefined) {
    for (const row of ctx.db.region_recipe.by_region.filter(regionId)) {
      if (row.learnBy !== 'scroll' || !row.scrollTemplateId || row.scrollTemplateId === 0n) continue;
      if (!ctx.db.item_template.id.find(row.scrollTemplateId)) continue;
      scrollRecipes.push({ recipeTemplateId: row.recipeTemplateId, tier: row.tier, scrollTemplateId: row.scrollTemplateId });
    }
    scrollRecipes.sort((a, b) => (a.recipeTemplateId < b.recipeTemplateId ? -1 : a.recipeTemplateId > b.recipeTemplateId ? 1 : 0));
  }

  return {
    location,
    regionId,
    danger,
    zoneTier: zoneTierOf(danger),
    dials: loadEffectiveDials(ctx, regionId),
    pins: loadItemPins(ctx),
    namedEnemyRowIds: fightNamedEnemyRowIds(ctx, combat, participants, enemies),
    junk,
    materials,
    regionMaterials,
    gearTemplates,
    essenceByName,
    modifierByName,
    scrollRecipes,
  };
}

const seedOf = (ctx: any, enemyRow: any, characterId: bigint): bigint =>
  lootSeed(ctx.timestamp.microsSinceUnixEpoch, characterId, enemyRow?.id ?? 0n);

/** A whole pool with the admin item pins applied exactly (pinWeights: no pin leaves it unchanged). */
const pinned = <T extends WeightedEntry>(lc: VictoryLootContext, entries: readonly T[]): T[] => pinWeights(entries, lc.pins);

/** The gear drop of one kill (null when the gear roll misses or the pool is empty). */
function rollGear(
  ctx: any,
  lc: VictoryLootContext,
  seed: bigint,
  level: bigint,
  profile: ReturnType<typeof creatureProfile>,
  bossOrNamed: boolean,
  aiGear: readonly any[],
): LootItem | null {
  if (rollBelow(seed, ROLL_INDEX.GEAR_CHANCE, 100n) >= gearChancePct(profile, level, lc.dials.dropRatePct)) return null;
  const band = levelBand(level);
  const maxLevel = band.maxLevel < level + 1n ? band.maxLevel : level + 1n;
  const pool: (WeightedEntry & { template: any })[] = [];
  for (const entry of aiGear) {
    const template = ctx.db.item_template.id.find(entry.itemTemplateId);
    if (!template) continue;
    pool.push({ itemTemplateId: entry.itemTemplateId, weight: entry.weight, template });
  }
  for (const template of lc.gearTemplates) {
    const req: bigint = typeof template.requiredLevel === 'bigint' ? template.requiredLevel : 1n;
    if (req < band.minLevel || req > maxLevel) continue;
    pool.push({ itemTemplateId: template.id, weight: gearPoolWeight({ slot: template.slot, rarity: template.rarity }), template });
  }
  const pick = pickWeighted(pinned(lc, pool), seed, ROLL_INDEX.GEAR_PICK);
  if (!pick) return null;
  const template = pick.template;
  const armorClassBonus: bigint = typeof template.armorClassBonus === 'bigint' ? template.armorClassBonus : 0n;
  const quality = jewelryFloor(template.slot, armorClassBonus, rollRarity(rarityMix(level, lc.danger, bossOrNamed, lc.dials), seed));
  const craftQuality = rollQualityForDrop(level, economyRoll(seed, ROLL_INDEX.CRAFT_QUALITY));
  const out: LootItem = { itemTemplateId: template.id, kind: 'gear', qualityTier: quality, isNamed: false, craftQuality };
  if (quality !== 'common') {
    const affixes = generateAffixData(template.slot, quality, economyRoll(seed, ROLL_INDEX.AFFIX));
    // BigInt is not JSON-serializable: magnitudes are stored as Number, as before.
    out.affixDataJson = JSON.stringify(affixes.map((a) => ({ ...a, magnitude: Number(a.magnitude) })));
  }
  return out;
}

/**
 * What one kill (one combat_enemy row) drops for one character, in a fixed order: common picks, gear,
 * essence, modifier reagent, recipe scroll. Every roll reads lootSeed(ts, characterId, enemyRow.id) at
 * its own ROLL_INDEX and the dials in `lc`.
 */
export function rollEnemyLoot(ctx: any, lc: VictoryLootContext, enemyRow: any, template: any, characterId: bigint): LootItem[] {
  if (!template) return [];
  const seed = seedOf(ctx, enemyRow, characterId);
  const profile = creatureProfile(template.creatureType);
  const level = lootLevelOf(ctx, enemyRow, template);
  const templateId: bigint = typeof template.id === 'bigint' ? template.id : enemyRow?.enemyTemplateId ?? 0n;
  // A boss template, or this very row as a named foe (not its companions of the same template).
  const bossOrNamed = template.isBoss === true || (typeof enemyRow?.id === 'bigint' && lc.namedEnemyRowIds.has(enemyRow.id));
  const dropPct = lc.dials.dropRatePct;
  const out: LootItem[] = [];

  // Common picks: the enemy's AI table (non-gear entries) when it has one, else the fallback pool.
  const aiEntries = [...ctx.db.enemy_loot_entry.by_enemy.filter(templateId)];
  const aiGear = aiEntries.filter((e: any) => e.role === 'gear');
  const commonBase: WeightedEntry[] =
    aiEntries.length > 0
      ? aiEntries.filter((e: any) => e.role !== 'gear').map((e: any) => ({ itemTemplateId: e.itemTemplateId, weight: e.weight }))
      : fallbackCommonPool({
          junk: lc.junk,
          materials: lc.materials,
          regionMaterials: lc.regionMaterials,
          creatureType: template.creatureType,
          zoneTier: lc.zoneTier,
        });
  const commonPool = pinned(lc, commonBase.map((e) => ({ itemTemplateId: e.itemTemplateId, weight: e.weight })));
  const picks = pickWithoutReplacement(commonPool, Number(pickCount(seed, dropPct)), seed, ROLL_INDEX.PICK_BASE);
  for (const p of picks) {
    if (!ctx.db.item_template.id.find(p.itemTemplateId)) continue;
    out.push({ itemTemplateId: p.itemTemplateId, kind: 'common' });
  }

  const gear = rollGear(ctx, lc, seed, level, profile, bossOrNamed, aiGear);
  if (gear) out.push(gear);

  // Essence: the highest threshold the level reaches (thresholds are ordered highest first). The
  // template is decided before the chance roll so its item pin can scale the chance (review A WR-04);
  // the rolls keep their own indexes, so the order changes no outcome.
  const essenceThreshold = ESSENCE_TIER_THRESHOLDS.find((t) => level >= t.minLevel);
  const essence = essenceThreshold ? lc.essenceByName.get(essenceThreshold.essenceName) : undefined;
  if (essence && pinnedChanceHit(seed, ROLL_INDEX.ESSENCE, scaledChancePct(ESSENCE_CHANCE_PCT, dropPct), lc.pins.get(essence.id))) {
    out.push({ itemTemplateId: essence.id, kind: 'essence' });
  }

  // Modifier reagent: one of the names the level unlocks, picked first so its pin scales the chance.
  const reagentThreshold = MODIFIER_REAGENT_THRESHOLDS.find((t) => level >= t.minLevel);
  const reagentNames = reagentThreshold?.reagentNames ?? [];
  if (reagentNames.length > 0) {
    const name = reagentNames[Number(rollBelow(seed, ROLL_INDEX.MODIFIER_PICK, BigInt(reagentNames.length)))];
    const reagent = name !== undefined ? lc.modifierByName.get(name) : undefined;
    if (reagent && pinnedChanceHit(seed, ROLL_INDEX.MODIFIER, scaledChancePct(MODIFIER_CHANCE_PCT, dropPct), lc.pins.get(reagent.id))) {
      out.push({ itemTemplateId: reagent.id, kind: 'modifier' });
    }
  }

  // Recipe scroll: bosses and fight-exact named foes only, from the region's scroll recipes.
  if (
    bossOrNamed &&
    lc.scrollRecipes.length > 0 &&
    rollBelow(seed, ROLL_INDEX.SCROLL, 100n) < scaledChancePct(SCROLL_DROP_BASE_PCT, dropPct)
  ) {
    // Weight = tier base x tier dial x item pin, scaled exactly (review CR-01: a legendary scroll's
    // weight of 1 was floored to 0 at any tier dial below 100).
    const bases = lc.scrollRecipes.map((r) => (SCROLL_TIER_WEIGHTS as Record<string, bigint>)[r.tier] ?? 0n);
    const pcts = lc.scrollRecipes.map((r) => {
      const tierPct = (QUALITY_TIERS as readonly string[]).includes(r.tier)
        ? (lc.dials.tierPct as Record<string, bigint>)[r.tier] ?? 100n
        : 0n;
      return tierPct * pinPct(lc.pins.get(r.scrollTemplateId));
    });
    const weights = scaleWeights(bases, pcts);
    const entries = lc.scrollRecipes.map((r, i) => ({ itemTemplateId: r.scrollTemplateId, weight: weights[i]! }));
    const pick = pickWeighted(entries, seed, ROLL_INDEX.SCROLL_PICK);
    if (pick) out.push({ itemTemplateId: pick.itemTemplateId, kind: 'scroll' });
  }

  return out;
}

/** The gold of one kill for one character: goldReward(profile, level, seed, goldPct) with the loot seed. */
export function rollEnemyGold(ctx: any, lc: VictoryLootContext, enemyRow: any, template: any, characterId: bigint): bigint {
  if (!template) return 0n;
  const seed = seedOf(ctx, enemyRow, characterId);
  return goldReward(creatureProfile(template.creatureType), lootLevelOf(ctx, enemyRow, template), seed, lc.dials.goldPct);
}
