# Quick Task 351: Fix ability uses not showing in narrative

## Root Cause
`use_ability_realtime` reducer called `executeAbilityAction` with `actorType: 'player'` — but the function only handles `'character'`, `'enemy'`, and `'pet'`. The call fell through to the pet branch which returned `false`, and the try/catch swallowed it silently.

## Fix
- Changed `actorType: 'player'` → `'character'`
- Changed args shape to match the character branch: `{ actorType, actorId, abilityTemplateId, targetCharacterId }`
- Removed unused `combatId`, `abilityKey`, `targetEnemyId` from the call

## Also Fixed
- Pre-existing LogWindow.vue stray brace TypeScript error (TS1128)

## Commits
- 508344a: fix(quick-351): fix ability uses not showing in narrative during combat
