# Quick Task 352: Fix zero mana/stamina for generated classes

## Root Cause
`usesMana()` checked against a hardcoded `MANA_CLASSES` set. v2.0 generated classes (e.g., "Prismancer") weren't in that set → maxMana = 0. Similarly, `manaStatForClass()` fell back to `{ primary: 'str' }` for unknown classes.

## Fixes

### Server: class_stats.ts
- `usesMana()`: Inverted logic — now returns `true` for ALL classes except explicit non-mana legacy classes (warrior, rogue, monk, beastmaster)
- `manaStatForClass()`: For unknown classes, uses highest stat instead of STR default

### Server: characters.ts
- `set_active_character` now calls `recomputeCharacterDerived()` on login
- If mana/stamina are 0 but max > 0, fills them to max (fixes existing characters)

### Client: NarrativeHud.vue
- Added stamina bar (orange) alongside HP and mana bars
- Mana bar conditionally shown only when maxMana > 0

## Commits
- a7dd07f: fix(quick-352): fix zero mana/stamina for generated classes + add stamina bar
