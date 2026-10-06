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

function typeLabel(slot: unknown): string {
  const key = typeof slot === 'string' ? slot : '';
  if (!key) return 'item';
  return TYPE_LABELS[key] ?? key.toLowerCase();
}

function describeNode(ctx: any, character: any, targetLower: string): string | null {
  const visible: any[] = [];
  for (const n of ctx.db.resource_node.by_location.filter(character.locationId)) {
    const owner = (n as any).characterId;
    if (owner === undefined || owner === null || owner === character.id) visible.push(n);
  }
  const exact = visible.filter((n) => String(n.name).toLowerCase() === targetLower);
  const pool = exact.length > 0 ? exact : visible.filter((n) => String(n.name).toLowerCase().includes(targetLower));
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

function describeItem(ctx: any, character: any, targetLower: string): string | null {
  const candidates: { instance: any; template: any; display: string }[] = [];
  for (const instance of ctx.db.item_instance.by_owner.filter(character.id)) {
    const template = ctx.db.item_template.id.find((instance as any).templateId);
    if (!template) continue;
    candidates.push({ instance, template, display: String((instance as any).displayName || template.name) });
  }
  const exact = candidates.find(
    (c) => c.display.toLowerCase() === targetLower || String(c.template.name).toLowerCase() === targetLower,
  );
  const hit =
    exact ??
    candidates.find(
      (c) => c.display.toLowerCase().includes(targetLower) || String(c.template.name).toLowerCase().includes(targetLower),
    );
  if (!hit) return null;

  const { instance, template, display } = hit;
  const rarity = String(instance.qualityTier || template.rarity || 'common').toLowerCase();
  const rarityCap = rarity.charAt(0).toUpperCase() + rarity.slice(1);
  const extras: string[] = [];
  for (const v of [template.armorType, template.weaponType]) {
    if (typeof v === 'string' && v !== '' && v !== 'none') extras.push(v);
  }
  const extraStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';

  const lines: string[] = [display, `${rarityCap} ${typeLabel(template.slot)}${extraStr}.`];

  if (instance.equippedSlot) {
    lines.push('You have it equipped.');
  } else if (BigInt(instance.quantity ?? 1n) > 1n) {
    lines.push(`You carry ${instance.quantity}.`);
  } else {
    lines.push('You carry one.');
  }

  if (template.description) lines.push(String(template.description));

  const big = (v: unknown): bigint => (typeof v === 'bigint' ? v : 0n);
  const statMap: [string, bigint][] = [
    ['STR', big(template.strBonus)],
    ['DEX', big(template.dexBonus)],
    ['INT', big(template.intBonus)],
    ['WIS', big(template.wisBonus)],
    ['CHA', big(template.chaBonus)],
    ['HP', big(template.hpBonus)],
    ['Mana', big(template.manaBonus)],
    ['AC', big(template.armorClassBonus)],
    ['MR', big(template.magicResistanceBonus)],
  ];
  const stats: string[] = [];
  for (const [name, val] of statMap) {
    if (val > 0n) stats.push(`${name} +${val}`);
  }
  const dmg = big(template.weaponBaseDamage);
  if (dmg > 0n) stats.push(`${dmg} damage`);
  if (stats.length > 0) lines.push(`Stats: ${stats.join(', ')}.`);

  if (big(template.requiredLevel) > 1n) lines.push(`Requires level ${big(template.requiredLevel)}.`);
  return lines.join('\n');
}

/** Text for appendPrivateEvent(..., 'look', text), or null when nothing matches. */
export function describeLookTarget(ctx: any, character: any, target: string): string | null {
  const targetLower = target.toLowerCase();

  // (a) NPCs
  for (const npc of ctx.db.npc.by_location.filter(character.locationId)) {
    if ((npc as any).name.toLowerCase() === targetLower || (npc as any).name.toLowerCase().includes(targetLower)) {
      return `[${(npc as any).name}]: ${(npc as any).description}`;
    }
  }

  // (b) Enemies
  const targetSpawns = [...ctx.db.enemy_spawn.by_location.filter(character.locationId)];
  for (const spawn of targetSpawns) {
    if (spawn.name.toLowerCase().includes(targetLower)) {
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
    if (other.id !== character.id && other.name.toLowerCase().includes(targetLower)) {
      return `${other.name}, Level ${other.level} ${other.race} ${other.className}.`;
    }
  }

  // (d) Resource nodes at the location, (e) the character's own inventory
  return describeNode(ctx, character, targetLower) ?? describeItem(ctx, character, targetLower);
}
