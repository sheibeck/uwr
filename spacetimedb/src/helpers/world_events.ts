import { WORLD_EVENT_DEFINITIONS } from '../data/world_event_data';
import { appendWorldEvent, appendPrivateEvent } from './events';
import { awardRenown } from './renown';
import { mutateStanding } from './economy';

// Deps interface for dependency injection (avoids circular imports)
export type WorldEventDeps = {
  awardRenown?: typeof awardRenown;
  mutateStanding?: typeof mutateStanding;
  addItemToInventory?: (ctx: any, characterId: bigint, templateKey: string, quantity: bigint) => void;
};

function getDefaultDeps(): WorldEventDeps {
  return { awardRenown, mutateStanding };
}

/**
 * fireWorldEvent — fire a world event by key.
 * Looks up the event definition, resolves regionKey to regionId,
 * enforces one-time event guard, inserts WorldEvent row (with consequenceText from REQ-034),
 * spawns event content, and logs to world event feed.
 */
export function fireWorldEvent(ctx: any, eventKey: string, deps?: WorldEventDeps): any {
  const resolvedDeps = { ...getDefaultDeps(), ...deps };
  const eventDef = WORLD_EVENT_DEFINITIONS[eventKey];
  if (!eventDef) {
    return null;
  }

  // One-time event guard: if already resolved and not recurring, reject
  if (!eventDef.isRecurring) {
    for (const existing of ctx.db.worldEvent.by_status.filter('success')) {
      if (existing.eventKey === eventKey) return null;
    }
    for (const existing of ctx.db.worldEvent.by_status.filter('failed')) {
      if (existing.eventKey === eventKey) return null;
    }
  }

  // Resolve regionKey to regionId via name match
  let regionId = 0n;
  for (const region of ctx.db.region.iter()) {
    if (region.name === eventDef.regionKey) {
      regionId = region.id;
      break;
    }
  }

  // Compute deadline for time-based failure
  let deadlineAtMicros: bigint | undefined = undefined;
  if (eventDef.failureConditionType === 'time' && eventDef.durationMicros) {
    deadlineAtMicros = ctx.timestamp.microsSinceUnixEpoch + eventDef.durationMicros;
  }

  // Serialize reward tiers to JSON
  const rewardTiersJson = JSON.stringify(eventDef.rewardTiers);

  // Insert WorldEvent row — CRITICAL (REQ-034): write consequenceTextStub to consequenceText at insert time
  const eventRow = ctx.db.worldEvent.insert({
    id: 0n,
    eventKey,
    name: eventDef.name,
    regionId,
    status: 'active',
    isRecurring: eventDef.isRecurring,
    firedAt: ctx.timestamp,
    resolvedAt: undefined,
    failureConditionType: eventDef.failureConditionType,
    deadlineAtMicros,
    successThreshold: eventDef.successThreshold,
    failureThreshold: eventDef.failureThreshold,
    successCounter: eventDef.failureConditionType === 'threshold_race' ? 0n : undefined,
    failureCounter: eventDef.failureConditionType === 'threshold_race' ? 0n : undefined,
    successConsequenceType: eventDef.successConsequenceType,
    successConsequencePayload: eventDef.successConsequencePayload,
    failureConsequenceType: eventDef.failureConsequenceType,
    failureConsequencePayload: eventDef.failureConsequencePayload,
    rewardTiersJson,
    consequenceText: eventDef.consequenceTextStub ?? '',
  });

  // Spawn event-exclusive content
  spawnEventContent(ctx, eventRow.id, eventDef, resolvedDeps);

  // Log world event announcement
  appendWorldEvent(ctx, 'world_event', `World Event ACTIVE: ${eventDef.name} — ${eventDef.consequenceTextStub ?? ''}`);

  return eventRow;
}

/**
 * spawnEventContent — create event-exclusive enemies and items at content locations.
 * For each contentLocation: resolves locationKey to locationId, spawns enemies (EnemySpawn + EnemySpawnMember + EventSpawnEnemy),
 * inserts EventSpawnItem rows, and creates EventObjective rows.
 */
export function spawnEventContent(ctx: any, eventId: bigint, eventDef: any, _deps?: WorldEventDeps): void {
  for (const contentLocation of eventDef.contentLocations) {
    // Resolve locationKey to locationId via name match
    let locationId = 0n;
    for (const loc of ctx.db.location.iter()) {
      if (loc.name === contentLocation.locationKey) {
        locationId = loc.id;
        break;
      }
    }
    if (locationId === 0n) continue;

    // Spawn event enemies
    for (const enemySpec of contentLocation.enemies) {
      // Look up EnemyTemplate by name
      let enemyTemplate: any = null;
      for (const tmpl of ctx.db.enemyTemplate.iter()) {
        if (tmpl.name === enemySpec.enemyTemplateKey) {
          enemyTemplate = tmpl;
          break;
        }
      }
      if (!enemyTemplate) continue;

      // Look up a role template for this enemy template (use first found)
      let roleTemplateId = 0n;
      for (const roleTemplate of ctx.db.enemyRoleTemplate.by_template.filter(enemyTemplate.id)) {
        roleTemplateId = roleTemplate.id;
        break;
      }

      // Create one EnemySpawn group for the count
      const groupCount = BigInt(enemySpec.count);
      const spawn = ctx.db.enemySpawn.insert({
        id: 0n,
        locationId,
        enemyTemplateId: enemyTemplate.id,
        name: `${enemyTemplate.name} (Event)`,
        state: 'available',
        lockedCombatId: undefined,
        groupCount,
      });

      // Insert EnemySpawnMember rows for each enemy in the group
      for (let i = 0; i < enemySpec.count; i++) {
        ctx.db.enemySpawnMember.insert({
          id: 0n,
          spawnId: spawn.id,
          enemyTemplateId: enemyTemplate.id,
          roleTemplateId,
        });
      }

      // Insert EventSpawnEnemy row linking this spawn to the event
      ctx.db.eventSpawnEnemy.insert({
        id: 0n,
        eventId,
        spawnId: spawn.id,
        locationId,
      });
    }

    // Insert EventSpawnItem rows for event-exclusive collectibles
    for (const itemSpec of contentLocation.items) {
      for (let i = 0; i < itemSpec.count; i++) {
        ctx.db.eventSpawnItem.insert({
          id: 0n,
          eventId,
          locationId,
          name: itemSpec.name,
          collected: false,
          collectedByCharacterId: undefined,
        });
      }
    }

    // Create EventObjective rows based on failure condition type
    if (eventDef.failureConditionType === 'threshold_race') {
      // protect_npc objective — track villager survival (failure side)
      ctx.db.eventObjective.insert({
        id: 0n,
        eventId,
        objectiveType: 'protect_npc',
        locationId,
        name: 'Protect the Villagers',
        targetCount: eventDef.failureThreshold ?? 10n,
        currentCount: 0n,
        isAlive: true,
      });
      // kill_count objective — track invader kills (success side)
      ctx.db.eventObjective.insert({
        id: 0n,
        eventId,
        objectiveType: 'kill_count',
        locationId,
        name: 'Defeat the Invaders',
        targetCount: eventDef.successThreshold ?? 20n,
        currentCount: 0n,
        isAlive: undefined,
      });
    } else {
      // Time-based: kill_count objective
      const totalEnemies = contentLocation.enemies.reduce((sum: number, e: any) => sum + e.count, 0);
      ctx.db.eventObjective.insert({
        id: 0n,
        eventId,
        objectiveType: 'kill_count',
        locationId,
        name: `Defeat Event Enemies`,
        targetCount: BigInt(totalEnemies),
        currentCount: 0n,
        isAlive: undefined,
      });
    }
  }
}

/**
 * resolveWorldEvent — resolve an active event with outcome 'success' or 'failure'.
 * Guards against double-resolve. Updates WorldEvent status, applies consequences,
 * awards tiered rewards, logs resolution, schedules EventDespawnTick at +2 minutes.
 */
export function resolveWorldEvent(ctx: any, eventRow: any, outcome: 'success' | 'failure', deps?: WorldEventDeps): void {
  // Guard: prevent double-resolve
  if (eventRow.status !== 'active') return;

  const resolvedDeps = { ...getDefaultDeps(), ...deps };

  // Update WorldEvent status to outcome
  ctx.db.worldEvent.id.update({
    ...eventRow,
    status: outcome,
    resolvedAt: ctx.timestamp,
  });

  // Apply world consequence
  applyConsequence(ctx, eventRow, outcome);

  // Award tiered rewards to participants
  awardEventRewards(ctx, eventRow, outcome, resolvedDeps);

  // Log world event resolution
  const outcomeText = outcome === 'success' ? 'SUCCESS' : 'FAILED';
  appendWorldEvent(
    ctx,
    'world_event',
    `World Event ${outcomeText}: ${eventRow.name} has concluded. The world is changed.`
  );

  // Schedule EventDespawnTick at 2 minutes from now
  const despawnAtMicros = ctx.timestamp.microsSinceUnixEpoch + 120_000_000n;
  ctx.db.eventDespawnTick.insert({
    scheduledId: 0n,
    scheduledAt: { tag: 'Time', value: { microsSinceUnixEpoch: despawnAtMicros } },
    eventId: eventRow.id,
  });
}

/**
 * applyConsequence — applies either the success or failure consequence to world state.
 * Switches on consequenceType for the given outcome.
 */
export function applyConsequence(ctx: any, eventRow: any, outcome: 'success' | 'failure'): void {
  const consequenceType =
    outcome === 'success' ? eventRow.successConsequenceType : eventRow.failureConsequenceType;
  const payload =
    outcome === 'success' ? eventRow.successConsequencePayload : eventRow.failureConsequencePayload;

  switch (consequenceType) {
    case 'race_unlock': {
      // Unlock a race by name
      for (const race of ctx.db.race.iter()) {
        if (race.name === payload) {
          ctx.db.race.id.update({ ...race, unlocked: true });
          appendWorldEvent(ctx, 'world_event', `The ${race.name} race has been unlocked!`);
          break;
        }
      }
      break;
    }
    case 'faction_standing_bonus': {
      // Award standing to ALL contributors
      let parsed: { factionId: number; amount: number } | null = null;
      try {
        parsed = JSON.parse(payload);
      } catch (_e) {
        break;
      }
      if (!parsed) break;
      const factionIdBig = BigInt(parsed.factionId);
      const amountBig = BigInt(parsed.amount);
      for (const contribution of ctx.db.eventContribution.by_event.filter(eventRow.id)) {
        if (contribution.count === 0n) continue;
        mutateStanding(ctx, contribution.characterId, factionIdBig, amountBig);
      }
      break;
    }
    case 'enemy_composition_change': {
      // Log the change — actual spawn modification deferred to future
      appendWorldEvent(
        ctx,
        'world_event',
        `Enemy composition in the region has shifted permanently: ${payload}`
      );
      break;
    }
    case 'system_unlock': {
      // Log the unlock — actual mechanic unlock deferred to implementation
      appendWorldEvent(ctx, 'world_event', `A new system has been unlocked: ${payload}`);
      break;
    }
    case 'none':
    default: {
      // No-op
      break;
    }
  }
}

/**
 * awardEventRewards — iterate EventContribution for the event and award Bronze/Silver/Gold tiered rewards.
 * Zero-contribution participants receive NO rewards.
 */
export function awardEventRewards(ctx: any, eventRow: any, outcome: 'success' | 'failure', deps?: WorldEventDeps): void {
  const resolvedDeps = { ...getDefaultDeps(), ...deps };

  // Parse reward tiers from JSON
  let rewardTiers: any = null;
  try {
    rewardTiers = JSON.parse(eventRow.rewardTiersJson);
  } catch (_e) {
    return;
  }
  if (!rewardTiers) return;

  const bronze = rewardTiers.bronze;
  const silver = rewardTiers.silver;
  const gold = rewardTiers.gold;

  // Iterate all contributors for this event
  for (const contribution of ctx.db.eventContribution.by_event.filter(eventRow.id)) {
    // Zero-contribution guard: skip if no meaningful interactions
    if (contribution.count === 0n) continue;

    // Determine tier
    const count = Number(contribution.count);
    let tierSpec: any;
    if (count >= gold.threshold) {
      tierSpec = gold;
    } else if (count >= silver.threshold) {
      tierSpec = silver;
    } else {
      tierSpec = bronze;
    }

    // Get reward for this outcome
    const reward: {
      renown: number;
      gold: number;
      factionId: number | null;
      factionAmount: number;
      itemTemplateKey: string | null;
    } = tierSpec[outcome];

    // Look up character
    const character = ctx.db.character.id.find(contribution.characterId);
    if (!character) continue;

    // Award renown
    if (reward.renown > 0 && resolvedDeps.awardRenown) {
      resolvedDeps.awardRenown(ctx, character, BigInt(reward.renown), `World Event: ${eventRow.name}`);
    }

    // Award gold
    if (reward.gold > 0) {
      ctx.db.character.id.update({ ...character, gold: character.gold + BigInt(reward.gold) });
    }

    // Award faction standing
    if (reward.factionId !== null && reward.factionAmount > 0 && resolvedDeps.mutateStanding) {
      resolvedDeps.mutateStanding(
        ctx,
        character.id,
        BigInt(reward.factionId),
        BigInt(reward.factionAmount)
      );
    }

    // Award item (if configured and helper available)
    if (reward.itemTemplateKey && resolvedDeps.addItemToInventory) {
      resolvedDeps.addItemToInventory(ctx, character.id, reward.itemTemplateKey, 1n);
    }

    // Append private event for the character
    const tierName = count >= gold.threshold ? 'Gold' : count >= silver.threshold ? 'Silver' : 'Bronze';
    const outcomeText = outcome === 'success' ? 'success' : 'failure';
    appendPrivateEvent(
      ctx,
      character.id,
      character.ownerUserId,
      'world_event',
      `World Event ${outcomeText} (${tierName} tier): ${eventRow.name} — +${reward.renown} renown, +${reward.gold} gold`
    );
  }
}

/**
 * checkTimeBasedExpiry — check if a time-based event has expired and resolve it as failed.
 * Called from periodic checks or contribution hooks.
 */
export function checkTimeBasedExpiry(ctx: any, eventRow: any, deps?: WorldEventDeps): void {
  if (eventRow.failureConditionType !== 'time') return;
  if (eventRow.status !== 'active') return;
  if (!eventRow.deadlineAtMicros) return;
  if (ctx.timestamp.microsSinceUnixEpoch >= eventRow.deadlineAtMicros) {
    resolveWorldEvent(ctx, eventRow, 'failure', deps);
  }
}

/**
 * incrementWorldStat — (REQ-032) increment a tracked world stat counter and auto-fire
 * the associated world event when the threshold is crossed.
 */
export function incrementWorldStat(ctx: any, statKey: string, amount: bigint, deps?: WorldEventDeps): void {
  const resolvedDeps = { ...getDefaultDeps(), ...deps };

  // Look up WorldStatTracker row by statKey
  let statRow: any = null;
  for (const row of ctx.db.worldStatTracker.by_stat_key.filter(statKey)) {
    statRow = row;
    break;
  }

  // If no row exists, stat not configured — return
  if (!statRow) return;

  // If already fired, return — prevent re-fire
  if (statRow.fired) return;

  // Increment currentValue
  const newValue = statRow.currentValue + amount;

  // Check if threshold crossed
  if (newValue >= statRow.fireThreshold) {
    // Set fired = true and update the row
    ctx.db.worldStatTracker.id.update({
      ...statRow,
      currentValue: newValue,
      fired: true,
    });

    // Auto-fire the associated world event
    fireWorldEvent(ctx, statRow.eventKeyToFire, resolvedDeps);
  } else {
    // Just update the current value
    ctx.db.worldStatTracker.id.update({
      ...statRow,
      currentValue: newValue,
    });
  }
}
