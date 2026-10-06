---
created: 2026-10-06T18:10:00Z
title: Show an ability's source (Race, Renown) as a chip, not a name prefix
area: ui
files:
  - spacetimedb/src/reducers/intent.ts:314-318
  - src/console/cleanServerText.ts
  - src/input/infoCommands.ts
---

## Problem

The owner reported on 2026-10-06 that the abilities list shows a racial ability as "Race Shadow Veil (Lv 1)". It reads as if the ability were named "Race Shadow Veil". The word should be a separate "Race" chip.

Cause:
- The server `abilities` output (`intent.ts:315-316`) prefixes the source in brackets: `{{color:#fbbf24}}[Race] Shadow Veil{{/color}} (Lv 1)`.
- The new client's server-text cleaning removes the color markup and unwraps brackets.
- The result is plain text: "Race Shadow Veil (Lv 1)".
- Renown abilities have the same problem ("Renown …").

## Solution

Client only; prefer no server text change.
- Port the `abilities` output to a client formatter, the same way Phase 47 ported the other info commands into `src/input/infoCommands.ts`. It reads `ability_template` rows for the character and renders:
  - the name
  - a small source chip ("Race" or "Renown") from `ability.source`
  - "Lv n"
  - the description
  - the type line, from the shared `ABILITY_KIND_LABELS` (quick 261006-hpp)
  - cost, cast time and cooldown
- If porting is too much for now, have the cleaning step turn a leading `[Source] ` in an ability line into a chip. Porting is better.
- Use the same chip on the hotbar tooltip, so a racial ability says it is racial.
- Tests:
  - the chip renders and the name has no prefix
  - Renown chip
  - no chip for class abilities
  - escape test

The Phase 50 Stats screen (renown and perks) and a future abilities screen can reuse the chip.
