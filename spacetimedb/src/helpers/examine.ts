// Helper for the `look <target>` command: NPC, enemy (individuals, then creature families), player,
// resource pool, inventory item, then (the last two categories, so every older answer is unchanged)
// a place connected to this one and the bind stone. Families and resource pools come from the density
// pools (helpers/encounters.ts, Phase 51.3.1.1 D-03, D-26, D-55).
import { sumItemStats } from '../data/item_stats';
import type { ItemStatKey } from '../data/item_stats';
import { creatureLine, densityWord, groupHint, placeNounFor, resourceLine } from '../data/density_lines';
import { serverRoleToPrompt } from '../data/family_rules';
import {
  creaturePoolsByDanger,
  familyNames,
  individualsHere,
  levelRangeLabel,
  resourcePoolsNow,
} from './encounters';
import { getWorldState } from './location';

/** The label before a family's member list (PROPOSED, D-58: listed in 51.3.1.1-16-SUMMARY.md). */
export const FAMILY_MEMBERS_LABEL = 'Members:';

const LOOK_REGEX = /^(?:look|l)(?:\s+(.+))?$/i;

/**
 * null = not a look command; '' = bare look; otherwise the normalized target (original casing).
 * A leading whole-word "at" and one leading article (the, a, an) are stripped. A target that is
 * only filler words ("look the", "look at the", "look a", "look at at") is a bare look, so it never
 * partial-matches the first name that happens to contain those letters.
 */
export function parseLookCommand(raw: string): string | null {
  const match = raw.trim().match(LOOK_REGEX);
  if (!match) return null;
  let target = (match[1] ?? '').trim();
  target = target.replace(/^at(?:\s+|$)/i, '').trim();
  target = target.replace(/^(?:the|an|a)(?:\s+|$)/i, '').trim();
  if (/^at$/i.test(target)) target = '';
  return target;
}

export function lookMissLine(target: string): string {
  return `You don't see "${target}" here.`;
}

const TYPE_LABELS: Record<string, string> = {
  head: 'head armor',
  chest: 'chest armor',
  wrists: 'wrist armor',
  hands: 'hand armor',
  legs: 'leg armor',
  belt: 'belt',
  boots: 'boots',
  earrings: 'earrings',
  neck: 'neck piece',
  cloak: 'cloak',
  mainHand: 'main-hand weapon',
  offHand: 'off-hand item',
  material: 'material',
  junk: 'junk',
  consumable: 'consumable',
};

// Display order for the Stats line: the INVENTORY block's set, then the affix-only stats.
const STAT_LABELS: [ItemStatKey, string][] = [
  ['strBonus', 'STR'],
  ['dexBonus', 'DEX'],
  ['intBonus', 'INT'],
  ['wisBonus', 'WIS'],
  ['chaBonus', 'CHA'],
  ['hpBonus', 'HP'],
  ['manaBonus', 'Mana'],
  ['armorClassBonus', 'AC'],
  ['magicResistanceBonus', 'MR'],
  ['lifeOnHit', 'Life on hit'],
  ['cooldownReduction', 'Cooldown reduction'],
  ['manaRegen', 'Mana regen'],
];

function typeLabel(slot: unknown): string {
  const key = typeof slot === 'string' ? slot : '';
  if (!key) return 'item';
  // Own keys only: a slot named constructor or toString must not read the object prototype.
  return Object.prototype.hasOwnProperty.call(TYPE_LABELS, key) ? TYPE_LABELS[key] : key.toLowerCase();
}

type NameMatcher = (name: string) => boolean;

/**
 * A resource pool here that can be gathered now (D-26, D-55): the name, the supply word, the density
 * line, the yield and the item's description. Resource nodes are no longer read.
 */
function describeResource(ctx: any, character: any, matches: NameMatcher): string | null {
  const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
  const isNight = getWorldState(ctx)?.isNight === true;
  const hit = resourcePoolsNow(ctx, character.locationId, isNight, now).find((r) => matches(r.name));
  if (!hit) return null;
  const location = ctx.db.location.id.find(character.locationId);
  const template = hit.template;
  const rarity = String(template.rarity || 'common').toLowerCase();
  const lines: string[] = [
    hit.name,
    `${densityWord('resource', hit.level)}.`,
    resourceLine({ resource: hit.name, level: hit.level, place: placeNounFor(location ?? {}) }),
    `Gathering yields ${template.name} (${rarity} ${typeLabel(template.slot)}).`,
  ];
  if (template.description) lines.push(String(template.description));
  return lines.join('\n');
}

/** The individuals here (D-07): the character's named enemies and individual spawns. */
function describeIndividual(ctx: any, character: any, matches: NameMatcher): string | null {
  for (const one of individualsHere(ctx, character)) {
    if (!matches(one.name)) continue;
    let desc = `You study ${one.name}. Level ${one.level}. ${one.template.role} ${one.template.creatureType}.`;
    if (one.template.isBoss) desc += ' This creature carries the weight of something ancient and terrible.';
    return desc;
  }
  return null;
}

/**
 * A creature family here (D-03), matched by its name, plural, singular or a member's name: the level
 * range and population word, the density line, the group hint, the family's history when it has one
 * (D-68), and the members by prompt role.
 */
function describeFamily(ctx: any, character: any, matches: NameMatcher): string | null {
  const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
  const hit = creaturePoolsByDanger(ctx, character.locationId, now).find((h) => familyNames(h).some((n) => matches(n)));
  if (!hit) return null;
  const location = ctx.db.location.id.find(character.locationId);
  const lines: string[] = [
    String(hit.family.name),
    `${levelRangeLabel(hit.lvLo, hit.lvHi)}, ${densityWord('creature', hit.level)}.`,
    creatureLine({
      plural: hit.family.pluralNoun,
      singular: hit.family.singularNoun,
      temperament: hit.family.temperament,
      level: hit.level,
      place: placeNounFor(location ?? {}),
    }),
  ];
  const hint = groupHint(hit.level);
  if (hint) lines.push(`${hint}.`);
  // The family's past in its region (D-68, Plan 29): its own line, no label; none when it has no history.
  const history = String(hit.family.history ?? '').trim();
  if (history) lines.push(history);
  if (hit.members.length > 0) {
    const members = hit.members.map((m) => `${m.name} (${serverRoleToPrompt(m.role)})`);
    lines.push(`${FAMILY_MEMBERS_LABEL} ${members.join(', ')}.`);
  }
  return lines.join('\n');
}

function describeItem(ctx: any, character: any, matches: NameMatcher): string | null {
  const candidates: { instance: any; template: any; display: string }[] = [];
  for (const instance of ctx.db.item_instance.by_owner.filter(character.id)) {
    const template = ctx.db.item_template.id.find((instance as any).templateId);
    if (!template) continue;
    candidates.push({ instance, template, display: String((instance as any).displayName || template.name) });
  }
  // Instance id order, so the answer never depends on index iteration order.
  candidates.sort((x, y) => (x.instance.id < y.instance.id ? -1 : x.instance.id > y.instance.id ? 1 : 0));
  const first = candidates.find((c) => matches(c.display) || matches(String(c.template.name)));
  if (!first) return null;

  // Copies of the same item (same template, display name and quality) are one entry: the count
  // adds their quantities, and the item counts as equipped when any copy is. The described copy
  // is an equipped one when there is one, so the shown stats are the stats in use.
  const group = candidates.filter(
    (c) =>
      c.instance.templateId === first.instance.templateId &&
      c.display === first.display &&
      (c.instance.qualityTier ?? '') === (first.instance.qualityTier ?? ''),
  );
  const hit = group.find((c) => c.instance.equippedSlot) ?? first;
  let total = 0n;
  let equippedCopies = 0;
  for (const c of group) {
    const q = c.instance.quantity;
    total += typeof q === 'bigint' && q > 0n ? q : 1n;
    if (c.instance.equippedSlot) equippedCopies += 1;
  }

  const { instance, template, display } = hit;
  const rarity = String(instance.qualityTier || template.rarity || 'common').toLowerCase();
  const rarityCap = rarity.charAt(0).toUpperCase() + rarity.slice(1);
  const extras: string[] = [];
  for (const v of [template.armorType, template.weaponType]) {
    if (typeof v === 'string' && v !== '' && v !== 'none') extras.push(v);
  }
  const extraStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';

  const lines: string[] = [display, `${rarityCap} ${typeLabel(template.slot)}${extraStr}.`];

  if (equippedCopies > 0 && total <= 1n) {
    lines.push('You have it equipped.');
  } else if (equippedCopies > 0) {
    lines.push(`You carry ${total} (${equippedCopies === 1 ? 'one' : equippedCopies} equipped).`);
  } else if (total > 1n) {
    lines.push(`You carry ${total}.`);
  } else {
    lines.push('You carry one.');
  }

  if (template.description) lines.push(String(template.description));

  // Template stats plus every affix on this instance (prefixes, suffixes and the implicit craft
  // quality affixes all live in item_affix, keyed by the same statKey names the template uses).
  const big = (v: unknown): bigint => (typeof v === 'bigint' ? v : 0n);
  const totals = sumItemStats(template, [...ctx.db.item_affix.by_instance.filter(instance.id)]);

  const stats: string[] = [];
  for (const [key, label] of STAT_LABELS) {
    const val = totals[key];
    if (val > 0n) stats.push(`${label} +${val}`);
  }
  const dmg = totals.weaponBaseDamage;
  if (dmg > 0n) stats.push(`${dmg} damage`);
  const dps = totals.weaponDps;
  if (dps > 0n) stats.push(`${dps} DPS`);
  if (stats.length > 0) lines.push(`Stats: ${stats.join(', ')}.`);

  if (big(template.requiredLevel) > 1n) lines.push(`Requires level ${big(template.requiredLevel)}.`);
  return lines.join('\n');
}

/**
 * A place connected to the character's current place, by name. Plain server copy (not Keeper text):
 * the name, where it lies relative to here, then its description (a fixed line for an
 * uncharted edge that has none). Places are tried in id order so the answer never depends on index
 * iteration order.
 */
function describeNeighbourPlace(ctx: any, character: any, matches: NameMatcher): string | null {
  const here = ctx.db.location.id.find(character.locationId);
  const seen = new Set<bigint>();
  const neighbours: any[] = [];
  for (const row of ctx.db.location_connection.by_from.filter(character.locationId)) {
    if (seen.has(row.toLocationId)) continue;
    seen.add(row.toLocationId);
    const place = ctx.db.location.id.find(row.toLocationId);
    if (place) neighbours.push(place);
  }
  neighbours.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const hit = neighbours.find((p) => matches(String(p.name)));
  if (!hit) return null;

  const hereName = String(here?.name ?? 'here');
  const lines: string[] = [String(hit.name)];
  if (here && hit.regionId !== here.regionId) {
    const region = ctx.db.region.id.find(hit.regionId);
    lines.push(`Next to ${hereName}, across the border in ${region?.name ?? 'another region'}.`);
  } else {
    lines.push(`Next to ${hereName}.`);
  }
  if (hit.description) {
    lines.push(String(hit.description));
  } else if (hit.terrainType === 'uncharted') {
    lines.push('Nobody has been here yet.');
  }
  return lines.join('\n');
}

/** The bind stone of the current place (only when it has one): whether the character is bound here. */
function describeBindStone(ctx: any, character: any, matches: NameMatcher): string | null {
  const here = ctx.db.location.id.find(character.locationId);
  if (!here || !here.bindStone) return null;
  if (!matches('Bind stone')) return null;
  const bound = character.boundLocationId === here.id;
  return [
    'Bind stone',
    bound
      ? 'You are bound here. You return here after defeat.'
      : 'You are not bound here. Bind here to return after defeat.',
  ].join('\n');
}

/**
 * One pass over every category (NPC, enemy, player, resource, item, then neighbouring place and bind
 * stone) with one name predicate. The last two come last so no existing answer changes.
 */
function describeAll(ctx: any, character: any, matches: NameMatcher): string | null {
  // (a) NPCs
  for (const npc of ctx.db.npc.by_location.filter(character.locationId)) {
    if (matches((npc as any).name)) {
      return `[${(npc as any).name}]: ${(npc as any).description}`;
    }
  }

  // (b) Enemies: individuals (named, World event and boss spawns) first, then creature families
  const individual = describeIndividual(ctx, character, matches);
  if (individual) return individual;
  const family = describeFamily(ctx, character, matches);
  if (family) return family;

  // (c) Other players
  const locationChars = [...ctx.db.character.by_location.filter(character.locationId)];
  for (const other of locationChars) {
    // Offline characters are not described (CONTEXT Area 2).
    if (other.id !== character.id && other.online === true && matches(other.name)) {
      return `${other.name}, Level ${other.level} ${other.race} ${other.className}.`;
    }
  }

  // (d) Resource pools at the location, (e) the character's own inventory, then (f) a place
  // connected to this one and (g) the bind stone
  return (
    describeResource(ctx, character, matches) ??
    describeItem(ctx, character, matches) ??
    describeNeighbourPlace(ctx, character, matches) ??
    describeBindStone(ctx, character, matches)
  );
}

/**
 * Text for appendPrivateEvent(..., 'look', text), or null when nothing matches.
 * Exact name matches win across every category before any partial match is tried, so a click on
 * the "Stone" resource is never captured by a "Stone Golem" enemy. Inside a pass the category order
 * stays NPC, enemy, player, resource, item, neighbouring place, bind stone.
 *
 * Kept on purpose (Phase 51 review IN-09): when something here has exactly the same name as a
 * neighbouring place, the earlier category answers, so no older answer changes. A place's own
 * exact name still beats every partial match. If the collision ever matters, the remedy is a typed
 * look target sent by the Examine eye (for example `look at place {name}`), not a reorder.
 */
export function describeLookTarget(ctx: any, character: any, target: string): string | null {
  const targetLower = target.toLowerCase();
  return (
    describeAll(ctx, character, (name) => String(name).toLowerCase() === targetLower) ??
    describeAll(ctx, character, (name) => String(name).toLowerCase().includes(targetLower))
  );
}
