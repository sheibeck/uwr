---
phase: quick-270
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/schema/tables.ts
  - spacetimedb/src/reducers/items.ts
  - spacetimedb/src/helpers/combat.ts
  - spacetimedb/src/reducers/combat.ts
autonomous: true
requirements: [QUICK-270]

must_haves:
  truths:
    - "Stopping a song (click same song) applies 3s cooldown, not 6s"
    - "Switching from song A to song B applies 3s cooldown on song A"
    - "Support songs (melody_of_mending, chorus_of_vigor, march_of_wayfarers) can be sung out of combat"
    - "Damage songs (discordant_note, battle_hymn) still require combat"
    - "Out-of-combat song ticks apply effects to party members in same location (no enemies)"
  artifacts:
    - path: "spacetimedb/src/schema/tables.ts"
      provides: "Optional combatId in ActiveBardSong and BardSongTick"
      contains: "combatId: t.u64().optional()"
    - path: "spacetimedb/src/reducers/items.ts"
      provides: "3s stop cooldown + 3s switch cooldown on previous song"
      contains: "3_000_000n"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Relaxed combat guard for support songs"
      contains: "DAMAGE_SONGS"
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Optional combatId in tick_bard_songs, out-of-combat party member fallback"
      contains: "partyMembersInLocation"
  key_links:
    - from: "spacetimedb/src/schema/tables.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "BardSongTick.rowType — combatId now optional, tick reducer must handle undefined"
      pattern: "bardCombatId !== undefined"
    - from: "spacetimedb/src/helpers/combat.ts"
      to: "spacetimedb/src/reducers/combat.ts"
      via: "activeBardSong and bardSongTick inserts use combatId ?? undefined"
      pattern: "combatId.*undefined"
---

<objective>
Refactor bard song cooldown timings and add out-of-combat support for the three non-damage songs.

Purpose: Stopping a song currently applies 6s cooldown (should be 3s); switching songs applies no cooldown to the old song (should be 3s); support songs are arbitrarily gated to combat when they should work anywhere.
Output: Four modified server files, zero new TypeScript errors.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make combatId optional in schema tables</name>
  <files>spacetimedb/src/schema/tables.ts</files>
  <action>
In `ActiveBardSong` columns (around line 1726): change `combatId: t.u64()` to `combatId: t.u64().optional()`.

In `BardSongTick` columns (around line 1743): change `combatId: t.u64()` to `combatId: t.u64().optional()`.

These are the only two changes in this file. Do not touch any other columns or tables.
  </action>
  <verify>npx tsc --noEmit run from C:/projects/uwr/spacetimedb — zero errors in tables.ts</verify>
  <done>Both combatId fields carry `.optional()` modifier; TypeScript accepts undefined for those fields in insert calls</done>
</task>

<task type="auto">
  <name>Task 2: Fix stop cooldown (6s→3s) and add switch cooldown in items.ts</name>
  <files>spacetimedb/src/reducers/items.ts</files>
  <action>
Two changes inside the `use_ability` reducer's bard song guard block (around lines 775-799):

**Change A — Stop cooldown 6s→3s (line ~791):**
Change `const offCooldownMicros = 6_000_000n;` to `const offCooldownMicros = 3_000_000n;`

**Change B — Switch cooldown block:**
After the same-song turn-off block that ends with `return;` (around line 797-799), and before the `try { const executed = executeAbilityAction(...)` call (around line 801), insert a new block inside the `if (BARD_SONG_KEYS.includes(abilityKey))` guard:

```typescript
// SWITCH: different song clicked while one is active — apply 3s cooldown to the old song
if (activeSong && activeSong.songKey !== abilityKey) {
  const prevSongKey = activeSong.songKey;
  const prevCooldown = [...ctx.db.abilityCooldown.by_character.filter(character.id)]
    .find((r: any) => r.abilityKey === prevSongKey);
  if (prevCooldown) {
    ctx.db.abilityCooldown.id.update({ ...prevCooldown, startedAtMicros: nowMicros, durationMicros: 3_000_000n });
  } else {
    ctx.db.abilityCooldown.insert({ id: 0n, characterId: character.id, abilityKey: prevSongKey, startedAtMicros: nowMicros, durationMicros: 3_000_000n });
  }
  // Fall through to executeAbilityAction for the new song
}
```

Place this block between the closing `}` of the same-song block (line ~799) and the closing `}` of the `if (BARD_SONG_KEYS.includes(abilityKey))` block (line ~799). The structure should be:

```
if (BARD_SONG_KEYS.includes(abilityKey)) {
  const activeSong = ...;
  if (activeSong && activeSong.songKey === abilityKey) {
    // ... stop song + 3s cooldown ...
    return;
  }
  // NEW: switch cooldown block here
  if (activeSong && activeSong.songKey !== abilityKey) { ... }
}
// then: try { executeAbilityAction(...) }
```
  </action>
  <verify>cd C:/projects/uwr/spacetimedb && npx tsc --noEmit — zero errors in items.ts</verify>
  <done>Stopping a song applies 3_000_000n cooldown; switching songs applies 3_000_000n cooldown on the vacated song; new song proceeds to executeAbilityAction normally</done>
</task>

<task type="auto">
  <name>Task 3: Relax combat guard and use optional combatId in helpers/combat.ts</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In the bard song case block (around line 976):

**Change A — Relax combat-only guard:**
Replace:
```typescript
if (!combatId || !combat) throw new SenderError('Songs can only be sung in combat.');
```
With:
```typescript
const DAMAGE_SONGS = ['bard_discordant_note', 'bard_battle_hymn'];
if (DAMAGE_SONGS.includes(abilityKey) && (!combatId || !combat)) {
  throw new SenderError('This song can only be sung in combat.');
}
```

**Change B — Use optional combatId in bardSongTick insert (around line 984-989, inside the `else` branch when no prevSong exists):**
The current insert is:
```typescript
ctx.db.bardSongTick.insert({
  scheduledId: 0n,
  scheduledAt: ScheduleAt.time(nowMicros + 6_000_000n),
  bardCharacterId: character.id,
  combatId,
});
```
Change `combatId,` to `combatId: combatId ?? undefined,`

**Change C — Use optional combatId in activeBardSong insert (around line 993-1000):**
The current insert is:
```typescript
ctx.db.activeBardSong.insert({
  id: 0n,
  bardCharacterId: character.id,
  combatId,
  songKey: abilityKey,
  startedAtMicros: nowMicros,
  isFading: false,
});
```
Change `combatId,` to `combatId: combatId ?? undefined,`
  </action>
  <verify>cd C:/projects/uwr/spacetimedb && npx tsc --noEmit — zero errors in helpers/combat.ts</verify>
  <done>Support songs cast out of combat no longer throw; damage songs still throw without combat; combatId stored as undefined when out-of-combat</done>
</task>

<task type="auto">
  <name>Task 4: Handle optional combatId in tick_bard_songs reducer</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
**Change A — Import partyMembersInLocation:**
At line 20 (after the last existing import), add:
```typescript
import { partyMembersInLocation } from '../helpers/character';
```

**Change B — Rewrite tick_bard_songs combatId check and party/enemy gathering (around lines 1741-1761):**

Replace the block:
```typescript
const combat = ctx.db.combatEncounter.id.find(arg.combatId);
if (!combat || combat.state !== 'active') {
  // Combat over — clean up active song rows for this bard
  for (const song of ctx.db.activeBardSong.by_bard.filter(arg.bardCharacterId)) {
    ctx.db.activeBardSong.id.delete(song.id);
  }
  return;
}

const bard = ctx.db.character.id.find(arg.bardCharacterId);
if (!bard) return;

const songs = [...ctx.db.activeBardSong.by_bard.filter(arg.bardCharacterId)];
if (songs.length === 0) return;

// Gather party members and living enemies (shared across all songs this tick)
const partyMembers = [...ctx.db.combatParticipant.by_combat.filter(arg.combatId)]
  .map((p: any) => ctx.db.character.id.find(p.characterId))
  .filter(Boolean);
const enemies = [...ctx.db.combatEnemy.by_combat.filter(arg.combatId)]
  .filter((e: any) => e.currentHp > 0n);
```

With:
```typescript
const bardCombatId = arg.combatId;
if (bardCombatId !== undefined) {
  const combat = ctx.db.combatEncounter.id.find(bardCombatId);
  if (!combat || combat.state !== 'active') {
    // Combat over — clean up active song rows for this bard
    for (const song of ctx.db.activeBardSong.by_bard.filter(arg.bardCharacterId)) {
      ctx.db.activeBardSong.id.delete(song.id);
    }
    return;
  }
}

const bard = ctx.db.character.id.find(arg.bardCharacterId);
if (!bard) return;

const songs = [...ctx.db.activeBardSong.by_bard.filter(arg.bardCharacterId)];
if (songs.length === 0) return;

// Gather party members and living enemies (shared across all songs this tick)
const partyMembers = bardCombatId !== undefined
  ? [...ctx.db.combatParticipant.by_combat.filter(bardCombatId)]
      .map((p: any) => ctx.db.character.id.find(p.characterId))
      .filter(Boolean)
  : partyMembersInLocation(ctx, bard);
const enemies = bardCombatId !== undefined
  ? [...ctx.db.combatEnemy.by_combat.filter(bardCombatId)].filter((e: any) => e.currentHp > 0n)
  : [];
```

**Change C — Fix the reschedule insert at the bottom of tick_bard_songs (around line 1864-1869):**
The current insert has `combatId: arg.combatId`. Change it to `combatId: arg.combatId ?? undefined,` to stay consistent with the schema's optional field.

Also update the variable references: the existing code refers to `arg.combatId` in `by_combat.filter(arg.combatId)` — after the replacement above those are already using `bardCombatId`, so the bottom reschedule is the only remaining raw `arg.combatId` reference. Change it:
```typescript
ctx.db.bardSongTick.insert({
  scheduledId: 0n,
  scheduledAt: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + 6_000_000n),
  bardCharacterId: arg.bardCharacterId,
  combatId: arg.combatId ?? undefined,
});
```
  </action>
  <verify>cd C:/projects/uwr/spacetimedb && npx tsc --noEmit — zero errors across all 4 modified files</verify>
  <done>tick_bard_songs skips combat check when combatId is undefined; out-of-combat ticks use partyMembersInLocation and empty enemy list; in-combat behavior unchanged</done>
</task>

</tasks>

<verification>
Run from `C:/projects/uwr/spacetimedb`:
```
npx tsc --noEmit
```
Expected: zero TypeScript errors. Any errors in the four modified files must be fixed before proceeding.
</verification>

<success_criteria>
- `combatId: t.u64().optional()` present in both ActiveBardSong and BardSongTick in tables.ts
- Stop cooldown is 3_000_000n (not 6_000_000n) in items.ts
- Switch-song block present in items.ts applying 3s cooldown to previous song
- `DAMAGE_SONGS` guard in helpers/combat.ts allows support songs out of combat
- `partyMembersInLocation` imported and used in reducers/combat.ts tick_bard_songs
- `npx tsc --noEmit` exits clean
</success_criteria>

<output>
After completion, create `.planning/quick/270-bard-song-cooldown-refactor-and-out-of-c/270-SUMMARY.md`
</output>
