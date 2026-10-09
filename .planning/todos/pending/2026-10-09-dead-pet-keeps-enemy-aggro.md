---
created: 2026-10-09T09:00:00.000Z
title: A dead pet keeps its aggro entry, so an enemy can idle on it
area: general
files:
  - spacetimedb/src/reducers/combat.ts (enemy targeting accepts pet aggro entries without checking the pet still exists)
---

## Problem

A pet killed by an enemy auto-attack keeps its aggro entry, and enemy target picking accepts pet entries without checking the pet is alive, so an enemy can keep targeting a dead pet. Pre-existing; found by Plan 05 (deferred-items row 2).

## Solution

Clear the pet's aggro rows when it dies, and have target picking skip missing or dead pets. Home: backlog 999.4 (Ability Expansion, Pets and Threat), or a quick fix if it shows up in play.
