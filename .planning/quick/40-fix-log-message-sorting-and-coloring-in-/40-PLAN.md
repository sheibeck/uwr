---
phase: quick-40
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/LogWindow.vue
  - src/composables/useEvents.ts
autonomous: true
must_haves:
  truths:
    - "Group combat damage messages display in red (#ff6b6b), not blue"
    - "Group heal messages display in green (#7ee081), not blue"
    - "Group reward messages display in gold (#f6c453), not blue"
    - "Group events with no kind-specific color still show blue (#8bd3ff) as default"
    - "Same-timestamp events from the same scope stay grouped together instead of interleaving with other scopes"
  artifacts:
    - path: "src/components/LogWindow.vue"
      provides: "Fixed style priority so kind-specific colors override group scope color"
      contains: "logGroup"
    - path: "src/composables/useEvents.ts"
      provides: "Improved sort stability for same-timestamp events"
      contains: "scope"
  key_links:
    - from: "src/components/LogWindow.vue"
      to: "src/ui/styles.ts"
      via: "style bindings"
      pattern: "styles\\.logDamage|styles\\.logGroup"
---

<objective>
Fix two log window bugs affecting group play: (1) combat messages showing blue instead of their kind-specific colors, and (2) same-timestamp events from different scopes interleaving in confusing ways.

Purpose: In groups, combat damage/heal/reward messages all appear blue (the group scope color) instead of red/green/gold because the `logGroup` style is applied last in the Vue style array, overriding kind-specific colors. Additionally, events from the same reducer call share identical timestamps but have IDs from independent table sequences, causing private and group events to interleave arbitrarily.

Output: Fixed LogWindow.vue style priority and useEvents.ts sort stability.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/LogWindow.vue
@src/composables/useEvents.ts
@src/ui/styles.ts (logGroup, logDamage, logHeal, logReward style definitions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix group event color priority in LogWindow.vue</name>
  <files>src/components/LogWindow.vue</files>
  <action>
The style array on lines 23-36 applies `logGroup` (blue, `#8bd3ff`) as the LAST entry based on `event.scope === 'group'`. In Vue's style binding, later entries override earlier ones. So for a group event with `kind === 'damage'`, both `logDamage` (red) and `logGroup` (blue) apply, but `logGroup` wins because it's last.

Fix: Move the `event.scope === 'group'` style entry to be BEFORE the kind-specific style entries, so that kind-specific colors (damage=red, heal=green, reward=gold, avoid=dim, faction=lavender, blocked=terracotta) override the blue group default, while group events with no matching kind (like 'system' or 'ability') still get the blue color.

Change lines 23-36 from:
```
:style="[
  styles.logText,
  event.scope === 'private' ? styles.logPrivate : {},
  event.kind === 'whisper' ? styles.logWhisper : {},
  event.kind === 'presence' ? styles.logPresence : {},
  event.kind === 'command' ? styles.logCommand : {},
  event.kind === 'damage' ? styles.logDamage : {},
  event.kind === 'heal' ? styles.logHeal : {},
  event.kind === 'reward' ? styles.logReward : {},
  event.kind === 'avoid' ? styles.logAvoid : {},
  event.kind === 'faction' ? styles.logFaction : {},
  event.kind === 'blocked' ? styles.logBlocked : {},
  event.scope === 'group' ? styles.logGroup : {},
]"
```

To:
```
:style="[
  styles.logText,
  event.scope === 'private' ? styles.logPrivate : {},
  event.scope === 'group' ? styles.logGroup : {},
  event.kind === 'whisper' ? styles.logWhisper : {},
  event.kind === 'presence' ? styles.logPresence : {},
  event.kind === 'command' ? styles.logCommand : {},
  event.kind === 'damage' ? styles.logDamage : {},
  event.kind === 'heal' ? styles.logHeal : {},
  event.kind === 'reward' ? styles.logReward : {},
  event.kind === 'avoid' ? styles.logAvoid : {},
  event.kind === 'faction' ? styles.logFaction : {},
  event.kind === 'blocked' ? styles.logBlocked : {},
]"
```

This way: group scope sets blue as default, then kind-specific colors override it. Group events with kinds like 'system' or 'ability' (which have no kind-specific style) keep the blue default.
  </action>
  <verify>Read LogWindow.vue and confirm `event.scope === 'group'` line appears BEFORE all `event.kind` lines in the style array.</verify>
  <done>Group damage messages show red, group heal messages show green, group reward messages show gold. Group messages without a kind-specific color (system, ability) remain blue.</done>
</task>

<task type="auto">
  <name>Task 2: Fix sort stability for same-timestamp events across scopes</name>
  <files>src/composables/useEvents.ts</files>
  <action>
In the `combinedEvents` computed (lines 108-115), the sort comparator sorts by `createdAt.microsSinceUnixEpoch` then by `id`. However, events from different scopes (private, group, location) created in the same reducer call share the same timestamp, and their IDs come from independent auto-increment sequences. This causes arbitrary interleaving.

Fix: Add a scope-based secondary sort key BEFORE the id tiebreaker, so same-timestamp events from the same scope stay grouped together. Define a scope ordering constant and use it in the comparator.

Replace the sort block (lines 108-115):
```typescript
return items
  .sort((a, b) => {
    if (a.createdAt.microsSinceUnixEpoch === b.createdAt.microsSinceUnixEpoch) {
      return a.id > b.id ? 1 : -1;
    }
    return a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? 1 : -1;
  })
  .slice(-80);
```

With:
```typescript
// Scope ordering: world first, then location, private, group, client last
const scopeOrder: Record<string, number> = { world: 0, location: 1, private: 2, group: 3, client: 4 };
return items
  .sort((a, b) => {
    if (a.createdAt.microsSinceUnixEpoch !== b.createdAt.microsSinceUnixEpoch) {
      return a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? 1 : -1;
    }
    const scopeDiff = (scopeOrder[a.scope] ?? 9) - (scopeOrder[b.scope] ?? 9);
    if (scopeDiff !== 0) return scopeDiff;
    return a.id > b.id ? 1 : -1;
  })
  .slice(-80);
```

This ensures that when multiple events share a timestamp (common in combat ticks), all private events appear together, then all group events appear together, rather than interleaving. The ordering private-before-group means the player sees their personal "You hit X" messages first, then the group "Bob hit X" messages from other party members.
  </action>
  <verify>Read useEvents.ts and confirm the sort comparator includes scopeOrder-based secondary sort.</verify>
  <done>Same-timestamp events from the same scope stay grouped together. Private events appear before group events within the same timestamp. No arbitrary interleaving of scopes.</done>
</task>

</tasks>

<verification>
- In LogWindow.vue, `logGroup` style entry appears on line BEFORE all `logDamage`/`logHeal`/`logReward` entries
- In useEvents.ts, sort comparator uses scope-based secondary sort before id tiebreaker
- No TypeScript compilation errors: `npx vue-tsc --noEmit` passes
</verification>

<success_criteria>
Group combat damage messages display in red (not blue), group heal messages in green, group reward messages in gold. Same-timestamp events from the same scope stay grouped together in the log instead of interleaving with other scopes. No compilation errors.
</success_criteria>

<output>
After completion, create `.planning/quick/40-fix-log-message-sorting-and-coloring-in-/40-SUMMARY.md`
</output>
