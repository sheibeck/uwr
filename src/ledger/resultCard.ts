import { PhCube, PhMagnifyingGlass, PhPackage, PhScroll } from '@phosphor-icons/vue';
import { decodeResultLines } from '@game-data/action_result';
import type { ResultLine } from '@game-data/action_result';
import { sumItemStats } from '@game-data/item_stats';
import type { ActionResult, ItemAffix, ItemInstance, ItemTemplate } from '../module_bindings/types';
import { instanceStats } from './compare';
import { foodEffect, itemStatEntries } from './itemDetails';
import type { ItemStatEntry } from './itemDetails';
import { itemCategory, itemIcon, itemName, itemRarity, nameColor } from './itemModel';

// One result card for Crafted, Salvaged and Discover recipes (50-CONTEXT default "Result card").
// Its content comes only from the server's action_result row and the subscribed rows, never from
// guessing at inventory changes. The copy follows the mock's table (EXTRACT C.11). Names stay plain
// strings; the components render them as text nodes. Pure: no Vue reactivity.

/** A Phosphor icon component, as itemIcon returns it. */
type Component = ReturnType<typeof itemIcon>;

const USED_COLOR = 'var(--color-neutral-400)';
const ACCENT_COLOR = 'var(--color-accent)';
const MINUS = '−';

export interface ResultLineView {
  /** A stable key: kind, template and position. */
  key: string;
  kind: ResultLine['kind'] | 'tip';
  icon: Component;
  iconColor: string;
  name: string;
  /** '−6' for a used line, '+2' for a gain, empty for a found recipe or the tip. */
  qtyText: string;
  /** 'now 6' on a salvage gain, else empty. */
  totalText: string;
  /** 'Bonus' or 'Recipe found', else empty. */
  tag: string;
  /** The accent ring around a bonus or recipe scroll line. */
  ring: boolean;
  tone: 'used' | 'gain' | 'found' | 'tip';
}

export interface ResultCardView {
  /** 'craft', 'salvage' or 'discover' (an unknown value is carried as written). */
  kind: string;
  seq: bigint;
  kicker: string;
  title: string;
  titleColor: string;
  sub: string;
  /** 'x3' for a craft of more than one, else empty. */
  qtyTag: string;
  icon: Component;
  iconColor: string;
  stats: ItemStatEntry[];
  effect: string | null;
  listTitle: string;
  lines: ResultLineView[];
  /** Shown when there are no lines. */
  emptyText: string;
  footer: string;
  /** The polite live region text. */
  announce: string;
  /** The crafted gear instance the Equip action targets, or null. */
  equipInstanceId: bigint | null;
  /** The recipe scroll's bag row the Read scroll action targets, or null. */
  scrollInstanceId: bigint | null;
  recipeTemplateId: bigint | null;
  craftCount: bigint;
}

export interface ResultCardInput {
  row: ActionResult;
  templates: ReadonlyMap<bigint, ItemTemplate>;
  items: readonly ItemInstance[];
  affixes: readonly ItemAffix[];
}

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value !== '';
}

function capitalize(word: string): string {
  return word === '' ? '' : word.charAt(0).toUpperCase() + word.slice(1);
}

function lineIcon(template: ItemTemplate | undefined): Component {
  return template ? itemIcon(template) : PhPackage;
}

function lineName(line: ResultLine, template: ItemTemplate | undefined): string {
  return line.name !== '' ? line.name : template ? template.name : '';
}

function findInstance(items: readonly ItemInstance[], id: bigint | undefined): ItemInstance | null {
  if (id === undefined || id === null) return null;
  for (const item of items) if (item.id === id) return item;
  return null;
}

function craftLines(lines: readonly ResultLine[], templates: ReadonlyMap<bigint, ItemTemplate>): ResultLineView[] {
  const out: ResultLineView[] = [];
  lines.forEach((line, index) => {
    if (line.kind !== 'used') return;
    const template = templates.get(line.templateId);
    out.push({
      key: `used:${line.templateId}:${index}`,
      kind: 'used',
      icon: lineIcon(template),
      iconColor: USED_COLOR,
      name: lineName(line, template),
      qtyText: `${MINUS}${line.quantity}`,
      totalText: '',
      tag: '',
      ring: false,
      tone: 'used',
    });
  });
  return out;
}

function salvageLines(lines: readonly ResultLine[], templates: ReadonlyMap<bigint, ItemTemplate>): ResultLineView[] {
  const out: ResultLineView[] = [];
  lines.forEach((line, index) => {
    if (line.kind !== 'received' && line.kind !== 'bonus' && line.kind !== 'scroll') return;
    const template = templates.get(line.templateId);
    const scroll = line.kind === 'scroll';
    out.push({
      key: `${line.kind}:${line.templateId}:${index}`,
      kind: line.kind,
      icon: scroll ? PhScroll : lineIcon(template),
      iconColor: scroll ? ACCENT_COLOR : nameColor(itemRarity(null, template), false),
      name: lineName(line, template),
      qtyText: `+${line.quantity}`,
      totalText: `now ${line.total}`,
      tag: line.kind === 'bonus' ? 'Bonus' : scroll ? 'Recipe found' : '',
      ring: line.kind !== 'received',
      tone: 'gain',
    });
  });
  return out;
}

function discoverLines(lines: readonly ResultLine[]): ResultLineView[] {
  const out: ResultLineView[] = [];
  lines.forEach((line, index) => {
    if (line.kind !== 'recipe') return;
    out.push({
      key: `recipe:${line.templateId}:${index}`,
      kind: 'recipe',
      icon: PhScroll,
      iconColor: ACCENT_COLOR,
      name: line.name,
      qtyText: '',
      totalText: '',
      tag: '',
      ring: false,
      tone: 'found',
    });
  });
  return out;
}

function craftCard(input: ResultCardInput, base: ResultCardView, lines: ResultLine[]): ResultCardView {
  const { row, templates, items, affixes } = input;
  const template = row.templateId === undefined ? undefined : templates.get(row.templateId);
  const quantity = row.quantity;
  const many = quantity > 1n;
  const instance = findInstance(items, row.itemInstanceId);
  const gear = template !== undefined && itemCategory(template) === 'gear';
  let sub = many ? `${quantity} added to your bag` : 'Added to your bag';
  if (filled(row.craftQuality)) sub += ` · ${capitalize(row.craftQuality.toLowerCase())} quality`;
  let stats: ItemStatEntry[] = [];
  if (template !== undefined) {
    stats = itemStatEntries(
      instance !== null
        ? instanceStats(instance, template, affixes)
        : sumItemStats(template as unknown as Readonly<Record<string, unknown>>, []),
    );
  }
  return {
    ...base,
    kicker: 'Crafted',
    qtyTag: many ? `x${quantity}` : '',
    sub,
    icon: template ? itemIcon(template) : PhPackage,
    stats,
    effect: template ? foodEffect(template) : null,
    listTitle: 'Used',
    lines: craftLines(lines, templates),
    footer: 'Items went to your backpack. Also written to your log.',
    announce: many ? `Crafted ${quantity} ${base.title}.` : `Crafted ${base.title}.`,
    equipInstanceId:
      instance !== null && gear && !filled(instance.equippedSlot) ? instance.id : null,
  };
}

function salvageCard(input: ResultCardInput, base: ResultCardView, lines: ResultLine[]): ResultCardView {
  const { row, templates, items } = input;
  const template = row.templateId === undefined ? undefined : templates.get(row.templateId);
  const views = salvageLines(lines, templates);
  let scrollInstanceId: bigint | null = null;
  for (const line of lines) {
    if (line.kind !== 'scroll' || line.instanceId === null) continue;
    const found = findInstance(items, line.instanceId);
    if (found !== null) {
      scrollInstanceId = found.id;
      break;
    }
  }
  const received = views.map((v) => `${v.qtyText.slice(1)} ${v.name}`).join(', ');
  // Salvage is a chance, never a promise (owner, 2026-10-07): the sub and the footer only speak of
  // materials when the server reported some, and an empty roll says so plainly.
  const materials = views.some((v) => v.kind !== 'scroll');
  const scroll = views.some((v) => v.kind === 'scroll');
  let sub = 'Nothing usable was left';
  let footer = 'Also written to your log.';
  if (materials) {
    sub = 'Broken down into materials';
    footer = 'Materials went to your backpack. Also written to your log.';
  } else if (scroll) {
    sub = 'Only a recipe scroll came back';
    footer = 'The scroll went to your backpack. Also written to your log.';
  }
  return {
    ...base,
    kicker: 'Salvaged',
    sub,
    icon: template ? itemIcon(template) : PhPackage,
    listTitle: 'Received',
    lines: views,
    emptyText: views.length === 0 ? 'Nothing usable was left.' : '',
    footer,
    announce:
      views.length === 0
        ? `Salvaged ${base.title}. Nothing usable was left.`
        : `Salvaged ${base.title}. Received ${received}.`,
    scrollInstanceId,
  };
}

function discoverCard(base: ResultCardView, row: ActionResult, lines: ResultLine[]): ResultCardView {
  const found = row.quantity;
  const tip = 'Gather other materials to find new recipes.';
  if (found === 0n) {
    return {
      ...base,
      kicker: 'Discover recipes',
      title: 'Nothing new',
      titleColor: ACCENT_COLOR,
      sub: 'You already know every recipe your materials allow.',
      icon: PhMagnifyingGlass,
      iconColor: ACCENT_COLOR,
      listTitle: 'Tip',
      lines: [
        {
          key: 'tip:0',
          kind: 'tip',
          icon: PhCube,
          iconColor: USED_COLOR,
          name: tip,
          qtyText: '',
          totalText: '',
          tag: '',
          ring: false,
          tone: 'tip',
        },
      ],
      footer: 'Also written to your log.',
      announce: 'Discover recipes found nothing new.',
    };
  }
  const views = discoverLines(lines);
  const title = `${found} new ${found === 1n ? 'recipe' : 'recipes'}`;
  return {
    ...base,
    kicker: 'Discover recipes',
    title,
    titleColor: ACCENT_COLOR,
    sub: 'Added to your recipes.',
    icon: PhMagnifyingGlass,
    iconColor: ACCENT_COLOR,
    listTitle: 'Found',
    lines: views,
    footer: 'Also written to your log.',
    announce: `Discover recipes found ${title}${views.length > 0 ? `: ${views.map((v) => v.name).join(', ')}` : ''}.`,
  };
}

/** The shared result card's content for one action_result row. Never throws. */
export function resultCardView(input: ResultCardInput): ResultCardView {
  const { row, templates } = input;
  const template = row.templateId === undefined ? undefined : templates.get(row.templateId);
  const rarity = filled(row.rarity) ? row.rarity : itemRarity(null, template);
  const title = filled(row.itemName) ? row.itemName : itemName(null, template);
  const color = nameColor(rarity, false);
  const base: ResultCardView = {
    kind: row.kind,
    seq: row.seq,
    kicker: 'Done',
    title,
    titleColor: color,
    sub: '',
    qtyTag: '',
    icon: PhPackage,
    iconColor: color,
    stats: [],
    effect: null,
    listTitle: '',
    lines: [],
    emptyText: '',
    footer: 'Also written to your log.',
    announce: title === '' ? 'Done.' : `${title}.`,
    equipInstanceId: null,
    scrollInstanceId: null,
    recipeTemplateId: row.recipeTemplateId === undefined ? null : row.recipeTemplateId,
    craftCount: row.craftCount,
  };
  const lines = decodeResultLines(row.linesJson);
  switch (row.kind) {
    case 'craft':
      return craftCard(input, base, lines);
    case 'salvage':
      return salvageCard(input, base, lines);
    case 'discover':
      return discoverCard(base, row, lines);
    default:
      return base;
  }
}
