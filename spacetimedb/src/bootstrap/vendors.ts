import { tableHasRows } from './utils';

export const ensureVendorInventory = (ctx: any) => {
  if (tableHasRows(ctx.db.vendorInventory.iter())) return;
  const vendor = [...ctx.db.npc.iter()].find((row) => row.npcType === 'vendor');
  if (!vendor) return;
  const templates = [...ctx.db.itemTemplate.iter()].filter(
    (row) => !row.isJunk && row.tier <= 1n
  );
  for (const template of templates) {
    const price = (template.vendorValue ?? 1n) + 4n;
    ctx.db.vendorInventory.insert({
      id: 0n,
      npcId: vendor.id,
      itemTemplateId: template.id,
      price,
    });
  }
};
