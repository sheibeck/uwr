---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
  - src/ui/styles.ts
  - src/components/LogWindow.vue
autonomous: true
must_haves:
  truths:
    - "When a player kills an enemy with a faction, a log entry appears showing standing gained with that faction"
    - "When a player kills an enemy whose faction has a rival, a log entry appears showing standing lost with the rival faction"
    - "Faction log entries are visually distinct from other log types (unique color)"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Log calls in grantFactionStandingForKill"
      contains: "logPrivateAndGroup.*faction"
    - path: "src/ui/styles.ts"
      provides: "logFaction style with distinct color"
      contains: "logFaction"
    - path: "src/components/LogWindow.vue"
      provides: "faction kind styling in log entry rendering"
      contains: "event.kind === 'faction'"
  key_links:
    - from: "spacetimedb/src/index.ts"
      to: "EventPrivate table"
      via: "logPrivateAndGroup call in grantFactionStandingForKill"
      pattern: "logPrivateAndGroup.*ctx.*character.*faction"
    - from: "src/components/LogWindow.vue"
      to: "src/ui/styles.ts"
      via: "styles.logFaction conditional binding"
      pattern: "styles\\.logFaction"
---

<objective>
Add log entries for faction standing gains and losses when killing enemies.

Purpose: Currently killing enemies silently changes faction standings with no feedback in the game log. Players should see messages like "You gained 10 standing with Iron Compact" and "You lost 5 standing with Verdant Circle" so the faction system feels responsive.

Output: Backend logs faction changes, client renders them with a distinct color.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@spacetimedb/src/index.ts (lines 6061-6090 — grantFactionStandingForKill, mutateStanding, logPrivateAndGroup)
@src/components/LogWindow.vue
@src/ui/styles.ts (lines 500-532 — log kind styles)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add faction standing log calls to backend</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
In the `grantFactionStandingForKill` function (around line 6081), after calling `mutateStanding` for the enemy faction gain and the rival faction penalty, add `logPrivateAndGroup` calls to log both changes.

The function currently has access to `ctx` and `character` (which has `.id` and `.ownerUserId`). It also has `faction` (enemy's faction with `.name`). For the rival, look up the rival faction name via `ctx.db.faction.id.find(faction.rivalFactionId)`.

After `mutateStanding(ctx, character.id, faction.id, STANDING_PER_KILL)` add:
```
logPrivateAndGroup(ctx, character, 'faction', `You gained ${STANDING_PER_KILL} standing with ${faction.name}.`);
```

After `mutateStanding(ctx, character.id, faction.rivalFactionId, -RIVAL_STANDING_PENALTY)` add:
```
const rivalFaction = ctx.db.faction.id.find(faction.rivalFactionId);
if (rivalFaction) {
  logPrivateAndGroup(ctx, character, 'faction', `You lost ${RIVAL_STANDING_PENALTY} standing with ${rivalFaction.name}.`);
}
```

Use kind `'faction'` for the log entries so they can be styled distinctly on the client.

Note: `logPrivateAndGroup` is already defined in the same file (line ~1439) and takes `(ctx, character, kind, privateMessage, groupMessage?)`. The `character` object passed to `grantFactionStandingForKill` already has `ownerUserId` since it comes from `ctx.db.character.id.find(p.characterId)` in combat.ts line 1842. No group message variant is needed — the private message is sufficient (group members see their own faction messages individually since `grantFactionStandingForKill` is called per-participant in the combat loop).
  </action>
  <verify>Run `npx tsc --noEmit --project spacetimedb/tsconfig.json` (or equivalent) to confirm no type errors. If no tsconfig, just verify the file parses without syntax errors.</verify>
  <done>grantFactionStandingForKill logs both faction gain and rival faction loss with kind='faction'</done>
</task>

<task type="auto">
  <name>Task 2: Add faction log styling to client</name>
  <files>src/ui/styles.ts, src/components/LogWindow.vue</files>
  <action>
1. In `src/ui/styles.ts`, after the `logAvoid` style (around line 530-532), add a new `logFaction` style:
```
logFaction: {
  color: '#b8a9e8',
},
```
Use a muted purple/lavender color (#b8a9e8) to distinguish faction messages from combat (red), healing (green), rewards (gold), etc. Purple suggests reputation/social standing without conflicting with existing colors. (Note: whisper is #c792ff which is brighter — this is intentionally more muted to differentiate.)

2. In `src/components/LogWindow.vue`, in the style array for the event message span (after the `event.kind === 'avoid'` line, around line 28), add:
```
event.kind === 'faction' ? styles.logFaction : {},
```

This follows the exact same pattern as every other kind-based style conditional in the template.
  </action>
  <verify>Run `npx vue-tsc --noEmit` or the project's typecheck command to confirm no errors. Visually inspect the LogWindow.vue template to confirm the new conditional is placed correctly in the style array.</verify>
  <done>Faction log entries render in a distinct lavender color (#b8a9e8) in the game log window</done>
</task>

</tasks>

<verification>
1. Publish the module: `spacetime publish <db-name> --clear-database -y --project-path spacetimedb`
2. Generate bindings: `spacetime generate --lang typescript --out-dir src/module_bindings --project-path spacetimedb`
3. Start the client and create a character
4. Find and kill an enemy that has a faction assignment (e.g., a construct/sentinel for Iron Compact)
5. Verify two log entries appear in the game log:
   - "You gained 10 standing with [faction name]." in lavender color
   - "You lost 5 standing with [rival faction name]." in lavender color
6. Verify the log entries appear with kind label `[private faction]` in the log window
</verification>

<success_criteria>
- Killing a faction-assigned enemy produces 1-2 log entries (gain + optional rival loss)
- Log entries show correct faction names and standing amounts
- Log entries render in distinct lavender color (#b8a9e8) in the LogWindow
- No TypeScript compilation errors in backend or client
</success_criteria>

<output>
After completion, create `.planning/quick/8-add-log-entries-for-faction-standing-gai/8-SUMMARY.md`
</output>
