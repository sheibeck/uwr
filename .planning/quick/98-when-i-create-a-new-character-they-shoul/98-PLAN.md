---
phase: quick-98
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/reducers/characters.ts
autonomous: true
must_haves:
  truths:
    - "New characters start in Hollowmere, not Ashen Road or any other bindStone location"
    - "Existing character creation flow (name, race, class) works identically"
  artifacts:
    - path: "spacetimedb/src/reducers/characters.ts"
      provides: "Deterministic starting location for new characters"
      contains: "world.startingLocationId"
  key_links:
    - from: "spacetimedb/src/reducers/characters.ts"
      to: "spacetimedb/src/seeding/ensure_world.ts"
      via: "worldState.startingLocationId set to Hollowmere town.id"
      pattern: "startingLocationId"
---

<objective>
Fix new character starting location to always be Hollowmere.

Purpose: Currently, `create_character` uses `[...ctx.db.location.iter()].find(loc => loc.bindStone)` which picks whichever bindStone location the iterator returns first. Since SpacetimeDB auto-increment IDs are non-sequential, this is nondeterministic and characters may end up at Slagstone Waystation or Gloomspire Landing instead of Hollowmere. The `worldState.startingLocationId` already points to Hollowmere (set in ensure_world.ts line 652) and should be used directly.

Output: Characters reliably start in Hollowmere.
</objective>

<context>
@spacetimedb/src/reducers/characters.ts
@spacetimedb/src/seeding/ensure_world.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Use startingLocationId instead of bindStone scan for new character placement</name>
  <files>spacetimedb/src/reducers/characters.ts</files>
  <action>
In the `create_character` reducer (around lines 125-130), replace the current bindLocation logic:

```typescript
const bindLocation =
  [...ctx.db.location.iter()].find((location) => location.bindStone) ??
  ctx.db.location.id.find(world.startingLocationId);
if (!bindLocation) throw new SenderError('Bind location not initialized');
```

With a direct lookup using startingLocationId:

```typescript
const startingLocation = ctx.db.location.id.find(world.startingLocationId);
if (!startingLocation) throw new SenderError('Starting location not initialized');
```

Then update the two references to `bindLocation` below (around lines 153-154) to use `startingLocation`:

```typescript
locationId: startingLocation.id,
boundLocationId: startingLocation.id,
```

This ensures new characters always start at Hollowmere (the location set as startingLocationId in ensure_world.ts), regardless of iterator ordering. The bindStone scan was unreliable with 3 bindStone locations in the world.
  </action>
  <verify>
Run `grep -n "startingLocation" spacetimedb/src/reducers/characters.ts` to confirm the variable is used. Run `grep -n "bindLocation" spacetimedb/src/reducers/characters.ts` to confirm no references remain. Verify the file has no syntax errors by checking TypeScript compilation or at least consistent brace matching.
  </verify>
  <done>
The create_character reducer uses world.startingLocationId directly. No bindStone iterator scan remains in character creation. New characters will deterministically start at Hollowmere.
  </done>
</task>

</tasks>

<verification>
- Grep for "bindLocation" in characters.ts returns no results
- Grep for "startingLocation" in create_character section shows the new pattern
- The worldState.startingLocationId is set to Hollowmere's ID in ensure_world.ts (line 652) -- no change needed there
</verification>

<success_criteria>
New characters are placed at the location specified by worldState.startingLocationId (Hollowmere) instead of a nondeterministic bindStone scan.
</success_criteria>

<output>
After completion, create `.planning/quick/98-when-i-create-a-new-character-they-shoul/98-SUMMARY.md`
</output>
