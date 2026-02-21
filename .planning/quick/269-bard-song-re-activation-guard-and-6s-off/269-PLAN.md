---
phase: quick-269
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/items.ts
autonomous: true
requirements:
  - BARD-SONG-GUARD-01
must_haves:
  truths:
    - "Clicking an active bard song a second time stops the song, not re-activates it"
    - "Stopping a song applies a 6s AbilityCooldown, preventing instant re-cast"
    - "No burst damage fires when clicking to stop an active song"
    - "Switching to a different song while one is active is unaffected"
  artifacts:
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "Bard song turn-off guard in use_ability reducer"
      contains: "BARD_SONG_KEYS"
  key_links:
    - from: "use_ability reducer"
      to: "activeBardSong.by_bard index"
      via: "filter on character.id before executeAbilityAction"
      pattern: "activeBardSong.by_bard.filter"
---

<objective>
Add a re-activation guard to the bard song path in the `use_ability` reducer. When a bard clicks their currently-active song, the song is stopped and a 6-second cooldown is applied instead of re-firing `executeAbilityAction`.

Purpose: Closes an exploit where clicking the same active song re-runs the activation path, deletes and re-inserts the song row, and fires the immediate burst damage again.
Output: Modified `spacetimedb/src/reducers/items.ts` with the guard block inserted at line 775.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/269-bard-song-re-activation-guard-and-6s-off/269-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Insert bard song turn-off guard in use_ability reducer</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
In `spacetimedb/src/reducers/items.ts`, insert the following block immediately before line 775 (the `try { executeAbilityAction(...)` line). The variables `existingCooldown`, `nowMicros`, `character`, and `abilityKey` are already in scope at this insertion point.

Insert this block (add a blank line before the existing `try {` to keep spacing clean):

```typescript
    // Bard song turn-off: clicking the active song again stops it and applies a 6s cooldown
    const BARD_SONG_KEYS = ['bard_discordant_note', 'bard_melody_of_mending', 'bard_chorus_of_vigor', 'bard_march_of_wayfarers', 'bard_battle_hymn'];
    if (BARD_SONG_KEYS.includes(abilityKey)) {
      const activeSong = [...ctx.db.activeBardSong.by_bard.filter(character.id)][0];
      if (activeSong && activeSong.songKey === abilityKey) {
        ctx.db.activeBardSong.id.delete(activeSong.id);
        const songDisplayNames: Record<string, string> = {
          bard_discordant_note: 'Discordant Note',
          bard_melody_of_mending: 'Melody of Mending',
          bard_chorus_of_vigor: 'Chorus of Vigor',
          bard_march_of_wayfarers: 'March of Wayfarers',
          bard_battle_hymn: 'Battle Hymn',
        };
        appendPrivateEvent(ctx, character.id, character.ownerUserId, 'ability',
          `You stop singing ${songDisplayNames[abilityKey] ?? abilityKey}.`
        );
        const offCooldownMicros = 6_000_000n;
        if (existingCooldown) {
          ctx.db.abilityCooldown.id.update({ ...existingCooldown, startedAtMicros: nowMicros, durationMicros: offCooldownMicros });
        } else {
          ctx.db.abilityCooldown.insert({ id: 0n, characterId: character.id, abilityKey, startedAtMicros: nowMicros, durationMicros: offCooldownMicros });
        }
        return;
      }
    }
```

This block must be placed after the perk-cooldown `try/catch` block ends (after the `return;` at line 772 and the blank line 774), and before the `try {` at line 775.

The logic is: if the cast ability is a bard song key AND the character currently has that exact song active, delete the `ActiveBardSong` row, log a stop message, apply a 6s cooldown, and early-return. If the bard casts a *different* song while one is active, this block does not match (`activeSong.songKey !== abilityKey`) and falls through to `executeAbilityAction` normally, which handles the switch.
  </action>
  <verify>cd C:/projects/uwr/spacetimedb && npx tsc --noEmit 2>&1 | head -30</verify>
  <done>TypeScript reports zero errors in reducers/items.ts. The guard block is present with BARD_SONG_KEYS, the filter on activeBardSong.by_bard, and the 6s cooldown insertion.</done>
</task>

</tasks>

<verification>
Run `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` — expect exit code 0 with no errors.

Confirm the inserted block appears between the end of the perk-cooldown block (line ~773) and the `try { executeAbilityAction` call (line ~775+block size).
</verification>

<success_criteria>
- `npx tsc --noEmit` passes with zero errors
- Same-song click is blocked: `activeSong.songKey === abilityKey` path deletes the song and returns before `executeAbilityAction`
- 6s cooldown row is created or updated on song stop
- Different-song click falls through to existing switch logic unchanged
</success_criteria>

<output>
After completion, create `.planning/quick/269-bard-song-re-activation-guard-and-6s-off/269-01-SUMMARY.md`
</output>
