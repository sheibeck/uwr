---
phase: quick
plan: 261006-hpp
subsystem: client
tags: [combat, encounter, effects, chips, hotbar, tooltip, a11y]
status: complete
key-files:
  created:
    - src/combat/kindLabel.ts
    - src/combat/kindLabel.test.ts
    - src/combat/effectChipsGuards.test.ts
  modified:
    - spacetimedb/src/data/mechanical_vocabulary.ts
    - src/game/queries.ts
    - src/game/gameData.ts
    - src/game/context.ts
    - src/combat/hostiles.ts
    - src/combat/HostileCard.vue
    - src/combat/EncounterStrip.vue
    - src/combat/EncounterPanel.vue
    - src/rails/EffectChips.vue
    - src/rails/effects.ts
    - src/hotbar/hotbar.ts
    - src/hotbar/HotbarRow.vue
commits:
  - cf417d20 feat(quick-261006-hpp): hotbar tooltip shows the ability type from ability_template.kind
  - 61a710ee feat(quick-261006-hpp): effect chips on hostiles in the Encounter panel and the mobile strip
---

# Quick Task 261006-hpp: Effect chips on hostiles, and an ability type line in the hotbar tooltip

## One-liner

Hostile rows (desktop rail and sheet) and mobile strip chips now show the effects on each enemy from the public `combat_enemy_effect` table (type in the server vocabulary's words, "N rounds", "+N" overflow), and the hotbar tooltip gains a type line ("Damage over time", "Heal", "Crowd control") from `ability_template.kind`, both using one server-owned label map.

## Task 2: hotbar tooltip type line (commit cf417d20)

- `mechanical_vocabulary.ts`: `ABILITY_KIND_LABELS: Record<AbilityKind, string>`, import-free, next to `ABILITY_KINDS`. Being a full `Record`, a kind added without a label fails the type check; `kindLabel.test.ts` also checks every kind has a non-empty, distinct label and no extra keys.
- `kindLabel.ts` (new): `kindLabel(kind)` reads the map through `@game-data` (own-property check, so `toString` and `__proto__` fall back to words); `enemyEffectKind(effectType, magnitude)` classifies an effect row into a vocabulary kind: `dot`, `hot` (regen family), `cc` (`CC_TYPES`), `fear`, else `buff` or `debuff` by the existing polarity rule.
- `hotbar.ts`: `slotTooltip` needs `kind` and returns `type`; `slotTooltipText` leads with it ("Damage, 12 mana, 6s cooldown, 2s cast. Hurls a bolt of fire."). `HotbarRow.vue` renders a `.tip-type` line between name and stats (12 px, weight 500, existing `--color-accent-100`).

## Task 1: enemy effect chips (commit 61a710ee)

- Binding: `combat_enemy_effect` is `public: true` in the server schema and already in the generated bindings (no `module_bindings` edit). `queries.combatEnemyEffects(combatId)` is `WHERE combat_id = N`; `gameData.ts` has a `fightEnemyEffects` keyed binding on the combat key with the same filter (`row.combatId === k`), included in `keyedAll` so `reset()` and fight end dispose it; `CombatData.enemyEffects` has an inert `empty()` default.
- `hostiles.ts`: optional `effects` input, `HostileView.effects` (that enemy's chips in ascending id, none when defeated), exported `enemyEffectViews`, `HOSTILE_EFFECT_LIMIT = 3`, `STRIP_EFFECT_LIMIT = 1`. The card/chip `ariaLabel` gains `, {effect} on {enemy}, N rounds left` for each effect (a button's `aria-label` replaces its content for screen readers, so the phrase had to go in the label).
- `EffectChips.vue` reused with additive props `limit`, `compact`, `dense`, `inline`. Existing callers (VitalsRail, VitalsStrip) are unchanged.
  - Desktop card: `{Type} · N rounds` chips (e.g. "Damage over time · 3 rounds"), 3 shown then "+N", title "Ignite · Damage over time · 3 rounds".
  - Mobile strip chip: icon plus "N rounds", 1 shown then "+N" (type and name in the title and in the chip's aria label). The chip with effects sizes to its content (`has-effects`, `flex-basis: auto`) and the row already scrolls sideways.
- Names are text nodes, attribute values only; no v-html.

## Deviations from Plan

None against the plan file. Notes on choices the request left open:

1. **Strip chips show icon + rounds, not the type words.** At the strip chip's 96 px minimum, "Damage over time · 3 rounds" cannot fit; the type is carried by the per-type icon, the title and the aria label. The desktop rail and sheet show the type words in full. Easy to change (`compact` on the strip's `EffectChips`).
2. **Crowd control and fear.** The request listed four types; stun, root, silence, slow and mesmerize read "Crowd control" and fear reads "Fear", both from the same label map, rather than being folded into "Debuff".
3. **STATE.md not touched.** Run in a parallel worktree; the orchestrator should add the STATE row (suggested commit hashes above) to avoid a merge conflict.
4. `hotbar.ts` was briefly rewritten with CRLF by a script and converted back to LF before commit; the diff is clean.

## Verification

- `pnpm exec vitest run --dir src --maxWorkers=2`: 117 files, 2509 tests passed (before a final one-line type fix in `EncounterStrip.test.ts`, after which that file was re-run: 24 passed). One "Timeout terminating forks worker" notice for `CreationView.test.ts` appeared during the full run with all tests still passing; it is unrelated to this change.
- `pnpm exec vue-tsc -b`: clean.
- `pnpm build`: passed, "bundle clean: 4 files scanned".
- Not checked in a real browser (owner is on the Vite dev server): chip wrapping in the rail and the strip chip widening are covered by markup and CSS assertions only.

## Known Stubs

None.

## Threat Flags

None. One more public-table subscription, filtered to the one fight by combat id like the other fight tables; it holds no private data.

## Self-Check: PASSED

Commits cf417d20 and 61a710ee exist; created files present.
