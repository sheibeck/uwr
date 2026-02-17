---
phase: quick-132
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: []
autonomous: true

must_haves:
  truths:
    - "Each grouped character gets an independent passive search call with their own charId"
    - "Seed calculation (charId XOR nowMicros) produces different values per character even at the same timestamp"
    - "Each character receives their own SearchResult row and personal resource nodes"
  artifacts: []
  key_links:
    - from: "spacetimedb/src/reducers/movement.ts"
      to: "spacetimedb/src/helpers/search.ts"
      via: "performPassiveSearch called per-character inside moveOne loop"
      pattern: "performPassiveSearch\\(ctx.*charId"
---

<objective>
Verify that per-character independence of passive search and resource discovery is already correctly implemented when grouped characters move together.

Purpose: Confirm the suspected bug does NOT exist -- each grouped character already gets their own independent passive search call with a unique seed, producing independent roll outcomes and personal resource nodes.
Output: Verification finding documented (no code changes needed).
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/movement.ts
@spacetimedb/src/helpers/search.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify per-character passive search independence in group travel</name>
  <files></files>
  <action>
Read and analyze the group travel flow in movement.ts and search.ts to confirm per-character independence:

1. In movement.ts, confirm:
   - The `moveOne` inner function (line 117) calls `performPassiveSearch` with the individual character's row (line 130)
   - The loop at lines 185-187 calls `moveOne(traveler.id)` for EACH traveler independently
   - This means each group member gets their own separate performPassiveSearch call

2. In search.ts, confirm:
   - Seed is `charId ^ nowMicros` (line 17) -- since charId differs per character, each gets a unique seed even when nowMicros is identical (same reducer timestamp)
   - Roll 1 (resource, line 26): `seed % 100n` -- different seed = different outcome
   - Roll 2 (quest item, line 33): `((seed >> 8n) ^ (seed * 7n)) % 100n` -- different seed = different outcome
   - Roll 3 (named enemy, line 74): `((seed >> 16n) ^ (seed * 13n)) % 100n` -- different seed = different outcome
   - SearchResult is inserted per-character (line 136): `characterId: character.id`
   - Resource nodes are spawned per-character (line 166): `spawnResourceNode(ctx, locationId, character.id, ...)`
   - Old resource nodes are cleaned up per-character (line 149): `ctx.db.resourceNode.by_character.filter(character.id)`

3. Conclude: The code is already correct. No fix needed. Each grouped character independently:
   - Gets their own performPassiveSearch call
   - Gets a unique deterministic seed (different charId XOR same timestamp)
   - Gets independent roll outcomes for resources, quest items, and named enemies
   - Gets their own personal SearchResult row and personal ResourceNode entries

No code changes required. Document the verification finding in the SUMMARY.
  </action>
  <verify>Read movement.ts lines 117-187 and search.ts lines 14-17 and 136-170 to confirm the per-character call pattern and per-character seed/output.</verify>
  <done>Verification complete: each grouped character independently receives their own performPassiveSearch call with a unique seed, independent roll outcomes, and personal resource nodes. No bug exists.</done>
</task>

</tasks>

<verification>
- movement.ts: moveOne function calls performPassiveSearch with individual character row
- movement.ts: loop iterates travelingCharacters calling moveOne per character
- search.ts: seed = charId XOR nowMicros (unique per character)
- search.ts: SearchResult and ResourceNode rows inserted with individual character.id
</verification>

<success_criteria>
Verification finding documented confirming per-character passive search independence is already correctly implemented. No code changes needed.
</success_criteria>

<output>
After completion, create `.planning/quick/132-verify-and-fix-per-character-independenc/132-01-SUMMARY.md`
</output>
