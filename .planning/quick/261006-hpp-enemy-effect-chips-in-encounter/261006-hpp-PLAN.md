---
quick_id: 261006-hpp
type: quick
autonomous: true
---

# Quick Task 261006-hpp: Effect chips on hostiles, and an ability type line in the hotbar tooltip

Two client-only changes from the owner's 2026-10-06 chat. No server logic, prompt, route or `src/module_bindings` change. No publish. The only non-client file is an import-free label map added beside the vocabulary in `spacetimedb/src/data/mechanical_vocabulary.ts`.

`combat_enemy_effect` is `public: true` in `spacetimedb/src/schema/tables.ts` (indexed by `combatId` and `enemyId`) and is already in the generated bindings, so no stop is needed.

## Task 1: Enemy effect chips

- `queries.ts`: `combatEnemyEffects(combatId)`, `WHERE combat_id = N` on `combat_enemy_effect`.
- `gameData.ts`: a `fightEnemyEffects` keyed binding on `combatKey`, with the same filter as its query (`row.combatId === k`), added to `keyedAll` so reset disposes it. `GameConn.db.combatEnemyEffect`.
- `context.ts`: `CombatData.enemyEffects: List<CombatEnemyEffect>`, inert default `empty()`.
- `kindLabel.ts` (new, `combat/`): `kindLabel(kind)` reads the label from the server map; `enemyEffectKind(effectType, magnitude)` classifies an effect as `dot`, `hot`, `cc`, `fear`, `debuff` or `buff` using the server vocabulary (`CC_TYPES`) and the existing regen set in `rails/effects.ts`.
- `hostiles.ts`: `HostileViewsInput.effects` (optional), `HostileView.effects` (chips for that enemy, ascending id), and the aria label gains `{effect} on {enemy}, N rounds left` for each effect.
- `EffectChips.vue`: additive `limit`, `compact` and `inline` props. Desktop cards show `{Type} · N rounds`, up to 3 chips and a `+N` chip. The mobile strip chip shows the same chips in the compact form (icon and `N rounds`, type in the title and aria label) with a limit of 1 and a `+N` chip, and a chip that carries effects sizes to its content.
- `HostileCard.vue` and `EncounterStrip.vue` render the chips; `EncounterPanel.vue` and the strip pass `combat.enemyEffects`.
- Tests: query SQL and filter, binding filter rejects another fight, reset disposes it, inert default, each row shows only its own effects, "N rounds" and "1 round", overflow `+N`, the aria label, an `<img onerror>` effect name stays text.

## Task 2: Hotbar tooltip type line

- `mechanical_vocabulary.ts`: `ABILITY_KIND_LABELS: Record<AbilityKind, string>`, import-free, so a new kind cannot be added without a label (compile time) and a client test checks every kind has a non-empty label.
- `hotbar.ts`: `slotTooltip` takes `kind` and returns `type`; `slotTooltipText` leads with it. `HotbarRow.vue` renders a `.tip-type` line. The chips use the same labels.
- Tests: label coverage of every kind, `slotTooltip` type for dot/hot/buff/debuff/cc, unknown kind fallback, the tooltip line, the described-by text.

## Gate

`pnpm exec vitest run --dir src --maxWorkers=2`, `pnpm exec vue-tsc -b`, `pnpm build`.
