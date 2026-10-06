// Pure model for the ability cards at CLASS_REVEALED and the chosen ability name for the sheet.
// Both read the stored abilities JSON with the server's own indexing rule. Every value is a plain
// string (text nodes later). The icon for a kind is resolved in the component (abilityIcon from
// src/hotbar/hotbar.ts), not here.

export interface AbilityCard {
  key: string;
  name: string;
  description: string;
  kind: string;
  tags: string[];
  ariaLabel: string;
  /** The ability name; the server matches the choice by name. */
  sends: string;
}

const CARD_COUNT = 3;

function parseArray(json: string | null | undefined): unknown[] | null {
  if (typeof json !== 'string' || json.length === 0) return null;
  try {
    const data: unknown = JSON.parse(json);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function tagsFor(entry: Record<string, unknown>, kind: string): string[] {
  const tags: string[] = [];
  if (kind.length > 0) tags.push(kind.replace(/_/g, ' '));
  const cost = positiveNumber(entry.resourceCost);
  const resourceType = entry.resourceType;
  if (cost !== null && typeof resourceType === 'string' && resourceType.length > 0) {
    tags.push(`${cost} ${resourceType}`);
  }
  const cooldown = positiveNumber(entry.cooldownSeconds);
  if (cooldown !== null) tags.push(`${cooldown}s cooldown`);
  return tags;
}

export function parseAbilityCards(json: string | null | undefined): AbilityCard[] {
  const list = parseArray(json);
  if (list === null) return [];
  const cards: AbilityCard[] = [];
  for (let index = 0; index < list.length && cards.length < CARD_COUNT; index++) {
    const entry = asRecord(list[index]);
    if (entry === null) continue;
    const name = entry.name;
    if (typeof name !== 'string' || name.trim().length === 0) continue;
    const kind = typeof entry.kind === 'string' ? entry.kind : '';
    cards.push({
      key: `${index}:${name}`,
      name,
      description: typeof entry.description === 'string' ? entry.description : '',
      kind,
      tags: tagsFor(entry, kind),
      ariaLabel: `${name}. Start with this ability.`,
      sends: name,
    });
  }
  return cards;
}

/** Mirrors the server summary: abilities[Number(chosenAbilityIndex)] and `name || abilityName`. */
export function chosenAbilityName(json: string | null | undefined, index: bigint | null | undefined): string | null {
  if (index === null || index === undefined) return null;
  const list = parseArray(json);
  if (list === null) return null;
  const entry = asRecord(list[Number(index)]);
  if (entry === null) return null;
  if (typeof entry.name === 'string' && entry.name.length > 0) return entry.name;
  if (typeof entry.abilityName === 'string' && entry.abilityName.length > 0) return entry.abilityName;
  return null;
}
