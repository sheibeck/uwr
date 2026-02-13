# Project State

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Last updated:** 2026-02-13
**Status:** Phase 3.1.3 complete — Enemy AI and aggro management with role-based threat multipliers, combat-state-aware AI, and leashing mechanics

---

## Current Position

Phase 1 (Races) complete. Phase 2 (Hunger) complete. Phase 3 (Renown Foundation) complete. Phase 3.1 (Combat Balance) complete. Phase 3.1.1 (Combat Balance Part 2) complete. Phase 3.1.2 (Combat Balance for Enemies) complete. Phase 3.1.3 (Enemy AI and Aggro Management) complete — role-based threat multipliers (tanks 1.5x, healers 0.5x + healing threat), combat-state-aware AI scoring (healers prioritize low-HP allies <30% HP, buffers buff early, debuffers target tanks), leashing mechanics (enemies evade and reset when all players leave), and dead character aggro cleanup.

**Current phase:** 3.1.3 (Enemy AI and Aggro Management)
**Current plan:** All complete (2/2 plans done)
**Next action:** Move to Phase 4 (LLM Architecture) or address user feedback

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Races | Complete (2/2 plans done) |
| 2 | Hunger | Complete (2/2 plans done, human-verified) |
| 3 | Renown Foundation | Complete (2/2 plans done, human-verified) |
| 3.1 | Combat Balance | Complete (5/5 plans done: 2 impl + 1 verify + 2 gaps, human-verified) |
| 3.1.1 | Combat Balance Part 2 | Complete (3/3 plans done: metadata, implementation, verification all approved) |
| 3.1.2 | Combat Balance for Enemies | Complete (3/3 plans done: metadata, implementation, verification all approved) |
| 3.1.3 | Enemy AI and Aggro Management | Complete (2/2 plans done: role-based threat, AI scoring + leashing) |
| 4 | LLM Architecture | Pending |
| 5 | Quest System | Pending |
| 6 | World Events | Pending |
| 7 | Narrative Tone Rollout | Pending |
| 8 | Content Data Expansion | Pending |

---

## Key Decisions Locked

1. LLM generation uses client-triggered procedure pattern (Phase 1 simplicity; server-scheduled in v2)
2. Race as data rows (`Race.unlocked: bool`), not TypeScript enum — required for World Event unlocks
3. No hunger penalties — reward-only design confirmed
4. No faction standing decay — WoW model confirmed
5. Config table (private) for Anthropic API key storage — no native env var support in SpacetimeDB 1.12
6. Phase 1 + Phase 3 can execute in parallel; Phase 4 (LLM) requires Phase 3 first consumer
7. Human availableClasses is '' (empty string) not 'all' — isClassAllowed returns true for empty string (01-01)
8. Racial bonuses baked into baseStats at character creation, not stored as separate layer (01-01)
9. Character row stores race as display name string, not raceId — snapshot is self-contained (01-01)
10. filteredClassOptions returns null (not empty array) for "all classes allowed" — null is explicit "show everything" signal in CharacterPanel (01-02)
11. Class-clear on race switch runs in onRaceChange using races prop directly, not waiting for Vue recompute — avoids one-tick invalid state window (01-02)
12. Well Fed buff stored on Hunger row (not CharacterEffect) for direct O(1) combat lookup (02-01)
13. mana_regen/stamina_regen Well Fed buffs are display-only TODOs — Character table regen paths not yet wired for decay tick context (02-01)
14. Simple Rations stays as slot=consumable; 4 new Well Fed foods use slot=food to distinguish buff foods from utility consumables (02-01)
15. HungerBar rendered below StatsPanel in wrapper div — simpler than separate panel toggle, no new panel type needed (02-02)
16. eatable = slot === 'food' (lowercase compare) cleanly distinguishes Well Fed buff foods from consumable-slot utility items in InventoryPanel (02-02)
17. Kill-based standing only in Phase 3; quest-completion and tribute standing deferred to future phases (03-01)
18. Single-column by_character index on FactionStanding only — multi-column indexes broken in SpacetimeDB (03-01)
19. Standing per kill: +10 to enemy's faction, -5 to rival faction (03-01)
20. FactionStanding rows initialized eagerly at character creation (4 rows for 4 factions at standing=0) (03-01)
21. Enemy faction assignments: constructs/sentinels=Iron Compact, animals/nature spirits=Verdant Circle, undead/dark humanoids=Ashen Order, humanoid outlaws=Free Blades (03-01)
22. FACTION_RANKS defined client-side as constant array with numeric min/max thresholds — no backend lookup needed (03-02)
23. Standing BigInt converted via Number() before rank threshold comparison; getProgress clamps to 100% for Exalted (Infinity-safe) (03-02)
24. Combat state restrictions data-driven via AbilityTemplate.combatState field — eliminates hardcoded ability key lists on client/server (quick-6)
25. Victory/defeat sounds trigger from combinedEvents (persistent log) not activeResult (ephemeral row) for reliability (quick-33)
26. Server auto-deletes CombatResult rows for no-loot victories and all defeats — already logged as events, no need for lingering rows (quick-33)
27. Each group member independently manages own loot — no leader-gating on dismiss_combat_results (quick-33)
28. take_loot cleanup scoped to character's own remaining loot using by_character index, not global combat loot (quick-33)
29. Combat scaling uses K=1 armor formula (~33% at 50 armor), STR 1.5%/point, crit 5% base + 0.1%/DEX (50% cap), hybrid abilities sum STR+INT at 1n/point (3.1-01)
30. Magic damage bypasses armor entirely for impactful caster DPS; physical damage uses tuned armor curve (3.1-02)
31. Weapon-type-specific crit multipliers: fast weapons (daggers/rapiers/staffs) 1.5x, medium (swords/bows/maces) 2.0x, slow (axes) 2.5x (3.1-02)
32. WIS healing scaling only applies to classes with wis as primary or secondary stat — prevents non-healers from benefiting (3.1-02)
33. Scheduled reducer per-user data must use public tables, not private tables + views — views don't re-evaluate reliably for scheduled reducer inserts (quick-35)
34. All abilities with power > 0n use ONLY hybrid formula (no weaponComponent) — fixes double-dipping bug that caused 5-6x damage (3.1-04)
35. Ability scaling constants tuned: ABILITY_STAT_SCALING_PER_POINT reduced from 2n to 1n, power base multiplier reduced from 10n to 5n — brings abilities to 15-25 damage range, stats contribute ~30-40% (3.1-05)
36. All per-user tables except Player converted to public with client-side filtering — SpacetimeDB views have unreliable reactivity; only myPlayer view remains (identity-based filtering) (quick-46)
37. DoT/HoT use 50% scaling rate modifier to prevent double-dipping on multi-tick periodic effects (3.1.1-01)
38. AoE abilities deal 65% damage per target (tunable 60-70% range); debuffs cost 25% of ability power budget (3.1.1-01)
39. Enemy ability power scales by level only (no stats): ENEMY_BASE_POWER (10n) + enemyLevel * ENEMY_LEVEL_POWER_SCALING (5n) (3.1.2-01)
40. Enemy DoT/debuff abilities use same power budget split as players: 50% dotPowerSplit, 25% debuffPowerCost (3.1.2-01)
41. Enemy AoE abilities have no DoT component (direct damage only) — AoE cannot apply DoTs per user decision (3.1.2-01)
42. Enemy damage type routing: physical (poison/venom/bite/gore/bleed/stone/bog) vs magic (ember/fire/shadow/hex/curse/searing) routes through armor vs magic resist (3.1.2-01)
43. Enemy combat balance verified functional with all 6 ability kinds — user noted combat duration concern (battles too short) for potential future survivability tuning pass (3.1.2-03)
44. Tank threat multiplier 1.5x (conservative start), healer 0.5x, healing generates 50% threat split across enemies — role-based threat system for tank/healer/DPS trinity (3.1.3-01)
45. Enemy AI scoring is combat-state-aware: healers +100 score when ally <30% HP, buffers +50 in first 10s, debuffers +25 vs highest threat — dynamic priority system (3.1.3-02)
46. Enemies leash (evade to full HP) when all players flee combat — prevents kiting exploit, spawn resets to 'available' state (3.1.3-02)
47. Combat duration tuned via centralized constants: BASE_HP (50n), HP_STR_MULTIPLIER (8n), GLOBAL_DAMAGE_MULTIPLIER (85n = 15% reduction), enemy HP ~80% increase — roughly doubles combat length (quick-56)

---

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01-races | 01 | 4min | 3 | 8 |
| 01-races | 02 | ~15min | 3 | 4 |
| 02-hunger | 01 | ~35min | 2 | 11 |
| 02-hunger | 02 | ~15min | 2 | 5 |
| 03-renown-foundation | 01 | 14min | 2 | 10 |
| 03-renown-foundation | 02 | ~10min | 2 | 4 |
| 3.1-combat-balance | 01 | 7min | 2 | 5 |
| 3.1-combat-balance | 02 | 8min | 2 | 5 |
| 3.1-combat-balance | 04 | 5min | 1 | 1 |
| 3.1-combat-balance | 05 | 2min | 1 | 2 |
| 03.1.1-combat-balance-part-2 | 01 | 3min | 2 | 2 |
| 03.1.1-combat-balance-part-2 | 02 | 3min | 4 | 2 |
| 03.1.1-combat-balance-part-2 | 03 | 2min | 1 | 1 |
| 03.1.2-combat-balance-for-enemies | 01 | 4min | 2 | 2 |
| 03.1.2-combat-balance-for-enemies | 02 | 5min | 2 | 1 |
| 03.1.2-combat-balance-for-enemies | 03 | 2min | 1 | 0 |
| 03.1.3-enemy-ai-and-aggro-management | 01 | 3min | 2 | 4 |
| 03.1.3-enemy-ai-and-aggro-management | 02 | 4min | 2 | 1 |

## Accumulated Context

### Roadmap Evolution
- Phase 3.1 inserted after Phase 3: Combat Balance (URGENT)
- 2026-02-12: Phase 3.1 renamed from "Faction Hits" to "Combat Balance" before planning
- Phase 3.1.1 inserted after Phase 3.1: Combat balance part 2 (URGENT)
- 2026-02-12: Phase 3.1.1 planned — DoT/HoT/debuff/AoE balance with power budget approach, 3 plans created
- Phase 3.1.2 inserted after Phase 3.1.1: Combat balance for Enemies (URGENT)
- Phase 03.1.3 inserted after Phase 03.1.2: Enemy AI and aggro management (URGENT)

---

## Blocked / Risks

None currently. Key risk to watch: SpacetimeDB procedures are beta — API may change on upgrade.

---

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Fix ability cooldown trigger - only apply cooldown when ability actually executes, not when denied due to combat state | 2026-02-12 | 6a57726 | [1-fix-ability-cooldown-trigger-only-apply-](./quick/1-fix-ability-cooldown-trigger-only-apply-/) |
| 2 | Fix pet summon cooldown - prevent false cooldown display when pet summons clicked outside combat | 2026-02-12 | a524111 | [2-fix-pet-summon-cooldown-prevent-cooldown](./quick/2-fix-pet-summon-cooldown-prevent-cooldown/) |
| 3 | Fix group log messages to show character names instead of "You" | 2026-02-12 | a2ece2f | [3-fix-group-log-messages-to-show-character](./quick/3-fix-group-log-messages-to-show-character/) |
| 4 | Fix equipment type restrictions - add armor proficiency check and tooltip class/armor info | 2026-02-12 | aa50ee2 | [4-equipment-of-any-type-is-currently-usabl](./quick/4-equipment-of-any-type-is-currently-usabl/) |
| 5 | Fix Nature's Mark cooldown - prevent false cooldown display when clicked in combat | 2026-02-12 | 8a11c55 | [5-fix-nature-s-mark-cooldown-prevent-coold](./quick/5-fix-nature-s-mark-cooldown-prevent-coold/) |
| 6 | Refactor cooldown guards & generalize combat state - eliminate hardcoded ability key lists with data-driven combatState field | 2026-02-12 | e53aca4 | [6-refactor-cooldown-guards-generalize-comb](./quick/6-refactor-cooldown-guards-generalize-comb/) |
| 7 | Fix armor class restrictions - correct swapped armor proficiency check arguments and update armor seed data to show proper class restrictions in tooltips | 2026-02-12 | f5d9476 | [7-we-ve-added-tooltips-to-show-class-restr](./quick/7-we-ve-added-tooltips-to-show-class-restr/) |
| 8 | Add log entries for faction standing gains - show lavender-colored messages when gaining/losing standing with factions | 2026-02-12 | f6aeed2 | [8-add-log-entries-for-faction-standing-gai](./quick/8-add-log-entries-for-faction-standing-gai/) |
| 9 | Fix equipment validation to allow class-permitted weapons - skip armor proficiency check for armorType='none' items (weapons, accessories) | 2026-02-12 | fefce50 | [9-fix-equipment-validation-allow-class-per](./quick/9-fix-equipment-validation-allow-class-per/) |
| 10 | Add user feedback for blocked abilities - client-side local event system with terracotta-colored messages when abilities blocked by combat state | 2026-02-12 | 0ac90bb | [10-add-user-feedback-for-blocked-abilities-](./quick/10-add-user-feedback-for-blocked-abilities-/) |
| 11 | Add enemy popover tooltip showing individual member names and faction affiliation | 2026-02-12 | 9b94ece | [11-add-enemy-popover-tooltip-showing-indivi](./quick/11-add-enemy-popover-tooltip-showing-indivi/) |
| 12 | Fix recipe research to scope unlocks per-character - filter discoveredRecipeIds by selected character | 2026-02-12 | ca786dd | [12-fix-recipe-research-to-unlock-only-for-r](./quick/12-fix-recipe-research-to-unlock-only-for-r/) |
| 13 | Refactor UI panels to allow multiple panels - multi-panel system with independent positioning, resizing, and persistence | 2026-02-12 | d6a6d26 | [13-refactor-ui-panels-allow-multiple-panels](./quick/13-refactor-ui-panels-allow-multiple-panels/) |
| 14 | Update vendor seeding to use random subset selection - vendors stock ~13-15 tier-appropriate items instead of all 50+ items | 2026-02-12 | 859b4b2 | [14-update-vendor-seeding-to-use-random-sele](./quick/14-update-vendor-seeding-to-use-random-sele/) |
| 15 | Fix panel visibility bug - add missing closing div on Character Panel to allow independent panel rendering | 2026-02-12 | fc63cf6 | [15-fix-panel-visibility-bug-panels-incorrec](./quick/15-fix-panel-visibility-bug-panels-incorrec/) |
| 16 | Refactor location panel with flexible grid layout and context menus - replace button-heavy accordions with grid tiles and right-click menus | 2026-02-12 | 682e364 | [16-refactor-location-panel-flexible-grid-la](./quick/16-refactor-location-panel-flexible-grid-la/) |
| 17 | Fix context menu handlers - add data-context-menu attribute to prevent race condition where menu closed before click events fired | 2026-02-12 | 6c67d7f | [17-fix-context-menu-handlers-wire-up-enemy-](./quick/17-fix-context-menu-handlers-wire-up-enemy-/) |
| 18 | Align hotbar panel styling with other floating panels - remove redundant title, add panelBody wrapper, use card-style slot rows | 2026-02-12 | 992b0bc | [18-align-hotbar-panel-styling-with-other-fl](./quick/18-align-hotbar-panel-styling-with-other-fl/) |
| 19 | Add smart auto-scroll to LogWindow - scroll to bottom only when user is at bottom, pause when scrolled up, show "New messages" button | 2026-02-12 | 6530580 | [19-add-smart-auto-scroll-to-logwindow-scrol](./quick/19-add-smart-auto-scroll-to-logwindow-scrol/) |
| 20 | Align floating hotbar ability activation with standard panel structure - use floatingPanel/floatingPanelHeader/floatingPanelBody pattern | 2026-02-12 | 2abcad3 | [20-align-floating-hotbar-ability-activation](./quick/20-align-floating-hotbar-ability-activation/) |
| 22 | UI consistency pass - align all action panels with panelBody wrappers and card-style layouts | 2026-02-12 | 050cef4 | [22-ui-consistency-pass-align-all-action-pan](./quick/22-ui-consistency-pass-align-all-action-pan/) |
| 23 | Redesign inventory panel - grid-based bag with right-click context menus | 2026-02-12 | 50652d8 | [23-redesign-inventory-panel-grid-based-bag-](./quick/23-redesign-inventory-panel-grid-based-bag-/) |
| 24 | Add server-side persistence for UI panel layout | 2026-02-12 | ae45e00 | [24-add-server-side-persistence-for-ui-panel](./quick/24-add-server-side-persistence-for-ui-panel/) |
| 25 | Add visual progress indicators for resource gathering and enemy pulling - multiplayer visibility with amber pull bars and blue gather bars | 2026-02-12 | cc828c3 | [25-add-visual-progress-indicators-for-resou](./quick/25-add-visual-progress-indicators-for-resou/) |
| 26 | Fix tooltip text wrapping - add overflowWrap CSS property to ensure long content wraps within 240px maxWidth boundary | 2026-02-12 | 9c649a2 | [26-fix-tooltip-text-wrapping-wrap-class-lis](./quick/26-fix-tooltip-text-wrapping-wrap-class-lis/) |
| 27 | Add log button to action bar to reopen closed log panel - log toggle button in action bar | 2026-02-12 | c0ab274 | [27-add-log-button-to-action-bar-to-reopen-c](./quick/27-add-log-button-to-action-bar-to-reopen-c/) |
| 28 | Fix missing combat summary window - remove auto-dismiss watcher that hid solo victory results with no loot | 2026-02-12 | 7032a86 | [28-fix-missing-combat-summary-window-after-](./quick/28-fix-missing-combat-summary-window-after-/) |
| 29 | Refactor loot system - replace combat summary modal with dedicated floating loot panel and log messages for Victory/Defeat | 2026-02-12 | d746ff3 | [29-refactor-loot-system-replace-combat-summ](./quick/29-refactor-loot-system-replace-combat-summ/) |
| 30 | Add inventory stack splitting with context menu controls - right-click Split option for stackable items | 2026-02-12 | 51489c9 | [30-add-inventory-stack-splitting-with-conte](./quick/30-add-inventory-stack-splitting-with-conte/) |
| 31 | Fix loot panel and victory messages - correct addLocalEvent call syntax and gate auto-dismiss on pending loot to prevent loot deletion | 2026-02-12 | ae56c5d | [31-fix-loot-panel-and-victory-messages-loot](./quick/31-fix-loot-panel-and-victory-messages-loot/) |
| 32 | Add inventory organize button with alphabetization - consolidate stacks server-side and sort by rarity then alphabetically | 2026-02-12 | 255a8dc | [32-add-inventory-organize-button-alphabetiz](./quick/32-add-inventory-organize-button-alphabetiz/) |
| 33 | Remove legacy auto-dismiss loot system - fix race condition preventing loot from displaying, enable per-character loot management | 2026-02-12 | a8aec03 | [33-remove-legacy-auto-dismiss-loot-system-a](./quick/33-remove-legacy-auto-dismiss-loot-system-a/) |
| 34 | Add ASCII art splash screen for unauthenticated users - full-screen UNWRITTEN REALMS title with dungeon entrance and login button | 2026-02-12 | 13e32d5 | [34-add-ascii-art-splash-screen-for-unauthen](./quick/34-add-ascii-art-splash-screen-for-unauthen/) |
| 36 | Fix login/logout transition flashing - eliminate splash re-render and black screen flash with three-state rendering and reactive logout | 2026-02-12 | 425156c | [36-fix-login-logout-transition-flashing-eli](./quick/36-fix-login-logout-transition-flashing-eli/) |
| 37 | Fix panel z-index stacking - sync topZ counter after loading panel states to ensure clicked panels always come to front | 2026-02-12 | 92cfb1e | [37-fix-panel-z-index-stacking-ensure-clicke](./quick/37-fix-panel-z-index-stacking-ensure-clicke/) |
| 35 | Deep analysis and fix of combat loot system - made combat_loot public table with diagnostic logging to bypass view layer and fix loot display | 2026-02-12 | 5dd2f26 | [35-deep-analysis-and-fix-of-combat-loot-sys](./quick/35-deep-analysis-and-fix-of-combat-loot-sys/) |
| 38 | Fix location panel missing players list - always-visible PLAYERS section showing all characters at location including user's own non-selected characters | 2026-02-12 | 688b552 | [38-fix-location-panel-missing-players-list-](./quick/38-fix-location-panel-missing-players-list-/) |
| 39 | Fix players list to show only active and recently disconnected characters - restore active + pending-logout filter to exclude fully offline players | 2026-02-12 | cb87cff | [39-fix-players-list-to-show-only-active-and](./quick/39-fix-players-list-to-show-only-active-and/) |
| 40 | Fix log message sorting and coloring - group combat messages show proper red/green/gold colors, same-timestamp events grouped by scope | 2026-02-12 | 3f0cdcb | [40-fix-log-message-sorting-and-coloring-in-](./quick/40-fix-log-message-sorting-and-coloring-in-/) |
| 41 | Fix group panel buffs/debuffs display - enemy-applied effects now visible using index lookups instead of broken .iter() in view | 2026-02-12 | da9a615 | [41-fix-group-panel-buffs-debuffs-display-en](./quick/41-fix-group-panel-buffs-debuffs-display-en/) |
| 42 | Fix out-of-combat buffs not showing in group panel - made CharacterEffect table public with client-side filtering to bypass unreliable view reactivity | 2026-02-12 | 8b46cf7 | [42-fix-out-of-combat-buffs-not-showing-in-g](./quick/42-fix-out-of-combat-buffs-not-showing-in-g/) |
| 43 | Add auto-stacking for loot items (junk) - changed junk item templates to stackable: true for automatic stack merging when looting | 2026-02-13 | c108744 | [43-add-auto-stacking-for-loot-items-junk-it](./quick/43-add-auto-stacking-for-loot-items-junk-it/) |
| 44 | Fix NPC dialog not appearing in Journal panel - made NpcDialog public table with client-side character filtering to bypass unreliable view reactivity | 2026-02-13 | 1effc28 | [44-fix-npc-dialog-not-appearing-in-journal-](./quick/44-fix-npc-dialog-not-appearing-in-journal-/) |
| 45 | Add confirmation dialog before deleting inventory items - prevent accidental deletion with browser confirm dialog showing item name and quantity | 2026-02-13 | f703460 | [45-in-the-inventory-panel-when-we-bring-up-](./quick/45-in-the-inventory-panel-when-we-bring-up-/) |
| 46 | Proactively fix remaining SpacetimeDB view issues - converted 12 private tables to public with client-side filtering to eliminate unreliable view subscriptions | 2026-02-13 | 42da4b9 | [46-proactively-fix-remaining-spacetimedb-vi](./quick/46-proactively-fix-remaining-spacetimedb-vi/) |
| 47 | Persist open/closed state of windows - log panel and all toggleable panels respect saved state across reloads and character switches | 2026-02-13 | 6e3185b | [47-we-save-the-locations-of-our-windows-on-](./quick/47-we-save-the-locations-of-our-windows-on-/) |
| 48 | Character Panel UI overhaul - card-based character selection with tile-based race/class selection replacing radio buttons and dropdowns | 2026-02-13 | e18e6e6 | [48-can-we-do-a-ui-overhaul-of-the-character](./quick/48-can-we-do-a-ui-overhaul-of-the-character/) |
| 49 | Increase Location panel font sizes - bumped all text by ~0.1rem (0.65→0.75, 0.78→0.88) for improved readability while maintaining visual hierarchy | 2026-02-13 | 3e4f765 | [49-the-font-size-in-the-location-panel-with](./quick/49-the-font-size-in-the-location-panel-with/) |
| 50 | Move region name below location name in Travel panel - two-line layout with directional arrows, larger fonts (0.88→0.95rem), and zero TRAVEL label margin | 2026-02-13 | 3cd521f | [50-move-region-name-below-location-name-in-](./quick/50-move-region-name-below-location-name-in-/) |
| 51 | Make travel tiles always fill full width - added width: '100%' to gridTileTravel for consistent tile sizing | 2026-02-13 | 7f8fddc | [51-make-travel-buttons-always-fill-the-widt](./quick/51-make-travel-buttons-always-fill-the-widt/) |
| 52 | Remove 3-character limit - deleted MAX_CHARACTER_SLOTS cap to allow unlimited character creation | 2026-02-13 | 4d462c7 | [52-remove-the-3-character-maximum-limit](./quick/52-remove-the-3-character-maximum-limit/) |
| 53 | Move resource gathering bar underneath resource name - progress bars render below tile text for improved visibility with short names | 2026-02-13 | c111fb3 | [53-move-resource-gathering-bar-underneath-r](./quick/53-move-resource-gathering-bar-underneath-r/) |
| 54 | Make Characters panel 2-column layout - creator on left, character list on right for improved usability without scrolling | 2026-02-13 | ae2ea5c | [54-make-characters-panel-2-columns-creator-](./quick/54-make-characters-panel-2-columns-creator-/) |
| 55 | Fix production bugs - cooldown timers and pull bars - server clock offset mechanism to fix clock skew between maincloud server and client browsers | 2026-02-13 | 7c81f86 | [55-fix-production-bugs-cooldown-timers-not-](./quick/55-fix-production-bugs-cooldown-timers-not-/) |
| 56 | Address combat duration - increase HP pools and add global damage reduction - roughly double combat duration from 2-3 rounds to 4-6+ rounds | 2026-02-13 | 2df7a36 | [56-address-combat-duration-explore-hp-pools](./quick/56-address-combat-duration-explore-hp-pools/) |
| 57 | Fix ability cooldowns - Magic Missile 30s bug and Thorn Lash refill - server-side expired cooldown cleanup and client prediction trust with GCD clamp | 2026-02-13 | 5a6bb87 | [57-fix-ability-cooldowns-magic-missile-30s-](./quick/57-fix-ability-cooldowns-magic-missile-30s-/) |
| 58 | Review all character abilities up through level 2 - fix ranger_track from no-op to enemy scouting ability revealing names/levels, reduce cooldown 600s to 120s | 2026-02-13 | e307bac | [58-review-all-character-abilities-up-throug](./quick/58-review-all-character-abilities-up-throug/) |
| 59 | Increase global health regen rate to match HP pool increase - scaled regen constants (HP 2x, mana/stamina ~67%) to restore pre-quick-56 recovery times | 2026-02-13 | 40db382 | [59-increase-global-health-regen-rate-to-mat](./quick/59-increase-global-health-regen-rate-to-mat/) |
| 60 | Fix druid Nature's Mark level 2 ability - re-read character from database after mana deduction to ensure fresh locationId for resource gathering | 2026-02-13 | 9c301c6 | [60-fix-druid-nature-s-mark-level-2-ability-](./quick/60-fix-druid-nature-s-mark-level-2-ability-/) |
| 61 | Fix window position blinking race condition - local-authority dirty tracking prevents server sync from overwriting panel moves during debounced save pipeline | 2026-02-13 | df901cc | [61-fix-window-position-blinking-race-condit](./quick/61-fix-window-position-blinking-race-condit/) |
| 62 | Investigate circular dependency between combat_scaling.ts and class_stats.ts - identified unused re-export as root cause (zero consumers, trivial fix) | 2026-02-13 | 81bc014 | [62-investigate-circular-dependency-between-](./quick/62-investigate-circular-dependency-between-/) |
| 63 | Allow druids to wear leather armor - added leather to CLASS_ARMOR proficiency and ARMOR_ALLOWED_CLASSES seed data | 2026-02-13 | 2c5a19f | [63-druid-s-should-be-able-to-wear-leather-a](./quick/63-druid-s-should-be-able-to-wear-leather-a/) |
| 64 | Fix circular dependency between combat_scaling.ts and class_stats.ts - removed unused re-export and unused import to eliminate build warning | 2026-02-13 | 2700046 | [64-fix-circular-dependency-between-combat-s](./quick/64-fix-circular-dependency-between-combat-s/) |

---

## Last Session

**Stopped at:** Completed quick-64-01-PLAN.md
**Timestamp:** 2026-02-13T13:37:34Z
