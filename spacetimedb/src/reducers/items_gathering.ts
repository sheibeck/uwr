import { scheduledReducers } from '../schema/tables';
import { getPerkBonusByField } from '../helpers/renown';
import { CRAFTING_MODIFIER_DEFS } from '../data/crafting_rules';
import { DENSITY_RULES, countToLevel, yieldForLevel } from '../data/density_rules';
import { exhaustedRefusal, gatherResult, lastGatherLine, placeNounFor } from '../data/density_lines';
import { gatherYield } from '../data/economy_rules';
import { loadEffectiveDials } from '../helpers/economy_state';
import { applyDepletion, settlePool } from '../helpers/pools';
import { recordHarvest } from '../helpers/harvest';

const isModifierReagent = (name: string): boolean => CRAFTING_MODIFIER_DEFS.some((d) => d.name === name);

/**
 * The gathering perk and racial bonuses, applied after the base yield on both the node path and the
 * pool path so the two keep identical perk behaviour. `seedId` is the node id (node path) or the pool
 * id (pool path). Never called for a modifier reagent (always exactly 1).
 */
function applyGatherBonuses(ctx: any, character: any, quantity: bigint, seedId: bigint): { quantity: bigint; message: string } {
  let gatherBonusMsg = '';
  const gatherSeed = (ctx.timestamp.microsSinceUnixEpoch + seedId) % 100n;
  const gatherDoubleChance = getPerkBonusByField(ctx, character.id, 'gatherDoubleChance', character.level);
  if (gatherDoubleChance > 0 && gatherSeed < BigInt(Math.floor(gatherDoubleChance))) {
    quantity = quantity * 2n;
    gatherBonusMsg = ' Your gathering perk triggered! Double resources collected.';
  } else {
    // Check rareGatherChance only if double didn't trigger (independent roll)
    const rareSeed = (ctx.timestamp.microsSinceUnixEpoch + seedId + character.id) % 100n;
    const rareGatherChance = getPerkBonusByField(ctx, character.id, 'rareGatherChance', character.level);
    if (rareGatherChance > 0 && rareSeed < BigInt(Math.floor(rareGatherChance))) {
      // Rare gather: add 50% extra resources
      const bonus = (quantity + 1n) / 2n;
      quantity = quantity + bonus;
      gatherBonusMsg = ' Your gathering perk found rare materials!';
    }
  }
  // Racial loot bonus: independent roll for +1 extra resource per % point
  const racialLootBonus = character.racialLootBonus ?? 0n;
  if (racialLootBonus > 0n) {
    const racialSeed = (ctx.timestamp.microsSinceUnixEpoch + seedId + character.id + 7n) % 100n;
    if (racialSeed < racialLootBonus) {
      quantity = quantity + 1n;
      gatherBonusMsg = gatherBonusMsg || ' Your racial instincts uncovered an extra resource!';
    }
  }
  return { quantity, message: gatherBonusMsg };
}

export const registerItemGatheringReducers = (deps: any) => {
  const {
    spacetimedb,
    appendPrivateEvent,
    addItemToInventory,
    activeCombatIdForCharacter,
    logPrivateAndGroup,
    ResourceGatherTick,
  } = deps;

  // A legacy node with no stored quantity yields today's 2 to 6 roll (finish_gather's node branch).
  const RESOURCE_GATHER_MIN_QTY = 2n;
  const RESOURCE_GATHER_MAX_QTY = 6n;

  // start_gather_resource and its spawn-based ambush are retired (Phase 51.3.1.1 Plan 27): gathering is
  // gather_pool (reducers/pools.ts). finish_gather keeps its legacy node branch, which drains old rows.

  /**
   * The pool path of finish_gather (Phase 51.3.1.1, D-26, D-27, D-38): the gather row goes first; a
   * character who left the pool's place or is fighting gets nothing. The pool is settled, and an
   * Exhausted pool prints the exhausted line and pays nothing. Otherwise the yield is one at any
   * non-zero density (yieldForLevel, D-72, times the named multiplier), then the 51.3 gather dial of
   * the pool's region (gatherYield), then the perk and racial bonuses; a modifier
   * reagent yields exactly 1. The pool loses GATHER_DEPLETION_POINTS (shared by every gatherer), the
   * player's harvest is recorded (the per-player cap), and the gather that empties the pool adds the
   * last-gather line.
   */
  const finishPoolGather = (ctx: any, gather: any) => {
    ctx.db.resource_gather.id.delete(gather.id);
    const character = ctx.db.character.id.find(gather.characterId);
    if (!character) return;
    const stored = ctx.db.place_pool.id.find(gather.poolId);
    if (!stored || stored.kind !== 'resource') return;
    if (character.locationId !== stored.locationId || activeCombatIdForCharacter(ctx, character.id)) return;
    const template = ctx.db.item_template.id.find(stored.refId);
    if (!template) return;
    const name: string = template.name;

    const now: bigint = ctx.timestamp.microsSinceUnixEpoch;
    const pool = settlePool(ctx, stored, now).pool;
    const level = countToLevel(pool.count);
    if (level === 0) {
      const location = ctx.db.location.id.find(pool.locationId);
      appendPrivateEvent(ctx, character.id, character.ownerUserId, 'system', exhaustedRefusal(name, placeNounFor(location ?? {})));
      return;
    }

    let quantity: bigint;
    let bonusMsg = '';
    if (isModifierReagent(name)) {
      quantity = 1n;
    } else {
      quantity = gatherYield(yieldForLevel(level), loadEffectiveDials(ctx, pool.regionId).gatherRatePct);
      const bonus = applyGatherBonuses(ctx, character, quantity, pool.id);
      quantity = bonus.quantity;
      bonusMsg = bonus.message;
    }

    addItemToInventory(ctx, character.id, template.id, quantity);
    logPrivateAndGroup(
      ctx,
      character,
      'reward',
      `${gatherResult(name, quantity)}${bonusMsg}`,
      `${character.name} gathers ${name} ×${quantity}.`
    );
    const shift = applyDepletion(ctx, pool, DENSITY_RULES.GATHER_DEPLETION_POINTS, now, 'gather');
    recordHarvest(ctx, character.id, pool.locationId, now);
    if (shift.pool.count === 0n) {
      logPrivateAndGroup(ctx, character, 'system', lastGatherLine(name));
    }
  };

  scheduledReducers['finish_gather'] = spacetimedb.reducer(
    'finish_gather',
    { arg: ResourceGatherTick.rowType },
    (ctx, { arg }) => {
      if (ctx.sender.toHexString() !== ctx.databaseIdentity.toHexString()) return;
      const gather = ctx.db.resource_gather.id.find(arg.gatherId);
      if (!gather) return;
      if ((gather.poolId ?? 0n) > 0n) {
        finishPoolGather(ctx, gather);
        return;
      }
      // The legacy node path (nodeId > 0n): a node that no longer exists deletes the row and returns.
      const character = ctx.db.character.id.find(gather.characterId);
      const node = ctx.db.resource_node.id.find(gather.nodeId);
      ctx.db.resource_gather.id.delete(gather.id);
      if (!character || !node) return;
      if (node.lockedByCharacterId?.toString() !== character.id.toString()) {
        ctx.db.resource_node.id.update({ ...node, state: 'available', lockedByCharacterId: undefined });
        return;
      }
      if (character.locationId !== node.locationId || activeCombatIdForCharacter(ctx, character.id)) {
        ctx.db.resource_node.id.update({ ...node, state: 'available', lockedByCharacterId: undefined });
        return;
      }
      // Modifier reagents (crafting affix components) always yield exactly 1
      const reagent = isModifierReagent(node.name);
      let quantity: bigint;
      if (reagent) {
        quantity = 1n;
      } else if (typeof node.quantity === 'bigint' && node.quantity > 0n) {
        // Phase 51.3 review A WR-06: the node keeps the quantity it was found with. The gather dial was
        // applied when the node spawned (the retired node spawner), so a dial change after that, or while this
        // gather was in flight, never changes the yield (CONTEXT Area 1: nodes already found keep their rolls).
        quantity = node.quantity;
      } else {
        // A node with no stored quantity: today's 2 to 6 roll.
        const qtyRange = RESOURCE_GATHER_MAX_QTY - RESOURCE_GATHER_MIN_QTY + 1n;
        quantity =
          RESOURCE_GATHER_MIN_QTY +
          ((ctx.timestamp.microsSinceUnixEpoch + node.id) % qtyRange);
      }

      // Apply gathering perk bonuses — skipped for modifier reagents (always exactly 1)
      let gatherBonusMsg = '';
      if (!reagent) {
        const bonus = applyGatherBonuses(ctx, character, quantity, node.id);
        quantity = bonus.quantity;
        gatherBonusMsg = bonus.message;
      }

      addItemToInventory(ctx, character.id, node.itemTemplateId, quantity);
      logPrivateAndGroup(
        ctx,
        character,
        'reward',
        `You gather ${node.name} x${quantity}.${gatherBonusMsg}`,
        `${character.name} gathers ${node.name} x${quantity}.`
      );
      // Personal node: delete immediately after gathering, no respawn
      ctx.db.resource_node.id.delete(node.id);
    }
  );
};
