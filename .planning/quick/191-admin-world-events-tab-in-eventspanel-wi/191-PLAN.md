---
phase: quick-191
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/data/worldEventDefs.ts
  - src/components/WorldEventPanel.vue
  - src/App.vue
autonomous: true
requirements: [QUICK-191]
must_haves:
  truths:
    - "Admin tab is only visible when the current identity matches the admin hex"
    - "Admin tab lists all 3 event definitions with name, region, recurring status, and a Start Event button"
    - "Clicking Start Event calls fireWorldEvent reducer with the correct eventKey"
    - "Admin tab shows currently active events with an End Event button"
    - "Clicking End Event calls resolveWorldEvent with outcome='failure'"
  artifacts:
    - path: "src/data/worldEventDefs.ts"
      provides: "Client-side event definition metadata (keys, names, regionKey, isRecurring)"
    - path: "src/components/WorldEventPanel.vue"
      provides: "Admin tab in existing tab bar"
    - path: "src/App.vue"
      provides: "isAdmin prop wired to WorldEventPanel"
  key_links:
    - from: "WorldEventPanel.vue Admin tab"
      to: "conn.reducers.fireWorldEvent"
      via: "window.__db_conn.reducers.fireWorldEvent({ eventKey })"
    - from: "WorldEventPanel.vue End Event button"
      to: "conn.reducers.resolveWorldEvent"
      via: "window.__db_conn.reducers.resolveWorldEvent({ worldEventId, outcome: 'failure' })"
---

<objective>
Add an admin-only "Admin" tab to WorldEventPanel that lets the admin start and end world events from the UI.

Purpose: Admin needs to be able to fire and resolve world events without using CLI commands.
Output: Third tab in WorldEventPanel visible only to the admin identity, showing all event definitions with Start buttons and all active events with End buttons.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@spacetimedb/src/data/world_event_data.ts
@spacetimedb/src/data/admin.ts
@spacetimedb/src/reducers/world_events.ts
@src/components/WorldEventPanel.vue
@src/App.vue
@src/main.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create worldEventDefs.ts and add isAdmin prop to WorldEventPanel</name>
  <files>src/data/worldEventDefs.ts</files>
  <action>
Create `src/data/worldEventDefs.ts` with client-facing event definition metadata extracted from `spacetimedb/src/data/world_event_data.ts`. No server imports — pure data constants only.

```typescript
// Client-side event definition metadata
// Keys must match WORLD_EVENT_DEFINITIONS keys in spacetimedb/src/data/world_event_data.ts
export type ClientEventDef = {
  key: string;
  name: string;
  regionKey: string;
  isRecurring: boolean;
};

export const ADMIN_IDENTITY_HEX = 'c20006ce5893a0e7f3531d8cfc2bd561f78b60d08eb5137cc2ae3ca4ec060b80';

export const CLIENT_EVENT_DEFS: ClientEventDef[] = [
  {
    key: 'ashen_awakening',
    name: 'The Ashen Awakening',
    regionKey: 'Embermarch Depths',
    isRecurring: false,
  },
  {
    key: 'hollowmere_siege',
    name: 'The Hollowmere Siege',
    regionKey: 'Hollowmere Vale',
    isRecurring: false,
  },
  {
    key: 'hollowmere_rat_infestation',
    name: 'The Hollowmere Infestation',
    regionKey: 'Hollowmere Vale',
    isRecurring: true,
  },
];
```

This is the minimal client-side slice needed — event keys for reducer calls, plus display metadata. No logic duplication.
  </action>
  <verify>File exists and exports ADMIN_IDENTITY_HEX and CLIENT_EVENT_DEFS</verify>
  <done>src/data/worldEventDefs.ts exists with the 3 event defs and admin hex constant</done>
</task>

<task type="auto">
  <name>Task 2: Add Admin tab to WorldEventPanel and wire isAdmin prop in App.vue</name>
  <files>src/components/WorldEventPanel.vue, src/App.vue</files>
  <action>
**WorldEventPanel.vue changes:**

1. Add `isAdmin: boolean` to the `defineProps` interface.

2. Update `activeTab` type and tab bar to include `'admin'`:
   - Change `ref<'active' | 'history'>('active')` to `ref<'active' | 'history' | 'admin'>('active')`
   - Add Admin tab button in the tab bar (after History), conditionally rendered with `v-if="isAdmin"`:
     ```html
     <button v-if="isAdmin" type="button" @click="activeTab = 'admin'" :style="tabStyle('admin')">Admin</button>
     ```
   - Update `tabStyle` to accept `'active' | 'history' | 'admin'` parameter type.

3. Add Admin tab content block (`v-else-if="activeTab === 'admin'"`) after the History tab block:

```html
<!-- Admin Tab -->
<div v-else-if="activeTab === 'admin'">
  <!-- Event Definitions — Start Event -->
  <div :style="{ fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b', marginBottom: '8px' }">Event Definitions</div>
  <div :style="{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }">
    <div
      v-for="def in CLIENT_EVENT_DEFS"
      :key="def.key"
      :style="styles.resultCard"
    >
      <div :style="{ fontWeight: 600 }">{{ def.name }}</div>
      <div :style="styles.subtleSmall">Region: {{ def.regionKey }} &middot; {{ def.isRecurring ? 'Recurring' : 'One-time' }}</div>
      <button
        type="button"
        :style="{ ...styles.actionButton, marginTop: '4px', fontSize: '0.78rem', padding: '3px 10px' }"
        :disabled="isEventActive(def.key)"
        @click="startEvent(def.key)"
      >
        {{ isEventActive(def.key) ? 'Already Active' : 'Start Event' }}
      </button>
    </div>
  </div>

  <!-- Active Events — End Event -->
  <div :style="{ fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b', marginBottom: '8px' }">Active Events</div>
  <div v-if="activeEvents.length === 0" :style="styles.subtle">No active events.</div>
  <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '8px' }">
    <div
      v-for="event in activeEvents"
      :key="event.id.toString()"
      :style="styles.resultCard"
    >
      <div :style="{ fontWeight: 600 }">{{ event.name }}</div>
      <div :style="styles.subtleSmall">ID: {{ event.id.toString() }}</div>
      <button
        type="button"
        :style="{ ...styles.actionButton, marginTop: '4px', fontSize: '0.78rem', padding: '3px 10px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)' }"
        @click="endEvent(event.id)"
      >
        End Event (Failure)
      </button>
    </div>
  </div>
</div>
```

4. Add imports and methods to the `<script setup>` section:

```typescript
import { CLIENT_EVENT_DEFS } from '../data/worldEventDefs';

// Check if an event is currently active by matching the event name to def name
// (WorldEvent rows store name from eventDef.name at fire time)
const isEventActive = (eventKey: string): boolean => {
  const def = CLIENT_EVENT_DEFS.find(d => d.key === eventKey);
  if (!def) return false;
  return activeEvents.value.some((e: any) => e.name === def.name);
};

const startEvent = (eventKey: string) => {
  const db = window.__db_conn;
  if (!db) return;
  db.reducers.fireWorldEvent({ eventKey });
};

const endEvent = (worldEventId: bigint) => {
  const db = window.__db_conn;
  if (!db) return;
  db.reducers.resolveWorldEvent({ worldEventId, outcome: 'failure' });
};
```

**App.vue changes:**

1. Import `ADMIN_IDENTITY_HEX` at the top of the script section:
```typescript
import { ADMIN_IDENTITY_HEX } from './data/worldEventDefs';
```

2. Add `isAdmin` computed near `usePlayer` usage (after line 673):
```typescript
const isAdmin = computed(() => {
  const identity = window.__my_identity;
  return identity?.toHexString() === ADMIN_IDENTITY_HEX;
});
```

3. Pass `isAdmin` prop to `WorldEventPanel` in the template (around line 207-214):
```html
<WorldEventPanel
  :styles="styles"
  :world-event-rows="worldEventRows"
  :event-contributions="eventContributions"
  :event-objectives="eventObjectives"
  :regions="regions"
  :selected-character="selectedCharacter"
  :is-admin="isAdmin"
/>
```
  </action>
  <verify>
1. Open the game in browser as admin (identity matching ADMIN_IDENTITY_HEX)
2. Open World Events panel — should see 3 tabs: Active, History, Admin
3. Admin tab shows all 3 event definitions with Start Event buttons
4. Non-admin identity should NOT see Admin tab
  </verify>
  <done>
- Admin tab appears in WorldEventPanel only when isAdmin is true
- Start Event buttons call fireWorldEvent reducer with correct eventKey
- End Event buttons call resolveWorldEvent with outcome='failure'
- Already-active events show disabled "Already Active" button
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors (`npm run build` or check Vite dev server)
2. Admin tab only visible when `window.__my_identity?.toHexString() === ADMIN_IDENTITY_HEX`
3. Start Event fires `fire_world_event` reducer (check spacetime logs for "Event fired")
4. End Event fires `resolve_world_event` reducer with failure outcome
5. Active Events section correctly shows currently active events with End Event buttons
</verification>

<success_criteria>
Admin can open WorldEventPanel, switch to Admin tab, start any defined world event by clicking Start Event, and end any active event by clicking End Event (with failure outcome).
</success_criteria>

<output>
After completion, create `.planning/quick/191-admin-world-events-tab-in-eventspanel-wi/191-SUMMARY.md`
</output>
