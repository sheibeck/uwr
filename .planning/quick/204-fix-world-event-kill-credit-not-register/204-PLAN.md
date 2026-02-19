---
quick: 204
type: execute
autonomous: true
files_modified:
  - spacetimedb/src/reducers/combat.ts
---

<objective>
Fix world event kill credit not registering for The Hollowmere Infestation Bog Rat kills.

Purpose: The current kill credit check follows an `EventSpawnEnemy -> EnemySpawn` chain that breaks in
three ways: (1) strict per-location filter that rejects valid kills, (2) stale spawnId references after
EnemySpawn rows are deleted on first kill, (3) Hollowmere's safe-town flag prevents enemy respawn so the
EnemySpawn row never returns. Replace the chain with a direct lookup against WORLD_EVENT_DEFINITIONS so
kill credit is based on enemy template identity, not spawn row state.

Output: Modified combat.ts with definition-based kill credit check and correct import.
</objective>

<context>
@spacetimedb/src/reducers/combat.ts
@spacetimedb/src/data/world_event_data.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace EventSpawnEnemy-based kill credit with definition-based check in combat.ts</name>
  <files>spacetimedb/src/reducers/combat.ts</files>
  <action>
Two edits to this file.

**Edit 1 — Add import (after existing imports, around line 11):**

Add the following import line after the existing `incrementWorldStat` import:

```typescript
import { WORLD_EVENT_DEFINITIONS } from '../data/world_event_data';
```

**Edit 2 — Replace kill credit check (lines 2036-2045):**

Remove the existing block:
```typescript
                // Check if this event has enemies of the killed template at this location
                let matchesEvent = false;
                for (const ese of ctx.db.eventSpawnEnemy.by_event.filter(activeEvent.id)) {
                  if (ese.locationId !== freshChar.locationId) continue;
                  const eventSpawn = ctx.db.enemySpawn.id.find(ese.spawnId);
                  if (eventSpawn && eventSpawn.enemyTemplateId === killedTemplateId) {
                    matchesEvent = true;
                    break;
                  }
                }
```

Replace with:
```typescript
                // Check if this event's definition includes the killed enemy template.
                // Do NOT use the EventSpawnEnemy -> EnemySpawn chain: EnemySpawn rows are
                // deleted on kill and safe-town locations block respawn, so that chain goes
                // stale permanently after the first kill (see quick-204).
                let matchesEvent = false;
                const eventDef = WORLD_EVENT_DEFINITIONS[activeEvent.eventKey];
                if (eventDef) {
                  const eventTemplateIds = new Set<bigint>();
                  for (const cl of eventDef.contentLocations) {
                    for (const e of cl.enemies) {
                      for (const tmpl of ctx.db.enemyTemplate.iter()) {
                        if (tmpl.name === e.enemyTemplateKey) {
                          eventTemplateIds.add(tmpl.id);
                          break;
                        }
                      }
                    }
                  }
                  matchesEvent = eventTemplateIds.has(killedTemplateId);
                }
```

Leave everything from line 2046 onward (`if (!matchesEvent) continue;` and the contribution/objective
update logic) completely unchanged. The region filter on line 2035
(`if (activeEvent.regionId !== charLoc.regionId) continue;`) is correct and must be kept as-is.
  </action>
  <verify>
Republish the module:
```
spacetime publish uwr --project-path spacetimedb
```
Confirm publish succeeds with no TypeScript compile errors. If there are errors, check that
`WORLD_EVENT_DEFINITIONS` is a named export in `world_event_data.ts` and that the import path
`'../data/world_event_data'` resolves correctly from `reducers/combat.ts`.

Then do a manual functional test:
1. Start or trigger a Hollowmere Infestation world event (via admin reducer or game flow).
2. Log in as a character in Hollowmere.
3. Kill one or more Bog Rats.
4. Query `eventContribution` and `eventObjective` tables and confirm `count` / `currentCount`
   increments with each kill.
5. Kill all five initial Bog Rats (exhausting the spawns) and kill a sixth time if any respawn — confirm
   kill credit still increments even though EnemySpawn rows have been deleted.
  </verify>
  <done>
- `spacetime publish` completes without errors.
- Killing Bog Rats in an active Hollowmere Infestation event increments `eventContribution.count` and
  `eventObjective.currentCount` for the killing character.
- Kill credit continues to register after all initial spawn rows have been deleted (no more stale-row
  regression).
- Events whose `eventKey` is absent from `WORLD_EVENT_DEFINITIONS` remain unaffected (`matchesEvent`
  stays false, no contribution awarded — safe fallback preserved).
  </done>
</task>

</tasks>

<verification>
After publishing:
- `spacetime logs uwr` shows no runtime panics on enemy death.
- `eventObjective.currentCount` for a Hollowmere Infestation kill_count objective increments correctly.
- Other active events in other regions are not affected.
</verification>

<success_criteria>
Bog Rat kills during an active Hollowmere Infestation event register kill credit reliably, including
after the initial EnemySpawn rows have been deleted, because credit is now derived from the static
event definition rather than mutable spawn-table state.
</success_criteria>
