---
phase: quick-215
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/data/combat_scaling.ts
  - spacetimedb/src/helpers/combat.ts
autonomous: true
requirements:
  - QUICK-215
must_haves:
  truths:
    - "Healing abilities scale based on the caster's class primary stat (or hybrid formula for hybrid classes), not always WIS"
    - "A paladin using a heal ability benefits from WIS scaling (primary stat)"
    - "A ranger using nature's balm (if it healed) would benefit from DEX+WIS hybrid scaling"
    - "A warrior or rogue with no WIS as primary/secondary gets no stat bonus from heal abilities (Decision #32)"
    - "HoT effects in applyHeal use the same stat-scaling path as direct heals"
  artifacts:
    - path: "spacetimedb/src/data/combat_scaling.ts"
      provides: "Updated calculateHealingPower with statScaling parameter"
    - path: "spacetimedb/src/helpers/combat.ts"
      provides: "applyHeal passes ability.statScaling to calculateHealingPower"
  key_links:
    - from: "applyHeal in helpers/combat.ts"
      to: "calculateHealingPower in data/combat_scaling.ts"
      via: "statScaling param from ability.statScaling"
      pattern: "calculateHealingPower.*statScaling"
---

<objective>
Make healing ability output scale from the caster's class primary/secondary stat using the same `getAbilityStatScaling` formula that damage already uses, rather than always reading raw WIS with a flat multiplier.

Purpose: Healing should parallel damage scaling — a paladin (WIS primary) scales heals from WIS; a ranger (DEX primary, WIS secondary) scales from a DEX+WIS hybrid formula; a warrior gains no healing bonus (no WIS in class config). This matches Decision #32 (WIS only for classes with WIS as primary/secondary), Decision #34 (hybrid formula for hybrid classes), and Decision #35 (ABILITY_STAT_SCALING_PER_POINT = 1n).

Output: `calculateHealingPower` updated to accept and use `statScaling`, `applyHeal` threads `ability.statScaling` through both direct heal and HoT paths.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md

@spacetimedb/src/data/combat_scaling.ts
@spacetimedb/src/helpers/combat.ts
@spacetimedb/src/data/class_stats.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update calculateHealingPower to accept statScaling and use getAbilityStatScaling</name>
  <files>spacetimedb/src/data/combat_scaling.ts</files>
  <action>
    Change the `calculateHealingPower` function signature and body in `spacetimedb/src/data/combat_scaling.ts`:

    Current signature:
    ```
    export function calculateHealingPower(baseHealing: bigint, casterWis: bigint, className: string): bigint
    ```

    New signature:
    ```
    export function calculateHealingPower(
      baseHealing: bigint,
      characterStats: { str: bigint; dex: bigint; cha: bigint; wis: bigint; int: bigint },
      className: string,
      statScaling: string
    ): bigint
    ```

    New body logic:
    1. If `statScaling` is falsy or `'none'`, return `baseHealing` unchanged (no scaling for utility heals like paladin_lay_on_hands which passes 'none').
    2. Check `getClassConfig(className)` — if the class has neither primary nor secondary equal to the stat(s) used by the ability's statScaling value, return `baseHealing` (honours Decision #32 gate: non-healing classes get no bonus).
       - For `statScaling === 'wis'`: gate on `config.primary === 'wis' || config.secondary === 'wis'`.
       - For all other pure stats (str, dex, int, cha): gate on `config.primary === statScaling || config.secondary === statScaling`.
       - For `statScaling === 'hybrid'`: no gate needed — `getAbilityStatScaling` already handles hybrid via CLASS_CONFIG, and hybrid classes always have both primary and secondary.
    3. Call `getAbilityStatScaling(characterStats, '', className, statScaling)` — the `abilityKey` argument is unused in current implementation (pass empty string or the key, no functional difference).
    4. Return `baseHealing + statBonus`.

    Remove the old `HEALING_WIS_SCALING_PER_1000` usage from this function entirely (the constant can stay exported for reference but is no longer used in `calculateHealingPower`).

    Example final implementation:
    ```typescript
    export function calculateHealingPower(
      baseHealing: bigint,
      characterStats: { str: bigint; dex: bigint; cha: bigint; wis: bigint; int: bigint },
      className: string,
      statScaling: string
    ): bigint {
      if (!statScaling || statScaling === 'none') {
        return baseHealing;
      }

      // Decision #32: Only apply stat scaling for classes that have the relevant stat
      // as primary or secondary. Hybrid classes always qualify.
      if (statScaling !== 'hybrid') {
        const config = getClassConfig(className);
        const hasStat = config.primary === statScaling || config.secondary === statScaling;
        if (!hasStat) return baseHealing;
      }

      const statBonus = getAbilityStatScaling(characterStats, '', className, statScaling);
      return baseHealing + statBonus;
    }
    ```
  </action>
  <verify>TypeScript compiles: run `cd spacetimedb && npx tsc --noEmit` and confirm no errors on this file.</verify>
  <done>calculateHealingPower accepts characterStats + statScaling, uses getAbilityStatScaling internally, class gate preserved for non-hybrid stats.</done>
</task>

<task type="auto">
  <name>Task 2: Update applyHeal call-sites in combat.ts to pass characterStats and statScaling</name>
  <files>spacetimedb/src/helpers/combat.ts</files>
  <action>
    In `spacetimedb/src/helpers/combat.ts`, inside the `applyHeal` closure (which captures `ability` and `character` from outer scope), update the two calls to `calculateHealingPower`:

    The `ability` variable is already in scope. It has a `statScaling` field (e.g., `'wis'` for cleric/druid/shaman healing abilities). The `character` variable has `.str`, `.dex`, `.cha`, `.wis`, `.int`.

    Build a `characterStats` object inline (same pattern as `applyDamage` uses):
    ```typescript
    const characterStats = {
      str: character.str,
      dex: character.dex,
      cha: character.cha,
      wis: character.wis,
      int: character.int,
    };
    ```

    Change the two `calculateHealingPower` calls:

    1. Direct heal (line ~733):
       ```typescript
       // OLD
       const scaledAmount = calculateHealingPower(directHeal, character.wis, character.className);
       // NEW
       const scaledAmount = calculateHealingPower(directHeal, characterStats, character.className, ability?.statScaling ?? 'none');
       ```

    2. HoT path (line ~724):
       ```typescript
       // OLD
       const scaledHotTotal = calculateHealingPower(hotTotalHealing, character.wis, character.className);
       // NEW
       const scaledHotTotal = calculateHealingPower(hotTotalHealing, characterStats, character.className, ability?.statScaling ?? 'none');
       ```

    Update the inline comment above each call from "Apply WIS scaling" to "Apply stat scaling (primary/secondary per class config)".

    NOTE: The hardcoded `amount` values passed to `applyHeal` (e.g., `18n` for cleric_mend, `15n` for cleric_heal) represent the base healing power — these remain unchanged. The stat scaling is additive on top, exactly like damage: `baseHealing + statBonus`.

    NOTE: `paladin_lay_on_hands` calls `applyHeal(target, missing, 'Lay on Hands')` where `missing` is computed HP gap, not a base power value. The `ability` for this case has `statScaling: 'none'` in ABILITY_STAT_SCALING (it's a utility heal), so `calculateHealingPower` will return `baseHealing` unchanged — correct behavior.

    After the changes, verify TypeScript compiles with `cd spacetimedb && npx tsc --noEmit`. Fix any type errors (the most likely one is if `ability` could be undefined — use `ability?.statScaling ?? 'none'` as shown above).
  </action>
  <verify>
    1. `cd spacetimedb && npx tsc --noEmit` passes with no errors
    2. Grep confirms old signature is gone: `grep -n "calculateHealingPower.*character\.wis" spacetimedb/src/helpers/combat.ts` returns no results
    3. Grep confirms new calls exist: `grep -n "calculateHealingPower.*characterStats" spacetimedb/src/helpers/combat.ts` returns 2 results
  </verify>
  <done>Both calculateHealingPower call-sites in applyHeal pass characterStats and statScaling. TypeScript compiles cleanly. Non-WIS classes continue to receive no stat bonus on heals per Decision #32.</done>
</task>

</tasks>

<verification>
1. `cd spacetimedb && npx tsc --noEmit` — no TypeScript errors
2. Cleric heal (statScaling='wis', cleric primary=wis): `calculateHealingPower(15n, {wis:20n,...}, 'cleric', 'wis')` returns `15n + 20n*1n = 35n` (WIS bonus applied)
3. Warrior calling applyHeal (statScaling='str', warrior primary=str): str stat would normally apply, but healing abilities aren't tagged 'str' — this scenario won't occur in practice since only wis/hybrid classes have healing abilities
4. paladin_lay_on_hands (statScaling='none'): returns base amount unchanged — correct
5. shaman_spirit_mender (statScaling='wis', shaman primary=wis): WIS bonus applied — correct
6. Ranger (statScaling='wis', ranger secondary=wis): `hasStat` check passes for secondary='wis', WIS bonus applied — correct for ranger's nature healing
</verification>

<success_criteria>
- TypeScript compiles cleanly after changes
- calculateHealingPower uses getAbilityStatScaling internally
- Direct heals and HoT paths both receive stat scaling
- Non-healing classes (no wis in primary/secondary) get no bonus (Decision #32 preserved)
- Hybrid-stat healing abilities (if any) use 60% primary + 40% secondary (Decision #34 preserved)
- ABILITY_STAT_SCALING_PER_POINT = 1n used (Decision #35 preserved)
</success_criteria>

<output>
After completion, create `.planning/quick/215-healing-effects-from-abilities-should-sc/215-SUMMARY.md`
</output>
