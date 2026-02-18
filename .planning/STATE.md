# Project State

**Milestone:** RPG Milestone — Progression Systems & LLM Content Engine
**Last updated:** 2026-02-18
**Status:** Phase 13.1 Plan 01 complete — dual-axis gear quality schema (craftQuality + qualityTier), Essence I/II/III seeded, MATERIAL_AFFIX_MAP keys renamed, unified addRecipeTemplate helper, all gear recipes require Essence as req3. Plan 02 (craft_recipe reducer dual-axis update) is next.

---

## Current Position

Phase 1 (Races) complete. Phase 2 (Hunger) complete. Phase 3 (Renown Foundation) complete. Phase 3.1 (Combat Balance) complete. Phase 3.1.1 (Combat Balance Part 2) complete. Phase 3.1.2 (Combat Balance for Enemies) complete. Phase 3.1.3 (Enemy AI and Aggro Management) complete. Phase 4 (Config Table Architecture) complete — all ability metadata migrated to AbilityTemplate DB, legacyDescriptions removed. Phase 6 (Quest System) complete — kill/kill_loot/explore/delivery/boss_kill quest types, passive search on travel, 14 quests seeded. Phase 10 (Travel & Movement Costs) complete — stamina costs, 5-min cross-region cooldown, group validation, TravelPanel UI. Phase 11 (Death & Corpse System) complete — level 5+ corpse creation, inventory drop, loot reducers, resurrection/corpse summon with PendingSpellCast confirmation flow (quick-93); UI plan skipped per user decision. Phase 12 (Overall Renown System) complete — 15 ranks, permanent perks, server-first tracking, tabbed UI, human-verified. Phase 14 (Loot & Gear Progression) complete — quality tiers (common→legendary), prefix/suffix affix catalog, danger-based tier rolls, affix budget cap, named legendary drops, salvage, client UI with quality colors and tooltips, human-verified. Phase 19 (NPC Interactions) complete — backend affinity/dialogue tables, interaction reducers, multi-step questing via NPC dialogue chains; UI plan skipped per user decision. Phase 20 (Perk Variety Expansion) complete — 30 domain-categorized perks for ranks 2-11, proc/crafting/social perk effects fully functional across all game systems, active ability perks (Second Wind/Thunderous Blow/Wrath of the Fallen) auto-assign to hotbar when chosen and are castable via use_ability reducer.

**Last completed phase:** 13.1 Plan 02 (Dual-Axis Gear System — craft_recipe reducer dual-axis update and frontend craft quality display)
**Current phase:** 13.1-dual-axis-gear-system (Plan 02/3 complete)
**Next action:** Phase 13.1 Plan 03 (if planned) or next phase

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
| 4 | Config Table Architecture | Complete (2/2 plans done: table extension + consumer migration, human-verified) |
| 5 | LLM Architecture | Pending |
| 6 | Quest System | Complete (3/3 plans done: backend schema + reducers, passive search + quest seeding, frontend integration + human-verified) |
| 7 | World Events | Pending |
| 8 | Narrative Tone Rollout | Pending |
| 9 | Content Data Expansion | Pending |
| 10 | Travel & Movement Costs | Complete (2/2 plans done: backend + UI, human-verified) |
| 11 | Death & Corpse System | Complete (2/2 plans done: backend foundation + resurrection/corpse summon; UI skipped per user decision) |
| 12 | Overall Renown System | Complete (3/3 plans done: backend + integration + UI, human-verified) |
| 14 | Loot & Gear Progression | Complete (4/4 plans done: schema+catalog, loot pipeline, legendary drops+salvage, client UI, human-verified) |
| 15 | Named NPCs | Complete (implemented organically via Phase 19 and quick tasks — NPC entities, shops, world placement all in place) |
| 19 | NPC Interactions | Complete (2/2 plans done: backend affinity/dialogue + interaction reducers; UI skipped per user decision — multi-step questing via NPC dialogue is sufficient MVP) |
| 20 | Perk Variety Expansion | Complete (3/3 plans done: perk data foundation + perk logic implementation + active ability perks with hotbar integration) |
| 13 | Crafting System | Complete (3/3 plans done: data foundation + reducers + UI filter chips/craftable toggle/material display/scroll learning, human-verified) |

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
36. All per-user tables except Player converted to public with client-side filtering — SpacetimeDB views have unreliable reactivity; only myPlayer view remains (identity-based filtering) (quick-46). **DO NOT revert characterEffect back to myCharacterEffects view** — quick-102/111 kept reverting this, causing recurring debuff display bug. Use tables.characterEffect + client-side relevantEffects filtering (App.vue).
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
48. myPlayer view replaced with client-side identity filtering — completes migration started in quick-46, all per-user tables now use public + client filtering pattern (quick-70)
49. AbilityTemplate table extended with 11 optional metadata columns at end for automatic SpacetimeDB migration — power, damageType, statScaling, DoT/HoT/debuff/AoE fields (04-01)
50. statScaling populated from ABILITY_STAT_SCALING mapping (combat_scaling.ts), not from ABILITIES constant — separate data source for stat scaling lookups (04-01)
51. Ability descriptions preserved via resolveDescription helper: ABILITIES.description with legacyDescriptions fallback — ensures no description data loss during metadata migration (04-01)
52. All ability metadata consumers migrated to database lookups using ctx.db.abilityTemplate.by_key.filter() pattern — executeAbility, damage/healing, cooldowns all read from DB (04-02)
53. ABILITY_STAT_SCALING kept for seeding only, not execution — getAbilityStatScaling requires statScaling parameter from DB row, no fallback to constant (04-02)
54. legacyDescriptions block (85 lines) removed from ensureAbilityTemplates — descriptions already in database, fallback no longer needed (04-02)
55. btree index .filter() pattern for database lookups — by_key is btree (not unique), must use .filter() not .find() (04-02)
56. Travel costs are flat stamina per character (5 within-region, 10 cross-region) - no BFS distance calculation, no gold costs, no per-step scaling (10-01)
57. All-or-nothing group travel validation - entire group move fails if any member lacks stamina, error shows which character is short (10-01)
58. Per-character cross-region cooldown (5 minutes) - not group-wide, only cross-region travel has cooldown (10-01)
59. Opportunistic expired cooldown cleanup during cooldown check - prevents TravelCooldown table accumulation (10-01)
60. Travel UI displays stamina costs as "X sta" format, cross-region destinations shown with amber-colored region name for visual distinction (10-02)
61. Server clock offset pattern used for accurate countdown timers synchronized with server time (window.__server_clock_offset from quick-55) (10-02)
62. Unaffordable travel options dimmed with opacity: 0.5 instead of hidden for improved UX feedback (10-02)
63. Renown rows lazy-initialized on first point award (not at character creation) to avoid cluttering database with inactive character records (12-01)
64. Server-first tracking uses single-column by_category index with manual achievementKey filtering — multi-column indexes broken per CLAUDE.md (12-01)
65. Diminishing returns formula for server-first: baseRenown / (2^(position-1)) using BigInt division, minimum 1 renown (12-01)
66. Perk bonuses aggregated on-demand via calculatePerkBonuses helper (not cached on character stats) — future optimization possible (12-01)
67. One permanent perk choice per rank enforced via choose_perk duplicate check — no respec mechanism by design (12-01)
68. Corpse creation level-gated at 5+ to match existing XP penalty threshold (character.level < 5n skips corpse) (11-01)
69. Same-location corpse combining updates timestamp to newest death for decay calculation (11-01)
70. ItemInstance ownership never changes during corpse looting — items return by deleting CorpseItem row only (11-01)
71. Decay cleanup runs opportunistically on respawn (not scheduled reducer) to avoid overhead (11-01)
72. Empty corpses auto-delete after final item looted for database cleanliness (11-01)
73. Resurrection 30-second confirmation timeout prevents indefinitely pending actions (11-02)
74. Mana deducted on accept (not initiate) to prevent griefing via declined prompts (11-02)
75. Resurrect targets corpse requiring caster at corpse location — prevents remote resurrection (11-02)
76. Corpse Summon targets character and works from any location for convenience (11-02)
77. Resurrect teleports character to corpse location, restores 50% HP/mana, leaves corpse intact (11-02)
78. Corpse Summon merges ALL corpses from all locations into single combined corpse at caster location (11-02)
79. combatState field added to AbilityMetadata interface for explicit combat restrictions in ability definitions (11-02)
80. PendingResurrect and PendingCorpseSummon merged into unified PendingSpellCast table with spellType discriminator — eliminates duplicate code, simplifies spell-cast architecture (quick-93)
81. Corpse Summon moved from Cleric to Necromancer and Summoner at level 6 — better thematic fit for entity-manipulation classes (quick-93)
82. Resurrection and Corpse Summon changed to flat mana costs (50/60) with 0 cooldown and 10s cast time — resource-gated abilities instead of time-gated (quick-93)
83. NPC affinity range set to -100 to +100 with 7 tiers (Hostile, Unfriendly, Wary, Stranger, Acquaintance, Friend, Close Friend, Devoted) for granular progression (19-01)
84. NPC personality traits stored as JSON with affinityMultiplier field (0.8 to 1.2 range) — friendly NPCs build affinity 20% faster, grumpy NPCs 20% slower (19-01)
85. Conversation cooldown set to 1 hour per-NPC stored on NpcAffinity.lastInteraction timestamp to prevent affinity grinding (19-01)
86. Dialogue options filtered by affinity, faction standing, and renown rank (all optional) for flexible gating (19-01)
87. Tier change notifications sent to Log panel only when crossing tier boundary, not on every affinity change to reduce spam (19-01)
88. questType field defaults via ?? 'kill' in all quest type checks — undefined is backwards-compatible with existing kill quests (06-01)
89. kill_loot quests skip updateQuestProgressForKill entirely — they advance ONLY via rollKillLootDrop drop roll in combat kill loop (06-01)
90. rollKillLootDrop is a function declaration inside registerCombatReducers closure so deps is in lexical scope (06-01)
91. Delivery quest auto-complete in hailNpc does NOT return early — character still sees NPC dialogue tree for follow-up quest branches (06-01)
92. kill_loot drops create QuestItem with discovered=true and looted=true — items drop directly, no search step needed (06-01)
93. performPassiveSearch uses BigInt() casts on any-typed ctx fields to satisfy TypeScript strict mode bigint operator requirements (06-02)
94. Named enemy name field reuses qt.targetItemName as boss display name for boss_kill quests — targetItemName holds the boss name for this quest type (06-02)
95. Passive search seed = charId XOR nowMicros, with bit-shifted variants (>>8, *7) and (>>16, *13) for 3 independent rolls — deterministic per character per timestamp (06-02)
96. Quest item cast timer is purely client-side UX — loot_quest_item reducer accepts call immediately, no server-side timer enforcement (06-03)
97. locationQuestItems/locationNamedEnemies filtered client-side by characterId + locationId + state (discovered/looted/isAlive) before passing to LocationGrid as props (06-03)
98. Food buffs use food_mana_regen/food_stamina_regen effectTypes (not mana_regen/stamina_regen) so they bypass tick_effects periodic heal handlers and instead boost per-tick regen rate in regen_health (quick-120)
99. sourceAbility='Well Fed' is canonical food buff identifier — used for group panel display (effectLabel returns sourceAbility when present) and one-at-a-time enforcement (delete by sourceAbility only) (quick-120)
100. Legendary drop sources use placeholder enemy template names pending Phase 17 World Bosses — Soulrender→Fen Witch, Ironveil→Cinder Sentinel, Whisperwind→Hexbinder, Dreadmaw→Basalt Brute (14-01)
101. lifeOnHit, cooldownReduction, manaRegen affixes are tier 3+ only (minTier=3) — no power affixes on low-quality gear (14-01)
102. AFFIX_COUNT_BY_QUALITY: common=0, uncommon=1, rare=2, epic=3, legendary=0 — legendaries use fixed affixes not rolled ones (14-01)
103. Seed offsets 31n/37n/41n/43n for affix rolling — no collision with existing 11n/19n/23n loot combat offsets (14-02)
104. JSON serialization bridges affix data from loot generation (combat.ts) to affix row creation (items.ts take_loot) (14-02)
105. take_loot finds new ItemInstance by templateId + no equippedSlot + no qualityTier filter — the freshly inserted row has no quality yet (14-02)
106. lifeOnHit, cooldownReduction, manaRegen accumulated in getEquippedBonuses return value but not yet consumed by combat — available for future Tier 3+ combat integration (14-02)
107. Legendary drop check uses ctx.db.itemTemplate.iter() full scan by name — acceptable for rare boss kills, no name index needed (14-03)
108. logGroupEvent (combatId param) used for legendary announcement — consistent with all other combat log helpers in same codebase section (14-03)
109. Gold-only salvage yield (baseGold×tier) — material salvage deferred until Phase 13 crafting materials exist to avoid confusion with freely-gatherable resources (14-03)
110. Legendary drop inserted after per-participant regular loot loop, before corpse creation — preserves combatResult auto-clean logic ordering (14-03)
111. Module published with --clear-database when adding non-optional columns to existing tables (qualityTier, affixDataJson, isNamed on combat_loot and item_instance) — SpacetimeDB 1.11 migration limitation (14-04)
112. affixDataJson on CombatLoot row drives loot panel affix display pre-take; ItemAffix table rows drive inventory tooltip post-take — two different data sources for same affix data (14-04)
113. rarityEpic color set to #aa44ff (purple), rarityLegendary confirmed as #ff8800 (orange) — overrides old facc15 yellow epic color (14-04)
114. PerkEffect extended with proc/crafting/social/scaling fields for variety perks — existing stat fields unchanged, all new fields optional for backward compatibility (20-01)
115. Perk domain categorization: 'combat' | 'crafting' | 'social' — one of each per rank 2-11, ranks 12-15 use 'combat' as default pending capstone redesign (20-01)
116. Proc chances 2-10% range: bloodthirst 3%, savage_strikes 5%, vampiric_strikes 5%, deathbringer 8%, undying_fury 3% — rare and impactful per design rules (20-01)
117. Frontend domain color coding: combat=#c55, crafting=#5c5, social=#55c applied as border-left on perk options; domain prefix tags [Combat]/[Crafting]/[Social] in descriptions (20-01)
118. Proc RNG uses (seed + perkIndex) % 100n deterministic arithmetic — no Math.random(), consistent with rollAttackOutcome pattern (20-02)
119. gatherDoubleChance and rareGatherChance are mutually exclusive — double check fires first, rare only if double didn't trigger (20-02)
120. vendorBuyDiscount capped at 50% max, travelCooldownReduction capped at 80% max — prevents exploitative zero-cost/zero-cooldown states (20-02)
121. NPC affinity bonus only applied for positive baseChange values — hostile interactions don't benefit from Smooth Talker perk (20-02)
122. XP bonus applied to base XP before awardCombatXp so level diff modifier (xpModifierForDiff) still applies correctly downstream (20-02)
123. Active perk ability keys use perk_ prefix (e.g., perk_second_wind) to distinguish from class abilities in use_ability routing — enables single-reducer perk casting without AbilityTemplate entries (20-03)
124. choose_perk auto-inserts HotbarSlot row for active perks; no error if hotbar full, only a management message — non-breaking for players with full hotbars (20-03)
125. damage_boost CharacterEffect stored for Wrath of the Fallen but not yet consumed by combat loop — consistent with other deferred affixes (cooldownReduction/manaRegen); noted as future integration (20-03)
126. WorldEvent table has both successConsequenceType AND failureConsequenceType — every event must have a defined consequence for both outcomes, failure darkens world but never breaks playability (18-01)
127. consequenceText field on WorldEvent written at fire time from eventDef.consequenceTextStub, not at resolve time — ensures permanent historical record even if event definition changes (REQ-034) (18-01)
128. WorldStatTracker + incrementWorldStat pattern for REQ-032 threshold-triggered events — call incrementWorldStat from combat/quest hooks, no separate event-checking reducer needed (18-01)
129. EventDespawnTick defined in tables.ts alongside other scheduled tables and re-exported from scheduled_tables.ts — consistent with existing PullTick/CombatLoopTick pattern (18-01)
130. WorldStatTracker.statKey uses btree index only (not .unique()) — both together caused 'name used for multiple entities' publish error; btree by_stat_key.filter() is the access pattern used in incrementWorldStat (18-02)
131. incrementWorldStat called once per template in kill loop (not per participant) — world stats are global counters, not per-character; calling per participant in group would over-count kills (18-02)
132. Pre-capture spawnId Map built before spawn deletion block in combat_loop victory section — EnemySpawn rows are deleted before kill template loop, so spawnId must be captured first for EventSpawnEnemy lookup (18-02)
133. worldEventRows used as useGameData key (not worldEvents) — worldEvents is already bound to eventWorld (the log table); WorldEvent game table needs a different name to avoid shadowing (18-03)
134. 10 crafting materials defined in crafting_materials.ts with MATERIAL_AFFIX_MAP for deterministic quality-based affixes — power parity matches affix_catalog.ts dropped gear at uncommon=1n/rare=2n/epic=3n stat magnitude (13-01)
135. materialType=undefined on all 15 gear RecipeTemplates — Plan 02 craft_recipe reducer accepts any valid crafting material for req1 without type-gating per material (13-01)
136. Static ResourceNode seeding replaced with getGatherableResourceTemplates terrain pool entries — personal node system (quick-118/119) spawns nodes at runtime via passive search; static rows are obsolete (13-01)
137. Salvage now yields crafting materials (via getMaterialForSalvage) with SALVAGE_YIELD_BY_TIER 2/2/3 — gold-only salvage from Phase 14 extended with material output, no gold component change (13-01)
138. CraftingPanel filter state (activeFilter, showOnlyCraftable) owned in useCrafting composable, passed as props to CraftingPanel and updated via update:activeFilter/update:showOnlyCraftable emits — clean unidirectional data flow (13-03)
139. learnRecipeFromScroll uses window.__db_conn directly in InventoryPanel to avoid adding new emit chain through CharacterInfoPanel for a single non-destructive action (13-03)
140. isRecipeScroll checks item.name.startsWith('Scroll:') — matches seeded scroll naming convention from Plan 01 ensureRecipeScrollItemTemplates (13-03)
141. craftQuality (dented/standard/reinforced/exquisite/mastercraft) separates craft potency axis from qualityTier rarity axis (common/uncommon/rare/epic/legendary) on ItemInstance — dual-axis gear quality system (13.1-01)
142. MATERIAL_AFFIX_MAP inner keys renamed from uncommon/rare/epic to standard/reinforced/exquisite to align with craft quality vocabulary; getCraftedAffixes guards on 'dented' and 'common' for empty affix return (13.1-01)
143. Essence I/II/III are drop-only binding reagents required as req3 for all 15 gear recipe templates; terrain-tier-gated drops: low=EssenceI(w15), mid=EssenceI(w10)+EssenceII(w15), high=EssenceII(w10)+EssenceIII(w15) (13.1-01)
144. Copper Ore moved from ensureResourceItemTemplates to ensureGearMaterialItemTemplates — all 13 crafting materials (10 original + 3 Essence) seeded together in one function (13.1-01)
145. addRecipeTemplate is a single module-level upsert helper replacing both addRecipe (consumables) and addGearRecipe (gear) inline closures — eliminates code duplication in seeding (13.1-01)
146. craft_recipe reducer now uses materialTierToCraftQuality for craftQuality and hardcodes qualityTier='common' for all crafted gear — rarity and craft quality are fully independent axes (13.1-02)
147. getCraftedAffixes called with craftQuality (standard/reinforced/exquisite) not qualityTier — outer if(qualityTier!=='common') guard removed so all crafted gear gets craftQuality set (13.1-02)
148. tierLabel in useInventory derives from craftQuality when instance.craftQuality is set (dented/standard→Tier 1, reinforced→Tier 2, exquisite/mastercraft→Tier 3), overriding qualityTier-based tier number (13.1-02)
149. template.description priority: DB-stored description takes precedence over foodDescription and computed description in useInventory fallback chain (13.1-02)
150. Enemy AC is role-driven via ENEMY_ROLE_CONFIG baseArmor/armorPerLevel (tank=14+4L, damage=6+3L, support=5+2L, healer=3+2L); template.armorClass field set to 0n and preserved for potential future per-enemy AC bonus (quick-159)
151. Essence I/II/III drops moved from terrain-gated seeded loot tables to runtime combat resolution — 25% chance per kill per participant, tier by enemy level (1-5=I, 6-10=II, 11+=III), all terrain types eligible (quick-161)

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
| 04-config-table-architecture | 01 | 3min | 2 | 1 |
| 04-config-table-architecture | 02 | 4min | 4 | 5 |
| 10-travel-movement-costs | 01 | 2min | 2 | 3 |
| 10-travel-movement-costs | 02 | 8min | 3 | 10 |
| 11-death-corpse-system | 01 | 5min | 3 | 12 |
| 11-death-corpse-system | 02 | 9min | 2 | 7 |
| 12-overall-renown-system | 01 | 4min | 2 | 5 |
| 12-overall-renown-system | 02 | 10min | 2 | 3 |
| 12-overall-renown-system | 03 | ~25min | 3 | 4 |
| 19-npc-interactions | 01 | 3min | 2 | 6 |
| 19-npc-interactions | 02 | 3min | 1 | 14 |
| Phase quick-99 P01 | 1 | 1 tasks | 1 files |
| Phase quick-103 P01 | 67 | 1 tasks | 1 files |
| Phase quick-106 P01 | 4 | 2 tasks | 3 files |
| 06-quest-system | 01 | 5min | 2 | 6 |
| 06-quest-system | 02 | 4min | 2 | 4 |
| 06-quest-system | 03 | ~25min | 3 | 8 |
| 14-loot-gear-progression | 01 | 2min | 2 | 2 |
| 14-loot-gear-progression | 02 | 3min | 2 | 3 |
| 14-loot-gear-progression | 03 | 15min | 2 | 2 |
| 14-loot-gear-progression | 04 | 6min | 2 | 14 |
| 20-perk-variety-expansion | 02 | ~25min | 2 | 7 |
| 20-perk-variety-expansion | 03 | ~15min | 2 | 2 |
| Phase 18 P01 | 4 | 2 tasks | 4 files |
| Phase 18 P02 | 20 | 2 tasks | 5 files |
| Phase 18 P03 | ~5min | 2 tasks | 5 files |
| 13-crafting-system | 01 | ~8min | 2 | 7 |
| 13-crafting-system | 03 | ~10min | 3 | 4 |
| 13.1-dual-axis-gear-system | 01 | ~5min | 2 | 4 |
| 13.1-dual-axis-gear-system | 02 | ~10min | 2 | 6 |

## Accumulated Context

### Roadmap Evolution
- Phase 13.1 inserted after Phase 13: Dual-axis gear system (craft quality vs rarity), material consolidation, Essence material, metadata consistency (URGENT)
- Phase 3.1 inserted after Phase 3: Combat Balance (URGENT)
- 2026-02-12: Phase 3.1 renamed from "Faction Hits" to "Combat Balance" before planning
- Phase 3.1.1 inserted after Phase 3.1: Combat balance part 2 (URGENT)
- 2026-02-12: Phase 3.1.1 planned — DoT/HoT/debuff/AoE balance with power budget approach, 3 plans created
- Phase 3.1.2 inserted after Phase 3.1.1: Combat balance for Enemies (URGENT)
- Phase 03.1.3 inserted after Phase 03.1.2: Enemy AI and aggro management (URGENT)
- Phase 9 added: Config Table Architecture - Consolidate ability and armor configuration into database tables (Technical Debt Reduction)
- 2026-02-13: Phase 9 moved to Phase 4, existing Phases 4-8 renumbered to 5-9 (Config Tables before LLM for cleaner architecture)
- 2026-02-14: Phase 10 added: Travel & Movement Costs - Region travel with distance-based costs (short = stamina, long = gold + cooldown), travel restrictions and validation, travel UI improvements
- 2026-02-14: Phase 11 added: Death & Corpse System - Corpse mechanic for level 5+ characters, equipped items stay while inventory drops to corpse, corpse retrieval mechanics, death penalties and resurrection
- 2026-02-14: Phase 12 added: Overall Renown System - Character-wide renown separate from factions, renown ranks with unlockable perks, renown gain sources from events/bosses/achievements
- 2026-02-14: Phase 13 added: Crafting System - Weapons & Armor - Extend recipe system for gear crafting, material requirements and gathering, crafted gear as deterministic progression path
- 2026-02-14: Phase 14 added: Loot & Gear Progression - Magic item properties and affixes, gear quality tiers (common to legendary), drop tables and rarity system, endgame gear hunting loop
- 2026-02-14: Phase 15 added: Named NPCs - Unique NPC entities (not templates), NPC dialogue system, NPC-specific shops and services, NPC placement in regions
- 2026-02-14: Phase 16 added: Travelling NPCs - NPC movement AI between regions, travelling merchant schedules, dynamic NPC location tracking
- 2026-02-14: Phase 17 added: World Bosses - Elite enemy encounters, unique loot tables for bosses, boss spawn mechanics, group scaling for bosses
- 2026-02-14: Phase 18 added: World Events System Expansion - Regional event spawning (Ripple system), event types and objectives, faction and overall renown rewards, event participation tracking
- 2026-02-14: Phase 19 added: NPC Interactions - Deepen relationships, dialogue complexity, affinity systems, and dynamic NPC reactions to player actions
- 2026-02-14: Phase 20 added: Perk Variety Expansion - Expand renown perk pools with diverse effect types, build-defining capstone perks

---

## Blocked / Risks

None currently. Key risk to watch: SpacetimeDB procedures are beta — API may change on upgrade.

---

## Quick Tasks Completed

**113 earlier tasks archived** -- see [ARCHIVE.md](./quick/ARCHIVE.md) for full history.

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 114 | Replace login button with >> Login << styled text - amber monospace span with no button chrome, disabled state dims to opacity 0.4, click guard and Enter key handler preserved | 2026-02-16 | b20bcd8 | [114-replace-login-button-with-login-styled-t](./quick/114-replace-login-button-with-login-styled-t/) |
| 115 | Remove log button from action bar - log panel permanently open since quick-78, removed button, dead emit, and always-true isActive override | 2026-02-16 | 54cfd3a | [115-remove-log-button-from-action-bar-since-](./quick/115-remove-log-button-from-action-bar-since-/) |
| 116 | Fix backpack full message triggering at 15/20 slots - equipped items were counted toward bag slot capacity; added equippedSlot filter to itemCount in buy_item and take_loot reducers | 2026-02-16 | e488dcd | [116-fix-backpack-full-message-triggering-inc](./quick/116-fix-backpack-full-message-triggering-inc/) |
| 117 | Add /resetwindows command to reset all panel positions to center of screen - resetAllPanels() in usePanelManager centers all panels and persists via localStorage + server save, wired through useCommands with addLocalEvent confirmation | 2026-02-17 | 7d360fa | [117-add-resetwindows-command-to-reset-all-pa](./quick/117-add-resetwindows-command-to-reset-all-pa/) |
| 118 | Replace shared resource nodes with personal per-character nodes discovered via passive search - ResourceNode gains optional characterId + by_character index, passive search spawns 2-3 personal nodes on 65% roll, finish_gather deletes personal nodes immediately, client filters to selected character's nodes | 2026-02-17 | 099af04 | [118-replace-shared-resource-nodes-with-perso](./quick/118-replace-shared-resource-nodes-with-perso/) |
| 119 | Clean up personal resource system - removed ResourceRespawnTick table and respawn_resource reducer, removed shared-node branch in finish_gather, implemented tiered node counts (1/2/3 by roll), updated log message, removed resource badge from SEARCH section | 2026-02-16 | ed5a37a | [119-clean-up-personal-resource-system-remove](./quick/119-clean-up-personal-resource-system-remove/) |
| 120 | Fix food buff display names, log messages, regen mechanic, and stacking - sourceAbility 'Well Fed' for group panel, BUFF_TYPE_LABELS map for readable log output, food_mana_regen/food_stamina_regen effectTypes boost per-tick regen rate in regen_health, one-food-at-a-time enforced by sourceAbility-only deletion | 2026-02-17 | 74ef58c | [120-fix-food-buff-display-names-regen-mechan](./quick/120-fix-food-buff-display-names-regen-mechan/) |
| 121 | Update food item descriptions to communicate buff effect before eating - client-side description generation from wellFedBuffType/Magnitude/Duration fields in inventory and vendor tooltips | 2026-02-17 | bc6981a | [121-update-food-item-descriptions-to-clearly](./quick/121-update-food-item-descriptions-to-clearly/) |
| 123 | Implement chance-based flee mechanic - flee_combat sets 'fleeing' status, combat_loop resolves on next tick with danger-scaled roll (starter ~87%, dungeon ~53%), success removes aggro/pets and logs success, failure reverts to active for retry | 2026-02-17 | a9ca67c | [123-implement-chance-based-flee-mechanic-fle](./quick/123-implement-chance-based-flee-mechanic-fle/) |
| 125 | Add /createitem <quality> admin command - backend create_test_item reducer picks random gear slot, inserts item with correct affixes for quality tier; client /createitem wired with client-side tier guard | 2026-02-17 | de2bc80 | [125-add-createitem-quality-admin-command-tha](./quick/125-add-createitem-quality-admin-command-tha/) |
| 126 | Fix beneficial spells ignoring player target - removed utility-only gate in onHotbarClick so heals/buffs/cleanses pass defensiveTargetId for all ability kinds | 2026-02-17 | bfa4a79 | [126-fix-beneficial-spells-ignoring-player-ta](./quick/126-fix-beneficial-spells-ignoring-player-ta/) |
| 124 | Clean up ROADMAP.md and STATE.md - archived quick-1 through quick-113 to ARCHIVE.md, fixed ROADMAP.md phase statuses (Phase 2 removed, Phases 11/12/14/19 updated), corrected plan checkboxes and dependency graph | 2026-02-17 | 78cbb55 | [124-clean-up-roadmap-md-and-state-md-compres](./quick/124-clean-up-roadmap-md-and-state-md-compres/) |
| 127 | Location-based group combat - getGroupOrSoloParticipants filters by locationId so only same-location members enter combat; executeAbility throws SenderError for cross-location group targets; moveOne auto-joins arriving members to active group combat with combatParticipant and aggroEntry rows | 2026-02-17 | a892fc3 | [127-implement-location-based-group-combat-on](./quick/127-implement-location-based-group-combat-on/) |
| 128 | Loot window shows only most recent combat - delete stale CombatLoot rows and orphaned CombatResult rows per-character before inserting new loot, using by_character index | 2026-02-17 | 3637b19 | [128-loot-window-shows-only-most-recent-comba](./quick/128-loot-window-shows-only-most-recent-comba/) |
| 129 | Seed world-drop gear pool separate from starter items - 25 world-drop items across weapon types and armor slots/tiers, STARTER_ITEM_NAMES exclusion set in loot filter, equipped slot rarity text removed and name shows quality color instead | 2026-02-17 | e64b2b3 | [129-seed-world-drop-item-pool-separate-from-](./quick/129-seed-world-drop-item-pool-separate-from-/) |
| 130 | Remove starter gear from vendor inventories - STARTER_ITEM_NAMES promoted to module scope with starter accessories added, ensureVendorInventory allEligible filter excludes starters, tier 1 world-drop weapons normalized to 5/7 base/dps, tier 1 armor +1 AC each | 2026-02-17 | ba5d315 | [130-remove-starter-gear-from-vendor-inventor](./quick/130-remove-starter-gear-from-vendor-inventor/) |
| 131 | Align player right-click context menu - replaced single 'Actions' entry with full inline context menus in LocationGrid (Target/Trade/Message/Invite/Friend/Promote/Kick) and GroupPanel (same set + self-detection); CharacterActionsPanel floating panel removed | 2026-02-17 | c8c953b | [131-align-player-right-click-context-menu-wi](./quick/131-align-player-right-click-context-menu-wi/) |
| 132 | Verify per-character passive search independence in group travel - confirmed each character gets own performPassiveSearch call with unique charId XOR nowMicros seed; all resource nodes, search results, and quest rolls are already fully independent per character | 2026-02-17 | 0f3b86d | [132-verify-and-fix-per-character-independenc](./quick/132-verify-and-fix-per-character-independenc/) |
| 133 | Remove rarity text labels from vendor/quartermaster window and inventory context menu - deleted ({{ item.rarity }}) from both VendorPanel item lists, changed InventoryPanel context menu subtitle from qualityTier+slot to slot only; quality communicated by color only | 2026-02-17 | ab12b3e | [133-remove-rarity-text-labels-from-vendor-qu](./quick/133-remove-rarity-text-labels-from-vendor-qu/) |
| 134 | Fix /createitem and combat loot to never pick starter gear - STARTER_ITEM_NAMES centralized in combat_constants.ts, create_test_item and generateLootTemplates gearEntries both filter !STARTER_ITEM_NAMES.has() at runtime | 2026-02-17 | 32b89a0 | [134-fix-create-test-item-reducer-and-loot-ge](./quick/134-fix-create-test-item-reducer-and-loot-ge/) |
| 135 | Reduce vendor seed to 10 common-only items and add player-sold items to vendor inventory - allEligible filters rarity=common, picks capped at 3+3+2+2=10, stale removal loop removed, sell_item adds sold item at 2x vendorValue, client passes npcId | 2026-02-17 | b96595e | [135-reduce-vendor-seed-items-to-10-common-on](./quick/135-reduce-vendor-seed-items-to-10-common-on/) |
| 136 | Stats panel shows effective stats inclusive of all bonuses - equippedStatBonuses computed in App.vue extended to sum gear affix bonuses (strBonus/dexBonus etc. on equipped ItemAffix rows) and CharacterEffect stat buffs (str_bonus/dex_bonus etc.); base value remains in parentheses | 2026-02-17 | a598f91 | [136-stats-panel-shows-effective-stats-inclus](./quick/136-stats-panel-shows-effective-stats-inclus/) |
| 137 | Add jewelry to world-drop loot tables - 10 templates (6 tier-1 + 4 tier-2 earrings/neck), weight 1n vs 3n-6n for weapons/armor, quality floor bumps common jewelry to uncommon in generateLootTemplates | 2026-02-17 | 5594672 | [137-add-jewelry-to-world-drop-loot-tables-wi](./quick/137-add-jewelry-to-world-drop-loot-tables-wi/) |
| 138 | Rebalance affix catalog — remove weaponBaseDamage (double-dips with STR scaling), add fierce prefix (strBonus minTier=2), trim HP/AC/MR legendary caps, fix Dreadmaw and Ironveil legendaries, republish module | 2026-02-17 | 1be5623 | [138-rebalance-affix-catalog-remove-weapon-da](./quick/138-rebalance-affix-catalog-remove-weapon-da/) |
| 139 | Apply quality rarity colors to vendor backpack — changed inventoryItems to use qualityTier instead of rarity for item name coloring in VendorPanel backpack section; added qualityTier to prop type | 2026-02-17 | 5478345 | [139-apply-quality-rarity-colors-to-vendor-st](./quick/139-apply-quality-rarity-colors-to-vendor-st/) |
| 140 | Remove mighty prefix — fierce is now sole STR weapon prefix (minTier=1, [1,2,3,4]); updated Dreadmaw legendary to use fierce/Fierce; republished with --clear-database to flush stale mighty ItemAffix rows | 2026-02-17 | d335989 | — |
| 141 | Fix item tooltip rarity color, tier, and armor type display — tooltipRarityColor helper maps qualityTier to hex color on title; description uses qualityTier instead of template rarity in useInventory/useCombat; armorType "none" hidden for weapons, weaponType shown instead | 2026-02-17 | 0966b68 | [140-fix-item-tooltip-to-show-correct-rarity-](./quick/140-fix-item-tooltip-to-show-correct-rarity-/) |
| 141b | Investigated sell_item non-common listing — no rarity filter on VendorInventory insert; root cause: alreadyListed templateId check blocks higher-quality sold items when same template already seeded; module republished | 2026-02-17 | 305fbae | [141-fix-sell-item-to-list-non-common-player-](./quick/141-fix-sell-item-to-list-non-common-player-/) |
| 142 | Fix jewelry quality floor and add cloaks — all 10 earring/pendant templates changed to rarity 'uncommon'; 5 cloak templates added (slot='neck', armorClassBonus 1n/2n, common); quality floor conditioned on armorClassBonus===0n; 'neck' removed from JEWELRY_SLOTS; affix catalog Whisperwind slot 'cloak'→'neck'; accessory affix slots remove 'cloak'; module republished | 2026-02-17 | 7e16d3e | [142-fix-jewelry-quality-floor-and-add-cloaks](./quick/142-fix-jewelry-quality-floor-and-add-cloaks/) |
| 143 | Affix budget cap for rare items + danger-based quality tier rolls + Tier N tooltip label — rare items capped at +2 total affix magnitude; rollQualityTier uses zone dangerMultiplier (<=120=common, 121-170=uncommon, 171-250=rare, 251-400=epic) with 12% tier-up chance; client tooltips show Tier 1-5 derived from qualityTier string | 2026-02-17 | b3d9678 | [143-rebalance-affix-budget-for-rare-items-an](./quick/143-rebalance-affix-budget-for-rare-items-an/) |
| 144 | Robust cast bars + cooldown timers + auto cache busting — activeCombat watcher clears localCast/localCooldowns/predictedCooldownReadyAt on combat end; 2s grace orphan-clear safety net; useCombat clears effectTimers/enemyCastTimers on combat change; nowMicros ticks at 100ms; Vite versionPlugin writes dist/version.json; main.ts polls /version.json every 60s and auto-reloads on mismatch | 2026-02-17 | 82a37d7 | [144-robust-cast-bar-cooldown-timers-and-auto](./quick/144-robust-cast-bar-cooldown-timers-and-auto/) |
| 145 | Add /createitem to autocomplete + implement /who command — CommandBar.vue gets /createitem and /who entries; useCommands /who handler reads players.activeCharacterId to find online characters, joins to characters + locations tables, outputs formatted list (name, level, class, location) to Log panel via addLocalEvent | 2026-02-17 | 0ee0990 | [145-add-createitem-to-autocomplete-list-and-](./quick/145-add-createitem-to-autocomplete-list-and-/) |
| 146 | Orphan safety nets for pull, gather, and quest-item cast bars — pull bar: missing-row guard + duration+2s grace clear; gather bar: interruption detector (1s grace), combat-start clear, and orphan safety net; quest item cast: looted-detection watcher on questItems prop, 5s absolute orphan timeout | 2026-02-17 | addbd36 | [146-robust-pull-gather-and-quest-item-cast-b](./quick/146-robust-pull-gather-and-quest-item-cast-b/) |
| 148 | Apply gatherSpeedBonus to gather cast duration — start_gather_resource reads gatherSpeedBonus via getPerkBonusByField, reduces RESOURCE_GATHER_CAST_MICROS proportionally with 500ms minimum; Efficient Hands/Master Harvester/Resourceful perks now functional; Phase 20 VERIFICATION.md updated to remove false "gathering is instant" claim | 2026-02-17 | 4e80639 | [148-fix-gatherspeedbonus-to-apply-to-gather-](./quick/148-fix-gatherspeedbonus-to-apply-to-gather-/) |
| 149 | Fix undying_fury buff proc and damage_boost combat consumption — undying_fury effect gains buffType/buffMagnitude/buffDurationSeconds fields; applyPerkProcs gains buffType branch calling addCharacterEffect; auto-attack damage now applies damage_boost CharacterEffect multiplier; both Wrath of the Fallen (active) and undying_fury (proc) now produce measurable damage increase | 2026-02-18 | 863010a | [149-fix-undying-fury-buff-proc-and-damage-bo](./quick/149-fix-undying-fury-buff-proc-and-damage-bo/) |
| 150 | Disable legendary items by commenting them out since they aren't tied to actual bosses yet — LEGENDARIES array (Soulrender/Ironveil/Whisperwind/Dreadmaw) commented out in affix_catalog.ts with empty placeholder export; legendary drop check block commented out in combat.ts pending World Bosses phase | 2026-02-18 | ed179f5 | [150-disable-legendary-items-by-commenting-th](./quick/150-disable-legendary-items-by-commenting-th/) |
| 151 | Centralize admin system — ADMIN_IDENTITIES moved from world_event_data.ts to dedicated data/admin.ts with requireAdmin helper; 8 admin/test reducers now guarded: /synccontent, create_test_item, create_recipe_scroll, level_character, spawn_corpse, end_combat, grant_test_renown, grant_test_achievement | 2026-02-18 | 6cd910b | [151-centralize-admin-system-into-dedicated-m](./quick/151-centralize-admin-system-into-dedicated-m/) |
| 152 | Set default panel layout for new players — getDefaultLayout() computes viewport-aware positions (log top-left, travel top-right, hotbar/group left-aligned chain); /resetwindows restores same layout instead of centering all panels | 2026-02-17 | 99cf383 | [152-set-default-panel-layout-for-new-players](./quick/152-set-default-panel-layout-for-new-players/) |
| 153 | Fix Sanctify generating two log messages — guarded enemy-name override in use_ability reducer with !args.targetCharacterId check so friendly-targeted abilities skip the combat enemy name lookup; single correct log line now emitted | 2026-02-18 | dcc06f9 | [153-fix-sanctify-generating-two-log-messages](./quick/153-fix-sanctify-generating-two-log-messages/) |
| 154 | Fix group panel harvest messages — added 5th groupMessage arg to logPrivateAndGroup in start_gather_resource so group members see "{character.name} begins gathering {node}." instead of "You begin gathering {node}."; matches finish_gather and take_loot patterns | 2026-02-18 | e160b43 | [154-fix-group-panel-harvest-messages-to-show](./quick/154-fix-group-panel-harvest-messages-to-show/) |
| 156 | Realign armor AC and weapon damage across starter and T1 tiers — STARTER_ARMOR cloth 2/1/1, leather 3/2/2, chain 4/3/2, plate 5/4/3; T1 drops starter+1 on all slots; T1 other-slot items (helm/bracers/gauntlets/girdle/cloaks) set to per-armor-type values; starter weapons 3/5 base/dps, T1 weapons 4/6; module republished via upsert | 2026-02-18 | 8b2a41e | [156-realign-armor-ac-values-across-all-tiers](./quick/156-realign-armor-ac-values-across-all-tiers/) |
| 158 | craft_recipe applies per-material-quality stat bonuses via implicit ItemAffix rows — getCraftQualityStatBonus helper (standard=0, reinforced=+1, exquisite=+2, mastercraft=+3); armor inserts craft_quality_ac affix; weapons insert craft_quality_dmg + craft_quality_dps affixes; getEquippedWeaponStats sums weapon affixes; client tooltips show effective stats with implicit bonuses filtered from label list | 2026-02-18 | 4b4cf41 | [158-craft-recipe-reducer-applies-per-materia](./quick/158-craft-recipe-reducer-applies-per-materia/) |
| 159 | Enemy AC now role-driven via ENEMY_ROLE_CONFIG baseArmor/armorPerLevel: tank=14+4L, damage=6+3L, support=5+2L, healer=3+2L; computeEnemyStats updated; all 29 enemy template armorClass values set to 0n | 2026-02-18 | fb58e4e | [159-enemy-armor-class-should-account-for-rol](./quick/159-enemy-armor-class-should-account-for-rol/) |
| 160 | Audit and realign world-drop gear — T2 weapons fixed to 5/7 base/dps; Silken Robe AC=4, Ranger Jerkin AC=5, no stat bonuses on T2 base templates; added 10 T2 armor pieces (all 4 types x chest/legs/boots) + 5 T2 weapons; added 14 T1 other-slot templates (cloth/leather/chain/plate x head/wrists/hands/belt); module republished | 2026-02-18 | ededb33 | [160-audit-and-realign-ensure-items-ts-world-](./quick/160-audit-and-realign-ensure-items-ts-world-/) |
| 161 | Rework essence drops — runtime 25% per-kill drop in combat.ts loot loop (tier by enemy level: 1-5=I, 6-10=II, 11+=III); removed all 6 terrain-gated essence blocks from ensureMaterialLootEntries; all zones now eligible | 2026-02-18 | d973957 | [161-rework-essence-drops-remove-terrain-gati](./quick/161-rework-essence-drops-remove-terrain-gati/) |
| 162 | Log panel always visible — removed v-if="panels.log.open" from Log panel div in App.vue; panel now always renders in game view (Group/Hotbar/Location were already always visible) | 2026-02-18 | — | [162-when-i-create-a-new-character-the-log-pa](./quick/162-when-i-create-a-new-character-the-log-pa/) |

---

## Last Session

Last activity: 2026-02-18 - Completed quick task 162: log panel always visible — removed v-if="panels.log.open" from App.vue so Log panel always renders in game view
