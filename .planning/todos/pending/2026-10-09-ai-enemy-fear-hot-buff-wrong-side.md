---
created: 2026-10-09T09:00:00.000Z
title: AI-written enemy fear, hot and buff abilities act on the wrong side
area: general
files:
  - spacetimedb/src/helpers/combat.ts (resolveAbility enemy-side branches)
---

## Problem

Phase 51.3.1.1 fixed enemy-side heal, shield, drain and execute and made enemy taunt/cc no-ops, but an AI-written enemy ability of kind `fear` still stuns the caster's own side, and `hot` or a non-debuff `buff` lands on the player target. Family member abilities from family_rules never use these kinds, so it only matters for AI-written enemy abilities. Found by Plans 04/05 (deferred-items row 3).

## Solution

Give fear/hot/buff explicit enemy-side handling (hot/buff on an ally enemy, fear on the player side) or forbid those kinds for enemy abilities at generation. Home: backlog 999.4 (abilities and threat).
