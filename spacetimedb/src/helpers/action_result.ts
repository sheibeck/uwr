// The one writer of the per-character action_result row (Phase 50 plans 50-29 and 50-30). Callers:
// the craft path (craft_recipe and craft_recipe_count, plan 50-29), and salvage_item and
// research_recipes (Discover, plan 50-30). The row is the character's last result: each write
// replaces every field and raises seq by 1, so the client can tell a new result from the old one.
import { SenderError } from 'spacetimedb/server';
import { encodeResultLines, isResultKind, type ResultLine } from '../data/action_result';

export interface ActionResultFields {
  kind: string;
  templateId?: bigint;
  itemInstanceId?: bigint;
  itemName: string;
  rarity: string;
  craftQuality?: string;
  quantity: bigint;
  recipeTemplateId?: bigint;
  craftCount: bigint;
  lines: ResultLine[];
}

/** Insert the character's result row (seq 1n) or replace it (seq + 1n). Returns the written row. */
export function writeActionResult(ctx: any, characterId: bigint, fields: ActionResultFields): any {
  // An unknown kind is a programming error, not a player mistake.
  if (!isResultKind(fields.kind)) throw new SenderError(`Unknown result kind: ${String(fields.kind)}`);
  const existing = ctx.db.action_result.characterId.find(characterId);
  const row = {
    characterId,
    seq: existing ? existing.seq + 1n : 1n,
    kind: fields.kind,
    templateId: fields.templateId,
    itemInstanceId: fields.itemInstanceId,
    itemName: fields.itemName,
    rarity: fields.rarity,
    craftQuality: fields.craftQuality,
    quantity: fields.quantity,
    recipeTemplateId: fields.recipeTemplateId,
    craftCount: fields.craftCount,
    linesJson: encodeResultLines(fields.lines),
    at: ctx.timestamp,
  };
  if (existing) {
    ctx.db.action_result.characterId.update(row);
  } else {
    ctx.db.action_result.insert(row);
  }
  return row;
}
