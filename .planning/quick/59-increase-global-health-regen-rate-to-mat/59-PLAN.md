---
phase: quick-59
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/combat.ts
autonomous: true
must_haves:
  truths:
    - "Out-of-combat HP recovery time is proportional to the HP pool increase from quick-56"
    - "In-combat HP regen scales similarly to maintain the same relative recovery rate"
    - "Mana and stamina regen scale alongside HP regen for consistency"
  artifacts:
    - path: "spacetimedb/src/reducers/combat.ts"
      provides: "Scaled regen constants"
      contains: "HP_REGEN_OUT"
  key_links: []
---

<objective>
Increase global health/mana/stamina regen rates to match the ~80-90% HP pool increase from quick-56.

Purpose: Quick-56 increased HP pools by ~80-90% (BASE_HP 20->50, HP_STR_MULTIPLIER 5->8) to lengthen combat, but the regen constants were not adjusted. Out-of-combat recovery now takes nearly twice as long, creating tedious downtime between fights.

Output: Updated regen constants in combat.ts that restore pre-quick-56 recovery times relative to max HP.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/reducers/combat.ts (lines 1081-1156 — regen constants and regen_health reducer)
@spacetimedb/src/data/class_stats.ts (BASE_HP=50n, HP_STR_MULTIPLIER=8n)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Scale regen constants to match increased HP pools</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Update the regen constants at lines 1081-1087 in combat.ts.

Current values and reasoning for new values:

HP pools increased ~80-90%:
- Old: Level 1 Warrior ~80 HP, Wizard ~60 HP
- New: Level 1 Warrior ~146 HP, Wizard ~114 HP

Scale regen by ~2x to restore similar recovery-time-to-max-HP ratio:

```
const HP_REGEN_OUT = 6n;       // was 3n — doubled for ~2x HP pools
const MANA_REGEN_OUT = 5n;     // was 3n — ~67% increase (mana pools unchanged but keeping proportional feel)
const STAMINA_REGEN_OUT = 5n;  // was 3n — same as mana
const HP_REGEN_IN = 2n;        // was 1n — doubled for in-combat
const MANA_REGEN_IN = 2n;      // was 1n — doubled for in-combat
const STAMINA_REGEN_IN = 2n;   // was 1n — doubled for in-combat
```

Keep REGEN_TICK_MICROS at 8_000_000n (8 seconds) — changing tick rate would affect effect processing and other systems. Adjusting the per-tick amount is safer.

Do NOT change EFFECT_TICK_MICROS or HOT_TICK_MICROS — those control DoT/HoT/buff/debuff processing, not passive regen.
  </action>
  <verify>
1. Grep the file to confirm the new constant values: `grep -n "REGEN_OUT\|REGEN_IN" spacetimedb/src/reducers/combat.ts`
2. Verify no other files need updating (these constants are local to combat.ts, not exported)
3. Build check: `cd spacetimedb && npm run build` (or equivalent TypeScript compilation check)
  </verify>
  <done>
HP_REGEN_OUT=6n, MANA_REGEN_OUT=5n, STAMINA_REGEN_OUT=5n, HP_REGEN_IN=2n, MANA_REGEN_IN=2n, STAMINA_REGEN_IN=2n. REGEN_TICK_MICROS unchanged at 8_000_000n.
  </done>
</task>

</tasks>

<verification>
- Regen constants are roughly doubled to match the ~2x HP pool increase
- Out-of-combat: a Level 1 Warrior (146 HP) recovers from near-death in ~195s (146/6 * 8s) vs old ~213s (80/3 * 8s) — similar ballpark
- Out-of-combat: a Level 1 Wizard (114 HP) recovers in ~152s (114/6 * 8s) vs old ~160s (60/3 * 8s) — similar ballpark
- In-combat regen doubled from 1 to 2 per tick, maintaining the same relative healing rate
- Tick interval unchanged — no risk of breaking scheduled reducer timing
</verification>

<success_criteria>
All six regen constants updated. Recovery time between fights feels similar to pre-quick-56 pace relative to max HP. No other systems affected.
</success_criteria>

<output>
After completion, create `.planning/quick/59-increase-global-health-regen-rate-to-mat/59-SUMMARY.md`
</output>
