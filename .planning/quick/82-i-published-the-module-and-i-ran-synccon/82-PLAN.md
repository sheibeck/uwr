---
phase: quick-82
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - spacetimedb/src/index.ts
autonomous: true
must_haves:
  truths:
    - "After publishing and running /synccontent, all 30 locations appear in the database"
    - "The init reducer seeds all 30 locations on fresh publish"
    - "The /synccontent command seeds all 30 locations on existing database"
  artifacts:
    - path: "spacetimedb/src/index.ts"
      provides: "Updated ensureWorldLayout matching ensure_world.ts (30 locations)"
  key_links:
    - from: "spacetimedb/src/index.ts (local ensureWorldLayout)"
      to: "spacetimedb/src/seeding/ensure_world.ts (canonical ensureWorldLayout)"
      via: "Must be kept in sync OR index.ts should import from ensure_world.ts"
      pattern: "upsertLocationByName.*30 calls"
---

<objective>
Fix missing location records after module publish and /synccontent.

Purpose: The init reducer and /synccontent command both call the LOCAL ensureWorldLayout function defined in index.ts (line 5550), which still has only 9 locations. Quick-81 updated the REFACTORED copy in seeding/ensure_world.ts to 30 locations, but the monolithic index.ts was not updated. The local function takes precedence since init calls it directly.

Root cause: index.ts has its own local copies of syncAllContent and ensureWorldLayout (defined at lines 5259 and 5550). The refactored versions in seeding/ensure_content.ts and seeding/ensure_world.ts have the 30-location data. The init reducer (line 6592) and the reducerDeps object (line 6772-6775) both reference the stale local versions.

Output: Updated index.ts so ensureWorldLayout contains all 30 locations and connections.
</objective>

<execution_context>
@C:/Users/Dell/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Dell/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@spacetimedb/src/index.ts (lines 5550-5617 contain stale ensureWorldLayout with 9 locations)
@spacetimedb/src/seeding/ensure_world.ts (lines 199-682 contain canonical ensureWorldLayout with 30 locations)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Sync index.ts ensureWorldLayout with ensure_world.ts</name>
  <files>spacetimedb/src/index.ts</files>
  <action>
Replace the LOCAL ensureWorldLayout function in index.ts (starting at line 5550) with the full 30-location version from seeding/ensure_world.ts (lines 199-682).

The function body should match ensure_world.ts EXACTLY, including:
- 3 regions (Hollowmere Vale, Embermarch Fringe, Embermarch Depths) - already present
- 30 locations (10 per region) - currently only 9 in index.ts
- All location connections (44 connectIfMissing calls) - currently fewer in index.ts
- WorldState update logic

The new locations to add (missing from index.ts):
- Hollowmere Vale: Willowfen, Ironbell Farmstead, Duskwater Shallows, Thornveil Thicket, Lichen Ridge, Cairn Meadow
- Embermarch Fringe: Slagstone Waystation, Scoria Flats, Brimstone Gulch, Charwood Copse, Smolder Marsh, Ironvein Pass, Pyre Overlook, Ashfen Hollow
- Embermarch Depths: Slag Tunnels, The Crucible, Bonecinder Gallery, Embervault Sanctum, Cinder Wellspring, Gloomspire Landing, Ashwarden Throne

Also verify that the local syncAllContent function (line 5259) calls ensureWorldLayout and has the same call ordering as the one in seeding/ensure_content.ts. If the call list differs, sync it as well.

IMPORTANT: Do NOT change any function signatures, do NOT change imports, do NOT restructure the file. Only replace function bodies to match the canonical versions.
  </action>
  <verify>
    1. Count upsertLocationByName calls in index.ts: should be 30
    2. Count connectIfMissing calls in index.ts ensureWorldLayout: should be 44
    3. Verify the function includes all new location variable names (willowfen, ironbell, duskwater, thornveil, lichenRidge, cairnMeadow, slagstone, scoria, brimstone, charwood, smolder, ironvein, pyre, ashfen, slagTunnels, crucible, bonecinder, embervault, cinderWellspring, gloomspire, ashwarden)
  </verify>
  <done>
    index.ts ensureWorldLayout contains all 30 locations and 44 connections, matching the canonical version in ensure_world.ts exactly. After republishing and running /synccontent, all 30 locations will appear in the database.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Updated index.ts to include all 30 locations so init and /synccontent both seed the full world.</what-built>
  <how-to-verify>
    1. Publish the module: `spacetime publish uwr --project-path spacetimedb` (with or without --clear-database)
    2. Connect to the game client
    3. Run `/synccontent` in the command bar
    4. Check the Location panel travel options -- you should see many more destinations
    5. Alternatively check the database dashboard at https://spacetimedb.com for the location table row count (should be 30)
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- grep -c "upsertLocationByName" spacetimedb/src/index.ts should return 30
- grep -c "connectIfMissing" spacetimedb/src/index.ts should return 44 (within ensureWorldLayout)
- No TypeScript compilation errors introduced (beyond pre-existing ones)
</verification>

<success_criteria>
After publishing the module and running /synccontent, the database contains 30 location records (10 per region) with all connections. The init reducer also seeds all 30 locations on a fresh --clear-database publish.
</success_criteria>

<output>
After completion, create `.planning/quick/82-i-published-the-module-and-i-ran-synccon/82-SUMMARY.md`
</output>
