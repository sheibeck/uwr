# Codebase Concerns

**Analysis Date:** 2026-02-11

## Tech Debt

**Monolithic Server Module:**
- Issue: `C:/projects/uwr/spacetimedb/src/index.ts` is 5,779 lines — contains all table definitions, helper functions, initialization, and data structures in one file
- Files: `C:/projects/uwr/spacetimedb/src/index.ts`
- Impact: Difficult to navigate, high cognitive load, circular import risk, refactoring blocked by prior breakage
- Fix approach: Incrementally extract into focused modules: `schema/` (tables only), `seed/` (data bootstrap), `helpers/` (utilities). Start with schema definitions; test each extraction carefully to avoid import breakage.

**Large Composable Files:**
- Issue: `C:/projects/uwr/src/composables/useCombat.ts` (612 lines) contains multiple concerns: roster building, enemy state tracking, loot management, effect timers
- Files: `C:/projects/uwr/src/composables/useCombat.ts`, `C:/projects/uwr/src/composables/useHotbar.ts` (287 lines), `C:/projects/uwr/src/composables/useInventory.ts` (237 lines)
- Impact: Hard to test individual features, large computed() trees recompute on any dependency change, complex state coordination
- Fix approach: Split useCombat into `useCombatState`, `useCombatLoot`, `useCombatRoster`, `useCombatEffects`; co-locate related computed properties. Test enemy state transitions separately.

**Monolithic Styles File:**
- Issue: `C:/projects/uwr/src/ui/styles.ts` is 1,269 lines of inline style objects with no semantic organization
- Files: `C:/projects/uwr/src/ui/styles.ts`
- Impact: No theme engine, style overrides scattered, hard to maintain visual consistency, no dark mode toggle, difficult to reuse theme values
- Fix approach: Extract color palette, spacing system, and component styles into semantic groups. Introduce CSS variables or composable theme provider. Split into `styles/theme.ts`, `styles/layout.ts`, `styles/components.ts`.

**Combat Loop Complexity:**
- Issue: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` (2,244 lines) handles ability execution, enemy AI, damage calculation, aggro, loot distribution, effect ticking, all in one file
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts`
- Impact: Difficult to debug damage calculations, effect interactions, or aggro behavior without understanding entire flow; hard to add new ability hooks
- Fix approach: Extract into logical modules: `combat/ability.ts`, `combat/damage.ts`, `combat/aggro.ts`, `combat/effects.ts`. Define clear interfaces for ability execution.

## Missing Test Coverage

**No Automated Tests:**
- What's not tested: All core features (combat, combat loop timing, ability interactions, loot distribution, XP splits, item interactions)
- Files: All server code in `C:/projects/uwr/spacetimedb/src/`, all client composables in `C:/projects/uwr/src/composables/`
- Risk: Regressions go undetected; ability balance changes break silently; stat calculations are unchecked
- Priority: High — start with combat damage calculations and effect tick logic; add reducer integration tests

**No E2E Tests:**
- What's not tested: Combat flow (pull → combat → results), group interactions with fallback rosters, loot claiming and distribution, character death and respawn
- Files: No test files exist
- Risk: Critical gameplay flows cannot be validated before maincloud deployment
- Priority: High — add basic combat scenario tests before next major feature

**No Client-Side Component Tests:**
- What's not tested: Combat UI rendering with multiple enemies, hotbar slot updates, inventory filtering, equipped slot calculations
- Files: `C:/projects/uwr/src/composables/`, UI components
- Risk: UI state desync from server data; stat displays miscalculate bonus calculations
- Priority: Medium — prioritize combat roster and equipment panels

## Fragile Areas

**Timestamp Handling:**
- Files: `C:/projects/uwr/src/composables/useCombat.ts` (lines 72–95)
- Why fragile: Timestamp format is loosely typed (`any`) and handles 5 different object shapes: `microsSinceUnixEpoch`, `millisSinceUnixEpoch`, `secsSinceUnixEpoch`, `__timestamp_micros_since_unix_epoch__`, and raw numbers. No validation that conversion is correct.
- Safe modification: Add a `Timestamp` type with discriminated union; validate at module bindings import time. Add tests for each conversion path.
- Test coverage: **None** — conversions are untested; adding a new timestamp format type will silently fail

**Enemy State Tracking:**
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts`
- Why fragile: `combatEnemy.currentHp` is mutated directly without atomic checks; multiple reducers can modify HP, aggro, effects concurrently. No transaction guards beyond SpacetimeDB's auto-transaction per reducer.
- Safe modification: Add helper `damageEnemy()` that validates HP bounds and returns the updated row; use consistently. Document which fields are mutable in combat vs. immutable between ticks.
- Test coverage: **None** — concurrent damage during effect ticks is untested

**Ability Casting Validation:**
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` (ability execution), `C:/projects/uwr/src/composables/useCombat.ts` (client-side hotbar prediction)
- Why fragile: No validation that ability exists before casting; no check for sufficient mana/stamina before cost deduction; cooldown is checked but not enforced atomically
- Safe modification: Add `validateAbilityCast()` helper that checks: ability exists, character in combat, sufficient resources, cooldown ready, target valid. Call before each reducer mutation. Add integration test.
- Test coverage: **None** — invalid casts silently fail or cause partial state updates

**Loot Claiming Race Condition:**
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` (loot deletion), `C:/projects/uwr/src/composables/useCombat.ts` (UI claiming)
- Why fragile: Multiple group members can call `take_loot` simultaneously for the same loot entry. No optimistic lock; first delete wins, second gets error.
- Safe modification: Add version field to `CombatLoot` and validate version before delete. Implement retry logic on client side. Or: lock loot to character on first claim attempt.
- Test coverage: **None** — concurrent loot claims are untested

**Group Fallback Roster:**
- Files: `C:/projects/uwr/src/composables/useCombat.ts` (lines 494–500), `C:/projects/uwr/spacetimedb/src/reducers/combat.ts`
- Why fragile: If `combat_participant` table is empty, UI falls back to `fallbackRoster` (group members). If schema changes or participant insert fails silently, UI shows stale data.
- Safe modification: Add explicit logging when fallback is used; validate fallback roster matches current group membership every frame. Add assertion that participant count > 0 after combat creation.
- Test coverage: **None** — fallback path untested; participants table silent deletion uncaught

**Item Usability Hardcoded List:**
- Files: `C:/projects/uwr/src/composables/useInventory.ts` (lines 128–139)
- Why fragile: Usable items are hardcoded in a `Set`: `['bandage', 'basic_poultice', 'travelers_tea', ...]`. New consumables added to schema won't appear as usable unless code is updated.
- Safe modification: Move usability flag to `item_template.usable` boolean column; read from schema instead of hardcoded list. Backward-compatible: existing items get `usable: false`.
- Test coverage: **None** — item filtering untested

## Data Schema Concerns

**Stamina/Mana Migration Pending:**
- Issue: Non-mana classes have `maxMana = 0`; stamina system incomplete for some class calculations
- Files: `C:/projects/uwr/spacetimedb/src/index.ts` (schema), `C:/projects/uwr/spacetimedb/src/data/class_stats.ts` (stat computation)
- Impact: Publishing changes requires `--delete-data`; cannot sync to maincloud without data loss
- Fix approach: Finalize stamina stat calculations for all classes; document mana/stamina rules in PROJECT_STATE; publish with clear migration path or soft launch on clean database

**Region/Location Migration Pending:**
- Issue: Regions now include `regionType` and locations include `terrainType`; some areas may not have these fields initialized
- Files: `C:/projects/uwr/spacetimedb/src/index.ts`
- Impact: UI may render incomplete region info; publishing requires `--delete-data`
- Fix approach: Ensure `ensureWorldLayout()` sets `regionType` and `terrainType` for all seed regions/locations; test on fresh database

**Item/Enemy Schema Expansion Pending:**
- Issue: New item and enemy properties added; some old rows may be missing new fields
- Files: `C:/projects/uwr/spacetimedb/src/index.ts`, `C:/projects/uwr/spacetimedb/src/data/ability_catalog.ts`
- Impact: Schema change requires `--delete-data`; cannot ship to maincloud without careful migration planning
- Fix approach: Finalize schema; document required fields; ensure `ensure*` functions initialize all mandatory fields before publishing

## Performance Concerns

**Computed Property Thrashing in useCombat:**
- Issue: 40+ computed properties depend on `selectedCharacter`, `combatEncounters`, `combatParticipants`, etc. Any one dependency change triggers recomputation of all
- Files: `C:/projects/uwr/src/composables/useCombat.ts`
- Impact: Combat UI lag on rapid server updates; scrolling through enemy list slow on weak devices
- Improvement path: Memoize intermediate queries (`activeCombat` → `combatId` cache); split computed into separate composables; use `selectableComputed()` or equivalent if available

**String Comparisons for ID Matching:**
- Issue: IDs are BigInt but compared as strings throughout (`.toString()` every comparison)
- Files: `C:/projects/uwr/src/composables/useCombat.ts` (many lines), `C:/projects/uwr/src/composables/useInventory.ts` (line 74)
- Impact: Allocates string objects per comparison; inefficient in tight loops (roster building, loot filtering)
- Improvement path: Compare BigInt directly; only convert to string for display

**O(n) Lookups in Combat UI:**
- Issue: `itemTemplates.value.find()` called in inner loops for every loot item, every enemy ability, every effect
- Files: `C:/projects/uwr/src/composables/useCombat.ts` (lines 178, 326, 396, 435, etc.), `C:/projects/uwr/src/composables/useInventory.ts` (line 169)
- Impact: Loot UI renders slowly with 50+ items; combat with 10+ enemies lags
- Improvement path: Pre-compute template lookup maps as `Map<id, template>` in composable setup; update on subscription changes

**Event Table Trimming Undefined:**
- Issue: Event tables are trimmed "to last 200 per scope and anything older than 1 hour" but no reducer enforces this
- Files: `C:/projects/uwr/spacetimedb/src/index.ts`
- Impact: Event tables will grow unbounded until manual cleanup; server memory usage grows linearly with playtime
- Fix approach: Add `cleanup_events` reducer or scheduled task to delete events older than 1 hour; test with high event volume

## Security Considerations

**No Input Sanitization on Chat/Commands:**
- Risk: User messages in `say`, `whisper`, `group_message` are not sanitized before logging to event tables
- Files: `C:/projects/uwr/spacetimedb/src/reducers/commands.ts` (lines 143, 229, 236, 156)
- Current mitigation: Event tables are not HTML-rendered; plain text display in UI
- Recommendations: Add length limits to message fields (currently unbounded string); validate UTF-8; consider XSS risk if UI ever renders rich text or markdown

**NPC Dialog Regex Injection:**
- Risk: `hailNpc` uses `.match(/^hail[,\s]+(.+)$/i)` on user input; captured group is used directly without sanitization
- Files: `C:/projects/uwr/spacetimedb/src/reducers/commands.ts` (line 120)
- Current mitigation: Regex is anchored; captured NPC name is case-insensitive matched against DB names
- Recommendations: Add length limit to NPC names; validate captured group length before passing to `hailNpc()`

**No Rate Limiting on Reducers:**
- Risk: Any reducer can be called multiple times per second by a malicious client; no throttling
- Files: All reducers in `C:/projects/uwr/spacetimedb/src/reducers/`
- Current mitigation: SpacetimeDB runs locally; not exposed to untrusted clients on maincloud yet
- Recommendations: Before maincloud deployment, add per-identity rate limits: chat (1/sec), ability casts (1/sec), movement (1/sec), other (5/sec)

**JWT/Token Validation:**
- Risk: Auth tokens are stored in localStorage and sent as query parameter in connection string; no HTTPS on local
- Files: `C:/projects/uwr/src/auth/spacetimeAuth.ts`, `C:/projects/uwr/src/composables/useAuth.ts`
- Current mitigation: Local development only; SpacetimeAuth PKCE flow provides token
- Recommendations: On maincloud, enforce HTTPS; add token expiry; implement refresh token rotation; audit SpacetimeAuth integration

## Ability Execution Concerns

**Unified Ability Dispatch Not Fully Integrated:**
- Issue: `executeAbilityAction()` dispatcher exists but some ability code paths still use direct reducer calls
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts`, `C:/projects/uwr/src/composables/useCombat.ts`
- Impact: Adding new ability hooks (pull modifiers, haste) requires updating multiple code paths
- Fix approach: Ensure all ability execution (character, enemy, pet) routes through dispatcher; document ability hook contract; add test for each hook type

**Missing Ability Effect Hooks:**
- Issue: Abilities can deal damage and add effects, but cannot modify enemy stats (speed, range, accuracy), crowd control, or dispel
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts`
- Impact: Ability balance limited; repeating feature requests for buff/debuff mechanics
- Fix approach: Design and implement ability hooks for: `modifyAutoAttackSpeed()`, `modifyRange()`, `crowdControl()`, `dispel()`. Add test for each.

**Pet Ability Cooldown Logic Complex:**
- Issue: Pet abilities have per-pet cooldowns stored in `combat_enemy_cooldown`; shared cooldowns not supported
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` (pet ability execution)
- Impact: Pets cannot share cooldowns with owner; complex ability rotations hard to express
- Fix approach: Document current limitation; consider shared cooldown table if needed

## Known Issues

**Character Logout Timing Delayed:**
- Symptoms: When switching characters or logging out, character stays visible for 30s before disappearing
- Files: `C:/projects/uwr/spacetimedb/src/reducers/characters.ts`, `C:/projects/uwr/spacetimedb/src/index.ts` (disconnect_logout_tick)
- Trigger: Any character switch or logout triggers delayed logout; `player.lastSeenAt` updates on logout, friends see character as offline only after delay
- Workaround: Wait 30s; switch location to force refresh. Root cause: delayed logout prevents login escape during combat.

**Combat Enemy Health Bars Desync on Rapid Damage:**
- Symptoms: Enemy HP bar shows wrong health after multiple hits in quick succession; actual damage applied correctly on server
- Files: `C:/projects/uwr/src/composables/useCombat.ts` (health bar calculation), `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` (damage application)
- Trigger: Client-side optimistic update doesn't account for concurrent damages; server state arrives out of order
- Workaround: Hover on enemy to refresh display. Fix: Add local damage queue on client; apply in order of server timestamps.

**Loot Auto-Distribution Unimplemented:**
- Symptoms: After combat, all loot shows for all group members; no need/greed/pass system
- Files: `C:/projects/uwr/spacetimedb/src/reducers/combat.ts` (loot creation), `C:/projects/uwr/src/composables/useCombat.ts` (loot claiming)
- Trigger: Combat ends; loot appears in shared pool
- Workaround: Manually distribute; first to click wins. Future: Implement roll system or smart distribution rules.

**Friend Request Duplicates Allowed:**
- Symptoms: Sending `/friend` to same character twice creates two requests
- Files: `C:/projects/uwr/spacetimedb/src/reducers/social.ts` (friend request send)
- Trigger: Call `send_friend_request` with same target twice
- Workaround: Decline duplicate and resend. Fix: Check if request already exists before insert.

## Scaling Limits

**Event Table Growth Unbounded:**
- Current capacity: Event tables accumulate indefinitely; trimming logic mentioned but unimplemented
- Limit: Server memory grows ~100KB per 100 events (rough estimate); 1 million events = ~1GB
- Scaling path: Implement event cleanup task; archive events after 1 day; paginate event UI to latest 200 only

**Character String Matching O(n):**
- Current capacity: Character lookups (`find by name`) iterate all characters (no index)
- Limit: 1000 characters = O(n) per whisper/friend request; 10,000 characters = noticeable slowdown
- Scaling path: Add case-insensitive unique index on `character.name`; use `.find()` instead of `.iter()` + loop

**Enemy Aggro Calculation O(m*n):**
- Current capacity: Adding enemy to combat iterates all participants to initialize aggro entries
- Limit: 5 participants × 100 enemies (large raid) = 500 inserts per combat; OK for now
- Scaling path: Pre-allocate aggro entries on group formation; reuse if in-combat flag flips

**Combat Loop Tick CPU Usage:**
- Current capacity: `combat_loop_tick` reducer runs every 1s for all active combats; cost grows with enemy count
- Limit: 100 concurrent combats × 10 enemies = 1000 tick reductions per second; measurable CPU
- Scaling path: Batch enemy updates; consider async tick processing or serverless scheduling

## Dependency at Risk

**SpacetimeDB TypeScript SDK Version Lock:**
- Risk: SDK is at `^1.11.0`; major version bump may introduce breaking changes to table/reducer APIs
- Impact: Cannot upgrade without rewriting schema and reducer signatures
- Migration plan: Monitor SpacetimeDB releases; plan upgrade before moving to maincloud; test bindings generation on new versions

**Vue 3 Composition API (Pinned):**
- Risk: Composables are tightly coupled to Vue 3.x; major version bump (e.g., Vue 4.x) could require rewrite
- Impact: UI code cannot reuse in other frameworks; hard to test in isolation
- Migration plan: Extract composable logic into framework-agnostic classes; use dependency injection for Vue bindings

---

*Concerns audit: 2026-02-11*
