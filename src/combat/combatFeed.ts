// Combat rows -> feed store (48-RESEARCH Q4, CMB-03, CMB-04).
//
// Three watchers turn the subscribed combat rows into client-made feed entries:
//   rounds     every round row in state 'action_select' becomes a 'Round N' header at its
//              startedAt (the store dedupes and ignores startedAt 0). Resolved rows in a first
//              snapshot add nothing, so a fight start shows 'Round 1' and a mid-fight reload
//              shows only the current round.
//   casts      one wind-up block per combat_enemy_cast row that arrives after the cast
//              subscription applied. The rows of the initial snapshot are only remembered.
//              N is fixed at announcement (landsAtRound - announcedRound), through the same
//              helper as the rail row. The block sits at the start of round announcedRound + 1,
//              else at the server-clock now.
//   narratives a combat_narration feed entry is matched to its combat_narrative row by equal
//              createdAt microseconds and equal text; the match records the narrated round.
//              No match, no tag (UI-SPEC A22).
//
// All copy is plain system copy: no first person and no pronoun for the Keeper or enemies.
// Strings are only ever rendered as text nodes by the feed.

import { watch } from 'vue';
import type { Ref } from 'vue';
import type { CombatData } from '../game/context';
import type { ServerClock } from '../game/serverClock';
import type { FeedStore } from '../console/feedStore';
import { enemyAbilityName, landsInAtAnnouncement, windupParts, windupTarget } from './windup';

export interface CombatFeedInput {
  combat: CombatData;
  feed: FeedStore;
  clock: ServerClock;
  selfId: Readonly<Ref<bigint | null>>;
}

const COMBAT_NARRATION_KIND = 'combat_narration';

/** Installs the three watchers in the caller's scope; returns a function that stops them. */
export function wireCombatFeed(input: CombatFeedInput): () => void {
  const { combat, feed, clock, selfId } = input;

  // Rounds ---------------------------------------------------------------------------------
  const stopRounds = watch(
    () => combat.rounds.value,
    (rows) => {
      for (const round of rows) {
        if (round.state !== 'action_select') continue;
        feed.addRoundHeader({
          combatId: round.combatId,
          roundNumber: round.roundNumber,
          startedAtMicros: round.startedAtMicros,
        });
      }
    },
    { immediate: true, flush: 'sync' },
  );

  // Casts ----------------------------------------------------------------------------------
  let trackedCombat: bigint | null = null;
  let snapshotTaken = false;
  const seenCasts = new Set<bigint>();

  const stopCasts = watch(
    [() => combat.combatId.value, () => combat.castsApplied.value, () => combat.casts.value],
    ([combatId, applied, casts]) => {
      if (combatId !== trackedCombat) {
        trackedCombat = combatId;
        seenCasts.clear();
        snapshotTaken = false;
      }
      if (combatId === null) return;
      if (!applied) {
        // A re-applied subscription redelivers its rows; the ids already seen stay seen.
        snapshotTaken = false;
        return;
      }
      const own = casts.filter((cast) => cast.combatId === combatId);
      if (!snapshotTaken) {
        snapshotTaken = true;
        for (const cast of own) seenCasts.add(cast.id);
        return;
      }
      for (const cast of own) {
        if (seenCasts.has(cast.id)) continue;
        seenCasts.add(cast.id);
        const enemy = combat.enemies.value.find((row) => row.id === cast.enemyId);
        const ability = enemyAbilityName(
          combat.enemyAbilities.value,
          enemy === undefined ? 0n : enemy.enemyTemplateId,
          cast.abilityKey,
        );
        const enemyNames = new Map<bigint, string>();
        for (const row of combat.enemies.value) enemyNames.set(row.id, row.displayName);
        const target = windupTarget({
          targetCharacterId: cast.targetCharacterId,
          targetPetId: cast.targetPetId,
          targetEnemyId: cast.targetEnemyId,
          enemyNames,
          selfId: selfId.value,
          characterNames: combat.characterNames.value,
          petNames: combat.petNames.value,
        });
        const parts = windupParts({
          enemy: enemy === undefined ? 'An enemy' : enemy.displayName,
          ability,
          target,
          rounds: landsInAtAnnouncement(cast),
        });
        const nextRound = combat.rounds.value.find(
          (round) => round.combatId === combatId && round.roundNumber === cast.announcedRound + 1n,
        );
        const createdAtMicros =
          nextRound !== undefined && nextRound.startedAtMicros !== 0n
            ? nextRound.startedAtMicros
            : BigInt(Math.round(clock.nowMicros()));
        feed.addWindup({ castId: cast.id, combatId, createdAtMicros, parts });
      }
    },
    { immediate: true, flush: 'sync' },
  );

  // Narratives -----------------------------------------------------------------------------
  const matchedEntries = new Set<string>();

  const stopNarratives = watch(
    [() => combat.narratives.value, () => feed.entries.value],
    ([narratives, entries]) => {
      if (narratives.length === 0) return;
      const found: { key: string; round: bigint }[] = [];
      for (const entry of entries) {
        if (entry.kind !== COMBAT_NARRATION_KIND) continue;
        if (entry.narratedRound !== undefined || matchedEntries.has(entry.key)) continue;
        const match = narratives.find(
          (row) =>
            row.createdAt.microsSinceUnixEpoch === entry.createdAtMicros && row.narrativeText === entry.message,
        );
        if (match === undefined) continue;
        found.push({ key: entry.key, round: match.roundNumber });
      }
      // Remember first: setNarratedRound changes the entries this watcher reads.
      for (const item of found) matchedEntries.add(item.key);
      for (const item of found) feed.setNarratedRound(item.key, item.round);
    },
    { immediate: true, flush: 'sync' },
  );

  return () => {
    stopRounds();
    stopCasts();
    stopNarratives();
  };
}
