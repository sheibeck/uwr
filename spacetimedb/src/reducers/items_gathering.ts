import { scheduledReducers } from '../schema/tables';
import { getPerkBonusByField } from '../helpers/renown';
import { CRAFTING_MODIFIER_DEFS } from '../data/crafting_materials';

export const registerItemGatheringReducers = (deps: any) => {
  const {
    spacetimedb,
    t,
    ScheduleAt,
    requireCharacterOwnedBy,
    appendPrivateEvent,
    addItemToInventory,
    activeCombatIdForCharacter,
    logPrivateAndGroup,
    startCombatForSpawn,
    effectiveGroupId,
    getGroupParticipants,
    ResourceGatherTick,
    fail,
  } = deps;

  const failItem = (ctx: any, character: any, message: string) =>
    fail(ctx, character, message, 'system');

  // Gathering aggro tuning (percent chance).
  // Base chance applies at dangerMultiplier 100. Each +100 danger adds per-step.
  const GATHER_AGGRO_BASE_CHANCE = 20;
  const GATHER_AGGRO_PER_DANGER_STEP = 5;
  const GATHER_AGGRO_MAX_CHANCE = 45;

  const RESOURCE_GATHER_CAST_MICROS = 8_000_000n;
  const RESOURCE_GATHER_MIN_QTY = 2n;
  const RESOURCE_GATHER_MAX_QTY = 6n;

  // Demo flow: gather_resources -> research_recipes -> craft_recipe -> use_item (Bandage).
  spacetimedb.reducer(
    'start_gather_resource',
    { characterId: t.u64(), nodeId: t.u64() },
    (ctx, args) => {
      const character = requireCharacterOwnedBy(ctx, args.characterId);
      if (activeCombatIdForCharacter(ctx, character.id)) {
        return failItem(ctx, character, 'Cannot gather during combat');
      }
      const node = ctx.db.resourceNode.id.find(args.nodeId);
      if (!node) return failItem(ctx, character, 'Resource not found');
      if (node.locationId !== character.locationId) {
        return failItem(ctx, character, 'Resource is not here');
      }
      if (node.state !== 'available') {
        return failItem(ctx, character, 'Resource is not available');
      }
      for (const gather of ctx.db.resourceGather.by_character.filter(character.id)) {
        return failItem(ctx, character, 'Already gathering');
      }

      const location = ctx.db.location.id.find(character.locationId);
      const region = location ? ctx.db.region.id.find(location.regionId) : null;
      if (location && !location.isSafe) {
        const availableSpawns = [
          ...ctx.db.enemySpawn.by_location.filter(character.locationId),
        ].filter((row) => {
          if (row.state !== 'available') return false;
          if (row.groupCount > 0n) return true;
          return ctx.db.enemySpawnMember.by_spawn.filter(row.id).length > 0;
        });
        if (availableSpawns.length > 0) {
          const danger = Number(region?.dangerMultiplier ?? 100n);
          const dangerSteps = Math.max(0, Math.floor((danger - 100) / 100));
          const aggroChance = Math.min(
            GATHER_AGGRO_MAX_CHANCE,
            GATHER_AGGRO_BASE_CHANCE + dangerSteps * GATHER_AGGRO_PER_DANGER_STEP
          );
          const roll = Number(
            (ctx.timestamp.microsSinceUnixEpoch + character.id) % 100n
          );
          if (roll < aggroChance) {
            const spawnIndex = Number(
              (ctx.timestamp.microsSinceUnixEpoch + node.id) %
              BigInt(availableSpawns.length)
            );
            const spawnToUse = availableSpawns[spawnIndex] ?? availableSpawns[0];
            const participants = getGroupParticipants(ctx, character, true);
            appendPrivateEvent(
              ctx,
              character.id,
              character.ownerUserId,
              'system',
              `As you reach for ${node.name}, ${spawnToUse.name} notices you and attacks!`
            );
            startCombatForSpawn(
              ctx,
              character,
              spawnToUse,
              participants,
              effectiveGroupId(character)
            );
            return;
          }
        }
      }

      const gatherSpeedBonus = getPerkBonusByField(ctx, character.id, 'gatherSpeedBonus', character.level);
      const rawGatherDuration = BigInt(Math.round(Number(RESOURCE_GATHER_CAST_MICROS) * (1 - gatherSpeedBonus / 100)));
      const gatherDurationMicros = rawGatherDuration < 500_000n ? 500_000n : rawGatherDuration;
      const endsAt = ctx.timestamp.microsSinceUnixEpoch + gatherDurationMicros;
      ctx.db.resourceNode.id.update({
        ...node,
        state: 'harvesting',
        lockedByCharacterId: character.id,
      });
      const gather = ctx.db.resourceGather.insert({
        id: 0n,
        characterId: character.id,
        nodeId: node.id,
        endsAtMicros: endsAt,
      });
      ctx.db.resourceGatherTick.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(endsAt),
        gatherId: gather.id,
      });
      logPrivateAndGroup(
        ctx,
        character,
        'system',
        `You begin gathering ${node.name}.`,
        `${character.name} begins gathering ${node.name}.`
      );
    }
  );

  scheduledReducers['finish_gather'] = spacetimedb.reducer(
    'finish_gather',
    { arg: ResourceGatherTick.rowType },
    (ctx, { arg }) => {
      const gather = ctx.db.resourceGather.id.find(arg.gatherId);
      if (!gather) return;
      if (!gather) return;
      const character = ctx.db.character.id.find(gather.characterId);
      const node = ctx.db.resourceNode.id.find(gather.nodeId);
      ctx.db.resourceGather.id.delete(gather.id);
      if (!character || !node) return;
      if (node.lockedByCharacterId?.toString() !== character.id.toString()) {
        ctx.db.resourceNode.id.update({ ...node, state: 'available', lockedByCharacterId: undefined });
        return;
      }
      if (character.locationId !== node.locationId || activeCombatIdForCharacter(ctx, character.id)) {
        ctx.db.resourceNode.id.update({ ...node, state: 'available', lockedByCharacterId: undefined });
        return;
      }
      // Modifier reagents (crafting affix components) always yield exactly 1
      const isModifierReagent = CRAFTING_MODIFIER_DEFS.some(d => d.name === node.name);
      let quantity: bigint;
      if (isModifierReagent) {
        quantity = 1n;
      } else {
        const qtyRange = RESOURCE_GATHER_MAX_QTY - RESOURCE_GATHER_MIN_QTY + 1n;
        quantity =
          RESOURCE_GATHER_MIN_QTY +
          ((ctx.timestamp.microsSinceUnixEpoch + node.id) % qtyRange);
      }

      // Apply gathering perk bonuses — skipped for modifier reagents (always exactly 1)
      let gatherBonusMsg = '';
      if (!isModifierReagent) {
        const gatherSeed = (ctx.timestamp.microsSinceUnixEpoch + node.id) % 100n;
        const gatherDoubleChance = getPerkBonusByField(ctx, character.id, 'gatherDoubleChance', character.level);
        if (gatherDoubleChance > 0 && gatherSeed < BigInt(Math.floor(gatherDoubleChance))) {
          quantity = quantity * 2n;
          gatherBonusMsg = ' Your gathering perk triggered! Double resources collected.';
        } else {
          // Check rareGatherChance only if double didn't trigger (independent roll)
          const rareSeed = (ctx.timestamp.microsSinceUnixEpoch + node.id + character.id) % 100n;
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
          const racialSeed = (ctx.timestamp.microsSinceUnixEpoch + node.id + character.id + 7n) % 100n;
          if (racialSeed < racialLootBonus) {
            quantity = quantity + 1n;
            gatherBonusMsg = gatherBonusMsg || ' Your racial instincts uncovered an extra resource!';
          }
        }
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
      ctx.db.resourceNode.id.delete(node.id);
    }
  );
};
