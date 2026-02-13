---
phase: quick-55
plan: 55
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/composables/useHotbar.ts
  - src/composables/useCombat.ts
autonomous: true
must_haves:
  truths:
    - "Cooldown timers count down in production (maincloud) just as they do in development"
    - "Enemy pull bars display and animate in production just as they do in development"
    - "All existing functionality (resource gather bars, cast bars, effect timers) continues to work"
  artifacts:
    - path: "src/App.vue"
      provides: "Server clock offset calculation and server-relative nowMicros"
      contains: "serverClockOffset"
  key_links:
    - from: "src/App.vue"
      to: "src/composables/useHotbar.ts"
      via: "nowMicros ref (now server-relative)"
      pattern: "nowMicros"
    - from: "src/App.vue"
      to: "src/composables/useCombat.ts"
      via: "nowMicros ref (now server-relative)"
      pattern: "nowMicros"
---

<objective>
Fix two production-only bugs where cooldown timers freeze and enemy pull bars don't display.

Purpose: Both bugs are caused by server/client clock skew. In development (localhost), server and client clocks are identical so `Date.now() * 1000` matches server timestamps. In production (maincloud), the server clock differs from the client clock, causing comparisons between server timestamps (readyAtMicros, pull.createdAt) and client time (nowMicros) to produce wrong results -- cooldowns appear frozen (huge remaining time) and pull progress computes negative values (bar hidden).

Output: A server clock offset mechanism that makes nowMicros represent estimated server time, fixing all server-timestamp comparisons in one shot.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/App.vue
@src/composables/useHotbar.ts
@src/composables/useCombat.ts
@src/ui/effectTimers.ts
@src/composables/useGameData.ts
@src/composables/usePlayer.ts
@src/main.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add server clock offset and make nowMicros server-relative</name>
  <files>src/App.vue</files>
  <action>
The root cause: `nowMicros` is set to `Date.now() * 1000` (client time) but compared against server timestamps (`readyAtMicros`, `pull.createdAt.microsSinceUnixEpoch`, `endsAtMicros`). In production, server and client clocks differ.

Fix by computing a server clock offset from the Player table's `lastSeenAt` timestamp (which is updated on every connect/action and is always a server-side `ctx.timestamp`).

1. In App.vue, after the existing `const nowMicros = ref(Date.now() * 1000);` line (~line 568), add a `serverClockOffset` ref initialized to 0:

```typescript
const serverClockOffset = ref(0);
```

2. Add a watcher on `player` (from usePlayer) that computes the offset when a server timestamp becomes available. Use `player.lastSeenAt` -- it is updated by the server on every connect via `clientConnected`:

```typescript
watch(
  () => player.value?.lastSeenAt,
  (lastSeenAt) => {
    if (!lastSeenAt || !('microsSinceUnixEpoch' in lastSeenAt)) return;
    const serverMicros = Number(lastSeenAt.microsSinceUnixEpoch);
    const clientMicros = Date.now() * 1000;
    // Only update if the timestamp is recent (within last 30 seconds) to avoid stale data
    const age = Math.abs(clientMicros - serverMicros);
    if (age < 30_000_000) {
      serverClockOffset.value = serverMicros - clientMicros;
    }
  },
  { immediate: true }
);
```

3. Update the `setInterval` in `onMounted` (~line 1556-1558) to apply the offset:

Change from:
```typescript
nowMicros.value = Date.now() * 1000;
```

To:
```typescript
nowMicros.value = Date.now() * 1000 + serverClockOffset.value;
```

4. Also update the initial value of nowMicros at line 568. Change from:
```typescript
const nowMicros = ref(Date.now() * 1000);
```
To:
```typescript
const nowMicros = ref(Date.now() * 1000);
```
(The initial value stays as client time since the offset isn't known yet -- the watcher will correct it once player data arrives.)

This single change makes `nowMicros` represent estimated server time, which fixes ALL comparisons with server timestamps throughout the app -- cooldown remaining, pull progress, cast progress, effect timers, day/night cycle, etc.

Important: Local predictions (localCast, localGather, localCooldowns) store `nowMicros.value` at creation time, so they automatically use server-relative time too, keeping everything consistent.

Also important: The `effectTimers.ts` `seenAtMicros` stores `nowMicros` values, so these remain consistent since both read and write use the same (now server-relative) `nowMicros`.

Note: The 30-second age check prevents using a stale `lastSeenAt` from a previous session. On connect, `lastSeenAt` is updated immediately by the server's `clientConnected` handler, so the watcher will fire with a fresh timestamp.

The files_modified list includes useHotbar.ts and useCombat.ts because they are AFFECTED by the change (they consume nowMicros), but NO code changes are needed in those files -- they automatically benefit from nowMicros now being server-relative.
  </action>
  <verify>
1. Run `npm run build` (or `vue-tsc -b && vite build`) to confirm no TypeScript errors
2. Verify the code compiles and the serverClockOffset is computed from player.lastSeenAt
3. Verify nowMicros uses the offset in the setInterval
  </verify>
  <done>
- serverClockOffset ref exists and is computed from player.lastSeenAt
- nowMicros tick applies the offset: `Date.now() * 1000 + serverClockOffset.value`
- Build passes with no errors
- All existing timer/progress functionality preserved (local predictions still use nowMicros consistently)
  </done>
</task>

</tasks>

<verification>
- `npm run build` passes (TypeScript + Vite build)
- Code review confirms: nowMicros now represents estimated server time
- All comparisons with server timestamps (readyAtMicros, pull.createdAt, endsAtMicros) now use same time domain
- Local predictions (localCast, localGather, localCooldowns) remain consistent because they read/write nowMicros.value
</verification>

<success_criteria>
- Cooldown timers will count down correctly in production because `readyAtMicros - nowMicros` now computes correctly (both in server time domain)
- Enemy pull bars will display and animate correctly because `nowMicros - pullStartMicros` now computes correctly (both in server time domain)
- No regression in development (offset will be ~0 on localhost)
- No regression in resource gather bars, cast bars, effect timers, day/night cycle
</success_criteria>

<output>
After completion, create `.planning/quick/55-fix-production-bugs-cooldown-timers-not-/55-PLAN.md`
</output>
