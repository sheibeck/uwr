---
phase: quick-270
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
  - spacetimedb/src/helpers/combat.ts
  - src/App.vue
  - src/components/GroupPanel.vue
autonomous: true
requirements: [QUICK-270]

must_haves:
  truths:
    - "When a healing song ticks, a green message with the actual HP amount appears in the bard's and group members' log"
    - "The active song appears as a buff badge with a seconds countdown until next pulse, visible in GroupPanel and CharacterPanel"
    - "When a bard switches songs, the old song's badge persists in the UI with a countdown for its remaining 6s until it fires its final tick and disappears"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "tick_bard_songs with heal log, group event, fading song persistence"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "song switch: old row kept alive with isFading=true instead of deleted"
    - path: "src/App.vue"
      provides: "song effect computed with nextPulseMicros derived from startedAtMicros"
    - path: "src/components/GroupPanel.vue"
      provides: "effectDurationLabel shows countdown for song effects"
  key_links:
    - from: "spacetimedb/src/reducers/combat.ts tick_bard_songs"
      to: "appendGroupEvent"
      via: "logPrivateAndGroup or appendGroupEvent with 'heal' kind"
      pattern: "appendGroupEvent.*heal"
    - from: "src/App.vue groupEffects computed"
      to: "ActiveBardSong.startedAtMicros"
      via: "nextPulseMicros field on synthesized effect"
      pattern: "nextPulseMicros"
    - from: "src/components/GroupPanel.vue effectDurationLabel"
      to: "effect.nextPulseMicros"
      via: "countdown math using nowMicros"
      pattern: "nextPulseMicros"
---

<objective>
Implement three bard song feedback improvements: (1) healing pulse messages with HP amounts logged in green for the bard and group, (2) active song buff badge with a live countdown to the next 6s pulse, and (3) fading song badges that linger in the UI until their final pulse fires.

Purpose: Bard players have no visibility into their heal amounts or pulse timing. Song twisting (switching songs to layer effects) requires knowing when each song will next pulse.
Output: Server logs heal with amount and group visibility; client buff bar shows countdown to next pulse; old song lingers as fading badge during 6s overlap.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Key files to read before editing:
- spacetimedb/src/reducers/combat.ts (lines ~1739-1866, tick_bard_songs reducer)
- spacetimedb/src/helpers/combat.ts (lines ~969-1025, bard song switch logic)
- src/App.vue (lines ~1058-1088, BARD_SONG_DISPLAY_NAMES and groupEffects computed)
- src/components/GroupPanel.vue (lines ~340-364, effectDurationLabel and effectLabelForDisplay)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Server — heal log messages and preserve fading song row</name>
  <files>
    spacetimedb/src/helpers/combat.ts
    spacetimedb/src/reducers/combat.ts
  </files>
  <action>
**Part A — helpers/combat.ts: Stop deleting the fading song row**

In the bard song switch block (around line 992), remove the early delete of the previous song row. Currently:
```
if (prevSong) {
  ctx.db.activeBardSong.id.update({ ...prevSong, isFading: true });  // mark fading
}
// ...
if (prevSong) {
  ctx.db.activeBardSong.id.delete(prevSong.id);  // REMOVE THIS DELETE
}
ctx.db.activeBardSong.insert({ ... isFading: false ... });  // new song
```
Remove the `ctx.db.activeBardSong.id.delete(prevSong.id)` call entirely. The fading row must persist in the DB so it can fire one final tick and disappear naturally. The tick reducer already handles `isFading: true` rows by deleting them after their pulse (line ~1854). Both rows now coexist until the fading one is cleaned up.

**Part B — reducers/combat.ts: tick_bard_songs — process both active and fading songs, log heal with amount**

The tick currently only processes `songs[0]`. Update it to:

1. Sort songs so the non-fading song (the new one) is processed as "primary" for scheduling. The fading song fires its final effect on this same tick if its `startedAtMicros` is older.

2. Actually, the simplest approach that matches the existing design: process ALL songs found for this bard in a single tick pass. For each song in `songs`, apply its effect. After applying, if `song.isFading`, delete it. If `song.isFading === false`, reschedule the next tick.

Replace the current "pick songs[0]" approach with:
```typescript
for (const song of songs) {
  // apply effect for song.songKey (same switch as before)
  // log feedback for this song
  if (song.isFading) {
    ctx.db.activeBardSong.id.delete(song.id);
    // do NOT reschedule for fading songs
  }
}
// Only reschedule if at least one non-fading song exists
const stillActive = songs.filter(s => !s.isFading);
if (stillActive.length > 0) {
  ctx.db.bardSongTick.insert({ ... reschedule ... });
}
```

3. For healing songs (`bard_melody_of_mending`, `bard_battle_hymn`, `bard_chorus_of_vigor`), compute the actual total healed/restored across party members and include the amount in the tick feedback message. Use `logPrivateAndGroup` (imported from helpers/events) instead of `appendPrivateEvent` so group members see it too. Use kind `'heal'` for HP restoration messages and `'ability'` for mana/other.

Example for `bard_melody_of_mending`:
- Accumulate total HP healed across all members
- After the heal loop: `logPrivateAndGroup(ctx, bard, 'heal', 'Melody of Mending heals the group for ${totalHealed} health.')`

For `bard_battle_hymn`, log both damage dealt to enemies and heal granted (two separate messages, or combined):
- `logPrivateAndGroup(ctx, bard, 'heal', 'Battle Hymn heals the group for ${totalHealed} health and restores ${totalMana} mana.')`

For `bard_chorus_of_vigor`:
- `logPrivateAndGroup(ctx, bard, 'ability', 'Chorus of Vigor restores ${totalMana} mana to the group.')`

For `bard_discordant_note` and enemy-hitting parts of `bard_battle_hymn`:
- Keep existing `appendPrivateEvent` with `'ability'` kind — damage feedback is private only.

Note: `logPrivateAndGroup` already checks if bard is in a group and skips the group event if not. It sends the same message to both bard's private log and group log.

The `bard` variable must be a full character row (not just id). It already is: `const bard = ctx.db.character.id.find(arg.bardCharacterId)`.

Import `logPrivateAndGroup` in reducers/combat.ts deps if not already available. Check whether `appendGroupEvent` is already in deps (it is, per grep — lines 235-237). Use the `logGroup` helper closure already defined in the combat reducer scope (line ~276-278): `const logGroup = (kind, message) => { if (!actorGroupId) return; appendGroupEvent(ctx, actorGroupId, character.id, kind, message); }` — but this is inside `use_ability`, not `tick_bard_songs`. In `tick_bard_songs`, use `appendGroupEvent` directly. The bard's groupId can be found via `effectiveGroupId(bard)` or by checking `ctx.db.group.by_member` if that index exists. Simpler: check if `bard.groupId` exists on the character row (look at character schema). If not, use the combat's `groupId` field: `const combat = ctx.db.combatEncounter.id.find(arg.combatId); const combatGroupId = combat?.groupId ?? null`.

Use the combat's groupId for the group event: it is already available as `combat.groupId`. If `combat.groupId` exists, call `appendGroupEvent(ctx, combat.groupId, bard.id, 'heal', message)`.

After implementing, publish locally: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` and regenerate bindings: `spacetime generate --lang typescript --out-dir C:/projects/uwr/src/module_bindings --project-path C:/projects/uwr/spacetimedb`.
  </action>
  <verify>
    After publish: `spacetime logs uwr` shows no errors.
    In game: cast Melody of Mending in combat, observe a green "heals the group for X health" message every 6s in the log. Group members see it in their group log tab.
    Switch songs in combat: both the old and new song should appear in the buff area briefly before the old one disappears after ~6s.
  </verify>
  <done>
    Healing songs log green messages with actual HP amounts. Group members see the message. Switching songs leaves the old row alive in DB for one final tick.
  </done>
</task>

<task type="auto">
  <name>Task 2: Client — song buff countdown and fading song display</name>
  <files>
    src/App.vue
    src/components/GroupPanel.vue
  </files>
  <action>
**Part A — App.vue: Add nextPulseMicros to the synthesized song effect**

In the `groupEffects` computed (around line 1076), the `activeBardSong` rows are converted to fake CharacterEffect objects with `roundsRemaining: 0n`. The GroupPanel currently shows "♪" for all song effects because `roundsRemaining: 0n` plus the special-case in `effectDurationLabel`.

Add `nextPulseMicros` to the synthesized object. Compute it from `startedAtMicros`:
```typescript
// Each pulse fires 6s after the song started. Compute next pulse time:
const PULSE_MICROS = 6_000_000n;
const elapsed = BigInt(Math.floor(nowMicros.value * 1000)) - song.startedAtMicros;
// How many full pulses have happened:
const pulsesDone = elapsed / PULSE_MICROS;
const nextPulseMicros = Number(song.startedAtMicros + (pulsesDone + 1n) * PULSE_MICROS);

effects.push({
  id: song.id,
  characterId: song.bardCharacterId,
  effectType: song.isFading ? 'song_fading' : 'song',
  magnitude: 0n,
  roundsRemaining: 0n,
  sourceAbility: BARD_SONG_DISPLAY_NAMES[song.songKey] ?? song.songKey,
  nextPulseMicros,   // NEW FIELD
  isFading: song.isFading,  // NEW FIELD
});
```

Note: `nowMicros` is a ref available in App.vue scope. `startedAtMicros` is a `u64` (bigint). The conversion from `nowMicros.value` (milliseconds * 1000 number) to bigint microseconds: `BigInt(nowMicros.value)` — `nowMicros` is already in microseconds (line 728: `ref(Date.now() * 1000)`). So: `const elapsed = BigInt(nowMicros.value) - song.startedAtMicros`.

Also update `BARD_SONG_DISPLAY_NAMES` to add a `(fading)` suffix for `song_fading` effectType — or handle it in GroupPanel display.

**Part B — GroupPanel.vue: Show countdown and fading indicator**

Update `effectDurationLabel` to compute the seconds until next pulse from `nextPulseMicros`:
```typescript
const effectDurationLabel = (effect: {
  id: bigint;
  roundsRemaining: bigint;
  effectType: string;
  nextPulseMicros?: number;
  isFading?: boolean;
}) => {
  if (effect.effectType === 'song' || effect.effectType === 'song_fading') {
    const now = props.nowMicros ?? Date.now() * 1000;
    if (effect.nextPulseMicros) {
      const secsLeft = Math.max(0, Math.ceil((effect.nextPulseMicros - now) / 1_000_000));
      const fadingLabel = effect.effectType === 'song_fading' ? ' fade' : '';
      return `${secsLeft}s${fadingLabel}`;
    }
    return '♪';
  }
  const now = props.nowMicros ?? Date.now() * 1000;
  return `${effectRemainingSeconds(effect, now, effectTimers)}s`;
};
```

Also update `effectLabelForDisplay` so fading songs show their name with a visual indicator. The `sourceAbility` is already set to the song name in App.vue, so the label displays correctly. The fading suffix comes from the duration label.

Update the GroupPanel props type to accept `nextPulseMicros?: number` and `isFading?: boolean` on effect objects. Add these optional fields to the `characterEffects` prop type definition (around line 193).

Also update `effectBadge` style or add a `effectBadgeFading` style for `song_fading` effects — apply a slightly dimmed opacity (0.6) via `:style` conditional so the bard can visually distinguish the fading old song from the new one.

Template change in GroupPanel.vue:
```html
<span
  v-for="effect in effectsFor(member.id)"
  :key="effect.id.toString()"
  :style="[styles.effectBadge, effect.effectType === 'song_fading' ? { opacity: '0.6' } : {}]"
>
  {{ effectLabelForDisplay(effect) }} ({{ effectDurationLabel(effect) }})
</span>
```

Apply the same change in the selected character section (around line 122).
  </action>
  <verify>
    In browser: cast a bard song in combat. The buff badge in GroupPanel shows the song name and a countdown like "Discordant Note (5s)" that ticks down to 0 and resets to 6s each pulse.
    Switch songs: old song badge appears dimmed with "(fade)" suffix, new song badge appears at full opacity with its own countdown.
    After ~6s, the fading song badge disappears.
  </verify>
  <done>
    Song buff badge shows a live seconds countdown to next pulse. Fading songs appear dimmed with "fade" indicator and disappear after their final tick.
  </done>
</task>

</tasks>

<verification>
1. `spacetime logs uwr` shows no reducer panics.
2. Melody of Mending tick produces a green "heals the group for X health" log message.
3. Group members see healing message in group log.
4. Song buff badge shows "Melody of Mending (Xs)" countdown that resets each 6s tick.
5. Switching songs: both old (dimmed, "fade") and new badges visible simultaneously for up to 6s.
6. Old song badge disappears after its final tick fires.
</verification>

<success_criteria>
- Healing songs log green messages with actual HP amounts visible to bard and group members
- Song buff badge displays live countdown (0-6s) to next pulse
- Song switching shows fading previous song badge for its remaining duration before it disappears
</success_criteria>

<output>
After completion, create `.planning/quick/270-bard-song-healing-feedback-and-buff-coun/270-SUMMARY.md`
</output>
