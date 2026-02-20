---
status: resolved
trigger: "when using the Slam ability on a new Warrior character, the cooldown doesn't start immediately — there's a large delay before it begins"
created: 2026-02-20T00:00:00Z
updated: 2026-02-20T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — bigint/number type mismatch in the "failed ability" watcher causes the optimistic cooldown prediction to be incorrectly cleared ~500ms after casting, then the display falls back to the server cooldown row which arrives with latency, making it appear the cooldown "starts late"
test: code review — line 411 of useHotbar.ts
expecting: fix is to convert cd.readyAtMicros to Number() before comparing to now
next_action: DONE

## Symptoms

expected: Slam cooldown (6s) starts immediately on cast
actual: Large delay before the cooldown overlay appears — looks like the cooldown starts several seconds late
errors: none visible to user
reproduction: create new Warrior character, use Slam ability, observe hotbar cooldown overlay
started: likely always existed; most visible on first-ever cast per session (no prior cooldown rows on server)

## Eliminated

- hypothesis: server writes the cooldown row late (after a scheduled job)
  evidence: use_ability reducer (items.ts:797-811) writes AbilityCooldown synchronously in the same transaction as ability execution for instant-cast abilities like Slam (castSeconds=0n). No cast tick involved.
  timestamp: 2026-02-20

- hypothesis: new character has missing subscription or special case
  evidence: AbilityCooldown table is public=true with no special logic for new characters. The cooldown row is written on first use.
  timestamp: 2026-02-20

- hypothesis: castTick loop not running
  evidence: ensureCastTickScheduled is called on both clientConnected and clientDisconnected hooks — it's always running. But Slam has castSeconds=0n so tick_casts is irrelevant for it anyway.
  timestamp: 2026-02-20

## Evidence

- timestamp: 2026-02-20
  checked: spacetimedb/src/data/abilities/warrior_abilities.ts line 11
  found: warrior_slam has cooldownSeconds: 6n, castSeconds: 0n
  implication: Slam is an instant-cast ability. The use_ability reducer executes it synchronously and writes the cooldown row in the same transaction.

- timestamp: 2026-02-20
  checked: spacetimedb/src/reducers/items.ts lines 797-811
  found: After executeAbilityAction succeeds, cooldown row is inserted/updated synchronously with readyAtMicros = nowMicros + cooldown (6,000,000 micros)
  implication: Server writes the cooldown row immediately. No delay on the server side.

- timestamp: 2026-02-20
  checked: src/composables/useHotbar.ts lines 262-277 (runPrediction)
  found: When onHotbarClick fires, runPrediction sets both localCooldowns and predictedCooldownReadyAt for the ability key immediately. This shows the cooldown overlay right away (optimistic UI).
  implication: On click, the display should show the cooldown immediately via the local prediction.

- timestamp: 2026-02-20
  checked: src/composables/useHotbar.ts lines 154-155 (hotbarDisplay computed)
  found: hasPrediction = predictedReadyAt > 0; if hasPrediction is true, serverRemaining is forced to 0 and only localRemaining drives the display. This is correct.
  implication: As long as predictedCooldownReadyAt has an entry, the cooldown display works correctly via local prediction.

- timestamp: 2026-02-20
  checked: src/composables/useHotbar.ts lines 399-430 (cleanup watcher)
  found: A watcher runs every ~500ms checking whether each local cooldown exists on the server. On line 411: cd.readyAtMicros > now — where cd.readyAtMicros is bigint (u64 from SpacetimeDB) and now is number (Date.now() * 1000). In JavaScript, comparing bigint > number throws a TypeError at runtime.
  implication: The filter on line 411 ALWAYS fails (empty set is returned), meaning serverCooldownKeys is always an empty Set. Therefore on the very next 500ms check after the cast, the watcher sees "local cooldown exists but server cooldown not in set" and CLEARS the local prediction (lines 425-426). This deletes both localCooldowns and predictedCooldownReadyAt for the ability. The display then falls back to serverRemaining (line 155), which requires the server's AbilityCooldown row to arrive via subscription update. The delay is the round-trip latency (~200-1000ms) before the server row propagates to the client.

- timestamp: 2026-02-20
  checked: src/composables/useHotbar.ts line 143
  found: In hotbarDisplay computed, serverReadyAt = Number(readyAt) — correct conversion. But line 411 in the cleanup watcher does NOT use Number().
  implication: This is an inconsistency — the display code converts correctly but the cleanup watcher does not.

- timestamp: 2026-02-20
  checked: src/module_bindings/ability_cooldown_type.ts line 17
  found: readyAtMicros: __t.u64() — confirmed to be bigint in JS
  implication: Confirms the type mismatch. bigint > number = TypeError, not a valid comparison.

- timestamp: 2026-02-20
  checked: "new character" specificity
  found: The bug affects ALL ability casts on ANY character. However it may be most noticeable on a new character because: (a) there is no prior cooldown row on the server (existingCooldown is null, so a new INSERT happens), and (b) new players have higher perceived latency sensitivity.
  implication: Bug is not warrior/new-character-specific — it affects all instant-cast abilities. The "new character" observation is consistent with this being the first-ever cast where the prediction-vs-server check is most likely to race.

## Resolution

root_cause: In src/composables/useHotbar.ts at line 411, the comparison `cd.readyAtMicros > now` mixes bigint (readyAtMicros from SpacetimeDB u64) with number (nowMicros which is Date.now()*1000). JavaScript throws a TypeError when comparing bigint and number with >, causing the filter to always fail/throw, producing an always-empty serverCooldownKeys set. This causes the cleanup watcher to incorrectly clear the optimistic local cooldown prediction within ~500ms of every cast, reverting the display to server latency.

fix: Change line 411 to: `cd.readyAtMicros > BigInt(Math.round(now))` (or equivalently `Number(cd.readyAtMicros) > now`) to match types before comparison. The latter (`Number()`) is consistent with how the hotbarDisplay computed already handles this on line 143.

verification: not applied (diagnosis-only mode)

files_changed: []
