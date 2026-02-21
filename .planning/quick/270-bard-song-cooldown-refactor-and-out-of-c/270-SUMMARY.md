---
phase: quick-270
plan: "01"
subsystem: bard-song-system
tags: [bard, songs, cooldown, out-of-combat, spacetimedb, server]
key-files:
  modified:
    - spacetimedb/src/schema/tables.ts
    - spacetimedb/src/reducers/items.ts
    - spacetimedb/src/helpers/combat.ts
    - spacetimedb/src/reducers/combat.ts
decisions:
  - "combatId made optional in both ActiveBardSong and BardSongTick — null means out-of-combat"
  - "DAMAGE_SONGS constant defines which songs still require combat (discordant_note, battle_hymn)"
  - "Out-of-combat party member fallback uses existing partyMembersInLocation helper"
  - "Stop cooldown reduced from 6s to 3s; switch cooldown also set to 3s for old song"
metrics:
  duration: "~15 minutes"
  completed: "2026-02-21"
  tasks_completed: 4
  tasks_total: 4
  files_modified: 4
---

# Quick-270: Bard Song Cooldown Refactor and Out-of-Combat Support Summary

**One-liner:** Optional combatId in bard song schema enables out-of-combat support songs; stop cooldown fixed to 3s; switch cooldown added at 3s on previous song.

## What Was Built

Refactored the bard song system across four server files to fix cooldown timings and lift the combat-only restriction from support songs.

### Changes by File

**spacetimedb/src/schema/tables.ts**
- `ActiveBardSong.combatId`: `t.u64()` → `t.u64().optional()`
- `BardSongTick.combatId`: `t.u64()` → `t.u64().optional()`

**spacetimedb/src/reducers/items.ts**
- Stop cooldown: `offCooldownMicros = 6_000_000n` → `3_000_000n`
- Added switch-song block: when clicking a different song while one is active, applies 3s cooldown on the old song before falling through to executeAbilityAction for the new song

**spacetimedb/src/helpers/combat.ts**
- Relaxed combat guard: replaced blanket `throw SenderError('Songs can only be sung in combat.')` with `DAMAGE_SONGS` constant check — only `bard_discordant_note` and `bard_battle_hymn` require combat
- `bardSongTick` insert: `combatId` → `combatId: combatId ?? undefined`
- `activeBardSong` insert: `combatId` → `combatId: combatId ?? undefined`

**spacetimedb/src/reducers/combat.ts**
- Added import: `partyMembersInLocation` from `../helpers/character`
- `tick_bard_songs`: combat check now guarded by `if (bardCombatId !== undefined)` — skips entirely for out-of-combat ticks
- Party members: in-combat uses `combatParticipant.by_combat`, out-of-combat uses `partyMembersInLocation(ctx, bard)`
- Enemies: in-combat uses `combatEnemy.by_combat`, out-of-combat uses `[]` (empty)
- Reschedule insert: `combatId: arg.combatId` → `combatId: arg.combatId ?? undefined`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3649312 | feat(quick-270): make combatId optional in ActiveBardSong and BardSongTick |
| 2 | aec7ea0 | feat(quick-270): fix stop cooldown 6s->3s and add switch cooldown in items.ts |
| 3 | ee89766 | feat(quick-270): relax combat guard for support songs in helpers/combat.ts |
| 4 | 21e59c5 | feat(quick-270): handle optional combatId in tick_bard_songs reducer |

## Decisions Made

1. **Optional combatId is the null signal** — `undefined` means out-of-combat; no separate boolean field needed since undefined already cleanly signals absence of combat context.

2. **DAMAGE_SONGS constant in helpers/combat.ts** — Defined inline in the case block as `['bard_discordant_note', 'bard_battle_hymn']`. Keeps the logic self-contained and avoids a module-level constant that would need exporting.

3. **partyMembersInLocation fallback** — The existing helper already finds party members sharing the character's location; no new query logic needed.

4. **Switch cooldown falls through to executeAbilityAction** — The switch block only applies the cooldown on the old song; it does not return. This means the new song proceeds normally through the existing ability execution path.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

TypeScript check (`npx tsc --noEmit` via `node node_modules/typescript/bin/tsc --noEmit -p spacetimedb/tsconfig.json`) confirms zero errors introduced in the bard song sections of any modified file. Pre-existing errors in other sections (TS7006 implicit any on reducer parameters, TS2365 bigint/number operators, TS2339 RowBuilder property errors) are out of scope and unchanged.

## Self-Check: PASSED

Files verified present:
- FOUND: spacetimedb/src/schema/tables.ts (combatId: t.u64().optional() in both tables)
- FOUND: spacetimedb/src/reducers/items.ts (3_000_000n stop cooldown + switch block)
- FOUND: spacetimedb/src/helpers/combat.ts (DAMAGE_SONGS guard + combatId ?? undefined)
- FOUND: spacetimedb/src/reducers/combat.ts (partyMembersInLocation import + bardCombatId guard)

Commits verified: 3649312, aec7ea0, ee89766, 21e59c5 all present in git log.
