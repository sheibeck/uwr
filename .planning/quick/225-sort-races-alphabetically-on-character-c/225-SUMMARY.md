# Quick Task 225 — Sort races alphabetically on character creation screen

**Date:** 2026-02-21
**Commit:** 8d9d9eb

## What changed

`src/components/CharacterPanel.vue` — `unlockedRaces` computed now chains `.sort((a, b) => a.name.localeCompare(b.name))` after the `.filter()` so races appear in alphabetical order on the character creation screen.

## Result

Races now display: Dwarf, Gnome, Half-Elf, Halfling, Human, Ironclad, Orc, etc. — sorted A→Z instead of insertion order.
