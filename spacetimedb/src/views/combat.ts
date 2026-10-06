import type { ViewDeps } from './types';

// ============================================================================
// my_combat_aggro: per-sender projection of the private aggro_entry table (CMB-02)
// ============================================================================
//
// Reaches aggro_entry only through chained index lookups
// (player.id -> character.by_owner_user -> combat_participant.by_character -> aggro_entry.by_combat),
// so a subscriber sees the threat rows of the fights their own characters take part in
// and nobody else's. Pet rows are dropped; the projection never carries petId.
// ============================================================================

export const MY_COMBAT_AGGRO_KEYS = ['id', 'combatId', 'enemyId', 'characterId', 'value'] as const;

export function myCombatAggroRows(ctx: any): {
  id: bigint;
  combatId: bigint;
  enemyId: bigint;
  characterId: bigint;
  value: bigint;
}[] {
  const player = ctx.db.player.id.find(ctx.sender);
  if (!player || player.userId == null) return [];
  const combatIds = new Set<bigint>();
  for (const character of ctx.db.character.by_owner_user.filter(player.userId)) {
    for (const participant of ctx.db.combat_participant.by_character.filter(character.id)) {
      combatIds.add(participant.combatId);
    }
  }
  const rows: { id: bigint; combatId: bigint; enemyId: bigint; characterId: bigint; value: bigint }[] = [];
  for (const combatId of combatIds) {
    for (const entry of ctx.db.aggro_entry.by_combat.filter(combatId)) {
      if (entry.petId != null) continue;
      rows.push({
        id: entry.id,
        combatId: entry.combatId,
        enemyId: entry.enemyId,
        characterId: entry.characterId,
        value: entry.value,
      });
    }
  }
  return rows;
}

export const registerCombatViews = ({ spacetimedb, t, CombatResult, CombatLoot }: ViewDeps) => {
  spacetimedb.view(
    { name: 'my_combat_results', public: true },
    t.array(CombatResult.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null) return [];
      return [...ctx.db.combat_result.by_owner_user.filter(player.userId)];
    }
  );

  spacetimedb.view(
    { name: 'my_combat_loot', public: true },
    t.array(CombatLoot.rowType),
    (ctx: any) => {
      const player = ctx.db.player.id.find(ctx.sender);
      if (!player || player.userId == null || !player.activeCharacterId) return [];
      return [...ctx.db.combat_loot.by_character.filter(player.activeCharacterId)];
    }
  );

  // The row name must differ from the view's own generated struct (MyCombatAggro).
  const MyCombatAggroEntry = t.row('MyCombatAggroEntry', {
    id: t.u64().primaryKey(),
    combatId: t.u64(),
    enemyId: t.u64(),
    characterId: t.u64(),
    value: t.u64(),
  });

  spacetimedb.view(
    { name: 'my_combat_aggro', public: true },
    t.array(MyCombatAggroEntry),
    (ctx: any) => myCombatAggroRows(ctx)
  );
};
