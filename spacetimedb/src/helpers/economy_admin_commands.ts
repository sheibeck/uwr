// ============================================================================
// /economy admin console command (Phase 51.3, SC5)
// ============================================================================
//
// /economy shows, sets and resets the economy dials, typed in the narrative input and dispatched from
// submit_command right after the /llm commands. It is a reducer path with plain-text output: the console
// renders with v-html and turns [text] into a link, so no '[', '<' or '{' is ever printed, and every
// region or item name echoed back is stripped of them first.
//
// The admin check is ADMIN_IDENTITIES membership on ctx.sender, answered with an in-voice refusal through
// fail(). The throwing admin guard is wrong for the slash path (it raises a SenderError), so it is
// deliberately not used here; the admin-only reducers in reducers/economy.ts use it.
//
// Every write goes through helpers/economy_state.ts (applyDialChange, resetEconomy, setAiEnabled), the same
// functions the admin reducers call, so the console and the Phase 52 panel clamp identically.
// ============================================================================

import { ADMIN_IDENTITIES } from '../data/admin';
import { effectiveDials, type DialName } from '../data/economy_rules';
import { QUALITY_TIERS } from '../data/mechanical_vocabulary';
import { fail, appendPrivateEvent } from './events';
import { applyDialChange, getDials, resetEconomy, setAiEnabled } from './economy_state';
import { repairRegionEconomyOutputs, startRegionEconomy, type RegionRepairResult } from './region_economy';
import { LLM_RESTING_LINE } from './llm_queue';

/**
 * Said after an item pin is set (review A WR-04): which rolls a pin scales. A pin on an item that none
 * of these rolls can produce (a crafted output, a quest reward, a starter item) changes nothing.
 */
export const ECONOMY_PIN_COVERAGE =
  'A pin scales that item in kill drops, gear, essences, reagents, recipe scrolls and gathering nodes; ' +
  'an item that never drops or grows is unaffected.';

/** What a non-admin hears. The Keeper is he/his. */
export const ECONOMY_ADMIN_REFUSAL_LINE = 'The Keeper does not open his ledgers to you.';

export const ECONOMY_COMMAND_USAGE =
  'Usage: /economy, /economy rarity -2..2, /economy drop|gold|gather|boss NUMBER, ' +
  '/economy tier common|uncommon|rare|epic|legendary 0-300, ' +
  '/economy region NAME, /economy region NAME drop|gold|gather|rarity|boss NUMBER, /economy region NAME reset, ' +
  '/economy item NAME drop 0-300, /economy item NAME reset, /economy ai on|off, /economy design NAME, /economy repair NAME, ' +
  '/economy reset. ' +
  'A drop or gold dial at 0 can leave a kill empty on purpose.';

const SCALAR_WORDS = ['rarity', 'drop', 'gold', 'gather', 'boss'] as const;
type ScalarWord = (typeof SCALAR_WORDS)[number];
type TierWord = (typeof QUALITY_TIERS)[number];

export type EconomyCommand =
  | { verb: 'show' }
  | { verb: 'set'; scope: 'global' | 'tier'; dial: string; value: bigint }
  | { verb: 'region_set'; regionName: string; dial: ScalarWord; value: bigint }
  | { verb: 'region_reset'; regionName: string }
  | { verb: 'region_show'; regionName: string }
  | { verb: 'item_set'; itemName: string; value: bigint }
  | { verb: 'item_reset'; itemName: string }
  | { verb: 'ai'; enabled: boolean }
  | { verb: 'design'; regionName: string }
  | { verb: 'repair'; regionName: string }
  | { verb: 'reset' }
  | { verb: 'help' };

const HELP: EconomyCommand = { verb: 'help' };

const isScalarWord = (w: string): w is ScalarWord => (SCALAR_WORDS as readonly string[]).includes(w);
const isTierWord = (w: string): w is TierWord => (QUALITY_TIERS as readonly string[]).includes(w);

/** Whole numbers with an optional sign and an optional trailing %, at most six digits. Anything else is null. */
export function parseDialValue(token: string): bigint | null {
  const match = /^([+-]?\d{1,6})%?$/.exec(String(token ?? ''));
  if (!match) return null;
  return BigInt(match[1]);
}

/**
 * Parse "/economy ..." text. Returns null when the text is not an /economy command at all ("/economyx",
 * "economy", other slash commands). Anything that is /economy but not a well-formed form is 'help'.
 */
export function parseEconomyCommand(text: string): EconomyCommand | null {
  const trimmed = String(text ?? '').trim();
  if (!/^\/economy(?:\s|$)/i.test(trimmed)) return null;
  const tokens = trimmed.split(/\s+/).slice(1);
  if (tokens.length === 0) return { verb: 'show' };
  const verb = tokens[0].toLowerCase();
  const rest = tokens.slice(1);

  if (verb === 'show') return rest.length === 0 ? { verb: 'show' } : HELP;
  if (verb === 'reset') return rest.length === 0 ? { verb: 'reset' } : HELP;

  if (verb === 'ai') {
    const arg = rest[0]?.toLowerCase();
    if (rest.length === 1 && (arg === 'on' || arg === 'off')) return { verb: 'ai', enabled: arg === 'on' };
    return HELP;
  }

  if (verb === 'design') {
    return rest.length > 0 ? { verb: 'design', regionName: rest.join(' ') } : HELP;
  }

  if (verb === 'repair') {
    return rest.length > 0 ? { verb: 'repair', regionName: rest.join(' ') } : HELP;
  }

  if (isScalarWord(verb)) {
    if (rest.length !== 1) return HELP;
    const value = parseDialValue(rest[0]);
    return value === null ? HELP : { verb: 'set', scope: 'global', dial: verb, value };
  }

  if (verb === 'tier') {
    if (rest.length !== 2) return HELP;
    const tier = rest[0].toLowerCase();
    const value = parseDialValue(rest[1]);
    if (!isTierWord(tier) || value === null) return HELP;
    return { verb: 'set', scope: 'tier', dial: tier, value };
  }

  if (verb === 'region') {
    if (rest.length === 0) return HELP;
    const last = rest[rest.length - 1].toLowerCase();
    if (last === 'reset') {
      return rest.length >= 2 ? { verb: 'region_reset', regionName: rest.slice(0, -1).join(' ') } : HELP;
    }
    if (isScalarWord(last)) return HELP; // a dial word with no value
    if (rest.length >= 3) {
      const dial = rest[rest.length - 2].toLowerCase();
      if (isScalarWord(dial)) {
        const value = parseDialValue(rest[rest.length - 1]);
        if (value === null) return HELP;
        return { verb: 'region_set', regionName: rest.slice(0, -2).join(' '), dial, value };
      }
    }
    return { verb: 'region_show', regionName: rest.join(' ') };
  }

  if (verb === 'item') {
    if (rest.length < 2) return HELP;
    const last = rest[rest.length - 1].toLowerCase();
    if (last === 'reset') {
      return rest.length >= 2 ? { verb: 'item_reset', itemName: rest.slice(0, -1).join(' ') } : HELP;
    }
    if (rest.length >= 3 && rest[rest.length - 2].toLowerCase() === 'drop') {
      const value = parseDialValue(rest[rest.length - 1]);
      if (value === null) return HELP;
      return { verb: 'item_set', itemName: rest.slice(0, -2).join(' '), value };
    }
    return HELP;
  }

  return HELP;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Remove the characters the console would turn into links or markup. */
const plainText = (s: unknown): string => String(s ?? '').replace(/[[\]<>{}]/g, '');

const collapse = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

const DIAL_LABELS: Record<ScalarWord, string> = {
  rarity: 'Rarity',
  drop: 'Drop rate',
  gold: 'Gold',
  gather: 'Gather rate',
  boss: 'Boss bonus',
};

/** Columns for the five scalar words, to look up DIAL_RANGES. */
const SCALAR_COLUMNS: Record<ScalarWord, DialName> = {
  rarity: 'rarityShift',
  drop: 'dropRatePct',
  gold: 'goldPct',
  gather: 'gatherRatePct',
  boss: 'bossRarityBonus',
};

const isPercentDial = (word: string): boolean => word !== 'rarity' && word !== 'boss';

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "Gold set to 300% (300% is the most)." */
function setReport(label: string, percent: boolean, result: { value: bigint; clamped: boolean; min: bigint; max: bigint }): string {
  const unit = percent ? '%' : '';
  let line = `${label} set to ${result.value}${unit}`;
  if (result.clamped) {
    const edge = result.value === result.max ? 'most' : 'least';
    line += ` (${result.value}${unit} is the ${edge})`;
  }
  return line + '.';
}

function findRegionByName(ctx: any, name: string): any | null {
  const wanted = collapse(name);
  if (!wanted) return null;
  for (const row of ctx.db.region.iter()) {
    if (collapse(String(row.name ?? '')) === wanted) return row;
  }
  return null;
}

function findItemByName(ctx: any, name: string): any | null {
  const wanted = collapse(name);
  if (!wanted) return null;
  for (const row of ctx.db.item_template.iter()) {
    if (collapse(String(row.name ?? '')) === wanted) return row;
  }
  return null;
}

const STATUS_WORDS: Record<string, string> = { complete: 'designed', pending: 'pending', failed: 'failed' };

function regionStatusWord(ctx: any, regionId: bigint): string {
  const row = ctx.db.region_economy.regionId.find(regionId);
  return row ? (STATUS_WORDS[row.status] ?? plainText(row.status)) : 'on fallbacks';
}

function dialLines(eff: ReturnType<typeof effectiveDials>, overridden: Set<ScalarWord>): string[] {
  const where = (w: ScalarWord) => (overridden.has(w) ? ' (set for this region)' : '');
  return [
    `Rarity: ${eff.rarityShift}${where('rarity')}`,
    `Drop rate: ${eff.dropRatePct}%${where('drop')}`,
    `Gold: ${eff.goldPct}%${where('gold')}`,
    `Gather rate: ${eff.gatherRatePct}%${where('gather')}`,
    `Boss bonus: ${eff.bossRarityBonus}${where('boss')}`,
  ];
}

function buildShowText(ctx: any): string {
  const dials = getDials(ctx);
  const eff = effectiveDials(dials, null);
  const lines = ['Economy dials', ...dialLines(eff, new Set())];
  lines.push(
    'Tier weights: ' + QUALITY_TIERS.map((tier) => `${capitalise(tier)} ${eff.tierPct[tier]}%`).join(', '),
  );
  lines.push(dials.aiEnabled ? 'AI economy: on' : 'AI economy: off');
  const regionOverrides = [...ctx.db.economy_region_dial.iter()].length;
  const itemPins = [...ctx.db.economy_item_dial.iter()].length;
  lines.push(`Region overrides: ${regionOverrides}`);
  lines.push(`Item pins: ${itemPins}`);

  const statusByRegion = new Map<bigint, string>();
  for (const row of ctx.db.region_economy.iter()) statusByRegion.set(row.regionId, row.status);
  let designed = 0;
  let pending = 0;
  let failed = 0;
  let fallbacks = 0;
  for (const region of ctx.db.region.iter()) {
    const status = statusByRegion.get(region.id);
    if (status === 'complete') designed += 1;
    else if (status === 'pending') pending += 1;
    else if (status === 'failed') failed += 1;
    else fallbacks += 1;
  }
  lines.push(`Regions: ${designed} designed, ${pending} pending, ${failed} failed, ${fallbacks} on fallbacks`);
  return lines.join('\n');
}

function buildRegionText(ctx: any, region: any): string {
  const dials = getDials(ctx);
  const override = ctx.db.economy_region_dial.regionId.find(region.id) ?? null;
  const eff = effectiveDials(dials, override);
  const overridden = new Set<ScalarWord>();
  if (override) {
    for (const word of SCALAR_WORDS) {
      const stored = override[SCALAR_COLUMNS[word]];
      if (stored !== undefined && stored !== null) overridden.add(word);
    }
  }
  let entries = 0;
  for (const row of ctx.db.enemy_loot_entry.iter()) if (row.regionId === region.id) entries += 1;
  return [
    `${plainText(region.name)}: ${regionStatusWord(ctx, region.id)}`,
    ...dialLines(eff, overridden),
    economyBreakdownLine(
      [...ctx.db.economy_item.by_region.filter(region.id)],
      entries,
      [...ctx.db.region_recipe.by_region.filter(region.id)],
    ),
  ].join('\n');
}

/**
 * The owner's breakdown of a region's economy (2026-10-08), e.g. "Economy: 15 items (3 gatherables,
 * 9 creature items: 3 drops, 3 trophies, 3 gear; 3 crafted outputs), 13 loot entries, 3 recipes
 * (2 common, 1 uncommon)". Recipe scrolls are named only when the region has some; recipe tiers are
 * listed in rarity order, only those present.
 */
export function economyBreakdownLine(items: readonly any[], lootEntries: number, recipes: readonly any[]): string {
  const count = (role: string) => items.filter((row) => row.role === role).length;
  const gather = count('gather');
  const drops = count('drop');
  const trophies = count('trophy');
  const gear = count('gear');
  const outputs = count('recipe_output');
  const scrolls = count('scroll');
  const creature = drops + trophies + gear;
  let detail =
    `${plural(gather, 'gatherable', 'gatherables')}, ${plural(creature, 'creature item', 'creature items')}: ` +
    `${plural(drops, 'drop', 'drops')}, ${plural(trophies, 'trophy', 'trophies')}, ${gear} gear; ` +
    `${plural(outputs, 'crafted output', 'crafted outputs')}`;
  if (scrolls > 0) detail += `; ${plural(scrolls, 'recipe scroll', 'recipe scrolls')}`;
  const tiers = QUALITY_TIERS.map((tier) => ({ tier, n: recipes.filter((row) => row.tier === tier).length }))
    .filter((t) => t.n > 0)
    .map((t) => `${t.n} ${t.tier}`);
  const recipePart = plural(recipes.length, 'recipe', 'recipes') + (tiers.length > 0 ? ` (${tiers.join(', ')})` : '');
  return `Economy: ${plural(items.length, 'item', 'items')} (${detail}), ${plural(lootEntries, 'loot entry', 'loot entries')}, ${recipePart}`;
}

/**
 * The plain-text report of /economy repair (and the console line of the economy_repair_region
 * reducer). One line when nothing changed, else a heading and one line per changed recipe output.
 */
export function repairReportLines(regionName: string, result: RegionRepairResult): string[] {
  const name = plainText(regionName);
  if (!result.ok) {
    if (result.reason === 'no_economy') return [`${name} has no designed economy yet.`];
    if (result.reason === 'not_complete') return [`${name} has no finished economy to repair yet.`];
    return [`${name} has no stored design to repair from.`];
  }
  if (result.changed.length === 0) {
    return [`${name}: every crafted output already follows the rules (${plural(result.checked, 'recipe', 'recipes')} checked).`];
  }
  const lines = [`Repaired ${name}: ${result.changed.length} of ${plural(result.checked, 'crafted output', 'crafted outputs')} corrected.`];
  for (const c of result.changed) {
    const label = `Recipe ${c.index + 1}`;
    const renamed = c.oldName !== c.newName ? `${plainText(c.oldName)} is now ${plainText(c.newName)}` : plainText(c.newName);
    const slot = c.oldSlot !== c.newSlot ? `, slot ${plainText(c.oldSlot)} is now ${plainText(c.newSlot)}` : `, slot ${plainText(c.newSlot)}`;
    lines.push(`${label}: ${renamed}${slot}.`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle one submit_command text. Returns false when the text is not an /economy command (nothing written),
 * true when it was handled.
 */
export function handleEconomyAdminCommand(ctx: any, character: any, text: string): boolean {
  const cmd = parseEconomyCommand(text);
  if (!cmd) return false;

  // Admin is decided from ctx.sender only, never from the command text.
  if (!ADMIN_IDENTITIES.has(ctx.sender.toHexString())) {
    fail(ctx, character, ECONOMY_ADMIN_REFUSAL_LINE);
    return true;
  }

  const say = (line: string) => appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', line);
  const refuse = (line: string) => fail(ctx, character, line);

  switch (cmd.verb) {
    case 'show':
      say(buildShowText(ctx));
      return true;

    case 'set': {
      const res = applyDialChange(ctx, { scope: cmd.scope, dial: cmd.dial, value: cmd.value });
      if (!res.ok) {
        refuse(ECONOMY_COMMAND_USAGE);
        return true;
      }
      if (cmd.scope === 'tier') {
        say(setReport(`${capitalise(cmd.dial)} weight`, true, res));
      } else {
        say(setReport(DIAL_LABELS[cmd.dial as ScalarWord], isPercentDial(cmd.dial), res));
      }
      return true;
    }

    case 'region_set': {
      const region = findRegionByName(ctx, cmd.regionName);
      if (!region) {
        refuse('No region by that name.');
        return true;
      }
      const res = applyDialChange(ctx, { scope: 'region', scopeId: region.id, dial: cmd.dial, value: cmd.value });
      if (!res.ok) {
        refuse(res.reason === 'unknown_region' ? 'No region by that name.' : ECONOMY_COMMAND_USAGE);
        return true;
      }
      say(setReport(`${DIAL_LABELS[cmd.dial]} for ${plainText(region.name)}`, isPercentDial(cmd.dial), res));
      return true;
    }

    case 'region_reset': {
      const region = findRegionByName(ctx, cmd.regionName);
      if (!region) {
        refuse('No region by that name.');
        return true;
      }
      const removed = resetEconomy(ctx, 'region', region.id);
      say(
        removed.regions > 0
          ? `${plainText(region.name)} is back on the global dials.`
          : `${plainText(region.name)} has no overrides.`,
      );
      return true;
    }

    case 'region_show': {
      const region = findRegionByName(ctx, cmd.regionName);
      if (!region) {
        refuse('No region by that name.');
        return true;
      }
      say(buildRegionText(ctx, region));
      return true;
    }

    case 'item_set': {
      const item = findItemByName(ctx, cmd.itemName);
      if (!item) {
        refuse('No item by that name.');
        return true;
      }
      const res = applyDialChange(ctx, { scope: 'item', scopeId: item.id, dial: 'drop', value: cmd.value });
      if (!res.ok) {
        refuse(res.reason === 'unknown_item' ? 'No item by that name.' : ECONOMY_COMMAND_USAGE);
        return true;
      }
      say(`${setReport(`Drop rate for ${plainText(item.name)}`, true, res)} ${ECONOMY_PIN_COVERAGE}`);
      return true;
    }

    case 'item_reset': {
      const item = findItemByName(ctx, cmd.itemName);
      if (!item) {
        refuse('No item by that name.');
        return true;
      }
      const removed = resetEconomy(ctx, 'item', item.id);
      say(
        removed.items > 0
          ? `The drop rate for ${plainText(item.name)} is back to normal.`
          : `${plainText(item.name)} has no pin.`,
      );
      return true;
    }

    case 'ai':
      setAiEnabled(ctx, cmd.enabled);
      say(
        cmd.enabled
          ? 'AI economy: on. New regions will get an AI-designed economy.'
          : 'AI economy: off. Regions use the rule-based economy.',
      );
      return true;

    case 'design': {
      // The only on-demand path to the paid economy job (owner decision 2026-10-08). startRegionEconomy
      // re-checks the AI switch and the once-only row; only a failed region is re-queued.
      const region = findRegionByName(ctx, cmd.regionName);
      if (!region) {
        refuse('No region by that name.');
        return true;
      }
      const result = startRegionEconomy(ctx, region, { playerId: ctx.sender, characterId: character.id }, { retryFailed: true });
      const name = plainText(region.name);
      if (result === 'off') refuse('The AI economy is off. Turn it on with /economy ai on first.');
      else if (result === 'exists') refuse(`${name} already has an economy (${regionStatusWord(ctx, region.id)}).`);
      // The region exists (found above), so 'no_region' here means it has no locations (review B IN-06).
      else if (result === 'no_region' || result === 'not_ready') refuse(`${name} has no places yet.`);
      else if (result === 'enqueued' || result === 'duplicate') {
        say(`Economy design queued for ${name}. It runs in the background; see /economy region ${name} for the status.`);
      } else if (result === 'refused:halted' || result === 'refused:ceiling') refuse(LLM_RESTING_LINE);
      else refuse(`Economy design refused: ${plainText(result.slice('refused:'.length))}.`);
      return true;
    }

    case 'repair': {
      // Re-derives the region's crafted outputs from its stored design with the current rules, in
      // place (review B WR-01 / WR-02). Idempotent, no LLM call, ids never change.
      const region = findRegionByName(ctx, cmd.regionName);
      if (!region) {
        refuse('No region by that name.');
        return true;
      }
      const result = repairRegionEconomyOutputs(ctx, region.id);
      const lines = repairReportLines(region.name, result);
      if (!result.ok) refuse(lines[0]);
      else say(lines.join('\n'));
      return true;
    }

    case 'reset': {
      resetEconomy(ctx, 'global');
      say(`Economy dials reset to defaults. The AI economy switch was left ${getDials(ctx).aiEnabled ? 'on' : 'off'}.`);
      return true;
    }

    default:
      refuse(ECONOMY_COMMAND_USAGE);
      return true;
  }
}
