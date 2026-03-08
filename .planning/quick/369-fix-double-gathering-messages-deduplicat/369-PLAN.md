---
phase: quick-369
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/App.vue]
autonomous: true
requirements: [QUICK-369]
must_haves:
  truths:
    - "Gathering start shows exactly one message"
    - "Gathering completion shows exactly one message with quantity"
  artifacts:
    - path: "src/App.vue"
      provides: "Gathering flow without duplicate local events"
  key_links:
    - from: "server items_gathering.ts"
      to: "client event subscription"
      via: "logPrivateAndGroup creates events client receives"
      pattern: "logPrivateAndGroup"
---

<objective>
Remove duplicate client-side gathering messages. The server already sends proper gathering events via logPrivateAndGroup (with quantity and perk bonus info). The client-side addLocalEvent calls from quick-367 duplicate these, causing players to see two start messages and two completion messages.

Purpose: Fix double gathering messages so players see exactly one start and one completion message.
Output: Clean App.vue without duplicate gathering event injection.
</objective>

<context>
@src/App.vue
@spacetimedb/src/reducers/items_gathering.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove duplicate client-side gathering events</name>
  <files>src/App.vue</files>
  <action>
  Remove the three client-side addLocalEvent calls that duplicate server gathering messages:

  1. In the keyword handler (~line 1689), remove:
     `addLocalEvent('system', 'You begin gathering ${resourceName}...', 'private');`
     Keep the startGatherReducer call and localGather state assignment (needed for progress bar).

  2. In the startGather function (~line 2287), remove:
     `addLocalEvent('system', 'You begin gathering ${nodeName}...', 'private');`
     Keep the localGather assignment and startGatherReducer call.

  3. In the gather completion watcher (~line 2736), remove:
     `addLocalEvent('reward', 'You gathered ${nodeName}.', 'private');`
     Keep the `localGather.value = null` cleanup (progress bar needs this).

  The server messages are superior because they include quantity (x1, x2, etc.) and perk bonus text. The client messages are redundant approximations added in quick-367 for the gathering timer bar feature.
  </action>
  <verify>
    <automated>grep -n "begin gathering\|You gathered" src/App.vue</automated>
  </verify>
  <done>grep returns zero matches for addLocalEvent gathering messages in App.vue. Server-side messages in items_gathering.ts remain unchanged. Only one start message and one completion message appear during gathering.</done>
</task>

</tasks>

<verification>
- grep for "begin gathering" and "You gathered" in App.vue returns no addLocalEvent lines
- Server items_gathering.ts still has its logPrivateAndGroup calls (lines 122-128 and 194-199)
- Gathering progress bar still works (localGather state unchanged)
</verification>

<success_criteria>
Player sees exactly one "You begin gathering X." message (from server) and exactly one "You gather X x1." message (from server) when gathering resources. No duplicate messages.
</success_criteria>

<output>
After completion, create `.planning/quick/369-fix-double-gathering-messages-deduplicat/369-SUMMARY.md`
</output>
