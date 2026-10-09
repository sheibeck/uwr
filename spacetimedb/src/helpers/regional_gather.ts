// A region's AI gatherables in the resource node pool (Phase 51.3 Plan 07, CONTEXT Area 3).
//
// The economy design for a region tags its generated gatherable item templates in economy_item with
// role 'gather', a terrain and a time of day. The resource pools (Phase 51.3.1.1) add them to the gather table of a location in
// that region whose terrain matches, next to today's terrain gatherables, MATERIAL_DEFS and reagents,
// which stay as they are. Resolution is by item template id through economy_item, never by name, so a
// same-named template cannot take a generated one's place. Another region's rows are never read.
//
// Duck-typed ctx (a reducer ctx or a withTx tx). Imports only data modules and nothing from
// helpers/location.ts (location.ts imports this file). Never throws on a missing row.
import { GATHER_WEIGHTS } from '../data/economy_design_rules';

export interface RegionalGatherEntry {
  template: any;
  weight: bigint;
  timeOfDay: string;
}

/**
 * The region's gather rows for this terrain and time of day, as pool entries: weight common 15,
 * uncommon 8, rare 3 (3 for any other rarity), sorted by template id. A row whose template is gone is
 * skipped. A time preference that is empty or 'any' keeps every row; otherwise a row stays when its
 * own time of day is 'any' or equal to the preference.
 */
export function regionalGatherEntries(
  ctx: any,
  regionId: bigint,
  terrain: string,
  timePref?: string,
): RegionalGatherEntry[] {
  const key = (terrain ?? '').trim().toLowerCase();
  const pref = (timePref ?? '').trim().toLowerCase();
  const out: RegionalGatherEntry[] = [];
  for (const row of ctx.db.economy_item.by_region.filter(regionId)) {
    if (row.role !== 'gather') continue;
    if ((row.terrain ?? '').trim().toLowerCase() !== key) continue;
    const timeOfDay = (row.timeOfDay ?? '').trim().toLowerCase() || 'any';
    if (pref && pref !== 'any' && timeOfDay !== 'any' && timeOfDay !== pref) continue;
    const template = ctx.db.item_template.id.find(row.itemTemplateId);
    if (!template) continue;
    const rarity = typeof row.rarity === 'string' ? row.rarity.trim().toLowerCase() : '';
    out.push({ template, weight: GATHER_WEIGHTS[rarity] ?? 3n, timeOfDay });
  }
  return out.sort((a, b) => (a.template.id < b.template.id ? -1 : a.template.id > b.template.id ? 1 : 0));
}
