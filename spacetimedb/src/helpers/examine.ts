// Pure helper for the `look <target>` command: NPC, enemy, player, resource node, then
// inventory item. No spacetimedb/server or schema imports, so it stays unit-testable.

const LOOK_REGEX = /^(?:look|l)(?:\s+(.+))?$/i;

/**
 * null = not a look command; '' = bare look; otherwise the normalized target (original casing).
 * A leading whole-word "at" and one leading article (the, a, an) are stripped.
 */
export function parseLookCommand(raw: string): string | null {
  const match = raw.trim().match(LOOK_REGEX);
  if (!match) return null;
  let target = (match[1] ?? '').trim();
  target = target.replace(/^at(?:\s+|$)/i, '').trim();
  target = target.replace(/^(?:the|an|a)\s+/i, '').trim();
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
const STAT_LABELS: [string, string][] = [
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
const STAT_KEYS = STAT_LABELS.map(([key]) => key);

function typeLabel(slot: unknown): string {
  const key = typeof slot === 'string' ? slot : '';
  if (!key) return 'item';
  return TYPE_LABELS[key] ?? key.toLowerCase();
}

type NameMatcher = (name: string) => boolean;

function describeNode(ctx: any, character: any, matches: NameMatcher): string | null {
  const visible: any[] = [];
  for (const n of ctx.db.resource_node.by_location.filter(character.locationId)) {
    const owner = (n as any).characterId;
    if (owner === undefined || owner === null || owner === character.id) visible.push(n);
  }
  const pool = visible.filter((n) => matches(String(n.name)));
  if (pool.length === 0) return null;
  const node = pool.find((n) => n.state === 'available' && !n.lockedByCharacterId) ?? pool[0];

  const lines: string[] = [String(node.name)];
  const locked = node.lockedByCharacterId;
  if (locked !== undefined && locked !== null && locked === character.id) {
    lines.push('You are gathering it now.');
  } else if ((locked !== undefined && locked !== null) || node.state === 'harvesting') {
    lines.push('Someone is gathering it.');
  } else if (node.state === 'available') {
    lines.push('Ready to gather.');
  } else {
    lines.push('Depleted.');
  }

  const template = ctx.db.item_template.id.find(node.itemTemplateId);
  if (template) {
    const rarity = String(template.rarity || 'common').toLowerCase();
    lines.push(`Gathering yields ${template.name} (${rarity} ${typeLabel(template.slot)}).`);
    if (template.description) lines.push(String(template.description));
  } else {
    lines.push(`Gathering yields ${node.name}.`);
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
  const totals = new Map<string, bigint>();
  const add = (key: string, v: unknown) => {
    totals.set(key, (totals.get(key) ?? 0n) + big(v));
  };
  for (const key of STAT_KEYS) add(key, template[key]);
  add('weaponBaseDamage', template.weaponBaseDamage);
  add('weaponDps', template.weaponDps);
  for (const affix of ctx.db.item_affix.by_instance.filter(instance.id)) {
    add(String(affix.statKey), affix.magnitude);
  }

  const stats: string[] = [];
  for (const [key, label] of STAT_LABELS) {
    const val = totals.get(key) ?? 0n;
    if (val > 0n) stats.push(`${label} +${val}`);
  }
  const dmg = totals.get('weaponBaseDamage') ?? 0n;
  if (dmg > 0n) stats.push(`${dmg} damage`);
  const dps = totals.get('weaponDps') ?? 0n;
  if (dps > 0n) stats.push(`${dps} DPS`);
  if (stats.length > 0) lines.push(`Stats: ${stats.join(', ')}.`);

  if (big(template.requiredLevel) > 1n) lines.push(`Requires level ${big(template.requiredLevel)}.`);
  return lines.join('\n');
}

/** One pass over every category (NPC, enemy, player, node, item) with one name predicate. */
function describeAll(ctx: any, character: any, matches: NameMatcher): string | null {
  // (a) NPCs
  for (const npc of ctx.db.npc.by_location.filter(character.locationId)) {
    if (matches((npc as any).name)) {
      return `[${(npc as any).name}]: ${(npc as any).description}`;
    }
  }

  // (b) Enemies
  const targetSpawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
  for (const spawn of targetSpawns) {
    if (matches(spawn.name)) {
      const template = ctx.db.enemy_template.id.find(spawn.enemyTemplateId);
      if (!template) continue;
      let desc = `You study ${spawn.name}. Level ${template.level}. ${template.role} ${template.creatureType}.`;
      if (template.isBoss) desc += ' This creature carries the weight of something ancient and terrible.';
      return desc;
    }
  }

  // (c) Other players
  const locationChars = [...ctx.db.character.by_location.filter(character.locationId)];
  for (const other of locationChars) {
    if (other.id !== character.id && matches(other.name)) {
      return `${other.name}, Level ${other.level} ${other.race} ${other.className}.`;
    }
  }

  // (d) Resource nodes at the location, (e) the character's own inventory
  return describeNode(ctx, character, matches) ?? describeItem(ctx, character, matches);
}

/**
 * Text for appendPrivateEvent(..., 'look', text), or null when nothing matches.
 * Exact name matches win across every category before any partial match is tried, so a click on
 * the "Stone" node is never captured by a "Stone Golem" enemy. Inside a pass the category order
 * stays NPC, enemy, player, node, item.
 */
export function describeLookTarget(ctx: any, character: any, target: string): string | null {
  const targetLower = target.toLowerCase();
  return (
    describeAll(ctx, character, (name) => String(name).toLowerCase() === targetLower) ??
    describeAll(ctx, character, (name) => String(name).toLowerCase().includes(targetLower))
  );
}
