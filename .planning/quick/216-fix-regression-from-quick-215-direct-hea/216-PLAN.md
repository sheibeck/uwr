---
phase: quick-216
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements:
  - QUICK-216
must_haves:
  truths:
    - "Mend heals the target for a visible positive amount"
    - "Spirit Mender heals the target directly AND applies a HoT (not double-HoT)"
    - "Direct heal amount is logged as a heal event in the combat log"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "shaman_spirit_mender case without redundant addCharacterEffect regen call"
      contains: "case 'shaman_spirit_mender'"
  key_links:
    - from: "shaman_spirit_mender case"
      to: "applyHeal"
      via: "applyHeal handles HoT internally via ability.hotPowerSplit — no external addCharacterEffect('regen') needed"
      pattern: "applyHeal.*Spirit Mender"
---

<objective>
Fix two issues preventing direct heals from working after quick-215:

1. **Module not published** — quick-215 changed `calculateHealingPower` and `applyHeal` but did not publish. The old code is still running on the server.
2. **Duplicate HoT for Spirit Mender** — after quick-215, `applyHeal` now internally applies the HoT via `ability.hotPowerSplit`. The `shaman_spirit_mender` switch case also calls `addCharacterEffect(regen)` explicitly after `applyHeal`, creating a second HoT (or overwriting the stat-scaled one with a hardcoded value of `5n/tick`).

Purpose: Healing abilities should work post-quick-215 — direct portion applies HP immediately, HoT portion registers once at the stat-scaled rate.
Output: Modified `combat.ts` with redundant HoT call removed, module published.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/.planning/PROJECT.md
@C:/projects/uwr/.planning/ROADMAP.md
@C:/projects/uwr/spacetimedb/src/helpers/combat.ts
@C:/projects/uwr/spacetimedb/src/data/combat_scaling.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove redundant HoT addCharacterEffect call from shaman_spirit_mender case</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `spacetimedb/src/helpers/combat.ts`, find the `shaman_spirit_mender` switch case (around line 805). It currently reads:

```typescript
case 'shaman_spirit_mender':
  if (!targetCharacter) throw new SenderError('Target required');
  applyHeal(targetCharacter, 12n, 'Spirit Mender');
  addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender');
  appendPrivateEvent(
```

Remove the `addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender');` line entirely. After quick-215, `applyHeal` already handles HoT internally: it checks `ability.hotPowerSplit` (which is `0.5` for spirit_mender from the DB row), calculates the stat-scaled HoT per tick, and calls `addCharacterEffect` itself. The explicit call here is a duplicate that either overwrites the stat-scaled value with the hardcoded `5n` per tick, or applies the regen effect twice.

The `applyHeal(targetCharacter, 12n, 'Spirit Mender')` call must stay — it handles both the direct heal (50% of 12n = 6n + WIS scaling) and the HoT registration (50% of 12n + WIS scaling, split over 2 ticks).

Do not change anything else in this case block.
  </action>
  <verify>
Run the TypeScript compiler:
```bash
cd C:/projects/uwr/spacetimedb && npx tsc --noEmit
```
Expect: zero errors in combat.ts.

Confirm the redundant line is gone:
```bash
grep -n "addCharacterEffect.*regen.*5n.*2n.*Spirit Mender" C:/projects/uwr/spacetimedb/src/helpers/combat.ts
```
Expect: no output.

Confirm `applyHeal` is still called for spirit_mender:
```bash
grep -n "applyHeal.*Spirit Mender" C:/projects/uwr/spacetimedb/src/helpers/combat.ts
```
Expect: the `applyHeal(targetCharacter, 12n, 'Spirit Mender')` line is present.
  </verify>
  <done>
- TypeScript compiles without errors
- `addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender')` is removed from the switch case
- `applyHeal(targetCharacter, 12n, 'Spirit Mender')` remains in the switch case
  </done>
</task>

<task type="auto">
  <name>Task 2: Publish module to apply quick-215 changes and this fix</name>
  <files></files>
  <action>
Publish the module to apply all quick-215 changes (new `calculateHealingPower` signature, `applyHeal` stat-scaling) along with the fix from Task 1.

```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```

After publish completes, check logs for panics:
```bash
spacetime logs uwr
```

If `ensure_items` runs at startup (it runs in `clientConnected` or init), ability template rows will be updated with `statScaling` values from `ABILITY_STAT_SCALING`. This seeding is idempotent — existing rows will be updated via `ctx.db.abilityTemplate.id.update(...)` which sets `statScaling: ABILITY_STAT_SCALING[key] ?? undefined`.

No `--clear-database` is needed — the schema is unchanged, only logic changed.
  </action>
  <verify>
```bash
spacetime logs uwr
```
Expect: no PANIC lines, no TypeScript runtime errors. The last log lines should show normal startup/init messages.
  </verify>
  <done>
- `spacetime publish uwr` exits successfully
- `spacetime logs uwr` shows no panics
- Module is running the quick-215 + quick-216 code
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` — zero errors
2. Redundant regen call removed: `grep -n "addCharacterEffect.*regen.*5n.*2n.*Spirit Mender" C:/projects/uwr/spacetimedb/src/helpers/combat.ts` — no matches
3. Module published: `spacetime publish uwr --project-path C:/projects/uwr/spacetimedb` — exit 0
4. No panics: `spacetime logs uwr` — no PANIC lines
5. In-game: Mend heals the target for a visible HP increase (base 18 + WIS bonus)
6. In-game: Spirit Mender applies ONE regen HoT (not two) at ~6 + WIS/2 per tick, plus immediate direct heal of ~6 + WIS
</verification>

<success_criteria>
- The `addCharacterEffect(regen, 5n, 2n, 'Spirit Mender')` duplicate is removed from the switch case
- Module is published with quick-215 + quick-216 changes active
- Mend produces a positive heal (not 0)
- Spirit Mender produces a direct heal portion AND a single HoT (not double HoT overwriting the stat-scaled value)
</success_criteria>

<output>
After completion, create `.planning/quick/216-fix-regression-from-quick-215-direct-hea/216-SUMMARY.md` following the summary template.
</output>
