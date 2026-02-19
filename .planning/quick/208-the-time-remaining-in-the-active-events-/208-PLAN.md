---
phase: quick-208
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/App.vue
  - src/components/WorldEventPanel.vue
autonomous: true
requirements: [QUICK-208]
must_haves:
  truths:
    - "Time remaining on active world events counts down every second without requiring a data change"
  artifacts:
    - path: "src/components/WorldEventPanel.vue"
      provides: "nowMicros prop consumed by timeRemaining()"
    - path: "src/App.vue"
      provides: "nowMicros passed to WorldEventPanel"
  key_links:
    - from: "src/App.vue setInterval (line 2006)"
      to: "WorldEventPanel.timeRemaining()"
      via: "nowMicros prop"
      pattern: "now-micros.*nowMicros"
---

<objective>
Fix the time remaining countdown in the active world events panel so it updates every second continuously.

Purpose: Currently `timeRemaining()` calls `Date.now()` inside a plain function. Vue only re-evaluates it when reactive data changes (e.g., when event rows update), so the display freezes between data changes. App.vue already has a `nowMicros` ref updated every 100ms by a `setInterval` (line 2006). Passing it as a prop triggers continuous re-renders.

Output: WorldEventPanel receives `nowMicros` prop and uses it instead of `Date.now()`.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@src/App.vue
@src/components/WorldEventPanel.vue
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pass nowMicros prop to WorldEventPanel and use it in timeRemaining</name>
  <files>src/App.vue, src/components/WorldEventPanel.vue</files>
  <action>
**In `src/App.vue`** — add `:now-micros="nowMicros"` to the WorldEventPanel component usage (around line 207-215):

```html
<WorldEventPanel
  :styles="styles"
  :world-event-rows="worldEventRows"
  :event-contributions="eventContributions"
  :event-objectives="eventObjectives"
  :regions="regions"
  :selected-character="selectedCharacter"
  :is-admin="isAdmin"
  :now-micros="nowMicros"
/>
```

**In `src/components/WorldEventPanel.vue`** — two changes:

1. Add `nowMicros` to the props definition (it's a `number`, same as how GroupPanel and others receive it):

```typescript
const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  worldEventRows: any[];
  eventContributions: any[];
  eventObjectives: any[];
  regions: RegionRow[];
  selectedCharacter: CharacterRow | null;
  isAdmin: boolean;
  nowMicros: number;
}>();
```

2. Update the `timeRemaining` function to use `props.nowMicros` instead of `Date.now()`:

```typescript
const timeRemaining = (event: any): string => {
  if (!event.deadlineAtMicros) return '';
  const nowMicros = props.nowMicros;
  const deadlineMicros = Number(BigInt(event.deadlineAtMicros));
  if (nowMicros >= deadlineMicros) return 'Expired';
  const remainMicros = deadlineMicros - nowMicros;
  const remainSec = Math.floor(remainMicros / 1_000_000);
  const m = Math.floor(remainSec / 60);
  const s = remainSec % 60;
  return `${m}m ${s}s`;
};
```

Note: `props.nowMicros` is already in microseconds (set as `Date.now() * 1000 + serverClockOffset` in App.vue), so the arithmetic matches the original intent. The BigInt conversion for deadlineMicros is needed since the DB value arrives as bigint.
  </action>
  <verify>Open the WorldEventPanel with an active timed event. The "Time remaining" line should tick down every second smoothly without any event data needing to change.</verify>
  <done>Time remaining countdown decrements every second continuously while an event is active.</done>
</task>

</tasks>

<verification>
- WorldEventPanel accepts `nowMicros: number` prop
- App.vue passes `:now-micros="nowMicros"` to WorldEventPanel
- `timeRemaining()` uses `props.nowMicros` (microseconds) against `event.deadlineAtMicros` (bigint, microseconds)
- No TypeScript errors from `vue-tsc` or dev server
</verification>

<success_criteria>
Active world events with a deadline show a countdown that updates every second without requiring any server data change.
</success_criteria>

<output>
After completion, create `.planning/quick/208-the-time-remaining-in-the-active-events-/208-SUMMARY.md`
</output>
