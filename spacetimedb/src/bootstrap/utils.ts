export const tableHasRows = <T>(iter: IterableIterator<T>): boolean => {
  for (const _row of iter) return true;
  return false;
};

export const connectLocations = (ctx: any, fromId: bigint, toId: bigint) => {
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: fromId, toLocationId: toId });
  ctx.db.locationConnection.insert({ id: 0n, fromLocationId: toId, toLocationId: fromId });
};

export const findEnemyTemplateByName = (ctx: any, name: string) => {
  for (const row of ctx.db.enemyTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
};

export const findItemTemplateByName = (ctx: any, name: string) => {
  for (const row of ctx.db.itemTemplate.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
};

export const findCharacterByName = (ctx: any, name: string) => {
  for (const row of ctx.db.character.iter()) {
    if (row.name.toLowerCase() === name.toLowerCase()) return row;
  }
  return null;
};

export const friendUserIds = (ctx: any, userId: bigint): bigint[] => {
  const ids: bigint[] = [];
  for (const row of ctx.db.friend.by_user.filter(userId)) {
    ids.push(row.friendUserId);
  }
  return ids;
};

export const computeEnemyStats = (
  template: { maxHp: bigint; baseDamage: bigint; armorClass: bigint },
  _participants: any[]
) => {
  return {
    maxHp: template.maxHp,
    attackDamage: template.baseDamage,
    armorClass: template.armorClass,
  };
};

export const applyArmorMitigation = (damage: bigint, armorClass: bigint) => {
  if (damage <= 0n) return 0n;
  const reduction = armorClass > 0n ? armorClass : 0n;
  const mitigated = damage > reduction ? damage - reduction : 1n;
  return mitigated;
};
