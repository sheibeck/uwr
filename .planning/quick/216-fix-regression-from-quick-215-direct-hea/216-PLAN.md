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
    - "Mend heals the target for a visible positive HP increase"
    - "Spirit Mender heals the target directly AND applies a HoT (not double-HoT)"
    - "After healing, the target's HP in the DB reflects the heal (not the pre-heal value)"
  artifacts:
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "Mana/stamina deduction re-fetches character from DB before updating to preserve HP changes"
      contains: "latest = ctx.db.character.id.find(character.id)"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "shaman_spirit_mender case without redundant addCharacterEffect regen call"
      contains: "case 'shaman_spirit_mender'"
  key_links:
    - from: "executeAbilityAction resource deduction (end of function)"
      to: "applyHeal target HP update"
      via: "re-fetch character before update to preserve healed HP"
      pattern: "latest.*ctx.db.character.id.find"
---

<objective>
Fix two bugs in `spacetimedb/src/helpers/combat.ts` causing healing spells to appear to do nothing:

**Bug 1 (ROOT CAUSE) — Mana deduction overwrites heal:**
After `runAbility()` heals the target, the resource deduction at lines 1557-1561 does:
```typescript
ctx.db.character.id.update({ ...character, mana: character.mana - resourceCost });
```
`character` is the ORIGINAL snapshot from the top of `executeAbilityAction`, which has the pre-heal HP. For self-heals (target === caster), this overwrites the healed HP back to the original value. The log shows the correct heal amount (event was written during runAbility), mana decreases, but HP silently resets — matching the user's exact symptom: "log shows heal effect and proper number, targets hitpoints don't change."

**Bug 2 — Duplicate HoT for Spirit Mender:**
After quick-215, `applyHeal` now handles HoT internally via `ability.hotPowerSplit`. The `shaman_spirit_mender` switch case also calls `addCharacterEffect(regen, 5n, 2n, 'Spirit Mender')` explicitly after `applyHeal`, creating a double HoT.

Output: Both bugs fixed in `combat.ts`, module published.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@C:/projects/uwr/.planning/PROJECT.md
@C:/projects/uwr/spacetimedb/src/helpers/combat.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix mana/stamina deduction to re-fetch character before updating</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `spacetimedb/src/helpers/combat.ts`, find the resource deduction block near the end of `executeAbilityAction` (around lines 1557-1561). It currently reads:

```typescript
  // Ability fired successfully — now consume resources
  if (staminaFreeEffectId !== undefined) {
    ctx.db.characterEffect.id.delete(staminaFreeEffectId);
  }
  if (ability.resource === 'mana') {
    ctx.db.character.id.update({ ...character, mana: character.mana - resourceCost });
  } else if (ability.resource === 'stamina') {
    ctx.db.character.id.update({ ...character, stamina: character.stamina - resourceCost });
  }
}
```

Change the mana and stamina update lines to re-fetch the current character state from DB before spreading, so that any HP changes made by the ability (heals, life drain, etc.) are preserved:

```typescript
  // Ability fired successfully — now consume resources
  if (staminaFreeEffectId !== undefined) {
    ctx.db.characterEffect.id.delete(staminaFreeEffectId);
  }
  if (ability.resource === 'mana') {
    const latest = ctx.db.character.id.find(character.id);
    if (latest) ctx.db.character.id.update({ ...latest, mana: character.mana - resourceCost });
  } else if (ability.resource === 'stamina') {
    const latest = ctx.db.character.id.find(character.id);
    if (latest) ctx.db.character.id.update({ ...latest, stamina: character.stamina - resourceCost });
  }
}
```

**Why this works:** `latest` is the up-to-date character row from DB (which includes any HP changes made during `runAbility()`). Spreading `...latest` preserves those changes. We still use `character.mana - resourceCost` (not `latest.mana - resourceCost`) because `character.mana` is the starting mana (nothing in `runAbility()` modifies the caster's mana, so they're equal, but using the original avoids any ambiguity).
  </action>
  <verify>
```bash
cd C:/projects/uwr/spacetimedb && npx tsc --noEmit
```
Expect: zero errors.

Confirm the new pattern exists:
```bash
grep -n "latest.*ctx.db.character.id.find" C:/projects/uwr/spacetimedb/src/helpers/combat.ts
```
Expect: 2 matches (one for mana, one for stamina).

Confirm the old stale spread is gone:
```bash
grep -n "update.*\.\.\.character.*mana\|update.*\.\.\.character.*stamina" C:/projects/uwr/spacetimedb/src/helpers/combat.ts
```
Expect: no matches.
  </verify>
  <done>
- TypeScript compiles without errors
- Mana deduction uses `...latest` instead of `...character`
- Stamina deduction uses `...latest` instead of `...character`
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove redundant HoT addCharacterEffect from shaman_spirit_mender</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
In `spacetimedb/src/helpers/combat.ts`, find the `shaman_spirit_mender` switch case (around line 805). It currently has:

```typescript
case 'shaman_spirit_mender':
  if (!targetCharacter) throw new SenderError('Target required');
  applyHeal(targetCharacter, 12n, 'Spirit Mender');
  addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender');
  appendPrivateEvent(
```

Remove the `addCharacterEffect(ctx, targetCharacter.id, 'regen', 5n, 2n, 'Spirit Mender');` line. After quick-215, `applyHeal` handles HoT internally via `ability.hotPowerSplit = 0.5`. The explicit call here is a duplicate.
  </action>
  <verify>
```bash
grep -n "addCharacterEffect.*regen.*5n.*2n.*Spirit Mender" C:/projects/uwr/spacetimedb/src/helpers/combat.ts
```
Expect: no output.
  </verify>
  <done>
- The redundant `addCharacterEffect` line is removed from spirit_mender case
  </done>
</task>

<task type="auto">
  <name>Task 3: Publish module</name>
  <files></files>
  <action>
Publish the module to deploy all fixes:

```bash
spacetime publish uwr --project-path C:/projects/uwr/spacetimedb
```

After publish, check for panics:
```bash
spacetime logs uwr
```
  </action>
  <verify>
`spacetime logs uwr` shows no PANIC lines.
  </verify>
  <done>
- Module published successfully
- No panics in logs
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `cd C:/projects/uwr/spacetimedb && npx tsc --noEmit` — zero errors
2. New re-fetch pattern: `grep -n "latest.*ctx.db.character.id.find" ...` — 2 matches
3. Old stale spread gone: `grep -n "update.*\.\.\.character.*mana" ...` — no matches
4. Duplicate HoT removed: `grep -n "addCharacterEffect.*regen.*5n.*2n.*Spirit Mender" ...` — no matches
5. Module published: exits 0
6. In-game: Mend on self shows HP increase after cast
7. In-game: Spirit Mender gives direct heal + single HoT (not double)
</verification>

<success_criteria>
- Mana/stamina deduction re-fetches `latest` character from DB before updating
- Duplicate Spirit Mender HoT removed
- Module published with all fixes
- Mend heals self for a visible HP increase
</success_criteria>

<output>
After completion, create `.planning/quick/216-fix-regression-from-quick-215-direct-hea/216-SUMMARY.md` following the summary template.
</output>
