import { requireAdmin } from '../data/admin';
import { fireWorldEvent, resolveWorldEvent, incrementWorldStat, despawnEventContent } from '../helpers/world_events';
import { appendPrivateEvent } from '../helpers/events';
import { EventDespawnTick } from '../schema/tables';

export function registerWorldEventReducers(deps: any) {
  const { spacetimedb, t, SenderError } = deps;

  // fire_world_event — Admin-only reducer to fire a world event by eventKey
  spacetimedb.reducer('fire_world_event', { eventKey: t.string() }, (ctx: any, { eventKey }: { eventKey: string }) => {
    // Admin guard
    requireAdmin(ctx);

    const result = fireWorldEvent(ctx, eventKey);
    if (!result) {
      throw new SenderError(`Event '${eventKey}' not found, already resolved, or is one-time and already completed`);
    }
  });

  // resolve_world_event — Admin-only reducer to resolve an active world event
  spacetimedb.reducer(
    'resolve_world_event',
    { worldEventId: t.u64(), outcome: t.string() },
    (ctx: any, { worldEventId, outcome }: { worldEventId: bigint; outcome: string }) => {
      // Admin guard
      requireAdmin(ctx);

      // Validate outcome
      if (outcome !== 'success' && outcome !== 'failure') {
        throw new SenderError("Outcome must be 'success' or 'failure'");
      }

      // Look up event
      const event = ctx.db.worldEvent.id.find(worldEventId);
      if (!event) {
        throw new SenderError('World event not found');
      }
      if (event.status !== 'active') {
        throw new SenderError(`Event is not active (current status: ${event.status})`);
      }

      resolveWorldEvent(ctx, event, outcome as 'success' | 'failure');
    }
  );

  // collect_event_item — Player collects an event-spawned item and increments contribution
  spacetimedb.reducer(
    'collect_event_item',
    { eventSpawnItemId: t.u64(), characterId: t.u64() },
    (ctx: any, { eventSpawnItemId, characterId }: { eventSpawnItemId: bigint; characterId: bigint }) => {
      // Validate character ownership
      const character = ctx.db.character.id.find(characterId);
      if (!character) throw new SenderError('Character not found');
      if (character.ownerUserId.toHexString() !== ctx.sender.toHexString()) {
        throw new SenderError('You do not own this character');
      }

      // Find the EventSpawnItem
      const spawnItem = ctx.db.eventSpawnItem.id.find(eventSpawnItemId);
      if (!spawnItem) throw new SenderError('Event item not found');
      if (spawnItem.collected) throw new SenderError('Item already collected');

      // Validate character is at the item's location
      if (character.locationId !== spawnItem.locationId) {
        throw new SenderError('You must be at the item location to collect it');
      }

      // Check event is still active
      const event = ctx.db.worldEvent.id.find(spawnItem.eventId);
      if (!event || event.status !== 'active') {
        throw new SenderError('This event is no longer active');
      }

      // Mark item collected
      ctx.db.eventSpawnItem.id.update({
        ...spawnItem,
        collected: true,
        collectedByCharacterId: characterId,
      });

      // Increment EventContribution count for this character and event
      let found = false;
      for (const contrib of ctx.db.eventContribution.by_character.filter(characterId)) {
        if (contrib.eventId === spawnItem.eventId) {
          ctx.db.eventContribution.id.update({
            ...contrib,
            count: contrib.count + 1n,
          });
          found = true;
          break;
        }
      }
      // If no contribution row exists yet, insert one with count=1
      if (!found) {
        ctx.db.eventContribution.insert({
          id: 0n,
          eventId: spawnItem.eventId,
          characterId,
          count: 1n,
          regionEnteredAt: ctx.timestamp,
        });
      }

      appendPrivateEvent(
        ctx,
        character.id,
        character.ownerUserId,
        'world_event',
        `You collected: ${spawnItem.name}`
      );
    }
  );

  // increment_event_counter — Increments success or failure counter for a threshold_race event
  // Used by combat/objective hooks; auto-resolves when threshold is hit
  spacetimedb.reducer(
    'increment_event_counter',
    { eventId: t.u64(), side: t.string(), amount: t.u64() },
    (ctx: any, { eventId, side, amount }: { eventId: bigint; side: string; amount: bigint }) => {
      if (side !== 'success' && side !== 'failure') {
        throw new SenderError("Side must be 'success' or 'failure'");
      }

      const event = ctx.db.worldEvent.id.find(eventId);
      if (!event) throw new SenderError('World event not found');
      if (event.status !== 'active') return; // silently ignore if resolved

      if (event.failureConditionType !== 'threshold_race') {
        throw new SenderError('Event is not a threshold_race event');
      }

      let updatedEvent = { ...event };

      if (side === 'success') {
        const newSuccess = (event.successCounter ?? 0n) + amount;
        updatedEvent = { ...updatedEvent, successCounter: newSuccess };
        // Check if success threshold hit (0n = no threshold)
        if (event.successThreshold > 0n && newSuccess >= event.successThreshold) {
          ctx.db.worldEvent.id.update(updatedEvent);
          const fresh = ctx.db.worldEvent.id.find(eventId)!;
          resolveWorldEvent(ctx, fresh, 'success');
          return;
        }
      } else {
        const newFailure = (event.failureCounter ?? 0n) + amount;
        updatedEvent = { ...updatedEvent, failureCounter: newFailure };
        // Check if failure threshold hit (0n = no threshold)
        if (event.failureThreshold > 0n && newFailure >= event.failureThreshold) {
          ctx.db.worldEvent.id.update(updatedEvent);
          const fresh = ctx.db.worldEvent.id.find(eventId)!;
          resolveWorldEvent(ctx, fresh, 'failure');
          return;
        }
      }

      ctx.db.worldEvent.id.update(updatedEvent);
    }
  );

  // despawn_event_content — Scheduled reducer (kept for manual/emergency despawn via console)
  // resolveWorldEvent now calls despawnEventContent directly for immediate cleanup.
  spacetimedb.reducer(
    'despawn_event_content',
    { arg: EventDespawnTick.rowType },
    (ctx: any, { arg }: any) => {
      despawnEventContent(ctx, arg.eventId);
    }
  );
}
