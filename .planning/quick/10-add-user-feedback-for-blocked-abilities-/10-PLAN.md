---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/composables/useEvents.ts
  - src/composables/useHotbar.ts
  - src/components/LogWindow.vue
  - src/ui/styles.ts
  - src/App.vue
autonomous: true

must_haves:
  truths:
    - "Clicking a combat-only ability while out of combat shows a message in the log explaining why it was blocked"
    - "Clicking an out-of-combat-only ability while in combat shows a message in the log explaining why it was blocked"
    - "Blocked ability messages are visually distinct from other log messages (muted/warning color)"
    - "No false cooldowns are triggered when abilities are blocked (existing behavior preserved)"
  artifacts:
    - path: "src/composables/useEvents.ts"
      provides: "addLocalEvent function for client-side log messages"
      exports: ["addLocalEvent", "combinedEvents"]
    - path: "src/composables/useHotbar.ts"
      provides: "Log messages when combat state blocks ability use"
    - path: "src/ui/styles.ts"
      provides: "logBlocked style for blocked ability messages"
      contains: "logBlocked"
    - path: "src/components/LogWindow.vue"
      provides: "Rendering for blocked kind events"
      contains: "blocked"
  key_links:
    - from: "src/composables/useHotbar.ts"
      to: "src/composables/useEvents.ts"
      via: "addLocalEvent callback"
      pattern: "addLocalEvent"
    - from: "src/components/LogWindow.vue"
      to: "src/ui/styles.ts"
      via: "logBlocked style application"
      pattern: "logBlocked"
---

<objective>
Add user-facing feedback when abilities are blocked by combat state restrictions.

Purpose: Quick task 6 added silent combat state guards that prevent abilities from firing when the combat state does not match (e.g., pet summons out of combat, Nature's Mark in combat). This prevents false cooldowns but gives zero feedback to the user — clicking the button simply does nothing. Users need a log message explaining WHY the ability did not fire.

Output: Log messages appear in the game log window when a blocked ability is clicked, using a distinct muted/warning color.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/composables/useHotbar.ts
@src/composables/useEvents.ts
@src/components/LogWindow.vue
@src/ui/styles.ts
@src/App.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add client-side local event injection to useEvents and wire blocked ability feedback</name>
  <files>
    src/composables/useEvents.ts
    src/composables/useHotbar.ts
    src/ui/styles.ts
    src/components/LogWindow.vue
    src/App.vue
  </files>
  <action>
**1. Add local event support to `src/composables/useEvents.ts`:**

Add a `localEvents` ref (array of `EventItem[]`) and an `addLocalEvent(kind: string, message: string)` function. Local events get:
- `id`: use a simple incrementing bigint counter starting at `9000000000n` (well above any server ID range)
- `createdAt`: `{ microsSinceUnixEpoch: BigInt(Date.now() * 1000) }`
- `scope`: `'client'` (distinguishes from server events)
- `kind`: passed parameter (will be `'blocked'` for this feature)
- `message`: passed parameter

Merge `localEvents` into the existing `combinedEvents` computed alongside world/location/private/group events. Local events skip the `isInSession` filter (they are always current session). The sort already handles interleaving by timestamp.

Add `localEvents` to a watch that trims entries older than 2 minutes (120_000_000 microseconds) to prevent unbounded growth, checked whenever `localEvents` changes.

Export `addLocalEvent` from the composable return alongside `combinedEvents`.

**2. Update `src/composables/useHotbar.ts`:**

Add an `addLocalEvent` callback parameter to `UseHotbarArgs`:
```typescript
addLocalEvent?: (kind: string, message: string) => void;
```

In `onHotbarClick`, before each silent `return` on lines 281-282, call `addLocalEvent` with a descriptive message:

- For `combatState === 'combat_only' && !activeCombat.value`:
  ```
  addLocalEvent?.('blocked', `${ability?.name ?? slot.name} can only be used in combat.`);
  ```

- For `combatState === 'out_of_combat_only' && activeCombat.value`:
  ```
  addLocalEvent?.('blocked', `${ability?.name ?? slot.name} cannot be used during combat.`);
  ```

Also add a message for the existing `canActInCombat` guard (line 277):
  ```
  addLocalEvent?.('blocked', `Cannot act yet — waiting for combat turn.`);
  ```

**3. Add `logBlocked` style to `src/ui/styles.ts`:**

Add after the existing `logFaction` style:
```typescript
logBlocked: {
  color: '#e07a5f',
},
```
This is a muted terracotta/warning color that stands out from normal log text but is not as aggressive as bright red.

**4. Update `src/components/LogWindow.vue`:**

In the style binding array for the message span (around line 20-30), add:
```
event.kind === 'blocked' ? styles.logBlocked : {},
```

Also add handling for `scope === 'client'` in the kind display span (line 17). Change the kind display logic:
- If `event.scope === 'group'` show `[Group]`
- If `event.scope === 'client'` show nothing (empty string) — client messages are self-explanatory and don't need a scope prefix
- Otherwise show existing `[${event.scope} ${event.kind}]`

**5. Wire `addLocalEvent` in `src/App.vue`:**

In the `useEvents` destructuring (~line 759), also extract `addLocalEvent`:
```typescript
const { combinedEvents, addLocalEvent } = useEvents({...});
```

In the `useHotbar` call (~line 1425), pass `addLocalEvent`:
```typescript
} = useHotbar({
  ...existing args...,
  addLocalEvent,
});
```
  </action>
  <verify>
    1. `npx vue-tsc --noEmit` passes with no type errors
    2. `npx vite build` succeeds
    3. Manual test: In game, with a character out of combat, click a combat-only ability (e.g., a pet summon) on the hotbar — a terracotta-colored message should appear in the log saying "[ability name] can only be used in combat."
    4. Manual test: In game, while in combat, click Nature's Mark — a message should appear saying "Nature's Mark cannot be used during combat."
    5. No cooldown animation appears when the ability is blocked (existing behavior preserved)
  </verify>
  <done>
    - Clicking a combat-only ability out of combat shows "[name] can only be used in combat." in the log with terracotta color
    - Clicking an out-of-combat-only ability in combat shows "[name] cannot be used during combat." in the log with terracotta color
    - Clicking any ability while waiting for combat turn shows "Cannot act yet - waiting for combat turn." in the log
    - No false cooldowns triggered on blocked abilities
    - Client-side local events infrastructure available for future use
  </done>
</task>

</tasks>

<verification>
1. Type check: `npx vue-tsc --noEmit` passes
2. Build: `npx vite build` succeeds
3. No regressions: abilities that should work still work (no accidental blocking)
4. Blocked abilities produce visible, distinctly-colored log messages
</verification>

<success_criteria>
- All three combat state block scenarios (combat-only out of combat, out-of-combat-only in combat, can't act yet) produce descriptive log messages
- Messages use a distinct color that is visually differentiable from normal log text
- No cooldown is triggered on blocked abilities
- Local events infrastructure is reusable for future client-side messages
</success_criteria>

<output>
After completion, create `.planning/quick/10-add-user-feedback-for-blocked-abilities-/10-SUMMARY.md`
</output>
