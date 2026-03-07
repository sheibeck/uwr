---
phase: quick-334
plan: 01
subsystem: narrative-look
tags: [look, narrative, ui, con-colors]
dependency_graph:
  requires: []
  provides: [rich-look-command, color-tag-rendering]
  affects: [intent-reducer, narrative-message]
tech_stack:
  patterns: [regex-intent-matching, color-tag-system]
key_files:
  modified:
    - spacetimedb/src/reducers/intent.ts
    - src/components/NarrativeMessage.vue
decisions:
  - "Con color tags use {{color:HEX}}text{{/color}} format for server-to-client color encoding"
  - "Enemy spawn state 'available', 'engaged', 'pulling' treated as alive for look display"
  - "Look kind color #c8ccd0 (neutral gray) to avoid competing with narrative gold"
metrics:
  duration: 3min
  completed: "2026-03-07T22:06:00Z"
---

# Quick Task 334: Narrative Panel Shows Location Description (Look Command Enhancement)

Rich location overview via "look" command with con-colored enemies, clickable NPCs/players/exits, and target inspection via "look <name>"

## What Changed

### Task 1: Enhanced server-side look handler (6c70ca3)

Replaced the simple `if (lower === 'look')` exact match with a regex-based handler supporting both bare "look"/"l" and "look <target>".

**Bare "look" output includes:**
- Location name and description
- Day/night indicator from WorldState
- Safe area, bind stone, crafting station indicators
- NPCs listed with [brackets] for clickability
- Other players listed with [brackets]
- Enemies with con-color tags based on level difference (gray/green/blue/white/yellow/orange/red)
- Group count suffix (x3) for multi-enemy spawns
- Available resources deduplicated with counts
- Exit locations with [brackets] for click-to-travel

**"look <target>" inspects:**
- NPCs: shows name and description
- Enemies: shows level, role, creature type, boss indicator
- Players: shows name, level, race, class

### Task 2: Color tag rendering in NarrativeMessage (7c3e0b2)

- Added `renderColorTags()` function to parse `{{color:#HEX}}text{{/color}}` into styled `<span>` elements
- Applied in both `processSentence` (animated) and `renderedMessage` (static) pipelines
- Color tags processed after `\n` to `<br>` but before `[keyword]` bracket processing
- Added `look` kind color (#c8ccd0) and `move` kind color (#adb5bd) to KIND_COLORS

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6c70ca3 | Enhanced look handler with full location overview and target inspection |
| 2 | 7c3e0b2 | Color tag rendering and look/move kind colors |

## Self-Check: PASSED
